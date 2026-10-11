"use client";

import { useRef, useState, useTransition } from "react";
import { uploadPayment } from "@/app/actions";
import { TYPE_LABEL, TYPE_VAR, planItemsLabel, type PlanItem, type UserPlanItem } from "@/lib/types";
import { chileDayKey, dayKeyParts } from "@/lib/time";
import Toast from "@/components/Toast";

type UserPlan = {
  id: string;
  expires_at: string | null;
  plan: { name: string };
  items: UserPlanItem[];
};
type CatalogPlan = {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  items: PlanItem[];
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

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Días que quedan hasta el vencimiento ("YYYY-MM-DD", último día válido incluido).
function daysLeft(expiresAt: string) {
  const today = chileDayKey(new Date());
  return Math.round((Date.parse(expiresAt) - Date.parse(today)) / 86400000) + 1;
}

// Las tres estrellas del logo: cuánto del plan se ha usado.
function Stars({ used, total }: { used: number; total: number }) {
  const filled = total > 0 ? Math.min(3, Math.ceil((used / total) * 3)) : 0;
  return (
    <div className="flex gap-[3px] pt-1" role="img" aria-label={`Has usado ${used} de ${total} sesiones`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill={i < filled ? "var(--accent)" : "var(--border-strong)"} aria-hidden="true">
          <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" />
        </svg>
      ))}
    </div>
  );
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

  const inputClass = "w-full h-12 rounded-xl border border-border bg-bg px-3.5 text-[15px] text-ink";

  return (
    <section>
      <h1 className="font-display text-[34px] leading-none uppercase mt-2 mb-4">Mi plan</h1>

      {userPlans.length === 0 && (
        <div className="rounded-[20px] border border-border bg-surface p-5 mb-4">
          <p className="font-bold">No tienes un plan activo.</p>
          <p className="text-sm text-ink2 mt-1">
            Elige uno abajo y sube el comprobante de transferencia para empezar a reservar.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-3 mb-4">
        {userPlans.map((p) => {
          const used = p.items.reduce((sum, it) => sum + it.sessions_used, 0);
          const total = p.items.reduce((sum, it) => sum + it.sessions_total, 0);
          const expires = p.expires_at ? dayKeyParts(p.expires_at) : null;
          const left = p.expires_at ? daysLeft(p.expires_at) : null;
          return (
            <article key={p.id} className="rounded-[20px] border border-border bg-surface p-5 flex flex-col gap-[18px]">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="label text-success">Activo</div>
                  <h2 className="font-display text-[26px] leading-tight uppercase">{p.plan.name}</h2>
                  {expires && left !== null && (
                    <p className="text-[13px] text-ink2">
                      Vence el {expires.day} de {MESES_LARGOS[expires.month]} ·{" "}
                      {left <= 1 ? "último día" : `quedan ${left} días`}
                    </p>
                  )}
                </div>
                <Stars used={used} total={total} />
              </div>

              {/* Un contador por cada tipo de clase que incluye el plan */}
              {p.items.map((it) => {
                const remaining = it.sessions_total - it.sessions_used;
                const pct = Math.round((it.sessions_used / it.sessions_total) * 100);
                return (
                  <div key={it.category} className="flex flex-col gap-2">
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="font-semibold text-[15px] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: TYPE_VAR[it.category] }} />
                        {it.category === "grupal" ? "Clases grupales" : `Sesiones ${TYPE_LABEL[it.category]}`}
                      </span>
                      <span className="text-sm text-ink2">
                        <b className="font-display font-normal text-2xl text-ink">{remaining}</b> de {it.sessions_total}{" "}
                        disponibles
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TYPE_VAR[it.category] }} />
                    </div>
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="rounded-[20px] border border-border bg-surface p-5 flex flex-col gap-3.5 mb-4"
      >
        <h2 className="label text-ink2">Renovar o agregar un plan</h2>
        <div>
          <label htmlFor="planId" className="label block text-[12px] text-ink2 mb-1.5">
            Plan
          </label>
          <select id="planId" name="planId" required className={inputClass}>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}: {planItemsLabel(c.items)} · {money(c.price)} · {c.duration_days} días
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-surface2 p-3.5 text-[13px] leading-relaxed">
          <span className="label block text-ink mb-1">Datos para transferencia</span>
          <b>MTOR Entrenamiento SpA</b> · RUT 76.543.210-1
          <br />
          Banco Estado · Cuenta Corriente N° 000-1234567-8
          <br />
          pagos@mtor.cl
          <br />
          Incluye tu nombre completo en el comentario de la transferencia.
        </div>

        <div>
          <label htmlFor="file" className="label block text-[12px] text-ink2 mb-1.5">
            Comprobante (foto o PDF)
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept="image/*,.pdf"
            required
            className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-ink file:font-semibold"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="label text-[17px] tracking-[0.08em] h-[52px] rounded-xl bg-accent text-accentInk flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V4M6 10l6-6 6 6" />
            <path d="M4 20h16" />
          </svg>
          {pending ? "Enviando…" : "Subir comprobante"}
        </button>
        <p className="text-xs text-ink2 text-center -mt-1">El admin revisa la transferencia y activa tu plan.</p>
      </form>

      <div className="rounded-[20px] border border-border bg-surface p-5">
        <h2 className="label text-ink2 mb-2">Tus comprobantes</h2>
        {payments.length === 0 && <p className="text-sm text-ink2">No has subido comprobantes todavía.</p>}
        {payments.map((p, i) => (
          <div
            key={p.id}
            className={`flex items-center justify-between gap-2 py-3 text-sm ${
              i < payments.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <div>
              <div className="font-semibold">{p.plan.name}</div>
              <div className="text-[13px] text-ink2 mt-0.5">
                {money(p.amount)} · {chileDayKey(p.created_at).split("-").reverse().join("-")}
              </div>
            </div>
            <span
              className={`label text-[11px] tracking-[0.1em] px-2.5 py-1 rounded-full ${
                p.status === "approved"
                  ? "bg-successBg text-success"
                  : p.status === "rejected"
                  ? "bg-dangerBg text-danger"
                  : "bg-warningBg text-warning"
              }`}
            >
              {p.status === "approved" ? "Aprobado" : p.status === "rejected" ? "Rechazado" : "Pendiente"}
            </span>
          </div>
        ))}
      </div>

      {toast && <Toast message={toast} />}
    </section>
  );
}
