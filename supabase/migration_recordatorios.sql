-- ============================================================
-- MTOR Reservas — teléfono (WhatsApp) y recordatorios por correo
-- ============================================================
-- Ejecutar UNA vez en el SQL Editor de Supabase, después de
-- migration_planes.sql (se puede volver a ejecutar sin problema).
--
-- Qué hace:
--   1. Guarda el teléfono que el cliente escribe al crear su cuenta
--      (formato internacional, ej. +56912345678).
--   2. Marca qué reservas ya recibieron el recordatorio por correo.
--      Si la clase cambia de hora, o la persona vuelve a reservar,
--      el recordatorio se envía de nuevo.
--   3. Cada 15 minutos le pide a la app (Vercel) que envíe los
--      recordatorios de las clases de las próximas 24 horas.
--
-- Los correos empiezan a salir cuando guardes la clave secreta de los
-- recordatorios (la misma que pones en Vercel como CRON_SECRET)
-- ejecutando por separado, en el SQL Editor, esta línea con tu clave:
--
--   select vault.create_secret('TU_CLAVE_AQUI', 'recordatorios_secret');
--
-- Mientras no exista, la tarea programada no hace nada.
-- La clave NO va en este archivo: el repositorio de GitHub es público.

begin;

-- ------------------------------------------------------------
-- 1. Teléfono
-- ------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_phone text := new.raw_user_meta_data->>'phone';
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    case when v_phone ~ '^\+[0-9]{8,15}$' then v_phone end
  );
  return new;
end;
$$;

-- "not valid": no revisa los teléfonos que ya estaban guardados, solo los nuevos.
alter table profiles drop constraint if exists profiles_phone_format;
alter table profiles add constraint profiles_phone_format
  check (phone ~ '^\+[0-9]{8,15}$') not valid;

-- ------------------------------------------------------------
-- 2. Recordatorio enviado
-- ------------------------------------------------------------

alter table reservations add column if not exists reminder_sent_at timestamptz;

-- Volver a reservar (o subir desde la lista de espera) = recordatorio nuevo.
create or replace function reset_reminder_on_confirm()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    new.reminder_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_reminder_on_confirm on reservations;
create trigger reset_reminder_on_confirm
  before update of status on reservations
  for each row execute function reset_reminder_on_confirm();

-- La clase cambió de día u hora = recordatorio nuevo con el horario nuevo.
create or replace function reset_reminders_on_reschedule()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update reservations set reminder_sent_at = null where session_id = new.id;
  return new;
end;
$$;

drop trigger if exists reset_reminders_on_reschedule on sessions;
create trigger reset_reminders_on_reschedule
  after update of starts_at on sessions
  for each row
  when (new.starts_at is distinct from old.starts_at)
  execute function reset_reminders_on_reschedule();

-- ------------------------------------------------------------
-- 3. Recordatorios pendientes (los usa la app, no los clientes)
-- ------------------------------------------------------------
-- Reservas confirmadas con clase en las próximas 24 horas que aún no
-- tienen recordatorio. No incluye las reservas hechas hace menos de
-- una hora (la persona acaba de reservar) ni las clases que empiezan
-- en menos de una hora.

create or replace function due_reminders()
returns table (
  reservation_id uuid,
  email text,
  full_name text,
  class_name text,
  starts_at timestamptz,
  coach_name text,
  room text
)
language sql stable security definer
set search_path = public
as $$
  select r.id, u.email::text, p.full_name, ct.name, s.starts_at, c.display_name, s.room
  from reservations r
  join sessions s on s.id = r.session_id
  join class_types ct on ct.id = s.class_type_id
  left join coaches c on c.id = s.coach_id
  join profiles p on p.id = r.user_id
  join auth.users u on u.id = r.user_id
  where r.status = 'confirmed'
    and r.reminder_sent_at is null
    and s.status = 'scheduled'
    and s.starts_at > now() + interval '1 hour'
    and s.starts_at <= now() + interval '24 hours'
    and r.created_at <= now() - interval '1 hour'
    and u.email is not null
  order by s.starts_at
  limit 50;
$$;

create or replace function mark_reminders_sent(p_ids uuid[])
returns void
language sql security definer
set search_path = public
as $$
  update reservations set reminder_sent_at = now() where id = any(p_ids);
$$;

revoke execute on function due_reminders(), mark_reminders_sent(uuid[])
  from public, anon, authenticated;
grant execute on function due_reminders(), mark_reminders_sent(uuid[])
  to service_role;

-- ------------------------------------------------------------
-- 4. Tarea programada: cada 15 minutos
-- ------------------------------------------------------------

create extension if not exists pg_net;

select cron.schedule(
  'mtor-recordatorios',
  '*/15 * * * *',
  $cmd$
  -- si la clave todavía no está guardada, no hace nada
  select net.http_post(
    url := 'https://mtor-reservas.vercel.app/api/recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || s.decrypted_secret
    ),
    body := '{}'::jsonb
  )
  from vault.decrypted_secrets s
  where s.name = 'recordatorios_secret';
  $cmd$
);

commit;
