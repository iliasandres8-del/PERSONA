// GMAIL DEL BANCO: un Apps Script en el Gmail de la persona lee las alertas del banco cada 15 min
// y se las manda a la función "gmail-banco", que anota los gastos (los ingresos se anotan a mano).
// El script se identifica con una llave que se muestra una sola vez; aquí solo se guarda su SHA-256.
import { html } from "../core/utils.js";
import { db } from "../core/db.js";
import { state } from "../core/store.js";
import { onActs } from "../core/actions.js";
import { view } from "../core/view.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { confirmDialog } from "../ui/modal.js";
import { SUPABASE_URL } from "../supabase-config.js";

const CODIGO = `// Panel personal: lee las alertas de tu banco en Gmail y anota los gastos en tu panel.
// Solo puede LEER correos (no enviar ni borrar) y solo busca correos de bancos.
// Al panel solo le manda el asunto y el texto de esas alertas.
const PANEL_LLAVE = "__LLAVE__";
const PANEL_URL = "${SUPABASE_URL}/functions/v1/gmail-banco";
const BUSQUEDA = "{from:nu.com.co from:bancolombia from:notificacionesbancolombia.com from:nequi from:daviplata from:davivienda from:bbva from:bancodebogota from:avvillas from:bancopopular from:colpatria from:scotiabankcolpatria from:lulobank from:bancofalabella from:itau from:bancocajasocial from:rappipay from:movii} -category:promotions newer_than:2d";

function activar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("revisar").timeBased().everyMinutes(15).create();
  revisar();
  Logger.log("Listo: el panel va a revisar tus alertas cada 15 minutos.");
}

function gmail(ruta) {
  var r = UrlFetchApp.fetch("https://gmail.googleapis.com/gmail/v1/users/me/" + ruta, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } });
  return JSON.parse(r.getContentText());
}

function textoDe(parte) {
  if (!parte) return "";
  var datos = parte.body && parte.body.data ? Utilities.newBlob(Utilities.base64DecodeWebSafe(parte.body.data)).getDataAsString("UTF-8") : "";
  if (parte.mimeType === "text/plain" && datos) return datos;
  if (parte.parts) for (var i = 0; i < parte.parts.length; i++) { var t = textoDe(parte.parts[i]); if (t) return t; }
  if (parte.mimeType === "text/html" && datos) return datos.replace(/<style[\\s\\S]*?<\\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  return "";
}

function revisar() {
  var props = PropertiesService.getScriptProperties();
  var vistos = JSON.parse(props.getProperty("vistos") || "[]");
  var lista = gmail("messages?maxResults=25&q=" + encodeURIComponent(BUSQUEDA)).messages || [];
  var alertas = [];
  lista.forEach(function (m) {
    if (vistos.indexOf(m.id) >= 0) return;
    var c = gmail("messages/" + m.id + "?format=full");
    var h = function (n) { var x = (c.payload.headers || []).filter(function (y) { return y.name.toLowerCase() === n; })[0]; return x ? x.value : ""; };
    alertas.push({ id: m.id, fecha: new Date(Number(c.internalDate)).toISOString(), de: h("from"), asunto: h("subject"), texto: (textoDe(c.payload) || c.snippet || "").slice(0, 3000) });
  });
  var r = UrlFetchApp.fetch(PANEL_URL, { method: "post", contentType: "application/json", payload: JSON.stringify({ llave: PANEL_LLAVE, alertas: alertas }), muteHttpExceptions: true });
  if (r.getResponseCode() === 200) props.setProperty("vistos", JSON.stringify(vistos.concat(alertas.map(function (a) { return a.id; })).slice(-300)));
  else Logger.log("El panel respondió: " + r.getContentText());
}
`;

const MANIFIESTO = `{
  "timeZone": "America/Bogota",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
`;

let conexion; // undefined = sin revisar, null = no conectado
let llave = null; // solo existe justo después de generarla
let revisando = false;

async function huella(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function haceCuanto(fecha) {
  const min = Math.round((Date.now() - new Date(fecha)) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

export function gmailCard() {
  if (conexion === undefined && state.user && !revisando) {
    revisando = true;
    db.from("gmail_links").select("last_seen, created_at").maybeSingle()
      .then(({ data }) => { conexion = data || null; })
      .catch(() => { conexion = null; })
      .finally(() => { revisando = false; view.rerender(); });
  }
  const c = conexion;
  return html`<section class="card">
    <header class="card-head"><h2>${icon("mail")}Gastos desde el Gmail del banco</h2></header>
    <p class="hint top">El panel anota solo los pagos que te llegan como alerta al correo (Nu, Bancolombia, Nequi, Davivienda y otros) y te avisa al celular. Los ingresos los sigues anotando tú cada viernes. Funciona con un programa pequeño que instalas en tu propio Gmail: solo puede leer, y solo manda las alertas del banco.</p>
    ${c ? html`<div class="callout ${c.last_seen ? "ok" : ""}"><b>${c.last_seen ? "Conectado" : "Esperando la primera revisión"}</b><p>${c.last_seen ? `Última revisión ${haceCuanto(c.last_seen)}.` : "Si ya hiciste los pasos y ejecutaste «activar», en unos minutos aparece como conectado."}</p></div>` : ""}
    ${llave
      ? html`<ol class="steps">
          <li>Hazlo desde el <b>computador</b>, con la cuenta de Gmail donde te llegan las alertas del banco.</li>
          <li>Abre <a href="https://script.new" target="_blank" rel="noopener">script.new</a> y arriba cámbiale el nombre a <b>Panel</b>.</li>
          <li>Borra lo que hay en el editor y pega el <b>código 1</b>.
            <div class="code-box"><button class="btn sm" type="button" data-act="gmail.copy" data-k="codigo">Copiar código 1</button><pre id="gm-codigo">${CODIGO.replace("__LLAVE__", llave)}</pre></div></li>
          <li>En el engranaje <b>Configuración del proyecto</b> marca <b>«Mostrar el archivo de manifiesto appsscript.json en el editor»</b>.</li>
          <li>Vuelve al editor, abre <b>appsscript.json</b>, borra todo y pega el <b>código 2</b>.
            <div class="code-box"><button class="btn sm" type="button" data-act="gmail.copy" data-k="manifiesto">Copiar código 2</button><pre id="gm-manifiesto">${MANIFIESTO}</pre></div></li>
          <li>Guarda con <b>Ctrl + S</b>, abre <b>Código.gs</b>, escoge la función <b>activar</b> y toca <b>Ejecutar</b>.</li>
          <li>Google pide permiso: <b>Revisar permisos</b> → tu cuenta → <b>Configuración avanzada</b> → <b>Ir a Panel (no seguro)</b> → <b>Permitir</b>. Dice «no seguro» porque el programa es tuyo y Google no lo revisó.</li>
        </ol>
        <p class="hint">Este código es solo tuyo: no se lo pases a nadie. Al salir de Ajustes ya no se vuelve a mostrar, pero puedes generar uno nuevo.</p>`
      : html`<div class="stack-actions">
          <button class="btn ${c ? "ghost" : "primary"}" type="button" data-act="gmail.gen">${icon("link")}<span>${c ? "Generar código nuevo" : "Conectar mi Gmail"}</span></button>
          ${c ? html`<button class="btn ghost danger" type="button" data-act="gmail.off">Desconectar</button>` : ""}
        </div>
        ${c ? html`<p class="hint">Un código nuevo apaga el anterior: tendrías que pegar el código 1 otra vez en tu script.</p>` : ""}`}
  </section>`;
}

onActs({
  "gmail.gen": async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const nueva = Array.from(bytes).map((x) => x.toString(16).padStart(2, "0")).join("");
    const { error } = await db.from("gmail_links").upsert({ user_id: state.user.id, key_hash: await huella(nueva), last_seen: null }, { onConflict: "user_id" });
    if (error) { toast("No pude generar el código.", "error"); return; }
    llave = nueva;
    conexion = { last_seen: null };
    view.rerender();
  },
  "gmail.copy": async (el) => {
    const pre = document.getElementById(el.dataset.k === "codigo" ? "gm-codigo" : "gm-manifiesto");
    try { await navigator.clipboard.writeText(pre.textContent); toast("Copiado ✓"); }
    catch { toast("No pude copiar: selecciónalo a mano.", "error"); }
  },
  "gmail.off": async () => {
    if (!(await confirmDialog({ title: "¿Desconectar el Gmail?", message: "El panel deja de anotar los gastos del banco. Borra también el script en script.google.com." }))) return;
    const { error } = await db.from("gmail_links").delete().eq("user_id", state.user.id);
    if (error) { toast("No se pudo desconectar.", "error"); return; }
    conexion = null; llave = null;
    toast("Gmail desconectado");
    view.rerender();
  }
});

// La llave solo se muestra mientras sigues en Ajustes
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/ajustes")) llave = null; });
db.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { conexion = undefined; llave = null; } });
