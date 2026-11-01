const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { resolveTarget } = require("../../lib/rpgutil");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  try {
    const { targetId } = await resolveTarget(message, args, client);

    if (!targetId) {
      return await client.sendMessage(sender, {
        text: `♻️ *RESET USER*\n\nContoh:\n${p}resetuser 628123456789\nAtau reply target:\n${p}resetuser`
      }, { quoted: message });
    }

    const exists = !!db.all()[targetId];
    if (!exists) {
      return await client.sendMessage(sender, { text: `❌ User +${targetId} tidak ditemukan.` }, { quoted: message });
    }

    db.resetUser(targetId);

    logger.cmd(`resetuser -> ${targetId}`);

    return await client.sendMessage(sender, {
      text: `♻️ User +${targetId} berhasil di-reset ke data awal.`
    }, { quoted: message });

  } catch (err) {
    logger.error(`resetuser: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "resetuser",
  command: ["resetuser", "reset"],
  category: "owner",
  description: "Reset data user (owner)",
  visible: false,
  execute: execute
};
