const api = window.parent?.pywebview?.api;

let axisInstances = [];
let currentAxis = null;
let expoScale = 1;

function updateStatus(text) {
  const hint = document.getElementById('curveHint');
  if (hint) hint.textContent = text || 'Pronto';
}

function renderTabs() {
  const container = document.getElementById('curveTabs');
  if (!container) return;
  container.innerHTML = '';
  axisInstances.forEach((axis) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (axis.instance === currentAxis ? ' active' : '');
    btn.textContent = axis.label;
    btn.addEventListener('click', () => {
      currentAxis = axis.instance;
      renderTabs();
      loadCurve();
    });
    container.appendChild(btn);
  });
}

async function loadAxisInstances() {
  if (!api) return;
  const active = await api.get_active_classes();
  axisInstances = (active || [])
    .filter((entry) => String(entry.clsname || '').toLowerCase().includes('axis'))
    .map((entry) => ({
      instance: entry.unique ?? 0,
      label: entry.title || entry.name || `Eixo ${entry.unique ?? 0}`,
    }));
  if (axisInstances.length && currentAxis === null) {
    currentAxis = axisInstances[0].instance;
  }
  renderTabs();
}

function computeExpo(value) {
  if (!expoScale) return 1;
  if (value === 0) return 1;
  const valF = Math.abs(value / expoScale);
  if (value < 0) return 1 / (1 + valF);
  return 1 + valF;
}

function drawCurve(exponent) {
  const canvas = document.getElementById('curveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // grid
  ctx.strokeStyle = 'rgba(90,126,190,0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    const x = (w / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(63,163,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const x = -1 + (2 * i) / 100;
    let y = Math.sign(x) * Math.pow(Math.abs(x), exponent);
    const px = ((x + 1) / 2) * w;
    const py = h - ((y + 1) / 2) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

async function loadCurve() {
  if (!api) return;
  await loadAxisInstances();
  if (!axisInstances.length) {
    updateStatus('Nenhum eixo ativo.');
    return;
  }

  const axis = currentAxis;
  updateStatus('Carregando...');
  const [expo, scale] = await api.serial_request_many([
    { cls: 'axis', cmd: 'expo', instance: axis, typechar: '?' },
    { cls: 'axis', cmd: 'exposcale', instance: axis, typechar: '?' },
  ]);

  const slider = document.getElementById('curveSlider');
  const value = parseInt(expo, 10) || 0;
  expoScale = parseInt(scale, 10) || 1;

  if (slider) slider.value = value;
  updateCurveLabels(value);

  const badge = document.getElementById('curveBadge');
  if (badge) badge.textContent = `Eixo ${axis}`;

  updateStatus('Pronto');
}

function updateCurveLabels(value) {
  const valueEl = document.getElementById('curveValue');
  const expoEl = document.getElementById('curveExpo');
  const expo = computeExpo(value);
  if (valueEl) valueEl.textContent = value;
  if (expoEl) expoEl.textContent = expo.toFixed(2);
  drawCurve(expo);
}

async function applyCurve() {
  if (!api || currentAxis === null || currentAxis === undefined) return;
  const slider = document.getElementById('curveSlider');
  if (!slider) return;
  const value = parseInt(slider.value, 10) || 0;
  updateStatus('Aplicando...');
  await api.serial_set_value('axis', 'expo', value, currentAxis, null);
  updateStatus('Aplicado');
}

window.loadConfig = loadCurve;
window.applyConfig = applyCurve;

document.addEventListener('DOMContentLoaded', () => {
  loadCurve();
  const slider = document.getElementById('curveSlider');
  slider?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10) || 0;
    updateCurveLabels(val);
  });
});
