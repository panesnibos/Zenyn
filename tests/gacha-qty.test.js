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

const loadGacha = (ownedQty) => {
  const state = { removed: 0, added: {}, gold: 0, sent: [] };
  const user = {
    name: "Uji",
    level: 1,
    money: 1000,
    inventory: [{ name: "bronze-key", emoji: "🗝️", qty: ownedQty }]
  };
  const client = { sendMessage: async (jid, msg) => state.sent.push(msg.text), sendInteractiveMessage: async () => {} };
  const gacha = loadMocked("commands/rpg/gacha.js", {
    "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {} },
    "../../lib/rpgdb": {
      db: {
        getUser: () => user,
        addMoney: (id, n) => (state.gold += n),
        addItem: (id, it) => (state.added[it.name] = (state.added[it.name] || 0) + it.qty),
        removeItem: (id, name, qty = 1) => (state.removed += qty)
      }
    },
    "../../lib/rpgutil": { getUserId: () => "628100000001", getRank: () => ({ rank: "Novice", icon: "🌱" }) },
    "../../lib/prefix": { getPrefix: () => "." }
  });
  return { gacha, state, client };
};

const message = { key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji" };

test("open: jumlah 3 -> 3 crate terpakai", async () => {
  const { gacha, state, client } = loadGacha(10);
  await gacha.execute(client, message, ["bronze-key", "3"], {}, "open");
  assert.equal(state.removed, 3);
  assert.ok(state.gold >= 1500, "gold 3x buka harus terkumpul");
  assert.match(state.sent[0], /x3/);
});

test("open: jumlah melebihi stok dibatasi stok", async () => {
  const { gacha, state, client } = loadGacha(2);
  await gacha.execute(client, message, ["bronze-key", "5"], {}, "open");
  assert.equal(state.removed, 2);
  assert.match(state.sent[0], /stok 2/);
});

test("open: tanpa jumlah -> buka 1", async () => {
  const { gacha, state, client } = loadGacha(5);
  await gacha.execute(client, message, ["bronze-key"], {}, "open");
  assert.equal(state.removed, 1);
  assert.doesNotMatch(state.sent[0], / x\d+\n\n💰/);
});
