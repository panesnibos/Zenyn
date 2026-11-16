// Test alert gateway tanpa WhatsApp: fetch dan socket dipalsukan.
// Setiap alert dikirim ke semua owner, jadi hitung per jenis pesan.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const stateFile = path.join(os.tmpdir(), `gwmonitor-test-${process.pid}.json`);
process.env.GW_ADMIN_URL = "http://127.0.0.1:1";
process.env.GW_ADMIN_KEY = "test-key";
process.env.GW_MONITOR_STATE = stateFile;

const gwmonitor = require("../lib/gwmonitor");
const { check, reset, setSocket } = gwmonitor._internal;

const sent = [];
setSocket({ sendMessage: async (jid, payload) => { sent.push(payload.text); } });
const count = (needle) => sent.filter((t) => t.includes(needle)).length;

const healthy = (over = {}) => ({
  uptime_s: 120,
  clients: 3,
  today: { requests: 10, tokens: 100, errors: 0 },
  last_5m: { requests: 5, s5xx: 0, s429: 0, s402: 0 },
  ...over,
});

let mode = "fail";
let status = healthy();
global.fetch = async () => {
  if (mode === "fail") throw new Error("ECONNREFUSED");
  return { ok: true, json: async () => status };
};

(async () => {
  try { fs.rmSync(stateFile, { force: true }); } catch {}
  reset();

  await check();
  assert.strictEqual(sent.length, 0, "satu kegagalan belum boleh alert");
  assert.strictEqual(gwmonitor._internal.state().fails, 1);

  await check();
  assert.strictEqual(count("GATEWAY MATI"), 2, "dua kegagalan harus alert ke semua owner");

  await check();
  assert.strictEqual(count("GATEWAY MATI"), 2, "alert berikutnya kena cooldown");

  mode = "ok";
  await check();
  await check();
  assert.strictEqual(count("PULIH"), 0, "pulih butuh 3 kali sehat berturut");
  await check();
  assert.strictEqual(count("PULIH"), 2, "harus kirim kabar pulih");
  assert.ok(fs.existsSync(stateFile), "state disimpan ke disk");

  status = healthy({ last_5m: { requests: 5, s5xx: 0, s429: 0, s402: 1 } });
  await check();
  assert.strictEqual(count("KUOTA"), 2, "402 harus alert kuota");
  await check();
  assert.strictEqual(count("KUOTA"), 2, "402 berulang kena cooldown");

  status = healthy({ last_5m: { requests: 9, s5xx: 4, s429: 0, s402: 0 } });
  global.fetch = async (url) => {
    if (String(url).includes("/admin/errors")) {
      return { ok: true, json: async () => ({ errors: [{ ts: "2026-11-16T11:00:00.000Z", client: "hp", status: 502 }] }) };
    }
    return { ok: true, json: async () => status };
  };
  await check();
  assert.strictEqual(count("UPSTREAM BERMASALAH"), 2, "5xx > 3 harus alert upstream");

  try { fs.rmSync(stateFile, { force: true }); } catch {}
  console.log("ok   4 jenis alert, cooldown, dan kabar pulih");
  console.log("ALL PASS");
})().catch((err) => {
  console.error("FAIL", err.message);
  process.exit(1);
});
