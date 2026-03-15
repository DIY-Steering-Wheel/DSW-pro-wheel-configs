const api = window.parent?.pywebview?.api;

async function loadFfb() {
  const statusEl = document.getElementById("ffbStatusLocal");
  const dot = document.getElementById("ffbDotLocal");
  const cf = document.getElementById("ffbCfRate");
  if (!api) {
    if (statusEl) statusEl.textContent = "Sem API";
    return;
  }
  const data = await api.get_ffb_status();
  if (!data?.ok) {
    if (statusEl) statusEl.textContent = "0 Hz";
    if (dot) dot.classList.remove("active");
    if (cf) cf.textContent = "--";
    return;
  }
  if (statusEl) statusEl.textContent = data.active ? `${data.rate} Hz` : `${data.rate} Hz`;
  if (cf) cf.textContent = `${data.cfrate} Hz`;
  if (dot) dot.classList.toggle("active", data.active && data.rate > 0);
}

document.addEventListener("DOMContentLoaded", () => {
  loadFfb();
  document.getElementById("refreshFfb")?.addEventListener("click", loadFfb);
  document.getElementById("applyFfb")?.addEventListener("click", loadFfb);
});
