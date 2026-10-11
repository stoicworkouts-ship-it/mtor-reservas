import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavTabs from "@/components/NavTabs";
import PhoneForm from "@/components/PhoneForm";

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
    .select("role, phone")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  return (
    <main className="max-w-2xl mx-auto px-5 pb-28">
      <NavTabs isAdmin={isAdmin} />
      {profile?.phone ? children : <PhoneForm />}
    </main>
  );
}
