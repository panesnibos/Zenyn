const path = require("path");
const logger = require("./logger");
const config = require("../config");
const { readJson, writeJson } = require("./rpgjson");
const { isEnabled } = require("./notify");

const STATE_FILE = path.join(__dirname, "../database/notify/last-gempa.json");
const DEFAULT_BASE = "https://data.bmkg.go.id/DataMKG/TEWS/";
const TIMEOUT_MS = 10000;
const GROUP_CACHE_MS = 10 * 60 * 1000;
const START_DELAY_MS = 5000;

let timer = null;
let running = false;
let groupCache = { at: 0, jids: [] };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const baseUrl = () => {
  const base = String(config.bmkgBase || DEFAULT_BASE);
  return base.endsWith("/") ? base : `${base}/`;
};

const fetchJson = async (file) => {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl()}${file}`, {
      signal: controller.signal,
      headers: { "user-agent": "ZenynBot/1.0 (+https://github.com/panesnibos/Zenyn)" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("BMKG timeout");
    throw err;
  } finally {
    clearTimeout(timerId);
  }
};

const normalize = (g) => ({
  id: String(g.Shakemap || `${g.DateTime}|${g.Magnitude}|${g.Coordinates}`),
  tanggal: g.Tanggal || "-",
  jam: g.Jam || "-",
  mag: g.Magnitude || "-",
  lintang: g.Lintang || "-",
  bujur: g.Bujur || "-",
  kedalaman: g.Kedalaman || "-",
  wilayah: g.Wilayah || "-",
  potensi: g.Potensi || "-",
  dirasakan: g.Dirasakan || "",
  shakemap: g.Shakemap || ""
});

const fetchLatest = async () => {
  const data = await fetchJson("autogempa.json");
  const g = data?.Infogempa?.gempa;
  if (!g) throw new Error("Format autogempa BMKG tidak dikenali");
  return normalize(g);
};

const fetchRecent = async () => {
  const data = await fetchJson("gempaterkini.json");
  const list = data?.Infogempa?.gempa;
  if (!Array.isArray(list)) throw new Error("Format gempaterkini BMKG tidak dikenali");
  return list.map(normalize);
};

const fetchFelt = async () => {
  const data = await fetchJson("gempadirasakan.json");
  const list = data?.Infogempa?.gempa;
  if (!Array.isArray(list)) throw new Error("Format gempadirasakan BMKG tidak dikenali");
  return list.map(normalize);
};

const formatMessage = (q) => {
  const lines = [
    "🚨 *TELAH TERJADI GEMPA*",
    "",
    `🌍 *Magnitudo* : ${q.mag} SR`,
    `🕒 *Waktu* : ${q.tanggal} ${q.jam}`,
    `📍 *Koordinat* : ${q.lintang}, ${q.bujur}`,
    `🏷️ *Wilayah* : ${q.wilayah}`,
    `🔻 *Kedalaman* : ${q.kedalaman}`,
    `🌊 *Potensi* : ${q.potensi}`
  ];

  if (q.dirasakan) lines.push(`👥 *Dirasakan* : ${q.dirasakan}`);

  lines.push("", "_Sumber: BMKG_");
  return lines.join("\n");
};

const joinButtons = () =>
  config.groupLink
    ? [
        {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: "🔗 Join Group",
            url: config.groupLink
          })
        }
      ]
    : [];

const getGroupJids = async (client, { force = false } = {}) => {
  const fresh = Date.now() - groupCache.at < GROUP_CACHE_MS;
  if (!force && fresh && groupCache.jids.length) return groupCache.jids;

  try {
    const groups = await client.groupFetchAllParticipating();
    const jids = Object.keys(groups || {}).filter((jid) => jid.endsWith("@g.us"));
    groupCache = { at: Date.now(), jids };
    return jids;
  } catch (err) {
    logger.warn(`quake: gagal ambil daftar grup: ${err.message}`);
    return groupCache.jids;
  }
};

const sendToGroup = async (client, jid, text) => {
  const buttons = joinButtons();
  const payload = buttons.length ? { text, interactiveButtons: buttons } : { text };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (buttons.length) await client.sendInteractiveMessage(jid, payload);
      else await client.sendMessage(jid, payload);
      return true;
    } catch (err) {
      if (attempt === 1) {
        logger.warn(`quake: gagal kirim ${jid}: ${err.message}`);
        return false;
      }
      await sleep(2000);
    }
  }

  return false;
};

const broadcast = async (client, quake) => {
  const text = formatMessage(quake);
  const jids = await getGroupJids(client, { force: true });

  if (!jids.length) {
    logger.warn("quake: tidak ada grup tujuan, notif dilewati");
    return { sent: 0, total: 0 };
  }

  const delay = Math.max(0, Number(config.quakeDelayMs ?? 10000));
  let sent = 0;

  for (let i = 0; i < jids.length; i++) {
    const ok = await sendToGroup(client, jids[i], text);
    if (ok) sent++;
    if (i < jids.length - 1 && delay) await sleep(delay);
  }

  logger.ok(`quake: notif M${quake.mag} terkirim ${sent}/${jids.length} grup`);
  return { sent, total: jids.length };
};

const checkOnce = async (client) => {
  if (running) return;
  running = true;

  try {
    if (config.quakeNotify === false) return;
    if (!isEnabled("gempa")) return;

    const quake = await fetchLatest();
    const state = readJson(STATE_FILE, {}) || {};

    if (!state.id) {
      writeJson(STATE_FILE, { id: quake.id, at: Date.now() });
      logger.info(`quake: baseline disimpan (${quake.id})`);
      return;
    }

    if (state.id === quake.id) return;

    writeJson(STATE_FILE, { id: quake.id, at: Date.now() });
    logger.warn(`quake: gempa baru M${quake.mag} - ${quake.wilayah}`);

    await broadcast(client, quake);
  } catch (err) {
    logger.warn(`quake: cek gagal: ${err.message}`);
  } finally {
    running = false;
  }
};

const startWatcher = (client) => {
  if (timer) return;

  const poll = Math.max(15000, Number(config.quakePollMs ?? 60000));
  const tick = () => {
    checkOnce(client).catch(() => {});
  };

  logger.info(
    `quake: watcher aktif (poll ${poll}ms, delay ${Number(config.quakeDelayMs ?? 10000)}ms)`
  );

  setTimeout(tick, START_DELAY_MS).unref?.();
  timer = setInterval(tick, poll);
  if (timer.unref) timer.unref();
};

const stopWatcher = () => {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
  logger.info("quake: watcher dihentikan");
};

module.exports = {
  STATE_FILE,
  normalize,
  formatMessage,
  joinButtons,
  fetchLatest,
  fetchRecent,
  fetchFelt,
  broadcast,
  checkOnce,
  startWatcher,
  stopWatcher
};
