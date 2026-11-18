// commands/rpg/use.js — pakai item consumable dari inventory.
// Format: .use <item> [jumlah]
const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { findItemDef } = require("../../lib/rpgitems");

const MAX_LEVEL = 30;
const expNeed = (level) => Math.floor(50 * level * 1.4);

// key -> efek; key sama dengan key di shop.json
const CONSUMABLES = {
  "exp-scroll": (user, qty) => {
    const target = 150 * qty;
    db.addExp(user.id, target);
    return `📜 +${target} EXP`;
  },
  "pet-food": (user, qty) => {
    if (!user.pet) throw new Error("Kamu belum punya pet.");
    if ((user.pet.level || 1) >= MAX_LEVEL) throw new Error(`Pet sudah level maksimal (${MAX_LEVEL}).`);
    let levelUp = 0;
    db.updateUser(user.id, (u) => {
      u.pet.exp += 50 * qty;
      while (u.pet.level < MAX_LEVEL && u.pet.exp >= u.pet.expNeeded) {
        u.pet.exp -= u.pet.expNeeded;
        u.pet.level++;
        u.pet.expNeeded = expNeed(u.pet.level);
        levelUp++;
      }
    });
    const pet = db.getUser(user.id).pet;
    return `🍖 Pet +${50 * qty} EXP${levelUp ? ` — naik ${levelUp} level!` : ""}\nSekarang Lv.${pet.level} (${pet.exp}/${pet.expNeeded})`;
  },
  "strength-tonic": (user) => {
    db.updateUser(user.id, (u) => { u.tonic = Date.now(); });
    return "🧪 Strength Tonic aktif: +20% ATK untuk 1 pertarungan berikutnya.";
  },
  "anti-death-charm": (user, qty) => {
    db.updateUser(user.id, (u) => { u.charm = (Number(u.charm) || 0) + qty; });
    return `🧿 Anti-Death Charm +${qty} (total ${Number(db.getUser(user.id).charm) || 0}). Kalah 1x tidak kena cooldown mati.`;
  },
  bait: (user, qty) => {
    db.updateUser(user.id, (u) => { u.bait = (Number(u.bait) || 0) + qty; });
    return `🪱 Bait +${qty} (total ${Number(db.getUser(user.id).bait) || 0}). Dipakai otomatis saat memancing.`;
  }
};

// toleran: "anti death charm" / "charm" -> anti-death-charm
const resolveItem = (name) => {
  const raw = String(name || "").trim();
  const direct = findItemDef(raw);
  if (direct && CONSUMABLES[direct.key]) return direct;
  const slug = raw.toLowerCase().replace(/\s+/g, "-");
  const bySlug = findItemDef(slug);
  if (bySlug && CONSUMABLES[bySlug.key]) return bySlug;
  const loose = Object.keys(CONSUMABLES).find((key) => key.includes(slug) || key.replace(/-/g, " ").includes(raw.toLowerCase()));
  return loose ? findItemDef(loose) : direct;
};

const execute = async (client, message, args) => {  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);
  if (!userId) throw new Error("Tidak bisa mengenali pengirim.");

  const words = args.map((a) => String(a));
  let qty = 1;
  if (words.length > 1 && /^\d+$/.test(words[words.length - 1])) qty = Math.max(1, Number(words.pop()));
  const name = words.join(" ").trim();

  if (!name) {
    return client.sendMessage(sender, {
      text:
        `🎒 *PAKAI ITEM*\n\nFormat: *${p}use <item> [jumlah]*\n\n` +
        `Bisa dipakai:\n• Exp Scroll — +150 EXP\n• Pet Food — +50 EXP pet\n• Strength Tonic — +20% ATK 1 battle\n• Anti-Death Charm — 1x bebas cooldown mati\n• Bait — +1 hasil mancing (otomatis)\n\n` +
        `Item heal dipakai lewat *${p}heal*.`
    }, { quoted: message });
  }

  const def = resolveItem(name);
  if (!def) throw new Error(`Item *${name}* tidak dikenal.`);
  const effect = CONSUMABLES[def.key];
  if (!effect) throw new Error(`*${def.name}* tidak bisa dipakai dengan .use.${/heal/i.test(def.type || "") || ["potion", "elixir", "greater-potion"].includes(def.key) ? ` Pakai *${p}heal*.` : ""}`);
  if (!db.hasItem(userId, def.name, qty)) throw new Error(`Kamu tidak punya ${def.name} x${qty}.`);

  const user = db.getUser(userId, message.pushName || "Player");
  const detail = effect(user, qty);
  db.removeItem(userId, def.name, qty);
  db.addQuestProgress(userId, "use", qty);
  db.checkAchievements(userId);
  logger.cmd(`use: ${def.name} x${qty} oleh ${userId}`);

  return client.sendMessage(sender, { text: `${def.emoji || "📦"} ${detail}` }, { quoted: message });
};

module.exports = {
  name: "use",
  command: ["use", "pakai"],
  category: "rpg",
  visible: true,
  description: "Pakai consumable: EXP Scroll, Pet Food, Tonic, Charm, Bait",
  subcommands: ["<item> [jumlah]"],
  execute
};
