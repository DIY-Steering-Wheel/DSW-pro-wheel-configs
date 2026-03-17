const api = window.parent?.pywebview?.api;

let instances = [];
let currentInstance = null;
let pollTimer = null;

const torqueFilters = [
  { id: 0, name: 'Desligado' },
  { id: 1, name: 'IIR baixo' },
  { id: 2, name: 'IIR alto' },
];

function parseList(reply) {
  if (!reply) return [];
  return reply
    .split(/[,
]/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/[:=]/);
      if (parts.length < 2) return null;
      const name = parts[0];
      const id = parseInt(parts[1], 10);
      return Number.isNaN(id) ? null : { id, name };
    })
    .filter(Boolean);
}

function fillSelect(select, items, currentId) {
  if (!select) return;
  select.innerHTML = '';
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = String(item.id);
    opt.textContent = item.name;
    if (item.id === currentId) opt.selected = true;
    select.appendChild(opt);
  });
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function setChecked(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(checked);
}

function updateStatus(text) {
  const hint = document.getElementById('tmcHint');
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
  pollTimer = setInterval(() => loadStatus(currentInstance), 700);
}

function renderTabs() {
  const container = document.getElementById('tmcTabs');
  if (!container) return;
  container.innerHTML = '';
  instances.forEach((inst, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (inst.instance === currentInstance ? ' active' : '');
    btn.textContent = inst.label;
    btn.addEventListener('click', () => {
      currentInstance = inst.instance;
      renderTabs();
      loadTmc();
    });
    container.appendChild(btn);
  });
}

async function loadInstances() {
  if (!api) return;
  const active = await api.get_active_classes();
  instances = (active || [])
    .filter((entry) => String(entry.clsname || '').toLowerCase().includes('tmc'))
    .map((entry) => ({
      instance: entry.unique ?? 0,
      label: entry.title || entry.name || `TMC ${entry.unique ?? 0}`,
    }));
  if (instances.length && currentInstance === null) {
    currentInstance = instances[0].instance;
  }
  renderTabs();
}

async function loadStatus(instance) {
  if (!api || instance === null || instance === undefined) return;
  const [state, temp, torque, driver] = await api.serial_request_many([
    { cls: 'tmc', cmd: 'state', instance, typechar: '?' },
    { cls: 'tmc', cmd: 'temp', instance, typechar: '?' },
    { cls: 'tmc', cmd: 'acttrq', instance, typechar: '?' },
    { cls: 'tmc', cmd: 'tmctype', instance, typechar: '?' },
  ]);
  const stateEl = document.getElementById('tmcState');
  const tempEl = document.getElementById('tmcTemp');
  const torqueEl = document.getElementById('tmcTorque');
  const badge = document.getElementById('tmcDriverLabel');

  if (stateEl) stateEl.textContent = state || '--';
  if (tempEl) tempEl.textContent = temp ? `${temp} ?C` : '--';
  if (torqueEl) torqueEl.textContent = torque ? torque.replace(':', ' / ') : '--';
  if (badge) badge.textContent = driver || 'TMC';
}

async function loadTmc() {
  if (!api) return;
  await loadInstances();
  if (!instances.length) {
    updateStatus('Nenhuma inst?ncia TMC ativa.');
    return;
  }

  const inst = currentInstance;
  updateStatus('Carregando...');

  const [mtypeList, mtypeCur, encList, encCur, poles, cpr] = await api.serial_request_many([
    { cls: 'tmc', cmd: 'mtype', instance: inst, typechar: '!' },
    { cls: 'tmc', cmd: 'mtype', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'encsrc', instance: inst, typechar: '!' },
    { cls: 'tmc', cmd: 'encsrc', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'poles', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'cpr', instance: inst, typechar: '?' },
  ]);

  fillSelect(document.getElementById('tmcMotorType'), parseList(mtypeList), parseInt(mtypeCur, 10));
  fillSelect(document.getElementById('tmcEncSource'), parseList(encList), parseInt(encCur, 10));
  setValue('tmcPoles', parseInt(poles, 10) || 0);
  setValue('tmcCpr', parseInt(cpr, 10) || 0);

  const [torqueP, torqueI, fluxP, fluxI, pidPrec, seqpi, svpwm, invertForce, fluxBrake, combineEncoder, abnIndex, abnPol, trqMode, trqFreq, trqList] = await api.serial_request_many([
    { cls: 'tmc', cmd: 'torqueP', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'torqueI', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'fluxP', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'fluxI', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'pidPrec', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'seqpi', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'svpwm', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'invertForce', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'fluxbrake', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'combineEncoder', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'abnindex', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'abnpol', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'trqbq_mode', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'trqbq_f', instance: inst, typechar: '?' },
    { cls: 'tmc', cmd: 'trqbq_mode', instance: inst, typechar: '!' },
  ]);

  setValue('tmcTorqueP', parseInt(torqueP, 10) || 0);
  setValue('tmcTorqueI', parseInt(torqueI, 10) || 0);
  setValue('tmcFluxP', parseInt(fluxP, 10) || 0);
  setValue('tmcFluxI', parseInt(fluxI, 10) || 0);
  setValue('tmcPrecision', parseInt(pidPrec, 10) || 0);
  const trqOptions = parseList(trqList);
  fillSelect(document.getElementById('tmcTorqueFilter'), trqOptions.length ? trqOptions : torqueFilters, parseInt(trqMode, 10));
  setValue('tmcTorqueFilterFreq', parseInt(trqFreq, 10) || 0);

  setChecked('tmcSeqPi', parseInt(seqpi, 10) > 0);
  setChecked('tmcSvPwm', parseInt(svpwm, 10) > 0);
  setChecked('tmcInvertForce', parseInt(invertForce, 10) > 0);
  setChecked('tmcFluxBrake', parseInt(fluxBrake, 10) > 0);
  setChecked('tmcCombineEncoder', parseInt(combineEncoder, 10) > 0);
  setChecked('tmcAbnIndex', parseInt(abnIndex, 10) > 0);
  setChecked('tmcAbnPol', parseInt(abnPol, 10) > 0);

  await loadStatus(inst);
  startPolling();
  updateStatus('Pronto');
}

async function applyTmc() {
  if (!api || currentInstance === null || currentInstance === undefined) return;
  const inst = currentInstance;
  updateStatus('Aplicando...');

  const mtype = parseInt(document.getElementById('tmcMotorType')?.value, 10);
  const encsrc = parseInt(document.getElementById('tmcEncSource')?.value, 10);
  const poles = parseInt(document.getElementById('tmcPoles')?.value, 10);
  const cpr = parseInt(document.getElementById('tmcCpr')?.value, 10);
  const torqueP = parseInt(document.getElementById('tmcTorqueP')?.value, 10);
  const torqueI = parseInt(document.getElementById('tmcTorqueI')?.value, 10);
  const fluxP = parseInt(document.getElementById('tmcFluxP')?.value, 10);
  const fluxI = parseInt(document.getElementById('tmcFluxI')?.value, 10);
  const precision = parseInt(document.getElementById('tmcPrecision')?.value, 10);
  const trqMode = parseInt(document.getElementById('tmcTorqueFilter')?.value, 10);
  const trqFreq = parseInt(document.getElementById('tmcTorqueFilterFreq')?.value, 10);

  // Batch all set operations in a single IPC call
  const sets = [];
  if (!Number.isNaN(mtype)) sets.push({ cls: 'tmc', cmd: 'mtype', value: mtype, instance: inst });
  if (!Number.isNaN(encsrc)) sets.push({ cls: 'tmc', cmd: 'encsrc', value: encsrc, instance: inst });
  if (!Number.isNaN(poles)) sets.push({ cls: 'tmc', cmd: 'poles', value: poles, instance: inst });
  if (!Number.isNaN(cpr)) sets.push({ cls: 'tmc', cmd: 'cpr', value: cpr, instance: inst });
  if (!Number.isNaN(torqueP)) sets.push({ cls: 'tmc', cmd: 'torqueP', value: torqueP, instance: inst });
  if (!Number.isNaN(torqueI)) sets.push({ cls: 'tmc', cmd: 'torqueI', value: torqueI, instance: inst });
  if (!Number.isNaN(fluxP)) sets.push({ cls: 'tmc', cmd: 'fluxP', value: fluxP, instance: inst });
  if (!Number.isNaN(fluxI)) sets.push({ cls: 'tmc', cmd: 'fluxI', value: fluxI, instance: inst });
  if (!Number.isNaN(precision)) sets.push({ cls: 'tmc', cmd: 'pidPrec', value: precision, instance: inst });
  if (!Number.isNaN(trqMode)) sets.push({ cls: 'tmc', cmd: 'trqbq_mode', value: trqMode, instance: inst });
  if (!Number.isNaN(trqFreq)) sets.push({ cls: 'tmc', cmd: 'trqbq_f', value: trqFreq, instance: inst });
  sets.push({ cls: 'tmc', cmd: 'seqpi', value: document.getElementById('tmcSeqPi')?.checked ? 1 : 0, instance: inst });
  sets.push({ cls: 'tmc', cmd: 'svpwm', value: document.getElementById('tmcSvPwm')?.checked ? 1 : 0, instance: inst });
  sets.push({ cls: 'tmc', cmd: 'invertForce', value: document.getElementById('tmcInvertForce')?.checked ? 1 : 0, instance: inst });
  sets.push({ cls: 'tmc', cmd: 'fluxbrake', value: document.getElementById('tmcFluxBrake')?.checked ? 1 : 0, instance: inst });
  sets.push({ cls: 'tmc', cmd: 'combineEncoder', value: document.getElementById('tmcCombineEncoder')?.checked ? 1 : 0, instance: inst });
  sets.push({ cls: 'tmc', cmd: 'abnindex', value: document.getElementById('tmcAbnIndex')?.checked ? 1 : 0, instance: inst });
  sets.push({ cls: 'tmc', cmd: 'abnpol', value: document.getElementById('tmcAbnPol')?.checked ? 1 : 0, instance: inst });
  await api.serial_set_many(sets);

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

window.loadConfig = loadTmc;
window.applyConfig = applyTmc;

document.addEventListener('DOMContentLoaded', () => {
  loadTmc();
});
