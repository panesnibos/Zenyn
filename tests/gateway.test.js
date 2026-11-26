// Grup Gateway: resolver by nama, blacklist gempa/bcgc, sembunyi dari .group.
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

test("gateway: deteksi nama grup", () => {
  const gw = require("../lib/gateway");
  assert.equal(gw.nameMatches("Gateway"), true);
  assert.equal(gw.nameMatches("GATEWAY • LLM"), true);
  assert.equal(gw.nameMatches("Grup Jualan"), false);
  assert.equal(gw.nameMatches(""), false);
});

test("gateway: env GATEWAY_JID jadi patokan", async () => {
  const gw = require("../lib/gateway");
  const old = process.env.GATEWAY_JID;
  process.env.GATEWAY_JID = "120363000000000000@g.us";
  assert.equal(await gw.resolve({}), "120363000000000000@g.us");
  assert.equal(await gw.isGateway({}, "120363000000000000@g.us"), true);
  assert.equal(await gw.isGateway({}, "120363999999999999@g.us"), false);
  if (old === undefined) delete process.env.GATEWAY_JID;
  else process.env.GATEWAY_JID = old;
});

test("gateway: resolve cari grup bernama Gateway", async () => {
  const dbFile = path.join(root, "database/gateway.json");
  const backup = fs.existsSync(dbFile) ? fs.readFileSync(dbFile, "utf8") : null;
  fs.rmSync(dbFile, { force: true });

  const gw = require("../lib/gateway");
  gw.forget();
  const client = {
    groupFetchAllParticipating: async () => ({
      "120363111111111111@g.us": { subject: "Grup Biasa" },
      "120363222222222222@g.us": { subject: "Gateway LLM" }
    })
  };
  assert.equal(await gw.resolve(client, { force: true }), "120363222222222222@g.us");

  if (backup !== null) fs.writeFileSync(dbFile, backup);
  else fs.rmSync(dbFile, { force: true });
  gw.forget();
});

test("gempa: tetap jalan di grup lain", async () => {
  const sent = [];
  const client = {
    sendMessage: async (_j, p) => { sent.push(p.text); return { key: { id: "s" } }; },
    sendInteractiveMessage: async (_j, p) => { sent.push(p.text); return { key: { id: "s" } }; }
  };
  const cmd = loadMocked("commands/tools/gempa.js", {
    "../../lib/logger": quiet,
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/quake": {
      fetchLatest: async () => ({ mag: 5 }),
      fetchRecent: async () => [],
      fetchFelt: async () => [],
      formatMessage: () => "🌍 gempa M5",
      joinButtons: () => []
    }
  });
  await cmd.execute(client, { key: { remoteJid: "120363333333333333@g.us" }, message: {} }, [], {}, "gempa");
  assert.match(sent.at(-1), /gempa M5/);
});
