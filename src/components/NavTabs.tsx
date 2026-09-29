"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/agenda", label: "Agenda" },
  { href: "/mis-reservas", label: "Mis reservas" },
  { href: "/mi-plan", label: "Mi plan" },
];

export default function NavTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const tabs = isAdmin ? [...TABS, { href: "/admin", label: "Panel admin" }] : TABS;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="sticky top-0 bg-bg z-20 pt-3">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-2xl leading-none">
          MT<span style={{ color: "var(--accent)" }}>OR</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs font-semibold text-ink2 hover:text-ink"
        >
          Cerrar sesión
        </button>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-2 mb-4">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-none px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-[9px] ${
                active
                  ? "text-accent border-accent"
                  : "text-ink2 border-transparent hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
