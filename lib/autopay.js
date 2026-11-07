// lib/autopay.js — mesin pembayaran QRIS otomatis (AutoOrder).
// Jenis tagihan: 'premium' (paket berbatas hari). Tagihan disimpan di
// database/autopay.json supaya pemantauan lanjut setelah bot restart.
const path = require("path");
const crypto = require("crypto");
const config = require("../config");
const logger = require("./logger");
const ao = require("./autoorder");
const { db } = require("./rpgdb");
const { readJson, writeJson } = require("./rpgjson");
const { PERMANENT } = require("./rpglimit");
const { timeWIB } = require("./stamp");

const FILE = path.join(__dirname, "../database/autopay.json");
const DAY_MS = 24 * 60 * 60 * 1000;

const state = { invoices: {} };
let loaded = false;

const load = () => {
  if (loaded) return state;
  const data = readJson(FILE, {});
  state.invoices = data && typeof data === "object" && data.invoices ? data.invoices : {};
  loaded = true;
  return state;
};

const save = () => writeJson(FILE, { invoices: load().invoices });

const rp = (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
const prefix = () => config.prefixes?.[0] || ".";

const get = (id) => load().invoices[String(id || "").toUpperCase()] || null;
const list = (filter) =>
  Object.values(load().invoices)
    .filter((i) => !filter || filter(i))
    .sort((a, b) => b.createdAt - a.createdAt);
const pending = () => list((i) => i.status === "pending");

const parseTime = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  if (!Number.isNaN(t)) return t;
  const n = Number(v);
  return Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : 0;
};

const leftText = (ms) => {
  const s = Math.max(0, Math.round((ms - Date.now()) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} menit ${s % 60} detik` : `${s} detik`;
};

const fmtUntil = (until) =>
  until === PERMANENT || until === null
    ? "Selamanya"
    : new Date(until).toLocaleString("id-ID");

// ---------- pengiriman pesan (aman tanpa ctx command) ----------
let clientRef = null;
const attach = (client) => {
  if (client) clientRef = client;
};

const sendText = async (client, chat, text) => {
  const c = client || clientRef;
  if (!c || !chat) return;
  try {
    await c.sendMessage(chat, { text });
  } catch (err) {
    logger.warn(`autopay: gagal kirim ${chat}: ${err.message}`);
  }
};

const notifyOwners = async (text) => {
  for (const num of config.owners || []) {
    const jid = String(num).includes("@") ? String(num) : `${num}@s.whatsapp.net`;
    await sendText(null, jid, text);
  }
};

// ---------- teks tagihan ----------
const invoiceText = (inv, header = "TAGIHAN QRIS") => {
  const lines = [
    `*${header}*`,
    "",
    `Invoice : ${inv.id}`,
    `Paket   : ${inv.title}`,
    `Nominal : ${rp(inv.amount)}`,
    inv.fee > 0 ? `Biaya   : ${rp(inv.fee)}` : null,
    `Total   : ${rp(inv.payAmount || inv.amount)}`,
    `Status  : ${String(inv.status).toUpperCase()}`,
    inv.status === "pending"
      ? `Berlaku : ${timeWIB(new Date(inv.expiresAt))} (${leftText(inv.expiresAt)} lagi)`
      : null,
    "",
    `Cek   : ${prefix()}statusbayar ${inv.id}`,
    `Batal : ${prefix()}batalbayar ${inv.id}`
  ];
  return lines.filter(Boolean).join("\n");
};

const sendInvoice = async (client, chat, inv) => {
  const c = client || clientRef;
  if (!c || !chat) return;

  const body = invoiceText(inv);
  let image = null;
  try {
    image = await ao.qrBuffer(inv.qr);
  } catch (err) {
    logger.warn(`autopay: gagal render QR: ${err.message}`);
  }

  try {
    if (image) {
      await c.sendMessage(chat, {
        image,
        caption: `${body}\n\nScan QR di atas pakai aplikasi bank / e-wallet apa pun. Pembayaran terdeteksi otomatis.`
      });
    } else {
      await c.sendMessage(chat, {
        text: `${body}\n\nKode QRIS (tempel di app yang bisa input kode):\n${inv.qr}`
      });
    }
  } catch (err) {
    logger.warn(`autopay: gagal kirim tagihan: ${err.message}`);
  }

  try {
    await c.sendInteractiveMessage(
      chat,
      {
        text: `Aksi untuk tagihan *${inv.id}*`,
        interactiveButtons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Aksi Tagihan",
              sections: [
                {
                  title: "Aksi",
                  rows: [
                    { id: `statusbayar ${inv.id}`, title: "Cek Status", description: "Tampilkan ulang QR & status" },
                    { id: `batalbayar ${inv.id}`, title: "Batalkan", description: "Batalkan tagihan ini" }
                  ]
                }
              ]
            })
          }
        ]
      },
      {}
    );
  } catch (err) {
    logger.warn(`autopay: tombol tagihan gagal: ${err.message}`);
  }
};

// ---------- membuat tagihan premium ----------
const userError = (message) => Object.assign(new Error(message), { user: true });

const createPremium = async ({ uid, name, chat, key }) => {
  if (!ao.enabled()) throw userError("Pembayaran QRIS otomatis belum aktif. Hubungi owner.");

  const pkg = (config.premiumPackages || {})[String(key)];
  if (!pkg) throw userError(`Paket *${key}* tidak dikenal.`);

  const old = list(
    (i) => i.kind === "premium" && i.status === "pending" && i.buyer === uid && i.days === pkg.days
  )[0];
  if (old && old.expiresAt > Date.now() + 30000) return { inv: old, reused: true };
  if (old) await close(old, "expired");

  const limit = Number(config.autoorder?.maxPending ?? 3);
  if (list((i) => i.status === "pending" && i.buyer === uid).length >= limit) {
    throw userError(
      `Kamu masih punya ${limit} tagihan belum dibayar. Bayar atau batalkan dulu (${prefix()}statusbayar / ${prefix()}batalbayar).`
    );
  }

  const id = "PRM" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const dep = await ao.createDeposit(pkg.price, id);
  if (!dep || !dep.id || !dep.qr_string) throw new Error("Respon AutoOrder tidak lengkap (tanpa id / qr_string).");

  const inv = {
    id,
    kind: "premium",
    buyer: uid,
    name: name || "Player",
    chat,
    days: pkg.days,
    title: `Premium ${pkg.label}`,
    amount: Number(dep.amount) || pkg.price,
    fee: Number(dep.fee) || 0,
    payAmount: Number(dep.payment_amount) || pkg.price,
    depositId: String(dep.id),
    qr: String(dep.qr_string),
    status: "pending",
    createdAt: Date.now(),
    expiresAt: parseTime(dep.expires_at) || Date.now() + 15 * 60000,
    next: Date.now() + 6000,
    last: 0,
    misses: 0
  };

  load().invoices[id] = inv;
  save();
  start();
  return { inv, reused: false };
};

// ---------- pemantauan ----------
const schedule = (inv) => {
  const age = Date.now() - inv.createdAt;
  inv.next = Date.now() + (age < 120000 ? 6000 : age < 600000 ? 10000 : 20000);
};

const close = async (inv, status, why = "") => {
  if (inv.status !== "pending") return inv;
  inv.status = status;
  inv.closedAt = Date.now();
  save();
  const text =
    status === "expired"
      ? "sudah kedaluwarsa"
      : status === "cancelled"
        ? "dibatalkan"
        : "gagal diproses";
  await sendText(null, inv.chat, `*TAGIHAN ${text.toUpperCase()}*\n\n${invoiceText(inv, "TAGIHAN")}${why ? `\n\n${why}` : ""}`);
  return inv;
};

const settle = async (inv) => {
  if (inv.status !== "pending") return inv;
  inv.status = "paid"; // ditandai & simpan SEBELUM aktivasi supaya tak dobel
  inv.paidAt = Date.now();
  save();

  try {
    if (inv.kind !== "premium") throw new Error(`jenis tagihan tak dikenal: ${inv.kind}`);

    db.getUser(inv.buyer, inv.name || "Player");
    const user = db.getUser(inv.buyer);
    const now = Date.now();
    const cur = user.status || {};
    const active = cur.until === PERMANENT || Number(cur.until) > now;
    const baseType =
      active && (cur.type === "Premium" || cur.type === "Donatur") ? cur.type : "Premium";
    const base =
      cur.until === PERMANENT ? PERMANENT : active ? Number(cur.until) : now;
    const until = base === PERMANENT ? PERMANENT : base + inv.days * DAY_MS;

    db.setStatus(inv.buyer, baseType, until);

    inv.status = "done";
    inv.until = until;
    save();

    const txt = [
      "✅ *PREMIUM AKTIF*",
      "",
      `Invoice : ${inv.id}`,
      `Paket   : ${inv.title}`,
      `Dibayar : ${rp(inv.payAmount)}`,
      `Aktif sampai : ${fmtUntil(until)}`,
      "",
      "Terima kasih! Limit harianmu kini ∞."
    ].join("\n");

    await sendText(null, inv.chat, txt);
    const buyerJid = `${inv.buyer}@s.whatsapp.net`;
    if (!String(inv.chat).endsWith("@g.us")) {
      /* chat pribadi = buyer, sudah terkirim */
    } else if (inv.chat !== buyerJid) {
      await sendText(null, buyerJid, txt);
    }

    await notifyOwners(
      [
        "💰 *PREMIUM TERJUAL (QRIS OTOMATIS)*",
        "",
        `Invoice : ${inv.id}`,
        `Paket   : ${inv.title}`,
        `Nominal : ${rp(inv.payAmount)}`,
        `Pembeli : ${inv.buyer}`
      ].join("\n")
    );

    logger.ok(`autopay: premium aktif ${inv.buyer} ${inv.days} hari (${inv.id})`);
  } catch (err) {
    inv.status = "failed";
    inv.note = err.message;
    save();
    logger.error(`autopay: gagal aktivasi ${inv.id}: ${err.message}`);
    await sendText(
      null,
      inv.chat,
      `⚠️ Pembayaran ${inv.id} diterima, tapi aktivasi premium otomatis gagal. Owner sudah diberi tahu.`
    );
    await notifyOwners(
      `⚠️ *PERLU TINDAKAN*\n\nInvoice: ${inv.id}\nPembeli: ${inv.buyer}\nSebab: ${err.message}`
    );
  }

  return inv;
};

const checking = new Set();

const check = async (inv, { force = false } = {}) => {
  if (!inv || inv.status !== "pending" || checking.has(inv.id)) return inv;
  if (force && Date.now() - (inv.last || 0) < 5500) return inv; // batas API: 1 cek / 5s / transaksi

  checking.add(inv.id);
  try {
    inv.last = Date.now();
    const d = await ao.getDeposit(inv.depositId);
    const s = String(d?.status || "").toLowerCase();
    inv.misses = 0;

    if (s === "paid") await settle(inv);
    else if (s === "expired" || s === "cancelled") await close(inv, s);
    else if (Date.now() > inv.expiresAt + 120000) await close(inv, "expired");
    else schedule(inv);
  } catch (err) {
    if (err.status === 429) {
      inv.next = Date.now() + Math.max(6, err.retryAfter || 6) * 1000;
    } else if (err.status === 404 || err.code === "DEPOSIT_NOT_FOUND") {
      inv.misses = (inv.misses || 0) + 1;
      if (inv.misses >= 5) await close(inv, "failed", "Transaksi tidak ditemukan di AutoOrder.");
      else inv.next = Date.now() + 15000;
    } else {
      logger.warn(`autopay: cek ${inv.id} gagal: ${err.message}`);
      inv.next = Date.now() + 20000;
    }
  } finally {
    checking.delete(inv.id);
    save();
  }

  return inv;
};

const cancel = async (inv) => {
  if (!inv || inv.status !== "pending") throw userError("Tagihan ini sudah tidak aktif.");
  try {
    await ao.cancelDeposit(inv.depositId);
  } catch (err) {
    const d = await ao.getDeposit(inv.depositId).catch(() => null);
    const s = String(d?.status || "").toLowerCase();
    if (s === "paid") {
      await settle(inv);
      throw userError("Tagihan ini ternyata sudah dibayar, jadi tidak bisa dibatalkan.");
    }
    if (s !== "expired" && s !== "cancelled") throw err;
  }
  return await close(inv, "cancelled");
};

let timer = null;
let busy = false;

const tick = async () => {
  if (busy || !clientRef || !ao.enabled()) return;
  busy = true;
  try {
    const now = Date.now();
    for (const inv of pending().filter((i) => (i.next || 0) <= now).slice(0, 8)) {
      await check(inv);
    }
  } catch (err) {
    logger.warn(`autopay: tick: ${err.message}`);
  } finally {
    busy = false;
  }
};

const start = (client) => {
  if (client) attach(client);
  load();
  if (timer) return;
  const poll = Math.max(6000, Number(config.autoorder?.pollMs ?? 6000));
  timer = setInterval(() => {
    tick().catch(() => {});
  }, poll);
  if (timer.unref) timer.unref();
  for (const inv of pending()) inv.next = 0;
  logger.info(`autopay: watcher aktif (poll ${poll}ms, ${pending().length} tagihan pending)`);
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
  busy = false;
  logger.info("autopay: watcher dihentikan");
};

module.exports = {
  FILE,
  enabled: ao.enabled,
  attach,
  load: () => load(),
  get,
  list,
  pending,
  createPremium,
  sendInvoice,
  invoiceText,
  check,
  cancel,
  settle,
  close,
  start,
  stop,
  rp
};
