// .fakeff — kartu profil FF palsu dari template lokal (tanpa API).
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

const ff = require("../lib/fakeff");
const sharp = require("sharp");

test("fakeff: 10 template lengkap dan semua file ada", () => {
  assert.equal(ff.TEMPLATES.length, 10);
  for (const tpl of ff.TEMPLATES) {
    const file = path.join(root, "assets/fakeff", tpl.file);
    assert.ok(fs.existsSync(file), `aset hilang: ${tpl.file}`);
    assert.ok(tpl.cx > 0 && tpl.cy > 0 && tpl.size > 0 && tpl.cap > 0);
  }
  const names = ff.TEMPLATES.map((t) => t.file);
  assert.equal(new Set(names).size, names.length, "tidak boleh duplikat");
});

test("fakeff: nama dibersihkan dan dibatasi 20 karakter", () => {
  assert.equal(ff.cleanName("  Panes   Kun  "), "Panes Kun");
  assert.equal(ff.cleanName("a".repeat(40)).length, 20);
  assert.equal(ff.cleanName("   "), "");
});

test("fakeff: template konsisten untuk nama yang sama", () => {
  const a = ff.pickTemplate("Panes").file;
  const b = ff.pickTemplate("Panes").file;
  assert.equal(a, b);
  assert.ok(ff.TEMPLATES.some((t) => t.file === a), "template valid: " + a);
});

test("fakeff: render menghasilkan JPEG dengan ukuran template", async () => {
  const out = await ff.renderFakeFF("Panes");
  assert.ok(Buffer.isBuffer(out.buffer) && out.buffer.length > 20000);
  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, out.width);
  assert.equal(meta.height, out.height);
});

test("fakeff: pilih template besar untuk pin, kecil untuk ff", async () => {
  const small = await ff.renderFakeFF("Panes", { template: "ff1.jpg" });
  assert.equal(small.width, 736);
  assert.ok([1307, 1308].includes(small.height), "tinggi " + small.height);
  const big = await ff.renderFakeFF("Panes", { template: "pin1.jpg" });
  assert.equal(big.width, 1080);
  assert.equal(big.height, 1920);
});

const quietTool = {
  guarded: (_name, fn) => fn,
  reply: async (client, message, text) => {
    await client.sendMessage(message.key.remoteJid, { text }, {});
    return { key: { id: "r" } };
  },
  cooldown: () => {}
};

test("fakeff: command tanpa argumen tidak memotong limit", async () => {
  const sent = [];
  const client = { sendMessage: async (_j, p) => { sent.push(p); return {}; } };
  const cmd = loadMocked("commands/tools/fakeff.js", {
    "../../lib/prefix": { getPrefix: () => "!" },
    "../../lib/featureutil": quietTool,
    "../../lib/fakeff": { renderFakeFF: async () => ({ buffer: Buffer.from("x") }), MAX_NAME: 20 }
  });
  const result = await cmd.execute(client, { key: { remoteJid: "c@s.whatsapp.net" }, message: {} }, [], {}, "fakeff");
  assert.equal(result, false);
  assert.match(sent.at(-1).text, /FAKE FF/);
  assert.equal(cmd.limit, 1, "biaya 1 limit");
  assert.equal(cmd.category, "tools");
});

test("fakeff: command dengan nama mengirim gambar", async () => {
  const sent = [];
  const client = { sendMessage: async (_j, p) => { sent.push(p); return { key: { id: "s" } }; } };
  const cmd = loadMocked("commands/tools/fakeff.js", {
    "../../lib/prefix": { getPrefix: () => "!" },
    "../../lib/featureutil": quietTool,
    "../../lib/fakeff": { renderFakeFF: async (n) => ({ buffer: Buffer.from("img:" + n) }), MAX_NAME: 20 }
  });
  await cmd.execute(client, { key: { remoteJid: "c@s.whatsapp.net" }, message: {} }, ["Panes"], {}, "fakeff");
  assert.ok(sent.at(-1).image);
  assert.match(sent.at(-1).caption, /Fake FF — Panes/);
});
