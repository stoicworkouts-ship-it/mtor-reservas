import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminClient from "./AdminClient";

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

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const { data: todaySessions } = await supabase
    .from("sessions")
    .select("id, starts_at, capacity, class_type:class_types(name, category)")
    .gte("starts_at", startOfDay.toISOString())
    .lte("starts_at", endOfDay.toISOString())
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true });

  const { data: counts } = await supabase
    .from("reservations")
    .select("session_id")
    .eq("status", "confirmed");

  const bookedBySession: Record<string, number> = {};
  (counts ?? []).forEach((r: any) => {
    bookedBySession[r.session_id] = (bookedBySession[r.session_id] ?? 0) + 1;
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
      todaySessions={(todaySessions as any) ?? []}
      bookedBySession={bookedBySession}
      classTypes={(classTypes as any) ?? []}
      coaches={(coaches as any) ?? []}
      scheduleTemplates={(scheduleTemplates as any) ?? []}
      plans={(allPlans as any) ?? []}
    />
  );
}
