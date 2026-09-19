// Registro central de acciones: cualquier elemento con data-act="nombre" dispara
// el manejador registrado. Así los botones siguen funcionando aunque una vista se
// vuelva a pintar, sin re-enlazar eventos cada vez.
const clicks = new Map();
const changes = new Map();

export function onActs(obj) { Object.entries(obj).forEach(([k, fn]) => clicks.set(k, fn)); }
export function onChange(name, fn) { changes.set(name, fn); }

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = clicks.get(el.dataset.act);
  if (fn) fn(el, e);
});

document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  if (!el) return;
  const fn = changes.get(el.dataset.change);
  if (fn) fn(el, e);
});
