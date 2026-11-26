// lib/soundsticker: verifikasi monkeypatch field-134 pada encode protobuf.
const test = require("node:test");
const assert = require("node:assert/strict");
const { proto } = require("@whiskeysockets/baileys");
const { Reader } = require("protobufjs");
const { buildWrapped } = require("../lib/soundsticker");

const ogg = Buffer.from("audio/ogg; codecs=opus");

test("buildWrapped: bungkus sticker + audio jadi field 134 yang benar", () => {
  const sticker = proto.Message.StickerMessage.create({ mimetype: "image/webp" });
  const audio = proto.Message.AudioMessage.create({ mimetype: "audio/ogg; codecs=opus", ptt: false });
  const wrapped = buildWrapped({ audioMessage: audio }, sticker);

  const r = Reader.create(wrapped);
  const key = r.uint32();
  assert.equal(key >>> 3, 1, "wrapper punya field 1 (FutureProofMessage.message)");
  assert.equal((key & 7), 2, "length-delimited");
  const messageBytes = r.bytes();

  const r2 = Reader.create(messageBytes);
  const k2 = r2.uint32();
  assert.equal(k2 >>> 3, 26, "inner Message field 26 = stickerMessage");
  const stickerBytes = r2.bytes();
  const stickerMsg = proto.Message.StickerMessage.decode(stickerBytes);
  assert.equal(stickerMsg.mimetype, "image/webp", "masih stiker webp");
  assert.ok(stickerBytes.includes(ogg), "audio ogg disisipkan ke dalam sticker");
});

test("encode bertanda __soundSticker -> hasil berisi field 134, tanpa stickerMessage puncak", () => {
  const sticker = proto.Message.StickerMessage.create({ mimetype: "image/webp" });
  const audio = proto.Message.AudioMessage.create({ mimetype: "audio/ogg; codecs=opus", ptt: false });
  const msg = proto.Message.create({ stickerMessage: sticker, messageContextInfo: { deviceListMetadata: {} } });
  msg.__soundSticker = { audioMessage: audio };

  const bytes = proto.Message.encode(msg).finish();
  const r = Reader.create(bytes);
  let saw134 = false;
  let saw26 = false;
  while (r.pos < r.len) {
    const key = r.uint32();
    const field = key >>> 3;
    const wire = key & 7;
    if (wire === 2) {
      const chunk = r.bytes();
      if (field === 134) saw134 = true;
      if (field === 26) saw26 = true;
    } else if (wire === 0) r.uint32();
    else if (wire === 1) r.fixed64();
    else if (wire === 5) r.fixed32();
    else throw new Error("wire type tak dikenal");
  }
  assert.equal(saw134, true, "field 134 ada (sound sticker)");
  assert.equal(saw26, false, "tidak ada stickerMessage (26) di level puncak");
});

test("encode normal (tanpa marker) tetap berperilaku biasa", () => {
  const plain = proto.Message.create({ stickerMessage: proto.Message.StickerMessage.create({ mimetype: "image/webp" }) });
  const bytes = proto.Message.encode(plain).finish();
  const decoded = proto.Message.decode(bytes);
  assert.equal(decoded.stickerMessage.mimetype, "image/webp");
});
