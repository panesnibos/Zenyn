const bank = require("../../lib/funbank");
const { guarded, reply, interactive, quick, pick, targetOf, cooldown } = require("../../lib/featureutil");

const execute = async (client, message, args, commands, commandName) => {
  const mode = ["truth", "dare"].includes(commandName) ? commandName : String(args[0] || "").toLowerCase();
  if (!["truth", "dare"].includes(mode)) return interactive(client, message, "🎲 *TRUTH OR DARE*\n\nPilih tantangan. Boleh skip jika tidak nyaman.", [quick("Truth", "truth"), quick("Dare", "dare")]);
  cooldown(message, "truthdare");
  const target = targetOf(message);
  return reply(client, message, `🎲 *${mode.toUpperCase()}* — ${target.label}\n\n${pick(bank.load()[mode])}\n\n_Boleh skip; jangan membagikan informasi pribadi._`, { mentions: target.jid ? [target.jid] : [] });
};

module.exports = {
  name: "truthdare", command: ["truthdare", "tod", "truth", "dare"], category: "fun", visible: true,
  description: "Truth/dare ringan dengan tombol, target mention/reply opsional",
  execute: guarded("truthdare", execute)
};
