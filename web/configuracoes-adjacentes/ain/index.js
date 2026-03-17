const api = window.parent?.pywebview?.api;

let ainCount = 0;
let ainMask = 0;
let enabledChannels = 0;
let valueTimer = null;
let limitsData = []; // [{min, max, rawVal}] per enabled channel index
let ainClassId = -1;       // AIN-Pins class id from main.lsain (usually 0)
let ainTypesActive = false; // Whether AIN-Pins is active per main.aintypes
let aintypesBitmask = 0;   // Stored for activation button
let ainLoaded = false;     // True after first successful loadAin()

/* ── Channel grid (checkboxes + progress bars) ── */

function buildChannelGrid(container, count, mask) {
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const enabled = (mask & (1 << i)) !== 0;
    const row = document.createElement("div");
    row.className = "channel-row";
    row.innerHTML = `
      <label class="channel-check">
        <input type="checkbox" data-ch="${i}" class="ch-enable" ${enabled ? "checked" : ""}>
        <span>Ch${i + 1}</span>
      </label>
      <div class="channel-bar-wrap">
        <div class="channel-bar" data-ch="${i}" style="width:0%"></div>
        <span class="channel-val" data-ch="${i}">--</span>
      </div>
    `;
    container.appendChild(row);
  }
}

function updateValues(valuesStr) {
  if (!valuesStr) return;
  const vals = valuesStr.split("\n").map(Number);
  const container = document.getElementById("ainChannels");
  if (!container) return;
  let j = 0;
  for (let i = 0; i < ainCount; i++) {
    const bar = container.querySelector(`.channel-bar[data-ch="${i}"]`);
    const valEl = container.querySelector(`.channel-val[data-ch="${i}"]`);
    if (ainMask & (1 << i)) {
      const raw = j < vals.length ? vals[j] : -32768;
      j++;
      const pct = Math.max(0, Math.min(100, ((raw + 32768) / 65535) * 100));
      if (bar) bar.style.width = pct.toFixed(1) + "%";
      if (valEl) valEl.textContent = `${pct.toFixed(0)}% (${raw})`;
    } else {
      if (bar) bar.style.width = "0%";
      if (valEl) valEl.textContent = "--";
    }
  }
}

/* ── Manual limits (range sliders per enabled channel) ── */

function buildLimitsGrid(container, count) {
  container.innerHTML = "";
  limitsData = [];
  for (let i = 0; i < count; i++) {
    limitsData.push({ min: 0, max: 0xFFFE, rawVal: 0 });
    const row = document.createElement("div");
    row.className = "limit-row";
    row.innerHTML = `
      <span class="limit-label">Ch ${i + 1}</span>
      <div class="limit-slider-wrap">
        <div class="limit-raw-bar" data-limch="${i}" style="width:0%"></div>
        <input type="range" class="limit-slider limit-min" data-limch="${i}" min="0" max="65534" value="0">
        <input type="range" class="limit-slider limit-max" data-limch="${i}" min="0" max="65534" value="65534">
      </div>
      <span class="limit-vals" data-limch="${i}">0 / 65534</span>
    `;
    container.appendChild(row);

    // Constrain ranges: min can't exceed max and vice-versa
    const minSlider = row.querySelector(".limit-min");
    const maxSlider = row.querySelector(".limit-max");
    const valSpan = row.querySelector(".limit-vals");
    minSlider.addEventListener("input", () => {
      const v = parseInt(minSlider.value, 10);
      if (v > parseInt(maxSlider.value, 10)) maxSlider.value = v;
      limitsData[i].min = v;
      limitsData[i].max = parseInt(maxSlider.value, 10);
      valSpan.textContent = `${limitsData[i].min} / ${limitsData[i].max}`;
    });
    maxSlider.addEventListener("input", () => {
      const v = parseInt(maxSlider.value, 10);
      if (v < parseInt(minSlider.value, 10)) minSlider.value = v;
      limitsData[i].max = v;
      limitsData[i].min = parseInt(minSlider.value, 10);
      valSpan.textContent = `${limitsData[i].min} / ${limitsData[i].max}`;
    });
  }
}

function updateLimitsCard() {
  const card = document.getElementById("manualLimitsCard");
  const autoEl = document.getElementById("ainAutorange");
  if (!card) return;
  const isAutorange = autoEl?.checked || false;
  card.style.opacity = isAutorange ? "0.4" : "1";
  card.style.pointerEvents = isAutorange ? "none" : "";
}

async function readLimitsFromBoard() {
  if (!api || enabledChannels === 0) return;
  const container = document.getElementById("ainLimits");
  if (!container) return;
  // Batch all min/max requests in one call
  const requests = [];
  for (let i = 0; i < enabledChannels; i++) {
    requests.push({ cls: "apin", cmd: "min", instance: 0, adr: i, typechar: "?" });
    requests.push({ cls: "apin", cmd: "max", instance: 0, adr: i, typechar: "?" });
  }
  const replies = await api.serial_request_many(requests);
  for (let i = 0; i < enabledChannels; i++) {
    const minReply = replies[i * 2];
    const maxReply = replies[i * 2 + 1];
    const minVal = (parseInt(minReply, 10) || 0) + 0x7FFF;
    const maxVal = (parseInt(maxReply, 10) || 0) + 0x7FFF;
    limitsData[i] = { min: minVal, max: maxVal, rawVal: 0 };
    const minSlider = container.querySelector(`.limit-min[data-limch="${i}"]`);
    const maxSlider = container.querySelector(`.limit-max[data-limch="${i}"]`);
    const valSpan = container.querySelector(`.limit-vals[data-limch="${i}"]`);
    if (minSlider) minSlider.value = minVal;
    if (maxSlider) maxSlider.value = maxVal;
    if (valSpan) valSpan.textContent = `${minVal} / ${maxVal}`;
  }
}

function updateRawBars(rawStr) {
  if (!rawStr) return;
  const vals = rawStr.split("\n").map(Number);
  const container = document.getElementById("ainLimits");
  if (!container) return;
  for (let i = 0; i < enabledChannels && i < vals.length; i++) {
    const pct = Math.max(0, Math.min(100, ((vals[i] + 32768) / 65535) * 100));
    const bar = container.querySelector(`.limit-raw-bar[data-limch="${i}"]`);
    if (bar) bar.style.width = pct.toFixed(1) + "%";
  }
}

/* ── Polling ── */

let pollInFlight = false;
let autorangePollCounter = 0;

async function pollValues() {
  if (!api || pollInFlight) return;
  pollInFlight = true;
  try {
    // Batch values + rawval in a single serial transaction
    const requests = [
      { cls: "apin", cmd: "values", instance: 0, typechar: "?" },
      { cls: "apin", cmd: "rawval", instance: 0, typechar: "?" },
    ];
    // Autorange: batch limit reads every 5th cycle
    const autoEl = document.getElementById("ainAutorange");
    autorangePollCounter++;
    const needLimits = autoEl?.checked && enabledChannels > 0 && autorangePollCounter >= 5;
    if (needLimits) {
      autorangePollCounter = 0;
      for (let i = 0; i < enabledChannels; i++) {
        requests.push({ cls: "apin", cmd: "min", instance: 0, adr: i, typechar: "?" });
        requests.push({ cls: "apin", cmd: "max", instance: 0, adr: i, typechar: "?" });
      }
    }
    const replies = await api.serial_request_many(requests);
    updateValues(replies[0]);
    updateRawBars(replies[1]);
    if (needLimits) {
      const limContainer = document.getElementById("ainLimits");
      for (let i = 0; i < enabledChannels; i++) {
        const minR = replies[2 + i * 2];
        const maxR = replies[2 + i * 2 + 1];
        const minV = (parseInt(minR, 10) || 0) + 0x7FFF;
        const maxV = (parseInt(maxR, 10) || 0) + 0x7FFF;
        limitsData[i] = { ...limitsData[i], min: minV, max: maxV };
        const minSlider = limContainer?.querySelector(`.limit-min[data-limch="${i}"]`);
        const maxSlider = limContainer?.querySelector(`.limit-max[data-limch="${i}"]`);
        const valSpan = limContainer?.querySelector(`.limit-vals[data-limch="${i}"]`);
        if (minSlider) minSlider.value = minV;
        if (maxSlider) maxSlider.value = maxV;
        if (valSpan) valSpan.textContent = `${minV} / ${maxV}`;
      }
    }
  } catch (e) {
    console.warn("[AIN] poll error:", e);
  } finally {
    pollInFlight = false;
  }
}

function startPolling() {
  stopPolling();
  valueTimer = setInterval(pollValues, 500);
}

function stopPolling() {
  if (valueTimer) {
    clearInterval(valueTimer);
    valueTimer = null;
  }
}

/* ── Load / Apply ── */

function countEnabled() {
  let c = 0;
  for (let i = 0; i < ainCount; i++) {
    if (ainMask & (1 << i)) c++;
  }
  return c;
}

let loadRetries = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

/**
 * Parse main.lsain reply (same format as OLD UI classlistToIds):
 *   "0:1:AIN-Pins\n1:0:CAN-Analog\n2:0:ADS111X"
 * Returns array of {id, creatable, name}
 */
function parseLsain(reply) {
  if (!reply) return [];
  return reply.split("\n").filter(Boolean).map(line => {
    const parts = line.split(":", 3);
    if (parts.length < 3) return null;
    return { id: parseInt(parts[0], 10), creatable: parts[1] !== "0", name: parts[2] };
  }).filter(Boolean);
}

async function loadAin() {
  const hint = document.getElementById("ainHint");
  const container = document.getElementById("ainChannels");
  const limContainer = document.getElementById("ainLimits");
  const countEl = document.getElementById("ainChannelCount");
  const limCard = document.getElementById("manualLimitsCard");
  if (!api || !container) {
    if (hint) hint.textContent = "Sem API";
    return;
  }

  if (hint) hint.textContent = "Carregando...";

  // ── Step 1: Discover analog source types and aintypes in one batch ──
  const [lsainReply, aintypesReply] = await api.serial_request_many([
    { cls: "main", cmd: "lsain", instance: 0, typechar: "?" },
    { cls: "main", cmd: "aintypes", instance: 0, typechar: "?" },
  ]);
  console.log("[AIN] main.lsain? reply:", JSON.stringify(lsainReply));

  if (!lsainReply || lsainReply.trim() === "") {
    if (loadRetries < MAX_RETRIES) {
      loadRetries++;
      console.log("[AIN] lsain empty, retry", loadRetries, "of", MAX_RETRIES);
      if (hint) hint.textContent = `Tentando novamente... (${loadRetries}/${MAX_RETRIES})`;
      setTimeout(loadAin, RETRY_DELAY);
      return;
    }
    if (hint) hint.textContent = "Sem resposta do firmware. Use o botao do cabe?alho se precisar recarregar.";
    stopPolling();
    return;
  }

  loadRetries = 0;
  const ainSources = parseLsain(lsainReply);
  console.log("[AIN] Analog sources:", ainSources);

  // Find AIN-Pins entry (id=0 in OLD UI, or name containing "AIN" / "Pins")
  const ainEntry = ainSources.find(s => s.id === 0) || ainSources.find(s => /ain|pins|local/i.test(s.name));
  if (!ainEntry) {
    if (hint) hint.textContent = "Tipo AIN-Pins não disponível neste firmware.";
    if (container) container.innerHTML = "";
    if (limContainer) limContainer.innerHTML = "";
    if (limCard) limCard.style.display = "none";
    stopPolling();
    return;
  }
  ainClassId = ainEntry.id;
  console.log("[AIN] Found AIN-Pins: id =", ainClassId, "name =", ainEntry.name);

  // ── Step 2: Check if AIN-Pins type is active via main.aintypes ──
  //    If not active, auto-activate it (like OLD UI's checkbox in ffb_ui.py)
  console.log("[AIN] main.aintypes? reply:", JSON.stringify(aintypesReply));
  aintypesBitmask = parseInt(aintypesReply, 10) || 0;
  ainTypesActive = (aintypesBitmask & (1 << ainClassId)) !== 0;
  console.log("[AIN] aintypes bitmask:", aintypesBitmask, "AIN-Pins active:", ainTypesActive);

  const overlay = document.getElementById("ainActivationOverlay");
  const mainContent = document.getElementById("ainMainContent");

  if (!ainTypesActive) {
    // Show activation overlay instead of auto-activating
    if (overlay) overlay.style.display = "";
    if (mainContent) mainContent.style.display = "none";
    if (hint) hint.textContent = "AIN-Pins inativo";
    stopPolling();
    return;
  }

  // AIN-Pins is active — hide overlay, show content
  if (overlay) overlay.style.display = "none";
  if (mainContent) mainContent.style.display = "";

  // ── Step 3: Now query apin class (batch pins+mask+filter+autocal) ──
  const [pinsReply, maskReply, filterReply, autoReply] = await api.serial_request_many([
    { cls: "apin", cmd: "pins", instance: 0, typechar: "?" },
    { cls: "apin", cmd: "mask", instance: 0, typechar: "?" },
    { cls: "apin", cmd: "filter", instance: 0, typechar: "?" },
    { cls: "apin", cmd: "autocal", instance: 0, typechar: "?" },
  ]);
  console.log("[AIN] apin.pins? reply:", JSON.stringify(pinsReply));

  ainCount = parseInt(pinsReply, 10);
  if (isNaN(ainCount) || ainCount <= 0) {
    if (container) container.innerHTML = "";
    if (limContainer) limContainer.innerHTML = "";
    if (countEl) countEl.textContent = "0 canais";
    if (limCard) limCard.style.display = "none";
    if (hint) hint.textContent = "0 canais analógicos disponíveis";
    stopPolling();
    return;
  }

  // Class is active and has pins - show limits card
  if (limCard) limCard.style.display = "";

  console.log("[AIN] mask:", maskReply, "filter:", filterReply, "autocal:", autoReply);

  ainMask = parseInt(maskReply, 10) || 0;
  enabledChannels = countEnabled();

  buildChannelGrid(container, ainCount, ainMask);
  buildLimitsGrid(limContainer, enabledChannels);

  const filterEl = document.getElementById("ainFilter");
  const autoEl = document.getElementById("ainAutorange");
  if (filterEl) filterEl.checked = (parseInt(filterReply, 10) || 0) > 0;
  if (autoEl) autoEl.checked = (parseInt(autoReply, 10) || 0) > 0;

  updateLimitsCard();
  await readLimitsFromBoard();

  if (countEl) countEl.textContent = `${enabledChannels} de ${ainCount} canais ativos`;
  if (hint) hint.textContent = `${ainCount} canais`;
  ainLoaded = true;
  startPolling();
}

async function applyAin() {
  const hint = document.getElementById("ainHint");
  const container = document.getElementById("ainChannels");
  const limContainer = document.getElementById("ainLimits");
  if (!api || !container) return;

  // Gather mask
  let mask = 0;
  container.querySelectorAll(".ch-enable").forEach((cb) => {
    if (cb.checked) mask |= 1 << parseInt(cb.dataset.ch, 10);
  });
  ainMask = mask;
  enabledChannels = countEnabled();

  const filter = document.getElementById("ainFilter")?.checked ? 1 : 0;
  const autorange = document.getElementById("ainAutorange")?.checked ? 1 : 0;

  // Batch all set operations in a single IPC call
  const sets = [
    { cls: "apin", cmd: "mask", value: mask, instance: 0 },
    { cls: "apin", cmd: "filter", value: filter, instance: 0 },
    { cls: "apin", cmd: "autocal", value: autorange, instance: 0 },
  ];

  // Send manual limits only when autorange is off
  if (!autorange) {
    for (let i = 0; i < enabledChannels && i < limitsData.length; i++) {
      const minSigned = limitsData[i].min - 0x7FFF;
      const maxSigned = limitsData[i].max - 0x7FFF;
      sets.push({ cls: "apin", cmd: "min", value: minSigned, instance: 0, adr: i });
      sets.push({ cls: "apin", cmd: "max", value: maxSigned, instance: 0, adr: i });
    }
  }

  await api.serial_set_many(sets);

  // Rebuild limits grid for new channel count
  buildLimitsGrid(limContainer, enabledChannels);
  await readLimitsFromBoard();
  updateLimitsCard();

  const countEl = document.getElementById("ainChannelCount");
  if (countEl) countEl.textContent = `${enabledChannels} de ${ainCount} canais ativos`;
  if (hint) hint.textContent = "Aplicado";
}

function refreshAin() {
  loadRetries = 0;
  ainLoaded = false;
  loadAin();
}

document.addEventListener("DOMContentLoaded", () => {
  loadAin();
  // Activation button
  document.getElementById("btnActivateAin")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnActivateAin");
    const actHint = document.getElementById("activationHint");
    if (btn) btn.disabled = true;
    if (actHint) actHint.textContent = "Ativando AIN-Pins...";
    try {
      const newMask = aintypesBitmask | (1 << ainClassId);
      console.log("[AIN] Activating AIN-Pins: setting aintypes =", newMask);
      await api.serial_set_value("main", "aintypes", newMask, 0, null);
      await new Promise(r => setTimeout(r, 500));
      ainTypesActive = true;
      if (actHint) actHint.textContent = "";
      loadRetries = 0;
      await loadAin();
    } catch (e) {
      console.error("[AIN] Activation failed:", e);
      if (actHint) actHint.textContent = "Erro ao ativar. Tente novamente.";
      if (btn) btn.disabled = false;
    }
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPolling();
  else if (ainCount > 0) startPolling();
});

window.addEventListener("message", (e) => {
  if (e.data?.type === "configVisibility") {
    if (e.data.visible) {
      if (ainLoaded && ainCount > 0) {
        startPolling();
      } else {
        loadAin();
      }
    } else {
      stopPolling();
    }
  }
});

// API expected by the parent header controls
// loadConfig is only called for explicit refresh (header button)
window.loadConfig = refreshAin;
window.applyConfig = applyAin;
