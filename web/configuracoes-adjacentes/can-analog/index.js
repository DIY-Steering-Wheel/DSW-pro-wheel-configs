const api = window.parent?.pywebview?.api;

function updateStatus(text) {
  const hint = document.getElementById('canAnalogHint');
  if (hint) hint.textContent = text || 'Pronto';
}

function renderMap(amount, canId) {
  const mapEl = document.getElementById('canAnalogMap');
  if (!mapEl) return;
  const total = Math.max(1, amount || 1);
  let text = '';
  for (let packet = 0; packet < Math.ceil(total / 4); packet++) {
    text += `ID ${canId + packet}:
(`;
    for (let i = 0; i < 4; i++) {
      if (i < total - packet * 4) {
        text += `| v${i + 1 + packet * 4}[0:7], v${i + 1 + packet * 4}[8:15] |`;
      } else {
        text += '|xx||xx|';
      }
    }
    text += `)
`;
  }
  mapEl.textContent = text.trim();
}

async function loadCanAnalog() {
  if (!api) return;
  updateStatus('Carregando...');
  const [amount, maxAmount, canId] = await api.serial_request_many([
    { cls: 'cananalog', cmd: 'amount', instance: 0, typechar: '?' },
    { cls: 'cananalog', cmd: 'maxamount', instance: 0, typechar: '?' },
    { cls: 'cananalog', cmd: 'canid', instance: 0, typechar: '?' },
  ]);

  const amountEl = document.getElementById('canAnalogAmount');
  const canEl = document.getElementById('canAnalogId');
  const maxVal = parseInt(maxAmount, 10) || 8;
  if (amountEl) {
    amountEl.max = String(maxVal);
    amountEl.value = parseInt(amount, 10) || 1;
  }
  if (canEl) {
    const maxCan = 0x7ff - Math.floor((maxVal - 1) / 4);
    canEl.max = String(maxCan);
    canEl.value = parseInt(canId, 10) || 1;
  }

  const amt = parseInt(amountEl?.value, 10) || 1;
  const cid = parseInt(canEl?.value, 10) || 1;
  renderMap(amt, cid);
  updateStatus('Pronto');
}

async function applyCanAnalog() {
  if (!api) return;
  updateStatus('Aplicando...');
  const amount = parseInt(document.getElementById('canAnalogAmount')?.value, 10) || 1;
  const canId = parseInt(document.getElementById('canAnalogId')?.value, 10) || 1;
  await api.serial_set_value('cananalog', 'amount', amount, 0, null);
  await api.serial_set_value('cananalog', 'canid', canId, 0, null);
  renderMap(amount, canId);
  updateStatus('Aplicado');
}

window.loadConfig = loadCanAnalog;
window.applyConfig = applyCanAnalog;

document.addEventListener('DOMContentLoaded', () => {
  loadCanAnalog();
  document.getElementById('canAnalogAmount')?.addEventListener('input', (e) => {
    const canId = parseInt(document.getElementById('canAnalogId')?.value, 10) || 1;
    renderMap(parseInt(e.target.value, 10) || 1, canId);
  });
  document.getElementById('canAnalogId')?.addEventListener('input', (e) => {
    const amount = parseInt(document.getElementById('canAnalogAmount')?.value, 10) || 1;
    renderMap(amount, parseInt(e.target.value, 10) || 1);
  });
});
