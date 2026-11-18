// Batch media: .img (sharp) dan .tts (Google TTS -> ffmpeg voice note).
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

const sent = [];
const client = { sendMessage: async (_jid, payload) => { sent.push(payload); return { key: { id: "s" } }; } };
const message = () => ({ key: { id: "m1", remoteJid: "628100000001@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".img" } });
const deps = (extra = {}) => ({
  "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {} },
  "../../lib/prefix": { getPrefix: () => "." },
  "../../lib/featureutil": {
    reply: async (_c, _m, text) => { sent.push({ text }); return { key: { id: "s" } }; },
    guarded: (_n, fn) => fn
  },
  ...extra
});

const photo = () => sharp({ create: { width: 400, height: 300, channels: 3, background: "#4488cc" } }).jpeg().toBuffer();

const loadImg = (buffer) =>
  loadMocked("commands/tools/img.js", deps({
    "../../lib/mediautil": { findMedia: () => ({ kind: "image", node: { fileLength: 100 } }), download: async () => buffer }
  }));

test("img: resize mengubah lebar, crop 1:1 jadi persegi, compress jalan", async () => {
  const buffer = await photo();
  const cmd = loadImg(buffer);

  await cmd.execute(client, message(), ["resize", "200"], {}, "img");
  let meta = await sharp(sent.at(-1).image).metadata();
  assert.equal(meta.width, 200);
  assert.equal(meta.height, 150);

  await cmd.execute(client, message(), ["crop", "1:1"], {}, "img");
  meta = await sharp(sent.at(-1).image).metadata();
  assert.equal(meta.width, 300);
  assert.equal(meta.height, 300);

  await cmd.execute(client, message(), ["compress", "50"], {}, "img");
  meta = await sharp(sent.at(-1).image).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 400);
});

test("img: tanpa gambar / tanpa subcommand -> help tanpa limit", async () => {
  const cmd = loadMocked("commands/tools/img.js", deps({
    "../../lib/mediautil": { findMedia: () => null, download: async () => Buffer.from("") }
  }));
  assert.equal(await cmd.execute(client, message(), [], {}, "img"), false);
  assert.equal(await cmd.execute(client, message(), ["resize", "100"], {}, "img"), false);
  assert.match(sent.at(-1).text, /EDIT GAMBAR/);
  await assert.rejects(() => cmd._internal.transform(Buffer.from("x"), "resize", "9999"), /16-4096/);
  assert.deepEqual(cmd._internal.parseRatio("16:9"), { w: 16, h: 9 });
  assert.equal(cmd._internal.parseRatio("x"), null);
});

test("tts: voice note opus dikirim, teks panjang ditolak", async () => {
  let asked = null;
  const cmd = loadMocked("commands/tools/tts.js", deps({
    "../../lib/voice": { audioToVoice: async (buf) => { asked = buf; return Buffer.from("OggSvoice"); } }
  }));
  // fetch di-mock lewat modul: speak menerima fetchImpl
  const mp3 = Buffer.alloc(2000, 1);
  const buffer = await cmd._internal.speak("halo dunia", {
    fetchImpl: async (url) => {
      assert.match(url, /tl=id/);
      assert.match(url, /q=halo%20dunia/);
      return { ok: true, status: 200, buffer: async () => mp3 };
    }
  });
  assert.equal(buffer.length, 2000);

  // jalur command memakai speak versi modul (real fetch) -> cukup uji validasi
  await cmd.execute(client, message(), [], {}, "tts");
  assert.equal(await cmd.execute(client, message(), [], {}, "tts"), false);
  assert.match(sent.at(-1).text, /Format/);
  await assert.rejects(() => cmd.execute(client, message(), ["x".repeat(301)], {}, "tts"), /300/);
  assert.equal(asked, null, "audioToVoice tidak dipanggil untuk validasi");
});
