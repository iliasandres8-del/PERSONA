// Avisos del panel al celular (web push). Se despliega como Edge Function "avisos" en panel-personal.
// GET              -> llave pública para suscribirse
// POST manana      -> 5 a. m.: clases y trabajo de hoy, entregas, parciales en 3 días, pagos fijos y un hueco para estudiar
// POST bloques     -> cada 5 min: aviso antes de cada clase o turno, y del hueco libre para entrenar
// POST noche       -> 9 p. m.: tareas que vencen mañana y cuánto vas a dormir
// POST viernes     -> viernes 11:30 p. m.: recordar anotar lo que le pagaron en la semana
// POST domingo     -> domingo 8 p. m.: resumen de la semana
// POST mensaje     -> otra función (gmail-banco) manda un aviso a una persona
// POST cancelar    -> botón "Hoy no hay clase" de la notificación (firmado, sin sesión)
// POST prueba      -> la persona se manda un aviso de prueba (con su sesión)
// Las llamadas internas traen x-cron, un secreto guardado en la tabla push_private.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3";
import webpush from "npm:web-push@3.6.7";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json" } });
const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const AVISAR = ["universidad", "trabajo", "gym"];
const PARCIAL = /parcial|quiz|examen|evaluaci[oó]n|sustentaci/i;

let llaves: { publica: string; privada: string; cron: string } | null = null;
async function cargarLlaves() {
  if (llaves) return llaves;
  const filas = await sql`select clave, valor from public.push_private where clave in ('vapid_publica', 'vapid_privada', 'cron')`;
  const m = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  if (!m.vapid_publica) {
    const nuevas = webpush.generateVAPIDKeys();
    await sql`insert into public.push_private (clave, valor) values ('vapid_publica', ${nuevas.publicKey}), ('vapid_privada', ${nuevas.privateKey}) on conflict (clave) do nothing`;
    return cargarLlaves();
  }
  llaves = { publica: m.vapid_publica, privada: m.vapid_privada, cron: m.cron };
  webpush.setVapidDetails("https://iliasandres8-del.github.io/PERSONA/", llaves.publica, llaves.privada);
  return llaves;
}

type Extra = { url?: string; acciones?: { action: string; title: string }[]; datos?: Record<string, unknown> };
async function enviar(userId: string, titulo: string, cuerpo: string, etiqueta: string, extra: Extra = {}) {
  const subs = await sql`select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = ${userId}`;
  let enviados = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ titulo, cuerpo, etiqueta, url: extra.url || "./", acciones: extra.acciones || [], datos: extra.datos || {} }),
        { TTL: 2 * 3600, urgency: "high" },
      );
      enviados++;
    } catch (e) {
      const codigo = (e as { statusCode?: number }).statusCode;
      if (codigo === 404 || codigo === 410) await sql`delete from public.push_subscriptions where id = ${s.id}`;
    }
  }
  return enviados;
}

// Fecha y hora de Colombia (UTC-5, sin horario de verano)
function colombia(masDias = 0) {
  const d = new Date(Date.now() - 5 * 3600e3 + masDias * 864e5);
  return { fecha: d.toISOString().slice(0, 10), dia: DIAS[d.getUTCDay()], num: d.getUTCDay(), minutos: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const aMinutos = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
function hora(t: string | number) {
  const min = typeof t === "number" ? t : aMinutos(t);
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}
const corto = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

async function firmar(texto: string) {
  const k = await cargarLlaves();
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(k.cron), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const f = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(f)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

type Campo = "morning" | "before_block" | "tasks_night" | "money" | "training" | "sleep" | "weekly";
// Personas con al menos un celular suscrito y ese aviso encendido (sin fila = todo encendido)
async function gente(campo: Campo) {
  return await sql`
    select distinct s.user_id, coalesce(n.lead_minutes, 15) as lead,
      coalesce(n.money, true) as money, coalesce(n.training, true) as training
    from public.push_subscriptions s
    left join public.notification_settings n on n.user_id = s.user_id
    where coalesce(n.${sql(campo)}, true)`;
}

// Bloques de un día que no se cancelaron (solo clases y trabajo, o todos)
async function bloquesDe(userId: string, dia: string, fecha: string, todos = false) {
  return await sql`
    select b.id, b.title, b.category, b.start_time::text as ini, b.end_time::text as fin
    from public.schedule_blocks b
    where b.user_id = ${userId} and b.day_of_week = ${dia}
      and (${todos} or b.category in ${sql(AVISAR)})
      and not exists (select 1 from public.schedule_exceptions e where e.block_id = b.id and e.exception_date = ${fecha})
    order by b.start_time`;
}

// Huecos libres de un día entre `desde` y `hasta` (minutos), de al menos `min` minutos
function huecos(bloques: { ini: string; fin: string }[], desde: number, hasta: number, min: number) {
  const ocupado = bloques.map((b) => [aMinutos(b.ini), aMinutos(b.fin)]).sort((a, b) => a[0] - b[0]);
  const libres: [number, number][] = [];
  let cursor = desde;
  for (const [s, e] of ocupado) {
    if (s - cursor >= min) libres.push([cursor, Math.min(s, hasta)]);
    cursor = Math.max(cursor, e);
    if (cursor >= hasta) break;
  }
  if (hasta - cursor >= min) libres.push([cursor, hasta]);
  return libres.filter(([s, e]) => e - s >= min);
}

async function tareasDe(userId: string, desde: string, hasta: string) {
  const filas = await sql`
    select distinct on (lower(t.title), t.due_date) t.title, t.due_date::text as vence, t.kind
    from public.tasks t
    where t.user_id = ${userId} and coalesce(t.status, 'pendiente') <> 'completada'
      and t.due_date between ${desde} and ${hasta}
    order by lower(t.title), t.due_date`;
  return filas.sort((a, b) => a.vence.localeCompare(b.vence));
}
const esParcial = (t: { title: string; kind: string | null }) => t.kind === "parcial" || t.kind === "quiz" || (!t.kind && PARCIAL.test(t.title));

async function fijosDe(userId: string, dias: number[]) {
  return await sql`select description, amount, due_day from public.recurring_expenses
    where user_id = ${userId} and frequency = 'mensual' and due_day in ${sql(dias)}`;
}

async function entrenoReciente(userId: string, desde: string) {
  const [r] = await sql`select count(*)::int as n from public.workout_sessions where user_id = ${userId} and session_date >= ${desde}`;
  return r.n > 0;
}

async function manana() {
  const hoy = colombia(), man = colombia(1), en3 = colombia(3), en7 = colombia(7);
  let n = 0;
  for (const p of await gente("morning")) {
    const bloques = await bloquesDe(p.user_id, hoy.dia, hoy.fecha);
    const tareas = await tareasDe(p.user_id, hoy.fecha, en7.fecha);
    const lineas: string[] = [];
    lineas.push(bloques.length ? bloques.map((b) => `${b.title} ${hora(b.ini)}`).join(" · ") : "Hoy no tienes clases ni trabajo.");
    const hoyT = tareas.filter((t) => t.vence === hoy.fecha), manT = tareas.filter((t) => t.vence === man.fecha);
    if (hoyT.length) lineas.push(`Vence hoy: ${hoyT.map((t) => t.title).join(", ")}.`);
    if (manT.length) lineas.push(`Vence mañana: ${manT.map((t) => t.title).join(", ")}.`);
    const parciales = tareas.filter((t) => t.vence === en3.fecha && esParcial(t));
    if (parciales.length) lineas.push(`En 3 días: ${parciales.map((t) => t.title).join(", ")}. ¡Ve repasando!`);

    // Un hueco de hoy para avanzar en lo más urgente
    const todos = await bloquesDe(p.user_id, hoy.dia, hoy.fecha, true);
    const pendiente = tareas.find((t) => t.vence > hoy.fecha) || hoyT[0];
    const hueco = huecos(todos, 6 * 60, 21 * 60, 45)[0];
    if (pendiente && hueco) lineas.push(`Hueco ${hora(hueco[0])}–${hora(hueco[1])}: avanza en ${corto(pendiente.title)}.`);

    if (p.money) {
      const dHoy = Number(hoy.fecha.slice(8)), dMan = Number(man.fecha.slice(8));
      for (const f of await fijosDe(p.user_id, [dHoy, dMan])) lineas.push(`${f.due_day === dHoy ? "Hoy" : "Mañana"} toca pagar ${f.description} (${pesos(Number(f.amount))}).`);
    }
    const titulo = hoyT.length ? `Hoy tienes ${hoyT.length} ${hoyT.length === 1 ? "entrega" : "entregas"}` : parciales.length ? "Se viene un parcial" : "Así va tu día";
    n += await enviar(p.user_id, titulo, lineas.join("\n"), "manana", { url: "./#/inicio" });
  }
  return n;
}

async function bloques() {
  const hoy = colombia(), ayer = colombia(-1);
  let n = 0;
  for (const p of await gente("before_block")) {
    for (const b of await bloquesDe(p.user_id, hoy.dia, hoy.fecha)) {
      const faltan = aMinutos(b.ini) - hoy.minutos;
      if (faltan <= 0 || faltan > p.lead) continue;
      const nuevo = await sql`insert into public.push_log (user_id, key) values (${p.user_id}, ${"bloque:" + b.id + ":" + hoy.fecha}) on conflict do nothing returning key`;
      if (!nuevo.length) continue;
      const clase = b.category === "universidad";
      const gym = b.category === "gym";
      const titulo = clase || gym ? `En ${faltan} min: ${b.title}` : `En ${faltan} min entras al trabajo`;
      const firma = clase ? await firmar(`${p.user_id}|${b.id}|${hoy.fecha}`) : "";
      const texto = gym ? `Empieza a las ${hora(b.ini)}. Son unos 50 min: calienta 5 min y dale.` : `Empieza a las ${hora(b.ini)}.`;
      n += await enviar(p.user_id, titulo, texto, "bloque-" + b.id, {
        // En iPhone no hay botones en la notificación: al tocarla, el panel pregunta si se canceló
        url: clase ? `./?accion=cancelar&bloque=${b.id}&fecha=${hoy.fecha}#/inicio` : gym ? "./#/entreno/hoy" : "./#/tiempo",
        acciones: clase ? [{ action: "cancelar", title: "Hoy no hay clase" }] : [],
        datos: clase ? { cancelar: { user: p.user_id, block: b.id, fecha: hoy.fecha, firma } } : {},
      });
    }
  }
  // Entreno: al empezar el primer hueco largo de la tarde, si no ha entrenado hoy ni ayer
  for (const p of await gente("training")) {
    const todos = await bloquesDe(p.user_id, hoy.dia, hoy.fecha, true);
    if (todos.some((b) => b.category === "gym")) continue; // ese día ya tiene su gym agendado
    const hueco = huecos(todos, 12 * 60, 21 * 60, 60).find(([s]) => s - hoy.minutos <= 5 && s - hoy.minutos > 0);
    if (!hueco || (await entrenoReciente(p.user_id, ayer.fecha))) continue;
    const nuevo = await sql`insert into public.push_log (user_id, key) values (${p.user_id}, ${"entreno:" + hoy.fecha}) on conflict do nothing returning key`;
    if (!nuevo.length) continue;
    n += await enviar(p.user_id, "Buen momento para entrenar 💪", `Tienes libre de ${hora(hueco[0])} a ${hora(hueco[1])}. Gym, fútbol o algo en la casa: lo que sea cuenta.`, "entreno", { url: "./#/entreno/hoy" });
  }
  await sql`delete from public.push_log where sent_at < now() - interval '3 days'`;
  return n;
}

async function noche() {
  const hoy = colombia(), man = colombia(1);
  let n = 0;
  for (const p of await gente("tasks_night")) {
    const tareas = await tareasDe(p.user_id, man.fecha, man.fecha);
    if (!tareas.length) continue;
    const titulo = tareas.length === 1 ? "Mañana vence una tarea" : `Mañana vencen ${tareas.length} tareas`;
    n += await enviar(p.user_id, titulo, tareas.map((t) => t.title).join("\n"), "noche", { url: "./#/estudio/tareas" });
  }
  // Sueño: desde que termina lo de hoy (mínimo 10 p. m.) + 30 min, hasta lo primero de mañana
  for (const p of await gente("sleep")) {
    const deMan = await bloquesDe(p.user_id, man.dia, man.fecha, true);
    if (!deMan.length) continue;
    const deHoy = await bloquesDe(p.user_id, hoy.dia, hoy.fecha, true);
    const acuesto = Math.max(22 * 60, ...deHoy.map((b) => aMinutos(b.fin))) + 30;
    const levanto = aMinutos(deMan[0].ini);
    const horas = (24 * 60 - acuesto + levanto) / 60;
    if (horas >= 6.5) continue;
    const h = Math.max(0, Math.round(horas * 2) / 2);
    n += await enviar(p.user_id, `Hoy vas a dormir unas ${String(h).replace(".", ",")} h`, `Mañana arrancas a las ${hora(levanto)} con ${deMan[0].title.split("(")[0].trim()}. Deja todo listo y acuéstate apenas llegues.`, "sueno", { url: "./#/inicio" });
  }
  return n;
}

async function viernes() {
  let n = 0;
  for (const p of await gente("money")) {
    n += await enviar(p.user_id, "¿Cuánto te pagaron esta semana?", "Anótalo ahora y te digo cuánto puedes gastar por día hasta el otro viernes.", "viernes", { url: "./?accion=ingreso#/dinero/movimientos" });
  }
  return n;
}

async function domingo() {
  const hoy = colombia();
  const lunes = colombia(-6), sig = colombia(7);
  let n = 0;
  for (const p of await gente("weekly")) {
    const [g] = await sql`select coalesce(sum(amount), 0)::bigint as total from public.expenses where user_id = ${p.user_id} and entry_date between ${lunes.fecha} and ${hoy.fecha}`;
    const [e] = await sql`select count(distinct session_date)::int as dias from public.workout_sessions where user_id = ${p.user_id} and session_date between ${lunes.fecha} and ${hoy.fecha}`;
    const [h] = await sql`select (select count(*) from public.habit_logs l where l.user_id = ${p.user_id} and l.log_date between ${lunes.fecha} and ${hoy.fecha})::int as hechos,
      (select count(*) from public.habits x where x.user_id = ${p.user_id} and x.active)::int as habitos`;
    const tareas = await tareasDe(p.user_id, colombia(1).fecha, sig.fecha);
    const lineas = [
      `Gastaste ${pesos(Number(g.total))} esta semana.`,
      `Entrenaste ${e.dias} ${e.dias === 1 ? "día" : "días"}.`,
    ];
    if (h.habitos) lineas.push(`Hábitos: ${Math.round((h.hechos / (h.habitos * 7)) * 100)} % cumplidos.`);
    lineas.push(tareas.length ? `Esta semana entregas: ${tareas.slice(0, 3).map((t) => corto(t.title, 30)).join(", ")}${tareas.length > 3 ? ` y ${tareas.length - 3} más` : ""}.` : "No tienes entregas esta semana.");
    n += await enviar(p.user_id, "Tu semana en un vistazo", lineas.join("\n"), "domingo", { url: "./#/inicio" });
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const k = await cargarLlaves();
  if (req.method === "GET") return responder({ publica: k.publica });
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);
  let cuerpo: { tipo?: string; user?: string; block?: string; fecha?: string; firma?: string; user_id?: string; titulo?: string; cuerpo?: string; url?: string };
  try { cuerpo = await req.json(); } catch { return responder({ error: "Cuerpo inválido" }, 400); }

  if (cuerpo.tipo === "prueba") {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: `Bearer ${token}` } });
    if (!u.ok) return responder({ error: "Sesión vencida" }, 401);
    const { id } = await u.json();
    const n = await enviar(id, "Así se ven los avisos del panel", "Te aviso en la mañana cómo va tu día, antes de cada clase y en la noche lo que vence mañana.", "prueba");
    return responder({ ok: true, enviados: n });
  }

  if (cuerpo.tipo === "cancelar") {
    const { user, block, fecha, firma } = cuerpo;
    if (!user || !block || !fecha || !firma || firma !== (await firmar(`${user}|${block}|${fecha}`))) return responder({ error: "Firma inválida" }, 401);
    await sql`insert into public.schedule_exceptions (user_id, block_id, exception_date)
      select ${user}, ${block}, ${fecha} where not exists (select 1 from public.schedule_exceptions where block_id = ${block} and exception_date = ${fecha})`;
    return responder({ ok: true });
  }

  if (!k.cron || req.headers.get("x-cron") !== k.cron) return responder({ error: "No autorizado" }, 401);
  if (cuerpo.tipo === "manana") return responder({ ok: true, enviados: await manana() });
  if (cuerpo.tipo === "bloques") return responder({ ok: true, enviados: await bloques() });
  if (cuerpo.tipo === "noche") return responder({ ok: true, enviados: await noche() });
  if (cuerpo.tipo === "viernes") return responder({ ok: true, enviados: await viernes() });
  if (cuerpo.tipo === "domingo") return responder({ ok: true, enviados: await domingo() });
  if (cuerpo.tipo === "mensaje" && cuerpo.user_id && cuerpo.titulo) {
    return responder({ ok: true, enviados: await enviar(cuerpo.user_id, cuerpo.titulo, cuerpo.cuerpo || "", "mensaje-" + Date.now(), { url: cuerpo.url }) });
  }
  return responder({ error: "Tipo desconocido" }, 400);
});
