const api = window.parent?.pywebview?.api;

function updateStatus(text) {
  const hint = document.getElementById('pcfHint');
  if (hint) hint.textContent = text || 'Pronto';
}

async function loadPcf() {
  if (!api) return;
  updateStatus('Carregando...');
  const [btnNum, invert, i2cSpeed] = await api.serial_request_many([
    { cls: 'pcfbtn', cmd: 'btnnum', instance: 0, typechar: '?' },
    { cls: 'pcfbtn', cmd: 'invert', instance: 0, typechar: '?' },
    { cls: 'i2c', cmd: 'speed', instance: 0, typechar: '?' },
  ]);

  const amountEl = document.getElementById('pcfAmount');
  const invertEl = document.getElementById('pcfInvert');
  const fastEl = document.getElementById('pcfFast');

  if (amountEl) amountEl.value = parseInt(btnNum, 10) || 1;
  if (invertEl) invertEl.checked = parseInt(invert, 10) > 0;
  if (fastEl) fastEl.checked = parseInt(i2cSpeed, 10) > 0;

  updateStatus('Pronto');
}

async function applyPcf() {
  if (!api) return;
  updateStatus('Aplicando...');
  const amount = parseInt(document.getElementById('pcfAmount')?.value, 10) || 1;
  const invert = document.getElementById('pcfInvert')?.checked ? 1 : 0;
  const fast = document.getElementById('pcfFast')?.checked ? 1 : 0;

  await api.serial_set_many([
    { cls: 'pcfbtn', cmd: 'btnnum', value: amount, instance: 0 },
    { cls: 'pcfbtn', cmd: 'invert', value: invert, instance: 0 },
    { cls: 'i2c', cmd: 'speed', value: fast, instance: 0 },
  ]);

  updateStatus('Aplicado');
}

window.loadConfig = loadPcf;
window.applyConfig = applyPcf;

document.addEventListener('DOMContentLoaded', () => {
  loadPcf();
});
