const logger = require("../../lib/logger");
const fs = require("fs");
const path = require("path");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");

let shopData = {};
try {
  let raw = fs.readFileSync(path.join(__dirname, "../../database/rpg/shop.json"), "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  shopData = JSON.parse(raw);
} catch {
  logger.info("❌ shop.json error");
}

const sendList = (client, sender, message, text, title, sections, tip) =>
  client.sendInteractiveMessage(sender, {
    text,
    tip,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({ title, sections })
      }
    ]
  }, { quoted: message });

const findKeyByName = (name) =>
  Object.keys(shopData).find((k) => shopData[k].name.toLowerCase() === name.toLowerCase());

const buildQtyRows = (action, key, max) => {
  const rows = [];
  for (const n of [1, 5, 10]) {
    if (n < max) {
      rows.push({ id: `${action} ${key} ${n}`, title: `x${n}`, description: `${n} item` });
    }
  }
  if (max > 0) {
    rows.push({ id: `${action} ${key} all`, title: `Semua (x${max})`, description: "Beli/jual semua yang memungkinkan" });
  }
  return rows;
};

const resolveQty = (raw, max) => {
  if (raw === "all") return max;
  const n = parseInt(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > max) return null;
  return n;
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  const cmd = (commandName || "shop").toLowerCase();
  const p = getPrefix(message);
  let user = db.getUser(userId, message.pushName || "Player");

  try {
    // ================= TOKO MENU =================
    if (cmd === "shop") {
      const inventory = user.inventory.length
        ? user.inventory.map((i) => `${i.emoji || "📦"} ${i.name} x${i.qty}`).join("\n")
        : "🎒 Inventory kosong";

      const buyRows = Object.keys(shopData)
        .filter((key) => shopData[key].buyable !== false && shopData[key].price)
        .map((key) => {
          const item = shopData[key];
          return {
            id: `buy ${key}`,
            title: `${item.emoji} ${item.name}`,
            description: `Harga: ${item.price} gold`
          };
        });

      const sellRows = user.inventory
        .map((inv) => {
          const key = findKeyByName(inv.name);
          if (!key || !shopData[key].sell) return null;
          return {
            id: `sell ${key}`,
            title: `${inv.emoji} ${inv.name} x${inv.qty}`,
            description: `Harga jual: ${shopData[key].sell} gold`
          };
        })
        .filter(Boolean);

      const sections = [];
      if (buyRows.length) sections.push({ title: "🏦 Beli", rows: buyRows });
      if (sellRows.length) sections.push({ title: "🏚 Jual", rows: sellRows });

      if (!sections.length) {
        return await client.sendMessage(sender, { text: "❌ Toko sedang kosong." }, { quoted: message });
      }

      const caption = `💰 Gold kamu: ${user.money}\n────────────\n${inventory}\n────────────\nPilih item dari tombol di bawah.`;

      return await sendList(client, sender, message, caption, "Buka Toko", sections);
    }

    // ================= BELI =================
    if (cmd === "buy") {
      const itemKey = (args[0] || "").toLowerCase();
      const qtyRaw = (args[1] || "").toLowerCase();

      if (!itemKey) {
        const rows = Object.keys(shopData)
          .filter((key) => shopData[key].buyable !== false && shopData[key].price)
          .map((key) => {
            const item = shopData[key];
            return { id: `buy ${key}`, title: `${item.emoji} ${item.name}`, description: `Harga: ${item.price} gold` };
          });
        if (!rows.length) return await client.sendMessage(sender, { text: "❌ Tidak ada item yang bisa dibeli" }, { quoted: message });
        return await sendList(client, sender, message, "🏦 Pilih item untuk dibeli", "WHITE MARKET", [{ title: "Item", rows }]);
      }

      const item = shopData[itemKey];
      if (!item || item.buyable === false || !item.price) {
        return await client.sendMessage(sender, { text: "❌ Item tidak bisa dibeli!" }, { quoted: message });
      }

      const maxQty = Math.floor(user.money / item.price);
      if (maxQty < 1) {
        return await client.sendMessage(sender, { text: `💸 Gold tidak cukup! Harga ${item.price}, saldo ${user.money}` }, { quoted: message });
      }

      if (!qtyRaw) {
        const detail = `🛒 *${item.emoji} ${item.name}*\n💰 Harga: ${item.price}\n📦 Max bisa beli: x${maxQty}\n\nPilih jumlah:`;
        const rnd = Math.floor(Math.random() * 20) + 1;
        const tip = `Kamu bisa memakai > ${p}buy ${itemKey} ${rnd}`;
        return await sendList(client, sender, message, detail, "Jumlah Beli", [
          { title: "Pilih Jumlah", rows: buildQtyRows("buy", itemKey, maxQty) }
        ], tip);
      }

      const qty = resolveQty(qtyRaw, maxQty);
      if (!qty) {
        return await client.sendMessage(sender, { text: `❌ Jumlah tidak valid. Maksimal x${maxQty}.` }, { quoted: message });
      }

      const total = item.price * qty;
      return await client.sendButtons(sender, {
        title: "Konfirmasi Pembelian",
        text: `🛒 ${item.emoji} ${item.name}\n📦 Jumlah: x${qty}\n💰 Total: ${total}\n💳 Saldo: ${user.money}\n\nLanjut beli?`,
        footer: "Konfirmasi",
        buttons: [
          { id: `confirmbuy ${itemKey} ${qty}`, text: "✅ Beli" },
          { id: "shop", text: "❌ Batal" }
        ]
      }, { quoted: message });
    }

    // ================= KONFIRMASI BELI =================
    if (cmd === "confirmbuy") {
      const itemKey = (args[0] || "").toLowerCase();
      const item = shopData[itemKey];
      if (!item || item.buyable === false || !item.price) {
        return await client.sendMessage(sender, { text: "❌ Item tidak bisa dibeli!" }, { quoted: message });
      }

      const qty = parseInt(args[1]);
      if (!Number.isFinite(qty) || qty <= 0) {
        return await client.sendMessage(sender, { text: "❌ Jumlah tidak valid." }, { quoted: message });
      }

      const total = item.price * qty;
      if (user.money < total) {
        return await client.sendMessage(sender, { text: "💸 Gold tidak cukup!" }, { quoted: message });
      }

      const sisa = user.money - total;
      db.addMoney(userId, -total);
      db.addItem(userId, { name: item.name, emoji: item.emoji, qty });
      db.addStat(userId, "itemsBought", qty);
      db.addQuestProgress(userId, "buy", qty);
      db.checkAchievements(userId);

      return await client.sendMessage(sender, {
        text: `✅ Beli ${item.emoji} ${item.name} x${qty}\n💰 Sisa: ${sisa}`
      }, { quoted: message });
    }

    // ================= JUAL =================
    if (cmd === "sell") {
      const itemKey = (args[0] || "").toLowerCase();
      const qtyRaw = (args[1] || "").toLowerCase();

      if (!itemKey) {
        const rows = user.inventory
          .map((inv) => {
            const key = findKeyByName(inv.name);
            if (!key || !shopData[key].sell) return null;
            return { id: `sell ${key}`, title: `${inv.emoji} ${inv.name} x${inv.qty}`, description: `Harga jual: ${shopData[key].sell} gold` };
          })
          .filter(Boolean);
        if (!rows.length) return await client.sendMessage(sender, { text: "❌ Tidak ada item yang bisa dijual" }, { quoted: message });
        return await sendList(client, sender, message, "🏚 Pilih item untuk dijual", "BLACK MARKET", [{ title: "Inventory", rows }]);
      }

      const item = shopData[itemKey];
      if (!item || !item.sell) {
        return await client.sendMessage(sender, { text: "❌ Item tidak bisa dijual!" }, { quoted: message });
      }

      const inv = user.inventory.find((i) => i.name.toLowerCase() === item.name.toLowerCase());
      const maxQty = inv ? inv.qty : 0;
      if (maxQty < 1) {
        return await client.sendMessage(sender, { text: `❌ Kamu tidak punya ${item.name}.` }, { quoted: message });
      }

      if (!qtyRaw) {
        const detail = `🏚 *${item.emoji} ${item.name}*\n💰 Harga jual: ${item.sell}\n📦 Dimiliki: x${maxQty}\n\nPilih jumlah:`;
        const rnd = Math.floor(Math.random() * 20) + 1;
        const tip = `Kamu bisa memakai > ${p}sell ${itemKey} ${rnd}`;
        return await sendList(client, sender, message, detail, "Jumlah Jual", [
          { title: "Pilih Jumlah", rows: buildQtyRows("sell", itemKey, maxQty) }
        ], tip);
      }

      const qty = resolveQty(qtyRaw, maxQty);
      if (!qty) {
        return await client.sendMessage(sender, { text: `❌ Jumlah tidak valid. Maksimal x${maxQty}.` }, { quoted: message });
      }

      const total = item.sell * qty;
      return await client.sendButtons(sender, {
        title: "Konfirmasi Penjualan",
        text: `🏚 ${item.emoji} ${item.name}\n📦 Jumlah: x${qty}\n💰 Terima: ${total}\n\nLanjut jual?`,
        footer: "Konfirmasi",
        buttons: [
          { id: `confirmsell ${itemKey} ${qty}`, text: "✅ Jual" },
          { id: "shop", text: "❌ Batal" }
        ]
      }, { quoted: message });
    }

    // ================= KONFIRMASI JUAL =================
    if (cmd === "confirmsell") {
      const itemKey = (args[0] || "").toLowerCase();
      const item = shopData[itemKey];
      if (!item || !item.sell) {
        return await client.sendMessage(sender, { text: "❌ Item tidak bisa dijual!" }, { quoted: message });
      }

      const qty = parseInt(args[1]);
      if (!Number.isFinite(qty) || qty <= 0) {
        return await client.sendMessage(sender, { text: "❌ Jumlah tidak valid." }, { quoted: message });
      }

      const inv = user.inventory.find((i) => i.name.toLowerCase() === item.name.toLowerCase());
      if (!inv || inv.qty < qty) {
        return await client.sendMessage(sender, { text: "❌ Item tidak cukup!" }, { quoted: message });
      }

      const total = item.sell * qty;
      db.removeItem(userId, item.name, qty);
      db.addMoney(userId, total);
      db.addStat(userId, "itemsSold", qty);
      db.addQuestProgress(userId, "sell", qty);
      db.checkAchievements(userId);

      return await client.sendMessage(sender, {
        text: `💰 Jual ${item.emoji} ${item.name} x${qty}\n+${total} Gold`
      }, { quoted: message });
    }

  } catch (err) {
    logger.error("Error in shop command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "shop",
  command: ["shop", "buy", "sell", "confirmbuy", "confirmsell"],
  category: "rpg",
  description: "Toko RPG - beli dan jual item",
  visible: true,
  execute: execute
};
