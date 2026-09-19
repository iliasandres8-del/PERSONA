// DINERO: resumen mensual con gráfico, movimientos, ahorro y meta, deudas y gastos fijos.
import {
  html, raw, dateKey, monthKey, monthLabel, shiftMonth, sum, money, fmtDateShort, relDate, daysBetween,
  addDays, MESES, cap
} from "../core/utils.js";
import { rows, insert, update, findById } from "../core/store.js";
import { onActs } from "../core/actions.js";
import { view } from "../core/view.js";
import { settings } from "../core/settings.js";
import { icon } from "../ui/icons.js";
import { defineCrud, emptyState } from "../ui/crud.js";
import { openForm } from "../ui/form.js";
import { toast } from "../ui/toast.js";
import { columnChart, hBars, meter } from "../ui/charts.js";
import { GASTO_CATEGORIAS, FUGAS } from "../data/defaults.js";

let month = monthKey();
let movFilter = "todos";
let showPaid = false;

// ---------- Cálculos (también los usa Inicio) ----------
export function moneySummary() {
  const income = sum(rows("income"), (x) => x.amount);
  const expenses = sum(rows("expenses"), (x) => x.amount);
  const saved = sum(rows("savings"), (x) => x.amount);
  return { income, expenses, saved, balance: income - expenses - saved };
}
export function goalProgress() {
  const goals = rows("financial_goals").slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const goal = goals[0] || null;
  const saved = sum(rows("savings"), (x) => x.amount);
  if (!goal) return null;
  const target = Number(goal.target_amount) || 1;
  const pct = Math.min(100, Math.round((saved / target) * 100));
  const falta = Math.max(0, target - saved);
  let dias = null, porSemana = null;
  if (goal.target_date) {
    dias = daysBetween(dateKey(), goal.target_date);
    if (dias > 0) porSemana = Math.ceil(falta / (dias / 7) / 1000) * 1000;
  }
  return { goal, saved, pct, falta, dias, porSemana };
}
const inMonth = (d, key) => String(d || "").slice(0, 7) === key;
const monthTotals = (key) => ({
  income: sum(rows("income").filter((x) => inMonth(x.entry_date, key)), (x) => x.amount),
  expenses: sum(rows("expenses").filter((x) => inMonth(x.entry_date, key)), (x) => x.amount)
});

// ---------- CRUDs ----------
const ingresos = defineCrud({
  key: "ingresos", table: "income", accent: "dinero", addLabel: "Nuevo ingreso", editLabel: "Editar ingreso",
  fields: () => [
    { name: "description", label: "Descripción", type: "text", placeholder: "Ej: Trabajo, mesada" },
    { name: "amount", label: "Monto", type: "number", required: true, half: true },
    { name: "entry_date", label: "Fecha", type: "date", default: "today", required: true, half: true }
  ],
  row: (i) => ({ title: i.description || "Ingreso", sub: fmtDateShort(i.entry_date), side: "+" + money(i.amount), tone: "pos" })
});

const gastos = defineCrud({
  key: "gastos", table: "expenses", accent: "dinero", addLabel: "Nuevo gasto", editLabel: "Editar gasto",
  fields: () => [
    { name: "description", label: "Descripción", type: "text", placeholder: "Ej: Almuerzo, pasaje" },
    { name: "category", label: "Categoría", type: "select", options: GASTO_CATEGORIAS.map((c) => ({ v: c, l: c })), default: "Otro", required: true },
    { name: "amount", label: "Monto", type: "number", required: true, half: true },
    { name: "entry_date", label: "Fecha", type: "date", default: "today", required: true, half: true }
  ],
  row: (g) => ({
    title: g.description || g.category || "Gasto",
    sub: [fmtDateShort(g.entry_date), g.category].filter(Boolean).join(" · "),
    side: "−" + money(g.amount)
  })
});

const ahorros = defineCrud({
  key: "ahorros", table: "savings", accent: "dinero", addLabel: "Nuevo ahorro", editLabel: "Editar ahorro",
  fields: () => [
    { name: "amount", label: "Monto", type: "number", required: true, half: true },
    { name: "entry_date", label: "Fecha", type: "date", default: "today", required: true, half: true },
    { name: "note", label: "Nota", type: "text", placeholder: "Opcional" }
  ],
  row: (a) => ({ title: money(a.amount), sub: [fmtDateShort(a.entry_date), a.note].filter(Boolean).join(" · ") })
});

const deudas = defineCrud({
  key: "deudas", table: "debts", accent: "dinero", addLabel: "Nueva deuda", editLabel: "Editar deuda",
  fields: () => [
    { name: "description", label: "Descripción", type: "text", required: true, placeholder: "Ej: Celular" },
    { name: "amount", label: "Monto", type: "number", required: true, half: true },
    { name: "due_date", label: "Fecha límite", type: "date", half: true }
  ],
  toRow: (v, item) => (item ? v : { ...v, paid: false }),
  deleteMessage: (d) => `Se eliminará la deuda "${d.description}".`,
  row: (d) => {
    const rel = d.due_date ? relDate(d.due_date) : null;
    return {
      className: d.paid ? "done" : "",
      title: d.description,
      sub: d.paid ? `Pagada${d.paid_date ? " el " + fmtDateShort(d.paid_date) : ""}` : rel ? `Vence: ${rel.text}` : "Sin fecha límite",
      side: money(d.amount),
      tone: !d.paid && rel && rel.tone === "danger" ? "neg" : "",
      actions: d.paid ? "" : html`<button class="btn sm ghost" type="button" data-act="din.pay" data-id="${d.id}">Pagar</button>`
    };
  }
});

const FREQ = { mensual: "Mensual", semanal: "Semanal", anual: "Anual" };
function nextDue(r) {
  if (r.frequency !== "mensual" || !r.due_day) return null;
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), r.due_day);
  if (dateKey(d) < dateKey(now)) d = new Date(now.getFullYear(), now.getMonth() + 1, r.due_day);
  return dateKey(d);
}
const fijos = defineCrud({
  key: "fijos", table: "recurring_expenses", accent: "dinero", addLabel: "Nuevo gasto fijo", editLabel: "Editar gasto fijo",
  fields: () => [
    { name: "description", label: "Descripción", type: "text", required: true, placeholder: "Ej: Plan de datos" },
    { name: "amount", label: "Monto", type: "number", required: true, half: true },
    { name: "frequency", label: "Frecuencia", type: "select", options: Object.entries(FREQ).map(([v, l]) => ({ v, l })), default: "mensual", required: true, half: true },
    { name: "due_day", label: "Día de pago (opcional)", type: "number", step: "1" }
  ],
  toRow: (v) => ({ ...v, due_day: v.due_day ? Math.round(v.due_day) : null }),
  row: (r) => {
    const nd = nextDue(r);
    const rel = nd ? relDate(nd) : null;
    return {
      title: r.description,
      sub: [FREQ[r.frequency] || r.frequency, r.due_day ? `día ${r.due_day}` : null, rel ? `próximo: ${rel.text}` : null].filter(Boolean).join(" · "),
      side: money(r.amount),
      tone: rel && rel.diff <= 3 ? "warn" : ""
    };
  }
});

// ---------- Piezas ----------
const stat = (label, value, small = "", tone = "") =>
  html`<div class="stat ${tone}"><span>${label}</span><b>${value}</b>${small ? html`<small>${small}</small>` : ""}</div>`;

function monthNav() {
  const isNow = month >= monthKey();
  return html`<div class="month-nav">
    <button class="icon-btn" type="button" data-act="din.month" data-d="-1" aria-label="Mes anterior">${icon("chevronL")}</button>
    <b>${monthLabel(month)}</b>
    <button class="icon-btn" type="button" data-act="din.month" data-d="1" aria-label="Mes siguiente"${isNow ? raw(" disabled") : ""}>${icon("chevron")}</button>
  </div>`;
}

// ---------- Resumen ----------
function resumenView() {
  const sum_ = moneySummary();
  const mt = monthTotals(month);
  const goal = goalProgress();

  // Últimos 6 meses terminando en el mes elegido
  const items = [];
  for (let i = 5; i >= 0; i--) {
    const k = shiftMonth(month, -i);
    const t = monthTotals(k);
    const m = Number(k.split("-")[1]);
    items.push({
      label: cap(MESES[m - 1].slice(0, 3)),
      values: [t.income, t.expenses],
      tip: `${monthLabel(k)}\nIngresos: ${money(t.income)}\nGastos: ${money(t.expenses)}`
    });
  }
  const hasHistory = items.some((i) => i.values.some((v) => v > 0));

  // Gastos por categoría del mes
  const monthExp = rows("expenses").filter((x) => inMonth(x.entry_date, month));
  const porCat = {};
  monthExp.forEach((g) => { const c = g.category || "Sin categoría"; porCat[c] = (porCat[c] || 0) + Number(g.amount || 0); });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const fuga = sum(cats.filter(([c]) => FUGAS.includes(c)), ([, v]) => v);
  const fugaMitad = Math.round((fuga * 0.5) / 1000) * 1000;

  return html`
    <div class="hero-row">
      <div class="hero-num"><span>Saldo disponible</span><b>${money(sum_.balance)}</b><small>Ingresos − gastos − ahorros (todo el tiempo)</small></div>
      ${monthNav()}
    </div>

    <div class="grid-3">
      ${stat("Ingresos", money(mt.income), "", "pos")}
      ${stat("Gastos", money(mt.expenses), "", "neg")}
      ${stat("Neto", money(mt.income - mt.expenses), mt.income ? `Gastaste el ${Math.round((mt.expenses / mt.income) * 100)}% de lo que entró` : "", mt.income - mt.expenses < 0 ? "neg" : "pos")}
    </div>

    <section class="card">
      <header class="card-head"><h2>Ingresos vs. gastos · 6 meses</h2></header>
      ${hasHistory
        ? columnChart({
            items,
            series: [{ name: "Ingresos", color: "var(--series-1)" }, { name: "Gastos", color: "var(--series-2)" }],
            ariaLabel: "Ingresos y gastos de los últimos seis meses"
          })
        : emptyState({ title: "Todavía no hay historial", text: "Registra ingresos y gastos para ver la comparación mensual." })}
    </section>

    <section class="card">
      <header class="card-head"><h2>Gastos por categoría</h2><span class="muted">${monthLabel(month)}</span></header>
      ${cats.length
        ? hBars({
            items: cats.map(([c, v]) => ({ label: c, value: v, tip: `${c}: ${money(v)} (${Math.round((v / mt.expenses) * 100)}%)` })),
            format: money
          })
        : emptyState({ title: "Sin gastos este mes" })}
      ${fuga > 0
        ? html`<div class="callout warn"><b>${money(fuga)} en salidas y compras</b>
            <p>Si ahorraras la mitad (${money(fugaMitad)}) irías más rápido hacia tu meta.</p></div>`
        : ""}
    </section>

    ${goal
      ? html`<section class="card">
          <header class="card-head"><h2>Meta de ahorro</h2><button class="btn sm ghost" type="button" data-act="din.goal">Editar</button></header>
          <div class="goal-line"><b>${money(goal.saved)}</b><span>de ${money(goal.goal.target_amount)} · ${goal.pct}%</span></div>
          ${meter(goal.pct)}
        </section>`
      : ""}`;
}

// ---------- Movimientos ----------
function movimientosView() {
  const inc = rows("income").filter((x) => inMonth(x.entry_date, month)).map((x) => ({ ...x, _t: "i" }));
  const exp = rows("expenses").filter((x) => inMonth(x.entry_date, month)).map((x) => ({ ...x, _t: "g" }));
  let list = [];
  if (movFilter !== "gastos") list.push(...inc);
  if (movFilter !== "ingresos") list.push(...exp);
  list.sort((a, b) => b.entry_date.localeCompare(a.entry_date) || String(b.created_at || "").localeCompare(String(a.created_at || "")));

  const groups = [];
  list.forEach((m) => {
    let g = groups[groups.length - 1];
    if (!g || g.date !== m.entry_date) { g = { date: m.entry_date, items: [] }; groups.push(g); }
    g.items.push(m);
  });
  const today = dateKey();
  const dayLabel = (d) => (d === today ? "Hoy" : d === dateKey(addDays(new Date(), -1)) ? "Ayer" : fmtDateShort(d));

  const jornal = settings.get("jornal");
  return html`
    <section class="card">
      <header class="card-head">
        <h2>Movimientos</h2>
        <div class="head-actions">${monthNav()}</div>
      </header>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Filtrar">${["todos", "ingresos", "gastos"].map(
          (f) => html`<button type="button" class="${movFilter === f ? "on" : ""}" data-act="din.filter" data-f="${f}">${cap(f)}</button>`
        )}</div>
        <div class="head-actions">
          ${jornal ? html`<button class="btn sm ghost" type="button" data-act="din.jornal">${icon("bolt")}<span>Trabajé hoy (+${money(jornal)})</span></button>` : ""}
          ${ingresos.addButton("Ingreso", "ghost")}
          ${gastos.addButton("Gasto")}
        </div>
      </div>
      ${groups.length
        ? groups.map(
            (g) => html`<h3 class="day-h">${dayLabel(g.date)}</h3>
              <ul class="rows">${g.items.map((m) => (m._t === "i" ? ingresos.rowHtml(m) : gastos.rowHtml(m)))}</ul>`
          )
        : emptyState({ title: "Nada registrado en este periodo", text: "Usa los botones de arriba para agregar un ingreso o un gasto." })}
      ${groups.length ? html`<p class="hint">Total del periodo: <b>${money(sum(inc, (x) => x.amount) - sum(exp, (x) => x.amount))}</b> (ingresos − gastos)</p>` : ""}
    </section>`;
}

// ---------- Ahorro ----------
function ahorroHoy() {
  const hoy = dateKey();
  const inc = sum(rows("income").filter((x) => x.entry_date === hoy), (x) => x.amount);
  const exp = sum(rows("expenses").filter((x) => x.entry_date === hoy), (x) => x.amount);
  if (inc === 0) return html`<p class="empty small">Registra un ingreso de hoy para ver cuánto te conviene ahorrar.</p>`;
  const disponible = inc - exp;
  const rec = Math.max(0, Math.round((disponible * 0.5) / 1000) * 1000);
  return html`<div class="grid-2">
      ${stat("Recibiste hoy", money(inc), "", "pos")}
      ${stat("Gastaste hoy", money(exp), "", "neg")}
      ${stat("Ahorro recomendado", money(rec), "El 50% de lo que te queda")}
      ${stat("Libre para gastar", money(disponible - rec))}
    </div>
    ${rec > 0 ? html`<button class="btn sm primary block" type="button" data-act="din.saveToday" data-amount="${rec}">${icon("target")}<span>Guardar ${money(rec)} como ahorro</span></button>` : ""}`;
}

function ahorroView() {
  const g = goalProgress();
  const list = rows("savings").slice().sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  return html`
    <section class="card">
      <header class="card-head"><h2>Meta de ahorro</h2><button class="btn sm ${g ? "ghost" : "primary"}" type="button" data-act="din.goal">${g ? "Editar meta" : "Definir meta"}</button></header>
      ${g
        ? html`<div class="goal-line"><b>${money(g.saved)}</b><span>de ${money(g.goal.target_amount)} · ${g.pct}%</span></div>
            ${meter(g.pct)}
            <p class="hint">Faltan <b>${money(g.falta)}</b>.
              ${g.dias == null ? "" : g.dias > 0 ? html`Quedan ${g.dias} días: necesitas ahorrar unos <b>${money(g.porSemana)}</b> por semana.` : html`<span class="neg">La fecha objetivo ya pasó.</span>`}</p>`
        : emptyState({ title: "Aún no defines una meta", text: "Ponle un monto y una fecha para saber cuánto ahorrar por semana." })}
    </section>
    <section class="card">
      <header class="card-head"><h2>Ahorro inteligente de hoy</h2></header>
      ${ahorroHoy()}
    </section>
    <section class="card">
      <header class="card-head"><h2>Ahorros</h2>${ahorros.addButton()}</header>
      <p class="hint top">Lo que metas aquí se descuenta de tu saldo disponible.</p>
      ${ahorros.list(list, { empty: emptyState({ title: "Sin ahorros registrados", action: ahorros.addButton() }) })}
    </section>`;
}

// ---------- Deudas ----------
function deudasView() {
  const all = rows("debts");
  const pend = all.filter((d) => !d.paid).sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const paid = all.filter((d) => d.paid).sort((a, b) => String(b.paid_date).localeCompare(String(a.paid_date)));
  return html`
    <div class="grid-2">
      ${stat("Total pendiente", money(sum(pend, (d) => d.amount)), `${pend.length} deuda(s) por pagar`, pend.length ? "neg" : "")}
      ${stat("Ya pagado", money(sum(paid, (d) => d.amount)), `${paid.length} deuda(s) saldada(s)`, "pos")}
    </div>
    <section class="card">
      <header class="card-head"><h2>Deudas por pagar</h2>${deudas.addButton()}</header>
      <p class="hint top">Al pagar una deuda se registra como gasto (categoría "Deuda") y se descuenta de tu saldo.</p>
      ${deudas.list(pend, { empty: emptyState({ title: "No tienes deudas pendientes 🎉", action: deudas.addButton() }) })}
    </section>
    ${paid.length
      ? html`<section class="card">
          <header class="card-head"><h2>Pagadas</h2><button class="btn sm ghost" type="button" data-act="din.togglePaid">${showPaid ? "Ocultar" : "Mostrar"}</button></header>
          ${showPaid ? deudas.list(paid) : ""}
        </section>`
      : ""}`;
}

// ---------- Fijos ----------
function fijosView() {
  const list = rows("recurring_expenses");
  const mensual = sum(list, (r) => (r.frequency === "mensual" ? r.amount : r.frequency === "semanal" ? r.amount * 4.33 : r.amount / 12));
  return html`
    <div class="grid-2">
      ${stat("Compromisos al mes", money(mensual), "Mensuales + semanales + anuales prorrateados")}
      ${stat("Gastos fijos", String(list.length))}
    </div>
    <section class="card">
      <header class="card-head"><h2>Gastos fijos</h2>${fijos.addButton()}</header>
      ${fijos.list(list.slice().sort((a, b) => (a.due_day || 99) - (b.due_day || 99)), { empty: emptyState({ title: "Sin gastos fijos", text: "Suscripciones, plan de datos, mensualidades…", action: fijos.addButton() }) })}
    </section>`;
}

export default {
  id: "dinero", label: "Dinero", icon: "wallet", accent: "dinero",
  subs: [["resumen", "Resumen"], ["movimientos", "Movimientos"], ["ahorro", "Ahorro"], ["deudas", "Deudas"], ["fijos", "Fijos"]],
  tables: ["income", "expenses", "savings", "debts", "financial_goals", "recurring_expenses"],
  render(sub) {
    if (sub === "movimientos") return movimientosView();
    if (sub === "ahorro") return ahorroView();
    if (sub === "deudas") return deudasView();
    if (sub === "fijos") return fijosView();
    return resumenView();
  }
};

// ---------- Acciones ----------
onActs({
  "din.month": (el) => {
    const next = shiftMonth(month, Number(el.dataset.d));
    if (next > monthKey()) return;
    month = next;
    view.rerender();
  },
  "din.filter": (el) => { movFilter = el.dataset.f; view.rerender(); },
  "din.togglePaid": () => { showPaid = !showPaid; view.rerender(); },
  "din.jornal": async () => {
    const ok = await insert("income", { entry_date: dateKey(), description: "Trabajo", amount: settings.get("jornal") });
    if (ok) toast("Jornal registrado ✓");
  },
  "din.saveToday": async (el) => {
    const ok = await insert("savings", { entry_date: dateKey(), amount: Number(el.dataset.amount), note: "Ahorro del día" });
    if (ok) toast("Ahorro guardado ✓");
  },
  "din.pay": async (el) => {
    const debt = findById("debts", el.dataset.id);
    if (!debt) return;
    const hoy = dateKey();
    const exp = await insert("expenses", { entry_date: hoy, description: `Pago: ${debt.description}`, category: "Deuda", amount: debt.amount });
    if (!exp) return;
    if (await update("debts", debt.id, { paid: true, paid_date: hoy })) toast("Deuda pagada ✓");
  },
  "din.goal": () => {
    const g = goalProgress();
    openForm({
      title: g ? "Editar meta de ahorro" : "Definir meta de ahorro",
      accent: "dinero",
      values: g ? { target_amount: g.goal.target_amount, target_date: g.goal.target_date } : null,
      fields: [
        { name: "target_amount", label: "Monto meta", type: "number", required: true },
        { name: "target_date", label: "Fecha objetivo", type: "date" }
      ],
      onSubmit: async (v) => {
        const ok = g ? await update("financial_goals", g.goal.id, v) : await insert("financial_goals", v);
        if (!ok) return false;
        toast("Meta guardada ✓");
      }
    });
  }
});
