// Clases (o cualquier bloque) canceladas en una fecha concreta. El horario base es semanal
// y no sabe de excepciones; cada cancelación es una fila (bloque + fecha) en schedule_exceptions.
// Mientras esa fecha no pase, el bloque se ignora y su franja cuenta como tiempo libre.
import { dateKey, addDays, DIAS, minutesOf, nowMinutes } from "./utils.js";
import { rows, insert, remove } from "./store.js";

const dateOf = (e) => String(e.exception_date).slice(0, 10);

// Set de "idBloque|fecha" listo para pasarle al motor (recommend.js)
export const cancelledSet = () => new Set(rows("schedule_exceptions").map((e) => `${e.block_id}|${dateOf(e)}`));

// Próxima fecha (hoy incluido) en que cae ese día de la semana
export function nextDateOf(dayKey, from = new Date()) {
  const diff = (DIAS.indexOf(dayKey) - from.getDay() + 7) % 7;
  return dateKey(addDays(from, diff));
}

// Fecha que se cancela al pulsar "Se canceló": la próxima vez que ocurre el bloque.
// Si es hoy y ya terminó, no tiene sentido cancelarlo: se toma el de la semana siguiente.
export function cancelDateFor(block, now = new Date()) {
  const d = nextDateOf(block.day_of_week, now);
  if (d === dateKey(now) && minutesOf(block.end_time) <= nowMinutes(now)) return dateKey(addDays(now, 7));
  return d;
}

const find = (blockId, date) => rows("schedule_exceptions").find((e) => e.block_id === blockId && dateOf(e) === date) || null;

// Cancelación vigente de un bloque en los próximos 7 días (o null)
export function upcomingCancellation(blockId, now = new Date()) {
  const from = dateKey(now), to = dateKey(addDays(now, 7));
  return (
    rows("schedule_exceptions")
      .filter((e) => e.block_id === blockId && dateOf(e) >= from && dateOf(e) <= to)
      .sort((a, b) => dateOf(a).localeCompare(dateOf(b)))[0] || null
  );
}

// Cancelaciones en camino: un doble toque rápido enviaría dos inserciones y la segunda
// chocaría con la restricción de unicidad (bloque + fecha) de la base.
const inflight = new Set();

export async function cancelBlock(block, date) {
  const key = `${block.id}|${date}`;
  if (find(block.id, date) || inflight.has(key)) return true; // ya estaba cancelado
  inflight.add(key);
  try {
    return !!(await insert("schedule_exceptions", { block_id: block.id, exception_date: date }));
  } finally {
    inflight.delete(key);
  }
}

export async function restoreBlock(block, date) {
  const ex = find(block.id, date);
  return ex ? remove("schedule_exceptions", ex.id) : true;
}

export const exceptionDate = dateOf;
