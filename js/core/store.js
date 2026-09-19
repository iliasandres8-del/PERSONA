// Almacén de datos: carga cada tabla una vez, la guarda en memoria y avisa a las vistas
// cuando algo cambia. Las vistas solo leen de aquí (rows("expenses")) y escriben con
// insert/update/remove, sin volver a consultar Supabase por su cuenta.
import { db } from "./db.js";
import { toast } from "../ui/toast.js";

export const state = { user: null, data: {}, errors: {} };

export const TABLES = [
  "schedule_blocks", "activities", "free_time_logs", "subjects", "tasks",
  "income", "expenses", "savings", "debts", "financial_goals", "recurring_expenses",
  "workout_routines", "workout_exercises", "workout_sessions",
  "reminders", "user_context", "integrations"
];
// Tablas cuyas filas no llevan user_id propio (la política RLS pasa por la rutina).
const NO_USER = new Set(["workout_exercises"]);

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function emit(tables = []) { subs.forEach((fn) => fn(tables)); }
export const rows = (t) => state.data[t] || [];

function friendly(error) {
  const m = (error && error.message) || String(error);
  if (/failed to fetch|network/i.test(m)) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  if (/row-level security|permission/i.test(m)) return "No tienes permiso para esa acción (¿sesión vencida?).";
  return m;
}

async function fetchAll(table) {
  const out = [];
  const size = 1000; // Supabase corta en 1000 filas por consulta
  for (let from = 0; ; from += size) {
    const { data, error } = await db.from(table).select("*").range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

export async function load(table, { silent = false } = {}) {
  try {
    state.data[table] = await fetchAll(table);
    delete state.errors[table];
  } catch (e) {
    state.data[table] = state.data[table] || [];
    state.errors[table] = friendly(e);
    if (!silent) toast(`No se pudo cargar ${table}: ${friendly(e)}`, "error");
  }
}

export async function loadAll() {
  await Promise.all(TABLES.map((t) => load(t, { silent: true })));
  const failed = Object.keys(state.errors);
  if (failed.length) toast(`No se pudieron cargar: ${failed.join(", ")}`, "error", 5000);
  emit(TABLES);
}

export function resetStore() {
  state.data = {};
  state.errors = {};
}

// ---------- Escritura ----------
export async function insert(table, rowOrRows) {
  const list = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  const payload = list.map((r) => (NO_USER.has(table) ? r : { user_id: state.user.id, ...r }));
  const { data, error } = await db.from(table).insert(payload).select();
  if (error) { toast(friendly(error), "error"); return null; }
  await load(table, { silent: true });
  emit([table]);
  return data;
}

export async function upsert(table, rowOrRows, options) {
  const list = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  const payload = list.map((r) => (NO_USER.has(table) ? r : { user_id: state.user.id, ...r }));
  const { error } = await db.from(table).upsert(payload, options);
  if (error) { toast(friendly(error), "error"); return false; }
  await load(table, { silent: true });
  emit([table]);
  return true;
}

// Actualiza primero en memoria (la UI responde al instante) y luego en Supabase.
export async function update(table, id, patch) {
  const list = state.data[table] || [];
  const row = list.find((r) => r.id === id);
  if (row) Object.assign(row, patch);
  emit([table]);
  const { error } = await db.from(table).update(patch).eq("id", id);
  if (error) {
    toast(friendly(error), "error");
    await load(table, { silent: true });
    emit([table]);
    return false;
  }
  return true;
}

export async function remove(table, id) {
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) { toast(friendly(error), "error"); return false; }
  state.data[table] = (state.data[table] || []).filter((r) => r.id !== id);
  emit([table]);
  return true;
}

export const findById = (table, id) => rows(table).find((r) => String(r.id) === String(id));
