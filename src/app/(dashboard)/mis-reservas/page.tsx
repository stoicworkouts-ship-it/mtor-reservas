import { createClient } from "@/lib/supabase/server";
import MisReservasClient from "./MisReservasClient";

export const dynamic = "force-dynamic";

export default async function MisReservasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, status, session:sessions(id, starts_at, room, class_type:class_types(name, category), coach:coaches(display_name))"
    )
    .eq("user_id", user!.id)
    .in("status", ["confirmed", "waitlisted"])
    .order("created_at", { ascending: false });

  return <MisReservasClient reservations={(reservations as any) ?? []} />;
}
