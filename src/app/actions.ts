"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_OPTIONS, CATEGORY_SIZE, type ClassCategory } from "@/lib/types";

// needsConfirm: la acción no se aplicó porque afecta a personas con reserva;
// `error` trae la pregunta para el admin y se vuelve a llamar con force = true.
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; needsConfirm?: boolean };

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
  // En 1:1, 2:1… el cupo es fijo (1, 2…); solo en grupal lo elige el admin.
  const defaultCapacity = CATEGORY_SIZE[category] ?? Number(formData.get("defaultCapacity"));

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

// ---------------------------------------------------------------
// Calendario: el admin arma cada semana. Todo lo nuevo queda como
// borrador hasta que publica la semana.
// ---------------------------------------------------------------

function people(n: number) {
  return n === 1 ? "1 persona" : `${n} personas`;
}

function revalidateCalendar() {
  revalidatePath("/admin");
  revalidatePath("/agenda");
  revalidatePath("/mis-reservas");
  revalidatePath("/mi-plan");
}

function readSessionForm(formData: FormData) {
  const capacity = formData.get("capacity") as string;
  return {
    date: formData.get("date") as string,
    time: formData.get("time") as string,
    durationMinutes: Number(formData.get("durationMinutes") || 60),
    classTypeId: formData.get("classTypeId") as string,
    coachId: (formData.get("coachId") as string) || null,
    // vacío = cupo por defecto del tipo de clase
    capacity: capacity ? Number(capacity) : null,
    room: (formData.get("room") as string) || null,
  };
}

export async function createSession(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const f = readSessionForm(formData);
  if (!f.date || !f.time || !f.classTypeId) {
    return { ok: false, error: "Completa día, hora y tipo de clase." };
  }

  const { error } = await supabase.rpc("create_session", {
    p_date: f.date,
    p_time: f.time,
    p_duration_minutes: f.durationMinutes,
    p_class_type_id: f.classTypeId,
    p_coach_id: f.coachId,
    p_capacity: f.capacity,
    p_room: f.room,
  });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar();
  return { ok: true, message: "Clase agregada como borrador. Publica la semana para que la vean los clientes." };
}

export async function updateSession(
  sessionId: string,
  formData: FormData,
  force = false
): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const f = readSessionForm(formData);
  if (!f.date || !f.time || !f.classTypeId) {
    return { ok: false, error: "Completa día, hora y tipo de clase." };
  }

  const { data, error } = await supabase.rpc("update_session", {
    p_session_id: sessionId,
    p_date: f.date,
    p_time: f.time,
    p_duration_minutes: f.durationMinutes,
    p_class_type_id: f.classTypeId,
    p_coach_id: f.coachId,
    p_capacity: f.capacity,
    p_room: f.room,
    p_force: force,
  });
  if (error) return { ok: false, error: error.message };

  const r = data as {
    needs_confirmation: boolean;
    people: number;
    time_changed?: boolean;
    category_changed?: boolean;
    capacity_lowered?: boolean;
  };
  if (r.needs_confirmation) {
    const effects = [
      r.time_changed && "La clase cambia de día u hora; avísales.",
      r.category_changed &&
        "Como el tipo de clase cambia de categoría, esas reservas se cancelan y la sesión vuelve a sus planes.",
      r.capacity_lowered &&
        "El cupo nuevo es menor: nadie pierde su reserva, pero la clase puede quedar sobre el cupo.",
    ].filter(Boolean);
    return {
      ok: false,
      needsConfirm: true,
      error: `Hay ${people(r.people)} con reserva en esta clase. ${effects.join(" ")} ¿Continuar?`,
    };
  }

  revalidateCalendar();
  return {
    ok: true,
    message:
      r.people > 0 && r.time_changed
        ? `Clase actualizada. Avisa del cambio a ${people(r.people)} con reserva.`
        : "Clase actualizada.",
  };
}

export async function deleteSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.rpc("delete_session", { p_session_id: sessionId });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar();
  return { ok: true, message: "Clase eliminada." };
}

export async function cancelSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { data, error } = await supabase.rpc("cancel_session", { p_session_id: sessionId });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar();
  const n = (data as number) ?? 0;
  return {
    ok: true,
    message: n > 0 ? `Clase cancelada. Se devolvió la sesión a ${people(n)}; avísales.` : "Clase cancelada.",
  };
}

export async function restoreSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { error } = await supabase.rpc("restore_session", { p_session_id: sessionId });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar();
  return { ok: true, message: "Clase reactivada. Quienes tenían reserva deben volver a reservar." };
}

// monday: "YYYY-MM-DD" del lunes de la semana (en Chile).
export async function duplicateWeek(monday: string, weeks: number): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { data, error } = await supabase.rpc("duplicate_week", { p_monday: monday, p_weeks: weeks });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar();
  const r = data as { created: number; skipped: number };
  if (r.created === 0) return { ok: true, message: "No se creó nada: esas clases ya existían en las semanas siguientes." };
  const semanas = weeks === 1 ? "la semana siguiente" : `las ${weeks} semanas siguientes`;
  return {
    ok: true,
    message: `Se copiaron ${r.created} clases como borrador a ${semanas}${
      r.skipped > 0 ? ` (${r.skipped} ya existían)` : ""
    }. Revísalas y publícalas.`,
  };
}

export async function publishWeek(monday: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { data, error } = await supabase.rpc("publish_week", { p_monday: monday });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar();
  return { ok: true, message: `Semana publicada: ${data ?? 0} clases ya se pueden reservar.` };
}

export async function discardWeekDrafts(monday: string): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const { data, error } = await supabase.rpc("discard_week_drafts", { p_monday: monday });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar();
  return { ok: true, message: `Se descartaron ${data ?? 0} borradores.` };
}

// Un plan incluye sesiones de una o más categorías: campos items_grupal, items_dos_uno…
async function savePlan(id: string | null, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard;

  const name = (formData.get("name") as string)?.trim();
  const price = Number(formData.get("price"));
  const durationDays = Number(formData.get("durationDays") || 30);
  const items = CATEGORY_OPTIONS.map((o) => ({
    category: o.value,
    sessions: Number(formData.get(`items_${o.value}`) || 0),
  })).filter((i) => i.sessions > 0);

  if (!name || isNaN(price) || price < 0) {
    return { ok: false, error: "Completa nombre y precio." };
  }
  if (items.length === 0) {
    return { ok: false, error: "Indica cuántas sesiones incluye el plan en al menos una categoría." };
  }

  const { error } = await supabase.rpc("save_plan", {
    p_id: id,
    p_name: name,
    p_price: price,
    p_duration_days: durationDays,
    p_items: items,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/mi-plan");
  return { ok: true, message: id ? "Plan actualizado." : "Plan creado." };
}

export async function createPlan(formData: FormData): Promise<ActionResult> {
  return savePlan(null, formData);
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
  // En 1:1, 2:1… el cupo es fijo (1, 2…); solo en grupal lo elige el admin.
  const defaultCapacity = CATEGORY_SIZE[category] ?? Number(formData.get("defaultCapacity"));
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
  if (error) return { ok: false, error: friendlyDeleteError(error, "clases del calendario o planes") };
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
  if (error) return { ok: false, error: friendlyDeleteError(error, "clases del calendario") };
  revalidatePath("/admin");
  return { ok: true, message: "Entrenador eliminado." };
}

export async function updatePlan(id: string, formData: FormData): Promise<ActionResult> {
  return savePlan(id, formData);
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
