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

const agent = () => loadMocked("lib/agent/devagent.js", { "./llm": { chat: async () => '{"done":true,"summary":"tes"}' } });
const { safePath, checkRun, parseAction, TOOLS } = agent()._internal;

test("safePath: path di luar repo ditolak", () => {
  assert.throws(() => safePath("../../etc/passwd"), /\.\.|luar repo/);
  assert.throws(() => safePath("/etc/passwd"), /luar repo|ditolak/);
  assert.throws(() => safePath("lib/../../x.js"), /\.\./);
});

test("safePath: file rahasia & data diblokir", () => {
  assert.throws(() => safePath(".env"), /diblokir/);
  assert.throws(() => safePath("database/autopay.json"), /diblokir/);
  assert.throws(() => safePath("session/creds.json"), /diblokir/);
  assert.equal(safePath("lib/agent/llm.js").rel, "lib/agent/llm.js");
});

test("checkRun: whitelist command", () => {
  assert.throws(() => checkRun(["rm", "-rf", "/"]), /tidak diizinkan/);
  assert.throws(() => checkRun(["git", "push", "origin", "main"]), /tidak diizinkan/);
  assert.throws(() => checkRun(["node", "--check", "lib/x.js; rm -rf /"]), /operator shell/);
  assert.doesNotThrow(() => checkRun(["node", "--check", "lib/agent/llm.js"]));
  assert.doesNotThrow(() => checkRun(["git", "status"]));
});

test("parseAction: JSON valid, fenced, dan sampah", () => {
  assert.equal(parseAction('{"done":true,"summary":"ok"}').done, true);
  assert.equal(parseAction('```json\n{"tool":"read_file","args":{"path":"index.js"}}\n```').tool, "read_file");
  assert.equal(parseAction("maaf saya tidak bisa"), null);
  assert.equal(parseAction('{"rusak": '), null);
});

test("write_file: file repo lolos, .env ditolak", () => {
  const probe = path.join(root, "tests", "tmp-agent-probe.js");
  const out = TOOLS.write_file({ path: "tests/tmp-agent-probe.js", content: "module.exports = 1;\n" });
  assert.match(out, /ditulis/);
  assert.ok(fs.existsSync(probe));
  fs.unlinkSync(probe);

  assert.throws(() => TOOLS.write_file({ path: ".env", content: "AGENT_API_KEY=x" }), /diblokir/);
});
