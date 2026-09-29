# MTOR Reservas

App de agenda y reservas para el gimnasio MTOR (Curicó), construida con Next.js y Supabase.

## Qué incluye

- `src/app/(dashboard)/agenda` — calendario con clases grupales y entrenamientos 2:1 / 3:1, con cupos y reserva en un clic.
- `src/app/(dashboard)/mis-reservas` — reservas del usuario, con cancelación.
- `src/app/(dashboard)/mi-plan` — planes activos, catálogo, subida de comprobante de transferencia.
- `src/app/(dashboard)/admin` — aprobación de pagos y ocupación del día (solo rol `admin`).
- `supabase/seed.sql` — datos de ejemplo: tipos de clase, entrenadores, planes y horario semanal.
- `scripts/generate-sessions.mjs` — genera las sesiones concretas del calendario a partir del horario semanal.

## Puesta en marcha sin usar la terminal

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com) (región São Paulo).
2. En el **SQL Editor**, pega y ejecuta el `schema.sql` que ya tienes.
3. En el mismo SQL Editor, pega y ejecuta `supabase/seed.sql` (deja la agenda con datos de ejemplo listos para reservar).
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
El horario semanal (`schedule_templates`) ya está cargado por el seed, pero las **sesiones concretas** (las que se reservan) hay que generarlas. La forma más simple sin terminal:

- En Supabase, ve a **Database → Functions** (o **SQL Editor**) y crea una **Edge Function programada** que corra `scripts/generate-sessions.mjs` una vez a la semana — o
- Pídeme en el chat que te arme esa función y la dejamos corriendo sola.

Mientras tanto, si quieres probarlo ahora mismo, alguien con Node.js instalado puede correr una sola vez:
```
npm install
npm run generate:sessions
```
(usando el archivo `.env.local` con la `SUPABASE_SERVICE_ROLE_KEY` de Supabase → Settings → API).

## Desarrollo local (opcional, si más adelante usas terminal)
```
npm install
cp .env.local.example .env.local   # y completa los valores
npm run dev
```
