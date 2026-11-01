const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId, resolveTarget } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { simulatePvP } = require("../../lib/rpgcombat");

const pending = new Map();
const EXPIRE = 60000;
const COOLDOWN = 10000;
const K = 32;

const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
const ratingDelta = (a, b, win) => Math.round(K * ((win ? 1 : 0) - expected(a, b)));

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const action = (args[0] || "").toLowerCase();

    if (action === "accept") {
      const challengerId = args[1];
      const challenge = pending.get(challengerId);

      if (!challenge || challenge.targetId !== userId) {
        return await client.sendMessage(sender, { text: "❌ Tantangan tidak ditemukan atau sudah kadaluarsa." }, { quoted: message });
      }
      if (Date.now() - challenge.createdAt > EXPIRE) {
        pending.delete(challengerId);
        return await client.sendMessage(sender, { text: "❌ Tantangan sudah kadaluarsa." }, { quoted: message });
      }

      const challenger = db.getUser(challengerId, "Player");
      const opponent = db.getUser(userId, message.pushName || "Player");
      const aStats = db.getStats(challenger);
      const bStats = db.getStats(opponent);

      let wager = challenge.wager;
      if (wager > 0 && (challenger.money < wager || opponent.money < wager)) wager = 0;

      const result = simulatePvP(aStats, bStats);
      const challengerWins = result.winner === 0;
      const winnerId = challengerWins ? challengerId : userId;
      const loserId = challengerWins ? userId : challengerId;

      const winner = winnerId === challengerId ? challenger : opponent;
      const loser = winnerId === challengerId ? opponent : challenger;

      const deltaWin = ratingDelta(winner.pvp.rating, loser.pvp.rating, true);
      const deltaLose = ratingDelta(loser.pvp.rating, winner.pvp.rating, false);

      db.updateUser(winnerId, (u) => {
        u.pvp.rating = Math.max(0, u.pvp.rating + deltaWin);
        u.pvp.wins += 1;
        u.stats.duelsWon += 1;
        u.lastDuel = Date.now();
        if (wager > 0) u.money += wager;
      });

      db.updateUser(loserId, (u) => {
        u.pvp.rating = Math.max(0, u.pvp.rating + deltaLose);
        u.pvp.losses += 1;
        u.stats.duelsLost += 1;
        u.lastDuel = Date.now();
        if (wager > 0) u.money = Math.max(0, u.money - wager);
      });

      pending.delete(challengerId);
      db.addQuestProgress(winnerId, "duel", 1);
      db.checkAchievements(winnerId);
      db.checkAchievements(loserId);

      const updatedWinner = db.getUser(winnerId);
      const updatedLoser = db.getUser(loserId);

      let text = `⚔️ *DUEL SELESAI*\n\n` +
        `${challenger.name} (${aStats.atk} ATK) vs ${opponent.name} (${bStats.atk} ATK)\n\n` +
        `🏆 Pemenang: *${updatedWinner.name}*\n` +
        `❤️ Sisa HP: ${challengerWins ? result.aHp : result.bHp}\n` +
        `📊 Rating: ${updatedWinner.name} ${updatedWinner.pvp.rating} (${deltaWin >= 0 ? "+" : ""}${deltaWin}) | ${updatedLoser.name} ${updatedLoser.pvp.rating} (${deltaLose >= 0 ? "+" : ""}${deltaLose})`;

      if (wager > 0) {
        text += `\n💰 Wager: ${wager} gold → ${updatedWinner.name}`;
      } else if (challenge.wager > 0) {
        text += `\n⚠️ Wager dibatalkan karena gold salah satu pemain tidak cukup.`;
      }

      return await client.sendMessage(sender, { text }, { quoted: message });
    }

    if (action === "decline") {
      const challengerId = args[1];
      const challenge = pending.get(challengerId);
      if (challenge && challenge.targetId === userId) {
        pending.delete(challengerId);
        return await client.sendMessage(sender, { text: "❌ Tantangan ditolak." }, { quoted: message });
      }
      return await client.sendMessage(sender, { text: "❌ Tantangan tidak ditemukan." }, { quoted: message });
    }

    const { targetId, rest } = await resolveTarget(message, args, client);
    const wager = Math.max(0, parseInt(rest[0]) || 0);

    if (!targetId) {
      return await client.sendMessage(sender, {
        text: `⚔️ *DUEL*\n\nRating: ${user.pvp.rating} | W: ${user.pvp.wins} | L: ${user.pvp.losses}\n\n` +
          `Tantang: ${p}duel @user [wager]\nAtau reply pesan target: ${p}duel [wager]`
      }, { quoted: message });
    }

    if (targetId === userId) {
      return await client.sendMessage(sender, { text: "❌ Tidak bisa duel dengan diri sendiri." }, { quoted: message });
    }

    if (user.lastDuel && Date.now() - user.lastDuel < COOLDOWN) {
      const sisa = Math.ceil((COOLDOWN - (Date.now() - user.lastDuel)) / 1000);
      return await client.sendMessage(sender, { text: `⏳ Tunggu ${sisa} detik sebelum duel lagi.` }, { quoted: message });
    }

    if (wager > 0 && user.money < wager) {
      return await client.sendMessage(sender, { text: `💸 Gold kamu tidak cukup untuk wager ${wager}.` }, { quoted: message });
    }

    const target = db.getUser(targetId, "Player");
    pending.set(userId, { targetId, wager, createdAt: Date.now() });

    return await client.sendButtons(sender, {
      title: "⚔️ Tantangan Duel",
      text: `*${user.name}* menantang *${target.name}*!\n${wager > 0 ? `💰 Wager: ${wager} gold\n` : ""}\n${target.name}, terima tantangan?`,
      footer: "Berlaku 60 detik",
      buttons: [
        { id: `duel accept ${userId}`, text: "✅ Terima" },
        { id: `duel decline ${userId}`, text: "❌ Tolak" }
      ]
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in duel command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "duel",
  command: ["duel"],
  category: "rpg",
  description: "Tantang pemain lain duel",
  visible: true,
  execute: execute
};
