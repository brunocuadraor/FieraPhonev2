import React, { useEffect, useRef, useState } from "react";

// Este componente fusiona:
// - Estética/UX: `FieraPhone/index.html` + `FieraPhone/styles.css`
// - Lógica/estado/datos: `FieraPhone-main/script.js` (panel interno admin) + APIs `server.js`
//
// Nota: este repo no tiene un build React configurado; el objetivo es darte el "FusionComponent.tsx"
// para que puedas integrarlo en tu app.
import "../FieraPhone/styles.css";

type InternalRole = "boss" | "worker";

type InternalUser = {
  id: string;
  username: string;
  role: InternalRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type InternalRepairStep = {
  n: string;
  t: string;
  done?: boolean;
  pending?: boolean;
  active?: boolean;
};

type InternalRepair = {
  id: string;
  customerName?: string;
  phone?: string;
  device?: string;
  repair?: string;
  status: "in-progress" | "waiting" | "done" | string;
  statusLabel?: string;
  tech?: {
    name: string;
    role: string;
  };
  steps?: InternalRepairStep[];
  createdAt?: string;
  updatedAt?: string;
};

type InternalWorker = {
  id: string;
  username: string;
  role: "worker";
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const API_BASE = "/api";

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function FusionComponent() {
  // -----------------------------
  // UI (B): navegación + animaciones
  // -----------------------------
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) (e.target as Element).classList.add("in");
        });
      },
      { threshold: 0.12 }
    );

    const els = document.querySelectorAll(
      ".card, .step, .stat-box, .nosotros__left, .nosotros__right, .contacto__left, .contacto__right"
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // -----------------------------
  // Cerebro (A): Panel interno + auth + estado + APIs
  // -----------------------------
  const [internalOverlayOpen, setInternalOverlayOpen] = useState(false);
  const [internalView, setInternalView] = useState<"login" | "panel">("login");
  const [internalError, setInternalError] = useState("");

  const internalTokenRef = useRef("");
  const [internalUser, setInternalUser] = useState<InternalUser | null>(null);

  const [repairs, setRepairs] = useState<InternalRepair[]>([]);
  const [workers, setWorkers] = useState<InternalWorker[]>([]);
  const [activeTab, setActiveTab] = useState<"orders" | "workers">("orders");

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const overlayClickCountRef = useRef(0);
  const overlayClickTimerRef = useRef<number | null>(null);

  const internalApi = async (path: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers ? (options.headers as Record<string, string>) : {}),
    };
    if (internalTokenRef.current) headers.Authorization = `Bearer ${internalTokenRef.current}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
      let message = "Error en panel interno";
      try {
        const data = await res.json();
        message = data?.error || message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    return res.json();
  };

  const closeInternalOverlay = () => {
    setInternalOverlayOpen(false);
    setInternalView("login");
    setInternalError("");
  };

  const openInternalOverlay = () => {
    setInternalOverlayOpen(true);
    setInternalView("login");
    setInternalError("");
  };

  const fetchRepairs = async () => {
    const data = await internalApi("/internal/repairs", { method: "GET" });
    setRepairs(Array.isArray(data?.repairs) ? data.repairs : []);
  };

  const fetchWorkers = async () => {
    const data = await internalApi("/internal/workers", { method: "GET" });
    setWorkers(Array.isArray(data?.workers) ? data.workers : []);
  };

  const afterLogin = async (user: InternalUser) => {
    setActiveTab("orders");
    setInternalUser(user);
    await fetchRepairs();
    if (user.role === "boss") await fetchWorkers();
  };

  const onInternalTriggerClick = () => {
    overlayClickCountRef.current += 1;
    if (overlayClickTimerRef.current) window.clearTimeout(overlayClickTimerRef.current);

    overlayClickTimerRef.current = window.setTimeout(() => {
      overlayClickCountRef.current = 0;
    }, 500);

    if (overlayClickCountRef.current >= 3) {
      overlayClickCountRef.current = 0;
      openInternalOverlay();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
        openInternalOverlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // Formulario B: Contacto
  // -----------------------------
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactModel, setContactModel] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);

  const submitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (contactSending || contactSent) return;

    const name = contactName.trim();
    const phone = contactPhone.trim();
    const model = contactModel.trim();
    const message = contactMessage.trim();

    // B no valida "message" como obligatorio, pero el backend tampoco exige estructura.
    if (!name || !phone || !message) {
      alert("Completa nombre, teléfono y el mensaje.");
      return;
    }

    setContactSending(true);
    try {
      const res = await fetch(`${API_BASE}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "contact.message",
          payload: {
            name,
            phone,
            deviceModel: model,
            message,
          },
        }),
      });
      if (!res.ok) {
        let messageText = "No se pudo enviar el mensaje";
        try {
          const data = await res.json();
          messageText = data?.error || messageText;
        } catch {
          // ignore
        }
        throw new Error(messageText);
      }

      setContactSent(true);
      setTimeout(() => {
        setContactSent(false);
        setContactSending(false);
      }, 3500);
    } catch (err: any) {
      setContactSending(false);
      alert(err?.message || "No se pudo enviar");
    }
  };

  // -----------------------------
  // Handlers: Panel interno
  // -----------------------------
  const onInternalLogin = async () => {
    setInternalError("");
    try {
      const data = await internalApi("/internal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });

      const token = data?.token as string;
      const user = data?.user as InternalUser;
      if (!token || !user) throw new Error("Respuesta inválida del servidor");

      internalTokenRef.current = token;
      setInternalView("panel");
      await afterLogin(user);
    } catch (err: any) {
      setInternalError(err?.message || "No se pudo iniciar sesion");
    }
  };

  const onInternalLogout = async () => {
    try {
      await internalApi("/internal/logout", { method: "POST" });
    } catch {
      // ignore
    }
    internalTokenRef.current = "";
    setInternalUser(null);
    setRepairs([]);
    setWorkers([]);
    setActiveTab("orders");
    setInternalView("login");
  };

  const updateRepairStatus = async (repairId: string, action: "progress" | "waiting" | "done") => {
    const nextStatus = action === "progress" ? "in-progress" : action;
    await internalApi(`/internal/repairs/${encodeURIComponent(repairId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    await fetchRepairs();
  };

  const toggleWorkerActive = async (workerId: string, active: boolean) => {
    await internalApi(`/internal/workers/${encodeURIComponent(workerId)}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !active }),
    });
    await fetchWorkers();
  };

  const changeWorkerPassword = async (workerId: string, username: string) => {
    const newPass = prompt(`Nueva clave para ${username} (min 6):`);
    if (!newPass) return;
    await internalApi(`/internal/workers/${encodeURIComponent(workerId)}`, {
      method: "PATCH",
      body: JSON.stringify({ password: newPass }),
    });
    await fetchWorkers();
  };

  const isBoss = internalUser?.role === "boss";

  const styles = `
    /* Fusion overlay interno (usa variables del diseño de FieraPhone/styles.css) */
    .fusion-internal-trigger {
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: 26px;
      height: 26px;
      border-radius: 999px;
      border: none;
      background: transparent;
      opacity: .001;
      cursor: pointer;
      z-index: 9999;
    }

    .fusion-internal-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(8px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
      z-index: 10000;
    }

    .fusion-internal-overlay.show {
      opacity: 1;
      pointer-events: auto;
    }

    .fusion-internal-modal {
      width: min(980px, 96vw);
      background: var(--surface);
      border: var(--border);
      box-shadow: var(--shadow-lg);
      border-radius: 16px;
      padding: 1.15rem;
      transform: translateY(10px) scale(.99);
      transition: transform .18s ease;
      max-height: 85vh;
      overflow: auto;
    }

    .fusion-internal-overlay.show .fusion-internal-modal {
      transform: translateY(0) scale(1);
    }

    .fusion-panel-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: .85rem;
      padding-bottom: .85rem;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .fusion-panel-title {
      font-family: var(--font-display);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .02em;
      margin-bottom: .15rem;
    }

    .fusion-internal-error {
      font-size: .86rem;
      color: rgba(255,155,138,1);
      min-height: 1.2rem;
      margin-bottom: .75rem;
    }

    .fusion-btn-sm {
      padding: .55rem .95rem !important;
      font-size: .88rem !important;
      box-shadow: 6px 6px 0 rgba(255,77,0,.28) !important;
    }

    .fusion-internal-login-grid {
      display: grid;
      gap: .8rem;
      margin-top: .45rem;
    }

    .fusion-internal-input {
      width: 100%;
      padding: .85rem .9rem;
      background: rgba(255,255,255,.06);
      border: 2px solid rgba(255,255,255,.10);
      border-radius: 12px;
      color: #fff;
      outline: none;
      transition: border-color .2s, box-shadow .2s, transform .1s;
      box-shadow: 4px 4px 0 rgba(255,77,0,.15);
    }

    .fusion-internal-input:focus {
      border-color: var(--flame);
      box-shadow: 6px 6px 0 rgba(255,77,0,.35);
      transform: translate(-1px,-1px);
    }

    .fusion-panel-tabs {
      display: flex;
      gap: .55rem;
      margin-bottom: .85rem;
      flex-wrap: wrap;
    }

    .fusion-panel-tab {
      padding: .45rem .85rem;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.15);
      color: rgba(255,255,255,.65);
      font-weight: 800;
      font-size: .78rem;
      text-transform: uppercase;
      letter-spacing: .03em;
    }

    .fusion-panel-tab.active {
      background: var(--flame);
      border-color: var(--flame);
      color: #fff;
    }

    .fusion-panel-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    @media (min-width: 900px) {
      .fusion-panel-grid {
        grid-template-columns: 1.1fr 1.9fr;
      }
    }

    .fusion-panel-card {
      background: rgba(255,255,255,.02);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 14px;
      padding: 1rem;
    }

    .fusion-mini-form {
      display: grid;
      gap: .55rem;
      margin-top: .4rem;
    }

    .fusion-mini-form input,
    .fusion-mini-form select {
      width: 100%;
      background: rgba(255,255,255,.06);
      border: 2px solid rgba(255,255,255,.12);
      border-radius: 12px;
      padding: .75rem .85rem;
      color: #fff;
      outline: none;
      box-shadow: 4px 4px 0 rgba(255,77,0,.16);
    }

    .fusion-mini-form input:focus,
    .fusion-mini-form select:focus {
      border-color: var(--flame);
      box-shadow: 6px 6px 0 rgba(255,77,0,.35);
    }

    .fusion-admin-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: .35rem;
    }

    .fusion-admin-table th,
    .fusion-admin-table td {
      padding: .6rem .55rem;
      border-bottom: 1px solid rgba(255,255,255,.08);
      color: rgba(255,255,255,.85);
      font-size: .82rem;
      vertical-align: top;
    }

    .fusion-admin-table th {
      color: rgba(255,255,255,.52);
      text-align: left;
      font-weight: 800;
    }

    .fusion-admin-actions {
      display: flex;
      gap: .35rem;
      flex-wrap: wrap;
    }

    .fusion-tiny-btn {
      padding: .38rem .55rem;
      border-radius: 8px;
      background: rgba(255,255,255,.08);
      color: #fff;
      border: 1px solid rgba(255,255,255,.12);
      font-size: .75rem;
      cursor: pointer;
      transition: transform .12s, box-shadow .12s;
      box-shadow: 4px 4px 0 rgba(255,77,0,.18);
    }

    .fusion-tiny-btn:hover {
      transform: translate(-2px,-2px);
    }

    .fusion-tiny-btn.warn {
      background: rgba(201,75,31,.22);
      border-color: rgba(201,75,31,.45);
    }
  `;

  return (
    <>
      <style>{styles}</style>

      {/* Panel interno: trigger triple-click (A) */}
      <button
        id="internalTrigger"
        className="fusion-internal-trigger"
        aria-label="Acceso interno"
        onClick={onInternalTriggerClick}
        type="button"
      />

      {/* Panel interno: Overlay + lógica A */}
      <div
        id="internalOverlay"
        className={classNames("fusion-internal-overlay", internalOverlayOpen && "show")}
        role="dialog"
        aria-modal="true"
        aria-hidden={!internalOverlayOpen}
      >
        <div className="fusion-internal-modal">
          {internalView === "login" ? (
            <>
              <div className="fusion-panel-top" style={{ borderBottom: "none", paddingBottom: 0, marginBottom: ".6rem" }}>
                <div>
                  <div className="fusion-panel-title">Acceso interno</div>
                  <small style={{ color: "rgba(255,255,255,.62)" }}>Solo personal autorizado.</small>
                </div>
                <button className="btn btn--ghost fusion-btn-sm" onClick={closeInternalOverlay} type="button">
                  Cerrar
                </button>
              </div>

              <div className="fusion-internal-error">{internalError}</div>

              <div className="fusion-internal-login-grid">
                <input
                  className="fusion-internal-input"
                  placeholder="Usuario"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoComplete="username"
                />
                <input
                  className="fusion-internal-input"
                  placeholder="Clave"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                />
                <button className="btn btn--primary fusion-btn-sm" onClick={onInternalLogin} type="button">
                  Entrar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="fusion-panel-top">
                <div>
                  <div className="fusion-panel-title">Panel interno</div>
                  <small id="internalRoleInfo">
                    {internalUser
                      ? `Usuario: ${internalUser.username} (${internalUser.role === "boss" ? "jefe" : "trabajador"})`
                      : ""}
                  </small>
                </div>

                <div style={{ display: "flex", gap: ".55rem", flexWrap: "wrap" }}>
                  <button className="btn btn--ghost fusion-btn-sm" onClick={onInternalLogout} type="button">
                    Salir
                  </button>
                  <button className="btn btn--ghost fusion-btn-sm" onClick={closeInternalOverlay} type="button">
                    Ocultar
                  </button>
                </div>
              </div>

              <div className="fusion-panel-tabs">
                <button
                  id="tabOrdersBtn"
                  className={classNames("fusion-panel-tab", activeTab === "orders" && "active")}
                  type="button"
                  onClick={() => setActiveTab("orders")}
                >
                  Pedidos
                </button>
                {isBoss ? (
                  <button
                    id="tabWorkersBtn"
                    className={classNames("fusion-panel-tab", activeTab === "workers" && "active")}
                    type="button"
                    onClick={() => setActiveTab("workers")}
                  >
                    Trabajadores
                  </button>
                ) : null}
              </div>

              {activeTab === "orders" ? (
                <div className="fusion-panel-grid" id="ordersTab">
                  <div className="fusion-panel-card">
                    <h4 style={{ marginBottom: ".5rem", fontFamily: "var(--font-heading)", fontWeight: 800 }}>Nuevo pedido</h4>
                    <form
                      className="fusion-mini-form"
                      id="repairCreateForm"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setInternalError("");
                        try {
                          const fd = new FormData(e.currentTarget);
                          const payload: Record<string, string> = {};
                          for (const [k, v] of fd.entries()) {
                            payload[k] = String(v ?? "");
                          }
                          await internalApi("/internal/repairs", {
                            method: "POST",
                            body: JSON.stringify({
                              customerName: payload.customerName,
                              phone: payload.phone,
                              device: payload.device,
                              repair: payload.repair,
                              status: payload.status,
                            }),
                          });
                          (e.currentTarget as HTMLFormElement).reset();
                          await fetchRepairs();
                        } catch (err: any) {
                          setInternalError(err?.message || "No se pudo crear pedido");
                        }
                      }}
                    >
                      <input name="customerName" placeholder="Cliente" required />
                      <input name="phone" placeholder="Telefono" required />
                      <input name="device" placeholder="Dispositivo" required />
                      <input name="repair" placeholder="Averia / trabajo" required />
                      <select name="status" defaultValue="in-progress">
                        <option value="in-progress">En reparacion</option>
                        <option value="waiting">Esperando pieza</option>
                        <option value="done">Finalizado</option>
                      </select>
                      <button className="btn btn--primary fusion-btn-sm" type="submit">
                        Crear pedido
                      </button>
                    </form>
                  </div>

                  <div className="fusion-panel-card">
                    <h4 style={{ marginBottom: ".5rem", fontFamily: "var(--font-heading)", fontWeight: 800 }}>
                      Gestion de pedidos
                    </h4>
                    <table className="fusion-admin-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Cliente</th>
                          <th>Dispositivo</th>
                          <th>Estado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody id="internalRepairsBody">
                        {repairs.map((r) => (
                          <tr key={r.id}>
                            <td style={{ color: "rgba(255,255,255,.9)" }}>{r.id}</td>
                            <td>{r.customerName || "-"}</td>
                            <td>{r.device || "-"}</td>
                            <td>{r.statusLabel || r.status}</td>
                            <td>
                              <div className="fusion-admin-actions">
                                <button
                                  className="fusion-tiny-btn"
                                  type="button"
                                  onClick={() => updateRepairStatus(r.id, "progress")}
                                >
                                  En reparacion
                                </button>
                                <button
                                  className="fusion-tiny-btn"
                                  type="button"
                                  onClick={() => updateRepairStatus(r.id, "waiting")}
                                >
                                  Esperando pieza
                                </button>
                                <button
                                  className="fusion-tiny-btn warn"
                                  type="button"
                                  onClick={() => updateRepairStatus(r.id, "done")}
                                >
                                  Finalizar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {repairs.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ color: "rgba(255,255,255,.6)" }}>
                              No hay pedidos.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="fusion-panel-card" id="workersTab">
                  <h4 style={{ marginBottom: ".5rem", fontFamily: "var(--font-heading)", fontWeight: 800 }}>
                    Trabajadores
                  </h4>

                  <form
                    className="fusion-mini-form"
                    id="workerCreateForm"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setInternalError("");
                      try {
                        const fd = new FormData(e.currentTarget);
                        const payload: Record<string, string> = {};
                        for (const [k, v] of fd.entries()) {
                          payload[k] = String(v ?? "");
                        }
                        await internalApi("/internal/workers", {
                          method: "POST",
                          body: JSON.stringify({
                            username: payload.username,
                            password: payload.password,
                          }),
                        });
                        (e.currentTarget as HTMLFormElement).reset();
                        await fetchWorkers();
                      } catch (err: any) {
                        setInternalError(err?.message || "No se pudo crear trabajador");
                      }
                    }}
                  >
                    <input name="username" placeholder="Usuario trabajador" required />
                    <input name="password" type="password" placeholder="Clave inicial (min 6)" required />
                    <button className="btn btn--primary fusion-btn-sm" type="submit">
                      Crear trabajador
                    </button>
                  </form>

                  <table className="fusion-admin-table" style={{ marginTop: ".85rem" }}>
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody id="internalWorkersBody">
                      {workers.map((w) => (
                        <tr key={w.id}>
                          <td>{w.username}</td>
                          <td>{w.active ? "Activo" : "Desactivado"}</td>
                          <td>
                            <div className="fusion-admin-actions">
                              <button
                                className="fusion-tiny-btn"
                                type="button"
                                onClick={() => toggleWorkerActive(w.id, w.active)}
                              >
                                {w.active ? "Desactivar" : "Activar"}
                              </button>
                              <button
                                className="fusion-tiny-btn warn"
                                type="button"
                                onClick={() => changeWorkerPassword(w.id, w.username)}
                              >
                                Cambiar clave
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {workers.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ color: "rgba(255,255,255,.6)" }}>
                            No hay trabajadores.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* -----------------------------
          UX (B): marketing page
         ----------------------------- */}
      <nav className="nav" role="navigation" aria-label="Principal">
        <a href="#" className="nav__logo" onClick={(e) => e.preventDefault()}>
          FIERA<span>PHONE</span>
        </a>

        <ul className={classNames("nav__links", navOpen && "nav__links--open")}>
          <li>
            <a
              href="#servicios"
              onClick={(e) => {
                e.preventDefault();
                setNavOpen(false);
                document.querySelector("#servicios")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Servicios
            </a>
          </li>
          <li>
            <a
              href="#nosotros"
              onClick={(e) => {
                e.preventDefault();
                setNavOpen(false);
                document.querySelector("#nosotros")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Nosotros
            </a>
          </li>
          <li>
            <a
              href="#proceso"
              onClick={(e) => {
                e.preventDefault();
                setNavOpen(false);
                document.querySelector("#proceso")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Proceso
            </a>
          </li>
          <li>
            <a
              href="#contacto"
              onClick={(e) => {
                e.preventDefault();
                setNavOpen(false);
                document.querySelector("#contacto")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Contacto
            </a>
          </li>
        </ul>

        <a
          href="#contacto"
          className="btn btn--nav"
          onClick={(e) => {
            e.preventDefault();
            setNavOpen(false);
            document.querySelector("#contacto")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          PIDE CITA YA
        </a>

        <button
          className={classNames("nav__burger", navOpen && "nav__burger--active")}
          aria-label="Menú"
          onClick={() => setNavOpen((v) => !v)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      <section className="hero">
        <div className="hero__bg-text" aria-hidden="true">
          FIERA
        </div>
        <div className="hero__sticker hero__sticker--1" aria-hidden="true">
          🔥
        </div>
        <div className="hero__sticker hero__sticker--2" aria-hidden="true">
          ⚡
        </div>
        <div className="hero__content">
          <div className="hero__badge">REPARACIÓN SALVAJE</div>
          <h1 className="hero__title">
            TU MÓVIL<br />
            <span className="hero__title--orange" style={{ color: "#C94B1F", fontWeight: 800 }}>MERECE</span>
            <br />
            UNA FIERA
          </h1>
          <p className="hero__sub">
            Reparamos lo que otros no se atreven a tocar.
            <br />
            Pantallas, baterías, placas — sin miedo.
          </p>
          <div className="hero__actions">
            <a
              href="#contacto"
              className="btn btn--primary"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector("#contacto")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              REPARA AHORA →
            </a>
            <a
              href="#servicios"
              className="btn btn--ghost"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector("#servicios")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              VER SERVICIOS
            </a>
          </div>
        </div>

        <div className="hero__visual">
          <div className="hero__phone">
            <div className="hero__phone-screen">
              <div className="hero__phone-notch" />
              <span className="hero__phone-emoji">🔧</span>
              <p className="hero__phone-text">SOS</p>
            </div>
          </div>
          <div className="hero__float hero__float--1">EXPRESS</div>
          <div className="hero__float hero__float--2">30 MIN</div>
          <div className="hero__float hero__float--3">GARANTÍA</div>
        </div>
      </section>

      <div className="marquee">
        <div className="marquee__track">
          <span>
            PANTALLAS ★ BATERÍAS ★ PLACAS BASE ★ CÁMARAS ★ PUERTOS DE CARGA ★ SOFTWARE ★ WATER DAMAGE ★
            MICRO-SOLDADURA ★{" "}
          </span>
          <span>
            PANTALLAS ★ BATERÍAS ★ PLACAS BASE ★ CÁMARAS ★ PUERTOS DE CARGA ★ SOFTWARE ★ WATER DAMAGE ★
            MICRO-SOLDADURA ★{" "}
          </span>
        </div>
      </div>

      <section className="servicios" id="servicios">
        <div className="servicios__header">
          <p className="tag">LO QUE HACEMOS</p>
          <h2 className="title">
            SERVICIOS
            <br />
            <span className="title--alt">BESTIALES</span>
          </h2>
        </div>

        <div className="servicios__grid">
          <article className="card" style={{ ["--card-bg" as any]: "#FF6B6B" } as React.CSSProperties}>
            <div className="card__head">
              <span className="card__icon">📱</span>
              <span className="card__num">01</span>
            </div>
            <h3 className="card__title">PANTALLAS</h3>
            <p className="card__text">Originales y OLED. En 30 min tu pantalla como nueva, sin excusas.</p>
            <a href="#contacto" className="card__link">
              Reparar →
            </a>
          </article>

          <article className="card" style={{ ["--card-bg" as any]: "#FFD23F" } as React.CSSProperties}>
            <div className="card__head">
              <span className="card__icon">🔋</span>
              <span className="card__num">02</span>
            </div>
            <h3 className="card__title">BATERÍAS</h3>
            <p className="card__text">Tu móvil no debería morir antes que tú. Baterías certificadas al instante.</p>
            <a href="#contacto" className="card__link">
              Reparar →
            </a>
          </article>

          <article className="card" style={{ ["--card-bg" as any]: "#A8FF00" } as React.CSSProperties}>
            <div className="card__head">
              <span className="card__icon">🔧</span>
              <span className="card__num">03</span>
            </div>
            <h3 className="card__title">PLACA BASE</h3>
            <p className="card__text">Micro-soldadura de nivel quirúrgico. Resucitamos lo imposible.</p>
            <a href="#contacto" className="card__link">
              Reparar →
            </a>
          </article>

          <article className="card" style={{ ["--card-bg" as any]: "#6BDDFF" } as React.CSSProperties}>
            <div className="card__head">
              <span className="card__icon">💧</span>
              <span className="card__num">04</span>
            </div>
            <h3 className="card__title">WATER DAMAGE</h3>
            <p className="card__text">¿Se cayó al agua? No entres en pánico. Lo rescatamos del abismo.</p>
            <a href="#contacto" className="card__link">
              Reparar →
            </a>
          </article>

          <article className="card" style={{ ["--card-bg" as any]: "#FF9FF3" } as React.CSSProperties}>
            <div className="card__head">
              <span className="card__icon">📷</span>
              <span className="card__num">05</span>
            </div>
            <h3 className="card__title">CÁMARAS</h3>
            <p className="card__text">Fotos borrosas nunca más. Módulos frontales y traseros al instante.</p>
            <a href="#contacto" className="card__link">
              Reparar →
            </a>
          </article>

          <article className="card" style={{ ["--card-bg" as any]: "#FFD23F" } as React.CSSProperties}>
            <div className="card__head">
              <span className="card__icon">⚡</span>
              <span className="card__num">06</span>
            </div>
            <h3 className="card__title">CARGA</h3>
            <p className="card__text">USB-C, Lightning, inalámbrica. Todo lo que conecta, lo arreglamos.</p>
            <a href="#contacto" className="card__link">
              Reparar →
            </a>
          </article>
        </div>
      </section>

      <section className="nosotros" id="nosotros">
        <div className="nosotros__left">
          <p className="tag">QUIÉNES SOMOS</p>
          <h2 className="title">
            NO SOMOS
            <br />
            UN TALLER
            <br />
            <span className="title--alt">CUALQUIERA</span>
          </h2>
          <p className="nosotros__text">
            Somos la fiera que tu dispositivo necesita. Nacimos con la misión de hacer reparaciones brutales a
            precios justos y en tiempo récord. Cada técnico de FieraPhone tiene más de 5 años domando circuitos.
          </p>
          <div className="nosotros__badges">
            <span className="pill">🔥 +5 Años XP</span>
            <span className="pill">⚡ Piezas Originales</span>
            <span className="pill">💪 Sin Miedo</span>
          </div>
        </div>

        <div className="nosotros__right">
          <div className="stat-box" style={{ ["--stat-bg" as any]: "#FFD23F" } as React.CSSProperties}>
            <span className="stat-box__num">12K+</span>
            <span className="stat-box__label">
              Móviles
              <br />
              reparados
            </span>
          </div>
          <div className="stat-box" style={{ ["--stat-bg" as any]: "#FF6B6B" } as React.CSSProperties}>
            <span className="stat-box__num">30'</span>
            <span className="stat-box__label">
              Reparación
              <br />
              media
            </span>
          </div>
          <div className="stat-box" style={{ ["--stat-bg" as any]: "#A8FF00" } as React.CSSProperties}>
            <span className="stat-box__num">98%</span>
            <span className="stat-box__label">
              Clientes
              <br />
              satisfechos
            </span>
          </div>
          <div className="stat-box" style={{ ["--stat-bg" as any]: "#6BDDFF" } as React.CSSProperties}>
            <span className="stat-box__num">6</span>
            <span className="stat-box__label">
              Meses de
              <br />
              garantía
            </span>
          </div>
        </div>
      </section>

      <section className="proceso" id="proceso">
        <div className="proceso__header">
          <p className="tag">ASÍ TRABAJAMOS</p>
          <h2 className="title">
            PROCESO
            <br />
            <span className="title--alt">SALVAJE</span>
          </h2>
        </div>

        <div className="proceso__steps">
          <div className="step" style={{ ["--step-bg" as any]: "#FFD23F" } as React.CSSProperties}>
            <div className="step__num">01</div>
            <div className="step__icon">🔍</div>
            <h3 className="step__title">DIAGNÓSTICO GRATIS</h3>
            <p className="step__text">Trae tu móvil, lo analizamos en el acto sin coste.</p>
          </div>

          <div className="step" style={{ ["--step-bg" as any]: "#FF6B6B" } as React.CSSProperties}>
            <div className="step__num">02</div>
            <div className="step__icon">💰</div>
            <h3 className="step__title">PRESUPUESTO AL INSTANTE</h3>
            <p className="step__text">Sin sorpresas. Precio cerrado antes de tocar nada.</p>
          </div>

          <div className="step" style={{ ["--step-bg" as any]: "#A8FF00" } as React.CSSProperties}>
            <div className="step__num">03</div>
            <div className="step__icon">🛠️</div>
            <h3 className="step__title">REPARACIÓN EXPRESS</h3>
            <p className="step__text">La mayoría de reparaciones en menos de 1 hora.</p>
          </div>

          <div className="step" style={{ ["--step-bg" as any]: "#6BDDFF" } as React.CSSProperties}>
            <div className="step__num">04</div>
            <div className="step__icon">🎉</div>
            <h3 className="step__title">RECOGE & DISFRUTA</h3>
            <p className="step__text">Tu móvil como nuevo con 6 meses de garantía.</p>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="cta__box">
          <h2 className="cta__title">¿TU MÓVIL<br />ESTÁ ROTO?</h2>
          <p className="cta__sub">No sufras más. Tráelo a la fiera.</p>
          <a
            href="#contacto"
            className="btn btn--cta"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector("#contacto")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            CONTACTAR AHORA →
          </a>
        </div>
      </section>

      <section className="contacto" id="contacto">
        <div className="contacto__left">
          <p className="tag">ESCRÍBENOS</p>
          <h2 className="title">
            PIDE TU
            <br />
            <span className="title--alt">CITA</span>
          </h2>
          <div className="contacto__info">
            <div className="info-row">📍 Calle de la Fiera, 42 — Madrid</div>
            <div className="info-row">📞 +34 612 345 678</div>
            <div className="info-row">🕐 Lun – Sáb: 10:00 – 20:00</div>
          </div>
        </div>

        <div className="contacto__right">
          <form className="form" onSubmit={submitContact}>
            <input
              type="text"
              placeholder="Tu nombre"
              className="form__input"
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              disabled={contactSending}
            />
            <input
              type="tel"
              placeholder="Teléfono"
              className="form__input"
              required
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              disabled={contactSending}
            />
            <input
              type="text"
              placeholder="Modelo del móvil"
              className="form__input"
              value={contactModel}
              onChange={(e) => setContactModel(e.target.value)}
              disabled={contactSending}
            />
            <textarea
              placeholder="¿Qué le pasa a tu fiera?"
              className="form__input form__textarea"
              rows={4}
              required
              value={contactMessage}
              onChange={(e) => setContactMessage(e.target.value)}
              disabled={contactSending}
            />

            <button type="submit" className="btn btn--submit" disabled={contactSending || contactSent}>
              {contactSent ? "✓ Mensaje enviado" : contactSending ? "Enviando..." : "ENVIAR RUGIDO 🔥"}
            </button>
          </form>
        </div>
      </section>

      <footer className="footer">
        <div className="footer__top">
          <a href="#" className="footer__logo" onClick={(e) => e.preventDefault()}>
            FIERA<span>PHONE</span>
          </a>
          <ul className="footer__links">
            <li>
              <a
                href="#servicios"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector("#servicios")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Servicios
              </a>
            </li>
            <li>
              <a
                href="#nosotros"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector("#nosotros")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Nosotros
              </a>
            </li>
            <li>
              <a
                href="#proceso"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector("#proceso")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Proceso
              </a>
            </li>
            <li>
              <a
                href="#contacto"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector("#contacto")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Contacto
              </a>
            </li>
          </ul>
        </div>
        <div className="footer__bottom">
          <p>&copy; 2026 FieraPhone. Todos los derechos reservados.</p>
        </div>
      </footer>
    </>
  );
}

