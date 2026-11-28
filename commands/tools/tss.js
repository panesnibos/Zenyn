// commands/tools/tss.js — reply video + teks -> video diberi suara TTS.
const { reply, guarded } = require("../../lib/featureutil");
const { downloadMedia } = require("../../lib/media");
const { muxVideoAudio, imageToVideoWithAudio } = require("../../lib/voice");
const { speak, MAX_CHARS } = require("./tts")._internal;

const execute = async (client, message, args) => {
  const text = args.join(" ").replace(/\s+/g, " ").trim();
  if (!text) {
    await reply(client, message, `🔊 Format: *.tss <teks>* (reply video/gambar)\nContoh: .tss hai nopal`);
    return false;
  }
  if (text.length > MAX_CHARS) throw new Error(`Teks maksimal ${MAX_CHARS} karakter.`);

  const media = await downloadMedia(client, message);
  if (!media || !["video", "image"].includes(media.type)) {
    await reply(client, message, "❌ Reply video/gambar atau kirim dengan caption *.tss*");
    return false;
  }

  await reply(client, message, "⏳ Menambah suara...");
  const mp3 = await speak(text);
  const video =
    media.type === "video"
      ? await muxVideoAudio(media.buffer, mp3)
      : await imageToVideoWithAudio(media.buffer, mp3);

  return client.sendMessage(
    message.key.remoteJid,
    { video, caption: `🗣 ${text}`, mimetype: "video/mp4" },
    { quoted: message }
  );
};

module.exports = {
  name: "tss",
  command: ["tss", "ttsvideo"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Reply video + teks, video diberi suara TTS",
  execute: guarded("tss", execute),
  _internal: { execute }
};