// commands/rpg/market.js — pasar antar pemain dua arah:
// listing (barang dijual) dan buy order (dicari pembeli, gold di-escrow).
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
const MAX_ORDERS_SHOWN = 10;
const MAX_ORDERS_PER_USER = 5;
const MAX_ORDERS = 20;

const load = () => {
  const data = readJson(FILE, { listings: [], orders: [] });
  if (!Array.isArray(data.listings)) data.listings = [];
  if (!Array.isArray(data.orders)) data.orders = [];
  return data;
};
const save = (data) => writeJson(FILE, data);

const newId = (prefix) => prefix + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4);
const rp = (n) => Number(n || 0).toLocaleString("id-ID");

const listingText = (l) => `${l.emoji} ${l.name} x${l.qty} — ${rp(l.price)}/item\n👤 ${l.sellerName} · ID ${l.id}`;
const orderText = (o) => `${o.emoji} ${o.name} x${o.qty} — ${rp(o.price)}/item\n👤 ${o.buyerName} · ID ${o.id}`;

const showListings = async (client, message, data, p) => {
  const listings = data.listings.slice(-MAX_LISTINGS).reverse();
  if (!listings.length) {
    return client.sendMessage(message.key.remoteJid, {
      text: `🏷️ *BARANG DIJUAL*\n\nBelum ada yang jualan.\nPasang: ${p}market sell <item> <qty> <harga>`
    }, { quoted: message });
  }

  const text = `🏷️ *BARANG DIJUAL*\n\n${listings.map(listingText).join("\n\n")}\n\nBeli: ${p}market buy <id>`;

  return client.sendInteractiveMessage(message.key.remoteJid, {
    text,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "Beli Item",
          sections: [{ title: "Barang Dijual", rows: listings.map((l) => ({ id: `market buy ${l.id}`, title: `${l.emoji} ${l.name} x${l.qty}`, description: `${rp(l.price)}/item • ${l.sellerName}` })) }]
        })
      }
    ]
  }, { quoted: message });
};

const showOrders = async (client, message, data, p) => {
  const orders = data.orders.slice(-MAX_ORDERS_SHOWN).reverse();
  if (!orders.length) {
    return client.sendMessage(message.key.remoteJid, {
      text: `📢 *DICARI PEMBELI*\n\nBelum ada permintaan.\nPasang: ${p}market order <item> <qty> <harga>`
    }, { quoted: message });
  }

  const text = `📢 *DICARI PEMBELI*\n\n${orders.map(orderText).join("\n\n")}\n\nJual ke mereka: ${p}market fill <id>`;

  return client.sendInteractiveMessage(message.key.remoteJid, {
    text,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "Jual ke Pembeli",
          sections: [{ title: "Dicari Pembeli", rows: orders.map((o) => ({ id: `market fill ${o.id}`, title: `${o.emoji} ${o.name} x${o.qty}`, description: `${rp(o.price)}/item • ${o.buyerName}` })) }]
        })
      }
    ]
  }, { quoted: message });
};

const showMenu = async (client, message, data) => {
  const text = [
    "🏪 *PLAYER MARKET*",
    "",
    `🏷️ Barang dijual: ${data.listings.length}`,
    `📢 Dicari pembeli: ${data.orders.length}`,
    "",
    "Pilih:"
  ].join("\n");

  return client.sendInteractiveMessage(message.key.remoteJid, {
    text,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "Player Market",
          sections: [
            {
              title: "Pilih",
              rows: [
                { id: "market dijual", title: "🏷️ Barang Dijual", description: "Lihat barang yang dijual pemain" },
                { id: "market dicari", title: "📢 Dicari Pembeli", description: "Lihat permintaan beli pemain" }
              ]
            }
          ]
        })
      }
    ]
  }, { quoted: message });
};

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

    // ---------- pasang listing (jual barang) ----------
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
      if (def.noSell) {
        return await client.sendMessage(sender, { text: "🔒 Item ini tidak bisa diperdagangkan." }, { quoted: message });
      }
      if (!db.hasItem(userId, def.name, qty)) {
        return await client.sendMessage(sender, { text: `❌ Kamu tidak punya ${def.name} x${qty}.` }, { quoted: message });
      }

      db.removeItem(userId, def.name, qty);
      const id = newId("L");
      data.listings.push({
        id,
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
        text: `✅ Listing dibuat: ${def.emoji || "📦"} ${def.name} x${qty}\n💰 Harga: ${rp(price)}/item\n🆔 ID: ${id}`
      }, { quoted: message });
    }

    // ---------- beli listing ----------
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
        return await client.sendMessage(sender, { text: `💸 Gold tidak cukup. Butuh ${rp(total)}, saldo ${rp(user.money)}.` }, { quoted: message });
      }

      const tax = Math.floor(total * TAX);
      db.addMoney(userId, -total);
      db.addItem(userId, { name: listing.name, emoji: listing.emoji, qty: listing.qty });
      db.getUser(listing.sellerId, "Player");
      db.addMoney(listing.sellerId, total - tax);
      db.addStat(userId, "itemsBought", listing.qty);
      db.addStat(listing.sellerId, "itemsSold", listing.qty);
      db.addQuestProgress(userId, "buy", listing.qty);
      db.addQuestProgress(listing.sellerId, "sell", listing.qty);
      db.checkAchievements(userId);
      db.checkAchievements(listing.sellerId);

      data.listings.splice(index, 1);
      save(data);

      return await client.sendMessage(sender, {
        text: `✅ Pembelian berhasil!\n📦 ${listing.emoji} ${listing.name} x${listing.qty}\n💰 Bayar: ${rp(total)} (pajak ${rp(tax)})\n💳 Sisa: ${rp(db.getUser(userId).money)}`
      }, { quoted: message });
    }

    // ---------- batalkan listing ----------
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

    // ---------- pasang buy order (gold ditahan) ----------
    if (action === "order") {
      if (args.length < 4) {
        return await client.sendMessage(sender, { text: `Contoh: ${p}market order Void Shard 2 1600` }, { quoted: message });
      }

      const price = parseInt(args[args.length - 1]);
      const qty = parseInt(args[args.length - 2]);
      const name = args.slice(1, args.length - 2).join(" ").trim();
      const def = findItemDef(name);

      if (!def || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
        return await client.sendMessage(sender, { text: "❌ Format tidak valid." }, { quoted: message });
      }
      if (def.noSell) {
        return await client.sendMessage(sender, { text: "🔒 Item ini tidak bisa diperdagangkan." }, { quoted: message });
      }
      if (data.orders.filter((o) => o.buyerId === userId).length >= MAX_ORDERS_PER_USER) {
        return await client.sendMessage(sender, { text: `❌ Maksimal ${MAX_ORDERS_PER_USER} order aktif.` }, { quoted: message });
      }
      if (data.orders.length >= MAX_ORDERS) {
        return await client.sendMessage(sender, { text: "❌ Order market sedang penuh, coba lagi nanti." }, { quoted: message });
      }

      const total = price * qty;
      if (user.money < total) {
        return await client.sendMessage(sender, { text: `💸 Gold tidak cukup. Butuh ${rp(total)}, saldo ${rp(user.money)}.` }, { quoted: message });
      }

      db.addMoney(userId, -total);
      const id = newId("O");
      data.orders.push({
        id,
        buyerId: userId,
        buyerName: user.name,
        name: def.name,
        emoji: def.emoji || "📦",
        qty,
        price,
        escrow: total,
        createdAt: Date.now()
      });
      save(data);

      return await client.sendMessage(sender, {
        text: `✅ Order beli dipasang: ${def.emoji || "📦"} ${def.name} x${qty}\n💰 ${rp(price)}/item (total ${rp(total)} ditahan)\n🆔 ID: ${id}`
      }, { quoted: message });
    }

    // ---------- penuhi buy order ----------
    if (action === "fill") {
      const id = args[1];
      const index = data.orders.findIndex((o) => o.id === id);
      if (index === -1) {
        return await client.sendMessage(sender, { text: "❌ Order tidak ditemukan." }, { quoted: message });
      }

      const order = data.orders[index];
      if (order.buyerId === userId) {
        return await client.sendMessage(sender, { text: "❌ Kamu tidak bisa menjual ke order sendiri." }, { quoted: message });
      }
      if (!db.hasItem(userId, order.name, order.qty)) {
        return await client.sendMessage(sender, { text: `❌ Kamu tidak punya ${order.name} x${order.qty}.` }, { quoted: message });
      }

      const tax = Math.floor(order.escrow * TAX);
      db.removeItem(userId, order.name, order.qty);
      db.addItem(order.buyerId, { name: order.name, emoji: order.emoji, qty: order.qty });
      db.getUser(order.buyerId, "Player");
      db.addMoney(userId, order.escrow - tax);
      db.addStat(userId, "itemsSold", order.qty);
      db.addStat(order.buyerId, "itemsBought", order.qty);
      db.addQuestProgress(userId, "sell", order.qty);
      db.addQuestProgress(order.buyerId, "buy", order.qty);
      db.checkAchievements(userId);
      db.checkAchievements(order.buyerId);

      data.orders.splice(index, 1);
      save(data);

      return await client.sendMessage(sender, {
        text: `✅ Terjual ke ${order.buyerName}!\n📦 ${order.emoji} ${order.name} x${order.qty}\n💰 Diterima: ${rp(order.escrow - tax)} (pajak ${rp(tax)})`
      }, { quoted: message });
    }

    // ---------- batalkan buy order (gold kembali) ----------
    if (action === "unorder") {
      const id = args[1];
      const index = data.orders.findIndex((o) => o.id === id);
      if (index === -1) {
        return await client.sendMessage(sender, { text: "❌ Order tidak ditemukan." }, { quoted: message });
      }

      const order = data.orders[index];
      if (order.buyerId !== userId) {
        return await client.sendMessage(sender, { text: "❌ Ini bukan order kamu." }, { quoted: message });
      }

      db.addMoney(userId, order.escrow);
      data.orders.splice(index, 1);
      save(data);

      return await client.sendMessage(sender, {
        text: `✅ Order dibatalkan. ${rp(order.escrow)} gold dikembalikan.`
      }, { quoted: message });
    }

    // ---------- tampilan ----------
    if (action === "dijual" || action === "jual") return showListings(client, message, data, p);
    if (action === "dicari") return showOrders(client, message, data, p);

    return showMenu(client, message, data);
  } catch (err) {
    logger.error("Error in market command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "market",
  command: ["market", "pasar"],
  category: "rpg",
  description: "Player market: barang dijual & dicari pembeli (gold ditahan)",
  visible: true,
  subcommands: ["dijual", "dicari", "sell", "order", "buy", "fill", "cancel", "unorder"],
  execute: execute
};
