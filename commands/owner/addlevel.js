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
        text: `⬆️ *ADD LEVEL*\n\nContoh:\n${p}addlevel 628123456789 5\n${p}addlevel @user 5\nAtau reply target:\n${p}addlevel 5`
      }, { quoted: message });
    }

    if (!Number.isFinite(amount) || amount === 0) {
      return await client.sendMessage(sender, { text: "❌ Jumlah level tidak valid." }, { quoted: message });
    }

    db.getUser(targetId, "Player");
    const user = db.addLevel(targetId, amount);

    logger.cmd(`addlevel ${amount} -> ${targetId}`);

    return await client.sendMessage(sender, {
      text: `✅ Level ${amount > 0 ? "+" : ""}${amount} → +${targetId}\n⭐ Level sekarang: ${user.level}\n❤️ HP: ${user.hp}/${user.maxHp}\n⚔️ ATK: ${user.atk} | 🛡 DEF: ${user.def}`
    }, { quoted: message });

  } catch (err) {
    logger.error(`addlevel: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "addlevel",
  command: ["addlevel", "setlevel", "tambahlevel"],
  category: "owner",
  description: "Tambah/kurangi level user (owner)",
  visible: false,
  execute: execute
};
