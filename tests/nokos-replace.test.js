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

const loadNokos = ({ status = "expired", maxReplace = 3 } = {}) => {
  const calls = { cancel: 0, order: 0, alerts: 0 };
  let seq = 0;
  const config = {
    prefixes: ["."],
    owners: [],
    nokos: { enabled: true, pollMs: 6000, replaceAfterMs: 600000, maxReplace, markup: { percent: 20 } }
  };
  const ao = {
    enabled: () => true,
    nokosOrder: async () => {
      calls.order++;
      return { id: `api${++seq}`, orderId: `ord${seq}`, phoneNumber: `+62000${seq}` };
    },
    nokosGet: async () => ({ status }),
    nokosCancel: async () => {
      calls.cancel++;
      return {};
    }
  };
  const nokos = loadMocked("lib/nokos.js", {
    "../config": config,
    "./autoorder": ao,
    "./rpgjson": { readJson: () => ({}), writeJson: () => {} },
    "./autopay": { requireBalance: async () => {} }
  });
  return { nokos, calls };
};

const inv = {
  id: "NKS1",
  buyer: "628100000001",
  name: "Uji",
  chat: "chat@s.whatsapp.net",
  serviceId: "svc",
  serviceName: "WhatsApp",
  offerId: "offer",
  countryName: "Indonesia",
  tierLabel: "ekonomi",
  apiPrice: 2500,
  payAmount: 3000
};

test("OTP tak muncul: order API dibatalkan lalu nomor pengganti dibuat", async () => {
  const { nokos, calls } = loadNokos();
  const first = await nokos.createOrder(inv);
  assert.equal(first.replacements, undefined);

  await nokos.check(first);

  assert.equal(calls.cancel, 1, "order lama harus dibatalkan di API");
  assert.equal(calls.order, 2, "harus ada order baru");
  const all = nokos.list();
  assert.equal(all.length, 2);
  const fresh = all.find((o) => o.orderId === "ord2");
  assert.equal(fresh.status, "pending");
  assert.equal(fresh.replacements, 1);
  assert.equal(fresh.parentId, first.apiId);
  assert.equal(fresh.charged, 3000, "pembeli tidak ditagih ulang");
  assert.equal(nokos.get(first.apiId).status, "replaced");
});

test("batas ganti habis: tidak buat order baru, status failed", async () => {
  const { nokos, calls } = loadNokos();
  const o = await nokos.createOrder(inv);
  nokos.get(o.apiId).replacements = 3;

  await nokos.replace(nokos.get(o.apiId), "timeout");

  assert.equal(calls.order, 1, "hanya order awal");
  assert.equal(nokos.get(o.apiId).status, "failed");
});

test("deadline ganti = 10 menit dari createdAt", async () => {
  const { nokos } = loadNokos();
  const o = await nokos.createOrder(inv);
  assert.equal(nokos.dueAt(o) - o.createdAt, 600000);
});
