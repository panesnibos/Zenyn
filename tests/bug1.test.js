// .bug1 — kirim virtex (bug crash) ke nomor target (khusus owner).
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

const quiet = {
  guarded: (_name, fn) => fn,
  reply: async (client, message, text) => {
    await client.sendMessage(message.key.remoteJid, { text }, {});
    return { key: { id: "r" } };
  },
  cooldown: () => {}
};

const load = ({ owner = true } = {}) => {
  const calls = { sent: [] };
  const client = {
    user: { id: "628000000000:1@s.whatsapp.net" },
    sendMessage: async (jid, payload) => { calls.sent.push({ jid, payload }); return { key: { id: "s" } }; }
  };
  const cmd = loadMocked("commands/owner/bug1.js", {
    "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, debug() {} },
    "../../lib/owner": {
      isOwner: () => owner,
      normalize: (v) => String(v || "").split("@")[0].replace(/\D/g, "").trim()
    },
    "../../lib/prefix": { getPrefix: () => "!" },
    "../../lib/featureutil": quiet
  });
  return { cmd, client, calls };
};

const msg = () => ({ key: { remoteJid: "c@s.whatsapp.net" }, message: {} });
const TARGET = "628123456789@s.whatsapp.net";

test("bug1: non-owner ditolak tanpa kirim ke target", async () => {
  const { cmd, client, calls } = load({ owner: false });
  await cmd.execute(client, msg(), ["628123456789"], {}, "bug1");
  assert.equal(calls.sent.length, 1);
  assert.match(calls.sent[0].payload.text, /khusus owner/);
  assert.equal(calls.sent.some((s) => s.jid === TARGET), false);
});

test("bug1: format salah tanpa nomor -> pesan format, tidak kirim", async () => {
  const { cmd, client, calls } = load({ owner: true });
  await cmd.execute(client, msg(), [], {}, "bug1");
  assert.equal(calls.sent.length, 1);
  assert.match(calls.sent[0].payload.text, /VIRTEX/);
  assert.equal(calls.sent.some((s) => s.jid === TARGET), false);
});

test("bug1: owner valid -> kirim 1 pesan virtex panjang ke target", async () => {
  const { cmd, client, calls } = load({ owner: true });
  await cmd.execute(client, msg(), ["628123456789"], {}, "bug1");
  const hit = calls.sent.find((s) => s.jid === TARGET);
  assert.ok(hit, "harus ada pesan ke target");
  assert.ok(hit.payload.text.length >= 10000, "payload harus panjang");
  assert.match(hit.payload.text, /\u200e/);
  assert.match(hit.payload.text, /\u200f/);
  // konfirmasi dikirim ke sender
  assert.match(calls.sent.at(-1).payload.text, /terkirim ke/);
});