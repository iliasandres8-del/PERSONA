// TIEMPO: horario semanal visual, planificador de huecos libres, actividades y registro de tiempo libre.
import {
  html, dayKeyOf, dateKey, nowMinutes, SEMANA, DIA_LABEL, DIA_CORTO, addDays, minToHHMM, minutesOf,
  hhmm, fmtDuration, fmtDateShort, relDate, sum
} from "../core/utils.js";
import { rows, update, upsert } from "../core/store.js";
import { onActs } from "../core/actions.js";
import { view } from "../core/view.js";
import { icon } from "../ui/icons.js";
import { defineCrud, emptyState, openEdit, askDelete } from "../ui/crud.js";
import { openSheet, closeSheet } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { weekGrid } from "../ui/timeline.js";
import { dayGaps } from "../core/recommend.js";
import { CATEGORIAS, CAT_LABEL, DEFAULT_SCHEDULE, DEFAULT_DURATION } from "../data/defaults.js";

let weekDay = dayKeyOf();

const dayOptions = SEMANA.map((k) => ({ v: k, l: DIA_LABEL[k] }));
const catOptions = CATEGORIAS.map(([v, l]) => ({ v, l }));

const CONFLICT = "user_id,day_of_week,start_time,end_time,title,category";

// ---------- Bloques del horario ----------
export const bloques = defineCrud({
  key: "bloques", table: "schedule_blocks", accent: "tiempo", addLabel: "Nuevo bloque", editLabel: "Editar bloque",
  fields: (item) => [
    item
      ? { name: "day_of_week", label: "Día", type: "select", options: dayOptions, required: true }
      : { name: "days", label: "Días (puedes elegir varios)", type: "chips", options: SEMANA.map((k) => ({ v: k, l: DIA_CORTO[k] })), required: true },
    { name: "start_time", label: "Desde", type: "time", required: true, half: true },
    { name: "end_time", label: "Hasta", type: "time", required: true, half: true },
    { name: "title", label: "Actividad", type: "text", required: true, placeholder: "Ej: Bases de Datos" },
    { name: "category", label: "Categoría", type: "select", options: catOptions, required: true, default: "personal" },
    { name: "notes", label: "Notas", type: "text", placeholder: "Opcional" }
  ],
  fromRow: (b) => ({ ...b, start_time: hhmm(b.start_time), end_time: hhmm(b.end_time) }),
  toRow: (v, item) => {
    if (minutesOf(v.end_time) <= minutesOf(v.start_time)) throw new Error("La hora de fin debe ser posterior a la de inicio.");
    const base = { start_time: v.start_time, end_time: v.end_time, title: v.title, category: v.category, notes: v.notes };
    if (item) return { ...base, day_of_week: v.day_of_week };
    return v.days.map((day_of_week) => ({ ...base, day_of_week, mandatory: true }));
  },
  create: (payload) => upsert("schedule_blocks", payload, { onConflict: CONFLICT, ignoreDuplicates: true }),
  deleteMessage: (b) => `Se eliminará "${b.title}" del ${DIA_LABEL[b.day_of_week] || b.day_of_week}.`
});

// ---------- Actividades ----------
const actividades = defineCrud({
  key: "actividades", table: "activities", accent: "tiempo", addLabel: "Nueva actividad", editLabel: "Editar actividad",
  fields: () => [
    { name: "name", label: "Nombre", type: "text", required: true },
    { name: "scheduled_date", label: "Fecha (opcional)", type: "date" }
  ],
  toRow: (v, item) => (item ? v : { ...v, done: false }),
  row: (a) => {
    const rel = a.scheduled_date ? relDate(a.scheduled_date) : null;
    return {
      className: a.done ? "done" : "",
      leading: html`<button class="check${a.done ? " on" : ""}" type="button" data-act="act.toggle" data-id="${a.id}" aria-label="Marcar como hecha">${icon("check")}</button>`,
      title: a.name,
      sub: rel ? rel.text : "Sin fecha",
      tone: rel && !a.done ? rel.tone : ""
    };
  }
});

// ---------- Registro de tiempo libre ----------
const libre = defineCrud({
  key: "libre", table: "free_time_logs", accent: "tiempo", addLabel: "Registrar horas", editLabel: "Editar registro",
  fields: () => [
    { name: "log_date", label: "Fecha", type: "date", default: "today", required: true, half: true },
    { name: "hours", label: "Horas", type: "number", step: "0.5", required: true, half: true },
    { name: "note", label: "Nota", type: "text", placeholder: "Opcional" }
  ],
  row: (t) => ({ title: `${t.hours} h libres`, sub: [fmtDateShort(t.log_date), t.note].filter(Boolean).join(" · ") })
});

// ---------- Planificador de huecos ----------
function buildPlan() {
  const blocks = rows("schedule_blocks");
  const now = new Date();
  const today = dateKey(now);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(now, i);
    const key = dayKeyOf(d);
    const gaps = dayGaps(blocks, key, { after: i === 0 ? nowMinutes(now) : 0, min: 30 }).map(([s, e]) => ({ s, e, cursor: s, placed: [] }));
    days.push({ date: dateKey(d), key, label: i === 0 ? "Hoy" : i === 1 ? "Mañana" : DIA_LABEL[key], gaps });
  }
  const freeTotal = sum(days.flatMap((d) => d.gaps), (g) => g.e - g.s);

  const items = [
    ...rows("activities").filter((a) => !a.done).map((a) => ({ title: a.name, dur: 60, due: a.scheduled_date, kind: "Actividad" })),
    ...rows("tasks").filter((t) => t.status !== "completada").map((t) => ({
      title: t.title, due: t.due_date, kind: "Tarea",
      dur: t.estimated_minutes || DEFAULT_DURATION[t.attention_level || "media"] * 2
    }))
  ].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));

  const unplaced = [];
  for (const it of items) {
    let placed = false;
    for (const day of days) {
      if (it.due && day.date > it.due && day.date > today) break;
      const gap = day.gaps.find((g) => g.e - g.cursor >= it.dur);
      if (gap) {
        gap.placed.push({ ...it, s: gap.cursor, e: gap.cursor + it.dur });
        gap.cursor += it.dur;
        placed = true;
        break;
      }
    }
    if (!placed) unplaced.push(it);
  }
  return { days, freeTotal, unplaced, count: items.length };
}

function planView() {
  const { days, freeTotal, unplaced, count } = buildPlan();
  return html`
    <div class="grid-2">
      <div class="stat"><span>Tiempo libre esta semana</span><b>${fmtDuration(freeTotal)}</b><small>Huecos de 30 min o más entre 6:00 y 22:30</small></div>
      <div class="stat"><span>Pendientes por ubicar</span><b>${count}</b><small>${unplaced.length ? `${unplaced.length} no caben esta semana` : "Todo cabe en tus huecos"}</small></div>
    </div>
    <section class="card">
      <header class="card-head"><h2>Plan sugerido</h2></header>
      <p class="hint top">Reparte tus tareas y actividades pendientes en los huecos libres, empezando por lo que vence antes. Es una sugerencia: no crea nada en tu horario.</p>
      ${days.map(
        (d) => html`<div class="plan-day">
          <h3>${d.label} <small>${fmtDateShort(d.date)}</small></h3>
          ${d.gaps.length
            ? d.gaps.map(
                (g) => html`<div class="gap">
                  <span class="gap-range">${minToHHMM(g.s)}–${minToHHMM(g.e)} <small>${fmtDuration(g.e - g.s)} libres</small></span>
                  ${g.placed.length
                    ? g.placed.map((p) => html`<span class="gap-item"><b>${minToHHMM(p.s)}</b> ${p.title} <small>${p.kind} · ${fmtDuration(p.dur)}</small></span>`)
                    : html`<span class="gap-empty">Libre</span>`}
                </div>`
              )
            : html`<p class="empty small">Sin huecos largos este día.</p>`}
        </div>`
      )}
      ${unplaced.length
        ? html`<div class="callout warn"><b>No caben esta semana</b><ul>${unplaced.map((u) => html`<li>${u.title} (${fmtDuration(u.dur)})</li>`)}</ul></div>`
        : ""}
    </section>`;
}

// ---------- Semana ----------
function semanaView() {
  const blocks = rows("schedule_blocks");
  const now = new Date();
  const empty = !blocks.length;
  return html`
    <section class="card">
      <header class="card-head">
        <h2>Horario semanal</h2>
        <div class="head-actions">
          ${empty ? html`<button class="btn sm" type="button" data-act="schedule.seed">${icon("download")}<span>Cargar mi horario base</span></button>` : ""}
          ${bloques.addButton()}
        </div>
      </header>
      ${empty
        ? emptyState({ title: "Aún no tienes horario", text: "Carga tu horario base de un toque o agrega bloques uno a uno." })
        : weekGrid({ blocks, selectedDay: weekDay, todayKey: dayKeyOf(now), nowMin: nowMinutes(now) })}
    </section>`;
}

function actividadesView() {
  const list = rows("activities").slice().sort((a, b) => Number(a.done) - Number(b.done) || (a.scheduled_date || "9999").localeCompare(b.scheduled_date || "9999"));
  return html`<section class="card">
    <header class="card-head"><h2>Actividades</h2>${actividades.addButton()}</header>
    ${actividades.list(list, { empty: emptyState({ title: "Sin actividades", text: "Anota lo que quieres hacer aunque aún no tenga hora.", action: actividades.addButton() }) })}
  </section>`;
}

function libreView() {
  const list = rows("free_time_logs").slice().sort((a, b) => b.log_date.localeCompare(a.log_date));
  const total = sum(list, (x) => x.hours);
  return html`<section class="card">
    <header class="card-head"><h2>Tiempo libre registrado</h2>${libre.addButton()}</header>
    <p class="hint top">Total registrado: <b>${total} h</b>. El planificador ya calcula tus huecos automáticamente desde el horario; este registro es para tu propio control.</p>
    ${libre.list(list, { empty: emptyState({ title: "Sin registros", action: libre.addButton() }) })}
  </section>`;
}

export default {
  id: "tiempo", label: "Tiempo", icon: "clock", accent: "tiempo",
  subs: [["semana", "Semana"], ["plan", "Planificador"], ["actividades", "Actividades"], ["libre", "Tiempo libre"]],
  tables: ["schedule_blocks", "activities", "free_time_logs", "tasks"],
  render(sub) {
    if (sub === "plan") return planView();
    if (sub === "actividades") return actividadesView();
    if (sub === "libre") return libreView();
    return semanaView();
  }
};

// ---------- Acciones ----------
onActs({
  "week.day": (el) => { weekDay = el.dataset.day; view.rerender(); },
  "act.toggle": (el) => {
    const a = rows("activities").find((x) => x.id === el.dataset.id);
    if (a) update("activities", a.id, { done: !a.done });
  },
  "block.edit": (el) => {
    const b = rows("schedule_blocks").find((x) => x.id === el.dataset.id);
    if (!b) return;
    openSheet(
      html`<h3 class="sheet-title">${b.title}</h3>
        <p class="sheet-text">${DIA_LABEL[b.day_of_week]} · ${hhmm(b.start_time)}–${hhmm(b.end_time)} · ${CAT_LABEL[b.category] || b.category}</p>
        ${b.notes ? html`<p class="sheet-text muted">${b.notes}</p>` : ""}
        <div class="sheet-actions">
          <button class="btn danger" type="button" data-b="del">${icon("trash")}Eliminar</button>
          <button class="btn primary" type="button" data-b="edit">${icon("edit")}Editar</button>
        </div>`.toString(),
      {
        accent: "tiempo",
        label: b.title,
        onMount: (s) => {
          s.querySelector("[data-b=edit]").onclick = () => { closeSheet(true); openEdit("bloques", b.id); };
          s.querySelector("[data-b=del]").onclick = () => { closeSheet(true); askDelete("bloques", b.id); };
        }
      }
    );
  },
  "schedule.seed": async () => {
    const ok = await upsert("schedule_blocks", DEFAULT_SCHEDULE.map((b) => ({ ...b, mandatory: true })), { onConflict: CONFLICT, ignoreDuplicates: true });
    if (ok) toast("Horario base cargado ✓");
  }
});
