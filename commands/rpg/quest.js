const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");

const bar = (value, max) => {
  const len = 8;
  const filled = Math.min(len, Math.round((value / max) * len));
  return "▰".repeat(filled) + "▱".repeat(len - filled);
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");

    if ((args[0] || "").toLowerCase() === "claim") {
      const index = parseInt(args[1]) - 1;
      if (!Number.isFinite(index) || index < 0) {
        return await client.sendMessage(sender, { text: "❌ Contoh: quest claim 1" }, { quoted: message });
      }

      const result = db.claimQuest(userId, index);
      if (!result.ok) {
        return await client.sendMessage(sender, { text: `❌ ${result.reason}` }, { quoted: message });
      }

      const newly = db.checkAchievements(userId);
      let text = `✅ *QUEST SELESAI*\n\n${result.quest.label}\n💰 +${result.quest.gold} Gold\n✨ +${result.quest.exp} EXP`;

      if (result.expResult?.levelUp) {
        text += `\n\n🎉 LEVEL UP! Sekarang Level ${db.getUser(userId).level}`;
      }
      if (newly.length) {
        text += `\n\n🏅 Achievement: ${newly.map((a) => a.name).join(", ")}`;
      }

      return await client.sendMessage(sender, { text }, { quoted: message });
    }

    const quests = db.getQuests(userId);
    const done = quests.filter((q) => q.claimed).length;

    const text = `📜 *QUEST HARIAN*\n\n` +
      quests.map((q, i) => {
        const status = q.claimed ? "✅" : q.progress >= q.target ? "🎁" : "⏳";
        return `${status} ${i + 1}. ${q.label}\n   ${bar(q.progress, q.target)} ${q.progress}/${q.target}\n   💰 ${q.gold} | ✨ ${q.exp}`;
      }).join("\n\n") +
      `\n\nSelesai: ${done}/${quests.length}\nKlaim: quest claim <nomor>`;

    const rows = quests.map((q, i) => ({
      id: `quest claim ${i + 1}`,
      title: q.claimed ? `✅ ${q.label}` : `${q.progress >= q.target ? "🎁" : "⏳"} ${q.label}`,
      description: `${q.progress}/${q.target} • ${q.gold} gold + ${q.exp} exp`
    }));

    return await client.sendInteractiveMessage(sender, {
      text,
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({ title: "Klaim Quest", sections: [{ title: "Quest Hari Ini", rows }] })
        }
      ]
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in quest command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "quest",
  command: ["quest", "misi"],
  category: "rpg",
  description: "Quest harian dan klaim reward",
  visible: true,
  execute: execute
};
