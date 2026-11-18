// `.bcgc` dengan gambar: preview menyebut media, `go` mengirim gambar+caption,
// video ditolak, dan `--yes` langsung kirim tanpa preview.
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

const quiet = { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, msg() {}, debug() {} };
const GROUP_A = "120363000000001@g.us";
const GROUP_B = "120363000000002@g.us";

const makeClient = () => {
  const sent = [];
  return {
    sent,
    async sendMessage(jid, payload, options) { sent.push({ jid, payload, options }); return { key: { id: "s" } }; },
    async groupFetchAllParticipating() {
      return { [GROUP_A]: { subject: "Grup A" }, [GROUP_B]: { subject: "Grup B" } };
    }
  };
};

const message = (text = ".bcgc") => ({
  key: { id: "m1", remoteJid: "62895327668200@s.whatsapp.net" },
  pushName: "Owner",
  message: { conversation: text }
});

const jpeg = () => sharp({ create: { width: 200, height: 200, channels: 3, background: "#3366aa" } }).jpeg().toBuffer();

const load = ({ found, buffer } = {}) =>
  loadMocked("commands/owner/bcgc.js", {
    "../../lib/logger": quiet,
    "../../lib/owner": { isOwner: () => true },
    "../../lib/rpgutil": { getUserId: () => "owner1" },
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/stamp": { stamp: () => "01/01 00:00" },
    "../../config": { groupLink: "https://chat.whatsapp.com/X", broadcast: { delayMs: 0, confirmTtlMs: 300000 } },
    "../../lib/mediautil": {
      findMedia: () => found || null,
      download: async () => buffer || (await jpeg())
    }
  });

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));

test("bcgc media: preview menyebut gambar lalu go mengirim gambar + caption", async () => {
  const cmd = load({ found: { kind: "image", node: { fileLength: 1000 } } });
  const client = makeClient();

  await cmd.execute(client, message(), ["hai", "semua"], {}, "bcgc");
  const previewText = client.sent.at(-1).payload.text;
  assert.match(previewText, /Media\s+: 🖼 gambar/);
  assert.match(previewText, /Target\s+: 2 grup/);

  await cmd.execute(client, message(), ["go"], {}, "bcgc");
  await wait();

  const broadcasts = client.sent.filter((s) => s.payload.image);
  assert.equal(broadcasts.length, 2, "dua grup menerima gambar");
  assert.ok(broadcasts.every((b) => b.payload.caption.startsWith("hai semua")));
  assert.ok(broadcasts.every((b) => b.payload.caption.includes("https://chat.whatsapp.com/X")));
  assert.deepEqual(broadcasts.map((b) => b.jid).sort(), [GROUP_A, GROUP_B].sort());
});

test("bcgc media: video/dokumen ditolak", async () => {
  const cmd = load({ found: { kind: "video", node: { fileLength: 1000 } } });
  const client = makeClient();
  await cmd.execute(client, message(), ["hai"], {}, "bcgc");
  assert.match(client.sent.at(-1).payload.text, /Hanya gambar/);
});

test("bcgc media: tanpa teks dan tanpa gambar -> tolak", async () => {
  const cmd = load({ found: null });
  const client = makeClient();
  await cmd.execute(client, message(), ["--yes"], {}, "bcgc");
  assert.match(client.sent.at(-1).payload.text, /Teks promosi kosong/);
});

test("bcgc media: --yes langsung kirim gambar tanpa preview", async () => {
  const cmd = load({ found: { kind: "image", node: { fileLength: 1000 } } });
  const client = makeClient();
  await cmd.execute(client, message(), ["--yes", "promo"], {}, "bcgc");
  await wait();

  const broadcasts = client.sent.filter((s) => s.payload.image);
  assert.equal(broadcasts.length, 2);
  assert.ok(broadcasts.every((b) => b.payload.caption.startsWith("promo")));
  assert.ok(!client.sent.some((s) => /PREVIEW/.test(s.payload.text || "")), "tidak boleh ada preview");
});
