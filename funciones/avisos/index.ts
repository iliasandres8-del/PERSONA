// Avisos del panel al celular (web push). Se despliega como Edge Function "avisos" en panel-personal.
// GET            -> llave pública para suscribirse
// POST manana    -> 5 a. m.: clases y trabajo de hoy + tareas que vencen hoy o mañana (pg_cron)
// POST bloques   -> cada 5 min: aviso unos minutos antes de cada clase o turno (pg_cron)
// POST noche     -> 9 p. m.: tareas que vencen mañana, si hay (pg_cron)
// POST prueba    -> la persona se manda un aviso de prueba (con su sesión)
// Las llamadas del cron traen x-cron, un secreto guardado en la tabla push_private.
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

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const AVISAR = ["universidad", "trabajo"];

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

async function enviar(userId: string, titulo: string, cuerpo: string, etiqueta: string, url = "./") {
  const subs = await sql`select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = ${userId}`;
  let enviados = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ titulo, cuerpo, etiqueta, url }),
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
  return {
    fecha: d.toISOString().slice(0, 10),
    dia: DIAS[d.getUTCDay()],
    minutos: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}
const aMinutos = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
function hora(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

// Personas con al menos un celular suscrito y el aviso encendido (sin fila = todo encendido)
async function gente(campo: "morning" | "before_block" | "tasks_night") {
  return await sql`
    select distinct s.user_id, coalesce(n.lead_minutes, 15) as lead
    from public.push_subscriptions s
    left join public.notification_settings n on n.user_id = s.user_id
    where coalesce(n.${sql(campo)}, true)`;
}

async function bloquesDe(userId: string, dia: string, fecha: string) {
  return await sql`
    select b.id, b.title, b.category, b.start_time::text as ini
    from public.schedule_blocks b
    where b.user_id = ${userId} and b.day_of_week = ${dia} and b.category in ${sql(AVISAR)}
      and not exists (select 1 from public.schedule_exceptions e where e.block_id = b.id and e.exception_date = ${fecha})
    order by b.start_time`;
}

async function tareasDe(userId: string, desde: string, hasta: string) {
  const filas = await sql`
    select distinct on (lower(t.title), t.due_date) t.title, t.due_date::text as vence
    from public.tasks t
    where t.user_id = ${userId} and coalesce(t.status, 'pendiente') <> 'completada'
      and t.due_date between ${desde} and ${hasta}
    order by lower(t.title), t.due_date`;
  return filas.sort((a, b) => a.vence.localeCompare(b.vence));
}

async function manana() {
  const hoy = colombia(), man = colombia(1);
  let n = 0;
  for (const p of await gente("morning")) {
    const bloques = await bloquesDe(p.user_id, hoy.dia, hoy.fecha);
    const tareas = await tareasDe(p.user_id, hoy.fecha, man.fecha);
    const partes: string[] = [];
    partes.push(bloques.length ? bloques.map((b) => `${b.title} ${hora(b.ini)}`).join(" · ") : "Hoy no tienes clases ni trabajo.");
    const hoyT = tareas.filter((t) => t.vence === hoy.fecha), manT = tareas.filter((t) => t.vence === man.fecha);
    if (hoyT.length) partes.push(`Vence hoy: ${hoyT.map((t) => t.title).join(", ")}.`);
    if (manT.length) partes.push(`Vence mañana: ${manT.map((t) => t.title).join(", ")}.`);
    const titulo = hoyT.length ? `Hoy tienes ${hoyT.length} ${hoyT.length === 1 ? "entrega" : "entregas"}` : "Así va tu día";
    n += await enviar(p.user_id, titulo, partes.join("\n"), "manana", "./#/inicio");
  }
  return n;
}

async function bloques() {
  const hoy = colombia();
  let n = 0;
  for (const p of await gente("before_block")) {
    for (const b of await bloquesDe(p.user_id, hoy.dia, hoy.fecha)) {
      const faltan = aMinutos(b.ini) - hoy.minutos;
      if (faltan <= 0 || faltan > p.lead) continue;
      const nuevo = await sql`insert into public.push_log (user_id, key) values (${p.user_id}, ${"bloque:" + b.id + ":" + hoy.fecha}) on conflict do nothing returning key`;
      if (!nuevo.length) continue;
      const titulo = b.category === "trabajo" ? `En ${faltan} min entras al trabajo` : `En ${faltan} min: ${b.title}`;
      n += await enviar(p.user_id, titulo, `Empieza a las ${hora(b.ini)}.`, "bloque-" + b.id, "./#/tiempo");
    }
  }
  await sql`delete from public.push_log where sent_at < now() - interval '3 days'`;
  return n;
}

async function noche() {
  const man = colombia(1);
  let n = 0;
  for (const p of await gente("tasks_night")) {
    const tareas = await tareasDe(p.user_id, man.fecha, man.fecha);
    if (!tareas.length) continue;
    const titulo = tareas.length === 1 ? "Mañana vence una tarea" : `Mañana vencen ${tareas.length} tareas`;
    n += await enviar(p.user_id, titulo, tareas.map((t) => t.title).join("\n"), "noche", "./#/estudio/tareas");
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const k = await cargarLlaves();
  if (req.method === "GET") return responder({ publica: k.publica });
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);
  let cuerpo: { tipo?: string };
  try { cuerpo = await req.json(); } catch { return responder({ error: "Cuerpo inválido" }, 400); }

  if (cuerpo.tipo === "prueba") {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: `Bearer ${token}` } });
    if (!u.ok) return responder({ error: "Sesión vencida" }, 401);
    const { id } = await u.json();
    const n = await enviar(id, "Así se ven los avisos del panel", "Te aviso en la mañana cómo va tu día, antes de cada clase y en la noche lo que vence mañana.", "prueba");
    return responder({ ok: true, enviados: n });
  }

  if (!k.cron || req.headers.get("x-cron") !== k.cron) return responder({ error: "No autorizado" }, 401);
  if (cuerpo.tipo === "manana") return responder({ ok: true, enviados: await manana() });
  if (cuerpo.tipo === "bloques") return responder({ ok: true, enviados: await bloques() });
  if (cuerpo.tipo === "noche") return responder({ ok: true, enviados: await noche() });
  return responder({ error: "Tipo desconocido" }, 400);
});
