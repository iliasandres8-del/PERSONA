// Preferencias del dispositivo (nombre, tema, jornal). Viven en localStorage.
import { storage } from "./utils.js";

const KEY = "panel.settings.v1";
const DEFAULTS = { name: "", theme: "auto", jornal: 60000 };

let cache = { ...DEFAULTS, ...(storage.get(KEY, {}) || {}) };

export const settings = {
  get: (k) => cache[k],
  all: () => ({ ...cache }),
  set(patch) {
    cache = { ...cache, ...patch };
    storage.set(KEY, cache);
    if ("theme" in patch) applyTheme();
  }
};

export function applyTheme() {
  const t = cache.theme;
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
  else root.removeAttribute("data-theme");
  const dark = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0B0E13" : "#F4F5F8");
}
