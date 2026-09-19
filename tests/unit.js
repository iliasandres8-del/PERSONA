// Pruebas de la lógica pura (fechas, dinero, HTML seguro y motor de recomendaciones).
// No necesitan Supabase: se abren con tests/unit.html servido por http (ver README).
import * as U from "../js/core/utils.js";
import * as R from "../js/core/recommend.js";
import { DEFAULT_SCHEDULE } from "../js/data/defaults.js";

const results = [];
const ok = (name, cond, extra = "") => results.push({ name, pass: !!cond, extra: cond ? "" : extra });

const blocks = DEFAULT_SCHEDULE.map((b, i) => ({ ...b, id: "b" + i, mandatory: true }));
const at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi);
const martes = (h, mi) => at(2026, 9, 22, h, mi); // 22-sep-2026 es martes
const base = { blocks, subjects: [{ id: "s1", name: "Bases" }], tasks: [], routines: [], sessions: [], manualContext: null };

// ----- fechas (siempre locales; toISOString() daría "mañana" después de las 7 pm en Colombia) -----
ok("dateKey a las 23:30 no salta al día siguiente", U.dateKey(at(2026, 9, 19, 23, 30)) === "2026-09-19");
ok("dateKey a las 00:05", U.dateKey(at(2026, 9, 19, 0, 5)) === "2026-09-19");
ok("daysBetween", U.daysBetween("2026-09-19", "2026-09-22") === 3 && U.daysBetween("2026-09-22", "2026-09-19") === -3);
ok("relDate vencida", U.relDate("2026-09-17", "2026-09-19").tone === "danger");
ok("relDate hoy / mañana", U.relDate("2026-09-19", "2026-09-19").text === "Hoy" && U.relDate("2026-09-20", "2026-09-19").text === "Mañana");
ok("shiftMonth cruza el año", U.shiftMonth("2026-01", -1) === "2025-12" && U.shiftMonth("2026-12", 1) === "2027-01");
ok("startOfWeek es lunes", U.dayKeyOf(U.startOfWeek(at(2026, 9, 19, 10, 0))) === "lunes");
ok("money", U.money(60000) === "$60.000" && U.money(-1500) === "-$1.500", U.money(60000));
ok("moneyShort", U.moneyShort(250000) === "250k" && U.moneyShort(1500000) === "1.5M", U.moneyShort(1500000));

// ----- HTML seguro -----
const evil = '<img src=x onerror="a()">';
const h = U.html`<p title="${evil}">${evil}</p>`.toString();
ok("html escapa texto y atributos", !h.includes("<img") && h.includes("&lt;img"));
ok("html no escapa raw()", U.html`${U.raw("<b>x</b>")}`.toString() === "<b>x</b>");
ok("html une arrays sin comas", U.html`${[U.html`<i>1</i>`, U.html`<i>2</i>`]}`.toString() === "<i>1</i><i>2</i>");

// ----- bloque actual, próximo y huecos -----
const mie = R.blocksOf(blocks, "miercoles");
const cur = R.currentBlock(mie, 16 * 60 + 10); // "moto" (16:00-16:30) dentro de Trabajo (16:00-23:59)
ok("solapados: gana el bloque más corto", cur && cur.title.startsWith("Universidad a trabajo"), cur && cur.title);
ok("17:00 miércoles = Trabajo", R.currentBlock(mie, 17 * 60).title === "Trabajo");
ok("03:00 sin bloque", R.currentBlock(mie, 3 * 60) === null);
const gaps = R.dayGaps(blocks, "lunes", { min: 45 });
ok("huecos del lunes: hay uno tras la universidad", gaps.some(([s, e]) => s === 9 * 60 && e > 9 * 60 + 45), JSON.stringify(gaps));
ok("huecos no pisan bloques", gaps.every(([s, e]) => R.blocksOf(blocks, "lunes").every((b) => e <= U.minutesOf(b.start_time) || s >= U.minutesOf(b.end_time))));
const nx = R.nextBlock(blocks, martes(23, 59));
ok("próximo bloque pasa a mañana", nx && nx.dayLabel === "Mañana", nx && nx.dayLabel);
const nxSab = R.nextBlock(blocks, at(2026, 9, 19, 14, 0));
ok("próximo bloque salta el domingo vacío", nxSab && nxSab.dayLabel === "Lunes", nxSab && nxSab.dayLabel);

// ----- modos del motor -----
let a = R.analyze(base, martes(8, 0));
ok("martes 8:00 = clase (baja tolerancia)", a.mode === "baja" && a.ctxKey === "clase", a.mode + "/" + a.ctxKey);
ok("en clase la ventana es lo que falta del bloque", a.windowMin === 60, String(a.windowMin));
a = R.analyze(base, martes(20, 0));
ok("martes 20:00 = trabajo", a.ctxKey === "trabajo" && a.mode === "baja");
a = R.analyze(base, at(2026, 9, 23, 23, 59));
ok("23:59 sin bloque = noche", a.mode === "noche", a.mode);
a = R.analyze({ ...base, manualContext: "novia" }, martes(20, 0));
ok("contexto manual gana al horario (no molesta)", a.mode === "sinNag");
a = R.analyze({ ...base, manualContext: "estudio" }, martes(11, 0));
ok("contexto estudio = enfocado", a.mode === "enfocado");
a = R.analyze(base, martes(11, 0));
ok("hueco libre: hay sugerencia", a.mode === "normal" && !!a.primary && a.windowMin === 90, `${a.mode} ${a.windowMin}`);

// ----- tareas y entreno -----
const tasks = [
  { id: "t1", title: "Lejana", subject_id: "s1", due_date: "2026-10-30", status: "pendiente", attention_level: "baja" },
  { id: "t2", title: "Vencida", subject_id: "s1", due_date: "2026-09-20", status: "pendiente", attention_level: "media" },
  { id: "t3", title: "Hecha", due_date: "2026-09-01", status: "completada", attention_level: "baja" }
];
a = R.analyze({ ...base, tasks }, martes(11, 0));
ok("la tarea que vence antes es la principal", a.primary && a.primary.title === "Vencida", a.primary && a.primary.title);
ok("una tarea completada no se sugiere", ![a.primary, ...a.alts].some((x) => x && x.title === "Hecha"));
const pesada = [{ id: "t9", title: "Proyecto final", subject_id: "s1", due_date: "2026-09-22", status: "pendiente", attention_level: "alta", estimated_minutes: 90 }];
a = R.analyze({ ...base, tasks: pesada }, martes(8, 0));
ok("alta atención en clase: se pospone", a.postponed.length === 1 && a.postponed[0].title === "Proyecto final");
ok("y se ofrece un 'Preparar:' corto", [a.primary, ...a.alts].some((x) => x && x.title === "Preparar: Proyecto final" && x.duration <= 10));
const routines = [{ id: "r1", name: "Pecho", day_of_week: "martes" }];
a = R.analyze({ ...base, routines }, martes(11, 0));
ok("sugiere el entreno de hoy si no entrenaste", [a.primary, ...a.alts].some((x) => x && x.kind === "workout"));
a = R.analyze({ ...base, routines, sessions: [{ session_date: "2026-09-22" }] }, martes(11, 0));
ok("no lo sugiere si ya entrenaste", ![a.primary, ...a.alts].some((x) => x && x.kind === "workout"));

// ----- pintar resultados -----
const failed = results.filter((r) => !r.pass);
document.getElementById("summary").textContent = failed.length ? `${failed.length} de ${results.length} pruebas fallan` : `Las ${results.length} pruebas pasan ✓`;
document.getElementById("summary").className = failed.length ? "bad" : "good";
document.getElementById("list").innerHTML = results
  .map((r) => `<li class="${r.pass ? "good" : "bad"}">${r.pass ? "✓" : "✗"} ${U.esc(r.name)}${r.extra ? ` <small>${U.esc(r.extra)}</small>` : ""}</li>`)
  .join("");
