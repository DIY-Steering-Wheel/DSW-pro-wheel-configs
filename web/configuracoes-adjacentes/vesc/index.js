const api = window.parent?.pywebview?.api;

let instances = [];
let currentInstance = null;
let pollTimer = null;

function updateStatus(text) {
  const hint = document.getElementById('vescHint');
  if (hint) hint.textContent = text || 'Pronto';
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => loadStatus(currentInstance), 800);
}

function renderTabs() {
  const container = document.getElementById('vescTabs');
  if (!container) return;
  container.innerHTML = '';
  instances.forEach((inst) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (inst.instance === currentInstance ? ' active' : '');
    btn.textContent = inst.label;
    btn.addEventListener('click', () => {
      currentInstance = inst.instance;
      renderTabs();
      loadVesc();
    });
    container.appendChild(btn);
  });
}

async function loadInstances() {
  if (!api) return;
  const active = await api.get_active_classes();
  instances = (active || [])
    .filter((entry) => String(entry.clsname || '').toLowerCase().includes('vesc'))
    .map((entry) => ({
      instance: entry.unique ?? 0,
      label: entry.title || entry.name || `VESC ${entry.unique ?? 0}`,
    }));
  if (instances.length && currentInstance === null) {
    currentInstance = instances[0].instance;
  }
  renderTabs();
}

function updateTorqueBar(value) {
  const posBar = document.getElementById('vescTorquePos');
  const negBar = document.getElementById('vescTorqueNeg');
  const pct = Math.min(Math.abs(value), 100);
  if (value >= 0) {
    if (posBar) posBar.style.width = `${pct}%`;
    if (negBar) negBar.style.width = '0%';
  } else {
    if (negBar) negBar.style.width = `${pct}%`;
    if (posBar) posBar.style.width = '0%';
  }
}

async function loadStatus(inst) {
  if (!api || inst === null || inst === undefined) return;
  const [state, voltage, errors, torque, pos, rate] = await api.serial_request_many([
    { cls: 'vesc', cmd: 'vescstate', instance: inst, typechar: '?' },
    { cls: 'vesc', cmd: 'voltage', instance: inst, typechar: '?' },
    { cls: 'vesc', cmd: 'errorflags', instance: inst, typechar: '?' },
    { cls: 'vesc', cmd: 'torque', instance: inst, typechar: '?' },
    { cls: 'vesc', cmd: 'pos', instance: inst, typechar: '?' },
    { cls: 'vesc', cmd: 'encrate', instance: inst, typechar: '?' },
  ]);

  const badge = document.getElementById('vescState');
  const voltEl = document.getElementById('vescVoltage');
  const errEl = document.getElementById('vescErrors');
  const torqueEl = document.getElementById('vescTorque');
  const posEl = document.getElementById('vescPosition');
  const rateEl = document.getElementById('vescRate');

  const torqueValue = Math.ceil((parseInt(torque, 10) || 0) / 100);
  if (badge) badge.textContent = state || '--';
  if (voltEl) voltEl.textContent = voltage ? `${(parseInt(voltage, 10) / 1000).toFixed(2)} V` : '--';
  if (errEl) errEl.textContent = errors ? `Code ${errors}` : 'Ok';
  if (torqueEl) torqueEl.textContent = `${torqueValue}%`;
  if (posEl) posEl.textContent = pos ? `${((parseInt(pos, 10) || 0) * 360 / 1000000000).toFixed(2)}?` : '--';
  if (rateEl) rateEl.textContent = rate || '--';
  updateTorqueBar(torqueValue);
}

async function loadVesc() {
  if (!api) return;
  await loadInstances();
  if (!instances.length) {
    updateStatus('Nenhuma inst?ncia VESC ativa.');
    return;
  }

  const inst = currentInstance;
  updateStatus('Carregando...');

  const [offb, vescId, useEnc, offset] = await api.serial_request_many([
    { cls: 'vesc', cmd: 'offbcanid', instance: inst, typechar: '?' },
    { cls: 'vesc', cmd: 'vesccanid', instance: inst, typechar: '?' },
    { cls: 'vesc', cmd: 'useencoder', instance: inst, typechar: '?' },
    { cls: 'vesc', cmd: 'offset', instance: inst, typechar: '?' },
  ]);

  const offbEl = document.getElementById('vescOffbCan');
  const vescEl = document.getElementById('vescCanId');
  const useEl = document.getElementById('vescUseEncoder');
  const offsetEl = document.getElementById('vescOffset');

  if (offbEl) offbEl.value = parseInt(offb, 10) || 0;
  if (vescEl) vescEl.value = parseInt(vescId, 10) || 0;
  if (useEl) useEl.checked = parseInt(useEnc, 10) > 0;
  if (offsetEl) offsetEl.value = offset ? (parseInt(offset, 10) / 10000).toFixed(4) : '0.0000';

  document.getElementById('vescEncoderBlock').style.display = useEl?.checked ? '' : 'none';

  await loadStatus(inst);
  startPolling();
  updateStatus('Pronto');
}

async function applyVesc() {
  if (!api || currentInstance === null || currentInstance === undefined) return;
  const inst = currentInstance;
  updateStatus('Aplicando...');

  const offb = parseInt(document.getElementById('vescOffbCan')?.value, 10);
  const vescId = parseInt(document.getElementById('vescCanId')?.value, 10);
  const useEnc = document.getElementById('vescUseEncoder')?.checked ? 1 : 0;

  const sets = [];
  if (!Number.isNaN(offb)) sets.push({ cls: 'vesc', cmd: 'offbcanid', value: offb, instance: inst });
  if (!Number.isNaN(vescId)) sets.push({ cls: 'vesc', cmd: 'vesccanid', value: vescId, instance: inst });
  sets.push({ cls: 'vesc', cmd: 'useencoder', value: useEnc, instance: inst });
  await api.serial_set_many(sets);

  updateStatus('Aplicado');
}

async function readEncoderPos() {
  if (!api || currentInstance === null || currentInstance === undefined) return;
  await api.serial_request('vesc', 'forceposread', currentInstance, null, '?');
  loadStatus(currentInstance);
}

async function eraseOffset() {
  if (!api || currentInstance === null || currentInstance === undefined) return;
  await api.serial_set_value('vesc', 'offset', 0, currentInstance, null);
  loadVesc();
}

function handleVisibility(visible) {
  if (visible) startPolling();
  else stopPolling();
}

window.addEventListener('message', (e) => {
  if (e.data?.type === 'configVisibility') {
    handleVisibility(e.data.visible);
  }
});

window.loadConfig = loadVesc;
window.applyConfig = applyVesc;

document.addEventListener('DOMContentLoaded', () => {
  loadVesc();
  document.getElementById('vescReadPos')?.addEventListener('click', readEncoderPos);
  document.getElementById('vescEraseOffset')?.addEventListener('click', eraseOffset);
  document.getElementById('vescUseEncoder')?.addEventListener('change', (e) => {
    const block = document.getElementById('vescEncoderBlock');
    if (block) block.style.display = e.target.checked ? '' : 'none';
  });
});
