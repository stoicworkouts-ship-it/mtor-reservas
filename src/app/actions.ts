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
