// Hoja modal (sheet) reutilizable: formularios, confirmaciones, temporizador...
import { esc, html } from "../core/utils.js";

let lastFocus = null;
let onCloseCb = null;
const rootEl = () => document.getElementById("sheet-root");

// locked: el toque en el fondo no cierra (útil para el temporizador, que no debe perderse por error).
export function openSheet(content, { accent = "", onMount, onClose, wide = false, label = "", locked = false } = {}) {
  const root = rootEl();
  closeSheet(true);
  lastFocus = document.activeElement;
  onCloseCb = onClose || null;
  root.innerHTML =
    `<div class="sheet-backdrop"${locked ? "" : " data-sheet-close"}></div>` +
    `<div class="sheet${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(label)}" data-accent="${esc(accent)}">${content}</div>`;
  root.hidden = false;
  document.body.classList.add("no-scroll");
  requestAnimationFrame(() => root.classList.add("open"));
  const sheet = root.querySelector(".sheet");
  // En pantallas táctiles no enfocamos solos: abriría el teclado sin que lo pidas.
  if (matchMedia("(pointer:fine)").matches) {
    const first = sheet.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea");
    if (first) first.focus();
  }
  if (onMount) onMount(sheet);
  return sheet;
}

export function closeSheet(silent = false) {
  const root = rootEl();
  if (!root || root.hidden) return;
  root.classList.remove("open");
  root.hidden = true;
  root.innerHTML = "";
  document.body.classList.remove("no-scroll");
  const cb = onCloseCb;
  onCloseCb = null;
  if (!silent && cb) cb();
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-sheet-close]")) closeSheet();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSheet();
});

export function confirmDialog({ title = "¿Seguro?", message = "", confirmLabel = "Eliminar", danger = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      closeSheet(true);
      resolve(v);
    };
    openSheet(
      html`<h3 class="sheet-title">${title}</h3>
        <p class="sheet-text">${message}</p>
        <div class="sheet-actions">
          <button class="btn ghost" data-c="no" type="button">Cancelar</button>
          <button class="btn ${danger ? "danger" : "primary"}" data-c="yes" type="button">${confirmLabel}</button>
        </div>`.toString(),
      {
        label: title,
        onClose: () => finish(false),
        onMount: (s) => {
          s.querySelector("[data-c=yes]").onclick = () => finish(true);
          s.querySelector("[data-c=no]").onclick = () => finish(false);
          s.querySelector("[data-c=no]").focus();
        }
      }
    );
  });
}
