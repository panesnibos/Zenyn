// commands/owner/nokosretry.js — ulangi pembuatan nomor virtual untuk tagihan
// nokos yang sudah dibayar tapi gagal (mis. saldo AutoOrder kurang saat itu).
const logger = require("../../lib/logger");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const autopay = require("../../lib/autopay");
const nokos = require("../../lib/nokos");

const failedNokos = () => autopay.list((i) => i.kind === "nokos" && i.status === "failed");

const listText = (p, list) => {
  if (!list.length) return "✅ Tidak ada tagihan nomor virtual yang gagal.";
  const lines = list.slice(0, 10).map(
    (i) =>
      `• *${i.id}* — ${i.title}\n  Pembeli: ${i.buyer} | ${autopay.rp(i.payAmount)}\n  Sebab: ${i.note || "-"}`
  );
  return [
    "🧾 *TAGIHAN NOKOS GAGAL*",
    "",
    ...lines,
    "",
    `Ulangi: *${p}nokosretry <invoice>*`
  ].join("\n");
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  autopay.attach(client);
  nokos.attach(client);

  const id = String(args?.[0] || "").trim().toUpperCase();
  if (!id) {
    return client.sendMessage(sender, { text: listText(p, failedNokos()) }, { quoted: message });
  }

  const inv = autopay.get(id);
  if (!inv) {
    return client.sendMessage(sender, { text: `❌ Invoice *${id}* tidak ditemukan.` }, { quoted: message });
  }

  try {
    await autopay.retryNokos(inv);
    const rec = nokos.get(inv.id);
    logger.cmd(`nokosretry: ${id} -> ${rec?.orderId || "-"} oleh ${message.key.participant || sender}`);

    return client.sendMessage(
      sender,
      {
        text: [
          `✅ *TAGIHAN ${id} DIULANG*`,
          "",
          `Order   : ${rec?.orderId || "-"}`,
          `Nomor   : ${rec?.phone || "(sedang disiapkan)"}`,
          `Layanan : ${rec?.serviceName || inv.title}`,
          `Pembeli : ${inv.buyer}`,
          "",
          "Pembeli sudah dinotifikasi. OTP dipantau otomatis; kalau 10 menit kosong, nomor diganti sendiri."
        ].join("\n")
      },
      { quoted: message }
    );
  } catch (err) {
    logger.warn(`nokosretry: ${id} gagal: ${err.message}`);
    return client.sendMessage(sender, { text: `❌ Gagal mengulang ${id}: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "nokosretry",
  command: ["nokosretry", "ulangnokos"],
  category: "owner",
  description: "Ulangi pesanan nomor virtual untuk tagihan nokos yang gagal (owner)",
  visible: true,
  execute
};
