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

// autopay menahan cache saldo 60s di level modul -> tiap kasus pakai modul baru.
const loadAutopay = ({ balance, onDeposit }) => {
  const calls = { deposit: 0, alerts: [] };
  const ao = {
    enabled: () => true,
    balance: async () => ({ balance }),
    createDeposit: async (amount, ref) => {
      calls.deposit++;
      if (onDeposit) return onDeposit(amount, ref);
      return { id: "dep1", amount, fee: 0, payment_amount: amount, qr_string: "QR", expires_at: 0 };
    },
    getDeposit: async () => ({ status: "pending" }),
    cancelDeposit: async () => ({}),
    qrBuffer: async () => Buffer.from("")
  };
  const json = { readJson: () => ({}), writeJson: () => {} };
  const db = { getUser: () => ({}), setStatus: () => {} };
  const autopay = loadMocked("lib/autopay.js", {
    "./autoorder": ao,
    "./rpgjson": json,
    "./rpgdb": { db }
  });
  return { autopay, calls };
};

const nokosArgs = { uid: "628100000001", name: "Uji", chat: "chat@s.whatsapp.net", serviceId: "svc", serviceName: "WhatsApp", offerId: "offer", apiPrice: 2500 };

test("createNokos: saldo kurang -> tolak sebelum tagihan QRIS dibuat", async () => {
  const { autopay, calls } = loadAutopay({ balance: 0 });
  assert.equal(typeof autopay.requireBalance, "function", "nokos.replace butuh requireBalance dari autopay");
  await assert.rejects(() => autopay.createNokos(nokosArgs), /saldo habis/i);
  assert.equal(calls.deposit, 0, "createDeposit tidak boleh dipanggil saat saldo habis");
});

test("createNokos: saldo cukup -> tagihan dibuat", async () => {
  const { autopay, calls } = loadAutopay({ balance: 50000 });
  const { inv } = await autopay.createNokos(nokosArgs);
  assert.equal(calls.deposit, 1);
  assert.equal(inv.status, "pending");
  assert.equal(inv.apiPrice, 2500);
});
