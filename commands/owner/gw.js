// commands/owner/gw.js — kontrol & status LLM gateway lewat admin API (khusus owner).
// Admin API hanya listen di loopback, jadi command ini harus jalan di VPS yang sama.
const { execFile } = require("child_process");
const { promisify } = require("util");
const logger = require("../../lib/logger");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");

const run = promisify(execFile);
const TIMEOUT_MS = 15000;
const WA_LIMIT = 3500;

const adminUrl = () => String(process.env.GW_ADMIN_URL || "http://127.0.0.1:8081").replace(/\/+$/, "");
const adminKey = () => String(process.env.GW_ADMIN_KEY || "").trim();

const api = async (path, init = {}) => {
  if (!adminKey()) throw new Error("GW_ADMIN_KEY belum diisi di .env");
  const res = await fetch(adminUrl() + path, {
    ...init,
    headers: { "x-admin-key": adminKey(), "content-type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error((body && body.error && body.error.message) || `HTTP ${res.status}`);
  return body;
};

const num = (v) => Number(v || 0).toLocaleString("id-ID");
const tok = (c) => num((c.prompt_tokens || 0) + (c.completion_tokens || 0));
const latency = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "s" : (v || 0) + "ms");
const dur = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}h ${h}j`;
  if (h) return `${h}j ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${Math.round(s)}s`;
};
const clip = (t) => (t.length > WA_LIMIT ? t.slice(0, WA_LIMIT - 15) + "\n…(dipotong)" : t);
const code = (t) => "```\n" + t + "\n```";

const statusText = (s) =>
  [
    "🟢 *LLM GATEWAY* hidup",
    "",
    `• uptime   : ${dur(s.uptime_s)}`,
    `• upstream : ${s.upstream}`,
    `• client   : ${s.clients} key`,
    `• hari ini : ${num(s.today.requests)} req · ${num(s.today.tokens)} token · ${num(s.today.errors)} error`,
    `• 5 menit  : ${num(s.last_5m.requests)} req · 5xx ${s.last_5m.s5xx} · 429 ${s.last_5m.s429} · 402 ${s.last_5m.s402}`,
    s.last_request
      ? `• terakhir : ${s.last_request.client || "?"} → ${s.last_request.status} (${latency(s.last_request.ms)}, ${s.last_request.attempts}× coba)`
      : "• terakhir : belum ada request",
  ].join("\n");

const usageText = (u, only) => {
  const rows = only ? u.clients.filter((c) => String(c.client).toLowerCase() === only.toLowerCase()) : u.clients;
  if (!rows.length) return `Tidak ada pemakaian${only ? ` untuk *${only}*` : ""} dalam ${u.hours} jam terakhir.`;
  const lines = rows.map((c) => `*${c.client}*\n  ${num(c.requests)} req · ${tok(c)} tok · ${num(c.errors)} err · ${latency(c.avg_ms)}`);
  const t = u.totals;
  return [`📊 *PEMAKAIAN ${u.hours} JAM*`, "", ...lines, "", `total: ${num(t.requests)} req · ${num(t.prompt_tokens + t.completion_tokens)} tok · ${num(t.errors)} err`].join("\n");
};

const keysText = (k) =>
  k.keys.length
    ? ["🔑 *CLIENT KEY*", "", ...k.keys.map((x) => `• ${x.label} — \`${x.masked}\``)].join("\n")
    : "Belum ada client key.";

const errorsText = (errors) =>
  errors.length
    ? ["⚠️ *ERROR TERAKHIR*", "", ...errors.map((e) => `• ${String(e.ts).slice(11, 19)} ${e.client || "?"} → ${e.status || e.error}${e.attempts > 1 ? ` (${e.attempts}×)` : ""}`)].join("\n")
    : "Tidak ada error tercatat.";

const HELP = (p) =>
  [
    "🌐 *GATEWAY (khusus owner)*",
    "",
    `• *${p}gw* — status ringkas`,
    `• *${p}gw usage [label]* — token per client (24 jam)`,
    `• *${p}gw keys* — daftar client`,
    `• *${p}gw key add <label>* — buat key baru`,
    `• *${p}gw key del <label>* — cabut key`,
    `• *${p}gw errors [n]* — error terakhir`,
    `• *${p}gw restart --yes* — restart service gateway`,
    `• *${p}gw funnel* — status Tailscale Funnel`,
  ].join("\n");

const execute = async (client, message, args, commands) => {
  if (!isOwner(message)) return; // command tersembunyi: jangan bocorkan keberadaannya

  const jid = message.key.remoteJid;
  const p = getPrefix(message);
  const reply = (text) => client.sendMessage(jid, { text: clip(text) }, { quoted: message });
  const sub = String(args[0] || "").toLowerCase();
  const sub2 = String(args[1] || "").toLowerCase();

  try {
    if (!sub || sub === "status") return await reply(statusText(await api("/admin/status")));

    if (sub === "usage") return await reply(usageText(await api("/admin/usage?hours=24"), args[1]));

    if (sub === "keys") return await reply(keysText(await api("/admin/keys")));

    if (sub === "errors") {
      const limit = Math.min(20, Math.max(1, Number(args[1]) || 5));
      const { errors } = await api(`/admin/errors?limit=${limit}`);
      return await reply(errorsText(errors));
    }

    if (sub === "key" && sub2 === "add") {
      const label = String(args[2] || "").trim();
      if (!label) return await reply(`Format: *${p}gw key add <label>*`);
      const r = await api("/admin/keys", { method: "POST", body: JSON.stringify({ label }) });
      logger.cmd(`gw: key ${r.label} dibuat`);
      return await reply([`✅ Key *${r.label}* dibuat dan langsung aktif (tanpa restart).`, "", code(r.key), "Simpan sekarang — tidak bisa ditampilkan lagi."].join("\n"));
    }

    if (sub === "key" && sub2 === "del") {
      const label = String(args[2] || "").trim();
      if (!label) return await reply(`Format: *${p}gw key del <label>*`);
      const r = await api(`/admin/keys/${encodeURIComponent(label)}`, { method: "DELETE" });
      logger.cmd(`gw: key ${r.deleted} dicabut`);
      return await reply(`🗑️ Key *${r.deleted}* dicabut. Request dengan key itu sekarang ditolak.`);
    }

    if (sub === "key") return await reply(HELP(p));

    if (sub === "restart") {
      if (!args.slice(1).some((a) => String(a).toLowerCase() === "--yes")) {
        return await reply(`Restart memutus semua client API sekejap.\nKalau yakin: *${p}gw restart --yes*`);
      }
      await reply("⏳ Merestart gateway...");
      await run("systemctl", ["restart", "llm-gw"], { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 2500));
      logger.cmd("gw: service direstart");
      return await reply("✅ Gateway direstart.\n\n" + statusText(await api("/admin/status")));
    }

    if (sub === "funnel") {
      const { stdout, stderr } = await run("tailscale", ["funnel", "status"], { timeout: 20000 });
      return await reply(code(((stdout || "") + (stderr || "")).trim() || "(kosong)"));
    }

    if (sub === "help") return await reply(HELP(p));

    return await reply(`Perintah *${sub}* tidak dikenal.\n\n` + HELP(p));
  } catch (err) {
    logger.error(`gw: ${err.message}`);
    return await reply(`❌ ${err.message}`);
  }
};

module.exports = {
  name: "gw",
  command: "gw",
  category: "Gateway",
  description: "Status & kontrol LLM gateway (owner)",
  visible: false,
  execute,
};
