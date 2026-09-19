// Utilidades puras: fechas (siempre en hora LOCAL), dinero y HTML seguro.

export const DIAS = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"]; // orden de Date.getDay()
export const SEMANA = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];
export const DIA_LABEL = {
  lunes:"Lunes", martes:"Martes", miercoles:"Miércoles", jueves:"Jueves",
  viernes:"Viernes", sabado:"Sábado", domingo:"Domingo"
};
export const DIA_CORTO = {
  lunes:"Lun", martes:"Mar", miercoles:"Mié", jueves:"Jue",
  viernes:"Vie", sabado:"Sáb", domingo:"Dom"
};
export const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

export const pad = (n) => String(n).padStart(2, "0");
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
export const sum = (arr, f = (x) => x) => (arr || []).reduce((s, x) => s + (Number(f(x)) || 0), 0);

// ---------- Fechas ----------
// OJO: new Date().toISOString() devuelve UTC; en Colombia (UTC-5) después de las 7 pm
// ya marca "mañana". Por eso todo el manejo de fechas pasa por estas funciones locales.
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export const dayKeyOf = (d = new Date()) => DIAS[d.getDay()];
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${cap(MESES[m - 1])} ${y}`;
}
export function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
export function daysBetween(a, b) {
  // días completos de a -> b (b - a), ambos "YYYY-MM-DD"
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
export function startOfWeek(d = new Date()) {
  // lunes como primer día
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - diff);
  return r;
}

export function minutesOf(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}
export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");
export function minToHHMM(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
export function nowMinutes(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}
export function fmtDuration(min) {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function saludo(d = new Date()) {
  const h = d.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

// "Hoy", "Mañana", "En 3 días", "Vencida hace 2 d"...
export function relDate(dateStr, today = dateKey()) {
  if (!dateStr) return { text: "Sin fecha", tone: "muted", diff: null };
  const diff = daysBetween(today, dateStr);
  if (diff < -1) return { text: `Vencida hace ${-diff} d`, tone: "danger", diff };
  if (diff === -1) return { text: "Venció ayer", tone: "danger", diff };
  if (diff === 0) return { text: "Hoy", tone: "warn", diff };
  if (diff === 1) return { text: "Mañana", tone: "warn", diff };
  if (diff <= 7) return { text: `En ${diff} días`, tone: "info", diff };
  const d = parseDate(dateStr);
  return { text: `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`, tone: "muted", diff };
}
export function fmtDateShort(dateStr) {
  if (!dateStr) return "";
  const d = parseDate(dateStr);
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

// ---------- Dinero ----------
export function money(n) {
  const v = Number(n) || 0;
  return (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString("es-CO");
}
export function moneyShort(n) {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(Math.round(v));
}

// ---------- HTML seguro ----------
// Todo dato que viene de la base (o de Aula Extendida) puede traer HTML. La plantilla
// `html` escapa cada valor interpolado; solo se deja pasar lo marcado con raw()/html``.
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));
export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function toHtml(v) {
  if (v == null || v === false || v === true) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(toHtml).join("");
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += toHtml(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Guarda en localStorage sin romper si está bloqueado (modo privado, etc.)
export const storage = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
  }
};
