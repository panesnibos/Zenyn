// Menu: kotak identitas + kotak kategori, alias kategori, .allmenu (tombol URL saja).
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

const cmd = (name, category) => ({ name, command: [name], category, visible: true, execute: () => {} });

const flat = {
  menu: cmd("menu", "main"),
  ping: cmd("ping", "main"),
  test: cmd("test", "main"),
  addbot: cmd("addbot", "owner"),
  addmoney: cmd("addmoney", "owner"),
  ai: cmd("ai", "tools"),
  igdl: cmd("igdl", "downloader"),
  rpg: cmd("rpg", "rpg"),
  nokos: cmd("nokos", "store"),
  suit: cmd("suit", "fun"),
  rules: cmd("rules", "info")
};

const categoriesMap = {
  main: [flat.menu, flat.ping, flat.test],
  owner: [flat.addbot, flat.addmoney],
  tools: [flat.ai],
  downloader: [flat.igdl],
  rpg: [flat.rpg],
  store: [flat.nokos],
  fun: [flat.suit],
  info: [flat.rules]
};

const loadMenu = ({ user = { name: "Uji", registered: false, limit: 20, limitMax: 20 }, pushName = "WA Name" } = {}) => {
  const sent = [];
  const payloads = [];
  const client = {
    sendMessage: async (_jid, payload) => { sent.push(payload.text); return { key: { id: "s" } }; },
    sendInteractiveMessage: async (_jid, payload) => { sent.push(payload.text); payloads.push(payload); return { key: { id: "i" } }; }
  };
  const mod = loadMocked("commands/main/menu.js", {
    "../../lib/logger": quiet,
    "../../lib/commandLoader": { getCommandsByCategory: () => categoriesMap },
    "../../lib/owner": { isOwner: () => false },
    "../../lib/prefix": { getPrefix: () => "!" },
    "../../lib/rpgdb": { db: { getUser: () => user } },
    "../../lib/rpgutil": { getUserId: () => "u1" }
  });
  return { mod, client, sent, payloads, user, pushName };
};

const message = (pushName) => ({ key: { remoteJid: "chat@s.whatsapp.net" }, pushName, message: { conversation: "." } });

test("menu: kotak identitas + MAIN MENU + MENU LAINNYA + footer", async () => {
  const h = loadMenu();
  await h.mod.execute(h.client, message(h.pushName), [], flat, "menu");

  const text = h.sent.at(-1);
  const payload = h.payloads.at(-1);

  assert.match(text, /╭━━━〔 \*ZENYN MENU\* 〕━━━⬣/);
  assert.match(text, /┃ ✦ Name   : Uji/);
  assert.match(text, /┃ ✦ Prefix : !/);
  assert.match(text, /\*MAIN MENU\*/);
  assert.match(text, /┃ ✦ !menu/);
  assert.match(text, /┃ ✦ !ping/);
  assert.doesNotMatch(text, /!test/, "test tidak ditampilkan");
  assert.match(text, /\*MENU LAINNYA\*/);
  assert.match(text, /┃ ✦ !ownermenu/);
  assert.match(text, /┃ ✦ !infomenu/);
  assert.match(text, /Zenyn v1\.0/);

  assert.match(payload.tip, /Zenyn Bot • \d+ command/);
  assert.match(payload.tip, /👥 wajib grup · 🔒 owner · 💎 premium/);
  assert.equal(payload.tip.split("\n").length, 2, "footer 2 baris");

  const buttons = payload.interactiveButtons;
  assert.equal(buttons.length, 2, "list + cta");
  const sections = JSON.parse(buttons[0].buttonParamsJson).sections;
  assert.match(sections[0].title, /^👤 Good (Morning|Afternoon|Evening|Night), WA Name$/);
  assert.equal(sections[0].rows.length, 2);
  assert.equal(sections[1].title, "📂 Kategori");
  assert.equal(sections[1].rows.length, 7);
  assert.deepEqual(sections[1].rows.map((r) => r.id), [
    "ownermenu", "toolmenu", "downloadermenu", "rpgmenu", "storemenu", "funmenu", "infomenu"
  ]);
  assert.equal(buttons[1].name, "cta_url");
});

test("menu: alias .ownermenu hanya menampilkan kategori owner", async () => {
  const h = loadMenu();
  await h.mod.execute(h.client, message(h.pushName), [], flat, "ownermenu");
  const text = h.sent.at(-1);

  assert.match(text, /\*ZENYN MENU\*/, "kotak identitas tetap ada");
  assert.match(text, /\*OWNER MENU\*/);
  assert.match(text, /┃ ✦ !addbot/);
  assert.match(text, /┃ ✦ !addmoney/);
  assert.doesNotMatch(text, /\*MAIN MENU\*/, "tidak menampilkan kategori lain");
});

test("menu: .menu <kategori> juga jalan", async () => {
  const h = loadMenu();
  await h.mod.execute(h.client, message(h.pushName), ["tools"], flat, "menu");
  assert.match(h.sent.at(-1), /\*TOOL MENU\*/);
  assert.match(h.sent.at(-1), /┃ ✦ !ai/);
});

test("menu: .allmenu semua kategori, tombol cuma URL", async () => {
  const h = loadMenu();
  await h.mod.execute(h.client, message(h.pushName), [], flat, "allmenu");
  const text = h.sent.at(-1);
  const payload = h.payloads.at(-1);

  for (const title of ["MAIN", "OWNER", "TOOL", "DOWNLOADER", "RPG", "STORE", "FUN", "INFO"]) {
    assert.match(text, new RegExp(`\\*${title} MENU\\*`), `${title} tampil`);
  }
  assert.match(text, /Zenyn v1\.0/);
  assert.equal(payload.interactiveButtons.length, 1);
  assert.equal(payload.interactiveButtons[0].name, "cta_url");
  assert.equal(JSON.parse(payload.interactiveButtons[0].buttonParamsJson).url.includes("chat.whatsapp.com"), true);
});

test("menu: nama sapaan pakai nama register kalau sudah terdaftar", async () => {
  const h = loadMenu({ user: { name: "Vaneska", registered: true, limit: 20, limitMax: 20 }, pushName: "WA Name" });
  await h.mod.execute(h.client, message(h.pushName), [], flat, "menu");
  const sections = JSON.parse(h.payloads.at(-1).interactiveButtons[0].buttonParamsJson).sections;
  assert.match(sections[0].title, /, Vaneska$/);
});

test("config: harga sewa bot baru", () => {
  const config = require("../config");
  assert.equal(config.addbotPackages["30"].price, 3000);
  assert.equal(config.addbotPackages["30"].days, 30);
  assert.equal(config.addbotPackages["0"].price, 12000);
  assert.equal(config.addbotPackages["0"].days, 0, "0 hari = permanen");
});
