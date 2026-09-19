// ENTRENO: rutina de hoy con cronómetro y checklist, rutinas con sus ejercicios, historial y progreso.
import {
  html, dateKey, dayKeyOf, SEMANA, DIA_LABEL, DIA_CORTO, startOfWeek, addDays, parseDate, sum, fmtDateShort,
  fmtDuration, storage, monthKey
} from "../core/utils.js";
import { rows, insert, findById, load, emit } from "../core/store.js";
import { onActs } from "../core/actions.js";
import { view } from "../core/view.js";
import { icon } from "../ui/icons.js";
import { defineCrud, emptyState, openAdd } from "../ui/crud.js";
import { openForm } from "../ui/form.js";
import { toast } from "../ui/toast.js";
import { columnChart, hBars } from "../ui/charts.js";

const WO_KEY = "panel.workout.v1";
const getWo = () => storage.get(WO_KEY, null);
const setWo = (v) => storage.set(WO_KEY, v);

const routineOptions = () => rows("workout_routines").map((r) => ({ v: r.id, l: r.name }));
const exercisesOf = (routineId) => rows("workout_exercises").filter((e) => e.routine_id === routineId);

// ---------- Cálculos (también los usa Inicio) ----------
function weekStreak(sessions) {
  const weeks = new Set(sessions.map((s) => dateKey(startOfWeek(parseDate(s.session_date)))));
  let cur = startOfWeek(new Date());
  if (!weeks.has(dateKey(cur))) cur = addDays(cur, -7); // la semana en curso aún puede no tener sesión
  let n = 0;
  while (weeks.has(dateKey(cur))) { n++; cur = addDays(cur, -7); }
  return n;
}

export function entrenoInfo() {
  const sessions = rows("workout_sessions");
  const routines = rows("workout_routines");
  const today = dateKey();
  const monday = startOfWeek();
  const dots = SEMANA.map((k, i) => {
    const date = dateKey(addDays(monday, i));
    return {
      key: k, date,
      done: sessions.some((s) => s.session_date === date),
      planned: routines.some((r) => r.day_of_week === k),
      isToday: date === today
    };
  });
  const routineToday = routines.find((r) => r.day_of_week === dayKeyOf()) || null;
  const last = sessions.slice().sort((a, b) => b.session_date.localeCompare(a.session_date))[0] || null;
  return {
    routineToday,
    trainedToday: sessions.some((s) => s.session_date === today),
    exercisesCount: routineToday ? exercisesOf(routineToday.id).length : 0,
    dots, streak: weekStreak(sessions), last,
    doneThisWeek: dots.filter((d) => d.done).length,
    plannedThisWeek: dots.filter((d) => d.planned).length
  };
}

// ---------- CRUDs ----------
const rutinas = defineCrud({
  key: "rutinas", table: "workout_routines", accent: "entreno", addLabel: "Nueva rutina", editLabel: "Editar rutina",
  fields: () => [
    { name: "name", label: "Nombre", type: "text", required: true, placeholder: "Ej: Pecho y tríceps" },
    { name: "day_of_week", label: "Día fijo", type: "select", options: [{ v: "", l: "Sin día fijo" }, ...SEMANA.map((k) => ({ v: k, l: DIA_LABEL[k] }))] },
    { name: "description", label: "Descripción", type: "text", placeholder: "Opcional" }
  ],
  fromRow: (r) => ({ ...r, day_of_week: r.day_of_week || "" }),
  toRow: (v) => ({ ...v, day_of_week: v.day_of_week || null }),
  deleteMessage: (r) => `Se eliminará la rutina "${r.name}" y sus ejercicios. Tus sesiones pasadas se conservan.`,
  // La base borra los ejercicios en cascada y deja las sesiones sin rutina: se recargan ambas tablas.
  afterDelete: () => Promise.all([load("workout_exercises", { silent: true }), load("workout_sessions", { silent: true })]).then(() => emit(["workout_exercises", "workout_sessions"]))
});

const ejercicios = defineCrud({
  key: "ejercicios", table: "workout_exercises", accent: "entreno", addLabel: "Nuevo ejercicio", editLabel: "Editar ejercicio",
  fields: () => [
    { name: "routine_id", label: "Rutina", type: "select", options: routineOptions(), required: true },
    { name: "name", label: "Ejercicio", type: "text", required: true, placeholder: "Ej: Press de banca" },
    { name: "sets", label: "Series", type: "number", step: "1", half: true },
    { name: "reps", label: "Repeticiones", type: "number", step: "1", half: true },
    { name: "weight", label: "Peso (kg)", type: "number", step: "0.5", half: true },
    { name: "rest_seconds", label: "Descanso (seg)", type: "number", step: "5", half: true }
  ],
  // sets, reps y rest_seconds son enteros en la base: se redondea por si escribes 3.5.
  toRow: (v) => ({
    ...v,
    sets: v.sets != null ? Math.round(v.sets) : null,
    reps: v.reps != null ? Math.round(v.reps) : null,
    rest_seconds: v.rest_seconds != null ? Math.round(v.rest_seconds) : null
  }),
  row: (e) => ({
    title: e.name,
    sub: [e.sets && e.reps ? `${e.sets}×${e.reps}` : null, e.weight ? `${e.weight} kg` : null, e.rest_seconds ? `descanso ${e.rest_seconds}s` : null].filter(Boolean).join(" · ") || "Sin detalles"
  })
});

const sesiones = defineCrud({
  key: "sesiones", table: "workout_sessions", accent: "entreno", addLabel: "Registrar sesión", editLabel: "Editar sesión",
  fields: () => [
    { name: "session_date", label: "Fecha", type: "date", default: "today", required: true, half: true },
    { name: "routine_id", label: "Rutina", type: "select", options: [{ v: "", l: "Sin rutina" }, ...routineOptions()], half: true },
    { name: "duration_minutes", label: "Duración (min)", type: "number", step: "1" },
    { name: "notes", label: "Notas", type: "textarea", placeholder: "Cómo te sentiste, pesos, etc." }
  ],
  fromRow: (s) => ({ ...s, routine_id: s.routine_id || "" }),
  toRow: (v) => ({ ...v, routine_id: v.routine_id || null, duration_minutes: v.duration_minutes ? Math.round(v.duration_minutes) : null }),
  row: (s) => {
    const r = rows("workout_routines").find((x) => x.id === s.routine_id);
    return {
      title: r ? r.name : "Sesión libre",
      sub: [fmtDateShort(s.session_date), s.duration_minutes ? `${s.duration_minutes} min` : null, s.notes].filter(Boolean).join(" · ")
    };
  }
});

// ---------- Piezas ----------
function weekDots(dots) {
  return html`<div class="week-dots" aria-label="Sesiones de esta semana">${dots.map(
    (d) => html`<div class="wd${d.done ? " done" : ""}${d.planned ? " planned" : ""}${d.isToday ? " today" : ""}" title="${DIA_LABEL[d.key]}${d.done ? " · entrenaste" : d.planned ? " · rutina planeada" : ""}">
      <i>${d.done ? icon("check") : ""}</i><span>${DIA_CORTO[d.key].slice(0, 1)}</span>
    </div>`
  )}</div>`;
}

function exerciseList(routineId, checkable = false, doneSet = new Set()) {
  const list = exercisesOf(routineId);
  if (!list.length) return html`<p class="empty small">Esta rutina aún no tiene ejercicios.</p>`;
  return html`<ul class="rows">${list.map((e) => {
    const r = ejercicios.rowHtml(e);
    if (!checkable) return r;
    const on = doneSet.has(e.id);
    return html`<li class="row${on ? " done" : ""}">
      <button class="check${on ? " on" : ""}" type="button" data-act="wo.ex" data-id="${e.id}" aria-label="Marcar ejercicio">${icon("check")}</button>
      <div class="row-main"><b>${e.name}</b><small>${[e.sets && e.reps ? `${e.sets}×${e.reps}` : null, e.weight ? `${e.weight} kg` : null, e.rest_seconds ? `descanso ${e.rest_seconds}s` : null].filter(Boolean).join(" · ")}</small></div>
    </li>`;
  })}</ul>`;
}

// ---------- Hoy ----------
function hoyView() {
  const info = entrenoInfo();
  const wo = getWo();
  const routine = wo ? rows("workout_routines").find((r) => r.id === wo.routineId) : info.routineToday;
  const doneSet = new Set((wo && wo.done) || []);

  let main;
  if (wo && routine) {
    const total = exercisesOf(routine.id).length;
    main = html`<section class="card live">
      <header class="card-head"><h2>Entrenando: ${routine.name}</h2><span class="pill now-pill">En curso</span></header>
      <div class="timer-line"><span>Tiempo</span><b class="tick" data-since="${wo.start}">${fmtDuration((Date.now() - wo.start) / 60000)}</b><small>${doneSet.size}/${total} ejercicios</small></div>
      ${exerciseList(routine.id, true, doneSet)}
      <div class="stack-actions">
        <button class="btn primary" type="button" data-act="wo.finish">${icon("check")}<span>Terminar y guardar</span></button>
        <button class="btn ghost" type="button" data-act="wo.cancel">Cancelar</button>
      </div>
    </section>`;
  } else if (routine) {
    main = html`<section class="card">
      <header class="card-head"><h2>${info.trainedToday ? "Hoy ya entrenaste ✓" : "Toca hoy"}</h2></header>
      <div class="routine-hero"><b>${routine.name}</b><span>${exercisesOf(routine.id).length} ejercicio(s)${routine.description ? " · " + routine.description : ""}</span></div>
      ${exerciseList(routine.id)}
      <button class="btn primary" type="button" data-act="wo.start" data-id="${routine.id}">${icon("play", "fill")}<span>${info.trainedToday ? "Entrenar de nuevo" : "Empezar entreno"}</span></button>
    </section>`;
  } else {
    const all = rows("workout_routines");
    main = html`<section class="card">
      <header class="card-head"><h2>Hoy no tienes rutina fija</h2></header>
      ${all.length
        ? html`<p class="hint top">Si quieres entrenar igual, elige una:</p>
            <div class="chips-scroll wrap">${all.map((r) => html`<button class="chip" type="button" data-act="wo.start" data-id="${r.id}">${r.name}</button>`)}</div>`
        : emptyState({ title: "Aún no tienes rutinas", text: "Crea una en la pestaña Rutinas y asígnale un día.", action: rutinas.addButton() })}
    </section>`;
  }

  return html`
    <div class="grid-3">
      <div class="stat"><span>Esta semana</span><b>${info.doneThisWeek}${info.plannedThisWeek ? html`<em>/${info.plannedThisWeek}</em>` : ""}</b><small>sesiones</small></div>
      <div class="stat ${info.streak ? "hot" : ""}"><span>Racha</span><b>${info.streak}</b><small>semana(s) seguidas</small></div>
      <div class="stat"><span>Última sesión</span><b>${info.last ? fmtDateShort(info.last.session_date) : "—"}</b></div>
    </div>
    <section class="card"><header class="card-head"><h2>Semana</h2></header>${weekDots(info.dots)}</section>
    ${main}`;
}

// ---------- Rutinas ----------
function rutinasView() {
  const list = rows("workout_routines").slice().sort((a, b) => {
    const ia = a.day_of_week ? SEMANA.indexOf(a.day_of_week) : 99, ib = b.day_of_week ? SEMANA.indexOf(b.day_of_week) : 99;
    return ia - ib;
  });
  return html`
    <div class="toolbar"><h2 class="page-h">Mis rutinas</h2>${rutinas.addButton()}</div>
    ${list.length
      ? list.map(
          (r) => html`<section class="card">
            <header class="card-head">
              <h2>${r.name}${r.day_of_week ? html` <span class="tag">${DIA_LABEL[r.day_of_week]}</span>` : ""}</h2>
              <div class="head-actions">
                <button class="icon-btn" type="button" data-act="crud.edit" data-k="rutinas" data-id="${r.id}" aria-label="Editar rutina">${icon("edit")}</button>
                <button class="icon-btn danger" type="button" data-act="crud.del" data-k="rutinas" data-id="${r.id}" aria-label="Eliminar rutina">${icon("trash")}</button>
              </div>
            </header>
            ${r.description ? html`<p class="hint top">${r.description}</p>` : ""}
            ${exerciseList(r.id)}
            <button class="btn sm ghost" type="button" data-act="wo.addEx" data-id="${r.id}">${icon("plus")}<span>Agregar ejercicio</span></button>
          </section>`
        )
      : emptyState({ title: "Aún no tienes rutinas", text: "Crea tu primera rutina y agrégale ejercicios.", action: rutinas.addButton() })}`;
}

// ---------- Historial ----------
function historialView() {
  const list = rows("workout_sessions").slice().sort((a, b) => b.session_date.localeCompare(a.session_date));
  return html`<section class="card">
    <header class="card-head"><h2>Historial</h2>${sesiones.addButton()}</header>
    ${sesiones.list(list, { empty: emptyState({ title: "Aún no registras sesiones", action: sesiones.addButton() }) })}
  </section>`;
}

// ---------- Progreso ----------
function progresoView() {
  const all = rows("workout_sessions");
  const mk = monthKey();
  const mes = all.filter((s) => String(s.session_date).slice(0, 7) === mk);
  const info = entrenoInfo();

  const monday = startOfWeek();
  const items = [];
  for (let i = 7; i >= 0; i--) {
    const start = addDays(monday, -7 * i);
    const end = addDays(start, 6);
    const n = all.filter((s) => s.session_date >= dateKey(start) && s.session_date <= dateKey(end)).length;
    items.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, values: [n], tip: `Semana del ${fmtDateShort(dateKey(start))}\n${n} sesión(es)` });
  }

  const porRutina = {};
  all.forEach((s) => {
    const r = rows("workout_routines").find((x) => x.id === s.routine_id);
    const n = r ? r.name : "Sin rutina";
    porRutina[n] = (porRutina[n] || 0) + 1;
  });
  const cats = Object.entries(porRutina).sort((a, b) => b[1] - a[1]);

  return html`
    <div class="grid-3">
      <div class="stat"><span>Sesiones este mes</span><b>${mes.length}</b></div>
      <div class="stat"><span>Minutos este mes</span><b>${sum(mes, (s) => s.duration_minutes)}</b></div>
      <div class="stat ${info.streak ? "hot" : ""}"><span>Racha</span><b>${info.streak}</b><small>semana(s)</small></div>
    </div>
    <section class="card">
      <header class="card-head"><h2>Sesiones por semana</h2><span class="muted">Últimas 8</span></header>
      ${all.length
        ? columnChart({ items, series: [{ name: "Sesiones", color: "var(--accent)" }], format: (v) => String(Math.round(v)), ariaLabel: "Sesiones por semana en las últimas ocho semanas", height: 140 })
        : emptyState({ title: "Registra sesiones para ver tu progreso" })}
    </section>
    ${cats.length
      ? html`<section class="card">
          <header class="card-head"><h2>Por rutina</h2></header>
          ${hBars({ items: cats.map(([n, v]) => ({ label: n, value: v, tip: `${n}: ${v} sesión(es)` })), color: "var(--accent)" })}
        </section>`
      : ""}`;
}

export default {
  id: "entreno", label: "Entreno", icon: "dumbbell", accent: "entreno",
  subs: [["hoy", "Hoy"], ["rutinas", "Rutinas"], ["historial", "Historial"], ["progreso", "Progreso"]],
  tables: ["workout_routines", "workout_exercises", "workout_sessions"],
  render(sub) {
    if (sub === "rutinas") return rutinasView();
    if (sub === "historial") return historialView();
    if (sub === "progreso") return progresoView();
    return hoyView();
  }
};

// ---------- Acciones ----------
onActs({
  "wo.start": (el) => { setWo({ routineId: el.dataset.id, start: Date.now(), done: [] }); view.rerender(); },
  "wo.cancel": () => { setWo(null); view.rerender(); },
  "wo.ex": (el) => {
    const wo = getWo();
    if (!wo) return;
    const done = new Set(wo.done || []);
    if (done.has(el.dataset.id)) done.delete(el.dataset.id); else done.add(el.dataset.id);
    setWo({ ...wo, done: [...done] });
    view.rerender();
  },
  "wo.addEx": (el) => openAdd("ejercicios", { routine_id: el.dataset.id }),
  "wo.finish": () => {
    const wo = getWo();
    const routine = wo && findById("workout_routines", wo.routineId);
    if (!wo || !routine) return;
    openForm({
      title: `Guardar sesión: ${routine.name}`,
      accent: "entreno",
      values: { duration_minutes: Math.max(1, Math.round((Date.now() - wo.start) / 60000)) },
      fields: [
        { name: "duration_minutes", label: "Duración (min)", type: "number", step: "1" },
        { name: "notes", label: "Notas", type: "textarea", placeholder: "Opcional" }
      ],
      onSubmit: async (v) => {
        const ok = await insert("workout_sessions", {
          routine_id: routine.id, session_date: dateKey(),
          duration_minutes: v.duration_minutes ? Math.round(v.duration_minutes) : null, notes: v.notes
        });
        if (!ok) return false;
        setWo(null);
        toast("Sesión guardada 💪");
      }
    });
  }
});
