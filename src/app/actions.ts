"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ClassCategory } from "@/lib/types";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

// Busca el plan activo del usuario que cubra esta categoría y que tenga sesiones disponibles.
async function findUsablePlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  category: ClassCategory
) {
  const { data, error } = await supabase
    .from("user_plans")
    .select("id, sessions_used, plan:plans!inner(sessions_count, category)")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("plan.category", category);

  if (error || !data) return null;

  const usable = data.find(
    (row: any) => row.sessions_used < row.plan.sessions_count
  );
  return usable ?? null;
}

export async function reserveSession(
  sessionId: string,
  category: ClassCategory
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Debes iniciar sesión." };

  const plan = await findUsablePlan(supabase, user.id, category);
  if (!plan) {
    return {
      ok: false,
      error:
        "No tienes un plan activo con sesiones disponibles para este tipo de clase. Revisa Mi plan.",
    };
  }

  const { data, error } = await supabase.rpc("book_session", {
    p_session_id: sessionId,
    p_user_plan_id: plan.id,
  });

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

  const { error } = await supabase.rpc("cancel_reservation", {
    p_reservation_id: reservationId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/agenda");
  revalidatePath("/mis-reservas");
  revalidatePath("/mi-plan");

  return { ok: true, message: "Reserva cancelada." };
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

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, price, category, sessions_count, duration_days")
    .eq("id", planId)
    .single();

  if (planError || !plan) return { ok: false, error: "El plan seleccionado no existe." };

  // Crea el plan del usuario en estado 'pending' hasta que se apruebe el pago.
  const { data: userPlan, error: userPlanError } = await supabase
    .from("user_plans")
    .insert({ user_id: user.id, plan_id: plan.id, status: "pending" })
    .select("id")
    .single();

  if (userPlanError || !userPlan) {
    return { ok: false, error: "No se pudo crear el plan pendiente." };
  }

  const ext = file.name.split(".").pop();
  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("comprobantes")
    .upload(path, file);

  if (uploadError) {
    return { ok: false, error: "No se pudo subir el archivo: " + uploadError.message };
  }

  const { error: paymentError } = await supabase.from("payments").insert({
    user_id: user.id,
    plan_id: plan.id,
    user_plan_id: userPlan.id,
    amount: plan.price,
    method: "transferencia",
    status: "pending",
    receipt_path: path,
  });

  if (paymentError) return { ok: false, error: paymentError.message };

  revalidatePath("/mi-plan");
  return { ok: true, message: "Comprobante enviado. Quedará pendiente de aprobación." };
}

export async function approvePayment(paymentId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, user_plan_id, plan:plans!inner(duration_days)")
    .eq("id", paymentId)
    .single();

  if (fetchError || !payment) return { ok: false, error: "Pago no encontrado." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const startsAt = new Date();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (payment as any).plan.duration_days);

  const { error: planError } = await supabase
    .from("user_plans")
    .update({
      status: "active",
      starts_at: startsAt.toISOString().slice(0, 10),
      expires_at: expiresAt.toISOString().slice(0, 10),
    })
    .eq("id", payment.user_plan_id);

  if (planError) return { ok: false, error: planError.message };

  const { error: paymentError } = await supabase
    .from("payments")
    .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
    .eq("id", paymentId);

  if (paymentError) return { ok: false, error: paymentError.message };

  revalidatePath("/admin");
  return { ok: true, message: "Pago aprobado y plan activado." };
}

export async function rejectPayment(paymentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: payment } = await supabase
    .from("payments")
    .select("user_plan_id")
    .eq("id", paymentId)
    .single();

  const { error: paymentError } = await supabase
    .from("payments")
    .update({ status: "rejected", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
    .eq("id", paymentId);

  if (paymentError) return { ok: false, error: paymentError.message };

  if (payment?.user_plan_id) {
    await supabase.from("user_plans").update({ status: "cancelled" }).eq("id", payment.user_plan_id);
  }

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
