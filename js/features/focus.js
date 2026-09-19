// Modo enfoque: temporizador para "empezar ya" lo que sugiere el panel.
// Cuenta contra una hora de fin (no restando segundos), así no se atrasa si la pestaña
// queda en segundo plano.
import { html, pad } from "../core/utils.js";
import { onActs } from "../core/actions.js";
import { openSheet, closeSheet } from "../ui/modal.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";

let st = null;
let iv = null;
const R = 54;
const CIRC = 2 * Math.PI * R;

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
  } catch { /* sin audio */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

const left = () => (st.pausedLeft != null ? st.pausedLeft : Math.max(0, st.endsAt - Date.now()));
const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

function paint() {
  const root = document.getElementById("sheet-root");
  if (!st || !root) return;
  const ms = left();
  const time = root.querySelector("[data-f=time]");
  const ring = root.querySelector("[data-f=ring]");
  if (!time || !ring) return;
  time.textContent = fmt(ms);
  ring.style.strokeDashoffset = String(CIRC * (1 - ms / st.total));
  document.title = st.finished ? "¡Listo! · Panel" : `${fmt(ms)} · ${st.title}`;
  if (ms <= 0 && !st.finished) {
    st.finished = true;
    clearInterval(iv);
    beep();
    toast("¡Tiempo cumplido! 🎉");
    root.querySelector("[data-f=state]").textContent = "¡Listo!";
    root.querySelector("[data-act='focus.pause']").hidden = true;
  }
}

function stop() {
  clearInterval(iv);
  iv = null;
  st = null;
  document.title = "Panel personal";
}

export function startFocus({ title, minutes }) {
  const total = Math.max(1, Math.round(minutes || 25)) * 60000;
  st = { title, total, endsAt: Date.now() + total, pausedLeft: null, finished: false };
  openSheet(
    html`<div class="focus">
      <p class="eyebrow">Modo enfoque</p>
      <h3 class="focus-title">${title}</h3>
      <div class="ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="${R}" class="ring-bg"/>
          <circle cx="60" cy="60" r="${R}" class="ring-fg" data-f="ring" stroke-dasharray="${CIRC}" stroke-dashoffset="0" transform="rotate(-90 60 60)"/>
        </svg>
        <div class="ring-text"><b data-f="time">${fmt(total)}</b><span data-f="state">En marcha</span></div>
      </div>
      <div class="sheet-actions">
        <button class="btn ghost" type="button" data-act="focus.plus">+5 min</button>
        <button class="btn primary" type="button" data-act="focus.pause">${icon("pause")}<span>Pausar</span></button>
      </div>
      <button class="btn ghost block" type="button" data-act="focus.stop">Terminar</button>
    </div>`.toString(),
    {
      accent: "tiempo", label: "Modo enfoque", locked: true,
      onClose: stop,
      onMount: () => { paint(); iv = setInterval(paint, 250); }
    }
  );
}

onActs({
  "focus.pause": (el) => {
    if (!st || st.finished) return;
    const root = document.getElementById("sheet-root");
    if (st.pausedLeft == null) {
      st.pausedLeft = left();
      el.querySelector("span").textContent = "Reanudar";
      root.querySelector("[data-f=state]").textContent = "En pausa";
    } else {
      st.endsAt = Date.now() + st.pausedLeft;
      st.pausedLeft = null;
      el.querySelector("span").textContent = "Pausar";
      root.querySelector("[data-f=state]").textContent = "En marcha";
    }
  },
  "focus.plus": () => {
    if (!st) return;
    const extra = 5 * 60000;
    if (st.finished) {
      // Terminó y quieres cinco minutos más: se reinicia el anillo con esos cinco.
      st.finished = false;
      st.total = extra;
      st.endsAt = Date.now() + extra;
      iv = setInterval(paint, 250);
      const root = document.getElementById("sheet-root");
      root.querySelector("[data-act='focus.pause']").hidden = false;
      root.querySelector("[data-f=state]").textContent = "En marcha";
    } else if (st.pausedLeft != null) {
      st.total += extra;
      st.pausedLeft += extra;
    } else {
      st.total += extra;
      st.endsAt += extra;
    }
    paint();
  },
  "focus.stop": () => closeSheet()
});
