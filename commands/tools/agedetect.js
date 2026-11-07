const logger = require("../../lib/logger");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const pino = require("pino");
const ai = require("../../lib/ai");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { isOwner } = require("../../lib/owner");
const { statusOf } = require("../../lib/rpglimit");

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ANSWER = 3000;

const unwrapMessage = (m) => {
  if (!m) return null;
  if (m.documentWithCaptionMessage?.message) return m.documentWithCaptionMessage.message;
  if (m.viewOnceMessage?.message) return unwrapMessage(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return unwrapMessage(m.viewOnceMessageV2.message);
  if (m.ephemeralMessage?.message) return unwrapMessage(m.ephemeralMessage.message);
  return m;
};

const pickImage = (m) => {
  const msg = unwrapMessage(m);
  if (msg?.imageMessage) return msg.imageMessage;
  return null;
};

const PROMPT = [
  "Perkirakan usia orang pada foto ini.",
  "Jawab dalam bahasa Indonesia, format:",
  "1. Perkiraan rentang usia (contoh: 22-27 tahun)",
  "2. Perkiraan gender (jika bisa ditebak)",
  "3. Alasan singkat (maks 2 kalimat)",
  "Tambahkan catatan bahwa ini hanya estimasi kasar berdasarkan penampilan, bukan hasil medis."
].join("\n");

const execute = async (client, message) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const uid = getUserId(message);

  const user = uid ? db.getUser(uid, message.pushName || "Player") : null;
  const premium = isOwner(message) || (user && statusOf(user) !== "User");

  if (!premium) {
    return await client.sendMessage(
      sender,
      {
        text: `🔒 *KHUSUS PREMIUM*\n\nFitur ${p}agedetect hanya untuk Premium/Donatur.\nBeli premium: *${p}premium*`
      },
      { quoted: message }
    );
  }

  const contextInfo =
    message.message?.extendedTextMessage?.contextInfo ||
    message.message?.imageMessage?.contextInfo ||
    null;

  const quoted = contextInfo?.quotedMessage;
  let targetMsg = null;
  let node = pickImage(quoted);

  if (node) {
    targetMsg = {
      key: { ...message.key, id: contextInfo.stanzaId, participant: contextInfo.participant },
      message: unwrapMessage(quoted)
    };
  } else {
    node = pickImage(message.message);
    if (node) targetMsg = message;
  }

  if (!node || !targetMsg) {
    return await client.sendMessage(
      sender,
      {
        text: `🧑‍🦰 *DETEKSI USIA*\n\nReply sebuah foto lalu ketik *${p}agedetect*\natau kirim foto dengan caption *${p}agedetect*.`
      },
      { quoted: message }
    );
  }

  if (!ai.isConfigured()) {
    return await client.sendMessage(
      sender,
      { text: "❌ AI belum dikonfigurasi. Owner harus mengisi GEMINI_API_KEY." },
      { quoted: message }
    );
  }

  try {
    const size = Number(node.fileLength || 0);
    if (size && size > MAX_BYTES) {
      return await client.sendMessage(sender, { text: "❌ Foto terlalu besar (maks 20 MB)" }, { quoted: message });
    }

    await client.sendMessage(sender, { text: "🔍 Menganalisis foto..." }, { quoted: message });

    const buffer = await downloadMediaMessage(targetMsg, "buffer", {}, {
      logger: pino({ level: "silent" }),
      reuploadRequest: client.updateMediaMessage
    });

    if (!buffer?.length) {
      return await client.sendMessage(sender, { text: "❌ Gagal mengunduh foto" }, { quoted: message });
    }

    const answer = await ai.ask({
      prompt: PROMPT,
      media: { kind: "image", mimetype: node.mimetype || "image/jpeg", buffer }
    });

    const text = answer.length > MAX_ANSWER ? `${answer.slice(0, MAX_ANSWER)}...` : answer;

    await client.sendMessage(sender, { text: `🧑‍🦰 *ESTIMASI USIA*\n\n${text}` }, { quoted: message });
    logger.info(`agedetect: ${sender}`);
  } catch (err) {
    logger.error(`agedetect: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Gagal menganalisis: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "agedetect",
  command: ["agedetect", "age-detection", "detectage", "usia"],
  category: "tools",
  description: "Deteksi perkiraan usia dari foto (premium)",
  visible: true,
  premium: true,
  execute
};
