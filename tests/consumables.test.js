// P10/P11: gear paket A terdaftar, consumable baru bisa dipakai lewat .use.
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

const items = require("../database/rpg/items.json");
const shop = require("../database/rpg/shop.json");
const recipes = require("../database/rpg/recipes.json");
const { findItemDef, equipmentByRarity } = require("../lib/rpgitems");

test("gear paket A: terdaftar, punya stat, dan masuk pool rarity yang benar", () => {
  const expect = {
    "silver-dagger": ["weapon", "Common", "atk"],
    "hunter-bow": ["weapon", "Uncommon", "atk"],
    "obsidian-armor": ["armor", "Rare", "def"],
    "vanguard-plate": ["armor", "Rare", "def"],
    "phantom-cloak": ["armor", "Epic", "def"],
    "sage-amulet": ["accessory", "Uncommon", "hp"],
    "merchant-ring": ["accessory", "Rare", "atk"],
    "colossus-blade": ["weapon", "Legendary", "atk"]
  };
  for (const [key, [slot, rarity, stat]] of Object.entries(expect)) {
    const def = items[key];
    assert.ok(def, key);
    assert.equal(def.slot, slot, key);
    assert.equal(def.rarity, rarity, key);
    assert.ok(def[stat] > 0, `${key} harus punya ${stat}`);
    assert.ok(equipmentByRarity(rarity).some((d) => d.key === key), `${key} harus muncul di drop pool ${rarity}`);
  }
  assert.equal(shop["colossus-blade"].buyable, false, "Legendary baru lewat resep");
  assert.ok(recipes["colossus-blade"], "resep colossus-blade ada");
});

test("resep bahan: Iron/Steel Ingot memakai bahan yang ada", () => {
  for (const key of ["iron-ingot", "steel-ingot"]) {
    const r = recipes[key];
    assert.ok(r, key);
    assert.ok(findItemDef(r.name), `hasil ${key} harus ada`);
    for (const mat of Object.keys(r.materials)) assert.ok(findItemDef(mat), `bahan ${mat} tidak ada`);
  }
});

test("consumable paket B: ada di shop dan dikenali findItemDef", () => {
  for (const [key, name] of [
    ["exp-scroll", "EXP Scroll"],
    ["pet-food", "Pet Food"],
    ["bait", "Bait"],
    ["anti-death-charm", "Anti-Death Charm"],
    ["strength-tonic", "Strength Tonic"]
  ]) {
    assert.ok(shop[key], key);
    assert.equal(shop[key].buyable, true, key);
    assert.ok(shop[key].price > 0, key);
    assert.equal(findItemDef(name).key, key);
  }
});

// ---------- .use ----------
const sent = [];
const client = { sendMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "s" } }; } };
const message = () => ({ key: { id: "m1", remoteJid: "628100000001@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".use" } });

const loadUse = (user, inventory) => {
  const calls = { exp: 0, removed: 0 };
  const db = {
    getUser: () => user,
    updateUser: (_id, fn) => fn(user),
    hasItem: (_id, name, qty = 1) => {
      const it = (user.inventory || []).find((i) => i.name.toLowerCase() === String(name).toLowerCase());
      return !!it && it.qty >= qty;
    },
    removeItem: () => { calls.removed++; },
    addExp: (_id, n) => { calls.exp += n; return { levelUp: false, rewards: [] }; },
    addQuestProgress() {},
    checkAchievements: () => []
  };
  user.inventory = inventory;
  const cmd = loadMocked("commands/rpg/use.js", {
    "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {} },
    "../../lib/rpgdb": { db },
    "../../lib/rpgutil": { getUserId: () => "u1" },
    "../../lib/prefix": { getPrefix: () => "." }
  });
  return { cmd, calls, user };
};

test("use: EXP Scroll menambah exp sesuai jumlah", async () => {
  const { cmd, calls } = loadUse({ id: "u1", money: 0, inventory: [] }, [{ name: "EXP Scroll", emoji: "📜", qty: 3 }]);
  await cmd.execute(client, message(), ["exp", "scroll", "2"], {}, "use");
  assert.equal(calls.exp, 300, "2 scroll = 300 EXP");
  assert.equal(calls.removed, 1);
  assert.match(sent.at(-1), /\+300 EXP/);
});

test("use: Pet Food menaikkan level pet, Strength Tonic & Charm & Bait menyetel field", async () => {
  const petUser = {
    id: "u1",
    inventory: [{ name: "Pet Food", emoji: "🍖", qty: 5 }],
    pet: { name: "Wolf", emoji: "🐺", level: 1, exp: 60, expNeeded: 70 }
  };
  const { cmd: petCmd, user } = loadUse(petUser, petUser.inventory);
  await petCmd.execute(client, message(), ["pet", "food"], {}, "use");
  assert.equal(user.pet.level, 2, "60+50 = 110 >= 70 -> naik level");

  const tonic = loadUse({ id: "u1", inventory: [] }, [{ name: "Strength Tonic", emoji: "🧪", qty: 1 }]);
  await tonic.cmd.execute(client, message(), ["strength", "tonic"], {}, "use");
  assert.ok(tonic.user.tonic > 0);

  const charm = loadUse({ id: "u1", inventory: [] }, [{ name: "Anti-Death Charm", emoji: "🧿", qty: 2 }]);
  await charm.cmd.execute(client, message(), ["anti", "death", "charm", "2"], {}, "use");
  assert.equal(charm.user.charm, 2);

  const bait = loadUse({ id: "u1", inventory: [] }, [{ name: "Bait", emoji: "🪱", qty: 3 }]);
  await bait.cmd.execute(client, message(), ["bait", "2"], {}, "use");
  assert.equal(bait.user.bait, 2);
});

test("use: tanpa item / item tak bisa dipakai / stok kurang", async () => {
  const { cmd } = loadUse({ id: "u1", inventory: [] }, [{ name: "EXP Scroll", emoji: "📜", qty: 1 }]);

  await cmd.execute(client, message(), [], {}, "use");
  assert.match(sent.at(-1), /PAKAI ITEM/);

  await assert.rejects(() => cmd.execute(client, message(), ["potion"], {}, "use"), /tidak bisa dipakai|Pakai/);
  await assert.rejects(() => cmd.execute(client, message(), ["exp", "scroll", "5"], {}, "use"), /tidak punya/);
  await assert.rejects(() => cmd.execute(client, message(), ["barang", "ajaib"], {}, "use"), /tidak dikenal/);
});

test("battle & gather sudah memakai tonic/charm/bait", () => {
  const battle = fs.readFileSync(path.join(root, "commands/rpg/battle.js"), "utf8");
  assert.match(battle, /tonicActive/);
  assert.match(battle, /u\.tonic = 0/);
  assert.match(battle, /Anti-Death Charm terpakai/);
  const gather = fs.readFileSync(path.join(root, "commands/rpg/gather.js"), "utf8");
  assert.match(gather, /Bait terpakai/);
});
