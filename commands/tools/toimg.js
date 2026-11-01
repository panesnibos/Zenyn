const logger = require("../../lib/logger");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const sharp = require("sharp");
const pino = require("pino");

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;

  try {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted?.stickerMessage || message.message?.stickerMessage;

    if (!target) {
      return await client.sendMessage(
        sender,
        { text: "❌ Reply sticker dengan caption .toimg" },
        { quoted: message }
      );
    }

    await client.sendMessage(sender, { text: "⏳ Converting sticker..." }, { quoted: message });

    const buffer = await downloadMediaMessage(
      { key: message.key, message: quoted ? { stickerMessage: target } : message.message },
      "buffer",
      {},
      {
        logger: pino({ level: "silent" }),
        reuploadRequest: client.updateMediaMessage
      }
    );

    if (target.isAnimated) {
      const png = await sharp(buffer, { animated: true }).png().toBuffer();
      await client.sendMessage(sender, { image: png }, { quoted: message });
    } else {
      const png = await sharp(buffer).png().toBuffer();
      await client.sendMessage(sender, { image: png }, { quoted: message });
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
