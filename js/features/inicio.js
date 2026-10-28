// INICIO: responde "¿qué debería estar haciendo ahora?" cruzando horario, tareas, dinero y entreno.
import { html, dateKey, fmtDuration, hhmm, relDate, money, nowMinutes, minutesOf, minToHHMM, addDays, dayKeyOf, daysBetween } from "../core/utils.js";
import { rows, upsert } from "../core/store.js";
import { cancelledSet } from "../core/cancellations.js";
import { onActs } from "../core/actions.js";
import { view } from "../core/view.js";
import { analyze, contextLabel, blocksOf } from "../core/recommend.js";
import { icon } from "../ui/icons.js";
import { emptyState } from "../ui/crud.js";
import { agenda } from "../ui/timeline.js";
import { meter } from "../ui/charts.js";
import { CONTEXTS, CAT_LABEL, ATTN_DOT } from "../data/defaults.js";
import { moneySummary, goalProgress, todayBudget } from "./dinero.js";
import { entrenoInfo, quickTrainCard } from "./entreno.js";
import { aulaReminder, tareas, taskKind } from "./estudio.js";
import { buildPlan } from "./tiempo.js";
import { habitsCard } from "./habitos.js";
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
  // Clases canceladas hoy que aún no terminan: se avisa cuánto tiempo libre se ganó
  const nowMin = nowMinutes(new Date());
  const today = dateKey();
  const freed = a.cancelledToday.filter((b) => minutesOf(b.end_time) > nowMin);
  const cancelNotes = freed.length
    ? html`<div class="cancel-notes">${freed.map(
        (b) => html`<div class="callout ok"><b>Se canceló ${b.title}</b>
          <p>${hhmm(b.start_time)}–${hhmm(b.end_time)} · ganaste ${fmtDuration(minutesOf(b.end_time) - Math.max(minutesOf(b.start_time), nowMin))} libres.
            <button class="link-btn" type="button" data-act="block.restore" data-id="${b.id}" data-date="${today}">Restaurar</button></p></div>`
      )}</div>`
    : "";
  return html`<section class="card reco-card o2"><header class="card-head"><h2>${icon("bolt")}Qué hacer ahora</h2></header>${cancelNotes}${body}</section>`;
}

function kpis() {
  const b = todayBudget();
  const pend = rows("tasks").filter((t) => t.status !== "completada");
  const today = dateKey();
  const venc = pend.filter((t) => t.due_date && t.due_date < today).length;
  const e = entrenoInfo();
  return html`<div class="kpis o3">
    <a class="stat ${b.queda < 0 ? "neg" : ""}" href="#/dinero/resumen"><span>${icon("wallet")}Hoy puedes</span><b>${money(Math.max(0, b.queda))}</b><small>${b.queda < 0 ? `te pasaste ${money(-b.queda)}` : `gastar · de ${money(b.porDia)}`}</small></a>
    <a class="stat ${venc ? "neg" : ""}" href="#/estudio/tareas"><span>${icon("book")}Tareas</span><b>${pend.length}</b><small>${venc ? `${venc} vencida(s)` : "pendientes"}</small></a>
    <a class="stat" href="#/entreno/progreso"><span>${icon("dumbbell")}Entreno</span><b>${e.doneThisWeek}${e.plannedThisWeek ? html`<em>/${e.plannedThisWeek}</em>` : ""}</b><small>esta semana</small></a>
    <a class="stat ${e.dayStreak ? "hot" : ""}" href="#/entreno/hoy"><span>${icon("flame")}Racha</span><b>${e.dayStreak}</b><small>día(s) entrenando</small></a>
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
  // Aquí van todos los bloques de hoy, también los cancelados (tachados, con opción de restaurar)
  const blocks = rows("schedule_blocks").filter((b) => b.day_of_week === a.dayKey).sort((x, y) => x.start_time.localeCompare(y.start_time));
  return html`<section class="card o5">
    <header class="card-head"><h2>Tu día</h2><a class="btn sm ghost" href="#/tiempo/semana">Ver semana</a></header>
    ${agenda(blocks, nowMinutes(now), { empty: "No tienes bloques agendados hoy.", cancelled: cancelledSet(), date: dateKey(now) })}
  </section>`;
}

function trainCard() {
  const e = entrenoInfo();
  if (!e.routineToday) return "";
  return html`<section class="card o6 entreno-card">
    <header class="card-head"><h2>${icon("dumbbell")}Entreno de hoy</h2><a class="btn sm ghost" href="#/entreno/hoy">Abrir</a></header>
    ${e.routineToday
      ? html`<div class="routine-hero"><b>${e.routineToday.name}</b><span>${e.exercisesCount} ejercicio(s)${e.trainedToday ? " · ya lo hiciste ✓" : ""}</span></div>`
      : ""}
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

// Lo que el Planificador te acomodó hoy en tus huecos libres
function planCard() {
  const hoy = buildPlan().days[0];
  const items = hoy ? hoy.gaps.flatMap((g) => g.placed) : [];
  if (!items.length) return "";
  return html`<section class="card o4">
    <header class="card-head"><h2>${icon("calendar")}Plan de hoy</h2><a class="btn sm ghost" href="#/tiempo/plan">Ver plan</a></header>
    <ul class="plan-today">${items.slice(0, 4).map(
      (p) => html`<li><b>${minToHHMM(p.s)}</b><span>${p.title}<small>${p.kind} · ${fmtDuration(p.dur)}</small></span>
        <button class="icon-btn" type="button" data-act="focus.start" data-title="${p.title}" data-min="${Math.min(p.dur, 50)}" aria-label="Empezar ${p.title}">${icon("play", "fill")}</button></li>`
    )}</ul>
  </section>`;
}

// Parciales y quices de los próximos 3 días
function examBanner() {
  const hoy = dateKey();
  const list = rows("tasks").filter((t) => t.status !== "completada" && t.due_date && ["parcial", "quiz"].includes(taskKind(t)))
    .map((t) => ({ t, d: daysBetween(hoy, t.due_date) })).filter((x) => x.d >= 0 && x.d <= 3)
    .sort((a, b) => a.d - b.d);
  if (!list.length) return "";
  const { t, d } = list[0];
  return html`<a class="banner warn o0" href="#/estudio/tareas">${icon("alert")}<span><b>${t.title}</b> · ${d === 0 ? "es hoy" : d === 1 ? "es mañana" : `en ${d} días`}${list.length > 1 ? ` (y ${list.length - 1} más)` : ""}</span>${icon("chevron")}</a>`;
}

// Cuánto vas a dormir esta noche: desde que termina lo de hoy (mínimo 10 p. m.) + 30 min
// hasta el primer bloque de mañana. Solo se muestra en la tarde y si son menos de 6,5 h.
export function sleepTonight(now = new Date()) {
  const blocks = rows("schedule_blocks");
  const cancelled = cancelledSet();
  const man = addDays(now, 1);
  const deMan = blocksOf(blocks, dayKeyOf(man), cancelled, dateKey(man));
  if (!deMan.length) return null;
  const deHoy = blocksOf(blocks, dayKeyOf(now), cancelled, dateKey(now));
  const acuesto = Math.max(22 * 60, ...deHoy.map((b) => minutesOf(b.end_time))) + 30;
  const levanto = minutesOf(deMan[0].start_time);
  return { horas: (24 * 60 - acuesto + levanto) / 60, levanto, primero: deMan[0] };
}

function sleepCard() {
  if (new Date().getHours() < 17) return "";
  const s = sleepTonight();
  if (!s || s.horas >= 6.5) return "";
  const h = String(Math.max(0, Math.round(s.horas * 2) / 2)).replace(".", ",");
  return html`<div class="callout warn sleep-note o1"><b>😴 Hoy vas a dormir unas ${h} h</b><p>Mañana arrancas a las ${minToHHMM(s.levanto)} con ${s.primero.title.split("(")[0].trim()}. Deja la ropa y la mochila listas y acuéstate apenas llegues.</p></div>`;
}

function aulaBanner() {
  const r = aulaReminder();
  if (!r.row || !r.due) return "";
  return html`<a class="banner o0" href="#/estudio/aula">${icon("bell")}<span><b>Revisa Aula Extendida</b>${r.hours != null ? ` · hace ${r.hours} h que no la miras` : ""}</span>${icon("chevron")}</a>`;
}

export default {
  id: "inicio", label: "Inicio", icon: "home", accent: "inicio", subs: null,
  tables: ["schedule_blocks", "schedule_exceptions", "subjects", "tasks", "income", "expenses", "savings", "financial_goals", "recurring_expenses", "workout_routines", "workout_exercises", "workout_sessions", "user_context", "reminders", "activities", "habits", "habit_logs"],
  render() {
    const a = analyze({
      blocks: rows("schedule_blocks"), subjects: rows("subjects"), tasks: rows("tasks"),
      routines: rows("workout_routines"), sessions: rows("workout_sessions"), manualContext: manualContext(),
      cancelled: cancelledSet()
    });
    return html`<div class="home">
      ${examBanner()}${aulaBanner()}
      <div class="home-col main">${nowCard(a)}${sleepCard()}${recoCard(a)}${planCard()}${agendaCard(a)}</div>
      <div class="home-col side">${kpis()}${tasksCard()}${habitsCard("o5")}${quickTrainCard("o6")}${trainCard()}${goalCard()}</div>
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
