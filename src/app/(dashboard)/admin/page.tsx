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

  return (
    <AdminClient
      payments={(payments as any) ?? []}
      todaySessions={(todaySessions as any) ?? []}
      bookedBySession={bookedBySession}
    />
  );
}
