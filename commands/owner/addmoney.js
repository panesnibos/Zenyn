const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { resolveTarget } = require("../../lib/rpgutil");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  try {
    const { targetId, rest } = await resolveTarget(message, args, client);
    const amount = parseInt(rest[0]);

    if (!targetId) {
      return await client.sendMessage(sender, {
        text: `💰 *ADD MONEY*\n\nContoh:\n${p}addmoney 628123456789 1000\n${p}addmoney @user 1000\nAtau reply target:\n${p}addmoney 1000`
      }, { quoted: message });
    }

    if (!Number.isFinite(amount) || amount === 0) {
      return await client.sendMessage(sender, { text: "❌ Jumlah tidak valid." }, { quoted: message });
    }

    db.getUser(targetId, "Player");
    db.addMoney(targetId, amount);
    const user = db.getUser(targetId);

    logger.cmd(`addmoney ${amount} -> ${targetId}`);

    return await client.sendMessage(sender, {
      text: `✅ ${amount > 0 ? "+" : ""}${amount} gold → +${targetId}\n💰 Saldo sekarang: ${user.money}`
    }, { quoted: message });

  } catch (err) {
    logger.error(`addmoney: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "addmoney",
  command: ["addmoney", "addgold", "kasihgold", "tambahgold"],
  category: "owner",
  description: "Tambah/kurangi gold user (owner)",
  visible: false,
  execute: execute
};
