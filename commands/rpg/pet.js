const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { randInt } = require("../../lib/rpgcombat");

const PETS = [
  { id: "slime", name: "Slime", emoji: "🟢" },
  { id: "wolf", name: "Wolf", emoji: "🐺" },
  { id: "fox", name: "Fox", emoji: "🦊" },
  { id: "dragon", name: "Baby Dragon", emoji: "🐲" },
  { id: "phoenix", name: "Phoenix", emoji: "🔥" }
];

const ADOPT_COST = 1000;
const TRAIN_COST = 300;
const TRAIN_CD = 30000;
const MAX_LEVEL = 30;

const expNeed = (level) => Math.floor(50 * level * 1.4);

const petText = (pet) => {
  if (!pet) return "Belum punya pet.";
  return `${pet.emoji} *${pet.name}* Lv.${pet.level}\n✨ EXP: ${pet.exp}/${pet.expNeeded}\n💪 Bonus: +${Math.floor(pet.level * 1.5)} ATK, +${Math.floor(pet.level * 0.8)} DEF, +${pet.level * 3} HP`;
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const action = (args[0] || "").toLowerCase();

    if (action === "adopt") {
      if (user.pet) {
        return await client.sendMessage(sender, { text: `❌ Kamu sudah punya ${user.pet.name}.` }, { quoted: message });
      }
      if (user.money < ADOPT_COST) {
        return await client.sendMessage(sender, { text: `💸 Butuh ${ADOPT_COST} gold untuk adopsi pet.` }, { quoted: message });
      }

      const pet = PETS[randInt(0, PETS.length - 1)];
      db.updateUser(userId, (u) => {
        u.money -= ADOPT_COST;
        u.pet = { id: pet.id, name: pet.name, emoji: pet.emoji, level: 1, exp: 0, expNeeded: expNeed(1) };
      });

      db.checkAchievements(userId);
      return await client.sendMessage(sender, {
        text: `🎉 Kamu mengadopsi ${pet.emoji} *${pet.name}*!\n💸 -${ADOPT_COST} gold\n\n${petText(db.getUser(userId).pet)}`
      }, { quoted: message });
    }

    if (action === "train") {
      if (!user.pet) {
        return await client.sendMessage(sender, { text: `❌ Kamu belum punya pet. Adopsi dulu: pet adopt` }, { quoted: message });
      }

      const now = Date.now();
      if (user.lastTrain && now - user.lastTrain < TRAIN_CD) {
        const sisa = Math.ceil((TRAIN_CD - (now - user.lastTrain)) / 1000);
        return await client.sendMessage(sender, { text: `⏳ Pet masih lelah. Coba lagi ${sisa} detik.` }, { quoted: message });
      }

      if (user.money < TRAIN_COST) {
        return await client.sendMessage(sender, { text: `💸 Butuh ${TRAIN_COST} gold untuk latihan.` }, { quoted: message });
      }

      if (user.pet.level >= MAX_LEVEL) {
        return await client.sendMessage(sender, { text: `❌ Pet sudah level maksimal (${MAX_LEVEL}).` }, { quoted: message });
      }

      let leveled = 0;
      db.updateUser(userId, (u) => {
        u.money -= TRAIN_COST;
        u.lastTrain = now;
        u.pet.exp += randInt(20, 40);

        while (u.pet.level < MAX_LEVEL && u.pet.exp >= u.pet.expNeeded) {
          u.pet.exp -= u.pet.expNeeded;
          u.pet.level++;
          u.pet.expNeeded = expNeed(u.pet.level);
          leveled++;
        }
      });

      db.addQuestProgress(userId, "pet", 1);
      const newly = db.checkAchievements(userId);
      const pet = db.getUser(userId).pet;

      let text = `🎓 Pet dilatih!\n💸 -${TRAIN_COST} gold\n\n${petText(pet)}`;
      if (leveled) text += `\n\n🎉 LEVEL UP x${leveled}!`;
      if (newly.length) text += `\n🏅 ${newly.map((a) => a.name).join(", ")}`;

      return await client.sendMessage(sender, { text }, { quoted: message });
    }

    const text = `🐾 *PET*\n\n${petText(user.pet)}\n\n` +
      (user.pet
        ? `Latih: *pet train* (${TRAIN_COST} gold)\nCooldown: 30 detik`
        : `Adopsi: *pet adopt* (${ADOPT_COST} gold)`);

    return await client.sendButtons(sender, {
      title: "🐾 Pet Center",
      text,
      footer: "Pet membantu menambah stats",
      buttons: user.pet
        ? [{ id: "pet train", text: "🎓 Latih" }, { id: "rpg", text: "⬅️ Kembali" }]
        : [{ id: "pet adopt", text: "🥚 Adopsi" }, { id: "rpg", text: "⬅️ Kembali" }]
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in pet command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "pet",
  command: ["pet"],
  category: "rpg",
  description: "Adopsi dan latih pet",
  visible: true,
  execute: execute
};
