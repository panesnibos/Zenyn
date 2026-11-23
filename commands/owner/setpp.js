// commands/owner/setpp.js — ganti/hapus foto profil bot (owner).
// Format: .setpp (kirim/reply foto) | .setpp hapus
const sharp = require("sharp");
const logger = require("../../lib/logger");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, cooldown } = require("../../lib/featureutil");
const { findMedia, download } = require("../../lib/mediautil");

const MAX_BYTES = 15 * 1024 * 1024;
const SIZE = 640;
const RESET_WORDS = new Set(["hapus", "del", "delete", "reset", "remove"]);

const usage = (p) =>
  [
    "🖼️ *SET FOTO PROFIL BOT*",
    "",
    `• Kirim foto dengan caption *${p}setpp*`,
    `• Atau reply foto lalu ketik *${p}setpp*`,
    `• Hapus foto: *${p}setpp hapus*`,
    "",
    "Gambar otomatis di-crop 640×640."
  ].join("\n");

const execute = async (client, message, args) => {
  const p = getPrefix(message);

  if (!isOwner(message)) {
    await reply(client, message, "❌ Command ini khusus owner.");
    return false;
  }

  const botJid = client.user?.id;
  if (!botJid) throw new Error("Bot belum terhubung sempurna. Coba lagi setelah koneksi stabil.");

  const action = String((args || [])[0] || "").toLowerCase();

  if (RESET_WORDS.has(action)) {
    cooldown(message, "setpp", 10000);
    await client.removeProfilePicture(botJid);
    logger.cmd(`setpp: hapus foto profil (${botJid})`);
    await reply(client, message, "✅ Foto profil bot dihapus.");
    return true;
  }

  const found = findMedia(message, ["image"]);
  if (!found) {
    await reply(client, message, usage(p));
    return false;
  }

  cooldown(message, "setpp", 10000);
  const raw = await download(found, { maxBytes: MAX_BYTES });
  const buffer = await sharp(raw)
    .rotate()
    .resize(SIZE, SIZE, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();

  await client.updateProfilePicture(botJid, buffer);
  logger.cmd(`setpp: foto profil diganti (${botJid}, ${Math.round(buffer.length / 1024)}KB)`);
  await reply(client, message, `✅ Foto profil bot diperbarui (${SIZE}×${SIZE} · ${Math.round(buffer.length / 1024)} KB).`);
  return true;
};

module.exports = {
  name: "setpp",
  command: ["setpp"],
  category: "owner",
  visible: false,
  description: "Ganti/hapus foto profil bot (owner)",
  subcommands: ["[hapus]"],
  execute: guarded("setpp", execute)
};
