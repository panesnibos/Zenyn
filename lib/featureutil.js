const crypto = require("crypto");
const logger = require("./logger");
const { getPrefix } = require("./prefix");
const { getUserId, getSenderJid } = require("./rpgutil");

const unwrap = (body) => {
  for (let i = 0; body && i < 8; i++) {
    const nested = body.ephemeralMessage || body.documentWithCaptionMessage;
    if (!nested?.message) break;
    body = nested.message;
  }
  return body || {};
};

// View-once media intentionally stays private; media commands do not unwrap it.
const contextOf = (message) => {
  const body = unwrap(message.message);
  return Object.values(body).find((node) => node?.contextInfo)?.contextInfo || {};
};

const quotedText = (message) => {
  const body = unwrap(contextOf(message).quotedMessage);
  return body.conversation || body.extendedTextMessage?.text || body.imageMessage?.caption || body.videoMessage?.caption || "";
};

const reply = (client, message, text, extra = {}) =>
  client.sendMessage(message.key.remoteJid, { text, ...extra }, message.message ? { quoted: message } : {});

const guarded = (name, execute) => async (client, message, args = [], ...rest) => {
  try {
    return await execute(client, message, args, ...rest);
  } catch (err) {
    logger.warn(`${name}: ${err.message}`);
    await reply(client, message, `❌ ${err.message || "Fitur gagal diproses. Coba lagi."}`);
    return false;
  }
};

const quick = (text, id) => ({
  name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: text, id })
});

const select = (title, rows) => ({
  name: "single_select",
  buttonParamsJson: JSON.stringify({ title, sections: [{ title, rows }] })
});

const interactive = async (client, message, text, buttons, extra = {}) => {
  try {
    await client.sendInteractiveMessage(message.key.remoteJid, { text, interactiveButtons: buttons, ...extra }, message.message ? { quoted: message } : {});
  } catch (err) {
    logger.warn(`interactive fallback: ${err.message}`);
    const p = getPrefix(message);
    const actions = buttons.flatMap((button) => {
      const params = JSON.parse(button.buttonParamsJson);
      return button.name === "single_select"
        ? params.sections.flatMap((s) => s.rows.map((r) => `${r.title}: ${p}${r.id}`))
        : [`${params.display_text}: ${p}${params.id}`];
    });
    await reply(client, message, [text, "", ...actions].join("\n"), extra);
  }
};

const dayKey = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
}).format(date);

const hash = (value) => crypto.createHash("sha256").update(String(value)).digest().readUInt32BE(0);
const pick = (items, seed) => {
  if (!Array.isArray(items) || !items.length) throw new Error("Bank konten kosong.");
  return items[seed === undefined ? crypto.randomInt(items.length) : hash(seed) % items.length];
};
const token = () => crypto.randomBytes(8).toString("hex");
const identity = (message) => {
  const uid = getUserId(message);
  if (!uid) throw new Error("Tidak bisa mengidentifikasi pengguna.");
  return String(uid);
};

// Expiring, bounded in-memory state. Never writes to the RPG database.
const timedStore = (max = 1000) => {
  const map = new Map();
  const timers = new Map();
  const remove = (key) => {
    clearTimeout(timers.get(key));
    timers.delete(key);
    map.delete(key);
  };
  return {
    get(key) {
      const record = map.get(key);
      if (record && record.expiresAt <= Date.now()) { remove(key); return null; }
      return record?.value || null;
    },
    set(key, value, ttl) {
      remove(key);
      if (map.size >= max) remove(map.keys().next().value);
      map.set(key, { value, expiresAt: Date.now() + ttl });
      const timer = setTimeout(() => remove(key), ttl);
      timer.unref?.();
      timers.set(key, timer);
      return value;
    },
    delete: remove,
    values() {
      return [...map.keys()].map((key) => this.get(key)).filter(Boolean);
    },
    clear() { for (const key of map.keys()) remove(key); }
  };
};

const cooldowns = timedStore(2000);
const cooldown = (message, name, ms = 3000) => {
  const key = `${message.key.remoteJid}:${identity(message)}:${name}`;
  if (cooldowns.get(key)) throw new Error("Tunggu beberapa detik sebelum mencoba lagi.");
  cooldowns.set(key, true, ms);
};

const targetOf = (message) => {
  const ctx = contextOf(message);
  const jid = ctx.mentionedJid?.[0] || ctx.participant || getSenderJid(message);
  return { jid, label: jid ? `@${String(jid).split("@")[0].split(":")[0]}` : message.pushName || "Kamu" };
};

const sendCard = async (client, message, title, text, options = {}) => {
  const { renderCard } = require("./drawcard");
  const image = await renderCard({ title, text, subtitle: options.subtitle, score: options.score });
  return client.sendMessage(message.key.remoteJid, {
    image, caption: `*${title}*\n\n${text}`, mentions: options.mentions || []
  }, { quoted: message });
};

module.exports = {
  unwrap, contextOf, quotedText, reply, guarded, quick, select, interactive,
  dayKey, hash, pick, token, identity, timedStore, cooldown, targetOf, sendCard
};
