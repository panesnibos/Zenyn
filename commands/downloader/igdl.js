const logger = require("../../lib/logger");
const fetch = require("node-fetch");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const IG_REGEX = /(https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+)/i;
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const MAX_BYTES = 80 * 1024 * 1024;

const FFMPEG = (() => {
  try {
    const p = require("@ffmpeg-installer/ffmpeg").path;
    if (p && fs.existsSync(p)) return p;
  } catch {}
  try {
    const p = require("ffmpeg-static");
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return null;
})();

const decodeUrl = (s) =>
  String(s)
    .replace(/\\u0026/g, "&")
    .replace(/\\u0025/g, "%")
    .replace(/\\u003D/g, "=")
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\"/g, '"')
    .split("<")[0];

const unescapeManifest = (s) =>
  String(s)
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\u0025/g, "%")
    .replace(/\\u003D/g, "=")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/&amp;/g, "&");

const decodeHtml = (s) =>
  String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#064;/g, "@")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

const fetchMedia = async (pageUrl) => {
  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });
  if (!res.ok) throw new Error(`Instagram menolak request (${res.status})`);

  const html = await res.text();
  const videos = [
    ...new Set((html.match(/https?:[^"\s]+?\.mp4[^"\s]*/g) || []).map(decodeUrl))
  ].filter(Boolean);

  let audio = null;
  const dash = html.match(/"video_dash_manifest":"((?:[^"\\]|\\.)*)"/s);
  if (dash) {
    const xml = unescapeManifest(dash[1]);
    const audioSet = xml.match(/<AdaptationSet[^>]*contentType="audio"[\s\S]*?<\/AdaptationSet>/);
    const base = audioSet ? audioSet[0].match(/<BaseURL>([\s\S]*?)<\/BaseURL>/) : null;
    if (base) audio = decodeUrl(base[1]);
  }

  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  const images = ogImage ? [decodeHtml(decodeUrl(ogImage[1]))] : [];

  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i);
  let caption = decodeHtml(ogTitle ? ogTitle[1] : "").trim();
  caption = caption
    .replace(/^.*? on Instagram:\s*/i, "")
    .replace(/^["\u201c]|["\u201d]$/g, "")
    .trim();

  return { videos, audio, images, caption };
};

const download = async (url) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*"
    }
  });
  if (!res.ok) throw new Error(`Gagal mengunduh media (${res.status})`);

  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("Ukuran media terlalu besar");

  const buf = await res.buffer();
  if (buf.length > MAX_BYTES) throw new Error("Ukuran media terlalu besar");
  return buf;
};

const mux = (videoBuf, audioBuf) =>
  new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error("ffmpeg tidak tersedia"));

    const id = crypto.randomBytes(6).toString("hex");
    const dir = os.tmpdir();
    const videoPath = path.join(dir, `igv-${id}.mp4`);
    const audioPath = path.join(dir, `iga-${id}.mp4`);
    const outPath = path.join(dir, `igo-${id}.mp4`);

    fs.writeFileSync(videoPath, videoBuf);
    fs.writeFileSync(audioPath, audioBuf);

    const proc = spawn(FFMPEG, [
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-c", "copy",
      "-movflags", "+faststart",
      outPath
    ]);

    let err = "";
    proc.stderr.on("data", (d) => {
      err += d.toString();
    });
    proc.on("error", (e) => {
      cleanup();
      reject(e);
    });
    proc.on("close", (code) => {
      let out = null;
      try {
        out = fs.readFileSync(outPath);
      } catch {}
      cleanup();
      if (code === 0 && out) resolve(out);
      else reject(new Error(err.split("\n").filter(Boolean).slice(-2).join(" ").trim() || `ffmpeg exit ${code}`));
    });

    function cleanup() {
      for (const f of [videoPath, audioPath, outPath]) {
        try {
          fs.unlinkSync(f);
        } catch {}
      }
    }
  });

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const input = args.join(" ").trim();
  const match = input.match(IG_REGEX);
  const url = match ? match[1] : null;

  if (!url) {
    await client.sendMessage(
      sender,
      {
        text: "📥 *INSTAGRAM DOWNLOADER*\n\nFormat: *.igdl <link>*\nContoh: *.igdl https://www.instagram.com/reel/xxxxx*"
      },
      { quoted: message }
    );
    return false;
  }

  try {
    await client.sendMessage(sender, { text: "⏳ Mengunduh media..." }, { quoted: message });

    const pageUrl = url.endsWith("/") ? url : `${url}/`;
    const { videos, audio, images, caption } = await fetchMedia(pageUrl);
    const text = `📸 *Instagram Download*${caption ? `\n\n${caption.slice(0, 900)}` : ""}`;

    if (videos.length) {
      const [videoBuf, audioBuf] = await Promise.all([
        download(videos[0]),
        audio ? download(audio).catch(() => null) : Promise.resolve(null)
      ]);

      let buf = videoBuf;
      if (audioBuf) {
        try {
          buf = await mux(videoBuf, audioBuf);
        } catch (err) {
          logger.warn(`igdl mux: ${err.message}`);
        }
      }

      if (buf.length > MAX_BYTES) throw new Error("Ukuran media terlalu besar");

      return await client.sendMessage(
        sender,
        { video: buf, mimetype: "video/mp4", caption: text },
        { quoted: message }
      );
    }

    if (images.length) {
      const buf = await download(images[0]);
      return await client.sendMessage(
        sender,
        { image: buf, caption: text },
        { quoted: message }
      );
    }

    throw new Error("Media tidak ditemukan. Post mungkin private/dihapus.");
  } catch (err) {
    logger.error(`igdl: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Gagal: ${err.message}` }, { quoted: message });
    return false;
  }
};

module.exports = {
  name: "igdl",
  command: ["igdl", "ig", "instagram"],
  category: "downloader",
  description: "Download video/foto Instagram",
  visible: true,
  limit: 1,
  execute: execute
};
