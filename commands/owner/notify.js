const logger = require("../../lib/logger");
const { isOwner } = require("../../lib/owner");
const { listTypes, setEnabled } = require("../../lib/notify");
const { formatMessage, sampleQuake, joinButtons } = require("../../lib/quake");

const toggleRows = () =>
  listTypes().map((t) => ({
    id: `notiftoggle ${t.id}`,
    title: `${t.enabled ? "✅" : "⛔"} ${t.label}`,
    description: t.desc
  }));

const testRows = () =>
  listTypes().map((t) => ({
    id: `notifytest ${t.id}`,
    title: `🧪 Test ${t.label}`,
    description: "Kirim contoh notif ke chat ini"
  }));

const buildRows = () => [...toggleRows(), ...testRows()];

const sendList = (client, sender, message, note = "") => {
  const types = listTypes();
  const lines = types.map(
    (t) => `${t.enabled ? "✅ *ON*" : "⛔ *OFF*"} ${t.label}\n   ${t.desc}`
  );

  return client.sendInteractiveMessage(
    sender,
    {
      text: `🔔 *NOTIFIKASI BOT*${note ? `\n\n${note}` : ""}\n\n${lines.join("\n\n")}\n\nPilih tipe untuk ON/OFF, atau 🧪 Test untuk contoh pesan.`,
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "Notifikasi",
            sections: [{ title: "Notifikasi", rows: buildRows() }]
          })
        }
      ]
    },
    { quoted: message }
  );
};

const sendTest = async (client, sender, message, type) => {
  const text = [
    "🧪 *CONTOH NOTIFIKASI*",
    "",
    formatMessage(sampleQuake()),
    "",
    "_Ini pesan uji, data bukan gempa asli._"
  ].join("\n");

  const buttons = joinButtons();

  if (buttons.length) {
    return await client.sendInteractiveMessage(sender, { text, interactiveButtons: buttons }, { quoted: message });
  }

  return await client.sendMessage(sender, { text }, { quoted: message });
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;

  if (!isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  try {
    const a = args.map((v) => String(v).toLowerCase());
    const isTest = commandName === "notifytest" || a[0] === "test";
    const types = listTypes();

    let type;
    if (isTest) {
      type = commandName === "notifytest" ? a[0] : a[1] || "gempa";
    } else {
      type = a[0];
    }

    if (isTest) {
      const known = types.find((t) => t.id === type);
      if (!known) {
        return await client.sendMessage(sender, { text: `❌ Tipe notif tidak dikenal: ${type || "(kosong)"}` }, { quoted: message });
      }
      logger.cmd(`notify test ${type}`);
      return await sendTest(client, sender, message, type);
    }

    if (!type) return await sendList(client, sender, message);

    const current = types.find((t) => t.id === type);
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
  command: ["notify", "notif", "notiftoggle", "notifytest"],
  category: "owner",
  description: "Atur notifikasi bot (owner)",
  visible: false,
  execute: execute
};
