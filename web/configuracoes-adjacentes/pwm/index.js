const api = window.parent?.pywebview?.api;

function parseList(reply) {
  if (!reply) return [];
  return reply
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(":");
      if (parts.length < 2) return null;
      const name = parts[0];
      const id = parseInt(parts[1], 10);
      return Number.isNaN(id) ? null : { id, name };
    })
    .filter(Boolean);
}

function fillSelect(select, items, currentId) {
  select.innerHTML = "";
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = String(item.id);
    opt.textContent = item.name;
    if (item.id === currentId) opt.selected = true;
    select.appendChild(opt);
  });
}

async function loadPwm() {
  const hint = document.getElementById("pwmHint");
  const freqSelect = document.getElementById("pwmFreq");
  const modeSelect = document.getElementById("pwmMode");
  const invertEl = document.getElementById("pwmInvert");
  if (!api) {
    if (hint) hint.textContent = "Sem API";
    return;
  }

  const freqList = await api.serial_request("pwmdrv", "freq", 0, null, "!");
  const freqCurrent = await api.serial_request("pwmdrv", "freq", 0, null, "?");
  const modeList = await api.serial_request("pwmdrv", "mode", 0, null, "!");
  const modeCurrent = await api.serial_request("pwmdrv", "mode", 0, null, "?");
  const dirReply = await api.serial_request("pwmdrv", "dir", 0, null, "?");

  const freqs = parseList(freqList);
  const modes = parseList(modeList);
  const currentFreq = parseInt(freqCurrent, 10);
  const currentMode = parseInt(modeCurrent, 10);

  if (freqSelect) fillSelect(freqSelect, freqs, currentFreq);
  if (modeSelect) fillSelect(modeSelect, modes, currentMode);
  if (invertEl) invertEl.checked = (parseInt(dirReply, 10) || 0) > 0;

  if (hint) hint.textContent = "Pronto";
}

async function applyPwm() {
  const hint = document.getElementById("pwmHint");
  if (!api) return;

  const freq = parseInt(document.getElementById("pwmFreq")?.value, 10);
  const mode = parseInt(document.getElementById("pwmMode")?.value, 10);
  const invert = document.getElementById("pwmInvert")?.checked ? 1 : 0;

  if (!Number.isNaN(mode)) await api.serial_set_value("pwmdrv", "mode", mode, 0, null);
  if (!Number.isNaN(freq)) await api.serial_set_value("pwmdrv", "freq", freq, 0, null);
  await api.serial_set_value("pwmdrv", "dir", invert, 0, null);

  if (hint) hint.textContent = "Aplicado";
  await loadPwm();
}

document.addEventListener("DOMContentLoaded", () => {
  loadPwm();
  document.getElementById("refreshPwm")?.addEventListener("click", loadPwm);
  document.getElementById("applyPwm")?.addEventListener("click", applyPwm);
});
