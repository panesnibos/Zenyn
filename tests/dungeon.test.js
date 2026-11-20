// Dungeon: floor sampai 200, premium key tiap 20 floor, boss tinggi tetap bisa ditembus.
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

const loadDungeon = (floor, items = []) => {
  const user = { id: "u1", name: "Uji", hp: 500, money: 0, stats: { dungeonFloor: floor, dungeonBest: floor, deaths: 0 } };
  const added = [];
  const sent = [];
  const db = {
    getUser: () => user,
    getStats: () => ({ atk: 999, def: 999, maxHp: 999 }),
    setHp() {},
    updateUser: (_id, fn) => fn(user),
    addMoney() {},
    addExp: () => ({ levelUp: false }),
    addItem: (_id, item) => added.push({ ...item }),
    addQuestProgress() {},
    checkAchievements: () => []
  };
  const client = {
    sendMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "s" } }; },
    sendButtons: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "b" } }; }
  };
  const cmd = loadMocked("commands/rpg/dungeon.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1", makeBar: () => "[bar]" },
    "../../lib/rpgcombat": {
      simulateFight: () => ({ win: true, hp: 400, dealt: 999 }),
      equipmentDrop: (rarity) => items.find((i) => i.rarity === rarity) || null,
      randInt: (a) => a
    },
    "../../lib/rpglimit": { cd: () => 10000 }
  });
  return { cmd, client, user, added, sent };
};

const message = () => ({ key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".dungeon fight" } });

test("dungeon: MAX_FLOOR 200 dan boss 1-50 tidak berubah", () => {
  const { cmd } = loadDungeon(1);
  const { floorBoss, MAX_FLOOR } = cmd._internal;
  assert.equal(MAX_FLOOR, 200);

  const f50 = floorBoss(50);
  assert.equal(f50.hp, 50 + 50 * 30);
  assert.equal(f50.atk, 10 + 50 * 2);
  assert.equal(f50.def, 2 + 50);

  const f200 = floorBoss(200);
  assert.equal(f200.hp, 50 + 50 * 30 + 150 * 12);
  assert.equal(f200.atk, 110, "atk tidak meledak di floor tinggi");
  assert.equal(f200.def, 52 + 30);
});

test("dungeon: premium key tiap kelipatan 20, bukan 19/21", async () => {
  for (const floor of [20, 40, 60, 100, 200]) {
    const { cmd, client, added } = loadDungeon(floor);
    await cmd.execute(client, message(), ["fight"], {}, "dungeon");
    assert.ok(added.some((i) => i.name === "premium-key"), `floor ${floor} harus dapat premium key`);
  }

  for (const floor of [19, 21, 39]) {
    const { cmd, client, added } = loadDungeon(floor);
    await cmd.execute(client, message(), ["fight"], {}, "dungeon");
    assert.ok(!added.some((i) => i.name === "premium-key"), `floor ${floor} tidak boleh dapat key`);
  }
});

test("dungeon: equipment naik ke Epic mulai floor 100", async () => {
  const items = [
    { name: "Steel Sword", emoji: "⚔️", rarity: "Rare" },
    { name: "Phantom Cloak", emoji: "🥷", rarity: "Epic" }
  ];

  const low = loadDungeon(90, items);
  await low.cmd.execute(low.client, message(), ["fight"], {}, "dungeon");
  assert.ok(low.added.some((i) => i.name === "Steel Sword"), "floor 90 -> Rare");

  const high = loadDungeon(100, items);
  await high.cmd.execute(high.client, message(), ["fight"], {}, "dungeon");
  assert.ok(high.added.some((i) => i.name === "Phantom Cloak"), "floor 100 -> Epic");
});

test("dungeon: floor 200 bisa ditembus, lalu berhenti", async () => {
  const done = loadDungeon(201);
  await done.cmd.execute(done.client, message(), ["fight"], {}, "dungeon");
  assert.match(done.sent.at(-1), /sudah menaklukkan dungeon sampai floor 200/);

  const last = loadDungeon(200);
  await last.cmd.execute(last.client, message(), ["fight"], {}, "dungeon");
  assert.match(last.sent.at(-1), /FLOOR CLEAR/);
  assert.equal(last.user.stats.dungeonFloor, 201, "setelah floor 200 tidak bisa diulang");
});

test("dungeon: tampilan menyebut premium key berikutnya", async () => {
  const { cmd, client, sent } = loadDungeon(37);
  await cmd.execute(client, message(), [], {}, "dungeon");
  assert.match(sent.at(-1), /Premium key berikutnya: floor 40/);
});

test("combat: maxRounds khusus dungeon, default tetap 40", () => {
  const combat = require("../lib/rpgcombat");
  const player = { atk: 100, def: 100, maxHp: 1000 };
  const tank = { hp: 100000, atk: 1, def: 0 };

  assert.equal(combat.simulateFight(player, tank, "attack").rounds, 40, "default 40 putaran");
  assert.equal(combat.simulateFight(player, tank, "attack", 1000, 60).rounds, 60, "dungeon 60 putaran");
});
