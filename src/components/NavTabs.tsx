"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ICONS = {
  agenda: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  reservas: (
    <>
      <path d="M9 11l3 3 8-8" />
      <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
    </>
  ),
  plan: <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" />,
  admin: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

const TABS = [
  { href: "/agenda", label: "Agenda", icon: ICONS.agenda },
  { href: "/mis-reservas", label: "Mis reservas", icon: ICONS.reservas },
  { href: "/mi-plan", label: "Mi plan", icon: ICONS.plan },
];

// Marca y "Salir" arriba; pestañas con íconos abajo, como en las apps de celular.
export default function NavTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const tabs = isAdmin ? [...TABS, { href: "/admin", label: "Admin", icon: ICONS.admin }] : TABS;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-20 bg-bg flex items-center justify-between pt-4 pb-3">
        <Link href="/agenda" className="flex items-center gap-2.5">
          <span className="hex w-[30px] h-[34px] bg-accent" aria-hidden="true" />
          <span className="font-display text-2xl leading-none">
            M-<span className="text-accentText">TOR</span>
          </span>
        </Link>
        <button onClick={handleLogout} className="min-h-[44px] px-2 text-sm font-semibold text-ink2 hover:text-ink">
          Salir
        </button>
      </header>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]">
        <div className={`max-w-2xl mx-auto grid ${isAdmin ? "grid-cols-4" : "grid-cols-3"} px-3 pt-2 pb-3`}>
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-1 min-h-[52px] text-xs ${
                  active ? "text-accentText font-bold" : "text-ink2 font-semibold hover:text-ink"
                }`}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
