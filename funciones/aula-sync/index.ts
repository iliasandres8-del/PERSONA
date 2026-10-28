// aula-sync: revisa las tareas de Aula Extendida (Moodle) de Andrés y las pasa a su panel MI VIDA.
// - Tarea nueva en Aula  -> se crea en public.tasks (o se enlaza a una que él ya había anotado).
// - Ya entregada en Aula -> se marca 'completada' en el panel.
// - Cambió la fecha      -> se actualiza.
// Lo llama pg_cron 6 veces al día y el botón "Sincronizar ahora" del panel (con la sesión de Andrés).
// Solo lee Aula: nunca entrega nada.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3";

const USER_ID = "87496b5a-681a-4e19-ab96-a9d7f5685bc7";
const MOODLE = "https://aulapregrado.unisimon.edu.co/webservice/rest/server.php";
const TZ = "America/Bogota";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });

const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const fechaBogota = (epoch: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(epoch * 1000));

async function moodle(token: string, wsfunction: string, params: Record<string, string> = {}) {
  const body = new URLSearchParams({ wstoken: token, wsfunction, moodlewsrestformat: "json", ...params });
  const r = await fetch(MOODLE, { method: "POST", body });
  const j = await r.json();
  if (j?.exception) throw new Error(`${wsfunction}: ${j.errorcode} ${j.message}`);
  return j;
}

function prioridad(nombre: string, vence: string, hoy: string) {
  const n = normalizar(nombre);
  if (/parcial|examen|quiz|sustentacion/.test(n)) return "alta";
  const dias = (Date.parse(vence) - Date.parse(hoy)) / 86400000;
  return dias <= 2 ? "alta" : "media";
}

// El cron manda la clave del atajo; el panel manda la sesión de Andrés.
async function autorizado(req: Request, clave: string, claveBuena: string) {
  if (clave && clave === claveBuena) return true;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const u = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: `Bearer ${token}` } });
  return u.ok && (await u.json()).id === USER_ID;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  const secretos = Object.fromEntries((await sql`
    select name, decrypted_secret from vault.decrypted_secrets
    where name in ('ministro_moodle_token', 'ministro_clave_atajo')`).map((f) => [f.name, f.decrypted_secret]));

  let clave = "";
  try { clave = String((await req.json())?.clave ?? ""); } catch { /* sin cuerpo */ }
  if (!(await autorizado(req, clave, secretos.ministro_clave_atajo))) return json({ error: "No autorizado" }, 401);

  const token = secretos.ministro_moodle_token;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const nuevas: unknown[] = [], entregadas: unknown[] = [], cambios: unknown[] = [];

  try {
    const [materias, enlazadas, datos] = await Promise.all([
      sql`select id, name from public.subjects where user_id = ${USER_ID}`,
      sql`select assign_id, task_id, vence, entregada from ministro.aula_tareas`,
      moodle(token, "mod_assign_get_assignments"),
    ]);
    const porAssign = new Map(enlazadas.map((e) => [e.assign_id, e]));

    for (const curso of datos.courses ?? []) {
      const nombreCurso = normalizar(curso.fullname);
      const materia = materias.find((m) => nombreCurso.includes(normalizar(m.name)));

      for (const a of curso.assignments ?? []) {
        if (!a.duedate) continue;
        const vence = fechaBogota(a.duedate);
        const ya = porAssign.get(a.id);
        // Solo interesan las que no han vencido, o las ya enlazadas (para marcar entregas tardías).
        if (!ya && vence < hoy) continue;

        const estado = await moodle(token, "mod_assign_get_submission_status", { assignid: String(a.id) });
        const entregada = estado?.lastattempt?.submission?.status === "submitted";

        if (!ya) {
          // ¿Él ya la había anotado a mano? (título parecido, con un día de margen por la zona horaria)
          const candidatas = await sql`select id, title from public.tasks
            where user_id = ${USER_ID} and due_date between ${vence}::date - 1 and ${vence}::date + 1
              and id not in (select task_id from ministro.aula_tareas)`; // ya enlazada a otra tarea de Aula
          const palabras = normalizar(a.name).split(" ").filter((p) => p.length > 3);
          const manual = candidatas.find((t) => {
            const n = normalizar(t.title);
            return palabras.length > 0 && palabras.filter((p) => n.includes(p)).length >= Math.ceil(palabras.length / 2);
          });

          let taskId = manual?.id;
          if (!taskId) {
            const [t] = await sql`insert into public.tasks
              (user_id, subject_id, title, description, due_date, priority, status)
              values (${USER_ID}, ${materia?.id ?? null}, ${a.name},
                      ${"Aula Extendida - " + curso.fullname}, ${vence}::date,
                      ${prioridad(a.name, vence, hoy)}, ${entregada ? "completada" : "pendiente"})
              returning id`;
            taskId = t.id;
            if (!entregada) nuevas.push({ materia: materia?.name ?? curso.fullname, tarea: a.name, vence });
          }
          await sql`insert into ministro.aula_tareas (assign_id, task_id, curso, nombre, vence, entregada)
            values (${a.id}, ${taskId}, ${curso.fullname}, ${a.name}, to_timestamp(${a.duedate}), ${entregada})`;
          if (manual) {
            await sql`update public.tasks set due_date = ${vence}::date, updated_at = now()
              ${entregada ? sql`, status = 'completada'` : sql``} where id = ${taskId}`;
          }
          continue;
        }

        if (entregada && !ya.entregada) {
          await sql`update public.tasks set status = 'completada', updated_at = now() where id = ${ya.task_id}`;
          entregadas.push({ tarea: a.name });
        }
        const venciaAntes = ya.vence ? fechaBogota(new Date(ya.vence).getTime() / 1000) : null;
        if (venciaAntes !== vence) {
          await sql`update public.tasks set due_date = ${vence}::date, updated_at = now() where id = ${ya.task_id}`;
          cambios.push({ tarea: a.name, antes: venciaAntes, ahora: vence });
        }
        await sql`update ministro.aula_tareas set entregada = ${entregada}, vence = to_timestamp(${a.duedate}),
          revisado = now() where assign_id = ${a.id}`;
      }
    }

    await sql`insert into ministro.aula_sync (nuevas, entregadas)
      values (${sql.json(nuevas)}, ${sql.json([...entregadas, ...cambios.map((c) => ({ cambio_fecha: c }))])})`;
    return json({ ok: true, nuevas, entregadas, cambios });
  } catch (err) {
    const msg = (err as Error).message;
    console.error(err);
    await sql`insert into ministro.aula_sync (error) values (${msg})`;
    // invalidtoken = la clave de Aula venció: el resumen de la mañana le avisa a Andrés.
    return json({ ok: false, error: msg }, 500);
  }
});
