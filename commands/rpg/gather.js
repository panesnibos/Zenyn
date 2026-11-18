const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { findItemDef } = require("../../lib/rpgitems");
const { randInt } = require("../../lib/rpgcombat");
const { cd } = require("../../lib/rpglimit");

const COOLDOWN = 25000;
const COOLDOWN_PREMIUM = 15000;

const SPOTS = {
  fish: { label: "Memancing", main: "fish", emoji: "🎣", rare: "rare-fish" },
  mine: { label: "Menambang", main: "ore", emoji: "⛏️", rare: "mithril-ore" },
  chop: { label: "Menebang", main: "wood", emoji: "🪓", rare: "hardwood" },
  wood: { label: "Menebang", main: "wood", emoji: "🪓", rare: "hardwood" },
  herb: { label: "Mencari herbal", main: "herb", emoji: "🌿", rare: "moon-herb" }
};

// tambang dalam: butuh level, cooldown lebih lama, tapi ada mithril/crystal/diamond
const DEEP_CD = 40000;
const DEEP_MIN_LEVEL = 10;

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const raw = ["fish", "mine", "chop"].includes(commandName) ? [commandName, ...args] : args;
    const type = ["fish", "mine", "chop"].includes(commandName) ? commandName : (args[0] || "").toLowerCase();
    const spot = SPOTS[type];
    const deep = spot?.main === "ore" && String(raw[1] || "").toLowerCase() === "deep";

    if (!spot) {
      return await client.sendMessage(sender, {
        text: `🌿 *GATHER*\n\nPilih lokasi:\n${p}gather fish\n${p}gather mine\n${p}mine deep (level ${DEEP_MIN_LEVEL}+, ada mithril/diamond)\n${p}gather chop\n${p}gather herb\n\nCooldown: 25 detik (premium 15 detik, tambang dalam 40 detik)`
      }, { quoted: message });
    }

    if (deep && (user.level || 1) < DEEP_MIN_LEVEL) {
      return await client.sendMessage(sender, { text: `⛏️ Tambang dalam butuh level ${DEEP_MIN_LEVEL}. Level kamu ${user.level || 1}.` }, { quoted: message });
    }

    const now = Date.now();
    const cdGather = deep ? DEEP_CD : cd(user, COOLDOWN, COOLDOWN_PREMIUM);
    if (user.lastGather && now - user.lastGather < cdGather) {
      const sisa = Math.ceil((cdGather - (now - user.lastGather)) / 1000);
      return await client.sendMessage(sender, { text: `⏳ Kamu masih lelah. Coba lagi ${sisa} detik.` }, { quoted: message });
    }

    const mainDef = findItemDef(spot.main);
    const qty = deep ? randInt(2, 5) : randInt(1, 3);
    const results = [`${mainDef.emoji} ${mainDef.name} x${qty}`];
    const drop = (key, n) => {
      const def = findItemDef(key);
      if (!def) return 0;
      db.addItem(userId, { name: def.name, emoji: def.emoji, qty: n });
      results.push(`${def.emoji} ${def.name} x${n}`);
      return n;
    };

    db.updateUser(userId, (u) => {
      u.lastGather = now;
    });

    db.addItem(userId, { name: mainDef.name, emoji: mainDef.emoji, qty });
    let total = qty;

    if (Math.random() < 0.25) total += drop("herb", randInt(1, 2));

    // bait: otomatis dipakai saat memancing untuk hasil tambahan
    if (spot.main === "fish" && Number(user.bait) > 0) {
      db.updateUser(userId, (u) => { u.bait = Math.max(0, (Number(u.bait) || 0) - 1); });
      total += drop("fish", 1);
      results.push("🪱 Bait terpakai");
    }

    // bahan khas tiap lokasi: ikan langka, kayu keras, herbal malam, mithril
    if (spot.rare && Math.random() < 0.15) total += drop(spot.rare, 1);

    if (spot.main === "ore") {
      if (Math.random() < 0.5) total += drop("stone", randInt(1, 3));
      if (Math.random() < (deep ? 0.4 : 0.2)) total += drop("iron", randInt(1, 2));
      if (deep) {
        if (Math.random() < 0.08) total += drop("mithril-ore", 1);
        if (Math.random() < 0.03) total += drop("crystal", 1);
        if (Math.random() < 0.01) total += drop("diamond", 1);
        if (Math.random() < 0.1) {
          db.setHp(userId, Math.max(1, (user.hp || 1) - 15));
          results.push("💨 Gas beracun! -15 HP");
        }
      }
    }

    db.addStat(userId, "gathered", total);
    db.addQuestProgress(userId, "gather", total);
    const newly = db.checkAchievements(userId);

    let text = `${spot.emoji} *${(deep ? spot.label + " (dalam)" : spot.label).toUpperCase()}*\n\n🎁 Hasil:\n${results.join("\n")}`;
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
