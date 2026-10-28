// DILE AL PANEL: escribes o dictas una frase ("gasté 8 mil en empanada", "me pagaron 240 mil",
// "parcial de cálculo el viernes", "entrené gym") y el panel la entiende y la anota.
// No usa IA: son reglas sencillas, y antes de guardar siempre muestra lo que entendió.
import { html, dateKey, addDays, DIAS, money, cap, fmtDateShort } from "../core/utils.js";
import { insert, rows } from "../core/store.js";
import { onActs } from "../core/actions.js";
import { icon } from "../ui/icons.js";
import { openSheet, closeSheet } from "../ui/modal.js";
import { openAdd } from "../ui/crud.js";
import { toast } from "../ui/toast.js";
import { todayBudget } from "./dinero.js";
import { TIPOS_ENTRENO } from "./entreno.js";

const quitarTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Categorías de gasto (GASTO_CATEGORIAS) por palabras comunes
const PISTAS = [
  ["Salida con novia", /novia/],
  ["Salida con amigos", /amigos|parche|rumba|cerveza|pola|guaro|cine|bar\b|discoteca|concierto|estadio|partido/],
  ["Transporte", /bus|transmetro|moto|gasolina|taxi|uber|didi|indriver|picap|pasaje|parqueadero|peaje|metro/],
  ["Comida afuera", /almuerzo|desayuno|cena|comida|empanada|arepa|perro|hamburguesa|pizza|salchipapa|gaseosa|jugo|tinto|cafe|mecato|paquete|pollo|helado|pan\b|panaderia|corrientazo|domicilio|rappi|onces|fritos?|chuzo|agua/],
  ["Compra personal", /ropa|camisa|camiseta|pantalon|zapato|tenis|guayos|celular|audifonos|cargador|perfume|corte|barberia|peluqueria/],
  ["Estudio", /fotocopia|impresion|imprimir|libro|cuaderno|universidad|semestre|matricula|lapiz|lapicero/],
  ["Salud", /drogueria|pastilla|medico|medicina|gym|gimnasio|proteina|creatina|odontolog/],
  ["Suscripciones", /netflix|spotify|disney|youtube|plan\b|datos|recarga|minutos|icloud|prime/],
  ["Deuda", /deuda|cuota|prestamo/]
];

// "8 mil", "8k", "8.000", "$15.500", "1,5 millones", "dos lucas" no (solo números)
function leerMonto(t) {
  const m = t.match(/\$?\s?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(mil|k\b|lucas?|millon(?:es)?|palos?|barras?)?/);
  if (!m) return null;
  let n;
  const unidad = m[2] || "";
  if (/^\d{1,3}([.,]\d{3})+$/.test(m[1])) n = Number(m[1].replace(/[.,]/g, ""));
  else n = Number(m[1].replace(",", "."));
  if (/mil|k|luca|barra/.test(unidad)) n *= 1000;
  else if (/millon|palo/.test(unidad)) n *= 1000000;
  return n > 0 ? Math.round(n) : null;
}

const DIAS_SIN = DIAS.map(quitarTildes);
// "hoy", "mañana", "pasado mañana", "el viernes", "el 15"
function leerFecha(t, base = new Date()) {
  if (/pasado manana/.test(t)) return dateKey(addDays(base, 2));
  if (/\bmanana\b/.test(t)) return dateKey(addDays(base, 1));
  if (/\bhoy\b/.test(t)) return dateKey(base);
  const dia = DIAS_SIN.find((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (dia) {
    let d = addDays(base, 1);
    while (DIAS_SIN[d.getDay()] !== dia) d = addDays(d, 1);
    return dateKey(d);
  }
  const num = t.match(/\bel (\d{1,2})\b/);
  if (num) {
    const n = Number(num[1]);
    let d = new Date(base.getFullYear(), base.getMonth(), n);
    if (dateKey(d) < dateKey(base)) d = new Date(base.getFullYear(), base.getMonth() + 1, n);
    return dateKey(d);
  }
  return null;
}

// Lo que va después de "en", "de" o "para": "gasté 8 mil en empanada con gaseosa" -> "Empanada con gaseosa"
function leerDescripcion(original) {
  const m = original.match(/\b(?:en|de|para|por)\s+(?:un[ao]?s?\s+|el\s+|la\s+|los\s+|las\s+)?([^\d$]{3,60}?)\s*(?:$|[.,;]| (?:hoy|ayer|mañana)\b)/i);
  if (m) return cap(m[1].trim());
  // Sin "en/de": lo que queda al quitar el monto y los verbos ("Pasaje 3 mil" -> "Pasaje")
  const resto = original.replace(/\$?\s?\d[\d.,]*\s*(mil|k|lucas?|millon(es)?|millón|palos?|barras?)?/gi, " ")
    .replace(/(^| )(gast[eé]|pagu[eé]|compr[eé]|me pagaron|pagaron|recib[ií]|me lleg[oó]|ahorr[eé]|guard[eé]|hoy|ayer|pesos)(?= |$)/gi, " ")
    .replace(/\s{2,}/g, " ").trim();
  return resto.length >= 3 ? cap(resto) : "";
}

export function interpretar(frase, base = new Date()) {
  const original = frase.trim();
  const t = quitarTildes(original.toLowerCase());
  if (!t) return null;

  const tipoEntreno = /entren|gym|gimnasio|jugu?e futbol|futbol|corri|trote/.test(t) && !/gaste|pague|compre/.test(t)
    ? (/futbol/.test(t) ? "futbol" : /corri|trote/.test(t) ? "correr" : /casa/.test(t) ? "casa" : "gym") : null;
  if (tipoEntreno) return { tipo: "entreno", kind: tipoEntreno };

  if (/tarea|taller|parcial|quiz|examen|exposicion|entrega|trabajo de|proyecto/.test(t) && !/gaste|pague|compre/.test(t)) {
    const titulo = cap(original.replace(/\b(tengo|hay|que|anota|anotame|recuerdame|para el|para|el|la)\b/gi, " ")
      .replace(/\b(hoy|pasado mañana|mañana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/gi, " ")
      .replace(/\s{2,}/g, " ").trim()) || "Tarea";
    const kind = /parcial|examen/.test(t) ? "parcial" : /quiz/.test(t) ? "quiz" : /exposicion/.test(t) ? "exposicion" : "taller";
    const materia = rows("subjects").find((s) => t.includes(quitarTildes(s.name.toLowerCase()).split(" ")[0]));
    return { tipo: "tarea", title: titulo, due_date: leerFecha(t, base), kind, subject_id: materia ? materia.id : null, materia: materia && materia.name };
  }

  const amount = leerMonto(t);
  if (!amount) return null;
  const fecha = /\bayer\b/.test(t) ? dateKey(addDays(base, -1)) : dateKey(base);
  if (/me pagaron|pagaron|recibi|me llego|me llegaron|cobre|gane|ingreso|me dieron|me consignaron/.test(t)) {
    return { tipo: "ingreso", amount, entry_date: fecha, description: leerDescripcion(original) || (/trabajo|semana|turno|f-?10|club/.test(t) ? "Trabajo" : "Ingreso") };
  }
  if (/ahorre|guarde|ahorro/.test(t)) return { tipo: "ahorro", amount, entry_date: fecha, note: leerDescripcion(original) || "Ahorro" };
  const description = leerDescripcion(original);
  const category = (PISTAS.find(([, re]) => re.test(t)) || ["Otro"])[0];
  return { tipo: "gasto", amount, entry_date: fecha, category, description: description || category };
}

function resumen(r) {
  if (r.tipo === "gasto") return html`<b>Gasto de ${money(r.amount)}</b><span>${r.description} · ${r.category}${r.entry_date !== dateKey() ? ` · ${fmtDateShort(r.entry_date)}` : ""}</span>`;
  if (r.tipo === "ingreso") return html`<b>Ingreso de ${money(r.amount)}</b><span>${r.description}${r.entry_date !== dateKey() ? ` · ${fmtDateShort(r.entry_date)}` : ""}</span>`;
  if (r.tipo === "ahorro") return html`<b>Ahorro de ${money(r.amount)}</b><span>${r.note}</span>`;
  if (r.tipo === "tarea") return html`<b>${r.kind === "taller" ? "Tarea" : cap(r.kind)}: ${r.title}</b><span>${r.due_date ? `Para el ${fmtDateShort(r.due_date)}` : "Sin fecha"}${r.materia ? ` · ${r.materia}` : ""}</span>`;
  return html`<b>Entreno de hoy</b><span>${(TIPOS_ENTRENO.find(([k]) => k === r.kind) || [, "Otro"])[1]}</span>`;
}

async function guardar(r) {
  if (r.tipo === "gasto") {
    if (!(await insert("expenses", { entry_date: r.entry_date, amount: r.amount, category: r.category, description: r.description }))) return false;
    const b = todayBudget();
    toast(b.queda >= 0 ? `Anotado ✓ Hoy te quedan ${money(b.queda)}` : `Anotado ✓ Hoy te pasaste ${money(-b.queda)}`);
  } else if (r.tipo === "ingreso") {
    if (!(await insert("income", { entry_date: r.entry_date, amount: r.amount, description: r.description }))) return false;
    toast(`Ingreso anotado ✓ Ahora puedes gastar ${money(todayBudget().porDia)} por día`);
  } else if (r.tipo === "ahorro") {
    if (!(await insert("savings", { entry_date: r.entry_date, amount: r.amount, note: r.note }))) return false;
    toast("Ahorro guardado ✓");
  } else if (r.tipo === "tarea") {
    if (!(await insert("tasks", { title: r.title, due_date: r.due_date, kind: r.kind, subject_id: r.subject_id, priority: "media", status: "pendiente" }))) return false;
    toast("Tarea anotada ✓");
  } else {
    if (!(await insert("workout_sessions", { session_date: dateKey(), kind: r.kind }))) return false;
    toast("Entreno anotado 💪");
  }
  return true;
}

// Abre el formulario normal con lo que se entendió, por si hay que corregir algo
function corregir(r) {
  closeSheet(true);
  if (r.tipo === "gasto") openAdd("gastos", r);
  else if (r.tipo === "ingreso") openAdd("ingresos", r);
  else if (r.tipo === "ahorro") openAdd("ahorros", r);
  else if (r.tipo === "tarea") openAdd("tareas", { ...r, subject_id: r.subject_id || "" });
  else openAdd("sesiones", { session_date: dateKey() });
}

const EJEMPLOS = ["Gasté 8 mil en empanada", "Me pagaron 240 mil", "Pasaje 3 mil", "Parcial de cálculo el viernes", "Entrené gym"];
const Reconocer = window.SpeechRecognition || window.webkitSpeechRecognition;

export function openComando(texto = "") {
  openSheet(
    html`<form class="form comando" novalidate>
      <h3 class="sheet-title">Dile al panel</h3>
      <p class="sheet-text">Escríbelo como se lo dirías a un amigo${Reconocer ? " o toca el micrófono" : ""}.</p>
      <div class="cmd-input">
        <input name="frase" type="text" value="${texto}" placeholder="Ej: gasté 8 mil en empanada" autocomplete="off" enterkeyhint="done" aria-label="Qué quieres anotar">
        ${Reconocer ? html`<button class="icon-btn mic" type="button" data-b="mic" aria-label="Dictar">${icon("mic")}</button>` : ""}
      </div>
      <div class="chip-group small">${EJEMPLOS.map((e) => html`<button type="button" class="chip" data-ej="${e}">${e}</button>`)}</div>
      <div class="cmd-preview" aria-live="polite"></div>
      <div class="sheet-actions">
        <button class="btn ghost" type="button" data-b="fix" hidden>Corregir</button>
        <button class="btn primary" type="submit" disabled>Guardar</button>
      </div>
    </form>`.toString(),
    {
      accent: "inicio",
      label: "Dile al panel",
      onMount: (sheet) => {
        const form = sheet.querySelector("form");
        const input = form.elements.frase;
        const preview = sheet.querySelector(".cmd-preview");
        const save = form.querySelector('[type="submit"]');
        const fix = form.querySelector('[data-b="fix"]');
        let actual = null;
        const pintar = () => {
          actual = interpretar(input.value);
          save.disabled = !actual;
          fix.hidden = !actual;
          preview.innerHTML = !input.value.trim() ? ""
            : actual ? html`<div class="cmd-ok">${icon("check")}<div>${resumen(actual)}</div></div>`.toString()
            : html`<p class="hint">No te entendí. Prueba con un monto ("8 mil"), "me pagaron…", "parcial de… el viernes" o "entrené".</p>`.toString();
        };
        input.addEventListener("input", pintar);
        sheet.querySelectorAll("[data-ej]").forEach((b) => (b.onclick = () => { input.value = b.dataset.ej; pintar(); }));
        fix.onclick = () => actual && corregir(actual);
        const mic = form.querySelector('[data-b="mic"]');
        if (mic) mic.onclick = () => {
          const rec = new Reconocer();
          rec.lang = "es-CO";
          rec.interimResults = true;
          mic.classList.add("on");
          rec.onresult = (e) => { input.value = Array.from(e.results).map((x) => x[0].transcript).join(" "); pintar(); };
          rec.onend = () => mic.classList.remove("on");
          rec.onerror = () => { mic.classList.remove("on"); toast("No pude oírte. Revisa el permiso del micrófono.", "error"); };
          rec.start();
        };
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (!actual) return;
          save.disabled = true;
          if (await guardar(actual)) closeSheet();
          else save.disabled = false;
        });
        if (texto) pintar();
      }
    }
  );
}

onActs({ "cmd.open": () => openComando() });
