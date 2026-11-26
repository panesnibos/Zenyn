// commands/tools/soundsticker.js — reply video -> stiker bersuara native (tap untuk putar).
const { reply, guarded } = require("../../lib/featureutil");
const { downloadMedia } = require("../../lib/media");
const { extractAudioOpus } = require("../../lib/voice");
const { videoToWebp } = require("../../lib/sticker");
const { sendSoundSticker } = require("../../lib/soundsticker");

const MAX_SECONDS = 10;

const execute = async (client, message, args) => {
  const media = await downloadMedia(client, message, { type: "video" });
  if (!media) {
    return reply(client, message, "❌ Reply video atau kirim video dengan caption *.soundsticker*");
  }
  if (media.seconds > MAX_SECONDS) {
    return reply(client, message, `❌ Maksimal durasi video ${MAX_SECONDS} detik`);
  }

  await reply(client, message, "⏳ Membuat stiker bersuara...");

  const [sticker, audio] = await Promise.all([
    videoToWebp(media.buffer, { maxSeconds: MAX_SECONDS }),
    extractAudioOpus(media.buffer, { maxSeconds: MAX_SECONDS })
  ]);
  await sendSoundSticker(client, message.key.remoteJid, { webp: sticker, audio, quoted: message });
  return true;
};

module.exports = {
  name: "soundsticker",
  command: ["soundsticker", "sstk"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Reply video jadi stiker bersuara (tap untuk putar, maks 10 detik)",
  execute: guarded("soundsticker", execute),
  _internal: { execute, MAX_SECONDS }
};