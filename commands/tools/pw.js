// commands/tools/pw.js — generator kata sandi acak.
const crypto = require("crypto");
const { guarded, reply } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const SYMBOL = "!@#$%^&*()-_=+";
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

const pick = (set) => set[crypto.randomInt(set.length)];

const generate = (length) => {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const length = Number(args[0]) || 16;
  if (!Number.isFinite(length) || length < 8 || length > 64) {
    await reply(client, message, `🔑 Format: *${p}pw [panjang 8-64]*\nDefault 16 karakter (huruf besar/kecil, angka, simbol).`);
    return false;
  }
  return reply(client, message, `🔑 *KATA SANDI (${length})*\n\n\`${generate(length)}\`\n\n_Simpan di tempat aman; pesan ini tidak disimpan bot._`);
};

module.exports = {
  name: "pw",
  command: ["pw", "password", "passgen"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Generator kata sandi acak (8-64 karakter)",
  execute: guarded("pw", execute)
};
