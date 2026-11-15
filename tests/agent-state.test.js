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

const agent = () =>
  loadMocked("lib/agent/devagent.js", {
    "./llm": { chat: async () => '{"done":true,"summary":"tes"}', model: () => "m", enabled: () => false, models: () => ["m"] },
    "../env": { loadEnv: () => [] }
  })._internal;

const { readState, saveState, clearState, RESUME_RE, STATE } = agent();

test("state: simpan lalu muat utuh", () => {
  clearState();
  saveState({
    prompt: "buatin fitur x",
    messages: [
      { role: "system", content: "s" },
      { role: "user", content: "u" }
    ],
    changed: ["lib/x.js"],
    steps: 3,
    hash: "abc1234",
    deploy: false,
    startedAt: Date.now()
  });

  const st = readState();
  assert.equal(st.prompt, "buatin fitur x");
  assert.equal(st.steps, 3);
  assert.deepEqual(st.changed, ["lib/x.js"]);
  assert.equal(st.messages.length, 2);
  assert.equal(st.stale, false);
  clearState();
});

test("state: tidak ada file -> null", () => {
  clearState();
  assert.equal(readState(), null);
});

test("state: lebih 24 jam dianggap basi", () => {
  clearState();
  fs.writeFileSync(
    STATE,
    JSON.stringify({ prompt: "p", messages: [], updatedAt: Date.now() - 25 * 60 * 60000 })
  );
  assert.equal(readState().stale, true);
  clearState();
});

test("state: file rusak -> null, clearState menghapus", () => {
  clearState();
  fs.writeFileSync(STATE, "{bukan json");
  assert.equal(readState(), null);
  clearState();
  assert.equal(fs.existsSync(STATE), false);
});

test("resume: kata pemicu saja, bukan perintah baru", () => {
  assert.ok(RESUME_RE.test("lanjutkan"));
  assert.ok(RESUME_RE.test("lanjut"));
  assert.ok(RESUME_RE.test("lanjutkan fitur premium"));
  assert.ok(RESUME_RE.test("continue"));
  assert.equal(RESUME_RE.test("buatin fitur cuaca"), false);
  assert.equal(RESUME_RE.test("fix bcgc"), false);
});
