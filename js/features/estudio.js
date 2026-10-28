// ESTUDIO: tareas agrupadas por urgencia, notas por materia, materias y sincronización con Aula Extendida (Moodle).
import { html, raw, dateKey, relDate, daysBetween } from "../core/utils.js";
import { rows, insert, update, findById, load, emit } from "../core/store.js";
import { db } from "../core/db.js";
import { onActs } from "../core/actions.js";
import { view } from "../core/view.js";
import { icon } from "../ui/icons.js";
import { defineCrud, emptyState, openAdd } from "../ui/crud.js";
import { toast } from "../ui/toast.js";
import { ATENCION, ATTN_DOT } from "../data/defaults.js";

let subjectFilter = "";
let showDone = false;
let syncing = false;

const STATUS = [["pendiente", "Pendiente"], ["en_progreso", "En progreso"], ["completada", "Completada"]];
const KINDS = [["taller", "Taller o trabajo"], ["parcial", "Parcial"], ["quiz", "Quiz"], ["exposicion", "Exposición"]];
const KIND_LABEL = Object.fromEntries(KINDS);
const PASA = 3; // nota mínima para pasar (escala 0 a 5)

// Tipo de la tarea: el que le pusiste, o adivinado por el título
export function taskKind(t) {
  if (t.kind) return t.kind;
  if (/parcial|examen|evaluaci[oó]n final|sustentaci/i.test(t.title)) return "parcial";
  if (/quiz/i.test(t.title)) return "quiz";
  if (/exposici/i.test(t.title)) return "exposicion";
  return "taller";
}
const esExamen = (t) => ["parcial", "quiz"].includes(taskKind(t));

// Abre un chat conmigo (Ministro) con lo que hace falta para ayudarte con esa tarea
function ministroUrl(t) {
  const materia = subjectName(t.subject_id);
  const q = `Ministro, ayúdame con ${esExamen(t) ? "el " + KIND_LABEL[taskKind(t)].toLowerCase() : "la tarea"} "${t.title}"${materia ? ` de ${materia}` : ""}${t.due_date ? `, es para el ${t.due_date}` : ""}. ${esExamen(t) ? "Hazme un repaso de los temas y unas preguntas de práctica." : "Explícame qué piden y cómo empezar."}`;
  return `https://claude.ai/new?q=${encodeURIComponent(q)}`;
}

const subjectName = (id) => (rows("subjects").find((s) => s.id === id) || {}).name || null;

// ---------- Tareas ----------
export const tareas = defineCrud({
  key: "tareas", table: "tasks", accent: "estudio", addLabel: "Nueva tarea", editLabel: "Editar tarea",
  fields: () => [
    { name: "title", label: "Título", type: "text", required: true, placeholder: "Ej: Taller de estructuras" },
    { name: "subject_id", label: "Materia", type: "select", options: [{ v: "", l: "Sin materia" }, ...rows("subjects").map((s) => ({ v: s.id, l: s.name }))] },
    { name: "kind", label: "Tipo", type: "select", options: [{ v: "", l: "Adivinar por el título" }, ...KINDS.map(([v, l]) => ({ v, l }))] },
    { name: "due_date", label: "Fecha de entrega", type: "date", half: true },
    { name: "estimated_minutes", label: "Minutos estimados", type: "number", step: "5", half: true },
    { name: "attention_level", label: "Atención que requiere", type: "select", options: ATENCION.map(([v, l]) => ({ v, l })), default: "media", half: true },
    { name: "status", label: "Estado", type: "select", options: STATUS.map(([v, l]) => ({ v, l })), default: "pendiente", half: true }
  ],
  fromRow: (t) => ({ ...t, kind: t.kind || "", subject_id: t.subject_id || "", attention_level: t.attention_level || "media", status: t.status || "pendiente" }),
  toRow: (v, item) => {
    const row = { ...v, kind: v.kind || null, subject_id: v.subject_id || null, estimated_minutes: v.estimated_minutes ? Math.round(v.estimated_minutes) : null };
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
    actions: done ? "" : html`<a class="icon-btn" href="${ministroUrl(t)}" target="_blank" rel="noopener" aria-label="Pedirle ayuda a Ministro" title="Pedirle ayuda a Ministro">${icon("bolt")}</a>`,
    sub: html`${esExamen(t) ? html`<span class="tag warn">${KIND_LABEL[taskKind(t)]}</span>` : ""}${materia ? html`<span class="tag">${materia}</span>` : ""}${rel && !done ? html`<span class="due ${rel.tone}">${rel.text}</span>` : ""}${t.status === "en_progreso" ? html`<span class="tag info">En progreso</span>` : ""}<span class="attn" title="Atención ${t.attention_level || "media"}">${ATTN_DOT[t.attention_level || "media"]}</span>${t.estimated_minutes ? html`<span class="muted">${t.estimated_minutes} min</span>` : ""}`
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

// ---------- Notas ----------
const notas = defineCrud({
  key: "notas", table: "grades", accent: "estudio", addLabel: "Nueva nota", editLabel: "Editar nota",
  fields: () => [
    { name: "subject_id", label: "Materia", type: "select", options: rows("subjects").map((s) => ({ v: s.id, l: s.name })), required: true },
    { name: "name", label: "Qué fue", type: "text", required: true, placeholder: "Ej: Primer parcial" },
    { name: "weight", label: "Cuánto vale (%)", type: "number", step: "1", required: true, half: true, placeholder: "30" },
    { name: "score", label: "Nota (0 a 5)", type: "number", step: "0.1", half: true, hint: "Déjala vacía si todavía no te la dan", placeholder: "Opcional" }
  ],
  toRow: (v) => {
    if (v.weight <= 0 || v.weight > 100) throw new Error("El porcentaje va de 1 a 100.");
    if (v.score != null && (v.score < 0 || v.score > 5)) throw new Error("La nota va de 0 a 5.");
    return v;
  },
  row: (g) => ({
    title: g.name,
    sub: `Vale ${fmtNum(g.weight)} %`,
    side: g.score != null ? fmtNum(g.score) : "—",
    tone: g.score == null ? "" : g.score >= PASA ? "pos" : "neg"
  })
});

const fmtNum = (n) => String(Math.round(Number(n) * 100) / 100).replace(".", ",");

// Cómo vas en una materia y cuánto necesitas en lo que falta para sacar 3,0
export function subjectStanding(subjectId) {
  const list = rows("grades").filter((g) => g.subject_id === subjectId);
  const calificadas = list.filter((g) => g.score != null);
  const evaluado = calificadas.reduce((s, g) => s + Number(g.weight), 0);
  const acumulado = calificadas.reduce((s, g) => s + (Number(g.score) * Number(g.weight)) / 100, 0);
  const falta = Math.max(0, 100 - evaluado);
  const necesita = falta > 0 ? (PASA - acumulado) / (falta / 100) : null;
  const promedio = evaluado ? acumulado / (evaluado / 100) : null;
  return { list, evaluado, acumulado, falta, necesita, promedio };
}

function standingText(st) {
  if (!st.list.length) return html`<p class="hint top">Anota tus notas y te digo cuánto necesitas para pasar.</p>`;
  if (st.falta === 0) return html`<div class="callout ${st.acumulado >= PASA ? "ok" : "warn"}"><b>Nota final: ${fmtNum(st.acumulado.toFixed(2))}</b><p>${st.acumulado >= PASA ? "¡Pasaste la materia! 🎉" : "No alcanzó para pasar."}</p></div>`;
  if (st.necesita <= 0) return html`<div class="callout ok"><b>Ya pasaste 🎉</b><p>Llevas ${fmtNum(st.acumulado.toFixed(2))} acumulado con el ${fmtNum(st.evaluado)} % evaluado. Lo que falta es para subir el promedio.</p></div>`;
  if (st.necesita > 5) return html`<div class="callout warn"><b>Ojo: ni con 5 alcanzas el 3,0</b><p>Llevas ${fmtNum(st.acumulado.toFixed(2))} con el ${fmtNum(st.evaluado)} % evaluado. Habla con el profe sobre un trabajo extra o una habilitación.</p></div>`;
  return html`<div class="callout ${st.necesita > 4 ? "warn" : "ok"}"><b>Necesitas ${fmtNum(st.necesita.toFixed(1))} en el ${fmtNum(st.falta)} % que falta</b><p>Llevas ${fmtNum(st.acumulado.toFixed(2))} acumulado${st.promedio != null ? ` (promedio ${fmtNum(st.promedio.toFixed(1))})` : ""}.</p></div>`;
}

function notasView() {
  const subs = rows("subjects");
  if (!subs.length) return emptyState({ title: "Primero agrega tus materias", text: "Se crean solas al sincronizar Aula Extendida." });
  return html`<p class="hint top">Escala de 0 a 5. Se pasa con ${fmtNum(PASA)}. Pon el porcentaje que vale cada nota según lo que dijo el profe.</p>
    ${subs.map((s) => {
      const st = subjectStanding(s.id);
      return html`<section class="card">
        <header class="card-head"><h2>${s.name}</h2><button class="btn sm ghost" type="button" data-act="grade.add" data-id="${s.id}">${icon("plus")}<span>Nota</span></button></header>
        ${standingText(st)}
        ${st.list.length ? notas.list(st.list) : ""}
      </section>`;
    })}`;
}

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

function aulaView() {
  const rem = aulaReminder();
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
      <p class="hint top">Aula se revisa sola 6 veces al día: agrega las tareas nuevas sin repetirlas, marca como completadas las que ya entregaste y corrige las fechas que cambie el profe. Si acabas de entregar algo, sincroniza ahora.</p>
      <button class="btn primary" type="button" data-act="aula.sync"${syncing ? raw(" disabled") : ""}>${icon("refresh")}<span>${syncing ? "Sincronizando…" : "Sincronizar ahora"}</span></button>
    </section>`;
}

export default {
  id: "estudio", label: "Estudio", icon: "book", accent: "estudio",
  subs: [["tareas", "Tareas"], ["notas", "Notas"], ["materias", "Materias"], ["aula", "Aula Extendida"]],
  tables: ["tasks", "subjects", "reminders", "grades"],
  render(sub) {
    if (sub === "notas") return notasView();
    if (sub === "materias") return materiasView();
    if (sub === "aula") return aulaView();
    return tareasView();
  }
};

// ---------- Acciones ----------
// Usa la misma función que revisa Aula sola 6 veces al día: crea las tareas nuevas sin repetir,
// marca como completadas las que ya entregaste y corrige las fechas que cambió el profe.
async function runSync() {
  if (syncing) return;
  syncing = true;
  view.rerender();
  try {
    const { data, error } = await db.functions.invoke("aula-sync", { body: {} });
    if (error || !data || data.ok === false) throw new Error((data && data.error) || "No se pudo sincronizar.");
    await Promise.all([load("tasks", { silent: true }), load("subjects", { silent: true })]);
    emit(["tasks", "subjects"]);
    const partes = [`${data.nuevas.length} nueva(s)`, `${data.entregadas.length} entregada(s)`];
    if (data.cambios.length) partes.push(`${data.cambios.length} cambio(s) de fecha`);
    toast(`Aula al día: ${partes.join(", ")}.`);
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
  "grade.add": (el) => openAdd("notas", { subject_id: el.dataset.id }),
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
});
