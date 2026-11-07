const logger = require("../../lib/logger");
const { imageToWebp, safeWithExif } = require("../../lib/sticker");
const { renderBrat, MAX_TEXT } = require("../../lib/brat");

const unwrap = (m) => {
  if (!m) return null;
  if (m.documentWithCaptionMessage?.message) return unwrap(m.documentWithCaptionMessage.message);
  if (m.viewOnceMessage?.message) return unwrap(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return unwrap(m.viewOnceMessageV2.message);
  if (m.ephemeralMessage?.message) return unwrap(m.ephemeralMessage.message);
  return m;
};

const quotedText = (message) => {
  const body = unwrap(message.message) || {};
  const contextInfo =
    body.extendedTextMessage?.contextInfo ||
    body.imageMessage?.contextInfo ||
    body.videoMessage?.contextInfo ||
    body.stickerMessage?.contextInfo ||
    null;

  const quoted = unwrap(contextInfo?.quotedMessage);
  if (!quoted) return null;

  return (
    quoted.conversation ||
    quoted.extendedTextMessage?.text ||
    quoted.imageMessage?.caption ||
    quoted.videoMessage?.caption ||
    null
  );
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;

  try {
    let text = args.join(" ").trim();
    if (!text) text = String(quotedText(message) || "").trim();

    if (!text) {
      return await client.sendMessage(
        sender,
        { text: "❌ Format: *.brat <teks>*\nBisa juga reply pesan teks lalu ketik *.brat*" },
        { quoted: message }
      );
    }

    await client.sendMessage(sender, { text: "⏳ Membuat sticker brat..." }, { quoted: message });

    const png = await renderBrat(text);
    const webp = await imageToWebp(png);
    const sticker = await safeWithExif(webp);

    await client.sendMessage(sender, { sticker }, { quoted: message });
    logger.info(`brat ok: ${sender} len=${text.length}`);
  } catch (err) {
    logger.error("Error in brat command:", err);
    const msg = err.message === `Teks maksimal ${MAX_TEXT} karakter` ? `❌ Teks maksimal ${MAX_TEXT} karakter` : `❌ Error: ${err.message}`;
    await client.sendMessage(sender, { text: msg }, { quoted: message });
  }
};

module.exports = {
  name: "brat",
  command: ["brat", "bratsticker"],
  category: "tools",
  description: "Buat sticker brat dari teks",
  visible: true,
  execute: execute
};
