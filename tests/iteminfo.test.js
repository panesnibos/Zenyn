// .item — kartu info item: stat, sumber, bahan craft, harga jual.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { resolveItem, infoText, listText, usedIn } = require("../lib/iteminfo");
const { equipmentByRarity } = require("../lib/rpgitems");

const card = (name) => {
  const { item } = resolveItem(name);
  assert.ok(item, `item tidak ketemu: ${name}`);
  return infoText(item);
};

test("item: gear craft menampilkan stat, bahan, dan sumber", () => {
  const text = card("smugglers-blade");
  assert.match(text, /SMUGGLERS BLADE/);
  assert.match(text, /Rare/);
  assert.match(text, /ATK 22/);
  assert.match(text, /\+15% gold/);
  assert.match(text, /Iron Ingot x5/);
  assert.match(text, /Hardwood x3/);
  assert.match(text, /Void Shard x1/);
  assert.match(text, /2\.000 gold/);
  assert.match(text, /Tidak bisa drop/);
  assert.match(text, /Jual: 2\.600 gold/);
});

test("item: bahan khusus BM tampil sumber + dipakai untuk apa", () => {
  const text = card("void shard");
  assert.match(text, /hanya Black Market/i);
  assert.match(text, /Black Market —/);
  assert.match(text, /1\.500 gold/);
  assert.match(text, /stok 1–2\/sesi/);
  assert.match(text, /Dipakai untuk/);
  assert.match(text, /Smugglers Blade/);
  assert.match(text, /Cutthroat Ring/);
  assert.match(text, /Ancient Scroll/);
});

test("item: premium key tampil isi crate, rentang qty, dan tidak bisa dijual", () => {
  const text = card("premium-key");
  assert.match(text, /Black Market/);
  assert.match(text, /7\.000 gold/);
  assert.match(text, /stok 1–2\/sesi/);
  assert.match(text, /Isi crate/);
  assert.match(text, /Gold 2\.000–5\.000 \+ 3 item/);
  assert.match(text, /Elixir x2 38%/);
  assert.match(text, /Bronze-key x1–4 12%/);
  assert.match(text, /⭐ .*shadow-key x1–2 4%/i);
  assert.match(text, /Tidak bisa dijual/);
  assert.doesNotMatch(text, /maks 1/i, "keterangan cap tidak ditampilkan");
});

test("item: scroll baru menampilkan efek", () => {
  const text = card("ancient-scroll");
  assert.match(text, /\+500 EXP/);
  assert.match(text, /Moon Herb x3/);
});

test("item: nama salah ketik tetap ketemu, yang ngawur tidak", () => {
  assert.equal(resolveItem("smugler").item?.key, "smugglers-blade");
  const miss = resolveItem("alpukat");
  assert.equal(miss.item, null);
});

test("item: gear BM tidak ikut drop pool", () => {
  const rare = equipmentByRarity("Rare").map((d) => d.key);
  const epic = equipmentByRarity("Epic").map((d) => d.key);
  assert.ok(!rare.includes("smugglers-blade"));
  assert.ok(!rare.includes("nightshade-armor"));
  assert.ok(!epic.includes("cutthroat-ring"));
  assert.ok(rare.includes("steel-sword"), "gear normal tetap drop");
});

test("item: reverse lookup bahan", () => {
  const names = usedIn({ name: "Void Shard" }).map((r) => r.name);
  assert.deepEqual(names.sort(), ["Ancient Scroll", "Cutthroat Ring", "Smugglers Blade"]);
});

test("item: daftar item dan command gratis", () => {
  const text = listText();
  assert.match(text, /DAFTAR ITEM/);
  assert.match(text, /Void Shard/);
  assert.match(text, /Senjata/);

  const cmd = require("../commands/rpg/item");
  assert.equal(cmd.limit, 0, "fitur bantuan tidak menagih limit");
  assert.ok(cmd.command.includes("item"));
});

test("item: SPOTS hanya didefinisikan di lib/gatherspots.js", () => {
  const gather = fs.readFileSync(path.join(root, "commands/rpg/gather.js"), "utf8");
  assert.ok(!/const SPOTS =/.test(gather), "gather.js tidak boleh punya salinan SPOTS");
  assert.ok(/lib\/gatherspots/.test(gather), "gather.js memakai lib/gatherspots");
});
