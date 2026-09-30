"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ClassCategory } from "@/lib/types";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

// La función book_session elige el plan del usuario que corresponde a la sesión
// y revisa cupo, categoría, vigencia y sesiones disponibles.
export async function reserveSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Debes iniciar sesión." };

  const { data, error } = await supabase.rpc("book_session", { p_session_id: sessionId });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/agenda");
  revalidatePath("/mis-reservas");
  revalidatePath("/mi-plan");

  const status = (data as any)?.status;
  return {
    ok: true,
    message:
      status === "waitlisted"
        ? "El bloque está lleno, quedaste en lista de espera."
        : "Reserva confirmada.",
  };
}

export async function cancelReservation(reservationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Debes iniciar sesión." };

  const { data: refunded, error } = await supabase.rpc("cancel_reservation", {
    p_reservation_id: reservationId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/agenda");
  revalidatePath("/mis-reservas");
  revalidatePath("/mi-plan");

  return {
    ok: true,
    message: refunded
      ? "Reserva cancelada."
      : "Reserva cancelada. Como faltaban menos de 2 horas, la sesión no se devuelve a tu plan.",
  };
}

export async function uploadPayment(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Debes iniciar sesión." };

  const planId = formData.get("planId") as string;
  const file = formData.get("file") as File | null;

  if (!planId || !file || file.size === 0) {
    return { ok: false, error: "Selecciona un plan y adjunta el comprobante." };
  }
  const ext = RECEIPT_TYPES[file.type];
  if (!ext) return { ok: false, error: "El comprobante debe ser una foto (JPG, PNG, HEIC) o un PDF." };
  if (file.size > MAX_RECEIPT_BYTES) return { ok: false, error: "El archivo pesa más de 10 MB." };

  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("comprobantes")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return { ok: false, error: "No se pudo subir el archivo: " + uploadError.message };
  }

  // Crea el plan pendiente y el pago en un solo paso; el precio lo pone la base de datos.
  const { error } = await supabase.rpc("request_plan", {
    p_plan_id: planId,
    p_receipt_path: path,
  });

  if (error) {
    await supabase.storage.from("comprobantes").remove([path]);
    return { ok: false, error: error.message };
  }

  revalidatePath("/mi-plan");
  revalidatePath("/admin");
  return { ok: true, message: "Comprobante enviado. Quedará pendiente de aprobación." };
}

export async function approvePayment(paymentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.rpc("approve_payment", { p_payment_id: paymentId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, message: "Pago aprobado y plan activado." };
}

export async function rejectPayment(paymentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.rpc("reject_payment", { p_payment_id: paymentId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, message: "Pago rechazado." };
}

// ---------------------------------------------------------------
// Administración: tipos de clase, entrenadores, horario y planes
// ---------------------------------------------------------------

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Debes iniciar sesión." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, error: "Solo un administrador puede hacer esto." };
  return { ok: true as const };
}

export async function createClassType(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const name = formData.get("name") as string;
  const category = formData.get("category") as ClassCategory;
  const defaultCapacity = Number(formData.get("defaultCapacity"));

  if (!name || !category || !defaultCapacity) {
    return { ok: false, error: "Completa nombre, categoría y cupo." };
  }

  const { error } = await supabase
    .from("class_types")
    .insert({ name, category, default_capacity: defaultCapacity });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Tipo de clase creado." };
}

export async function createCoach(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const displayName = formData.get("displayName") as string;
  if (!displayName) return { ok: false, error: "Escribe el nombre del entrenador." };

  const { error } = await supabase.from("coaches").insert({ display_name: displayName });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Entrenador agregado." };
}

export async function createScheduleTemplate(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const classTypeId = formData.get("classTypeId") as string;
  const coachId = (formData.get("coachId") as string) || null;
  const weekday = Number(formData.get("weekday"));
  const startTime = formData.get("startTime") as string;
  const durationMinutes = Number(formData.get("durationMinutes") || 60);
  const capacity = Number(formData.get("capacity"));
  const room = (formData.get("room") as string) || null;

  if (!classTypeId || isNaN(weekday) || !startTime || !capacity) {
    return { ok: false, error: "Completa tipo de clase, día, hora y cupo." };
  }

  const { error } = await supabase.from("schedule_templates").insert({
    class_type_id: classTypeId,
    coach_id: coachId,
    weekday,
    start_time: startTime,
    duration_minutes: durationMinutes,
    capacity,
    room,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Bloque agregado al horario." };
}

export async function toggleScheduleTemplate(id: string, active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.from("schedule_templates").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, message: active ? "Bloque activado." : "Bloque desactivado." };
}

export async function deleteScheduleTemplate(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.from("schedule_templates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Bloque eliminado del horario." };
}

export async function generateSessionsNow(): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.rpc("generate_upcoming_sessions", { weeks_ahead: 3 });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/agenda");
  revalidatePath("/admin");
  return { ok: true, message: "Calendario actualizado con las próximas 3 semanas." };
}

export async function createPlan(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const name = formData.get("name") as string;
  const category = formData.get("category") as ClassCategory;
  const sessionsCount = Number(formData.get("sessionsCount"));
  const price = Number(formData.get("price"));
  const durationDays = Number(formData.get("durationDays") || 30);

  if (!name || !category || !sessionsCount || !price) {
    return { ok: false, error: "Completa nombre, categoría, sesiones y precio." };
  }

  const { error } = await supabase.from("plans").insert({
    name,
    category,
    sessions_count: sessionsCount,
    price,
    duration_days: durationDays,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/mi-plan");
  return { ok: true, message: "Plan creado." };
}

export async function togglePlan(id: string, active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.from("plans").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/mi-plan");
  return { ok: true, message: active ? "Plan activado." : "Plan desactivado." };
}

export async function toggleCoach(id: string, active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.from("coaches").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, message: active ? "Entrenador activado." : "Entrenador desactivado." };
}

// Traduce el error típico de "no se puede borrar porque algo más lo usa" a un mensaje claro.
function friendlyDeleteError(error: { code?: string; message: string }, label: string) {
  if (error.code === "23503") {
    return `No se puede eliminar: hay ${label} que todavía lo usan. Desactívalo en vez de eliminarlo, o elimina primero lo que depende de él.`;
  }
  return error.message;
}

export async function updateClassType(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const name = formData.get("name") as string;
  const category = formData.get("category") as ClassCategory;
  const defaultCapacity = Number(formData.get("defaultCapacity"));
  if (!name || !category || !defaultCapacity) {
    return { ok: false, error: "Completa nombre, categoría y cupo." };
  }

  const { error } = await supabase
    .from("class_types")
    .update({ name, category, default_capacity: defaultCapacity })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/agenda");
  return { ok: true, message: "Tipo de clase actualizado." };
}

export async function deleteClassType(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.from("class_types").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyDeleteError(error, "bloques de horario o planes") };
  revalidatePath("/admin");
  revalidatePath("/agenda");
  return { ok: true, message: "Tipo de clase eliminado." };
}

export async function updateCoach(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const displayName = formData.get("displayName") as string;
  if (!displayName) return { ok: false, error: "Escribe el nombre del entrenador." };

  const { error } = await supabase.from("coaches").update({ display_name: displayName }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Entrenador actualizado." };
}

export async function deleteCoach(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.from("coaches").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyDeleteError(error, "bloques de horario") };
  revalidatePath("/admin");
  return { ok: true, message: "Entrenador eliminado." };
}

export async function updateScheduleTemplate(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const classTypeId = formData.get("classTypeId") as string;
  const coachId = (formData.get("coachId") as string) || null;
  const weekday = Number(formData.get("weekday"));
  const startTime = formData.get("startTime") as string;
  const durationMinutes = Number(formData.get("durationMinutes") || 60);
  const capacity = Number(formData.get("capacity"));
  const room = (formData.get("room") as string) || null;

  if (!classTypeId || isNaN(weekday) || !startTime || !capacity) {
    return { ok: false, error: "Completa tipo de clase, día, hora y cupo." };
  }

  const { error } = await supabase
    .from("schedule_templates")
    .update({
      class_type_id: classTypeId,
      coach_id: coachId,
      weekday,
      start_time: startTime,
      duration_minutes: durationMinutes,
      capacity,
      room,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/agenda");
  return { ok: true, message: "Bloque actualizado." };
}

export async function updatePlan(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const name = formData.get("name") as string;
  const category = formData.get("category") as ClassCategory;
  const sessionsCount = Number(formData.get("sessionsCount"));
  const price = Number(formData.get("price"));
  const durationDays = Number(formData.get("durationDays") || 30);

  if (!name || !category || !sessionsCount || !price) {
    return { ok: false, error: "Completa nombre, categoría, sesiones y precio." };
  }

  const { error } = await supabase
    .from("plans")
    .update({ name, category, sessions_count: sessionsCount, price, duration_days: durationDays })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/mi-plan");
  return { ok: true, message: "Plan actualizado." };
}

export async function deletePlan(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyDeleteError(error, "clientes con este plan") };
  revalidatePath("/admin");
  revalidatePath("/mi-plan");
  return { ok: true, message: "Plan eliminado." };
}
