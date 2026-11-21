// .test2 — fake FF lobby card via paket x-fake-ff.
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

const fakeGenerate = (calls) => async ({ username, lobby, outputDir }) => {
  calls.push({ username, lobby });
  const folder = path.join(outputDir, "fake-ff");
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${username}.jpg`);
  fs.writeFileSync(file, Buffer.from("gambar-jpg"));
  return { status: "success", code: 200, username, lobby: lobby || 7, result: file };
};

const loadCmd = (calls) =>
  loadMocked("commands/tools/test2.js", {
    "x-fake-ff": fakeGenerate(calls),
    "../../lib/prefix": { getPrefix: () => "!" },
    "../../lib/featureutil": quiet
  });

const msg = () => ({ key: { remoteJid: "c@s.whatsapp.net" }, message: {} });

test("test2: nama dibersihkan dan dibatasi 20 karakter", () => {
  const cmd = loadCmd([]);
  assert.equal(cmd._internal.clean("  Panes / Kun * "), "Panes Kun");
  assert.equal(cmd._internal.clean("a".repeat(40)).length, 20);
  assert.equal(cmd._internal.clean("///"), "");
});

test("test2: tanpa nama hanya kirim format, limit tidak terpotong", async () => {
  const sent = [];
  const client = { sendMessage: async (_j, p) => { sent.push(p); return {}; } };
  const cmd = loadCmd([]);
  const res = await cmd.execute(client, msg(), [], {}, "test2");
  assert.equal(res, false);
  assert.match(sent.at(-1).text, /FAKE FF LOBBY/);
  assert.equal(cmd.limit, 1);
  assert.equal(cmd.category, "tools");
  assert.equal(cmd.visible, true);
});

test("test2: nama saja -> lobby acak (null)", async () => {
  const calls = [];
  const sent = [];
  const client = { sendMessage: async (_j, p) => { sent.push(p); return { key: { id: "s" } }; } };
  const cmd = loadCmd(calls);
  const before = fs.readdirSync(require("os").tmpdir()).filter((f) => f === "zenyn-ff").length;
  await cmd.execute(client, msg(), ["Panes"], {}, "test2");
  assert.deepEqual(calls[0], { username: "Panes", lobby: null });
  assert.ok(sent.at(-1).image, "harus kirim gambar");
  assert.match(sent.at(-1).caption, /Fake FF Lobby — Panes/);
  assert.match(sent.at(-1).caption, /Lobby 7/);
});

test("test2: nama + lobby dipisah dengan benar", async () => {
  const calls = [];
  const client = { sendMessage: async () => ({ key: { id: "s" } }) };
  const cmd = loadCmd(calls);
  await cmd.execute(client, msg(), ["Panes", "Kun", "12"], {}, "test2");
  assert.deepEqual(calls[0], { username: "Panes Kun", lobby: 12 });
});

test("test2: folder sementara dibersihkan setelah kirim", async () => {
  const calls = [];
  const os = require("os");
  const client = { sendMessage: async () => ({ key: { id: "s" } }) };
  const cmd = loadCmd(calls);
  const base = path.join(os.tmpdir(), "zenyn-ff");
  const before = fs.existsSync(base) ? fs.readdirSync(base).length : 0;
  await cmd.execute(client, msg(), ["Panes"], {}, "test2");
  const after = fs.existsSync(base) ? fs.readdirSync(base).length : 0;
  assert.equal(after, before, "tidak ada folder sisa");
});
