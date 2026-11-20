// Upgrade equipment menempel ke item, bukan ke slot.
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
const { statsOf } = require("../lib/rpgcombat");

const makeUser = () => ({
  id: "u1",
  name: "Uji",
  money: 100000,
  hp: 100,
  maxHp: 100,
  atk: 10,
  def: 5,
  level: 10,
  inventory: [
    { name: "Dragon Sword", emoji: "🐉", qty: 1 },
    { name: "Iron Sword", emoji: "⚔️", qty: 1 }
  ],
  equipment: { weapon: "Dragon Sword", armor: null, accessory: null },
  enhance: { weapon: 0, armor: 0, accessory: 0 },
  enh: {}
});

const loadEquip = () => {
  const user = makeUser();
  const sent = [];
  const db = {
    getUser: () => user,
    updateUser: (_id, fn) => { fn(user); return user; },
    getStats: (u) => statsOf(u)
  };
  const client = {
    sendMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "s" } }; },
    sendButtons: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "b" } }; },
    sendInteractiveMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "i" } }; }
  };
  const cmd = loadMocked("commands/rpg/equip.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1" },
    "../../lib/prefix": { getPrefix: () => "." }
  });
  return { cmd, client, user, sent };
};

const message = () => ({ key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".equip" } });
const last = (sent) => sent.at(-1);

test("upgrade tidak hilang saat ganti senjata lalu balik lagi", async () => {
  const { cmd, client, user, sent } = loadEquip();

  await cmd.execute(client, message(), ["weapon"], {}, "upgrade");
  assert.equal(user.enh["dragon sword"], 1, "dragon sword jadi +1");
  assert.equal(user.money, 99500);

  await cmd.execute(client, message(), ["iron", "sword"], {}, "equip");
  assert.equal(user.equipment.weapon, "Iron Sword");
  assert.match(last(sent), /Iron Sword/);

  await cmd.execute(client, message(), ["dragon", "sword"], {}, "equip");
  assert.equal(user.equipment.weapon, "Dragon Sword");
  assert.equal(user.enh["dragon sword"], 1, "level +1 tetap ada setelah bolak-balik");
  assert.match(last(sent), /⚔️ \+72/, "stat yang tampil sudah naik (+1 level)");
});

test("unequip tidak menghapus upgrade", async () => {
  const { cmd, client, user, sent } = loadEquip();
  await cmd.execute(client, message(), ["weapon"], {}, "upgrade");
  await cmd.execute(client, message(), ["weapon"], {}, "unequip");
  assert.equal(user.equipment.weapon, null);
  assert.equal(user.enh["dragon sword"], 1);

  await cmd.execute(client, message(), ["dragon", "sword"], {}, "equip");
  assert.equal(user.enh["dragon sword"], 1);
  assert.match(last(sent), /⚔️ \+72/);
});

test("stat ikut level item yang sedang dipakai", () => {
  const base = makeUser();
  const plain = statsOf({ ...base, equipment: { weapon: "Dragon Sword" }, enh: {} });
  const upgraded = statsOf({ ...base, equipment: { weapon: "Dragon Sword" }, enh: { "dragon sword": 3 } });
  assert.ok(upgraded.atk > plain.atk, "senjata +3 lebih kuat dari +0");
});

test("db: migrasi enhance lama per slot ke per item", () => {
  const mem = (() => {
    let data = {};
    return {
      readJson: () => JSON.parse(JSON.stringify(data)),
      writeJson: (_f, next) => { data = JSON.parse(JSON.stringify(next)); }
    };
  })();
  const { db } = loadMocked("lib/rpgdb.js", { "./rpgjson": mem });

  db.getUser("u9", "Uji");
  db.updateUser("u9", (u) => {
    u.equipment.weapon = "Dragon Sword";
    u.enhance.weapon = 4;
    u.enh = {};
    u.enhV2 = false; // paksa migrasi ulang
  });

  const user = db.getUser("u9");
  assert.equal(user.enh["dragon sword"], 4, "level lama dipindah ke item");
  assert.equal(user.enhance.weapon, 0, "field lama dinolkan");
});

test("db: level ikut hilang kalau stok item habis", () => {
  const mem = (() => {
    let data = {};
    return {
      readJson: () => JSON.parse(JSON.stringify(data)),
      writeJson: (_f, next) => { data = JSON.parse(JSON.stringify(next)); }
    };
  })();
  const { db } = loadMocked("lib/rpgdb.js", { "./rpgjson": mem });

  db.getUser("u9", "Uji");
  db.addItem("u9", { name: "Dragon Sword", emoji: "🐉", qty: 1 });
  db.updateUser("u9", (u) => { u.enh["dragon sword"] = 5; });

  assert.equal(db.removeItem("u9", "Dragon Sword", 1), true);
  assert.equal(db.getUser("u9").enh["dragon sword"], undefined, "tidak bisa jual lalu dapat upgrade gratis");
});
