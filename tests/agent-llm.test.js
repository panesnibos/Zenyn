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

const env = (over = {}) => {
  process.env.AGENT_API_KEY = "sk-test";
  process.env.AGENT_MODELS = "prem/deepseek-v4.1-flash-1017,prem/minimax-m2.7,prem/glm-5.3-flash";
  process.env.AGENT_RETRY_MAX = "50";
  process.env.AGENT_RETRY_DELAY_MS = "200";
  delete process.env.AGENT_MODEL;
  delete process.env.AGENT_MODEL_FALLBACK;
  Object.assign(process.env, over);
};

// fetch palsu: tiap panggilan ambil satu respons dari antrean
const fakeFetch = (queue) => {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(JSON.parse(opts.body).model);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next.ok) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: next.content } }] }) };
    }
    return {
      ok: false,
      status: next.status || 400,
      text: async () => JSON.stringify({ error: { message: next.message } })
    };
  };
  return { fn, calls };
};

const fail = (message, status = 400) => ({ ok: false, status, message });

test("llm: insufficient_funds -> pindah model, sukses di percobaan ke-3", async () => {
  env();
  const { fn, calls } = fakeFetch([
    fail("Billing: insufficient_funds"),
    fail("Billing: insufficient_funds"),
    { ok: true, content: '{"done":true,"summary":"ok"}' }
  ]);
  const llm = loadMocked("lib/agent/llm.js", { "node-fetch": fn });

  const out = await llm.chat([{ role: "user", content: "x" }]);
  assert.match(out, /done/);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls, ["prem/deepseek-v4.1-flash-1017", "prem/minimax-m2.7", "prem/glm-5.3-flash"]);
});

test("llm: key ditolak (401) -> berhenti, tidak retry", async () => {
  env();
  const { fn, calls } = fakeFetch([fail("invalid api key", 401)]);
  const llm = loadMocked("lib/agent/llm.js", { "node-fetch": fn });

  await assert.rejects(() => llm.chat([{ role: "user", content: "x" }]), /invalid api key/);
  assert.equal(calls.length, 1);
});

test("llm: retry mentok di batas percobaan", async () => {
  env({ AGENT_RETRY_MAX: "3" });
  const { fn, calls } = fakeFetch([fail("Billing: insufficient_funds")]);
  const llm = loadMocked("lib/agent/llm.js", { "node-fetch": fn });

  await assert.rejects(() => llm.chat([{ role: "user", content: "x" }]), /3 percobaan/);
  assert.equal(calls.length, 3);
});

test("llm: deadline lewat -> berhenti walau percobaan belum habis", async () => {
  env({ AGENT_RETRY_MAX: "50" });
  const { fn, calls } = fakeFetch([fail("Billing: insufficient_funds")]);
  const llm = loadMocked("lib/agent/llm.js", { "node-fetch": fn });

  await assert.rejects(
    () => llm.chat([{ role: "user", content: "x" }], { deadline: Date.now() + 50 }),
    /batas waktu habis/
  );
  assert.ok(calls.length >= 1);
});
