const { resolvePn } = require("../../lib/lid");
const { normalizeNumber, isLidJid } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, contextOf, interactive, quick, token, identity, timedStore, cooldown } = require("../../lib/featureutil");

const sessions = timedStore();
const choices = ["batu", "gunting", "kertas"];
const execute = async (client, message, args) => {
  const uid = identity(message);
  const chat = message.key.remoteJid;
  const action = String(args[0] || "").toLowerCase();
  const isGroup = /@g\.us$/i.test(chat);
  if (["accept", "reject", "choose"].includes(action)) {
    const game = sessions.get(args[1]);
    if (!game) return reply(client, message, "⌛ Tantangan suit sudah selesai/kedaluwarsa.");
    if (!game.players.includes(uid)) throw new Error("Tantangan ini bukan untukmu.");
    if (action === "choose") {
      if (isGroup || game.status !== "playing") throw new Error("Pilih suit lewat tombol di chat pribadi setelah tantangan diterima.");
      if (!choices.includes(args[2])) throw new Error("Pilihan suit tidak valid.");
      if (game.picks[uid]) throw new Error("Kamu sudah memilih. Tunggu lawanmu.");
      game.picks[uid] = args[2];
      const [a, b] = game.players.map((id) => game.picks[id]);
      if (!a || !b) return reply(client, message, "✅ Pilihan tersimpan. Menunggu lawan memilih.");
      sessions.delete(game.id);
      const win = a === b ? null : (choices.indexOf(a) + 1) % 3 === choices.indexOf(b) ? game.players[0] : game.players[1];
      const labels = game.jids.map(normalizeNumber);
      await client.sendMessage(game.chat, {
        text: `✊ *HASIL SUIT*\n\n@${labels[0]}: ${a}\n@${labels[1]}: ${b}\n\n${win ? `Pemenang: @${labels[game.players.indexOf(win)]}` : "Hasil: Seri!"}\nTanpa reward gold/EXP.`,
        mentions: game.jids
      });
      return reply(client, message, "✅ Kedua pemain sudah memilih. Hasil dikirim ke grup.");
    }
    if (chat !== game.chat || uid !== game.players[1] || game.status !== "pending") throw new Error("Hanya pemain yang ditantang bisa menerima/menolak di grup asal.");
    if (action === "reject") {
      sessions.delete(game.id);
      return reply(client, message, "Tantangan suit ditolak.");
    }
    game.status = "playing";
    sessions.set(game.id, game, 60000);
    try {
      for (const id of game.players) {
        const dm = { key: { remoteJid: `${id}@s.whatsapp.net` } };
        await interactive(client, dm, "✊ *SUIT*\n\nPilih secara rahasia. Waktu 60 detik; pilihan tidak bisa diubah.",
          choices.map((choice) => quick(choice, `suit choose ${game.id} ${choice}`)));
      }
    } catch (err) {
      sessions.delete(game.id);
      throw new Error("Gagal mengirim pilihan pribadi. Kedua pemain perlu chat bot dulu, lalu tantang ulang.");
    }
    return reply(client, message, "📩 Tantangan diterima! Kedua pemain memilih lewat chat pribadi bot (60 detik).");
  }
  if (!isGroup) throw new Error("Mulai tantangan suit di grup dengan mention atau reply lawan.");
  const ctx = contextOf(message);
  const targetJid = ctx.mentionedJid?.[0] || ctx.participant;
  if (!targetJid) return reply(client, message, `✊ *SUIT PvP*\n\n${getPrefix(message)}suit @lawan\nAtau reply pesan lawan. Pilihan dikirim ke DM, tanpa reward.`);
  const meta = await client.groupMetadata(chat);
  const participant = meta.participants.find((p) => [p.id, p.lid, p.phoneNumber].includes(targetJid));
  if (!participant) throw new Error("Lawan harus anggota grup ini.");
  const targetIdentity = participant.phoneNumber || participant.id;
  const resolved = await resolvePn(client, targetIdentity);
  if (!resolved || (isLidJid(targetIdentity) && resolved === normalizeNumber(targetIdentity))) throw new Error("Nomor lawan belum dikenali. Minta lawan chat bot dulu, lalu tantang ulang.");
  const opponent = String(resolved);
  const botIds = [client.user?.id, client.user?.lid].filter(Boolean).map(normalizeNumber);
  if (!opponent || opponent === uid || botIds.includes(opponent) || botIds.includes(normalizeNumber(targetJid))) throw new Error("Pilih lawan selain diri sendiri dan bot.");
  if (sessions.values().some((g) => g.chat === chat && g.players.some((id) => [uid, opponent].includes(id)))) throw new Error("Salah satu pemain masih punya tantangan aktif. Tunggu hingga selesai/kedaluwarsa.");
  cooldown(message, "suit");
  const game = { id: token(), chat, players: [uid, opponent], jids: [`${uid}@s.whatsapp.net`, targetJid], status: "pending", picks: {} };
  sessions.set(game.id, game, 60000);
  try {
    return await interactive(client, message, `✊ *TANTANGAN SUIT*\n\n@${uid} menantang @${normalizeNumber(targetJid)}!\nLawan punya 60 detik untuk menerima.`, [
      quick("Terima", `suit accept ${game.id}`), quick("Tolak", `suit reject ${game.id}`)
    ], { mentions: game.jids });
  } catch (err) { sessions.delete(game.id); throw err; }
};

module.exports = {
  // Do not set group:true: private choice buttons must also reach this handler.
  name: "suit", command: ["suit"], category: "fun", visible: true,
  description: "Suit PvP, pilihan rahasia lewat DM, tanpa reward",
  execute: guarded("suit", execute)
};
