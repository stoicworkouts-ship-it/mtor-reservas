// Genera las sesiones concretas del calendario para las próximas semanas,
// a partir de las plantillas semanales (schedule_templates).
//
// Uso:  npm run generate:sessions
// Requiere en .env.local: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
// (la service_role key se usa solo aquí, nunca en el navegador).
//
// Corre este script una vez a la semana (a mano, o como Vercel Cron /
// Supabase Edge Function) para que siempre haya 3 semanas de agenda abierta.

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

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

async function main() {
  const { data: templates, error } = await supabase
    .from("schedule_templates")
    .select("id, class_type_id, coach_id, weekday, start_time, duration_minutes, room, capacity")
    .eq("active", true);

  if (error) throw error;
  if (!templates || templates.length === 0) {
    console.log("No hay schedule_templates activos. Corre supabase/seed.sql primero.");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mondayThisWeek = new Date(today);
  mondayThisWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const rows = [];
  for (let week = 0; week < WEEKS_AHEAD; week++) {
    for (const tpl of templates) {
      const date = new Date(mondayThisWeek);
      date.setDate(date.getDate() + week * 7 + tpl.weekday);
      if (date < today) continue; // no genera sesiones en el pasado

      const [h, m] = tpl.start_time.split(":");
      date.setHours(Number(h), Number(m), 0, 0);

      rows.push({
        class_type_id: tpl.class_type_id,
        coach_id: tpl.coach_id,
        template_id: tpl.id,
        starts_at: date.toISOString(),
        duration_minutes: tpl.duration_minutes,
        room: tpl.room,
        capacity: tpl.capacity,
      });
    }
  }

  if (rows.length === 0) {
    console.log("Nada que generar.");
    return;
  }

  const { error: insertError, count } = await supabase
    .from("sessions")
    .upsert(rows, { onConflict: "template_id,starts_at", ignoreDuplicates: true, count: "exact" });

  if (insertError) throw insertError;

  console.log(`Listo. ${rows.length} sesiones revisadas/creadas para las próximas ${WEEKS_AHEAD} semanas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
