import { createClient } from "@/lib/supabase/server";
import AgendaClient from "./AgendaClient";

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

  const { data: counts } = await supabase
    .from("reservations")
    .select("session_id")
    .eq("status", "confirmed");

  const bookedBySession: Record<string, number> = {};
  (counts ?? []).forEach((r: any) => {
    bookedBySession[r.session_id] = (bookedBySession[r.session_id] ?? 0) + 1;
  });

  const { data: userPlans } = await supabase
    .from("user_plans")
    .select("id, sessions_used, status, plan:plans(id, name, category, sessions_count)")
    .eq("user_id", user!.id)
    .eq("status", "active");

  return (
    <AgendaClient
      sessions={(sessions as any) ?? []}
      reservations={(reservations as any) ?? []}
      bookedBySession={bookedBySession}
      userPlans={(userPlans as any) ?? []}
    />
  );
}
