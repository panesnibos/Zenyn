// commands/rpg/mulung.js — memulung sampah: 1 kantong sampah + 2 item acak.
const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { randInt } = require("../../lib/rpgcombat");
const { cd } = require("../../lib/rpglimit");
const { findItemDef, shop } = require("../../lib/rpgitems");

const CD = 4000;
const CD_PREMIUM = 2500;
const BAG_KEY = "kantong-sampah";

// pool item "entah apa" — tanpa key, tanpa diamond/crystal/gear
const POOL = [
  { key: "herb", weight: 20 },
  { key: "wood", weight: 18 },
  { key: "stone", weight: 16 },
  { key: "ore", weight: 14 },
  { key: "fish", weight: 12 },
  { key: "iron", weight: 8 },
  { key: "potion", weight: 6 },
  { key: "bait", weight: 3 },
  { key: "exp-scroll", weight: 2 },
  { key: "pet-food", weight: 1 }
];

const pickKey = () => {
  const total = POOL.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * total;
  for (const item of POOL) {
    rand -= item.weight;
    if (rand <= 0) return item.key;
  }
  return POOL[0].key;
};

const sellOf = (key) => Number(shop[key]?.sell || 0);

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const now = Date.now();
    const cooldown = cd(user, CD, CD_PREMIUM);

    if (user.lastMulung && now - user.lastMulung < cooldown) {
      const sisa = Math.ceil((cooldown - (now - user.lastMulung)) / 1000);
      return await client.sendMessage(sender, { text: `⏳ Tunggu ${sisa} detik sebelum memulung lagi.` }, { quoted: message });
    }

    db.updateUser(userId, (u) => {
      u.lastMulung = now;
    });

    const bag = findItemDef(BAG_KEY);
    const bagQty = randInt(4, 12);
    db.addItem(userId, { name: bag.name, emoji: bag.emoji, qty: bagQty });

    const results = [`${bag.emoji} ${bag.name} x${bagQty}`];
    let total = bagQty;
    let value = bagQty * sellOf(BAG_KEY);

    for (let i = 0; i < 2; i++) {
      const def = findItemDef(pickKey());
      const qty = randInt(1, 2);
      db.addItem(userId, { name: def.name, emoji: def.emoji, qty });
      results.push(`${def.emoji} ${def.name} x${qty}`);
      total += qty;
      value += qty * sellOf(def.key);
    }

    db.addStat(userId, "gathered", total);
    db.addQuestProgress(userId, "mulung", 1);
    const newly = db.checkAchievements(userId);

    let text = `♻️ *MEMULUNG*\n\nKamu memulung di belakang pasar...\n\n🗑️ *Hasil:*\n${results.join("\n")}`;
    text += `\n\n💰 Nilai jual: ${value} gold`;
    text += `\n⏳ Cooldown ${cooldown / 1000} detik`;
    if (newly.length) text += `\n\n🏅 ${newly.map((a) => a.name).join(", ")}`;

    return await client.sendMessage(sender, { text }, { quoted: message });
  } catch (err) {
    logger.error("Error in mulung command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "mulung",
  command: ["mulung", "pulung"],
  category: "rpg",
  visible: true,
  description: "Memulung sampah: kantong sampah + 2 item acak",
  execute: execute,
  _internal: { POOL, BAG_KEY, CD, CD_PREMIUM, pickKey, sellOf }
};
