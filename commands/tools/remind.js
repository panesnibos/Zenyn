// commands/tools/remind.js — pengingat sederhana (in-memory, hilang saat bot restart).
const { guarded, reply } = require("../../lib/featureutil");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");

const MAX_PER_USER = 5;
const MAX_MS = 24 * 60 * 60 * 1000;
const UNIT = { s: 1000, m: 60000, h: 3600000 };

const timers = new Map(); // uid -> [timeoutId]

// "10m" | "1h30m" | "45s" -> milidetik
const parseDuration = (raw) => {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return 0;
  let total = 0;
  let rest = text;
  while (rest) {
    const m = /^(\d+)([smh])/.exec(rest);
    if (!m) return 0;
    total += Number(m[1]) * UNIT[m[2]];
    rest = rest.slice(m[0].length);
  }
  return total;
};

const schedule = (uid, jid, text, ms, client) => {
  const timer = setTimeout(async () => {
    const list = (timers.get(uid) || []).filter((t) => t !== timer);
    if (list.length) timers.set(uid, list);
    else timers.delete(uid);
    try {
      await client.sendMessage(jid, {
        text: `⏰ *PENGINGAT*\n\n${text}`,
        mentions: [jid.endsWith("@g.us") ? `${uid}@s.whatsapp.net` : uid + "@s.whatsapp.net"].filter(Boolean)
      });
    } catch {
      /* chat mungkin sudah tidak bisa dihubungi */
    }
  }, ms);
  timer.unref?.();
  const list = timers.get(uid) || [];
  list.push(timer);
  timers.set(uid, list);
  return timer;
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const uid = getUserId(message);
  const jid = message.key.remoteJid;
  if (!uid) throw new Error("Tidak bisa mengenali pengirim.");

  const ms = parseDuration(args[0]);
  const text = args.slice(1).join(" ").trim();
  if (!ms || !text) {
    await reply(client, message, `⏰ Format: *${p}remind <waktu> <teks>*\nContoh: ${p}remind 10m minum obat\nSatuan: s, m, h (contoh 1h30m). Maksimal 24 jam.`);
    return false;
  }
  if (ms > MAX_MS) throw new Error("Maksimal 24 jam.");
  if (text.length > 500) throw new Error("Teks pengingat maksimal 500 karakter.");
  if ((timers.get(uid) || []).length >= MAX_PER_USER) throw new Error(`Maksimal ${MAX_PER_USER} pengingat aktif. Tunggu yang lain selesai.`);

  schedule(uid, jid, text, ms, client);
  const menit = Math.round(ms / 60000);
  const when = ms < 60000 ? `${Math.round(ms / 1000)} detik` : menit < 60 ? `${menit} menit` : `${(ms / 3600000).toFixed(1)} jam`;
  return reply(client, message, `⏰ Pengingat diset dalam *${when}*:\n"${text}"`);
};

module.exports = {
  name: "remind",
  command: ["remind", "ingatkan"],
  category: "tools",
  visible: true,
  limit: 0,
  description: "Pengingat waktu (maks 24 jam, in-memory)",
  execute: guarded("remind", execute),
  _internal: { parseDuration, timers }
};
