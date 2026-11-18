// commands/tools/pin.js — simpan gambar/video dari Pinterest.
// Format: .pin <link> | .pinterest <link> (atau reply pesan berisi link)
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, quotedText, cooldown } = require("../../lib/featureutil");
const pin = require("../../lib/pinterest");

const execute = async (client, message, args) => {
  const raw = (args.join(" ") || quotedText(message)).trim();
  const p = getPrefix(message);

  if (!raw) {
    await reply(
      client,
      message,
      `📌 *PINTEREST*\n\n• ${p}pin <link>\n• ${p}pinterest <link>\n\n` +
        `Contoh: ${p}pin https://pin.it/abc123\n` +
        `Contoh: ${p}pin https://www.pinterest.com/pin/1234567890/\n\n` +
        "Satu media per pin (gambar atau video). Biaya 1 limit."
    );
    return false;
  }

  const target = pin.parseUrl(raw);
  if (!target) throw new Error(`Itu bukan link Pinterest.\nContoh: ${p}pin https://pin.it/abc123`);

  cooldown(message, "pin", 8000);
  const media = await pin.fetchPin(target.url);
  const file = await pin.download(media);

  const caption = `📌 Pinterest ${file.type === "video" ? "video" : "gambar"}${target.id ? ` · pin/${target.id}` : ""}`;
  const payload =
    file.type === "video"
      ? { video: file.buffer, mimetype: file.mimetype, caption }
      : { image: file.buffer, caption };

  return client.sendMessage(message.key.remoteJid, payload, { quoted: message });
};

module.exports = {
  name: "pin",
  command: ["pin", "pinterest"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Simpan gambar/video dari Pinterest (1 media, 1 limit)",
  execute: guarded("pin", execute)
};
