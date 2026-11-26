// Fitur media: findMedia murni, guard soundsticker & tss.
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

const fe = (sent) => ({
  guarded: (_n, fn) => fn,
  reply: async (_c, m, text) => { sent.push({ text }); return false; }
});

const mediaOf = (media) => ({
  downloadMedia: async () => media
});

// ---------- lib/media: findMedia (murni) ----------

test("findMedia: ambil video dari reply (quoted)", () => {
  const { findMedia } = require("../lib/media");
  const msg = {
    key: { remoteJid: "g@g.us", id: "1" },
    message: {
      extendedTextMessage: {
        text: ".soundsticker",
        contextInfo: { stanzaId: "vid1", participant: "u@g.us", quotedMessage: { videoMessage: { seconds: 3 } } }
      }
    }
  };
  const r = findMedia(msg);
  assert.equal(r.type, "video");
  assert.equal(r.node.seconds, 3);
  assert.equal(r.target.key.id, "vid1");
});

test("findMedia: ambil video dari lampiran langsung", () => {
  const { findMedia } = require("../lib/media");
  const msg = { key: { remoteJid: "g@g.us" }, message: { videoMessage: { seconds: 2 } } };
  const r = findMedia(msg);
  assert.equal(r.type, "video");
  assert.equal(r.target, msg);
});

test("findMedia: null kalau tidak ada media", () => {
  const { findMedia } = require("../lib/media");
  assert.equal(findMedia({ key: {}, message: { conversation: "halo" } }), null);
});

// ---------- soundsticker ----------

test("soundsticker: tanpa media -> format", async () => {
  const sent = [];
  const cmd = loadMocked("commands/tools/soundsticker.js", {
    "../../lib/featureutil": fe(sent),
    "../../lib/media": mediaOf(null)
  });
  const res = await cmd.execute({}, { key: { remoteJid: "g@g.us" }, message: {} }, []);
  assert.equal(res, false);
  assert.match(sent[0].text, /Reply video/);
});

test("soundsticker: durasi kebesaran -> ditolak", async () => {
  const sent = [];
  const cmd = loadMocked("commands/tools/soundsticker.js", {
    "../../lib/featureutil": fe(sent),
    "../../lib/media": mediaOf({ buffer: Buffer.from("x"), type: "video", seconds: 20 })
  });
  const res = await cmd.execute({}, { key: { remoteJid: "g@g.us" }, message: {} }, []);
  assert.equal(res, false);
  assert.match(sent[0].text, /5 detik/);
});

test("soundsticker: video valid -> kirim sticker + voice note", async () => {
  const sent = [];
  const sentMsgs = [];
  const client = {
    sendMessage: async (_j, payload) => { sentMsgs.push(payload); return { key: { id: "s" } }; }
  };
  const cmd = loadMocked("commands/tools/soundsticker.js", {
    "../../lib/featureutil": fe(sent),
    "../../lib/media": mediaOf({ buffer: Buffer.from("v"), type: "video", seconds: 3 }),
    "../../lib/sticker": { videoToWebp: async (b) => Buffer.from(b), safeWithExif: async (b) => b },
    "../../lib/voice": { audioToVoice: async () => Buffer.from("ogg") }
  });
  const res = await cmd.execute(client, { key: { remoteJid: "g@g.us" }, message: {} }, []);
  assert.equal(res, true);
  assert.equal(sentMsgs[0].sticker !== undefined, true, "kirim sticker");
  assert.equal(sentMsgs[1].ptt, true, "kirim voice note");
});

test("soundsticker: video tanpa suara -> sticker tetap terkirim", async () => {
  const sent = [];
  const sentMsgs = [];
  const client = {
    sendMessage: async (_j, payload) => { sentMsgs.push(payload); return { key: { id: "s" } }; }
  };
  const cmd = loadMocked("commands/tools/soundsticker.js", {
    "../../lib/featureutil": fe(sent),
    "../../lib/media": mediaOf({ buffer: Buffer.from("v"), type: "video", seconds: 3 }),
    "../../lib/sticker": { videoToWebp: async (b) => Buffer.from(b), safeWithExif: async (b) => b },
    "../../lib/voice": { audioToVoice: async () => { throw new Error("no audio"); } }
  });
  const res = await cmd.execute(client, { key: { remoteJid: "g@g.us" }, message: {} }, []);
  assert.equal(sentMsgs[0].sticker !== undefined, true);
  assert.match(sent.at(-1).text, /tidak punya suara/);
  assert.equal(res, false);
});

// ---------- tss ----------

test("tss: tanpa teks -> format", async () => {
  const sent = [];
  const cmd = loadMocked("commands/tools/tss.js", {
    "../../lib/featureutil": fe(sent),
    "../../lib/media": mediaOf(null)
  });
  const res = await cmd.execute({}, { key: { remoteJid: "g@g.us" }, message: {} }, []);
  assert.equal(res, false);
  assert.match(sent[0].text, /Format/);
});

test("tss: teks ada tapi tanpa video -> error", async () => {
  const sent = [];
  const cmd = loadMocked("commands/tools/tss.js", {
    "../../lib/featureutil": fe(sent),
    "../../lib/media": mediaOf(null)
  });
  const res = await cmd.execute({}, { key: { remoteJid: "g@g.us" }, message: {} }, ["hai", "nopal"]);
  assert.equal(res, false);
  assert.match(sent[0].text, /Reply video/);
});

test("tss: video + teks -> kirim video dengan TTS", async () => {
  const sent = [];
  const sentMsgs = [];
  const client = {
    sendMessage: async (_j, payload) => { sentMsgs.push(payload); return { key: { id: "s" } }; }
  };
  const cmd = loadMocked("commands/tools/tss.js", {
    "../../lib/featureutil": fe(sent),
    "../../lib/media": mediaOf({ buffer: Buffer.from("v"), type: "video", seconds: 5 }),
    "../../lib/voice": { muxVideoAudio: async (_v, a) => Buffer.from("mux-" + a.length) },
    "./tts": { _internal: { speak: async () => Buffer.from("mp3"), MAX_CHARS: 300 } }
  });
  const res = await cmd.execute(client, { key: { remoteJid: "g@g.us" }, message: {} }, ["hai", "nopal"]);
  assert.equal(res !== undefined, true);
  assert.equal(sentMsgs[0].video !== undefined, true);
  assert.match(sentMsgs[0].caption, /hai nopal/);
});