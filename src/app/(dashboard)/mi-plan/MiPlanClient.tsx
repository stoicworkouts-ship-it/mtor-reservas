"use client";

import { useRef, useState, useTransition } from "react";
import { uploadPayment } from "@/app/actions";
import { TYPE_LABEL, type ClassCategory } from "@/lib/types";

type UserPlan = {
  id: string;
  sessions_used: number;
  expires_at: string | null;
  plan: { name: string; category: ClassCategory; sessions_count: number };
};
type CatalogPlan = {
  id: string;
  name: string;
  category: ClassCategory;
  sessions_count: number;
  price: number;
};
type Payment = {
  id: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  plan: { name: string };
};

function money(n: number) {
  return "$" + n.toLocaleString("es-CL");
}

export default function MiPlanClient({
  userPlans,
  catalog,
  payments,
}: {
  userPlans: UserPlan[];
  catalog: CatalogPlan[];
  payments: Payment[];
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await uploadPayment(formData);
      showToast(res.ok ? res.message ?? "Enviado." : res.error);
      if (res.ok) formRef.current?.reset();
    });
  }

  return (
    <section className="pb-10">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">
        Tus planes activos
      </h2>
      {userPlans.length === 0 && (
        <p className="text-sm text-ink2 mb-6">No tienes planes activos todavía.</p>
      )}
      <div className="flex flex-col gap-3 mb-8">
        {userPlans.map((p) => {
          const remaining = p.plan.sessions_count - p.sessions_used;
          const pct = Math.round((p.sessions_used / p.plan.sessions_count) * 100);
          return (
            <div key={p.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm">{p.plan.name}</h3>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface2 text-ink2">
                  {TYPE_LABEL[p.plan.category]}
                </span>
              </div>
              <div className="h-2 rounded bg-surface2 overflow-hidden">
                <div className="h-full rounded" style={{ width: `${pct}%`, background: "var(--accent)" }} />
              </div>
              <div className="flex justify-between text-xs font-mono text-ink2 mt-1.5">
                <span>
                  Quedan {remaining} de {p.plan.sessions_count} sesiones
                </span>
                {p.expires_at && <span>Vence {p.expires_at.split("-").reverse().join("-")}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">
        Renovar o agregar un plan
      </h2>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="rounded-2xl border border-border bg-surface p-4 shadow-sm mb-8"
      >
        <div className="mb-3">
          <label htmlFor="planId" className="block text-xs font-semibold text-ink2 mb-1">
            Plan
          </label>
          <select
            id="planId"
            name="planId"
            required
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          >
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {money(c.price)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-surface2 p-3 text-xs leading-relaxed mb-3">
          <span className="font-display text-base block mb-1">Datos para transferencia</span>
          <b>MTOR Entrenamiento SpA</b> · RUT 76.543.210-1
          <br />
          Banco Estado · Cuenta Corriente N° 000-1234567-8
          <br />
          pagos@mtor.cl
          <br />
          Incluye tu nombre completo en el comentario de la transferencia.
        </div>

        <div className="mb-3">
          <label htmlFor="file" className="block text-xs font-semibold text-ink2 mb-1">
            Comprobante (foto o PDF)
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept="image/*,.pdf"
            required
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg py-2.5 text-sm font-bold text-accentInk disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {pending ? "Enviando…" : "Enviar comprobante"}
        </button>
      </form>

      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">
        Tus comprobantes
      </h2>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {payments.length === 0 && (
          <p className="text-sm text-ink2">No has subido comprobantes todavía.</p>
        )}
        {payments.map((p, i) => (
          <div
            key={p.id}
            className={`flex items-center justify-between gap-2 py-2.5 text-xs ${
              i < payments.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <div>
              <div>{p.plan.name}</div>
              <div className="text-ink2 mt-0.5">
                {money(p.amount)} · {p.created_at.slice(0, 10).split("-").reverse().join("-")}
              </div>
            </div>
            <span
              className="text-[10px] font-bold uppercase px-2 py-1 rounded-full"
              style={{
                background:
                  p.status === "approved"
                    ? "var(--success-bg)"
                    : p.status === "rejected"
                    ? "var(--danger-bg)"
                    : "var(--warning-bg)",
                color:
                  p.status === "approved"
                    ? "var(--success)"
                    : p.status === "rejected"
                    ? "var(--danger)"
                    : "var(--warning)",
              }}
            >
              {p.status === "approved" ? "Aprobado" : p.status === "rejected" ? "Rechazado" : "Pendiente"}
            </span>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 rounded-full bg-ink text-bg px-4 py-2.5 text-sm font-semibold shadow-lg z-50">
          {toast}
        </div>
      )}
    </section>
  );
}
