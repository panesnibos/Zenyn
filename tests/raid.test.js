// Raid: boss grup & world boss — nama per level, hadiah share damage,
// penalti mati 60 detik, cooldown spawn, dan DM peserta.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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

const quiet = { info() {}, warn() {}, error() {}, cmd() {}, ok() {} };

const makeDb = () => {
  const users = {};
  const ensure = (id, name) => {
    if (!users[id]) users[id] = { id, name: name || id, hp: 100, maxHp: 100, level: 10, money: 0, inventory: [], stats: {} };
    return users[id];
  };
  return {
    users,
    ensure,
    getUser: (id, name) => ensure(id, name),
    updateUser: (id, fn) => fn(ensure(id)),
    getStats: () => ({ atk: 40, def: 10, maxHp: 100, goldBonus: 0 }),
    addMoney: (id, n) => { ensure(id).money += n; },
    addExp() {},
    addItem() {},
    addQuestProgress() {},
    checkAchievements: () => []
  };
};

let seq = 0;
const loadRaid = () => {
  const file = path.join(os.tmpdir(), `raid-test-${process.pid}-${++seq}.json`);
  fs.rmSync(file, { force: true });
  process.env.RAID_FILE = file;
  process.env.RAID_ATTACK_CD_MS = "2000";
  process.env.RAID_RESPAWN_MS = "900000";
  process.env.WB_RESPAWN_MS = "1800000";
  process.env.RAID_DEATH_MS = "60000";
  process.env.RAID_MAX_LEVEL = "200";

  const db = makeDb();
  const sent = [];
  const client = {
    sendMessage: async (jid, payload) => { sent.push({ jid, payload, via: "text" }); return { key: { id: "s" } }; },
    sendButtons: async (jid, payload) => { sent.push({ jid, payload, via: "buttons" }); return { key: { id: "b" } }; },
    sendInteractiveMessage: async (jid, payload) => { sent.push({ jid, payload, via: "interactive" }); return { key: { id: "i" } }; }
  };
  const cmd = loadMocked("commands/rpg/raid.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: (m) => m.uid, makeBar: () => "[bar]" },
    "../../lib/rpgcombat": { randInt: (a, b) => b, equipmentDrop: () => null }
  });
  return { cmd, db, client, sent, file };
};

const message = (uid, chat = "120363000000@g.us") => ({ uid, key: { remoteJid: chat }, pushName: `P${uid}`, message: { conversation: ".raid" } });
const lastText = (sent) => sent.at(-1).payload.text || sent.at(-1).payload.caption || "";
const rowsOf = (sent) => JSON.parse(sent.at(-1).payload.interactiveButtons[0].buttonParamsJson).sections[0].rows;

test("raid: gelar level 1-200 dan nama grup vs world berbeda", () => {
  const { cmd } = loadRaid();
  const { titleFor, displayName, GROUP_BOSSES, WORLD_BOSSES } = cmd._internal;

  assert.equal(titleFor(1), "Young");
  assert.equal(titleFor(19), "Young");
  assert.equal(titleFor(20), "");
  assert.equal(titleFor(39), "");
  assert.equal(titleFor(40), "Elder");
  assert.equal(titleFor(60), "Ancient");
  assert.equal(titleFor(80), "Arcane");
  assert.equal(titleFor(100), "Mythic");
  assert.equal(titleFor(120), "Celestial");
  assert.equal(titleFor(140), "Abyssal");
  assert.equal(titleFor(160), "Primordial");
  assert.equal(titleFor(180), "Eternal");
  assert.equal(titleFor(200), "Eternal");

  assert.equal(displayName("Shadow Wyrm", 57), "Elder Shadow Wyrm");
  assert.equal(displayName("Shadow Wyrm", 12), "Young Shadow Wyrm");
  assert.equal(displayName("Shadow Wyrm", 32), "Shadow Wyrm");
  assert.equal(displayName("Ancient Golem", 72), "Prime Ancient Golem");
  assert.equal(displayName("Chrono Leviathan", 188), "Eternal Chrono Leviathan");

  const groupNames = new Set(GROUP_BOSSES.map((b) => b.base));
  for (const b of WORLD_BOSSES) assert.ok(!groupNames.has(b.base), `nama bentrok: ${b.base}`);
});

test("raid: level dibatasi MAX_LEVEL dan stat mengikuti level", () => {
  const { cmd } = loadRaid();
  const low = cmd._internal.spawnBoss(cmd._internal.GROUP_BOSSES, 5);
  assert.equal(low.level, 5);
  assert.equal(low.maxHp, 600 + 5 * 160);
  const high = cmd._internal.spawnBoss(cmd._internal.GROUP_BOSSES, 999);
  assert.equal(high.level, cmd._internal.MAX_LEVEL);
  assert.equal(high.maxHp, 600 + 200 * 160);
});

test("raid: menu menampilkan dua pool boss dan tombol list", async () => {
  const { cmd, client, sent } = loadRaid();
  await cmd.execute(client, message("u1"), [], {}, "raid");
  const text = lastText(sent);
  assert.match(text, /RAID MENU/);
  assert.match(text, /Boss grup : belum ada boss/);
  assert.match(text, /Shadow Wyrm/);
  assert.match(text, /Chrono Leviathan/);
  assert.equal(sent.at(-1).via, "interactive", "menu memakai sendInteractiveMessage");
  assert.equal(sent.at(-1).payload.interactiveButtons[0].name, "single_select");
  const ids = rowsOf(sent).map((r) => r.id);
  for (const id of ["raid attack", "raid join", "raid wb", "raid status", "raid top"]) assert.ok(ids.includes(id), id);
});

test("raid join: tanpa boss -> pesan tidak ada, dengan boss -> picker", async () => {
  const { cmd, client, sent } = loadRaid();
  assert.equal(await cmd.execute(client, message("u1"), ["join"], {}, "raid"), false);
  assert.match(lastText(sent), /Tidak ada boss aktif/);

  await cmd.execute(client, message("u1"), ["attack"], {}, "raid"); // spawn + serang
  const res = await cmd.execute(client, message("u1"), ["join"], {}, "raid");
  const ids = rowsOf(sent).map((r) => r.id);
  assert.ok(ids.includes("raid attack"), "picker memuat boss grup");
  assert.ok(res);
  assert.ok(!sent.some((s) => s.via === "buttons"), "tidak boleh pakai sendButtons native-flow");
});

test("raid attack: boss kehilangan HP, player kena balasan, cooldown 2 detik", async () => {
  const { cmd, db, client, sent } = loadRaid();
  const user = db.ensure("u1", "Budi");

  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");
  const text = lastText(sent);
  assert.match(text, /menyerang/);
  assert.match(text, /Boss membalas/);
  assert.ok(user.hp < 100, "HP pemain turun karena balasan boss");
  assert.ok(user.lastRaid > 0);

  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");
  assert.match(lastText(sent), /Tunggu 2 detik|Tunggu/);
});

test("raid: mati -> terkunci 60 detik dan tidak bisa menyerang", async () => {
  const { cmd, db, client, sent } = loadRaid();
  const user = db.ensure("u1", "Budi");
  user.hp = 1;

  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");
  assert.equal(user.hp, 0);
  assert.ok(user.raidLock > 0, "lock kematian dipasang");
  assert.match(lastText(sent), /KAMU TUMBANG/);

  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");
  assert.match(lastText(sent), /tumbang.*Tidak bisa menyerang|Tidak bisa menyerang/);

  // lock habis -> pulih 30% HP dan bisa menyerang lagi
  user.raidLock = Date.now() - 61000;
  user.hp = 0;
  user.lastRaid = Date.now() - 5000;
  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");
  assert.ok(user.hp > 0, "HP dipulihkan setelah lock habis");
});

test("raid: boss tumbang -> hadiah dibagi sesuai share, DM peserta terkirim", async () => {
  const { cmd, db, client, sent } = loadRaid();
  const a = db.ensure("u1", "Budi");
  const b = db.ensure("u2", "Rina");

  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");
  const [key] = Object.keys(JSON.parse(fs.readFileSync(process.env.RAID_FILE, "utf8")));
  const data = JSON.parse(fs.readFileSync(process.env.RAID_FILE, "utf8"));
  data[key].hp = 1; // paksa satu serangan lagi untuk menumbangkan
  data[key].participants.u2 = { name: "Rina", damage: 10 };
  fs.writeFileSync(process.env.RAID_FILE, JSON.stringify(data));
  cmd._internal.resetCache();

  a.lastRaid = Date.now() - 5000;
  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");

  const groupMsg = sent.find((s) => /BOSS TUMBANG/.test(s.payload.text || ""));
  assert.ok(groupMsg, "ringkasan tumbang dikirim ke grup");
  assert.match(groupMsg.payload.text, /Hadiah/);
  assert.ok(a.money > 0 && b.money > 0, "kedua peserta dapat gold");

  const dm = sent.filter((s) => s.jid.endsWith("@s.whatsapp.net"));
  assert.equal(dm.length, 2, "DM ke tiap peserta");
  assert.match(dm[0].payload.text, /Peringkat/);
});

test("raid: setelah tumbang, spawn menunggu cooldown 15 menit", async () => {
  const { cmd, db, client, sent } = loadRaid();
  const data0 = { };
  const user = db.ensure("u1", "Budi");
  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");

  const file = process.env.RAID_FILE;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const key = Object.keys(data)[0];
  data[key].hp = 1;
  fs.writeFileSync(file, JSON.stringify(data));
  cmd._internal.resetCache();

  user.lastRaid = Date.now() - 5000;
  user.hp = 100;
  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");

  user.lastRaid = Date.now() - 5000;
  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");
  assert.match(lastText(sent), /sudah tumbang.*Spawn lagi dalam/s);

  // paksa waktu mundur: defeatedAt lama
  const later = JSON.parse(fs.readFileSync(file, "utf8"));
  later[key].defeatedAt = Date.now() - 16 * 60 * 1000;
  fs.writeFileSync(file, JSON.stringify(later));
  cmd._internal.resetCache();

  user.lastRaid = Date.now() - 5000;
  user.hp = 100;
  await cmd.execute(client, message("u1"), ["attack"], {}, "raid");
  assert.match(lastText(sent), /menyerang/, "boss baru sudah spawn");
});

test("raid wb: dua grup berbeda menyerang satu world boss yang sama", async () => {
  const { cmd, db, client, sent } = loadRaid();
  const a = db.ensure("u1", "Budi");
  const b = db.ensure("u2", "Rina");

  await cmd.execute(client, message("u1", "g1@g.us"), ["wb"], {}, "raid");
  const file = process.env.RAID_FILE;
  const afterFirst = JSON.parse(fs.readFileSync(file, "utf8")).__world;
  assert.ok(afterFirst.hp < afterFirst.maxHp);
  assert.ok(afterFirst.participants.u1, "u1 tercatat di world boss");

  await cmd.execute(client, message("u2", "g2@g.us"), ["wb"], {}, "raid");
  const afterSecond = JSON.parse(fs.readFileSync(file, "utf8")).__world;
  assert.ok(afterSecond.hp < afterFirst.hp, "HP world boss turun dari grup lain");
  assert.ok(afterSecond.participants.u2, "u2 tercatat");
  assert.notEqual(a, b);
});
