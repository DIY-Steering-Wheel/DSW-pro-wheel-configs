const api = window.parent?.pywebview?.api;

function buildPinGrid(container, count, mask, pulseMask) {
  container.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement("div");
    row.className = "pin-row";
    const enabled = (mask & (1 << i)) !== 0;
    const pulse = pulseMask !== null ? (pulseMask & (1 << i)) !== 0 : false;
    row.innerHTML = `
      <span>Pin ${i + 1}</span>
      <label class="pin-toggle">
        <input type="checkbox" data-pin="${i}" class="pin-enable" ${enabled ? "checked" : ""}>
        <span>Ativo</span>
      </label>
      ${pulseMask !== null ? `
        <label class="pin-toggle">
          <input type="checkbox" data-pin="${i}" class="pin-pulse" ${pulse ? "checked" : ""}>
          <span>Pulse</span>
        </label>
      ` : ""}
    `;
    container.appendChild(row);
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

async function loadAin() {
  const hint = document.getElementById("ainHint");
  const container = document.getElementById("ainPins");
  const countEl = document.getElementById("ainCount");
  if (!api || !container) {
    if (hint) hint.textContent = "Sem API";
    return;
  }
  const pinsReply = await api.serial_request("apin", "pins", 0, null, "?");
  const maskReply = await api.serial_request("apin", "mask", 0, null, "?");
  const filterReply = await api.serial_request("apin", "filter", 0, null, "?");
  const autoReply = await api.serial_request("apin", "autocal", 0, null, "?");
  const count = parseInt(pinsReply, 10) || 0;
  const mask = parseInt(maskReply, 10) || 0;
  if (countEl) countEl.textContent = String(count);
  buildPinGrid(container, count, mask, null);
  const filter = parseInt(filterReply, 10) || 0;
  const auto = parseInt(autoReply, 10) || 0;
  const filterEl = document.getElementById("ainFilter");
  const autoEl = document.getElementById("ainAutorange");
  if (filterEl) filterEl.checked = filter > 0;
  if (autoEl) autoEl.checked = auto > 0;
  if (hint) hint.textContent = "Pronto";
}

async function applyAin() {
  const hint = document.getElementById("ainHint");
  const container = document.getElementById("ainPins");
  if (!api || !container) return;
  const mask = buildMask(container, ".pin-enable");
  const filter = document.getElementById("ainFilter")?.checked ? 1 : 0;
  const auto = document.getElementById("ainAutorange")?.checked ? 1 : 0;
  await api.serial_set_value("apin", "mask", mask, 0, null);
  await api.serial_set_value("apin", "filter", filter, 0, null);
  await api.serial_set_value("apin", "autocal", auto, 0, null);
  if (hint) hint.textContent = "Aplicado";
}

async function loadDin() {
  const hint = document.getElementById("dinHint");
  const container = document.getElementById("dinPins");
  const countEl = document.getElementById("dinCount");
  if (!api || !container) {
    if (hint) hint.textContent = "Sem API";
    return;
  }
  const pinsReply = await api.serial_request("dpin", "pins", 0, null, "?");
  const maskReply = await api.serial_request("dpin", "mask", 0, null, "?");
  const pulseReply = await api.serial_request("dpin", "pulse", 0, null, "?");
  const polReply = await api.serial_request("dpin", "polarity", 0, null, "?");
  const count = parseInt(pinsReply, 10) || 0;
  const mask = parseInt(maskReply, 10) || 0;
  const pulse = parseInt(pulseReply, 10) || 0;
  if (countEl) countEl.textContent = String(count);
  buildPinGrid(container, count, mask, pulse);
  const invert = parseInt(polReply, 10) || 0;
  const invertEl = document.getElementById("dinInvert");
  if (invertEl) invertEl.checked = invert > 0;
  if (hint) hint.textContent = "Pronto";
}

async function applyDin() {
  const hint = document.getElementById("dinHint");
  const container = document.getElementById("dinPins");
  if (!api || !container) return;
  const mask = buildMask(container, ".pin-enable");
  const pulse = buildMask(container, ".pin-pulse");
  const invert = document.getElementById("dinInvert")?.checked ? 1 : 0;
  await api.serial_set_value("dpin", "mask", mask, 0, null);
  await api.serial_set_value("dpin", "pulse", pulse, 0, null);
  await api.serial_set_value("dpin", "polarity", invert, 0, null);
  if (hint) hint.textContent = "Aplicado";
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("ainPins")) {
    loadAin();
    document.getElementById("refreshAin")?.addEventListener("click", loadAin);
    document.getElementById("applyAin")?.addEventListener("click", applyAin);
  }
  if (document.getElementById("dinPins")) {
    loadDin();
    document.getElementById("refreshDin")?.addEventListener("click", loadDin);
    document.getElementById("applyDin")?.addEventListener("click", applyDin);
  }
});
