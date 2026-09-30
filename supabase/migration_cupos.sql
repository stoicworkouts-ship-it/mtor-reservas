-- ============================================================
-- MTOR Reservas — cupos fijos en 1:1, 2:1, 3:1 y 4:1
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de
-- migration_calendario.sql (se puede volver a ejecutar).
--
-- - Grupal: el cupo lo decide el admin.
-- - 1:1, 2:1, 3:1, 4:1: el cupo es 1, 2, 3 o 4. En una clase puntual
--   el admin puede sumar sobrecupo, pero nunca bajar de ese número.

begin;

-- Personas por clase según la categoría (null = grupal, cupo libre).
create or replace function category_size(p_category class_category)
returns integer
language sql immutable
as $$
  select case p_category
    when 'uno_uno' then 1
    when 'dos_uno' then 2
    when 'tres_uno' then 3
    when 'cuatro_uno' then 4
  end;
$$;

-- Los tipos de clase N:1 siempre tienen su cupo fijo.
create or replace function fix_class_type_capacity()
returns trigger
language plpgsql
as $$
begin
  if category_size(new.category) is not null then
    new.default_capacity := category_size(new.category);
  end if;
  return new;
end;
$$;

drop trigger if exists fix_class_type_capacity on class_types;
create trigger fix_class_type_capacity
  before insert or update on class_types
  for each row execute function fix_class_type_capacity();

-- Corrige lo que ya existe.
update class_types set default_capacity = category_size(category)
  where category_size(category) is not null and default_capacity <> category_size(category);

update sessions s set capacity = category_size(ct.category)
  from class_types ct
  where ct.id = s.class_type_id
    and category_size(ct.category) is not null
    and s.capacity < category_size(ct.category)
    and s.starts_at > now();

-- Cupo final de una clase: en N:1 al menos N (lo que pase de N es sobrecupo).
create or replace function session_capacity(p_class_type_id uuid, p_capacity integer)
returns integer
language plpgsql stable
set search_path = public
as $$
declare
  v_cat class_category;
  v_default int;
  v_size int;
  v_capacity int;
begin
  select category, default_capacity into v_cat, v_default from class_types where id = p_class_type_id;
  if not found then
    raise exception 'El tipo de clase no existe.';
  end if;
  v_size := category_size(v_cat);
  v_capacity := coalesce(p_capacity, v_size, v_default);
  if v_size is not null and v_capacity < v_size then
    raise exception 'Una clase de este tipo necesita al menos % cupos.', v_size;
  end if;
  if v_capacity < 1 then
    raise exception 'El cupo debe ser al menos 1.';
  end if;
  return v_capacity;
end;
$$;

-- Igual que en migration_calendario.sql, usando session_capacity.
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

  v_capacity := session_capacity(p_class_type_id, p_capacity);

  insert into sessions (class_type_id, coach_id, starts_at, duration_minutes, room, capacity, status)
    values (p_class_type_id, p_coach_id, v_start, coalesce(p_duration_minutes, 60), p_room, v_capacity, 'draft')
    returning id into v_id;
  return v_id;
end;
$$;

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
  select category into v_new_cat from class_types where id = p_class_type_id;
  v_capacity := session_capacity(p_class_type_id, p_capacity);

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

  -- si el cupo creció (por ejemplo, sobrecupo), sube gente de la lista de espera
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

revoke execute on function session_capacity(uuid, integer) from public, anon, authenticated;

commit;
