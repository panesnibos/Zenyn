// lib/nokos.js — pesanan nomor virtual OTP lewat AutoOrder.
// Alur: pembeli bayar QRIS (lib/autopay.js) -> pesanan dibuat di AutoOrder
// pakai saldo owner -> watcher memantau OTP -> kode dikirim ke pembeli.
// File: database/nokos.json  { orders: { [apiId]: {...} } }
const path = require("path");
const config = require("../config");
const logger = require("./logger");
const ao = require("./autoorder");
const { readJson, writeJson } = require("./rpgjson");

const FILE = path.join(__dirname, "../database/nokos.json");
const DAY_MS = 24 * 60 * 60 * 1000;
const BAD = new Set(["cancelled", "canceled", "expired", "failed", "refunded", "error", "rejected"]);

const state = { orders: {} };
let loaded = false;
let clientRef = null;
let timer = null;
let busy = false;
const checking = new Set();

const cfg = () => config.nokos || {};
const enabled = () => cfg().enabled !== false && ao.enabled();
const prefix = () => config.prefixes?.[0] || ".";
const rp = (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;

const load = () => {
  if (loaded) return state;
  const raw = readJson(FILE, {});
  state.orders = raw && typeof raw.orders === "object" && raw.orders ? raw.orders : {};
  loaded = true;
  return state;
};

const save = () => writeJson(FILE, { orders: load().orders });

const parseTime = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  if (!Number.isNaN(t)) return t;
  const n = Number(v);
  return Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : 0;
};

const numDigits = (v) => String(v || "").split("@")[0].split(":")[0].replace(/\D/g, "");
const same = (a, b) => !!numDigits(a) && numDigits(a) === numDigits(b);

const get = (id) => {
  const key = String(id || "").trim().toUpperCase();
  if (!key) return null;
  return (
    Object.values(load().orders).find(
      (o) =>
        String(o.orderId).toUpperCase() === key ||
        String(o.apiId).toUpperCase() === key ||
        String(o.invoiceId || "").toUpperCase() === key
    ) || null
  );
};

const list = (filter) =>
  Object.values(load().orders)
    .filter((o) => !filter || filter(o))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

// harga jual (QRIS) dari harga modal API
const sellPrice = (apiPrice) => {
  const m = cfg().markup || {};
  const raw = Number(apiPrice) * (1 + (Number(m.percent) || 0) / 100) + (Number(m.flat) || 0);
  const rounded = Math.ceil(raw / 100) * 100;
  return Math.max(1000, rounded);
};

const attach = (client) => {
  if (client) clientRef = client;
};

const sendText = async (chat, text) => {
  if (!clientRef || !chat) return;
  try {
    await clientRef.sendMessage(chat, { text });
  } catch (err) {
    logger.warn(`nokos: gagal kirim ${chat}: ${err.message}`);
  }
};

const notifyOwners = async (text) => {
  if (!clientRef) return;
  for (const num of config.owners || []) {
    const jid = String(num).includes("@") ? String(num) : `${num}@s.whatsapp.net`;
    try {
      await clientRef.sendMessage(jid, { text });
    } catch (err) {
      logger.warn(`nokos: notif owner gagal: ${err.message}`);
    }
  }
};

const orderText = (o, head = "STATUS PESANAN") => {
  const left = Math.max(0, Math.round(((o.expiresAt || 0) - Date.now()) / 60000));
  const lines = [
    `*${head}*`,
    "",
    `Order   : ${o.orderId}`,
    `Invoice : ${o.invoiceId || "-"}`,
    `Layanan : ${o.serviceName || "-"}`,
    `Negara  : ${o.country || "-"}`,
    `Paket   : ${o.tier || "-"}`,
    `Nomor   : ${o.phone || "-"}`,
    `Dibayar : ${rp(o.charged)}`,
    `Status  : ${String(o.status || "").toUpperCase()}`,
    o.status === "pending" && left > 0 ? `Sisa    : ${left} menit` : null,
    o.otp ? `Kode OTP: ${o.otp}` : null,
    "",
    o.status === "pending"
      ? `Cek   : ${prefix()}nokoscek ${o.orderId}\nBatal : ${prefix()}nokosbatal ${o.orderId}`
      : null
  ];
  return lines.filter(Boolean).join("\n");
};

// dipanggil autopay setelah QRIS lunas
const createOrder = async (inv) => {
  const r = await ao.nokosOrder({ productId: inv.serviceId, offerId: inv.offerId });
  const apiId = String(r?.id || r?.orderId || "").trim();
  if (!apiId) throw new Error("Respon AutoOrder tidak lengkap (tanpa id pesanan).");

  const rec = {
    apiId,
    orderId: String(r?.orderId || r?.id || apiId),
    invoiceId: inv.id,
    buyer: inv.buyer,
    name: inv.name || "Player",
    chat: inv.chat,
    origin: inv.origin || inv.chat,
    serviceId: inv.serviceId,
    serviceName: r?.serviceName || inv.serviceName || "-",
    offerId: inv.offerId,
    country: r?.countryName || inv.countryName || "",
    countryCode: r?.countryCode || inv.countryCode || "",
    tier: r?.tierLabel || inv.tierLabel || inv.tier || "",
    phone: r?.phoneNumber || "",
    raw: r?.rawPhoneNumber || "",
    apiPrice: Number(r?.price ?? inv.apiPrice) || 0,
    charged: Number(inv.payAmount) || Number(inv.amount) || 0,
    status: "pending",
    otp: "",
    createdAt: Date.now(),
    expiresAt: parseTime(r?.expiresAt) || Date.now() + 20 * 60000,
    cancelAt: parseTime(r?.cancelAvailableAt) || 0,
    next: Date.now() + 6000,
    misses: 0
  };

  load().orders[apiId] = rec;
  save();
  start();
  return rec;
};

const finalize = async (o, status, head) => {
  if (!o || o.status !== "pending") return o;
  o.status = status;
  o.closedAt = Date.now();
  save();

  await sendText(o.chat, orderText(o, head));

  if (status !== "done") {
    await notifyOwners(
      [
        "⚠️ *PESANAN NOMOR GAGAL/EXPIRED*",
        "",
        `Order   : ${o.orderId}`,
        `Invoice : ${o.invoiceId || "-"}`,
        `Pembeli : ${o.buyer}`,
        `Layanan : ${o.serviceName}`,
        `Nominal : ${rp(o.charged)}`,
        "",
        "Pembayaran QRIS sudah masuk ke saldo AutoOrder. Refundkan manual ke pembeli."
      ].join("\n")
    );
  }

  return o;
};

const check = async (o, { force = false } = {}) => {
  if (!o || o.status !== "pending" || checking.has(o.apiId)) return o;
  if (force && Date.now() - (o.last || 0) < 5500) return o;

  checking.add(o.apiId);
  try {
    o.last = Date.now();
    const r = await ao.nokosGet(o.apiId);
    const s = String(r?.status || "").toLowerCase();
    o.misses = 0;

    if (r?.phoneNumber && !o.phone) o.phone = r.phoneNumber;
    if (r?.rawPhoneNumber && !o.raw) o.raw = r.rawPhoneNumber;

    if (s === "completed" || r?.otpCode) {
      o.otp = String(r?.otpCode || "");
      o.status = "done";
      o.closedAt = Date.now();
      save();
      await sendText(
        o.chat,
        `${orderText(o, "KODE OTP MASUK")}${r?.otpMessage ? `\n\nPesan:\n${r.otpMessage}` : ""}`
      );
      logger.ok(`nokos: OTP masuk ${o.orderId} (${o.buyer})`);
    } else if (BAD.has(s)) {
      await finalize(
        o,
        s === "canceled" ? "cancelled" : s,
        s === "expired" ? "PESANAN KEDALUWARSA" : "PESANAN DIBATALKAN"
      );
    } else if (Date.now() > o.expiresAt + 90000) {
      await ao.nokosCancel(o.apiId).catch(() => {});
      await finalize(o, "expired", "PESANAN KEDALUWARSA");
    } else {
      o.next = Date.now() + Math.max(6000, Number(cfg().pollMs ?? 6000));
    }
  } catch (err) {
    if (err.status === 429) {
      o.next = Date.now() + Math.max(6, err.retryAfter || 6) * 1000;
    } else if (err.status === 404) {
      o.misses = (o.misses || 0) + 1;
      o.next = Date.now() + 15000;
      if (o.misses >= 5) await finalize(o, "failed", "PESANAN GAGAL");
    } else {
      logger.warn(`nokos: cek ${o.orderId} gagal: ${err.message}`);
      o.next = Date.now() + 20000;
    }
  } finally {
    checking.delete(o.apiId);
    save();
  }

  return o;
};

const userError = (message) => Object.assign(new Error(message), { user: true });

const cancel = async (o) => {
  if (!o || o.status !== "pending") throw userError("Pesanan ini sudah tidak aktif.");
  if (o.cancelAt && Date.now() < o.cancelAt) {
    throw userError(
      `Belum bisa dibatalkan. Coba lagi dalam ${Math.ceil((o.cancelAt - Date.now()) / 1000)} detik.`
    );
  }
  await ao.nokosCancel(o.apiId);
  await finalize(o, "cancelled", "PESANAN DIBATALKAN");
  return o;
};

const tick = async () => {
  if (busy || !clientRef || !enabled()) return;
  busy = true;
  try {
    const now = Date.now();
    for (const o of list((x) => x.status === "pending" && (x.next || 0) <= now).slice(0, 6)) {
      await check(o);
    }
  } catch (err) {
    logger.warn(`nokos: tick: ${err.message}`);
  } finally {
    busy = false;
  }
};

const start = (client) => {
  if (client) attach(client);
  load();
  if (timer) return;
  const poll = Math.max(6000, Number(cfg().pollMs ?? 6000));
  for (const o of list((x) => x.status === "pending")) o.next = 0;
  timer = setInterval(() => {
    tick().catch(() => {});
  }, poll);
  if (timer.unref) timer.unref();
  logger.info(`nokos: watcher aktif (poll ${poll}ms, ${list((x) => x.status === "pending").length} pesanan)`);
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
  busy = false;
  logger.info("nokos: watcher dihentikan");
};

module.exports = {
  FILE,
  DAY_MS,
  enabled,
  attach,
  get,
  list,
  same,
  sellPrice,
  orderText,
  createOrder,
  check,
  cancel,
  start,
  stop,
  rp
};
