// lib/interactivepayload.js
// Chat pribadi tidak merender pesan interactive (WhatsApp Desktop/Web membuangnya
// tanpa error), jadi di DM tombol diubah menjadi baris perintah yang bisa diketik.
const { getPrefixByJid } = require("./prefix");

// baileys_helper's high-level converter does not attach mention context.
// Use the native message shape only when mentions are requested.
const withMentions = (payload, mentions) => {
  if (!Array.isArray(mentions) || !mentions.length) return payload;
  const interactiveMessage = {
    body: { text: payload.text || "" },
    nativeFlowMessage: { buttons: payload.interactiveButtons || [] },
    contextInfo: { mentionedJid: [...new Set(mentions)] }
  };
  if (payload.footer) interactiveMessage.footer = { text: payload.footer };
  if (payload.title) interactiveMessage.header = { title: payload.title, hasMediaAttachment: false };
  return { interactiveMessage };
};

const isGroup = (jid) => /@g\.us$/i.test(String(jid || ""));

const parseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Satu baris per aksi, berisi perintah yang bisa diketik.
const actionLines = (payload, p) => {
  const lines = [];
  const add = (line) => {
    if (line && !lines.includes(line)) lines.push(line);
  };

  for (const button of payload.interactiveButtons || []) {
    const params = parseJson(button?.buttonParamsJson);
    if (!params) continue;
    if (button.name === "cta_url") {
      if (params.url) add(`🔗 ${params.display_text || "Link"}: ${params.url}`);
      continue;
    }
    if (button.name === "single_select") {
      for (const section of params.sections || []) {
        for (const row of section?.rows || []) {
          if (row?.id) add(`• ${row.title || row.id} — ${p}${row.id}`);
        }
      }
      continue;
    }
    if (params.id) add(`• ${params.display_text || params.id} — ${p}${params.id}`);
  }

  for (const button of payload.buttons || []) {
    if (button?.id) add(`• ${button.text || button.id} — ${p}${button.id}`);
  }

  return lines;
};

// Grup: payload utuh (tombol tampil). DM: teks + perintah ketik, tanpa tombol.
const dmSafe = (jid, payload) => {
  if (!payload || isGroup(jid)) return payload;

  const lines = actionLines(payload, getPrefixByJid(jid));
  const head = payload.title ? `${payload.title}\n${payload.text || ""}` : payload.text || "";
  const parts = [head];
  if (lines.length) parts.push("", "Ketik salah satu:", ...lines);
  const footer = payload.tip || payload.footer;
  if (footer) parts.push("", footer);

  const out = { text: parts.join("\n").trim() };
  if (Array.isArray(payload.mentions) && payload.mentions.length) out.mentions = payload.mentions;
  return out;
};

module.exports = { withMentions, isGroup, actionLines, dmSafe };
