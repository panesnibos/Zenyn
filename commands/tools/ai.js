const logger = require("../../lib/logger");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const pino = require("pino");
const ai = require("../../lib/ai");

const MAX_ANSWER = 3500;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const IMAGE_LIMIT = 3;

const IMAGE_MODES = new Set(["img", "image", "gambar", "imagine"]);
const EDIT_MODES = new Set(["edit", "ubah", "editin"]);

const USAGE = [
  "🤖 *AI CHAT*",
  "",
  "Format:",
  "• .ai <pertanyaan>",
  "• Reply gambar/dokumen lalu .ai <pertanyaan>",
  "• Kirim gambar/dokumen dengan caption .ai <pertanyaan>",
  "• .ai img <prompt> — buat gambar baru",
  "• Reply gambar lalu .ai edit <instruksi> — edit gambar",
  "",
  "Contoh:",
  "• .ai jelaskan apa itu black hole",
  "• .ai img kucing pakai topi koboi, gaya lukisan",
  "• Reply foto → .ai edit ubah jadi gaya anime",
  "",
  "Biaya limit: teks = 1, gambar/dokumen = 2, buat/edit gambar = 3"
].join("\n");

const unwrapMessage = (m) => {
  if (!m) return null;
  if (m.documentWithCaptionMessage?.message) return m.documentWithCaptionMessage.message;
  if (m.viewOnceMessage?.message) return unwrapMessage(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return unwrapMessage(m.viewOnceMessageV2.message);
  if (m.ephemeralMessage?.message) return unwrapMessage(m.ephemeralMessage.message);
  return m;
};

const pickMedia = (m) => {
  const msg = unwrapMessage(m);
  if (!msg) return null;
  if (msg.imageMessage) return { kind: "image", node: msg.imageMessage };
  if (msg.documentMessage) return { kind: "document", node: msg.documentMessage };
  return null;
};

const mediaInfo = (found) => {
  const node = found.node;
  return {
    kind: found.kind,
    mimetype: node.mimetype,
    filename: node.fileName || node.title || "",
    fileLength: Number(node.fileLength || 0)
  };
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const mode = String(args[0] || "").toLowerCase();
  const isImageMode = IMAGE_MODES.has(mode);
  const isEditMode = EDIT_MODES.has(mode);
  const prompt = isImageMode || isEditMode ? args.slice(1).join(" ").trim() : args.join(" ").trim();

  try {
    const contextInfo =
      message.message?.extendedTextMessage?.contextInfo ||
      message.message?.imageMessage?.contextInfo ||
      message.message?.documentMessage?.contextInfo ||
      null;

    const quoted = contextInfo?.quotedMessage;
    let found = pickMedia(quoted);
    let targetMsg = null;

    if (found) {
      targetMsg = {
        key: { ...message.key, id: contextInfo.stanzaId, participant: contextInfo.participant },
        message: unwrapMessage(quoted)
      };
    } else {
      found = pickMedia(message.message);
      if (found) targetMsg = message;
    }

    if (isEditMode && !found) {
      return await client.sendMessage(
        sender,
        { text: "❌ Reply gambar (atau kirim gambar dengan caption *.ai edit <instruksi>*)" },
        { quoted: message }
      );
    }

    if ((isImageMode || isEditMode) && !prompt) {
      return await client.sendMessage(
        sender,
        { text: `❌ Format: *.ai ${isEditMode ? "edit <instruksi>" : "img <prompt>"}*` },
        { quoted: message }
      );
    }

    if (!found && !prompt) {
      return await client.sendMessage(sender, { text: USAGE }, { quoted: message });
    }

    if (!ai.isConfigured()) {
      return await client.sendMessage(
        sender,
        { text: "❌ AI belum dikonfigurasi. Owner harus mengisi GEMINI_API_KEY." },
        { quoted: message }
      );
    }

    const hasMedia = !!found;
    let media = null;

    if (hasMedia && (isEditMode || !isImageMode)) {
      const info = mediaInfo(found);
      if (info.fileLength && info.fileLength > MAX_DOWNLOAD_BYTES) {
        await client.sendMessage(sender, { text: "❌ File terlalu besar (maks 20 MB)" }, { quoted: message });
        return false;
      }

      const buffer = await downloadMediaMessage(targetMsg, "buffer", {}, {
        logger: pino({ level: "silent" }),
        reuploadRequest: client.updateMediaMessage
      });

      if (!buffer?.length) {
        await client.sendMessage(sender, { text: "❌ Gagal mengunduh media" }, { quoted: message });
        return false;
      }

      media = { kind: info.kind, mimetype: info.mimetype, buffer };
    }

    if (isImageMode || isEditMode) {
      await client.sendMessage(
        sender,
        { text: isEditMode ? "🎨 Mengedit gambar..." : "🎨 Membuat gambar..." },
        { quoted: message }
      );

      const result = await ai.generateImage({ prompt, media: isEditMode ? media : null });

      const note = result.text ? `\n\n_${result.text.slice(0, 300)}_` : "";
      const via = result.provider === "pollinations" ? "\n\n_via Pollinations (kuota Gemini habis)_" : "";
      await client.sendMessage(
        sender,
        { image: result.buffer, caption: `🎨 ${prompt}${note}${via}` },
        { quoted: message }
      );

      logger.info(`ai image: ${sender} mode=${isEditMode ? "edit" : "img"} provider=${result.provider || "gemini"}`);
      return { limitCost: IMAGE_LIMIT };
    }

    if (hasMedia) {
      const info = mediaInfo(found);
      await client.sendMessage(
        sender,
        { text: `⏳ ${info.kind === "image" ? "Menganalisis gambar" : "Membaca dokumen"}...` },
        { quoted: message }
      );
    } else {
      await client.sendMessage(sender, { text: "⏳ Thinking..." }, { quoted: message });
    }

    const answer = await ai.ask({
      prompt: prompt || "Jelaskan isi media ini secara detail.",
      media
    });

    const text = answer.length > MAX_ANSWER ? `${answer.slice(0, MAX_ANSWER)}...` : answer;

    await client.sendMessage(sender, { text: `🤖 ${text}` }, { quoted: message });
    logger.info(`ai: ${sender} media=${hasMedia}`);

    return { limitCost: hasMedia ? 2 : 1 };
  } catch (err) {
    logger.error(`ai: ${err.message}`);
    const detail = err.detail ? `\n${String(err.detail).slice(0, 300)}` : "";
    await client.sendMessage(sender, { text: `❌ ${err.message}${detail}` }, { quoted: message });
    return false;
  }
};

module.exports = {
  name: "ai",
  command: ["ai", "ask"],
  category: "tools",
  description: "Tanya AI (teks, gambar, dokumen, buat/edit gambar)",
  visible: true,
  limit: 1,
  execute: execute
};
