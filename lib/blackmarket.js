// lib/blackmarket.js — Black Market pribadi: buka 06:00-12:00 & 18:00-00:00 WIB.
// Total stok 10 unit per sesi, 6-9 baris, tiap baris 1-2 unit.
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
const TOTAL_UNITS = 10;
const MIN_ROWS = 6;
const MAX_ROWS = 9;
const PROMO_CHANCE = 0.75;
const FIXED = [
  { key: "bronze-key", group: "kunci" },
  { key: "premium-key", group: "kunci" },
  { key: "void-shard", group: "bahan" },
  { key: "shadow-silk", group: "bahan" }
];
const MATERIALS = [
  { key: "moon-herb", price: 1000 },
  { key: "hardwood", price: 900 },
  { key: "rare-fish", price: 700 },
  { key: "steel-ingot", price: 600 },
  { key: "crystal", price: 900 },
  { key: "mithril-ore", price: 700 },
  { key: "diamond", price: 1600 },
  { key: "dragon-scale", price: 1200 }
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

const floorPrice = (key) => Math.floor(Number(findItemDef(key)?.sell || 0) * 1.15) + 10;

const shopOf = () => readJson(SHOP, {}) || {};
const entryOf = (key) => {
  const entry = shopOf()[key];
  return entry ? { key, ...entry } : null;
};

const shuffle = (list, rnd) => {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const buildStock = (slot) => {
  const rnd = seeded(slot);
  const rows = MIN_ROWS + Math.floor(rnd() * (MAX_ROWS - MIN_ROWS + 1));

  const fixed = FIXED.map((f) => {
    const entry = entryOf(f.key);
    return entry ? { ...entry, group: f.group } : null;
  }).filter(Boolean);

  const materials = MATERIALS.map((m) => {
    const def = findItemDef(m.key);
    return def ? { key: m.key, name: def.name, emoji: def.emoji || "🧱", price: m.price } : null;
  }).filter(Boolean);

  const shopPool = Object.entries(shopOf())
    .filter(
      ([key, s]) =>
        !FIXED.some((f) => f.key === key) &&
        Number(s.price) > 0 &&
        s.bmOnly !== true &&
        s.buyable !== false
    )
    .map(([key, s]) => ({ key, ...s, shop: true }));

  const rotating = shuffle([...materials, ...shopPool], rnd)
    .slice(0, Math.max(0, rows - fixed.length))
    .map((e) => ({
      key: e.key,
      name: e.name,
      emoji: e.emoji || "📦",
      group: "rotasi",
      price: e.shop ? priceOf(e.price, e.sell, rnd) : Number(e.price) || 0
    }));

  // promo: satu baris rotasi, diskon 25-35%, tidak di bawah harga jual + margin
  if (rotating.length && rnd() < PROMO_CHANCE) {
    const target = rotating[Math.floor(rnd() * rotating.length)];
    const cut = 0.25 + rnd() * 0.1;
    const discounted = Math.round((target.price * (1 - cut)) / 10) * 10;
    target.price = Math.max(floorPrice(target.key), Math.min(target.price - 10, discounted));
    target.promo = true;
  }

  // total stok tepat 10 unit: mulai 1 semua, sisa dibagikan jadi 2
  const all = [...fixed, ...rotating];
  const stocks = all.map(() => 1);
  let extra = Math.max(0, TOTAL_UNITS - all.length);
  const idxs = all.map((_, i) => i);
  while (extra > 0 && idxs.length) {
    const i = idxs.splice(Math.floor(rnd() * idxs.length), 1)[0];
    stocks[i] = 2;
    extra--;
  }

  return all.map((entry, i) => ({ ...entry, stock: stocks[i] }));
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
  TOTAL_UNITS,
  slotOf,
  windowOf,
  current,
  buildStock,
  quotaOf,
  remainingOf,
  leftText,
  buy,
  _internal: { seeded, dayKey, floorPrice }
};
