const api = window.parent?.pywebview?.api;

function updateStatus(text) {
  const hint = document.getElementById('canBtnHint');
  if (hint) hint.textContent = text || 'Pronto';
}

function renderMap(amount, invert) {
  const mapEl = document.getElementById('canBtnMap');
  if (!mapEl) return;
  const polchar = invert ? '0' : '1';
  let text = 'ID map:
';
  for (let i = 0; i < 64; i++) {
    text += i < amount ? polchar : 'x';
    if ((i + 1) % 8 === 0) text += '|';
    if ((i + 1) % 32 === 0) text += '
';
  }
  mapEl.textContent = text.trim();
}

async function loadCanButtons() {
  if (!api) return;
  updateStatus('Carregando...');
  const [btnNum, invert, canId] = await api.serial_request_many([
    { cls: 'canbtn', cmd: 'btnnum', instance: 0, typechar: '?' },
    { cls: 'canbtn', cmd: 'invert', instance: 0, typechar: '?' },
    { cls: 'canbtn', cmd: 'canid', instance: 0, typechar: '?' },
  ]);

  const amountEl = document.getElementById('canBtnAmount');
  const invertEl = document.getElementById('canBtnInvert');
  const canEl = document.getElementById('canBtnId');

  if (amountEl) amountEl.value = parseInt(btnNum, 10) || 1;
  if (invertEl) invertEl.checked = parseInt(invert, 10) > 0;
  if (canEl) canEl.value = parseInt(canId, 10) || 1;

  renderMap(parseInt(amountEl?.value, 10) || 1, invertEl?.checked);
  updateStatus('Pronto');
}

async function applyCanButtons() {
  if (!api) return;
  updateStatus('Aplicando...');
  const amount = parseInt(document.getElementById('canBtnAmount')?.value, 10) || 1;
  const invert = document.getElementById('canBtnInvert')?.checked ? 1 : 0;
  const canId = parseInt(document.getElementById('canBtnId')?.value, 10) || 1;

  await api.serial_set_many([
    { cls: 'canbtn', cmd: 'btnnum', value: amount, instance: 0 },
    { cls: 'canbtn', cmd: 'invert', value: invert, instance: 0 },
    { cls: 'canbtn', cmd: 'canid', value: canId, instance: 0 },
  ]);

  renderMap(amount, invert === 1);
  updateStatus('Aplicado');
}

window.loadConfig = loadCanButtons;
window.applyConfig = applyCanButtons;

document.addEventListener('DOMContentLoaded', () => {
  loadCanButtons();
  document.getElementById('canBtnAmount')?.addEventListener('input', (e) => {
    const invert = document.getElementById('canBtnInvert')?.checked;
    renderMap(parseInt(e.target.value, 10) || 1, invert);
  });
  document.getElementById('canBtnInvert')?.addEventListener('change', (e) => {
    const amount = parseInt(document.getElementById('canBtnAmount')?.value, 10) || 1;
    renderMap(amount, e.target.checked);
  });
});
