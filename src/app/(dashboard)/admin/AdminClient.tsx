"use client";

import { useState, useTransition } from "react";
import { approvePayment, rejectPayment } from "@/app/actions";
import { TYPE_LABEL, type ClassCategory } from "@/lib/types";

function money(n: number) {
  return "$" + n.toLocaleString("es-CL");
}

type Payment = {
  id: string;
  amount: number;
  created_at: string;
  plan: { name: string };
  profile: { full_name: string };
};

type TodaySession = {
  id: string;
  starts_at: string;
  capacity: number;
  class_type: { name: string; category: ClassCategory };
};

export default function AdminClient({
  payments,
  todaySessions,
  bookedBySession,
}: {
  payments: Payment[];
  todaySessions: TodaySession[];
  bookedBySession: Record<string, number>;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApprove(id: string, name: string) {
    startTransition(async () => {
      const res = await approvePayment(id);
      setToast(res.ok ? `Pago de ${name} aprobado.` : res.error);
      setTimeout(() => setToast(null), 3000);
    });
  }
  function handleReject(id: string, name: string) {
    startTransition(async () => {
      const res = await rejectPayment(id);
      setToast(res.ok ? `Pago de ${name} rechazado.` : res.error);
      setTimeout(() => setToast(null), 3000);
    });
  }

  return (
    <section className="pb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2">
          Pagos pendientes
        </h2>
        <span className="text-[11px] text-ink2">Vista de administración</span>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm mb-8">
        {payments.length === 0 && <p className="text-sm text-ink2">No hay pagos pendientes.</p>}
        {payments.map((p, i) => (
          <div
            key={p.id}
            className={`flex items-center justify-between gap-2 py-2.5 text-xs ${
              i < payments.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <div>
              <div>
                <b>{p.profile?.full_name}</b> · {p.plan.name}
              </div>
              <div className="text-ink2 mt-0.5">
                {money(p.amount)} · {p.created_at.slice(0, 10).split("-").reverse().join("-")}
              </div>
            </div>
            <div className="flex gap-1.5 flex-none">
              <button
                disabled={pending}
                onClick={() => handleApprove(p.id, p.profile?.full_name)}
                className="rounded-md px-2.5 py-1.5 text-[11px] font-bold"
                style={{ background: "var(--success-bg)", color: "var(--success)" }}
              >
                Aprobar
              </button>
              <button
                disabled={pending}
                onClick={() => handleReject(p.id, p.profile?.full_name)}
                className="rounded-md px-2.5 py-1.5 text-[11px] font-bold"
                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
              >
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">
        Ocupación de hoy
      </h2>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {todaySessions.length === 0 && (
          <p className="text-sm text-ink2">No hay bloques agendados para hoy.</p>
        )}
        {todaySessions.map((s, i) => {
          const booked = bookedBySession[s.id] ?? 0;
          const pct = Math.round((booked / s.capacity) * 100);
          let barColor = "var(--success)";
          if (pct >= 100) barColor = "var(--danger)";
          else if (pct >= 70) barColor = "var(--warning)";
          const time = new Date(s.starts_at).toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div
              key={s.id}
              className={`flex items-center gap-2.5 py-2 text-xs ${
                i < todaySessions.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <time className="font-mono w-11 flex-none tabular">{time}</time>
              <div className="flex-1 font-semibold min-w-0">
                {s.class_type.name} · {TYPE_LABEL[s.class_type.category]}
              </div>
              <div className="w-16 flex-none h-[5px] rounded bg-surface2 overflow-hidden">
                <div className="h-full rounded" style={{ width: `${pct}%`, background: barColor }} />
              </div>
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
