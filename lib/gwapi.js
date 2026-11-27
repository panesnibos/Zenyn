// lib/gwapi.js — akses admin API LLM gateway (loopback) + format untuk .gws.
const TIMEOUT_MS = 15000;

const adminUrl = () => String(process.env.GW_ADMIN_URL || "http://127.0.0.1:8081").replace(/\/+$/, "");
const adminKey = () => String(process.env.GW_ADMIN_KEY || "").trim();
const DEFAULT_URLS = "https://llm-gw.tailb717d3.ts.net/v1,https://api.vnsgw.my.id/v1";
const publicUrls = () =>
  String(process.env.GW_PUBLIC_URLS || DEFAULT_URLS)
    .split(",")
    .map((u) => u.trim().replace(/\/+$/, ""))
    .filter(Boolean);
const publicUrl = () => publicUrls()[0] || "";

const get = async (path) => {
  if (!adminKey()) throw new Error("GW_ADMIN_KEY belum diisi.");
  const res = await fetch(adminUrl() + path, {
    headers: { "x-admin-key": adminKey() },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body && body.error && body.error.message) || `HTTP ${res.status}`);
  return body;
};

const status = () => get("/admin/status");

let modelsCache = { at: 0, data: null };
const modelsAll = async () => {
  if (modelsCache.data && Date.now() - modelsCache.at < 30000) return modelsCache.data;
  const data = await get("/admin/models?period=all");
  modelsCache = { at: Date.now(), data };
  return data;
};

// jam berjalan sejak 00:00 WIB (reset harian gateway)
const hoursSinceWibMidnight = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date()).split(":");
  return Math.max(0.05, Number(parts[0]) + Number(parts[1]) / 60);
};

const usageSinceMidnight = () => get(`/admin/usage?hours=${hoursSinceWibMidnight().toFixed(3)}`);
const errors = (limit = 20) => get(`/admin/errors?limit=${Math.min(100, Math.max(1, limit))}`);

const num = (v) => Number(v || 0).toLocaleString("id-ID");
const short = (v) => {
  const n = Number(v || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(".", ",") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(".", ",") + "K";
  return String(Math.round(n));
};

// buang prefix pemasok (prem/, darus/, dst) lalu gabung token per model bersih
const cleanModel = (id) => String(id || "").replace(/^[^/]+\//, "");
const mergeModels = (rows) => {
  const map = new Map();
  for (const row of rows || []) {
    const model = cleanModel(row.model);
    if (!model) continue;
    const cur = map.get(model) || { model, tokens: 0, requests: 0, errors: 0, upstreams: {} };
    cur.tokens += Number(row.tokens || 0);
    cur.requests += Number(row.requests || 0);
    cur.errors += Number(row.errors || 0);
    for (const [name, tokens] of Object.entries(row.upstreams || {})) {
      cur.upstreams[name] = (cur.upstreams[name] || 0) + Number(tokens || 0);
    }
    map.set(model, cur);
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens);
};

const topUpstreams = (upstreams, max = 3) =>
  Object.entries(upstreams || {})
    .filter(([name, tokens]) => name !== "(direct)" || tokens > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([name, tokens]) => `${name} ${short(tokens)}`)
    .join(" · ");

module.exports = {
  adminUrl,
  publicUrl,
  publicUrls,
  get,
  status,
  modelsAll,
  usageSinceMidnight,
  errors,
  hoursSinceWibMidnight,
  cleanModel,
  mergeModels,
  topUpstreams,
  num,
  short,
  _reset: () => { modelsCache = { at: 0, data: null }; }
};
