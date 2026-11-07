const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { recipes, getRecipe, findItemDef } = require("../../lib/rpgitems");

const materialText = (materials) =>
  Object.entries(materials).map(([name, qty]) => `${name} x${qty}`).join(", ");

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const id = (args[0] || "").toLowerCase();

    if (!id) {
      const list = Object.entries(recipes).map(([key, r]) =>
        `${r.emoji || "📦"} *${r.name}* (${key})\n   ${materialText(r.materials)} + ${r.cost} gold`
      );

      const rows = Object.entries(recipes).map(([key, r]) => ({
        id: `craft ${key}`,
        title: `${r.emoji || "📦"} ${r.name}`,
        description: `${materialText(r.materials)} | ${r.cost} gold`
      }));

      return await client.sendInteractiveMessage(sender, {
        text: `🛠️ *CRAFTING*\n\n${list.join("\n\n")}\n\nCraft: ${p}craft <id>`,
        interactiveButtons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({ title: "Pilih Recipe", sections: [{ title: "Recipe", rows }] })
          }
        ]
      }, { quoted: message });
    }

    const recipe = getRecipe(id);
    if (!recipe) {
      return await client.sendMessage(sender, { text: "❌ Recipe tidak ditemukan." }, { quoted: message });
    }

    if (user.money < recipe.cost) {
      return await client.sendMessage(sender, { text: `💸 Butuh ${recipe.cost} gold. Saldo ${user.money}.` }, { quoted: message });
    }

    for (const [matName, qty] of Object.entries(recipe.materials)) {
      const name = findItemDef(matName)?.name || matName;
      if (!db.hasItem(userId, name, qty)) {
        return await client.sendMessage(sender, { text: `❌ Material kurang: ${name} x${qty}` }, { quoted: message });
      }
    }

    for (const [matName, qty] of Object.entries(recipe.materials)) {
      const name = findItemDef(matName)?.name || matName;
      db.removeItem(userId, name, qty);
    }

    db.updateUser(userId, (u) => {
      u.money -= recipe.cost;
    });

    const def = findItemDef(recipe.name);
    db.addItem(userId, { name: recipe.name, emoji: recipe.emoji || def?.emoji || "📦", qty: recipe.qty || 1 });
    db.addStat(userId, "crafted", 1);
    db.addQuestProgress(userId, "craft", 1);
    const newly = db.checkAchievements(userId);

    let text = `✅ Craft berhasil!\n📦 ${recipe.emoji || "📦"} ${recipe.name} x${recipe.qty || 1}\n💸 -${recipe.cost} gold`;
    if (newly.length) text += `\n🏅 ${newly.map((a) => a.name).join(", ")}`;

    return await client.sendMessage(sender, { text }, { quoted: message });

  } catch (err) {
    logger.error("Error in craft command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "craft",
  command: ["craft", "buat"],
  category: "rpg",
  description: "Craft item dari material",
  visible: true,
  execute: execute
};
