// ESTUDIO: tareas agrupadas por urgencia, materias y sincronización con Aula Extendida (Moodle).
import { html, raw, dateKey, relDate, daysBetween } from "../core/utils.js";
import { rows, insert, update, remove, upsert, findById, load, emit } from "../core/store.js";
import { db } from "../core/db.js";
import { onActs } from "../core/actions.js";
import { view } from "../core/view.js";
import { icon } from "../ui/icons.js";
import { defineCrud, emptyState } from "../ui/crud.js";
import { openForm } from "../ui/form.js";
import { toast } from "../ui/toast.js";
import { ATENCION, ATTN_DOT } from "../data/defaults.js";

let subjectFilter = "";
let showDone = false;
let syncing = false;

const STATUS = [["pendiente", "Pendiente"], ["en_progreso", "En progreso"], ["completada", "Completada"]];

const subjectName = (id) => (rows("subjects").find((s) => s.id === id) || {}).name || null;

// ---------- Tareas ----------
export const tareas = defineCrud({
  key: "tareas", table: "tasks", accent: "estudio", addLabel: "Nueva tarea", editLabel: "Editar tarea",
  fields: () => [
    { name: "title", label: "Título", type: "text", required: true, placeholder: "Ej: Taller de estructuras" },
    { name: "subject_id", label: "Materia", type: "select", options: [{ v: "", l: "Sin materia" }, ...rows("subjects").map((s) => ({ v: s.id, l: s.name }))] },
    { name: "due_date", label: "Fecha de entrega", type: "date", half: true },
    { name: "estimated_minutes", label: "Minutos estimados", type: "number", step: "5", half: true },
    { name: "attention_level", label: "Atención que requiere", type: "select", options: ATENCION.map(([v, l]) => ({ v, l })), default: "media", half: true },
    { name: "status", label: "Estado", type: "select", options: STATUS.map(([v, l]) => ({ v, l })), default: "pendiente", half: true }
  ],
  fromRow: (t) => ({ ...t, subject_id: t.subject_id || "", attention_level: t.attention_level || "media", status: t.status || "pendiente" }),
  toRow: (v, item) => {
    const row = { ...v, subject_id: v.subject_id || null, estimated_minutes: v.estimated_minutes ? Math.round(v.estimated_minutes) : null };
    return item ? row : { ...row, priority: v.attention_level };
  },
  row: (t) => taskRow(t)
});

function taskRow(t) {
  const done = t.status === "completada";
  const rel = t.due_date ? relDate(t.due_date) : null;
  const materia = subjectName(t.subject_id);
  return {
    className: done ? "done" : "",
    leading: html`<button class="check${done ? " on" : ""}" type="button" data-act="task.toggle" data-id="${t.id}" aria-label="${done ? "Marcar pendiente" : "Marcar completada"}">${icon("check")}</button>`,
    title: t.title,
    sub: html`${materia ? html`<span class="tag">${materia}</span>` : ""}${rel && !done ? html`<span class="due ${rel.tone}">${rel.text}</span>` : ""}${t.status === "en_progreso" ? html`<span class="tag info">En progreso</span>` : ""}<span class="attn" title="Atención ${t.attention_level || "media"}">${ATTN_DOT[t.attention_level || "media"]}</span>${t.estimated_minutes ? html`<span class="muted">${t.estimated_minutes} min</span>` : ""}`
  };
}

// ---------- Materias ----------
const materias = defineCrud({
  key: "materias", table: "subjects", accent: "estudio", addLabel: "Nueva materia", editLabel: "Editar materia",
  fields: () => [
    { name: "name", label: "Materia", type: "text", required: true },
    { name: "professor", label: "Profesor", type: "text", placeholder: "Opcional" }
  ],
  deleteMessage: (s) => `Se eliminará "${s.name}". Sus tareas se conservan pero quedarán sin materia.`,
  // La base pone subject_id en NULL en las tareas de esa materia: se recargan para reflejarlo.
  afterDelete: () => load("tasks", { silent: true }).then(() => emit(["tasks"])),
  row: (s) => {
    const pend = rows("tasks").filter((t) => t.subject_id === s.id && t.status !== "completada").length;
    return { title: s.name, sub: [s.professor, `${pend} tarea(s) pendiente(s)`].filter(Boolean).join(" · ") };
  }
});

// ---------- Vista Tareas ----------
function groupTasks(list, today) {
  const g = { vencidas: [], hoy: [], semana: [], despues: [], sinFecha: [] };
  list.forEach((t) => {
    if (!t.due_date) return g.sinFecha.push(t);
    const d = daysBetween(today, t.due_date);
    if (d < 0) g.vencidas.push(t);
    else if (d === 0) g.hoy.push(t);
    else if (d <= 7) g.semana.push(t);
    else g.despues.push(t);
  });
  const byDate = (a, b) => (a.due_date || "").localeCompare(b.due_date || "");
  Object.values(g).forEach((arr) => arr.sort(byDate));
  return g;
}

function tareasView() {
  const today = dateKey();
  const all = rows("tasks").filter((t) => !subjectFilter || t.subject_id === subjectFilter);
  const pending = all.filter((t) => t.status !== "completada");
  const done = all.filter((t) => t.status === "completada").sort((a, b) => (b.due_date || "").localeCompare(a.due_date || ""));
  const g = groupTasks(pending, today);
  const subs = rows("subjects");

  const block = (title, list, tone = "") =>
    list.length
      ? html`<section class="card group ${tone}">
          <header class="card-head"><h2>${title} <span class="count">${list.length}</span></h2></header>
          <ul class="rows">${list.map((t) => tareas.rowHtml(t))}</ul>
        </section>`
      : "";

  return html`
    <div class="grid-3">
      <div class="stat ${g.vencidas.length ? "neg" : ""}"><span>Vencidas</span><b>${g.vencidas.length}</b></div>
      <div class="stat ${g.hoy.length ? "warn" : ""}"><span>Para hoy</span><b>${g.hoy.length}</b></div>
      <div class="stat"><span>Pendientes</span><b>${pending.length}</b></div>
    </div>

    <div class="toolbar">
      <div class="chips-scroll" role="group" aria-label="Filtrar por materia">
        <button type="button" class="chip${subjectFilter === "" ? " on" : ""}" data-act="task.subject" data-id="">Todas</button>
        ${subs.map((s) => html`<button type="button" class="chip${subjectFilter === s.id ? " on" : ""}" data-act="task.subject" data-id="${s.id}">${s.name}</button>`)}
      </div>
      ${tareas.addButton()}
    </div>

    ${pending.length === 0
      ? emptyState({ title: "Nada pendiente 🎉", text: "Agrega una tarea o sincroniza con Aula Extendida.", action: tareas.addButton() })
      : html`${block("Vencidas", g.vencidas, "danger")}${block("Hoy", g.hoy, "warn")}${block("Esta semana", g.semana)}${block("Más adelante", g.despues)}${block("Sin fecha", g.sinFecha)}`}

    ${done.length
      ? html`<section class="card">
          <header class="card-head"><h2>Completadas <span class="count">${done.length}</span></h2><button class="btn sm ghost" type="button" data-act="task.showDone">${showDone ? "Ocultar" : "Mostrar"}</button></header>
          ${showDone ? html`<ul class="rows">${done.map((t) => tareas.rowHtml(t))}</ul>` : ""}
        </section>`
      : ""}`;
}

function materiasView() {
  return html`<section class="card">
    <header class="card-head"><h2>Materias</h2>${materias.addButton()}</header>
    ${materias.list(rows("subjects"), { empty: emptyState({ title: "Sin materias", text: "Se crean solas al sincronizar Aula Extendida, o agrégalas a mano.", action: materias.addButton() }) })}
  </section>`;
}

// ---------- Aula Extendida ----------
export function aulaReminder() {
  const r = rows("reminders").find((x) => x.reminder_type === "aula_extendida") || null;
  if (!r) return { row: null, hours: null, due: true, interval: 12 };
  const interval = r.interval_hours || 12;
  // last_checked_at puede ser nulo (nunca revisado): cuenta como pendiente.
  if (!r.last_checked_at) return { row: r, hours: null, due: true, interval };
  const hours = Math.floor((Date.now() - new Date(r.last_checked_at).getTime()) / 3600000);
  return { row: r, hours, due: hours >= interval, interval };
}

const moodleToken = () => (rows("integrations").find((i) => i.provider === "moodle") || {}).token || null;

function aulaView() {
  const rem = aulaReminder();
  const token = moodleToken();
  return html`
    <section class="card">
      <header class="card-head"><h2>Recordatorio</h2></header>
      <div class="callout ${rem.due ? "warn" : "ok"}">
        <b>${rem.row ? (rem.due ? "Toca revisar Aula Extendida" : "Todo al día") : "Aún no has marcado ninguna revisión"}</b>
        <p>${rem.row && rem.hours != null ? `Han pasado ${rem.hours} h desde tu última revisión (te recuerdo cada ${rem.interval} h).` : "Marca tu primera revisión para empezar a llevar la cuenta."}</p>
      </div>
      <button class="btn primary" type="button" data-act="aula.check">${icon("check")}<span>Marcar revisado ahora</span></button>
    </section>
    <section class="card">
      <header class="card-head"><h2>Sincronizar tareas</h2></header>
      ${token
        ? html`<p class="hint top">Cuenta de Aula Extendida conectada. Las tareas nuevas se agregan sin duplicar las que ya tienes.</p>
            <div class="stack-actions">
              <button class="btn primary" type="button" data-act="aula.sync"${syncing ? raw(" disabled") : ""}>${icon("refresh")}<span>${syncing ? "Sincronizando…" : "Sincronizar ahora"}</span></button>
              <button class="btn ghost" type="button" data-act="aula.disconnect">Desconectar</button>
            </div>`
        : html`<p class="hint top">Conecta tu cuenta una vez. Tu contraseña no se guarda: solo se usa para obtener un token, y ese token es lo único que queda almacenado.</p>
            <button class="btn primary" type="button" data-act="aula.connect">${icon("link")}<span>Conectar Aula Extendida</span></button>`}
    </section>`;
}

export default {
  id: "estudio", label: "Estudio", icon: "book", accent: "estudio",
  subs: [["tareas", "Tareas"], ["materias", "Materias"], ["aula", "Aula Extendida"]],
  tables: ["tasks", "subjects", "reminders", "integrations"],
  render(sub) {
    if (sub === "materias") return materiasView();
    if (sub === "aula") return aulaView();
    return tareasView();
  }
};

// ---------- Acciones ----------
async function runSync() {
  const token = moodleToken();
  if (!token || syncing) return;
  syncing = true;
  view.rerender();
  try {
    const { data, error } = await db.functions.invoke("moodle-sync", { body: { mode: "sync", token } });
    if (error || (data && data.error)) throw new Error((data && data.error) || "No se pudo sincronizar.");

    const incoming = (data.tasks || []).filter((t) => t.due_date);
    const norm = (s) => String(s || "").trim().toLowerCase();

    // 1) Materias que faltan (en un solo insert)
    const known = new Set(rows("subjects").map((s) => norm(s.name)));
    const missing = [...new Set(incoming.map((t) => t.course_name).filter((n) => n && !known.has(norm(n))))];
    if (missing.length) await insert("subjects", missing.map((name) => ({ name })));
    const subByName = new Map(rows("subjects").map((s) => [norm(s.name), s.id]));

    // 2) Tareas nuevas (sin duplicar título + fecha)
    const existing = new Set(rows("tasks").map((t) => `${t.title}|${t.due_date}`));
    const fresh = [];
    for (const t of incoming) {
      const key = `${t.title}|${t.due_date}`;
      if (existing.has(key)) continue;
      existing.add(key);
      fresh.push({ subject_id: subByName.get(norm(t.course_name)) || null, title: t.title, due_date: t.due_date, priority: "media" });
    }
    if (fresh.length) await insert("tasks", fresh);
    toast(`Sincronizado: ${incoming.length} tareas encontradas, ${fresh.length} nuevas.`);
  } catch (e) {
    toast(e.message || "No se pudo sincronizar.", "error", 5000);
  } finally {
    syncing = false;
    view.rerender();
  }
}

onActs({
  "task.toggle": (el) => {
    const t = findById("tasks", el.dataset.id);
    if (t) update("tasks", t.id, { status: t.status === "completada" ? "pendiente" : "completada" });
  },
  "task.subject": (el) => { subjectFilter = el.dataset.id; view.rerender(); },
  "task.showDone": () => { showDone = !showDone; view.rerender(); },
  "aula.check": async () => {
    const { row } = aulaReminder();
    const now = new Date().toISOString();
    if (row) await update("reminders", row.id, { last_checked_at: now });
    else await insert("reminders", { title: "Aula Extendida", reminder_type: "aula_extendida", interval_hours: 12, last_checked_at: now });
    toast("Revisión registrada ✓");
  },
  "aula.sync": runSync,
  "aula.disconnect": async () => {
    const i = rows("integrations").find((x) => x.provider === "moodle");
    if (i && (await remove("integrations", i.id))) toast("Cuenta desconectada");
  },
  "aula.connect": () =>
    openForm({
      title: "Conectar Aula Extendida",
      accent: "estudio",
      submitLabel: "Conectar",
      note: "Tu contraseña no se guarda; solo se usa una vez para obtener el token.",
      fields: [
        { name: "username", label: "Usuario institucional", type: "text", required: true },
        { name: "password", label: "Contraseña", type: "password", required: true }
      ],
      onSubmit: async ({ username, password }) => {
        const { data, error } = await db.functions.invoke("moodle-sync", { body: { mode: "login", username, password } });
        if (error || (data && data.error)) throw new Error((data && data.error) || "No se pudo conectar.");
        const ok = await upsert("integrations", { provider: "moodle", token: data.token, updated_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
        if (!ok) return false;
        toast("Aula Extendida conectada ✓");
      }
    })
});
