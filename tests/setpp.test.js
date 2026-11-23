// .setpp — ganti/hapus foto profil bot (khusus owner).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const sharp = require("sharp");

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

const quiet = {
  guarded: (_name, fn) => fn,
  reply: async (client, message, text) => {
    await client.sendMessage(message.key.remoteJid, { text }, {});
    return { key: { id: "r" } };
  },
  cooldown: () => {}
};

const makeImage = () => sharp({ create: { width: 120, height: 90, channels: 3, background: "#7c3aed" } }).png().toBuffer();

const load = ({ owner = true, media = null } = {}) => {
  const calls = { update: [], remove: [], sent: [] };
  const client = {
    user: { id: "628000000000:1@s.whatsapp.net" },
    sendMessage: async (_jid, payload) => { calls.sent.push(payload); return { key: { id: "s" } }; },
    updateProfilePicture: async (jid, buffer) => { calls.update.push({ jid, buffer }); },
    removeProfilePicture: async (jid) => { calls.remove.push(jid); }
  };
  const cmd = loadMocked("commands/owner/setpp.js", {
    "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, debug() {} },
    "../../lib/owner": { isOwner: () => owner },
    "../../lib/prefix": { getPrefix: () => "!" },
    "../../lib/featureutil": quiet,
    "../../lib/mediautil": {
      findMedia: () => (media ? { kind: "image", node: {} } : null),
      download: async () => media
    }
  });
  return { cmd, client, calls };
};

const msg = () => ({ key: { remoteJid: "c@s.whatsapp.net" }, message: {} });

test("setpp: non-owner ditolak tanpa mengubah apa pun", async () => {
  const { cmd, client, calls } = load({ owner: false, media: Buffer.from("x") });
  const res = await cmd.execute(client, msg(), [], {}, "setpp");
  assert.equal(res, false);
  assert.equal(calls.update.length, 0);
  assert.match(calls.sent.at(-1).text, /khusus owner/);
});

test("setpp: owner tanpa foto hanya dapat format", async () => {
  const { cmd, client, calls } = load({ owner: true, media: null });
  const res = await cmd.execute(client, msg(), [], {}, "setpp");
  assert.equal(res, false);
  assert.equal(calls.update.length, 0);
  assert.match(calls.sent.at(-1).text, /SET FOTO PROFIL BOT/);
});

test("setpp: owner kirim foto -> PP diganti 640x640 JPEG", async () => {
  const image = await makeImage();
  const { cmd, client, calls } = load({ owner: true, media: image });
  const res = await cmd.execute(client, msg(), [], {}, "setpp");
  assert.equal(res, true);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].jid, "628000000000:1@s.whatsapp.net");
  const meta = await sharp(calls.update[0].buffer).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 640);
  assert.equal(meta.height, 640);
  assert.match(calls.sent.at(-1).text, /Foto profil bot diperbarui/);
});

test("setpp: .setpp hapus menghapus foto profil", async () => {
  const { cmd, client, calls } = load({ owner: true });
  const res = await cmd.execute(client, msg(), ["hapus"], {}, "setpp");
  assert.equal(res, true);
  assert.deepEqual(calls.remove, ["628000000000:1@s.whatsapp.net"]);
  assert.equal(calls.update.length, 0);
  assert.match(calls.sent.at(-1).text, /dihapus/);
});

test("setpp: buffer bukan gambar -> error, PP tidak berubah", async () => {
  const { cmd, client, calls } = load({ owner: true, media: Buffer.from("bukan-gambar") });
  await assert.rejects(() => cmd.execute(client, msg(), [], {}, "setpp"));
  assert.equal(calls.update.length, 0);
});

test("setpp: metadata command benar", () => {
  const { cmd } = load();
  assert.equal(cmd.category, "owner");
  assert.equal(cmd.visible, false);
  assert.deepEqual(cmd.command, ["setpp"]);
});
