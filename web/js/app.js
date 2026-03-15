let selectedPort = null;
let selectedProfile = null;
let mainClassData = { current: null, classes: [] };
let classCatalog = [];
let activeClassIds = new Set();
let activeClasses = [];
let adjacentConfigs = [];
let currentViewKey = "dashboard";
let classDefinitions = {
  driver: { current: null, classes: [] },
  encoder: { current: null, classes: [] },
  shifter: { current: null, modes: [] },
};
let joystickRates = { current: null, modes: [] };
let lastStatus = null;
let terminalLog = [];
let errorsList = [];
let profilesCache = { profiles: [], current: "None" };
let autoConnectAttempted = false;

const fallbackMenu = [
  { key: "dashboard", label: "Painel", icon: "bi-grid-1x2" },
  { key: "connection", label: "Conexao", icon: "bi-usb-plug" },
  { key: "profiles", label: "Perfis", icon: "bi-collection" },
  { key: "motion", label: "Motores e Eixos", icon: "bi-gear-wide-connected" },
  { key: "effects", label: "Efeitos", icon: "bi-lightning" },
  { key: "firmware", label: "Firmware", icon: "bi-cpu" },
  { key: "logs", label: "Logs", icon: "bi-journal-text" },
];

const SOCIAL_LINKS = {
  discord: "",
  site: "",
};

const ABOUT_INFO = {
  base: "Baseado no firmware DSW Pro Wheel e protocolo serial da controladora.",
  credits: ["Equipe DSW Pro Wheel", "Contribuidores do projeto"],
  openffboard: "https://github.com/Ultrawipf/OpenFFBoard",
};

const VIEW_IDS = {
  dashboard: "view-dashboard",
  "monitoring-status": "view-monitoring-status",
  "monitoring-live": "view-monitoring-live",
};

const EFFECTS_CLASS_ID = 0xA02;
let monitoringTimer = null;
let monitoringAxis = 0;
let ffbTimer = null;
let ffbPollingInFlight = false;

function isMonitoringView(viewKey) {
  return viewKey === "monitoring-status" || viewKey === "monitoring-live";
}

function getViewElement(viewKey) {
  if (VIEW_IDS[viewKey]) {
    return document.getElementById(VIEW_IDS[viewKey]);
  }
  if (viewKey && viewKey.startsWith("adjacent:")) {
    const id = viewKey.slice("adjacent:".length);
    return document.getElementById(`view-adjacent-${id}`);
  }
  return null;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value ?? "--";
  }
}

function setSaveStatus(message) {
  const el = document.getElementById("saveStatus");
  if (el) {
    el.textContent = message || "Nenhuma acao recente.";
  }
}

function addSystemLog(message, level = "info") {
  const timestamp = new Date().toLocaleTimeString();
  terminalLog.push({ message, timestamp, isError: level === "error" });
  updateTerminalDisplay();
}

function updateFooterConnection(status) {
  const footer = document.getElementById("footerConnection");
  if (!footer) return;
  if (status?.connected) {
    footer.textContent = `Porta: ${status.port}`;
  } else {
    footer.textContent = "Nenhum dispositivo conectado";
  }
}

function renderMenu(items) {
  const menu = document.getElementById("navMenu");
  if (!menu) return;
  menu.innerHTML = "";
  (items || fallbackMenu).forEach((item, index) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.className = `${index === 0 ? "active" : ""}`;
    link.href = "#";
    link.innerHTML = `<i class="bi ${item.icon}"></i><span>${item.label}</span>`;
    li.appendChild(link);
    menu.appendChild(li);
  });
}

function setTopbarTitle(title) {
  const titleEl = document.getElementById("topbarTitle");
  if (titleEl) titleEl.textContent = title || "Painel";
}

function ensureAdjacentViews() {
  const container = document.getElementById("adjacentViews");
  if (!container) return;
  adjacentConfigs.forEach((cfg) => {
    const viewId = `view-adjacent-${cfg.id}`;
    if (document.getElementById(viewId)) {
      return;
    }
    const section = document.createElement("section");
    section.id = viewId;
    section.className = "view-panel";
    section.dataset.view = `adjacent:${cfg.id}`;
    section.innerHTML = `
      <div class="analysis-card">
        <div class="card-body">
          <iframe class="adjacent-frame" src="${cfg.view}" title="${cfg.title}"></iframe>
        </div>
      </div>
    `;
    container.appendChild(section);
  });
}

function isConfigVisible(cfg) {
  if (!cfg) return false;
  
  // Se requer_active é false, sempre mostra
  if (cfg.requires_active === false) return true;
  
  // ESTRATÉGIA 1: Verificar clsname_match contra activeClasses (funciona para classes ativas instantaneamente)
  const clsnameMatches = Array.isArray(cfg.clsname_match)
    ? cfg.clsname_match
    : cfg.clsname_match
      ? [cfg.clsname_match]
      : [];
  
  if (clsnameMatches.length > 0) {
    const hasActiveMatch = activeClasses.some((entry) => {
      const clsname = String(entry.clsname || entry.name || entry.label || "").toLowerCase();
      return clsnameMatches.some((needle) => clsname.includes(String(needle).toLowerCase()));
    });
    
    if (hasActiveMatch) {
      console.debug(`[isConfigVisible] ${cfg.id}: matched active class via clsname_match`);
      return true;
    }
  }
  
  // ESTRATÉGIA 2: Se tem definition_key, verifica a definição selecionada
  if (cfg.definition_key) {
    const def = classDefinitions?.[cfg.definition_key];
    
    // Se não tem def ou current é null, não está disponível
    if (!def || def.current === null || def.current === undefined) {
      console.debug(`[isConfigVisible] ${cfg.id}: definition_key="${cfg.definition_key}" não têm valor atual`);
      return false;
    }
    
    // Se não tem definition_match, e tem um current, assume que está visível
    const matchers = Array.isArray(cfg.definition_match)
      ? cfg.definition_match
      : cfg.definition_match
        ? [cfg.definition_match]
        : [];
    
    if (matchers.length === 0) {
      console.debug(`[isConfigVisible] ${cfg.id}: sem definition_match, mas tem current`);
      return true;
    }

    if (cfg.definition_key === "encoder") {
      console.debug(`[isConfigVisible] ${cfg.id}: encoder com current definido, exibindo`);
      return true;
    }
    
    const currentId = def.current;
    const idMatches = matchers.some(
      (needle) => String(needle).toLowerCase() === String(currentId).toLowerCase()
    );
    if (idMatches) {
      console.debug(`[isConfigVisible] ${cfg.id}: matched current id "${currentId}"`);
      return true;
    }
    
    // Se tem matchers, verifica se o nome atual bate
    const hasClassList = Array.isArray(def.classes) && def.classes.length > 0;
    if (hasClassList) {
      const current = def.classes.find((entry) => entry.id === def.current);
      if (current) {
        const name = String(current?.name || "").toLowerCase();
        const matches = matchers.some((needle) => name.includes(String(needle).toLowerCase()));
        if (matches) {
          console.debug(`[isConfigVisible] ${cfg.id}: matched driver "${name}"`);
        } else {
          console.debug(`[isConfigVisible] ${cfg.id}: driver "${name}" não bate com matchers`, matchers);
        }
        return matches;
      }
    }
    
    // Fallback: if has definition_match but can't resolve, still check activeClasses
    console.debug(`[isConfigVisible] ${cfg.id}: sem nome resolvido via definition, checando activeClasses`);
    return false;
  }
  
  // Se tem class_id, verifica se está na lista de IDs ativos
  if (cfg.class_id !== null && cfg.class_id !== undefined) {
    const isVisible = activeClassIds.has(Number(cfg.class_id));
    if (!isVisible) {
      console.debug(`[isConfigVisible] ${cfg.id}: class_id=${cfg.class_id} não está ativo`);
    }
    return isVisible;
  }
  
  // Fallback: sem nenhuma regra de matching
  if (clsnameMatches.length === 0) {
    console.debug(`[isConfigVisible] ${cfg.id}: sem regras de matching, considerando visível`);
    return true;
  }
  
  return false;
}

function renderCalibrationTree() {
  const container = document.getElementById("adjacentTree");
  if (!container) return;
  container.innerHTML = "";
  
  console.debug("[renderCalibrationTree] Total configs:", adjacentConfigs.length);
  console.debug("[renderCalibrationTree] adjacentConfigs:", adjacentConfigs);
  console.debug("[renderCalibrationTree] classDefinitions:", classDefinitions);
  console.debug("[renderCalibrationTree] activeClasses:", activeClasses);
  console.debug("[renderCalibrationTree] activeClassIds:", Array.from(activeClassIds));
  
  const visible = adjacentConfigs.filter(isConfigVisible);
  
  console.debug("[renderCalibrationTree] Visible configs:", visible.length, visible.map((c) => c.id));
  
  let renderList = visible;
  if (renderList.length === 0 && adjacentConfigs.length > 0) {
    const definitionFallback = adjacentConfigs.filter((cfg) => {
      if (!cfg.definition_key) return false;
      const def = classDefinitions?.[cfg.definition_key];
      return def && def.current !== null && def.current !== undefined;
    });
    if (definitionFallback.length > 0) {
      console.debug("[renderCalibrationTree] Fallback: showing definition-based configs", definitionFallback.map((c) => c.id));
      renderList = definitionFallback;
    } else if (lastStatus?.connected) {
      console.debug("[renderCalibrationTree] Fallback: showing all adjacent configs");
      renderList = adjacentConfigs;
    }
  }
  
  if (renderList.length === 0) {
    return;
  }
  renderList.forEach((cfg) => {
    const item = document.createElement("div");
    item.className = "tree-item";
    item.setAttribute("data-view", `adjacent:${cfg.id}`);
    item.setAttribute("data-title", cfg.title);
    item.innerHTML = `
      <i class="bi ${cfg.icon || "bi-sliders"}"></i>
      <span>${cfg.title}</span>
    `;
    container.appendChild(item);
  });
  bindTreeHandlers();
}

function activateTreeItemByView(viewKey) {
  const tree = document.getElementById("calibrationTree");
  if (!tree) return;
  tree.querySelectorAll(".tree-item").forEach((node) => node.classList.remove("active"));
  const target = tree.querySelector(`.tree-item[data-view="${viewKey}"]`);
  target?.classList.add("active");
}

function bindTreeHandlers() {
  const tree = document.getElementById("calibrationTree");
  const treeChildren = tree?.querySelector('.tree-children[data-parent="monitoring"]');
  tree?.querySelectorAll(".tree-item").forEach((item) => {
    if (item.dataset.bound === "1") return;
    item.dataset.bound = "1";
    item.addEventListener("click", (event) => {
      event.preventDefault();
      if (item.classList.contains("tree-parent")) {
        treeChildren?.classList.toggle("collapsed");
        return;
      }
      const viewKey = item.getAttribute("data-view");
      const title = item.getAttribute("data-title") || "Painel";
      if (isMonitoringView(viewKey)) {
        requestOpenMonitoring(viewKey, title);
        return;
      }
      setActiveView(viewKey, title);
      activateTreeItemByView(viewKey);
    });
  });
}

function setActiveView(viewKey, title) {
  currentViewKey = viewKey || "dashboard";
  if (!isMonitoringView(viewKey)) {
    stopMonitoringPolling();
  }
  Object.values(VIEW_IDS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
  });
  document.querySelectorAll("[id^='view-adjacent-']").forEach((el) => el.classList.remove("active"));
  const viewEl = getViewElement(viewKey);
  if (viewEl) viewEl.classList.add("active");
  setTopbarTitle(title);
}

function requestOpenMonitoring(viewKey, title) {
  if (!lastStatus?.connected || !activeClassIds.has(EFFECTS_CLASS_ID)) {
    setSaveStatus("Monitoramento indisponivel. Conecte e ative a classe de efeitos.");
    return;
  }
  setActiveView(viewKey, title);
  activateTreeItemByView(viewKey);
  startMonitoringPolling();
}

function renderClasses() {
  const container = document.getElementById("classList");
  const countEl = document.getElementById("classCount");
  if (!container) return;

  container.innerHTML = "";
  if (!lastStatus?.connected) {
    container.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; text-align: center; color: var(--text-muted);">Conecte para listar classes</div>`;
    if (countEl) countEl.textContent = "0";
    return;
  }

  const definitions = [
    {
      key: "driver",
      label: "Driver de Force Feedback",
      icon: "bi-speedometer2",
      description: "Seleciona o driver principal do force feedback.",
    },
    {
      key: "encoder",
      label: "Classe do Encoder",
      icon: "bi-disc",
      description: "Seleciona o encoder usado no eixo principal.",
    },
    {
      key: "shifter",
      label: "H-Shifter",
      icon: "bi-joystick",
      description: "Seleciona o modo do H-shifter.",
    },
  ];

  if (countEl) countEl.textContent = String(definitions.length);

  definitions.forEach((definition) => {
    const data = classDefinitions?.[definition.key] || {};
    const options = definition.key === "shifter" ? data.modes || [] : data.classes || [];
    const selected = data.current ?? "";
    const isDisabled = !lastStatus?.connected || options.length === 0;

    const item = document.createElement("div");
    item.className = "class-item class-definition";
    const optionLabel = (entry) => entry.name || entry.label || `Classe ${entry.id}`;
    const isShifter = definition.key === "shifter";

    if (isShifter) {
      const offOption = options.find((entry) => entry.id === 0) || options[0];
      const onOption = options.find((entry) => entry.id !== (offOption?.id ?? -1)) || options[0];
      const isEnabled = selected !== null && selected !== undefined && (offOption ? selected !== offOption.id : selected > 0);
      const optionValues = options
        .map((entry) => `<option value="${entry.id}">${optionLabel(entry)}</option>`)
        .join("");
      const toggleDisabled = isDisabled || options.length === 0;

      item.innerHTML = `
        <div class="class-name">
          <i class="bi ${definition.icon}"></i>
          <span>${definition.label}</span>
        </div>
        <div class="class-desc">${definition.description}</div>
        <label class="toggle-switch">
          <input type="checkbox" class="class-definition-toggle" data-definition="${definition.key}" ${
            toggleDisabled ? "disabled" : ""
          } ${isEnabled ? "checked" : ""}>
          <span class="toggle-slider"></span>
          <span class="toggle-state">${isEnabled ? "Ligado" : "Desligado"}</span>
        </label>
        ${options.length > 0 ? `
          <div class="class-select">
            <select class="form-select-sm class-definition-select" data-definition="${definition.key}" ${
              toggleDisabled || !isEnabled ? "disabled" : ""
            }>
              ${optionValues}
            </select>
          </div>
        ` : ""}
      `;
      container.appendChild(item);

      const toggle = item.querySelector(".class-definition-toggle");
      const label = item.querySelector(".toggle-state");
      const select = item.querySelector(".class-definition-select");

      if (select) {
        select.value = selected !== null && selected !== undefined ? String(selected) : "";
        select.addEventListener("change", () => {
          const value = parseInt(select.value, 10);
          classDefinitions[definition.key] = {
            ...data,
            current: Number.isNaN(value) ? null : value,
          };
          renderCalibrationTree();
          applyClassDefinitions();
        });
      }

      if (toggle) {
        toggle.addEventListener("change", () => {
          let value = offOption?.id ?? 0;
          if (toggle.checked) {
            if (select && select.value) {
              value = parseInt(select.value, 10);
            } else if (onOption) {
              value = onOption.id;
            }
          }
          if (label) {
            label.textContent = toggle.checked ? "Ligado" : "Desligado";
          }
          if (select) {
            select.disabled = toggleDisabled || !toggle.checked;
            if (toggle.checked && value !== null && value !== undefined) {
              select.value = String(value);
            }
          }
          classDefinitions[definition.key] = {
            ...data,
            current: Number.isNaN(value) ? null : value,
          };
          renderCalibrationTree();
          applyClassDefinitions();
        });
      }
      return;
    }

    const optionValues = options
      .map((entry) => {
        const disabled = entry.creatable === false && entry.id !== selected ? "disabled" : "";
        return `<option value="${entry.id}" ${disabled}>${optionLabel(entry)}</option>`;
      })
      .join("");
    const emptyOption = `<option value="">None</option>`;

    item.innerHTML = `
      <div class="class-name">
        <i class="bi ${definition.icon}"></i>
        <span>${definition.label}</span>
      </div>
      <div class="class-desc">${definition.description}</div>
      <div class="class-select">
        <select class="form-select-sm class-definition-select" data-definition="${definition.key}" ${
          isDisabled ? "disabled" : ""
        }>
          ${emptyOption}
          ${optionValues}
        </select>
      </div>
    `;

    container.appendChild(item);

    const select = item.querySelector("select");
    if (select) {
      select.value = selected !== null && selected !== undefined ? String(selected) : "";
      select.addEventListener("change", () => {
        const value = parseInt(select.value, 10);
        classDefinitions[definition.key] = {
          ...data,
          current: Number.isNaN(value) ? null : value,
        };
        renderCalibrationTree();
      });
    }
  });
}

function renderPorts(ports) {
  const list = document.getElementById("portList");
  if (!list) return;
  list.innerHTML = "";
  if (!ports || ports.length === 0) {
    list.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 12px;">Nenhuma porta encontrada</div>`;
    return;
  }
  ports.forEach((port) => {
    const item = document.createElement("div");
    item.className = `port-item ${selectedPort === port.device ? "active" : ""}`;
    item.innerHTML = `
      <div class="port-item-name">${port.device}</div>
      <div class="port-item-meta">${port.description || "Sem descrição"}</div>
    `;
    item.addEventListener("click", () => {
      selectedPort = port.device;
      renderPorts(ports);
    });
    list.appendChild(item);
  });
}

function renderProfiles(data) {
  const select = document.getElementById("profileSelectModal");
  
  // Se o modal ainda não existe, só guardar os dados
  if (!select) {
    const profiles = data?.profiles || [];
    const current = data?.current;
    profilesCache = { profiles, current };
    if (!profiles.includes(selectedProfile)) {
      selectedProfile = current || profiles[0] || "None";
    }
    return;
  }
  
  select.innerHTML = "";
  let profiles = data?.profiles || [];
  const current = data?.current;
  profilesCache = { profiles, current };
  if (profiles.includes("Flash profile")) {
    profiles = profiles.filter((name) => name !== "None");
  }
  if (!profiles.includes(selectedProfile)) {
    selectedProfile = current || profiles[0] || "None";
  }
  profiles.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === selectedProfile) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function updateStatus(status) {
  lastStatus = status;
  const connected = status?.connected;
  
  // Update sidebar connection status
  const dot = document.getElementById("connectionDot");
  const statusText = document.getElementById("connectionState");
  if (dot) {
    dot.classList.toggle("connected", connected);
  }
  if (statusText) {
    statusText.textContent = connected ? `Conectado com ${status.port || "--"}` : "Desconectado";
  }
  
  const boardDot = document.getElementById("boardDot");
  const boardState = document.getElementById("boardState");
  if (boardDot) {
    boardDot.classList.toggle("connected", connected);
  }
  if (boardState) {
    const hwLabel = status?.hw ? `Placa: ${status.hw}` : "Placa: --";
    let supportLabel = "";
    if (connected) {
      supportLabel = status?.supported === true ? "Oficial" : status?.supported === false ? "Nao oficial" : "";
    }
    boardState.textContent = supportLabel ? `${hwLabel} (${supportLabel})` : hwLabel;
  }
  
  updateFooterConnection(status);
  setText("fwValue", status?.fw || "--");
  
  // Parse RAM value from "max:current" format
  if (status?.heapfree) {
    const values = status.heapfree.split(":");
    if (values.length === 2) {
      const max = parseInt(values[0]) / 1000;
      const current = parseInt(values[1]) / 1000;
      setText("ramValue", `${max.toFixed(1)}k (${current.toFixed(1)}k min)`);
    } else {
      setText("ramValue", status.heapfree);
    }
  } else {
    setText("ramValue", "--");
  }
  
  setText("tempValue", status?.temp ? `${status.temp} °C` : "--");
  setText("connValue", connected ? "Conectado" : "--");
  updateMonitoringLock(connected);
}

function updateMonitoringLock(connected) {
  const hasEffects = connected && activeClassIds && activeClassIds.has(EFFECTS_CLASS_ID);
  if (connected) {
    startFfbPolling();
  } else {
    stopFfbPolling();
  }
  const section = document.getElementById("monitoringSection");
  if (section) {
    section.style.display = "";
  }
  const parentItem = document.querySelector(".tree-item.tree-parent");
  const children = document.querySelector('.tree-children[data-parent="monitoring"]');
  if (parentItem) {
    parentItem.style.display = hasEffects ? "" : "none";
  }
  if (children) {
    children.style.display = hasEffects ? "" : "none";
  }
  document.querySelectorAll(".monitoring-item").forEach((item) => {
    item.classList.toggle("disabled", !hasEffects);
  });
  if (!hasEffects) {
    stopMonitoringPolling();
    if (isMonitoringView(currentViewKey)) {
      setActiveView("dashboard", "Painel");
      activateTreeItemByView("dashboard");
    }
  } else if (isMonitoringView(currentViewKey)) {
    startMonitoringPolling();
  }
  
  // Re-render adjacent configs since they may now be visible/invisible
  renderCalibrationTree();
  
  // Update hardware buttons state
  updateHardwareButtonsState(connected);
}

function updateHardwareButtonsState(connected) {
  const hwButtons = ["sidebarSaveFlash", "sidebarReboot", "sidebarFormat"];
  hwButtons.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.disabled = !connected;
      btn.style.opacity = connected ? "1" : "0.5";
      btn.style.cursor = connected ? "pointer" : "not-allowed";
    }
  });
}

function startMonitoringPolling() {
  if (monitoringTimer) return;
  monitoringTimer = setInterval(async () => {
    if (
      !window.pywebview?.api ||
      !lastStatus?.connected ||
      !activeClassIds.has(EFFECTS_CLASS_ID) ||
      !isMonitoringView(currentViewKey)
    ) {
      return;
    }
    const status = await window.pywebview.api.get_effects_status(monitoringAxis);
    if (status?.ok) {
      window.DswMonitoring?.updateStatus(status);
    }
    const live = await window.pywebview.api.get_effects_live_forces(monitoringAxis);
    if (live?.ok) {
      live.active_mask = status?.active_mask || 0;
      live.effects = status?.effects || [];
      window.DswMonitoring?.updateLive(live);
    }
  }, 500);
}

function stopMonitoringPolling() {
  if (!monitoringTimer) return;
  clearInterval(monitoringTimer);
  monitoringTimer = null;
}

function startFfbPolling() {
  if (ffbTimer) return;
  ffbTimer = setInterval(async () => {
    if (!window.pywebview?.api || !lastStatus?.connected) {
      return;
    }
    if (ffbPollingInFlight) {
      return;
    }
    ffbPollingInFlight = true;
    const data = await window.pywebview.api.get_ffb_status();
    const el = document.getElementById("ffbStatus");
    const dot = document.getElementById("ffbDot");
    ffbPollingInFlight = false;
    if (!el) return;
    if (!data?.ok) {
      el.textContent = "0 Hz";
      if (dot) dot.classList.remove("active");
      return;
    }
    if (data.active) {
      el.textContent = `${data.rate} hz (CF ${data.cfrate} hz)`;
    } else {
      el.textContent = `${data.rate} hz`;
    }
    const isActive = data.active && data.rate > 0;
    if (dot) dot.classList.toggle("active", isActive);
  }, 2500);
}

function stopFfbPolling() {
  if (!ffbTimer) return;
  clearInterval(ffbTimer);
  ffbTimer = null;
  ffbPollingInFlight = false;
  const el = document.getElementById("ffbStatus");
  if (el) el.textContent = "0 Hz";
  const dot = document.getElementById("ffbDot");
  if (dot) dot.classList.remove("active");
}

async function withPollingPaused(action) {
  const hadFfb = Boolean(ffbTimer);
  const hadMonitoring = Boolean(monitoringTimer);
  stopFfbPolling();
  stopMonitoringPolling();
  try {
    await action();
  } finally {
    if (lastStatus?.connected) {
      if (hadFfb) startFfbPolling();
      if (hadMonitoring && isMonitoringView(currentViewKey)) startMonitoringPolling();
    }
  }
}

function renderMainClasses(data) {
  mainClassData = data || { current: null, classes: [] };
  const select = document.getElementById("mainClassSelect");
  const applyBtn = document.getElementById("mainClassApply");
  if (!select) return;
  select.innerHTML = "";
  if (!mainClassData.classes || mainClassData.classes.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem classes";
    select.appendChild(opt);
    select.disabled = true;
    if (applyBtn) applyBtn.disabled = true;
    return;
  }
  select.disabled = false;
  if (applyBtn) applyBtn.disabled = !lastStatus?.connected;
  mainClassData.classes.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = entry.id;
    opt.textContent = entry.name;
    opt.disabled = !entry.creatable && entry.id !== mainClassData.current;
    if (entry.id === mainClassData.current) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function renderJoystickRates(data) {
  joystickRates = data || { current: null, modes: [] };
  const select = document.getElementById("joystickRateSelect");
  if (!select) return;
  select.innerHTML = "";
  if (!joystickRates.modes || joystickRates.modes.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem taxas";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  joystickRates.modes.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = entry.id;
    opt.textContent = entry.name;
    if (entry.id === joystickRates.current) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function showConfirmModal({ title, body, confirmText, confirmIcon, onConfirm }) {
  const hasBootstrap = typeof bootstrap !== "undefined" && bootstrap.Modal;
  // Remove any existing modals and backdrops
  document.querySelectorAll(".modal.fade").forEach((m) => {
    const instance = hasBootstrap ? bootstrap.Modal.getInstance(m) : null;
    if (instance) instance.hide();
    setTimeout(() => m.remove(), 300);
  });
  document.querySelectorAll(".modal-backdrop").forEach((bd) => bd.remove());
  document.body.classList.remove("modal-open");

  const modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.id = `confirm-modal-${Date.now()}`;
  modalEl.style.zIndex = "1060";
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">${title}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-primary confirm-btn">
            <i class="bi ${confirmIcon}"></i>
            ${confirmText}
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  const modal = hasBootstrap ? new bootstrap.Modal(modalEl) : null;
  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (modal) modal.hide();
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
    });
  });
  const confirmBtn = modalEl.querySelector(".confirm-btn");
  confirmBtn?.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    if (onConfirm) {
      await onConfirm();
    }
    if (modal) modal.hide();
    modalEl.classList.remove("show");
    modalEl.style.display = "none";
  });
  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });
  if (modal) modal.show();
  modalEl.classList.add("show");
  modalEl.style.display = "flex";
}

function showToolsModal() {
  const hasBootstrap = typeof bootstrap !== "undefined" && bootstrap.Modal;
  const modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.id = `tools-modal-${Date.now()}`;
  modalEl.style.zIndex = "1060";

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-tools"></i>
            Ferramentas de Flash
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="modal-section">
            <label class="section-label">Acoes</label>
            <div class="btn-grid-1">
              <button class="btn-danger tools-format" title="Formatar flash">
                <i class="bi bi-exclamation-triangle"></i>
                Formatar Flash
              </button>
              <button class="btn-outline tools-dump-save" title="Salvar dump">
                <i class="bi bi-cloud-arrow-down"></i>
                Salvar Dump
              </button>
              <button class="btn-outline tools-dump-load" title="Carregar dump">
                <i class="bi bi-cloud-arrow-up"></i>
                Carregar Dump
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  const modal = hasBootstrap ? new bootstrap.Modal(modalEl) : null;
  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (modal) modal.hide();
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
    });
  });

  modalEl.querySelector(".tools-format").addEventListener("click", async () => {
    const result = await withPollingPaused(() => window.pywebview?.api?.format_flash());
    if (result?.ok) {
      setSaveStatus("Flash formatada.");
      addSystemLog("Flash formatada");
    } else {
      setSaveStatus("Falha ao formatar flash.");
      addSystemLog("Falha ao formatar flash", "error");
    }
  });
  modalEl.querySelector(".tools-dump-save").addEventListener("click", async () => {
    const result = await withPollingPaused(() => window.pywebview?.api?.save_flash_dump());
    if (result?.ok) {
      setSaveStatus(`Dump salvo (${result.count || 0} itens).`);
      addSystemLog(`Dump salvo (${result.count || 0} itens)`);
    } else {
      setSaveStatus("Falha ao salvar dump.");
      addSystemLog("Falha ao salvar dump", "error");
    }
  });
  modalEl.querySelector(".tools-dump-load").addEventListener("click", async () => {
    const result = await withPollingPaused(() => window.pywebview?.api?.load_flash_dump());
    if (result?.ok) {
      setSaveStatus(`Dump carregado (${result.count || 0} itens).`);
      addSystemLog(`Dump carregado (${result.count || 0} itens)`);
    } else {
      setSaveStatus("Falha ao carregar dump.");
      addSystemLog("Falha ao carregar dump", "error");
    }
  });

  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });

  if (modal) modal.show();
  modalEl.classList.add("show");
  modalEl.style.display = "flex";
}


function showRenameProfileModal(currentName, onConfirm) {
  const hasBootstrap = typeof bootstrap !== "undefined" && bootstrap.Modal;
  const modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.id = `rename-profile-modal-${Date.now()}`;
  modalEl.style.zIndex = "1070";

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-pencil-square"></i>
            Renomear Perfil
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="modal-section">
            <label class="section-label">Perfil atual</label>
            <div class="profiles-active">${currentName || "--"}</div>
          </div>
          <div class="modal-divider"></div>
          <div class="modal-section">
            <label class="section-label">Novo nome</label>
            <input class="profiles-input rename-modal-input" placeholder="Novo nome..." />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-outline modal-cancel" type="button">Cancelar</button>
          <button class="btn-primary modal-confirm" type="button">
            <i class="bi bi-check2-circle"></i>
            Renomear
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  const modal = hasBootstrap ? new bootstrap.Modal(modalEl) : null;
  const input = modalEl.querySelector(".rename-modal-input");
  input?.focus();

  modalEl.querySelector(".modal-cancel").addEventListener("click", () => {
    if (modal) modal.hide();
    modalEl.classList.remove("show");
    modalEl.style.display = "none";
  });

  modalEl.querySelector(".modal-confirm").addEventListener("click", () => {
    const value = input?.value?.trim();
    if (value && onConfirm) {
      onConfirm(value);
    }
    if (modal) modal.hide();
    modalEl.classList.remove("show");
    modalEl.style.display = "none";
  });

  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (modal) modal.hide();
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
    });
  });

  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });

  if (modal) modal.show();
  modalEl.classList.add("show");
  modalEl.style.display = "flex";
}

function showProfilesModal() {
  const hasBootstrap = typeof bootstrap !== "undefined" && bootstrap.Modal;
  document.querySelectorAll(".modal.fade").forEach((m) => {
    const instance = hasBootstrap ? bootstrap.Modal.getInstance(m) : null;
    if (m.id !== "profilesModal" && instance) {
      instance.hide();
      setTimeout(() => m.remove(), 300);
    }
  });

  const modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.id = `profiles-modal-${Date.now()}`;
  modalEl.style.zIndex = "1060";

  modalEl.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-collection"></i>
            Perfis
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="profiles-layout">
            <div class="profiles-panel">
              <div class="section-label">Lista de Perfis</div>
              <div class="profiles-list"></div>
              <div class="profiles-actions-row">
                <input class="profiles-input profiles-create-name" placeholder="Novo perfil..." />
                <button class="btn-success profiles-create" title="Criar">
                  <i class="bi bi-plus-circle"></i>
                  Criar
                </button>
              </div>
            </div>

            <div class="profiles-panel">
              <div class="section-label">Perfil Ativo</div>
              <div class="profiles-active" id="profilesActiveLabel">--</div>
              <div class="btn-grid-1">
                <button class="btn-outline profiles-activate" title="Ativar">
                  <i class="bi bi-check2-circle"></i>
                  Ativar
                </button>
                <button class="btn-outline profiles-save" title="Salvar do hardware">
                  <i class="bi bi-download"></i>
                  Salvar do Hardware
                </button>
                <button class="btn-outline profiles-apply-to-board" title="Aplicar ao hardware">
                  <i class="bi bi-check2-circle"></i>
                  Aplicar ao Hardware
                </button>
                <button class="btn-danger profiles-delete" title="Excluir">
                  <i class="bi bi-trash"></i>
                  Excluir
                </button>
              </div>

              <div class="modal-divider"></div>

              <div class="section-label">Importar / Exportar</div>
              <div class="btn-grid-2">
                <button class="btn-ghost profiles-export" title="Exportar">
                  <i class="bi bi-box-arrow-up-right"></i>
                  Exportar
                </button>
                <button class="btn-ghost profiles-import" title="Importar">
                  <i class="bi bi-box-arrow-in-down"></i>
                  Importar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  const modal = hasBootstrap ? new bootstrap.Modal(modalEl) : null;
  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (modal) modal.hide();
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
    });
  });

  const listEl = modalEl.querySelector(".profiles-list");
  const activeLabel = modalEl.querySelector("#profilesActiveLabel");

  const buildList = () => {
    let profiles = profilesCache?.profiles || [];
    if (profiles.includes("Flash profile")) {
      profiles = profiles.filter((name) => name !== "None");
    }
    if (profiles.length > 0 && !profiles.includes(selectedProfile)) {
      selectedProfile = profilesCache?.current || profiles[0];
    }
    listEl.innerHTML = profiles.map((name) => {
      const active = name === selectedProfile ? "active" : "";
      const disabled = name === "None" || name === "Flash profile" ? "disabled" : "";
      return `
        <div class="profiles-item ${active}" data-name="${name}">
          <span>${name}</span>
          <button class="profiles-rename-icon ${disabled}" title="Renomear" data-name="${name}">
            <i class="bi bi-map"></i>
          </button>
        </div>
      `;
    }).join("");
    listEl.querySelectorAll(".profiles-item").forEach((item) => {
      item.addEventListener("click", () => {
        selectedProfile = item.dataset.name;
        buildList();
      });
    });
    listEl.querySelectorAll(".profiles-rename-icon").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const name = btn.dataset.name;
        if (!name || name === "None" || name === "Flash profile") return;
        showRenameProfileModal(name, async (newName) => {
          selectedProfile = name;
          await renameProfileWithName(newName);
          await loadProfiles();
          buildList();
        });
      });
    });
    activeLabel.textContent = profilesCache?.current || "None";
  };

  buildList();

  modalEl.querySelector(".profiles-create").addEventListener("click", async () => {
    const input = modalEl.querySelector(".profiles-create-name");
    const name = input.value.trim();
    if (!name) return;
    await createProfileWithName(name);
    input.value = "";
    await loadProfiles();
    buildList();
  });


  modalEl.querySelector(".profiles-activate").addEventListener("click", async () => {
    if (!selectedProfile || !window.pywebview?.api) return;
    await window.pywebview.api.select_profile(selectedProfile);
    await loadProfiles();
    buildList();
  });

  modalEl.querySelector(".profiles-save").addEventListener("click", () => saveProfile());
  modalEl.querySelector(".profiles-apply-to-board").addEventListener("click", () => applyProfile());
  modalEl.querySelector(".profiles-delete").addEventListener("click", () => deleteProfile());
  modalEl.querySelector(".profiles-export").addEventListener("click", () => exportProfile());
  modalEl.querySelector(".profiles-import").addEventListener("click", () => importProfile());

  modalEl.querySelector(".modal-close-btn").addEventListener("click", () => {
    if (modal) modal.hide();
    modalEl.classList.remove("show");
    modalEl.style.display = "none";
  });
  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });

  if (modal) modal.show();
  modalEl.classList.add("show");
  modalEl.style.display = "flex";
}

function showFirmwareModal() {
  const hasBootstrap = typeof bootstrap !== "undefined" && bootstrap.Modal;
  const modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.id = `firmware-modal-${Date.now()}`;
  modalEl.style.zIndex = "1060";

  modalEl.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-usb-plug"></i>
            Firmware Update
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="firmware-layout">
            <div class="firmware-panel">
              <div class="section-label">Controle</div>
              <div class="firmware-status">DFU: <span class="firmware-dfu-state">Procurando...</span></div>
              <div class="firmware-file">Arquivo: <span class="firmware-file-name">--</span></div>
              <label class="firmware-option">
                <input type="checkbox" class="firmware-mass-erase" />
                Full erase (apaga tudo)
              </label>
              <div class="btn-grid-1">
                <button class="btn-outline firmware-enter">
                  <i class="bi bi-arrow-repeat"></i>
                  Entrar em DFU
                </button>
                <button class="btn-outline firmware-select">
                  <i class="bi bi-folder2-open"></i>
                  Selecionar arquivo
                </button>
                <button class="btn-primary firmware-upload">
                  <i class="bi bi-upload"></i>
                  Enviar firmware
                </button>
                <button class="btn-danger firmware-erase">
                  <i class="bi bi-exclamation-triangle"></i>
                  Full erase
                </button>
              </div>
            </div>
            <div class="firmware-panel">
              <div class="section-label">Progresso</div>
              <div class="firmware-progress">
                <div class="firmware-progress-bar"></div>
              </div>
              <div class="firmware-progress-text">0%</div>
              <div class="section-label" style="margin-top: 10px;">Logs</div>
              <div class="firmware-log"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  const modal = hasBootstrap ? new bootstrap.Modal(modalEl) : null;

  const fileNameEl = modalEl.querySelector(".firmware-file-name");
  const dfuStateEl = modalEl.querySelector(".firmware-dfu-state");
  const logEl = modalEl.querySelector(".firmware-log");
  const progressBar = modalEl.querySelector(".firmware-progress-bar");
  const progressText = modalEl.querySelector(".firmware-progress-text");
  const massErase = modalEl.querySelector(".firmware-mass-erase");
  const enterBtn = modalEl.querySelector(".firmware-enter");
  const selectBtn = modalEl.querySelector(".firmware-select");
  const uploadBtn = modalEl.querySelector(".firmware-upload");
  const eraseBtn = modalEl.querySelector(".firmware-erase");
  if (selectBtn) selectBtn.disabled = true;
  if (uploadBtn) uploadBtn.disabled = true;
  if (eraseBtn) eraseBtn.disabled = true;

  const renderStatus = (data) => {
    if (!data) return;
    const dfuCount = Number(data.dfu_count || 0);
    const dfuOk = data.dfu_ok !== false;
    if (dfuStateEl) {
      if (!dfuOk && data.dfu_error) {
        dfuStateEl.textContent = "Erro DFU";
      } else if (dfuCount === 0) {
        dfuStateEl.textContent = "Nenhum dispositivo";
      } else if (dfuCount === 1) {
        dfuStateEl.textContent = "Dispositivo OK";
      } else {
        dfuStateEl.textContent = `Multiplos (${dfuCount})`;
      }
    }
    fileNameEl.textContent = data.selected || "--";
    const progress = Math.max(0, Math.min(100, data.progress || 0));
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
    const logs = data.log || [];
    logEl.innerHTML = logs.map((line) => `<div class="log-line log-info">${line}</div>`).join("");

    const hasDevice = dfuCount >= 1 && dfuOk;
    if (selectBtn) selectBtn.disabled = !hasDevice;
    if (uploadBtn) uploadBtn.disabled = !hasDevice || !data.selected || data.busy;
    if (eraseBtn) eraseBtn.disabled = !hasDevice || data.busy;
    if (enterBtn) enterBtn.disabled = !lastStatus?.connected || data.busy;
  };

  const refreshStatus = async () => {
    if (!window.pywebview?.api) return;
    const data = await window.pywebview.api.dfu_status();
    renderStatus(data);
  };

  modalEl.querySelector(".firmware-enter").addEventListener("click", async () => {
    await window.pywebview?.api?.dfu_enter();
    await refreshStatus();
  });

  modalEl.querySelector(".firmware-select").addEventListener("click", async () => {
    await window.pywebview?.api?.dfu_select_file();
    await refreshStatus();
  });

  modalEl.querySelector(".firmware-upload").addEventListener("click", async () => {
    const useErase = Boolean(massErase?.checked);
    await window.pywebview?.api?.dfu_upload(useErase);
    await refreshStatus();
  });

  modalEl.querySelector(".firmware-erase").addEventListener("click", async () => {
    await window.pywebview?.api?.dfu_mass_erase();
    await refreshStatus();
  });

  let statusTimer = setInterval(refreshStatus, 1200);

  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => {
      clearInterval(statusTimer);
      if (modal) modal.hide();
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
    });
  });

  modalEl.addEventListener("hidden.bs.modal", () => {
    clearInterval(statusTimer);
    modalEl.remove();
  });

  refreshStatus();

  if (modal) modal.show();
  modalEl.classList.add("show");
  modalEl.style.display = "flex";
}

function showTerminalModal() {
  const hasBootstrap = typeof bootstrap !== "undefined" && bootstrap.Modal;
  const modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.id = `terminal-modal-${Date.now()}`;
  modalEl.style.zIndex = "1060";

  modalEl.innerHTML = `
    <div class="modal-dialog modal-fullscreen-sm-down">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-terminal"></i>
            Console Serial
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="terminal-output" id="terminalOutput"></div>
          <div class="terminal-input-group">
            <input type="text" class="terminal-input" placeholder="Digite comando..." autocomplete="off">
            <button class="btn-primary-sm terminal-send" title="Enviar">
              <i class="bi bi-send"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  const modal = hasBootstrap ? new bootstrap.Modal(modalEl) : null;
  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (modal) modal.hide();
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
    });
  });
  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => modal && modal.hide());
  });
  modalEl.querySelector(".btn-close")?.addEventListener("click", () => modal && modal.hide());

  // Atualizar display
  const output = modalEl.querySelector(".terminal-output");
  output.innerHTML = terminalLog.map((entry) => {
    const color = entry.isError ? "color: #ff7b7b;" : "color: #53ffba;";
    return `<div style="${color}">[${entry.timestamp}] ${entry.message}</div>`;
  }).join("");
  output.scrollTop = output.scrollHeight;

  const input = modalEl.querySelector(".terminal-input");
  const sendBtn = modalEl.querySelector(".terminal-send");

  sendBtn.addEventListener("click", async () => {
    if (!input.value) return;
    const cmd = input.value;
    addTerminalLog(`> ${cmd}`);
    input.value = "";
    output.innerHTML = terminalLog.map((entry) => {
      const color = entry.isError ? "color: #ff7b7b;" : "color: #53ffba;";
      return `<div style="${color}">[${entry.timestamp}] ${entry.message}</div>`;
    }).join("");
    output.scrollTop = output.scrollHeight;
    if (window.pywebview?.api) {
      try {
        const result = await window.pywebview.api.send_serial_command(cmd);
        if (result) {
          addTerminalLog(result);
          output.innerHTML = terminalLog.map((entry) => {
            const color = entry.isError ? "color: #ff7b7b;" : "color: #53ffba;";
            return `<div style="${color}">[${entry.timestamp}] ${entry.message}</div>`;
          }).join("");
          output.scrollTop = output.scrollHeight;
        }
      } catch (err) {
        addTerminalLog(`Erro: ${err.message}`, true);
      }
    }
  });

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendBtn.click();
  });

  modalEl.querySelector(".modal-close-btn").addEventListener("click", () => {
    if (modal) modal.hide();
    modalEl.classList.remove("show");
    modalEl.style.display = "none";
  });
  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });

  if (modal) modal.show();
  modalEl.classList.add("show");
  modalEl.style.display = "flex";
}

function showErrorsModal() {
  const hasBootstrap = typeof bootstrap !== "undefined" && bootstrap.Modal;
  const modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.id = `errors-modal-${Date.now()}`;
  modalEl.style.zIndex = "1060";

  modalEl.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-exclamation-circle"></i>
            Logs e Erros
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="tab-buttons">
            <button class="tab-btn active" data-tab="logs">Logs</button>
            <button class="tab-btn" data-tab="errors">Erros</button>
          </div>
          <div class="tab-actions">
            <button class="btn-outline tab-refresh" title="Atualizar">
              <i class="bi bi-arrow-clockwise"></i>
              Refresh
            </button>
            <button class="btn-outline tab-clear-logs" title="Limpar logs">
              <i class="bi bi-journal-x"></i>
              Limpar Logs
            </button>
            <button class="btn-outline tab-clear-errors" title="Limpar erros">
              <i class="bi bi-trash"></i>
              Limpar Erros
            </button>
          </div>
          <div class="tab-panel active" data-tab-panel="logs">
            <div class="logs-list"></div>
          </div>
          <div class="tab-panel" data-tab-panel="errors">
            <div class="errors-table">
              <div class="errors-row errors-header">
                <div>Code</div>
                <div>Level</div>
                <div>Info</div>
              </div>
              <div class="errors-body"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  const modal = hasBootstrap ? new bootstrap.Modal(modalEl) : null;
  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (modal) modal.hide();
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
    });
  });

  const tabs = modalEl.querySelectorAll(".tab-btn");
  const panels = modalEl.querySelectorAll(".tab-panel");
  const logsList = modalEl.querySelector(".logs-list");
  const errorsBody = modalEl.querySelector(".errors-body");

  const renderLogs = () => {
    logsList.innerHTML = terminalLog.map((entry) => {
      const color = entry.isError ? "log-error" : "log-info";
      return `<div class="log-line ${color}">[${entry.timestamp}] ${entry.message}</div>`;
    }).join("");
  };

  const renderErrors = () => {
    errorsBody.innerHTML = errorsList.map((err) => {
      const levelClass = String(err.level || "").toLowerCase();
      return `
        <div class="errors-row ${levelClass}">
          <div>${err.code || "--"}</div>
          <div>${err.level || "--"}</div>
          <div>${err.info || "--"}</div>
        </div>
      `;
    }).join("");
  };

  const refreshErrors = async () => {
    if (!window.pywebview?.api) return;
    const data = await window.pywebview.api.get_errors();
    if (data?.ok) {
      errorsList = data.errors || [];
    }
    renderErrors();
  };

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      panels.forEach((p) => {
        p.classList.toggle("active", p.dataset.tabPanel === tab);
      });
    });
  });

  modalEl.querySelector(".tab-refresh").addEventListener("click", async () => {
    await refreshErrors();
    renderLogs();
  });

  modalEl.querySelector(".tab-clear-logs").addEventListener("click", () => {
    terminalLog = [];
    renderLogs();
  });

  modalEl.querySelector(".tab-clear-errors").addEventListener("click", async () => {
    if (window.pywebview?.api) {
      await window.pywebview.api.clear_errors();
    }
    errorsList = [];
    renderErrors();
  });

  renderLogs();
  refreshErrors();

  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });

  if (modal) modal.show();
  modalEl.classList.add("show");
  modalEl.style.display = "flex";
}

async function loadPorts() {
  if (!window.pywebview?.api) {
    renderPorts([]);
    return;
  }
  const ports = await window.pywebview.api.list_ports();
  if (!selectedPort && ports.length > 0) {
    const preferred = ports.find((p) => p.supported) || ports[0];
    selectedPort = preferred.device;
  }
  renderPorts(ports);
  if (!autoConnectAttempted && !lastStatus?.connected) {
    const supported = ports.filter((p) => p.supported);
    if (supported.length === 1) {
      selectedPort = supported[0].device;
      autoConnectAttempted = true;
      await connectSelected();
    }
  }
}

async function loadProfiles() {
  if (!window.pywebview?.api) {
    renderProfiles({ profiles: ["None"], current: "None" });
    return;
  }
  const profiles = await window.pywebview.api.get_profiles();
  renderProfiles(profiles);
}

async function loadStatus() {
  if (!window.pywebview?.api) return;
  const status = await window.pywebview.api.get_status();
  updateStatus(status);
}

async function loadCatalog() {
  if (!window.pywebview?.api) {
    classCatalog = [];
    return;
  }
  const schema = await window.pywebview.api.get_ui_schema();
  classCatalog = schema?.classes || [];
}

async function loadAdjacentConfigs() {
  if (!window.pywebview?.api) {
    adjacentConfigs = [];
    renderCalibrationTree();
    return;
  }
  adjacentConfigs = await window.pywebview.api.get_adjacent_configs();
  ensureAdjacentViews();
  renderCalibrationTree();
}

async function loadClassDefinitions() {
  if (!window.pywebview?.api || !lastStatus?.connected) {
    classDefinitions = {
      driver: { current: null, classes: [] },
      encoder: { current: null, classes: [] },
      shifter: { current: null, modes: [] },
    };
    renderClasses();
    return;
  }
  const data = await window.pywebview.api.get_class_definitions();
  classDefinitions = {
    driver: data?.driver || { current: null, classes: [] },
    encoder: data?.encoder || { current: null, classes: [] },
    shifter: data?.shifter || { current: null, modes: [] },
  };
  renderClasses();
  renderCalibrationTree();
}

async function loadActiveClasses() {
  activeClassIds = new Set();
  activeClasses = [];
  if (!window.pywebview?.api || !lastStatus?.connected) {
    renderClasses();
    renderCalibrationTree();
    return;
  }
  const active = await window.pywebview.api.get_active_classes();
  if (active && active.length) {
    activeClasses = active;
    active.forEach((entry) => activeClassIds.add(entry.id));
  }
  renderClasses();
  renderCalibrationTree();
  updateMonitoringLock(lastStatus?.connected);
}

async function loadMainClasses() {
  if (!window.pywebview?.api) return;
  const data = await window.pywebview.api.get_main_classes();
  renderMainClasses(data);
}

async function loadJoystickRates() {
  if (!window.pywebview?.api || !lastStatus?.connected) {
    renderJoystickRates({ current: null, modes: [] });
    return;
  }
  const data = await window.pywebview.api.get_joystick_rates();
  renderJoystickRates(data);
}

async function connectSelected() {
  if (!selectedPort || !window.pywebview?.api) return;
  const result = await window.pywebview.api.connect(selectedPort);
  updateStatus(result.status);
  if (!result?.ok) {
    setSaveStatus("Falha ao conectar.");
    return;
  }
  await loadCatalog();
  await loadAdjacentConfigs();
  await loadProfiles();
  await loadClassDefinitions();
  await loadActiveClasses();
  await loadMainClasses();
  await loadJoystickRates();
}

async function disconnectCurrent() {
  if (!window.pywebview?.api) return;
  const result = await window.pywebview.api.disconnect();
  updateStatus(result.status);
  activeClassIds = new Set();
  activeClasses = [];
  classDefinitions = {
    driver: { current: null, classes: [] },
    encoder: { current: null, classes: [] },
    shifter: { current: null, modes: [] },
  };
  setActiveView("dashboard", "Painel");
  activateTreeItemByView("dashboard");
  renderClasses();
  renderCalibrationTree();
  renderMainClasses({ current: null, classes: [] });
  renderJoystickRates({ current: null, modes: [] });
}

async function applyMainSettings() {
  if (!window.pywebview?.api || !lastStatus?.connected) return;
  const selectClass = document.getElementById("mainClassSelect");
  const selectRate = document.getElementById("joystickRateSelect");
  const classId = selectClass ? parseInt(selectClass.value, 10) : NaN;
  const rateId = selectRate ? parseInt(selectRate.value, 10) : NaN;
  await withPollingPaused(async () => {
    if (!Number.isNaN(rateId)) {
      await window.pywebview.api.set_joystick_rate(rateId);
    }
    if (!Number.isNaN(classId) && classId !== mainClassData.current) {
      await window.pywebview.api.set_main_class(classId);
    }
  });
  await loadJoystickRates();
  await loadMainClasses();
}

async function saveProfile() {
  if (!window.pywebview?.api || !selectedProfile) return;
  await window.pywebview.api.save_profile_from_board(selectedProfile);
  setSaveStatus(`Perfil "${selectedProfile}" salvo do hardware.`);
  addSystemLog(`Perfil salvo do hardware: ${selectedProfile}`);
}

async function applyProfile() {
  if (!window.pywebview?.api || !selectedProfile) return;
  await window.pywebview.api.apply_profile_to_board(selectedProfile);
  setSaveStatus(`Perfil "${selectedProfile}" aplicado.`);
  addSystemLog(`Perfil aplicado: ${selectedProfile}`);
}

async function saveToFlash() {
  if (!window.pywebview?.api || !lastStatus?.connected) {
    setSaveStatus("Falha ao salvar na Flash.");
    addSystemLog("Falha ao salvar na flash: nao conectado.", "error");
    return;
  }
  const result = await withPollingPaused(() => window.pywebview.api.save_to_flash());
  if (result?.ok) {
    setSaveStatus("Configuracao salva na Flash.");
    addSystemLog("Save to flash concluido.");
  } else {
    setSaveStatus("Falha ao salvar na Flash.");
    addSystemLog("Falha ao salvar na flash.", "error");
  }
}

async function createProfile() {
  const name = window.prompt("Nome do novo perfil:");
  if (!name) return;
  await createProfileWithName(name);
}

async function createProfileWithName(name) {
  if (!name || !window.pywebview?.api) return;
  const result = await window.pywebview.api.create_profile(name);
  selectedProfile = name;
  renderProfiles({ profiles: result.profiles, current: name });
  addSystemLog(`Perfil criado: ${name}`);
}

async function renameProfile() {
  if (!selectedProfile || selectedProfile === "None") return;
  const name = window.prompt("Novo nome do perfil:", selectedProfile);
  if (!name) return;
  await renameProfileWithName(name);
}

async function renameProfileWithName(name) {
  if (!selectedProfile || !name || !window.pywebview?.api) return;
  const result = await window.pywebview.api.rename_profile(selectedProfile, name);
  selectedProfile = name;
  renderProfiles({ profiles: result.profiles, current: name });
  addSystemLog(`Perfil renomeado para: ${name}`);
}

async function deleteProfile() {
  if (!selectedProfile || selectedProfile === "None") return;
  const ok = window.confirm(`Excluir o perfil "${selectedProfile}"?`);
  if (!ok || !window.pywebview?.api) return;
  const result = await window.pywebview.api.delete_profile(selectedProfile);
  selectedProfile = "None";
  renderProfiles({ profiles: result.profiles, current: "None" });
  addSystemLog("Perfil excluido");
}

async function exportProfile() {
  if (!window.pywebview?.api || !selectedProfile || selectedProfile === "None") return;
  await window.pywebview.api.export_profile(selectedProfile);
}

async function importProfile() {
  if (!window.pywebview?.api) return;
  const result = await window.pywebview.api.import_profile();
  if (result?.profiles) {
    if (result.name) {
      selectedProfile = result.name;
    }
    renderProfiles({ profiles: result.profiles, current: result.current });
  }
}

async function applyClassDefinitions() {
  if (!window.pywebview?.api || !lastStatus?.connected) return;
  const payload = {
    driver: classDefinitions?.driver?.current ?? null,
    encoder: classDefinitions?.encoder?.current ?? null,
    shifter: classDefinitions?.shifter?.current ?? null,
  };
  const result = await withPollingPaused(() => window.pywebview.api.apply_class_definitions(payload));
  if (result?.ok) {
    setSaveStatus("Definicoes de classes enviadas.");
    await loadClassDefinitions();
    await loadActiveClasses();
    return;
  }
  setSaveStatus("Falha ao enviar definicoes de classes.");
}

function addTerminalLog(message, isError = false) {
  const timestamp = new Date().toLocaleTimeString();
  terminalLog.push({ message, timestamp, isError });
  updateTerminalDisplay();
}

function updateTerminalDisplay() {
  const output = document.getElementById("terminalOutput") || document.querySelector(".terminal-output");
  if (!output) return;
  output.innerHTML = terminalLog.map((entry) => {
    const color = entry.isError ? "color: #ff7b7b;" : "color: #53ffba;";
    return `<div style="${color}">[${entry.timestamp}] ${entry.message}</div>`;
  }).join("");
  output.scrollTop = output.scrollHeight;
}

function addError(title, message, level = "error") {
  const timestamp = new Date().toLocaleTimeString();
  errorsList.push({ code: title, level, info: message, timestamp });
  updateErrorsDisplay();
}

function updateErrorsDisplay() {
  const list = document.getElementById("errorsList");
  if (!list) return;
  list.innerHTML = errorsList.map((error) => `
    <div class="error-item ${error.level}">
      <div class="error-item-title">${error.code || "UI"}</div>
      <div class="error-item-message">${error.info || ""}</div>
      <div class="error-item-time">${error.timestamp || ""}</div>
    </div>
  `).join("");
}

function openProfilesModal() {
  if (typeof bootstrap === "undefined" || !bootstrap.Modal) {
    showProfilesModal();
    return;
  }
  const modal = new bootstrap.Modal(document.getElementById("profilesModal"));
  modal.show();
}

async function refreshAll() {
  // Show loading indicator
  const statusEl = document.getElementById("saveStatus");
  const originalText = statusEl?.textContent;
  setSaveStatus("Carregando... 1");
  
  try {
    await loadPorts();
    setSaveStatus("Carregando... 2");
    await loadProfiles();
    setSaveStatus("Carregando... 3");
    await loadStatus();
    setSaveStatus("Carregando... 4");
    await loadCatalog();
    setSaveStatus("Carregando... 5");
    await loadAdjacentConfigs();
    await loadClassDefinitions();
    setSaveStatus("Carregando... 6");
    await loadActiveClasses();
    setSaveStatus("Carregando... 7");
    await loadMainClasses();
    await loadJoystickRates();
    setSaveStatus("Pronto");
  } catch (err) {
    setSaveStatus("Erro ao carregar");
    addError("Erro ao Carregar", err.message, "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await refreshAll();
  window.DswMonitoring?.init?.();
  updateMonitoringLock(false);
  stopFfbPolling();

  const footerDiscord = document.getElementById("footerDiscord");
  const footerSite = document.getElementById("footerSite");
  const footerAbout = document.getElementById("footerAbout");

  if (footerDiscord) {
    if (SOCIAL_LINKS.discord) {
      footerDiscord.addEventListener("click", () => window.open(SOCIAL_LINKS.discord, "_blank", "noopener"));
    } else {
      footerDiscord.classList.add("disabled");
    }
  }

  if (footerSite) {
    if (SOCIAL_LINKS.site) {
      footerSite.addEventListener("click", () => window.open(SOCIAL_LINKS.site, "_blank", "noopener"));
    } else {
      footerSite.classList.add("disabled");
    }
  }

  footerAbout?.addEventListener("click", showAboutModal);

  bindTreeHandlers();

  // Connection and port management
  document.getElementById("refreshPorts")?.addEventListener("click", loadPorts);
  document.getElementById("connectBtn")?.addEventListener("click", connectSelected);
  document.getElementById("disconnectBtn")?.addEventListener("click", disconnectCurrent);

  // Profile modal
  document.getElementById("openProfilesBtn")?.addEventListener("click", showProfilesModal);

  // Terminal and Errors modals
  document.getElementById("openTerminalBtn")?.addEventListener("click", showTerminalModal);

  document.getElementById("openErrorsBtn")?.addEventListener("click", showErrorsModal);
  document.getElementById("openFirmwareBtn")?.addEventListener("click", showFirmwareModal);

  document.getElementById("sendClassDefs")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showConfirmModal({
      title: "Enviar definicao de classes",
      body: "Deseja enviar as definicoes selecionadas para o hardware?",
      confirmText: "Enviar",
      confirmIcon: "bi-send",
      onConfirm: async () => {
        await applyClassDefinitions();
      },
    });
  });

  // Hardware actions from footer
  document.getElementById("sidebarSaveFlash")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    saveToFlash();
  });

  document.getElementById("sidebarReboot")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showConfirmModal({
      title: "Reiniciar dispositivo",
      body: "Deseja reiniciar o hardware agora?",
      confirmText: "Reiniciar",
      confirmIcon: "bi-arrow-clockwise",
      onConfirm: async () => {
        await withPollingPaused(() => window.pywebview?.api?.reboot());
      },
    });
  });

  document.getElementById("sidebarFormat")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showToolsModal();
  });

  document.getElementById("rebootBtn")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showConfirmModal({
      title: "Reiniciar dispositivo",
      body: "Deseja reiniciar o hardware agora?",
      confirmText: "Reiniciar",
      confirmIcon: "bi-arrow-clockwise",
      onConfirm: async () => {
        await withPollingPaused(() => window.pywebview?.api?.reboot());
      },
    });
  });

  document.getElementById("formatBtn")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showToolsModal();
  });

  document.getElementById("mainClassApply")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showConfirmModal({
      title: "Alterar main class",
      body: "Aplicar main class e joystick rate? Alterar a main class reinicia o hardware.",
      confirmText: "Aplicar",
      confirmIcon: "bi-check2-circle",
      onConfirm: async () => {
        await applyMainSettings();
      },
    });
  });
});

function showAboutModal() {
  const hasBootstrap = typeof bootstrap !== "undefined" && bootstrap.Modal;
  const modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.id = `about-modal-${Date.now()}`;
  modalEl.style.zIndex = "1060";

  const credits = ABOUT_INFO.credits.map((item) => `<li>${item}</li>`).join("");
  const discordLink = SOCIAL_LINKS.discord
    ? `<a href="${SOCIAL_LINKS.discord}" target="_blank" rel="noopener">Discord</a>`
    : `<span>Discord (nao configurado)</span>`;
  const siteLink = SOCIAL_LINKS.site
    ? `<a href="${SOCIAL_LINKS.site}" target="_blank" rel="noopener">Site</a>`
    : `<span>Site (nao configurado)</span>`;
  const openffLink = ABOUT_INFO.openffboard
    ? `<a href="${ABOUT_INFO.openffboard}" target="_blank" rel="noopener">OpenFFBoard</a>`
    : `<span>OpenFFBoard (nao configurado)</span>`;

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-info-circle"></i>
            About
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="modal-section">
            <div class="section-label">Base</div>
            <div>${ABOUT_INFO.base}</div>
          </div>
          <div class="modal-divider"></div>
          <div class="modal-section">
            <div class="section-label">Creditos</div>
            <ul class="about-list">${credits}</ul>
          </div>
          <div class="modal-divider"></div>
          <div class="modal-section">
            <div class="section-label">Links</div>
            <div class="about-links">
              ${discordLink}
              ${siteLink}
              <div>Fork do ${openffLink}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  const modal = hasBootstrap ? new bootstrap.Modal(modalEl) : null;
  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (modal) modal.hide();
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
    });
  });
  modalEl.querySelector(".modal-close-btn")?.addEventListener("click", () => modal && modal.hide());
  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });

  if (modal) modal.show();
  modalEl.classList.add("show");
  modalEl.style.display = "flex";
}
