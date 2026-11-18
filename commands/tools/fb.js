// commands/tools/fb.js — unduh video Facebook (scraping HTML, rapuh).
// Format: .fb <link>
const fetch = require("node-fetch");
const { guarded, reply } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MAX_BYTES = 60 * 1024 * 1024;
const TIMEOUT_MS = 20000;

const isFb = (text) => /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:facebook\.com|fb\.watch|fb\.me)\//i.test(String(text || ""));
const firstUrl = (text) => {
  const m = /https?:\/\/[^\s<>"']+/i.exec(String(text || ""));
  return m ? m[0].replace(/[),.;]+$/, "") : null;
};

const unescape = (s) =>
  String(s || "")
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

// ambil URL mp4 pertama (hd dulu, lalu sd)
const videoUrl = (html) => {
  const h = String(html || "");
  const patterns = [
    /"playable_url_quality_hd"\s*:\s*"([^"]+)"/i,
    /"playable_url"\s*:\s*"([^"]+)"/i,
    /hd_src(?:_no_ratelimit)?":"([^"]+)"/i,
    /sd_src(?:_no_ratelimit)?":"([^"]+)"/i,
    /"browser_native_hd_url"\s*:\s*"([^"]+)"/i,
    /"browser_native_sd_url"\s*:\s*"([^"]+)"/i
  ];
  for (const re of patterns) {
    const m = re.exec(h);
    if (m && m[1]) return unescape(m[1]);
  }
  return null;
};

const withTimeout = async (ms, fn) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  timer.unref?.();
  try {
    return await fn(ctrl.signal);
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Facebook terlalu lambat (timeout).");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const resolveVideo = async (url, { fetchImpl = fetch } = {}) =>
  withTimeout(TIMEOUT_MS, async (signal) => {
    const res = await fetchImpl(url, {
      signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,*/*", "accept-language": "en-US,en;q=0.9" }
    });
    if (!res.ok) throw new Error(`Facebook menolak request (HTTP ${res.status}).`);
    const video = videoUrl(await res.text());
    if (!video) throw new Error("Video tidak ditemukan (post privat atau markup Facebook berubah).");
    return video;
  });

const fetchBuffer = async (url, { fetchImpl = fetch } = {}) =>
  withTimeout(TIMEOUT_MS, async (signal) => {
    const res = await fetchImpl(url, { signal, headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`Gagal mengunduh video (HTTP ${res.status}).`);
    const size = Number(res.headers?.get?.("content-length") || 0);
    if (size && size > MAX_BYTES) throw new Error(`Video terlalu besar (maks ${Math.floor(MAX_BYTES / 1024 / 1024)} MB).`);
    const buffer = typeof res.buffer === "function" ? await res.buffer() : Buffer.from(await res.arrayBuffer());
    if (!buffer?.length) throw new Error("Video kosong.");
    if (buffer.length > MAX_BYTES) throw new Error(`Video terlalu besar (maks ${Math.floor(MAX_BYTES / 1024 / 1024)} MB).`);
    return buffer;
  });

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const url = firstUrl(args.join(" "));
  if (!url || !isFb(url)) {
    await reply(client, message, `📘 Format: *${p}fb <link video Facebook>*\nContoh: ${p}fb https://fb.watch/xxxxx`);
    return false;
  }

  const videoUrl_ = await resolveVideo(url);
  const buffer = await fetchBuffer(videoUrl_);
  return client.sendMessage(
    message.key.remoteJid,
    { video: buffer, mimetype: "video/mp4", caption: "📘 Video Facebook" },
    { quoted: message }
  );
};

module.exports = {
  name: "fb",
  command: ["fb", "fbdl", "facebook"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Unduh video Facebook (fb.watch / facebook.com)",
  execute: guarded("fb", execute),
  _internal: { videoUrl, isFb, resolveVideo, fetchBuffer }
};
