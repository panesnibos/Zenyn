const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { achievements } = require("../../lib/rpgachievements");

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const newly = db.checkAchievements(userId);

    if (commandName === "title") {
      const title = args.join(" ").trim();
      if (!title) {
        return await client.sendMessage(sender, {
          text: `Contoh: title Hunter\nReset title: title none`
        }, { quoted: message });
      }

      const result = db.setTitle(userId, title);
      if (!result.ok) {
        return await client.sendMessage(sender, { text: `❌ ${result.reason}` }, { quoted: message });
      }

      return await client.sendMessage(sender, {
        text: result.title ? `🏅 Title aktif: *${result.title}*` : "🏅 Title direset."
      }, { quoted: message });
    }

    const updated = db.getUser(userId);
    const lines = achievements.map((a) => {
      const unlocked = updated.achievements.includes(a.id);
      return `${unlocked ? "✅" : "🔒"} *${a.name}* — ${a.desc}${unlocked ? `\n   title: ${a.title}` : ""}`;
    });

    let text = `🏅 *ACHIEVEMENT*\n\nTitle aktif: *${updated.title || "-"}*\n\n${lines.join("\n")}`;

    if (newly.length) {
      text = `🎉 Achievement baru: ${newly.map((a) => a.name).join(", ")}\n\n${text}`;
    }

    const rows = achievements
      .filter((a) => updated.achievements.includes(a.id))
      .map((a) => ({
        id: `title ${a.title}`,
        title: `🏅 ${a.title}`,
        description: a.desc
      }));

    if (!rows.length) {
      return await client.sendMessage(sender, { text }, { quoted: message });
    }

    return await client.sendInteractiveMessage(sender, {
      text,
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({ title: "Pilih Title", sections: [{ title: "Title Terbuka", rows }] })
        }
      ]
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in achievement command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "achievement",
  command: ["achievement", "ach", "title"],
  category: "rpg",
  description: "Achievement dan title",
  visible: true,
  execute: execute
};
