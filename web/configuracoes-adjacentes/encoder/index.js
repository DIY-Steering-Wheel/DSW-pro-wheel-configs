const api = window.parent?.pywebview?.api;

let currentEncoderId = null;

function parseList(reply) {
  if (!reply) return [];
  return reply
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(":");
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

function showPanel(id) {
  document.querySelectorAll(".enc-panel").forEach((p) => (p.style.display = "none"));
  const settingsBox = document.getElementById("encoderSettings");
  const titleEl = document.getElementById("encoderSettingsTitle");

  const panelMap = {
    2: { el: "encLocal", title: "Local Encoder" },
    4: { el: "encMt", title: "SPI Settings (MT)" },
    5: { el: "encBiss", title: "BISS Settings" },
    6: { el: "encSsi", title: "SSI Settings" },
  };

  const entry = panelMap[id];
  if (entry) {
    const panel = document.getElementById(entry.el);
    if (panel) panel.style.display = "";
    if (settingsBox) settingsBox.style.display = "";
    if (titleEl) titleEl.textContent = entry.title;
  } else if (id === 1) {
    /* TMC - no settings here */
    const none = document.getElementById("encNone");
    if (none) {
      none.style.display = "";
      none.querySelector(".enc-note").textContent = "Configure no painel TMC";
    }
    if (settingsBox) settingsBox.style.display = "";
    if (titleEl) titleEl.textContent = "Encoder TMC";
  } else {
    const none = document.getElementById("encNone");
    if (none) none.style.display = "";
    if (settingsBox) settingsBox.style.display = id != null ? "" : "none";
    if (titleEl) titleEl.textContent = "Configurações do encoder";
  }
}

async function loadEncoderSettings(id) {
  if (!api) return;
  currentEncoderId = id;
  showPanel(id);

  if (id === 2) {
    const cpr = await api.serial_request("localenc", "cpr", 0, null, "?");
    const idx = await api.serial_request("localenc", "index", 0, null, "?");
    const cprEl = document.getElementById("localCpr");
    const idxEl = document.getElementById("localIndex");
    if (cprEl) cprEl.value = parseInt(cpr, 10) || 0;
    if (idxEl) idxEl.checked = (parseInt(idx, 10) || 0) > 0;
  } else if (id === 4) {
    const modeList = await api.serial_request("mtenc", "mode", 0, null, "!");
    const modeCur = await api.serial_request("mtenc", "mode", 0, null, "?");
    const speedList = await api.serial_request("mtenc", "speed", 0, null, "!");
    const speedCur = await api.serial_request("mtenc", "speed", 0, null, "?");
    const cs = await api.serial_request("mtenc", "cs", 0, null, "?");
    const modes = parseList(modeList);
    const speeds = parseList(speedList).map((s) => ({
      ...s,
      name: (s.name / 1000000).toFixed(5).replace(/0+$/, "").replace(/\.$/, "") + " MHz",
    }));
    fillSelect(document.getElementById("mtMode"), modes, parseInt(modeCur, 10));
    fillSelect(document.getElementById("mtSpeed"), speeds, parseInt(speedCur, 10));
    const csEl = document.getElementById("mtCs");
    if (csEl) csEl.value = parseInt(cs, 10) || 1;
  } else if (id === 5) {
    const bits = await api.serial_request("bissenc", "bits", 0, null, "?");
    const dir = await api.serial_request("bissenc", "dir", 0, null, "?");
    const bitsEl = document.getElementById("bissBits");
    const dirEl = document.getElementById("bissDir");
    if (bitsEl) bitsEl.value = parseInt(bits, 10) || 1;
    if (dirEl) dirEl.checked = (parseInt(dir, 10) || 0) > 0;
  } else if (id === 6) {
    const bits = await api.serial_request("ssienc", "bits", 0, null, "?");
    const modeList = await api.serial_request("ssienc", "mode", 0, null, "!");
    const modeCur = await api.serial_request("ssienc", "mode", 0, null, "?");
    const speedList = await api.serial_request("ssienc", "speed", 0, null, "!");
    const speedCur = await api.serial_request("ssienc", "speed", 0, null, "?");
    const bitsEl = document.getElementById("ssiBits");
    if (bitsEl) bitsEl.value = parseInt(bits, 10) || 1;
    fillSelect(document.getElementById("ssiMode"), parseList(modeList), parseInt(modeCur, 10));
    fillSelect(document.getElementById("ssiSpeed"), parseList(speedList), parseInt(speedCur, 10));
  }
}

async function loadEncoder() {
  const label = document.getElementById("encoderTypeLabel");
  const hint = document.getElementById("encoderHint");
  if (!api || !label) {
    if (hint) hint.textContent = "Sem API";
    return;
  }
  const data = await api.get_class_definitions();
  const options = data?.encoder?.classes || [];
  const current = data?.encoder?.current;
  if (options.length === 0) {
    label.textContent = "Sem classes";
    if (hint) hint.textContent = "Sem classes";
    showPanel(null);
    return;
  }
  const currentEntry = options.find((entry) => entry.id === current);
  label.textContent = currentEntry?.name || `Classe ${current ?? "--"}`;
  currentEncoderId = current;
  await loadEncoderSettings(current);
  if (hint) hint.textContent = "Pronto";
}

async function applyEncoder() {
  const hint = document.getElementById("encoderHint");
  if (!api) return;

  const id = currentEncoderId;
  if (id === null || id === undefined) return;
  if (id === 2) {
    const cpr = parseInt(document.getElementById("localCpr")?.value, 10) || 0;
    const idx = document.getElementById("localIndex")?.checked ? 1 : 0;
    await api.serial_set_many([
      { cls: "localenc", cmd: "cpr", value: cpr, instance: 0 },
      { cls: "localenc", cmd: "index", value: idx, instance: 0 },
    ]);
  } else if (id === 4) {
    const cs = parseInt(document.getElementById("mtCs")?.value, 10) || 1;
    const mode = parseInt(document.getElementById("mtMode")?.value, 10);
    const speed = parseInt(document.getElementById("mtSpeed")?.value, 10);
    const sets = [{ cls: "mtenc", cmd: "cs", value: cs, instance: 0 }];
    if (!Number.isNaN(mode)) sets.push({ cls: "mtenc", cmd: "mode", value: mode, instance: 0 });
    if (!Number.isNaN(speed)) sets.push({ cls: "mtenc", cmd: "speed", value: speed, instance: 0 });
    await api.serial_set_many(sets);
  } else if (id === 5) {
    const bits = parseInt(document.getElementById("bissBits")?.value, 10) || 1;
    const dir = document.getElementById("bissDir")?.checked ? 1 : 0;
    await api.serial_set_many([
      { cls: "bissenc", cmd: "bits", value: bits, instance: 0 },
      { cls: "bissenc", cmd: "dir", value: dir, instance: 0 },
    ]);
  } else if (id === 6) {
    const bits = parseInt(document.getElementById("ssiBits")?.value, 10) || 1;
    const mode = parseInt(document.getElementById("ssiMode")?.value, 10);
    const speed = parseInt(document.getElementById("ssiSpeed")?.value, 10);
    const sets = [{ cls: "ssienc", cmd: "bits", value: bits, instance: 0 }];
    if (!Number.isNaN(mode)) sets.push({ cls: "ssienc", cmd: "mode", value: mode, instance: 0 });
    if (!Number.isNaN(speed)) sets.push({ cls: "ssienc", cmd: "speed", value: speed, instance: 0 });
    await api.serial_set_many(sets);
  }

  if (hint) hint.textContent = "Aplicado";
}

document.addEventListener("DOMContentLoaded", () => {
  loadEncoder();
});

// API expected by the parent header controls
window.loadConfig = loadEncoder;
window.applyConfig = applyEncoder;
