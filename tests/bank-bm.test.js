// Bank & pasar gelap: bunga harian, cap saldo, stok deterministik, tanpa arbitrase.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const loadMocked = (relative, mocks = {}) => {
  const file = path.join(root, relative);
  const nativeRequire = createRequire(file);
  const mod = { exports: {} };
  const compiled = vm.runInThisContext(
    `(function(require,module,exports,__dirname,__filename){\n${fs.readFileSync(file, "utf8")}\n})`,
    { filename: file }
  );
  compiled(
    (name) => (Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name)),
    mod,
    mod.exports,
    path.dirname(file),
    file
  );
  return mod.exports;
};

const quiet = { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, msg() {}, debug() {} };
const memJson = () => {
  let data = {};
  return {
    readJson: () => JSON.parse(JSON.stringify(data)),
    writeJson: (_f, next) => { data = JSON.parse(JSON.stringify(next)); }
  };
};

const makeDb = () => {
  const users = {};
  const ensure = (id) => (users[id] = users[id] || { id, name: id, money: 0, inventory: [] });
  return {
    users,
    ensure,
    getUser: (id) => ensure(id),
    updateUser: (id, fn) => { const u = ensure(id); fn(u); return u; },
    addMoney: (id, n) => { ensure(id).money = Math.max(0, ensure(id).money + n); return ensure(id).money; },
    addItem: (id, item) => ensure(id).inventory.push({ ...item })
  };
};

const loadBank = () => {
  const db = makeDb();
  const bank = loadMocked("lib/bank.js", { "./rpgjson": memJson(), "./rpgdb": { db } });
  return { bank, db };
};

test("bank: setor memindahkan gold, minimal 100, cap 50.000", () => {
  const { bank, db } = loadBank();
  db.getUser("u1").money = 60000;
  assert.throws(() => bank.deposit("u1", 50), /Minimal setor 100/);
  bank.deposit("u1", 1000);
  assert.equal(db.getUser("u1").money, 59000);
  assert.equal(bank.stateOf("u1").amount, 1000);
  assert.throws(() => bank.deposit("u1", 60000), /tidak cukup|maksimal/);
});

test("bank: tarik mengurangi saldo bank dan menambah gold", () => {
  const { bank, db } = loadBank();
  db.getUser("u1").money = 5000;
  bank.deposit("u1", 3000);
  bank.withdraw("u1", 1000);
  assert.equal(bank.stateOf("u1").amount, 2000);
  assert.equal(db.getUser("u1").money, 3000);
  assert.throws(() => bank.withdraw("u1", 99999), /tidak cukup/);
});

test("bank: bunga 0.5% per hari penuh, tidak dobel di hari yang sama", () => {
  const { bank, db } = loadBank();
  db.getUser("u1").money = 10000;
  bank.deposit("u1", 5000);
  bank._internal.set("u1", { amount: 5000, last: Date.now() - 2 * 24 * 60 * 60 * 1000 });

  const grown = bank.accrue("u1").amount;
  assert.equal(grown, Math.floor(5000 * 1.005 ** 2), "bunga dua hari");
  assert.equal(bank.accrue("u1").amount, grown, "akses kedua di hari sama tidak menambah");
});

const wib = (h, m = 0, day = 20) => Date.UTC(2026, 10, day, h - 7, m);

test("blackmarket: buka 06:00-12:00 dan 18:00-00:00 WIB", () => {
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db: {} } });

  assert.equal(bm.windowOf(wib(5, 59)).open, false);
  assert.equal(bm.windowOf(wib(6, 0)).open, true);
  assert.equal(bm.windowOf(wib(11, 59)).open, true);
  assert.equal(bm.windowOf(wib(12, 0)).open, false);
  assert.equal(bm.windowOf(wib(18, 0)).open, true);
  assert.equal(bm.windowOf(wib(23, 59)).open, true);
  assert.equal(bm.windowOf(wib(0, 0)).open, false);

  assert.equal(bm.windowOf(wib(6, 0)).endsAt, wib(12, 0), "sesi pagi tutup 12:00");
  assert.equal(bm.windowOf(wib(12, 0)).endsAt, wib(18, 0), "tutup siang sampai 18:00");
  assert.equal(bm.windowOf(wib(0, 0)).endsAt, wib(6, 0), "tutup malam sampai 06:00");
});

test("blackmarket: stok deterministik per sesi, kunci & bahan selalu ada", () => {
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db: {} } });
  const shop = JSON.parse(fs.readFileSync(path.join(root, "database/rpg/shop.json"), "utf8"));

  const a = bm.buildStock(12345);
  const b = bm.buildStock(12345);
  assert.deepEqual(a, b, "slot sama -> stok sama");
  assert.ok(a.length >= 6, "kunci + bahan + stok acak");

  for (const entry of a) {
    const sell = shop[entry.key]?.sell || 0;
    if (sell) assert.ok(entry.price > sell, `harga ${entry.key} harus di atas harga jual ${sell}`);
    assert.ok(entry.price > 0 && entry.stock >= 1);
  }

  const keys = a.map((e) => e.key);
  for (const key of ["bronze-key", "premium-key", "void-shard", "shadow-silk"]) {
    assert.ok(keys.includes(key), `${key} harus selalu ada`);
  }
  assert.equal(a.find((e) => e.key === "premium-key").stock, 2, "premium key stok 2");
});

test("blackmarket: equipment stok 1, bahan langka stok 1, sisanya acak 3-10", () => {
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db: {} } });
  const { stockFor } = bm._internal;

  assert.equal(stockFor({ key: "wooden-sword" }, () => 0.9), 1, "equipment stok 1");
  assert.equal(stockFor({ key: "premium-key", bmStock: 2 }, () => 0.9), 2, "bmStock menimpa");

  const normal = stockFor({ key: "ore" }, () => 0.5);
  assert.ok(normal >= 3 && normal <= 10, "stok acak 3-10");
});

test("blackmarket: tutup -> beli ditolak", () => {
  const db = makeDb();
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db } });
  db.ensure("u1").money = 100000;
  assert.throws(() => bm.buy("u1", 1, 1, wib(12, 0)), /tutup/);
});

test("blackmarket: beli memotong gold, stok per pemain, kuota 7/hari", () => {
  const db = makeDb();
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db } });
  const now = wib(8, 0);
  const stock = bm.current(now).stock;
  db.ensure("u1").money = 100000;

  const out = bm.buy("u1", 1, 1, now);
  assert.equal(out.entry.name, stock[0].name);
  assert.equal(db.getUser("u1").money, 100000 - stock[0].price);
  assert.equal(db.getUser("u1").inventory[0].name, stock[0].name);

  assert.equal(stock[0].key, "bronze-key", "baris pertama kunci bronze");
  bm.buy("u1", 1, 4, now);
  assert.throws(() => bm.buy("u1", 1, 1, now), /habis/, "stok pribadi habis");
  assert.equal(bm.quotaOf("u1", now).bought, 5);

  db.ensure("u2").money = 100000;
  assert.ok(bm.buy("u2", 1, 1, now), "pemain lain punya stok sendiri");

  assert.throws(() => bm.buy("u1", 2, 3, now), /kuota/i, "sisa kuota 2");
  bm.buy("u1", 2, 2, now);
  assert.throws(() => bm.buy("u1", 3, 1, now), /Kuota.*habis/i, "kuota harian habis");

  assert.throws(() => bm.buy("u2", 99, 1, now), /tidak ada/);
  db.ensure("u3").money = 0;
  assert.throws(() => bm.buy("u3", 2, 1, now), /tidak cukup/);
});

test("blackmarket: kuota reset saat ganti hari", () => {
  const db = makeDb();
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db } });
  const now = wib(8, 0);
  db.ensure("u1").money = 100000;
  bm.buy("u1", 1, 5, now);
  assert.equal(bm.quotaOf("u1", now).bought, 5);

  db.getUser("u1").bmDay = "2000-01-01";
  assert.equal(bm.quotaOf("u1", now).bought, 0, "hari baru -> kuota reset");
});

test("blackmarket: kunci keluar dari toko, bahan baru hanya di pasar", () => {
  const shop = JSON.parse(fs.readFileSync(path.join(root, "database/rpg/shop.json"), "utf8"));
  assert.equal(shop["bronze-key"].buyable, false, "bronze key tidak dijual di toko");
  assert.equal(shop["premium-key"].buyable, false, "premium key tidak dijual di toko");
  assert.equal(shop["premium-key"].bmStock, 2);
  assert.equal(shop["void-shard"].bmOnly, true);
  assert.equal(shop["shadow-silk"].bmOnly, true);
});
