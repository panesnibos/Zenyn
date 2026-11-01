const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId, resolveTarget } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");

const backButton = [{ id: "rpg", text: "⬅️ Kembali" }];

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const { targetId, rest } = await resolveTarget(message, args, client);
    const amount = parseInt(rest[0]);

    if (!targetId) {
      return await client.sendMessage(sender, {
        text: `📤 *TRANSFER*\n\nContoh:\n${p}transfer 628123456789 100\nAtau reply pesan target:\n${p}transfer 100`
      }, { quoted: message });
    }

    if (targetId === userId) {
      return await client.sendMessage(sender, { text: "❌ Tidak bisa transfer ke diri sendiri." }, { quoted: message });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return await client.sendMessage(sender, { text: "❌ Jumlah transfer tidak valid." }, { quoted: message });
    }

    const user = db.getUser(userId, message.pushName || "Player");

    if (user.money < amount) {
      return await client.sendMessage(sender, { text: `💸 Gold tidak cukup! Saldo kamu: ${user.money}` }, { quoted: message });
    }

    db.addMoney(userId, -amount);
    db.getUser(targetId, "Player");
    db.addMoney(targetId, amount);

    const sisa = db.getUser(userId).money;

    return await client.sendButtons(sender, {
      text: `✅ *TRANSFER BERHASIL*\n\n📤 Ke: +${targetId}\n💰 Jumlah: ${amount}\n💳 Sisa: ${sisa}`,
      footer: "Transfer",
      buttons: backButton
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in transfer command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "transfer",
  command: ["transfer", "tf", "kirim"],
  category: "rpg",
  description: "Transfer gold ke pemain lain",
  visible: true,
  execute: execute
};
