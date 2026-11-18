// commands/tools/ytsearch.js — cari 5 video YouTube dengan tombol unduh.
const fetch = require("node-fetch");
const { guarded, interactive, quick } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 15000;
const LIMIT = 5;

const cache = new Map();

const parseResults = (html) => {
  const m =
    /ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html) ||
    /"ytInitialData"\]\s*=\s*(\{[\s\S]*?\});/.exec(html);
  if (!m) return [];

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }

  const out = [];
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const v = node.videoRenderer;
    if (v && v.videoId && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      out.push({
        id: v.videoId,
        title: (v.title?.runs || []).map((r) => r.text).join("") || v.title?.simpleText || "(tanpa judul)",
        duration: v.lengthText?.simpleText || "",
        author: v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || ""
      });
    }
    for (const key of Object.keys(node)) walk(node[key]);
  };
  walk(data);
  return out;
};

const search = async (query, { fetchImpl = fetch } = {}) => {
  const key = String(query || "").toLowerCase().trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  timer.unref?.();
  try {
    const res = await fetchImpl(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "text/html", "accept-language": "en-US,en;q=0.9" }
    });
    if (!res.ok) throw new Error(`YouTube menolak permintaan (HTTP ${res.status}).`);
    const items = parseResults(await res.text()).slice(0, LIMIT);
    cache.set(key, { at: Date.now(), items });
    return items;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Pencarian YouTube timeout. Coba lagi.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const query = args.join(" ").trim();
  if (!query) {
    await interactive(
      client,
      message,
      `🔎 *CARI YOUTUBE*\n\nFormat: *${p}ytsearch <kata kunci>*\nContoh: ${p}ytsearch lofi belajar`,
      [quick("Contoh", "ytsearch lofi")]
    );
    return false;
  }

  const items = await search(query);
  if (!items.length) throw new Error("Tidak ada hasil untuk pencarian itu.");

  const text = [
    `🔎 *YOUTUBE: ${query}*`,
    "",
    ...items.map((v, i) => `${i + 1}. ${v.title}${v.duration ? ` (${v.duration})` : ""}${v.author ? `\n   ${v.author}` : ""}`),
    "",
    "Pilih nomor untuk melihat & mengunduh."
  ].join("\n");

  const buttons = items.map((v, i) => quick(`${i + 1}. unduh`, `ytmp4 https://youtu.be/${v.id}`));
  return interactive(client, message, text, buttons);
};

module.exports = {
  name: "ytsearch",
  command: ["ytsearch", "yts", "cariyt"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Cari 5 video YouTube + tombol unduh",
  execute: guarded("ytsearch", execute),
  _internal: { parseResults, search, cache }
};
