const { getPrefix } = require("../../lib/prefix");
const { findMedia, download } = require("../../lib/mediautil");
const { renderMeme } = require("../../lib/drawcard");
const { imageToWebp, safeWithExif } = require("../../lib/sticker");
const { guarded, reply, cooldown } = require("../../lib/featureutil");

const execute = async (client, message, args) => {
  const found = findMedia(message, ["image", "sticker"]);
  const texts = args.join(" ").split("|").map((text) => text.trim());
  if (!found || !texts.some(Boolean)) return reply(client, message, `🖼️ Reply gambar/sticker statis:\n${getPrefix(message)}smeme teks atas | teks bawah\nBisa juga kirim gambar dengan caption command.`);
  if (texts.length > 2 || texts.some((text) => text.length > 100)) throw new Error("Gunakan maksimal 2 bagian teks, masing-masing 100 karakter.");
  if (found.node.isAnimated) throw new Error("Gunakan gambar atau sticker statis, bukan animasi.");
  cooldown(message, "smeme");
  const buffer = await download(found, { maxBytes: 8 * 1024 * 1024 });
  const png = await renderMeme(buffer, texts[0], texts[1] || "");
  const sticker = await safeWithExif(await imageToWebp(png));
  return client.sendMessage(message.key.remoteJid, { sticker }, { quoted: message });
};

module.exports = {
  name: "smeme", command: ["smeme", "stickermeme"], category: "tools", visible: true,
  description: "Sticker meme dengan teks atas/bawah dari gambar", execute: guarded("smeme", execute)
};
