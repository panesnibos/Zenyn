const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { resolveTarget } = require("../../lib/rpgutil");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const { DURATIONS, PERMANENT, untilFromDuration } = require("../../lib/rpglimit");

const TYPE_MAP = { premium: "Premium", donatur: "Donatur", user: "User" };
const DUR_MAP = DURATIONS.map((d) => ({ value: String(d.value), label: d.label }));
const durLabel = (v) => DURATIONS.find((d) => String(d.value) === String(v))?.label || String(v);

const sendSelect = (client, sender, message, text, title, rows) =>
  client.sendInteractiveMessage(sender, {
    text,
    interactiveButtons: [
      { name: "single_select", buttonParamsJson: JSON.stringify({ title, sections: [{ title, rows }] }) }
    ]
  }, { quoted: message });

const typeButtons = (targetId) =>
  Object.entries(TYPE_MAP).map(([key, label]) => ({
    id: `setstatus ${targetId} ${key}`,
    title: label,
    description: key === "user" ? "Kembalikan ke User" : `Set status ${label}`
  }));

const durButtons = (targetId, typeKey) =>
  DUR_MAP.map((d) => ({
    id: `setstatus ${targetId} ${typeKey} ${d.value}`,
    title: d.label,
    description: `${TYPE_MAP[typeKey]} ${d.label}`
  }));

const fmtUntil = (until) => {
  if (until === PERMANENT || until === null) return "Selamanya";
  return new Date(until).toLocaleString("id-ID");
};

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
      const typeKey = (a[1] || "").toLowerCase();
      const days = a[2];

      if (!TYPE_MAP[typeKey]) {
        return await client.sendMessage(sender, { text: "❌ Tipe status tidak valid." }, { quoted: message });
      }

      if (typeKey !== "user" && days === undefined) {
        return await sendSelect(client, sender, message,
          `⏳ *DURASI STATUS*\n\nTarget: ${targetId}\nStatus: ${TYPE_MAP[typeKey]}\n\nPilih durasi:`,
          "Pilih Durasi", durButtons(targetId, typeKey));
      }

      db.getUser(targetId, "Player");
      let until = null;
      if (typeKey !== "user") until = untilFromDuration(days);
      const st = db.setStatus(targetId, TYPE_MAP[typeKey], until);

      logger.cmd(`setstatus ${st.type} -> ${targetId} (${days ?? "-"})`);

      return await client.sendMessage(sender, {
        text: `✅ Status +${targetId} → *${st.type}*${st.type === "User" ? "" : `\n⏳ Hingga: ${fmtUntil(st.until)}`}`
      }, { quoted: message });
    }

    const { targetId, targetJid } = await resolveTarget(message, args, client);
    if (!targetId) {
      return await client.sendMessage(sender, {
        text: `🎖️ *SET STATUS*\n\nContoh:\n${p}setstatus @user\n${p}setstatus 628123456789\nAtau reply target:\n${p}setstatus`
      }, { quoted: message });
    }

    db.getUser(targetId, "Player");
    const user = db.getUser(targetId);

    return await sendSelect(client, sender, message,
      `🎖️ *SET STATUS*\n\nTarget: ${user.name} (+${targetId})\nStatus sekarang: ${user.status?.type || "User"}\n\nPilih status:`,
      "Pilih Status", typeButtons(targetId));

  } catch (err) {
    logger.error(`setstatus: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "setstatus",
  command: ["setstatus", "setpremium", "setdonatur"],
  category: "owner",
  description: "Set status user (Premium/Donatur) dengan durasi (owner)",
  visible: false,
  execute: execute
};
