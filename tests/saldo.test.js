// Saldo Rp per pembeli: kredit gagal nokos, potong saat bayar.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

let store = { users: {}, log: [] };
const loadMocked = (relative, mocks = {}) => {
  const file = path.join(path.resolve(__dirname, ".."), relative);
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

const saldo = loadMocked("lib/saldo.js", {
  "./rpgjson": {
    readJson: () => JSON.parse(JSON.stringify(store)),
    writeJson: (_file, data) => {
      store = JSON.parse(JSON.stringify(data));
    }
  }
});

const reset = () => {
  store = { users: {}, log: [] };
  saldo._internal.reset();
};

test("awal saldo 0", () => {
  reset();
  assert.equal(saldo.get("u1"), 0);
});

test("add menambah saldo dan tercatat di riwayat", () => {
  reset();
  saldo.add("u1", 1008, "nokos:OTP-1", "Nokos gagal");
  assert.equal(saldo.get("u1"), 1008);
  const h = saldo.history("u1");
  assert.equal(h.length, 1);
  assert.equal(h[0].amount, 1008);
  assert.equal(h[0].ref, "nokos:OTP-1");
});

test("add idempoten: ref sama tidak menggandakan saldo", () => {
  reset();
  saldo.add("u1", 1008, "nokos:OTP-1", "Nokos gagal");
  saldo.add("u1", 1008, "nokos:OTP-1", "Nokos gagal");
  assert.equal(saldo.get("u1"), 1008);
  assert.equal(saldo.history("u1").length, 1);
});

test("add menolak nominal tidak valid tanpa mengubah saldo", () => {
  reset();
  saldo.add("u1", 0, "", "");
  saldo.add("u1", -500, "", "");
  saldo.add("u1", "abc", "", "");
  assert.equal(saldo.get("u1"), 0);
});

test("sub memotong saldo; saldo kurang ditolak", () => {
  reset();
  saldo.add("u1", 2000, "nokos:OTP-1", "");
  saldo.sub("u1", 1500, "pakai:NKS1", "");
  assert.equal(saldo.get("u1"), 500);
  assert.throws(() => saldo.sub("u1", 1000, "pakai:NKS2", ""), /tidak cukup/);
  assert.equal(saldo.get("u1"), 500, "tidak boleh minus");
});

test("sub idempoten: ref sama hanya sekali", () => {
  reset();
  saldo.add("u1", 2000, "nokos:OTP-1", "");
  saldo.sub("u1", 1000, "pakai:NKS1", "");
  saldo.sub("u1", 1000, "pakai:NKS1", "");
  assert.equal(saldo.get("u1"), 1000);
});

test("saldo per user terpisah", () => {
  reset();
  saldo.add("u1", 1000, "a", "");
  saldo.add("u2", 500, "b", "");
  assert.equal(saldo.get("u1"), 1000);
  assert.equal(saldo.get("u2"), 500);
  assert.equal(saldo.history("u2").length, 1);
});

test("riwayat dibatasi jumlah terbaru", () => {
  reset();
  for (let i = 0; i < 8; i++) saldo.add("u1", 100, `r${i}`, `tes ${i}`);
  const h = saldo.history("u1", 5);
  assert.equal(h.length, 5);
  assert.equal(h[0].note, "tes 7");
});
