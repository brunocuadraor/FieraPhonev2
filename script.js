const API_BASE = "/api";
let internalToken = "";
let internalUser = null;

function getEl(id) {
  return document.getElementById(id);
}

async function internalApi(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (internalToken) headers.Authorization = `Bearer ${internalToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = "Error en panel interno";
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

function openOverlay() {
  getEl("internalOverlay").classList.add("show");
}

function closeOverlay() {
  getEl("internalOverlay").classList.remove("show");
}

function setInternalError(message) {
  const errorEl = getEl("internalError");
  if (errorEl) errorEl.textContent = message || "";
}

function showLogin() {
  getEl("internalLogin").classList.remove("hidden");
  getEl("internalPanel").classList.add("hidden");
}

function showPanel() {
  getEl("internalLogin").classList.add("hidden");
  getEl("internalPanel").classList.remove("hidden");
}

function updateRoleUi() {
  const isBoss = internalUser?.role === "boss";
  getEl("internalRoleInfo").textContent = `Usuario: ${internalUser?.username || "-"} (${isBoss ? "jefe" : "trabajador"})`;
  getEl("tabWorkersBtn").classList.toggle("hidden", !isBoss);
}

async function renderRepairs() {
  const body = getEl("internalRepairsBody");
  body.innerHTML = "";
  const data = await internalApi("/internal/repairs");
  data.repairs.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${r.customerName || "-"}</td>
      <td>${r.device}</td>
      <td>${r.statusLabel || r.status}</td>
      <td>
        <div class="admin-actions">
          <button class="tiny-btn" data-action="progress">En reparacion</button>
          <button class="tiny-btn" data-action="waiting">Esperando pieza</button>
          <button class="tiny-btn warn" data-action="done">Finalizar</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const nextStatus = btn.dataset.action === "progress" ? "in-progress" : btn.dataset.action;
        await internalApi(`/internal/repairs/${encodeURIComponent(r.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        });
        await renderRepairs();
      });
    });
    body.appendChild(tr);
  });
}

async function renderWorkers() {
  if (internalUser?.role !== "boss") return;
  const body = getEl("internalWorkersBody");
  body.innerHTML = "";
  const data = await internalApi("/internal/workers");
  data.workers.forEach((w) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${w.username}</td>
      <td>${w.active ? "Activo" : "Desactivado"}</td>
      <td>
        <div class="admin-actions">
          <button class="tiny-btn" data-action="toggle">${w.active ? "Desactivar" : "Activar"}</button>
          <button class="tiny-btn warn" data-action="pass">Cambiar clave</button>
        </div>
      </td>
    `;
    tr.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
      await internalApi(`/internal/workers/${encodeURIComponent(w.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !w.active }),
      });
      await renderWorkers();
    });
    tr.querySelector('[data-action="pass"]').addEventListener("click", async () => {
      const newPass = prompt(`Nueva clave para ${w.username} (min 6):`);
      if (!newPass) return;
      await internalApi(`/internal/workers/${encodeURIComponent(w.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPass }),
      });
      alert("Clave actualizada.");
    });
    body.appendChild(tr);
  });
}

async function afterLogin() {
  updateRoleUi();
  showPanel();
  await renderRepairs();
  if (internalUser?.role === "boss") await renderWorkers();
}

function setupInternalAccess() {
  const trigger = getEl("internalTrigger");
  const overlay = getEl("internalOverlay");
  if (!trigger || !overlay) return;

  let clickCount = 0;
  let clickTimer = null;

  trigger.addEventListener("click", () => {
    clickCount += 1;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickCount = 0;
    }, 500);
    if (clickCount >= 3) {
      clickCount = 0;
      setInternalError("");
      openOverlay();
      showLogin();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
      setInternalError("");
      openOverlay();
      showLogin();
    }
  });

  getEl("internalCloseLogin").addEventListener("click", closeOverlay);
  getEl("internalClosePanel").addEventListener("click", closeOverlay);

  getEl("internalLoginBtn").addEventListener("click", async () => {
    setInternalError("");
    const username = getEl("internalUser").value.trim();
    const password = getEl("internalPass").value;
    try {
      const data = await internalApi("/internal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      internalToken = data.token;
      internalUser = data.user;
      await afterLogin();
    } catch (error) {
      setInternalError(error.message || "No se pudo iniciar sesion");
    }
  });

  getEl("internalLogoutBtn").addEventListener("click", async () => {
    try {
      await internalApi("/internal/logout", { method: "POST" });
    } catch {}
    internalToken = "";
    internalUser = null;
    showLogin();
  });

  getEl("repairCreateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    try {
      await internalApi("/internal/repairs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      e.currentTarget.reset();
      await renderRepairs();
    } catch (error) {
      alert(error.message || "No se pudo crear");
    }
  });

  getEl("workerCreateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (internalUser?.role !== "boss") return;
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    try {
      await internalApi("/internal/workers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      e.currentTarget.reset();
      await renderWorkers();
    } catch (error) {
      alert(error.message || "No se pudo crear trabajador");
    }
  });

  getEl("tabOrdersBtn").addEventListener("click", () => {
    getEl("tabOrdersBtn").classList.add("active");
    getEl("tabWorkersBtn").classList.remove("active");
    getEl("ordersTab").classList.remove("hidden");
    getEl("workersTab").classList.add("hidden");
  });

  getEl("tabWorkersBtn").addEventListener("click", () => {
    getEl("tabWorkersBtn").classList.add("active");
    getEl("tabOrdersBtn").classList.remove("active");
    getEl("workersTab").classList.remove("hidden");
    getEl("ordersTab").classList.add("hidden");
  });
}

document.addEventListener("DOMContentLoaded", setupInternalAccess);
