const logger = require("../../lib/logger");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
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
      const gif = await sharp(buffer, { animated: true }).gif().toBuffer();
      await client.sendMessage(
        sender,
        { video: gif, mimetype: "video/gif", gifPlayback: true, caption: "✅ Sticker to image" },
        { quoted: message }
      );
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
  description: "Convert sticker ke gambar",
  visible: true,
  execute: execute
};
