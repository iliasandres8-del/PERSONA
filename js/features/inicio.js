// INICIO: responde "¿qué debería estar haciendo ahora?" cruzando horario, tareas, dinero y entreno.
import { html, dateKey, fmtDuration, hhmm, relDate, money, nowMinutes } from "../core/utils.js";
import { rows, upsert } from "../core/store.js";
import { onActs } from "../core/actions.js";
import { view } from "../core/view.js";
import { analyze, contextLabel } from "../core/recommend.js";
import { icon } from "../ui/icons.js";
import { emptyState } from "../ui/crud.js";
import { agenda } from "../ui/timeline.js";
import { meter } from "../ui/charts.js";
import { CONTEXTS, CAT_LABEL, ATTN_DOT } from "../data/defaults.js";
import { moneySummary, goalProgress } from "./dinero.js";
import { entrenoInfo } from "./entreno.js";
import { aulaReminder, tareas } from "./estudio.js";
import { startFocus } from "./focus.js";

let ctxOpen = false;

function manualContext() {
  const row = rows("user_context")[0];
  if (!row || !row.context || !row.updated_at) return null;
  // Solo cuenta si lo marcaste hoy (en hora local, no UTC).
  return dateKey(new Date(row.updated_at)) === dateKey() ? row.context : null;
}

function nowCard(a) {
  const catClass = a.actual ? `cat-${a.actual.category}` : "";
  let title, sub, extra = "";
  if (a.actual) {
    title = a.actual.title;
    sub = `${hhmm(a.actual.start_time)} – ${hhmm(a.actual.end_time)} · ${CAT_LABEL[a.actual.category] || a.actual.category} · termina en ${fmtDuration(a.progress.left)}`;
    extra = meter(a.progress.pct);
  } else {
    title = a.mode === "noche" ? "Ya es hora de descansar" : "Nada agendado ahora";
    sub = a.mode === "noche" ? "Mañana empieza otro día." : "Tienes un momento libre.";
  }
  const nx = a.next;
  const nextLine = nx
    ? html`<p class="next-line">${icon("chevron")}<span>Después: <b>${nx.block.title}</b> ${nx.dayLabel ? `(${nx.dayLabel}) ` : ""}a las ${hhmm(nx.block.start_time)}${nx.minutesUntil != null ? ` · en ${fmtDuration(nx.minutesUntil)}` : ""}</span></p>`
    : "";

  const cur = contextLabel(a.ctxKey);
  return html`<section class="card now-card ${catClass} o1">
    <div class="eyebrow">Ahora</div>
    <h2 class="now-title">${title}</h2>
    <p class="now-sub">${sub}</p>
    ${extra}
    ${nextLine}
    <div class="ctx">
      <button class="ctx-toggle" type="button" data-act="ctx.toggle" aria-expanded="${ctxOpen}">
        <span>¿Qué haces?</span>
        <b>${cur ? cur : "Sin definir"}${a.ctxKey && !a.manualContext ? html` <small>(por tu horario)</small>` : ""}</b>
        ${icon("chevron", ctxOpen ? "rot" : "")}
      </button>
      ${ctxOpen
        ? html`<div class="ctx-chips">${CONTEXTS.map(
            (c) => html`<button type="button" class="chip${a.manualContext === c.key ? " on" : ""}" data-act="ctx.set" data-key="${c.key}">${c.icon} ${c.label}</button>`
          )}${a.manualContext ? html`<button type="button" class="chip ghost" data-act="ctx.clear">Quitar</button>` : ""}</div>`
        : ""}
    </div>
  </section>`;
}

const startBtn = (item, cls = "sm") =>
  html`<button class="btn ${cls} primary" type="button" data-act="focus.start" data-title="${item.title}" data-min="${item.duration}" aria-label="Empezar ${item.title}">${icon("play", "fill")}<span>Empezar</span></button>`;

function recoCard(a) {
  let body;
  if (a.mode === "sinNag") {
    body = html`<div class="reco-msg">Disfruta este momento. No hace falta que hagas nada más ahora.</div>`;
  } else if (a.mode === "enfocado") {
    body = html`<div class="reco-msg">Sigue así, estás en lo tuyo.</div>`;
  } else if (a.mode === "noche") {
    body = html`<div class="reco-msg">Es tarde. Lo mejor que puedes hacer ahora es dormir bien.</div>`;
  } else {
    const intro =
      a.mode === "baja"
        ? a.windowMin != null
          ? html`<p class="reco-intro">Estás ${a.ctxKey === "clase" ? "en clase" : "en el trabajo"}. En unos <b>${fmtDuration(a.windowMin)}</b> tendrás espacio libre.</p>`
          : html`<p class="reco-intro">Estás ${a.ctxKey === "clase" ? "en clase" : "en el trabajo"} y no tienes más bloques después.</p>`
        : a.windowMin != null
          ? html`<p class="reco-intro">${a.actual ? "Este bloque dura" : "Tienes unos"} <b>${fmtDuration(a.windowMin)}</b>${a.actual ? "" : a.next ? html` antes de <b>${a.next.block.title}</b>` : ""}.</p>`
          : html`<p class="reco-intro">Tienes el resto del día libre.</p>`;

    const p = a.primary;
    body = html`${intro}
      ${p
        ? html`<div class="reco-primary">
            <span class="reco-icon">${p.icon}</span>
            <div class="reco-text">
              <b>${p.title}</b>
              <small>${ATTN_DOT[p.attention]} atención ${p.attention} · ~${p.duration} min${p.subtitle ? " · " + p.subtitle : ""}</small>
            </div>
            ${startBtn(p, "")}
          </div>`
        : html`<div class="reco-msg">También puedes simplemente descansar.</div>`}
      ${a.alts.length
        ? html`<p class="reco-or">O si prefieres:</p>
            <ul class="reco-alts">${a.alts.map(
              (x) => html`<li><span>${x.icon} ${x.title}</span><small>${x.duration} min</small>
                <button class="icon-btn" type="button" data-act="focus.start" data-title="${x.title}" data-min="${x.duration}" aria-label="Empezar ${x.title}">${icon("play", "fill")}</button></li>`
            )}</ul>`
        : ""}
      ${a.postponed.length && a.mode === "baja"
        ? html`<div class="callout warn">Esto puede esperar: <b>${a.postponed[0].title}</b>${a.postponed[0].materia ? ` (${a.postponed[0].materia})` : ""}. Necesita más concentración de la que puedes darle ahora.</div>`
        : ""}`;
  }
  return html`<section class="card reco-card o2"><header class="card-head"><h2>${icon("bolt")}Qué hacer ahora</h2></header>${body}</section>`;
}

function kpis() {
  const m = moneySummary();
  const pend = rows("tasks").filter((t) => t.status !== "completada");
  const today = dateKey();
  const venc = pend.filter((t) => t.due_date && t.due_date < today).length;
  const e = entrenoInfo();
  return html`<div class="kpis o3">
    <a class="stat" href="#/dinero/resumen"><span>${icon("wallet")}Saldo</span><b class="${m.balance < 0 ? "neg" : ""}">${money(m.balance)}</b><small>disponible</small></a>
    <a class="stat ${venc ? "neg" : ""}" href="#/estudio/tareas"><span>${icon("book")}Tareas</span><b>${pend.length}</b><small>${venc ? `${venc} vencida(s)` : "pendientes"}</small></a>
    <a class="stat" href="#/entreno/progreso"><span>${icon("dumbbell")}Entreno</span><b>${e.doneThisWeek}${e.plannedThisWeek ? html`<em>/${e.plannedThisWeek}</em>` : ""}</b><small>esta semana</small></a>
    <a class="stat ${e.streak ? "hot" : ""}" href="#/entreno/progreso"><span>${icon("flame")}Racha</span><b>${e.streak}</b><small>semana(s)</small></a>
  </div>`;
}

function tasksCard() {
  const today = dateKey();
  const list = rows("tasks")
    .filter((t) => t.status !== "completada")
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))
    .slice(0, 5);
  return html`<section class="card o4">
    <header class="card-head"><h2>Próximas tareas</h2>${tareas.addButton("Tarea", "ghost")}</header>
    ${list.length
      ? html`<ul class="rows">${list.map((t) => {
          const rel = t.due_date ? relDate(t.due_date, today) : null;
          const materia = (rows("subjects").find((s) => s.id === t.subject_id) || {}).name;
          return html`<li class="row">
            <button class="check" type="button" data-act="task.toggle" data-id="${t.id}" aria-label="Marcar completada">${icon("check")}</button>
            <div class="row-main"><b>${t.title}</b><small>${materia ? html`<span class="tag">${materia}</span>` : ""}${rel ? html`<span class="due ${rel.tone}">${rel.text}</span>` : ""}</small></div>
          </li>`;
        })}</ul>
        <a class="link-more" href="#/estudio/tareas">Ver todas ${icon("chevron")}</a>`
      : emptyState({ title: "Sin tareas pendientes 🎉" })}
  </section>`;
}

function agendaCard(a) {
  const now = new Date();
  const blocks = rows("schedule_blocks").filter((b) => b.day_of_week === a.dayKey).sort((x, y) => x.start_time.localeCompare(y.start_time));
  return html`<section class="card o5">
    <header class="card-head"><h2>Tu día</h2><a class="btn sm ghost" href="#/tiempo/semana">Ver semana</a></header>
    ${agenda(blocks, nowMinutes(now), { empty: "No tienes bloques agendados hoy." })}
  </section>`;
}

function trainCard() {
  const e = entrenoInfo();
  if (!e.routineToday && !rows("workout_routines").length) return "";
  return html`<section class="card o6 entreno-card">
    <header class="card-head"><h2>${icon("dumbbell")}Entreno de hoy</h2><a class="btn sm ghost" href="#/entreno/hoy">Abrir</a></header>
    ${e.routineToday
      ? html`<div class="routine-hero"><b>${e.routineToday.name}</b><span>${e.exercisesCount} ejercicio(s)${e.trainedToday ? " · ya lo hiciste ✓" : ""}</span></div>`
      : html`<p class="hint top">Hoy no tienes rutina fija.</p>`}
    <div class="week-dots">${e.dots.map(
      (d) => html`<div class="wd${d.done ? " done" : ""}${d.planned ? " planned" : ""}${d.isToday ? " today" : ""}"><i>${d.done ? icon("check") : ""}</i><span>${d.key.slice(0, 1).toUpperCase()}</span></div>`
    )}</div>
  </section>`;
}

function goalCard() {
  const g = goalProgress();
  if (!g) return "";
  return html`<section class="card o7">
    <header class="card-head"><h2>${icon("target")}Meta de ahorro</h2><a class="btn sm ghost" href="#/dinero/ahorro">Ver</a></header>
    <div class="goal-line"><b>${money(g.saved)}</b><span>de ${money(g.goal.target_amount)} · ${g.pct}%</span></div>
    ${meter(g.pct)}
    ${g.porSemana ? html`<p class="hint">Ahorra unos <b>${money(g.porSemana)}</b> por semana para llegar a tiempo.</p>` : ""}
  </section>`;
}

function aulaBanner() {
  const r = aulaReminder();
  if (!r.row || !r.due) return "";
  return html`<a class="banner o0" href="#/estudio/aula">${icon("bell")}<span><b>Revisa Aula Extendida</b>${r.hours != null ? ` · hace ${r.hours} h que no la miras` : ""}</span>${icon("chevron")}</a>`;
}

export default {
  id: "inicio", label: "Inicio", icon: "home", accent: "inicio", subs: null,
  tables: ["schedule_blocks", "subjects", "tasks", "income", "expenses", "savings", "financial_goals", "workout_routines", "workout_exercises", "workout_sessions", "user_context", "reminders"],
  render() {
    const a = analyze({
      blocks: rows("schedule_blocks"), subjects: rows("subjects"), tasks: rows("tasks"),
      routines: rows("workout_routines"), sessions: rows("workout_sessions"), manualContext: manualContext()
    });
    return html`<div class="home">
      ${aulaBanner()}
      <div class="home-col main">${nowCard(a)}${recoCard(a)}${agendaCard(a)}</div>
      <div class="home-col side">${kpis()}${tasksCard()}${trainCard()}${goalCard()}</div>
    </div>`;
  }
};

onActs({
  "ctx.toggle": () => { ctxOpen = !ctxOpen; view.rerender(); },
  // user_context tiene una sola fila por usuario y su clave primaria es user_id (no tiene "id"),
  // así que se escribe siempre con upsert.
  "ctx.set": async (el) => {
    ctxOpen = false;
    await upsert("user_context", { context: el.dataset.key, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  },
  "ctx.clear": async () => {
    ctxOpen = false;
    await upsert("user_context", { context: null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  },
  "focus.start": (el) => startFocus({ title: el.dataset.title, minutes: Number(el.dataset.min) })
});
