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

test("blackmarket: 10 unit per sesi, 6-9 baris, tiap baris 1-2", () => {
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db: {} } });

  for (const slot of [12345, 12346, 99999, 777777, 20261120]) {
    const stock = bm.buildStock(slot);
    assert.equal(stock.length >= 6 && stock.length <= 9, true, `baris ${stock.length}`);
    assert.equal(stock.reduce((sum, e) => sum + e.stock, 0), 10, "total stok harus 10 unit");
    for (const entry of stock) {
      assert.ok(entry.stock === 1 || entry.stock === 2, `stok ${entry.key}=${entry.stock}`);
      assert.ok(entry.price > 0, `harga ${entry.key}`);
    }
    const keys = stock.map((e) => e.key);
    assert.equal(new Set(keys).size, keys.length, "tidak boleh ada duplikat");
    for (const key of ["bronze-key", "premium-key", "void-shard", "shadow-silk"]) {
      assert.ok(keys.includes(key), `${key} harus selalu ada`);
    }
  }
});

test("blackmarket: deterministik per sesi dan promo tidak bisa dicuci untung", () => {
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db: {} } });
  assert.deepEqual(bm.buildStock(12345), bm.buildStock(12345), "slot sama -> stok sama");

  let promos = 0;
  for (let slot = 50000; slot < 50040; slot++) {
    const stock = bm.buildStock(slot);
    for (const entry of stock) {
      if (!entry.promo) continue;
      promos++;
      assert.ok(entry.price >= bm._internal.floorPrice(entry.key), `promo ${entry.key} di bawah harga jual`);
    }
  }
  assert.ok(promos > 0, "promo harus pernah muncul");
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
  db.ensure("u1").money = 1000000;

  const out = bm.buy("u1", 1, 1, now);
  assert.equal(out.entry.name, stock[0].name);
  assert.equal(db.getUser("u1").money, 1000000 - stock[0].price);
  assert.equal(db.getUser("u1").inventory[0].name, stock[0].name);

  // habiskan stok baris 1 untuk u1
  const sisa = stock[0].stock - 1;
  if (sisa > 0) bm.buy("u1", 1, sisa, now);
  assert.throws(() => bm.buy("u1", 1, 1, now), /habis/, "stok pribadi habis");
  assert.equal(bm.quotaOf("u1", now).bought, stock[0].stock);

  // pemain lain punya stok sendiri
  db.ensure("u2").money = 1000000;
  assert.ok(bm.buy("u2", 1, 1, now));

  // kuota harian: isi sampai 7
  let bought = bm.quotaOf("u1", now).bought;
  for (let i = 1; i < stock.length && bought < 7; i++) {
    const take = Math.min(stock[i].stock, 7 - bought);
    bm.buy("u1", i + 1, take, now);
    bought = bm.quotaOf("u1", now).bought;
  }
  assert.equal(bought, 7, "kuota terpakai penuh");
  assert.throws(() => bm.buy("u1", 2, 1, now), /Kuota.*habis/i, "kuota harian habis");

  assert.throws(() => bm.buy("u2", 99, 1, now), /tidak ada/);
  db.ensure("u3").money = 0;
  assert.throws(() => bm.buy("u3", 2, 1, now), /tidak cukup/);
});

test("blackmarket: kuota reset saat ganti hari", () => {
  const db = makeDb();
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db } });
  const now = wib(8, 0);
  db.ensure("u1").money = 1000000;
  bm.buy("u1", 1, 1, now);
  assert.equal(bm.quotaOf("u1", now).bought, 1);

  db.getUser("u1").bmDay = "2000-01-01";
  assert.equal(bm.quotaOf("u1", now).bought, 0, "hari baru -> kuota reset");
});

test("blackmarket: kunci tidak dijual di toko dan tidak bisa dijual balik", () => {
  const shop = JSON.parse(fs.readFileSync(path.join(root, "database/rpg/shop.json"), "utf8"));
  for (const key of ["bronze-key", "premium-key", "shadow-key"]) {
    assert.equal(shop[key].buyable, false, `${key} tidak dijual di toko`);
    assert.equal(shop[key].noSell, true, `${key} tidak bisa dijual`);
    assert.equal(shop[key].sell, undefined, `${key} tanpa harga jual`);
  }
  assert.equal(shop["premium-key"].price, 7000);
  assert.equal(shop["void-shard"].bmOnly, true);
  assert.equal(shop["shadow-silk"].bmOnly, true);
});
