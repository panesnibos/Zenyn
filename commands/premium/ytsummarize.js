const logger = require("../../lib/logger");
const ai = require("../../lib/ai");
const yt = require("../../lib/ytdl");
const config = require("../../config");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { isOwner } = require("../../lib/owner");
const { statusOf } = require("../../lib/rpglimit");

const MAX_TRANSCRIPT = 12000;
const MAX_DESC = 4000;
const MAX_ANSWER = 3500;
const cooldown = new Map();

const vttToText = (vtt) =>
  String(vtt || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        line !== "WEBVTT" &&
        !/^NOTE\b/.test(line) &&
        !/^Kind:|^Language:/.test(line) &&
        !/-->/.test(line) &&
        !/^\d+$/.test(line)
    )
    .map((line) => line.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim())
    .filter(Boolean)
    .filter((line, i, arr) => line !== arr[i - 1])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const pickTranscript = async (info) => {
  const langs = ["id", "en"];
  for (const lang of langs) {
    try {
      const text = vttToText(await yt.getCaptions(info, { lang }));
      if (text.length > 200) return text.slice(0, MAX_TRANSCRIPT);
    } catch (err) {
      logger.warn(`ytsummarize: transkrip ${lang} gagal: ${err.message}`);
    }
  }
  return "";
};

const chunk = (text, size = MAX_ANSWER) => {
  const out = [];
  const clean = String(text || "").trim();
  for (let i = 0; i < clean.length; i += size) out.push(clean.slice(i, i + size));
  return out.slice(0, 4);
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const uid = getUserId(message);

  if (config.ytsummarize?.premium !== false && !isOwner(message)) {
    const user = uid ? db.getUser(uid, message.pushName || "Player") : null;
    if (!user || statusOf(user) === "User") {
      return await client.sendMessage(
        sender,
        {
          text: `🔒 *KHUSUS PREMIUM*\n\nFitur ${p}ytsummarize hanya untuk Premium/Donatur.\nBeli premium: *${p}premium*`
        },
        { quoted: message }
      );
    }
  }

  const url = yt.parseUrl(args.join(" "));
  if (!url) {
    return await client.sendMessage(
      sender,
      {
        text: `📺 *RINGKAS VIDEO YOUTUBE*\n\nFormat: *${p}ytsummarize <link>*\nContoh: *${p}ytsummarize https://youtu.be/xxxxx*`
      },
      { quoted: message }
    );
  }

  const wait = Math.max(0, Number(config.ytsummarize?.cooldownMs ?? 60000) - (Date.now() - (cooldown.get(uid) || 0)));
  if (wait > 0) {
    return await client.sendMessage(
      sender,
      { text: `⏳ Tunggu ${Math.ceil(wait / 1000)} detik lagi.` },
      { quoted: message }
    );
  }

  if (!ai.isConfigured()) {
    return await client.sendMessage(
      sender,
      { text: "❌ AI belum dikonfigurasi. Owner harus mengisi GEMINI_API_KEY." },
      { quoted: message }
    );
  }

  cooldown.set(uid, Date.now());

  try {
    await client.sendMessage(sender, { text: "⏳ Mengambil data video..." }, { quoted: message });

    const info = await yt.getInfo(url);
    const v = info?.videoDetails || {};
    const title = v.title || "Tanpa judul";
    const author = v.author?.name || v.author || "-";
    const duration = yt.formatDuration(v.lengthSeconds);
    const desc = String(v.shortDescription || "").slice(0, MAX_DESC);

    const transcript = await pickTranscript(info);
    const material = transcript || desc;

    if (!material || material.length < 40) {
      return await client.sendMessage(
        sender,
        {
          text: `⚠️ Tidak ada transkrip/deskripsi yang bisa diringkas untuk video:\n*${title}*`
        },
        { quoted: message }
      );
    }

    const answer = await ai.ask({
      prompt: [
        "Ringkas video YouTube berikut untuk pembaca Indonesia.",
        `Judul: ${title}`,
        `Channel: ${author}`,
        `Durasi: ${duration}`,
        "",
        transcript
          ? "Sumber: transkrip video."
          : "Sumber: deskripsi video (transkrip tidak tersedia).",
        "",
        "Format jawaban:",
        "• 1 kalimat inti video",
        "• 3-6 poin penting",
        "• Kesimpulan singkat",
        "Jangan mengarang di luar materi.",
        "",
        material
      ].join("\n")
    });

    const parts = chunk(answer);
    for (let i = 0; i < parts.length; i++) {
      const head = i === 0 ? `📺 *${title}*\n_${author} • ${duration}_\n\n` : "";
      const tail = i === 0 ? `\n\n_${transcript ? "Dari transkrip" : "Dari deskripsi (tanpa transkrip)"}_` : "";
      await client.sendMessage(sender, { text: `${head}${parts[i]}${tail}` }, { quoted: message });
    }

    logger.cmd(`ytsummarize: ${sender} ${transcript ? "transcript" : "description"}`);
  } catch (err) {
    logger.error(`ytsummarize: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Gagal meringkas: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "ytsummarize",
  command: ["ytsummarize", "ytsummary", "ringkasyt", "summarizeyt"],
  category: "premium",
  description: "Ringkas video YouTube dengan AI (premium)",
  visible: true,
  execute
};
