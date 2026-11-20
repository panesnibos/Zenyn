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

// nokos sekarang hanya bisa dibeli pakai saldo Rp (QRIS dinonaktifkan).
const loadAutopay = ({ balance, wallet = 0 }) => {
  const calls = { deposit: 0, orders: 0 };
  const ao = {
    enabled: () => true,
    balance: async () => ({ balance }),
    createDeposit: async (amount, ref) => {
      calls.deposit++;
      return { id: "dep1", amount, fee: 0, payment_amount: amount, qr_string: "QR", expires_at: 0 };
    },
    getDeposit: async () => ({ status: "pending" }),
    cancelDeposit: async () => ({}),
    qrBuffer: async () => Buffer.from("")
  };
  const saldo = {
    get: () => wallet,
    sub: (_uid, n) => {
      if (wallet < n) throw Object.assign(new Error("Saldo tidak cukup."), { user: true });
      wallet -= n;
      return wallet;
    },
    add: (_uid, n) => { wallet += n; return wallet; },
    rp: (n) => `Rp${n}`
  };
  const nokosMock = {
    sellPrice: (n) => Number(n) || 0,
    createOrder: async () => {
      calls.orders++;
      return { orderId: "OTP-1", serviceName: "WhatsApp", country: "X", tier: "E", phone: "+1000" };
    }
  };
  const json = { readJson: () => ({}), writeJson: () => {} };
  const db = { getUser: () => ({}), setStatus: () => {} };
  const autopay = loadMocked("lib/autopay.js", {
    "./autoorder": ao,
    "./rpgjson": json,
    "./rpgdb": { db },
    "./saldo": saldo,
    "./nokos": nokosMock
  });
  return { autopay, calls };
};

const nokosArgs = { uid: "628100000001", name: "Uji", chat: "chat@s.whatsapp.net", serviceId: "svc", serviceName: "WhatsApp", offerId: "offer", apiPrice: 2500 };

test("createNokos: saldo Rp kurang -> ditolak, tanpa QRIS", async () => {
  const { autopay, calls } = loadAutopay({ balance: 50000, wallet: 1000 });
  await assert.rejects(() => autopay.createNokos(nokosArgs), /saldo Rp/i);
  assert.equal(calls.deposit, 0, "createDeposit tidak boleh dipanggil");
  assert.equal(calls.orders, 0, "tidak ada order ke AutoOrder");
  autopay.stop();
});

test("createNokos: saldo AutoOrder habis -> ditolak sebelum potong saldo pembeli", async () => {
  const { autopay, calls } = loadAutopay({ balance: 0, wallet: 50000 });
  assert.equal(typeof autopay.requireBalance, "function", "nokos.replace butuh requireBalance dari autopay");
  await assert.rejects(() => autopay.createNokos(nokosArgs), /saldo habis/i);
  assert.equal(calls.deposit, 0);
  autopay.stop();
});

test("createNokos: saldo cukup -> lunas dari saldo, tanpa deposit QRIS", async () => {
  const { autopay, calls } = loadAutopay({ balance: 50000, wallet: 50000 });
  const { inv } = await autopay.createNokos(nokosArgs);
  assert.equal(calls.deposit, 0, "QRIS tidak boleh dibuat");
  assert.equal(calls.orders, 1, "order langsung dikirim ke AutoOrder");
  assert.equal(inv.method, "saldo");
  assert.equal(inv.status, "done");
  assert.equal(inv.apiPrice, 2500);
  autopay.stop();
});
