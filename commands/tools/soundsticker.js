// commands/tools/soundsticker.js — reply video -> stiker bersuara native (tap untuk putar).
const { reply, guarded } = require("../../lib/featureutil");
const { downloadMedia } = require("../../lib/media");
const { extractAudioOpus } = require("../../lib/voice");
const { videoToWebp, safeWithExif } = require("../../lib/sticker");
const { sendSoundSticker } = require("../../lib/soundsticker");

const MAX_SECONDS = 5;
// Target total (webp + audio) agar bisa di-forward dari HP; WA menegakkan batas ukuran stiker.
const TARGET_BYTES = 100 * 1024;
const AUDIO_BITRATE = 32;
// Dari konfig paling besar ke paling kecil; pilih yang pertama muat di target.
const LADDER = [
  { size: 256, fps: 6, quality: 22 },
  { size: 200, fps: 6, quality: 18 },
  { size: 160, fps: 5, quality: 16 }
];

const execute = async (client, message, args) => {
  const media = await downloadMedia(client, message, { type: "video" });
  if (!media) {
    await reply(client, message, "❌ Reply video atau kirim video dengan caption *.soundsticker*");
    return false;
  }
  if (media.seconds > MAX_SECONDS) {
    await reply(client, message, `❌ Maksimal durasi video ${MAX_SECONDS} detik`);
    return false;
  }

  await reply(client, message, "⏳ Membuat stiker bersuara...");

  const audio = await extractAudioOpus(media.buffer, { maxSeconds: MAX_SECONDS, bitrate: AUDIO_BITRATE });
  let webp = null;
  for (const cfg of LADDER) {
    const w = await safeWithExif(await videoToWebp(media.buffer, { maxSeconds: MAX_SECONDS, ...cfg }));
    if (w.length + audio.length <= TARGET_BYTES) { webp = w; break; }
  }
  if (!webp) {
    await reply(client, message, "❌ Stiker terlalu besar walau sudah dikompres maksimal. Coba video lebih pendek.");
    return false;
  }
  await sendSoundSticker(client, message.key.remoteJid, { webp, audio, quoted: message });
  return true;
};

module.exports = {
  name: "soundsticker",
  command: ["soundsticker", "sstk"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Reply video jadi stiker bersuara (tap untuk putar, maks 5 detik)",
  execute: guarded("soundsticker", execute),
  _internal: { execute, MAX_SECONDS, TARGET_BYTES, LADDER, AUDIO_BITRATE }
};