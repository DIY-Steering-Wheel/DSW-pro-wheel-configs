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
let appliedClassDefinitions = {
  driver: { current: null, classes: [] },
  encoder: { current: null, classes: [] },
  shifter: { current: null, modes: [] },
};
let ioDefinitions = {
  ain: { id: null, name: "AIN-Pins", active: false, available: false, bitmask: 0 },
  din: { id: null, name: "D-Pins", active: false, available: false, bitmask: 0 },
};
let joystickRates = { current: null, modes: [] };
let lastStatus = null;
let terminalLog = [];
let errorsList = [];
let profilesCache = { profiles: [], current: "None" };
let autoConnectAttempted = false;
let connectionCheckTimer = null;
let reconnectAttempts = 0;
let healthFailCount = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_HEALTH_FAIL = 5;
const CONNECTION_CHECK_INTERVAL = 8000;

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

function addSaveFooter(message) {
  setSaveStatus(message);
  addSystemLog(message);
}

function reportConfigResult(actionLabel, result) {
  if (result && typeof result === "object") {
    if (result.ok === false) {
      const detail = result.error ? `: ${result.error}` : "";
      setSaveStatus(`${actionLabel} com erros`);
      addSystemLog(`${actionLabel} com erros${detail}`, "error");
      return false;
    }
    if (Array.isArray(result.errors) && result.errors.length > 0) {
      setSaveStatus(`${actionLabel} com erros`);
      addSystemLog(`${actionLabel} com erros: ${result.errors.join(", ")}`, "error");
      return false;
    }
  }
  addSaveFooter(actionLabel);
  return true;
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
  if (!container) {
    console.warn("[DSW] ensureAdjacentViews: #adjacentViews container not found");
    return;
  }
  adjacentConfigs.forEach((cfg) => {
    const viewId = `view-adjacent-${cfg.id}`;
    if (document.getElementById(viewId)) {
      return;
    }
    const section = document.createElement("section");
    section.id = viewId;
    section.className = "view-panel";
    section.dataset.view = `adjacent:${cfg.id}`;
    // Lazy-load: store URL in data-src, load iframe only when user opens the view
    section.innerHTML = `
      <div class="analysis-card">
        <div class="card-body">
          <iframe class="adjacent-frame" data-src="${cfg.view}" title="${cfg.title}"></iframe>
        </div>
      </div>
    `;
    container.appendChild(section);
    console.log("[DSW] ensureAdjacentViews: created panel (lazy):", viewId);
  });
}

function isConfigVisible(cfg) {
  if (!cfg) return false;
  
  // If requires_active is false, always show
  if (cfg.requires_active === false) return true;
  
  // Must be connected to show any active-dependent config
  if (!lastStatus?.connected) return false;

  let visible = false;
  
  // Strategy 1: Check definition_key (driver, encoder, shifter)
  if (cfg.definition_key) {
    const def = appliedClassDefinitions?.[cfg.definition_key];
    if (def && def.current !== null && def.current !== undefined) {
      // For shifter: current > 0 means active
      if (cfg.definition_key === "shifter") {
        visible = Number(def.current) > 0;
      } else {
        // For driver/encoder: has a current selection
        if (Array.isArray(cfg.definition_match) && cfg.definition_match.length > 0) {
          // Check if current matches a definition_match pattern
          const currentId = def.current;
          const idMatches = cfg.definition_match.some(
            (needle) => String(needle).toLowerCase() === String(currentId).toLowerCase()
          );
          if (idMatches) {
            visible = true;
          } else {
            // Check by name
            const current = (def.classes || []).find((entry) => entry.id === currentId);
            if (current) {
              const name = String(current.name || "").toLowerCase();
              visible = cfg.definition_match.some((needle) => name.includes(String(needle).toLowerCase()));
            }
          }
        }
      }
    }
    if (visible) return true;
  }
  
  // Strategy 2: Check clsname_match against active classes
  const clsnameMatches = Array.isArray(cfg.clsname_match)
    ? cfg.clsname_match
    : cfg.clsname_match
      ? [cfg.clsname_match]
      : [];
  
  if (clsnameMatches.length > 0) {
    const hasActiveMatch = activeClasses.some((entry) => {
      const clsname = String(entry.clsname || entry.name || "").toLowerCase();
      return clsnameMatches.some((needle) => {
        const n = String(needle).toLowerCase();
        // Exact match or word-boundary match (avoid "ain" matching "main")
        return clsname === n || clsname.startsWith(n) || new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(clsname);
      });
    });
    if (hasActiveMatch) return true;
  }
  
  // Strategy 3: Check class_id in active class IDs
  if (cfg.class_id !== null && cfg.class_id !== undefined) {
    return activeClassIds.has(Number(cfg.class_id));
  }
  
  return false;
}

function renderCalibrationTree() {
  const container = document.getElementById("adjacentTree");
  if (!container) return;
  container.innerHTML = "";
  
  // Ensure view panels exist for all adjacent configs
  ensureAdjacentViews();
  
  // Only show configs that are truly visible based on active classes and definitions
  const visible = adjacentConfigs.filter(isConfigVisible);
  console.log("[DSW] renderCalibrationTree:", adjacentConfigs.length, "total,", visible.length, "visible, connected:", lastStatus?.connected, "activeClasses:", activeClasses.length);
  adjacentConfigs.forEach((cfg) => {
    console.log("[DSW]   cfg:", cfg.id, "show_when_connected:", cfg.show_when_connected, "requires_active:", cfg.requires_active, "visible:", isConfigVisible(cfg), "clsname_match:", JSON.stringify(cfg.clsname_match));
  });
  
  if (visible.length === 0) {
    return;
  }

  visible.forEach((cfg) => {
    const item = document.createElement("div");
    item.className = "tree-item";
    // Preserve active state if this view was already selected
    if (currentViewKey === `adjacent:${cfg.id}`) {
      item.classList.add("active");
    }
    item.setAttribute("data-view", `adjacent:${cfg.id}`);
    item.setAttribute("data-title", cfg.title);
    item.innerHTML = `
      <i class="bi ${cfg.icon || "bi-sliders"}"></i>
      <span>${cfg.title}</span>
    `;
    container.appendChild(item);
  });
  bindTreeHandlers();
  
  // If current view is an adjacent config that is no longer visible, go back to dashboard
  if (currentViewKey && currentViewKey.startsWith("adjacent:")) {
    const cfgId = currentViewKey.slice("adjacent:".length);
    const stillVisible = visible.some((c) => c.id === cfgId);
    if (!stillVisible) {
      setActiveView("dashboard", "Painel");
      activateTreeItemByView("dashboard");
    }
  }
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
      console.log("[DSW] tree click:", viewKey, title);
      if (isMonitoringView(viewKey)) {
        requestOpenMonitoring(viewKey, title);
        return;
      }
      setActiveView(viewKey, title);
      activateTreeItemByView(viewKey);
    });
  });
}

/**
 * Notify all adjacent-config iframes whether they are visible or hidden.
 * Visible iframes receive {type:'configVisibility', visible:true} and
 * may resume polling; hidden ones receive visible:false and should pause.
 */
function notifyIframeVisibility(activeViewKey) {
  document.querySelectorAll("[id^='view-adjacent-']").forEach((panel) => {
    const iframe = panel.querySelector("iframe.adjacent-frame");
    if (!iframe?.contentWindow) return;
    const panelId = panel.id; // e.g. "view-adjacent-ain"
    const configId = panelId.replace("view-adjacent-", "");
    const isActive = activeViewKey === `adjacent:${configId}`;
    iframe.contentWindow.postMessage({ type: "configVisibility", visible: isActive }, "*");
  });
}

function setActiveView(viewKey, title) {
  console.log(`[setActiveView] Chamado com viewKey: ${viewKey}`);
  console.log(`[setActiveView] headerControls existe?`, typeof headerControls !== 'undefined');
  
  const isAdjacent = String(viewKey).startsWith("adjacent:");
  console.log(`[setActiveView] isAdjacent: ${isAdjacent}`);
  document.body?.classList.toggle("adjacent-active", isAdjacent);
  currentViewKey = viewKey || "dashboard";
  if (!isMonitoringView(viewKey)) {
    stopMonitoringPolling();
  }
  // Pause FFB polling when viewing adjacent config iframes to free serial bus
  const isAdjacentView = viewKey && viewKey.startsWith("adjacent:");
  if (isAdjacentView) {
    stopFfbPolling();
    // Mostrar botões Aplicar/Atualizar no header para esta configuração
    const configId = viewKey.replace("adjacent:", "");
    const config = adjacentConfigs.find(c => c.id === configId);
    console.log(`[setActiveView] Adjacent view: ${viewKey}, configId: ${configId}, config found: ${!!config}`);
    
    if (config && typeof headerControls !== 'undefined') {
      console.log(`[setActiveView] Mostrando botões para: ${config.title}`);
      headerControls.showActionsFor(configId, config.title);
      // Tenta carregar assim que abrir a configuração
      const loadIframe = document.querySelector(`[id="view-adjacent-${configId}"] iframe.adjacent-frame`);
      const tryLoadConfig = () => {
        if (!loadIframe?.contentWindow?.loadConfig) return;
        Promise.resolve(loadIframe.contentWindow.loadConfig())
          .then((result) => reportConfigResult("Tela carregada", result))
          .catch((err) => {
            console.error("[setActiveView] Erro ao carregar:", err);
            setSaveStatus("Tela carregada com erros.");
            addSystemLog(`Tela carregada com erros: ${err?.message || err}`, "error");
          });
      };
      if (loadIframe?.contentWindow?.loadConfig) {
        tryLoadConfig();
      } else if (loadIframe) {
        loadIframe.addEventListener("load", tryLoadConfig, { once: true });
      }

      
      // Definir callbacks para esta configuração
      headerControls.onApply(() => {
        console.log(`[setActiveView] onApply chamado para: ${configId}`);
        addSaveFooter("Aplicando configuracao...");
        // Chamar apply na iframe da configuração
        const iframe = document.querySelector(`[id="view-adjacent-${configId}"] iframe.adjacent-frame`);
        console.log(`[setActiveView] iframe encontrada?`, !!iframe);
        if (iframe?.contentWindow?.applyConfig) {
          console.log(`[setActiveView] Chamando applyConfig...`);
          return Promise.resolve(iframe.contentWindow.applyConfig())
            .then((result) => reportConfigResult("Configuracao aplicada", result))
            .catch((err) => {
              console.error("[setActiveView] Erro ao aplicar:", err);
              setSaveStatus("Falha ao aplicar configuracao.");
              addSystemLog(`Falha ao aplicar configuracao: ${err?.message || err}`, "error");
            });
        } else {
          console.log(`[setActiveView] applyConfig não encontrada na iframe`);
          setSaveStatus("Falha ao aplicar: interface nao disponivel.");
          addSystemLog("Falha ao aplicar configuracao: interface nao disponivel.", "error");
        }
      });
      
      headerControls.onRefresh(() => {
        console.log(`[setActiveView] onRefresh chamado para: ${configId}`);
        addSaveFooter("Recarregando configuracao...");
        // Chamar refresh na iframe da configuração
        const iframe = document.querySelector(`[id="view-adjacent-${configId}"] iframe.adjacent-frame`);
        console.log(`[setActiveView] iframe encontrada?`, !!iframe);
        if (iframe?.contentWindow?.loadConfig) {
          console.log(`[setActiveView] Chamando loadConfig...`);
          return Promise.resolve(iframe.contentWindow.loadConfig())
            .then((result) => reportConfigResult("Configuracao recarregada", result))
            .catch((err) => {
              console.error("[setActiveView] Erro ao recarregar:", err);
              setSaveStatus("Falha ao recarregar configuracao.");
              addSystemLog(`Falha ao recarregar configuracao: ${err?.message || err}`, "error");
            });
        } else {
          console.log(`[setActiveView] loadConfig não encontrada na iframe`);
          setSaveStatus("Falha ao recarregar: interface nao disponivel.");
          addSystemLog("Falha ao recarregar configuracao: interface nao disponivel.", "error");
        }
      });
    } else {
      console.log(`[setActiveView] headerControls não disponível ou config não encontrada`);
    }
  } else {
    startFfbPolling();
    // Esconder botões quando não estiver em configuração adjacente
    if (typeof headerControls !== 'undefined') {
      headerControls.hideActions();
    }
  }
  Object.values(VIEW_IDS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
  });
  document.querySelectorAll("[id^='view-adjacent-']").forEach((el) => el.classList.remove("active"));
  const viewEl = getViewElement(viewKey);
  if (viewEl) {
    viewEl.classList.add("active");
    // Lazy-load iframe: set src from data-src on first activation
    const iframe = viewEl.querySelector("iframe.adjacent-frame[data-src]");
    if (iframe && !iframe.getAttribute("src")) {
      iframe.src = iframe.dataset.src;
      console.log("[DSW] setActiveView: lazy-loaded iframe:", iframe.dataset.src);
    }
    console.log("[DSW] setActiveView: activated", viewKey, "element:", viewEl.id);
  } else {
    console.warn("[DSW] setActiveView: view element NOT FOUND for", viewKey);
    // Fallback: ensure views are created, then retry once
    ensureAdjacentViews();
    const retryEl = getViewElement(viewKey);
    if (retryEl) {
      retryEl.classList.add("active");
      // Lazy-load iframe on retry too
      const iframe = retryEl.querySelector("iframe.adjacent-frame[data-src]");
      if (iframe && !iframe.getAttribute("src")) {
        iframe.src = iframe.dataset.src;
        console.log("[DSW] setActiveView: lazy-loaded iframe (retry):", iframe.dataset.src);
      }
      console.log("[DSW] setActiveView: activated after retry", viewKey);
    } else {
      console.error("[DSW] setActiveView: STILL not found after retry:", viewKey);
    }
  }
  setTopbarTitle(title);
  // Signal iframes to pause/resume polling so hidden configs don't flood serial
  notifyIframeVisibility(viewKey);
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

  const extraCount =
    (ioDefinitions?.ain?.available ? 1 : 0) +
    (ioDefinitions?.din?.available ? 1 : 0);
  if (countEl) countEl.textContent = String(definitions.length + extraCount);

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
      const offOption = options.find((entry) => entry.id === 0);
      const onOption = options.find((entry) => entry.id !== 0 && entry.id !== (offOption?.id ?? -1)) || options.find((entry) => entry.id !== 0);
      const isEnabled = selected !== null && selected !== undefined && Number(selected) > 0;
      const optionValues = options
        .filter((entry) => entry.id !== 0)
        .map((entry) => `<option value="${entry.id}">${optionLabel(entry)}</option>`)
        .join("");
      const toggleDisabled = !lastStatus?.connected;

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
        ${optionValues.length > 0 ? `
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
        // Set to current value if it's > 0, otherwise first available non-zero mode
        if (isEnabled && selected) {
          select.value = String(selected);
        } else if (onOption) {
          select.value = String(onOption.id);
        }
        select.addEventListener("change", async () => {
          const value = parseInt(select.value, 10);
          classDefinitions[definition.key] = {
            ...data,
            current: Number.isNaN(value) ? null : value,
          };
          await applyClassDefinitions();
        });
      }

      if (toggle) {
        toggle.addEventListener("change", async () => {
          let value = 0; // off
          if (toggle.checked) {
            if (select && select.value) {
              value = parseInt(select.value, 10);
            } else if (onOption) {
              value = onOption.id;
            } else {
              value = 1; // Fallback: mode 1 if no options available
            }
          }
          if (label) {
            label.textContent = toggle.checked ? "Ligado" : "Desligado";
          }
          if (select) {
            select.disabled = !toggle.checked;
            if (toggle.checked && value > 0) {
              select.value = String(value);
            }
          }
          classDefinitions[definition.key] = {
            ...data,
            current: value,
          };
          await applyClassDefinitions();
        });
      }
      return;
    }

    const optionValues = options
      .map((entry) => {
        const blockByCreatable = definition.key !== "encoder";
        const disabled = blockByCreatable && entry.creatable === false && entry.id !== selected ? "disabled" : "";
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
      });
    }
  });

  const buildIoCard = (ioKey, label, icon, description) => {
    const data = ioDefinitions?.[ioKey] || {};
    if (!data.available) return;
    const item = document.createElement("div");
    item.className = "class-item class-definition";
    const isEnabled = Boolean(data.active);
    const toggleDisabled = !lastStatus?.connected || data.id === null || data.id === undefined;
    item.innerHTML = `
      <div class="class-name">
        <i class="bi ${icon}"></i>
        <span>${label}</span>
      </div>
      <div class="class-desc">${description}</div>
      <label class="toggle-switch">
        <input type="checkbox" class="class-definition-toggle" data-io="${ioKey}" ${
          toggleDisabled ? "disabled" : ""
        } ${isEnabled ? "checked" : ""}>
        <span class="toggle-slider"></span>
        <span class="toggle-state">${isEnabled ? "Ligado" : "Desligado"}</span>
      </label>
    `;
    container.appendChild(item);

    const toggle = item.querySelector(".class-definition-toggle");
    const labelEl = item.querySelector(".toggle-state");
    if (toggle) {
      toggle.addEventListener("change", async () => {
        const id = data.id;
        if (id === null || id === undefined) return;
        const enabled = toggle.checked;
        const bitmask = Number(data.bitmask || 0);
        const newMask = enabled ? (bitmask | (1 << id)) : (bitmask & ~(1 << id));
        const cmd = ioKey === "ain" ? "aintypes" : "btntypes";
        addSaveFooter(`Atualizando ${label}...`);
        try {
          await window.pywebview?.api?.serial_set_value("main", cmd, newMask, 0, null);
          await loadIoDefinitions();
          await loadActiveClasses();
          renderCalibrationTree();
          renderClasses();
          if (labelEl) labelEl.textContent = enabled ? "Ligado" : "Desligado";
          addSaveFooter(`${label} ${enabled ? "ligado" : "desligado"}.`);
        } catch (err) {
          console.error("[IO] toggle error:", err);
          setSaveStatus(`Falha ao atualizar ${label}.`);
        }
      });
    }
  };

  buildIoCard("ain", "AIN (Analógico)", "bi-filter-circle", "Ativa/desativa a classe de entradas analógicas.");
  buildIoCard("din", "DIN (Digital)", "bi-toggle-on", "Ativa/desativa a classe de entradas digitais.");
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
  setText("connValue", connected ? (status?.hw || "--") : "--");
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

async function pauseAllIframePolling() {
  document.querySelectorAll("[id^='view-adjacent-'] iframe.adjacent-frame").forEach((iframe) => {
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "configVisibility", visible: false }, "*");
    }
  });
}

function resumeActiveIframePolling() {
  if (currentViewKey?.startsWith("adjacent:")) {
    notifyIframeVisibility(currentViewKey);
  }
}

async function withPollingPaused(action) {
  const hadFfb = Boolean(ffbTimer);
  const hadMonitoring = Boolean(monitoringTimer);
  stopFfbPolling();
  stopMonitoringPolling();
  pauseAllIframePolling();
  try {
    const result = await action();
    return result;
  } finally {
    if (lastStatus?.connected) {
      if (hadFfb) startFfbPolling();
      if (hadMonitoring && isMonitoringView(currentViewKey)) startMonitoringPolling();
      resumeActiveIframePolling();
    }
  }
}

// ── Connection Health Check ──────────────────────────────

function startConnectionCheck() {
  if (connectionCheckTimer) return;
  reconnectAttempts = 0;
  healthFailCount = 0;
  connectionCheckTimer = setInterval(async () => {
    if (!window.pywebview?.api) return;
    // Skip health check when an adjacent config iframe is active
    // (its polling proves the serial link is alive)
    if (currentViewKey && currentViewKey.startsWith("adjacent:")) {
      healthFailCount = 0;
      return;
    }
    try {
      const result = await window.pywebview.api.check_connection();
      if (!result?.connected) {
        handleConnectionDrop();
      } else if (!result?.alive) {
        healthFailCount++;
        if (healthFailCount >= MAX_HEALTH_FAIL) {
          handleConnectionDrop();
        }
      } else {
        healthFailCount = 0;
      }
    } catch (err) {
      healthFailCount++;
      if (healthFailCount >= MAX_HEALTH_FAIL) {
        handleConnectionDrop();
      }
    }
  }, CONNECTION_CHECK_INTERVAL);
}

function stopConnectionCheck() {
  if (!connectionCheckTimer) return;
  clearInterval(connectionCheckTimer);
  connectionCheckTimer = null;
  healthFailCount = 0;
}

async function handleConnectionDrop() {
  stopConnectionCheck();
  stopFfbPolling();
  stopMonitoringPolling();

  const wasConnected = lastStatus?.connected;
  const lastPort = lastStatus?.port || selectedPort;

  // Update UI immediately
  updateStatus({ connected: false, port: null, supported: false, fw: null, hw: null, heapfree: null, temp: null });
  activeClassIds = new Set();
  activeClasses = [];
  classDefinitions = {
    driver: { current: null, classes: [] },
    encoder: { current: null, classes: [] },
    shifter: { current: null, modes: [] },
  };
  renderClasses();
  renderCalibrationTree();
  renderMainClasses({ current: null, classes: [] });
  renderJoystickRates({ current: null, modes: [] });

  if (wasConnected) {
    setSaveStatus("Conexao perdida. Tentando reconectar...");
    addSystemLog("Conexao com o dispositivo perdida.", "error");

    // Ensure serial session is closed on backend
    try { await window.pywebview?.api?.disconnect(); } catch (e) { /* ignore */ }

    // Try to reconnect
    await attemptAutoReconnect(lastPort);
  }
}

async function attemptAutoReconnect(port) {
  if (!port || !window.pywebview?.api) return;
  reconnectAttempts = 0;

  const tryReconnect = async () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      setSaveStatus("Falha ao reconectar. Conecte manualmente.");
      addSystemLog(`Reconexao falhou apos ${MAX_RECONNECT_ATTEMPTS} tentativas.`, "error");
      return;
    }
    reconnectAttempts++;
    setSaveStatus(`Reconectando... tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    // Refresh ports to see if device is back
    const ports = await window.pywebview.api.list_ports();
    const target = ports.find((p) => p.device === port) || ports.find((p) => p.supported);
    if (target) {
      selectedPort = target.device;
      const result = await window.pywebview.api.connect(selectedPort);
      if (result?.ok) {
        setSaveStatus("Reconectado com sucesso!");
        addSystemLog("Reconectado com sucesso.");
        updateStatus(result.status);
        await loadCatalog();
        await loadAdjacentConfigs();
        await loadProfiles();
        await loadClassDefinitions();
        await loadActiveClasses();
        await loadMainClasses();
        await loadJoystickRates();
        startConnectionCheck();
        return;
      }
    }
    // Wait and retry
    setTimeout(tryReconnect, 2000);
  };

  setTimeout(tryReconnect, 1500);
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
            <i class="bi bi-cpu"></i>
            Firmware Update (DFU)
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="firmware-layout">
            <div class="firmware-panel">
              <div class="section-label">Controle</div>
              <div class="firmware-status">DFU: <span class="firmware-dfu-state">Procurando dispositivo...</span></div>
              <div class="firmware-file">Arquivo: <span class="firmware-file-name">Nenhum selecionado</span></div>
              <label class="firmware-option">
                <input type="checkbox" class="firmware-mass-erase" />
                Erase durante o envio (apaga antes de gravar o firmware)
              </label>
              <div class="firmware-hint">Esta opção é usada junto com "Enviar firmware".</div>
              <div class="btn-grid-1">
                <button class="btn-outline firmware-enter" title="Envia comando DFU ao hardware e desconecta a serial">
                  <i class="bi bi-arrow-repeat"></i>
                  Entrar em modo DFU
                </button>
                <button class="btn-outline firmware-select" disabled title="Selecionar arquivo .dfu ou .hex">
                  <i class="bi bi-folder2-open"></i>
                  Selecionar arquivo
                </button>
                <button class="btn-primary firmware-upload" disabled title="Enviar firmware para o dispositivo">
                  <i class="bi bi-upload"></i>
                  Enviar firmware
                </button>
                <button class="btn-danger firmware-erase" disabled title="Apaga o chip sem enviar firmware">
                  <i class="bi bi-exclamation-triangle"></i>
                  Erase somente
                </button>
              </div>
            </div>
            <div class="firmware-panel">
              <div class="section-label">Progresso</div>
              <div class="firmware-progress">
                <div class="firmware-progress-bar"></div>
              </div>
              <div class="firmware-progress-text">0%</div>
              <div class="section-label" style="margin-top: 10px;">Log</div>
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

  let firstFail = true;
  let dfuDeviceFound = false;
  let lastProbeState = null;
  let lastProbeLogAt = 0;
  let lastBackendLog = [];
  const uiLog = [];
  const MAX_UI_LOG = 120;

  const renderLog = (backendLog = []) => {
    if (!logEl) return;
    const merged = [...backendLog, ...uiLog];
    logEl.innerHTML = merged.map((line) => `<div class="log-line log-info">${line}</div>`).join("");
    logEl.scrollTop = logEl.scrollHeight;
  };

  const appendLog = (msg) => {
    if (!msg) return;
    uiLog.push(msg);
    if (uiLog.length > MAX_UI_LOG) uiLog.splice(0, uiLog.length - MAX_UI_LOG);
    renderLog(lastBackendLog);
  };

  const maybeLogSearching = () => {
    const now = Date.now();
    if (now - lastProbeLogAt > 3000) {
      appendLog("Nenhum dispositivo DFU. Tentando novamente...");
      lastProbeLogAt = now;
    }
  };

  const renderStatus = (data) => {
    if (!data) return;
    const dfuCount = Number(data.dfu_count || 0);
    const dfuOk = data.dfu_ok !== false;
    const probeState = dfuOk ? `count:${dfuCount}` : `error:${data.dfu_error || "unknown"}`;

    if (dfuStateEl) {
      if (!dfuOk && data.dfu_error) {
        dfuStateEl.textContent = "Erro ao acessar USB";
        dfuStateEl.style.color = "var(--danger)";
        if (probeState !== lastProbeState) {
          appendLog(`Erro ao acessar USB: ${data.dfu_error}`);
        }
      } else if (dfuCount === 0) {
        if (firstFail) {
          dfuStateEl.textContent = "Procurando dispositivo DFU...";
          dfuStateEl.style.color = "var(--text-muted)";
          appendLog("Procurando dispositivo DFU...");
          appendLog("Certifique-se de que o bootloader foi detectado e os drivers estao instalados.");
          appendLog("Conecte o boot0 para forcar o bootloader se necessario.");
          firstFail = false;
        } else {
          dfuStateEl.textContent = "Nenhum dispositivo DFU";
          dfuStateEl.style.color = "var(--warning, #ffc107)";
        }
        dfuDeviceFound = false;
        maybeLogSearching();
      } else if (dfuCount === 1) {
        dfuStateEl.textContent = "Dispositivo DFU encontrado";
        dfuStateEl.style.color = "var(--success, #53ffba)";
        if (!dfuDeviceFound) {
          appendLog("Dispositivo DFU encontrado. Selecione uma opcao.");
          dfuDeviceFound = true;
        }
      } else {
        dfuStateEl.textContent = `Multiplos dispositivos (${dfuCount})`;
        dfuStateEl.style.color = "var(--warning, #ffc107)";
        if (probeState !== lastProbeState) {
          appendLog("Multiplos dispositivos DFU detectados. Desconecte outros para evitar erros.");
        }
      }
    }
    lastProbeState = probeState;

    if (data.selected) {
      const fname = data.selected.split(/[\\/]/).pop();
      fileNameEl.textContent = fname;
    } else {
      fileNameEl.textContent = "Nenhum selecionado";
    }

    const progress = Math.max(0, Math.min(100, data.progress || 0));
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;

    // Render logs from backend (merge with UI logs)
    lastBackendLog = Array.isArray(data.log) ? data.log : [];
    renderLog(lastBackendLog);

    const hasDevice = dfuCount >= 1 && dfuOk;
    const serialConnected = Boolean(lastStatus?.connected);
    const allowDfuOps = hasDevice && !data.busy;
    if (enterBtn) enterBtn.disabled = !serialConnected || data.busy;
    if (selectBtn) selectBtn.disabled = !allowDfuOps;
    if (uploadBtn) uploadBtn.disabled = !allowDfuOps || !data.selected;
    if (eraseBtn) eraseBtn.disabled = !allowDfuOps;
    if (massErase) massErase.disabled = !allowDfuOps;
  };

  const refreshStatus = async () => {
    if (!window.pywebview?.api) return;
    const data = await window.pywebview.api.dfu_status();
    renderStatus(data);
  };

  modalEl.querySelector(".firmware-enter").addEventListener("click", async () => {
    appendLog("Enviando comando DFU ao hardware...");
    stopConnectionCheck();
    await window.pywebview?.api?.dfu_enter();
    // Connection was closed, update status
    updateStatus({ connected: false, port: null, supported: false, fw: null, hw: null, heapfree: null, temp: null });
    appendLog("Serial desconectada. Aguardando dispositivo DFU...");
    firstFail = true;
    dfuDeviceFound = false;
    await refreshStatus();
  });

  modalEl.querySelector(".firmware-select").addEventListener("click", async () => {
    const result = await window.pywebview?.api?.dfu_select_file();
    if (result?.ok) {
      appendLog(`Arquivo selecionado: ${result.path}`);
    }
    await refreshStatus();
  });

  modalEl.querySelector(".firmware-upload").addEventListener("click", async () => {
    const useErase = Boolean(massErase?.checked);
    if (uploadBtn) uploadBtn.disabled = true;
    if (eraseBtn) eraseBtn.disabled = true;
    if (selectBtn) selectBtn.disabled = true;
    appendLog("Iniciando upload... NAO feche esta janela ou desconecte!");
    await window.pywebview?.api?.dfu_upload(useErase);
    await refreshStatus();
  });

  modalEl.querySelector(".firmware-erase").addEventListener("click", async () => {
    showConfirmModal({
      title: "Erase somente (sem gravar firmware)",
      body: "<p>Apagar completamente o chip sem enviar firmware?</p><p><strong>Isto apaga TUDO: firmware e configuracoes.</strong></p><p>Voce pode precisar de um programador ou conectar boot0 para reflashar!</p>",
      confirmText: "Apagar chip",
      confirmIcon: "bi-exclamation-triangle",
      onConfirm: async () => {
        if (eraseBtn) eraseBtn.disabled = true;
        appendLog("Apagando chip completo...");
        await window.pywebview?.api?.dfu_mass_erase();
        await refreshStatus();
      },
    });
  });

  let statusTimer = setInterval(refreshStatus, 1000);

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
          <div class="terminal-layout">
            <div class="terminal-shell">
              <div class="terminal-output" id="terminalOutput"></div>
              <div class="terminal-input-group">
                <input type="text" class="terminal-input" placeholder="Digite comando..." autocomplete="off">
                <button class="btn-primary-sm terminal-send" title="Enviar">
                  <i class="bi bi-send"></i>
                </button>
              </div>
            </div>
            <div class="terminal-help">
              <div class="terminal-help-title">Guia rápido</div>
              <div class="terminal-help-section">
                <div class="terminal-help-label">Leitura básica</div>
                <div class="terminal-chip">sys.swver?;</div>
                <div class="terminal-chip">sys.temp?;</div>
                <div class="terminal-chip">main.id?;</div>
              </div>
              <div class="terminal-help-section">
                <div class="terminal-help-label">Diagnóstico</div>
                <div class="terminal-chip">sys.errors?;</div>
                <div class="terminal-chip">sys.errorsclr;</div>
                <div class="terminal-chip">sys.heapfree?;</div>
              </div>
              <div class="terminal-help-section">
                <div class="terminal-help-label">Formato direto</div>
                <div class="terminal-help-text">Use o formato <span class="terminal-inline">classe.instância.comando?;</span> para leitura.</div>
                <div class="terminal-help-text">Exemplo: <span class="terminal-inline">axis.0.pos?;</span></div>
              </div>
              <div class="terminal-help-section">
                <div class="terminal-help-label">Dica</div>
                <div class="terminal-help-text">Ajustes críticos: faça alteração e depois use <span class="terminal-inline">Save to flash</span> no rodapé.</div>
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
  try {
    adjacentConfigs = await window.pywebview.api.get_adjacent_configs();
    console.log("[DSW] loadAdjacentConfigs: received", adjacentConfigs?.length, "configs:", JSON.stringify(adjacentConfigs?.map(c => c.id)));
  } catch (err) {
    console.error("[DSW] loadAdjacentConfigs ERROR:", err);
    adjacentConfigs = [];
  }
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
    appliedClassDefinitions = {
      driver: { current: null, classes: [] },
      encoder: { current: null, classes: [] },
      shifter: { current: null, modes: [] },
    };
    renderClasses();
    return;
  }
  const data = await window.pywebview.api.get_class_definitions();
  console.log("[DSW] classDefinitions raw:", JSON.stringify(data));
  classDefinitions = {
    driver: data?.driver || { current: null, classes: [] },
    encoder: data?.encoder || { current: null, classes: [] },
    shifter: data?.shifter || { current: null, modes: [] },
  };
  appliedClassDefinitions = {
    driver: data?.driver || { current: null, classes: [] },
    encoder: data?.encoder || { current: null, classes: [] },
    shifter: data?.shifter || { current: null, modes: [] },
  };
  renderClasses();
  renderCalibrationTree();
}

function parseLsList(reply) {
  if (!reply) return [];
  return reply
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(":", 3);
      if (parts.length < 3) return null;
      const id = parseInt(parts[0], 10);
      return Number.isNaN(id) ? null : { id, name: parts[2] };
    })
    .filter(Boolean);
}

async function loadIoDefinitions() {
  if (!window.pywebview?.api || !lastStatus?.connected) {
    ioDefinitions = {
      ain: { id: null, name: "AIN-Pins", active: false, available: false, bitmask: 0 },
      din: { id: null, name: "D-Pins", active: false, available: false, bitmask: 0 },
    };
    return;
  }
  const [lsain, aintypes, lsbtn, btntypes] = await Promise.all([
    window.pywebview.api.serial_request("main", "lsain", 0, null, "?"),
    window.pywebview.api.serial_request("main", "aintypes", 0, null, "?"),
    window.pywebview.api.serial_request("main", "lsbtn", 0, null, "?"),
    window.pywebview.api.serial_request("main", "btntypes", 0, null, "?"),
  ]);

  const ainList = parseLsList(lsain);
  const dinList = parseLsList(lsbtn);
  const ainEntry =
    ainList.find((s) => s.id === 0) || ainList.find((s) => /ain|pins|analog/i.test(s.name || ""));
  const dinEntry =
    dinList.find((s) => s.id === 0) || dinList.find((s) => /d-pins|dpin|digital|din/i.test(s.name || ""));

  const aMask = parseInt(aintypes, 10);
  const bMask = parseInt(btntypes, 10);

  ioDefinitions = {
    ain: {
      id: ainEntry?.id ?? null,
      name: ainEntry?.name || "AIN-Pins",
      active: ainEntry ? (Number.isNaN(aMask) ? false : (aMask & (1 << ainEntry.id)) !== 0) : false,
      available: Boolean(ainEntry),
      bitmask: Number.isNaN(aMask) ? 0 : aMask,
    },
    din: {
      id: dinEntry?.id ?? null,
      name: dinEntry?.name || "D-Pins",
      active: dinEntry ? (Number.isNaN(bMask) ? false : (bMask & (1 << dinEntry.id)) !== 0) : false,
      available: Boolean(dinEntry),
      bitmask: Number.isNaN(bMask) ? 0 : bMask,
    },
  };
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
  console.log("[DSW] activeClasses raw:", JSON.stringify(active));
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
  reconnectAttempts = 0;
  await loadCatalog();
  await loadAdjacentConfigs();
  addSystemLog(`Adjacent configs carregados: ${adjacentConfigs.length} configs`);
  await loadProfiles();
  await loadClassDefinitions();
  await loadActiveClasses();
  await loadIoDefinitions();
  renderClasses();
  await loadMainClasses();
  await loadJoystickRates();
  startConnectionCheck();
}

async function disconnectCurrent() {
  if (!window.pywebview?.api) return;
  stopConnectionCheck();
  const result = await window.pywebview.api.disconnect();
  updateStatus(result.status);
  activeClassIds = new Set();
  activeClasses = [];
  classDefinitions = {
    driver: { current: null, classes: [] },
    encoder: { current: null, classes: [] },
    shifter: { current: null, modes: [] },
  };
  appliedClassDefinitions = {
    driver: { current: null, classes: [] },
    encoder: { current: null, classes: [] },
    shifter: { current: null, modes: [] },
  };
  ioDefinitions = {
    ain: { id: null, name: "AIN-Pins", active: false, available: false, bitmask: 0 },
    din: { id: null, name: "D-Pins", active: false, available: false, bitmask: 0 },
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
  setSaveStatus("Aplicando definicoes de classes...");
  const payload = {
    driver: classDefinitions?.driver?.current ?? null,
    encoder: classDefinitions?.encoder?.current ?? null,
    shifter: classDefinitions?.shifter?.current ?? null,
  };
  const result = await withPollingPaused(() => window.pywebview.api.apply_class_definitions(payload));
  if (result?.ok) {
    setSaveStatus("Definicoes de classes aplicadas.");
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
    await loadIoDefinitions();
    setSaveStatus("Carregando... 6");
    await loadActiveClasses();
    setSaveStatus("Carregando... 7");
    await loadMainClasses();
    await loadJoystickRates();
    setSaveStatus("Pronto");
    if (lastStatus?.connected) {
      startConnectionCheck();
    }
  } catch (err) {
    setSaveStatus("Erro ao carregar");
    addError("Erro ao Carregar", err.message, "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Criar instância de HeaderControls quando DOM está pronto
  headerControls = new HeaderControls();
  headerControls.init();
  console.log('[App] HeaderControls inicializado');
  
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
