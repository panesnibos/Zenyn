const logger = require("../../lib/logger");
const path = require("path");
const { db } = require("../../lib/rpgdb");
const { getUserId, makeBar } = require("../../lib/rpgutil");
const { randInt, equipmentDrop } = require("../../lib/rpgcombat");
const { findItemDef } = require("../../lib/rpgitems");
const { readJson, writeJson } = require("../../lib/rpgjson");

const FILE = path.join(__dirname, "../../database/rpg/raid.json");
const ATTACK_CD = 5000;
const RESPAWN = 60000;

const BOSSES = [
  { name: "Ancient Golem", emoji: "🗿" },
  { name: "Shadow Wyrm", emoji: "🐉" },
  { name: "Abyss Titan", emoji: "👹" },
  { name: "Frost Behemoth", emoji: "🧊" }
];

const load = () => readJson(FILE, {});
const save = (data) => writeJson(FILE, data);

const bossText = (state) => {
  const top = Object.entries(state.participants || {})
    .sort((a, b) => b[1].damage - a[1].damage)
    .slice(0, 3)
    .map(([, p], i) => `${i + 1}. ${p.name} (${p.damage})`)
    .join("\n");

  return `🐉 *RAID BOSS*\n\n${state.emoji} *${state.name}* Lv.${state.level}\n❤️ ${Math.max(0, state.hp)}/${state.maxHp}\n${makeBar(Math.max(0, state.hp), state.maxHp, 12)}\n\n🏆 Top Damage:\n${top || "Belum ada"}\n\nSerang: raid attack`;
};

const spawn = (level) => {
  const boss = BOSSES[Math.floor(Math.random() * BOSSES.length)];
  const maxHp = Math.floor(600 + level * 160);
  return {
    name: boss.name,
    emoji: boss.emoji,
    level,
    hp: maxHp,
    maxHp,
    atk: Math.floor(18 + level * 4),
    def: Math.floor(4 + level * 2),
    participants: {},
    active: true,
    spawnedAt: Date.now(),
    defeatedAt: 0
  };
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  if (!sender || !sender.endsWith("@g.us")) {
    return await client.sendMessage(sender, { text: "❌ Raid hanya bisa dimainkan di grup." }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const data = load();
    let state = data[sender];
    const action = (args[0] || "").toLowerCase();

    if (action === "attack") {
      if (!state || !state.active) {
        return await client.sendMessage(sender, { text: "❌ Tidak ada raid boss aktif. Ketik raid untuk spawn." }, { quoted: message });
      }

      const now = Date.now();
      if (user.lastRaid && now - user.lastRaid < ATTACK_CD) {
        const sisa = Math.ceil((ATTACK_CD - (now - user.lastRaid)) / 1000);
        return await client.sendMessage(sender, { text: `⏳ Tunggu ${sisa} detik sebelum menyerang lagi.` }, { quoted: message });
      }

      const stats = db.getStats(user);
      const crit = Math.random() < 0.15 ? 1.5 : 1;
      const damage = Math.max(5, Math.floor((stats.atk * 1.5 - state.def + randInt(0, 10)) * crit));

      state.hp -= damage;
      const prev = state.participants[userId] || { name: user.name, damage: 0 };
      state.participants[userId] = { name: user.name, damage: prev.damage + damage };

      db.updateUser(userId, (u) => {
        u.lastRaid = now;
        u.stats.raidDamage += damage;
      });
      db.addQuestProgress(userId, "raid", 1);

      let text = `💥 *${user.name}* menyerang ${state.emoji} ${state.name}!\n⚔️ Damage: ${damage}${crit > 1 ? " (CRIT)" : ""}\n\n`;

      if (state.hp <= 0) {
        state.hp = 0;
        state.active = false;
        state.defeatedAt = now;

        const participants = Object.entries(state.participants)
          .map(([id, val]) => ({ id, ...val }))
          .sort((a, b) => b.damage - a.damage);

        const totalDamage = participants.reduce((sum, p) => sum + p.damage, 0) || 1;

        const rewardLines = [];
        for (const p of participants) {
          const share = p.damage / totalDamage;
          const gold = Math.floor(150 + state.level * 20 + share * state.maxHp * 0.3);
          const exp = Math.floor(40 + state.level * 5 + share * state.maxHp * 0.1);

          db.addMoney(p.id, gold);
          db.addExp(p.id, exp);

          if (p === participants[0] && Math.random() < 0.6) {
            const rarity = state.level >= 15 ? "Rare" : "Uncommon";
            const item = equipmentDrop(rarity);
            if (item) {
              db.addItem(p.id, { name: item.name, emoji: item.emoji, qty: 1 });
              rewardLines.push(`${p.name}: ${gold} gold, ${exp} exp, ${item.emoji} ${item.name}`);
              continue;
            }
          }

          rewardLines.push(`${p.name}: ${gold} gold, ${exp} exp`);
        }

        for (const p of participants) db.checkAchievements(p.id);

        text += `☠️ *BOSS TUMBANG!*\n\n🎁 Reward:\n${rewardLines.join("\n")}`;
      } else {
        text += bossText(state);
      }

      save(data);
      return await client.sendMessage(sender, { text }, { quoted: message });
    }

    if (!state || (!state.active && Date.now() - (state.defeatedAt || 0) > RESPAWN)) {
      state = spawn(Math.max(5, (user.level || 1) + 2 + randInt(0, 3)));
      data[sender] = state;
      save(data);
    }

    if (!state.active) {
      const sisa = Math.max(0, Math.ceil((RESPAWN - (Date.now() - (state.defeatedAt || 0))) / 1000));
      return await client.sendMessage(sender, { text: `☠️ Boss sudah tumbang. Spawn lagi dalam ${sisa} detik.` }, { quoted: message });
    }

    return await client.sendButtons(sender, {
      title: "🐉 Raid Boss",
      text: bossText(state),
      footer: "Cooldown serang 5 detik",
      buttons: [
        { id: "raid attack", text: "⚔️ Serang" },
        { id: "rpg", text: "⬅️ Kembali" }
      ]
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in raid command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "raid",
  command: ["raid", "boss"],
  category: "rpg",
  description: "Raid boss bersama di grup",
  visible: true,
  execute: execute
};
