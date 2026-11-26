// commands/tools/soundsticker.js — reply video -> GIF video bersuara (auto-play).
const { reply, guarded } = require("../../lib/featureutil");
const { downloadMedia } = require("../../lib/media");
const { videoToGifPlayback } = require("../../lib/voice");

const MAX_SECONDS = 10;

const execute = async (client, message, args) => {
  const media = await downloadMedia(client, message, { type: "video" });
  if (!media) {
    return reply(client, message, "❌ Reply video atau kirim video dengan caption *.soundsticker*");
  }
  if (media.seconds > MAX_SECONDS) {
    return reply(client, message, `❌ Maksimal durasi video ${MAX_SECONDS} detik`);
  }

  await reply(client, message, "⏳ Membuat GIF bersuara...");

  const video = await videoToGifPlayback(media.buffer);
  await client.sendMessage(
    message.key.remoteJid,
    { video, gifPlayback: true, mimetype: "video/mp4" },
    { quoted: message }
  );
  return true;
};

module.exports = {
  name: "soundsticker",
  command: ["soundsticker", "sstk"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Reply video jadi GIF bergerak bersuara (maks 10 detik)",
  execute: guarded("soundsticker", execute),
  _internal: { execute, MAX_SECONDS }
};