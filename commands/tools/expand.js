// commands/tools/expand.js — buka shortlink: tunjukkan URL final & jumlah lompatan.
const fetch = require("node-fetch");
const { guarded, reply } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");
const { assertPublic } = require("../../lib/safeurl");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MAX_HOPS = 5;
const TIMEOUT_MS = 12000;
const REDIRECT = new Set([301, 302, 303, 307, 308]);

const firstUrl = (text) => {
  const m = /https?:\/\/[^\s<>"']+/i.exec(String(text || ""));
  return m ? m[0].replace(/[),.;]+$/, "") : null;
};

const follow = async (raw, { fetchImpl = fetch } = {}) => {
  let current = assertPublic(raw).toString();
  const hops = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  timer.unref?.();
  try {
    for (let i = 0; i <= MAX_HOPS; i++) {
      const res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": UA, accept: "text/html,*/*" }
      });
      try {
        res.body?.destroy?.();
      } catch {}
      const location = res.headers?.get?.("location");
      if (!location || !REDIRECT.has(res.status)) return { final: current, status: res.status, hops };
      const next = new URL(location, current).toString();
      assertPublic(next); // setap lompatan juga wajib publik
      hops.push(next);
      current = next;
      if (i === MAX_HOPS) throw new Error("Terlalu banyak redirect (maks 5).");
    }
    return { final: current, status: 0, hops };
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Server tujuan terlalu lambat (timeout).");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const url = firstUrl(args.join(" "));
  if (!url) {
    await reply(client, message, `🔗 Format: *${p}expand <link pendek>*\nContoh: ${p}expand https://bit.ly/abc123`);
    return false;
  }
  const out = await follow(url);
  const lines = ["🔗 *EXPAND LINK*", "", `Awal  : ${url}`, `Final : ${out.final}`, `Status: ${out.status}`, `Lompat: ${out.hops.length}x`];
  if (out.hops.length > 1) lines.push("", "*Jejak:*", ...out.hops.map((h, i) => `${i + 1}. ${h}`));
  return reply(client, message, lines.join("\n"));
};

module.exports = {
  name: "expand",
  command: ["expand", "unshort", "ceklinks"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Buka shortlink: URL final + jumlah redirect (blokir jaringan lokal)",
  execute: guarded("expand", execute),
  _internal: { follow, firstUrl }
};
