// lib/autoorder.js — client API AutoOrder v2 (deposit QRIS).
// Key HANYA dikirim ke baseUrl sebagai header X-API-Key. Jangan pernah commit key.
const fetch = require("node-fetch");
const QRCode = require("qrcode");
const config = require("../config");

const DEFAULT_BASE = "https://auto-order.alxzyy.my.id/api/v2";
const TIMEOUT_MS = 20000;

const cfg = () => config.autoorder || {};
const apiKey = () => String(process.env.AUTOORDER_API_KEY || cfg().apiKey || "").trim();
const enabled = () => !!apiKey();
const baseUrl = () => String(cfg().base || DEFAULT_BASE).replace(/\/+$/, "");

class AOError extends Error {
  constructor(message, { status = 0, code = "", retryAfter = 0 } = {}) {
    super(message);
    this.name = "AOError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const call = async (method, path, { data, timeout = TIMEOUT_MS } = {}) => {
  if (!enabled()) {
    throw new AOError("API key AutoOrder belum diatur (env AUTOORDER_API_KEY).", { code: "NO_KEY" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "X-API-Key": apiKey(),
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: data ? JSON.stringify(data) : undefined
    });

    const raw = await res.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { message: raw.slice(0, 200) };
    }

    if (res.ok && body.success !== false) {
      return body.data !== undefined ? body.data : body;
    }

    const retryAfter =
      Number(body.retry_after ?? body.retryAfter ?? res.headers.get("retry-after")) || 0;

    throw new AOError(String(body.message || body.error || `HTTP ${res.status}`), {
      status: res.status,
      code: String(body.code || ""),
      retryAfter
    });
  } catch (err) {
    if (err instanceof AOError) throw err;
    if (err.name === "AbortError") throw new AOError("AutoOrder timeout", { code: "TIMEOUT" });
    throw new AOError(`Tidak bisa terhubung ke AutoOrder (${err.message})`, { code: "NETWORK" });
  } finally {
    clearTimeout(timer);
  }
};

const account = () => call("GET", "/account");
const balance = () => call("GET", "/account/balance");

const createDeposit = (amount, referenceId) =>
  call("POST", "/deposit", {
    data: {
      amount: Math.round(Number(amount) || 0),
      ...(referenceId ? { reference_id: String(referenceId).slice(0, 100) } : {})
    }
  });

const getDeposit = (id) => call("GET", `/deposit/${encodeURIComponent(id)}`);
const cancelDeposit = (id) => call("POST", `/deposit/${encodeURIComponent(id)}/cancel`);

// Render QRIS string lokal (tanpa layanan luar) -> PNG buffer.
const qrBuffer = (text) =>
  QRCode.toBuffer(String(text), {
    type: "png",
    width: 720,
    margin: 2,
    errorCorrectionLevel: "M"
  });

module.exports = {
  AOError,
  cfg,
  enabled,
  baseUrl,
  account,
  balance,
  createDeposit,
  getDeposit,
  cancelDeposit,
  qrBuffer
};
