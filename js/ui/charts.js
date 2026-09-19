// Gráficos hechos con HTML/CSS (no SVG): así el texto es real, se adapta al ancho de la
// pantalla y las barras nunca se deforman. Reglas: barras de máx. 24 px, borde superior
// redondeado de 4 px, cuadrícula fina, leyenda con texto neutro y tooltip al pasar/tocar.
import { html, esc, moneyShort } from "../core/utils.js";

// Redondea el máximo a un número "limpio" (1, 2, 5 x 10^n) para que los ejes se lean bien.
export function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * p;
}

export function legend(series) {
  return html`<div class="legend">${series.map(
    (s) => html`<span class="legend-item"><i class="swatch" style="background:${s.color}"></i>${s.name}</span>`
  )}</div>`;
}

// items: [{ label, values:[n,...], tip }]; series: [{ name, color }]
export function columnChart({ items, series, format = moneyShort, ariaLabel = "Gráfico de columnas", height = 168 }) {
  const max = niceMax(Math.max(0, ...items.flatMap((i) => i.values)));
  const ticks = [1, 0.5, 0];
  return html`
    ${series.length > 1 ? legend(series) : ""}
    <div class="chart" role="img" aria-label="${ariaLabel}" style="--plot-h:${height}px">
      <div class="chart-axis">${ticks.map((t) => html`<span style="bottom:${t * 100}%">${format(max * t)}</span>`)}</div>
      <div class="chart-plot">
        ${ticks.map((t) => html`<i class="gridline" style="bottom:${t * 100}%"></i>`)}
        <div class="cols">${items.map(
          (it) => html`<div class="col" data-tip="${it.tip || ""}" tabindex="0">
            <div class="pair">${it.values.map(
              (v, i) => html`<i class="bar" style="height:${(v / max) * 100}%;--bar:${series[i].color}"></i>`
            )}</div>
          </div>`
        )}</div>
      </div>
      <div class="chart-labels">${items.map((it) => html`<span>${it.label}</span>`)}</div>
    </div>`;
}

// items: [{ label, value, tip }]
export function hBars({ items, format = (v) => v, color = "var(--series-1)" }) {
  const max = Math.max(0, ...items.map((i) => i.value)) || 1;
  return html`<div class="hbars">${items.map(
    (it) => html`<div class="hbar" data-tip="${it.tip || ""}" tabindex="0">
      <span class="hbar-label">${it.label}</span>
      <span class="hbar-track"><i style="width:${Math.max(2, (it.value / max) * 100)}%;--bar:${color}"></i></span>
      <span class="hbar-value">${format(it.value)}</span>
    </div>`
  )}</div>`;
}

export function meter(pct, { tone = "" } = {}) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return html`<div class="meter ${tone}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>`;
}

// ---------- Tooltip compartido (hover en escritorio, toque en celular) ----------
let tip;
function showTip(el, x, y) {
  const text = el.dataset.tip;
  if (!text) return;
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  tip.innerHTML = esc(text).replace(/\n/g, "<br>");
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
  const top = y - r.height - 14 < 8 ? y + 18 : y - r.height - 14;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
function hideTip() { if (tip) tip.hidden = true; }

export function initTooltips() {
  document.addEventListener("mousemove", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el && el.dataset.tip) showTip(el, e.clientX, e.clientY); else hideTip();
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el && el.dataset.tip && matchMedia("(hover:none)").matches) {
      showTip(el, e.clientX, e.clientY);
      setTimeout(hideTip, 2200);
    } else if (!el) hideTip();
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el && el.dataset.tip) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); }
  });
  document.addEventListener("focusout", hideTip);
  window.addEventListener("scroll", hideTip, { passive: true });
}
