const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { statusOf } = require("../../lib/rpglimit");

const AGE_GROUPS = {
  "12": "12 tahun ke bawah",
  "13": "13 - 17 tahun",
  "18": "18 tahun ke atas"
};

const AGE_DESCRIPTIONS = {
  "12": "Anak-anak",
  "13": "Remaja",
  "18": "Dewasa"
};

const pending = new Map();
const PENDING_TTL = 10 * 60 * 1000;

const savePending = (uid, name) => {
  pending.set(uid, { name, ts: Date.now() });
};

const takePending = (uid) => {
  const data = pending.get(uid);
  pending.delete(uid);
  if (!data || Date.now() - data.ts > PENDING_TTL) return null;
  return data;
};

const validName = (name) => {
  const trimmed = String(name || "").trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 20) return null;
  if (/[@\r\n]/.test(trimmed)) return null;
  return trimmed;
};

const sendAgeSelect = (client, sender, message, name) => {
  const rows = Object.entries(AGE_GROUPS).map(([key, label]) => ({
    id: `register age ${key}`,
    title: label,
    description: AGE_DESCRIPTIONS[key]
  }));

  return client.sendInteractiveMessage(sender, {
    text: `📝 *REGISTER*\n\nHalo *${name}*!\nSilahkan memilih umur:`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "Pilih Umur",
          sections: [{ title: "Kelompok Umur", rows }]
        })
      }
    ]
  }, { quoted: message });
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const uid = getUserId(message);

  if (!uid) {
    return await client.sendMessage(sender, { text: "❌ Tidak bisa mengenali pengirim." }, { quoted: message });
  }

  try {
    const user = db.getUser(uid, message.pushName || "Player");

    if (args[0] && String(args[0]).toLowerCase() === "age") {
      const key = String(args[1] || "");
      const ageGroup = AGE_GROUPS[key];
      if (!ageGroup) {
        return await client.sendMessage(sender, { text: "❌ Pilihan umur tidak valid." }, { quoted: message });
      }

      const data = takePending(uid);
      if (!data) {
        return await client.sendMessage(sender, {
          text: `⚠️ Sesi register sudah habis.\nKetik *${p}register nama* untuk memulai ulang.`
        }, { quoted: message });
      }

      user.name = data.name;
      user.registered = true;
      user.ageGroup = ageGroup;
      user.registeredAt = Date.now();
      db.saveUser(user);

      logger.cmd(`register ${uid} -> ${data.name} (${ageGroup})`);

      return await client.sendMessage(sender, {
        text: `✅ *REGISTER BERHASIL*\n\n┃ Nama: *${data.name}*\n┃ Umur: *${ageGroup}*\n┃ Status: ${statusOf(user)}\n\nSelamat bermain! Ketik *${p}menu* untuk melihat fitur.\n\nhttps://chat.whatsapp.com/JjtVVD53f1HJ77gNrfMQHb`
      }, { quoted: message });
    }

    if (user.registered) {
      return await client.sendMessage(sender, {
        text: `ℹ️ Kamu sudah terdaftar.\n\n┃ Nama: *${user.name}*\n┃ Umur: *${user.ageGroup || "-"}*`
      }, { quoted: message });
    }

    const name = validName(args.join(" "));
    if (!name) {
      return await client.sendMessage(sender, {
        text: `📝 *REGISTER*\n\nFormat: *${p}register nama*\nContoh: *${p}register Budi*\n\nNama 2-20 karakter.`
      }, { quoted: message });
    }

    savePending(uid, name);
    return await sendAgeSelect(client, sender, message, name);
  } catch (err) {
    logger.error(`register: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "register",
  command: ["register", "daftar"],
  category: "main",
  description: "Daftar akun & pilih kelompok umur",
  visible: true,
  execute: execute
};
