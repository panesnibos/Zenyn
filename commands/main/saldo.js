// commands/main/saldo.js — saldo Rp pembeli (dari nokos gagal).
const saldo = require("../../lib/saldo");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { timeWIB } = require("../../lib/stamp");

const historyText = (uid) => {
  const list = saldo.history(uid, 5);
  if (!list.length) return "_Belum ada transaksi._";
  return list
    .map((e) => {
      const sign = e.amount > 0 ? "+" : "";
      const when = timeWIB(new Date(e.at)).slice(0, 5);
      return `• ${sign}${saldo.rp(e.amount)} — ${e.note || "penyesuaian"} (${when})`;
    })
    .join("\n");
};

const execute = async (client, message) => {
  const chat = message.key.remoteJid;
  const p = getPrefix(message);
  const uid = getUserId(message);

  if (!uid) {
    return client.sendMessage(chat, { text: "❌ Tidak bisa mengidentifikasi pengguna." }, { quoted: message });
  }

  if (/@g\.us$/i.test(String(chat))) {
    return client.sendMessage(
      chat,
      { text: `💳 Saldo hanya ditampilkan di chat pribadi. Ketik *${p}saldo* di DM bot.` },
      { quoted: message }
    );
  }

  const amount = saldo.get(uid);
  const text = [
    "💳 *SALDO*",
    "",
    `Pemilik : +${uid}`,
    `Saldo   : ${saldo.rp(amount)}`,
    "",
    "Riwayat terakhir:",
    historyText(uid),
    "",
    "Saldo masuk otomatis kalau nomor virtual (nokos) gagal, dan bisa dipakai untuk nokos, premium, atau sewa bot."
  ].join("\n");

  return client.sendMessage(chat, { text }, { quoted: message });
};

module.exports = {
  name: "saldo",
  command: ["saldo", "dompet", "saldoku"],
  category: "main",
  description: "Lihat saldo Rp dan riwayatnya",
  visible: true,
  execute
};
