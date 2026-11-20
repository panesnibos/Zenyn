// Market dua arah: listing (barang dijual) dan buy order (dicari pembeli, gold ditahan).
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

const quiet = { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, debug() {} };

const makeDb = () => {
  const users = {};
  const ensure = (id) => (users[id] = users[id] || { id, name: id, money: 0, inventory: [] });
  const find = (id, name) =>
    ensure(id).inventory.find((i) => String(i.name).toLowerCase() === String(name).toLowerCase());
  return {
    users,
    ensure,
    getUser: (id) => ensure(id),
    addMoney: (id, n) => { ensure(id).money += n; },
    addItem: (id, item) => {
      const found = find(id, item.name);
      if (found) found.qty += item.qty || 1;
      else ensure(id).inventory.push({ ...item, qty: item.qty || 1 });
    },
    removeItem: (id, name, qty = 1) => {
      const found = find(id, name);
      if (!found || found.qty < qty) return false;
      found.qty -= qty;
      ensure(id).inventory = ensure(id).inventory.filter((i) => i.qty > 0);
      return true;
    },
    hasItem: (id, name, qty = 1) => {
      const found = find(id, name);
      return !!found && found.qty >= qty;
    },
    addStat() {},
    addQuestProgress() {},
    checkAchievements: () => []
  };
};

const loadMarket = () => {
  let data = { listings: [], orders: [] };
  const json = {
    readJson: () => JSON.parse(JSON.stringify(data)),
    writeJson: (_f, next) => { data = JSON.parse(JSON.stringify(next)); }
  };
  const db = makeDb();
  const who = { id: "u1" };
  const sent = [];
  const client = {
    sendMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "s" } }; },
    sendInteractiveMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "i" } }; }
  };
  const cmd = loadMocked("commands/rpg/market.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => who.id },
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/rpgjson": json
  });
  return { cmd, client, db, who, sent, state: () => data };
};

const message = () => ({ key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".market" } });
const last = (sent) => sent.at(-1) || "";

test("market: buy order menahan gold, fill meneruskan barang + pajak 5%", async () => {
  const { cmd, client, db, who, sent, state } = loadMarket();

  db.ensure("u1").money = 10000;
  who.id = "u1";
  await cmd.execute(client, message(), ["order", "Void", "Shard", "2", "1600"], {}, "market");
  assert.match(last(sent), /Order beli dipasang/);
  assert.equal(db.getUser("u1").money, 6800, "3200 gold ditahan");
  const order = state().orders[0];
  assert.equal(order.escrow, 3200);

  db.ensure("u2").inventory.push({ name: "Void Shard", emoji: "💠", qty: 2 });
  who.id = "u2";
  await cmd.execute(client, message(), ["fill", order.id], {}, "market");
  assert.match(last(sent), /Terjual ke/);
  assert.equal(db.getUser("u2").money, 3040, "3200 - 5% pajak");
  assert.equal(db.getUser("u1").inventory[0].name, "Void Shard");
  assert.equal(state().orders.length, 0);
});

test("market: batalkan order mengembalikan gold", async () => {
  const { cmd, client, db, who, sent, state } = loadMarket();
  db.ensure("u1").money = 5000;
  who.id = "u1";
  await cmd.execute(client, message(), ["order", "Void", "Shard", "1", "1500"], {}, "market");
  assert.equal(db.getUser("u1").money, 3500);

  const id = state().orders[0].id;
  await cmd.execute(client, message(), ["unorder", id], {}, "market");
  assert.match(last(sent), /dikembalikan/);
  assert.equal(db.getUser("u1").money, 5000);
  assert.equal(state().orders.length, 0);
});

test("market: listing biasa tetap jalan dan dikenai pajak", async () => {
  const { cmd, client, db, who, sent, state } = loadMarket();

  db.ensure("u1").inventory.push({ name: "Potion", emoji: "🧪", qty: 2 });
  db.ensure("u1").money = 0;
  db.ensure("u2").money = 1000;
  who.id = "u1";
  await cmd.execute(client, message(), ["sell", "Potion", "2", "300"], {}, "market");
  assert.match(last(sent), /Listing dibuat/);
  const id = state().listings[0].id;

  who.id = "u2";
  await cmd.execute(client, message(), ["buy", id], {}, "market");
  assert.match(last(sent), /Pembelian berhasil/);
  assert.equal(db.getUser("u2").money, 400);
  assert.equal(db.getUser("u1").money, 570, "600 - 5% pajak");
});

test("market: item ber-noSell ditolak di jual maupun order", async () => {
  const { cmd, client, db, who, sent } = loadMarket();
  who.id = "u1";
  db.ensure("u1").money = 10000;
  db.ensure("u1").inventory.push({ name: "premium-key", emoji: "🗝️", qty: 1 });

  await cmd.execute(client, message(), ["sell", "premium-key", "1", "5000"], {}, "market");
  assert.match(last(sent), /tidak bisa diperdagangkan/);

  await cmd.execute(client, message(), ["order", "bronze-key", "1", "1000"], {}, "market");
  assert.match(last(sent), /tidak bisa diperdagangkan/);
});

test("market: menu dua arah (barang dijual & dicari pembeli)", async () => {
  const { cmd, client, sent } = loadMarket();
  await cmd.execute(client, message(), [], {}, "market");
  const text = last(sent);
  assert.match(text, /PLAYER MARKET/);
  assert.match(text, /Barang dijual/);
  assert.match(text, /Dicari pembeli/);
});
