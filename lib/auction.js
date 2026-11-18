// lib/auction.js — lelang antar pemain (auction house).
// Item di-escrow saat lot dibuat, gold penawar di-escrow saat bid, jadi settle
// tidak pernah gagal karena saldo. Lot kedaluwarsa dibereskan watcher 30 detik.
const path = require("path");
const logger = require("./logger");
const { readJson, writeJson } = require("./rpgjson");
const { db } = require("./rpgdb");

const FILE = path.join(__dirname, "../database/rpg/auction.json");
const DURATION_MS = 10 * 60 * 1000;
const ANTI_SNIPE_MS = 60 * 1000; // bid di menit terakhir memperpanjang
const MAX_EXTEND = 3;
const MIN_INC = 0.05; // tawaran minimal +5%
const TAX = 0.05;
const MAX_PER_SELLER = 5;
const MAX_LOTS = 20;

let cache = null;
let timer = null;
let clientRef = null;

const load = () => {
  if (!cache) cache = readJson(FILE, {}) || {};
  if (!Array.isArray(cache.lots)) cache.lots = [];
  return cache;
};
const save = () => writeJson(FILE, load());

const lots = () => load().lots.slice().sort((a, b) => a.endsAt - b.endsAt);
const find = (id) => load().lots.find((l) => l.id === id) || null;
const newId = () => "A" + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4);
const minNext = (lot) =>
  lot.topBid
    ? Math.max(lot.topBid + 1, Math.ceil(lot.topBid * (1 + MIN_INC)))
    : lot.start;

const create = ({ sellerId, sellerName, chat, def, qty, start, buyout }) => {
  const open = lots().filter((l) => l.sellerId === sellerId);
  if (open.length >= MAX_PER_SELLER) throw new Error(`Maksimal ${MAX_PER_SELLER} lelang aktif per penjual.`);
  if (lots().length >= MAX_LOTS) throw new Error("Lelang sedang penuh, coba lagi nanti.");
  if (!Number.isFinite(start) || start < 1) throw new Error("Harga awal tidak valid.");
  if (buyout && buyout <= start) throw new Error("Buyout harus lebih besar dari harga awal.");
  if (!db.hasItem(sellerId, def.name, qty)) throw new Error(`Kamu tidak punya ${def.name} x${qty}.`);

  db.removeItem(sellerId, def.name, qty);
  const lot = {
    id: newId(),
    sellerId,
    sellerName,
    chat,
    name: def.name,
    emoji: def.emoji || "📦",
    qty,
    start,
    buyout: buyout || 0,
    topBid: 0,
    topBidder: null,
    topName: null,
    createdAt: Date.now(),
    endsAt: Date.now() + DURATION_MS,
    extended: 0
  };
  load().lots.push(lot);
  save();
  return lot;
};

const bid = (uid, name, lot, amount) => {
  if (!lot) throw new Error("Lot tidak ditemukan. Ketik .lelang untuk daftar terbaru.");
  if (lot.sellerId === uid) throw new Error("Tidak bisa menawar lelang sendiri.");
  if (!Number.isFinite(amount)) throw new Error("Jumlah tawaran tidak valid.");
  const need = minNext(lot);
  if (amount < need) throw new Error(`Tawaran minimal ${need} gold.`);
  if (lot.buyout && amount >= lot.buyout) throw new Error(`Tawaran melewati buyout ${lot.buyout}; pakai .lelang beli.`);

  const user = db.getUser(uid, name);
  if ((user.money || 0) < amount) throw new Error(`Gold tidak cukup. Butuh ${amount}, saldo ${user.money}.`);

  db.addMoney(uid, -amount);
  if (lot.topBidder) db.addMoney(lot.topBidder, lot.topBid); // kembalikan penawar sebelumnya

  lot.topBid = amount;
  lot.topBidder = uid;
  lot.topName = name;
  if (lot.endsAt - Date.now() < ANTI_SNIPE_MS && lot.extended < MAX_EXTEND) {
    lot.endsAt += ANTI_SNIPE_MS;
    lot.extended++;
  }
  save();
  return lot;
};

const buyout = (uid, name, lot) => {
  if (!lot) throw new Error("Lot tidak ditemukan. Ketik .lelang untuk daftar terbaru.");
  if (lot.sellerId === uid) throw new Error("Tidak bisa membeli lelang sendiri.");
  if (!lot.buyout) throw new Error("Lot ini tidak punya harga beli langsung.");

  const user = db.getUser(uid, name);
  if ((user.money || 0) < lot.buyout) throw new Error(`Gold tidak cukup. Butuh ${lot.buyout}, saldo ${user.money}.`);

  db.addMoney(uid, -lot.buyout);
  if (lot.topBidder) db.addMoney(lot.topBidder, lot.topBid);
  const price = lot.buyout;
  const out = settle(lot, { winnerId: uid, winnerName: name, price });
  return out;
};

const cancel = (uid, lot) => {
  if (!lot) throw new Error("Lot tidak ditemukan. Ketik .lelang untuk daftar terbaru.");
  if (lot.sellerId !== uid) throw new Error("Ini bukan lot kamu.");
  if (lot.topBidder) throw new Error("Sudah ada penawar — lot tidak bisa ditarik.");
  const data = load();
  data.lots = data.lots.filter((l) => l.id !== lot.id);
  save();
  db.addItem(uid, { name: lot.name, emoji: lot.emoji, qty: lot.qty });
  return lot;
};

// hapus lot + bagikan hasil. price = 0 artinya tanpa penawar.
const settle = (lot, { winnerId = null, winnerName = null, price = 0 } = {}) => {
  const data = load();
  data.lots = data.lots.filter((l) => l.id !== lot.id);
  save();

  if (!winnerId) {
    db.addItem(lot.sellerId, { name: lot.name, emoji: lot.emoji, qty: lot.qty });
    return { lot, winnerId: null, price: 0, tax: 0 };
  }

  db.addItem(winnerId, { name: lot.name, emoji: lot.emoji, qty: lot.qty });
  const tax = Math.floor(price * TAX);
  db.addMoney(lot.sellerId, price - tax);
  db.addStat(winnerId, "itemsBought", lot.qty);
  db.addStat(lot.sellerId, "itemsSold", lot.qty);
  db.addQuestProgress(winnerId, "buy", lot.qty);
  db.addQuestProgress(lot.sellerId, "sell", lot.qty);
  db.checkAchievements(winnerId);
  db.checkAchievements(lot.sellerId);
  return { lot, winnerId, winnerName, price, tax };
};

const notify = async (chat, text) => {
  if (!clientRef || !chat) return;
  try {
    await clientRef.sendMessage(chat, { text });
  } catch (err) {
    logger.warn(`auction: gagal kirim ${chat}: ${err.message}`);
  }
};

const settleDue = async () => {
  const now = Date.now();
  for (const lot of lots()) {
    if (lot.endsAt > now) continue;
    const winnerId = lot.topBidder;
    const price = lot.topBid;
    const name = lot.topName;
    const res = settle(lot, winnerId ? { winnerId, winnerName: name, price } : {});

    if (!res.winnerId) {
      await notify(lot.chat, `⌛ *LELANG BERAKHIR* — ${lot.emoji} ${lot.name} x${lot.qty}\nTidak ada penawar, item dikembalikan ke ${lot.sellerName}.`);
    } else {
      await notify(
        lot.chat,
        `🔨 *LELANG SELESAI* — ${lot.emoji} ${lot.name} x${lot.qty}\n` +
          `Pemenang: ${name}\nHarga: ${price} gold (pajak ${res.tax})\n` +
          `Item dikirim ke pemilik, gold ke ${lot.sellerName}.`
      );
    }
    logger.cmd(`auction: lot ${lot.id} selesai (${res.winnerId ? price + " gold" : "tanpa penawar"})`);
  }
};

const start = (client) => {
  if (client) clientRef = client;
  load();
  if (timer) return;
  timer = setInterval(() => settleDue().catch((err) => logger.warn(`auction: ${err.message}`)), 30000);
  if (timer.unref) timer.unref();
  setTimeout(() => settleDue().catch(() => {}), 5000).unref?.();
  logger.info(`auction: watcher aktif (${lots().length} lot)`);
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
  clientRef = null;
};

module.exports = {
  FILE,
  DURATION_MS,
  MIN_INC,
  TAX,
  MAX_LOTS,
  MAX_PER_SELLER,
  lots,
  find,
  minNext,
  create,
  bid,
  buyout,
  cancel,
  settle,
  settleDue,
  start,
  stop,
  _internal: { reset: () => { cache = null; } }
};
