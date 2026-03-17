const api = window.parent?.pywebview?.api;

function updateStatus(text) {
  const hint = document.getElementById('adsHint');
  if (hint) hint.textContent = text || 'Pronto';
}

function parseList(reply) {
  if (!reply) return [];
  return reply
    .split(/[,
]/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(':');
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

async function loadAds() {
  if (!api) return;
  updateStatus('Carregando...');
  const [gainList, rateList, gainCur, rateCur, diff, inputs, i2cSpeed] = await api.serial_request_many([
    { cls: 'adsAnalog', cmd: 'gain', instance: 0, typechar: '!' },
    { cls: 'adsAnalog', cmd: 'rate', instance: 0, typechar: '!' },
    { cls: 'adsAnalog', cmd: 'gain', instance: 0, typechar: '?' },
    { cls: 'adsAnalog', cmd: 'rate', instance: 0, typechar: '?' },
    { cls: 'adsAnalog', cmd: 'diff', instance: 0, typechar: '?' },
    { cls: 'adsAnalog', cmd: 'inputs', instance: 0, typechar: '?' },
    { cls: 'i2c', cmd: 'speed', instance: 0, typechar: '?' },
  ]);

  fillSelect(document.getElementById('adsGain'), parseList(gainList), parseInt(gainCur, 10));
  fillSelect(document.getElementById('adsRate'), parseList(rateList), parseInt(rateCur, 10));

  const diffEl = document.getElementById('adsDiff');
  const inputEl = document.getElementById('adsInputs');
  const fastEl = document.getElementById('adsI2cFast');

  if (diffEl) diffEl.checked = parseInt(diff, 10) > 0;
  if (inputEl) inputEl.value = parseInt(inputs, 10) || 1;
  if (fastEl) fastEl.checked = parseInt(i2cSpeed, 10) > 0;

  updateStatus('Pronto');
}

async function applyAds() {
  if (!api) return;
  updateStatus('Aplicando...');
  const diff = document.getElementById('adsDiff')?.checked ? 1 : 0;
  const inputs = parseInt(document.getElementById('adsInputs')?.value, 10) || 1;
  const gain = parseInt(document.getElementById('adsGain')?.value, 10);
  const rate = parseInt(document.getElementById('adsRate')?.value, 10);
  const fast = document.getElementById('adsI2cFast')?.checked ? 1 : 0;

  await api.serial_set_value('adsAnalog', 'diff', diff, 0, null);
  await api.serial_set_value('adsAnalog', 'inputs', inputs, 0, null);
  if (!Number.isNaN(gain)) await api.serial_set_value('adsAnalog', 'gain', gain, 0, null);
  if (!Number.isNaN(rate)) await api.serial_set_value('adsAnalog', 'rate', rate, 0, null);
  await api.serial_set_value('i2c', 'speed', fast, 0, null);

  updateStatus('Aplicado');
}

window.loadConfig = loadAds;
window.applyConfig = applyAds;

document.addEventListener('DOMContentLoaded', () => {
  loadAds();
  document.getElementById('adsDiff')?.addEventListener('change', (e) => {
    const inputs = document.getElementById('adsInputs');
    if (inputs) inputs.max = e.target.checked ? '2' : '4';
  });
});
