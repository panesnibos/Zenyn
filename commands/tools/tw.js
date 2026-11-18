// commands/tools/tw.js — unduh video/gambar dari post X (twitter) lewat api.fxtwitter.com.
const fetch = require("node-fetch");
const { guarded, reply } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const CACHE_MS = 5 * 60 * 1000;
const MAX_VIDEO = 60 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const TIMEOUT_MS = 20000;

const cache = new Map();

const parseId = (text) => {
  const raw = String(text || "");
  const m = /(?:twitter\.com|x\.com)\/(?:[^/\s]+\/status|i\/web\/status)\/(\d{1,25})/i.exec(raw);
  if (m) return m[1];
  const bare = /^(\d{1,25})$/.exec(raw.trim());
  return bare ? bare[1] : null;
};

const bestMedia = (tweet) => {
  const videos = (tweet?.media?.videos || []).filter((v) => v && v.url);
  if (videos.length) {
    const best = videos.slice().sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))[0];
    return { type: "video", url: best.url };
  }
  const photos = (tweet?.media?.photos || []).filter((p) => p && p.url);
  if (photos.length) return { type: "image", url: photos[0].url };
  return null;
};

const withTimeout = async (ms, fn) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  timer.unref?.();
  try {
    return await fn(ctrl.signal);
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Permintaan ke X timeout. Coba lagi.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const lookup = async (id, { fetchImpl = fetch } = {}) => {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const tweet = await withTimeout(TIMEOUT_MS, async (signal) => {
    const res = await fetchImpl(`https://api.fxtwitter.com/status/${id}`, {
      signal,
      headers: { "user-agent": UA, accept: "application/json" }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.code !== 200 || !body?.tweet) {
      if (res.status === 404 || body?.code === 404) throw new Error("Post tidak ada atau sudah dihapus.");
      throw new Error(`Gagal mengambil post (HTTP ${res.status}).`);
    }
    return body.tweet;
  });

  cache.set(id, { at: Date.now(), data: tweet });
  return tweet;
};

const fetchBuffer = async (url, type, { fetchImpl = fetch } = {}) => {
  const limit = type === "video" ? MAX_VIDEO : MAX_IMAGE;
  return withTimeout(TIMEOUT_MS, async (signal) => {
    const res = await fetchImpl(url, { signal, headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`Gagal mengunduh media (HTTP ${res.status}).`);
    const size = Number(res.headers?.get?.("content-length") || 0);
    if (size && size > limit) throw new Error(`File terlalu besar (maks ${Math.floor(limit / 1024 / 1024)} MB).`);
    const buffer = typeof res.buffer === "function" ? await res.buffer() : Buffer.from(await res.arrayBuffer());
    if (!buffer?.length) throw new Error("Media kosong.");
    if (buffer.length > limit) throw new Error(`File terlalu besar (maks ${Math.floor(limit / 1024 / 1024)} MB).`);
    return buffer;
  });
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const id = parseId(args.join(" "));
  if (!id) {
    await reply(client, message, `🐦 Format: *${p}tw <link post X>*\nContoh: ${p}tw https://x.com/user/status/1234567890\nAtau kirim ID post saja.`);
    return false;
  }

  const tweet = await lookup(id);
  const author = tweet.author?.screen_name ? `@${tweet.author.screen_name}` : "X";
  const text = String(tweet.text || "").slice(0, 900);
  const caption = `🐦 ${author}${text ? `\n\n${text}` : ""}`;
  const media = bestMedia(tweet);

  if (!media) return reply(client, message, `${caption}\n\n_(post ini tidak berisi gambar/video)_`);

  const buffer = await fetchBuffer(media.url, media.type);
  const payload =
    media.type === "video"
      ? { video: buffer, mimetype: "video/mp4", caption }
      : { image: buffer, caption };

  return client.sendMessage(message.key.remoteJid, payload, { quoted: message });
};

module.exports = {
  name: "tw",
  command: ["tw", "twitter", "xdl"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Unduh video/gambar dari post X (twitter)",
  execute: guarded("tw", execute),
  _internal: { parseId, bestMedia, lookup, fetchBuffer, cache }
};
