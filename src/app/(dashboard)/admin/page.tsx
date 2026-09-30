import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminClient from "./AdminClient";
import { chileDayKey } from "@/lib/time";

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

  // "Hoy" es el día en Chile: se pide un rango amplio y se filtra por fecha chilena,
  // porque el servidor corre en UTC.
  const now = new Date();
  const todayKey = chileDayKey(now);
  const rangeStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  const { data: nearbySessions } = await supabase
    .from("sessions")
    .select("id, starts_at, capacity, class_type:class_types(name, category)")
    .gte("starts_at", rangeStart.toISOString())
    .lte("starts_at", rangeEnd.toISOString())
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true });

  const todaySessions = (nearbySessions ?? []).filter(
    (s: any) => chileDayKey(s.starts_at) === todayKey
  );

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

  const { data: scheduleTemplates } = await supabase
    .from("schedule_templates")
    .select(
      "id, weekday, start_time, duration_minutes, room, capacity, active, class_type_id, coach_id, class_type:class_types(name, category), coach:coaches(display_name)"
    )
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  const { data: allPlans } = await supabase
    .from("plans")
    .select("id, name, category, sessions_count, price, duration_days, active")
    .order("category", { ascending: true })
    .order("price", { ascending: true });

  return (
    <AdminClient
      payments={(payments as any) ?? []}
      todaySessions={todaySessions as any}
      bookedBySession={bookedBySession}
      classTypes={(classTypes as any) ?? []}
      coaches={(coaches as any) ?? []}
      scheduleTemplates={(scheduleTemplates as any) ?? []}
      plans={(allPlans as any) ?? []}
    />
  );
}
