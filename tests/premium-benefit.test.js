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

const loadPremium = () => {
  const sent = { interactive: [], text: [] };
  const client = {
    sendInteractiveMessage: async (jid, cfg) => sent.interactive.push(cfg),
    sendMessage: async (jid, msg) => sent.text.push(msg.text)
  };
  const premium = loadMocked("commands/main/premium.js", {
    "../../config": {
      botName: "Zenyn",
      premiumPackages: { 7: { label: "Seminggu", price: 2000, days: 7 }, 30: { label: "Sebulan", price: 5000, days: 30 } },
      groupLink: "https://chat.whatsapp.com/x"
    },
    "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {} },
    "../../lib/rpgdb": { db: { getUser: () => ({ status: { type: "User" } }) } },
    "../../lib/rpgutil": { getUserId: () => "628100000001" },
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/autopay": { attach() {}, enabled: () => true }
  });
  return { premium, sent, client };
};

const message = { key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji" };

test("premium: tombol More Benefit muncul di bawah benefit", async () => {
  const { premium, sent, client } = loadPremium();
  await premium.execute(client, message, []);

  const buttons = sent.interactive[0].interactiveButtons;
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].name, "single_select");
  assert.equal(buttons[1].name, "quick_reply");
  const params = JSON.parse(buttons[1].buttonParamsJson);
  assert.equal(params.display_text, "More Benefit");
  assert.equal(params.id, "premium benefit");
});

test("premium benefit: kirim daftar benefit lengkap", async () => {
  const { premium, sent, client } = loadPremium();
  await premium.execute(client, message, ["benefit"]);
  const text = sent.text[0];
  assert.match(text, /BENEFIT PREMIUM/);
  assert.match(text, /Cooldown RPG lebih pendek/);
  assert.match(text, /Seminggu/);
});
