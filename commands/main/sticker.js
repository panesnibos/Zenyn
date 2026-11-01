const logger = require("../../lib/logger");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const sharp = require("sharp");
const pino = require("pino");

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  let targetMsg = null;
  let isVideo = false;

  try {
    // Cek reply gambar/video
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.imageMessage || quoted?.videoMessage) {
      targetMsg = {
        key: message.key,
        message: quoted
      };
      isVideo = !!quoted.videoMessage;
    }
    // Cek gambar/video dengan caption .s
    else if (message.message?.imageMessage || message.message?.videoMessage) {
      targetMsg = message;
      isVideo = !!message.message?.videoMessage;
    }

    if (!targetMsg) {
      return await client.sendMessage(sender, { text: "❌ Reply gambar/video atau kirim gambar dengan caption .s" }, { quoted: message });
    }

    await client.sendMessage(sender, { text: "⏳ Processing sticker..." }, { quoted: message });

    const buffer = await downloadMediaMessage(
      targetMsg,
      "buffer",
      {},
      {
        logger: pino({ level: "silent" }),
        reuploadRequest: client.updateMediaMessage
      }
    );

    let stickerBuffer;

    if (isVideo) {
      stickerBuffer = buffer;
    } else {
      stickerBuffer = await sharp(buffer)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp()
        .toBuffer();
    }

    await client.sendMessage(sender, { sticker: stickerBuffer }, { quoted: message });
    logger.info(`✅ Sticker created for ${sender}`);

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
