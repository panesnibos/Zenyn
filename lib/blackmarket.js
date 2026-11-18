// lib/blackmarket.js — pasar gelap: stok & harga acak, ganti tiap 6 jam.
// Deterministik per slot waktu supaya semua pemain melihat stok yang sama.
const path = require("path");
const { readJson } = require("./rpgjson");
const { db } = require("./rpgdb");

const SHOP = path.join(__dirname, "../database/rpg/shop.json");
const SLOT_MS = 6 * 60 * 60 * 1000;
const MAX_SLOTS = 4;
const RARE = [
  { key: "diamond", name: "Diamond", emoji: "💎", price: 1600 },
  { key: "mithril-ore", name: "Mithril Ore", emoji: "⛏️", price: 700 },
  { key: "dragon-scale", name: "Dragon Scale", emoji: "🐲", price: 1200 },
  { key: "crystal", name: "Crystal", emoji: "🔮", price: 900 }
];

const slotOf = (now = Date.now()) => Math.floor(now / SLOT_MS);

// LCG sederhana: stok identik untuk slot yang sama
const seeded = (seed) => {
  let x = (seed * 7919 + 13) % 2147483647;
  if (x <= 0) x += 2147483646;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
};

const priceOf = (base, sell, rnd) => {
  const raw = Math.round((base * (0.7 + rnd() * 0.5)) / 10) * 10;
  return Math.max(raw, Math.floor((sell || 0) * 1.15) + 10); // tidak bisa dicuci untung
};

const buildStock = (slot) => {
  const shop = readJson(SHOP, {}) || {};
  const pool = Object.entries(shop)
    .filter(([, s]) => s.buyable !== false && Number(s.price) > 0)
    .map(([key, s]) => ({ key, ...s }));

  const rnd = seeded(slot);
  const picks = [];
  const copy = pool.slice();
  const count = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < count && copy.length; i++) {
    picks.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  }

  const stock = picks.map((p) => ({
    key: p.key,
    name: p.name,
    emoji: p.emoji || "📦",
    price: priceOf(p.price, p.sell, rnd),
    max: 5 + Math.floor(rnd() * 6)
  }));

  if (rnd() < 0.5) {
    const rare = RARE[Math.floor(rnd() * RARE.length)];
    stock.push({ ...rare, max: 1 + Math.floor(rnd() * 2), rare: true });
  }
  return stock.slice(0, MAX_SLOTS + 1);
};

const current = () => {
  const slot = slotOf();
  return { slot, stock: buildStock(slot), endsAt: (slot + 1) * SLOT_MS };
};

const buy = (uid, index, qty = 1) => {
  const { stock } = current();
  const entry = stock[Number(index) - 1];
  if (!entry) throw new Error("Nomor barang tidak ada. Ketik .bm untuk stok terbaru.");
  const n = Math.max(1, Math.floor(Number(qty) || 1));
  if (n > entry.max) throw new Error(`Maksimal ${entry.max} per pembelian untuk ${entry.name}.`);

  const total = entry.price * n;
  const user = db.getUser(uid);
  if ((user.money || 0) < total) throw new Error(`Gold tidak cukup. Butuh ${total}, saldo ${user.money}.`);

  db.addMoney(uid, -total);
  db.addItem(uid, { name: entry.name, emoji: entry.emoji, qty: n });
  return { entry, qty: n, total };
};

module.exports = {
  SLOT_MS,
  slotOf,
  current,
  buildStock,
  buy,
  _internal: { seeded }
};
