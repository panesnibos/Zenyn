const { getPrefix } = require("../../lib/prefix");
const { findMedia, download } = require("../../lib/mediautil");
const { audioToVoice } = require("../../lib/voice");
const { guarded, reply, cooldown } = require("../../lib/featureutil");

const execute = async (client, message) => {
  const found = findMedia(message, ["audio", "video", "document"]);
  if (!found) return reply(client, message, `🎙️ Reply audio/video lalu ${getPrefix(message)}tovn.\nMaksimal 12 MB; hasil maksimal 60 detik. Sticker tidak punya suara.`);
  if (found.kind === "document" && !/^(audio|video)\//i.test(found.node.mimetype || "")) throw new Error("Dokumen harus berupa audio/video.");
  cooldown(message, "tovn", 5000);
  const buffer = await download(found);
  const audio = await audioToVoice(buffer);
  return client.sendMessage(message.key.remoteJid, { audio, mimetype: "audio/ogg; codecs=opus", ptt: true }, { quoted: message });
};

module.exports = {
  name: "tovn", command: ["tovn", "tovoice"], category: "tools", visible: true,
  description: "Audio/video menjadi voice note Opus (maks 60 detik)", execute: guarded("tovn", execute)
};
