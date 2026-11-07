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
      { text: `🧾 *CEK TAGIHAN*\n\nContoh: ${p}statusbayar PRMAB12CD` },
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
    if (inv.status === "pending") await autopay.check(inv, { force: true });
  } catch (err) {
    logger.warn(`statusbayar: ${err.message}`);
  }

  const fresh = autopay.get(id);
  if (fresh.status === "pending") {
    await autopay.sendInvoice(client, sender, fresh);
  } else {
    await client.sendMessage(
      sender,
      {
        text: autopay.invoiceText(fresh, fresh.status === "done" ? "TAGIHAN LUNAS" : "TAGIHAN")
      },
      { quoted: message }
    );
  }
};

module.exports = {
  name: "statusbayar",
  command: ["statusbayar", "cektagihan"],
  category: "main",
  description: "Cek status tagihan QRIS / tampilkan ulang QR",
  visible: true,
  execute
};
