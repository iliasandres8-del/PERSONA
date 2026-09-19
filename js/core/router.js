// Router por hash: #/dinero/movimientos. El botón "atrás" del celular funciona y cada
// pantalla tiene su propio enlace.
export const route = { view: "inicio", sub: null };

let views = {};
let onChange = () => {};
let listening = false;

// Se puede llamar en cada inicio de sesión: el listener se registra una sola vez.
export function initRouter(viewMap, cb) {
  views = viewMap;
  onChange = cb;
  if (!listening) {
    listening = true;
    window.addEventListener("hashchange", () => resolve());
  }
  resolve(true);
}

function resolve(initial = false) {
  const [v, s] = location.hash.replace(/^#\/?/, "").split("/");
  const view = views[v] ? v : "inicio";
  const subs = views[view].subs;
  const sub = subs ? (subs.some(([k]) => k === s) ? s : subs[0][0]) : null;
  route.view = view;
  route.sub = sub;
  onChange(route, initial);
}
