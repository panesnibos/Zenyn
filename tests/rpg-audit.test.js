// Audit RPG: greater potion, prestige reset, transfer cooldown, inventory +N, market expired.
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
const message = () => ({ key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji", message: { conversation: "." } });

// ---------- heal ----------
const loadHeal = (inventory, commandName, hp = 50) => {
  const user = { id: "u1", name: "Uji", level: 10, hp, maxHp: 100, money: 0, inventory };
  const sent = [];
  const calls = { removed: [] };
  let payload = null;
  const db = {
    getUser: () => user,
    getStats: () => ({ atk: 10, def: 5, maxHp: 200, goldBonus: 0 }),
    removeItem: (_id, name) => calls.removed.push(name),
    setHp: (_id, value) => { user.hp = value; },
    addQuestProgress() {},
    checkAchievements: () => []
  };
  const client = {
    sendMessage: async (_jid, p) => { sent.push(p.text); return { key: { id: "s" } }; },
    sendInteractiveMessage: async (_jid, p) => { sent.push(p.text); payload = p; return { key: { id: "i" } }; }
  };
  const cmd = loadMocked("commands/rpg/heal.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1", getRank: () => ({ rank: "Warrior", icon: "⚔️" }) }
  });
  return { cmd, client, user, sent, calls, payload: () => payload, commandName };
};

test("heal: Greater Potion benar-benar bisa dipakai", async () => {
  const h = loadHeal([{ name: "Greater Potion", emoji: "🧪", qty: 2 }], "greaterpotion", 50);
  await h.cmd.execute(h.client, message(), [], {}, h.commandName);
  assert.equal(h.calls.removed[0], "Greater Potion", "removeItem pakai nama inventory");
  assert.equal(h.user.hp, 170, "50 + 120");
  assert.match(h.sent.at(-1), /Greater Potion digunakan/);
  assert.match(h.sent.at(-1), /170\/200/, "denominator pakai maxHp hasil stat");
});

test("heal: tombol menu memakai id command yang valid", async () => {
  const h = loadHeal([], "heal");
  await h.cmd.execute(h.client, message(), [], {}, h.commandName);
  const rows = JSON.parse(h.payload().interactiveButtons[0].buttonParamsJson).sections[0].rows;
  assert.deepEqual(rows.map((r) => r.id), ["potion", "elixir", "greaterpotion"]);
});

// ---------- prestige ----------
test("prestige: reset dungeon ke floor 1, rekor best tetap", async () => {
  const user = {
    id: "u1",
    name: "Uji",
    level: 50,
    money: 20000,
    prestige: 0,
    maxHp: 600,
    hp: 600,
    atk: 110,
    def: 60,
    exp: 0,
    expNeeded: 1,
    stats: { dungeonFloor: 150, dungeonBest: 150, deaths: 3 }
  };
  const sent = [];
  const db = {
    getUser: () => user,
    updateUser: (_id, fn) => { fn(user); return user; },
    checkAchievements: () => []
  };
  const client = { sendMessage: async (_j, p) => { sent.push(p.text); return {}; } };
  const cmd = loadMocked("commands/rpg/prestige.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1" }
  });

  await cmd.execute(client, message(), ["confirm"], {}, "prestige");
  assert.equal(user.prestige, 1);
  assert.equal(user.stats.dungeonFloor, 1, "dungeon direset");
  assert.equal(user.stats.dungeonBest, 150, "rekor tidak dihapus");
  assert.equal(user.level, 1);
});

// ---------- transfer ----------
const loadTransfer = (lastTransfer) => {
  const u1 = { id: "u1", name: "A", money: 1000, lastTransfer };
  const u2 = { id: "u2", name: "B", money: 0 };
  const sent = [];
  const db = {
    getUser: (id) => (id === "u1" ? u1 : u2),
    addMoney: (id, n) => { (id === "u1" ? u1 : u2).money += n; },
    updateUser: (id, fn) => fn(id === "u1" ? u1 : u2)
  };
  const client = {
    sendMessage: async (_j, p) => { sent.push(p.text); return {}; },
    sendButtons: async (_j, p) => { sent.push(p.text); return {}; }
  };
  const cmd = loadMocked("commands/rpg/transfer.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": {
      getUserId: () => "u1",
      resolveTarget: async () => ({ targetId: "u2", rest: ["100"] })
    },
    "../../lib/prefix": { getPrefix: () => "." }
  });
  return { cmd, client, u1, u2, sent };
};

test("transfer: cooldown 30 detik, validasi tidak memotong cooldown", async () => {
  const cold = loadTransfer(Date.now() - 5000);
  await cold.cmd.execute(cold.client, message(), ["100"], {}, "transfer");
  assert.match(cold.sent.at(-1), /Tunggu \d+ detik/);
  assert.equal(cold.u1.money, 1000, "gold tidak berpindah");

  const fresh = loadTransfer(0);
  await fresh.cmd.execute(fresh.client, message(), ["100"], {}, "transfer");
  assert.equal(fresh.u1.money, 900);
  assert.equal(fresh.u2.money, 100);
  assert.ok(fresh.u1.lastTransfer > 0, "cooldown dipasang");
});

// ---------- inventory ----------
test("inventory: equipment menampilkan level upgrade", () => {
  const user = {
    id: "u1",
    name: "Uji",
    hp: 100,
    inventory: [{ name: "Dragon Sword", emoji: "🐉", qty: 1 }],
    equipment: { weapon: "Dragon Sword", armor: null, accessory: null },
    enh: { "dragon sword": 5 }
  };
  const sent = [];
  const db = { getUser: () => user, getStats: () => ({ atk: 80, def: 5, maxHp: 100 }) };
  const client = { sendMessage: async (_j, p) => { sent.push(p.text); return {}; } };
  const cmd = loadMocked("commands/rpg/inventory.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1" }
  });
  return cmd.execute(client, message(), [], {}, "inventory").then(() => {
    assert.match(sent.at(-1), /Dragon Sword\* \+5 x1/);
  });
});

// ---------- market expired ----------
test("market: listing & order kedaluwarsa dikembalikan otomatis", async () => {
  const past = Date.now() - 60000;
  let state = {
    listings: [{ id: "L1", sellerId: "u1", sellerName: "A", name: "Potion", emoji: "🧪", qty: 2, price: 100, createdAt: 1, expiresAt: past }],
    orders: [{ id: "O1", buyerId: "u2", buyerName: "B", name: "Void Shard", emoji: "💠", qty: 1, price: 1000, escrow: 1000, createdAt: 1, expiresAt: past }]
  };
  const users = {
    u1: { id: "u1", name: "A", money: 0, inventory: [] },
    u2: { id: "u2", name: "B", money: 0, inventory: [] }
  };
  const json = {
    readJson: () => JSON.parse(JSON.stringify(state)),
    writeJson: (_f, next) => { state = JSON.parse(JSON.stringify(next)); }
  };
  const db = {
    getUser: (id) => users[id] || (users[id] = { id, name: id, money: 0, inventory: [] }),
    addMoney: (id, n) => { db.getUser(id).money += n; },
    addItem: (id, item) => db.getUser(id).inventory.push({ ...item }),
    addStat() {},
    addQuestProgress() {},
    checkAchievements: () => []
  };
  const sent = [];
  const client = {
    sendMessage: async (_j, p) => { sent.push(p.text); return {}; },
    sendInteractiveMessage: async (_j, p) => { sent.push(p.text); return {}; }
  };
  const cmd = loadMocked("commands/rpg/market.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1" },
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/rpgjson": json
  });

  await cmd.execute(client, message(), [], {}, "market");
  assert.equal(users.u1.inventory[0].name, "Potion", "barang kembali ke penjual");
  assert.equal(users.u2.money, 1000, "escrow kembali ke pembeli");
  assert.equal(state.listings.length, 0);
  assert.equal(state.orders.length, 0);
});
