// commands/rpg/bank.js — tabungan gold dengan bunga harian.
// Format: .bank | .bank setor <gold> | .bank tarik <gold> | .bank top
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const bank = require("../../lib/bank");
const { short } = require("../../lib/num");

const rp = (n) => short(n || 0);

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);
  if (!userId) throw new Error("Tidak bisa mengenali pengirim.");

  const user = db.getUser(userId, message.pushName || "Player");
  const st = bank.accrue(userId);
  const action = String(args[0] || "").toLowerCase();
  const send = (text) => client.sendMessage(sender, { text }, { quoted: message });

  if (!action || action === "saldo") {
    return send(
      [
        "🏦 *BANK ZENYN*",
        "",
        `Saldo bank : ${rp(st.amount)} / ${rp(bank.CAP)}`,
        `Gold di tas: ${rp(user.money)}`,
        `Bunga      : ${(bank.RATE * 100).toFixed(1)}%/hari (masuk otomatis)`,
        "",
        `• ${p}bank setor <gold> (min ${rp(bank.MIN_SETOR)})`,
        `• ${p}bank tarik <gold>`,
        `• ${p}bank top`
      ].join("\n")
    );
  }

  if (action === "setor" || action === "deposit") {
    const after = bank.deposit(userId, args[1]);
    return send(`✅ Setor berhasil.\n\nSaldo bank: ${rp(after.amount)} / ${rp(bank.CAP)}\nGold di tas: ${rp(db.getUser(userId).money)}`);
  }

  if (action === "tarik" || action === "withdraw") {
    const after = bank.withdraw(userId, args[1]);
    return send(`✅ Tarik berhasil.\n\nSaldo bank: ${rp(after.amount)}\nGold di tas: ${rp(db.getUser(userId).money)}`);
  }

  if (action === "top") {
    const rows = bank.top(3);
    if (!rows.length) return send("🏦 Belum ada penabung.");
    const lines = rows.map((r, i) => {
      const u = db.getUser(r.uid, "Player");
      return `${i + 1}. ${u.name} — ${rp(r.amount)} gold`;
    });
    return send(["🏦 *PENABUNG TERATAS*", "", ...lines].join("\n"));
  }

  return send(`🏦 Format: ${p}bank | ${p}bank setor <gold> | ${p}bank tarik <gold> | ${p}bank top`);
};

module.exports = {
  name: "bank",
  command: ["bank", "tabung"],
  category: "rpg",
  visible: true,
  description: "Tabungan gold dengan bunga 0.5%/hari (maks 50.000)",
  subcommands: ["setor <gold>", "tarik <gold>", "top"],
  execute
};
