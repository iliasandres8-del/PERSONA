// Agenda del día (lista compacta) y cuadrícula semanal (bloques posicionados por hora).
import { html, minutesOf, hhmm, SEMANA, DIA_CORTO, minToHHMM } from "../core/utils.js";
import { CAT_LABEL } from "../data/defaults.js";
import { blocksOf } from "../core/recommend.js";

// ---------- Agenda del día ----------
export function agenda(blocks, nowMin, { empty = "No tienes nada agendado hoy." } = {}) {
  if (!blocks.length) return html`<div class="empty small">${empty}</div>`;
  return html`<ol class="agenda">${blocks.map((b) => {
    const s = minutesOf(b.start_time), e = minutesOf(b.end_time);
    const state = nowMin >= e ? "past" : nowMin >= s ? "now" : "future";
    return html`<li class="agenda-item ${state} cat-${b.category}">
      <span class="agenda-time">${hhmm(b.start_time)}</span>
      <span class="agenda-dot"></span>
      <span class="agenda-main">
        <b>${b.title}</b>
        <small>${CAT_LABEL[b.category] || b.category} · hasta ${hhmm(b.end_time)}</small>
      </span>
      ${state === "now" ? html`<span class="pill now-pill">Ahora</span>` : ""}
    </li>`;
  })}</ol>`;
}

// ---------- Cuadrícula semanal ----------
const H_FROM = 5, H_TO = 24, PX_PER_MIN = 0.62;

// Reparte los bloques solapados en "carriles" para que no se tapen.
function layoutLanes(list) {
  const items = list
    .map((b) => ({ b, s: minutesOf(b.start_time), e: minutesOf(b.end_time) }))
    .sort((x, y) => x.s - y.s || y.e - x.e);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const lanes = [];
    cluster.forEach((it) => {
      let li = lanes.findIndex((end) => end <= it.s);
      if (li < 0) { li = lanes.length; lanes.push(0); }
      lanes[li] = it.e;
      it.lane = li;
    });
    cluster.forEach((it) => { it.lanes = lanes.length; });
    out.push(...cluster);
    cluster = [];
  };
  for (const it of items) {
    if (it.s >= clusterEnd) { flush(); clusterEnd = it.e; }
    else clusterEnd = Math.max(clusterEnd, it.e);
    cluster.push(it);
  }
  flush();
  return out;
}

export function weekGrid({ blocks, selectedDay, todayKey, nowMin }) {
  const totalH = (H_TO - H_FROM) * 60 * PX_PER_MIN;
  const hours = [];
  for (let h = H_FROM; h < H_TO; h++) hours.push(h);

  const dayCol = (key) => {
    const laid = layoutLanes(blocksOf(blocks, key));
    const isToday = key === todayKey;
    const nowTop = (nowMin - H_FROM * 60) * PX_PER_MIN;
    return html`<div class="day-col${key === selectedDay ? " active" : ""}${isToday ? " today" : ""}" data-day="${key}">
      <div class="day-head"><span>${DIA_CORTO[key]}</span></div>
      <div class="day-body" style="height:${totalH}px">
        ${hours.map((h) => html`<i class="hour-line" style="top:${(h - H_FROM) * 60 * PX_PER_MIN}px"></i>`)}
        ${laid.map(({ b, s, e, lane, lanes }) => {
          const top = Math.max(0, (s - H_FROM * 60) * PX_PER_MIN);
          const h = Math.max(16, (e - s) * PX_PER_MIN - 2);
          const small = h < 34;
          return html`<button class="tblock cat-${b.category}${small ? " small" : ""}" data-act="block.edit" data-id="${b.id}"
            style="top:${top}px;height:${h}px;left:calc(${lane} * 100% / ${lanes} + 1px);width:calc(100% / ${lanes} - 2px)"
            title="${b.title} · ${hhmm(b.start_time)}-${hhmm(b.end_time)}">
            <b>${b.title}</b>${small ? "" : html`<small>${hhmm(b.start_time)}–${hhmm(b.end_time)}</small>`}
          </button>`;
        })}
        ${isToday && nowTop > 0 && nowTop < totalH ? html`<i class="now-line" style="top:${nowTop}px"></i>` : ""}
      </div>
    </div>`;
  };

  return html`
    <div class="day-tabs" role="tablist">${SEMANA.map(
      (k) => html`<button role="tab" class="day-tab${k === selectedDay ? " active" : ""}${k === todayKey ? " is-today" : ""}" data-act="week.day" data-day="${k}">
        <span>${DIA_CORTO[k]}</span>
      </button>`
    )}</div>
    <div class="week-grid">
      <div class="hours-col">
        <div class="day-head"><span>&nbsp;</span></div>
        <div class="day-body" style="height:${totalH}px">${hours.map(
          (h) => html`<span class="hour-label" style="top:${(h - H_FROM) * 60 * PX_PER_MIN}px">${minToHHMM(h * 60)}</span>`
        )}</div>
      </div>
      ${SEMANA.map(dayCol)}
    </div>
    <p class="hint">Toca un bloque para editarlo o eliminarlo.</p>`;
}
