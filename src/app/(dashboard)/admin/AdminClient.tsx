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
import {
  TYPE_LABEL,
  CATEGORY_OPTIONS,
  CATEGORY_SIZE,
  planItemsLabel,
  type ClassCategory,
  type PlanItem,
} from "@/lib/types";
import { addDays, chileDayKey, chileLongDate, chileTime, dayKeyParts, mondayOf } from "@/lib/time";
import { whatsappLink } from "@/lib/phone";
import Toast from "@/components/Toast";

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
type Person = {
  id: string;
  status: "confirmed" | "waitlisted";
  profile: { full_name: string; phone: string | null } | null;
};
type ClassType = { id: string; name: string; category: ClassCategory; default_capacity: number };
type Coach = { id: string; display_name: string; active: boolean };
type PlanRow = {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  active: boolean;
  items: PlanItem[];
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
  peopleBySession,
  classTypes,
  coaches,
  plans,
}: {
  payments: Payment[];
  sessions: SessionRow[];
  bookedBySession: Record<string, number>;
  peopleBySession: Record<string, Person[]>;
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
    <section>
      <h1 className="font-display text-[34px] leading-none uppercase mt-2 mb-4">Panel admin</h1>
      <div className="flex gap-2 overflow-x-auto mb-5 -mx-5 px-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex-none flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] ${
              tab === t.id ? "bg-ink text-bg font-bold" : "border border-border text-ink font-semibold"
            }`}
          >
            {t.label}
            {t.id === "pagos" && payments.length > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accentInk text-[11px] font-bold inline-flex items-center justify-center">
                {payments.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "pagos" && <PagosTab payments={payments} pending={pending} run={run} />}
      {tab === "calendario" && (
        <CalendarioTab
          sessions={sessions}
          bookedBySession={bookedBySession}
          peopleBySession={peopleBySession}
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

      {toast && <Toast message={toast} />}
    </section>
  );
}

function PagosTab({ payments, pending, run }: { payments: Payment[]; pending: boolean; run: RunFn }) {
  return (
    <div>
      <h2 className="label text-ink2 mb-3">Pagos pendientes</h2>
      <div className="rounded-2xl border border-border bg-surface p-4">
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
  peopleBySession,
  classTypes,
  coaches,
  pending,
  run,
}: {
  sessions: SessionRow[];
  bookedBySession: Record<string, number>;
  peopleBySession: Record<string, Person[]>;
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
  const [showPeople, setShowPeople] = useState<string | null>(null);
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
    setShowPeople(null);
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
      <div className="rounded-2xl border border-border bg-surface p-4 mb-4">
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
            <div key={key} className={`rounded-2xl border border-border bg-surface p-4 ${isPastDay ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-sm">
                  {DIAS[idx]} {day}
                  {key === todayKey && <span className="text-accentText"> · hoy</span>}
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
                const people = peopleBySession[s.id] ?? [];

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
                      <time className="font-display text-lg leading-none w-12 flex-none tabular">{chileTime(s.starts_at)}</time>
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
                          {overbook(s) > 0 && ` (+${overbook(s)} sobrecupo)`}
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
                            {people.length > 0 && (
                              <button
                                onClick={() => setShowPeople(showPeople === s.id ? null : s.id)}
                                className="rounded-md px-2.5 py-1 text-[11px] font-bold bg-surface2 text-ink"
                              >
                                Reservas ({people.length})
                              </button>
                            )}
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

                    {showPeople === s.id && !cancelled && <PeopleList session={s} people={people} />}

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

// Quiénes reservaron una clase, con un botón para recordarles por WhatsApp.
function PeopleList({ session, people }: { session: SessionRow; people: Person[] }) {
  function reminderText(fullName: string) {
    const name = fullName.trim().split(/\s+/)[0];
    return (
      `Hola ${name}, te recordamos tu clase de ${session.class_type.name} el ` +
      `${chileLongDate(session.starts_at)} a las ${chileTime(session.starts_at)} en MTOR. ` +
      "Si no puedes venir, cancela desde la app con al menos 2 horas de anticipación para no perder la sesión. ¡Te esperamos!"
    );
  }

  return (
    <div className="mt-2 rounded-lg bg-surface2 p-2.5 flex flex-col gap-2">
      {people.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate">{p.profile?.full_name ?? "—"}</div>
            <div className="text-[11px] text-ink2">
              {p.status === "waitlisted" ? "Lista de espera" : p.profile?.phone ?? "Sin teléfono"}
            </div>
          </div>
          {p.status === "confirmed" && p.profile?.phone && (
            <a
              href={whatsappLink(p.profile.phone, reminderText(p.profile.full_name))}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-none flex items-center gap-1.5 min-h-[40px] rounded-lg px-3 text-[13px] font-bold"
              style={{ background: "var(--whatsapp)", color: "var(--whatsapp-ink)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.3A8.5 8.5 0 1 1 21 11.5z" />
              </svg>
              Recordar
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// Lugares extra sobre el cupo fijo de una clase 1:1, 2:1…
function overbook(s: SessionRow) {
  const size = CATEGORY_SIZE[s.class_type.category];
  return size ? Math.max(0, s.capacity - size) : 0;
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
  const [classTypeId, setClassTypeId] = useState(session?.class_type_id ?? "");
  const classType = classTypes.find((c) => c.id === classTypeId);
  // En 1:1, 2:1… el cupo es fijo y solo se agrega sobrecupo; en grupal se edita libre.
  const size = classType ? CATEGORY_SIZE[classType.category] : null;
  const [extra, setExtra] = useState(() =>
    session && size ? Math.max(0, session.capacity - size) : 0
  );
  const inputCls = "w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-xs";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="my-2 rounded-lg bg-surface2 p-2.5 flex flex-col gap-2"
    >
      <div className="flex gap-2">
        {session ? (
          <Field label="Día">
            <input name="date" type="date" required defaultValue={date} className={inputCls} />
          </Field>
        ) : (
          <input name="date" type="hidden" value={date} />
        )}
        <Field label="Hora de inicio">
          <input
            name="time"
            type="time"
            required
            defaultValue={session ? chileTime(session.starts_at) : ""}
            className={inputCls}
          />
        </Field>
        <Field label="Duración (min)">
          <input
            name="durationMinutes"
            type="number"
            min={15}
            step={5}
            defaultValue={session?.duration_minutes ?? 60}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Tipo de clase">
        <select
          name="classTypeId"
          required
          value={classTypeId}
          onChange={(e) => {
            setClassTypeId(e.target.value);
            setExtra(0);
          }}
          className={inputCls}
        >
          <option value="" disabled>
            Elegir…
          </option>
          {classTypes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({TYPE_LABEL[c.category]})
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2">
        <Field label="Entrenador">
          <select name="coachId" defaultValue={session?.coach_id ?? ""} className={inputCls}>
            <option value="">Sin entrenador</option>
            {coaches
              .filter((c) => c.active || c.id === session?.coach_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
          </select>
        </Field>
        {size ? (
          <>
            <Field label={`Cupo ${TYPE_LABEL[classType!.category]}`}>
              <div className="py-1.5 text-xs font-semibold">{size + extra}</div>
            </Field>
            <Field label="Sobrecupo">
              <input
                type="number"
                min={0}
                max={10}
                value={extra}
                onChange={(e) => setExtra(Math.max(0, Number(e.target.value) || 0))}
                className={inputCls}
              />
            </Field>
            <input type="hidden" name="capacity" value={size + extra} />
          </>
        ) : (
          <Field label="Cupo">
            <input
              key={classTypeId}
              name="capacity"
              type="number"
              min={1}
              defaultValue={session && session.class_type_id === classTypeId ? session.capacity : classType?.default_capacity ?? ""}
              className={inputCls}
            />
          </Field>
        )}
      </div>

      <Field label="Sala / lugar (opcional)">
        <input name="room" defaultValue={session?.room ?? ""} className={inputCls} />
      </Field>

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

// Categoría y cupo de un tipo de clase: en 1:1, 2:1… el cupo es fijo.
function CategoryCapacityFields({
  category,
  capacity,
  small,
}: {
  category?: ClassCategory;
  capacity?: number;
  small?: boolean;
}) {
  const [cat, setCat] = useState<ClassCategory>(category ?? "grupal");
  const size = CATEGORY_SIZE[cat];
  const cls = `w-full rounded-lg border border-border bg-bg px-3 py-2 ${small ? "text-xs" : "text-sm"}`;
  return (
    <div className="flex gap-2.5">
      <Field label="Categoría">
        <select name="category" required value={cat} onChange={(e) => setCat(e.target.value as ClassCategory)} className={cls}>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      {size ? (
        <Field label="Cupo">
          <div className={`py-2 font-semibold ${small ? "text-xs" : "text-sm"}`}>{size} (fijo)</div>
          <input type="hidden" name="defaultCapacity" value={size} />
        </Field>
      ) : (
        <Field label="Cupo por defecto">
          <input name="defaultCapacity" type="number" min={1} required defaultValue={capacity} placeholder="ej. 12" className={cls} />
        </Field>
      )}
    </div>
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
        <h2 className="label text-ink2 mb-3">Tipos de clase</h2>
        <div className="rounded-2xl border border-border bg-surface p-4 mb-3">
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
                <Field label="Nombre">
                  <input name="name" required defaultValue={c.name} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                </Field>
                <CategoryCapacityFields category={c.category} capacity={c.default_capacity} small />
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
          className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-2.5"
        >
          <Field label="Nombre">
            <input name="name" required placeholder="ej. Funcional, Spinning, Entrenamiento personalizado" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          </Field>
          <CategoryCapacityFields />
          <button disabled={pending} type="submit" className="rounded-lg py-2 text-xs font-bold text-accentInk disabled:opacity-50" style={{ background: "var(--accent)" }}>
            Agregar tipo de clase
          </button>
        </form>
      </div>

      {/* Entrenadores */}
      <div>
        <h2 className="label text-ink2 mb-3">Entrenadores</h2>
        <div className="rounded-2xl border border-border bg-surface p-4 mb-3">
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
          className="rounded-2xl border border-border bg-surface p-4 flex gap-2.5"
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

// Etiqueta visible sobre un campo (los placeholders desaparecen cuando el campo ya trae un valor).
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex-1 flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-ink2">{label}</span>
      {children}
    </label>
  );
}

// Cuántas sesiones de cada categoría incluye el plan (vacío = no incluye).
function PlanItemsFields({ items, small }: { items?: PlanItem[]; small?: boolean }) {
  const cls = `w-full rounded-lg border border-border bg-bg px-3 py-2 ${small ? "text-xs" : "text-sm"}`;
  return (
    <fieldset className="rounded-lg border border-border p-2.5">
      <legend className="px-1 text-[11px] font-semibold text-ink2">
        Sesiones que incluye (deja vacío lo que no incluye)
      </legend>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {CATEGORY_OPTIONS.map((o) => (
          <Field key={o.value} label={o.value === "grupal" ? "Grupales" : o.label}>
            <input
              name={`items_${o.value}`}
              type="number"
              min={0}
              defaultValue={items?.find((i) => i.category === o.value)?.sessions_count ?? ""}
              placeholder="0"
              className={cls}
            />
          </Field>
        ))}
      </div>
    </fieldset>
  );
}

function PlanesTab({ plans, pending, run }: { plans: PlanRow[]; pending: boolean; run: RunFn }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="label text-ink2">Catálogo de planes</h2>
      <div className="rounded-2xl border border-border bg-surface p-4">
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
              <Field label="Nombre">
                <input name="name" required defaultValue={p.name} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
              </Field>
              <PlanItemsFields items={p.items} small />
              <div className="flex gap-2">
                <Field label="Precio (CLP)">
                  <input name="price" type="number" min={0} required defaultValue={p.price} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                </Field>
                <Field label="Vigencia (días)">
                  <input name="durationDays" type="number" min={1} defaultValue={p.duration_days} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                </Field>
              </div>
              <p className="text-[11px] text-ink2">
                Los cambios aplican a las próximas compras; quienes ya compraron este plan conservan lo que pagaron.
              </p>
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
                <div className="font-semibold">{p.name}</div>
                <div className="text-ink2 mt-0.5">
                  {planItemsLabel(p.items)} · {money(p.price)} · vigencia {p.duration_days} días
                </div>
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
        className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-2.5"
      >
        <p className="text-xs font-bold text-ink2 uppercase tracking-wide">Crear plan</p>
        <Field label="Nombre">
          <input name="name" required placeholder="ej. Plan Mixto 8 + 4" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
        </Field>
        <PlanItemsFields />
        <div className="flex gap-2.5">
          <Field label="Precio (CLP)">
            <input name="price" type="number" min={0} required placeholder="ej. 45000" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          </Field>
          <Field label="Vigencia (días desde que se aprueba el pago)">
            <input name="durationDays" type="number" min={1} defaultValue={30} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          </Field>
        </div>
        <button disabled={pending} type="submit" className="rounded-lg py-2.5 text-xs font-bold text-accentInk disabled:opacity-50" style={{ background: "var(--accent)" }}>
          Crear plan
        </button>
      </form>
    </div>
  );
}
