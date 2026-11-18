// Plan 1: teks bantuan/validasi tidak boleh menagih limit.
// Jalur itu harus mengembalikan `false` supaya dispatcher tak mengirim nota limit,
// sedangkan jalur sukses tetap mengembalikan hasil (truthy / { limitCost }).
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

const quiet = { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, msg() {}, debug() {} };

const message = (text = ".cmd") => ({
  key: { id: "m1", remoteJid: "628100000001@s.whatsapp.net" },
  pushName: "Uji",
  message: { conversation: text }
});

const makeClient = () => {
  const sent = [];
  return {
    sent,
    user: { id: "628100000099:0@s.whatsapp.net" },
    async sendMessage(jid, payload) {
      sent.push(payload.text || payload.caption || "[media]");
      return { key: { id: "sent" } };
    },
    async sendInteractiveMessage(jid, payload) {
      sent.push(payload.text || "[interactive]");
      return { key: { id: "sent" } };
    }
  };
};

const user = { id: "u1", name: "Uji", money: 1000, inventory: [], status: { type: "User", until: 0 } };

const deps = (extra = {}) => ({
  "../../lib/logger": quiet,
  "../../lib/prefix": { getPrefix: () => "." },
  "../../lib/featureutil": {
    reply: async (client, message, text, extra2 = {}) => {
      client.sent.push(text);
      return { key: { id: "sent" } };
    },
    guarded: (_name, fn) => fn,
    cooldown() {},
    timedStore: () => ({ get: () => null, set() {}, delete() {}, values: () => [] }),
    quotedText: () => ""
  },
  "../../lib/rpgdb": { db: { getUser: () => user } },
  "../../lib/rpgutil": { getUserId: () => "u1", getRank: () => ({ rank: "Novice", icon: "🌱" }) },
  "../../lib/owner": { isOwner: () => false },
  "../../lib/rpglimit": { statusOf: () => "User" },
  "../../config": { prefixes: ["."], ai: { premiumImages: true }, ytsummarize: { premium: true }, groupLink: "" },
  ...extra
});

const load = (file, extra) => loadMocked(`commands/tools/${file}`, deps(extra));

const silentMedia = (extra = {}) => ({
  "../../lib/mediautil": { findMedia: () => null, download: async () => Buffer.from("") },
  "../../lib/voice": { audioToVoice: async () => Buffer.from("") },
  "../../lib/sticker": { imageToWebp: async () => Buffer.from(""), safeWithExif: async (b) => b, stickerToVideo: async () => Buffer.from("") },
  ...extra
});

test("tools: jalur bantuan/validasi tidak menagih limit (return false)", async () => {
  const cases = [
    ["ai.js", [], "AI CHAT"],
    ["ai.js", ["img"], "Format"],
    ["brat.js", [], "Format"],
    ["cuaca.js", [], "Format"],
    ["gempa.js", ["help"], "INFO GEMPA"],
    ["iqc.js", [], "FAKE QUOTE"],
    ["pin.js", [], "PINTEREST"],
    ["qr.js", [], "Format"],
    ["smeme.js", [], "Reply gambar"],
    ["toimg.js", [], "Reply sticker"],
    ["tovn.js", [], "Reply audio"],
    ["translate.js", [], "Format"],
    ["ytsummarize.js", ["https://youtu.be/abc"], "KHUSUS PREMIUM"],
    ["agedetect.js", [], "KHUSUS PREMIUM"]
  ];
  for (const [file, args, expected] of cases) {
    const cmd = load(file, silentMedia());
    const client = makeClient();
    const result = await cmd.execute(client, message(), args, {}, file.replace(".js", ""));
    assert.equal(result, false, `${file} ${JSON.stringify(args)} harus return false`);
    assert.ok(client.sent.join("\n").includes(expected), `${file} harus kirim pesan (${expected}), dapat: ${client.sent.join(" | ").slice(0, 80)}`);
  }
});

test("tools: jalur sukses tetap truthy / { limitCost }", async () => {
  const aiCmd = load(
    "ai.js",
    silentMedia({ "../../lib/ai": { isConfigured: () => true, ask: async () => "jawaban ai" } })
  );
  const clientAi = makeClient();
  const aiResult = await aiCmd.execute(clientAi, message(), ["halo"], {}, "ai");
  assert.deepEqual(aiResult, { limitCost: 1 });
  assert.ok(clientAi.sent.some((t) => t.includes("jawaban ai")));

  const pinCmd = load(
    "pin.js",
    silentMedia({
      "../../lib/pinterest": {
        parseUrl: () => ({ url: "https://pin.it/x", id: null }),
        fetchPin: async () => ({ type: "image", url: "https://i.pinimg.com/originals/a.jpg" }),
        download: async () => ({ type: "image", buffer: Buffer.from("img"), mimetype: "image/jpeg" })
      }
    })
  );
  const clientPin = makeClient();
  const pinResult = await pinCmd.execute(clientPin, message(), ["https://pin.it/x"], {}, "pin");
  assert.ok(pinResult, "pin sukses harus truthy");
  assert.ok(clientPin.sent.length > 0);
});

test("tools: setiap command tools punya jalan pulang 'return false' (regresi)", () => {
  const files = ["ai", "brat", "cuaca", "gempa", "iqc", "pin", "qr", "smeme", "toimg", "tovn", "translate", "ytsummarize", "agedetect"];
  for (const name of files) {
    const src = fs.readFileSync(path.join(root, `commands/tools/${name}.js`), "utf8");
    assert.ok(/return false;/.test(src), `${name}: tidak ada return false`);
  }
});
