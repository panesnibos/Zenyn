const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, targetOf, dayKey, hash, sendCard, cooldown } = require("../../lib/featureutil");

const execute = async (client, message, args) => {
  const trait = args.filter((arg) => !arg.startsWith("@")).join(" ").trim();
  if (!trait) return reply(client, message, `📊 Format: ${getPrefix(message)}rate rajin @teman\nBisa juga reply pesan target.`);
  if (trait.length > 50) throw new Error("Label rating maksimal 50 karakter.");
  cooldown(message, "rate");
  const target = targetOf(message);
  const score = hash(JSON.stringify(["rate", target.jid || target.label, trait.toLowerCase(), dayKey()])) % 101;
  return sendCard(client, message, "RATING HARIAN", `${target.label}\n${trait}: ${score}%\nAngka acak untuk hiburan saja.`, {
    score, subtitle: `${dayKey()} WIB • Just for fun`, mentions: target.jid ? [target.jid] : []
  });
};

module.exports = {
  name: "rate", command: ["rate", "rating"], category: "fun", visible: true,
  description: "Rating acak harian untuk mention/reply (hiburan)", execute: guarded("rate", execute)
};
