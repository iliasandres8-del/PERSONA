// Formulario modal genérico. Un solo componente reemplaza las filas de inputs sueltos
// de la versión anterior (que en el celular eran 5-6 campos apilados sin contexto).
//
// openForm({
//   title, accent, submitLabel, values,
//   fields: [{ name, label, type: text|number|date|time|select|textarea|chips, required,
//              options: [{v,l}], default, placeholder, step, hint, half }],
//   onSubmit: async (values) => false | void   // false = mantener abierto
// })
import { html, raw, dateKey } from "../core/utils.js";
import { openSheet, closeSheet } from "./modal.js";

const val = (values, f) => {
  if (values && values[f.name] != null) return values[f.name];
  if (f.default === "today") return dateKey();
  return f.default ?? (f.type === "chips" ? [] : "");
};

function control(f, v) {
  const id = `f-${f.name}`;
  const req = f.required ? raw(" required") : "";
  switch (f.type) {
    case "select":
      return html`<select id="${id}" name="${f.name}"${req}>${(f.options || []).map(
        (o) => html`<option value="${o.v}"${String(o.v) === String(v ?? "") ? raw(" selected") : ""}>${o.l}</option>`
      )}</select>`;
    case "textarea":
      return html`<textarea id="${id}" name="${f.name}" rows="3" placeholder="${f.placeholder || ""}"${req}>${v}</textarea>`;
    case "chips": {
      const sel = new Set(v || []);
      return html`<div class="chip-group" id="${id}">${(f.options || []).map(
        (o) => html`<label class="chip-check"><input type="checkbox" name="${f.name}" value="${o.v}"${sel.has(o.v) ? raw(" checked") : ""}><span>${o.l}</span></label>`
      )}</div>`;
    }
    case "number":
      return html`<input id="${id}" name="${f.name}" type="number" inputmode="decimal" step="${f.step || "any"}" placeholder="${f.placeholder || ""}" value="${v}"${req}>`;
    default:
      return html`<input id="${id}" name="${f.name}" type="${f.type || "text"}" placeholder="${f.placeholder || ""}" value="${v}" autocomplete="off"${req}>`;
  }
}

export function openForm({ title, accent = "", submitLabel = "Guardar", values = null, fields, onSubmit, note = "" }) {
  const list = typeof fields === "function" ? fields() : fields;
  const body = html`
    <form class="form" novalidate>
      <h3 class="sheet-title">${title}</h3>
      ${note ? html`<p class="sheet-text">${note}</p>` : ""}
      <div class="form-grid">
        ${list.map(
          (f) => html`<div class="field${f.half ? " half" : ""}">
            <label for="f-${f.name}">${f.label}${f.required ? raw('<span class="req" aria-hidden="true"> *</span>') : ""}</label>
            ${control(f, val(values, f))}
            ${f.hint ? html`<small>${f.hint}</small>` : ""}
          </div>`
        )}
      </div>
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        <button class="btn ghost" type="button" data-sheet-close>Cancelar</button>
        <button class="btn primary" type="submit">${submitLabel}</button>
      </div>
    </form>`.toString();

  openSheet(body, {
    accent,
    label: title,
    onMount: (sheet) => {
      const form = sheet.querySelector("form");
      const errEl = sheet.querySelector(".form-error");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const out = {};
        for (const f of list) {
          if (f.type === "chips") {
            out[f.name] = Array.from(form.querySelectorAll(`input[name="${f.name}"]:checked`)).map((c) => c.value);
            if (f.required && out[f.name].length === 0) { errEl.textContent = `Elige al menos un valor en "${f.label}".`; return; }
            continue;
          }
          const el = form.elements[f.name];
          let v = el.value.trim();
          if (f.type === "number") {
            v = el.value === "" ? null : Number(el.value);
            if (v != null && Number.isNaN(v)) v = null;
          } else if (v === "") v = null;
          if (f.required && (v === null || v === "")) { errEl.textContent = `Completa "${f.label}".`; el.focus(); return; }
          out[f.name] = v;
        }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        errEl.textContent = "";
        try {
          const keep = await onSubmit(out);
          if (keep !== false) closeSheet();
        } catch (err) {
          errEl.textContent = err && err.message ? err.message : "No se pudo guardar.";
        } finally {
          btn.disabled = false;
        }
      });
    }
  });
}
