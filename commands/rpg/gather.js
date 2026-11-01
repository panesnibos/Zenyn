const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { findItemDef } = require("../../lib/rpgitems");
const { randInt } = require("../../lib/rpgcombat");

const COOLDOWN = 45000;

const SPOTS = {
  fish: { label: "Memancing", main: "fish", emoji: "🎣" },
  mine: { label: "Menambang", main: "ore", emoji: "⛏️" },
  chop: { label: "Menebang", main: "wood", emoji: "🪓" },
  wood: { label: "Menebang", main: "wood", emoji: "🪓" },
  herb: { label: "Mencari herbal", main: "herb", emoji: "🌿" }
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const type = ["fish", "mine", "chop"].includes(commandName) ? commandName : (args[0] || "").toLowerCase();
    const spot = SPOTS[type];

    if (!spot) {
      return await client.sendMessage(sender, {
        text: `🌿 *GATHER*\n\nPilih lokasi:\n${p}gather fish\n${p}gather mine\n${p}gather chop\n${p}gather herb\n\nCooldown: 45 detik`
      }, { quoted: message });
    }

    const now = Date.now();
    if (user.lastGather && now - user.lastGather < COOLDOWN) {
      const sisa = Math.ceil((COOLDOWN - (now - user.lastGather)) / 1000);
      return await client.sendMessage(sender, { text: `⏳ Kamu masih lelah. Coba lagi ${sisa} detik.` }, { quoted: message });
    }

    const mainDef = findItemDef(spot.main);
    const qty = randInt(1, 3);
    const results = [`${mainDef.emoji} ${mainDef.name} x${qty}`];

    db.updateUser(userId, (u) => {
      u.lastGather = now;
    });

    db.addItem(userId, { name: mainDef.name, emoji: mainDef.emoji, qty });
    let total = qty;

    if (Math.random() < 0.25) {
      const bonusDef = findItemDef("herb");
      const bonusQty = randInt(1, 2);
      db.addItem(userId, { name: bonusDef.name, emoji: bonusDef.emoji, qty: bonusQty });
      results.push(`${bonusDef.emoji} ${bonusDef.name} x${bonusQty}`);
      total += bonusQty;
    }

    if (spot.main === "ore") {
      if (Math.random() < 0.5) {
        const stoneDef = findItemDef("stone");
        const stoneQty = randInt(1, 3);
        db.addItem(userId, { name: stoneDef.name, emoji: stoneDef.emoji, qty: stoneQty });
        results.push(`${stoneDef.emoji} ${stoneDef.name} x${stoneQty}`);
        total += stoneQty;
      }
      if (Math.random() < 0.2) {
        const ironDef = findItemDef("iron");
        const ironQty = randInt(1, 2);
        db.addItem(userId, { name: ironDef.name, emoji: ironDef.emoji, qty: ironQty });
        results.push(`${ironDef.emoji} ${ironDef.name} x${ironQty}`);
        total += ironQty;
      }
    }

    db.addStat(userId, "gathered", total);
    db.addQuestProgress(userId, "gather", total);
    const newly = db.checkAchievements(userId);

    let text = `${spot.emoji} *${spot.label.toUpperCase()}*\n\n🎁 Hasil:\n${results.join("\n")}`;
    if (newly.length) text += `\n\n🏅 ${newly.map((a) => a.name).join(", ")}`;

    return await client.sendMessage(sender, { text }, { quoted: message });

  } catch (err) {
    logger.error("Error in gather command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "gather",
  command: ["gather", "kumpul", "fish", "mine", "chop"],
  category: "rpg",
  description: "Kumpulkan material (fish/mine/chop/herb)",
  visible: true,
  execute: execute
};
