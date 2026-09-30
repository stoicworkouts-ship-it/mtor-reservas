-- ============================================================
-- MTOR Reservas — planes combinados (varias categorías por plan)
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de
-- migration_cupos.sql (se puede volver a ejecutar).
--
-- Un plan ahora trae una cantidad de sesiones por categoría, por
-- ejemplo "8 clases grupales + 4 sesiones 2:1". Cada categoría lleva
-- su propio contador: reservar una grupal descuenta de las grupales,
-- reservar un 2:1 descuenta de las 2:1.
--
--   plan_items       lo que incluye cada plan del catálogo
--   user_plan_items  lo que compró cada cliente y cuánto ha usado
--                    (copia al momento de comprar: si después se edita
--                    el plan, no cambia lo que ya compraron)
--
-- plans.category / plans.sessions_count y user_plans.sessions_used
-- quedan solo como historial; ya no se usan.

begin;

-- ------------------------------------------------------------
-- Tablas
-- ------------------------------------------------------------

create table if not exists plan_items (
  plan_id uuid not null references plans(id) on delete cascade,
  category class_category not null,
  sessions_count integer not null check (sessions_count > 0),
  primary key (plan_id, category)
);

create table if not exists user_plan_items (
  user_plan_id uuid not null references user_plans(id) on delete cascade,
  category class_category not null,
  sessions_total integer not null check (sessions_total > 0),
  sessions_used integer not null default 0,
  primary key (user_plan_id, category)
);

-- Con qué categoría del plan se pagó cada reserva (para devolverla bien
-- aunque después cambie la clase).
alter table reservations add column if not exists plan_category class_category;

alter table plans alter column category drop not null;
alter table plans alter column sessions_count drop not null;

alter table plan_items enable row level security;
alter table user_plan_items enable row level security;

drop policy if exists "items de planes visibles" on plan_items;
create policy "items de planes visibles" on plan_items for select
  using (auth.role() = 'authenticated');
drop policy if exists "admin gestiona items de planes" on plan_items;
create policy "admin gestiona items de planes" on plan_items for all
  using (is_admin()) with check (is_admin());

drop policy if exists "ver mis items de plan" on user_plan_items;
create policy "ver mis items de plan" on user_plan_items for select
  using (exists (select 1 from user_plans up
                 where up.id = user_plan_id and (up.user_id = auth.uid() or is_admin())));
drop policy if exists "admin gestiona items de clientes" on user_plan_items;
create policy "admin gestiona items de clientes" on user_plan_items for all
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- Pasa lo que ya existe al formato nuevo
-- ------------------------------------------------------------

insert into plan_items (plan_id, category, sessions_count)
  select id, category, sessions_count from plans
  where category is not null and sessions_count is not null
  on conflict do nothing;

insert into user_plan_items (user_plan_id, category, sessions_total, sessions_used)
  select up.id, p.category, p.sessions_count, up.sessions_used
  from user_plans up join plans p on p.id = up.plan_id
  where p.category is not null and p.sessions_count is not null
  on conflict do nothing;

update reservations r set plan_category = ct.category
  from sessions s join class_types ct on ct.id = s.class_type_id
  where s.id = r.session_id and r.plan_category is null and r.user_plan_id is not null;

-- ------------------------------------------------------------
-- Catálogo: crear o editar un plan con sus categorías (solo admin)
-- ------------------------------------------------------------
-- p_items: [{"category": "grupal", "sessions": 8}, {"category": "dos_uno", "sessions": 4}]

create or replace function save_plan(
  p_id uuid,
  p_name text,
  p_price integer,
  p_duration_days integer,
  p_items jsonb
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede editar planes.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Escribe el nombre del plan.';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'El precio no es válido.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where (e->>'sessions')::int > 0
  ) then
    raise exception 'El plan debe incluir al menos una sesión.';
  end if;

  if v_id is null then
    insert into plans (name, price, duration_days)
      values (trim(p_name), p_price, coalesce(p_duration_days, 30))
      returning id into v_id;
  else
    update plans
      set name = trim(p_name), price = p_price, duration_days = coalesce(p_duration_days, 30)
      where id = v_id;
    if not found then
      raise exception 'El plan no existe.';
    end if;
    delete from plan_items where plan_id = v_id;
  end if;

  insert into plan_items (plan_id, category, sessions_count)
    select v_id, (e->>'category')::class_category, (e->>'sessions')::int
    from jsonb_array_elements(p_items) e
    where (e->>'sessions')::int > 0;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Descontar / devolver sesiones de una categoría (uso interno)
-- ------------------------------------------------------------

create or replace function plan_use(p_user_plan_id uuid, p_category class_category, p_delta integer)
returns void
language sql security definer
set search_path = public
as $$
  update user_plan_items
    set sessions_used = greatest(sessions_used + p_delta, 0)
    where user_plan_id = p_user_plan_id and category = p_category;
$$;

-- Plan con el que un usuario puede reservar una sesión: activo, vigente
-- el día de la clase y con sesiones disponibles en esa categoría.
-- Usa primero el que vence antes. (Uso interno.)
create or replace function usable_plan_for(p_user_id uuid, p_session_id uuid)
returns uuid
language sql security definer
set search_path = public
as $$
  select up.id
  from sessions s
  join class_types ct on ct.id = s.class_type_id
  join user_plans up on up.user_id = p_user_id and up.status = 'active'
  join user_plan_items i on i.user_plan_id = up.id and i.category = ct.category
  where s.id = p_session_id
    and i.sessions_used < i.sessions_total
    and (up.expires_at is null or up.expires_at >= chile_date(s.starts_at))
  order by up.expires_at asc nulls last, up.created_at asc
  limit 1
  for update of i;
$$;

-- ------------------------------------------------------------
-- Reservar / cancelar (igual que antes, pero por categoría)
-- ------------------------------------------------------------

create or replace function book_session(p_session_id uuid)
returns reservations
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
  v_category class_category;
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
  select category into v_category from class_types where id = v_session.class_type_id;

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
      set status = v_status, user_plan_id = v_plan_id, plan_category = v_category,
          created_at = now(), cancelled_at = null
      where id = v_existing.id
      returning * into v_result;
  else
    insert into reservations (session_id, user_id, user_plan_id, plan_category, status)
      values (p_session_id, v_uid, v_plan_id, v_category, v_status)
      returning * into v_result;
  end if;

  if v_status = 'confirmed' then
    perform plan_use(v_plan_id, v_category, 1);
  end if;

  return v_result;
end;
$$;

create or replace function promote_waitlist(p_session_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_taken int;
  v_category class_category;
  v_next reservations%rowtype;
  v_plan_id uuid;
begin
  select s.capacity, ct.category into v_capacity, v_category
    from sessions s join class_types ct on ct.id = s.class_type_id
    where s.id = p_session_id;
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
      update reservations
        set status = 'confirmed', user_plan_id = v_plan_id, plan_category = v_category
        where id = v_next.id;
      perform plan_use(v_plan_id, v_category, 1);
      -- aquí se dispararía la notificación al usuario que subió de lista de espera
      return true;
    end if;
  end loop;
  return false;
end;
$$;

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
      perform plan_use(v_res.user_plan_id, v_res.plan_category, -1);
    end if;
    if v_session.starts_at > now() then
      perform promote_waitlist(v_res.session_id);
    end if;
  end if;

  return v_refund;
end;
$$;

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
      perform plan_use(v_res.user_plan_id, v_res.plan_category, -1);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- Comprar un plan: copia lo que incluye al plan del cliente
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
  if not found or not exists (select 1 from plan_items where plan_id = p_plan_id) then
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

  insert into user_plan_items (user_plan_id, category, sessions_total)
    select v_user_plan_id, category, sessions_count from plan_items where plan_id = v_plan.id;

  insert into payments (user_id, plan_id, user_plan_id, amount, method, status, receipt_path)
    values (v_uid, v_plan.id, v_user_plan_id, v_plan.price, 'transferencia', 'pending', p_receipt_path)
    returning id into v_payment_id;

  return v_payment_id;
end;
$$;

-- ------------------------------------------------------------
-- Permisos de ejecución
-- ------------------------------------------------------------

revoke execute on function save_plan(uuid, text, integer, integer, jsonb) from public, anon;
grant execute on function save_plan(uuid, text, integer, integer, jsonb) to authenticated;

revoke execute on function
  plan_use(uuid, class_category, integer),
  usable_plan_for(uuid, uuid),
  promote_waitlist(uuid),
  cancel_session_reservations(uuid)
from public, anon, authenticated;

commit;
