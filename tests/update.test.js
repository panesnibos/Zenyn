// `.update`: daftar update bot, teks polos supaya gampang disalin.
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

const sent = [];
const client = { sendMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "s" } }; } };
const message = () => ({ key: { id: "m1", remoteJid: "628100000001@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".update" } });

const load = () =>
  loadMocked("commands/main/update.js", {
    "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {} },
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/featureutil": {
      reply: async (_c, _m, text) => { sent.push(text); return { key: { id: "s" } }; },
      guarded: (_n, fn) => fn
    }
  });

const updates = require("../setting/updates");

test("update: data changelog urut tanggal dan semua item tidak kosong", () => {
  assert.ok(updates.length >= 2);
  const dates = updates.map((u) => u.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "data disimpan terbaru dulu");
  for (const entry of updates) {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.items.length >= 3, entry.date);
    for (const item of entry.items) assert.ok(item.trim().length > 10, item);
  }
});

test("update: teks polos (bisa disalin) tanpa bold/kode, item pakai bullet", () => {
  const cmd = load();
  const text = cmd._internal.buildText("all");
  assert.match(text, /UPDATE BOT/);
  assert.match(text, /• Lelang item antar pemain/);
  assert.ok(text.split("\n").filter((l) => l.startsWith("• ")).length >= 10, "item tetap pakai bullet");
  assert.doesNotMatch(text, /\*[^*\n]+\*/, "tidak boleh ada bold WhatsApp");
  assert.doesNotMatch(text, /```/, "tidak boleh ada code fence");
  assert.ok(text.length <= 3500, "muat satu pesan WA");

  // riwayat lama boleh dipotong di teks, tapi datanya tetap tersimpan
  const all = updates.flatMap((u) => u.items).join("\n");
  assert.match(all, /\.antilink per grup/);
});

test("update: hari ini tampil kalau ada, kalau tidak pakai yang terakhir", async () => {
  const cmd = load();
  const key = cmd._internal.dayKey();
  const text = await cmd._internal.buildText("today");
  const expected = updates.find((u) => u.date === key) ? "UPDATE BOT HARI INI" : "UPDATE BOT TERAKHIR";
  assert.ok(text.includes(expected), text.slice(0, 80));
  assert.match(text, /• /);

  sent.length = 0;
  await cmd.execute(client, message(), [], {}, "update");
  assert.match(sent.at(-1), /UPDATE BOT/);
  assert.equal(await cmd.execute(client, message(), ["help"], {}, "update"), false);
});

test("update: metadata info — kategori main, gratis", () => {
  const cmd = require("../commands/main/update.js");
  assert.equal(cmd.category, "main");
  assert.equal(cmd.limit, 0);
  assert.equal(cmd.visible, true);
  assert.deepEqual(cmd.command, ["update", "changelog", "updates"]);
});
