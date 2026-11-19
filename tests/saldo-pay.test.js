// Jalur uang: bayar pakai saldo, dan saldo balik kalau proses gagal.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

let wallet = 0;
const refs = new Set();
let deposits = 0;
let failOrder = false;
let store = { invoices: {} };

const saldoMock = {
  get: () => wallet,
  add: (_uid, n, ref) => {
    if (refs.has(ref)) return wallet;
    refs.add(ref);
    wallet += n;
    return wallet;
  },
  sub: (_uid, n, ref) => {
    if (wallet < n) throw Object.assign(new Error("Saldo tidak cukup."), { user: true });
    if (refs.has(ref)) return wallet;
    refs.add(ref);
    wallet -= n;
    return wallet;
  },
  rp: (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`
};

const aoMock = {
  enabled: () => true,
  balance: async () => ({ balance: 10000000 }),
  qrBuffer: async () => null,
  createDeposit: async (amount, id) => {
    deposits++;
    return {
      id: `DP${id}`,
      qr_string: "QRIS-CONTOH",
      amount,
      fee: 0,
      payment_amount: amount,
      expires_at: Date.now() + 15 * 60000
    };
  }
};

const nokosMock = {
  sellPrice: (apiPrice) => Math.ceil(Number(apiPrice) || 0),
  createOrder: async () => {
    if (failOrder) throw new Error("AutoOrder menolak order");
    return { serviceName: "WhatsApp", country: "X", tier: "E", phone: "+1000", orderId: "OTP-1" };
  }
};

const file = path.join(path.resolve(__dirname, ".."), "lib/autopay.js");
const nativeRequire = createRequire(file);
const mod = { exports: {} };
const mocks = {
  "./autoorder": aoMock,
  "./saldo": saldoMock,
  "./nokos": nokosMock,
  "./addbot": { addRental: () => {} },
  "./rpgdb": { db: { getUser: () => ({ status: {} }), setStatus: () => {} } },
  "./rpgjson": {
    readJson: () => JSON.parse(JSON.stringify(store)),
    writeJson: (_f, data) => {
      store = JSON.parse(JSON.stringify(data));
    }
  },
  "./logger": { info() {}, warn() {}, error() {}, ok() {}, cmd() {} }
};
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
const autopay = mod.exports;

after(() => autopay.stop());

const reset = (amount) => {
  wallet = amount;
  refs.clear();
  deposits = 0;
  failOrder = false;
  store = { invoices: {} };
};

test("premium dibayar penuh dari saldo: tanpa QRIS, langsung aktif", async () => {
  reset(5000);
  const { inv } = await autopay.createPremium({ uid: "u1", name: "Tes", chat: "u1@s.whatsapp.net", origin: "u1@s.whatsapp.net", key: "7" });

  assert.equal(inv.status, "done");
  assert.equal(inv.method, "saldo");
  assert.equal(inv.payAmount, 2000);
  assert.equal(wallet, 3000, "saldo terpotong sebesar harga paket");
  assert.equal(deposits, 0, "tidak boleh buat deposit QRIS");
  autopay.stop();
});

test("saldo kurang: jatuh ke QRIS dan saldo tidak tersentuh", async () => {
  reset(1000);
  const { inv } = await autopay.createPremium({ uid: "u2", name: "Tes", chat: "u2@s.whatsapp.net", origin: "u2@s.whatsapp.net", key: "7" });

  assert.equal(inv.status, "pending");
  assert.equal(inv.method, undefined);
  assert.equal(inv.qr, "QRIS-CONTOH");
  assert.equal(wallet, 1000);
  assert.equal(deposits, 1);
  autopay.stop();
});

test("nokos dibayar saldo lalu gagal: saldo dikembalikan utuh", async () => {
  reset(5000);
  failOrder = true;
  const { inv } = await autopay.createNokos({
    uid: "u3",
    name: "Tes",
    chat: "u3@s.whatsapp.net",
    origin: "u3@s.whatsapp.net",
    serviceId: "svc",
    serviceName: "WhatsApp",
    offerId: "off",
    apiPrice: 1000
  });

  assert.equal(inv.status, "failed");
  assert.equal(wallet, 5000, "saldo balik karena pemrosesan gagal");
  assert.equal(deposits, 0);
  autopay.stop();
});

test("nokos dibayar saldo dan sukses: saldo terpakai", async () => {
  reset(5000);
  const { inv } = await autopay.createNokos({
    uid: "u4",
    name: "Tes",
    chat: "u4@s.whatsapp.net",
    origin: "u4@s.whatsapp.net",
    serviceId: "svc",
    serviceName: "WhatsApp",
    offerId: "off",
    apiPrice: 1000
  });

  assert.equal(inv.status, "done");
  assert.equal(inv.method, "saldo");
  assert.equal(wallet, 4000);
  autopay.stop();
});
