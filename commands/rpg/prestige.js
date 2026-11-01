const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");

const REQ_LEVEL = 50;
const COST = 10000;

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const action = (args[0] || "").toLowerCase();

    if (action === "confirm") {
      if (user.level < REQ_LEVEL) {
        return await client.sendMessage(sender, { text: `❌ Butuh level ${REQ_LEVEL}. Level kamu ${user.level}.` }, { quoted: message });
      }
      if (user.money < COST) {
        return await client.sendMessage(sender, { text: `💸 Butuh ${COST} gold untuk prestige. Saldo ${user.money}.` }, { quoted: message });
      }

      db.updateUser(userId, (u) => {
        u.prestige = (u.prestige || 0) + 1;
        u.money -= COST;
        u.level = 1;
        u.exp = 0;
        u.expNeeded = 100;
        u.maxHp = 100;
        u.hp = 100;
        u.atk = 10;
        u.def = 5;
        u.stats.dungeonBest = 1;
      });

      const newly = db.checkAchievements(userId);
      const updated = db.getUser(userId);
      const bonus = updated.prestige * 5;

      let text = `🌟 *PRESTIGE ${updated.prestige}*\n\nLevel direset ke 1.\n📈 Bonus permanen: +${bonus}% ATK/DEF/HP\n💰 Sisa gold: ${updated.money}`;
      if (newly.length) text += `\n\n🏅 ${newly.map((a) => a.name).join(", ")}`;

      return await client.sendMessage(sender, { text }, { quoted: message });
    }

    return await client.sendButtons(sender, {
      title: "🌟 Prestige",
      text: `Level: ${user.level}/${REQ_LEVEL}\nPrestige: ${user.prestige || 0} (bonus +${(user.prestige || 0) * 5}%)\nBiaya: ${COST} gold\n\nPrestige mereset level & stats dasar, tapi bonus permanen dan inventory tetap.`,
      footer: "Butuh level 50",
      buttons: [
        { id: "prestige confirm", text: "🌟 Prestige" },
        { id: "rpg", text: "⬅️ Kembali" }
      ]
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in prestige command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "prestige",
  command: ["prestige", "rebirth"],
  category: "rpg",
  description: "Reset level untuk bonus permanen",
  visible: true,
  execute: execute
};
