// Nokos dibayar dari saldo Rp: batal/gagal harus mengembalikan saldo otomatis.
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

const loadNokos = ({ method = "saldo" } = {}) => {
  const calls = { cancel: 0, refund: 0 };
  let state = {
    orders: {
      api1: {
        apiId: "api1",
        orderId: "ord1",
        invoiceId: "NKS1",
        buyer: "628100000001",
        chat: "628100000001@s.whatsapp.net",
        serviceName: "WhatsApp",
        country: "X",
        tier: "E",
        phone: "+1000",
        charged: 1008,
        status: "pending",
        createdAt: Date.now()
      }
    }
  };
  const config = {
    prefixes: ["."],
    owners: [],
    nokos: { enabled: true, pollMs: 6000, replaceAfterMs: 600000, maxReplace: 3, markup: { percent: 20 } }
  };
  const ao = {
    enabled: () => true,
    nokosCancel: async () => {
      calls.cancel++;
      return {};
    }
  };
  const nokos = loadMocked("lib/nokos.js", {
    "../config": config,
    "./logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, debug() {} },
    "./autoorder": ao,
    "./rpgjson": {
      readJson: () => JSON.parse(JSON.stringify(state)),
      writeJson: (_f, next) => { state = JSON.parse(JSON.stringify(next)); }
    },
    "./saldo": {
      add: (_uid, n) => { calls.refund += n; return n; },
      get: () => 0,
      sub: () => 0,
      rp: (n) => `Rp${n}`
    },
    "./autopay": {
      get: () => ({ method }),
      markNokosFailed: () => {}
    }
  });
  return { nokos, calls, state: () => state };
};

test("nokos batal: saldo Rp kembali otomatis", async () => {
  const { nokos, calls } = loadNokos({ method: "saldo" });
  const order = nokos.latest("NKS1");
  assert.ok(order, "order ada");

  await nokos.cancel(order);
  assert.equal(calls.cancel, 1, "order API dibatalkan");
  assert.equal(order.status, "cancelled");
  assert.equal(order.saldoCredit, 1008);
  assert.equal(calls.refund, 1008, "saldo dikreditkan sebesar yang dibayar");
});

test("nokos batal: order QRIS lama tidak dikreditkan ke saldo", async () => {
  const { nokos, calls } = loadNokos({ method: "qris" });
  const order = nokos.latest("NKS1");
  await nokos.cancel(order);
  assert.equal(calls.refund, 0, "bukan pembayaran saldo -> tidak ada kredit");
  assert.equal(order.saldoCredit, undefined);
});
