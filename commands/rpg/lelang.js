// commands/rpg/lelang.js — auction house antar pemain.
// Format: .lelang | .lelang jual <item> <qty> <harga_awal> [buyout]
//         .lelang bid <nomor> <gold> | .lelang beli <nomor> | .lelang batal <nomor> | .lelang saya
const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { findItemDef } = require("../../lib/rpgitems");
const auction = require("../../lib/auction");
const { short } = require("../../lib/num");
const { guarded } = require("../../lib/featureutil");

const left = (lot) => Math.max(0, Math.ceil((lot.endsAt - Date.now()) / 60000));
const rp = (n) => short(n || 0);

const rowText = (lot, i) =>
  `${i + 1}. ${lot.emoji} *${lot.name}* x${lot.qty}\n   ` +
  (lot.topBid ? `Tertinggi: ${rp(lot.topBid)} (${lot.topName})` : `Harga awal: ${rp(lot.start)}`) +
  ` · sisa ${left(lot)}m${lot.buyout ? ` · beli langsung ${rp(lot.buyout)}` : ""}`;

const listText = (p) => {
  const lots = auction.lots();
  if (!lots.length) {
    return [
      "🔨 *AUCTION HOUSE*",
      "",
      "Belum ada lot aktif.",
      "",
      `Pasang: *${p}lelang jual <item> <qty> <harga_awal> [buyout]*`,
      `Contoh: *${p}lelang jual Wooden Sword 1 800 2000*`
    ].join("\n");
  }
  return [
    "🔨 *AUCTION HOUSE*",
    "",
    lots.slice(0, 12).map(rowText).join("\n\n"),
    "",
    `Tawar: *${p}lelang bid <nomor> <gold>* · Beli: *${p}lelang beli <nomor>*`,
    `Pasang lot: *${p}lelang jual <item> <qty> <harga_awal> [buyout]*`,
    `Pajak penjualan ${Math.round(auction.TAX * 100)}% · durasi ${Math.round(auction.DURATION_MS / 60000)} menit`
  ].join("\n");
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);
  if (!userId) throw new Error("Tidak bisa mengenali pengirim.");

  const user = db.getUser(userId, message.pushName || "Player");
  const action = String(args[0] || "").toLowerCase();
  const send = (text) => client.sendMessage(sender, { text }, { quoted: message });

  if (!action) return send(listText(p));

  if (action === "jual" || action === "sell") {
    const tail = [];
    let i = args.length - 1;
    while (i > 1 && /^\d+$/.test(String(args[i]))) {
      tail.unshift(Number(args[i]));
      i--;
    }
    const name = args.slice(1, i + 1).join(" ").trim();
    if (!name || tail.length < 2 || tail.length > 3) {
      return send(
        `🔨 Format: *${p}lelang jual <item> <qty> <harga_awal> [buyout]*\n` +
          `Contoh: *${p}lelang jual Wooden Sword 1 800 2000*`
      );
    }
    const def = findItemDef(name);
    if (!def) throw new Error(`Item *${name}* tidak dikenal.`);
    if (def.noSell) throw new Error("🔒 Item ini tidak bisa diperdagangkan.");
    const [qty, start, buyout] = tail;
    const lot = auction.create({
      sellerId: userId,
      sellerName: user.name,
      chat: sender,
      def,
      qty,
      start,
      buyout
    });
    logger.cmd(`auction: ${user.name} pasang ${lot.name} x${lot.qty} @${start}`);
    return send(
      `✅ *LOT DIPASANG*\n\n${lot.emoji} ${lot.name} x${lot.qty}\n` +
        `Harga awal: ${rp(start)}${buyout ? `\nBeli langsung: ${rp(buyout)}` : ""}\n` +
        `Selesai: ${left(lot)} menit\n\nItem sudah dikunci sampai lelang berakhir.`
    );
  }

  const pick = () => {
    const idx = Number(args[1]) - 1;
    return auction.lots()[idx] || null;
  };

  if (action === "bid" || action === "tawar") {
    const lot = pick();
    if (!lot) throw new Error("Nomor lot tidak ada. Ketik .lelang untuk daftar terbaru.");
    const amount = Number(args[2]);
    const out = auction.bid(userId, user.name, lot, amount);
    return send(
      `✅ Tawaran tercatat: ${rp(out.topBid)} gold untuk ${out.emoji} ${out.name} x${out.qty}.\n` +
        `Gold dikunci sampai lelang selesai; kalah = dikembalikan otomatis.`
    );
  }

  if (action === "beli" || action === "buy") {
    const lot = pick();
    if (!lot) throw new Error("Nomor lot tidak ada. Ketik .lelang untuk daftar terbaru.");
    const res = auction.buyout(userId, user.name, lot);
    return send(
      `✅ *BELI LANGSUNG*\n\n${res.lot.emoji} ${res.lot.name} x${res.lot.qty} masuk inventory.\n` +
        `Bayar: ${rp(res.price)} gold (penjual terima ${rp(res.price - res.tax)}).`
    );
  }

  if (action === "batal" || action === "cancel") {
    const lot = pick();
    const out = auction.cancel(userId, lot);
    return send(`🗑️ Lot ${out.emoji} ${out.name} x${out.qty} ditarik, item dikembalikan.`);
  }

  if (action === "saya" || action === "mine") {
    const mine = auction.lots().filter((l) => l.sellerId === userId);
    if (!mine.length) return send(`🔨 Kamu tidak punya lot aktif.\n\nPasang: *${p}lelang jual <item> <qty> <harga_awal>*`);
    return send(
      ["🔨 *LELANG SAYA*", "", mine.map((lot, n) => `${n + 1}. ${lot.emoji} ${lot.name} x${lot.qty} · ${lot.topBid ? `tertinggi ${rp(lot.topBid)}` : "belum ada penawar"} · sisa ${left(lot)}m`).join("\n")].join("\n")
    );
  }

  return send(listText(p));
};

module.exports = {
  name: "lelang",
  command: ["lelang", "auction", "ah"],
  category: "rpg",
  visible: true,
  description: "Auction house: lelang item antar pemain (bid/buyout, pajak 5%)",
  subcommands: ["jual <item> <qty> <awal> [buyout]", "bid <nomor> <gold>", "beli <nomor>", "batal <nomor>", "saya"],
  execute: guarded("lelang", execute)
};
