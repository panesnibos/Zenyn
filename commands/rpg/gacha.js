const logger = require("../../lib/logger");
const fs = require("fs");
const path = require("path");
const { db } = require("../../lib/rpgdb");
const { getUserId, getRank } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const pity = require("../../lib/pity");
const { crateInfoText } = require("../../lib/iteminfo");

const gachaPath = path.join(__dirname, "../../database/rpg/gacha.json");
let gachas = {};
try {
  gachas = JSON.parse(fs.readFileSync(gachaPath));
} catch {
  logger.info("❌ gacha.json error");
}

const MAX_OPEN = 10;
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const getInventoryText = (user) => {
  return user.inventory.length
    ? user.inventory.slice(0, 5).map((i) => `${i.emoji || "📦"} ${i.name} x${i.qty}`).join("\n") +
        (user.inventory.length > 5 ? "\n..." : "")
    : "🎒 Kosong";
};

const buildCaption = (user) => {
  const { rank, icon } = getRank(user.level);
  return `${icon} *${user.name}*
✦ ${rank} — Level ${user.level}
────────────
💰 Gold: ${user.money}

🎒 Inventory:
${getInventoryText(user)}`;
};

const getItem = (user, name) => {
  return user.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase());
};

const pickWeighted = (pool) => {
  const total = pool.reduce((sum, item) => sum + (Number(item.weight) || 1), 0);
  let rand = Math.random() * total;
  for (const item of pool) {
    rand -= Number(item.weight) || 1;
    if (rand <= 0) return item;
  }
  return pool[pool.length - 1];
};

const qtyOf = (item) =>
  Array.isArray(item.qty) ? randInt(item.qty[0], item.qty[1]) : Math.max(1, Math.floor(Number(item.qty) || 1));

// 1 buka = 1 gold + N roll item; item ber-cap hanya boleh muncul sekali
const openCrate = (crate, id) => {
  const goldRange = crate.gold || {};
  const gold = goldRange.max ? randInt(Number(goldRange.min) || 0, Number(goldRange.max)) : 0;
  if (gold > 0) db.addMoney(id, gold);

  const rewards = [];
  const used = new Set();
  const rolls = Math.max(1, Math.min(MAX_OPEN, Number(crate.rolls) || 1));

  for (let i = 0; i < rolls; i++) {
    const pool = (crate.items || []).filter((item) => !(item.cap && used.has(item.name.toLowerCase())));
    if (!pool.length) break;
    const picked = pickWeighted(pool);
    if (picked.cap) used.add(picked.name.toLowerCase());
    const got = { name: picked.name, emoji: picked.emoji || "📦", qty: qtyOf(picked) };
    rewards.push(got);
    db.addItem(id, got);
  }

  return { gold, rewards };
};

const guideFor = (p, name) => {
  if (name === "premium-key") {
    return `Beli: *${p}key* (QRIS/saldo) atau Black Market — 7.000 gold.`;
  }
  if (name === "bronze-key") {
    return `Dapat dari *${p}daily*, dungeon, atau Black Market.`;
  }
  if (name === "shadow-key") {
    return `Kunci ini hanya dari premium crate: buka *${p}open premium-key*.`;
  }
  return `Dapatkan key-nya dulu untuk membuka crate ini.`;
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);

  if (!userId) {
    return await client.sendMessage(sender, { text: "❌ Error: Cannot identify user" }, { quoted: message });
  }

  const user = db.getUser(userId, message.pushName || "Player");
  const p = getPrefix(message);

  const isOpen = commandName === "open";

  try {
    // ================= MENU CRATE =================
    if (!isOpen) {
      const rows = Object.values(gachas).map((item) => {
        const inv = getItem(user, item.name);
        const qty = inv ? inv.qty : 0;
        return {
          id: `open ${item.name}`,
          title: `${item.emoji || "🎁"} ${item.name}`,
          description: `Punya: ${qty} · 1 gold + ${item.rolls || 1} item`
        };
      });
      rows.push({ id: "key", title: "🔑 Beli Premium Key", description: "QRIS / saldo Rp" });

      const info = Object.values(gachas)
        .map((crate) => {
          const inv = getItem(user, crate.name);
          return `${crate.emoji || "🎁"} *${crate.name}* · punya ${inv ? inv.qty : 0}\n${crateInfoText(crate.name)}`;
        })
        .join("\n\n");

      return await client.sendInteractiveMessage(sender, {
        text: `🀄 *CRATE*\n\n${info}\n\nBuka: *${p}open <crate> <jumlah>* (contoh: ${p}open premium-key 1)`,
        interactiveButtons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Pilih Crate",
              sections: [{ title: "Daftar Crate", rows }]
            })
          }
        ]
      }, { quoted: message });
    }

    // ================= OPEN CRATE =================
    const name = (args[0] || "").toLowerCase();

    if (!name) {
      return await client.sendMessage(sender, { text: `Contoh: ${p}open bronze-key 5\nDaftar crate: *${p}crate*` }, { quoted: message });
    }

    const crate = gachas[name];
    if (!crate) {
      return await client.sendMessage(sender, { text: `❌ Crate *${name}* tidak ditemukan.\nLihat daftar: *${p}crate*` }, { quoted: message });
    }

    const item = getItem(user, crate.name);
    if (!item || item.qty < 1) {
      return await client.sendMessage(sender, { text: `❌ Kamu tidak punya ${crate.name}.\n${guideFor(p, crate.name)}` }, { quoted: message });
    }

    const want = Math.floor(Number(args[1]) || 1);
    const qty = Math.min(Math.max(1, want), item.qty, MAX_OPEN);
    const note =
      want > qty
        ? `\n\nℹ️ Cuma bisa buka ${qty} (${want > item.qty ? `stok ${item.qty}` : `maks ${MAX_OPEN}`}).`
        : "";

    let totalGold = 0;
    let totalItems = 0;
    let pityHit = 0;
    const tally = new Map();
    const addTally = (got, amount) => {
      const key = got.name.toLowerCase();
      const prev = tally.get(key) || { emoji: got.emoji, name: got.name, qty: 0 };
      prev.qty += amount;
      tally.set(key, prev);
    };

    for (let i = 0; i < qty; i++) {
      db.removeItem(userId, crate.name, 1);
      const got = openCrate(crate, userId);
      totalGold += got.gold;
      totalItems += got.rewards.length;
      for (const reward of got.rewards) addTally(reward, reward.qty);

      // jaminan setiap THRESHOLD buka: bonus Diamond
      if (pity.bump(userId, crate.name) >= pity.THRESHOLD) {
        pity.reset(userId, crate.name);
        const bonus = { name: "Diamond", emoji: "💎", qty: 1 };
        db.addItem(userId, bonus);
        addTally(bonus, 1);
        totalItems++;
        pityHit++;
      }
    }

    const results = tally.size
      ? [...tally.values()].map((i) => `${i.emoji || "📦"} ${i.name} x${i.qty}`)
      : ["😢 Tidak ada item"];

    let text = `🎁 Kamu membuka *${crate.name}*${qty > 1 ? ` x${qty}` : ""}\n\n`;
    if (totalGold > 0) text += `💰 Gold: +${totalGold}\n`;
    text += `📦 Hasil (${totalItems} item):\n${results.join("\n")}${note}`;
    if (pityHit) text += `\n\n🌟 *PITY PENUH* (${pity.THRESHOLD}x) — jaminan 💎 Diamond x${pityHit}`;
    text += `\n\n🎯 Pity: ${pity.get(userId, crate.name)}/${pity.THRESHOLD} (jaminan dalam ${pity.needed(userId, crate.name)} buka)`;

    return await client.sendMessage(sender, { text }, { quoted: message });
  } catch (err) {
    logger.error("Error in gacha command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "gacha",
  command: ["gacha", "crate", "open"],
  category: "rpg",
  visible: true,
  description: "Buka crate: 1 gold + 3 item per buka",
  subcommands: ["<crate> [jumlah]"],
  execute,
  _internal: { openCrate, pickWeighted, qtyOf }
};
