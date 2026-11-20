// Gacha: 1 buka = 1 gold + 3 item, item ber-cap maksimal 1, qty rentang.
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
const gachaData = JSON.parse(fs.readFileSync(path.join(root, "database/rpg/gacha.json"), "utf8"));

const loadGacha = (inventory = []) => {
  const added = [];
  const money = [];
  const user = { id: "u1", name: "Uji", level: 10, money: 1000, inventory };
  const sent = [];
  const db = {
    getUser: () => user,
    addMoney: (_id, n) => { money.push(n); user.money += n; },
    addItem: (_id, item) => { added.push({ ...item }); },
    removeItem: (_id, name) => {
      const found = user.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase());
      if (found) found.qty -= 1;
      return true;
    }
  };
  const client = {
    sendMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "s" } }; },
    sendInteractiveMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "i" } }; }
  };
  const cmd = loadMocked("commands/rpg/gacha.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1", getRank: () => ({ rank: "Player", icon: "🙂" }) },
    "../../lib/prefix": { getPrefix: () => "." }
  });
  return { cmd, client, user, sent, added, money };
};

const message = () => ({ key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".crate" } });

test("gacha: satu buka = 1 gold + 3 item", () => {
  const { cmd } = loadGacha([]);
  const { openCrate } = cmd._internal;

  for (const key of Object.keys(gachaData)) {
    const crate = gachaData[key];
    for (let i = 0; i < 120; i++) {
      const got = openCrate(crate, "u1");
      assert.equal(got.rewards.length, 3, `${key}: harus 3 item`);
      assert.ok(got.gold >= crate.gold.min && got.gold <= crate.gold.max, `${key}: gold di rentang`);
      const caps = got.rewards.filter((r) => crate.items.find((it) => it.name === r.name)?.cap);
      assert.ok(caps.length <= 1, `${key}: item cap maksimal 1`);
    }
  }
});

test("gacha: qty rentang dipakai (bronze key 1-4, shadow key 1-2)", () => {
  const { cmd } = loadGacha([]);
  const { openCrate } = cmd._internal;
  const bronzeKeys = new Set();
  const shadowKeys = new Set();

  for (let i = 0; i < 400; i++) {
    for (const reward of openCrate(gachaData["premium-key"], "u1").rewards) {
      if (reward.name === "Bronze-key") bronzeKeys.add(reward.qty);
      if (reward.name === "shadow-key") shadowKeys.add(reward.qty);
    }
  }
  for (const qty of bronzeKeys) assert.ok(qty >= 1 && qty <= 4, `bronze qty ${qty}`);
  for (const qty of shadowKeys) assert.ok(qty >= 1 && qty <= 2, `shadow qty ${qty}`);
  assert.ok(bronzeKeys.size > 1, "qty bronze bervariasi");
});

test("gacha: menu .crate menampilkan isi pool", async () => {
  const { cmd, client, sent } = loadGacha([]);
  await cmd.execute(client, message(), [], {}, "crate");
  const text = sent.at(-1);
  assert.match(text, /CRATE/);
  assert.match(text, /Gold 2\.000–5\.000 \+ 3 item/);
  assert.match(text, /Elixir x2 38%/);
  assert.match(text, /⭐ .*shadow-key x1–2 4%/i);
  assert.match(text, /shadow-key/);
  assert.doesNotMatch(text, /maks 1/i, "keterangan cap tidak tampil");
});

test("gacha: tanpa key diarahkan ke sumber yang benar", async () => {
  const premium = loadGacha([]);
  await premium.cmd.execute(premium.client, message(), ["premium-key"], {}, "open");
  assert.match(premium.sent.at(-1), /\.key/, "premium key -> .key");

  const shadow = loadGacha([]);
  await shadow.cmd.execute(shadow.client, message(), ["shadow-key"], {}, "open");
  assert.match(shadow.sent.at(-1), /premium crate|open premium-key/);

  const bronze = loadGacha([]);
  await bronze.cmd.execute(bronze.client, message(), ["bronze-key"], {}, "open");
  assert.match(bronze.sent.at(-1), /daily|dungeon|Black Market/);

  const wrong = loadGacha([]);
  await wrong.cmd.execute(wrong.client, message(), ["crate-ngawur"], {}, "open");
  assert.match(wrong.sent.at(-1), /\.crate/);
});

test("gacha: buka dengan key mengurangi stok dan memberi hasil", async () => {
  const { cmd, client, user, sent, added } = loadGacha([{ name: "premium-key", emoji: "🗝️", qty: 2 }]);
  await cmd.execute(client, message(), ["premium-key", "1"], {}, "open");
  assert.equal(user.inventory[0].qty, 1, "key berkurang satu");
  assert.equal(added.length, 3, "3 item masuk inventory");
  assert.match(sent.at(-1), /Hasil \(3 item\)/);
});

test("gacha: EV tiap crate di bawah harga key (penjaga ekonomi)", () => {
  const shop = require("../database/rpg/shop.json");
  const price = { "bronze-key": shop["bronze-key"].price, "premium-key": shop["premium-key"].price };
  const sell = (name) => Number(shop[String(name).toLowerCase()]?.sell || 0);
  const keyValue = { "Bronze-key": 1000, "shadow-key": 2000 };

  for (const key of ["bronze-key", "premium-key"]) {
    const crate = gachaData[key];
    const total = crate.items.reduce((sum, it) => sum + it.weight, 0);
    const avgQty = (it) => (Array.isArray(it.qty) ? (it.qty[0] + it.qty[1]) / 2 : it.qty || 1);
    const itemEv = crate.items.reduce((sum, it) => {
      const value = keyValue[it.name] ?? sell(it.name);
      return sum + (it.weight / total) * avgQty(it) * value;
    }, 0);
    const goldEv = (crate.gold.min + crate.gold.max) / 2;
    const ev = goldEv + crate.rolls * itemEv;
    assert.ok(ev < price[key], `${key}: EV ${Math.round(ev)} harus di bawah ${price[key]}`);
  }
});
