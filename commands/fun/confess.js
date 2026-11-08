const logger = require("../../lib/logger");
const config = require("../../config");
const { db } = require("../../lib/rpgdb");
const { getUserId, normalizeNumber } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { isOwner } = require("../../lib/owner");
const { statusOf } = require("../../lib/rpglimit");

const cooldown = new Map();

const contextOf = (message) =>
  message.message?.extendedTextMessage?.contextInfo ||
  message.message?.imageMessage?.contextInfo ||
  null;

const quotedText = (message) => {
  const ctx = contextOf(message);
  const q = ctx?.quotedMessage;
  return (
    q?.conversation ||
    q?.extendedTextMessage?.text ||
    q?.imageMessage?.caption ||
    ""
  );
};

// target cuma kalau argumen pertama jelas: @mention atau nomor (8-16 digit)
const parseTarget = (args, message) => {
  const list = [...(args || [])];
  const first = String(list[0] || "").trim();
  if (!first) return { targetId: null, rest: list };

  if (first.startsWith("@")) {
    const mentions = contextOf(message)?.mentionedJid || [];
    let id = normalizeNumber(mentions[0] || first);
    if (id.startsWith("0")) id = `62${id.slice(1)}`;
    return { targetId: id || null, rest: list.slice(1) };
  }

  if (/^\+?\d{8,16}$/.test(first)) {
    let id = normalizeNumber(first);
    if (id.startsWith("0")) id = `62${id.slice(1)}`;
    return { targetId: id || null, rest: list.slice(1) };
  }

  return { targetId: null, rest: list };
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const uid = getUserId(message);

  if (!/@g\.us$/i.test(String(sender))) {
    return await client.sendMessage(
      sender,
      { text: `🤫 *CONFESS*\n\nHanya bisa dipakai di grup.\nFormat: *${p}confess <isi>*` },
      { quoted: message }
    );
  }

  if (!uid) {
    return await client.sendMessage(sender, { text: "❌ Tidak bisa mengidentifikasi pengguna." }, { quoted: message });
  }

  if (config.confess?.premium !== false && !isOwner(message)) {
    const user = db.getUser(uid, message.pushName || "Player");
    if (statusOf(user) === "User") {
      return await client.sendMessage(
        sender,
        {
          text: `🔒 *CONFESS KHUSUS PREMIUM*\n\nBeli premium: *${p}premium*`
        },
        { quoted: message }
      );
    }
  }

  const maxLen = Number(config.confess?.maxLen ?? 300);
  const { targetId, rest } = parseTarget(args, message);
  const text = (rest.join(" ") || quotedText(message)).trim().slice(0, maxLen);

  if (!targetId && !text) {
    return await client.sendMessage(
      sender,
      {
        text: [
          "🤫 *CONFESS ANONIM*",
          "",
          `• *${p}confess <isi>* — kirim anonim ke grup`,
          `• *${p}confess @user <isi>* — DM anonim ke user`,
          `• reply pesan lalu *${p}confess* — kirim isi pesan itu ke grup`,
          "",
          `Maks ${maxLen} karakter.`
        ].join("\n")
      },
      { quoted: message }
    );
  }

  if (!text) {
    return await client.sendMessage(
      sender,
      { text: `❌ Isi confess kosong.\nFormat: *${p}confess @user <isi>* atau *${p}confess <isi>*` },
      { quoted: message }
    );
  }

  if (targetId && targetId === uid) {
    return await client.sendMessage(
      sender,
      { text: "❌ Tidak bisa confess ke diri sendiri." },
      { quoted: message }
    );
  }

  const cd = Number(config.confess?.cooldownMs ?? 300000);
  const wait = cd - (Date.now() - (cooldown.get(uid) || 0));
  if (wait > 0) {
    return await client.sendMessage(
      sender,
      { text: `⏳ Tunggu ${Math.ceil(wait / 60000)} menit lagi untuk confess berikutnya.` },
      { quoted: message }
    );
  }

  if (targetId) {
    try {
      await client.sendMessage(`${targetId}@s.whatsapp.net`, {
        text: `🤫 *CONFESS ANONIM*\n\n"${text}"\n\n_Kamu menerima confess anonim._`
      });
    } catch (err) {
      logger.error(`confess dm: ${err.message}`);
      return await client.sendMessage(
        sender,
        { text: `❌ Gagal kirim confess ke target: ${err.message}` },
        { quoted: message }
      );
    }

    cooldown.set(uid, Date.now());
    logger.cmd(`confess: dm ${sender} oleh ${uid}`);
    return await client.sendMessage(
      sender,
      { text: "✅ Confess anonim sudah dikirim ke target." },
      { quoted: message }
    );
  }

  cooldown.set(uid, Date.now());

  try {
    await client.sendMessage(sender, {
      text: `🤫 *CONFESS ANONIM*\n\n"${text}"\n\n_Kirim confess-mu: ${p}confess <isi>_`
    });
    logger.cmd(`confess: ${sender} oleh ${uid}`);
  } catch (err) {
    logger.error(`confess: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Gagal mengirim: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "confess",
  command: ["confess", "confes"],
  category: "fun",
  description: "Kirim confess anonim ke grup atau DM ke user (premium)",
  visible: true,
  premium: true,
  execute,
  _internal: { parseTarget, cooldown }
};
