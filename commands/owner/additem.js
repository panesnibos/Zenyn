const fs = require("fs");
const path = require("path");
const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { resolveTarget } = require("../../lib/rpgutil");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");

let shopData = {};
try {
  let raw = fs.readFileSync(path.join(__dirname, "../../database/rpg/shop.json"), "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  shopData = JSON.parse(raw);
} catch {
  logger.warn("shop.json error (additem)");
}

const findItem = (input) => {
  const key = (input || "").toLowerCase();
  if (shopData[key]) return shopData[key];
  const found = Object.keys(shopData).find((k) => shopData[k].name.toLowerCase() === key);
  return found ? shopData[found] : null;
};

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  try {
    const { targetId, rest } = await resolveTarget(message, args, client);
    const item = findItem(rest[0]);
    const qty = Math.max(1, parseInt(rest[1]) || 1);

    if (!targetId || !item) {
      return await client.sendMessage(sender, {
        text: `📦 *ADD ITEM*\n\nContoh:\n${p}additem 628123456789 potion 5\n${p}additem @user potion 5\nAtau reply target:\n${p}additem potion 5`
      }, { quoted: message });
    }

    db.getUser(targetId, "Player");
    db.addItem(targetId, { name: item.name, emoji: item.emoji, qty });

    const user = db.getUser(targetId);
    const inv = user.inventory.find((i) => i.name === item.name);

    logger.cmd(`additem ${item.name} x${qty} -> ${targetId}`);

    return await client.sendMessage(sender, {
      text: `✅ ${item.emoji} ${item.name} x${qty} → +${targetId}\n🎒 Dimiliki sekarang: x${inv ? inv.qty : qty}`
    }, { quoted: message });

  } catch (err) {
    logger.error(`additem: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "additem",
  command: ["additem", "kasihitem", "tambahitem"],
  category: "owner",
  description: "Beri item ke user (owner)",
  visible: false,
  execute: execute
};
