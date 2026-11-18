// lib/pinterest.js — ambil media dari link Pinterest tanpa API resmi.
// Ekstraksi berlapis: og:video -> mp4 di __PWS_DATA__ -> og:image -> "orig".
const fetch = require("node-fetch");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 60 * 1024 * 1024;

const SHORT_RE = /(?:https?:\/\/)?(?:www\.)?pin\.it\/([A-Za-z0-9]+)/i;
const PIN_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*pinterest\.[a-z.]{2,}\/pin\/(\d+)/i;

const parseUrl = (text) => {
  const raw = String(text || "");
  const short = SHORT_RE.exec(raw);
  if (short) return { url: `https://pin.it/${short[1]}`, short: true, id: null };
  const full = PIN_RE.exec(raw);
  if (full) return { url: `https://www.pinterest.com/pin/${full[1]}/`, short: false, id: full[1] };
  return null;
};

const unescapeUrl = (value) =>
  String(value || "")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\"/g, '"');

// thumbnail pinimg 736x -> originals supaya gambarnya tidak pecah
const bestImage = (url) => String(url).replace(/\/\d+x\d*\//, "/originals/");

const metaContent = (html, prop) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const name = /(?:property|name)=["']([^"']+)["']/i.exec(tag);
    if (!name || name[1].toLowerCase() !== prop) continue;
    const content = /content=["']([^"']*)["']/i.exec(tag);
    if (content && content[1]) return unescapeUrl(content[1]);
  }
  return null;
};

const mediaOf = (html) => {
  const h = String(html || "");
  if (!h) return null;

  const video =
    metaContent(h, "og:video") ||
    metaContent(h, "og:video:url") ||
    metaContent(h, "og:video:secure_url");
  if (video) return { type: "video", url: video };

  const mp4 =
    /"video_url"\s*:\s*"([^"]+?\.mp4[^"]*)"/i.exec(h) ||
    /"url"\s*:\s*"([^"]+?\.mp4[^"]*)"/i.exec(h);
  if (mp4) return { type: "video", url: unescapeUrl(mp4[1]) };

  const image = metaContent(h, "og:image") || metaContent(h, "og:image:secure_url");
  if (image) return { type: "image", url: bestImage(image) };

  const orig = /"orig"\s*:\s*\{[^{}]*?"url"\s*:\s*"([^"]+)"/i.exec(h);
  if (orig) return { type: "image", url: bestImage(unescapeUrl(orig[1])) };

  return null;
};

const withTimeout = async (ms, fn) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  timer.unref?.();
  try {
    return await fn(ctrl.signal);
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Pinterest timeout. Coba lagi.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const fetchPin = async (url, { fetchImpl = fetch, timeoutMs = 15000 } = {}) => {
  const page = await withTimeout(timeoutMs, async (signal) => {
    const res = await fetchImpl(url, {
      redirect: "follow",
      signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    if (!res.ok) throw new Error(`Pinterest menolak request (${res.status})`);
    return { finalUrl: res.url || url, html: await res.text() };
  });

  const media = mediaOf(page.html);
  if (media && media.type === "video") return media;

  // halaman pin sering SPA tanpa og:image; oEmbed resmi memberi thumbnail
  const oe = await oembed(page.finalUrl, { fetchImpl, timeoutMs });
  if (oe) return { type: "image", url: bestImage(oe.thumbnail_url), title: oe.title || null };
  if (media) return media;

  throw new Error("Media pin tidak ditemukan (pin privat atau markup Pinterest berubah).");
};

const oembed = async (pageUrl, { fetchImpl = fetch, timeoutMs = 15000 } = {}) => {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const res = await fetchImpl(`https://www.pinterest.com/oembed.json?url=${encodeURIComponent(pageUrl)}`, {
        signal,
        headers: { "user-agent": UA, accept: "application/json" }
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json && json.thumbnail_url ? json : null;
    });
  } catch {
    return null;
  }
};

const mb = (n) => Math.round((n / 1024 / 1024) * 10) / 10;

const download = async (media, { fetchImpl = fetch, timeoutMs = 20000 } = {}) => {
  if (!media || !media.url) throw new Error("Tidak ada media untuk diunduh.");
  const type = media.type === "video" ? "video" : "image";
  const limit = type === "video" ? MAX_VIDEO : MAX_IMAGE;

  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetchImpl(media.url, { signal, headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`Gagal mengunduh media (${res.status})`);
    const size = Number(res.headers?.get?.("content-length") || 0);
    if (size && size > limit) throw new Error(`File terlalu besar (${mb(size)} MB, maks ${mb(limit)} MB).`);

    const buffer = typeof res.buffer === "function" ? await res.buffer() : Buffer.from(await res.arrayBuffer());
    if (!buffer || !buffer.length) throw new Error("File hasil unduhan kosong.");
    if (buffer.length > limit) throw new Error(`File terlalu besar (${mb(buffer.length)} MB, maks ${mb(limit)} MB).`);

    return {
      type,
      buffer,
      mimetype: type === "video" ? "video/mp4" : "image/jpeg"
    };
  });
};

module.exports = {
  MAX_IMAGE,
  MAX_VIDEO,
  parseUrl,
  mediaOf,
  bestImage,
  oembed,
  fetchPin,
  download
};
