const logger = require("../../lib/logger");
const config = require("../../config");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { isOwner } = require("../../lib/owner");
const { statusOf } = require("../../lib/rpglimit");

const cooldown = new Map();

const quotedText = (message) => {
  const ctx =
    message.message?.extendedTextMessage?.contextInfo ||
    message.message?.imageMessage?.contextInfo ||
    null;
  const q = ctx?.quotedMessage;
  return (
    q?.conversation ||
    q?.extendedTextMessage?.text ||
    q?.imageMessage?.caption ||
    ""
  );
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
  const text = (args.join(" ") || quotedText(message)).trim().slice(0, maxLen);

  if (!text) {
    return await client.sendMessage(
      sender,
      { text: `🤫 *CONFESS ANONIM*\n\nFormat: *${p}confess <isi>*\natau reply pesan lalu *${p}confess*.\nMaks ${maxLen} karakter.` },
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
  description: "Kirim confess anonim ke grup (premium)",
  visible: true,
  premium: true,
  execute
};
