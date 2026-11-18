// commands/tools/ss.js — screenshot website (khusus premium, CPU berat).
// Format: .ss <url> [lebar]
const { guarded, reply } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { isOwner } = require("../../lib/owner");
const { statusOf } = require("../../lib/rpglimit");
const { assertPublic } = require("../../lib/safeurl");
const shot = require("../../lib/shot");

const firstUrl = (text) => {
  const raw = String(text || "").trim();
  const m = /https?:\/\/[^\s<>"']+/i.exec(raw);
  if (m) return m[0].replace(/[),.;]+$/, "");
  const bare = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"']*)?$/i.exec(raw.split(/\s+/)[0] || "");
  return bare ? `https://${bare[0]}` : null;
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);

  const uid = getUserId(message);
  const user = uid ? db.getUser(uid, message.pushName || "Player") : null;
  const premium = isOwner(message) || (user && statusOf(user) !== "User");
  if (!premium) {
    await reply(client, message, `🔒 *KHUSUS PREMIUM*\n\nFitur ${p}ss menahan CPU server, jadi hanya untuk Premium/Donatur.\nBeli premium: *${p}premium*`);
    return false;
  }

  const raw = firstUrl(args.join(" "));
  if (!raw) {
    await reply(client, message, `📸 Format: *${p}ss <url> [lebar]*\nContoh: ${p}ss example.com\nKhusus Premium/Donatur (2 limit).`);
    return false;
  }

  const url = assertPublic(raw).toString();
  const width = Math.min(1920, Math.max(320, Number(args[1]) || 1280));

  const png = await shot.screenshot(url, { width });
  return client.sendMessage(
    message.key.remoteJid,
    { image: png, caption: `📸 ${new URL(url).hostname} · ${width}px · ${Math.round(png.length / 1024)} KB` },
    { quoted: message }
  );
};

module.exports = {
  name: "ss",
  command: ["ss", "ssweb", "screenshot"],
  category: "tools",
  visible: true,
  limit: 2,
  premium: true,
  description: "Screenshot website (premium, 2 limit, CPU dibatasi 70%)",
  execute: guarded("ss", execute),
  _internal: { firstUrl }
};
