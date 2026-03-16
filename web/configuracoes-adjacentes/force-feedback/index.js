const api = window.parent?.pywebview?.api;

let rateTimer = null;
let springGain = 4;
let damperGain = 2;
let frictionGain = 2;
let inertiaGain = 2;

function mapInfoString(reply) {
  if (!reply) return {};
  const result = {};
  reply.split(",").forEach((entry) => {
    const [key, val] = entry.split(":");
    if (key && val) result[key.trim()] = parseFloat(val) || 0;
  });
  return result;
}

function updateSliderLabel(slider, label, gain) {
  const val = slider.value * (gain / 256);
  label.textContent = val.toFixed(2);
}

function setupGainSlider(sliderId, valId, gain, command) {
  const slider = document.getElementById(sliderId);
  const valEl = document.getElementById(valId);
  if (!slider || !valEl) return;
  slider.addEventListener("input", () => {
    updateSliderLabel(slider, valEl, gain);
    if (api && command) api.serial_set_value("fx", command, parseInt(slider.value, 10), 0, null);
  });
}

async function pollRates() {
  if (!api) return;
  const data = await api.get_ffb_status();
  const statusEl = document.getElementById("ffbStatus");
  const dot = document.getElementById("ffbDot");
  const cf = document.getElementById("ffbCfRate");
  if (statusEl) statusEl.textContent = `${data?.rate || 0} Hz`;
  if (cf) cf.textContent = `${data?.cfrate || 0} Hz`;
  if (dot) dot.classList.toggle("active", data?.active && data?.rate > 0);
}

function startPolling() {
  stopPolling();
  rateTimer = setInterval(pollRates, 500);
}

function stopPolling() {
  if (rateTimer) {
    clearInterval(rateTimer);
    rateTimer = null;
  }
}

function updateCfFreqLabel(val) {
  const label = document.getElementById("cfFreqVal");
  const qGroup = document.getElementById("cfQGroup");
  if (val >= 500) {
    if (label) label.textContent = "Off";
    if (qGroup) qGroup.style.opacity = "0.4";
  } else {
    if (label) label.textContent = val + " Hz";
    if (qGroup) qGroup.style.opacity = "1";
  }
}

async function loadFfb() {
  const hint = document.getElementById("ffbHint");
  if (!api) {
    if (hint) hint.textContent = "Sem API";
    return;
  }

  /* Gain scalers */
  const springInfo = await api.serial_request("fx", "spring", 0, null, "!");
  const damperInfo = await api.serial_request("fx", "damper", 0, null, "!");
  const frictionInfo = await api.serial_request("fx", "friction", 0, null, "!");
  const inertiaInfo = await api.serial_request("fx", "inertia", 0, null, "!");

  const si = mapInfoString(springInfo);
  const di = mapInfoString(damperInfo);
  const fi = mapInfoString(frictionInfo);
  const ii = mapInfoString(inertiaInfo);

  if (si.scale > 0) springGain = si.scale;
  if (di.scale > 0) damperGain = di.scale;
  if (fi.scale > 0) frictionGain = fi.scale;
  if (ii.scale > 0) inertiaGain = ii.scale;

  /* Current gain values */
  const springVal = await api.serial_request("fx", "spring", 0, null, "?");
  const damperVal = await api.serial_request("fx", "damper", 0, null, "?");
  const frictionVal = await api.serial_request("fx", "friction", 0, null, "?");
  const inertiaVal = await api.serial_request("fx", "inertia", 0, null, "?");
  const cfFreqVal = await api.serial_request("fx", "filterCfFreq", 0, null, "?");
  const cfQVal = await api.serial_request("fx", "filterCfQ", 0, null, "?");

  function setSlider(sliderId, valId, rawVal, gain) {
    const slider = document.getElementById(sliderId);
    const valEl = document.getElementById(valId);
    const v = parseInt(rawVal, 10) || 0;
    if (slider) slider.value = v;
    if (valEl) valEl.textContent = (v * gain / 256).toFixed(2);
  }

  setSlider("springSlider", "springVal", springVal, springGain);
  setSlider("damperSlider", "damperVal", damperVal, damperGain);
  setSlider("frictionSlider", "frictionVal", frictionVal, frictionGain);
  setSlider("inertiaSlider", "inertiaVal", inertiaVal, inertiaGain);

  const cfFreq = parseInt(cfFreqVal, 10) || 500;
  const cfQ = parseInt(cfQVal, 10) || 50;
  const cfFreqSlider = document.getElementById("cfFreqSlider");
  const cfQSlider = document.getElementById("cfQSlider");
  const cfQValEl = document.getElementById("cfQVal");
  if (cfFreqSlider) cfFreqSlider.value = cfFreq;
  updateCfFreqLabel(cfFreq);
  if (cfQSlider) cfQSlider.value = cfQ;
  if (cfQValEl) cfQValEl.textContent = (cfQ * 0.01).toFixed(2);

  /* Setup slider events */
  setupGainSlider("springSlider", "springVal", springGain, "spring");
  setupGainSlider("damperSlider", "damperVal", damperGain, "damper");
  setupGainSlider("frictionSlider", "frictionVal", frictionGain, "friction");
  setupGainSlider("inertiaSlider", "inertiaVal", inertiaGain, "inertia");

  const cfFreqEl = document.getElementById("cfFreqSlider");
  if (cfFreqEl) {
    cfFreqEl.addEventListener("input", () => {
      const v = parseInt(cfFreqEl.value, 10);
      updateCfFreqLabel(v);
      if (api) api.serial_set_value("fx", "filterCfFreq", v, 0, null);
    });
  }

  if (cfQSlider) {
    cfQSlider.addEventListener("input", () => {
      const v = parseInt(cfQSlider.value, 10);
      if (cfQValEl) cfQValEl.textContent = (v * 0.01).toFixed(2);
      if (api) api.serial_set_value("fx", "filterCfQ", v, 0, null);
    });
  }

  pollRates();
  startPolling();
  if (hint) hint.textContent = "Pronto";
}

async function applyFfb() {
  const hint = document.getElementById("ffbHint");
  if (!api) return;

  if (hint) hint.textContent = "Aplicado";
}

document.addEventListener("DOMContentLoaded", () => {
  loadFfb();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPolling();
  else startPolling();
});

// Parent signals visibility when user switches adjacent config views
window.addEventListener("message", (e) => {
  if (e.data?.type === "configVisibility") {
    if (e.data.visible) startPolling();
    else stopPolling();
  }
});

// API expected by the parent header controls
window.loadConfig = loadFfb;
window.applyConfig = applyFfb;
