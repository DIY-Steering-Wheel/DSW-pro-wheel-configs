const EFFECT_NAMES = [
  "Constant",
  "Ramp",
  "Square",
  "Sine",
  "Triangle",
  "Saw Tooth Up",
  "Saw Tooth Down",
  "Spring",
  "Damper",
  "Inertia",
  "Friction",
  "Custom",
];

const EFFECT_COLORS = [
  "#2f6bff",
  "#3fa3ff",
  "#6f7ff7",
  "#53ffba",
  "#ffb84d",
  "#ff7b7b",
  "#ff6ac1",
  "#7dffea",
  "#9d7bff",
  "#ffd36a",
  "#7de6ff",
  "#ffffff",
];

const MAX_POINTS = 600;
const FORCE_RANGE = 32767;

let liveSeries = EFFECT_NAMES.map(() => []);
let canvasEl = null;
let canvasCtx = null;

function buildEffectCard(name) {
  const card = document.createElement("div");
  card.className = "effect-card";
  card.innerHTML = `
    <div class="effect-title">
      <span>${name}</span>
      <span class="effect-active"></span>
    </div>
    <div class="effect-row">
      <span>Max</span>
      <span class="effect-max">0</span>
    </div>
    <div class="effect-bar"><span style="width: 0%;"></span></div>
    <div class="effect-row">
      <span>Ativos</span>
      <span class="effect-nb">0</span>
    </div>
    <div class="effect-row">
      <span>Forca</span>
      <span class="effect-force">0</span>
    </div>
  `;
  return card;
}

function renderGrid(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  EFFECT_NAMES.forEach((name) => {
    container.appendChild(buildEffectCard(name));
  });
}

function updateEffectGrid(containerId, payload) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const cards = Array.from(container.querySelectorAll(".effect-card"));
  const effects = payload?.effects || [];
  const forces = payload?.forces || [];
  const activeMask = payload?.active_mask || 0;

  cards.forEach((card, index) => {
    const stats = effects[index] || {};
    const force = forces[index] ?? 0;
    const active = (activeMask & (1 << index)) !== 0;
    const maxValue = Number.isFinite(stats.max) ? stats.max : 0;
    const nbValue = Number.isFinite(stats.nb) ? stats.nb : 0;

    card.querySelector(".effect-active")?.classList.toggle("on", active);
    const maxEl = card.querySelector(".effect-max");
    if (maxEl) maxEl.textContent = `${maxValue}`;
    const nbEl = card.querySelector(".effect-nb");
    if (nbEl) nbEl.textContent = `${nbValue}`;
    const forceEl = card.querySelector(".effect-force");
    if (forceEl) forceEl.textContent = `${force}`;

    const bar = card.querySelector(".effect-bar span");
    if (bar) {
      const pct = Math.min(100, Math.abs(maxValue) / 32767 * 100);
      bar.style.width = `${pct}%`;
    }
  });
}

function setCanvasSize() {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvasEl.width = Math.floor(rect.width * ratio);
  canvasEl.height = Math.floor(rect.height * ratio);
  canvasCtx?.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function pushLiveForces(forces) {
  if (!forces || forces.length === 0) return;
  for (let i = 0; i < EFFECT_NAMES.length; i += 1) {
    const value = forces[i] ?? 0;
    const series = liveSeries[i];
    series.push(value);
    if (series.length > MAX_POINTS) {
      series.shift();
    }
  }
}

function drawLiveCanvas() {
  if (!canvasCtx || !canvasEl) return;
  const width = canvasEl.getBoundingClientRect().width;
  const height = canvasEl.getBoundingClientRect().height;
  canvasCtx.clearRect(0, 0, width, height);

  canvasCtx.strokeStyle = "rgba(255,255,255,0.08)";
  canvasCtx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height / 4) * i;
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, y);
    canvasCtx.lineTo(width, y);
    canvasCtx.stroke();
  }

  const mid = height / 2;
  canvasCtx.strokeStyle = "rgba(63,163,255,0.5)";
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, mid);
  canvasCtx.lineTo(width, mid);
  canvasCtx.stroke();

  liveSeries.forEach((series, index) => {
    if (series.length < 2) return;
    canvasCtx.strokeStyle = EFFECT_COLORS[index % EFFECT_COLORS.length];
    canvasCtx.lineWidth = 1.2;
    canvasCtx.beginPath();
    series.forEach((value, idx) => {
      const x = (idx / (MAX_POINTS - 1)) * width;
      const y = mid - (value / FORCE_RANGE) * (height * 0.45);
      if (idx === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
    });
    canvasCtx.stroke();
  });
}

window.DswMonitoring = {
  init() {
    renderGrid("effectStatusGrid");
    canvasEl = document.getElementById("effectLiveCanvas");
    if (canvasEl) {
      canvasCtx = canvasEl.getContext("2d");
      setCanvasSize();
      window.addEventListener("resize", setCanvasSize);
    }
    return true;
  },
  updateStatus(payload) {
    updateEffectGrid("effectStatusGrid", payload);
  },
  updateLive(payload) {
    pushLiveForces(payload?.forces || []);
    drawLiveCanvas();
  },
};
