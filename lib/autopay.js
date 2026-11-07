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
const addbot = require("./addbot");
const nokos = require("./nokos");
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
  if (!c || !chat) return false;

  const body = invoiceText(inv);
  let image = null;
  try {
    image = await ao.qrBuffer(inv.qr);
  } catch (err) {
    logger.warn(`autopay: gagal render QR: ${err.message}`);
  }

  let sent = false;
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
    sent = true;
  } catch (err) {
    logger.warn(`autopay: gagal kirim tagihan ke ${chat}: ${err.message}`);
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

  return sent;
};

// ---------- membuat tagihan premium ----------
const userError = (message) => Object.assign(new Error(message), { user: true });

const createPremium = async ({ uid, name, chat, origin, key }) => {
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
    origin: origin || chat,
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

// ---------- membuat tagihan sewa bot (addbot) ----------
const CODE_RE = /^[0-9A-Za-z]{10,}$/;

const createAddbot = async ({ uid, name, chat, origin, code, key }) => {
  if (!ao.enabled()) throw userError("Pembayaran QRIS otomatis belum aktif. Hubungi owner.");

  const invite = String(code || "").trim();
  if (!CODE_RE.test(invite)) throw userError("Link undangan grup tidak valid.");

  const pkg = (config.addbotPackages || {})[String(key)];
  if (!pkg) throw userError(`Paket *${key}* tidak dikenal.`);

  const old = list(
    (i) =>
      i.kind === "addbot" &&
      i.status === "pending" &&
      i.buyer === uid &&
      i.code === invite &&
      i.days === pkg.days
  )[0];
  if (old && old.expiresAt > Date.now() + 30000) return { inv: old, reused: true };
  if (old) await close(old, "expired");

  const limit = Number(config.autoorder?.maxPending ?? 3);
  if (list((i) => i.status === "pending" && i.buyer === uid).length >= limit) {
    throw userError(
      `Kamu masih punya ${limit} tagihan belum dibayar. Bayar atau batalkan dulu (${prefix()}statusbayar / ${prefix()}batalbayar).`
    );
  }

  const id = "ADB" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const dep = await ao.createDeposit(pkg.price, id);
  if (!dep || !dep.id || !dep.qr_string) throw new Error("Respon AutoOrder tidak lengkap (tanpa id / qr_string).");

  const inv = {
    id,
    kind: "addbot",
    buyer: uid,
    name: name || "Player",
    chat,
    origin: origin || chat,
    code: invite,
    days: pkg.days,
    title: `Sewa Bot ${pkg.label}`,
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

// ---------- membuat tagihan nomor virtual (nokos) ----------
const createNokos = async ({
  uid,
  name,
  chat,
  origin,
  serviceId,
  serviceName,
  offerId,
  countryName,
  countryCode,
  tier,
  tierLabel,
  apiPrice
}) => {
  if (!ao.enabled()) throw userError("Pembayaran QRIS otomatis belum aktif. Hubungi owner.");
  if (!serviceId || !offerId) throw userError("Layanan atau penawaran tidak valid.");

  const price = nokos.sellPrice(apiPrice);

  const old = list(
    (i) => i.kind === "nokos" && i.status === "pending" && i.buyer === uid && i.offerId === offerId
  )[0];
  if (old && old.expiresAt > Date.now() + 30000) return { inv: old, reused: true };
  if (old) await close(old, "expired");

  const limit = Number(config.autoorder?.maxPending ?? 3);
  if (list((i) => i.status === "pending" && i.buyer === uid).length >= limit) {
    throw userError(
      `Kamu masih punya ${limit} tagihan belum dibayar. Bayar atau batalkan dulu (${prefix()}statusbayar / ${prefix()}batalbayar).`
    );
  }

  const id = "NKS" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const dep = await ao.createDeposit(price, id);
  if (!dep || !dep.id || !dep.qr_string) throw new Error("Respon AutoOrder tidak lengkap (tanpa id / qr_string).");

  const inv = {
    id,
    kind: "nokos",
    buyer: uid,
    name: name || "Player",
    chat,
    origin: origin || chat,
    serviceId,
    serviceName: serviceName || "-",
    offerId,
    countryName: countryName || "",
    countryCode: countryCode || "",
    tier: tier || "",
    tierLabel: tierLabel || "",
    apiPrice: Number(apiPrice) || 0,
    title: `Nomor ${serviceName || "Virtual"}${countryName ? ` ${countryName}` : ""}`,
    amount: Number(dep.amount) || price,
    fee: Number(dep.fee) || 0,
    payAmount: Number(dep.payment_amount) || price,
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

const fulfillPremium = async (inv) => {
  db.getUser(inv.buyer, inv.name || "Player");
  const user = db.getUser(inv.buyer);
  const now = Date.now();
  const cur = user.status || {};
  const active = cur.until === PERMANENT || Number(cur.until) > now;
  const baseType =
    active && (cur.type === "Premium" || cur.type === "Donatur") ? cur.type : "Premium";
  const base = cur.until === PERMANENT ? PERMANENT : active ? Number(cur.until) : now;
  const until = base === PERMANENT ? PERMANENT : base + inv.days * DAY_MS;

  db.setStatus(inv.buyer, baseType, until);
  inv.until = until;

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
  if (inv.origin && inv.origin !== inv.chat && String(inv.origin).endsWith("@g.us")) {
    await sendText(
      null,
      inv.origin,
      `✅ Pembayaran *${inv.id}* lunas. Premium aktif — detail dikirim ke chat pribadi.`
    );
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
};

const fulfillAddbot = async (inv) => {
  if (!clientRef || typeof clientRef.groupAcceptInvite !== "function") {
    throw new Error("Socket tidak mendukung join grup.");
  }

  const jid = await clientRef.groupAcceptInvite(inv.code);
  if (!jid) throw new Error("Link undangan tidak valid / sudah kedaluwarsa.");

  let subject = "";
  try {
    const meta = await clientRef.groupMetadata(jid);
    subject = meta?.subject || "";
  } catch {
    /* nama grup opsional */
  }

  const until = inv.days > 0 ? Date.now() + inv.days * DAY_MS : PERMANENT;
  addbot.addRental({
    jid,
    name: subject,
    buyer: inv.buyer,
    plan: inv.title,
    days: inv.days,
    until,
    invoiceId: inv.id,
    chat: inv.chat
  });

  inv.groupJid = jid;
  inv.until = until;

  const txt = [
    "✅ *BOT DITAMBAHKAN KE GRUP*",
    "",
    `Invoice : ${inv.id}`,
    `Grup    : ${subject || jid}`,
    `Paket   : ${inv.title}`,
    `Dibayar : ${rp(inv.payAmount)}`,
    `Aktif sampai : ${fmtUntil(until)}`,
    "",
    "Bot sudah masuk ke grup. Ketik *.menu* di grup untuk mulai."
  ].join("\n");

  await sendText(null, inv.chat, txt);
  await sendText(
    null,
    jid,
    `🤖 *Bot aktif di grup ini*\n\nPaket: ${inv.title}\nSampai: ${fmtUntil(until)}\n\nKetik *.menu* untuk melihat fitur.`
  );

  await notifyOwners(
    [
      "🛒 *SEWA BOT TERJUAL (QRIS OTOMATIS)*",
      "",
      `Invoice : ${inv.id}`,
      `Grup    : ${subject || jid}`,
      `Paket   : ${inv.title}`,
      `Nominal : ${rp(inv.payAmount)}`,
      `Pembeli : ${inv.buyer}`
    ].join("\n")
  );

  logger.ok(`autopay: bot join ${subject || jid} ${inv.days || "permanent"} (${inv.id})`);
};

const fulfillNokos = async (inv) => {
  const rec = await nokos.createOrder(inv);
  inv.orderId = rec.orderId;

  const txt = [
    "✅ *PEMBAYARAN DITERIMA — NOMOR VIRTUAL*",
    "",
    `Invoice : ${inv.id}`,
    `Layanan : ${rec.serviceName}`,
    `Negara  : ${rec.country || "-"}`,
    `Paket   : ${rec.tier || "-"}`,
    rec.phone ? `Nomor   : ${rec.phone}` : "Nomor   : (sedang disiapkan)",
    `Dibayar : ${rp(inv.payAmount)}`,
    "",
    "Pakai nomor di atas untuk minta kode OTP.",
    "Kode OTP dikirim otomatis ke chat ini begitu masuk.",
    "",
    `Cek   : ${prefix()}nokoscek ${rec.orderId}`,
    `Batal : ${prefix()}nokosbatal ${rec.orderId}`
  ].join("\n");

  await sendText(null, inv.chat, txt);
  if (inv.origin && inv.origin !== inv.chat && String(inv.origin).endsWith("@g.us")) {
    await sendText(
      null,
      inv.origin,
      `✅ Pembayaran *${inv.id}* lunas. Detail nomor virtual dikirim ke chat pribadi.`
    );
  }

  await notifyOwners(
    [
      "🛒 *NOMOR VIRTUAL TERJUAL (QRIS OTOMATIS)*",
      "",
      `Invoice : ${inv.id}`,
      `Order   : ${rec.orderId}`,
      `Layanan : ${rec.serviceName}`,
      `Negara  : ${rec.country || "-"}`,
      `Nominal : ${rp(inv.payAmount)}`,
      `Pembeli : ${inv.buyer}`
    ].join("\n")
  );

  logger.ok(`autopay: nokos ${rec.orderId} untuk ${inv.buyer} (${inv.id})`);
};

const settle = async (inv) => {
  if (inv.status !== "pending") return inv;
  inv.status = "paid"; // ditandai & simpan SEBELUM aktivasi supaya tak dobel
  inv.paidAt = Date.now();
  save();

  try {
    if (inv.kind === "premium") await fulfillPremium(inv);
    else if (inv.kind === "addbot") await fulfillAddbot(inv);
    else if (inv.kind === "nokos") await fulfillNokos(inv);
    else throw new Error(`jenis tagihan tak dikenal: ${inv.kind}`);

    if (inv.status === "paid") inv.status = "done";
    save();
  } catch (err) {
    inv.status = "failed";
    inv.note = err.message;
    save();
    logger.error(`autopay: gagal proses ${inv.id}: ${err.message}`);
    await sendText(
      null,
      inv.chat,
      `⚠️ Pembayaran ${inv.id} diterima, tapi pemrosesan otomatis gagal. Owner sudah diberi tahu, mohon tunggu.`
    );
    await notifyOwners(
      `⚠️ *PERLU TINDAKAN*\n\nInvoice: ${inv.id}\nJenis: ${inv.kind}\nPembeli: ${inv.buyer}\nSebab: ${err.message}`
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
  createAddbot,
  createNokos,
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
