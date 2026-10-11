import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { chileLongDate, chileTime } from "@/lib/time";

// Recordatorios por correo, 24 horas antes de cada clase.
// Supabase llama a esta dirección cada 15 minutos (ver
// supabase/migration_recordatorios.sql) con la clave CRON_SECRET.
// Los correos salen desde la cuenta de Gmail de GMAIL_USER.

export const dynamic = "force-dynamic";

type Reminder = {
  reservation_id: string;
  email: string;
  full_name: string;
  class_name: string;
  starts_at: string;
  coach_name: string | null;
  room: string | null;
};

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function reminderEmail(r: Reminder) {
  const name = r.full_name.trim().split(/\s+/)[0];
  const when = `${chileLongDate(r.starts_at)} a las ${chileTime(r.starts_at)}`;
  const details = [r.coach_name && `con ${r.coach_name}`, r.room && `en ${r.room}`].filter(Boolean).join(" ");
  const cancelNote =
    "Si no puedes venir, cancela desde la app con al menos 2 horas de anticipación para no perder la sesión.";

  return {
    subject: `Recordatorio: ${r.class_name} mañana a las ${chileTime(r.starts_at)}`,
    text: `Hola ${name},\n\nTe recordamos tu clase de ${r.class_name} el ${when}${details ? ` ${details}` : ""}.\n\n${cancelNote}\n\n¡Te esperamos!\nMTOR`,
    html: `<p>Hola ${escapeHtml(name)},</p>
<p>Te recordamos tu clase de <b>${escapeHtml(r.class_name)}</b> el <b>${escapeHtml(when)}</b>${details ? ` ${escapeHtml(details)}` : ""}.</p>
<p>${cancelNote}</p>
<p>¡Te esperamos!<br>MTOR</p>`,
  };
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!gmailUser || !gmailPassword || !serviceKey) {
    return NextResponse.json({ error: "Faltan variables de entorno." }, { status: 500 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("due_reminders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reminders = (data ?? []) as Reminder[];
  if (reminders.length === 0) return NextResponse.json({ sent: 0 });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPassword },
  });

  const sent: string[] = [];
  const failed: string[] = [];
  for (const r of reminders) {
    try {
      await transporter.sendMail({ from: `"MTOR" <${gmailUser}>`, to: r.email, ...reminderEmail(r) });
      sent.push(r.reservation_id);
    } catch (e) {
      console.error("No se pudo enviar el recordatorio", r.reservation_id, e);
      failed.push(r.reservation_id);
    }
  }

  // Los que fallaron se reintentan en la próxima pasada.
  if (sent.length > 0) {
    const { error: markError } = await supabase.rpc("mark_reminders_sent", { p_ids: sent });
    if (markError) return NextResponse.json({ error: markError.message, sent: sent.length }, { status: 500 });
  }

  return NextResponse.json({ sent: sent.length, failed: failed.length });
}
