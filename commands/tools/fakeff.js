// commands/tools/fakeff.js — kartu profil FF palsu dari template lokal.
// Format: .fakeff <nama>
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, cooldown } = require("../../lib/featureutil");
const { renderFakeFF, MAX_NAME } = require("../../lib/fakeff");

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const name = (args || []).join(" ").trim();

  if (!name) {
    await reply(
      client,
      message,
      `🎮 *FAKE FF*\n\nFormat: ${p}fakeff <nama>\nContoh: ${p}fakeff Panes\n\nMaksimal ${MAX_NAME} karakter. Biaya 1 limit.`
    );
    return false;
  }

  cooldown(message, "fakeff", 8000);
  const { buffer } = await renderFakeFF(name);

  return client.sendMessage(
    message.key.remoteJid,
    { image: buffer, caption: `🎮 Fake FF — ${name.slice(0, MAX_NAME)}` },
    { quoted: message }
  );
};

module.exports = {
  name: "fakeff",
  command: ["fakeff"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Buat kartu profil FF palsu dari 10 template",
  subcommands: ["<nama>"],
  execute: guarded("fakeff", execute)
};
