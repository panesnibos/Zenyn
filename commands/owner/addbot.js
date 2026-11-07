const logger = require("../../lib/logger");
const { getPrefix } = require("../../lib/prefix");
const { isOwner } = require("../../lib/owner");

const INVITE_RE = /chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{10,})/i;
const RAW_RE = /^[0-9A-Za-z]{10,}$/;

const parseCode = (input) => {
  const text = String(input || "").trim();
  const m = text.match(INVITE_RE);
  if (m) return m[1];
  if (RAW_RE.test(text)) return text;
  return null;
};

const joinError = (err) => {
  const msg = String(err?.message || err || "").toLowerCase();
  if (/item-not-found|gone|invalid|expired/.test(msg)) return "Link undangan tidak valid atau sudah kedaluwarsa.";
  if (/conflict|already/.test(msg)) return "Bot sudah ada di grup itu.";
  if (/not-authorized|forbidden|401|403/.test(msg)) return "Bot tidak bisa join grup ini (mungkin dibatasi atau penuh).";
  if (/429|rate/.test(msg)) return "Terlalu banyak permintaan join. Coba lagi nanti.";
  return `Gagal join: ${err?.message || err}`;
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  const code = parseCode(args?.[0] || "");
  if (!code) {
    return await client.sendMessage(
      sender,
      {
        text: `🤖 *ADD BOT KE GRUP* (owner)\n\nKirim link undangan grup:\n*${p}addbot https://chat.whatsapp.com/XXXXXXXXXXXX*\n\nBot harus belum jadi member grup itu.`
      },
      { quoted: message }
    );
  }

  try {
    if (typeof client.groupAcceptInvite !== "function") {
      throw new Error("Fitur join grup tidak tersedia di socket ini.");
    }

    const jid = await client.groupAcceptInvite(code);
    if (!jid) throw new Error("item-not-found");

    let groupName = "";
    try {
      const meta = await client.groupMetadata(jid);
      groupName = meta?.subject || "";
    } catch {
      /* nama grup opsional */
    }

    logger.cmd(`addbot: owner -> ${jid}${groupName ? ` (${groupName})` : ""}`);
    await client.sendMessage(
      sender,
      {
        text: `✅ Bot berhasil join grup${groupName ? ` *${groupName}*` : ""}.\nAktifkan fitur dengan *${p}menu* di grup itu.`
      },
      { quoted: message }
    );
  } catch (err) {
    logger.warn(`addbot: gagal: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ ${joinError(err)}` }, { quoted: message });
  }
};

module.exports = {
  name: "addbot",
  command: ["addbot", "joinbot"],
  category: "owner",
  description: "Masukkan bot ke grup lewat link undangan (owner)",
  visible: false,
  execute
};
