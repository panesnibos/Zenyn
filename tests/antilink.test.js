// Antilink: state per grup, deteksi domain, hapus + warn + kick 3x,
// dan command admin-only (bot wajib admin untuk menyalakan).
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

const quiet = { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, msg() {}, debug() {}, divider() {}, banner() {}, kv() {} };
const memJson = () => {
  let data = {};
  return {
    readJson: () => JSON.parse(JSON.stringify(data)),
    writeJson: (_file, next) => { data = JSON.parse(JSON.stringify(next)); }
  };
};

const GROUP = "120363000000@g.us";

const participants = [
  { id: "628100000001@s.whatsapp.net", admin: "admin" },
  { id: "628100000002@s.whatsapp.net", admin: null },
  { id: "628100000099@s.whatsapp.net", admin: "admin" }
];

const makeClient = ({ botAdmin = true } = {}) => {
  const sent = [];
  const removed = [];
  const list = botAdmin
    ? participants
    : participants.map((p) => (p.id.startsWith("628100000099") ? { ...p, admin: null } : p));
  return {
    sent,
    removed,
    user: { id: "628100000099:0@s.whatsapp.net", lid: "999999@lid" },
    async sendMessage(jid, payload) { sent.push({ jid, payload }); },
    async groupMetadata() { return { subject: "Grup Uji", participants: list }; },
    async groupParticipantsUpdate(jid, ids, action) { removed.push({ jid, ids, action }); }
  };
};

const message = (uid, chat = GROUP) => ({
  key: { id: `m-${uid}`, remoteJid: chat, participant: `${uid}@s.whatsapp.net` },
  canonicalUserId: uid,
  message: { conversation: "halo" }
});

const loadAntilink = () => loadMocked("lib/antilink.js", { "./rpgjson": memJson(), "./logger": quiet });
const loadCommand = (lib) => loadMocked("commands/group/antilink.js", { "../../lib/antilink": lib, "../../lib/logger": quiet });

test("antilink: default OFF, domain default link grup WA", () => {
  const al = loadAntilink();
  const state = al.get(GROUP);
  assert.equal(state.enabled, false);
  assert.deepEqual(state.blocked, ["chat.whatsapp.com"]);
  assert.deepEqual(state.warns, {});
});

test("antilink: add menormalkan URL, tolak duplikat & domain ngawur", () => {
  const al = loadAntilink();
  assert.equal(al.addDomain(GROUP, "https://www.TikTok.com/@user/video/1"), "tiktok.com");
  assert.deepEqual(al.get(GROUP).blocked, ["chat.whatsapp.com", "tiktok.com"]);
  assert.throws(() => al.addDomain(GROUP, "TIKTOK.com"), /sudah ada/);
  assert.throws(() => al.addDomain(GROUP, "bukan domain"), /tidak valid/);
  assert.throws(() => al.addDomain(GROUP, ""), /tidak valid/);
});

test("antilink: delete memakai nomor urut, di luar rentang ditolak", () => {
  const al = loadAntilink();
  al.addDomain(GROUP, "tiktok.com");
  assert.equal(al.removeDomain(GROUP, "2"), "tiktok.com");
  assert.deepEqual(al.get(GROUP).blocked, ["chat.whatsapp.com"]);
  assert.throws(() => al.removeDomain(GROUP, "5"), /1 sampai 1/);
  assert.throws(() => al.removeDomain(GROUP, "abc"), /1 sampai 1/);
});

test("antilink: match hanya domain yang diblokir, bukan miripnya", () => {
  const al = loadAntilink();
  assert.equal(al.match(GROUP, "join https://chat.whatsapp.com/ABC123 dong"), "chat.whatsapp.com");
  assert.equal(al.match(GROUP, "chat.whatsapp.com/ABC"), "chat.whatsapp.com");
  assert.equal(al.match(GROUP, "sub.chat.whatsapp.com/x"), "chat.whatsapp.com");
  assert.equal(al.match(GROUP, "chat.whatsapp.com.evil.com"), null);
  assert.equal(al.match(GROUP, "notchat.whatsapp.com"), null);
  assert.equal(al.match(GROUP, "contoh.com"), null);
  assert.equal(al.match(GROUP, ""), null);
});

test("antilink: warn bertambah lalu direset", () => {
  const al = loadAntilink();
  assert.equal(al.warn(GROUP, "628100000002"), 1);
  assert.equal(al.warn(GROUP, "628100000002"), 2);
  assert.equal(al.get(GROUP).warns["628100000002"], 2);
  al.resetWarns(GROUP, "628100000002");
  assert.equal(al.get(GROUP).warns["628100000002"], undefined);
});

test("antilink: OFF tidak menyentuh pesan", async () => {
  const al = loadAntilink();
  const client = makeClient();
  assert.equal(await al.enforce(client, message("628100000002"), "chat.whatsapp.com/ABC"), false);
  assert.equal(client.sent.length, 0);
});

test("antilink: link dihapus, warn 1-3, lalu dikeluarkan", async () => {
  const al = loadAntilink();
  al.setEnabled(GROUP, true);
  const client = makeClient();

  assert.equal(await al.enforce(client, message("628100000002"), "yuk join chat.whatsapp.com/ABC"), true);
  assert.deepEqual(client.sent[0].payload.delete, message("628100000002").key);
  assert.match(client.sent[1].payload.text, /Peringatan 1\/3/);
  assert.deepEqual(client.sent[1].payload.mentions, ["628100000002@s.whatsapp.net"]);
  assert.equal(client.removed.length, 0);

  await al.enforce(client, message("628100000002"), "chat.whatsapp.com/DEF");
  assert.match(client.sent.at(-1).payload.text, /Peringatan 2\/3/);

  await al.enforce(client, message("628100000002"), "chat.whatsapp.com/GHI");
  assert.deepEqual(client.removed, [{ jid: GROUP, ids: ["628100000002@s.whatsapp.net"], action: "remove" }]);
  assert.match(client.sent.at(-1).payload.text, /dikeluarkan dari grup/);
  assert.deepEqual(al.get(GROUP).warns, {}, "warn direset setelah kick");
});

test("antilink: admin grup dan bot non-admin tidak diproses", async () => {
  const al = loadAntilink();
  al.setEnabled(GROUP, true);

  const asAdmin = makeClient();
  assert.equal(await al.enforce(asAdmin, message("628100000001"), "chat.whatsapp.com/ABC"), false);
  assert.equal(asAdmin.sent.length, 0);

  const noBotAdmin = makeClient({ botAdmin: false });
  assert.equal(await al.enforce(noBotAdmin, message("628100000002"), "chat.whatsapp.com/ABC"), false);
  assert.equal(noBotAdmin.sent.length, 0);
  assert.deepEqual(al.get(GROUP).warns, {});
});

test("antilink command: wajib grup & admin grup, status menampilkan daftar", async () => {
  const al = loadAntilink();
  const cmd = loadCommand(al);
  const client = makeClient();

  await cmd.execute(client, message("628100000001", "628100000001@s.whatsapp.net"), []);
  assert.match(client.sent.at(-1).payload.text, /hanya bisa dipakai di grup/i);

  await cmd.execute(client, message("628100000002"), []);
  assert.match(client.sent.at(-1).payload.text, /Hanya admin grup/);

  await cmd.execute(client, message("628100000001"), []);
  const text = client.sent.at(-1).payload.text;
  assert.match(text, /⛔ OFF/);
  assert.match(text, /Bot admin : ✅ ya/);
  assert.match(text, /1\. chat\.whatsapp\.com/);
  assert.match(text, /antilink on \/ off/);
});

test("antilink command: on butuh bot admin, add & delete mengubah daftar", async () => {
  const al = loadAntilink();
  const cmd = loadCommand(al);

  const noBotAdmin = makeClient({ botAdmin: false });
  await cmd.execute(noBotAdmin, message("628100000001"), ["on"]);
  assert.match(noBotAdmin.sent.at(-1).payload.text, /Jadikan bot admin/);
  assert.equal(al.get(GROUP).enabled, false);

  const client = makeClient();
  await cmd.execute(client, message("628100000001"), ["on"]);
  assert.match(client.sent.at(-1).payload.text, /Antilink \*ON\*/);
  assert.equal(al.get(GROUP).enabled, true);

  await cmd.execute(client, message("628100000001"), ["add", "https://www.tiktok.com/x"]);
  assert.match(client.sent.at(-1).payload.text, /2\. tiktok\.com/);

  await cmd.execute(client, message("628100000001"), ["delete", "2"]);
  assert.match(client.sent.at(-1).payload.text, /Domain \*tiktok\.com\* dihapus/);
  assert.deepEqual(al.get(GROUP).blocked, ["chat.whatsapp.com"]);

  await cmd.execute(client, message("628100000001"), ["off"]);
  assert.match(client.sent.at(-1).payload.text, /Antilink \*OFF\*/);
  assert.equal(al.get(GROUP).enabled, false);
});
