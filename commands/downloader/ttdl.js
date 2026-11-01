const logger = require("../../lib/logger");
const fetch = require("node-fetch");

const TIKTOK_REGEX = /(https?:\/\/(?:www\.|vt\.|vm\.)?tiktok\.com\/[^\s]+)/i;

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const input = args.join(" ").trim();
  const match = input.match(TIKTOK_REGEX);
  const url = match ? match[0] : null;

  if (!url) {
    await client.sendMessage(sender, {
      text: "📥 *TIKTOK DOWNLOADER*\n\nFormat: *.ttdl <link>*\nContoh: *.ttdl https://vt.tiktok.com/xxxxx*"
    }, { quoted: message });
    return false;
  }

  try {
    await client.sendMessage(sender, { text: "⏳ Mengunduh video..." }, { quoted: message });

    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const json = await res.json();

    if (json.code !== 0 || !json.data) {
      throw new Error(json.msg || "Gagal mengambil data video");
    }

    const data = json.data;
    const caption = `🎬 *${data.title || "TikTok Video"}*\n👤 ${data.author?.nickname || "Unknown"}\n👁️ ${data.play_count || 0} views`;

    if (data.images && data.images.length > 0) {
      for (const img of data.images) {
        await client.sendMessage(sender, { image: { url: img }, caption }, { quoted: message });
      }
    } else if (data.play) {
      await client.sendMessage(sender, { video: { url: data.play }, caption }, { quoted: message });
    } else {
      throw new Error("Tidak ada media yang bisa diunduh.");
    }

    logger.info(`ttdl: ${url}`);
  } catch (err) {
    logger.error(`ttdl: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Gagal: ${err.message}` }, { quoted: message });
    return false;
  }
};

module.exports = {
  name: "ttdl",
  command: ["ttdl", "tiktokdl"],
  category: "downloader",
  description: "Download video/foto TikTok",
  visible: true,
  limit: 1,
  execute: execute
};
