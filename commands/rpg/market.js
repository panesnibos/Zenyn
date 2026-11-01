const logger = require("../../lib/logger");
const path = require("path");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { findItemDef } = require("../../lib/rpgitems");
const { readJson, writeJson } = require("../../lib/rpgjson");

const FILE = path.join(__dirname, "../../database/rpg/market.json");
const TAX = 0.05;
const MAX_LISTINGS = 10;

const load = () => {
  const data = readJson(FILE, { listings: [] });
  if (!Array.isArray(data.listings)) data.listings = [];
  return data;
};
const save = (data) => writeJson(FILE, data);

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  try {
    const user = db.getUser(userId, message.pushName || "Player");
    const action = (args[0] || "").toLowerCase();
    const data = load();

    if (action === "sell") {
      if (args.length < 4) {
        return await client.sendMessage(sender, { text: `Contoh: ${p}market sell Potion 5 250` }, { quoted: message });
      }

      const price = parseInt(args[args.length - 1]);
      const qty = parseInt(args[args.length - 2]);
      const name = args.slice(1, args.length - 2).join(" ").trim();
      const def = findItemDef(name);

      if (!def || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
        return await client.sendMessage(sender, { text: "❌ Format tidak valid." }, { quoted: message });
      }

      if (!db.hasItem(userId, def.name, qty)) {
        return await client.sendMessage(sender, { text: `❌ Kamu tidak punya ${def.name} x${qty}.` }, { quoted: message });
      }

      db.removeItem(userId, def.name, qty);
      data.listings.push({
        id: newId(),
        sellerId: userId,
        sellerName: user.name,
        name: def.name,
        emoji: def.emoji || "📦",
        qty,
        price,
        createdAt: Date.now()
      });
      save(data);

      return await client.sendMessage(sender, {
        text: `✅ Listing dibuat: ${def.emoji || "📦"} ${def.name} x${qty}\n💰 Harga: ${price}/item\n🆔 ID: ${data.listings[data.listings.length - 1].id}`
      }, { quoted: message });
    }

    if (action === "buy") {
      const id = args[1];
      const index = data.listings.findIndex((l) => l.id === id);
      if (index === -1) {
        return await client.sendMessage(sender, { text: "❌ Listing tidak ditemukan." }, { quoted: message });
      }

      const listing = data.listings[index];
      if (listing.sellerId === userId) {
        return await client.sendMessage(sender, { text: "❌ Kamu tidak bisa membeli listing sendiri." }, { quoted: message });
      }

      const total = listing.price * listing.qty;
      if (user.money < total) {
        return await client.sendMessage(sender, { text: `💸 Gold tidak cukup. Butuh ${total}, saldo ${user.money}.` }, { quoted: message });
      }

      const tax = Math.floor(total * TAX);
      const sellerGold = total - tax;

      db.addMoney(userId, -total);
      db.addItem(userId, { name: listing.name, emoji: listing.emoji, qty: listing.qty });
      db.getUser(listing.sellerId, "Player");
      db.addMoney(listing.sellerId, sellerGold);
      db.addStat(userId, "itemsBought", listing.qty);
      db.addStat(listing.sellerId, "itemsSold", listing.qty);
      db.addQuestProgress(userId, "buy", listing.qty);
      db.addQuestProgress(listing.sellerId, "sell", listing.qty);
      db.checkAchievements(userId);
      db.checkAchievements(listing.sellerId);

      data.listings.splice(index, 1);
      save(data);

      return await client.sendMessage(sender, {
        text: `✅ Pembelian berhasil!\n📦 ${listing.emoji} ${listing.name} x${listing.qty}\n💰 Bayar: ${total} (pajak ${tax})\n💳 Sisa: ${db.getUser(userId).money}`
      }, { quoted: message });
    }

    if (action === "cancel") {
      const id = args[1];
      const index = data.listings.findIndex((l) => l.id === id);
      if (index === -1) {
        return await client.sendMessage(sender, { text: "❌ Listing tidak ditemukan." }, { quoted: message });
      }

      const listing = data.listings[index];
      if (listing.sellerId !== userId) {
        return await client.sendMessage(sender, { text: "❌ Ini bukan listing kamu." }, { quoted: message });
      }

      db.addItem(userId, { name: listing.name, emoji: listing.emoji, qty: listing.qty });
      data.listings.splice(index, 1);
      save(data);

      return await client.sendMessage(sender, {
        text: `✅ Listing dibatalkan. ${listing.emoji} ${listing.name} x${listing.qty} dikembalikan.`
      }, { quoted: message });
    }

    const listings = data.listings.slice(-MAX_LISTINGS).reverse();

    if (!listings.length) {
      return await client.sendMessage(sender, {
        text: `🏪 *PLAYER MARKET*\n\nBelum ada listing.\n\nJual item: ${p}market sell <item> <qty> <harga>`
      }, { quoted: message });
    }

    const text = `🏪 *PLAYER MARKET*\n\n` +
      listings.map((l) => `${l.emoji} *${l.name}* x${l.qty}\n💰 ${l.price}/item • Seller: ${l.sellerName}\n🆔 ${l.id}`).join("\n\n") +
      `\n\nBeli: ${p}market buy <id>\nBatal: ${p}market cancel <id>\nJual: ${p}market sell <item> <qty> <harga>`;

    const rows = listings.map((l) => ({
      id: `market buy ${l.id}`,
      title: `${l.emoji} ${l.name} x${l.qty}`,
      description: `${l.price}/item • ${l.sellerName}`
    }));

    return await client.sendInteractiveMessage(sender, {
      text,
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({ title: "Beli Item", sections: [{ title: "Listing", rows }] })
        }
      ]
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in market command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "market",
  command: ["market", "pasar"],
  category: "rpg",
  description: "Market jual-beli antar pemain",
  visible: true,
  execute: execute
};
