const api = window.parent?.pywebview?.api;

let dinCount = 0;
let dinMask = 0;
let valueTimer = null;
let dinClassId = -1;       // DIN-Pins class id from main.lsbtn (usually 0)
let dinTypesActive = false; // Whether DIN-Pins is active per main.btntypes
let btntypesBitmask = 0;   // Stored for activation button

function buildPinGrid(container, count, mask, pulseMask) {
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const enabled = (mask & (1 << i)) !== 0;
    const pulse = (pulseMask & (1 << i)) !== 0;
    const row = document.createElement("div");
    row.className = "pin-row";
    row.dataset.pin = i;
    row.innerHTML = `
      <label class="pin-check">
        <input type="checkbox" data-pin="${i}" class="pin-enable" ${enabled ? "checked" : ""}>
        <span>${i + 1}</span>
      </label>
      <label class="pin-check">
        <input type="checkbox" data-pin="${i}" class="pin-pulse" ${pulse ? "checked" : ""}>
        <span>${i + 1}</span>
      </label>
    `;
    container.appendChild(row);
  }
}

function updateButtonValues(valuesInt) {
  const container = document.getElementById("dinPins");
  if (!container) return;
  let j = 0;
  for (let i = 0; i < dinCount; i++) {
    const row = container.querySelector(`.pin-row[data-pin="${i}"]`);
    if (!row) continue;
    if (dinMask & (1 << i)) {
      const pressed = (valuesInt & (1 << j)) !== 0;
      row.classList.toggle("active", pressed);
      j++;
    } else {
      row.classList.remove("active");
    }
  }
}

let dinPollInFlight = false;

async function pollValues() {
  if (!api || dinPollInFlight) return;
  dinPollInFlight = true;
  try {
    const reply = await api.serial_request("dpin", "values", 0, null, "?");
    const val = parseInt(reply, 10) || 0;
    updateButtonValues(val);
  } catch (e) {
    console.warn("[DIN] poll error:", e);
  } finally {
    dinPollInFlight = false;
  }
}

function startPolling() {
  stopPolling();
  valueTimer = setInterval(pollValues, 1000);
}

function stopPolling() {
  if (valueTimer) {
    clearInterval(valueTimer);
    valueTimer = null;
  }
}

function buildMask(container, selector) {
  let mask = 0;
  container.querySelectorAll(selector).forEach((input) => {
    if (input.checked) {
      const pin = parseInt(input.dataset.pin, 10);
      if (!Number.isNaN(pin)) mask |= 1 << pin;
    }
  });
  return mask;
}

let loadRetries = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

/**
 * Parse main.lsbtn reply (same format as OLD UI classlistToIds):
 *   "0:1:D-Pins\n1:0:SPI-Buttons\n..."
 */
function parseLsbtn(reply) {
  if (!reply) return [];
  return reply.split("\n").filter(Boolean).map(line => {
    const parts = line.split(":", 3);
    if (parts.length < 3) return null;
    return { id: parseInt(parts[0], 10), creatable: parts[1] !== "0", name: parts[2] };
  }).filter(Boolean);
}

async function loadDin() {
  const hint = document.getElementById("dinHint");
  const container = document.getElementById("dinPins");
  if (!api || !container) {
    if (hint) hint.textContent = "Sem API";
    return;
  }

  if (hint) hint.textContent = "Carregando...";

  // ── Step 1: Discover button source types via main.lsbtn (like OLD UI) ──
  const lsbtnReply = await api.serial_request("main", "lsbtn", 0, null, "?");
  console.log("[DIN] main.lsbtn? reply:", JSON.stringify(lsbtnReply));

  if (!lsbtnReply || lsbtnReply.trim() === "") {
    if (loadRetries < MAX_RETRIES) {
      loadRetries++;
      console.log("[DIN] lsbtn empty, retry", loadRetries, "of", MAX_RETRIES);
      if (hint) hint.textContent = `Tentando novamente... (${loadRetries}/${MAX_RETRIES})`;
      setTimeout(loadDin, RETRY_DELAY);
      return;
    }
    if (hint) hint.textContent = "Sem resposta do firmware. Clique Atualizar para tentar novamente.";
    stopPolling();
    return;
  }

  loadRetries = 0;
  const btnSources = parseLsbtn(lsbtnReply);
  console.log("[DIN] Button sources:", btnSources);

  // Find D-Pins entry (id=0 in OLD UI, or name containing "D-Pins" / "Local" / "DIN")
  const dinEntry = btnSources.find(s => s.id === 0) || btnSources.find(s => /d-pins|dpin|local|din/i.test(s.name));
  if (!dinEntry) {
    if (hint) hint.textContent = "Tipo D-Pins não disponível neste firmware.";
    stopPolling();
    return;
  }
  dinClassId = dinEntry.id;
  console.log("[DIN] Found D-Pins: id =", dinClassId, "name =", dinEntry.name);

  // ── Step 2: Check if D-Pins type is active via main.btntypes ──
  const btntypesReply = await api.serial_request("main", "btntypes", 0, null, "?");
  console.log("[DIN] main.btntypes? reply:", JSON.stringify(btntypesReply));
  btntypesBitmask = parseInt(btntypesReply, 10) || 0;
  dinTypesActive = (btntypesBitmask & (1 << dinClassId)) !== 0;
  console.log("[DIN] btntypes bitmask:", btntypesBitmask, "D-Pins active:", dinTypesActive);

  const overlay = document.getElementById("dinActivationOverlay");
  const mainContent = document.getElementById("dinMainContent");

  if (!dinTypesActive) {
    // Show activation overlay instead of auto-activating
    if (overlay) overlay.style.display = "";
    if (mainContent) mainContent.style.display = "none";
    if (hint) hint.textContent = "D-Pins inativo";
    stopPolling();
    return;
  }

  // D-Pins is active — hide overlay, show content
  if (overlay) overlay.style.display = "none";
  if (mainContent) mainContent.style.display = "";

  // ── Step 3: Now query dpin class (like OLD UI LocalButtonsConf.readValues) ──
  const pinsReply = await api.serial_request("dpin", "pins", 0, null, "?");
  console.log("[DIN] dpin.pins? reply:", JSON.stringify(pinsReply));

  const maskReply = await api.serial_request("dpin", "mask", 0, null, "?");
  const pulseReply = await api.serial_request("dpin", "pulse", 0, null, "?");
  const polReply = await api.serial_request("dpin", "polarity", 0, null, "?");

  dinCount = parseInt(pinsReply, 10) || 0;
  dinMask = parseInt(maskReply, 10) || 0;
  const pulseMask = parseInt(pulseReply, 10) || 0;

  buildPinGrid(container, dinCount, dinMask, pulseMask);

  const invertEl = document.getElementById("dinInvert");
  if (invertEl) invertEl.checked = (parseInt(polReply, 10) || 0) > 0;

  if (hint) hint.textContent = `${dinCount} pinos`;
  startPolling();
}

async function applyDin() {
  const hint = document.getElementById("dinHint");
  const container = document.getElementById("dinPins");
  if (!api || !container) return;

  const mask = buildMask(container, ".pin-enable");
  const pulse = buildMask(container, ".pin-pulse");
  const invert = document.getElementById("dinInvert")?.checked ? 1 : 0;

  dinMask = mask;

  await api.serial_set_value("dpin", "mask", mask, 0, null);
  await api.serial_set_value("dpin", "pulse", pulse, 0, null);
  await api.serial_set_value("dpin", "polarity", invert, 0, null);
  if (hint) hint.textContent = "Aplicado";
}

document.addEventListener("DOMContentLoaded", () => {
  loadDin();

  // Activation button
  document.getElementById("btnActivateDin")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnActivateDin");
    const actHint = document.getElementById("activationHint");
    if (btn) btn.disabled = true;
    if (actHint) actHint.textContent = "Ativando D-Pins...";
    try {
      const newMask = btntypesBitmask | (1 << dinClassId);
      console.log("[DIN] Activating D-Pins: setting btntypes =", newMask);
      await api.serial_set_value("main", "btntypes", newMask, 0, null);
      await new Promise(r => setTimeout(r, 500));
      dinTypesActive = true;
      if (actHint) actHint.textContent = "";
      loadRetries = 0;
      await loadDin();
    } catch (e) {
      console.error("[DIN] Activation failed:", e);
      if (actHint) actHint.textContent = "Erro ao ativar. Tente novamente.";
      if (btn) btn.disabled = false;
    }
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPolling();
  else if (dinCount > 0) startPolling();
});

// Parent signals visibility when user switches adjacent config views
window.addEventListener("message", (e) => {
  if (e.data?.type === "configVisibility") {
    if (e.data.visible && dinCount > 0) startPolling();
    else stopPolling();
  }
});

// API expected by the parent header controls
window.loadConfig = loadDin;
window.applyConfig = applyDin;
