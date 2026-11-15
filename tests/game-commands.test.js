const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("catur pindah ke kategori game", () => {
  assert.equal(fs.existsSync(path.join(root, "commands/fun/catur.js")), false);
  const catur = require("../commands/game/catur");
  assert.equal(catur.category, "game");
  assert.equal(catur.visible, true);
  assert.ok(catur.command.includes("catur"));
  assert.equal(typeof catur.execute, "function");
});

test("dino: metadata + kartu game self-contained", () => {
  const dino = require("../commands/game/dino");
  assert.equal(dino.category, "game");
  assert.equal(dino.visible, true);
  assert.deepEqual(dino.command, ["dino"]);
  assert.equal(typeof dino.execute, "function");

  const { html } = require("../lib/dinoui");
  assert.match(html, /<canvas/);
  assert.match(html, /Score:/);
  assert.match(html, /Top Score:/);
  assert.doesNotMatch(html, /https?:\/\//, "kartu tidak boleh memuat resource luar");
});

test("dino: kirim kartu, fallback teks kalau client tak dukung", async () => {
  const dino = require("../commands/game/dino");
  const message = { key: { remoteJid: "628100000001@s.whatsapp.net" }, message: { conversation: ".dino" } };
  const sent = [];
  const sendMessage = async (jid, payload) => void sent.push(payload);
  await dino.execute({ relayMessage: async () => {}, sendMessage }, message, []);
  assert.equal(sent.length, 0, "client dengan relayMessage tidak perlu fallback");
  await dino.execute({ sendMessage }, message, []);
  assert.match(sent.at(-1).text, /Kartu game/);
});

test("dino: skrip kartu lolos parse", () => {
  const { html } = require("../lib/dinoui");
  const script = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"));
  assert.ok(script.length > 1000);
  assert.doesNotThrow(() => new vm.Script(script));
});
