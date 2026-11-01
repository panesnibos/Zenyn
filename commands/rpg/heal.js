const logger = require("../../lib/logger");
const fs = require("fs");
const path = require("path");
const { db } = require("../../lib/rpgdb");
const { getUserId, getRank } = require("../../lib/rpgutil");

const healPath = path.join(__dirname, "../../database/rpg/heal.json");
let heals = {};
try {
  heals = JSON.parse(fs.readFileSync(healPath));
} catch {
  logger.info("❌ heal.json error");
}

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  const user = db.getUser(userId, message.pushName || "Player");
  const { rank, icon } = getRank(user.level);
  const stats = db.getStats(user);

  const caption = `${icon} *${user.name}*
✦ ${rank} — Level ${user.level}

💰 Gold: ${user.money}`;

  const getItem = (name) => user.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase());

  try {
    // ================= MENU HEAL =================
    if (!heals[commandName]) {
      const rows = Object.values(heals).map((item) => {
        const inv = getItem(item.name);
        const qty = inv ? inv.qty : 0;
        return {
          id: item.name,
          title: `${item.emoji} ${item.name}`,
          description: `+${item.effect} HP | Qty: ${qty}`
        };
      });

      return await client.sendInteractiveMessage(sender, {
        text: `🏥 Tempat Pengobatan\n\n${caption}\n❤️ HP kamu: ${user.hp}/${stats.maxHp}\n\n`,
        interactiveButtons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Pilih Item Heal",
              sections: [{ title: "Daftar Item", rows }]
            })
          }
        ]
      }, { quoted: message });
    }

    // ================= PAKAI ITEM HEAL =================
    const itemData = heals[commandName];

    if (user.hp >= stats.maxHp) {
      return await client.sendMessage(sender, { text: "❤️ HP kamu sudah penuh!" }, { quoted: message });
    }

    const item = getItem(commandName);
    if (!item || item.qty <= 0) {
      return await client.sendMessage(sender, { text: `❌ Kamu tidak punya ${itemData.name}` }, { quoted: message });
    }

    let newHp = Math.min(db.getStats(user).maxHp, user.hp + itemData.effect);
    db.removeItem(userId, commandName, 1);
    db.setHp(userId, newHp);
    db.addQuestProgress(userId, "heal", 1);
    db.checkAchievements(userId);

    return await client.sendMessage(sender, {
      text: `${itemData.emoji} ${itemData.name} digunakan!\n+${itemData.effect} HP\n\n❤️ ${newHp}/${user.maxHp}`
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in heal command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "heal",
  command: ["heal", "potion", "elixir"],
  category: "rpg",
  description: "Gunakan item heal",
  visible: true,
  execute: execute
};
