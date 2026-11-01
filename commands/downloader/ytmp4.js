const logger = require("../../lib/logger");
const yt = require("../../lib/ytdl");

const INLINE_MAX = 16 * 1024 * 1024;

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const url = yt.parseUrl(args.join(" "));

  if (!url) {
    await client.sendMessage(
      sender,
      {
        text: "🎬 *YOUTUBE MP4*\n\nFormat: *.ytmp4 <link>*\nContoh: *.ytmp4 https://youtu.be/xxxxx*"
      },
      { quoted: message }
    );
    return false;
  }

  try {
    await client.sendMessage(sender, { text: "⏳ Mengunduh video..." }, { quoted: message });

    const info = await yt.getInfo(url);
    const audio = yt.pickAudio(info.formats);
    const audioBytes = audio?.contentLength || 0;
    const INLINE_MIN_HEIGHT = 360;

    let video = yt.pickVideoOnly(info.formats, audioBytes, INLINE_MAX);
    let progressive = yt.pickProgressive(info.formats, INLINE_MAX);

    if (
      (video && video.height < INLINE_MIN_HEIGHT) ||
      (!video && progressive && progressive.height < INLINE_MIN_HEIGHT)
    ) {
      video = null;
      progressive = null;
    }

    if (!video && !progressive) {
      video = yt.pickVideoOnly(info.formats, audioBytes, yt.MAX_BYTES);
      progressive = yt.pickProgressive(info.formats, yt.MAX_BYTES);
    }

    let buf = null;
    let label = "";

    if (video) {
      const videoBuf = await yt.download(info, video);

      if (audio) {
        const audioBuf = await yt.download(info, audio);
        try {
          buf = await yt.mux(videoBuf, audioBuf);
          label = video.qualityLabel || `${video.height}p`;
        } catch (err) {
          logger.warn(`ytmp4 mux: ${err.message}`);
          if (!progressive) throw err;
          buf = await yt.download(info, progressive);
          label = progressive.qualityLabel || `${progressive.height}p`;
        }
      } else {
        buf = videoBuf;
        label = video.qualityLabel || `${video.height}p`;
      }
    } else if (progressive) {
      buf = await yt.download(info, progressive);
      label = progressive.qualityLabel || `${progressive.height}p`;
    } else {
      throw new Error("Video terlalu besar atau format tidak didukung.");
    }

    const title = info.videoDetails.title || "YouTube Video";
    const author = info.videoDetails.author?.name || "Unknown";
    const fileName = `${yt.safeName(title)}.mp4`;
    const text = `🎬 *${title}*\n👤 ${author}\n⏱️ ${yt.formatDuration(
      info.videoDetails.lengthSeconds
    )}${label ? `\n📺 ${label}` : ""}`;

    if (buf.length > INLINE_MAX) {
      await client.sendMessage(
        sender,
        {
          document: buf,
          mimetype: "video/mp4",
          fileName,
          caption: `${text}\n\n📎 Dikirim sebagai dokumen (ukuran >16MB).`
        },
        { quoted: message }
      );
    } else {
      await client.sendMessage(
        sender,
        { video: buf, mimetype: "video/mp4", fileName, caption: text },
        { quoted: message }
      );
    }

    logger.info(`ytmp4: ${url}`);
  } catch (err) {
    logger.error(`ytmp4: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Gagal: ${err.message}` }, { quoted: message });
    return false;
  }
};

module.exports = {
  name: "ytmp4",
  command: ["ytmp4", "ytv", "ytvideo"],
  category: "downloader",
  description: "Download video YouTube (MP4)",
  visible: true,
  limit: 1,
  execute: execute
};
