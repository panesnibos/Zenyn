const { collect, formatVps } = require("../../lib/vps");
const { guarded, reply } = require("../../lib/featureutil");
const { isOwner } = require("../../lib/owner");

const execute = async (client, message) => {
  if (!isOwner(message)) return; // owner-only: stay silent for everyone else
  await reply(client, message, formatVps(await collect()));
};

module.exports = {
  name: "vps",
  command: "vps",
  category: "owner",
  visible: false,
  description: "Status server VPS (owner)",
  execute: guarded("vps", execute),
};
