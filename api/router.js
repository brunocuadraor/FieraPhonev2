import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

// En Vercel el filesystem del proyecto es de solo lectura; /tmp sí es escribible.
const TMP_BASE = process.env.TMPDIR || process.env.TEMP || "/tmp";
const DATA_DIR = join(TMP_BASE, "fieraphone-data");
const DB_PATH = join(DATA_DIR, "db.json");

// Vercel puede reutilizar instancias entre requests, así que el Map vive mientras la lambda esté "warm".
const sessions = new Map();

const API_BASE = "/api";

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

async function loadDb() {
  if (!existsSync(DB_PATH)) {
    return { repairs: [], bookings: [], contacts: [], users: [] };
  }
  const raw = await readFile(DB_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return {
    repairs: Array.isArray(parsed.repairs) ? parsed.repairs : [],
    bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
    contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    users: Array.isArray(parsed.users) ? parsed.users : [],
  };
}

async function saveDb(data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function maybeNotifyWebhook(type, payload) {
  const WEBHOOK_URL = process.env.WEBHOOK_URL || "";
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, createdAt: new Date().toISOString() }),
    });
  } catch (error) {
    console.error("Webhook error:", error);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Payload demasiado grande"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("JSON invalido"));
      }
    });
    req.on("error", reject);
  });
}

function buildWhatsAppUrl(message) {
  const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "34600000000";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function hashPassword(password, salt = randomUUID()) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, hash] = storedHash.split(":");
  const computed = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: user.active !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

async function ensureDefaultBoss() {
  const DEFAULT_BOSS_USER = process.env.BOSS_USER || "jefe";
  const DEFAULT_BOSS_PASSWORD = process.env.BOSS_PASSWORD || "CambiaEstaClave123!";

  const db = await loadDb();
  const hasBoss = db.users.some((u) => u.role === "boss" && u.active !== false);
  if (hasBoss) return;

  const now = new Date().toISOString();
  db.users.push({
    id: `USR-${Date.now()}`,
    username: DEFAULT_BOSS_USER,
    role: "boss",
    active: true,
    passwordHash: hashPassword(DEFAULT_BOSS_PASSWORD),
    createdAt: now,
    updatedAt: now,
  });

  await saveDb(db);
  console.log(`Default boss user created: ${DEFAULT_BOSS_USER}`);
}

async function requireAuth(req, res, roles = []) {
  const token = getTokenFromRequest(req);
  if (!token || !sessions.has(token)) {
    sendJson(res, 401, { error: "No autorizado" });
    return null;
  }

  const session = sessions.get(token);
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    sendJson(res, 401, { error: "Sesion expirada" });
    return null;
  }

  if (roles.length && !roles.includes(session.user.role)) {
    sendJson(res, 403, { error: "Permisos insuficientes" });
    return null;
  }

  return session.user;
}

function normalizeRepairStatus(status) {
  const allowed = new Set(["in-progress", "waiting", "done"]);
  return allowed.has(status) ? status : "in-progress";
}

function statusLabelFromCode(status) {
  if (status === "done") return "Listo para recoger";
  if (status === "waiting") return "Esperando pieza";
  return "En reparacion";
}

function buildRepairId(db) {
  const year = new Date().getFullYear();
  const nums = db.repairs
    .map((r) => Number(String(r.id || "").split("-").pop()))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `FP-${year}-${String(next).padStart(4, "0")}`;
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === `${API_BASE}/health`) {
    return sendJson(res, 200, { ok: true, service: "fieraphone-api" });
  }

  if (req.method === "GET" && pathname.startsWith(`${API_BASE}/repairs/`)) {
    const query = decodeURIComponent(pathname.replace(`${API_BASE}/repairs/`, "")).toUpperCase().trim();
    const db = await loadDb();
    const repair = db.repairs.find(
      (r) =>
        r.id.toUpperCase() === query ||
        (r.phone && r.phone.replace(/\D/g, "") === query.replace(/\D/g, ""))
    );
    if (!repair) return sendJson(res, 404, { error: "No encontrado" });
    return sendJson(res, 200, repair);
  }

  if (req.method === "POST" && pathname === `${API_BASE}/bookings`) {
    const body = await readBody(req);
    const required = ["name", "deviceModel", "address"];
    if (required.some((k) => !body[k] || !String(body[k]).trim())) {
      return sendJson(res, 400, { error: "Faltan campos obligatorios" });
    }

    const db = await loadDb();
    const booking = {
      id: `BK-${Date.now()}`,
      name: String(body.name).trim(),
      deviceModel: String(body.deviceModel).trim(),
      address: String(body.address).trim(),
      phone: String(body.phone || "").trim(),
      createdAt: new Date().toISOString(),
      source: "web",
    };

    db.bookings.push(booking);
    await saveDb(db);
    await maybeNotifyWebhook("booking.created", booking);

    const message = [
      "Hola FieraPhone, quiero solicitar una recogida a domicilio.",
      "",
      `Nombre: ${booking.name}`,
      `Modelo de dispositivo: ${booking.deviceModel}`,
      `Direccion de recogida: ${booking.address}`,
      booking.phone ? `Telefono: ${booking.phone}` : "",
      "",
      "Podeis confirmar disponibilidad y franja horaria? Gracias.",
    ]
      .filter(Boolean)
      .join("\n");

    return sendJson(res, 201, { ok: true, bookingId: booking.id, whatsappUrl: buildWhatsAppUrl(message) });
  }

  if (req.method === "POST" && pathname === `${API_BASE}/contacts`) {
    const body = await readBody(req);
    if (!body.type || !body.payload) {
      return sendJson(res, 400, { error: "Faltan datos del formulario" });
    }
    const db = await loadDb();
    const contact = {
      id: `CT-${Date.now()}`,
      type: String(body.type),
      payload: body.payload,
      createdAt: new Date().toISOString(),
      source: "web",
    };
    db.contacts.push(contact);
    await saveDb(db);
    await maybeNotifyWebhook("contact.created", contact);
    return sendJson(res, 201, { ok: true, contactId: contact.id });
  }

  if (req.method === "POST" && pathname === `${API_BASE}/internal/login`) {
    const body = await readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!username || !password) {
      return sendJson(res, 400, { error: "Usuario y clave requeridos" });
    }

    const db = await loadDb();
    const user = db.users.find((u) => u.username.toLowerCase() === username && u.active !== false);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendJson(res, 401, { error: "Credenciales invalidas" });
    }

    const token = randomUUID();
    sessions.set(token, {
      user: sanitizeUser(user),
      expiresAt: Date.now() + 1000 * 60 * 60 * 12,
    });

    return sendJson(res, 200, { ok: true, token, user: sanitizeUser(user) });
  }

  if (req.method === "POST" && pathname === `${API_BASE}/internal/logout`) {
    const token = getTokenFromRequest(req);
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === `${API_BASE}/internal/me`) {
    const user = await requireAuth(req, res, ["boss", "worker"]);
    if (!user) return;
    return sendJson(res, 200, { ok: true, user });
  }

  if (req.method === "GET" && pathname === `${API_BASE}/internal/repairs`) {
    const user = await requireAuth(req, res, ["boss", "worker"]);
    if (!user) return;
    const db = await loadDb();
    const sorted = [...db.repairs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return sendJson(res, 200, { ok: true, repairs: sorted });
  }

  if (req.method === "POST" && pathname === `${API_BASE}/internal/repairs`) {
    const user = await requireAuth(req, res, ["boss", "worker"]);
    if (!user) return;

    const body = await readBody(req);
    const required = ["customerName", "phone", "device", "repair"];
    if (required.some((k) => !String(body[k] || "").trim())) {
      return sendJson(res, 400, { error: "Faltan campos obligatorios" });
    }

    const db = await loadDb();
    const now = new Date().toISOString();
    const status = normalizeRepairStatus(String(body.status || "in-progress"));
    const techName = user.username;

    const newRepair = {
      id: buildRepairId(db),
      customerName: String(body.customerName).trim(),
      phone: String(body.phone).trim(),
      device: String(body.device).trim(),
      repair: String(body.repair).trim(),
      status,
      statusLabel: statusLabelFromCode(status),
      tech: { name: techName, role: user.role === "boss" ? "Jefe" : "Trabajador" },
      steps:
        Array.isArray(body.steps) && body.steps.length
          ? body.steps
          : [
              { n: "Recibido en tienda", t: "Ahora", done: true },
              { n: "Diagnostico completado", t: "Pendiente", pending: true },
              { n: "Reparacion en curso", t: "Pendiente", pending: true },
              { n: "Control de calidad", t: "Pendiente", pending: true },
              { n: "Listo para recoger", t: "Pendiente", pending: true },
            ],
      createdAt: now,
      updatedAt: now,
      createdBy: user.username,
    };

    db.repairs.push(newRepair);
    await saveDb(db);
    return sendJson(res, 201, { ok: true, repair: newRepair });
  }

  if (req.method === "PATCH" && pathname.startsWith(`${API_BASE}/internal/repairs/`)) {
    const user = await requireAuth(req, res, ["boss", "worker"]);
    if (!user) return;

    const id = decodeURIComponent(pathname.replace(`${API_BASE}/internal/repairs/`, ""));
    const body = await readBody(req);
    const db = await loadDb();
    const repair = db.repairs.find((r) => r.id === id);
    if (!repair) return sendJson(res, 404, { error: "Pedido no encontrado" });

    if (body.customerName !== undefined) repair.customerName = String(body.customerName).trim();
    if (body.phone !== undefined) repair.phone = String(body.phone).trim();
    if (body.device !== undefined) repair.device = String(body.device).trim();
    if (body.repair !== undefined) repair.repair = String(body.repair).trim();

    if (body.status !== undefined) {
      repair.status = normalizeRepairStatus(String(body.status));
      repair.statusLabel = statusLabelFromCode(repair.status);
    }

    if (Array.isArray(body.steps)) repair.steps = body.steps;
    repair.updatedAt = new Date().toISOString();
    await saveDb(db);

    return sendJson(res, 200, { ok: true, repair });
  }

  if (req.method === "GET" && pathname === `${API_BASE}/internal/workers`) {
    const user = await requireAuth(req, res, ["boss"]);
    if (!user) return;
    const db = await loadDb();
    const workers = db.users.filter((u) => u.role === "worker").map(sanitizeUser);
    return sendJson(res, 200, { ok: true, workers });
  }

  if (req.method === "POST" && pathname === `${API_BASE}/internal/workers`) {
    const user = await requireAuth(req, res, ["boss"]);
    if (!user) return;

    const body = await readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!username || password.length < 6) {
      return sendJson(res, 400, { error: "Usuario y clave (min 6) requeridos" });
    }

    const db = await loadDb();
    const exists = db.users.some((u) => u.username.toLowerCase() === username);
    if (exists) return sendJson(res, 409, { error: "Ese usuario ya existe" });

    const now = new Date().toISOString();
    const worker = {
      id: `USR-${Date.now()}`,
      username,
      role: "worker",
      active: true,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
      createdBy: user.username,
    };

    db.users.push(worker);
    await saveDb(db);
    return sendJson(res, 201, { ok: true, worker: sanitizeUser(worker) });
  }

  if (req.method === "PATCH" && pathname.startsWith(`${API_BASE}/internal/workers/`)) {
    const user = await requireAuth(req, res, ["boss"]);
    if (!user) return;

    const id = decodeURIComponent(pathname.replace(`${API_BASE}/internal/workers/`, ""));
    const body = await readBody(req);
    const db = await loadDb();
    const worker = db.users.find((u) => u.id === id && u.role === "worker");
    if (!worker) return sendJson(res, 404, { error: "Trabajador no encontrado" });

    if (body.password !== undefined) {
      const pass = String(body.password);
      if (pass.length < 6) return sendJson(res, 400, { error: "La clave debe tener al menos 6 caracteres" });
      worker.passwordHash = hashPassword(pass);
    }

    if (body.active !== undefined) {
      worker.active = Boolean(body.active);
    }

    worker.updatedAt = new Date().toISOString();
    await saveDb(db);

    return sendJson(res, 200, { ok: true, worker: sanitizeUser(worker) });
  }

  return sendJson(res, 404, { error: "Ruta no encontrada" });
}

const initPromise = ensureDefaultBoss().catch((e) => {
  console.error("ensureDefaultBoss failed:", e);
});

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PATCH",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);
    const pathname = url.pathname;

    if (!pathname.startsWith(API_BASE)) {
      return sendJson(res, 404, { error: "Ruta no encontrada" });
    }

    await initPromise;
    return await handleApi(req, res, pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Error interno del servidor" });
  }
}

