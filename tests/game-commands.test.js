const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const message = (uid = "628100000001", chat = "120363000000@g.us") => ({
  key: { id: "mock", remoteJid: chat, participant: `${uid}@s.whatsapp.net` },
  canonicalUserId: uid, pushName: "Pemain Uji",
  message: { conversation: ".dino" }
});

test("catur pindah ke kategori game", () => {
  assert.equal(fs.existsSync(path.join(root, "commands/fun/catur.js")), false);
  const catur = require("../commands/game/catur");
  assert.equal(catur.category, "game");
  assert.equal(catur.visible, true);
  assert.ok(catur.command.includes("catur"));
  assert.equal(typeof catur.execute, "function");
});

test("dino: metadata + kartu game self-contained tanpa canvas", () => {
  const dino = require("../commands/game/dino");
  assert.equal(dino.category, "game");
  assert.equal(dino.visible, true);
  assert.deepEqual(dino.command, ["dino"]);
  assert.equal(typeof dino.execute, "function");

  assert.equal(fs.existsSync(path.join(root, "lib/dinocard.js")), false, "kartu statis sudah dibuang");
  const { html } = require("../lib/dinogame");
  assert.match(html, /Score:/);
  assert.match(html, /Top Score:/);
  assert.match(html, /id="scene"/);
  assert.match(html, /id="dino"/);
  assert.doesNotMatch(html, /<canvas/i);
  assert.doesNotMatch(html, /https?:\/\//, "kartu tidak boleh memuat resource luar");
});

test("dino: skrip kartu lolos parse dan tak bergantung pada emoji", () => {
  const { html } = require("../lib/dinogame");
  const script = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"));
  assert.ok(script.length > 2000);
  assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotMatch(script, /emoji|\\u\{|fillText/);
});

test("dino: skrip kartu jalan tanpa DOM asli (loop + skor naik)", () => {
  const { html } = require("../lib/dinogame");
  const script = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"));
  const makeEl = (id) => {
    const handlers = {};
    return {
      id, style: {}, className: "", textContent: "", innerHTML: "", value: "",
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener: (ev, fn) => { handlers[ev] = fn; },
      appendChild() {}, setAttribute() {},
      getBoundingClientRect: () => ({ width: 320, height: 170, top: 0, left: 0 }),
      fire: (ev, arg) => handlers[ev]?.(arg)
    };
  };
  const els = new Map();
  let raf = null;
  const sandbox = {
    document: { getElementById: (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); }, createElement: () => makeEl("i") },
    window: { addEventListener() {}, onerror: null },
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame: (cb) => { raf = cb; },
    Number, String, Math, Array, Object, Date, console
  };
  sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(script, sandbox));

  const dbgEl = els.get("dbg");
  assert.match(dbgEl.textContent, /JS jalan/);

  els.get("scene").fire("pointerdown", { preventDefault() {}, clientY: 10 });
  for (let i = 1; i <= 240; i++) raf(i * 16);
  assert.ok(Number(els.get("score").textContent) > 0, "skor bertambah setelah loop berjalan");
});

test("dino: kirim kartu, fallback teks kalau client tak dukung", async () => {
  const dino = require("../commands/game/dino");
  const sent = [];
  const sendMessage = async (jid, payload) => void sent.push(payload);
  await dino.execute({ relayMessage: async () => {}, sendMessage }, message(), []);
  assert.equal(sent.length, 0, "client dengan relayMessage tidak perlu fallback");
  await dino.execute({ sendMessage }, message(), []);
  assert.match(sent.at(-1).text, /Kartu game/);
});
