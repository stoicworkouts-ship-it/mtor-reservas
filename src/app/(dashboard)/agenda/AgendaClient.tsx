"use client";

import { useMemo, useState, useTransition } from "react";
import { reserveSession, cancelReservation } from "@/app/actions";
import { TYPE_LABEL, TYPE_VAR, CATEGORY_OPTIONS, type ClassCategory } from "@/lib/types";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type SessionRow = {
  id: string;
  starts_at: string;
  room: string | null;
  capacity: number;
  class_type: { name: string; category: ClassCategory };
  coach: { display_name: string } | null;
};

type ReservationRow = { id: string; session_id: string; status: "confirmed" | "waitlisted" };

type UserPlanRow = {
  id: string;
  sessions_used: number;
  plan: { name: string; category: ClassCategory; sessions_count: number };
};

export default function AgendaClient({
  sessions,
  reservations,
  bookedBySession,
  userPlans,
}: {
  sessions: SessionRow[];
  reservations: ReservationRow[];
  bookedBySession: Record<string, number>;
  userPlans: UserPlanRow[];
}) {
  const [filter, setFilter] = useState<"todos" | ClassCategory>("todos");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const days = useMemo(() => {
    const map = new Map<string, { date: Date; items: SessionRow[] }>();
    sessions.forEach((s) => {
      const d = new Date(s.starts_at);
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { date: d, items: [] });
      map.get(key)!.items.push(s);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 14);
  }, [sessions]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeKey = selectedKey ?? days[0]?.[0] ?? null;
  const activeDay = days.find(([key]) => key === activeKey);

  function reservationFor(sessionId: string) {
    return reservations.find((r) => r.session_id === sessionId);
  }
  function planFor(category: ClassCategory) {
    return userPlans.find((p) => p.plan.category === category);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleReserve(sessionId: string, category: ClassCategory) {
    startTransition(async () => {
      const res = await reserveSession(sessionId, category);
      showToast(res.ok ? res.message ?? "Listo." : res.error);
    });
  }

  function handleCancel(reservationId: string) {
    startTransition(async () => {
      const res = await cancelReservation(reservationId);
      showToast(res.ok ? res.message ?? "Listo." : res.error);
    });
  }

  const items = (activeDay?.[1].items ?? []).filter(
    (s) => filter === "todos" || s.class_type.category === filter
  );

  return (
    <section className="pb-10">
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
        {days.map(([key, { date, items }]) => {
          const active = key === activeKey;
          const isToday = key === new Date().toISOString().slice(0, 10);
          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className={`flex-none min-w-[58px] rounded-xl border px-2 py-2 text-center ${
                active ? "border-accent" : "border-border"
              }`}
              style={active ? { background: "color-mix(in srgb, var(--accent) 12%, var(--surface))" } : { background: "var(--surface)" }}
            >
              <div className="text-[10px] uppercase tracking-wide text-ink2">
                {DIAS[date.getDay()]}
              </div>
              <div className="font-display text-lg leading-tight">
                {date.getDate()}
                {isToday && <span style={{ color: "var(--accent)" }}> ·</span>}
              </div>
              <div className="text-[9.5px] font-mono text-ink2">{items.length} bloques</div>
            </button>
          );
        })}
        {days.length === 0 && (
          <p className="text-sm text-ink2 py-4">
            Todavía no hay sesiones agendadas. Pide al administrador que genere el horario.
          </p>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto mb-4">
        {(["todos", ...CATEGORY_OPTIONS.map((o) => o.value)] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-none flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filter === f ? "border-transparent bg-ink text-bg" : "border-border text-ink2"
            }`}
          >
            {f !== "todos" && (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: filter === f ? "var(--bg)" : TYPE_VAR[f] }}
              />
            )}
            {f === "todos" ? "Todos" : TYPE_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {items.length === 0 && days.length > 0 && (
          <p className="text-center text-sm text-ink2 py-10">No hay bloques de este tipo este día.</p>
        )}
        {items.map((s) => {
          const booked = bookedBySession[s.id] ?? 0;
          const pct = Math.round((booked / s.capacity) * 100);
          const full = booked >= s.capacity;
          const mine = reservationFor(s.id);
          const plan = planFor(s.class_type.category);
          const remaining = plan ? plan.plan.sessions_count - plan.sessions_used : 0;
          const time = new Date(s.starts_at).toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
          });

          let barColor = "var(--success)";
          if (pct >= 100) barColor = "var(--danger)";
          else if (pct >= 70) barColor = "var(--warning)";

          return (
            <div key={s.id} className="flex gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
              <div className="w-1 rounded-full flex-none" style={{ background: TYPE_VAR[s.class_type.category] }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <time className="font-mono font-semibold text-sm tabular">{time}</time>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{
                      background: "color-mix(in srgb, " + TYPE_VAR[s.class_type.category] + " 18%, transparent)",
                      color: TYPE_VAR[s.class_type.category],
                    }}
                  >
                    {TYPE_LABEL[s.class_type.category]}
                  </span>
                </div>
                <h3 className="font-bold text-[15px] mt-1">{s.class_type.name}</h3>
                <p className="text-xs text-ink2 mt-0.5">
                  {s.coach?.display_name ?? "—"} {s.room ? `· ${s.room}` : ""}
                </p>
                <div className="flex items-center gap-2.5 mt-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="h-[5px] rounded bg-surface2 overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <p className="text-[10.5px] font-mono text-ink2 mt-0.5 tabular">
                      {booked} / {s.capacity} cupos
                    </p>
                  </div>

                  {mine ? (
                    <button
                      disabled={pending}
                      onClick={() => handleCancel(mine.id)}
                      className="flex-none rounded-lg px-3 py-2 text-xs font-bold"
                      style={{ background: "var(--success-bg)", color: "var(--success)" }}
                    >
                      {mine.status === "waitlisted" ? "En espera · Cancelar" : "Reservado · Cancelar"}
                    </button>
                  ) : !plan ? (
                    <span className="flex-none rounded-lg px-3 py-2 text-xs font-bold bg-surface2 text-ink2">
                      Sin plan
                    </span>
                  ) : remaining <= 0 ? (
                    <span className="flex-none rounded-lg px-3 py-2 text-xs font-bold bg-surface2 text-ink2">
                      Sin sesiones
                    </span>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() => handleReserve(s.id, s.class_type.category)}
                      className="flex-none rounded-lg px-3 py-2 text-xs font-bold text-accentInk"
                      style={{ background: "var(--accent)" }}
                    >
                      {full ? "Lista de espera" : "Reservar"}
                    </button>
                  )}
                </div>
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
