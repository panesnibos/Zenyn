const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { resolveTarget } = require("../../lib/rpgutil");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");

const AMOUNTS = [5, 10, 20];

const sendSelect = (client, sender, message, text, title, rows) =>
  client.sendInteractiveMessage(sender, {
    text,
    interactiveButtons: [
      { name: "single_select", buttonParamsJson: JSON.stringify({ title, sections: [{ title, rows }] }) }
    ]
  }, { quoted: message });

const amountButtons = (targetId) => [
  ...AMOUNTS.map((n) => ({ id: `addlimit ${targetId} add ${n}`, title: `+${n} Limit`, description: `Tambah ${n} limit` })),
  { id: `addlimit ${targetId} max`, title: "Set Max", description: "Isi limit sampai maksimal" }
];

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  try {
    const a = args.map((v) => String(v));
    const preId = /^\d{5,}$/.test(a[0] || "") ? a[0] : null;

    if (preId) {
      const targetId = preId;
      const mode = (a[1] || "add").toLowerCase();

      if (mode === "max") {
        const user = db.getUser(targetId);
        db.setLimit(targetId, user.limitMax);
      } else {
        const amount = parseInt(a[2] ?? a[1]);
        if (!Number.isFinite(amount) || amount === 0) {
          return await client.sendMessage(sender, { text: "❌ Jumlah limit tidak valid." }, { quoted: message });
        }
        db.addLimit(targetId, amount);
      }

      const user = db.getUser(targetId);
      logger.cmd(`addlimit ${mode} -> ${targetId} (now ${user.limit})`);

      return await client.sendMessage(sender, {
        text: `✅ Limit +${targetId} sekarang: *${user.limit}/${user.limitMax}*`
      }, { quoted: message });
    }

    const { targetId } = await resolveTarget(message, args, client);
    if (!targetId) {
      return await client.sendMessage(sender, {
        text: `🎟️ *ADD LIMIT*\n\nContoh:\n${p}addlimit @user\n${p}addlimit 628123456789\nAtau reply target:\n${p}addlimit`
      }, { quoted: message });
    }

    db.getUser(targetId, "Player");
    const user = db.getUser(targetId);

    return await sendSelect(client, sender, message,
      `🎟️ *ADD LIMIT*\n\nTarget: ${user.name} (+${targetId})\nLimit sekarang: ${user.limit}/${user.limitMax}\n\nPilih jumlah:`,
      "Tambah Limit", amountButtons(targetId));

  } catch (err) {
    logger.error(`addlimit: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "addlimit",
  command: ["addlimit", "tambahlimit"],
  category: "owner",
  description: "Tambah limit user (owner)",
  visible: false,
  execute: execute
};
