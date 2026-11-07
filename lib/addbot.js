// lib/addbot.js — data sewa bot per grup + auto-keluar saat masa sewa habis.
// File: database/addbot.json  { rentals: [{ jid, name, buyer, plan, days, until, invoiceId }] }
const path = require("path");
const config = require("../config");
const logger = require("./logger");
const { readJson, writeJson } = require("./rpgjson");
const { PERMANENT } = require("./rpglimit");

const FILE = path.join(__dirname, "../database/addbot.json");
const CHECK_MS = 60 * 1000;

let data = null;
let clientRef = null;
let timer = null;
let running = false;

const load = () => {
  if (data) return data;
  const raw = readJson(FILE, {});
  data = { rentals: Array.isArray(raw?.rentals) ? raw.rentals : [] };
  return data;
};

const save = () => writeJson(FILE, load());

const fmtUntil = (until) =>
  until === PERMANENT || !until ? "Selamanya" : new Date(until).toLocaleString("id-ID");

const addRental = (rental) => {
  const d = load();
  const rec = { ...rental, createdAt: Date.now() };
  const i = d.rentals.findIndex((r) => r.jid === rental.jid);
  if (i >= 0) d.rentals[i] = { ...d.rentals[i], ...rec };
  else d.rentals.push(rec);
  save();
  return rec;
};

const list = () => load().rentals.slice();
const get = (jid) => load().rentals.find((r) => r.jid === jid) || null;

const remove = (jid) => {
  const d = load();
  const before = d.rentals.length;
  d.rentals = d.rentals.filter((r) => r.jid !== jid);
  save();
  return d.rentals.length !== before;
};

const due = (now = Date.now()) =>
  load().rentals.filter((r) => Number(r.until) > 0 && Number(r.until) <= now);

const notifyOwners = async (text) => {
  if (!clientRef) return;
  for (const num of config.owners || []) {
    const jid = String(num).includes("@") ? String(num) : `${num}@s.whatsapp.net`;
    try {
      await clientRef.sendMessage(jid, { text });
    } catch (err) {
      logger.warn(`addbot: notif owner gagal: ${err.message}`);
    }
  }
};

const checkExpiry = async () => {
  if (!clientRef || running) return;
  running = true;

  try {
    for (const r of due()) {
      const name = r.name || r.jid;
      try {
        await clientRef.sendMessage(r.jid, {
          text: `⏳ *MASA SEWA BOT HABIS*\n\nTerima kasih sudah menggunakan bot di grup ini.\nBot keluar sekarang. Mau perpanjang? Hubungi owner.`
        });
      } catch {
        /* grup mungkin sudah tidak bisa dihubungi */
      }

      try {
        await clientRef.groupLeave(r.jid);
        logger.ok(`addbot: keluar dari ${name} (sewa habis)`);
      } catch (err) {
        logger.warn(`addbot: gagal keluar dari ${name}: ${err.message}`);
      }

      remove(r.jid);
      await notifyOwners(
        `⏳ *SEWA BOT HABIS*\n\nGrup : ${name}\nPembeli : ${r.buyer}\nPaket : ${r.plan || "-"}`
      );
    }
  } catch (err) {
    logger.warn(`addbot: cek kedaluwarsa gagal: ${err.message}`);
  } finally {
    running = false;
  }
};

const start = (client) => {
  if (client) clientRef = client;
  load();
  if (timer) return;
  timer = setInterval(() => {
    checkExpiry().catch(() => {});
  }, CHECK_MS);
  if (timer.unref) timer.unref();
  setTimeout(() => checkExpiry().catch(() => {}), 5000).unref?.();
  logger.info(`addbot: watcher sewa aktif (cek ${CHECK_MS / 1000}s, ${list().length} grup)`);
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
  logger.info("addbot: watcher sewa dihentikan");
};

module.exports = {
  FILE,
  fmtUntil,
  addRental,
  list,
  get,
  remove,
  due,
  checkExpiry,
  start,
  stop
};
