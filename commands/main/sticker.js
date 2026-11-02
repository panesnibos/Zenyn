const logger = require("../../lib/logger");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const pino = require("pino");
const { imageToWebp, videoToWebp, safeWithExif } = require("../../lib/sticker");

const MAX_SECONDS = 5;

const unwrap = (m) => {
  if (!m) return null;
  if (m.documentWithCaptionMessage?.message) return unwrap(m.documentWithCaptionMessage.message);
  if (m.viewOnceMessage?.message) return unwrap(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return unwrap(m.viewOnceMessageV2.message);
  if (m.ephemeralMessage?.message) return unwrap(m.ephemeralMessage.message);
  return m;
};

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;

  try {
    const body = unwrap(message.message) || {};
    const contextInfo =
      body.extendedTextMessage?.contextInfo ||
      body.imageMessage?.contextInfo ||
      body.videoMessage?.contextInfo ||
      null;

    const quoted = unwrap(contextInfo?.quotedMessage);
    let mediaNode = null;
    let mediaType = null;
    let targetMsg = null;

    if (quoted?.imageMessage) {
      mediaNode = quoted.imageMessage;
      mediaType = "image";
      targetMsg = {
        key: { ...message.key, id: contextInfo.stanzaId, participant: contextInfo.participant },
        message: quoted
      };
    } else if (quoted?.videoMessage) {
      mediaNode = quoted.videoMessage;
      mediaType = "video";
      targetMsg = {
        key: { ...message.key, id: contextInfo.stanzaId, participant: contextInfo.participant },
        message: quoted
      };
    } else if (body.imageMessage) {
      mediaNode = body.imageMessage;
      mediaType = "image";
      targetMsg = message;
    } else if (body.videoMessage) {
      mediaNode = body.videoMessage;
      mediaType = "video";
      targetMsg = message;
    }

    if (!targetMsg) {
      return await client.sendMessage(
        sender,
        { text: "❌ Reply gambar/video atau kirim gambar/video dengan caption *.s*" },
        { quoted: message }
      );
    }

    if (mediaType === "video" && Number(mediaNode.seconds || 0) > MAX_SECONDS) {
      return await client.sendMessage(
        sender,
        { text: `❌ Maksimal durasi video ${MAX_SECONDS} detik` },
        { quoted: message }
      );
    }

    await client.sendMessage(
      sender,
      { text: mediaType === "video" ? "⏳ Membuat sticker video..." : "⏳ Membuat sticker..." },
      { quoted: message }
    );

    const buffer = await downloadMediaMessage(targetMsg, "buffer", {}, {
      logger: pino({ level: "silent" }),
      reuploadRequest: client.updateMediaMessage
    });

    if (!buffer?.length) throw new Error("Gagal mengunduh media");

    const webp = mediaType === "video" ? await videoToWebp(buffer) : await imageToWebp(buffer);
    const sticker = await safeWithExif(webp);

    await client.sendMessage(sender, { sticker }, { quoted: message });
    logger.info(`sticker ok: ${sender} type=${mediaType}`);
  } catch (err) {
    logger.error("Error in sticker command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "sticker",
  command: ["sticker", "s", "stiker"],
  category: "tools",
  description: "Convert image/video/gif ke sticker",
  visible: true,
  execute: execute
};
