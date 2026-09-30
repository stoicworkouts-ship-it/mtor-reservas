-- ============================================================
-- MTOR Reservas — esquema de la base de datos
-- ============================================================
-- Reconstruido desde el proyecto de Supabase en producción
-- (30-09-2026). Ya incluye lo de migration_categorias.sql.
--
-- Para un proyecto NUEVO de Supabase, ejecutar en el SQL Editor
-- en este orden:
--   1. schema.sql              (este archivo)
--   2. migration_seguridad.sql
--   3. seed.sql                (opcional: datos de ejemplo)
--
-- En el proyecto actual NO hace falta ejecutar este archivo: solo
-- sirve como respaldo y referencia de cómo está armada la base.

-- ---------- Tipos ----------

create type class_category as enum ('grupal', 'uno_uno', 'dos_uno', 'tres_uno', 'cuatro_uno');
create type payment_method as enum ('transferencia', 'webpay', 'flow', 'mercadopago');
create type payment_status as enum ('pending', 'approved', 'rejected');
create type reservation_status as enum ('confirmed', 'waitlisted', 'cancelled', 'attended', 'no_show');
create type user_plan_status as enum ('pending', 'active', 'expired', 'cancelled');
create type user_role as enum ('client', 'coach', 'admin');

-- ---------- Tablas ----------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role user_role not null default 'client',
  created_at timestamptz not null default now()
);

create table class_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category class_category not null,
  default_capacity integer not null check (default_capacity > 0)
);

create table coaches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  display_name text not null,
  active boolean not null default true
);

create table schedule_templates (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid not null references class_types(id),
  coach_id uuid references coaches(id),
  weekday integer not null check (weekday >= 0 and weekday <= 6), -- 0 = lunes
  start_time time not null,
  duration_minutes integer not null default 60,
  room text,
  capacity integer not null check (capacity > 0),
  active boolean not null default true
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid not null references class_types(id),
  coach_id uuid references coaches(id),
  template_id uuid references schedule_templates(id),
  starts_at timestamptz not null,
  duration_minutes integer not null default 60,
  room text,
  capacity integer not null check (capacity > 0),
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  unique (template_id, starts_at)
);
create index sessions_starts_at_idx on sessions (starts_at);

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category class_category not null,
  sessions_count integer not null check (sessions_count > 0),
  price integer not null check (price >= 0),
  duration_days integer not null default 30,
  active boolean not null default true
);

create table user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references plans(id),
  sessions_used integer not null default 0,
  status user_plan_status not null default 'pending',
  starts_at date,
  expires_at date,
  created_at timestamptz not null default now()
);
create index user_plans_user_id_status_idx on user_plans (user_id, status);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  user_plan_id uuid references user_plans(id),
  status reservation_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (session_id, user_id)
);
create index reservations_user_id_status_idx on reservations (user_id, status);
create index reservations_session_id_status_idx on reservations (session_id, status);

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references plans(id),
  user_plan_id uuid references user_plans(id),
  amount integer not null,
  method payment_method not null default 'transferencia',
  status payment_status not null default 'pending',
  receipt_path text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_status_idx on payments (status);

-- ---------- Funciones base ----------

create or replace function is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Crea el perfil automáticamente cuando alguien se registra.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- book_session, cancel_reservation, generate_upcoming_sessions y el
-- resto de las funciones de negocio viven en migration_seguridad.sql.

-- ---------- Seguridad (RLS) ----------

alter table profiles enable row level security;
alter table class_types enable row level security;
alter table coaches enable row level security;
alter table schedule_templates enable row level security;
alter table sessions enable row level security;
alter table plans enable row level security;
alter table user_plans enable row level security;
alter table reservations enable row level security;
alter table payments enable row level security;

create policy "ver mi perfil" on profiles for select using (id = auth.uid() or is_admin());
create policy "editar mi perfil" on profiles for update using (id = auth.uid());

create policy "catálogo visible para autenticados" on class_types for select using (auth.role() = 'authenticated');
create policy "admin gestiona tipos de clase" on class_types for all using (is_admin()) with check (is_admin());

create policy "entrenadores visibles" on coaches for select using (auth.role() = 'authenticated');
create policy "admin gestiona entrenadores" on coaches for all using (is_admin()) with check (is_admin());

create policy "horario visible" on schedule_templates for select using (auth.role() = 'authenticated');
create policy "admin gestiona horario" on schedule_templates for all using (is_admin()) with check (is_admin());

create policy "sesiones visibles" on sessions for select using (auth.role() = 'authenticated');

create policy "planes visibles" on plans for select using (auth.role() = 'authenticated');
create policy "admin gestiona catalogo de planes" on plans for all using (is_admin()) with check (is_admin());

create policy "ver mis planes" on user_plans for select using (user_id = auth.uid() or is_admin());
create policy "admin gestiona planes" on user_plans for all using (is_admin());

create policy "ver mis reservas" on reservations for select using (user_id = auth.uid() or is_admin());
create policy "crear mis reservas" on reservations for insert with check (user_id = auth.uid());
create policy "cancelar mis reservas" on reservations for update using (user_id = auth.uid() or is_admin());

create policy "ver mis pagos" on payments for select using (user_id = auth.uid() or is_admin());
create policy "subir mi comprobante" on payments for insert with check (user_id = auth.uid());
create policy "admin revisa pagos" on payments for update using (is_admin());

-- ---------- Storage: comprobantes ----------

insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false);

create policy "subir comprobante propio" on storage.objects for insert
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ver comprobante propio o admin" on storage.objects for select
  using (bucket_id = 'comprobantes' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
