// AVISOS EN EL CELULAR: suscripción web push y qué avisos quiere recibir (función "avisos" en Supabase).
import { html } from "../core/utils.js";
import { db } from "../core/db.js";
import { state } from "../core/store.js";
import { onActs, onChange } from "../core/actions.js";
import { view } from "../core/view.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { SUPABASE_URL } from "../supabase-config.js";

const AVISOS_URL = `${SUPABASE_URL}/functions/v1/avisos`;
const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const PREFS = [
  ["morning", "Mi día, a las 5 a. m.", "Clases, trabajo y lo que vence hoy o mañana"],
  ["before_block", "Antes de cada clase y del trabajo", "No avisa las clases que marcaste como canceladas"],
  ["tasks_night", "Tareas de mañana, a las 9 p. m.", "Solo si algo vence al día siguiente"]
];
const DEFAULTS = { morning: true, before_block: true, tasks_night: true, lead_minutes: 15 };

let estado = "revisando";
let prefs = { ...DEFAULTS };
let ocupado = false;
let revisando = null;

function base64AUint8(b64) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function revisar() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) estado = esIphone && !instalada ? "instalar" : "no-soporta";
  else if (Notification.permission === "denied") estado = "bloqueados";
  else {
    const reg = await navigator.serviceWorker.ready;
    estado = (await reg.pushManager.getSubscription()) ? "activos" : "apagados";
  }
  const { data } = await db.from("notification_settings").select("*").maybeSingle();
  prefs = { ...DEFAULTS, ...(data || {}) };
  view.rerender();
}

async function activar() {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") { toast("Sin permiso no te puedo avisar. Actívalo en los ajustes del navegador.", "error"); return; }
  const { publica } = await (await fetch(AVISOS_URL)).json();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64AUint8(publica) });
  const j = sub.toJSON();
  const { error } = await db.from("push_subscriptions").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" });
  if (error) { toast("No pude guardar este celular para los avisos.", "error"); return; }
  toast("¡Listo! Te voy a avisar.");
}

async function apagar() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
  toast("Avisos apagados en este celular");
}

export function pushCard() {
  if (estado === "revisando" && state.user && !revisando) {
    revisando = revisar().catch(() => { estado = "no-soporta"; view.rerender(); }).finally(() => { revisando = null; });
  }
  const textos = {
    revisando: "Revisando…",
    instalar: "En iPhone los avisos solo funcionan con el panel instalado: toca Compartir y luego «Agregar a inicio». Después ábrelo desde el ícono y vuelve aquí.",
    "no-soporta": "Este navegador no deja recibir avisos. Prueba con Chrome en Android o instalando el panel en el iPhone.",
    bloqueados: "Bloqueaste los avisos del panel. Actívalos en los ajustes del navegador para este sitio."
  };
  const on = estado === "activos";
  return html`
    <section class="card">
      <header class="card-head"><h2>Avisos en el celular</h2></header>
      ${textos[estado] ? html`<p class="hint top">${textos[estado]}</p>` : html`
        <p class="hint top">${on ? "Este celular recibe los avisos." : "Te llegan como las notificaciones de WhatsApp, aunque el panel esté cerrado."}</p>
        <div class="stack-actions">
          <button class="btn ${on ? "ghost" : "primary"}" type="button" data-act="push.toggle" ${ocupado ? "disabled" : ""}>${icon("bell")}<span>${on ? "Apagar en este celular" : "Activar avisos"}</span></button>
          ${on ? html`<button class="btn ghost" type="button" data-act="push.test" ${ocupado ? "disabled" : ""}><span>Mandarme uno de prueba</span></button>` : ""}
        </div>
        ${on ? html`
          <div class="push-prefs">${PREFS.map(([k, t, d]) => html`
            <label class="push-pref"><span><b>${t}</b><small>${d}</small></span>
              <input type="checkbox" data-change="push.pref" data-k="${k}" ${prefs[k] ? "checked" : ""}></label>`)}
            <div class="field"><label for="push-lead">Avisarme antes de la clase</label>
              <select id="push-lead" data-change="push.lead">${[5, 10, 15, 30, 60].map((m) => html`<option value="${m}" ${prefs.lead_minutes === m ? "selected" : ""}>${m} minutos antes</option>`)}</select></div>
          </div>` : ""}`}
    </section>`;
}

async function guardar(patch) {
  const antes = { ...prefs };
  prefs = { ...prefs, ...patch };
  const { error } = await db.from("notification_settings").upsert({ ...prefs, user_id: state.user.id, updated_at: new Date().toISOString() });
  if (error) { prefs = antes; toast("No se pudo guardar.", "error"); } else toast("Guardado ✓");
  view.rerender();
}

onActs({
  "push.toggle": async () => {
    ocupado = true; view.rerender();
    try { if (estado === "activos") await apagar(); else await activar(); }
    catch { toast("Algo falló activando los avisos. Intenta otra vez.", "error"); }
    ocupado = false;
    await revisar();
  },
  "push.test": async () => {
    ocupado = true; view.rerender();
    const { data: { session } } = await db.auth.getSession();
    const r = await fetch(AVISOS_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ tipo: "prueba" }) }).then((x) => x.json()).catch(() => ({}));
    toast(r.enviados ? "Aviso enviado. Debe llegarte en segundos." : "No pude mandarlo. Apaga y vuelve a activar los avisos.", r.enviados ? "ok" : "error");
    ocupado = false; view.rerender();
  }
});
onChange("push.pref", (el) => guardar({ [el.dataset.k]: el.checked }));
onChange("push.lead", (el) => guardar({ lead_minutes: Number(el.value) }));

// Al cerrar sesión se vuelve a revisar con el próximo usuario
db.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") estado = "revisando"; });
