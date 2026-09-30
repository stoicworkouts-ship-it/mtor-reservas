-- ============================================================
-- MTOR Reservas — correcciones de seguridad y reglas de negocio
-- ============================================================
-- Ejecutar UNA vez en el SQL Editor de Supabase (se puede volver a
-- ejecutar sin problema). Requiere la versión del código que llama a
-- book_session(p_session_id) con un solo parámetro.
--
-- Qué corrige:
--   1. Un cliente ya no puede cambiarse el rol a admin.
--   2. Las reservas solo se crean/cancelan a través de las funciones
--      (que revisan cupo, plan, categoría y dueño de la reserva).
--   3. Comprar un plan (plan pendiente + pago) pasa por request_plan;
--      antes los clientes no podían crear su plan pendiente.
--   4. Aprobar / rechazar pagos es atómico y solo para admin.
--   5. Cupos visibles para todos sin exponer quién reservó.
--   6. Se puede volver a reservar un bloque después de cancelarlo.
--   7. Los planes vencen solos (tarea diaria) y un plan vencido no
--      sirve para reservar.
--   8. Cancelar con menos de 2 horas de anticipación libera el cupo
--      pero NO devuelve la sesión al plan (ajustable en
--      cancel_reservation → v_limite).

begin;

-- ------------------------------------------------------------
-- Utilidades
-- ------------------------------------------------------------

create or replace function is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function chile_today()
returns date
language sql stable
as $$
  select (now() at time zone 'America/Santiago')::date;
$$;

-- ------------------------------------------------------------
-- 1. Perfiles: el rol solo lo cambia un admin
-- ------------------------------------------------------------

create or replace function protect_profile_role()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- auth.uid() es null cuando lo ejecuta el SQL Editor o una tarea
  -- programada: eso sí puede cambiar roles.
  if new.role is distinct from old.role and auth.uid() is not null and not is_admin() then
    raise exception 'No tienes permiso para cambiar el rol.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on profiles;
create trigger protect_profile_role
  before update on profiles
  for each row execute function protect_profile_role();

drop policy if exists "editar mi perfil" on profiles;
create policy "editar mi perfil" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "admin gestiona perfiles" on profiles;
create policy "admin gestiona perfiles" on profiles for update
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- 2 y 3. Escritura directa solo para admin; clientes usan funciones
-- ------------------------------------------------------------

drop policy if exists "crear mis reservas" on reservations;
drop policy if exists "cancelar mis reservas" on reservations;
drop policy if exists "admin gestiona reservas" on reservations;
create policy "admin gestiona reservas" on reservations for all
  using (is_admin()) with check (is_admin());

drop policy if exists "subir mi comprobante" on payments;
drop policy if exists "admin revisa pagos" on payments;
create policy "admin revisa pagos" on payments for update
  using (is_admin()) with check (is_admin());

drop policy if exists "admin gestiona planes" on user_plans;
create policy "admin gestiona planes" on user_plans for all
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- Plan con el que un usuario puede reservar una sesión: activo, de
-- la misma categoría, vigente el día de la sesión y con sesiones
-- disponibles. Usa primero el que vence antes. (Uso interno.)
-- ------------------------------------------------------------

create or replace function usable_plan_for(p_user_id uuid, p_session_id uuid)
returns uuid
language sql security definer
set search_path = public
as $$
  select up.id
  from sessions s
  join class_types ct on ct.id = s.class_type_id
  join user_plans up on up.user_id = p_user_id and up.status = 'active'
  join plans p on p.id = up.plan_id and p.category = ct.category
  where s.id = p_session_id
    and up.sessions_used < p.sessions_count
    and (up.expires_at is null
         or up.expires_at >= (s.starts_at at time zone 'America/Santiago')::date)
  order by up.expires_at asc nulls last, up.created_at asc
  limit 1
  for update of up;
$$;

-- Sube al primero de la lista de espera que todavía tenga un plan
-- válido. (Uso interno.)
create or replace function promote_waitlist(p_session_id uuid)
returns void
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
    return;
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
      return;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Reservar
-- ------------------------------------------------------------

drop function if exists book_session(uuid, uuid);

create or replace function book_session(p_session_id uuid)
returns reservations
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
  v_existing reservations%rowtype;
  v_plan_id uuid;
  v_taken int;
  v_status reservation_status;
  v_result reservations;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  -- bloquea la fila de la sesión para que dos reservas simultáneas no pasen el cupo
  select * into v_session from sessions where id = p_session_id for update;
  if not found then
    raise exception 'La sesión no existe.';
  end if;
  if v_session.status <> 'scheduled' then
    raise exception 'Esta sesión no está disponible.';
  end if;
  if v_session.starts_at <= now() then
    raise exception 'Esta sesión ya comenzó.';
  end if;

  select * into v_existing from reservations
    where session_id = p_session_id and user_id = v_uid
    for update;
  if v_existing.id is not null and v_existing.status <> 'cancelled' then
    raise exception 'Ya tienes una reserva en este bloque.';
  end if;

  v_plan_id := usable_plan_for(v_uid, p_session_id);
  if v_plan_id is null then
    raise exception 'No tienes un plan activo con sesiones disponibles para este tipo de clase. Revisa Mi plan.';
  end if;

  select count(*) into v_taken from reservations
    where session_id = p_session_id and status = 'confirmed';
  v_status := case when v_taken < v_session.capacity then 'confirmed' else 'waitlisted' end;

  if v_existing.id is not null then
    -- reutiliza la reserva cancelada (hay una sola fila por usuario y sesión)
    update reservations
      set status = v_status, user_plan_id = v_plan_id, created_at = now(), cancelled_at = null
      where id = v_existing.id
      returning * into v_result;
  else
    insert into reservations (session_id, user_id, user_plan_id, status)
      values (p_session_id, v_uid, v_plan_id, v_status)
      returning * into v_result;
  end if;

  if v_status = 'confirmed' then
    update user_plans set sessions_used = sessions_used + 1 where id = v_plan_id;
  end if;

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- Cancelar. Devuelve true si la sesión se devolvió al plan.
-- ------------------------------------------------------------

drop function if exists cancel_reservation(uuid);

create or replace function cancel_reservation(p_reservation_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_limite constant interval := interval '2 hours';
  v_admin boolean := is_admin();
  v_res reservations%rowtype;
  v_session sessions%rowtype;
  v_refund boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into v_res from reservations where id = p_reservation_id for update;
  if not found or (v_res.user_id <> auth.uid() and not v_admin) then
    raise exception 'La reserva no existe.';
  end if;
  if v_res.status not in ('confirmed', 'waitlisted') then
    raise exception 'Esta reserva ya no está activa.';
  end if;

  select * into v_session from sessions where id = v_res.session_id for update;
  if v_session.starts_at <= now() and not v_admin then
    raise exception 'La sesión ya comenzó, no se puede cancelar.';
  end if;

  update reservations set status = 'cancelled', cancelled_at = now() where id = v_res.id;

  if v_res.status = 'confirmed' then
    v_refund := v_admin or (v_session.starts_at - now()) >= v_limite;
    if v_refund and v_res.user_plan_id is not null then
      update user_plans set sessions_used = greatest(sessions_used - 1, 0)
        where id = v_res.user_plan_id;
    end if;
    if v_session.starts_at > now() then
      perform promote_waitlist(v_res.session_id);
    end if;
  end if;

  return v_refund;
end;
$$;

-- ------------------------------------------------------------
-- Cupos ocupados por sesión (sin exponer quién reservó)
-- ------------------------------------------------------------

create or replace function session_occupancy(p_from timestamptz, p_to timestamptz)
returns table (session_id uuid, booked integer)
language sql stable security definer
set search_path = public
as $$
  select r.session_id, count(*)::int
  from reservations r
  join sessions s on s.id = r.session_id
  where r.status in ('confirmed', 'attended', 'no_show')
    and s.starts_at >= p_from
    and s.starts_at <= p_to
  group by r.session_id;
$$;

-- ------------------------------------------------------------
-- Comprar un plan: crea el plan pendiente y el pago juntos
-- ------------------------------------------------------------

create or replace function request_plan(p_plan_id uuid, p_receipt_path text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan plans%rowtype;
  v_user_plan_id uuid;
  v_payment_id uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into v_plan from plans where id = p_plan_id and active;
  if not found then
    raise exception 'El plan seleccionado no existe o ya no está disponible.';
  end if;

  if p_receipt_path is null
     or split_part(p_receipt_path, '/', 1) <> v_uid::text
     or not exists (select 1 from storage.objects
                    where bucket_id = 'comprobantes' and name = p_receipt_path) then
    raise exception 'No se encontró el comprobante subido.';
  end if;

  insert into user_plans (user_id, plan_id, status)
    values (v_uid, v_plan.id, 'pending')
    returning id into v_user_plan_id;

  insert into payments (user_id, plan_id, user_plan_id, amount, method, status, receipt_path)
    values (v_uid, v_plan.id, v_user_plan_id, v_plan.price, 'transferencia', 'pending', p_receipt_path)
    returning id into v_payment_id;

  return v_payment_id;
end;
$$;

-- ------------------------------------------------------------
-- Aprobar / rechazar pagos (solo admin)
-- ------------------------------------------------------------

create or replace function approve_payment(p_payment_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pay payments%rowtype;
  v_days int;
  v_today date := chile_today();
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede aprobar pagos.';
  end if;

  select * into v_pay from payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pago no encontrado.';
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'Este pago ya fue revisado.';
  end if;

  select duration_days into v_days from plans where id = v_pay.plan_id;

  update user_plans
    set status = 'active', starts_at = v_today, expires_at = v_today + v_days
    where id = v_pay.user_plan_id;

  update payments
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id;
end;
$$;

create or replace function reject_payment(p_payment_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pay payments%rowtype;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede rechazar pagos.';
  end if;

  select * into v_pay from payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pago no encontrado.';
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'Este pago ya fue revisado.';
  end if;

  update payments
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id;

  update user_plans set status = 'cancelled' where id = v_pay.user_plan_id;
end;
$$;

-- ------------------------------------------------------------
-- Calendario: genera sesiones en hora de Chile (admin o tarea programada)
-- ------------------------------------------------------------

create or replace function generate_upcoming_sessions(weeks_ahead integer default 3)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_today date := chile_today();
  v_monday date := v_today - (extract(isodow from v_today)::int - 1);
  tpl record;
  week int;
  session_date date;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'Solo un administrador puede actualizar el calendario.';
  end if;

  for week in 0..weeks_ahead - 1 loop
    for tpl in select * from schedule_templates where active loop
      session_date := v_monday + (week * 7 + tpl.weekday);
      if session_date < v_today then
        continue;
      end if;

      insert into sessions (class_type_id, coach_id, template_id, starts_at, duration_minutes, room, capacity)
      values (
        tpl.class_type_id, tpl.coach_id, tpl.id,
        (session_date + tpl.start_time) at time zone 'America/Santiago',
        tpl.duration_minutes, tpl.room, tpl.capacity
      )
      on conflict (template_id, starts_at) do nothing;
    end loop;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Vencimiento de planes (tarea diaria)
-- ------------------------------------------------------------

create or replace function expire_user_plans()
returns void
language sql security definer
set search_path = public
as $$
  update user_plans set status = 'expired'
  where status = 'active' and expires_at < chile_today();
$$;

-- 04:15 UTC = pasada la medianoche en Chile
select cron.schedule('expire-mtor-plans', '15 4 * * *', 'select expire_user_plans()');

-- ------------------------------------------------------------
-- Permisos de ejecución
-- ------------------------------------------------------------

revoke execute on function
  book_session(uuid),
  cancel_reservation(uuid),
  session_occupancy(timestamptz, timestamptz),
  request_plan(uuid, text),
  approve_payment(uuid),
  reject_payment(uuid),
  generate_upcoming_sessions(integer)
from public, anon;

grant execute on function
  book_session(uuid),
  cancel_reservation(uuid),
  session_occupancy(timestamptz, timestamptz),
  request_plan(uuid, text),
  approve_payment(uuid),
  reject_payment(uuid),
  generate_upcoming_sessions(integer)
to authenticated;

revoke execute on function
  usable_plan_for(uuid, uuid),
  promote_waitlist(uuid),
  expire_user_plans()
from public, anon, authenticated;

-- ------------------------------------------------------------
-- Comprobantes: máximo 10 MB, solo imágenes o PDF
-- ------------------------------------------------------------

update storage.buckets
  set file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
  where id = 'comprobantes';

commit;
