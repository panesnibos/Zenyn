const bank = require("../../lib/funbank");
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, interactive, select, quick, pick, token, identity, timedStore, cooldown } = require("../../lib/featureutil");

const sessions = timedStore();
const execute = async (client, message, args) => {
  const uid = identity(message);
  const chat = message.key.remoteJid;
  const key = `${chat}:${uid}`;
  const current = sessions.get(key);
  if (args[0] === "answer") {
    if (!current || current.id !== args[1]) return reply(client, message, "⌛ Kuis sudah selesai/kedaluwarsa, atau bukan milikmu.");
    if (!/^[0-3]$/.test(args[2] || "")) throw new Error("Pilihan jawaban tidak valid.");
    sessions.delete(key);
    const correct = Number(args[2]) === current.quiz.answer;
    return interactive(client, message,
      `${correct ? "✅ Benar! Skor sesi: 1/1" : "❌ Belum tepat. Skor sesi: 0/1"}\nJawaban: ${current.quiz.options[current.quiz.answer]}\n\nTanpa reward gold/EXP.`,
      [quick("Main Lagi", "tebak")]);
  }
  if (args[0] === "stop") {
    sessions.delete(key);
    return reply(client, message, "Kuis milikmu dihentikan.");
  }
  if (current) return reply(client, message, `Masih ada kuis aktif. Jawab lewat tombol sebelumnya atau ${getPrefix(message)}tebak stop.`);
  cooldown(message, "tebak");
  const game = sessions.set(key, { id: token(), quiz: pick(bank.load().tebak) }, 60000);
  try {
    return await interactive(client, message, `🧠 *TEBAK KUIS*\n\n${game.quiz.question}\n\nWaktu: 60 detik. Hanya kamu yang bisa menjawab.`, [
      select("Pilih Jawaban", game.quiz.options.map((option, i) => ({
        title: `${"ABCD"[i]}. ${option}`, id: `tebak answer ${game.id} ${i}`, description: "Jawab kuis"
      })))
    ]);
  } catch (err) { sessions.delete(key); throw err; }
};

module.exports = {
  name: "tebak", command: ["tebak", "kuis"], category: "fun", visible: true,
  description: "Kuis 60 detik lewat tombol, tanpa reward RPG",
  execute: guarded("tebak", execute)
};
