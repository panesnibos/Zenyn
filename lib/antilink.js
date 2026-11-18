// lib/antilink.js — penjaga link per grup: hapus pesan, beri peringatan,
// keluarkan anggota pada peringatan ke-3. State: database/antilink.json
const path = require("path");
const logger = require("./logger");
const { readJson, writeJson } = require("./rpgjson");
const { getSenderJids, normalizeNumber } = require("./rpgutil");

const FILE = path.join(__dirname, "../database/antilink.json");
// default: link undangan grup WhatsApp
const DEFAULT_DOMAINS = ["chat.whatsapp.com"];
const MAX_WARN = 3;
const MAX_DOMAINS = 20;

let cache = null;
const load = () => {
  if (!cache) cache = readJson(FILE, {}) || {};
  if (!cache.groups || typeof cache.groups !== "object") cache.groups = {};
  return cache;
};
const save = () => writeJson(FILE, load());

const blank = () => ({ enabled: false, blocked: DEFAULT_DOMAINS.slice(), warns: {} });

const get = (jid) => {
  const cur = load().groups[jid];
  if (!cur) return blank();
  return {
    enabled: !!cur.enabled,
    blocked: Array.isArray(cur.blocked) ? cur.blocked.slice() : DEFAULT_DOMAINS.slice(),
    warns: cur.warns && typeof cur.warns === "object" ? { ...cur.warns } : {}
  };
};

const update = (jid, fn) => {
  const cur = get(jid);
  fn(cur);
  load().groups[jid] = cur;
  save();
  return cur;
};

const cleanDomain = (input) => {
  const v = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#\s]/)[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) return null;
  return v;
};

const addDomain = (jid, input) => {
  const domain = cleanDomain(input);
  if (!domain) throw new Error("Domain tidak valid. Contoh: antilink add chat.whatsapp.com");
  const cur = get(jid);
  if (cur.blocked.includes(domain)) throw new Error(`Domain ${domain} sudah ada di daftar.`);
  if (cur.blocked.length >= MAX_DOMAINS) throw new Error(`Maksimal ${MAX_DOMAINS} domain per grup.`);
  update(jid, (g) => g.blocked.push(domain));
  return domain;
};

const removeDomain = (jid, index) => {
  const cur = get(jid);
  const n = Number(String(index ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > cur.blocked.length) {
    throw new Error(`Nomor domain harus 1 sampai ${cur.blocked.length}.`);
  }
  let removed = "";
  update(jid, (g) => {
    removed = g.blocked.splice(n - 1, 1)[0];
  });
  return removed;
};

const setEnabled = (jid, value) => update(jid, (g) => { g.enabled = !!value; }).enabled;

const patternOf = (domain) =>
  new RegExp(`(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\\.)*${domain.replace(/\./g, "\\.")}(?![a-z0-9.-])`, "i");

// domain terlarang pertama yang muncul di teks, atau null
const match = (jid, text) => {
  const hay = String(text || "").toLowerCase();
  if (!hay) return null;
  return get(jid).blocked.find((d) => patternOf(d).test(hay)) || null;
};

const warn = (jid, uid) => {
  const n = (Number(get(jid).warns[uid]) || 0) + 1;
  update(jid, (g) => { g.warns[uid] = n; });
  return n;
};

const resetWarns = (jid, uid) => update(jid, (g) => { delete g.warns[uid]; });

const participantOf = (meta, ids) => {
  const want = (ids || []).map(normalizeNumber).filter(Boolean);
  if (!want.length) return null;
  return (meta?.participants || []).find((p) =>
    [p.id, p.phoneNumber, p.lid].filter(Boolean).map(normalizeNumber).some((n) => want.includes(n))
  ) || null;
};

const isAdmin = (participant) =>
  !!participant && (participant.admin === "admin" || participant.admin === "superadmin");

// Dipanggil dispatcher untuk setiap pesan grup. true = pesan sudah ditangani.
const enforce = async (client, message, text) => {
  const chat = message.key.remoteJid;
  if (!/@g\.us$/i.test(String(chat)) || !text) return false;
  if (!get(chat).enabled) return false;
  const domain = match(chat, text);
  if (!domain) return false;

  const meta = await client.groupMetadata(chat).catch(() => null);
  if (!meta) return false;

  const who = participantOf(meta, getSenderJids(message));
  if (!who) return false;
  if (isAdmin(who)) return false; // admin grup tidak disentuh (bot juga tak bisa mengeluarkannya)

  const botIds = [client.user?.id, client.user?.lid];
  if (!isAdmin(participantOf(meta, botIds))) return false; // tanpa admin, bot tak bisa hapus/keluarkan

  await client
    .sendMessage(chat, { delete: message.key })
    .catch((err) => logger.warn(`antilink: hapus pesan gagal: ${err.message}`));

  const target = who.id;
  const label = `@${normalizeNumber(target)}`;
  const uid = message.canonicalUserId || normalizeNumber(target);
  const count = warn(chat, uid);

  if (count >= MAX_WARN) {
    resetWarns(chat, uid);
    try {
      await client.groupParticipantsUpdate(chat, [target], "remove");
      logger.cmd(`antilink: ${normalizeNumber(target)} keluar dari ${chat} (${MAX_WARN}x link)`);
      await client.sendMessage(chat, {
        text: `🚫 *ANTILINK*\n\n${label} dikeluarkan dari grup — ${MAX_WARN}/${MAX_WARN} peringatan link terlarang (*${domain}*).`,
        mentions: [target]
      });
    } catch (err) {
      logger.warn(`antilink: keluarkan gagal: ${err.message}`);
      await client.sendMessage(chat, {
        text: `⚠️ *ANTILINK*\n\n${label} sudah ${MAX_WARN}x kirim link terlarang (*${domain}*), tapi bot gagal mengeluarkan: ${err.message}`,
        mentions: [target]
      });
    }
    return true;
  }

  await client.sendMessage(chat, {
    text: `⚠️ *ANTILINK*\n\n${label} mengirim link terlarang (*${domain}*).\nPeringatan ${count}/${MAX_WARN} — ${MAX_WARN - count}x lagi keluar grup.`,
    mentions: [target]
  });
  return true;
};

module.exports = {
  FILE,
  DEFAULT_DOMAINS,
  MAX_WARN,
  MAX_DOMAINS,
  get,
  setEnabled,
  addDomain,
  removeDomain,
  match,
  warn,
  resetWarns,
  participantOf,
  isAdmin,
  enforce,
  _internal: { reset: () => { cache = null; } }
};
