// lib/gwmonitor.js — pantau LLM gateway lewat admin API, kirim WA ke owner kalau bermasalah.
const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const config = require("../config");

const STATE_FILE = process.env.GW_MONITOR_STATE || path.join(__dirname, "..", "database", "gwmonitor.json");
const POLL_MS = Number(process.env.GW_MONITOR_POLL_MS) || 60 * 1000;
const COOLDOWN_MS = 15 * 60 * 1000;
const FAILS_TO_ALERT = 2;
const OKS_TO_RECOVER = 3;

let timer = null;
let socket = null;
let state = load();

function load() {
  const empty = { fails: 0, oks: 0, alerted: {} };
  try {
    return Object.assign(empty, JSON.parse(fs.readFileSync(STATE_FILE, "utf8")));
  } catch {
    return empty;
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    logger.error(`gwmonitor: gagal simpan state (${err.message})`);
  }
}

const adminUrl = () => String(process.env.GW_ADMIN_URL || "http://127.0.0.1:8081").replace(/\/+$/, "");
const adminKey = () => String(process.env.GW_ADMIN_KEY || "").trim();

async function get(apiPath) {
  const res = await fetch(adminUrl() + apiPath, {
    headers: { "x-admin-key": adminKey() },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const canAlert = (kind) => Date.now() - (state.alerted[kind] || 0) > COOLDOWN_MS;
const markAlert = (kind) => {
  state.alerted[kind] = Date.now();
  save();
};

async function sendOwners(text) {
  if (!socket) return;
  const jids = (config.owners || []).map((n) => `${String(n).replace(/\D/g, "")}@s.whatsapp.net`);
  for (const jid of jids) {
    try {
      await socket.sendMessage(jid, { text });
    } catch (err) {
      logger.error(`gwmonitor: kirim ke ${jid} gagal (${err.message})`);
    }
  }
}

async function check() {
  if (!adminKey()) return; // belum dikonfigurasi: diam saja

  let s;
  try {
    s = await get("/admin/status");
  } catch (err) {
    state.fails++;
    state.oks = 0;
    save();
    if (state.fails >= FAILS_TO_ALERT && canAlert("down")) {
      markAlert("down");
      await sendOwners(`🔴 *LLM GATEWAY MATI*\n\n${adminUrl()} tidak menjawab ${state.fails}× berturut-turut.\n${err.message}`);
    }
    return;
  }

  state.fails = 0;
  state.oks++;
  save();

  if (state.alerted.down && state.oks >= OKS_TO_RECOVER) {
    delete state.alerted.down;
    state.oks = 0;
    save();
    await sendOwners(
      `🟢 *LLM GATEWAY PULIH*\n\nuptime ${Math.round(s.uptime_s)}s · ${s.clients} client key · ${s.today.requests} request hari ini.`
    );
  }

  if (s.last_5m.s402 > 0 && canAlert("quota")) {
    markAlert("quota");
    const off = (s.upstreams || []).filter((u) => u.cooling_s > 0).map((u) => u.name);
    await sendOwners(
      `💳 *KUOTA UPSTREAM HABIS*\n\nUpstream membalas 402 (payment required) ${s.last_5m.s402}× dalam 5 menit.` +
        (off.length ? `\nDilewati sementara: ${off.join(", ")}` : "") +
        `\nKalau model itu tidak punya cadangan, client akan gagal sampai kuota diisi.`
    );
  }

  if (s.last_5m.s5xx > 3 && canAlert("upstream")) {
    markAlert("upstream");
    const by = Object.entries(s.last_5m_by_upstream || {})
      .map(([name, row]) => `${name} ${row.errors}/${row.requests}`)
      .join(" · ");
    let detail = "";
    try {
      const { errors } = await get("/admin/errors?limit=5");
      detail = errors.map((e) => `• ${String(e.ts).slice(11, 19)} ${e.client || "?"} → ${e.status || e.error}`).join("\n");
    } catch {}
    await sendOwners(
      `🟠 *UPSTREAM BERMASALAH*\n\n${s.last_5m.s5xx} error 5xx dalam 5 menit terakhir.` +
        (by ? `\nPer upstream: ${by}` : "") +
        (detail ? "\n\n" + detail : "")
    );
  }
}

const start = (client) => {
  socket = client;
  if (timer) return;
  timer = setInterval(() => check().catch((err) => logger.error(`gwmonitor: ${err.message}`)), POLL_MS);
  setTimeout(() => check().catch((err) => logger.error(`gwmonitor: ${err.message}`)), 10000);
  logger.info(`gwmonitor: mulai, poll ${Math.round(POLL_MS / 1000)}s`);
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
  socket = null;
};

module.exports = {
  start,
  stop,
  _internal: {
    check,
    sendOwners,
    state: () => state,
    setSocket: (c) => {
      socket = c;
    },
    reset: () => {
      state = { fails: 0, oks: 0, alerted: {} };
    },
  },
};
