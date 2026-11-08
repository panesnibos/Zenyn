const bank = require("../../lib/funbank");
const { guarded, pick, sendCard, cooldown } = require("../../lib/featureutil");

const execute = async (client, message) => {
  cooldown(message, "gombalan");
  return sendCard(client, message, "GOMBALAN", pick(bank.load().gombalan));
};

module.exports = {
  name: "gombalan", command: ["gombalan", "gombal"], category: "fun", visible: true,
  description: "Gombalan acak dalam kartu gambar", execute: guarded("gombalan", execute)
};
