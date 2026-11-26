// lib/media.js — bantu ambil & download media reply/terlampir untuk command media.
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const pino = require("pino");
const { unwrap } = require("./featureutil");

const NODE_TYPES = {
  imageMessage: "image",
  videoMessage: "video",
  audioMessage: "audio",
  documentMessage: "document"
};

const pickNode = (body) => {
  for (const [key, type] of Object.entries(NODE_TYPES)) {
    if (body?.[key]) return { node: body[key], type };
  }
  return null;
};

// Temukan media dari reply (quoted) atau lampiran langsung. Murni, tanpa I/O.
const findMedia = (message) => {
  const body = unwrap(message?.message);
  const contextInfo =
    body.extendedTextMessage?.contextInfo ||
    body.imageMessage?.contextInfo ||
    body.videoMessage?.contextInfo ||
    body.audioMessage?.contextInfo ||
    null;
  const quoted = unwrap(contextInfo?.quotedMessage);

  const quotedFound = quoted ? pickNode(quoted) : null;
  if (quotedFound) {
    return {
      ...quotedFound,
      target: {
        key: { ...message.key, id: contextInfo.stanzaId, participant: contextInfo.participant },
        message: quoted
      }
    };
  }

  const selfFound = pickNode(body);
  if (selfFound) return { ...selfFound, target: message };
  return null;
};

// Download media; kembalikan null kalau tidak ada / bukan type yang diminta.
const downloadMedia = async (client, message, { type } = {}) => {
  const found = findMedia(message);
  if (!found) return null;
  if (type && found.type !== type) return null;

  const buffer = await downloadMediaMessage(found.target, "buffer", {}, {
    logger: pino({ level: "silent" }),
    reuploadRequest: client.updateMediaMessage
  });
  if (!buffer?.length) return null;
  return { buffer, type: found.type, seconds: Number(found.node.seconds || 0) };
};

module.exports = { findMedia, downloadMedia, NODE_TYPES };