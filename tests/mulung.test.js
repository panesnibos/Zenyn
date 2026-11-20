// Mulung: 1 kantong sampah (4-12) + 2 item acak (1-2), cooldown 4s / 2.5s premium.
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

const loadMulung = (options = {}) => {
  const user = { id: "u1", name: "Uji", money: 0, inventory: [], lastMulung: 0, ...options };
  const added = [];
  const quests = [];
  const sent = [];
  const db = {
    getUser: () => user,
    updateUser: (_id, fn) => fn(user),
    addItem: (_id, item) => added.push({ ...item }),
    addStat() {},
    addQuestProgress: (_id, type) => quests.push(type),
    checkAchievements: () => []
  };
  const client = { sendMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "s" } }; } };
  const cmd = loadMocked("commands/rpg/mulung.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1" }
  });
  return { cmd, user, added, quests, sent, client };
};

const message = () => ({ key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".mulung" } });

test("mulung: selalu 3 baris — kantong 4-12 + dua item 1-2", async () => {
  const { cmd, client, added, sent } = loadMulung();
  await cmd.execute(client, message(), [], {}, "mulung");

  assert.equal(added.length, 3, "3 item masuk inventory");
  assert.equal(added[0].name, "Kantong Sampah");
  assert.ok(added[0].qty >= 4 && added[0].qty <= 12, `qty kantong ${added[0].qty}`);
  for (const item of added.slice(1)) {
    assert.ok(item.qty >= 1 && item.qty <= 2, `qty ${item.name}=${item.qty}`);
  }
  assert.match(sent.at(-1), /MEMULUNG/);
  assert.match(sent.at(-1), /Kantong Sampah x\d+/);
  assert.match(sent.at(-1), /Nilai jual: \d+ gold/);
  assert.match(sent.at(-1), /Cooldown 4 detik/);
});

test("mulung: tidak pernah memberi key", async () => {
  for (let i = 0; i < 40; i++) {
    const { cmd, client, added } = loadMulung();
    await cmd.execute(client, message(), [], {}, "mulung");
    for (const item of added) {
      assert.doesNotMatch(item.name.toLowerCase(), /key|kunci/, `dapat key: ${item.name}`);
    }
  }
});

test("mulung: cooldown 4 detik, premium 2,5 detik", async () => {
  const cold = loadMulung({ lastMulung: Date.now() - 1000 });
  await cold.cmd.execute(cold.client, message(), [], {}, "mulung");
  assert.match(cold.sent.at(-1), /Tunggu \d+ detik/);
  assert.equal(cold.added.length, 0, "tidak ada drop saat cooldown");

  const premium = loadMulung({
    lastMulung: Date.now() - 2600,
    status: { type: "Premium", until: null }
  });
  await premium.cmd.execute(premium.client, message(), [], {}, "mulung");
  assert.equal(premium.added.length, 3, "premium lolos setelah 2,5 detik");
  assert.match(premium.sent.at(-1), /Cooldown 2\.5 detik/);

  const fresh = loadMulung();
  await fresh.cmd.execute(fresh.client, message(), [], {}, "mulung");
  assert.ok(fresh.user.lastMulung > 0, "cooldown dipasang");
});

test("mulung: semua item bisa dijual lewat toko", () => {
  const shop = JSON.parse(fs.readFileSync(path.join(root, "database/rpg/shop.json"), "utf8"));
  const { POOL, BAG_KEY } = require("../commands/rpg/mulung")._internal;

  assert.ok(shop[BAG_KEY].sell >= 1);
  assert.equal(shop[BAG_KEY].buyable, false);
  for (const item of POOL) {
    assert.ok(shop[item.key]?.sell >= 1, `${item.key} tidak punya harga jual`);
  }
});

test("mulung: menambah progress quest mulung", async () => {
  const { cmd, client, quests } = loadMulung();
  await cmd.execute(client, message(), [], {}, "mulung");
  assert.deepEqual(quests, ["mulung"]);
});

test("item: kantong sampah menampilkan sumber .mulung", () => {
  const { infoText, resolveItem } = require("../lib/iteminfo");
  const text = infoText(resolveItem("kantong-sampah").item);
  assert.match(text, /\.mulung \(4–12 per mulung\)/);
  assert.match(text, /Jual: 8 gold/);
});
