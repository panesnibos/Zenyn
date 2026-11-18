// Batch scraping: .ss (premium, gate CPU), .fb (parse HTML), .ytsearch (ytInitialData).
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

const quiet = { info() {}, warn() {}, error() {}, cmd() {}, ok() {} };
const sent = [];
const client = { sendMessage: async (_jid, payload) => { sent.push(payload); return { key: { id: "s" } }; } };
const message = () => ({ key: { id: "m1", remoteJid: "628100000001@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".cmd" } });

const baseDeps = (extra = {}) => ({
  "../../lib/logger": quiet,
  "../../lib/prefix": { getPrefix: () => "." },
  "../../lib/featureutil": {
    reply: async (_c, _m, text) => { sent.push({ text }); return { key: { id: "s" } }; },
    interactive: async (_c, _m, text, buttons) => { sent.push({ text, buttons }); return { key: { id: "s" } }; },
    quick: (display_text, id) => ({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text, id }) }),
    guarded: (_n, fn) => fn
  },
  ...extra
});

// ---------- .ss ----------
test("ss: tolak non-premium dan URL lokal, premium dapat screenshot", async () => {
  const shots = [];
  const make = (status) =>
    loadMocked("commands/tools/ss.js", baseDeps({
      "../../lib/rpgdb": { db: { getUser: () => ({ status: { type: status, until: 0 } }) } },
      "../../lib/rpgutil": { getUserId: () => "u1" },
      "../../lib/owner": { isOwner: () => false },
      "../../lib/rpglimit": { statusOf: (u) => u.status.type },
      "../../lib/shot": {
        screenshot: async (url, opts) => { shots.push({ url, opts }); return Buffer.from("png"); }
      }
    }));

  const userCmd = make("User");
  assert.equal(await userCmd.execute(client, message(), ["example.com"], {}, "ss"), false);
  assert.match(sent.at(-1).text, /KHUSUS PREMIUM/);

  const prem = make("Premium");
  await assert.rejects(() => prem.execute(client, message(), ["http://127.0.0.1:8081/x"], {}, "ss"), /diblokir/);

  await prem.execute(client, message(), ["example.com", "800"], {}, "ss");
  assert.equal(shots.length, 1);
  assert.equal(shots[0].url, "https://example.com/");
  assert.equal(shots[0].opts.width, 800);
  assert.equal(sent.at(-1).image.toString(), "png");

  assert.equal(await prem.execute(client, message(), [], {}, "ss"), false);
  assert.match(sent.at(-1).text, /Format/);
});

test("ss: metadata premium + 2 limit", () => {
  const cmd = require("../commands/tools/ss.js");
  assert.equal(cmd.premium, true);
  assert.equal(cmd.limit, 2);
  assert.equal(cmd.category, "tools");
});

// ---------- .fb ----------
test("fb: ekstrak URL video dengan prioritas HD", () => {
  const fb = loadMocked("commands/tools/fb.js", baseDeps());
  const html = `{"sd_src":"https:\\/\\/video.fbcdn.net\\/sd.mp4","hd_src":"https:\\/\\/video.fbcdn.net\\/hd.mp4"}`;
  assert.equal(fb._internal.videoUrl(html), "https://video.fbcdn.net/hd.mp4");
  assert.equal(fb._internal.videoUrl(`"playable_url":"https:\\/\\/x\\/p.mp4"`), "https://x/p.mp4");
  assert.equal(fb._internal.videoUrl("<html></html>"), null);
  assert.ok(fb._internal.isFb("https://fb.watch/abc/"));
  assert.ok(fb._internal.isFb("https://www.facebook.com/watch?v=1"));
  assert.ok(!fb._internal.isFb("https://youtu.be/abc"));

  sent.length = 0;
  fb.execute(client, message(), ["https://youtu.be/abc"], {}, "fb").then((r) => assert.equal(r, false));
});

test("fb: resolveVideo error kalau markup tak memuat video", async () => {
  const fb = loadMocked("commands/tools/fb.js", baseDeps());
  await assert.rejects(
    () => fb._internal.resolveVideo("https://fb.watch/x", { fetchImpl: async () => ({ ok: true, status: 200, text: async () => "<html>login</html>" }) }),
    /tidak ditemukan/
  );
  await assert.rejects(
    () => fb._internal.resolveVideo("https://fb.watch/x", { fetchImpl: async () => ({ ok: false, status: 403, text: async () => "" }) }),
    /403/
  );
});

// ---------- .yts ----------
test("ytsearch: parse ytInitialData -> 5 hasil unik", () => {
  const yts = loadMocked("commands/tools/ytsearch.js", baseDeps());
  const renderer = (id, title, dur, author) =>
    JSON.stringify({
      videoRenderer: {
        videoId: id,
        title: { runs: [{ text: title }] },
        lengthText: { simpleText: dur },
        ownerText: { runs: [{ text: author }] }
      }
    });
  const html =
    `<script>var ytInitialData = {"contents":${JSON.stringify({
      a: 1
    })}}</script>`;
  const real =
    `<script>var ytInitialData = {"contents":{"items":[${renderer("aaaaaaaaaaa", "Lagu A", "3:12", "Chan A")},{"x":${renderer("bbbbbbbbbbb", "Lagu B", "4:01", "Chan B")}},{"dup":${renderer("aaaaaaaaaaa", "Lagu A", "3:12", "Chan A")}}]}};</script>`;
  const items = yts._internal.parseResults(real);
  assert.equal(items.length, 2, "duplikat dibuang");
  assert.deepEqual(items[0], { id: "aaaaaaaaaaa", title: "Lagu A", duration: "3:12", author: "Chan A" });
  assert.deepEqual(yts._internal.parseResults(html), []);
  assert.deepEqual(yts._internal.parseResults("<html></html>"), []);
});

test("ytsearch: command mengirim 5 tombol unduh dan cache bekerja", async () => {
  let calls = 0;
  const yts = loadMocked("commands/tools/ytsearch.js", baseDeps());
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `vid0000000${i}`, title: `Video ${i + 1}`, duration: "1:00", author: "Chan" }));
  await yts._internal.search("lofi", { fetchImpl: async () => { calls++; return { ok: true, status: 200, text: async () => "" }; } });
  yts._internal.cache.set("lofi", { at: Date.now(), items });

  sent.length = 0;
  const result = await yts.execute(client, message(), ["lofi"], {}, "yts");
  const entry = sent.at(-1);
  assert.equal(entry.buttons.length, 5);
  assert.match(entry.text, /Video 1/);
  assert.ok(JSON.parse(entry.buttons[0].buttonParamsJson).id.startsWith("ytmp4 https://youtu.be/"));
  assert.ok(result);
  assert.equal(calls, 1);

  assert.equal(await yts.execute(client, message(), [], {}, "yts"), false);
});
