// commands/gateway/gws.js — info LLM gateway untuk umum (model, usage, logs, api).
const { getPrefix } = require("../../lib/prefix");
const { guarded } = require("../../lib/featureutil");
const gw = require("../../lib/gwapi");

const CHUNK = 3500;
const clip = (text) => (text.length > CHUNK ? text.slice(0, CHUNK - 20) + "\n…(dipotong)" : text);

const dur = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}h ${h}j`;
  if (h) return `${h}j ${m}m`;
  return `${m}m ${s % 60}s`;
};

const overview = async (p) => {
  const s = await gw.status();
  return [
    "🌐 *GATEWAY LLM*",
    `• Status : ${s.ok ? "hidup" : "gangguan"}`,
    `• Uptime : ${dur(s.uptime_s || 0)}`,
    `• Model  : ${gw.num(s.models)} dirutekan`,
    `• Client : ${gw.num(s.clients)} key`,
    `• Hari ini: ${gw.num(s.today?.requests)} req · ${gw.short(s.today?.tokens)} token · ${gw.num(s.today?.errors)} err`,
    "",
    "*Subcommand*",
    `• ${p}gws model — daftar model (kumulatif)`,
    `• ${p}gws usage — pemakaian per key (reset 00:00 WIB)`,
    `• ${p}gws logs — error terakhir`,
    `• ${p}gws api — link API gateway (2 endpoint)`
  ].join("\n");
};

const modelText = async () => {
  const { models } = await gw.modelsAll();
  const merged = gw.mergeModels(models);
  const total = merged.reduce((sum, m) => sum + m.tokens, 0);
  const lines = merged.map((m, i) => {
    const ups = gw.topUpstreams(m.upstreams) || "-";
    return `${i + 1}. *${m.model}*\n   ↳ ${ups}\n   📊 ${gw.short(m.tokens)} tok · ${gw.num(m.requests)} req · ${gw.num(m.errors)} err`;
  });
  return [
    "🧠 *MODEL GATEWAY* _(kumulatif, tanpa reset)_",
    `${gw.num(merged.length)} model · ${gw.short(total)} token`,
    "",
    ...lines
  ].join("\n");
};

const usageText = async () => {
  const u = await gw.usageSinceMidnight();
  const t = u.totals || {};
  const totalTok = Number(t.prompt_tokens || 0) + Number(t.completion_tokens || 0);
  const rows = (u.clients || []).map((c) => {
    const tok = Number(c.prompt_tokens || 0) + Number(c.completion_tokens || 0);
    return `• *${c.client}* — ${gw.num(c.requests)} req · ${gw.short(tok)} tok · ${gw.num(c.errors)} err`;
  });
  return [
    "📊 *USAGE GATEWAY*",
    "_sejak 00:00 WIB (reset harian)_",
    "",
    `*Total*: ${gw.num(t.requests)} req · ${gw.short(totalTok)} token · ${gw.num(t.errors)} err`,
    "",
    ...(rows.length ? rows : ["(belum ada pemakaian)"])
  ].join("\n");
};

const WIB = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
});
const wibTime = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts || "").slice(11, 19) : WIB.format(d);
};

const logsText = async () => {
  const { errors } = await gw.errors(20);
  if (!errors || !errors.length) return "✅ Tidak ada error di log gateway.";
  const rows = errors.map((e) => {
    const time = wibTime(e.ts);
    const status = e.status || e.error || "?";
    return `• ${time} · ${e.client || "?"} · ${status}${Number(e.attempts) > 1 ? ` · ${e.attempts}×` : ""}`;
  });
  return ["🚨 *ERROR LOG GATEWAY* (20 terakhir)", "", ...rows].join("\n");
};

const apiText = () => {
  const urls = gw.publicUrls();
  return [
    "🔗 *API GATEWAY*",
    "",
    "*Base URL*:",
    ...urls.map((u, i) => `${i + 1}. ${u}`),
    "",
    "*Contoh pakai*",
    "```",
    `POST ${urls[0]}/chat/completions`,
    "Authorization: Bearer sk-gw-...",
    "Content-Type: application/json",
    '{"model":"deepseek-v4.1-flash","messages":[{"role":"user","content":"halo"}]}',
    "```",
    "",
    "Key didapat dari owner. Cek pemakaian dengan .gws usage."
  ].join("\n");
};

const sendText = async (client, message, text) => {
  const body = clip(text);
  return client.sendMessage(message.key.remoteJid, { text: body }, { quoted: message });
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const sub = String((args || [])[0] || "").toLowerCase();

  if (!sub) {
    await sendText(client, message, await overview(p));
    return false; // menu panduan: tidak menagih limit
  }

  const handlers = {
    model: async () => sendText(client, message, await modelText()),
    models: async () => sendText(client, message, await modelText()),
    usage: async () => sendText(client, message, await usageText()),
    use: async () => sendText(client, message, await usageText()),
    logs: async () => sendText(client, message, await logsText()),
    log: async () => sendText(client, message, await logsText()),
    api: async () => sendText(client, message, await apiText())
  };

  const handler = handlers[sub];
  if (!handler) {
    await sendText(client, message, [`❌ Subcommand *${sub}* tidak ada.`, "", await overview(p)].join("\n"));
    return false;
  }

  await handler();
  return true;
};

module.exports = {
  name: "gws",
  command: ["gws"],
  category: "gateway",
  visible: true,
  limit: 1,
  description: "Info gateway LLM: model, usage, logs, link API",
  subcommands: ["model", "usage", "logs", "api"],
  execute: guarded("gws", execute),
  _internal: { overview, modelText, usageText, logsText, apiText, dur, wibTime }
};
