const logger = require("../../lib/logger");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { isOwner } = require("../../lib/owner");
const autopay = require("../../lib/autopay");

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  autopay.attach(client);
  const p = getPrefix(message);
  const id = String(args?.[0] || "").toUpperCase();

  if (!id) {
    return await client.sendMessage(
      sender,
      { text: `🧾 *BATAL TAGIHAN*\n\nContoh: ${p}batalbayar PRMAB12CD` },
      { quoted: message }
    );
  }

  const inv = autopay.get(id);
  if (!inv) {
    return await client.sendMessage(sender, { text: `❌ Tagihan *${id}* tidak ditemukan.` }, { quoted: message });
  }

  const uid = getUserId(message);
  if (inv.buyer !== uid && !isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Tagihan ini bukan milikmu." }, { quoted: message });
  }

  try {
    await autopay.cancel(inv);
    logger.cmd(`batalbayar: ${id} oleh ${uid || "owner"}`);
    await client.sendMessage(
      sender,
      { text: `✅ Tagihan *${id}* dibatalkan.` },
      { quoted: message }
    );
  } catch (err) {
    logger.warn(`batalbayar: ${err.message}`);
    await client.sendMessage(
      sender,
      { text: `${err.user ? "❌" : "⚠️"} ${err.message}` },
      { quoted: message }
    );
  }
};

module.exports = {
  name: "batalbayar",
  command: ["batalbayar", "batalqris"],
  category: "main",
  description: "Batalkan tagihan QRIS yang belum dibayar",
  visible: true,
  execute
};
