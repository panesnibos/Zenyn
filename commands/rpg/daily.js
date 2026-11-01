const logger = require("../../lib/logger");
const fs = require("fs");
const path = require("path");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");

const dailyPath = path.join(__dirname, "../../database/rpg/daily.json");
let rewards = [];
try {
  let raw = fs.readFileSync(dailyPath, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  rewards = JSON.parse(raw);
} catch {
  logger.info("❌ daily.json error");
}

const backButton = [{ id: "rpg", text: "⬅️ Kembali" }];

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");

    if (!db.canDaily(userId)) {
      const next = new Date(user.daily + 24 * 60 * 60 * 1000);
      const diff = next - Date.now();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);

      return await client.sendButtons(sender, {
        text: `📅 *Daily sudah diklaim!*\n\nCoba lagi dalam *${h}j ${m}m*`,
        footer: "Daily Reward",
        buttons: backButton
      }, { quoted: message });
    }

    if (!rewards.length) {
      return await client.sendMessage(sender, { text: "❌ Reward daily belum diatur." }, { quoted: message });
    }

    const reward = rewards[Math.floor(Math.random() * rewards.length)];
    db.addMoney(userId, reward.money);
    const expResult = db.addExp(userId, reward.exp);
    db.setDaily(userId);

    let text = `🎁 *DAILY REWARD*\n\n💰 Money: +${reward.money}\n✨ EXP: +${reward.exp}`;

    if (expResult?.levelUp) {
      const updated = db.getUser(userId);
      text += `\n\n🎉 *LEVEL UP!*\nSekarang Level ${updated.level}`;
    }

    return await client.sendButtons(sender, {
      text,
      footer: "Daily Reward",
      buttons: backButton
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in daily command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "daily",
  command: ["daily", "reward", "harian"],
  category: "rpg",
  description: "Klaim reward harian",
  visible: true,
  execute: execute
};
