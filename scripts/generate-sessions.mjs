// Genera las sesiones concretas del calendario para las próximas semanas,
// a partir de las plantillas semanales (schedule_templates).
//
// Uso:  npm run generate:sessions
// Requiere en .env.local: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
// (la service_role key se usa solo aquí, nunca en el navegador).
//
// Normalmente NO hace falta: Supabase ya lo hace solo cada lunes (tarea
// programada generate-mtor-sessions-weekly) y en Admin → Horario está el botón
// "Actualizar calendario ahora".

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const WEEKS_AHEAD = 3;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  // La lógica vive en la base de datos (generate_upcoming_sessions), que usa la
  // hora de Chile. Ya corre sola cada lunes; este script es solo para forzarlo.
  const { error } = await supabase.rpc("generate_upcoming_sessions", { weeks_ahead: WEEKS_AHEAD });
  if (error) throw error;
  console.log(`Listo. Calendario actualizado para las próximas ${WEEKS_AHEAD} semanas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
