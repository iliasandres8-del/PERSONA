// HÁBITOS: cosas pequeñas de todos los días (agua, dormir temprano, leer) con un check diario y su racha.
import { html, dateKey, addDays } from "../core/utils.js";
import { rows, insert, remove } from "../core/store.js";
import { onActs } from "../core/actions.js";
import { icon } from "../ui/icons.js";
import { defineCrud, emptyState } from "../ui/crud.js";

const ICONOS = ["✅", "💧", "😴", "📖", "🏃", "🧘", "🍎", "📵", "🇺🇸", "💻", "🙏", "🦷"];

const logKey = (habitId, day) => `${habitId}|${day}`;
const logSet = () => new Set(rows("habit_logs").map((l) => logKey(l.habit_id, String(l.log_date).slice(0, 10))));
export const activeHabits = () => rows("habits").filter((h) => h.active).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

// Días seguidos cumplidos. Si hoy todavía no lo marcas, la racha cuenta desde ayer.
export function habitStreak(habitId, done = logSet()) {
  let d = new Date();
  if (!done.has(logKey(habitId, dateKey(d)))) d = addDays(d, -1);
  let n = 0;
  while (done.has(logKey(habitId, dateKey(d)))) { n++; d = addDays(d, -1); }
  return n;
}

export function habitsToday() {
  const done = logSet();
  const hoy = dateKey();
  return activeHabits().map((h) => ({ ...h, doneToday: done.has(logKey(h.id, hoy)), streak: habitStreak(h.id, done) }));
}

export const habitos = defineCrud({
  key: "habitos", table: "habits", accent: "entreno", addLabel: "Nuevo hábito", editLabel: "Editar hábito",
  fields: () => [
    { name: "name", label: "Hábito", type: "text", required: true, placeholder: "Ej: Tomar 2 litros de agua" },
    { name: "icon", label: "Ícono", type: "select", options: ICONOS.map((i) => ({ v: i, l: i })), default: "✅", half: true },
    { name: "active", label: "Estado", type: "select", options: [{ v: "true", l: "Activo" }, { v: "false", l: "En pausa" }], default: "true", half: true }
  ],
  fromRow: (h) => ({ ...h, active: String(h.active) }),
  toRow: (v) => ({ ...v, active: v.active !== "false" }),
  deleteMessage: (h) => `Se eliminará "${h.name}" con todo su historial.`,
  row: (h) => ({
    className: h.active ? "" : "done",
    title: html`${h.icon} ${h.name}`,
    sub: h.active ? `Racha: ${habitStreak(h.id)} día(s)` : "En pausa"
  })
});

// Tarjeta con los checks de hoy (la usan Inicio y Entreno)
export function habitsCard(cls = "") {
  const list = habitsToday();
  const hechos = list.filter((h) => h.doneToday).length;
  return html`<section class="card ${cls}">
    <header class="card-head"><h2>${icon("check")}Hábitos de hoy${list.length ? html` <span class="count">${hechos}/${list.length}</span>` : ""}</h2><a class="btn sm ghost" href="#/entreno/habitos">Editar</a></header>
    ${list.length
      ? html`<ul class="habit-list">${list.map(
          (h) => html`<li><button class="habit${h.doneToday ? " on" : ""}" type="button" data-act="habit.toggle" data-id="${h.id}" aria-pressed="${h.doneToday}">
            <span class="habit-ic">${h.icon}</span><span class="habit-name">${h.name}</span>
            ${h.streak ? html`<span class="habit-streak">🔥 ${h.streak}</span>` : ""}
            <i class="habit-check">${icon("check")}</i></button></li>`
        )}</ul>`
      : emptyState({ title: "Sin hábitos", text: "Agrega algo pequeño que quieras hacer todos los días.", action: habitos.addButton() })}
  </section>`;
}

export function habitosView() {
  const all = rows("habits").slice().sort((a, b) => Number(b.active) - Number(a.active) || String(a.created_at).localeCompare(String(b.created_at)));
  return html`${habitsCard()}
    <section class="card">
      <header class="card-head"><h2>Mis hábitos</h2>${habitos.addButton()}</header>
      <p class="hint top">Pocos y fáciles funcionan mejor que muchos. Si uno no te sirve, ponlo en pausa.</p>
      ${habitos.list(all)}
    </section>`;
}

onActs({
  "habit.toggle": async (el) => {
    const hoy = dateKey();
    const log = rows("habit_logs").find((l) => l.habit_id === el.dataset.id && String(l.log_date).slice(0, 10) === hoy);
    el.disabled = true;
    if (log) await remove("habit_logs", log.id);
    else await insert("habit_logs", { habit_id: el.dataset.id, log_date: hoy });
  }
});
