"use client";

import { useState, useTransition } from "react";
import { cancelReservation } from "@/app/actions";
import { TYPE_LABEL, type ClassCategory } from "@/lib/types";
import { addDays, chileDayKey, chileTime, dayKeyParts } from "@/lib/time";
import Toast from "@/components/Toast";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Igual que cancel_reservation (v_limite): con menos de 2 horas la sesión no vuelve al plan.
const CANCEL_LIMIT_MS = 2 * 60 * 60 * 1000;

// "Hoy", "Mañana" o "Jueves 9".
function dayLabel(startsAt: string) {
  const key = chileDayKey(startsAt);
  const today = chileDayKey(new Date());
  if (key === today) return "Hoy";
  if (key === addDays(today, 1)) return "Mañana";
  const { weekday, day } = dayKeyParts(key);
  return `${DIAS_LARGOS[weekday]} ${day}`;
}

type Row = {
  id: string;
  status: "confirmed" | "waitlisted" | "cancelled";
  session: {
    starts_at: string;
    status: string;
    changed_at: string | null;
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
  // La próxima clase confirmada va destacada arriba.
  const next = sorted.find((r) => r.status === "confirmed" && r.session.status !== "cancelled");
  const rest = sorted.filter((r) => r !== next);

  function handleCancel(id: string) {
    startTransition(async () => {
      const res = await cancelReservation(id);
      setToast(res.ok ? res.message ?? "Listo." : res.error);
      setTimeout(() => setToast(null), 3000);
    });
  }

  return (
    <section>
      <h1 className="font-display text-[34px] leading-none uppercase mt-2 mb-4">Mis reservas</h1>

      {sorted.length === 0 && (
        <p className="text-center text-sm text-ink2 py-10">
          Aún no tienes reservas. Ve a Agenda para reservar tu próxima clase.
        </p>
      )}

      {next && <NextClass r={next} pending={pending} onCancel={() => handleCancel(next.id)} />}

      {rest.length > 0 && <h2 className="label text-ink2 mt-6 mb-3">{next ? "Después" : "Próximas"}</h2>}
      <div className="flex flex-col gap-2.5">
        {rest.map((r) => {
          const { weekday, day } = dayKeyParts(chileDayKey(r.session.starts_at));
          const time = chileTime(r.session.starts_at);
          const cancelledByGym = r.session.status === "cancelled";
          return (
            <article
              key={r.id}
              className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3.5"
            >
              <div className={`w-12 text-center flex-none ${cancelledByGym ? "opacity-60" : ""}`}>
                <div className="font-display text-[22px] leading-none">{day}</div>
                <div className="text-[11px] font-semibold uppercase text-ink2 mt-0.5">{DIAS[weekday]}</div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-[15px] ${cancelledByGym ? "line-through text-ink2" : ""}`}>
                  {r.session.class_type.name} · {TYPE_LABEL[r.session.class_type.category]}
                </h3>
                {cancelledByGym ? (
                  <p className="text-[13px] font-semibold text-accentText mt-0.5">
                    El gimnasio canceló esta clase. La sesión volvió a tu plan.
                  </p>
                ) : (
                  <p className={`text-[13px] mt-0.5 ${r.status === "waitlisted" ? "text-warning font-semibold" : "text-ink2"}`}>
                    {time} · {r.session.coach?.display_name ?? "—"}
                    {r.status === "waitlisted" ? " · En lista de espera" : ""}
                  </p>
                )}
                {!cancelledByGym && r.session.changed_at && (
                  <p className="text-xs font-semibold text-warning mt-1">Cambió de horario o entrenador. Revisa los datos.</p>
                )}
              </div>
              {!cancelledByGym && (
                <button
                  disabled={pending}
                  onClick={() => handleCancel(r.id)}
                  className="flex-none h-11 px-3.5 rounded-xl bg-surface2 text-sm font-semibold text-ink"
                >
                  {r.status === "waitlisted" ? "Salir" : "Cancelar"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {toast && <Toast message={toast} />}
    </section>
  );
}

function NextClass({ r, pending, onCancel }: { r: Row; pending: boolean; onCancel: () => void }) {
  const startsAt = new Date(r.session.starts_at);
  const { day, month } = dayKeyParts(chileDayKey(startsAt));
  const deadline = new Date(startsAt.getTime() - CANCEL_LIMIT_MS);
  const canRefund = deadline.getTime() > Date.now();

  return (
    <section className="rounded-[20px] bg-accent text-white p-5 flex flex-col gap-3.5">
      <h2 className="label text-[#ffe3e3]">Tu próxima clase</h2>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[52px] leading-[0.95] tabular">{chileTime(startsAt)}</div>
          <div className="font-bold text-lg mt-1">
            {dayLabel(r.session.starts_at)} · {r.session.class_type.name}
          </div>
          <div className="text-sm text-[#ffe3e3]">
            {TYPE_LABEL[r.session.class_type.category]}
            {r.session.coach ? ` · con ${r.session.coach.display_name}` : ""}
            {r.session.room ? ` · ${r.session.room}` : ""}
          </div>
          {r.session.changed_at && (
            <div className="text-sm font-semibold mt-1">Cambió de horario o entrenador. Revisa los datos.</div>
          )}
        </div>
        <div className="hex w-16 h-[72px] flex-none bg-bg flex flex-col items-center justify-center">
          <div className="font-display text-2xl leading-none">{String(day).padStart(2, "0")}</div>
          <div className="label text-[11px] tracking-[0.1em]">{MESES[month]}</div>
        </div>
      </div>
      <div className="border-t border-white/25 pt-3 flex items-center justify-between gap-3">
        <p className="text-[13px] leading-snug">
          {canRefund
            ? `Cancela antes de las ${chileTime(deadline)} para no perder la sesión.`
            : "Faltan menos de 2 horas: si cancelas, la sesión no vuelve a tu plan."}
        </p>
        <button
          disabled={pending}
          onClick={onCancel}
          className="label text-[15px] tracking-[0.06em] flex-none h-11 px-4 rounded-xl border-[1.5px] border-white/60"
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}
