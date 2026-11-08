const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { Readable } = require("node:stream");
const sharp = require("sharp");
const util = require("../lib/featureutil");
const { setPrefix } = require("../lib/prefix");

const root = path.resolve(__dirname, "..");
const loadMocked = (relative, mocks = {}) => {
  const file = path.join(root, relative);
  const nativeRequire = createRequire(file);
  const mod = { exports: {} };
  const compiled = vm.runInThisContext(`(function(require,module,exports,__dirname,__filename){\n${fs.readFileSync(file, "utf8")}\n})`, { filename: file });
  compiled((name) => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name), mod, mod.exports, path.dirname(file), file);
  return mod.exports;
};

let messageId = 0;
const message = (uid = "628100000001", chat = "120363000000@g.us", contextInfo) => ({
  key: { id: `mock-${++messageId}`, remoteJid: chat, participant: `${uid}@s.whatsapp.net` },
  canonicalUserId: uid, pushName: "Pemain Uji",
  message: contextInfo ? { extendedTextMessage: { text: "command", contextInfo } } : { conversation: "command" }
});
const participants = [
  { id: "628100000001@s.whatsapp.net", admin: null },
  { id: "628100000002@s.whatsapp.net", admin: null },
  { id: "628100000003@s.whatsapp.net", admin: null },
  { id: "628100000004@s.whatsapp.net", admin: "admin" },
  { id: "628100000099@s.whatsapp.net", admin: null }
];
const mockClient = () => {
  const sent = [];
  const client = {
    sent, user: { id: "628100000099:0@s.whatsapp.net", lid: "999999@lid" },
    async sendMessage(jid, payload, options) { sent.push({ jid, payload, options }); return { key: { id: "sent" } }; },
    async sendInteractiveMessage(jid, payload, options) {
      if (options.quoted) assert.ok(options.quoted.message, "Do not quote synthetic DM messages");
      sent.push({ jid, payload, options });
    },
    async groupMetadata() { return { subject: "Grup Uji", participants }; }
  };
  return client;
};
const buttonIds = (entry) => entry.payload.interactiveButtons.flatMap((button) => {
  const data = JSON.parse(button.buttonParamsJson);
  return button.name === "single_select" ? data.sections.flatMap((s) => s.rows.map((r) => r.id)) : [data.id];
});
const invoke = (command, client, msg, id) => {
  const [name, ...args] = id.split(" ");
  return command.execute(client, msg, args, {}, name);
};
const plainUtil = { ...util, cooldown() {} };
const command = (file, mocks = {}) => loadMocked(file, { "../../lib/featureutil": plainUtil, ...mocks });

test("bank: valid quiz options and nonempty content", () => {
  const bank = require("../lib/funbank").load();
  assert.equal(bank.tebak.length, 20);
  for (const quiz of bank.tebak) assert.ok(quiz.options[quiz.answer]);
  for (const key of ["truth", "dare", "roast", "gombalan", "pantun", "zodiak"]) assert.ok(bank[key].length >= 8);
});

test("new commands: 10 fun / 5 tools, public menu and no RPG rewards", () => {
  for (const [category, names] of [
    ["fun", ["tebak", "suit", "truthdare", "roast", "gombalan", "jodoh", "zodiak", "rate", "pantun", "undian"]],
    ["tools", ["qr", "tovn", "smeme", "cuaca", "translate"]]
  ]) {
    for (const name of names) {
      const relative = `commands/${category}/${name}.js`;
      const cmd = require(path.join(root, relative));
      assert.equal(cmd.category, category); assert.equal(cmd.visible, true);
      assert.ok(cmd.command.includes(name)); assert.equal(typeof cmd.execute, "function");
      assert.doesNotMatch(fs.readFileSync(path.join(root, relative), "utf8"), /db\.(?:add|set)(?:Exp|Money|Gold|Level|Limit)\b/);
    }
  }
  assert.notEqual(require("../commands/fun/suit").group, true, "DM choices must pass the command dispatcher");
});

test("timedStore: TTL, bounded size, deletion; cooldown blocks duplicate calls", async () => {
  const store = util.timedStore(2);
  store.set("a", { a: 1 }, 1000); store.set("b", { b: 2 }, 1000); store.set("c", { c: 3 }, 1000);
  assert.equal(store.get("a"), null); assert.equal(store.values().length, 2);
  store.delete("b"); assert.equal(store.get("b"), null);
  store.set("expiring", true, 5);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(store.get("expiring"), null); store.clear();
  const msg = message("628199999999");
  util.cooldown(msg, "test", 10);
  assert.throws(() => util.cooldown(msg, "test", 10), /Tunggu/);
});

test("interactive fallback: uses current prefix, not broken buttons", async () => {
  const client = mockClient();
  client.sendInteractiveMessage = async () => { throw new Error("unsupported"); };
  const msg = message("628100000001", "fallback@g.us"); setPrefix(msg, "#");
  await util.interactive(client, msg, "Pilih", [util.select("Jawab", [{ title: "A", id: "tebak answer token 0" }]), util.quick("Ulang", "tebak")]);
  assert.match(client.sent[0].payload.text, /#tebak answer token 0/);
  assert.match(client.sent[0].payload.text, /Ulang: #tebak/);
});

test("tebak: player/chat ownership, valid answer, replay protection and stop", async () => {
  const cmd = command("commands/fun/tebak.js", { "../../lib/funbank": { load: () => ({ tebak: [{ question: "Uji", options: ["A", "B", "C", "D"], answer: 1 }] }) } });
  const client = mockClient(), a = message(), b = message("628100000002");
  await cmd.execute(client, a, []);
  const ids = buttonIds(client.sent.at(-1));
  await invoke(cmd, client, b, ids[1]); assert.match(client.sent.at(-1).payload.text, /bukan milikmu/);
  await invoke(cmd, client, message("628100000001", "other@g.us"), ids[1]); assert.match(client.sent.at(-1).payload.text, /bukan milikmu/);
  await invoke(cmd, client, a, ids[1]); assert.match(client.sent.at(-1).payload.text, /Benar! Skor sesi: 1\/1/);
  await invoke(cmd, client, a, ids[1]); assert.match(client.sent.at(-1).payload.text, /sudah selesai/);
  await cmd.execute(client, a, []); await cmd.execute(client, a, ["stop"]);
  assert.match(client.sent.at(-1).payload.text, /dihentikan/);
});

test("tebak: expired buttons cannot answer", async () => {
  let expire;
  const fakeStore = () => {
    const map = new Map(); expire = () => map.clear();
    return { get: (k) => map.get(k), set: (k, v) => { map.set(k, v); return v; }, delete: (k) => map.delete(k) };
  };
  const cmd = command("commands/fun/tebak.js", { "../../lib/featureutil": { ...plainUtil, timedStore: fakeStore } });
  const client = mockClient(), msg = message();
  await cmd.execute(client, msg, []); const id = buttonIds(client.sent.at(-1))[0]; expire();
  await invoke(cmd, client, msg, id); assert.match(client.sent.at(-1).payload.text, /kedaluwarsa/);
});

const suitCommand = () => command("commands/fun/suit.js", {
  "../../lib/lid": { resolvePn: async (_, jid) => String(jid).split("@")[0] }
});
test("suit: challenge authorization, secret DM choices, double-pick/replay protection, winner", async () => {
  const cmd = suitCommand(), client = mockClient();
  const a = message(), b = message("628100000002"), other = message("628100000003");
  const challenge = message("628100000001", a.key.remoteJid, { mentionedJid: [participants[1].id] });
  await cmd.execute(client, challenge, []);
  const accept = buttonIds(client.sent.at(-1))[0];
  await invoke(cmd, client, other, accept); assert.match(client.sent.at(-1).payload.text, /bukan untukmu/);
  await invoke(cmd, client, a, accept); assert.match(client.sent.at(-1).payload.text, /Hanya pemain/);
  await invoke(cmd, client, b, accept);
  const dmA = client.sent.find((entry) => entry.jid === participants[0].id && entry.payload.interactiveButtons);
  const dmB = client.sent.find((entry) => entry.jid === participants[1].id && entry.payload.interactiveButtons);
  assert.ok(dmA && dmB); assert.equal(dmA.options.quoted, undefined);
  const batu = buttonIds(dmA)[0], gunting = buttonIds(dmB)[1];
  await invoke(cmd, client, a, batu); assert.match(client.sent.at(-1).payload.text, /chat pribadi/);
  const aDM = message("628100000001", participants[0].id), bDM = message("628100000002", participants[1].id);
  await invoke(cmd, client, aDM, batu); assert.match(client.sent.at(-1).payload.text, /Menunggu/);
  await invoke(cmd, client, aDM, buttonIds(dmA)[2]); assert.match(client.sent.at(-1).payload.text, /sudah memilih/);
  await invoke(cmd, client, bDM, gunting);
  const result = client.sent.findLast((entry) => entry.payload.text?.includes("HASIL SUIT"));
  assert.equal(result.jid, a.key.remoteJid); assert.match(result.payload.text, /Pemenang: @628100000001/);
  await invoke(cmd, client, bDM, gunting); assert.match(client.sent.at(-1).payload.text, /kedaluwarsa/);
});

test("suit: rejects self/bot/nonmember, DM failure cancels game, reject works", async () => {
  const cmd = suitCommand(), client = mockClient();
  for (const target of [participants[0].id, participants[4].id, "888@s.whatsapp.net"]) {
    await cmd.execute(client, message("628100000001", "restrictions@g.us", { mentionedJid: [target] }), []);
    assert.match(client.sent.at(-1).payload.text, /❌/);
  }
  const challenge = message("628100000001", "cancel@g.us", { mentionedJid: [participants[1].id] });
  await cmd.execute(client, challenge, []);
  const accept = buttonIds(client.sent.at(-1))[0];
  const originalSend = client.sendMessage, originalInteractive = client.sendInteractiveMessage;
  client.sendMessage = async (jid, ...rest) => { if (!jid.endsWith("@g.us")) throw new Error("DM unavailable"); return originalSend(jid, ...rest); };
  client.sendInteractiveMessage = async (jid, ...rest) => { if (!jid.endsWith("@g.us")) throw new Error("DM unavailable"); return originalInteractive(jid, ...rest); };
  await invoke(cmd, client, message("628100000002", "cancel@g.us"), accept);
  assert.match(client.sent.at(-1).payload.text, /Gagal mengirim pilihan pribadi/);
  client.sendMessage = originalSend; client.sendInteractiveMessage = originalInteractive;
  await invoke(cmd, client, message("628100000002", "cancel@g.us"), accept); assert.match(client.sent.at(-1).payload.text, /kedaluwarsa/);
  await cmd.execute(client, challenge, []);
  const reject = buttonIds(client.sent.at(-1))[1];
  await invoke(cmd, client, message("628100000002", "cancel@g.us"), reject); assert.match(client.sent.at(-1).payload.text, /ditolak/);
});

test("truth/dare aliases and roast mention target", async () => {
  const client = mockClient(), msg = message(undefined, undefined, { mentionedJid: [participants[1].id] });
  const tod = command("commands/fun/truthdare.js");
  await tod.execute(client, msg, [], {}, "truthdare"); assert.equal(buttonIds(client.sent.at(-1)).length, 2);
  await tod.execute(client, msg, [], {}, "truth"); assert.match(client.sent.at(-1).payload.text, /TRUTH/);
  await tod.execute(client, msg, [], {}, "dare"); assert.match(client.sent.at(-1).payload.text, /DARE/);
  const roast = command("commands/fun/roast.js"); await roast.execute(client, msg, []);
  assert.ok(client.sent.at(-1).payload.mentions.includes(participants[1].id));
  assert.doesNotMatch(client.sent.at(-1).payload.text, /\{target\}/);
});

test("cards: gombalan/pantun render, jodoh symmetric, rating daily stable", async () => {
  const client = mockClient(), msg = message();
  for (const name of ["gombalan", "pantun"]) {
    const cmd = command(`commands/fun/${name}.js`); await cmd.execute(client, msg, []);
    assert.equal((await sharp(client.sent.at(-1).payload.image).metadata()).width, 800);
  }
  const jodoh = command("commands/fun/jodoh.js");
  await jodoh.execute(client, msg, ["Ana", "|", "Budi"]); const first = client.sent.at(-1).payload.caption.match(/Skor hiburan: (\d+)%/)[1];
  await jodoh.execute(client, msg, ["budi", "|", "ANA"]); assert.equal(client.sent.at(-1).payload.caption.match(/Skor hiburan: (\d+)%/)[1], first);
  await jodoh.execute(client, msg, ["single"]); assert.match(client.sent.at(-1).payload.text, /Format/);
  const rate = command("commands/fun/rate.js");
  await rate.execute(client, msg, ["rajin"]); const caption = client.sent.at(-1).payload.caption;
  await rate.execute(client, msg, ["rajin"]); assert.equal(client.sent.at(-1).payload.caption, caption);
});

test("pantun AI: premium gate, configured check, AI success/failure; no rewards", async () => {
  const client = mockClient(), msg = message("628100000003");
  let status = "User", configured = true, failed = false, calls = 0;
  const cmd = command("commands/fun/pantun.js", {
    "../../lib/rpgdb": { db: { getUser: () => ({ status: { type: status, until: 0 } }) } },
    "../../lib/ai": { isConfigured: () => configured, ask: async () => { calls++; if (failed) throw new Error("AI unavailable"); return "Baris satu\nBaris dua\nBaris tiga\nBaris empat"; } }
  });
  await cmd.execute(client, msg, ["ai", "teman"]); assert.match(client.sent.at(-1).payload.text, /khusus premium/); assert.equal(calls, 0);
  status = "Premium"; configured = false;
  await cmd.execute(client, msg, ["ai", "teman"]); assert.match(client.sent.at(-1).payload.text, /belum dikonfigurasi/);
  configured = true; await cmd.execute(client, msg, ["ai", "teman"]); assert.ok(client.sent.at(-1).payload.image); assert.equal(calls, 1);
  failed = true; assert.equal(await cmd.execute(client, msg, ["ai", "teman"]), false); assert.match(client.sent.at(-1).payload.text, /AI unavailable/);
});

test("zodiak: calendar boundaries, invalid dates, stable daily text", async () => {
  const cmd = command("commands/fun/zodiak.js"), client = mockClient(), msg = message();
  for (const [date, name] of [["19-01", "CAPRICORN"], ["20-01", "AQUARIUS"], ["29-02", "PISCES"], ["21-03", "ARIES"], ["22-12", "CAPRICORN"]]) {
    await cmd.execute(client, msg, [date]); assert.match(client.sent.at(-1).payload.text, new RegExp(name));
  }
  for (const date of ["31-02", "00-01", "15-13"]) { await cmd.execute(client, msg, [date]); assert.match(client.sent.at(-1).payload.text, /tidak valid/); }
  await cmd.execute(client, msg, ["21-03"]); const text = client.sent.at(-1).payload.text;
  await cmd.execute(client, msg, ["21-03"]); assert.equal(client.sent.at(-1).payload.text, text);
});

test("undian: exclude bot/admin, reroll bound to owner and group", async () => {
  const cmd = command("commands/fun/undian.js"), client = mockClient(), msg = message();
  await cmd.execute(client, msg, []);
  const entry = client.sent.at(-1), id = buttonIds(entry)[0];
  assert.match(entry.payload.text, /Peserta: 3/); assert.ok(participants.slice(0, 3).some((p) => entry.payload.mentions.includes(p.id)));
  await invoke(cmd, client, message("628100000002"), id); assert.match(client.sent.at(-1).payload.text, /bukan milikmu/);
  await invoke(cmd, client, message("628100000001", "other@g.us"), id); assert.match(client.sent.at(-1).payload.text, /bukan milikmu/);
  await invoke(cmd, client, msg, id); assert.ok(client.sent.at(-1).payload.interactiveButtons);
});

test("QR: actual PNG, reply text, valid color, reject too large/pale/bad color", async () => {
  const cmd = command("commands/tools/qr.js"), client = mockClient(), msg = message();
  await cmd.execute(client, msg, ["--warna=334499", "https://example.org"]);
  assert.equal((await sharp(client.sent.at(-1).payload.image).metadata()).width, 768);
  await cmd.execute(client, message(undefined, undefined, { quotedMessage: { conversation: "Hello" } }), []); assert.ok(client.sent.at(-1).payload.image);
  for (const args of [["--warna=ffffff", "x"], ["--warna=invalid", "x"], ["x".repeat(1201)]]) {
    assert.equal(await cmd.execute(client, msg, args), false); assert.match(client.sent.at(-1).payload.text, /❌/);
  }
});

test("media: bounded download, quoted media, view-once stays private, timeout", async () => {
  const media = loadMocked("lib/mediautil.js", { "@whiskeysockets/baileys": {
    downloadContentFromMessage: async (node) => node.never ? new Promise(() => {}) : Readable.from(node.chunks || [Buffer.from("content")])
  } });
  const found = media.findMedia(message(undefined, undefined, { quotedMessage: { imageMessage: { fileLength: 7 } } }), ["image"]);
  assert.equal(found.kind, "image"); assert.equal((await media.download(found)).toString(), "content");
  await assert.rejects(() => media.download({ kind: "image", node: { fileLength: 500 } }, { maxBytes: 100 }), /maksimal/);
  await assert.rejects(() => media.download({ kind: "image", node: { chunks: [Buffer.alloc(200)] } }, { maxBytes: 100 }), /maksimal/);
  const privateMsg = message(); privateMsg.message = { viewOnceMessageV2: { message: { imageMessage: {} } } };
  assert.equal(media.findMedia(privateMsg, ["image"]), null);
  // Keep the process alive while exercising the deliberately unref'ed deadline.
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(() => media.download({ kind: "image", node: { never: true } }, { timeout: 10 }), /timeout/); }
  finally { clearTimeout(keepAlive); }
});

test("smeme: real sticker render with EXIF and invalid input", async () => {
  const image = await sharp({ create: { width: 200, height: 300, channels: 3, background: "#559999" } }).png().toBuffer();
  const cmd = command("commands/tools/smeme.js", { "../../lib/mediautil": { findMedia: () => ({ kind: "image", node: {} }), download: async () => image } });
  const client = mockClient(), msg = message();
  await cmd.execute(client, msg, ["TEKS ATAS", "|", "TEKS BAWAH"]);
  const sticker = client.sent.at(-1).payload.sticker;
  assert.equal((await sharp(sticker).metadata()).format, "webp"); assert.ok(require("../lib/sticker").hasStickerExif(sticker));
  await cmd.execute(client, msg, ["x".repeat(101)]); assert.match(client.sent.at(-1).payload.text, /100 karakter/);
});

test("tovn: voice payload and rejection of non-media documents", async () => {
  let node = { kind: "audio", node: {} };
  const cmd = command("commands/tools/tovn.js", {
    "../../lib/mediautil": { findMedia: () => node, download: async () => Buffer.from("media") },
    "../../lib/voice": { audioToVoice: async () => Buffer.from("OggSvoice") }
  });
  const client = mockClient(), msg = message(); await cmd.execute(client, msg, []);
  assert.equal(client.sent.at(-1).payload.ptt, true); assert.equal(client.sent.at(-1).payload.mimetype, "audio/ogg; codecs=opus");
  node = { kind: "document", node: { mimetype: "application/pdf" } };
  await cmd.execute(client, msg, []); assert.match(client.sent.at(-1).payload.text, /harus berupa audio/);
});

test("FFmpeg: real WAV to OGG/Opus conversion, temp cleanup on success/failure", { skip: !process.env.ZENYN_TEST_TMP }, async () => {
  const approvedTemp = process.env.ZENYN_TEST_TMP;
  const { audioToVoice } = require("../lib/voice");
  const wav = Buffer.alloc(44 + 16000 * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  const before = fs.readdirSync(approvedTemp).filter((name) => name.startsWith("zenyn-vn-"));
  const audio = await audioToVoice(wav, { tempRoot: approvedTemp });
  assert.equal(audio.toString("ascii", 0, 4), "OggS"); assert.ok(audio.includes(Buffer.from("OpusHead")));
  await assert.rejects(() => audioToVoice(Buffer.from("invalid file"), { tempRoot: approvedTemp }), /Gagal membuat/);
  assert.deepEqual(fs.readdirSync(approvedTemp).filter((name) => name.startsWith("zenyn-vn-")), before);
});

test("cuaca: 3-day forecast, cache avoids network, unknown city/service error", async () => {
  const client = mockClient(), msg = message(); let calls = 0;
  const cmd = command("commands/tools/cuaca.js", { "../../lib/httpclient": { getJson: async (url) => {
    calls++;
    if (url.includes("search")) return { results: [{ name: "Bandung", country: "Indonesia", latitude: -6.9, longitude: 107.6 }] };
    return { timezone: "Asia/Jakarta", current: { time: "2026-11-08T12:00", weather_code: 61, temperature_2m: 24, relative_humidity_2m: 80, wind_speed_10m: 5 },
      daily: { time: ["2026-11-08", "2026-11-09", "2026-11-10"], weather_code: [61, 3, 0], temperature_2m_min: [20, 21, 22], temperature_2m_max: [28, 29, 30], precipitation_probability_max: [70, 50, 10] } };
  } } });
  await cmd.execute(client, msg, ["Bandung"]); assert.match(client.sent.at(-1).payload.text, /Prakiraan 3 hari/); assert.equal(calls, 2);
  await cmd.execute(client, msg, ["bandung"]); assert.equal(calls, 2);
  const notFound = command("commands/tools/cuaca.js", { "../../lib/httpclient": { getJson: async () => ({}) } });
  await notFound.execute(client, msg, ["unknown"]); assert.match(client.sent.at(-1).payload.text, /tidak ditemukan/);
  const unavailable = command("commands/tools/cuaca.js", { "../../lib/httpclient": { getJson: async () => { throw new Error("Layanan timeout"); } } });
  await unavailable.execute(client, msg, ["Bandung"]); assert.match(client.sent.at(-1).payload.text, /timeout/);
});

test("translate: query encoding, reply text, AI fallback and service errors", async () => {
  const client = mockClient(), msg = message(); let url;
  const primary = command("commands/tools/translate.js", { "../../lib/httpclient": { getJson: async (input) => { url = input; return [[["Hello", "Halo"]], null, "id"]; } } });
  await primary.execute(client, msg, ["en", "Halo", "&", "test"]); assert.ok(url.includes("q=Halo%20%26%20test")); assert.match(client.sent.at(-1).payload.text, /Hello/);
  await primary.execute(client, message(undefined, undefined, { quotedMessage: { conversation: "Halo" } }), ["en"]); assert.match(client.sent.at(-1).payload.text, /Hello/);
  const failure = { getJson: async () => { throw new Error("unavailable"); } };
  const fallback = command("commands/tools/translate.js", { "../../lib/httpclient": failure, "../../lib/ai": { isConfigured: () => true, ask: async () => "AI result" } });
  await fallback.execute(client, msg, ["en", "Halo"]); assert.match(client.sent.at(-1).payload.text, /AI result/); assert.match(client.sent.at(-1).payload.text, /fallback/);
  const failed = command("commands/tools/translate.js", { "../../lib/httpclient": failure, "../../lib/ai": { isConfigured: () => false } });
  await failed.execute(client, msg, ["en", "Halo"]); assert.match(client.sent.at(-1).payload.text, /tidak tersedia/);
  await primary.execute(client, msg, ["unsupported", "text"]); assert.match(client.sent.at(-1).payload.text, /Format/);
  await primary.execute(client, msg, ["en", "x".repeat(2001)]); assert.match(client.sent.at(-1).payload.text, /2000 karakter/);
});

test("HTTP client: HTTP failure, malformed JSON and abort", async () => {
  for (const fakeFetch of [
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } })
  ]) {
    const http = loadMocked("lib/httpclient.js", { "node-fetch": fakeFetch });
    await assert.rejects(() => http.getJson("https://example.org"));
  }
  const http = loadMocked("lib/httpclient.js", { "node-fetch": (_, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => { const err = new Error("aborted"); err.name = "AbortError"; reject(err); });
  }) });
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(() => http.getJson("https://example.org", { timeout: 10 }), /timeout/); }
  finally { clearTimeout(keepAlive); }
});

test("interactive mention payload: native validation and protobuf serialization", () => {
  const { withMentions } = require("../lib/interactivepayload");
  const helper = require("baileys_helper");
  const { proto } = require("@whiskeysockets/baileys");
  const payload = { text: "@628100000002 pilih suit", footer: "Zenyn", title: "Suit", interactiveButtons: [util.quick("Terima", "suit accept token")] };
  assert.equal(withMentions(payload, []), payload);
  const content = withMentions(payload, [participants[1].id, participants[1].id]);
  assert.deepEqual(content.interactiveMessage.contextInfo.mentionedJid, [participants[1].id]);
  assert.equal(helper.validateInteractiveMessageContent(content).valid, true);
  const encoded = proto.Message.encode(proto.Message.fromObject(content)).finish();
  const decoded = proto.Message.decode(encoded);
  assert.deepEqual(decoded.interactiveMessage.contextInfo.mentionedJid, [participants[1].id]);
  assert.equal(decoded.interactiveMessage.nativeFlowMessage.buttons[0].name, "quick_reply");
});
