-- ============================================================
-- MTOR Reservas — calendario semanal armado por el admin
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de
-- migration_seguridad.sql (se puede volver a ejecutar).
--
-- Cómo funciona:
--   - El admin arma cada semana: agrega, edita o elimina clases, o
--     duplica una semana completa a las siguientes.
--   - Todo lo que se crea o duplica queda como BORRADOR (los clientes
--     no lo ven) hasta que el admin publica la semana.
--   - Una clase publicada se puede editar o cancelar. Si tiene
--     reservas, primero se pide confirmación; al cancelar, la sesión
--     vuelve al plan de quienes reservaron.
--   - Ya no hay un horario fijo que se repita solo: se quita la tarea
--     programada generate-mtor-sessions-weekly.
--
-- Estados de una clase (sessions.status):
--   draft (borrador) · scheduled (publicada) · cancelled (cancelada)

begin;

-- ------------------------------------------------------------
-- Columnas y permisos de lectura
-- ------------------------------------------------------------

alter table sessions add column if not exists cancelled_reason text;
alter table sessions add column if not exists changed_at timestamptz; -- cambió día/hora/entrenador ya publicada

-- Los borradores solo los ve el admin.
drop policy if exists "sesiones visibles" on sessions;
create policy "sesiones visibles" on sessions for select
  using (auth.role() = 'authenticated' and (status <> 'draft' or is_admin()));

-- El calendario ya no se genera solo desde un horario fijo.
select cron.unschedule(jobid) from cron.job where jobname = 'generate-mtor-sessions-weekly';

-- ------------------------------------------------------------
-- Utilidades
-- ------------------------------------------------------------

-- Fecha y hora de Chile → instante.
create or replace function chile_start(p_date date, p_time time)
returns timestamptz
language sql stable
as $$
  select (p_date + p_time) at time zone 'America/Santiago';
$$;

-- Día (en Chile) en que ocurre una clase.
create or replace function chile_date(p_ts timestamptz)
returns date
language sql stable
as $$
  select (p_ts at time zone 'America/Santiago')::date;
$$;

-- Cancela las reservas activas de una clase y devuelve la sesión al
-- plan de quienes estaban confirmados. Devuelve cuántas personas. (Uso interno.)
create or replace function cancel_session_reservations(p_session_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_count int := 0;
begin
  for v_res in
    select * from reservations
    where session_id = p_session_id and status in ('confirmed', 'waitlisted')
    for update
  loop
    update reservations set status = 'cancelled', cancelled_at = now() where id = v_res.id;
    if v_res.status = 'confirmed' and v_res.user_plan_id is not null then
      update user_plans set sessions_used = greatest(sessions_used - 1, 0)
        where id = v_res.user_plan_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Igual que antes, pero ahora dice si subió a alguien (para poder
-- llamarla varias veces cuando se agranda el cupo). (Uso interno.)
drop function if exists promote_waitlist(uuid);

create function promote_waitlist(p_session_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_taken int;
  v_next reservations%rowtype;
  v_plan_id uuid;
begin
  select capacity into v_capacity from sessions where id = p_session_id;
  select count(*) into v_taken from reservations
    where session_id = p_session_id and status in ('confirmed', 'attended', 'no_show');
  if v_taken >= v_capacity then
    return false;
  end if;

  for v_next in
    select * from reservations
    where session_id = p_session_id and status = 'waitlisted'
    order by created_at asc
    for update
  loop
    v_plan_id := usable_plan_for(v_next.user_id, p_session_id);
    if v_plan_id is not null then
      update reservations set status = 'confirmed', user_plan_id = v_plan_id where id = v_next.id;
      update user_plans set sessions_used = sessions_used + 1 where id = v_plan_id;
      -- aquí se dispararía la notificación al usuario que subió de lista de espera
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- ------------------------------------------------------------
-- Clases: crear, editar, eliminar, cancelar, reactivar
-- ------------------------------------------------------------

-- Crea una clase como borrador. Si no se indica cupo, usa el del tipo de clase.
create or replace function create_session(
  p_date date,
  p_time time,
  p_duration_minutes integer,
  p_class_type_id uuid,
  p_coach_id uuid,
  p_capacity integer,
  p_room text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_start timestamptz := chile_start(p_date, p_time);
  v_capacity int;
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede armar el calendario.';
  end if;
  if v_start <= now() then
    raise exception 'La fecha y hora ya pasaron.';
  end if;

  select coalesce(p_capacity, default_capacity) into v_capacity from class_types where id = p_class_type_id;
  if not found then
    raise exception 'El tipo de clase no existe.';
  end if;
  if v_capacity < 1 then
    raise exception 'El cupo debe ser al menos 1.';
  end if;

  insert into sessions (class_type_id, coach_id, starts_at, duration_minutes, room, capacity, status)
    values (p_class_type_id, p_coach_id, v_start, coalesce(p_duration_minutes, 60), p_room, v_capacity, 'draft')
    returning id into v_id;
  return v_id;
end;
$$;

-- Si hay personas con reserva y el cambio las afecta, devuelve
-- needs_confirmation = true sin cambiar nada; con p_force = true aplica.
create or replace function update_session(
  p_session_id uuid,
  p_date date,
  p_time time,
  p_duration_minutes integer,
  p_class_type_id uuid,
  p_coach_id uuid,
  p_capacity integer,
  p_room text,
  p_force boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_s sessions%rowtype;
  v_start timestamptz := chile_start(p_date, p_time);
  v_old_cat class_category;
  v_new_cat class_category;
  v_capacity int;
  v_time_changed boolean;
  v_cat_changed boolean;
  v_cap_lowered boolean;
  v_people int;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede editar clases.';
  end if;

  select * into v_s from sessions where id = p_session_id for update;
  if not found then
    raise exception 'La clase no existe.';
  end if;
  if v_s.status = 'cancelled' then
    raise exception 'La clase está cancelada: reactívala antes de editarla.';
  end if;
  if v_s.starts_at <= now() then
    raise exception 'Esta clase ya pasó.';
  end if;
  if v_start <= now() then
    raise exception 'La nueva fecha y hora ya pasaron.';
  end if;

  select category into v_old_cat from class_types where id = v_s.class_type_id;
  select category, coalesce(p_capacity, default_capacity) into v_new_cat, v_capacity
    from class_types where id = p_class_type_id;
  if v_new_cat is null then
    raise exception 'El tipo de clase no existe.';
  end if;
  if v_capacity < 1 then
    raise exception 'El cupo debe ser al menos 1.';
  end if;

  v_time_changed := v_start <> v_s.starts_at;
  v_cat_changed := v_old_cat <> v_new_cat;
  v_cap_lowered := v_capacity < v_s.capacity;

  select count(*)::int into v_people from reservations
    where session_id = p_session_id and status in ('confirmed', 'waitlisted');

  if v_people > 0 and (v_time_changed or v_cat_changed or v_cap_lowered) and not p_force then
    return jsonb_build_object(
      'needs_confirmation', true,
      'people', v_people,
      'time_changed', v_time_changed,
      'category_changed', v_cat_changed,
      'capacity_lowered', v_cap_lowered
    );
  end if;

  update sessions
    set starts_at = v_start,
        duration_minutes = coalesce(p_duration_minutes, 60),
        class_type_id = p_class_type_id,
        coach_id = p_coach_id,
        capacity = v_capacity,
        room = p_room,
        changed_at = case
          when v_s.status = 'scheduled'
               and (v_time_changed
                    or p_coach_id is distinct from v_s.coach_id
                    or p_room is distinct from v_s.room)
          then now() else v_s.changed_at end
    where id = p_session_id;

  -- las reservas se hicieron con planes de otra categoría
  if v_cat_changed then
    perform cancel_session_reservations(p_session_id);
  end if;

  -- si el cupo creció, sube gente de la lista de espera
  loop
    exit when not promote_waitlist(p_session_id);
  end loop;

  return jsonb_build_object(
    'needs_confirmation', false,
    'people', v_people,
    'time_changed', v_time_changed,
    'category_changed', v_cat_changed
  );
end;
$$;

-- Solo clases que nunca tuvieron reservas (si no, se cancelan).
create or replace function delete_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede eliminar clases.';
  end if;
  perform 1 from sessions where id = p_session_id for update;
  if not found then
    raise exception 'La clase no existe.';
  end if;
  if exists (select 1 from reservations where session_id = p_session_id) then
    raise exception 'Esta clase tiene reservas: cancélala en vez de eliminarla.';
  end if;
  delete from sessions where id = p_session_id;
end;
$$;

-- Devuelve cuántas personas tenían reserva (se les devuelve la sesión).
create or replace function cancel_session(p_session_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_s sessions%rowtype;
  v_people int;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede cancelar clases.';
  end if;
  select * into v_s from sessions where id = p_session_id for update;
  if not found then
    raise exception 'La clase no existe.';
  end if;
  if v_s.status = 'draft' then
    raise exception 'Los borradores se eliminan, no se cancelan.';
  end if;
  if v_s.status <> 'scheduled' then
    raise exception 'Esta clase ya está cancelada.';
  end if;

  v_people := cancel_session_reservations(p_session_id);
  update sessions set status = 'cancelled', cancelled_reason = 'cancelada_admin' where id = p_session_id;
  return v_people;
end;
$$;

create or replace function restore_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_s sessions%rowtype;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede reactivar clases.';
  end if;
  select * into v_s from sessions where id = p_session_id for update;
  if not found then
    raise exception 'La clase no existe.';
  end if;
  if v_s.status <> 'cancelled' then
    raise exception 'Esta clase no está cancelada.';
  end if;
  if v_s.starts_at <= now() then
    raise exception 'Esta clase ya pasó.';
  end if;

  update sessions set status = 'scheduled', cancelled_reason = null where id = p_session_id;
end;
$$;

-- ------------------------------------------------------------
-- Semanas: duplicar, publicar, descartar borradores
-- ------------------------------------------------------------
-- p_monday es el lunes de la semana (fecha en Chile).

-- Copia las clases (publicadas y borradores) de la semana a las
-- p_weeks semanas siguientes, como borradores. No duplica una clase
-- que ya exista (mismo tipo a la misma hora) ni crea clases en el pasado.
create or replace function duplicate_week(p_monday date, p_weeks integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s record;
  w int;
  v_local timestamp;
  v_start timestamptz;
  v_created int := 0;
  v_skipped int := 0;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede armar el calendario.';
  end if;
  if p_weeks < 1 or p_weeks > 12 then
    raise exception 'Elige entre 1 y 12 semanas.';
  end if;

  for s in
    select * from sessions
    where status in ('scheduled', 'draft')
      and chile_date(starts_at) between p_monday and p_monday + 6
  loop
    v_local := s.starts_at at time zone 'America/Santiago';
    for w in 1..p_weeks loop
      -- se suma en hora local, así el cambio de horario de verano no corre la clase
      v_start := (v_local + make_interval(days => 7 * w)) at time zone 'America/Santiago';
      if v_start <= now() or exists (
        select 1 from sessions
        where class_type_id = s.class_type_id and starts_at = v_start and status <> 'cancelled'
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      insert into sessions (class_type_id, coach_id, starts_at, duration_minutes, room, capacity, status)
        values (s.class_type_id, s.coach_id, v_start, s.duration_minutes, s.room, s.capacity, 'draft');
      v_created := v_created + 1;
    end loop;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

create or replace function publish_week(p_monday date)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede publicar el calendario.';
  end if;
  update sessions set status = 'scheduled'
    where status = 'draft'
      and starts_at > now()
      and chile_date(starts_at) between p_monday and p_monday + 6;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function discard_week_drafts(p_monday date)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede armar el calendario.';
  end if;
  delete from sessions
    where status = 'draft'
      and chile_date(starts_at) between p_monday and p_monday + 6
      and not exists (select 1 from reservations r where r.session_id = sessions.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- Permisos de ejecución
-- ------------------------------------------------------------

revoke execute on function
  create_session(date, time, integer, uuid, uuid, integer, text),
  update_session(uuid, date, time, integer, uuid, uuid, integer, text, boolean),
  delete_session(uuid),
  cancel_session(uuid),
  restore_session(uuid),
  duplicate_week(date, integer),
  publish_week(date),
  discard_week_drafts(date)
from public, anon;

grant execute on function
  create_session(date, time, integer, uuid, uuid, integer, text),
  update_session(uuid, date, time, integer, uuid, uuid, integer, text, boolean),
  delete_session(uuid),
  cancel_session(uuid),
  restore_session(uuid),
  duplicate_week(date, integer),
  publish_week(date),
  discard_week_drafts(date)
to authenticated;

revoke execute on function
  cancel_session_reservations(uuid),
  promote_waitlist(uuid)
from public, anon, authenticated;

commit;
