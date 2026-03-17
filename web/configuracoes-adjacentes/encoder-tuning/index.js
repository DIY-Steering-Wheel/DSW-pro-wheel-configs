const api = window.parent?.pywebview?.api;

let axisInstances = [];
let currentAxis = null;

function updateStatus(text) {
  const hint = document.getElementById('encTuneHint');
  if (hint) hint.textContent = text || 'Pronto';
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function renderTabs() {
  const container = document.getElementById('encoderTuneTabs');
  if (!container) return;
  container.innerHTML = '';
  axisInstances.forEach((axis) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (axis.instance === currentAxis ? ' active' : '');
    btn.textContent = axis.label;
    btn.addEventListener('click', () => {
      currentAxis = axis.instance;
      renderTabs();
      loadTuning();
    });
    container.appendChild(btn);
  });
}

async function loadAxisInstances() {
  if (!api) return;
  const active = await api.get_active_classes();
  const axisCandidates = (active || [])
    .filter((entry) => String(entry.clsname || '').toLowerCase().includes('axis'))
    .map((entry) => ({
      instance: entry.unique ?? 0,
      label: entry.title || entry.name || `Eixo ${entry.unique ?? 0}`,
    }));

  const filtered = [];
  for (const axis of axisCandidates) {
    const enctype = await api.serial_request('axis', 'enctype', axis.instance, null, '?');
    const encId = parseInt(enctype, 10);
    if (!Number.isNaN(encId) && encId !== 255) {
      filtered.push(axis);
    }
  }

  axisInstances = filtered;
  if (axisInstances.length && currentAxis === null) {
    currentAxis = axisInstances[0].instance;
  }
  renderTabs();
}

function parseFilter(reply) {
  if (!reply) return { freq: 0, q: 0 };
  const parts = reply.split(':');
  if (parts.length < 2) return { freq: parseInt(reply, 10) || 0, q: 0 };
  return { freq: parseInt(parts[0], 10) || 0, q: (parseInt(parts[1], 10) || 0) / 100 };
}

async function loadTuning() {
  if (!api) return;
  await loadAxisInstances();
  if (!axisInstances.length) {
    updateStatus('Nenhum encoder configurado.');
    return;
  }

  const axis = currentAxis;
  updateStatus('Carregando...');

  const [profile, cpr, filterSpeed, filterAccel, reduction, reductionAvail] = await api.serial_request_many([
    { cls: 'axis', cmd: 'filterProfile_id', instance: axis, typechar: '?' },
    { cls: 'axis', cmd: 'cpr', instance: axis, typechar: '?' },
    { cls: 'axis', cmd: 'filterSpeed', instance: axis, typechar: '?' },
    { cls: 'axis', cmd: 'filterAccel', instance: axis, typechar: '?' },
    { cls: 'axis', cmd: 'reduction', instance: axis, typechar: '?' },
    { cls: 'axis', cmd: 'cmdinfo', instance: axis, typechar: '?', adr: 17 },
  ]);

  const profileEl = document.getElementById('encProfile');
  if (profileEl) profileEl.value = String(parseInt(profile, 10) || 0);
  setValue('encCpr', parseInt(cpr, 10) || 0);

  const sp = parseFilter(filterSpeed);
  const ac = parseFilter(filterAccel);
  setValue('encSpeedFreq', sp.freq);
  setValue('encSpeedQ', sp.q.toFixed(2));
  setValue('encAccelFreq', ac.freq);
  setValue('encAccelQ', ac.q.toFixed(2));

  const reductionCard = document.getElementById('reductionCard');
  const available = parseInt(reductionAvail, 10) > 0;
  if (reductionCard) reductionCard.style.display = available ? '' : 'none';
  if (available && reduction) {
    const parts = reduction.split(':');
    if (parts.length >= 2) {
      setValue('encReductionNum', parseInt(parts[0], 10) || 1);
      setValue('encReductionDen', parseInt(parts[1], 10) || 1);
      updateReductionHint();
    }
  }

  const badge = document.getElementById('encoderTuneBadge');
  if (badge) badge.textContent = `Eixo ${axis}`;

  updateStatus('Pronto');
}

function updateReductionHint() {
  const num = parseInt(document.getElementById('encReductionNum')?.value, 10) || 1;
  const den = parseInt(document.getElementById('encReductionDen')?.value, 10) || 1;
  const hint = document.getElementById('encReductionHint');
  if (hint) hint.textContent = `Prescaler: ${(num / den).toFixed(5)}`;
}

function suggestProfile() {
  const cpr = parseInt(document.getElementById('encCpr')?.value, 10) || 0;
  const profileEl = document.getElementById('encProfile');
  if (!profileEl) return;
  if (cpr <= 20000) profileEl.value = '0';
  else if (cpr < 65535) profileEl.value = '1';
  else profileEl.value = '2';
}

async function applyTuning() {
  if (!api || currentAxis === null || currentAxis === undefined) return;
  updateStatus('Aplicando...');
  const profile = parseInt(document.getElementById('encProfile')?.value, 10);
  if (!Number.isNaN(profile)) {
    await api.serial_set_value('axis', 'filterProfile_id', profile, currentAxis, null);
  }

  const reductionCard = document.getElementById('reductionCard');
  if (reductionCard && reductionCard.style.display !== 'none') {
    const num = parseInt(document.getElementById('encReductionNum')?.value, 10) || 1;
    const den = parseInt(document.getElementById('encReductionDen')?.value, 10) || 1;
    await api.serial_set_value('axis', 'reduction', num, currentAxis, den);
  }

  updateStatus('Aplicado');
}

window.loadConfig = loadTuning;
window.applyConfig = applyTuning;

document.addEventListener('DOMContentLoaded', () => {
  loadTuning();
  document.getElementById('encSuggest')?.addEventListener('click', () => {
    suggestProfile();
  });
  document.getElementById('encReductionNum')?.addEventListener('input', updateReductionHint);
  document.getElementById('encReductionDen')?.addEventListener('input', updateReductionHint);
});
