import { createClient } from "@/lib/supabase/server";
import AgendaClient from "./AgendaClient";
import { chileDayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 21);

  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, starts_at, duration_minutes, room, capacity, status, class_type:class_types(id, name, category, default_capacity), coach:coaches(id, display_name)"
    )
    .gte("starts_at", now.toISOString())
    .lte("starts_at", rangeEnd.toISOString())
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true });

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id, session_id, status")
    .eq("user_id", user!.id)
    .in("status", ["confirmed", "waitlisted"]);

  // Cada cliente solo puede leer sus propias reservas, así que los cupos
  // ocupados se piden a una función que devuelve solo los totales.
  const { data: occupancy } = await supabase.rpc("session_occupancy", {
    p_from: now.toISOString(),
    p_to: rangeEnd.toISOString(),
  });

  const bookedBySession: Record<string, number> = {};
  (occupancy ?? []).forEach((r: any) => {
    bookedBySession[r.session_id] = r.booked;
  });

  const { data: userPlans } = await supabase
    .from("user_plans")
    .select("id, sessions_used, status, plan:plans(id, name, category, sessions_count)")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gte.${chileDayKey(now)}`);

  return (
    <AgendaClient
      sessions={(sessions as any) ?? []}
      reservations={(reservations as any) ?? []}
      bookedBySession={bookedBySession}
      userPlans={(userPlans as any) ?? []}
    />
  );
}
