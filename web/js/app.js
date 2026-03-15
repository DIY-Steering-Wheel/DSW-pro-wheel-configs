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
let lastStatus = null;
let terminalLog = [];
let errorsList = [];

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

const VIEW_IDS = {
  dashboard: "view-dashboard",
  "monitoring-status": "view-monitoring-status",
  "monitoring-live": "view-monitoring-live",
};

const EFFECTS_CLASS_ID = 0xA02;
let monitoringTimer = null;
let monitoringAxis = 0;
let ffbTimer = null;

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
  if (cfg.requires_active === false) return true;
  if (cfg.definition_key) {
    const def = classDefinitions?.[cfg.definition_key];
    if (!def || def.current === null || def.current === undefined) {
      return false;
    }
    const matchers = Array.isArray(cfg.definition_match)
      ? cfg.definition_match
      : cfg.definition_match
        ? [cfg.definition_match]
        : [];
    if (matchers.length > 0 && Array.isArray(def.classes)) {
      const current = def.classes.find((entry) => entry.id === def.current);
      const name = String(current?.name || "").toLowerCase();
      return matchers.some((needle) => name.includes(String(needle).toLowerCase()));
    }
    return true;
  }
  if (cfg.class_id !== null && cfg.class_id !== undefined) {
    return activeClassIds.has(Number(cfg.class_id));
  }
  const matches = Array.isArray(cfg.clsname_match)
    ? cfg.clsname_match
    : cfg.clsname_match
      ? [cfg.clsname_match]
      : [];
  if (matches.length === 0) {
    return true;
  }
  return activeClasses.some((entry) => {
    const clsname = String(entry.clsname || entry.name || entry.label || "").toLowerCase();
    return matches.some((needle) => clsname.includes(String(needle).toLowerCase()));
  });
}

function renderCalibrationTree() {
  const container = document.getElementById("adjacentTree");
  if (!container) return;
  container.innerHTML = "";
  const visible = adjacentConfigs.filter(isConfigVisible);
  if (visible.length === 0) {
    return;
  }
  visible.forEach((cfg) => {
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
    const emptyOption = `<option value="">Nenhuma</option>`;

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
    if (!profiles.includes(selectedProfile)) {
      selectedProfile = current || profiles[0] || "None";
    }
    return;
  }
  
  select.innerHTML = "";
  const profiles = data?.profiles || [];
  const current = data?.current;
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
    const data = await window.pywebview.api.get_ffb_status();
    const el = document.getElementById("ffbStatus");
    const dot = document.getElementById("ffbDot");
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
  }, 1000);
}

function stopFfbPolling() {
  if (!ffbTimer) return;
  clearInterval(ffbTimer);
  ffbTimer = null;
  const el = document.getElementById("ffbStatus");
  if (el) el.textContent = "0 Hz";
  const dot = document.getElementById("ffbDot");
  if (dot) dot.classList.remove("active");
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

function showProfilesModal() {
  const hasBootstrap = typeof bootstrap !== "undefined" && bootstrap.Modal;
  // Remove existing modals
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
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-collection"></i>
            Gerenciar Perfis
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="modal-section">
            <label class="section-label">Perfil Ativo</label>
            <div class="selector-row">
              <select class="form-select-custom profiles-select"></select>
              <button class="btn-outline profiles-apply" title="Selecionar">
                <i class="bi bi-check2-circle"></i>
              </button>
            </div>
          </div>

          <div class="modal-divider"></div>

          <div class="modal-section">
            <label class="section-label">Ações</label>
            <div class="btn-grid-2">
              <button class="btn-outline profiles-save" title="Salvar do hardware">
                <i class="bi bi-download"></i>
                Salvar Hardware
              </button>
              <button class="btn-outline profiles-apply-to-board" title="Aplicar ao hardware">
                <i class="bi bi-check2-circle"></i>
                Aplicar
              </button>
            </div>
          </div>

          <div class="modal-divider"></div>

          <div class="modal-section">
            <label class="section-label">Gerenciamento</label>
            <div class="btn-grid-3">
              <button class="btn-success profiles-create" title="Novo">
                <i class="bi bi-plus-circle"></i>
                Novo
              </button>
              <button class="btn-info profiles-rename" title="Renomear">
                <i class="bi bi-pencil"></i>
                Renomear
              </button>
              <button class="btn-danger profiles-delete" title="Excluir">
                <i class="bi bi-trash"></i>
                Excluir
              </button>
            </div>
          </div>

          <div class="modal-divider"></div>

          <div class="modal-section">
            <label class="section-label">Importar / Exportar</label>
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

  // Atualizar select
  const select = modalEl.querySelector(".profiles-select");
  const profiles = classCatalog ? classCatalog.map((c) => c.label) : [];
  select.innerHTML = profiles.map((name) => 
    `<option value="${name}" ${name === selectedProfile ? "selected" : ""}>${name}</option>`
  ).join("");

  // Event listeners
  modalEl.querySelector(".modal-close-btn").addEventListener("click", () => {
    if (modal) modal.hide();
    modalEl.classList.remove("show");
    modalEl.style.display = "none";
  });
  modalEl.querySelector(".profiles-apply").addEventListener("click", async () => {
    selectedProfile = select.value;
    if (window.pywebview?.api) {
      await window.pywebview.api.select_profile(selectedProfile);
    }
  });

  modalEl.querySelector(".profiles-save").addEventListener("click", () => saveProfile());
  modalEl.querySelector(".profiles-apply-to-board").addEventListener("click", () => applyProfile());
  modalEl.querySelector(".profiles-create").addEventListener("click", () => createProfile());
  modalEl.querySelector(".profiles-rename").addEventListener("click", () => renameProfile());
  modalEl.querySelector(".profiles-delete").addEventListener("click", () => deleteProfile());
  modalEl.querySelector(".profiles-export").addEventListener("click", () => exportProfile());
  modalEl.querySelector(".profiles-import").addEventListener("click", () => importProfile());

  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });

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
    <div class="modal-dialog modal-fullscreen-sm-down">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-exclamation-circle"></i>
            Erros e Avisos
          </h5>
          <button type="button" class="btn-close modal-close-btn" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="errors-list"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-outline errors-clear" title="Limpar">
            <i class="bi bi-trash"></i>
            Limpar
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
  modalEl.querySelectorAll("[data-bs-dismiss='modal']").forEach((btn) => {
    btn.addEventListener("click", () => modal && modal.hide());
  });
  modalEl.querySelector(".btn-close")?.addEventListener("click", () => modal && modal.hide());

  const list = modalEl.querySelector(".errors-list");
  list.innerHTML = errorsList.map((error) => `
    <div class="error-item ${error.level}">
      <div class="error-item-title">${error.title}</div>
      <div class="error-item-message">${error.message}</div>
      <div class="error-item-time">${error.timestamp}</div>
    </div>
  `).join("");

  modalEl.querySelector(".errors-clear").addEventListener("click", () => {
    errorsList = [];
    list.innerHTML = "";
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
}

async function saveProfile() {
  if (!window.pywebview?.api || !selectedProfile) return;
  await window.pywebview.api.save_profile_from_board(selectedProfile);
  setSaveStatus(`Perfil "${selectedProfile}" salvo do hardware.`);
}

async function applyProfile() {
  if (!window.pywebview?.api || !selectedProfile) return;
  await window.pywebview.api.apply_profile_to_board(selectedProfile);
  setSaveStatus(`Perfil "${selectedProfile}" aplicado.`);
}

async function saveToFlash() {
  if (!window.pywebview?.api || !lastStatus?.connected) return;
  const result = await window.pywebview.api.save_to_flash();
  if (result?.ok) {
    setSaveStatus("Configuracao salva na Flash.");
  } else {
    setSaveStatus("Falha ao salvar na Flash.");
  }
}

async function createProfile() {
  const name = window.prompt("Nome do novo perfil:");
  if (!name || !window.pywebview?.api) return;
  const result = await window.pywebview.api.create_profile(name);
  selectedProfile = name;
  renderProfiles({ profiles: result.profiles, current: name });
}

async function renameProfile() {
  if (!selectedProfile || selectedProfile === "None") return;
  const name = window.prompt("Novo nome do perfil:", selectedProfile);
  if (!name || !window.pywebview?.api) return;
  const result = await window.pywebview.api.rename_profile(selectedProfile, name);
  selectedProfile = name;
  renderProfiles({ profiles: result.profiles, current: name });
}

async function deleteProfile() {
  if (!selectedProfile || selectedProfile === "None") return;
  const ok = window.confirm(`Excluir o perfil "${selectedProfile}"?`);
  if (!ok || !window.pywebview?.api) return;
  const result = await window.pywebview.api.delete_profile(selectedProfile);
  selectedProfile = "None";
  renderProfiles({ profiles: result.profiles, current: "None" });
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
  const result = await window.pywebview.api.apply_class_definitions(payload);
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
  errorsList.push({ title, message, level, timestamp });
  updateErrorsDisplay();
}

function updateErrorsDisplay() {
  const list = document.getElementById("errorsList");
  if (!list) return;
  list.innerHTML = errorsList.map((error, index) => `
    <div class="error-item ${error.level}">
      <div class="error-item-title">${error.title}</div>
      <div class="error-item-message">${error.message}</div>
      <div class="error-item-time">${error.timestamp}</div>
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

  const discordLink = document.getElementById("discordLink");
  if (discordLink) {
    if (SOCIAL_LINKS.discord) {
      discordLink.href = SOCIAL_LINKS.discord;
    } else {
      discordLink.classList.add("disabled");
    }
  }

  const siteLink = document.getElementById("siteLink");
  if (siteLink) {
    if (SOCIAL_LINKS.site) {
      siteLink.href = SOCIAL_LINKS.site;
    } else {
      siteLink.classList.add("disabled");
    }
  }

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
    showConfirmModal({
      title: "Salvar na Flash",
      body: "Deseja salvar as configuracoes atuais na Flash do hardware?",
      confirmText: "Salvar",
      confirmIcon: "bi-save2",
      onConfirm: async () => {
        await saveToFlash();
      },
    });
  });

  document.getElementById("sidebarReboot")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showConfirmModal({
      title: "Reiniciar dispositivo",
      body: "Deseja reiniciar o hardware agora?",
      confirmText: "Reiniciar",
      confirmIcon: "bi-arrow-clockwise",
      onConfirm: async () => {
        await window.pywebview?.api?.reboot();
      },
    });
  });

  document.getElementById("sidebarFormat")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showConfirmModal({
      title: "Formatar flash",
      body: "Esta acao apaga configuracoes e reinicia o hardware. Deseja continuar?",
      confirmText: "Formatar",
      confirmIcon: "bi-exclamation-triangle",
      onConfirm: async () => {
        await window.pywebview?.api?.format_flash();
      },
    });
  });

  document.getElementById("rebootBtn")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showConfirmModal({
      title: "Reiniciar dispositivo",
      body: "Deseja reiniciar o hardware agora?",
      confirmText: "Reiniciar",
      confirmIcon: "bi-arrow-clockwise",
      onConfirm: async () => {
        await window.pywebview?.api?.reboot();
      },
    });
  });

  document.getElementById("formatBtn")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showConfirmModal({
      title: "Formatar flash",
      body: "Esta acao apaga configuracoes e reinicia o hardware. Deseja continuar?",
      confirmText: "Formatar",
      confirmIcon: "bi-exclamation-triangle",
      onConfirm: async () => {
        await window.pywebview?.api?.format_flash();
      },
    });
  });

  document.getElementById("mainClassApply")?.addEventListener("click", () => {
    if (!lastStatus?.connected) return;
    showConfirmModal({
      title: "Alterar main class",
      body: "Alterar a main class reinicia o hardware. Deseja aplicar?",
      confirmText: "Aplicar",
      confirmIcon: "bi-check2-circle",
      onConfirm: async () => {
        const select = document.getElementById("mainClassSelect");
        if (!select) return;
        const value = parseInt(select.value, 10);
        if (!Number.isNaN(value)) {
          await window.pywebview?.api?.set_main_class(value);
        }
      },
    });
  });
});
