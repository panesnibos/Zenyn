// Batch jaringan ringan: SSRF guard, .expand, .tw.
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

const { assertPublic, isPrivateHost } = require("../lib/safeurl");
const sent = [];
const reply = async (_c, _m, text) => { sent.push(text); return { key: { id: "s" } }; };
const deps = {
  "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {} },
  "../../lib/prefix": { getPrefix: () => "." },
  "../../lib/featureutil": { reply, guarded: (_n, fn) => fn }
};
const load = (file, extra = {}) => loadMocked(`commands/tools/${file}`, { ...deps, ...extra });
const client = { sendMessage: async (_jid, payload) => { sent.push(payload.caption || payload.text || "[media]"); return { key: { id: "s" } }; } };
const message = (text = ".cmd") => ({ key: { id: "m1", remoteJid: "628100000001@s.whatsapp.net" }, pushName: "Uji", message: { conversation: text } });

test("safeurl: blokir loopback, jaringan privat, dan skema aneh", () => {
  for (const bad of [
    "http://127.0.0.1:8081/admin/status",
    "http://localhost:3000/",
    "http://10.1.2.3/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://100.64.0.1/",
    "ftp://example.com/",
    "bukan url"
  ]) {
    assert.throws(() => assertPublic(bad), /diblokir|valid|http/, bad);
  }
  assert.equal(assertPublic("https://example.com/a").hostname, "example.com");
  assert.ok(isPrivateHost("127.0.0.1"));
  assert.ok(!isPrivateHost("example.com"));
});

test("expand: mengikuti redirect dan menampilkan URL final", async () => {
  const cmd = load("expand.js");
  const fetchImpl = async (url) => {
    if (url.includes("bit.ly")) return { status: 301, headers: { get: () => "https://example.com/final" }, body: { destroy() {} } };
    return { status: 200, headers: { get: () => null }, body: { destroy() {} } };
  };
  const out = await cmd._internal.follow("https://bit.ly/abc", { fetchImpl });
  assert.equal(out.final, "https://example.com/final");
  assert.equal(out.hops.length, 1);
  assert.equal(out.status, 200);

  sent.length = 0;
  await cmd.execute(client, message(), [], {}, "expand");
  assert.equal(await cmd.execute(client, message(), [], {}, "expand"), false);
  assert.match(sent.at(-1), /Format/);
});

test("expand: redirect ke jaringan lokal ditolak", async () => {
  const cmd = load("expand.js");
  const fetchImpl = async () => ({ status: 302, headers: { get: () => "http://127.0.0.1:8081/admin/status" }, body: { destroy() {} } });
  await assert.rejects(() => cmd._internal.follow("https://bit.ly/abc", { fetchImpl }), /diblokir/);
});

test("expand: redirect berlebihan ditolak", async () => {
  const cmd = load("expand.js");
  const fetchImpl = async (url) => ({ status: 302, headers: { get: () => `${url}x` }, body: { destroy() {} } });
  await assert.rejects(() => cmd._internal.follow("https://example.com/a", { fetchImpl }), /Terlalu banyak redirect/);
});

test("tw: parser ID dan pemilihan media terbaik", () => {
  const cmd = load("tw.js");
  const { parseId, bestMedia } = cmd._internal;
  assert.equal(parseId("https://x.com/user/status/1234567890"), "1234567890");
  assert.equal(parseId("https://twitter.com/a/status/42?s=20"), "42");
  assert.equal(parseId("https://x.com/i/web/status/777"), "777");
  assert.equal(parseId("999999"), "999999");
  assert.equal(parseId("https://youtu.be/x"), null);

  const video = bestMedia({ media: { videos: [{ url: "low.mp4", bitrate: 100 }, { url: "high.mp4", bitrate: 900 }] } });
  assert.deepEqual(video, { type: "video", url: "high.mp4" });
  assert.deepEqual(bestMedia({ media: { photos: [{ url: "a.jpg" }] } }), { type: "image", url: "a.jpg" });
  assert.equal(bestMedia({}), null);
});

test("tw: kirim video dari API fxtwitter + cache 5 menit", async () => {
  let apiCalls = 0;
  const fetchImpl = async (url) => {
    if (url.includes("api.fxtwitter.com")) {
      apiCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          tweet: {
            text: "halo dunia",
            author: { screen_name: "jack" },
            media: { videos: [{ url: "https://video.twimg.com/a.mp4", bitrate: 800 }] }
          }
        })
      };
    }
    return { ok: true, status: 200, headers: { get: () => "10" }, buffer: async () => Buffer.from("vid") };
  };
  const cmd = load("tw.js", { "node-fetch": fetchImpl });
  // _internal.lookup memakai fetchImpl bawaan modul hanya jika diinjeksi lewat argumen
  const tweet = await cmd._internal.lookup("20", { fetchImpl });
  assert.equal(tweet.text, "halo dunia");
  await cmd._internal.lookup("20", { fetchImpl });
  assert.equal(apiCalls, 1, "panggilan kedua dilayani cache");
  assert.deepEqual(cmd._internal.bestMedia(tweet), { type: "video", url: "https://video.twimg.com/a.mp4" });
});
