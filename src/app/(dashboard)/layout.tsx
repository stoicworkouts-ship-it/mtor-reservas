import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavTabs from "@/components/NavTabs";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  return (
    <main className="max-w-2xl mx-auto px-4 pb-10">
      <NavTabs isAdmin={isAdmin} />
      {children}
    </main>
  );
}
