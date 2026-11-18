// `.hdr`: enhance foto lokal (sharp): 2x, auto-level, sharpen, saturasi.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");
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

const photo = (w = 400, h = 300) =>
  sharp({
    create: { width: w, height: h, channels: 3, background: { r: 60, g: 90, b: 140 } }
  })
    .jpeg()
    .toBuffer();

const sent = [];
const client = { sendMessage: async (_jid, payload) => { sent.push(payload); return { key: { id: "s" } }; } };
const message = () => ({ key: { id: "m1", remoteJid: "628100000001@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".hdr" } });

const load = (buffer) =>
  loadMocked("commands/tools/hdr.js", {
    "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {} },
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/featureutil": {
      reply: async (_c, _m, text) => { sent.push({ text }); return { key: { id: "s" } }; },
      guarded: (_n, fn) => fn
    },
    "../../lib/mediautil": {
      findMedia: () => (buffer ? { kind: "image", node: { fileLength: 1000 } } : null),
      download: async () => buffer
    }
  });

test("hdr: output 2x dimensi, JPEG, dan varian strong/soft berbeda", async () => {
  const src = await photo();
  const cmd = load(src);

  const normal = await cmd._internal.process(src, { mode: "normal" });
  const meta = await sharp(normal).metadata();
  assert.equal(meta.width, 800);
  assert.equal(meta.height, 600);
  assert.equal(meta.format, "jpeg");

  const strong = await cmd._internal.process(src, { mode: "strong" });
  const soft = await cmd._internal.process(src, { mode: "soft" });
  assert.notEqual(Buffer.compare(normal, strong), 0, "strong harus beda dari normal");
  assert.notEqual(Buffer.compare(normal, soft), 0, "soft harus beda dari normal");
  assert.ok(strong.length > 0 && soft.length > 0);
});

test("hdr: batas lebar maksimal 2560 dan mode tak dikenal jatuh ke normal", async () => {
  const src = await photo(1600, 900);
  const cmd = load(src);
  const out = await cmd._internal.process(src, { mode: "ngawur" });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 2560, "2x dari 1600 dibatasi 2560");
  assert.ok(cmd._internal.MAX_OUT <= 5 * 1024 * 1024);
});

test("hdr: tanpa foto -> help gratis (return false)", async () => {
  const cmd = load(null);
  const result = await cmd.execute(client, message(), [], {}, "hdr");
  assert.equal(result, false);
  assert.match(sent.at(-1).text, /HDR \/ HD FOTO/);

  // subcommand ngawur juga help
  assert.equal(await cmd.execute(client, message(), ["xxx"], {}, "hdr"), false);
});

test("hdr: kirim gambar hasil enhance, terima argumen mode", async () => {
  const src = await photo();
  const cmd = load(src);

  await cmd.execute(client, message(), [], {}, "hdr");
  let payload = sent.at(-1);
  assert.ok(Buffer.isBuffer(payload.image));
  assert.match(payload.caption, /HDR/);
  assert.match(payload.caption, /800x600/);

  await cmd.execute(client, message(), ["strong"], {}, "hdr");
  payload = sent.at(-1);
  assert.match(payload.caption, /HDR strong/);
});

test("hdr: metadata tools, limit 1, bukan premium", () => {
  const cmd = require("../commands/tools/hdr.js");
  assert.equal(cmd.category, "tools");
  assert.equal(cmd.limit, 1);
  assert.notEqual(cmd.premium, true);
  assert.deepEqual(cmd.command, ["hdr", "hd", "enhance"]);
});
