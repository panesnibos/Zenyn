const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { findItemDef } = require("../../lib/rpgitems");
const { equipmentStats } = require("../../lib/rpgcombat");

const SLOTS = ["weapon", "armor", "accessory"];
const MAX_ENHANCE = 10;

const slotLabel = (slot) => ({ weapon: "⚔️ Weapon", armor: "🛡️ Armor", accessory: "💍 Accessory" }[slot] || slot);

const upgradeCost = (level) => 500 * (level + 1) * (level + 1);

const fmtStats = (s) => {
  if (!s) return "-";
  const parts = [];
  if (s.atk) parts.push(`⚔️ +${s.atk}`);
  if (s.def) parts.push(`🛡 +${s.def}`);
  if (s.hp) parts.push(`❤️ +${s.hp}`);
  if (s.goldBonus) parts.push(`💰 +${Math.round(s.goldBonus * 100)}%`);
  return parts.join(" ") || "-";
};

const itemStatsText = (name, level) => fmtStats(equipmentStats(name, level));

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

const statLine = (user) => {
  const stats = db.getStats(user);
  return `⚔️ ATK: ${stats.atk} | 🛡 DEF: ${stats.def} | ❤️ HP: ${user.hp}/${stats.maxHp}`;
};

const equipmentText = (user) => {
  const lines = SLOTS.map((slot) => {
    const name = user.equipment?.[slot];
    const lv = user.enhance?.[slot] || 0;
    if (!name) return `${slotLabel(slot)}: -`;
    return `${slotLabel(slot)}: *${name}*${lv ? ` +${lv}` : ""} [${itemStatsText(name, lv)}]`;
  });
  return lines.join("\n");
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

    if (commandName === "unequip") {
      const slot = (args[0] || "").toLowerCase();
      if (slot !== "all" && !SLOTS.includes(slot)) {
        return await client.sendMessage(sender, {
          text: `Contoh: ${p}unequip weapon / ${p}unequip all`
        }, { quoted: message });
      }

      db.updateUser(userId, (u) => {
        for (const s of SLOTS) {
          if (slot === "all" || s === slot) {
            u.equipment[s] = null;
            u.enhance[s] = 0;
          }
        }
      });

      const updated = db.getUser(userId);
      return await client.sendMessage(sender, {
        text: `✅ Equipment dilepas.\n\n${equipmentText(updated)}\n${statLine(updated)}`
      }, { quoted: message });
    }

    if (commandName === "upgrade") {
      const slot = (args[0] || "").toLowerCase();

      if (!SLOTS.includes(slot)) {
        const rows = SLOTS.map((s) => {
          const name = user.equipment?.[s];
          if (!name) return null;

          const level = user.enhance?.[s] || 0;
          if (level >= MAX_ENHANCE) return null;

          return {
            id: `upgrade ${s}`,
            title: `${slotLabel(s)} • +${level} → +${level + 1}`,
            description: `${name} • ${itemStatsText(name, level)} → ${itemStatsText(name, level + 1)} • ${upgradeCost(level)} gold`
          };
        }).filter(Boolean);

        const caption = `⚒️ *UPGRADE EQUIPMENT* (max +${MAX_ENHANCE})\n\n${equipmentText(user)}\n${statLine(user)}\n💰 Gold: ${user.money}\n\n` +
          (rows.length
            ? "Pilih equipment yang ingin di-upgrade:"
            : "Semua equipment sudah max atau belum ada yang terpasang.");

        if (!rows.length) {
          return await client.sendMessage(sender, { text: caption }, { quoted: message });
        }

        return await sendList(client, sender, message, caption, "Pilih Upgrade", [
          { title: "⬆️ Upgrade", rows }
        ]);
      }

      const name = user.equipment?.[slot];
      if (!name) {
        return await client.sendMessage(sender, { text: `❌ Tidak ada equipment di slot ${slot}.` }, { quoted: message });
      }

      const level = user.enhance?.[slot] || 0;
      if (level >= MAX_ENHANCE) {
        return await client.sendMessage(sender, { text: `❌ ${name} sudah +${MAX_ENHANCE} (max).\n📊 ${itemStatsText(name, level)}` }, { quoted: message });
      }

      const cost = upgradeCost(level);
      if (user.money < cost) {
        return await client.sendMessage(sender, { text: `💸 Gold tidak cukup. Butuh ${cost}, saldo ${user.money}.` }, { quoted: message });
      }

      db.updateUser(userId, (u) => {
        u.money -= cost;
        u.enhance[slot] = level + 1;
      });

      const updated = db.getUser(userId);
      const nextLevel = level + 1;
      const buttons = [];

      if (nextLevel < MAX_ENHANCE) {
        buttons.push({ id: `upgrade ${slot}`, text: `⬆️ +${nextLevel + 1} (${upgradeCost(nextLevel)})` });
      }
      buttons.push({ id: "equip", text: "⚒️ Equipment" });

      const statPreview = `📊 ${itemStatsText(name, level)} → ${itemStatsText(name, nextLevel)}`;
      const maxNote = nextLevel >= MAX_ENHANCE ? `\n🏆 ${name} sudah MAX +${MAX_ENHANCE}!` : "";

      return await client.sendButtons(sender, {
        text: `✅ *${name}* di-upgrade ke +${nextLevel}\n💰 Biaya: ${cost}\n\n${statPreview}${maxNote}\n\n${statLine(updated)}`,
        footer: "Upgrade",
        buttons
      }, { quoted: message });
    }

    const nameArg = args.join(" ").trim();

    if (!nameArg) {
      const owned = user.inventory
        .filter((i) => findItemDef(i.name)?.type === "equipment")
        .map((i) => `${i.emoji || "📦"} ${i.name} x${i.qty}`);

      return await client.sendMessage(sender, {
        text: `⚒️ *EQUIPMENT*\n\n${equipmentText(user)}\n${statLine(user)}\n\n` +
          `🎒 Equipment di tas:\n${owned.length ? owned.join("\n") : "Belum ada"}\n\n` +
          `Pakai: ${p}equip <item>\nUpgrade: ${p}upgrade (menu tombol)\nLepas: ${p}unequip <slot|all>`
      }, { quoted: message });
    }

    const def = findItemDef(nameArg);
    if (!def || def.type !== "equipment") {
      return await client.sendMessage(sender, { text: "❌ Item itu bukan equipment." }, { quoted: message });
    }

    const inv = user.inventory.find((i) => i.name.toLowerCase() === def.name.toLowerCase());
    if (!inv || inv.qty < 1) {
      return await client.sendMessage(sender, { text: `❌ Kamu tidak punya ${def.name}.` }, { quoted: message });
    }

    if (user.equipment?.[def.slot] === def.name) {
      return await client.sendMessage(sender, { text: `ℹ️ ${def.name} sudah terpasang di ${slotLabel(def.slot)}.` }, { quoted: message });
    }

    db.updateUser(userId, (u) => {
      if (u.equipment[def.slot] !== def.name) u.enhance[def.slot] = 0;
      u.equipment[def.slot] = def.name;
    });

    const updated = db.getUser(userId);
    return await client.sendMessage(sender, {
      text: `✅ ${def.emoji || "⚒️"} *${def.name}* terpasang di ${slotLabel(def.slot)}.\n📊 ${itemStatsText(def.name, updated.enhance?.[def.slot] || 0)}\n\n${statLine(updated)}`
    }, { quoted: message });

  } catch (err) {
    logger.error("Error in equip command:", err);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "equip",
  command: ["equip", "pakai", "unequip", "upgrade"],
  category: "rpg",
  description: "Pasang, lepas, dan upgrade equipment",
  visible: true,
  execute: execute
};
