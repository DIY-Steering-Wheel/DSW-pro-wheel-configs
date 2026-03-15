const api = window.parent?.pywebview?.api;

async function loadPwmDriver() {
  const nameEl = document.getElementById("pwmDriverName");
  const hint = document.getElementById("pwmHint");
  if (!api) {
    if (hint) hint.textContent = "Sem API";
    return;
  }
  const data = await api.get_class_definitions();
  const driver = data?.driver;
  const current = driver?.current;
  const entry = driver?.classes?.find((item) => item.id === current);
  if (nameEl) nameEl.textContent = entry?.name || "--";
  if (hint) hint.textContent = entry ? "Ativo" : "Sem driver PWM";
}

document.addEventListener("DOMContentLoaded", () => {
  loadPwmDriver();
  document.getElementById("refreshPwm")?.addEventListener("click", loadPwmDriver);
  document.getElementById("applyPwm")?.addEventListener("click", loadPwmDriver);
});
