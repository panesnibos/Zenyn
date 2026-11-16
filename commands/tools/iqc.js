const { getPrefix } = require("../../lib/prefix");
const { renderQuote } = require("../../lib/iqc");
const { guarded, reply, quotedText, cooldown } = require("../../lib/featureutil");

const execute = async (client, message, args) => {
  const text = (args.join(" ").trim() || quotedText(message)).trim();
  if (!text) {
    const p = getPrefix(message);
    return reply(client, message, `💬 *FAKE QUOTE iOS*\n\n• ${p}iqc <teks>\n• atau reply pesan lalu ketik ${p}iqc`);
  }
  cooldown(message, "iqc", 5000);
  const png = await renderQuote(text, message.pushName);
  return client.sendMessage(message.key.remoteJid, { image: png }, { quoted: message });
};

module.exports = {
  name: "iqc",
  command: ["iqc", "qc2"],
  category: "tools",
  visible: true,
  description: "Buat gambar quote gaya iOS dari teks/reply",
  execute: guarded("iqc", execute)
};
