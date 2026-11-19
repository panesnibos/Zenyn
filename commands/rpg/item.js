// commands/rpg/item.js — kartu info item (stat, sumber, craft, jual).
// Format: .item | .item <nama>
const { getPrefix } = require("../../lib/prefix");
const { guarded } = require("../../lib/featureutil");
const { resolveItem, infoText, listText } = require("../../lib/iteminfo");

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const name = (args || []).join(" ").trim();

  if (!name) return client.sendMessage(sender, { text: listText() }, { quoted: message });

  const { item, suggestions } = resolveItem(name);
  if (!item) {
    const hint = suggestions.length
      ? `\n\nMungkin maksudmu:\n${suggestions.map((s) => `• ${p}item ${s}`).join("\n")}`
      : `\n\nCoba *${p}item* untuk lihat daftar item.`;
    return client.sendMessage(sender, { text: `❓ Item *${name}* tidak ditemukan.${hint}` }, { quoted: message });
  }

  return client.sendMessage(sender, { text: infoText(item) }, { quoted: message });
};

module.exports = {
  name: "item",
  command: ["item", "iteminfo", "cekitem"],
  category: "rpg",
  visible: true,
  limit: 0,
  description: "Info item: stat, sumber, bahan craft, harga jual",
  subcommands: ["<nama>"],
  execute: guarded("item", execute)
};
