const { getPrefix } = require("../../lib/prefix");
const { renderQuote } = require("../../lib/iqc");
const { guarded, reply, quotedText, cooldown } = require("../../lib/featureutil");

// "!iqc Budi | > halo" -> kontak Budi, bubble keluar (kanan)
const parse = (raw, fallbackName) => {
  let contact = String(fallbackName || "Zenyn").trim() || "Zenyn";
  let body = raw.trim();
  const bar = body.indexOf("|");
  if (bar > 0 && bar <= 24) {
    contact = body.slice(0, bar).trim() || contact;
    body = body.slice(bar + 1).trim();
  }
  const outgoing = body.startsWith(">");
  if (outgoing) body = body.slice(1).trim();
  return { contact, body, outgoing };
};

const execute = async (client, message, args) => {
  const raw = args.join(" ").trim() || quotedText(message);
  if (!raw.trim()) {
    const p = getPrefix(message);
    return reply(
      client,
      message,
      `💬 *FAKE QUOTE CHAT (iPhone)*\n\n• ${p}iqc <teks>\n• ${p}iqc Budi | <teks> — ganti nama kontak\n• ${p}iqc Budi | > <teks> — bubble kanan (kamu)\n• reply pesan lalu ketik ${p}iqc`
    );
  }
  const { contact, body, outgoing } = parse(raw, message.pushName);
  if (!body) throw new Error("Teks kosong setelah nama kontak.");
  cooldown(message, "iqc", 5000);
  const png = await renderQuote(body, { contact, outgoing });
  return client.sendMessage(message.key.remoteJid, { image: png }, { quoted: message });
};

module.exports = {
  name: "iqc",
  command: ["iqc", "qc2"],
  category: "tools",
  visible: true,
  description: "Fake quote chat iPhone (dark) dari teks/reply",
  execute: guarded("iqc", execute)
};
