// Motor de "¿qué debería estar haciendo ahora?". Son funciones puras (reciben datos y
// devuelven un resultado) para poder probarlas sin pantalla ni base de datos.
import { minutesOf, dayKeyOf, dateKey, daysBetween, addDays, SEMANA, DIA_LABEL, nowMinutes } from "./utils.js";
import {
  GENERIC_ACTIVITIES, DEFAULT_DURATION, CTX_SIN_NAG, CTX_ENFOCADO,
  CTX_BAJA_TOLERANCIA, CATEGORY_TO_CTX, CONTEXTS
} from "../data/defaults.js";

const byStart = (a, b) => minutesOf(a.start_time) - minutesOf(b.start_time);

// Bloques del día ordenados por hora. Si se pasan `cancelled` (Set de "idBloque|fecha") y la
// fecha concreta, se omiten los bloques cancelados ese día: esa franja cuenta como tiempo libre.
export function blocksOf(blocks, dayKey, cancelled = null, date = null) {
  return (blocks || [])
    .filter((b) => b.day_of_week === dayKey && !(cancelled && date && cancelled.has(`${b.id}|${date}`)))
    .sort(byStart);
}

// Si hay bloques solapados (p. ej. "moto" dentro de "Trabajo"), gana el más específico:
// el que empezó más tarde y, en empate, el más corto.
export function currentBlock(dayBlocks, nowMin) {
  const live = dayBlocks.filter((b) => minutesOf(b.start_time) <= nowMin && nowMin < minutesOf(b.end_time));
  live.sort((a, b) =>
    minutesOf(b.start_time) - minutesOf(a.start_time) ||
    (minutesOf(a.end_time) - minutesOf(a.start_time)) - (minutesOf(b.end_time) - minutesOf(b.start_time))
  );
  return live[0] || null;
}

// Próximo bloque: hoy si queda alguno, si no el primero de los siguientes 7 días.
export function nextBlock(blocks, now = new Date(), exclude = null, cancelled = null) {
  const nowMin = nowMinutes(now);
  const dayKey = dayKeyOf(now);
  const today = blocksOf(blocks, dayKey, cancelled, dateKey(now)).filter((b) => minutesOf(b.start_time) > nowMin && b !== exclude);
  if (today.length) {
    return { block: today[0], dayLabel: null, minutesUntil: minutesOf(today[0].start_time) - nowMin };
  }
  const idx = SEMANA.indexOf(dayKey);
  for (let i = 1; i <= 7; i++) {
    const key = SEMANA[(idx + i) % 7];
    const list = blocksOf(blocks, key, cancelled, dateKey(addDays(now, i)));
    if (list.length) return { block: list[0], dayLabel: i === 1 ? "Mañana" : DIA_LABEL[key], minutesUntil: null };
  }
  return null;
}

// Huecos libres de un día (entre bloques) dentro de una ventana de vigilia.
export function dayGaps(blocks, dayKey, { from = 6 * 60, to = 22 * 60 + 30, min = 45, after = 0, cancelled = null, date = null } = {}) {
  const busy = blocksOf(blocks, dayKey, cancelled, date)
    .map((b) => [minutesOf(b.start_time), minutesOf(b.end_time)])
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = Math.max(from, after);
  for (const [s, e] of busy) {
    if (s > cursor && Math.min(s, to) - cursor >= min) gaps.push([cursor, Math.min(s, to)]);
    cursor = Math.max(cursor, e);
    if (cursor >= to) break;
  }
  if (cursor < to && to - cursor >= min) gaps.push([cursor, to]);
  return gaps;
}

export function contextLabel(key) {
  const c = CONTEXTS.find((x) => x.key === key);
  return c ? `${c.icon} ${c.label}` : null;
}

// ---------- Análisis principal ----------
// data: { blocks, subjects, tasks, routines, sessions, manualContext, cancelled }
// cancelled: Set de "idBloque|fecha" con las clases/bloques cancelados; cuentan como tiempo libre.
export function analyze(data, now = new Date()) {
  const { blocks = [], subjects = [], tasks = [], routines = [], sessions = [], manualContext = null, cancelled = null } = data;
  const dayKey = dayKeyOf(now);
  const today = dateKey(now);
  const nowMin = nowMinutes(now);

  const dayBlocks = blocksOf(blocks, dayKey, cancelled, today);
  const cancelledToday = cancelled ? blocksOf(blocks, dayKey).filter((b) => cancelled.has(`${b.id}|${today}`)) : [];
  const actual = currentBlock(dayBlocks, nowMin);
  const next = nextBlock(blocks, now, actual, cancelled);

  let progress = null;
  if (actual) {
    const s = minutesOf(actual.start_time), e = minutesOf(actual.end_time);
    progress = { total: e - s, elapsed: nowMin - s, left: e - nowMin, pct: Math.round(((nowMin - s) / (e - s)) * 100) };
  }

  // Ventana: cuánto tiempo hay antes de que cambie tu situación.
  const windowMin = actual ? progress.left : next && next.minutesUntil != null ? next.minutesUntil : null;

  const guess = actual ? CATEGORY_TO_CTX[actual.category] || null : null;
  const ctxKey = manualContext || guess;
  const sinNag = CTX_SIN_NAG.includes(ctxKey);
  const enfocado = !sinNag && CTX_ENFOCADO.includes(ctxKey);
  const bajaTolerancia = !sinNag && !enfocado && CTX_BAJA_TOLERANCIA.includes(ctxKey);

  const base = { dayKey, actual, progress, next, windowMin, ctxKey, manualContext, guess, cancelledToday, primary: null, alts: [], postponed: [] };

  if (sinNag) return { ...base, mode: "sinNag" };
  if (enfocado) return { ...base, mode: "enfocado" };
  if (!actual && (nowMin >= 23 * 60 || nowMin < 5 * 60)) return { ...base, mode: "noche" };

  // ---- Candidatos ----
  const subName = new Map(subjects.map((s) => [s.id, s.name]));
  const postponed = [];
  const cands = [];

  for (const t of tasks.filter((t) => t.status !== "completada")) {
    const attn = t.attention_level || "media";
    const dur = t.estimated_minutes || DEFAULT_DURATION[attn];
    const materia = subName.get(t.subject_id) || null;
    const diff = t.due_date ? daysBetween(today, t.due_date) : 999;
    const rank = diff <= 0 ? 0 : 1; // vencidas y de hoy primero
    const tooHeavy = attn === "alta" && (bajaTolerancia || (windowMin !== null && windowMin < dur));
    if (tooHeavy) {
      postponed.push({ title: t.title, materia });
      cands.push({
        kind: "task", taskId: t.id, title: `Preparar: ${t.title}`, subtitle: materia, icon: "🗂️",
        attention: "baja", duration: Math.min(10, windowMin || 10), rank, diff
      });
    } else {
      cands.push({ kind: "task", taskId: t.id, title: t.title, subtitle: materia, icon: "📚", attention: attn, duration: dur, rank, diff });
    }
  }

  // Entreno del día si aún no lo hiciste
  const routine = routines.find((r) => r.day_of_week === dayKey);
  const trainedToday = sessions.some((s) => s.session_date === today);
  if (routine && !trainedToday && nowMin >= 5 * 60 && nowMin <= 21 * 60) {
    cands.push({
      kind: "workout", title: `Entreno: ${routine.name}`, subtitle: "Toca hoy", icon: "🏋️",
      attention: "alta", duration: 60, rank: 0.5, diff: 0
    });
  }

  subjects.slice(0, 3).forEach((s) =>
    cands.push({ kind: "review", title: `Repasar apuntes de ${s.name}`, icon: "📚", attention: "baja", duration: 15, rank: 2, diff: 999 })
  );
  GENERIC_ACTIVITIES.forEach((a) => cands.push({ kind: "generic", ...a, rank: 3, diff: 999 }));

  // ---- Filtro por atención y tiempo ----
  let allowed;
  if (bajaTolerancia) allowed = windowMin !== null && windowMin <= 20 ? ["baja"] : ["baja", "media"];
  else if (windowMin !== null) allowed = windowMin <= 20 ? ["baja"] : windowMin <= 60 ? ["baja", "media"] : ["baja", "media", "alta"];
  else allowed = ["baja", "media", "alta"];
  const cap = windowMin === null ? 60 : windowMin;

  // Nota: sort de JS es estable, así que dentro de un mismo rank se conserva el orden por fecha.
  const sorted = cands.slice().sort((a, b) => a.rank - b.rank || a.diff - b.diff);
  const ok = sorted.filter((c) => allowed.includes(c.attention) && c.duration <= cap);

  return {
    ...base,
    mode: bajaTolerancia ? "baja" : "normal",
    primary: ok[0] || null,
    alts: ok.slice(1, 4),
    postponed
  };
}
