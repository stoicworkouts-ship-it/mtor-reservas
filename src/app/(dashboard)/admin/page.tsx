import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminClient from "./AdminClient";
import { addDays, chileDayKey, mondayOf } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/agenda");
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, status, created_at, plan:plans(name), profile:profiles(full_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // Calendario: desde la semana pasada (para poder duplicarla) hasta ~10 semanas más,
  // con borradores y canceladas. Se pide un rango con margen y se filtra por fecha
  // chilena, porque el servidor corre en UTC.
  const now = new Date();
  const firstDay = addDays(mondayOf(chileDayKey(now)), -7);
  const rangeStart = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 72 * 24 * 60 * 60 * 1000);

  const { data: rangeSessions } = await supabase
    .from("sessions")
    .select(
      "id, starts_at, duration_minutes, capacity, room, status, class_type_id, coach_id, class_type:class_types(name, category), coach:coaches(display_name)"
    )
    .gte("starts_at", rangeStart.toISOString())
    .lte("starts_at", rangeEnd.toISOString())
    .order("starts_at", { ascending: true });

  const sessions = (rangeSessions ?? []).filter((s: any) => chileDayKey(s.starts_at) >= firstDay);

  const { data: occupancy } = await supabase.rpc("session_occupancy", {
    p_from: rangeStart.toISOString(),
    p_to: rangeEnd.toISOString(),
  });

  const bookedBySession: Record<string, number> = {};
  (occupancy ?? []).forEach((r: any) => {
    bookedBySession[r.session_id] = r.booked;
  });

  const { data: classTypes } = await supabase
    .from("class_types")
    .select("id, name, category, default_capacity")
    .order("name", { ascending: true });

  const { data: coaches } = await supabase
    .from("coaches")
    .select("id, display_name, active")
    .order("display_name", { ascending: true });

  const { data: allPlans } = await supabase
    .from("plans")
    .select("id, name, price, duration_days, active, items:plan_items(category, sessions_count)")
    .order("price", { ascending: true });

  return (
    <AdminClient
      payments={(payments as any) ?? []}
      sessions={sessions as any}
      bookedBySession={bookedBySession}
      classTypes={(classTypes as any) ?? []}
      coaches={(coaches as any) ?? []}
      plans={(allPlans as any) ?? []}
    />
  );
}
