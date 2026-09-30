# MTOR Reservas

App de agenda y reservas para el gimnasio MTOR (Curicó), construida con Next.js y Supabase.

## Qué incluye

- `src/app/(dashboard)/agenda` — calendario con clases grupales y entrenamientos 2:1 / 3:1, con cupos y reserva en un clic.
- `src/app/(dashboard)/mis-reservas` — reservas del usuario, con cancelación.
- `src/app/(dashboard)/mi-plan` — planes activos, catálogo, subida de comprobante de transferencia.
- `src/app/(dashboard)/admin` — pagos, calendario semanal, tipos de clase / entrenadores y planes (solo rol `admin`).
- `supabase/schema.sql` — estructura de la base de datos (tablas, permisos). Respaldo del proyecto en producción.
- `supabase/migration_seguridad.sql` — funciones de reserva, cancelación, pagos y calendario, y reglas de seguridad.
- `supabase/migration_calendario.sql` — calendario armado semana a semana por el admin: borradores, publicar, duplicar semanas, editar y cancelar clases.
- `supabase/seed.sql` — datos de ejemplo: tipos de clase, entrenadores y planes (el "horario semanal" que también crea ya no se usa).
- `supabase/migration_categorias.sql` — histórico: ya está incluido en `schema.sql`.
- `scripts/generate-sessions.mjs` — histórico: generaba clases desde un horario fijo. Ya no se usa.

## Puesta en marcha sin usar la terminal

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com) (región São Paulo).
2. En **Database → Extensions**, activa **pg_cron**.
3. En el **SQL Editor**, pega y ejecuta, en este orden: `supabase/schema.sql`, `supabase/migration_seguridad.sql`, `supabase/migration_calendario.sql` y (opcional) `supabase/seed.sql`.
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

### 5. Arma el calendario
En **Admin → Calendario** agrega las clases de la semana (o duplica una semana anterior) y pulsa **Publicar semana**. Ver "Calendario" más abajo.

## Reglas de reserva

- Para reservar hace falta un plan activo, vigente el día de la clase, de la misma categoría (grupal, 1:1, 2:1…) y con sesiones disponibles.
- Si el bloque está lleno, el cliente queda en lista de espera. Cuando alguien cancela, sube automáticamente el primero de la lista que tenga plan válido.
- Cancelar con 2 horas o más de anticipación devuelve la sesión al plan. Con menos de 2 horas se libera el cupo, pero la sesión se pierde. Se cambia en `cancel_reservation` (`v_limite`).
- Los planes vencidos pasan solos a "expired" cada noche.

## Calendario

- El admin arma cada semana en **Admin → Calendario**: agrega clases día por día, o usa **Duplicar semana** para copiar todas las clases de una semana a las 1–8 semanas siguientes (no repite las que ya existen).
- Todo lo que se agrega o duplica queda como **borrador**: los clientes no lo ven hasta que el admin pulsa **Publicar semana**. **Descartar borradores** borra los borradores de esa semana.
- Una clase publicada se puede **editar** (día, hora, entrenador, cupo, sala) o **cancelar**. Si tiene reservas, la app pide confirmación; al cancelar, la sesión vuelve al plan de quienes reservaron. Una clase cancelada se puede **reactivar** (quienes tenían reserva deben volver a reservar).
- Los tipos de clase y entrenadores se configuran en **Admin → Configuración**.
- La app todavía no envía avisos: cuando cambia o se cancela una clase con reservas, hay que avisar a los clientes. En **Mis reservas** ven el aviso.

## Desarrollo local (opcional, si más adelante usas terminal)
```
npm install
cp .env.local.example .env.local   # y completa los valores
npm run dev
```
