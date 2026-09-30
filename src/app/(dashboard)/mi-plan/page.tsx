import { createClient } from "@/lib/supabase/server";
import MiPlanClient from "./MiPlanClient";

export const dynamic = "force-dynamic";

export default async function MiPlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: userPlans } = await supabase
    .from("user_plans")
    .select("id, status, expires_at, plan:plans(name), items:user_plan_items(category, sessions_total, sessions_used)")
    .eq("user_id", user!.id)
    .eq("status", "active");

  const { data: catalog } = await supabase
    .from("plans")
    .select("id, name, price, duration_days, items:plan_items(category, sessions_count)")
    .eq("active", true)
    .order("price", { ascending: true });

  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, status, created_at, plan:plans(name)")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <MiPlanClient
      userPlans={(userPlans as any) ?? []}
      catalog={(catalog as any) ?? []}
      payments={(payments as any) ?? []}
    />
  );
}
