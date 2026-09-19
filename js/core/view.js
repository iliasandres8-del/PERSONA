// Puente para que las vistas pidan volver a pintarse sin importar main.js (evita ciclos).
export const view = {
  rerender: () => {},
  setUp(fn) { this.rerender = fn; }
};
