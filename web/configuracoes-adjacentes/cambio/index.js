const api = window.parent?.pywebview?.api;

function parseModes(reply) {
  if (!reply) return [];
  return reply
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(":");
      if (parts.length < 2) return null;
      const name = parts[0];
      const meta = parts[1].split(",");
      const index = parseInt(meta[0], 10);
      return Number.isNaN(index) ? null : { id: index, name };
    })
    .filter(Boolean);
}

async function loadShifter() {
  const hint = document.getElementById("shifterHint");
  const toggle = document.getElementById("shifterToggle");
  const state = document.getElementById("shifterState");
  const select = document.getElementById("shifterMode");
  if (!api) {
    if (hint) hint.textContent = "Sem API";
    return;
  }

  const [listReply, currentReply] = await api.serial_request_many([
    { cls: "shifter", cmd: "mode", instance: 0, typechar: "!" },
    { cls: "shifter", cmd: "mode", instance: 0, typechar: "?" },
  ]);
  const modes = parseModes(listReply);
  const current = parseInt(currentReply, 10);
  const isEnabled = Number.isFinite(current) && current > 0;

  if (select) {
    select.innerHTML = "";
    modes.forEach((mode) => {
      const opt = document.createElement("option");
      opt.value = String(mode.id);
      opt.textContent = mode.name || `Modo ${mode.id}`;
      if (mode.id === current) opt.selected = true;
      select.appendChild(opt);
    });
    if (!Number.isFinite(current) && modes.length > 0) {
      select.value = String(modes[0].id);
    }
    select.disabled = modes.length === 0 || !isEnabled;
  }

  if (toggle) toggle.checked = isEnabled;
  if (state) state.textContent = isEnabled ? "Ligado" : "Desligado";
  if (hint) hint.textContent = Number.isFinite(current) ? `Status: ${current}` : "Status: --";
}

async function applyShifter() {
  const toggle = document.getElementById("shifterToggle");
  const select = document.getElementById("shifterMode");
  if (!api) return;
  let value = 0;
  if (toggle?.checked) {
    const selected = parseInt(select?.value ?? "", 10);
    value = Number.isNaN(selected) ? 1 : selected;
  }
  await api.serial_set_value("shifter", "mode", value, 0, null);
  await loadShifter();
}

document.addEventListener("DOMContentLoaded", () => {
  loadShifter();
  document.getElementById("shifterToggle")?.addEventListener("change", () => {
    const select = document.getElementById("shifterMode");
    if (select) select.disabled = !document.getElementById("shifterToggle")?.checked;
  });
});

// API expected by the parent header controls
window.loadConfig = loadShifter;
window.applyConfig = applyShifter;
