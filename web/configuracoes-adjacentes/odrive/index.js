const api = window.parent?.pywebview?.api;

let instances = [];
let currentInstance = null;
let pollTimer = null;

const ODRIVE_STATES = [
  'AXIS_STATE_UNDEFINED',
  'AXIS_STATE_IDLE',
  'AXIS_STATE_STARTUP_SEQUENCE',
  'AXIS_STATE_FULL_CALIBRATION_SEQUENCE',
  'AXIS_STATE_MOTOR_CALIBRATION',
  '-',
  'AXIS_STATE_ENCODER_INDEX_SEARCH',
  'AXIS_STATE_ENCODER_OFFSET_CALIBRATION',
  'AXIS_STATE_CLOSED_LOOP_CONTROL',
  'AXIS_STATE_LOCKIN_SPIN',
  'AXIS_STATE_ENCODER_DIR_FIND',
  'AXIS_STATE_HOMING',
  'AXIS_STATE_ENCODER_HALL_POLARITY_CALIBRATION',
  'AXIS_STATE_ENCODER_HALL_PHASE_CALIBRATION',
];

function updateStatus(text) {
  const hint = document.getElementById('odriveHint');
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
  const container = document.getElementById('odriveTabs');
  if (!container) return;
  container.innerHTML = '';
  instances.forEach((inst) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (inst.instance === currentInstance ? ' active' : '');
    btn.textContent = inst.label;
    btn.addEventListener('click', () => {
      currentInstance = inst.instance;
      renderTabs();
      loadOdrive();
    });
    container.appendChild(btn);
  });
}

async function loadInstances() {
  if (!api) return;
  const active = await api.get_active_classes();
  instances = (active || [])
    .filter((entry) => String(entry.clsname || '').toLowerCase().includes('odrive') || String(entry.clsname || '').toLowerCase().includes('odrv'))
    .map((entry) => ({
      instance: entry.unique ?? 0,
      label: entry.title || entry.name || `ODrive ${entry.unique ?? 0}`,
    }));
  if (instances.length && currentInstance === null) {
    currentInstance = instances[0].instance;
  }
  renderTabs();
}

async function loadStatus(inst) {
  if (!api || inst === null || inst === undefined) return;
  const [state, voltage, errors] = await Promise.all([
    api.serial_request('odrv', 'state', inst, null, '?'),
    api.serial_request('odrv', 'vbus', inst, null, '?'),
    api.serial_request('odrv', 'errors', inst, null, '?'),
  ]);
  const badge = document.getElementById('odriveState');
  const voltEl = document.getElementById('odriveVoltage');
  const errEl = document.getElementById('odriveErrors');

  let stateLabel = state;
  const idx = parseInt(state, 10);
  if (!Number.isNaN(idx) && idx < ODRIVE_STATES.length) {
    stateLabel = ODRIVE_STATES[idx];
  }
  if (badge) badge.textContent = stateLabel || '--';
  if (voltEl) voltEl.textContent = voltage ? `${(parseInt(voltage, 10) / 1000).toFixed(2)} V` : '--';
  if (errEl) errEl.textContent = errors ? `Code ${errors}` : '--';
}

async function loadOdrive() {
  if (!api) return;
  await loadInstances();
  if (!instances.length) {
    updateStatus('Nenhuma inst?ncia ODrive ativa.');
    return;
  }

  const inst = currentInstance;
  updateStatus('Carregando...');

  const [canId, torque, storepos] = await Promise.all([
    api.serial_request('odrv', 'canid', inst, null, '?'),
    api.serial_request('odrv', 'maxtorque', inst, null, '?'),
    api.serial_request('odrv', 'storepos', inst, null, '?'),
  ]);

  const canEl = document.getElementById('odriveCanId');
  const torqueEl = document.getElementById('odriveMaxTorque');
  const storeEl = document.getElementById('odriveStorePos');

  if (canEl) canEl.value = parseInt(canId, 10) || 0;
  if (torqueEl) torqueEl.value = torque ? (parseInt(torque, 10) / 100).toFixed(2) : '0.00';
  if (storeEl) storeEl.checked = parseInt(storepos, 10) > 0;

  await loadStatus(inst);
  startPolling();
  updateStatus('Pronto');
}

async function applyOdrive() {
  if (!api || currentInstance === null || currentInstance === undefined) return;
  const inst = currentInstance;
  updateStatus('Aplicando...');

  const canId = parseInt(document.getElementById('odriveCanId')?.value, 10);
  const torque = parseFloat(document.getElementById('odriveMaxTorque')?.value);
  const store = document.getElementById('odriveStorePos')?.checked ? 1 : 0;

  if (!Number.isNaN(canId)) await api.serial_set_value('odrv', 'canid', canId, inst, null);
  if (!Number.isNaN(torque)) await api.serial_set_value('odrv', 'maxtorque', Math.round(torque * 100), inst, null);
  await api.serial_set_value('odrv', 'storepos', store, inst, null);

  updateStatus('Aplicado');
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

window.loadConfig = loadOdrive;
window.applyConfig = applyOdrive;

document.addEventListener('DOMContentLoaded', () => {
  loadOdrive();
  document.getElementById('odriveRefresh')?.addEventListener('click', loadOdrive);
});
