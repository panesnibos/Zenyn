// Pity gacha: counter per user×crate, jaminan menambahkan Diamond, reset setelahnya.
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

const loadPity = () => loadMocked("lib/pity.js", { "./rpgjson": memJson() });

test("pity: naik per buka, reset setelah jaminan", () => {
  const pity = loadPity();
  assert.equal(pity.THRESHOLD, 50);
  assert.equal(pity.get("u1", "bronze-key"), 0);
  assert.equal(pity.needed("u1", "bronze-key"), 50);
  for (let i = 0; i < 49; i++) pity.bump("u1", "bronze-key");
  assert.equal(pity.get("u1", "bronze-key"), 49);
  assert.equal(pity.needed("u1", "bronze-key"), 1);
  assert.equal(pity.bump("u1", "bronze-key"), 50);
  pity.reset("u1", "bronze-key");
  assert.equal(pity.get("u1", "bronze-key"), 0);
  // crate lain tidak terpengaruh
  assert.equal(pity.get("u1", "premium-key"), 0);
});

const loadGacha = (pityMock, inventory) => {
  const sent = [];
  const db = {
    getUser: () => ({ id: "u1", name: "Uji", inventory, money: 0 }),
    addMoney() {},
    addItem: (_id, item) => inventory.push({ ...item }),
    removeItem: () => {},
    addStat() {},
    checkAchievements: () => []
  };
  const cmd = loadMocked("commands/rpg/gacha.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1", getRank: () => ({ rank: "Novice", icon: "🌱" }) },
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/pity": pityMock
  });
  const client = { sendMessage: async (_jid, payload) => { sent.push(payload.text); } };
  return { cmd, sent };
};

test("pity: buka ke-THRESHOLD memberi Diamond dan menandai pesan", async () => {
  const inventory = [{ name: "bronze-key", emoji: "🗝️", qty: 3 }];
  const pityMock = { THRESHOLD: 3, get: () => 0, needed: () => 3, bump: () => 3, reset: () => {} };
  const { cmd, sent } = loadGacha(pityMock, inventory);
  const msg = { key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji" };

  await cmd.execute({ sendMessage: async (_j, p) => sent.push(p.text) }, msg, ["bronze-key", "3"], {}, "open");
  const text = sent.at(-1);
  assert.match(text, /PITY PENUH/);
  assert.match(text, /💎 Diamond x3/, text);
  assert.match(text, /Pity: 0\/3/);
});

test("pity: belum penuh tidak memberi bonus", async () => {
  const inventory = [{ name: "bronze-key", emoji: "🗝️", qty: 1 }];
  const pityMock = { THRESHOLD: 50, get: () => 12, needed: () => 38, bump: () => 13, reset: () => {} };
  const { cmd, sent } = loadGacha(pityMock, inventory);
  const msg = { key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji" };

  await cmd.execute({ sendMessage: async (_j, p) => sent.push(p.text) }, msg, ["bronze-key", "1"], {}, "open");
  const text = sent.at(-1);
  assert.doesNotMatch(text, /PITY PENUH/);
  assert.match(text, /Pity: 12\/50/, text);
});
