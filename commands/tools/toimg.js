const logger = require("../../lib/logger");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { stickerToVideo } = require("../../lib/sticker");
const sharp = require("sharp");
const pino = require("pino");

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;

  try {
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quoted = contextInfo?.quotedMessage;
    const target = quoted?.stickerMessage || message.message?.stickerMessage;

    if (!target) {
      return await client.sendMessage(
        sender,
        { text: "❌ Reply sticker dengan caption .toimg" },
        { quoted: message }
      );
    }

    await client.sendMessage(sender, { text: "⏳ Converting sticker..." }, { quoted: message });

    const targetMsg = quoted
      ? {
          key: { ...message.key, id: contextInfo.stanzaId, participant: contextInfo.participant },
          message: quoted
        }
      : message;

    const buffer = await downloadMediaMessage(targetMsg, "buffer", {}, {
      logger: pino({ level: "silent" }),
      reuploadRequest: client.updateMediaMessage
    });

    const meta = await sharp(buffer, { animated: true }).metadata();
    const isAnimated = target.isAnimated || (meta.pages || 1) > 1;

    if (isAnimated) {
      let vid = null;
      try {
        vid = await stickerToVideo(buffer);
      } catch (err) {
        logger.warn(`toimg ffmpeg gagal, fallback ke gif: ${err.message}`);
      }

      if (vid) {
        await client.sendMessage(
          sender,
          { video: vid, mimetype: "video/mp4", gifPlayback: true, caption: "✅ Sticker to video" },
          { quoted: message }
        );
      } else {
        const gif = await sharp(buffer, { animated: true }).gif().toBuffer();
        await client.sendMessage(
          sender,
          { video: gif, mimetype: "video/mp4", gifPlayback: true, caption: "✅ Sticker to video" },
          { quoted: message }
        );
      }
    } else {
      const png = await sharp(buffer).png().toBuffer();
      await client.sendMessage(
        sender,
        { image: png, mimetype: "image/png", caption: "✅ Sticker to image" },
        { quoted: message }
      );
    }

    logger.info(`✅ toimg for ${sender}`);
  } catch (err) {
    logger.error("Error in toimg command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "toimg",
  command: ["toimg", "toimage", "img"],
  category: "tools",
  description: "Convert sticker ke gambar/video",
  visible: true,
  execute: execute
};
