const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getRank } = require("../../lib/rpgutil");

const backButton = [{ id: "rpg", text: "⬅️ Kembali" }];
const medals = ["🥇", "🥈", "🥉"];

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;

  try {
    const top = db.leaderboard(10);

    let text = `🏆 *LEADERBOARD*\n\n`;

    if (!top.length) {
      text += `Belum ada pemain.`;
    } else {
      top.forEach((user, i) => {
        const { icon } = getRank(user.level);
        const medal = medals[i] || `${i + 1}.`;
        const stats = db.getStats(user);
        const prestige = user.prestige ? ` | 🌟${user.prestige}` : "";
        text += `${medal} ${icon} *${user.name}*${prestige}\n`;
        text += `   Lv.${user.level} | ⚔️${stats.atk} | 🛡${stats.def} | 💰${user.money} | 📊${user.pvp?.rating ?? 1000}\n\n`;
      });
    }

    return await client.sendButtons(sender, {
      text: text.trim(),
      footer: "Top 10 Pemain",
      buttons: backButton
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in leaderboard command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "leaderboard",
  command: ["leaderboard", "top", "rank", "ranking"],
  category: "rpg",
  description: "Ranking pemain teratas",
  visible: true,
  execute: execute
};
