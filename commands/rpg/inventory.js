const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");

const slotText = (user) => {
  const eq = user.equipment || {};
  const part = (label, name) => `${label}: ${name || "-"}`;
  return [
    part("⚔️", eq.weapon),
    part("🛡️", eq.armor),
    part("💍", eq.accessory)
  ].join("\n");
};

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const stats = db.getStats(user);

    if (!user.inventory.length) {
      return await client.sendMessage(sender, { text: "🎒 Inventory kosong!" }, { quoted: message });
    }

    let text = `🎒 *INVENTORY*\n\n`;
    user.inventory.forEach((item) => {
      text += `${item.emoji || "📦"} *${item.name}* x${item.qty}\n`;
    });

    text += `\n────────────\n⚒️ *Equipment*\n${slotText(user)}`;
    text += `\n\n⚔️ ATK: ${stats.atk} | 🛡 DEF: ${stats.def} | ❤️ ${user.hp}/${stats.maxHp}`;
    if (user.title) text += `\n🏅 Title: ${user.title}`;
    if (user.pet) text += `\n🐾 Pet: ${user.pet.emoji} ${user.pet.name} Lv.${user.pet.level}`;

    await client.sendMessage(sender, { text }, { quoted: message });

  } catch (err) {
    logger.error("Error in inventory command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "inventory",
  command: ["inventory", "inv", "bag"],
  category: "rpg",
  description: "Lihat item yang kamu punya",
  visible: true,
  execute: execute
};
