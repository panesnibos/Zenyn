const logger = require("../../lib/logger");
const config = require("../../config");

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  
  const ownerNum = config.ownerContact || (config.owners && config.owners[0]);
  
  if (!ownerNum) {
    return await client.sendMessage(sender, { text: "❌ Owner tidak tersedia" }, { quoted: message });
  }

  try {
    const cleanNum = String(ownerNum).replace(/[^0-9]/g, "");
    const displayName = "Satria";

    // waid wajib supaya WhatsApp mengenali nomor sebagai akun WA (bukan "Undang")
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:;${displayName};;;`,
      `FN:${displayName}`,
      `TEL;type=CELL;type=VOICE;waid=${cleanNum}:+${cleanNum}`,
      "END:VCARD"
    ].join("\n");

    await client.sendMessage(sender, {
      contacts: {
        displayName: displayName,
        contacts: [
          {
            vcard: vcard,
            displayName: displayName
          }
        ]
      }
    }, { quoted: message });

    logger.info(`✅ Owner contact sent to ${sender}`);

  } catch (err) {
    logger.error("Error sending owner info:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "owner",
  command: ["owner", "cs"],
  category: "main",
  description: "Hubungi owner/customer service",
  visible: true,
  execute: execute
};
