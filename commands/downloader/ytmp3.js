const logger = require("../../lib/logger");
const yt = require("../../lib/ytdl");

const INLINE_MAX = 16 * 1024 * 1024;
const DOC_MAX = 100 * 1024 * 1024;

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const url = yt.parseUrl(args.join(" "));

  if (!url) {
    await client.sendMessage(
      sender,
      {
        text: "🎵 *YOUTUBE MP3*\n\nFormat: *.ytmp3 <link>*\nContoh: *.ytmp3 https://youtu.be/xxxxx*"
      },
      { quoted: message }
    );
    return false;
  }

  try {
    await client.sendMessage(sender, { text: "⏳ Mengunduh audio..." }, { quoted: message });

    const info = await yt.getInfo(url);
    const audio = yt.pickAudio(info.formats);
    if (!audio) throw new Error("Audio tidak ditemukan.");

    const raw = await yt.download(info, audio);
    const mp3 = await yt.toMp3(raw, audio.container);
    if (mp3.length > DOC_MAX) throw new Error("Audio terlalu besar (maks 100MB).");

    const title = info.videoDetails.title || "YouTube Audio";
    const author = info.videoDetails.author?.name || "Unknown";
    const fileName = `${yt.safeName(title)}.mp3`;
    const text = `🎵 *${title}*\n👤 ${author}\n⏱️ ${yt.formatDuration(
      info.videoDetails.lengthSeconds
    )}`;

    if (mp3.length > INLINE_MAX) {
      await client.sendMessage(
        sender,
        {
          document: mp3,
          mimetype: "audio/mpeg",
          fileName,
          caption: `${text}\n\n📎 Dikirim sebagai dokumen (ukuran >16MB).`
        },
        { quoted: message }
      );
    } else {
      await client.sendMessage(sender, { text }, { quoted: message });
      await client.sendMessage(
        sender,
        { audio: mp3, mimetype: "audio/mpeg", fileName, ptt: false },
        { quoted: message }
      );
    }

    logger.info(`ytmp3: ${url}`);
  } catch (err) {
    logger.error(`ytmp3: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Gagal: ${err.message}` }, { quoted: message });
    return false;
  }
};

module.exports = {
  name: "ytmp3",
  command: ["ytmp3", "yta", "ytaudio"],
  category: "downloader",
  description: "Download audio YouTube (MP3)",
  visible: true,
  limit: 1,
  execute: execute
};
