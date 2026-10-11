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
- `supabase/migration_cupos.sql` — cupo fijo en 1:1, 2:1, 3:1 y 4:1 (con sobrecupo opcional por clase).
- `supabase/migration_planes.sql` — planes combinados: cada plan incluye sesiones de una o más categorías (ej. 8 grupales + 4 de 2:1).
- `supabase/migration_recordatorios.sql` — teléfono (WhatsApp) del cliente y recordatorios por correo 24 horas antes de cada clase.
- `src/app/api/recordatorios` — envía los recordatorios por correo desde el Gmail del gimnasio.
- `supabase/seed.sql` — datos de ejemplo: tipos de clase, entrenadores y planes (el "horario semanal" que también crea ya no se usa).
- `supabase/migration_categorias.sql` — histórico: ya está incluido en `schema.sql`.
- `scripts/generate-sessions.mjs` — histórico: generaba clases desde un horario fijo. Ya no se usa.

## Puesta en marcha sin usar la terminal

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com) (región São Paulo).
2. En **Database → Extensions**, activa **pg_cron**.
3. En el **SQL Editor**, pega y ejecuta, en este orden: `supabase/schema.sql`, `supabase/migration_seguridad.sql`, `supabase/migration_calendario.sql`, `supabase/migration_cupos.sql`, `supabase/migration_planes.sql`, `supabase/migration_recordatorios.sql` (ver "Recordatorios" más abajo) y (opcional) `supabase/seed.sql`.
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

- Un plan puede combinar categorías (ej. 8 clases grupales + 4 sesiones 2:1); cada categoría tiene su propio contador.
- Para reservar hace falta un plan activo, vigente el día de la clase y con sesiones disponibles en la categoría de esa clase (grupal, 1:1, 2:1…).
- Si el bloque está lleno, el cliente queda en lista de espera. Cuando alguien cancela, sube automáticamente el primero de la lista que tenga plan válido.
- Cancelar con 2 horas o más de anticipación devuelve la sesión al plan. Con menos de 2 horas se libera el cupo, pero la sesión se pierde. Se cambia en `cancel_reservation` (`v_limite`).
- Los planes vencidos pasan solos a "expired" cada noche.

## Calendario

- El admin arma cada semana en **Admin → Calendario**: agrega clases día por día, o usa **Duplicar semana** para copiar todas las clases de una semana a las 1–8 semanas siguientes (no repite las que ya existen).
- Todo lo que se agrega o duplica queda como **borrador**: los clientes no lo ven hasta que el admin pulsa **Publicar semana**. **Descartar borradores** borra los borradores de esa semana.
- Una clase publicada se puede **editar** (día, hora, entrenador, cupo, sala) o **cancelar**. Si tiene reservas, la app pide confirmación; al cancelar, la sesión vuelve al plan de quienes reservaron. Una clase cancelada se puede **reactivar** (quienes tenían reserva deben volver a reservar).
- Los tipos de clase y entrenadores se configuran en **Admin → Configuración**.
- Cupos: en las clases **grupales** el admin elige el cupo. En **1:1, 2:1, 3:1 y 4:1** el cupo es fijo (1, 2, 3 o 4); en una clase puntual se puede agregar **sobrecupo**.
- Cuando cambia o se cancela una clase con reservas, hay que avisar a los clientes (en **Mis reservas** ven el aviso).

## Recordatorios

- **WhatsApp (manual)**: en **Admin → Calendario**, cada clase publicada con reservas muestra **Reservas (n)**. Ahí aparece quién reservó y un botón **Recordar por WhatsApp** que abre WhatsApp con el mensaje ya escrito.
- **Correo (automático)**: cada reserva confirmada recibe un correo unas 24 horas antes de la clase, enviado desde el Gmail del gimnasio. Si la clase cambia de hora, se envía otro con el horario nuevo.
- El teléfono se pide al crear la cuenta. Quien no lo tenga lo ingresa al entrar.

Para activar los correos:
1. En la cuenta de Gmail, activa la **verificación en 2 pasos** y crea una **contraseña de aplicación** en [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
2. Inventa una clave larga (por ejemplo, 30 letras y números al azar). Es el `CRON_SECRET`.
3. En **Vercel → Settings → Environment Variables** agrega `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API → service_role), `CRON_SECRET`, `GMAIL_USER` (el correo) y `GMAIL_APP_PASSWORD`. Luego haz **Redeploy**.
4. En el **SQL Editor** de Supabase ejecuta, con tu clave: `select vault.create_secret('TU_CLAVE', 'recordatorios_secret');` (no la guardes en ningún archivo del repositorio). Desde ese momento se envían los correos.

`supabase/migration_recordatorios.sql` ya está aplicada en el proyecto actual; en un proyecto nuevo va después de `migration_planes.sql`.

## Desarrollo local (opcional, si más adelante usas terminal)
```
npm install
cp .env.local.example .env.local   # y completa los valores
npm run dev
```

## Ingreso con Google

El botón **Continuar con Google** está oculto hasta que se configure. Pasos (una sola vez):
1. En [console.cloud.google.com](https://console.cloud.google.com), crea un proyecto. En **APIs y servicios → Pantalla de consentimiento de OAuth** elige "Externo", ponle nombre "MTOR Reservas" y publícala.
2. En **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo "Aplicación web". En **URI de redireccionamiento autorizados** agrega `https://xgbhvlkyrcnheoerkzjl.supabase.co/auth/v1/callback`. Copia el **ID de cliente** y el **secreto**.
3. En Supabase → **Authentication → Sign In / Providers → Google**: actívalo y pega el ID y el secreto.
4. En Supabase → **Authentication → URL Configuration**: **Site URL** `https://mtor-reservas.vercel.app` y, en **Redirect URLs**, `https://mtor-reservas.vercel.app/auth/callback` (y `http://localhost:3000/auth/callback` para probar en el computador).

5. En Vercel → **Settings → Environment Variables** agrega `NEXT_PUBLIC_GOOGLE_LOGIN` con valor `1` y vuelve a desplegar (**Deployments → ⋯ → Redeploy**). Recién ahí aparece el botón.

Quien entra con Google por primera vez queda con el nombre de su cuenta de Google y la app le pide su WhatsApp antes de seguir.
