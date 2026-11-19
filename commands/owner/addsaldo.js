// commands/owner/addsaldo.js — koreksi saldo Rp manual (owner).
const logger = require("../../lib/logger");
const saldo = require("../../lib/saldo");
const { resolveTarget } = require("../../lib/rpgutil");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");

const parseAmount = (raw) => {
  const n = Math.trunc(Number(String(raw ?? "").replace(/[.,\s]/g, "")));
  return Number.isFinite(n) ? n : NaN;
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  const { targetId, rest } = await resolveTarget(message, args, client);
  const amount = parseAmount(rest[0]);

  if (!targetId || String(targetId).length < 8 || !Number.isFinite(amount) || amount === 0) {
    return client.sendMessage(
      sender,
      {
        text: [
          "💳 *ADD SALDO*",
          "",
          `Tambah: *${p}addsaldo 628123456789 10000*`,
          `Kurangi: *${p}addsaldo 628123456789 -5000*`,
          `Atau reply pesan target: *${p}addsaldo 10000*`
        ].join("\n")
      },
      { quoted: message }
    );
  }

  try {
    if (amount > 0) saldo.add(targetId, amount, "", `Penyesuaian owner`);
    else saldo.sub(targetId, -amount, "", `Penyesuaian owner`);
  } catch (err) {
    return client.sendMessage(sender, { text: `❌ ${err.message}` }, { quoted: message });
  }

  const now = saldo.get(targetId);
  logger.cmd(`addsaldo ${amount > 0 ? "+" : ""}${amount} -> ${targetId} (now ${now})`);

  return client.sendMessage(
    sender,
    {
      text: `✅ Saldo +${targetId} ${amount > 0 ? "bertambah" : "berkurang"} ${saldo.rp(Math.abs(amount))}.\nSaldo sekarang: *${saldo.rp(now)}*`
    },
    { quoted: message }
  );
};

module.exports = {
  name: "addsaldo",
  command: ["addsaldo", "setsaldo"],
  category: "owner",
  description: "Tambah/kurangi saldo Rp user (owner)",
  visible: true,
  execute
};
