const bank = require("../../lib/funbank");
const { guarded, reply, targetOf, pick, cooldown } = require("../../lib/featureutil");

const execute = async (client, message) => {
  cooldown(message, "roast");
  const target = targetOf(message);
  const text = pick(bank.load().roast).replace("{target}", target.label);
  return reply(client, message, `🔥 *ROAST RINGAN*\n\n${text}\n\n_Bercanda saja, bukan penilaian sungguhan._`, { mentions: target.jid ? [target.jid] : [] });
};

module.exports = {
  name: "roast", command: ["roast"], category: "fun", visible: true,
  description: "Roast ringan, mention/reply target opsional", execute: guarded("roast", execute)
};
