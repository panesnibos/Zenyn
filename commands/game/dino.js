// commands/game/dino.js — dino runner di kartu rich WhatsApp.
// Game jalan penuh di dalam kartu (tap kartu = lompat / merunduk), sama pola dengan
// commands/game/catur.js: bot hanya kirim HTML, state & skor hidup di webview.
const config = require("../../config");
const logger = require("../../lib/logger");
const { getPrefix } = require("../../lib/prefix");
const { sendRichGame, supported } = require("../../lib/richsend");
const dinoGame = require("../../lib/dinogame");

const execute = async (client, message) => {
  const chat = message.key.remoteJid;
  if (config.richCard === false || !supported(client)) {
    return client.sendMessage(
      chat,
      { text: `❌ Kartu game tak bisa dikirim di sini. Coba di chat pribadi, atau lihat *${getPrefix(message)}menu*.` },
      { quoted: message }
    );
  }
  try {
    await sendRichGame(client, chat, dinoGame.html, "Zenyn Dino");
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
  description: "Game dino runner di kartu game (tap = lompat, tahan = merunduk)",
  visible: true,
  execute
};
