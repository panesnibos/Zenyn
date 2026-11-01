const logger = require("../../lib/logger");
const fs = require("fs");
const path = require("path");
const { db } = require("../../lib/rpgdb");
const { getUserId, getRank } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");

const gachaPath = path.join(__dirname, "../../database/rpg/gacha.json");
let gachas = {};
try {
  gachas = JSON.parse(fs.readFileSync(gachaPath));
} catch {
  logger.info("❌ gacha.json error");
}

const getInventoryText = (user) => {
  return user.inventory.length
    ? user.inventory.slice(0, 5).map((i) => `${i.emoji || "📦"} ${i.name} x${i.qty}`).join("\n") +
        (user.inventory.length > 5 ? "\n..." : "")
    : "🎒 Kosong";
};

const buildCaption = (user) => {
  const { rank, icon } = getRank(user.level);
  return `${icon} *${user.name}*
✦ ${rank} — Level ${user.level}
────────────
💰 Gold: ${user.money}

🎒 Inventory:
${getInventoryText(user)}`;
};

const getItem = (user, name) => {
  return user.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase());
};

const pickRandomByChance = (items) => {
  const total = items.reduce((sum, i) => sum + (i.chance || 1), 0);
  let rand = Math.random() * total;
  for (let item of items) {
    rand -= item.chance || 1;
    if (rand <= 0) return item;
  }
  return items[0];
};

const openCrate = (crate, id) => {
  let results = [];
  let totalGold = 0;

  const goldReward = crate.rewards.find((r) => r.type === "gold");
  if (goldReward) {
    const gold = Math.floor(Math.random() * (goldReward.max - goldReward.min + 1)) + goldReward.min;
    totalGold += gold;
    db.addMoney(id, gold);
  }

  const itemRewards = crate.rewards.filter((r) => r.type !== "gold");
  if (itemRewards.length > 0) {
    const picked = pickRandomByChance(itemRewards);
    db.addItem(id, { name: picked.name, emoji: picked.emoji, qty: picked.qty });
    results.push(`${picked.emoji} ${picked.name} x${picked.qty}`);
  } else {
    results.push("😢 Tidak ada item");
  }

  return { results, totalGold };
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  const user = db.getUser(userId, message.pushName || "Player");
  const p = getPrefix(message);

  const isOpen = commandName === "open";

  try {
    // ================= MENU CRATE =================
    if (!isOpen) {
      const rows = Object.values(gachas).map((item) => {
        const inv = getItem(user, item.name);
        const qty = inv ? inv.qty : 0;
        return {
          id: `open ${item.name}`,
          title: `${item.emoji} ${item.name}`,
          description: `🎁 Random Item | Qty: ${qty}`
        };
      });

      return await client.sendInteractiveMessage(sender, {
        text: `🀄 Ubah Nasibmu\n\n${buildCaption(user)}`,
        interactiveButtons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Pilih Crate",
              sections: [{ title: "Daftar Crate", rows }]
            })
          }
        ]
      }, { quoted: message });
    }

    // ================= OPEN CRATE =================
    const name = (args[0] || "").toLowerCase();

    if (!name) {
      return await client.sendMessage(sender, { text: `Contoh: ${p}open bronze-key` }, { quoted: message });
    }

    const crate = gachas[name];
    if (!crate) {
      return await client.sendMessage(sender, { text: "Crate tidak ditemukan!" }, { quoted: message });
    }

    const item = getItem(user, crate.name);
    if (!item || item.qty < 1) {
      return await client.sendMessage(sender, { text: "Kamu tidak punya crate ini!" }, { quoted: message });
    }

    db.removeItem(userId, crate.name, 1);
    const { results, totalGold } = openCrate(crate, userId);

    let text = `🎁 Kamu membuka *${crate.name}*\n\n`;
    if (totalGold > 0) text += `💰 Gold: +${totalGold}\n`;
    text += `📦 Hasil:\n${results.join("\n")}`;

    return await client.sendMessage(sender, { text }, { quoted: message });

  } catch (err) {
    logger.error("Error in gacha command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "gacha",
  command: ["gacha", "crate", "open"],
  category: "rpg",
  description: "Buka crate gacha",
  visible: true,
  execute: execute
};
