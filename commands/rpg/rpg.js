const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId, getRank, makeBar } = require("../../lib/rpgutil");

const buildCaption = (user) => {
  const { rank, icon } = getRank(user.level);
  const stats = db.getStats(user);
  const expBar = makeBar(user.exp, user.expNeeded);
  const hpBar = makeBar(user.hp, stats.maxHp);
  const eq = user.equipment || {};

  const equipment = [
    `⚔️ ${eq.weapon || "-"}${user.enhance?.weapon ? ` +${user.enhance.weapon}` : ""}`,
    `🛡️ ${eq.armor || "-"}${user.enhance?.armor ? ` +${user.enhance.armor}` : ""}`,
    `💍 ${eq.accessory || "-"}${user.enhance?.accessory ? ` +${user.enhance.accessory}` : ""}`
  ].join("\n");

  return `🗡 *RPG PLAYER* 🗡

${icon} *${user.name}*
✦ ${rank} — Level ${user.level}
${user.title ? `🏅 ${user.title}` : ""}
${user.prestige ? `🌟 Prestige ${user.prestige} (+${user.prestige * 5}%)` : ""}

💰 Gold: ${user.money}
⚔️ ATK: ${stats.atk} | 🛡 DEF: ${stats.def}

❤️ HP: ${user.hp}/${stats.maxHp}
${hpBar}

✨ EXP: ${user.exp}/${user.expNeeded}
${expBar}

⚒️ Equipment:
${equipment}

${user.pet ? `🐾 Pet: ${user.pet.emoji} ${user.pet.name} Lv.${user.pet.level}` : "🐾 Pet: -"}
📊 PvP: ${user.pvp.rating} (${user.pvp.wins}W/${user.pvp.losses}L)
🏰 Dungeon: Floor ${user.stats.dungeonFloor}/${user.stats.dungeonBest} best`;
};

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const caption = buildCaption(user);

    const sections = [
      {
        title: "⚔️ Aksi",
        rows: [
          { id: "battle", title: "⚔️ Battle", description: "Lawan monster" },
          { id: "dungeon", title: "🏰 Dungeon", description: "Dungeon bertingkat" },
          { id: "raid", title: "🐉 Raid Boss", description: "Boss bersama di grup" },
          { id: "duel", title: "🤺 Duel", description: "Tantang pemain lain" },
          { id: "quest", title: "📜 Quest", description: "Misi harian" }
        ]
      },
      {
        title: "💰 Ekonomi",
        rows: [
          { id: "shop", title: "🛒 Shop", description: "Beli & jual item" },
          { id: "market", title: "🏪 Market", description: "Jual-beli antar pemain" },
          { id: "craft", title: "🛠️ Craft", description: "Buat item dari material" },
          { id: "gather", title: "🌿 Gather", description: "Cari material" },
          { id: "inventory", title: "🎒 Inventory", description: "Lihat isi tas" }
        ]
      },
      {
        title: "🧬 Karakter",
        rows: [
          { id: "equip", title: "⚒️ Equipment", description: "Pasang & upgrade gear" },
          { id: "pet", title: "🐾 Pet", description: "Adopsi & latih pet" },
          { id: "achievement", title: "🏅 Achievement", description: "Achievement & title" },
          { id: "prestige", title: "🌟 Prestige", description: "Reset untuk bonus permanen" },
          { id: "daily", title: "📅 Daily", description: "Klaim reward harian" }
        ]
      },
      {
        title: "📌 Lainnya",
        rows: [
          { id: "heal", title: "🏥 Heal", description: "Pulihkan HP" },
          { id: "gacha", title: "🎁 Crate", description: "Buka crate" },
          { id: "transfer", title: "📤 Transfer", description: "Kirim gold ke pemain" },
          { id: "leaderboard", title: "🏆 Ranking", description: "Top 10 pemain" }
        ]
      }
    ];

    await client.sendInteractiveMessage(sender, {
      title: "⚔️ RPG MENU",
      text: caption,
      footer: "Pilih aksi kamu",
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({ title: "Pilih Aksi", sections })
        }
      ]
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in rpg command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "rpg",
  command: ["rpg", "profile"],
  category: "rpg",
  description: "Menu & profil RPG",
  visible: true,
  execute: execute
};
