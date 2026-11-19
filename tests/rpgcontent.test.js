// Konten RPG: gear/bahan baru konsisten (resep bisa di-craft, stat lengkap),
// Mythic tidak dijual di shop, dan tambang dalam punya gate level + hasil.
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

const read = (file) => JSON.parse(fs.readFileSync(path.join(root, "database/rpg", file), "utf8"));
const quiet = { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, msg() {}, debug() {} };
const { findItemDef } = require("../lib/rpgitems");

const items = read("items.json");
const shop = read("shop.json");
const recipes = read("recipes.json");
const heal = read("heal.json");

test("rpg content: setiap equipment punya slot, rarity, emoji, dan minimal satu stat", () => {
  const equipment = Object.entries(items).filter(([, d]) => d.type === "equipment");
  assert.ok(equipment.length >= 23, "jumlah equipment: " + equipment.length);
  for (const [key, d] of equipment) {
    assert.ok(d.name && d.emoji, `nama/emoji kosong: ${key}`);
    assert.ok(["weapon", "armor", "accessory"].includes(d.slot), `slot salah: ${key}=${d.slot}`);
    assert.ok(["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"].includes(d.rarity), `rarity salah: ${key}=${d.rarity}`);
    assert.ok((d.atk || 0) + (d.def || 0) + (d.hp || 0) > 0, `tanpa stat: ${key}`);
  }
});

test("rpg content: setiap resep memakai bahan & hasil yang benar-benar ada", () => {
  for (const [key, r] of Object.entries(recipes)) {
    const result = findItemDef(r.name);
    assert.ok(result, `hasil resep tak dikenal: ${key} -> ${r.name}`);
    // hasil boleh gear atau konsumabel yang ada di shop
    assert.ok(result.type === "equipment" || shop[result.key], `hasil resep tak bisa dipakai: ${key}`);
    assert.ok(Number(r.cost) > 0, `biaya resep kosong: ${key}`);
    const mats = Object.entries(r.materials || {});
    assert.ok(mats.length > 0, `resep tanpa bahan: ${key}`);
    for (const [name, qty] of mats) {
      assert.ok(findItemDef(name), `bahan tak dikenal di ${key}: ${name}`);
      assert.ok(Number(qty) > 0, `qty bahan ngawur di ${key}: ${name}`);
    }
  }
});

test("rpg content: gear Mythic ada, tidak dijual di shop, hanya lewat resep", () => {
  const mythic = Object.entries(items).filter(([, d]) => d.rarity === "Mythic");
  assert.ok(mythic.length >= 3, "gear mythic: " + mythic.length);
  for (const [key] of mythic) {
    assert.equal(shop[key], undefined, `Mythic tidak boleh di shop: ${key}`);
    assert.ok(recipes[key], `Mythic harus punya resep: ${key}`);
  }
});

test("rpg content: potion lebih kuat ada di shop dan heal", () => {
  assert.ok(shop["greater-potion"], "greater-potion tidak ada di shop");
  assert.ok(shop["greater-potion"].buyable, "greater-potion harus bisa dibeli");
  assert.ok(heal["greaterpotion"], "greater-potion tidak ada di heal.json");
  assert.ok(heal["greaterpotion"].effect > heal.potion.effect, "effect greater-potion harus di atas potion biasa");
  const healCmd = require("../commands/rpg/heal");
  assert.ok(healCmd.command.includes("greaterpotion"), "alias greaterpotion belum terdaftar");
});

test("rpg content: bahan baru tercatat di items dan dipakai resep/sumber drop", () => {
  for (const key of ["mithril-ore", "crystal", "dragon-scale", "rare-fish", "hardwood", "moon-herb"]) {
    assert.equal(items[key]?.type, "material", `bahan hilang: ${key}`);
  }
  const source = ["commands/rpg/gather.js", "lib/gatherspots.js", "commands/rpg/battle.js", "commands/rpg/dungeon.js"]
    .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
    .join("\n");
  for (const key of ["mithril-ore", "crystal", "diamond", "rare-fish", "hardwood", "moon-herb"]) {
    assert.ok(source.includes(key), `tidak ada sumber drop untuk ${key}`);
  }
});

const loadGather = (user) => {
  const added = [];
  const sent = [];
  const db = {
    getUser: () => user,
    updateUser: (_id, fn) => fn(user),
    addItem: (_id, item) => added.push(item),
    addStat() {},
    addQuestProgress() {},
    checkAchievements: () => [],
    setHp: (_id, hp) => { user.hp = hp; }
  };
  const cmd = loadMocked("commands/rpg/gather.js", {
    "../../lib/logger": quiet,
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "628100000001" },
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/rpgcombat": { randInt: (_a, b) => b },
    "../../lib/rpglimit": { cd: () => 25000 }
  });
  const client = { sendMessage: async (_jid, payload) => { sent.push(payload.text); } };
  return { cmd, added, sent, client };
};

const player = (level) => ({ level, hp: 100, maxHp: 100, lastGather: 0, inventory: [] });
const msg = { key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji" };

test("gather: tambang dalam butuh level 10", async () => {
  const { cmd, client, sent, added } = loadGather(player(5));
  await cmd.execute(client, msg, ["deep"], {}, "mine");
  assert.match(sent.at(-1), /butuh level 10/);
  assert.equal(added.length, 0);
});

test("gather: tambang dalam memberi ore 2-5 (lebih banyak dari tambang biasa)", async () => {
  const deep = loadGather(player(20));
  await deep.cmd.execute(deep.client, msg, ["deep"], {}, "mine");
  assert.equal(deep.added[0].name, "Ore");
  assert.equal(deep.added[0].qty, 5, "randInt dipatok ke batas atas");

  const normal = loadGather(player(20));
  await normal.cmd.execute(normal.client, msg, ["mine"], {}, "gather");
  assert.equal(normal.added[0].qty, 3);
});
