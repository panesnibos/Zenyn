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
  const compiled = vm.runInThisContext(`(function(require,module,exports,__dirname,__filename){\n${fs.readFileSync(file, "utf8")}\n})`, { filename: file });
  compiled((name) => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name), mod, mod.exports, path.dirname(file), file);
  return mod.exports;
};

const user = { id: "628100000001", name: "Pemain Uji", dinoTop: 0 };
const dbMock = {
  getUser: () => user,
  saveUser: () => true,
  updateUser: (id) => (id === user.id ? user : null)
};
const message = (uid = user.id, chat = "120363000000@g.us") => ({
  key: { id: "mock", remoteJid: chat, participant: `${uid}@s.whatsapp.net` },
  canonicalUserId: uid, pushName: "Pemain Uji",
  message: { conversation: ".dino" }
});
const client = (sent = []) => ({
  sendMessage: async (jid, payload) => void sent.push(payload),
  sendInteractiveMessage: async (jid, payload) => void sent.push(payload),
  relayMessage: async (jid, payload) => void sent.push(payload)
});

const dino = () => loadMocked("commands/game/dino.js", { "../../lib/rpgdb": { db: dbMock } });

test("catur pindah ke kategori game", () => {
  assert.equal(fs.existsSync(path.join(root, "commands/fun/catur.js")), false);
  const catur = require("../commands/game/catur");
  assert.equal(catur.category, "game");
  assert.equal(catur.visible, true);
  assert.ok(catur.command.includes("catur"));
  assert.equal(typeof catur.execute, "function");
});

test("dino: metadata game + kartu canvas sudah dibuang", () => {
  const cmd = dino();
  assert.equal(cmd.category, "game");
  assert.equal(cmd.visible, true);
  assert.deepEqual(cmd.command, ["dino"]);
  assert.equal(fs.existsSync(path.join(root, "lib/dinoui.js")), false);
});

test("dino: kartu scene statis (CSS, tanpa JS) berisi Score & Top Score", () => {
  const { sceneCard } = require("../lib/dinocard");
  const html = sceneCard({ score: 7, top: 21, round: 8, obstacle: "duck", secs: "4.2" });
  assert.match(html, /Score:/);
  assert.match(html, /Top Score:/);
  assert.match(html, /dn-bird/);
  assert.doesNotMatch(html, /<script/i, "kartu tidak boleh bergantung pada JS");
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(sceneCard({ obstacle: "jump" }), /dn-cactus/);
});

test("dino: kartu dikirim sebelum tombol aksi", async () => {
  const cmd = dino();
  const sent = [];
  await cmd.execute(client(sent), message("628100000005"), []);
  assert.equal(sent.length, 2, "kartu + pesan tombol");
  assert.ok(sent[0].botForwardedMessage, "pesan pertama = kartu rich");
  assert.match(JSON.stringify(sent[1]), /dino act/);
  await cmd.execute(client(sent), message("628100000005"), ["stop"]);
});

test("dino: jawaban benar menaikkan skor, salah mengakhiri + simpan top", async () => {
  const cmd = dino();
  const sent = [];
  const msg = message();
  const key = cmd._internal.keyOf(msg.key.remoteJid, user.id);

  await cmd.execute(client(sent), msg, []);
  const game = cmd._internal.games.get(key);
  assert.ok(game, "sesi dibuat");
  assert.equal(game.score, 0);

  const round = cmd._internal.games.get(key);
  const roundId = round.id;
  await cmd.execute(client(sent), msg, ["act", roundId, round.obstacle]);
  assert.equal(cmd._internal.games.get(key).score, 1, "skor naik setelah jawaban benar");
  assert.notEqual(cmd._internal.games.get(key).id, roundId, "ronde baru, token baru");

  const wrong = cmd._internal.games.get(key).obstacle === "jump" ? "duck" : "jump";
  await cmd.execute(client(sent), msg, ["act", cmd._internal.games.get(key).id, wrong]);
  assert.equal(cmd._internal.games.get(key), null, "sesi berakhir setelah salah");
  assert.equal(user.dinoTop, 1, "top score tersimpan per user");
});

test("dino: token lama tidak bisa dipakai ulang", async () => {
  const cmd = dino();
  const msg = message("628100000009");
  const sent = [];
  const key = cmd._internal.keyOf(msg.key.remoteJid, "628100000009");
  await cmd.execute(client(sent), msg, []);
  const stale = cmd._internal.games.get(key).id;
  await cmd.execute(client(sent), msg, ["act", stale, cmd._internal.games.get(key).obstacle]);
  assert.notEqual(cmd._internal.games.get(key).id, stale, "ronde baru, token baru");
  await cmd.execute(client(sent), msg, ["act", stale, "jump"]);
  assert.match(sent.at(-1).text, /kedaluwarsa/);
});
