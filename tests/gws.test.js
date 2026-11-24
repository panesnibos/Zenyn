// .gws — info gateway LLM untuk umum.
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

const real = require("../lib/gwapi");

test("gwapi: prefix model dibuang dan token digabung", () => {
  const rows = [
    { model: "prem/deepseek-v4.1-flash-1017", tokens: 900, requests: 9, errors: 1, upstreams: { freeai: 900 } },
    { model: "deepseek-v4.1-flash-1017", tokens: 100, requests: 2, errors: 0, upstreams: { darusgw: 100 } },
    { model: "darus/gpt-6-luna", tokens: 50, requests: 1, errors: 0, upstreams: { darusgw: 50 } }
  ];
  const merged = real.mergeModels(rows);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].model, "deepseek-v4.1-flash-1017");
  assert.equal(merged[0].tokens, 1000);
  assert.equal(merged[0].requests, 11);
  assert.equal(merged[0].upstreams.freeai, 900);
  assert.equal(merged[0].upstreams.darusgw, 100);
  assert.equal(merged[1].model, "gpt-6-luna");
});

test("gwapi: pemendekan token", () => {
  assert.equal(real.short(999), "999");
  assert.equal(real.short(1500), "1,5K");
  assert.equal(real.short(2_500_000), "2,5M");
  assert.equal(real.short(1_200_000_000), "1,2B");
});

const fixture = () => {
  const sent = [];
  const client = {
    sendMessage: async (_jid, payload) => {
      sent.push(payload.text);
      return { key: { id: "s" } };
    }
  };
  const api = {
    ...real,
    status: async () => ({ ok: true, uptime_s: 3600, models: 80, clients: 10, today: { requests: 5, tokens: 1234, errors: 1 } }),
    modelsAll: async () => ({
      models: [
        { model: "prem/deepseek-v4.1-flash", tokens: 900, requests: 9, errors: 1, upstreams: { freeai: 900 } },
        { model: "deepseek-v4.1-flash", tokens: 100, requests: 2, errors: 0, upstreams: { darusgw: 100 } },
        { model: "gpt-6-luna", tokens: 50, requests: 1, errors: 0, upstreams: { darusgw: 50 } }
      ]
    }),
    usageSinceMidnight: async () => ({
      totals: { requests: 3, prompt_tokens: 100, completion_tokens: 20, errors: 1 },
      clients: [{ client: "nesk", requests: 2, prompt_tokens: 80, completion_tokens: 10, errors: 1 }]
    }),
    errors: async () => ({ errors: [{ ts: "2026-11-23T11:54:04.785Z", client: "nesk", status: 502, attempts: 2 }] }),
    publicUrl: () => "https://llm-gw.tailb717d3.ts.net/v1"
  };
  const cmd = loadMocked("commands/gateway/gws.js", {
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/featureutil": { guarded: (_n, fn) => fn },
    "../../lib/gwapi": api
  });
  return { cmd, client, sent };
};

const msg = () => ({ key: { remoteJid: "c@s.whatsapp.net" }, message: {} });

test("gws: tanpa argumen tampil panduan, limit tidak dipotong", async () => {
  const { cmd, client, sent } = fixture();
  const res = await cmd.execute(client, msg(), [], {}, "gws");
  assert.equal(res, false);
  assert.match(sent.at(-1), /GATEWAY LLM/);
  assert.match(sent.at(-1), /gws model/);
  assert.equal(cmd.limit, 1);
  assert.equal(cmd.category, "gateway");
});

test("gws model: nama bersih, urut token, ada upstream", async () => {
  const { cmd, client, sent } = fixture();
  const res = await cmd.execute(client, msg(), ["model"], {}, "gws");
  assert.equal(res, true);
  const text = sent.at(-1);
  assert.match(text, /MODEL GATEWAY/);
  assert.match(text, /\*deepseek-v4\.1-flash\*/);
  assert.doesNotMatch(text, /prem\//, "prefix prem/ harus hilang");
  assert.match(text, /↳ freeai/);
  const first = text.indexOf("deepseek-v4.1-flash");
  const second = text.indexOf("gpt-6-luna");
  assert.ok(first < second, "urut token terbesar dulu");
});

test("gws usage: total + per key, reset 00:00 WIB", async () => {
  const { cmd, client, sent } = fixture();
  await cmd.execute(client, msg(), ["usage"], {}, "gws");
  const text = sent.at(-1);
  assert.match(text, /sejak 00:00 WIB/);
  assert.match(text, /Total\*: 3 req/);
  assert.match(text, /\*nesk\*/);
});

test("gws logs: menampilkan error terakhir", async () => {
  const { cmd, client, sent } = fixture();
  await cmd.execute(client, msg(), ["logs"], {}, "gws");
  assert.match(sent.at(-1), /ERROR LOG GATEWAY/);
  assert.match(sent.at(-1), /501|502/);
});

test("gws api: link publik gateway", async () => {
  const { cmd, client, sent } = fixture();
  await cmd.execute(client, msg(), ["api"], {}, "gws");
  const text = sent.at(-1);
  assert.match(text, /https:\/\/llm-gw\.tailb7173\.ts\.net\/v1|https:\/\/llm-gw\.tailb717d3\.ts\.net\/v1/);
  assert.match(text, /Authorization: Bearer sk-gw-/);
});

test("gws: subcommand tidak dikenal -> panduan, tidak menagih", async () => {
  const { cmd, client, sent } = fixture();
  const res = await cmd.execute(client, msg(), ["xxx"], {}, "gws");
  assert.equal(res, false);
  assert.match(sent.at(-1), /tidak ada/);
});
