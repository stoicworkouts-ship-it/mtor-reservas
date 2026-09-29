"use client";

import { useRef, useState, useTransition } from "react";
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
  createScheduleTemplate,
  updateScheduleTemplate,
  toggleScheduleTemplate,
  deleteScheduleTemplate,
  generateSessionsNow,
  createPlan,
  updatePlan,
  deletePlan,
  togglePlan,
} from "@/app/actions";
import { TYPE_LABEL, CATEGORY_OPTIONS, type ClassCategory } from "@/lib/types";

function money(n: number) {
  return "$" + n.toLocaleString("es-CL");
}

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type ActionResult = { ok: boolean; message?: string; error?: string };
type RunFn = (action: () => Promise<ActionResult>, onOk?: () => void) => void;

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
type ClassType = { id: string; name: string; category: ClassCategory; default_capacity: number };
type Coach = { id: string; display_name: string; active: boolean };
type ScheduleTemplate = {
  id: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  room: string | null;
  capacity: number;
  active: boolean;
  class_type: { name: string; category: ClassCategory };
  coach: { display_name: string } | null;
  class_type_id?: string;
  coach_id?: string | null;
};
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
  { id: "horario", label: "Horario" },
  { id: "planes", label: "Planes" },
  { id: "ocupacion", label: "Ocupación" },
] as const;

export default function AdminClient({
  payments,
  todaySessions,
  bookedBySession,
  classTypes,
  coaches,
  scheduleTemplates,
  plans,
}: {
  payments: Payment[];
  todaySessions: TodaySession[];
  bookedBySession: Record<string, number>;
  classTypes: ClassType[];
  coaches: Coach[];
  scheduleTemplates: ScheduleTemplate[];
  plans: PlanRow[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pagos");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  const run: RunFn = (action, onOk) => {
    startTransition(async () => {
      const res = await action();
      showToast(res.ok ? res.message ?? "Listo." : res.error ?? "Ocurrió un error.");
      if (res.ok) onOk?.();
    });
  };

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
      {tab === "horario" && (
        <HorarioTab
          classTypes={classTypes}
          coaches={coaches}
          scheduleTemplates={scheduleTemplates}
          pending={pending}
          run={run}
        />
      )}
      {tab === "planes" && <PlanesTab plans={plans} pending={pending} run={run} />}
      {tab === "ocupacion" && (
        <OcupacionTab todaySessions={todaySessions} bookedBySession={bookedBySession} />
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
                {money(p.amount)} · {p.created_at.slice(0, 10).split("-").reverse().join("-")}
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

function OcupacionTab({
  todaySessions,
  bookedBySession,
}: {
  todaySessions: TodaySession[];
  bookedBySession: Record<string, number>;
}) {
  return (
    <div>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">Ocupación de hoy</h2>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {todaySessions.length === 0 && <p className="text-sm text-ink2">No hay bloques agendados para hoy.</p>}
        {todaySessions.map((s, i) => {
          const booked = bookedBySession[s.id] ?? 0;
          const pct = Math.round((booked / s.capacity) * 100);
          let barColor = "var(--success)";
          if (pct >= 100) barColor = "var(--danger)";
          else if (pct >= 70) barColor = "var(--warning)";
          const time = new Date(s.starts_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
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

function HorarioTab({
  classTypes,
  coaches,
  scheduleTemplates,
  pending,
  run,
}: {
  classTypes: ClassType[];
  coaches: Coach[];
  scheduleTemplates: ScheduleTemplate[];
  pending: boolean;
  run: RunFn;
}) {
  const classTypeFormRef = useRef<HTMLFormElement>(null);
  const coachFormRef = useRef<HTMLFormElement>(null);
  const blockFormRef = useRef<HTMLFormElement>(null);

  const [editingClassType, setEditingClassType] = useState<string | null>(null);
  const [confirmDeleteClassType, setConfirmDeleteClassType] = useState<string | null>(null);
  const [editingCoach, setEditingCoach] = useState<string | null>(null);
  const [confirmDeleteCoach, setConfirmDeleteCoach] = useState<string | null>(null);
  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState<string | null>(null);

  const byDay: ScheduleTemplate[][] = [[], [], [], [], [], [], []];
  scheduleTemplates.forEach((s) => byDay[s.weekday].push(s));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">Generar calendario</h2>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs text-ink2 mb-3">
            El horario de abajo corre solo cada lunes. Si acabas de cambiar algo, usa este botón para
            que los cambios aparezcan de inmediato en la agenda (genera las próximas 3 semanas).
          </p>
          <button
            disabled={pending}
            onClick={() => run(() => generateSessionsNow())}
            className="w-full rounded-lg py-2.5 text-sm font-bold text-accentInk disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            Actualizar calendario ahora
          </button>
        </div>
      </div>

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

      {/* Horario semanal */}
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink2 mb-3">Horario semanal</h2>
        <div className="flex flex-col gap-4 mb-3">
          {byDay.map((blocks, idx) =>
            blocks.length === 0 ? null : (
              <div key={idx} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <h3 className="font-bold text-sm mb-2">{DIAS[idx]}</h3>
                {blocks.map((b, i) =>
                  editingBlock === b.id ? (
                    <form
                      key={b.id}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        run(() => updateScheduleTemplate(b.id, fd), () => setEditingBlock(null));
                      }}
                      className={`py-2.5 flex flex-col gap-2 ${i < blocks.length - 1 ? "border-b border-border" : ""}`}
                    >
                      <select name="classTypeId" required defaultValue={b.class_type_id} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs">
                        {classTypes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({TYPE_LABEL[c.category]})</option>
                        ))}
                      </select>
                      <select name="coachId" defaultValue={b.coach_id ?? ""} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs">
                        <option value="">Sin entrenador asignado</option>
                        {coaches.filter((c) => c.active).map((c) => (
                          <option key={c.id} value={c.id}>{c.display_name}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <select name="weekday" required defaultValue={b.weekday} className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs">
                          {DIAS.slice(0, 6).map((d, wi) => (
                            <option key={wi} value={wi}>{d}</option>
                          ))}
                        </select>
                        <input name="startTime" type="time" required defaultValue={b.start_time.slice(0, 5)} className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                      </div>
                      <div className="flex gap-2">
                        <input name="durationMinutes" type="number" min={15} defaultValue={b.duration_minutes} placeholder="Duración (min)" className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                        <input name="capacity" type="number" min={1} required defaultValue={b.capacity} placeholder="Cupo" className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                      </div>
                      <input name="room" defaultValue={b.room ?? ""} placeholder="Sala / lugar (opcional)" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs" />
                      <div className="flex gap-1.5">
                        <button type="submit" disabled={pending} className="flex-1 rounded-md py-1.5 text-[11px] font-bold text-accentInk" style={{ background: "var(--accent)" }}>
                          Guardar
                        </button>
                        <button type="button" onClick={() => setEditingBlock(null)} className="flex-1 rounded-md py-1.5 text-[11px] font-bold bg-surface2 text-ink">
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div key={b.id} className={`flex items-center justify-between gap-2 py-2 text-xs ${i < blocks.length - 1 ? "border-b border-border" : ""} ${b.active ? "" : "opacity-50"}`}>
                      <div>
                        <div className="font-mono font-semibold tabular">{b.start_time.slice(0, 5)}</div>
                        <div className="text-ink2 mt-0.5">
                          {b.class_type.name} · {TYPE_LABEL[b.class_type.category]} · {b.coach?.display_name ?? "—"} · cupo {b.capacity}
                        </div>
                      </div>
                      {confirmDeleteBlock === b.id ? (
                        <ConfirmDelete
                          onConfirm={() => run(() => deleteScheduleTemplate(b.id), () => setConfirmDeleteBlock(null))}
                          onCancel={() => setConfirmDeleteBlock(null)}
                        />
                      ) : (
                        <RowActions
                          pending={pending}
                          active={b.active}
                          onToggle={() => run(() => toggleScheduleTemplate(b.id, !b.active))}
                          onEdit={() => setEditingBlock(b.id)}
                          onDelete={() => setConfirmDeleteBlock(b.id)}
                        />
                      )}
                    </div>
                  )
                )}
              </div>
            )
          )}
          {scheduleTemplates.length === 0 && <p className="text-sm text-ink2">Todavía no hay bloques en el horario.</p>}
        </div>

        <form
          ref={blockFormRef}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => createScheduleTemplate(fd), () => blockFormRef.current?.reset());
          }}
          className="rounded-2xl border border-border bg-surface p-4 shadow-sm flex flex-col gap-2.5"
        >
          <p className="text-xs font-bold text-ink2 uppercase tracking-wide">Agregar bloque</p>
          <select name="classTypeId" required className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm">
            <option value="">Tipo de clase…</option>
            {classTypes.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({TYPE_LABEL[c.category]})</option>
            ))}
          </select>
          <select name="coachId" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm">
            <option value="">Sin entrenador asignado</option>
            {coaches.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>{c.display_name}</option>
            ))}
          </select>
          <div className="flex gap-2.5">
            <select name="weekday" required className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
              {DIAS.slice(0, 6).map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
            <input name="startTime" type="time" required className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2.5">
            <input name="durationMinutes" type="number" defaultValue={60} min={15} placeholder="Duración (min)" className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
            <input name="capacity" type="number" min={1} required placeholder="Cupo" className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          </div>
          <input name="room" placeholder="Sala / lugar (opcional)" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          <button disabled={pending} type="submit" className="rounded-lg py-2.5 text-xs font-bold text-accentInk disabled:opacity-50" style={{ background: "var(--accent)" }}>
            Agregar al horario
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
