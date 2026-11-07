const logger = require("../../lib/logger");
const { getPrefix } = require("../../lib/prefix");
const { fetchLatest, fetchRecent, fetchFelt, formatMessage, joinButtons } = require("../../lib/quake");

const listText = (title, list, limit) => {
  const rows = list
    .slice(0, limit)
    .map(
      (q, i) =>
        `${i + 1}. *M${q.mag}* — ${q.wilayah}\n   ${q.tanggal} ${q.jam} • ${q.kedalaman}`
    );
  return `🌍 *${title}* (BMKG)\n\n${rows.join("\n\n")}\n\n_Sumber: BMKG_`;
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const mode = String(args[0] || "").toLowerCase();

  try {
    if (["help", "bantuan"].includes(mode)) {
      return await client.sendMessage(
        sender,
        {
          text: `🌍 *INFO GEMPA BMKG*\n\n${p}gempa — gempa terbaru\n${p}gempa list — 10 gempa terakhir (M5+)\n${p}gempa dirasakan — gempa dirasakan`
        },
        { quoted: message }
      );
    }

    if (["list", "terkini", "recent"].includes(mode)) {
      const list = await fetchRecent();
      return await client.sendMessage(sender, { text: listText("GEMPA TERKINI", list, 10) }, { quoted: message });
    }

    if (["dirasakan", "felt"].includes(mode)) {
      const list = await fetchFelt();
      return await client.sendMessage(sender, { text: listText("GEMPA DIRASAKAN", list, 10) }, { quoted: message });
    }

    const quake = await fetchLatest();
    const text = formatMessage(quake);
    const buttons = joinButtons();

    if (buttons.length) {
      return await client.sendInteractiveMessage(sender, { text, interactiveButtons: buttons }, { quoted: message });
    }

    return await client.sendMessage(sender, { text }, { quoted: message });
  } catch (err) {
    logger.error("Error in gempa command:", err);
    const hint = /timeout/i.test(err.message) ? " (BMKG lambat, coba lagi)" : "";
    await client.sendMessage(sender, { text: `❌ Gagal ambil data BMKG: ${err.message}${hint}` }, { quoted: message });
  }
};

module.exports = {
  name: "gempa",
  command: ["gempa", "earthquake", "bmkg"],
  category: "tools",
  description: "Info gempa terbaru dari BMKG",
  visible: true,
  execute: execute
};
