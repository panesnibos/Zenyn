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

const loadAutopay = ({ orderFails = false, latest = null } = {}) => {
  const calls = { order: 0 };
  const nokos = {
    createOrder: async (inv) => {
      calls.order++;
      if (orderFails) throw new Error("Saldo akun Anda tidak mencukupi untuk memesan nomor virtual ini.");
      return { orderId: "ord1", serviceName: inv.serviceName, country: inv.countryName, phone: "+62001" };
    },
    latest: () => latest
  };
  const ao = { enabled: () => true, balance: async () => ({ balance: 0 }) };
  const db = { getUser: () => ({}), setStatus: () => {} };
  const autopay = loadMocked("lib/autopay.js", {
    "./autoorder": ao,
    "./nokos": nokos,
    "./rpgjson": { readJson: () => ({}), writeJson: () => {} },
    "./rpgdb": { db },
    "./addbot": {},
    "./saldo": { add: () => 0, get: () => 0, sub: () => 0, rp: (n) => `Rp${n}` }
  });
  return { autopay, calls };
};

const failedInv = () => ({
  id: "NKS54B282",
  kind: "nokos",
  status: "failed",
  buyer: "6285139449005",
  chat: "chat@s.whatsapp.net",
  serviceId: "svc",
  serviceName: "WhatsApp OTP",
  offerId: "offer",
  countryName: "Vietnam",
  apiPrice: 840,
  amount: 1000,
  fee: 8,
  payAmount: 1008,
  note: "Saldo akun Anda tidak mencukupi untuk memesan nomor virtual ini."
});

test("retryNokos: invoice failed -> order dibuat, status done", async () => {
  const { autopay, calls } = loadAutopay();
  const inv = failedInv();
  const out = await autopay.retryNokos(inv);
  assert.equal(calls.order, 1);
  assert.equal(out.status, "done");
  assert.equal(out.note, "");
  assert.ok(out.retriedAt > 0);
});

test("retryNokos: bukan tagihan nokos -> ditolak", async () => {
  const { autopay, calls } = loadAutopay();
  await assert.rejects(() => autopay.retryNokos({ id: "PRM1", kind: "premium", status: "failed" }), /bukan tagihan nomor virtual/);
  assert.equal(calls.order, 0);
});

test("retryNokos: status done tanpa order mati -> ditolak", async () => {
  const { autopay } = loadAutopay({ latest: { status: "pending", otp: "" } });
  await assert.rejects(() => autopay.retryNokos({ ...failedInv(), status: "done" }), /hanya invoice/);
});

test("retryNokos: done tapi order terakhir failed tanpa OTP -> diulang", async () => {
  const { autopay, calls } = loadAutopay({ latest: { status: "failed", otp: "" } });
  const inv = { ...failedInv(), status: "done", note: "" };
  const out = await autopay.retryNokos(inv);
  assert.equal(calls.order, 1);
  assert.equal(out.status, "done");
  assert.ok(out.retriedAt > 0);
});

test("retryNokos: OTP sudah pernah masuk -> ditolak", async () => {
  const { autopay, calls } = loadAutopay({ latest: { status: "done", otp: "123456" } });
  await assert.rejects(() => autopay.retryNokos({ ...failedInv(), status: "done" }), /hanya invoice/);
  assert.equal(calls.order, 0);
});

test("retryNokos: saldo kurang -> status balik failed + note terisi", async () => {
  const { autopay } = loadAutopay({ orderFails: true });
  const inv = failedInv();
  await assert.rejects(() => autopay.retryNokos(inv), /Saldo akun/);
  assert.equal(inv.status, "failed");
  assert.match(inv.note, /Saldo akun/);
});
