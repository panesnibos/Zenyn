// P9: format angka ringkas (k/M/B) dan pembungkusan client untuk command RPG.
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

const { short, full, shortText } = require("../lib/num");
const { shortClient, formatPayload } = require("../lib/rpgnum");

test("short: ambang 10.000 dan satuan k/M/B", () => {
  const cases = [
    [0, "0"],
    [999, "999"],
    [9999, "9999"],
    [10000, "10k"],
    [12345, "12,3k"],
    [54321, "54,3k"],
    [999949, "999,9k"],
    [999990, "1M"],
    [1000000, "1M"],
    [13245678, "13,2M"],
    [2500000000, "2,5B"],
    [-12345, "-12,3k"],
    [undefined, "0"],
    [NaN, "0"],
    ["1500", "1500"],
    ["12500", "12,5k"]
  ];
  for (const [input, expected] of cases) {
    assert.equal(short(input), expected, String(input));
  }
});

test("full: pemisah ribuan untuk nominal uang asli", () => {
  assert.equal(full(12345), "12.345");
  assert.equal(full(0), "0");
  assert.equal(full(null), "0");
});

test("shortText: hanya angka >=5 digit, mention dan id tidak disentuh", () => {
  assert.equal(shortText("Gold: 12345"), "Gold: 12,3k");
  assert.equal(shortText("Gold: 9999"), "Gold: 9999", "di bawah ambang tetap utuh");
  assert.equal(shortText("Kirim 12000 ke @6281234567890 sekarang"), "Kirim 12k ke @6281234567890 sekarang");
  assert.equal(shortText("EXP 1/150"), "EXP 1/150");
  assert.equal(shortText("ID NKS54B282"), "ID NKS54B282");
  assert.equal(shortText("Level 12345 musuh"), "Level 12,3k musuh");
  assert.equal(shortText(undefined), "");
});

test("formatPayload: teks & caption diformat, field lain utuh", () => {
  const payload = { text: "Gold kamu: 25000", mentions: ["6281234567890@s.whatsapp.net"] };
  const out = formatPayload(payload);
  assert.equal(out.text, "Gold kamu: 25k");
  assert.deepEqual(out.mentions, payload.mentions);
  assert.notEqual(out, payload, "payload asli tidak dimutasi");

  const caption = formatPayload({ image: Buffer.from("x"), caption: "Harga 15000" });
  assert.equal(caption.caption, "Harga 15k");

  const same = formatPayload({ text: "aman 100" });
  assert.equal(same.text, "aman 100");
});

test("shortClient: hanya sendMessage/sendInteractiveMessage diformat", async () => {
  const calls = [];
  const base = {
    user: { id: "bot" },
    sendMessage: async (jid, payload, opts) => { calls.push({ jid, payload, opts }); return { key: { id: "x" } }; },
    sendInteractiveMessage: async (jid, payload) => { calls.push({ jid, payload }); return { key: { id: "y" } }; },
    groupMetadata: async () => ({ participants: [] })
  };
  const client = shortClient(base);

  assert.equal(client.user.id, "bot", "properti non-fungsi tetap terbaca");
  await client.sendMessage("c@s.whatsapp.net", { text: "Gold 45000" }, { quoted: "m" });
  assert.equal(calls[0].payload.text, "Gold 45k");

  await client.sendInteractiveMessage("c@s.whatsapp.net", { text: "Harga 12000", interactiveButtons: [] });
  assert.equal(calls[1].payload.text, "Harga 12k");

  const gm = await client.groupMetadata("g@g.us");
  assert.deepEqual(gm, { participants: [] });
});

test("index.js membungkus client RPG dengan shortClient", () => {
  const src = fs.readFileSync(path.join(root, "index.js"), "utf8");
  assert.match(src, /require\("\.\/lib\/rpgnum"\)/);
  assert.match(src, /cmd\.category === "rpg" \? shortClient\(client\) : client/);
});
