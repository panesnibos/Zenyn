const logger = require("../../lib/logger");
const { isOwner } = require("../../lib/owner");
const { listTypes, setEnabled } = require("../../lib/notify");

const buildRows = () =>
  listTypes().map((t) => ({
    id: `notiftoggle ${t.id}`,
    title: `${t.enabled ? "✅" : "⛔"} ${t.label}`,
    description: t.desc
  }));

const sendList = (client, sender, message, note = "") => {
  const types = listTypes();
  const lines = types.map(
    (t) => `${t.enabled ? "✅ *ON*" : "⛔ *OFF*"} ${t.label}\n   ${t.desc}`
  );

  return client.sendInteractiveMessage(
    sender,
    {
      text: `🔔 *NOTIFIKASI BOT*${note ? `\n\n${note}` : ""}\n\n${lines.join("\n\n")}\n\nTekan tombol untuk nyalakan/matikan.`,
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "Pilih Notifikasi",
            sections: [{ title: "Notifikasi", rows: buildRows() }]
          })
        }
      ]
    },
    { quoted: message }
  );
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;

  if (!isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  try {
    const type = String(args[0] || "").toLowerCase();

    if (!type) return await sendList(client, sender, message);

    const current = listTypes().find((t) => t.id === type);
    if (!current) {
      return await client.sendMessage(sender, { text: `❌ Tipe notif tidak dikenal: ${type}` }, { quoted: message });
    }

    const next = setEnabled(type, !current.enabled);
    logger.cmd(`notify ${type} -> ${next ? "ON" : "OFF"}`);

    return await sendList(client, sender, message, `Tipe *${current.label}* sekarang ${next ? "✅ ON" : "⛔ OFF"}.`);
  } catch (err) {
    logger.error("Error in notify command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "notify",
  command: ["notify", "notif", "notiftoggle"],
  category: "owner",
  description: "Atur notifikasi bot (owner)",
  visible: false,
  execute: execute
};
