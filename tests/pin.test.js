// `pin`/`pinterest`: parser link, ekstraksi media berlapis, cap ukuran,
// dan alur command (kirim video/gambar). Semua fetch dipalsukan.
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

const pin = require("../lib/pinterest");
const { usesLimit } = require("../lib/rpglimit");

test("pin: link Pinterest yang didukung", () => {
  const cases = [
    ["https://pin.it/AbC123", "https://pin.it/AbC123"],
    ["cek ini pin.it/AbC123 ya", "https://pin.it/AbC123"],
    ["https://www.pinterest.com/pin/1234567890/", "https://www.pinterest.com/pin/1234567890/"],
    ["pinterest.com/pin/987654321", "https://www.pinterest.com/pin/987654321/"],
    ["https://id.pinterest.com/pin/555/", "https://www.pinterest.com/pin/555/"],
    ["https://pinterest.co.uk/pin/42", "https://www.pinterest.com/pin/42/"]
  ];
  for (const [input, expected] of cases) {
    assert.equal(pin.parseUrl(input)?.url, expected, input);
  }
  assert.equal(pin.parseUrl("https://www.pinterest.com/pin/123/")?.id, "123");
  assert.equal(pin.parseUrl("https://pin.it/AbC123")?.short, true);
});

test("pin: link selain Pinterest ditolak", () => {
  for (const bad of ["", "halo", "https://instagram.com/p/x", "https://youtu.be/abc", "pin.it/"]) {
    assert.equal(pin.parseUrl(bad), null, bad);
  }
});

test("pin: video didahulukan daripada thumbnail gambar", () => {
  const html = `<html><head>
    <meta property="og:image" content="https://i.pinimg.com/736x/aa/bb/cc.jpg">
    <meta property="og:video" content="https://v1.pinimg.com/videos/mc/720p/aa.mp4">
  </head></html>`;
  assert.deepEqual(pin.mediaOf(html), { type: "video", url: "https://v1.pinimg.com/videos/mc/720p/aa.mp4" });
});

test("pin: gambar dinaikkan ke originals, URL escape di-unescape", () => {
  const html = `<meta property="og:image" content="https://i.pinimg.com/736x/11/22/33\\u0026x=1.jpg">`;
  const media = pin.mediaOf(html);
  assert.equal(media.type, "image");
  assert.equal(media.url, "https://i.pinimg.com/originals/11/22/33&x=1.jpg");
});

test("pin: cadangan __PWS_DATA__ (video_url & orig)", () => {
  const videoHtml = `<script>{"video_url":"https:\\/\\/v1.pinimg.com\\/videos\\/mc\\/aa.mp4"}</script>`;
  assert.deepEqual(pin.mediaOf(videoHtml), { type: "video", url: "https://v1.pinimg.com/videos/mc/aa.mp4" });

  const imageHtml = `<script>{"orig":{"url":"https:\\/\\/i.pinimg.com\\/736x\\/ff\\/ee.jpg"}}</script>`;
  assert.deepEqual(pin.mediaOf(imageHtml), { type: "image", url: "https://i.pinimg.com/originals/ff/ee.jpg" });

  assert.equal(pin.mediaOf("<html>kosong</html>"), null);
});

test("pin: fetchPin menolak HTTP error dan pin tanpa media", async () => {
  const htmlFetch = (body, status = 200) => async () => ({
    ok: status === 200,
    status,
    text: async () => body
  });

  const media = await pin.fetchPin("https://pin.it/x", {
    fetchImpl: htmlFetch(`<meta property="og:image" content="https://i.pinimg.com/736x/a.jpg">`)
  });
  assert.equal(media.type, "image");

  await assert.rejects(() => pin.fetchPin("https://pin.it/x", { fetchImpl: htmlFetch("", 404) }), /404/);
  await assert.rejects(() => pin.fetchPin("https://pin.it/x", { fetchImpl: htmlFetch("<html></html>") }), /tidak ditemukan/);
});

test("pin: download menjaga batas ukuran dan tipe media", async () => {
  const ok = (size = 10) => async () => ({
    ok: true,
    status: 200,
    headers: { get: () => String(size) },
    buffer: async () => Buffer.alloc(10, 1)
  });

  const img = await pin.download({ type: "image", url: "https://i.pinimg.com/x.jpg" }, { fetchImpl: ok() });
  assert.equal(img.type, "image");
  assert.equal(img.mimetype, "image/jpeg");
  assert.ok(img.buffer.length > 0);

  const vid = await pin.download({ type: "video", url: "https://v1.pinimg.com/x.mp4" }, { fetchImpl: ok() });
  assert.equal(vid.mimetype, "video/mp4");

  await assert.rejects(
    () => pin.download({ type: "image", url: "x" }, { fetchImpl: ok(pin.MAX_IMAGE + 1) }),
    /terlalu besar/
  );
  await assert.rejects(
    () => pin.download({ type: "video", url: "x" }, { fetchImpl: ok(pin.MAX_VIDEO + 1) }),
    /terlalu besar/
  );
});

test("pin command: metadata tools, limit 1, alias pin/pinterest", () => {
  const cmd = require("../commands/tools/pin");
  assert.equal(cmd.category, "tools");
  assert.equal(cmd.limit, 1);
  assert.equal(cmd.visible, true);
  assert.deepEqual(cmd.command, ["pin", "pinterest"]);
  assert.equal(usesLimit(cmd), true);
});

test("pin command: kirim gambar, tolak non-Pinterest, tanpa link kasih format", async () => {
  const sent = [];
  const client = { sendMessage: async (jid, payload, options) => { sent.push({ jid, payload, options }); } };
  const message = { key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji", message: { conversation: ".pin" } };

  const cmd = loadMocked("commands/tools/pin.js", {
    "../../lib/featureutil": { ...require("../lib/featureutil"), cooldown() {} },
    "../../lib/pinterest": {
      parseUrl: pin.parseUrl,
      fetchPin: async () => ({ type: "image", url: "https://i.pinimg.com/originals/a.jpg" }),
      download: async () => ({ type: "image", buffer: Buffer.from("img"), mimetype: "image/jpeg" })
    }
  });

  await cmd.execute(client, message, []);
  assert.match(sent.at(-1).payload.text, /PINTEREST/);

  await cmd.execute(client, message, ["https://youtu.be/abc"]);
  assert.match(sent.at(-1).payload.text, /bukan link Pinterest/);

  await cmd.execute(client, message, ["https://pin.it/AbC123"]);
  const last = sent.at(-1).payload;
  assert.equal(last.image.toString(), "img");
  assert.match(last.caption, /Pinterest gambar/);
  assert.equal(sent.at(-1).options.quoted, message);
});
