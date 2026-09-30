# MTOR Reservas

App de agenda y reservas para el gimnasio MTOR (Curicó), construida con Next.js y Supabase.

## Qué incluye

- `src/app/(dashboard)/agenda` — calendario con clases grupales y entrenamientos 2:1 / 3:1, con cupos y reserva en un clic.
- `src/app/(dashboard)/mis-reservas` — reservas del usuario, con cancelación.
- `src/app/(dashboard)/mi-plan` — planes activos, catálogo, subida de comprobante de transferencia.
- `src/app/(dashboard)/admin` — pagos, ocupación, y gestión de tipos de clase / entrenadores / horario / planes (solo rol `admin`).
- `supabase/schema.sql` — estructura de la base de datos (tablas, permisos). Respaldo del proyecto en producción.
- `supabase/migration_seguridad.sql` — funciones de reserva, cancelación, pagos y calendario, y reglas de seguridad.
- `supabase/seed.sql` — datos de ejemplo: tipos de clase, entrenadores, planes y horario semanal.
- `supabase/migration_categorias.sql` — histórico: ya está incluido en `schema.sql`.
- `scripts/generate-sessions.mjs` — genera las sesiones concretas del calendario a partir del horario semanal (alternativa desde tu computador; dentro de la app hay un botón "Actualizar calendario ahora" en Admin → Horario que hace lo mismo).

## Puesta en marcha sin usar la terminal

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com) (región São Paulo).
2. En **Database → Extensions**, activa **pg_cron**.
3. En el **SQL Editor**, pega y ejecuta, en este orden: `supabase/schema.sql`, `supabase/migration_seguridad.sql` y (opcional) `supabase/seed.sql`.
4. En **Authentication → Providers**, confirma que **Email** esté habilitado.
5. En **Settings → API**, copia el **Project URL** y la clave **anon public** — los vas a necesitar en el paso 3.

### 2. Sube este proyecto a GitHub (sin terminal)
1. Ve a [github.com/new](https://github.com/new) y crea un repositorio (por ejemplo `mtor-reservas`), sin marcar ninguna casilla adicional.
2. En la página del repositorio recién creado, haz clic en **"uploading an existing file"**.
3. Arrastra **todos los archivos y carpetas de este proyecto** a la ventana del navegador — **excepto** `node_modules` (no debería existir) y no subas ningún archivo `.env.local` si llegas a crearlo.
4. Haz clic en **Commit changes**.

### 3. Conecta con Vercel
1. Ve a [vercel.com/new](https://vercel.com/new) e inicia sesión con tu cuenta de GitHub.
2. Elige **Import** en el repositorio `mtor-reservas`. Vercel detecta que es Next.js automáticamente.
3. Antes de darle a Deploy, abre **Environment Variables** y agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` → el Project URL que copiaste
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → la clave anon que copiaste
4. Haz clic en **Deploy**. En un par de minutos tienes tu app en una URL `*.vercel.app`.

### 4. Crea tu primer usuario administrador
1. Abre tu app ya desplegada y crea una cuenta normal desde "Crear cuenta".
2. Vuelve a Supabase → **Table Editor → profiles**, busca tu usuario por correo y cambia la columna `role` de `client` a `admin`.
3. Vuelve a entrar a la app (o recarga) — ahora verás la pestaña "Panel admin".

### 5. Genera las sesiones del calendario
Las **sesiones concretas** (las que se reservan) se generan a partir del horario semanal:

- Automáticamente cada lunes, con la tarea programada de Supabase. Para crearla en un proyecto nuevo, ejecuta en el SQL Editor:
  ```
  select cron.schedule('generate-mtor-sessions-weekly', '0 3 * * 1', 'select generate_upcoming_sessions(3)');
  ```
- Al instante, con el botón **"Actualizar calendario ahora"** en Admin → Horario.

## Reglas de reserva

- Para reservar hace falta un plan activo, vigente el día de la clase, de la misma categoría (grupal, 1:1, 2:1…) y con sesiones disponibles.
- Si el bloque está lleno, el cliente queda en lista de espera. Cuando alguien cancela, sube automáticamente el primero de la lista que tenga plan válido.
- Cancelar con 2 horas o más de anticipación devuelve la sesión al plan. Con menos de 2 horas se libera el cupo, pero la sesión se pierde. Se cambia en `cancel_reservation` (`v_limite`).
- Los planes vencidos pasan solos a "expired" cada noche.

## Desarrollo local (opcional, si más adelante usas terminal)
```
npm install
cp .env.local.example .env.local   # y completa los valores
npm run dev
```
