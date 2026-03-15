const api = window.parent?.pywebview?.api;

async function loadEncoder() {
  const select = document.getElementById("encoderSelect");
  const hint = document.getElementById("encoderHint");
  if (!api || !select) {
    if (hint) hint.textContent = "Sem API";
    return;
  }
  const data = await api.get_class_definitions();
  const options = data?.encoder?.classes || [];
  const current = data?.encoder?.current;
  select.innerHTML = "";
  if (options.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem classes";
    select.appendChild(opt);
    if (hint) hint.textContent = "Sem classes";
    return;
  }
  options.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = entry.id;
    opt.textContent = entry.name || `Classe ${entry.id}`;
    if (entry.id === current) opt.selected = true;
    select.appendChild(opt);
  });
  if (hint) hint.textContent = "Pronto";
}

async function applyEncoder() {
  const select = document.getElementById("encoderSelect");
  const hint = document.getElementById("encoderHint");
  if (!api || !select) return;
  const value = parseInt(select.value, 10);
  if (Number.isNaN(value)) return;
  await api.serial_set_value("axis", "enctype", value, 0, null);
  if (hint) hint.textContent = "Aplicado";
}

document.addEventListener("DOMContentLoaded", () => {
  loadEncoder();
  document.getElementById("refreshEncoder")?.addEventListener("click", loadEncoder);
  document.getElementById("applyEncoder")?.addEventListener("click", applyEncoder);
});
