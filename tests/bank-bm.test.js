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

test("blackmarket: stok deterministik per slot dan tidak bisa dicuci untung", () => {
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db: {} } });
  const shop = JSON.parse(fs.readFileSync(path.join(root, "database/rpg/shop.json"), "utf8"));

  const a = bm.buildStock(12345);
  const b = bm.buildStock(12345);
  assert.deepEqual(a, b, "slot sama -> stok sama");
  assert.ok(a.length >= 3, "stok minimal 3");

  for (const entry of a) {
    const sell = shop[entry.key]?.sell || 0;
    if (sell) assert.ok(entry.price > sell, `harga ${entry.key} harus di atas harga jual ${sell}`);
    assert.ok(entry.price > 0 && entry.max >= 1);
  }
});

test("blackmarket: beli memotong gold dan menambah item", () => {
  const db = makeDb();
  const bm = loadMocked("lib/blackmarket.js", { "./rpgdb": { db } });
  const stock = bm.current().stock;
  db.ensure("u1").money = 100000;
  const out = bm.buy("u1", 1, 1);
  assert.equal(out.entry.name, stock[0].name);
  assert.equal(db.getUser("u1").money, 100000 - stock[0].price);
  assert.equal(db.getUser("u1").inventory[0].name, stock[0].name);

  db.ensure("u2").money = 0;
  assert.throws(() => bm.buy("u2", 1, 1), /tidak cukup/);
  assert.throws(() => bm.buy("u1", 99, 1), /tidak ada/);
  assert.throws(() => bm.buy("u1", 1, 999), /Maksimal/);
});
