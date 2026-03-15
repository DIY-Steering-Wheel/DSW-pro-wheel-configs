let selectedPort = null;
let selectedProfile = null;
let mainClassData = { current: null, classes: [] };
let classCatalog = [];
let activeClassIds = new Set();
let lastStatus = null;

const fallbackMenu = [
  { key: "dashboard", label: "Painel", icon: "bi-grid-1x2" },
  { key: "connection", label: "Conexao", icon: "bi-usb-plug" },
  { key: "profiles", label: "Perfis", icon: "bi-collection" },
  { key: "motion", label: "Motores e Eixos", icon: "bi-gear-wide-connected" },
  { key: "effects", label: "Efeitos", icon: "bi-lightning" },
  { key: "firmware", label: "Firmware", icon: "bi-cpu" },
  { key: "logs", label: "Logs", icon: "bi-journal-text" },
];

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
    footer.textContent = `Porta: ${status.port} | ${status.supported ? "Compativel" : "Nao compativel"}`;
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

function renderActiveTabs() {
  const container = document.getElementById("activeTabs");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (!activeClassIds || activeClassIds.size === 0) {
    return; // Sem abas se nenhuma classe está ativa
  }
  
  // Renderizar apenas as classes ativas como abas no sidebar
  classCatalog.forEach((entry) => {
    if (activeClassIds.has(entry.id)) {
      const tab = document.createElement("a");
      tab.href = "#";
      tab.className = "sidebar-tab";
      tab.innerHTML = `<i class="bi ${entry.icon}"></i><span>${entry.label}</span>`;
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        // Aqui pode adicionar lógica para mostrar configurações da classe no painel
      });
      container.appendChild(tab);
    }
  });
}

function renderClasses() {
  const container = document.getElementById("classList");
  const countEl = document.getElementById("classCount");
  if (!container) return;
  
  container.innerHTML = "";
  if (!classCatalog || classCatalog.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; text-align: center; color: var(--text-muted);">Nenhuma classe disponível</div>`;
    if (countEl) countEl.textContent = "0";
    return;
  }
  
  if (countEl) countEl.textContent = classCatalog.length;
  
  classCatalog.forEach((entry) => {
    const isActive = activeClassIds.has(entry.id);
    const item = document.createElement("div");
    item.className = "class-item";
    const checkboxId = `class-check-${entry.id}`;
    
    item.innerHTML = `
      <div class="class-name">
        <i class="bi ${entry.icon}"></i>
        <span>${entry.label}</span>
      </div>
      <div class="class-desc">${entry.description}</div>
      <div class="class-toggle">
        <small style="color: var(--text-muted); font-size: 11px;">${isActive ? "Ativa" : "Inativa"}</small>
        <input type="checkbox" id="${checkboxId}" ${isActive ? "checked" : ""} ${lastStatus?.connected ? "" : "disabled"}>
      </div>
    `;
    
    const checkbox = item.querySelector(`#${checkboxId}`);
    if (checkbox) {
      checkbox.addEventListener("change", async (event) => {
        const enabled = event.target.checked;
        if (!window.pywebview?.api || !lastStatus?.connected) {
          event.target.checked = !enabled;
          return;
        }
        const result = await window.pywebview.api.set_class_active(entry.id, enabled);
        if (!result?.ok) {
          event.target.checked = !enabled;
          setSaveStatus("Falha ao alterar classe. Verifique o firmware.");
          return;
        }
        await loadActiveClasses();
        setSaveStatus("Classe atualizada com sucesso.");
      });
    }
    
    container.appendChild(item);
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
  if (!select) return;
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
  const pill = document.querySelector(".status-indicator");
  const dot = document.querySelector(".status-dot");
  const statusText = document.querySelector(".status-text");
  
  if (dot) {
    dot.classList.toggle("connected", connected);
  }
  if (statusText) {
    statusText.textContent = connected ? "Conectado" : "Desconectado";
  }
  
  // Update connection label
  const label = document.getElementById("connectionLabel");
  if (label) {
    label.textContent = connected ? `Porta: ${status.port}` : "Nenhum dispositivo";
  }
  
  updateFooterConnection(status);
  setText("fwValue", status?.fw || "--");
  setText("hwValue", status?.hw || "--");
  setText("ramValue", status?.heapfree || "--");
  setText("tempValue", status?.temp ? `${status.temp} °C` : "--");
  setText("connValue", connected ? (status.supported ? "Compativel" : "Nao compativel") : "--");
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
  // Remove any existing modals and backdrops
  document.querySelectorAll(".modal.fade").forEach((m) => {
    const instance = bootstrap.Modal.getInstance(m);
    if (instance) instance.hide();
    setTimeout(() => m.remove(), 300);
  });
  document.querySelectorAll(".modal-backdrop").forEach((bd) => bd.remove());
  document.body.classList.remove("modal-open");

  const modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.id = `confirm-modal-${Date.now()}`;
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
  const modal = new bootstrap.Modal(modalEl);
  const confirmBtn = modalEl.querySelector(".confirm-btn");
  confirmBtn?.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    if (onConfirm) {
      await onConfirm();
    }
    modal.hide();
  });
  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });
  modal.show();
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

async function loadActiveClasses() {
  activeClassIds = new Set();
  if (!window.pywebview?.api || !lastStatus?.connected) {
    renderClasses();
    renderActiveTabs();
    return;
  }
  const active = await window.pywebview.api.get_active_classes();
  if (active && active.length) {
    active.forEach((entry) => activeClassIds.add(entry.id));
  }
  renderClasses();
  renderActiveTabs();
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
  await loadActiveClasses();
  await loadMainClasses();
}

async function disconnectCurrent() {
  if (!window.pywebview?.api) return;
  const result = await window.pywebview.api.disconnect();
  updateStatus(result.status);
  activeClassIds = new Set();
  renderClasses();
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

function openProfilesModal() {
  const modal = new bootstrap.Modal(document.getElementById("profilesModal"));
  modal.show();
}

async function refreshAll() {
  await loadPorts();
  await loadProfiles();
  await loadStatus();
  await loadCatalog();
  await loadActiveClasses();
  await loadMainClasses();
}

document.addEventListener("DOMContentLoaded", async () => {
  await refreshAll();

  // Connection and port management
  document.getElementById("refreshPorts")?.addEventListener("click", loadPorts);
  document.getElementById("connectBtn")?.addEventListener("click", connectSelected);
  document.getElementById("disconnectBtn")?.addEventListener("click", disconnectCurrent);
  document.getElementById("refreshAll")?.addEventListener("click", refreshAll);

  // Profile modal
  document.getElementById("openProfilesBtn")?.addEventListener("click", openProfilesModal);

  // Profile actions from modal
  document.getElementById("profileSelectApply")?.addEventListener("click", async () => {
    const select = document.getElementById("profileSelectModal");
    if (select && window.pywebview?.api) {
      const name = select.value;
      selectedProfile = name;
      await window.pywebview.api.select_profile(name);
    }
  });

  document.getElementById("profileApply")?.addEventListener("click", applyProfile);
  document.getElementById("profileSave")?.addEventListener("click", saveProfile);
  document.getElementById("profileCreate")?.addEventListener("click", createProfile);
  document.getElementById("profileRename")?.addEventListener("click", renameProfile);
  document.getElementById("profileDelete")?.addEventListener("click", deleteProfile);
  document.getElementById("profileExport")?.addEventListener("click", exportProfile);
  document.getElementById("profileImport")?.addEventListener("click", importProfile);

  document.getElementById("profileSelectModal")?.addEventListener("change", async (event) => {
    const name = event.target.value;
    selectedProfile = name;
    if (window.pywebview?.api) {
      await window.pywebview.api.select_profile(name);
    }
  });

  // Hardware actions from sidebar
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
