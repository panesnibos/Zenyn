// commands/tools/tss.js — reply video + teks -> video diberi suara TTS.
const { reply, guarded } = require("../../lib/featureutil");
const { downloadMedia } = require("../../lib/media");
const { muxVideoAudio } = require("../../lib/voice");
const { speak, MAX_CHARS } = require("./tts")._internal;

const execute = async (client, message, args) => {
  const text = args.join(" ").replace(/\s+/g, " ").trim();
  if (!text) {
    return reply(client, message, `🔊 Format: *.tss <teks>* (reply video)\nContoh: .tss hai nopal`);
  }
  if (text.length > MAX_CHARS) throw new Error(`Teks maksimal ${MAX_CHARS} karakter.`);

  const media = await downloadMedia(client, message, { type: "video" });
  if (!media) return reply(client, message, "❌ Reply video atau kirim video dengan caption *.tss*");

  await reply(client, message, "⏳ Menambah suara ke video...");
  const mp3 = await speak(text);
  const video = await muxVideoAudio(media.buffer, mp3);

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