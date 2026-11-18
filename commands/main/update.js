// commands/main/update.js — daftar update bot (teks polos, gampang disalin).
// Format: .update | .update all
const { guarded, reply } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");
const updates = require("../../setting/updates");

const WA_LIMIT = 3500;

const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);

const longDate = (iso) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${iso}T00:00:00+07:00`));

const block = (entry, header) =>
  [header, longDate(entry.date), "", ...entry.items.map((item) => `• ${item}`)].join("\n");

const buildText = (mode) => {
  const sorted = updates.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (mode === "all") {
    const parts = sorted.map((entry, i) => block(entry, i === 0 ? "📋 UPDATE BOT" : "📋 UPDATE BOT (lanjutan)"));
    const text = parts.join("\n\n──────────\n\n");
    return text.length > WA_LIMIT ? `${text.slice(0, WA_LIMIT - 40)}\n\n…(dipotong, pakai .update untuk hari ini)` : text;
  }

  const key = dayKey();
  const today = sorted.find((entry) => entry.date === key);
  if (!today) {
    const latest = sorted[0];
    if (!latest) return "📋 Belum ada catatan update.";
    return block(latest, "📋 UPDATE BOT TERAKHIR") + "\n\nKetik .update all untuk semua riwayat.";
  }
  return block(today, "📋 UPDATE BOT HARI INI") + "\n\nKetik .update all untuk riwayat sebelumnya.";
};

const execute = async (client, message, args) => {
  const mode = String(args[0] || "").toLowerCase();
  const p = getPrefix(message);
  if (mode === "help") {
    await reply(client, message, `📋 Format: *${p}update* (hari ini) atau *${p}update all* (semua riwayat).`);
    return false;
  }
  return reply(client, message, buildText(mode === "all" ? "all" : "today"));
};

module.exports = {
  name: "update",
  command: ["update", "changelog", "updates"],
  category: "main",
  visible: true,
  limit: 0,
  description: "Daftar update bot (teks polos, bisa disalin)",
  execute: guarded("update", execute),
  _internal: { buildText, dayKey, longDate }
};
