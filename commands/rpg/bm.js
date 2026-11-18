// commands/rpg/bm.js — pasar gelap: stok acak tiap 6 jam, harga di luar shop.
// Format: .bm | .bm beli <nomor> [qty]
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const bm = require("../../lib/blackmarket");
const { short } = require("../../lib/num");

const rp = (n) => short(n || 0);
const left = (endsAt) => {
  const m = Math.max(0, Math.round((endsAt - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m`;
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);
  if (!userId) throw new Error("Tidak bisa mengenali pengirim.");

  const { stock, endsAt } = bm.current();
  const action = String(args[0] || "").toLowerCase();

  if (action === "beli" || action === "buy") {
    const out = bm.buy(userId, args[1], args[2]);
    return client.sendMessage(
      sender,
      { text: `✅ Beli ${out.entry.emoji} ${out.entry.name} x${out.qty}\n💸 ${rp(out.total)} gold\n💳 Sisa: ${rp(db.getUser(userId).money)}` },
      { quoted: message }
    );
  }

  const lines = ["🕶️ *PASAR GELAP*", "", `Stok berganti dalam ${left(endsAt)}`, ""];
  stock.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.emoji} ${s.name}${s.rare ? " ✨" : ""} — ${rp(s.price)} gold (maks ${s.max})`);
  });
  lines.push("", `Beli: *${p}bm beli <nomor> [qty]*`);
  return client.sendMessage(sender, { text: lines.join("\n") }, { quoted: message });
};

module.exports = {
  name: "bm",
  command: ["bm", "blackmarket"],
  category: "rpg",
  visible: true,
  description: "Pasar gelap: stok & harga acak per 6 jam (bisa lebih murah dari shop)",
  subcommands: ["beli <nomor> [qty]"],
  execute
};
