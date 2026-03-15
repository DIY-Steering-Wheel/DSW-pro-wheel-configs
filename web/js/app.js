let selectedPort = null;
let selectedProfile = null;

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

function renderMenu(items) {
  const menu = document.getElementById("navMenu");
  if (!menu) return;
  menu.innerHTML = "";
  (items || fallbackMenu).forEach((item, index) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.className = `nav-link ${index === 0 ? "active" : ""}`;
    link.href = "#";
    link.innerHTML = `<i class="bi ${item.icon}"></i><span>${item.label}</span>`;
    li.appendChild(link);
    menu.appendChild(li);
  });
}

function renderTabs(tabs) {
  const container = document.getElementById("activeTabs");
  if (!container) return;
  container.innerHTML = "";
  if (!tabs || tabs.length === 0) {
    container.innerHTML = `<div class="tab-card"><div class="tab-title"><i class="bi bi-exclamation-circle"></i><span>Nenhuma classe ativa</span></div><div class="tab-desc">Conecte um dispositivo compatível para carregar as classes.</div></div>`;
    return;
  }
  tabs.forEach((tab) => {
    const card = document.createElement("div");
    card.className = "tab-card";
    card.innerHTML = `
      <div class="tab-title">
        <i class="bi ${tab.icon}"></i>
        <span>${tab.title}</span>
      </div>
      <div class="tab-desc">${tab.description}</div>
    `;
    container.appendChild(card);
  });
}

function renderPorts(ports) {
  const list = document.getElementById("portList");
  if (!list) return;
  list.innerHTML = "";
  if (!ports || ports.length === 0) {
    list.innerHTML = `<div class="port-item"><div class="port-title">Nenhuma porta encontrada</div><div class="port-meta">Conecte o dispositivo e atualize.</div></div>`;
    return;
  }
  ports.forEach((port) => {
    const item = document.createElement("div");
    item.className = `port-item ${selectedPort === port.device ? "active" : ""}`;
    const tagClass = port.supported ? "supported" : "unsupported";
    const tagLabel = port.supported ? "Compatível" : "Não compatível";
    item.innerHTML = `
      <div class="port-title">
        <span>${port.device}</span>
        <span class="port-tag ${tagClass}">${tagLabel}</span>
      </div>
      <div class="port-meta">${port.description || "Sem descrição"}</div>
      <div class="port-meta">VID: ${port.vid ?? "--"} | PID: ${port.pid ?? "--"}</div>
    `;
    item.addEventListener("click", () => {
      selectedPort = port.device;
      renderPorts(ports);
      updatePortHint();
    });
    list.appendChild(item);
  });
}

function renderProfiles(data) {
  const list = document.getElementById("profileList");
  if (!list) return;
  list.innerHTML = "";
  const profiles = data?.profiles || [];
  const current = data?.current;
  selectedProfile = selectedProfile || current || "None";
  profiles.forEach((name) => {
    const pill = document.createElement("div");
    pill.className = `profile-pill ${selectedProfile === name ? "active" : ""}`;
    pill.textContent = name;
    pill.addEventListener("click", () => {
      selectedProfile = name;
      renderProfiles({ profiles, current });
      if (window.pywebview?.api) {
        window.pywebview.api.select_profile(name);
      }
    });
    list.appendChild(pill);
  });
}

function updateStatus(status) {
  const connected = status?.connected;
  const pill = document.getElementById("connectionPill");
  const label = document.getElementById("connectionLabel");
  if (pill) {
    pill.querySelector(".dot").style.background = connected ? "#53ffba" : "#ff5c5c";
    pill.querySelector("span:last-child").textContent = connected ? "Conectado" : "Desconectado";
  }
  if (label) {
    label.textContent = connected ? `Porta: ${status.port}` : "Nenhum dispositivo conectado";
  }
  setText("fwValue", status?.fw || "--");
  setText("hwValue", status?.hw || "--");
  setText("ramValue", status?.heapfree || "--");
  setText("tempValue", status?.temp ? `${status.temp} °C` : "--");
  setText("connValue", connected ? (status.supported ? "Compatível" : "Não compatível") : "--");
}

function updatePortHint() {
  const hint = document.getElementById("portHint");
  if (!hint) return;
  hint.textContent = selectedPort ? `Selecionado: ${selectedPort}` : "Selecione um dispositivo abaixo.";
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
  updatePortHint();
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

async function loadActiveTabs() {
  if (!window.pywebview?.api) {
    renderTabs([]);
    return;
  }
  const tabs = await window.pywebview.api.get_active_classes();
  renderTabs(tabs);
}

async function connectSelected() {
  if (!selectedPort || !window.pywebview?.api) return;
  const result = await window.pywebview.api.connect(selectedPort);
  updateStatus(result.status);
  await loadActiveTabs();
}

async function disconnectCurrent() {
  if (!window.pywebview?.api) return;
  const result = await window.pywebview.api.disconnect();
  updateStatus(result.status);
  renderTabs([]);
}

async function saveProfile() {
  if (!window.pywebview?.api || !selectedProfile) return;
  await window.pywebview.api.save_profile_from_board(selectedProfile);
}

async function applyProfile() {
  if (!window.pywebview?.api || !selectedProfile) return;
  await window.pywebview.api.apply_profile_to_board(selectedProfile);
}

async function createProfile() {
  const name = window.prompt("Nome do novo perfil:");
  if (!name || !window.pywebview?.api) return;
  const result = await window.pywebview.api.create_profile(name);
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

async function refreshAll() {
  if (window.pywebview?.api) {
    const schema = await window.pywebview.api.get_ui_schema();
    renderMenu(schema?.menu || fallbackMenu);
  } else {
    renderMenu(fallbackMenu);
  }
  await loadPorts();
  await loadProfiles();
  await loadStatus();
  await loadActiveTabs();
}

document.addEventListener("DOMContentLoaded", async () => {
  await refreshAll();

  document.getElementById("refreshPorts")?.addEventListener("click", loadPorts);
  document.getElementById("connectBtn")?.addEventListener("click", connectSelected);
  document.getElementById("disconnectBtn")?.addEventListener("click", disconnectCurrent);
  document.getElementById("refreshAll")?.addEventListener("click", refreshAll);

  document.getElementById("profileApply")?.addEventListener("click", applyProfile);
  document.getElementById("profileSave")?.addEventListener("click", saveProfile);
  document.getElementById("profileCreate")?.addEventListener("click", createProfile);
  document.getElementById("profileRename")?.addEventListener("click", renameProfile);
  document.getElementById("profileDelete")?.addEventListener("click", deleteProfile);
});
