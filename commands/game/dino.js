// commands/game/dino.js — game dino runner di kartu rich WhatsApp.
// Lompat/merunduk + skor/top score jalan penuh di dalam kartu (lib/dinoui.js).
const logger = require("../../lib/logger");
const { getPrefix } = require("../../lib/prefix");
const { sendRichGame, supported } = require("../../lib/richsend");
const dinoUi = require("../../lib/dinoui");

const execute = async (client, message) => {
  const chat = message.key.remoteJid;
  if (!supported(client)) {
    return client.sendMessage(
      chat,
      { text: `❌ Kartu game tak bisa dikirim di sini. Coba di chat pribadi, atau lihat *${getPrefix(message)}menu*.` },
      { quoted: message }
    );
  }
  try {
    await sendRichGame(client, chat, dinoUi.html, "Zenyn Dino");
    logger.cmd(`dino: kartu -> ${chat}`);
  } catch (err) {
    logger.warn(`dino: kartu gagal (${err.message})`);
    await client.sendMessage(chat, { text: "❌ Kartu game gagal dikirim. Coba lagi di chat pribadi." }, { quoted: message });
  }
};

module.exports = {
  name: "dino",
  command: ["dino"],
  category: "game",
  description: "Game dino runner (kartu game interaktif, tap = lompat)",
  visible: true,
  execute
};
