// AJUSTES: nombre, tema, jornal, exportar tus datos y cerrar sesión.
import { html, dateKey, money } from "../core/utils.js";
import { rows, state, TABLES } from "../core/store.js";
import { settings } from "../core/settings.js";
import { onActs, onChange } from "../core/actions.js";
import { view } from "../core/view.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";

const THEMES = [["auto", "Automático"], ["light", "Claro"], ["dark", "Oscuro"]];

function download(name, text, mime) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Evita que Excel/Sheets ejecuten como fórmula un texto que empiece con = + - @
const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default {
  id: "ajustes", label: "Ajustes", icon: "sliders", accent: "inicio", subs: null, hidden: true,
  tables: ["integrations"],
  render() {
    const s = settings.all();
    return html`
      <section class="card">
        <header class="card-head"><h2>Perfil</h2></header>
        <div class="form-grid">
          <div class="field"><label for="set-name">Tu nombre</label>
            <input id="set-name" type="text" value="${s.name}" placeholder="Para el saludo de Inicio" data-change="set.field" data-field="name"></div>
          <div class="field"><label>Correo</label><input type="text" value="${(state.user && state.user.email) || ""}" disabled></div>
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h2>Apariencia</h2></header>
        <div class="seg" role="group" aria-label="Tema">${THEMES.map(
          ([v, l]) => html`<button type="button" class="${s.theme === v ? "on" : ""}" data-act="set.theme" data-v="${v}">${l}</button>`
        )}</div>
      </section>

      <section class="card">
        <header class="card-head"><h2>Dinero</h2></header>
        <div class="field"><label for="set-jornal">Lo que ganas por jornal (COP)</label>
          <input id="set-jornal" type="number" inputmode="numeric" value="${s.jornal || ""}" data-change="set.field" data-field="jornal" data-number="1">
          <small>Se usa en el botón "Trabajé hoy". Déjalo vacío para ocultarlo. Ahora: ${s.jornal ? money(s.jornal) : "oculto"}.</small></div>
      </section>

      <section class="card">
        <header class="card-head"><h2>Tus datos</h2></header>
        <p class="hint top">Descarga una copia de todo lo que has guardado. La conexión con Aula Extendida no se incluye.</p>
        <div class="stack-actions">
          <button class="btn" type="button" data-act="set.exportJson">${icon("download")}<span>Copia completa (JSON)</span></button>
          <button class="btn" type="button" data-act="set.exportCsv">${icon("download")}<span>Movimientos (CSV)</span></button>
          <button class="btn ghost" type="button" data-act="schedule.seed">${icon("calendar")}<span>Cargar mi horario base</span></button>
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h2>Sesión</h2></header>
        <button class="btn danger" type="button" data-act="auth.signout">${icon("logout")}<span>Cerrar sesión</span></button>
      </section>`;
  }
};

onChange("set.field", (el) => {
  const key = el.dataset.field;
  let v = el.value.trim();
  if (el.dataset.number) v = v === "" ? 0 : Math.max(0, Number(v) || 0);
  settings.set({ [key]: v });
  if (key === "name") document.dispatchEvent(new CustomEvent("settings:name"));
  toast("Guardado ✓");
  view.rerender();
});

onActs({
  "set.theme": (el) => { settings.set({ theme: el.dataset.v }); view.rerender(); },
  "set.exportJson": () => {
    const tables = {};
    TABLES.filter((t) => t !== "integrations").forEach((t) => { tables[t] = rows(t); });
    download(`panel-personal-${dateKey()}.json`, JSON.stringify({ exported_at: new Date().toISOString(), tables }, null, 2), "application/json");
  },
  "set.exportCsv": () => {
    const list = [
      ...rows("income").map((r) => ({ ...r, tipo: "ingreso" })),
      ...rows("expenses").map((r) => ({ ...r, tipo: "gasto" }))
    ].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    const lines = ["fecha,tipo,descripcion,categoria,monto"].concat(
      list.map((r) => [r.entry_date, r.tipo, r.description, r.category, r.amount].map(csvCell).join(","))
    );
    download(`movimientos-${dateKey()}.csv`, "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
  }
});
