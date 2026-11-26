// commands/tools/soundsticker.js — reply video -> stiker animasi + voice note.
const { reply, guarded } = require("../../lib/featureutil");
const { downloadMedia } = require("../../lib/media");
const { videoToWebp, safeWithExif } = require("../../lib/sticker");
const { audioToVoice } = require("../../lib/voice");

const MAX_SECONDS = 5;

const execute = async (client, message, args) => {
  const media = await downloadMedia(client, message, { type: "video" });
  if (!media) {
    return reply(client, message, "❌ Reply video atau kirim video dengan caption *.soundsticker*");
  }
  if (media.seconds > MAX_SECONDS) {
    return reply(client, message, `❌ Maksimal durasi video ${MAX_SECONDS} detik`);
  }

  await reply(client, message, "⏳ Membuat sticker bersuara...");

  const webp = await videoToWebp(media.buffer).then((b) => safeWithExif(b));
  await client.sendMessage(message.key.remoteJid, { sticker: webp }, { quoted: message });

  let voice;
  try {
    voice = await audioToVoice(media.buffer);
  } catch {
    return reply(client, message, "✅ Sticker terkirim, tapi video tidak punya suara.");
  }
  await client.sendMessage(
    message.key.remoteJid,
    { audio: voice, mimetype: "audio/ogg; codecs=opus", ptt: true },
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
  description: "Reply video jadi sticker animasi + voice note (maks 5 detik)",
  execute: guarded("soundsticker", execute),
  _internal: { execute, MAX_SECONDS }
};