// lib/blackmarket.js — pasar gelap: buka 06:00-12:00 dan 18:00-00:00 WIB.
// Stok deterministik per sesi; sisa stok & kuota harian disimpan per pemain.
const path = require("path");
const { readJson } = require("./rpgjson");
const { db } = require("./rpgdb");
const { findItemDef } = require("./rpgitems");

const SHOP = path.join(__dirname, "../database/rpg/shop.json");
const SLOT_MS = 12 * 60 * 60 * 1000; // 6 jam buka + 6 jam tutup
const OPEN_MS = 6 * 60 * 60 * 1000;
// anchor 2024-01-02 06:00 WIB: batas sesi jatuh di 06:00 / 18:00 WIB
const ANCHOR = Date.UTC(2024, 0, 1, 23, 0, 0, 0);
const DAILY_MAX = 7;
const FIXED = ["bronze-key", "premium-key", "void-shard", "shadow-silk"];
const RARE = [
  { key: "diamond", name: "Diamond", emoji: "💎", price: 1600 },
  { key: "mithril-ore", name: "Mithril Ore", emoji: "⛏️", price: 700 },
  { key: "dragon-scale", name: "Dragon Scale", emoji: "🐲", price: 1200 },
  { key: "crystal", name: "Crystal", emoji: "🔮", price: 900 }
];

const dayKey = (now) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(now));

const slotOf = (now = Date.now()) => Math.floor((now - ANCHOR) / SLOT_MS);

const windowOf = (now = Date.now()) => {
  const slot = slotOf(now);
  const start = ANCHOR + slot * SLOT_MS;
  const open = now < start + OPEN_MS;
  return { slot, start, open, endsAt: open ? start + OPEN_MS : start + SLOT_MS };
};

const leftText = (ms) => {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m`;
};

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

const shopOf = () => readJson(SHOP, {}) || {};
const entryOf = (key) => {
  const entry = shopOf()[key];
  return entry ? { key, ...entry } : null;
};

const stockFor = (entry, rnd) => {
  if (entry.bmStock) return Math.max(1, Math.floor(Number(entry.bmStock) || 1));
  if (findItemDef(entry.key)?.type === "equipment") return 1; // equipment selalu 1
  return 3 + Math.floor(rnd() * 8); // 3-10 item, diacak tiap sesi
};

const buildStock = (slot) => {
  const all = shopOf();
  const rnd = seeded(slot);

  const fixed = FIXED.map(entryOf)
    .filter(Boolean)
    .map((entry) => ({ ...entry, stock: stockFor(entry, rnd) }));

  const pool = Object.entries(all).filter(
    ([key, s]) =>
      !FIXED.includes(key) &&
      Number(s.price) > 0 &&
      (s.bmOnly === true || s.buyable !== false)
  );

  const picks = [];
  const copy = pool.slice();
  const count = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < count && copy.length; i++) {
    picks.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  }

  const random = picks.map(([key, s]) => {
    const entry = { key, ...s };
    return { ...entry, price: priceOf(entry.price, entry.sell, rnd), stock: stockFor(entry, rnd) };
  });

  if (rnd() < 0.5) {
    const rare = RARE[Math.floor(rnd() * RARE.length)];
    random.push({ ...rare, stock: 1, rare: true });
  }

  return [...fixed, ...random];
};

const current = (now = Date.now()) => {
  const win = windowOf(now);
  return { ...win, stock: buildStock(win.slot) };
};

const quotaOf = (uid, now = Date.now()) => {
  const user = db.getUser(uid) || {};
  const today = dayKey(now);
  const bought = user.bmDay === today ? Math.max(0, Math.floor(Number(user.bmBought) || 0)) : 0;
  const slot = slotOf(now);
  const taken = user.bmSlot === slot && user.bmTaken ? user.bmTaken : {};
  return { max: DAILY_MAX, bought, left: Math.max(0, DAILY_MAX - bought), taken, slot };
};

const remainingOf = (entry, taken) =>
  Math.max(0, Number(entry.stock) - (Number(taken?.[entry.key]) || 0));

const buy = (uid, index, qty = 1, now = Date.now()) => {
  const win = windowOf(now);
  if (!win.open) {
    throw new Error(`Black Market tutup. Buka lagi dalam ${leftText(win.endsAt - now)}.`);
  }

  const entry = buildStock(win.slot)[Number(index) - 1];
  if (!entry) throw new Error("Nomor barang tidak ada. Ketik .bm pribadi untuk daftar terbaru.");

  const n = Math.max(1, Math.floor(Number(qty) || 1));
  const quota = quotaOf(uid, now);
  if (quota.left <= 0) {
    throw new Error(`Kuota Black Market hari ini sudah habis (${DAILY_MAX} item). Reset besok.`);
  }
  if (n > quota.left) throw new Error(`Sisa kuota hari ini ${quota.left} item (maks ${DAILY_MAX}/hari).`);

  const remaining = remainingOf(entry, quota.taken);
  if (remaining <= 0) throw new Error(`Stok ${entry.name} sudah habis di sesi ini.`);
  if (n > remaining) throw new Error(`Stok ${entry.name} tinggal ${remaining} di sesi ini.`);

  const total = entry.price * n;
  const user = db.getUser(uid);
  if ((user.money || 0) < total) throw new Error(`Gold tidak cukup. Butuh ${total}, saldo ${user.money}.`);

  db.addMoney(uid, -total);
  db.addItem(uid, { name: entry.name, emoji: entry.emoji, qty: n });
  db.updateUser(uid, (u) => {
    const taken = { ...(quota.slot === win.slot ? quota.taken : {}) };
    taken[entry.key] = (Number(taken[entry.key]) || 0) + n;
    u.bmTaken = taken;
    u.bmSlot = win.slot;
    u.bmDay = dayKey(now);
    u.bmBought = quota.bought + n;
  });

  return { entry, qty: n, total, left: quota.left - n };
};

module.exports = {
  SLOT_MS,
  OPEN_MS,
  DAILY_MAX,
  slotOf,
  windowOf,
  current,
  buildStock,
  quotaOf,
  remainingOf,
  leftText,
  buy,
  _internal: { seeded, stockFor, dayKey }
};
