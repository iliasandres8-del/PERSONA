// CRUD genérico: define una vez (tabla, campos, cómo se ve cada fila) y obtienes
// "agregar / editar / eliminar" con formulario modal, confirmación y avisos.
// Reemplaza ~12 bloques casi idénticos de la versión anterior.
import { html } from "../core/utils.js";
import { icon } from "./icons.js";
import { openForm } from "./form.js";
import { confirmDialog } from "./modal.js";
import { toast } from "./toast.js";
import { insert, update, remove, findById } from "../core/store.js";
import { onActs } from "../core/actions.js";

const registry = new Map();

// cfg: { key, table, accent, addLabel, editLabel, fields(item|null), toRow(values, item), fromRow(item),
//        row(item) -> { title, sub, side, tone, leading, actions, className }, create(payload), deleteMessage(item), after() }
export function defineCrud(cfg) {
  registry.set(cfg.key, cfg);
  const addButton = (label, cls = "primary") =>
    html`<button class="btn sm ${cls}" type="button" data-act="crud.add" data-k="${cfg.key}">${icon("plus")}<span>${label || cfg.addLabel}</span></button>`;
  return {
    key: cfg.key,
    addButton,
    // Una sola fila (para listas que mezclan varias tablas, como Movimientos)
    rowHtml: (item) => rowHtml(cfg, item),
    list: (items, { empty } = {}) =>
      items.length
        ? html`<ul class="rows">${items.map((it) => rowHtml(cfg, it))}</ul>`
        : empty || emptyState({ title: "Aún no hay nada por aquí", action: addButton() })
  };
}

export function emptyState({ title, text = "", action = "" }) {
  return html`<div class="empty"><b>${title}</b>${text ? html`<p>${text}</p>` : ""}${action}</div>`;
}

function rowHtml(cfg, it) {
  const r = cfg.row(it);
  return html`<li class="row ${r.className || ""}">
    ${r.leading || ""}
    <div class="row-main"><b>${r.title}</b>${r.sub ? html`<small>${r.sub}</small>` : ""}</div>
    <div class="row-side">
      ${r.side != null ? html`<span class="row-amount ${r.tone || ""}">${r.side}</span>` : ""}
      ${r.actions || ""}
      <button class="icon-btn" type="button" data-act="crud.edit" data-k="${cfg.key}" data-id="${it.id}" aria-label="Editar">${icon("edit")}</button>
      <button class="icon-btn danger" type="button" data-act="crud.del" data-k="${cfg.key}" data-id="${it.id}" aria-label="Eliminar">${icon("trash")}</button>
    </div>
  </li>`;
}

// ---------- Abrir formularios desde cualquier parte ----------
export function openAdd(key, preset = null) {
  const cfg = registry.get(key);
  if (!cfg) return;
  openForm({
    title: cfg.addLabel,
    accent: cfg.accent,
    values: preset,
    fields: () => cfg.fields(null),
    onSubmit: async (v) => {
      const payload = cfg.toRow ? cfg.toRow(v, null) : v;
      const res = cfg.create ? await cfg.create(payload) : await insert(cfg.table, payload);
      if (!res) return false;
      toast("Guardado ✓");
      if (cfg.after) cfg.after();
    }
  });
}

export function openEdit(key, id) {
  const cfg = registry.get(key);
  const item = cfg && findById(cfg.table, id);
  if (!item) return;
  openForm({
    title: cfg.editLabel || "Editar",
    accent: cfg.accent,
    values: cfg.fromRow ? cfg.fromRow(item) : item,
    fields: () => cfg.fields(item),
    onSubmit: async (v) => {
      const patch = cfg.toRow ? cfg.toRow(v, item) : v;
      const ok = await update(cfg.table, item.id, patch);
      if (!ok) return false;
      toast("Actualizado ✓");
      if (cfg.after) cfg.after();
    }
  });
}

export async function askDelete(key, id) {
  const cfg = registry.get(key);
  const item = cfg && findById(cfg.table, id);
  if (!item) return;
  const yes = await confirmDialog({
    title: "¿Eliminar este registro?",
    message: cfg.deleteMessage ? cfg.deleteMessage(item) : "Esta acción no se puede deshacer."
  });
  if (!yes) return;
  if (await remove(cfg.table, item.id)) {
    toast("Eliminado");
    if (cfg.afterDelete) cfg.afterDelete(item);
    if (cfg.after) cfg.after();
  }
}

onActs({
  "crud.add": (el) => openAdd(el.dataset.k),
  "crud.edit": (el) => openEdit(el.dataset.k, el.dataset.id),
  "crud.del": (el) => askDelete(el.dataset.k, el.dataset.id)
});
