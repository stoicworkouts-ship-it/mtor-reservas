"use client";

import { useState, useTransition } from "react";
import { cancelReservation } from "@/app/actions";
import { TYPE_LABEL, type ClassCategory } from "@/lib/types";
import { chileDayKey, chileTime, dayKeyParts } from "@/lib/time";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Row = {
  id: string;
  status: "confirmed" | "waitlisted";
  session: {
    starts_at: string;
    room: string | null;
    class_type: { name: string; category: ClassCategory };
    coach: { display_name: string } | null;
  };
};

export default function MisReservasClient({ reservations }: { reservations: Row[] }) {
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sorted = [...reservations].sort(
    (a, b) => new Date(a.session.starts_at).getTime() - new Date(b.session.starts_at).getTime()
  );

  function handleCancel(id: string) {
    startTransition(async () => {
      const res = await cancelReservation(id);
      setToast(res.ok ? res.message ?? "Listo." : res.error);
      setTimeout(() => setToast(null), 3000);
    });
  }

  return (
    <section className="pb-10">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">
        Próximas reservas
      </h2>
      {sorted.length === 0 && (
        <p className="text-center text-sm text-ink2 py-10">
          Aún no tienes reservas. Ve a Agenda para reservar tu próxima sesión.
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {sorted.map((r) => {
          const { day, month } = dayKeyParts(chileDayKey(r.session.starts_at));
          const time = chileTime(r.session.starts_at);
          return (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <div className="w-11 text-center flex-none">
                <div className="font-display text-lg leading-none">{day}</div>
                <div className="text-[9px] uppercase tracking-wide text-ink2">{MESES[month]}</div>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm">
                  {r.session.class_type.name} · {TYPE_LABEL[r.session.class_type.category]}
                </h4>
                <p className="text-[11.5px] font-mono text-ink2 mt-0.5">
                  {time} · {r.session.coach?.display_name ?? "—"}
                  {r.status === "waitlisted" ? " · en espera" : ""}
                </p>
              </div>
              <button
                disabled={pending}
                onClick={() => handleCancel(r.id)}
                className="flex-none rounded-lg bg-surface2 px-3 py-2 text-xs font-bold text-ink"
              >
                Cancelar
              </button>
            </div>
          );
        })}
      </div>

      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 rounded-full bg-ink text-bg px-4 py-2.5 text-sm font-semibold shadow-lg z-50">
          {toast}
        </div>
      )}
    </section>
  );
}
