"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  approvePayment,
  rejectPayment,
  createClassType,
  updateClassType,
  deleteClassType,
  createCoach,
  updateCoach,
  deleteCoach,
  toggleCoach,
  createSession,
  updateSession,
  deleteSession,
  cancelSession,
  restoreSession,
  duplicateWeek,
  publishWeek,
  discardWeekDrafts,
  createPlan,
  updatePlan,
  deletePlan,
  togglePlan,
} from "@/app/actions";
import { TYPE_LABEL, CATEGORY_OPTIONS, type ClassCategory } from "@/lib/types";
import { addDays, chileDayKey, chileTime, dayKeyParts, mondayOf } from "@/lib/time";

function money(n: number) {
  return "$" + n.toLocaleString("es-CL");
}

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type ActionResult = { ok: boolean; message?: string; error?: string; needsConfirm?: boolean };
// La acción recibe force = true cuando el admin confirma un cambio que afecta reservas.
type Action = (force: boolean) => Promise<ActionResult>;
type RunFn = (action: Action, onOk?: () => void) => void;

type Payment = {
  id: string;
  amount: number;
  created_at: string;
  plan: { name: string };
  profile: { full_name: string };
};
type SessionRow = {
  id: string;
  starts_at: string;
  duration_minutes: number;
  capacity: number;
  room: string | null;
  status: "draft" | "scheduled" | "cancelled";
  class_type_id: string;
  coach_id: string | null;
  class_type: { name: string; category: ClassCategory };
  coach: { display_name: string } | null;
};
type ClassType = { id: string; name: string; category: ClassCategory; default_capacity: number };
type Coach = { id: string; display_name: string; active: boolean };
type PlanRow = {
  id: string;
  name: string;
  category: ClassCategory;
  sessions_count: number;
  price: number;
  duration_days: number;
  active: boolean;
};

const TABS = [
  { id: "pagos", label: "Pagos" },
  { id: "calendario", label: "Calendario" },
  { id: "config", label: "Configuración" },
  { id: "planes", label: "Planes" },
] as const;

export default function AdminClient({
  payments,
  sessions,
  bookedBySession,
  classTypes,
  coaches,
  plans,
}: {
  payments: Payment[];
  sessions: SessionRow[];
  bookedBySession: Record<string, number>;
  classTypes: ClassType[];
  coaches: Coach[];
  plans: PlanRow[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pagos");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  // Pregunta pendiente cuando un cambio afecta a personas con reserva.
  const [confirm, setConfirm] = useState<{ message: string; action: Action; onOk?: () => void } | null>(null);

  function finish(res: ActionResult, onOk?: () => void) {
    showToast(res.ok ? res.message ?? "Listo." : res.error ?? "Ocurrió un error.");
    if (res.ok) onOk?.();
  }

  const run: RunFn = (action, onOk) => {
    startTransition(async () => {
      const res = await action(false);
      if (!res.ok && res.needsConfirm) {
        setConfirm({ message: res.error ?? "¿Continuar?", action, onOk });
        return;
      }
      finish(res, onOk);
    });
  };

  function confirmYes() {
    if (!confirm) return;
    const { action, onOk } = confirm;
    setConfirm(null);
    startTransition(async () => finish(await action(true), onOk));
  }

  return (
    <section className="pb-10">
      <div className="flex gap-1 overflow-x-auto mb-5 -mt-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-none px-3 py-1.5 rounded-full text-xs font-bold border ${
              tab === t.id ? "border-transparent bg-ink text-bg" : "border-border text-ink2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pagos" && <PagosTab payments={payments} pending={pending} run={run} />}
      {tab === "calendario" && (
        <CalendarioTab
          sessions={sessions}
          bookedBySession={bookedBySession}
          classTypes={classTypes}
          coaches={coaches}
          pending={pending}
          run={run}
        />
      )}
      {tab === "config" && <ConfigTab classTypes={classTypes} coaches={coaches} pending={pending} run={run} />}
      {tab === "planes" && <PlanesTab plans={plans} pending={pending} run={run} />}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-lg">
            <p className="text-sm leading-relaxed mb-4">{confirm.message}</p>
            <div className="flex gap-2">
              <button
                onClick={confirmYes}
                className="flex-1 rounded-lg py-2.5 text-xs font-bold text-accentInk"
                style={{ background: "var(--accent)" }}
              >
                Sí, continuar
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 rounded-lg py-2.5 text-xs font-bold bg-surface2 text-ink"
              >
                No, volver
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 rounded-full bg-ink text-bg px-4 py-2.5 text-sm font-semibold shadow-lg z-50 max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </section>
  );
}

function PagosTab({ payments, pending, run }: { payments: Payment[]; pending: boolean; run: RunFn }) {
  return (
    <div>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">Pagos pendientes</h2>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
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
                {money(p.amount)} · {chileDayKey(p.created_at).split("-").reverse().join("-")}
              </div>
            </div>
            <div className="flex gap-1.5 flex-none">
              <button
                disabled={pending}
                onClick={() => run(() => approvePayment(p.id))}
                className="rounded-md px-2.5 py-1.5 text-[11px] font-bold"
                style={{ background: "var(--success-bg)", color: "var(--success)" }}
              >
                Aprobar
              </button>
              <button
                disabled={pending}
                onClick={() => run(() => rejectPayment(p.id))}
                className="rounded-md px-2.5 py-1.5 text-[11px] font-bold"
                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
              >
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Calendario semanal: el admin arma cada semana (agregar, editar, duplicar)
// y la publica cuando está lista. Lo nuevo queda como borrador.
function CalendarioTab({
  sessions,
  bookedBySession,
  classTypes,
  coaches,
  pending,
  run,
}: {
  sessions: SessionRow[];
  bookedBySession: Record<string, number>;
  classTypes: ClassType[];
  coaches: Coach[];
  pending: boolean;
  run: RunFn;
}) {
  const todayKey = chileDayKey(new Date());
  const currentMonday = mondayOf(todayKey);
  const [monday, setMonday] = useState(currentMonday);
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [weeks, setWeeks] = useState(1);

  const byDay = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    sessions.forEach((s) => {
      const key = chileDayKey(s.starts_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return map;
  }, [sessions]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekSessions = weekDays.flatMap((k) => byDay.get(k) ?? []);
  const now = Date.now();
  const drafts = weekSessions.filter((s) => s.status === "draft" && new Date(s.starts_at).getTime() > now).length;
  const published = weekSessions.filter((s) => s.status === "scheduled").length;
  const copyable = weekSessions.filter((s) => s.status !== "cancelled").length;

  const minMonday = addDays(currentMonday, -7);
  const maxMonday = addDays(currentMonday, 63);
  const weekLabel =
    monday === currentMonday
      ? "Esta semana"
      : monday === addDays(currentMonday, 7)
      ? "Próxima semana"
      : monday < currentMonday
      ? "Semana pasada"
      : "";

  function goTo(newMonday: string) {
    setMonday(newMonday);
    setAdding(null);
    setEditing(null);
    setConfirmCancel(null);
    setShowDuplicate(false);
    setConfirmDiscard(false);
  }

  function rangeLabel() {
    const a = dayKeyParts(monday);
    const b = dayKeyParts(addDays(monday, 6));
    return a.month === b.month
      ? `${a.day} al ${b.day} de ${MESES[a.month]}`
      : `${a.day} ${MESES[a.month]} al ${b.day} ${MESES[b.month]}`;
  }

  return (
    <div>
      {/* Navegación de semanas */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between gap-2">
          <button
            disabled={monday <= minMonday}
            onClick={() => goTo(addDays(monday, -7))}
            className="rounded-lg bg-surface2 px-3 py-2 text-sm font-bold disabled:opacity-30"
            aria-label="Semana anterior"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="font-display text-lg leading-tight">{rangeLabel()}</div>
            <div className="text-[11px] text-ink2">
              {weekLabel && `${weekLabel} · `}
              {published} publicadas · {drafts} borradores
            </div>
          </div>
          <button
            disabled={monday >= maxMonday}
            onClick={() => goTo(addDays(monday, 7))}
            className="rounded-lg bg-surface2 px-3 py-2 text-sm font-bold disabled:opacity-30"
            aria-label="Semana siguiente"
          >
            ›
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {drafts > 0 && (
            <button
              disabled={pending}
              onClick={() => run(() => publishWeek(monday))}
              className="flex-1 rounded-lg py-2 text-xs font-bold text-accentInk disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              Publicar semana ({drafts})
            </button>
          )}
          {copyable > 0 && (
            <button
              disabled={pending}
              onClick={() => {
                setShowDuplicate(!showDuplicate);
                setConfirmDiscard(false);
              }}
              className="flex-1 rounded-lg py-2 text-xs font-bold bg-surface2 text-ink"
            >
              Duplicar semana
            </button>
          )}
          {drafts > 0 && (
            <button
              disabled={pending}
              onClick={() => {
                setConfirmDiscard(!confirmDiscard);
                setShowDuplicate(false);
              }}
              className="rounded-lg px-3 py-2 text-xs font-bold"
              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
            >
              Descartar borradores
            </button>
          )}
        </div>

        {showDuplicate && (
          <div className="mt-3 rounded-lg bg-surface2 p-3 text-xs">
            <p className="mb-2">
              Copia las {copyable} clases de esta semana a las semanas siguientes, como borrador. Las que ya
              existan no se repiten.
            </p>
            <div className="flex gap-2">
              <select
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs"
              >
                {[1, 2, 3, 4, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "A la semana siguiente" : `A las ${n} semanas siguientes`}
                  </option>
                ))}
              </select>
              <button
                disabled={pending}
                onClick={() => run(() => duplicateWeek(monday, weeks), () => setShowDuplicate(false))}
                className="rounded-lg px-4 text-xs font-bold text-accentInk disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                Duplicar
              </button>
            </div>
          </div>
        )}

        {confirmDiscard && (
          <div className="mt-3 rounded-lg bg-surface2 p-3 text-xs">
            <p className="mb-2">¿Eliminar los {drafts} borradores de esta semana? Las clases publicadas no se tocan.</p>
            <div className="flex gap-1.5">
              <button
                disabled={pending}
                onClick={() => run(() => discardWeekDrafts(monday), () => setConfirmDiscard(false))}
                className="flex-1 rounded-md py-1.5 text-[11px] font-bold"
                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
              >
                Sí, descartar
              </button>
              <button onClick={() => setConfirmDiscard(false)} className="flex-1 rounded-md py-1.5 text-[11px] font-bold bg-surface text-ink">
                No
              </button>
            </div>
          </div>
        )}

        {weekSessions.length === 0 && (
          <p className="text-xs text-ink2 mt-3">
            Semana vacía. Agrega clases día por día, o ve a una semana anterior y usa «Duplicar semana».
          </p>
        )}
        {classTypes.length === 0 && (
          <p className="text-xs mt-3" style={{ color: "var(--warning)" }}>
            Primero crea los tipos de clase en la pestaña Configuración.
          </p>
        )}
      </div>

      {/* Días */}
      <div className="flex flex-col gap-3">
        {weekDays.map((key, idx) => {
          const list = byDay.get(key) ?? [];
          const { day } = dayKeyParts(key);
          const isPastDay = key < todayKey;
          return (
            <div key={key} className={`rounded-2xl border border-border bg-surface p-4 shadow-sm ${isPastDay ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-sm">
                  {DIAS[idx]} {day}
                  {key === todayKey && <span style={{ color: "var(--accent)" }}> · hoy</span>}
                </h3>
                {!isPastDay && classTypes.length > 0 && adding !== key && (
                  <button
                    onClick={() => {
                      setAdding(key);
                      setEditing(null);
                    }}
                    className="rounded-md px-2.5 py-1 text-[11px] font-bold bg-surface2 text-ink"
                  >
                    + Agregar
                  </button>
                )}
              </div>

              {list.length === 0 && adding !== key && <p className="text-xs text-ink2">Sin clases.</p>}

              {list.map((s, i) => {
                const booked = bookedBySession[s.id] ?? 0;
                const future = new Date(s.starts_at).getTime() > now;
                const isDraft = s.status === "draft";
                const cancelled = s.status === "cancelled";

                if (editing === s.id) {
                  return (
                    <SessionForm
                      key={s.id}
                      session={s}
                      date={key}
                      classTypes={classTypes}
                      coaches={coaches}
                      pending={pending}
                      booked={booked}
                      onSubmit={(fd) => run((force) => updateSession(s.id, fd, force), () => setEditing(null))}
                      onCancel={() => setEditing(null)}
                    />
                  );
                }

                return (
                  <div key={s.id} className={`py-2 text-xs ${i < list.length - 1 ? "border-b border-border" : ""}`}>
                    <div className={`flex items-center gap-2.5 ${cancelled ? "opacity-60" : ""}`}>
                      <time className="font-mono font-semibold w-11 flex-none tabular">{chileTime(s.starts_at)}</time>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">
                          {s.class_type.name} · {TYPE_LABEL[s.class_type.category]}
                          {isDraft && (
                            <span className="ml-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface2 text-ink2">
                              Borrador
                            </span>
                          )}
                          {cancelled && (
                            <span className="ml-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                              Cancelada
                            </span>
                          )}
                        </div>
                        <div className="text-ink2 mt-0.5">
                          {s.duration_minutes} min · {s.coach?.display_name ?? "sin entrenador"}
                          {s.room ? ` · ${s.room}` : ""} · {isDraft ? `cupo ${s.capacity}` : `${booked}/${s.capacity} cupos`}
                        </div>
                      </div>
                    </div>

                    {future && confirmCancel !== s.id && (
                      <div className="flex gap-1.5 mt-1.5 justify-end">
                        {cancelled ? (
                          <button disabled={pending} onClick={() => run(() => restoreSession(s.id))} className="rounded-md px-2.5 py-1 text-[11px] font-bold bg-surface2 text-ink">
                            Reactivar
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={pending}
                              onClick={() => {
                                setEditing(s.id);
                                setAdding(null);
                              }}
                              className="rounded-md px-2.5 py-1 text-[11px] font-bold bg-surface2 text-ink"
                            >
                              Editar
                            </button>
                            {isDraft ? (
                              <button
                                disabled={pending}
                                onClick={() => run(() => deleteSession(s.id))}
                                className="rounded-md px-2.5 py-1 text-[11px] font-bold"
                                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
                              >
                                Eliminar
                              </button>
                            ) : (
                              <button
                                disabled={pending}
                                onClick={() => setConfirmCancel(s.id)}
                                className="rounded-md px-2.5 py-1 text-[11px] font-bold"
                                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
                              >
                                Cancelar clase
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {confirmCancel === s.id && (
                      <div className="mt-2 rounded-lg bg-surface2 p-2.5">
                        <p className="text-[11px] mb-2">
                          {booked > 0
                            ? "¿Cancelar esta clase? Quienes reservaron recuperan la sesión en su plan. Avísales."
                            : "¿Cancelar esta clase?"}
                        </p>
                        <div className="flex gap-1.5">
                          <button
                            disabled={pending}
                            onClick={() => run(() => cancelSession(s.id), () => setConfirmCancel(null))}
                            className="flex-1 rounded-md py-1.5 text-[11px] font-bold"
                            style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
                          >
                            Sí, cancelar clase
                          </button>
                          <button onClick={() => setConfirmCancel(null)} className="flex-1 rounded-md py-1.5 text-[11px] font-bold bg-surface text-ink">
                            No
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {adding === key && (
                <SessionForm
                  date={key}
                  classTypes={classTypes}
                  coaches={coaches}
                  pending={pending}
                  booked={0}
                  onSubmit={(fd) => run(() => createSession(fd), () => setAdding(null))}
                  onCancel={() => setAdding(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Formulario para agregar (sin session) o editar una clase.
function SessionForm({
  session,
  date,
  classTypes,
  coaches,
  pending,
  booked,
  onSubmit,
  onCancel,
}: {
  session?: SessionRow;
  date: string;
  classTypes: ClassType[];
  coaches: Coach[];
  pending: boolean;
  booked: number;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="my-2 rounded-lg bg-surface2 p-2.5 flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <input
          name="date"
          type="date"
          required
          defaultValue={date}
          className={`flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs ${session ? "" : "hidden"}`}
        />
        <input
          name="time"
          type="time"
          required
          defaultValue={session ? chileTime(session.starts_at) : ""}
          className="flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs"
        />
        <input
          name="durationMinutes"
          type="number"
          min={15}
          step={5}
          defaultValue={session?.duration_minutes ?? 60}
          title="Duración en minutos"
          className="w-20 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs"
        />
      </div>
      <select
        name="classTypeId"
        required
        defaultValue={session?.class_type_id ?? ""}
        className="w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-xs"
      >
        <option value="" disabled>
          Tipo de clase…
        </option>
        {classTypes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({TYPE_LABEL[c.category]}) · cupo {c.default_capacity}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <select
          name="coachId"
          defaultValue={session?.coach_id ?? ""}
          className="flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs"
        >
          <option value="">Sin entrenador</option>
          {coaches
            .filter((c) => c.active || c.id === session?.coach_id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
        </select>
        <input
          name="capacity"
          type="number"
          min={1}
          defaultValue={session?.capacity ?? ""}
          placeholder="Cupo"
          title="Vacío = cupo del tipo de clase"
          className="w-20 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs"
        />
      </div>
      <input
        name="room"
        defaultValue={session?.room ?? ""}
        placeholder="Sala / lugar (opcional)"
        className="w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-xs"
      />
      {booked > 0 && (
        <p className="text-[11px] text-ink2">
          Hay {booked} persona(s) con reserva: si cambias día u hora conservan su cupo, pero avísales.
        </p>
      )}
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-md py-1.5 text-[11px] font-bold text-accentInk disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {session ? "Guardar" : "Agregar clase"}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-md py-1.5 text-[11px] font-bold bg-surface text-ink">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function RowActions({
  pending,
  onEdit,
  onDelete,
  onToggle,
  active,
}: {
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle?: () => void;
  active?: boolean;
}) {
  return (
    <div className="flex gap-1.5 flex-none">
      {onToggle && (
        <button
          disabled={pending}
          onClick={onToggle}
          className="rounded-md px-2 py-1.5 text-[11px] font-bold bg-surface2 text-ink"
        >
          {active ? "Desactivar" : "Activar"}
        </button>
      )}
      <button disabled={pending} onClick={onEdit} className="rounded-md px-2 py-1.5 text-[11px] font-bold bg-surface2 text-ink">
        Editar
      </button>
      <button
        disabled={pending}
        onClick={onDelete}
        className="rounded-md px-2 py-1.5 text-[11px] font-bold"
        style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
      >
        Eliminar
      </button>
    </div>
  );
}

function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 flex-none">
      <span className="text-[11px] text-ink2">¿Seguro?</span>
      <button onClick={onConfirm} className="rounded-md px-2 py-1.5 text-[11px] font-bold" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
        Sí, eliminar
      </button>
      <button onClick={onCancel} className="rounded-md px-2 py-1.5 text-[11px] font-bold bg-surface2 text-ink">
        Cancelar
      </button>
    </div>
  );
}

function ConfigTab({
  classTypes,
  coaches,
  pending,
  run,
}: {
  classTypes: ClassType[];
  coaches: Coach[];
  pending: boolean;
  run: RunFn;
}) {
  const classTypeFormRef = useRef<HTMLFormElement>(null);
  const coachFormRef = useRef<HTMLFormElement>(null);

  const [editingClassType, setEditingClassType] = useState<string | null>(null);
  const [confirmDeleteClassType, setConfirmDeleteClassType] = useState<string | null>(null);
  const [editingCoach, setEditingCoach] = useState<string | null>(null);
  const [confirmDeleteCoach, setConfirmDeleteCoach] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      {/* Tipos de clase */}
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">Tipos de clase</h2>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm mb-3">
          {classTypes.length === 0 && <p className="text-sm text-ink2">Sin tipos de clase todavía.</p>}
          {classTypes.map((c, i) =>
            editingClassType === c.id ? (
              <form
                key={c.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  run(() => updateClassType(c.id, fd), () => setEditingClassType(null));
                }}
                className={`py-2.5 flex flex-col gap-2 ${i < classTypes.length - 1 ? "border-b border-border" : ""}`}
              >
                <input name="name" required defaultValue={c.name} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                <div className="flex gap-2">
                  <select name="category" required defaultValue={c.category} className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs">
                    {CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input name="defaultCapacity" type="number" min={1} required defaultValue={c.default_capacity} className="w-20 rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                </div>
                <div className="flex gap-1.5">
                  <button type="submit" disabled={pending} className="flex-1 rounded-md py-1.5 text-[11px] font-bold text-accentInk" style={{ background: "var(--accent)" }}>
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditingClassType(null)} className="flex-1 rounded-md py-1.5 text-[11px] font-bold bg-surface2 text-ink">
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div key={c.id} className={`flex items-center justify-between py-2 text-xs ${i < classTypes.length - 1 ? "border-b border-border" : ""}`}>
                <div>
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-ink2"> · {TYPE_LABEL[c.category]} · cupo {c.default_capacity}</span>
                </div>
                {confirmDeleteClassType === c.id ? (
                  <ConfirmDelete
                    onConfirm={() => run(() => deleteClassType(c.id), () => setConfirmDeleteClassType(null))}
                    onCancel={() => setConfirmDeleteClassType(null)}
                  />
                ) : (
                  <RowActions
                    pending={pending}
                    onEdit={() => setEditingClassType(c.id)}
                    onDelete={() => setConfirmDeleteClassType(c.id)}
                  />
                )}
              </div>
            )
          )}
        </div>
        <form
          ref={classTypeFormRef}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => createClassType(fd), () => classTypeFormRef.current?.reset());
          }}
          className="rounded-2xl border border-border bg-surface p-4 shadow-sm flex flex-col gap-2.5"
        >
          <input name="name" required placeholder="Nombre (ej. Funcional, Spinning)" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          <div className="flex gap-2.5">
            <select name="category" required className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input name="defaultCapacity" type="number" min={1} required placeholder="Cupo" className="w-24 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          </div>
          <button disabled={pending} type="submit" className="rounded-lg py-2 text-xs font-bold text-accentInk disabled:opacity-50" style={{ background: "var(--accent)" }}>
            Agregar tipo de clase
          </button>
        </form>
      </div>

      {/* Entrenadores */}
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">Entrenadores</h2>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm mb-3">
          {coaches.length === 0 && <p className="text-sm text-ink2">Sin entrenadores todavía.</p>}
          {coaches.map((c, i) =>
            editingCoach === c.id ? (
              <form
                key={c.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  run(() => updateCoach(c.id, fd), () => setEditingCoach(null));
                }}
                className={`py-2.5 flex gap-2 ${i < coaches.length - 1 ? "border-b border-border" : ""}`}
              >
                <input name="displayName" required defaultValue={c.display_name} className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                <button type="submit" disabled={pending} className="rounded-md px-3 text-[11px] font-bold text-accentInk" style={{ background: "var(--accent)" }}>
                  Guardar
                </button>
                <button type="button" onClick={() => setEditingCoach(null)} className="rounded-md px-3 text-[11px] font-bold bg-surface2 text-ink">
                  Cancelar
                </button>
              </form>
            ) : (
              <div key={c.id} className={`flex items-center justify-between py-2 text-xs font-semibold ${i < coaches.length - 1 ? "border-b border-border" : ""} ${c.active ? "" : "opacity-50"}`}>
                {c.display_name}
                {confirmDeleteCoach === c.id ? (
                  <ConfirmDelete
                    onConfirm={() => run(() => deleteCoach(c.id), () => setConfirmDeleteCoach(null))}
                    onCancel={() => setConfirmDeleteCoach(null)}
                  />
                ) : (
                  <RowActions
                    pending={pending}
                    active={c.active}
                    onToggle={() => run(() => toggleCoach(c.id, !c.active))}
                    onEdit={() => setEditingCoach(c.id)}
                    onDelete={() => setConfirmDeleteCoach(c.id)}
                  />
                )}
              </div>
            )
          )}
        </div>
        <form
          ref={coachFormRef}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => createCoach(fd), () => coachFormRef.current?.reset());
          }}
          className="rounded-2xl border border-border bg-surface p-4 shadow-sm flex gap-2.5"
        >
          <input name="displayName" required placeholder="Nombre del entrenador" className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          <button disabled={pending} type="submit" className="rounded-lg px-4 text-xs font-bold text-accentInk disabled:opacity-50" style={{ background: "var(--accent)" }}>
            Agregar
          </button>
        </form>
      </div>

    </div>
  );
}

function PlanesTab({ plans, pending, run }: { plans: PlanRow[]; pending: boolean; run: RunFn }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2">Catálogo de planes</h2>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {plans.length === 0 && <p className="text-sm text-ink2">Sin planes todavía.</p>}
        {plans.map((p, i) =>
          editingPlan === p.id ? (
            <form
              key={p.id}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(() => updatePlan(p.id, fd), () => setEditingPlan(null));
              }}
              className={`py-2.5 flex flex-col gap-2 ${i < plans.length - 1 ? "border-b border-border" : ""}`}
            >
              <input name="name" required defaultValue={p.name} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
              <select name="category" required defaultValue={p.category} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs">
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input name="sessionsCount" type="number" min={1} required defaultValue={p.sessions_count} className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                <input name="price" type="number" min={0} required defaultValue={p.price} className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
              </div>
              <input name="durationDays" type="number" min={1} defaultValue={p.duration_days} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
              <div className="flex gap-1.5">
                <button type="submit" disabled={pending} className="flex-1 rounded-md py-1.5 text-[11px] font-bold text-accentInk" style={{ background: "var(--accent)" }}>
                  Guardar
                </button>
                <button type="button" onClick={() => setEditingPlan(null)} className="flex-1 rounded-md py-1.5 text-[11px] font-bold bg-surface2 text-ink">
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div key={p.id} className={`flex items-center justify-between gap-2 py-2.5 text-xs ${i < plans.length - 1 ? "border-b border-border" : ""} ${p.active ? "" : "opacity-50"}`}>
              <div>
                <div className="font-semibold">{p.name} · {TYPE_LABEL[p.category]}</div>
                <div className="text-ink2 mt-0.5">{p.sessions_count} sesiones · {money(p.price)} · vence a los {p.duration_days} días</div>
              </div>
              {confirmDeletePlan === p.id ? (
                <ConfirmDelete
                  onConfirm={() => run(() => deletePlan(p.id), () => setConfirmDeletePlan(null))}
                  onCancel={() => setConfirmDeletePlan(null)}
                />
              ) : (
                <RowActions
                  pending={pending}
                  active={p.active}
                  onToggle={() => run(() => togglePlan(p.id, !p.active))}
                  onEdit={() => setEditingPlan(p.id)}
                  onDelete={() => setConfirmDeletePlan(p.id)}
                />
              )}
            </div>
          )
        )}
      </div>

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => createPlan(fd), () => formRef.current?.reset());
        }}
        className="rounded-2xl border border-border bg-surface p-4 shadow-sm flex flex-col gap-2.5"
      >
        <p className="text-xs font-bold text-ink2 uppercase tracking-wide">Crear plan</p>
        <input name="name" required placeholder="Nombre (ej. Plan Funcional 8)" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
        <select name="category" required className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm">
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="flex gap-2.5">
          <input name="sessionsCount" type="number" min={1} required placeholder="N° de sesiones" className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          <input name="price" type="number" min={0} required placeholder="Precio (CLP)" className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
        </div>
        <input name="durationDays" type="number" min={1} defaultValue={30} placeholder="Vigencia en días" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
        <button disabled={pending} type="submit" className="rounded-lg py-2.5 text-xs font-bold text-accentInk disabled:opacity-50" style={{ background: "var(--accent)" }}>
          Crear plan
        </button>
      </form>
    </div>
  );
}
