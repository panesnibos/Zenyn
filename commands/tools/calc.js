// commands/tools/calc.js — kalkulator ekspresi (tanpa eval).
const { guarded, reply, quotedText } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");
const calc = require("../../lib/calc");

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const expr = (args.join(" ") || quotedText(message)).trim();
  if (!expr) {
    await reply(client, message, `🧮 Format: *${p}calc <ekspresi>*\nContoh: ${p}calc (12+8)*3/2\nDukung: + - * / % ^ ( ) sqrt abs round floor ceil pi e`);
    return false;
  }
  const value = calc.evaluate(expr);
  return reply(client, message, `🧮 *${expr}*\n= *${calc.format(value)}*`);
};

module.exports = {
  name: "calc",
  command: ["calc", "hitung", "kalkulator"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Kalkulator ekspresi (+, -, *, /, %, ^, sqrt, abs, round)",
  execute: guarded("calc", execute)
};
