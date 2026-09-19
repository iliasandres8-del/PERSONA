// Punto de entrada: arma el shell (navegación, cabecera, botón +), conecta el router con
// las vistas y las vuelve a pintar cuando cambian los datos.
import { $, $$, html, saludo, MESES, DIAS, DIA_LABEL, fmtDuration } from "./core/utils.js";
import { state, loadAll, resetStore, subscribe } from "./core/store.js";
import { initRouter, route } from "./core/router.js";
import { view } from "./core/view.js";
import { settings, applyTheme } from "./core/settings.js";
import { onActs } from "./core/actions.js";
import { icon } from "./ui/icons.js";
import { openSheet, closeSheet } from "./ui/modal.js";
import { openAdd } from "./ui/crud.js";
import { initTooltips } from "./ui/charts.js";
import { initAuth } from "./features/auth.js";

import inicio from "./features/inicio.js";
import tiempo from "./features/tiempo.js";
import dinero from "./features/dinero.js";
import estudio from "./features/estudio.js";
import entreno from "./features/entreno.js";
import ajustes from "./features/ajustes.js";

const views = { inicio, tiempo, dinero, estudio, entreno, ajustes };
const NAV = [inicio, tiempo, dinero, estudio, entreno];

applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
initTooltips();

const appEl = $("#app");
const authEl = $("#auth-screen");
const viewEl = $("#view");
let loggedIn = false;

// ---------- Cabecera y navegación ----------
function renderHeader() {
  const now = new Date();
  const name = settings.get("name");
  $("#greeting").textContent = `${saludo(now)}${name ? ", " + name : ""}`;
  $("#today-line").textContent = `${DIA_LABEL[DIAS[now.getDay()]]}, ${now.getDate()} de ${MESES[now.getMonth()]}`;
}
document.addEventListener("settings:name", renderHeader);

function renderNav() {
  $("#nav-items").innerHTML = html`${NAV.map(
    (v) => html`<a href="#/${v.id}" data-view="${v.id}" style="--nav-accent:var(--c-${v.accent})">${icon(v.icon)}<span>${v.label}</span></a>`
  )}`.toString();
}

function paintNav() {
  $$("#nav-items a").forEach((a) => {
    const on = a.dataset.view === route.view;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

// ---------- Pintado de la vista actual ----------
function render() {
  if (!loggedIn) return;
  const v = views[route.view];
  const subnav = v.subs
    ? html`<nav class="subnav" aria-label="Secciones de ${v.label}">${v.subs.map(
        ([k, l]) => html`<a href="#/${v.id}/${k}" class="${route.sub === k ? "active" : ""}"${route.sub === k ? html` aria-current="page"` : ""}>${l}</a>`
      )}</nav>`
    : "";
  const title = v.id === "ajustes" ? html`<div class="page-title"><a class="icon-btn" href="#/inicio" aria-label="Volver">${icon("chevronL")}</a><h2>Ajustes</h2></div>` : "";
  viewEl.setAttribute("data-view", v.id);
  viewEl.style.setProperty("--accent", `var(--c-${v.accent})`);
  viewEl.innerHTML = title.toString() + subnav.toString() + `<div class="view-body">${v.render(route.sub)}</div>`;
  paintNav();
}

// Junta varias peticiones seguidas de pintado en una sola. Se usa setTimeout y no
// requestAnimationFrame: con la pestaña oculta el navegador pausa los frames y la vista
// se quedaría desactualizada al volver.
let queued = false;
function scheduleRender() {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; render(); }, 0);
}
view.setUp(scheduleRender);

subscribe((tables) => {
  const v = views[route.view];
  if (!tables.length || tables.some((t) => v.tables.includes(t))) scheduleRender();
});

// ---------- Botón + (acceso rápido) ----------
const QUICK = [
  ["gastos", "Gasto", "wallet"], ["ingresos", "Ingreso", "trend"], ["tareas", "Tarea", "book"],
  ["ahorros", "Ahorro", "target"], ["sesiones", "Sesión de entreno", "dumbbell"], ["actividades", "Actividad", "clock"]
];
onActs({
  "quick.open": () =>
    openSheet(
      html`<h3 class="sheet-title">Agregar rápido</h3>
        <div class="quick-grid">${QUICK.map(
          ([k, l, i]) => html`<button type="button" class="quick-item" data-act="quick.add" data-k="${k}">${icon(i)}<span>${l}</span></button>`
        )}</div>`.toString(),
      { label: "Agregar rápido" }
    ),
  "quick.add": (el) => { closeSheet(true); openAdd(el.dataset.k); }
});

// ---------- Sesión ----------
function onLogin(user) {
  loggedIn = true;
  state.user = user;
  authEl.hidden = true;
  appEl.hidden = false;
  renderHeader();
  renderNav();
  viewEl.innerHTML = `<div class="loading"><i></i><i></i><i></i></div>`;
  loadAll().then(() => {
    initRouter(views, (_r, initial) => {
      render();
      if (!initial) { window.scrollTo(0, 0); viewEl.focus({ preventScroll: true }); }
    });
  });
}
function onLogout() {
  loggedIn = false;
  state.user = null;
  resetStore();
  closeSheet(true);
  appEl.hidden = true;
  authEl.hidden = false;
  location.hash = "";
}
initAuth({ onLogin, onLogout });

// ---------- Reloj: mantiene "ahora" al día sin recargar ----------
setInterval(() => {
  $$("[data-since]").forEach((el) => { el.textContent = fmtDuration((Date.now() - Number(el.dataset.since)) / 60000); });
}, 30000);
setInterval(() => {
  const sheetOpen = !$("#sheet-root").hidden;
  if (loggedIn && !sheetOpen && ["inicio", "tiempo"].includes(route.view)) { renderHeader(); render(); }
}, 60000);

// ---------- PWA ----------
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* sin offline, no pasa nada */ });
}
