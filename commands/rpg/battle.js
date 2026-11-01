const logger = require("../../lib/logger");
const fs = require("fs");
const path = require("path");
const { db } = require("../../lib/rpgdb");
const { getUserId, makeBar } = require("../../lib/rpgutil");
const { simulateFight, equipmentDrop, randInt } = require("../../lib/rpgcombat");

let monsters = {};
try {
  monsters = JSON.parse(fs.readFileSync(path.join(__dirname, "../../database/rpg/monster.json")));
} catch {
  logger.info("❌ monster.json error");
}

const COOLDOWN = 2600;
const DEATH_COOLDOWN = 20000;
const SKILL_COOLDOWN = 12000;

const MODES = {
  attack: { label: "⚔️ Attack", desc: "Serangan normal" },
  skill: { label: "✨ Skill", desc: "Damage besar, 20% miss" },
  defend: { label: "🛡 Defend", desc: "Kurangi damage masuk 50%" }
};

const lootFor = (user) => {
  const rarity =
    user.level >= 50 ? "Legendary" :
    user.level >= 40 ? "Epic" :
    user.level >= 25 ? "Rare" :
    user.level >= 10 ? "Uncommon" :
    "Common";

  if (Math.random() < 0.15) {
    const item = equipmentDrop(rarity);
    if (item) return item;
  }
  if (Math.random() < 0.35) {
    const materials = ["herb", "ore", "wood", "stone", "iron"];
    const key = materials[randInt(0, materials.length - 1)];
    const defs = {
      herb: { name: "Herb", emoji: "🌿" },
      ore: { name: "Ore", emoji: "🪨" },
      wood: { name: "Wood", emoji: "🪵" },
      stone: { name: "Stone", emoji: "🧱" },
      iron: { name: "Iron Ingot", emoji: "🔩" }
    };
    return { name: defs[key].name, emoji: defs[key].emoji, qty: randInt(1, 2), material: true };
  }
  return null;
};

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  const user = db.getUser(userId, message.pushName || "Player");
  const now = Date.now();

  if (user.lastDeath && now - user.lastDeath < DEATH_COOLDOWN) {
    const sisa = Math.ceil((DEATH_COOLDOWN - (now - user.lastDeath)) / 1000);
    return await client.sendMessage(sender, { text: `Kamu mati dipertarungan\n\n⏳ Istirahat ${sisa} detik` }, { quoted: message });
  }

  if (user.lastBattle && now - user.lastBattle < COOLDOWN) {
    const sisa = Math.ceil((COOLDOWN - (now - user.lastBattle)) / 1000);
    return await client.sendMessage(sender, { text: `Kamu masih lelah\n\n⏳ Istirahat ${sisa} detik` }, { quoted: message });
  }

  const stats = db.getStats(user);
  const percent = user.hp / stats.maxHp;

  if (percent <= 0.1) {
    return await client.sendButtons(sender, {
      title: "⚠️ HP KRITIS",
      text: `HP kamu ${user.hp}/${stats.maxHp}\nGunakan heal!`,
      buttons: [{ id: "heal", text: "Heal 🍹" }]
    }, { quoted: message });
  }

  const mode = (args[0] || "").toLowerCase();

  if (!MODES[mode]) {
    return await client.sendButtons(sender, {
      title: "⚔️ Battle",
      text: `❤️ HP: ${user.hp}/${stats.maxHp}\n${makeBar(user.hp, stats.maxHp, 10)}\n` +
        `⚔️ ATK: ${stats.atk} | 🛡 DEF: ${stats.def}\n` +
        `✨ Gold bonus: +${Math.round(stats.goldBonus * 100)}%\n\n` +
        `Pilih aksi tempur:\n${Object.values(MODES).map((m) => `${m.label} — ${m.desc}`).join("\n")}`,
      footer: `Cooldown ${COOLDOWN / 1000} detik`,
      buttons: [
        { id: "battle attack", text: "⚔️ Attack" },
        { id: "battle skill", text: "✨ Skill" },
        { id: "battle defend", text: "🛡 Defend" }
      ]
    }, { quoted: message });
  }

  if (mode === "skill" && user.lastSkill && now - user.lastSkill < SKILL_COOLDOWN) {
    const sisa = Math.ceil((SKILL_COOLDOWN - (now - user.lastSkill)) / 1000);
    return await client.sendMessage(sender, { text: `✨ Skill masih cooldown ${sisa} detik.` }, { quoted: message });
  }

  try {
    const allMonsters = Object.values(monsters);
    const maxLevel = user.level + 2;
    const available = allMonsters.filter((m) => m.level <= maxLevel);
    const pool = available.length ? available : allMonsters;

    const totalEnemy = randInt(1, 3);
    const enemies = [];
    for (let i = 0; i < totalEnemy; i++) {
      enemies.push({ ...pool[randInt(0, pool.length - 1)] });
    }

    let playerHp = user.hp;
    let totalExp = 0;
    let totalGold = 0;
    let kills = 0;
    let dealt = 0;
    let missed = 0;
    let log = "";

    for (const enemy of enemies) {
      const result = simulateFight(stats, enemy, mode, playerHp);
      playerHp = result.hp;
      dealt += result.dealt;
      missed += result.missed;

      log += `\n${enemy.emoji || "👹"} ${enemy.name} (Lv.${enemy.level})\n💥 Damage: ${result.dealt}${result.win ? " ✅" : " ❌"}`;

      if (result.win) {
        kills++;
        totalExp += enemy.exp;
        totalGold += enemy.gold;
      }

      if (playerHp <= 0) break;
    }

    if (mode === "defend" && playerHp > 0) {
      playerHp = Math.min(stats.maxHp, playerHp + Math.floor(stats.maxHp * 0.1));
    }

    db.setHp(userId, playerHp);
    db.updateUser(userId, (u) => {
      u.lastBattle = now;
      u.stats.battles += 1;
      u.stats.kills += kills;
      if (mode === "skill") u.lastSkill = now;
    });

    let text = `⚔️ *BATTLE ${MODES[mode].label} (${totalEnemy} Musuh)*\n\n`;
    text += `❤️ HP: ${Math.max(0, playerHp)}/${stats.maxHp}\n`;
    text += `💥 Total damage: ${dealt}${missed ? ` | Miss: ${missed}` : ""}\n`;
    text += `────────────${log}\n────────────`;

    let loot = null;

    if (playerHp > 0) {
      const gold = Math.floor(totalGold * (1 + stats.goldBonus));
      const expResult = db.addExp(userId, totalExp);
      db.addMoney(userId, gold);

      loot = lootFor(user);
      if (loot) {
        db.addItem(userId, { name: loot.name, emoji: loot.emoji, qty: loot.qty || 1 });
      }

      db.addQuestProgress(userId, "battle", 1);
      db.addQuestProgress(userId, "kill", kills);
      const newly = db.checkAchievements(userId);

      text += `\n\n🏆 MENANG\n+${totalExp} EXP\n+${gold} Gold`;
      if (loot) text += `\n🎁 Loot: ${loot.emoji} ${loot.name}${loot.qty ? ` x${loot.qty}` : ""}`;

      if (expResult?.levelUp) {
        const updated = db.getUser(userId);
        text += `\n────────────\n\n✨ LEVEL UP\nSekarang Level ${updated.level}`;

        if (expResult.rewards.length) {
          text += `\n🎁 Reward:`;
          for (const r of expResult.rewards) {
            if (r.gold) text += `\n💰 +${r.gold}`;
            if (r.items) {
              for (const i of r.items) text += `\n${i.emoji || "📦"} ${i.name} x${i.qty}`;
            }
          }
        }
      }

      if (newly.length) text += `\n\n🏅 Achievements: ${newly.map((a) => a.name).join(", ")}`;
    } else {
      db.updateUser(userId, (u) => {
        u.lastDeath = now;
        u.stats.deaths += 1;
      });
      text += `\n\n💀 KALAH\nCooldown 20 detik`;
    }

    await client.sendMessage(sender, { text }, { quoted: message });

  } catch (err) {
    logger.error("Error in battle command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "battle",
  command: ["battle", "fight"],
  category: "rpg",
  description: "Bertarung dengan monster",
  visible: true,
  execute: execute
};
