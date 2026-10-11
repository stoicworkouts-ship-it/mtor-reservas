"use client";

import { useMemo, useState, useTransition } from "react";
import { reserveSession, cancelReservation } from "@/app/actions";
import { TYPE_LABEL, TYPE_VAR, CATEGORY_OPTIONS, type ClassCategory, type UserPlanItem } from "@/lib/types";
import { chileDayKey, chileTime, dayKeyParts } from "@/lib/time";
import Toast from "@/components/Toast";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

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
  items: UserPlanItem[];
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
    const map = new Map<string, { items: SessionRow[] }>();
    sessions.forEach((s) => {
      const key = chileDayKey(s.starts_at);
      if (!map.has(key)) map.set(key, { items: [] });
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
  // Sesiones que le quedan al usuario en esa categoría sumando todos sus planes,
  // o null si ningún plan incluye esa categoría.
  function remainingFor(category: ClassCategory) {
    const items = userPlans.flatMap((p) => p.items).filter((i) => i.category === category);
    if (items.length === 0) return null;
    return items.reduce((sum, i) => sum + i.sessions_total - i.sessions_used, 0);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleReserve(sessionId: string) {
    startTransition(async () => {
      const res = await reserveSession(sessionId);
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
    <section>
      <h1 className="font-display text-[34px] leading-none uppercase mt-2 mb-4">Agenda</h1>

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-5 px-5">
        {days.map(([key]) => {
          const active = key === activeKey;
          const isToday = key === chileDayKey(new Date());
          const { weekday, day } = dayKeyParts(key);
          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              aria-pressed={active}
              className={`flex-none w-[54px] h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 ${
                active ? "bg-accent text-accentInk" : "border border-border bg-surface text-ink2"
              }`}
            >
              <span className="text-[11px] font-semibold uppercase">{isToday ? "Hoy" : DIAS[weekday]}</span>
              <span className={`font-display text-xl leading-none ${active ? "" : "text-ink"}`}>{day}</span>
            </button>
          );
        })}
        {days.length === 0 && (
          <p className="text-sm text-ink2 py-4">
            Todavía no hay clases publicadas. Vuelve a revisar pronto.
          </p>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto mb-4 -mx-5 px-5">
        {(["todos", ...CATEGORY_OPTIONS.map((o) => o.value)] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`flex-none flex items-center gap-1.5 h-9 rounded-full px-3.5 text-[13px] ${
              filter === f ? "bg-ink text-bg font-bold" : "border border-border text-ink font-semibold"
            }`}
          >
            {f !== "todos" && (
              <span className="w-2 h-2 rounded-full" style={{ background: filter === f ? "var(--bg)" : TYPE_VAR[f] }} />
            )}
            {f === "todos" ? "Todas" : TYPE_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {items.length === 0 && days.length > 0 && (
          <p className="text-center text-sm text-ink2 py-10">No hay clases de este tipo este día.</p>
        )}
        {items.map((s) => {
          const booked = bookedBySession[s.id] ?? 0;
          const pct = Math.round((booked / s.capacity) * 100);
          const full = booked >= s.capacity;
          const left = s.capacity - booked;
          const mine = reservationFor(s.id);
          const remaining = remainingFor(s.class_type.category);
          const time = chileTime(s.starts_at);

          return (
            <article key={s.id} className="rounded-2xl border border-border bg-surface px-4 py-3.5 flex flex-col gap-3">
              <div className="flex gap-3.5 items-start">
                <time className="font-display text-[28px] leading-none w-[72px] flex-none tabular">{time}</time>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base">{s.class_type.name}</h3>
                  <p className="text-[13px] text-ink2 mt-0.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-none" style={{ background: TYPE_VAR[s.class_type.category] }} />
                    <span className="truncate">
                      {TYPE_LABEL[s.class_type.category]} · {s.coach?.display_name ?? "—"}
                      {s.room ? ` · ${s.room}` : ""}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="h-[5px] rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(pct, 100)}%`, background: full ? "var(--accent-text)" : "var(--text)" }}
                    />
                  </div>
                  <p className={`text-xs mt-1.5 tabular ${full ? "text-accentText font-semibold" : "text-ink2"}`}>
                    {full ? "Llena" : left === 1 ? "Queda 1 cupo" : `${booked} de ${s.capacity} cupos`}
                  </p>
                </div>

                {mine ? (
                  <button
                    disabled={pending}
                    onClick={() => handleCancel(mine.id)}
                    title="Toca para cancelar"
                    className={`label text-[15px] tracking-[0.06em] flex-none h-11 px-4 rounded-xl flex items-center gap-1.5 ${
                      mine.status === "waitlisted" ? "bg-warningBg text-warning" : "bg-successBg text-success"
                    }`}
                  >
                    {mine.status === "confirmed" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                    {mine.status === "waitlisted" ? "En espera" : "Reservada"}
                  </button>
                ) : remaining === null ? (
                  <span className="flex-none h-11 px-3.5 rounded-xl flex items-center text-[13px] font-semibold bg-surface2 text-ink2">
                    Sin plan
                  </span>
                ) : remaining <= 0 ? (
                  <span className="flex-none h-11 px-3.5 rounded-xl flex items-center text-[13px] font-semibold bg-surface2 text-ink2">
                    Sin sesiones
                  </span>
                ) : full ? (
                  <button
                    disabled={pending}
                    onClick={() => handleReserve(s.id)}
                    className="label text-[15px] tracking-[0.06em] flex-none h-11 px-3.5 rounded-xl border-[1.5px] border-borderStrong text-ink"
                  >
                    Lista de espera
                  </button>
                ) : (
                  <button
                    disabled={pending}
                    onClick={() => handleReserve(s.id)}
                    className="label text-[15px] tracking-[0.08em] flex-none h-11 px-5 rounded-xl bg-accent text-accentInk"
                  >
                    Reservar
                  </button>
                )}
              </div>
              {mine && (
                <p className="text-xs text-ink2 -mt-1">Para cancelar, toca el botón o ve a Mis reservas.</p>
              )}
            </article>
          );
        })}
      </div>

      {toast && <Toast message={toast} />}
    </section>
  );
}
