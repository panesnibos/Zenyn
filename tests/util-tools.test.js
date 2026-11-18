// Batch utilitas: calc, hash, b64, pw, remind.
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

const calc = require("../lib/calc");

const sent = [];
const client = { sendMessage: async (_jid, payload) => { sent.push(payload.text || "[media]"); return { key: { id: "s" } }; } };
const message = (text = ".cmd") => ({
  key: { id: "m1", remoteJid: "628100000001@s.whatsapp.net" },
  pushName: "Uji",
  message: { conversation: text }
});

const deps = {
  "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, msg() {}, debug() {} },
  "../../lib/prefix": { getPrefix: () => "." },
  "../../lib/rpgutil": { getUserId: () => "628100000001" },
  "../../lib/featureutil": {
    reply: async (_c, _m, text) => { sent.push(text); return { key: { id: "s" } }; },
    guarded: (_n, fn) => fn,
    quotedText: () => ""
  }
};

const load = (file, extra = {}) => loadMocked(`commands/tools/${file}`, { ...deps, ...extra });

test("calc: aritmetika, pangkat, fungsi, dan error", () => {
  assert.equal(calc.evaluate("2+3*4"), 14);
  assert.equal(calc.evaluate("(2+3)*4"), 20);
  assert.equal(calc.evaluate("2^3^2"), 512, "pangkat kanan-asosiatif");
  assert.equal(calc.evaluate("sqrt(16)+abs(-2)"), 6);
  assert.equal(calc.evaluate("-3+5"), 2);
  assert.equal(calc.evaluate("10%3"), 1);
  assert.equal(calc.format(calc.evaluate("1/3")), "0.3333333333");
  assert.throws(() => calc.evaluate(""), /kosong/);
  assert.throws(() => calc.evaluate("2+"), /Angka tidak valid/);
  assert.throws(() => calc.evaluate("(1+2"), /Kurung tutup/);
  assert.throws(() => calc.evaluate("foo(2)"), /Fungsi tidak dikenal/);
  assert.throws(() => calc.evaluate("2 & 3"), /tak dikenal/);
  assert.throws(() => calc.evaluate("9^9999"), /tidak bisa dihitung/);
});

test("hash: sha256/md5 dikenal, default sha256, tanpa teks -> false", async () => {
  const cmd = load("hash.js");
  sent.length = 0;
  await cmd.execute(client, message(), [], {}, "hash");
  assert.match(sent.at(-1), /Format/);
  assert.equal(await cmd.execute(client, message(), [], {}, "hash"), false);

  await cmd.execute(client, message(), ["abc"], {}, "hash");
  assert.match(sent.at(-1), /ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/);

  await cmd.execute(client, message(), ["md5", "abc"], {}, "hash");
  assert.match(sent.at(-1), /900150983cd24fb0d6963f7d28e17f72/);
});

test("b64: encode/decode bolak-balik dan tolak input rusak", async () => {
  const cmd = load("b64.js");
  await cmd.execute(client, message(), ["encode", "halo dunia"], {}, "b64");
  const encoded = sent.at(-1).split("\n\n").at(-1).trim();
  assert.equal(Buffer.from(encoded, "base64").toString(), "halo dunia");

  await cmd.execute(client, message(), ["decode", "aGFsbyBkdW5pYQ=="], {}, "b64");
  assert.match(sent.at(-1), /halo dunia/);

  assert.equal(await cmd.execute(client, message(), [], {}, "b64"), false);
  await assert.rejects(() => cmd.execute(client, message(), ["decode", "%%%"], {}, "b64"), /bukan base64/);
});

test("pw: panjang sesuai, semua kelas karakter, batas 8-64", async () => {
  const cmd = load("pw.js");
  await cmd.execute(client, message(), ["20"], {}, "pw");
  const pw = sent.at(-1).match(/`([^`]+)`/)[1];
  assert.equal(pw.length, 20);
  assert.match(pw, /[a-z]/);
  assert.match(pw, /[A-Z]/);
  assert.match(pw, /[0-9]/);
  assert.match(pw, /[!@#$%^&*()\-_=+]/);

  assert.equal(await cmd.execute(client, message(), ["5"], {}, "pw"), false);
  assert.equal(await cmd.execute(client, message(), ["99"], {}, "pw"), false);
});

test("remind: parsing waktu dan pengingat benar-benar terkirim", async () => {
  const cmd = load("remind.js");
  const { parseDuration, timers } = cmd._internal;
  assert.equal(parseDuration("10m"), 600000);
  assert.equal(parseDuration("1h30m"), 5400000);
  assert.equal(parseDuration("45s"), 45000);
  assert.equal(parseDuration("abc"), 0);

  assert.equal(await cmd.execute(client, message(), [], {}, "remind"), false);
  await assert.rejects(() => cmd.execute(client, message(), ["25h", "x"], {}, "remind"), /24 jam/);

  sent.length = 0;
  const before = timers.get("628100000001")?.length || 0;
  await cmd.execute(client, message(), ["1h30m", "minum", "obat"], {}, "remind");
  assert.match(sent.at(-1), /1\.5 jam/);
  const after = timers.get("628100000001")?.length || 0;
  assert.equal(after, before + 1, "timer terdaftar");
});

test("limit: utilitas 1, remind gratis", () => {
  for (const file of ["hash.js", "b64.js", "pw.js", "calc.js"]) {
    assert.equal(load(file).limit, 1, file);
  }
  assert.equal(load("remind.js").limit, 0, "remind gratis");
});
