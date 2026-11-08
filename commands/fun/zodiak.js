const bank = require("../../lib/funbank");
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, dayKey, pick, cooldown } = require("../../lib/featureutil");

const zodiacFor = (day, month) => {
  const value = month * 100 + day;
  const ranges = [
    [120, "Capricorn"], [219, "Aquarius"], [321, "Pisces"], [420, "Aries"],
    [521, "Taurus"], [621, "Gemini"], [723, "Cancer"], [823, "Leo"],
    [923, "Virgo"], [1023, "Libra"], [1122, "Scorpio"], [1222, "Sagittarius"]
  ];
  return ranges.find(([end]) => value < end)?.[1] || "Capricorn";
};

const execute = async (client, message, args) => {
  const match = String(args[0] || "").match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (!match) return reply(client, message, `♈ Format: ${getPrefix(message)}zodiak DD-MM\nContoh: ${getPrefix(message)}zodiak 21-03`);
  const day = Number(match[1]), month = Number(match[2]);
  const date = new Date(Date.UTC(2000, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) throw new Error("Tanggal lahir tidak valid.");
  cooldown(message, "zodiak");
  const name = zodiacFor(day, month);
  return reply(client, message, `♈ *${name.toUpperCase()}*\n${dayKey()} (WIB)\n\n${pick(bank.load().zodiak, `${name}:${dayKey()}`)}\n\n_Hanya hiburan, bukan ramalan faktual._`);
};

module.exports = {
  name: "zodiak", command: ["zodiak", "zodiac"], category: "fun", visible: true,
  description: "Zodiak dari DD-MM dan pesan hiburan harian", execute: guarded("zodiak", execute)
};
