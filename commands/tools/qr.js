const QRCode = require("qrcode");
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, quotedText, cooldown } = require("../../lib/featureutil");

const execute = async (client, message, args) => {
  const parts = [...args];
  let dark = "#000000";
  if (parts[0]?.startsWith("--warna=")) {
    const color = parts.shift().slice(8).replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(color)) throw new Error("Warna harus hex 6 digit, misal --warna=334499.");
    const rgb = [0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16));
    if (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 180) throw new Error("Pilih warna lebih gelap agar QR mudah dipindai.");
    dark = `#${color}`;
  }
  const text = (parts.join(" ") || quotedText(message)).trim();
  if (!text) return reply(client, message, `🔳 Format: ${getPrefix(message)}qr <teks/URL>\nAtau reply teks. Opsional: --warna=334499`);
  if (Buffer.byteLength(text, "utf8") > 1200) throw new Error("Teks QR maksimal 1200 byte (UTF-8).");
  cooldown(message, "qr");
  const image = await QRCode.toBuffer(text, { type: "png", width: 768, margin: 4, errorCorrectionLevel: "M", color: { dark, light: "#ffffff" } });
  return client.sendMessage(message.key.remoteJid, { image, caption: "✅ QR siap dipindai." }, { quoted: message });
};

module.exports = {
  name: "qr", command: ["qr", "qrcode"], category: "tools", visible: true,
  description: "Buat QR teks/URL, opsi warna dan reply teks", execute: guarded("qr", execute)
};
