const { resolvePn } = require("./lid");

const isPnJid = (jid) => /@(s\.whatsapp\.net|hosted)$/i.test(String(jid || ""));
const isLidJid = (jid) => /@(lid|hosted\.lid)$/i.test(String(jid || ""));

const getRank = (level) => {
  if (level >= 50) return { rank: "Legendary", icon: "👑" };
  if (level >= 30) return { rank: "Master", icon: "💎" };
  if (level >= 20) return { rank: "Expert", icon: "🔥" };
  if (level >= 10) return { rank: "Warrior", icon: "⚔️" };
  if (level >= 5) return { rank: "Soldier", icon: "🛡" };
  return { rank: "Novice", icon: "🌱" };
};

const makeBar = (current, max, len = 8) => {
  const filled = Math.min(len, Math.round((current / max) * len));
  return "▰".repeat(filled) + "▱".repeat(len - filled);
};

const normalizeNumber = (jid) => {
  let value = String(jid || "").replace(/^@/, "");
  value = value.split("@")[0];
  value = value.split(":")[0];
  return value.replace(/\D/g, "").trim();
};

const getSenderJids = (message) => {
  const k = message.key || {};
  return [k.senderPn, k.participantPn, k.participant, k.remoteJid, k.participantAlt, k.remoteJidAlt]
    .filter(Boolean)
    .map(String)
    .filter((jid) => isPnJid(jid) || isLidJid(jid));
};

const getSenderJid = (message) => {
  const list = getSenderJids(message);
  return list.find(isPnJid) || list.find(isLidJid) || null;
};

const getUserId = (message) => {
  if (message && message.canonicalUserId) return message.canonicalUserId;
  const jid = getSenderJid(message);
  return jid ? normalizeNumber(jid) : null;
};

const getContextInfo = (message) => {
  const m = message.message || {};
  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    null
  );
};

const resolveTarget = async (message, args, client) => {
  const ctx = getContextInfo(message);
  const quoted = ctx?.participant || ctx?.participantPn || ctx?.participantAlt;
  const mentions = ctx?.mentionedJid || [];
  const list = Array.isArray(args) ? [...args] : [];
  const atIndex = list.findIndex((a) => typeof a === "string" && a.trim().startsWith("@"));

  let targetJid = "";
  let rest = list;

  if (quoted) {
    targetJid = quoted;
    rest = atIndex >= 0 ? list.filter((_, i) => i !== atIndex) : list;
  } else if (mentions.length) {
    targetJid = mentions[0];
    rest = atIndex >= 0 ? list.filter((_, i) => i !== atIndex) : list.slice(1);
  } else if (atIndex >= 0) {
    targetJid = list[atIndex];
    rest = list.filter((_, i) => i !== atIndex);
  } else {
    targetJid = list[0] || "";
    rest = list.slice(1);
  }

  let targetId = normalizeNumber(targetJid);
  if (targetJid && client) {
    const pn = await resolvePn(client, targetJid);
    if (pn) targetId = normalizeNumber(pn);
  }

  return { targetId, targetJid, rest };
};

module.exports = {
  getUserId,
  getRank,
  makeBar,
  normalizeNumber,
  resolveTarget,
  getSenderJid,
  getSenderJids,
  isPnJid,
  isLidJid
};
