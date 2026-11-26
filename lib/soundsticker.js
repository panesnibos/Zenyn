// lib/soundsticker.js — kirim stiker bersuara native (stiker + audio embedded).
// WhatsApp baru merilis "sound sticker": stiker WebP animasi + audio OGG Opus yang
// disisipkan di Message.field-134. WAProto rc14 belum punya field 134, jadi kita
// patch proto.Message.encode sekali lalu relay. (monkeypatch, kunci di rc14)
const { proto, prepareWAMessageMedia, generateWAMessage } = require("@whiskeysockets/baileys");
const { Writer } = require("protobufjs");

const varint = (n) => {
  const out = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return Buffer.from(out);
};

// Bungkus StickerMessage (dengan audio di field 26) jadi Message.field-134.
const buildWrapped = (sound, stickerMessage) => {
  const stickerBase = proto.Message.StickerMessage.encode(stickerMessage).finish();
  const audioBytes = proto.Message.AudioMessage.encode(sound.audioMessage).finish();
  // StickerMessage + field 24 (varint 0) + field 26 (AudioMessage)
  const innerSticker = Buffer.concat([
    stickerBase,
    Buffer.from([0xc0, 0x01, 0x00]),
    Buffer.from([0xd2, 0x01]),
    varint(audioBytes.length),
    audioBytes
  ]);
  // Message { 26: innerSticker }
  const innerMessage = Buffer.concat([
    Buffer.from([0xd2, 0x01]),
    varint(innerSticker.length),
    innerSticker
  ]);
  // FutureProofMessage { 1: innerMessage }  -> isi field 134
  return Buffer.concat([
    Buffer.from([0x0a]),
    varint(innerMessage.length),
    innerMessage
  ]);
};

const ORIGINAL_ENCODE = proto.Message.encode;
proto.Message.encode = function (message, writer) {
  const sound = message && message.__soundSticker;
  if (sound) {
    const w = writer || Writer.create();
    const clone = { ...message };
    delete clone.stickerMessage;
    delete clone.__soundSticker;
    ORIGINAL_ENCODE.call(this, clone, w);
    w.uint32((134 << 3) | 2);
    w.bytes(buildWrapped(sound, message.stickerMessage));
    return w;
  }
  return ORIGINAL_ENCODE.call(this, message, writer);
};

const sendSoundSticker = async (client, jid, { webp, audio, quoted }, { messageId } = {}) => {
  const logger = client.logger;
  const userJid = client.user?.id;
  const audioPrep = await prepareWAMessageMedia(
    { audio, mimetype: "audio/ogg; codecs=opus", ptt: false },
    { upload: client.waUploadToServer, logger }
  );
  const fullMsg = await generateWAMessage(
    jid,
    { sticker: webp, isAnimated: true, mimetype: "image/webp" },
    { logger, userJid, upload: client.waUploadToServer, mediaCache: client.mediaCache, messageId, quoted }
  );
  fullMsg.message.__soundSticker = { audioMessage: audioPrep.audioMessage };
  await client.relayMessage(jid, fullMsg.message, { messageId: fullMsg.key.id });
  return fullMsg;
};

module.exports = { sendSoundSticker, buildWrapped };