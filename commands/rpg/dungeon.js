const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId, makeBar } = require("../../lib/rpgutil");
const { simulateFight, equipmentDrop, randInt } = require("../../lib/rpgcombat");

const MAX_FLOOR = 50;
const COOLDOWN = 10000;

const floorBoss = (floor) => ({
  name: `Dungeon Boss Lv.${floor}`,
  emoji: floor % 10 === 0 ? "👑" : "👹",
  level: floor,
  hp: 50 + floor * 30,
  atk: 10 + floor * 2,
  def: 2 + floor
});

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const action = (args[0] || "").toLowerCase();
    const floor = user.stats.dungeonFloor || 1;

    if (action === "fight") {
      if (user.stats.dungeonFloor >= MAX_FLOOR) {
        return await client.sendMessage(sender, { text: `🏆 Kamu sudah menaklukkan dungeon sampai floor ${MAX_FLOOR}.` }, { quoted: message });
      }

      const now = Date.now();
      if (user.lastDungeon && now - user.lastDungeon < COOLDOWN) {
        const sisa = Math.ceil((COOLDOWN - (now - user.lastDungeon)) / 1000);
        return await client.sendMessage(sender, { text: `⏳ Tunggu ${sisa} detik sebelum masuk dungeon lagi.` }, { quoted: message });
      }

      if (user.hp <= 0) {
        return await client.sendMessage(sender, { text: "❤️ HP kamu habis. Heal dulu sebelum masuk dungeon." }, { quoted: message });
      }

      const boss = floorBoss(floor);
      const stats = db.getStats(user);
      const mode = (args[1] || "attack").toLowerCase();
      const result = simulateFight(stats, boss, mode, user.hp);

      db.setHp(userId, result.hp);
      db.updateUser(userId, (u) => {
        u.lastDungeon = now;
      });

      let text = `🏰 *DUNGEON FLOOR ${floor}*\n\n${boss.emoji} ${boss.name}\n❤️ ${boss.hp} HP | ⚔️ ${boss.atk} | 🛡 ${boss.def}\n\n`;
      text += `⚔️ Damage kamu: ${result.dealt}\n❤️ Sisa HP: ${result.hp}/${stats.maxHp}\n`;

      if (result.win) {
        const gold = 60 + floor * 20 + randInt(0, 20);
        const exp = 40 + floor * 12;
        const nextFloor = Math.min(MAX_FLOOR, floor + 1);

        db.addMoney(userId, gold);
        const expResult = db.addExp(userId, exp);
        db.updateUser(userId, (u) => {
          u.stats.dungeonFloor = nextFloor;
          u.stats.dungeonBest = Math.max(u.stats.dungeonBest || 1, floor);
        });
        db.addQuestProgress(userId, "dungeon", 1);

        let loot = null;
        if (floor % 10 === 0) {
          const item = equipmentDrop(floor >= 30 ? "Rare" : "Uncommon");
          if (item) {
            db.addItem(userId, { name: item.name, emoji: item.emoji, qty: 1 });
            loot = `${item.emoji} ${item.name}`;
          }
        }

        const newly = db.checkAchievements(userId);

        text += `\n🏆 *FLOOR CLEAR!*\n💰 +${gold} Gold\n✨ +${exp} EXP`;
        if (loot) text += `\n🎁 Drop: ${loot}`;
        if (expResult?.levelUp) text += `\n🎉 LEVEL UP!`;
        if (newly.length) text += `\n🏅 ${newly.map((a) => a.name).join(", ")}`;
        text += `\n\n➡️ Floor berikutnya: ${nextFloor}`;
      } else {
        db.updateUser(userId, (u) => {
          u.lastDeath = now;
          u.stats.deaths += 1;
        });
        text += `\n💀 *KALAH*\nKamu terlempar dari dungeon. Heal dulu!`;
      }

      return await client.sendMessage(sender, { text }, { quoted: message });
    }

    const boss = floorBoss(floor);
    const text = `🏰 *DUNGEON*\n\nFloor: ${floor}/${MAX_FLOOR}\nBest: ${user.stats.dungeonBest || 1}\n\n` +
      `${boss.emoji} ${boss.name}\n❤️ ${boss.hp} HP\n⚔️ ${boss.atk} ATK | 🛡 ${boss.def} DEF\n\n` +
      `HP kamu: ${user.hp}/${db.getStats(user).maxHp}\n${makeBar(user.hp, db.getStats(user).maxHp, 10)}\n\n` +
      `Mode: dungeon fight [attack|skill|defend]`;

    return await client.sendButtons(sender, {
      title: "🏰 Dungeon",
      text,
      footer: `Cooldown ${COOLDOWN / 1000} detik`,
      buttons: [
        { id: "dungeon fight attack", text: "⚔️ Attack" },
        { id: "dungeon fight skill", text: "✨ Skill" },
        { id: "dungeon fight defend", text: "🛡 Defend" }
      ]
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in dungeon command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "dungeon",
  command: ["dungeon", "dg"],
  category: "rpg",
  description: "Dungeon bertingkat dengan boss",
  visible: true,
  execute: execute
};
