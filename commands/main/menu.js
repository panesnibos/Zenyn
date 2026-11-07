const logger = require("../../lib/logger");
const config = require("../../config");
const { getCommandsByCategory } = require("../../lib/commandLoader");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { statusOf, formatLimit } = require("../../lib/rpglimit");

const RISKY = new Set([
  "additem", "addlevel", "addlimit", "addmoney", "botstats",
  "resetuser", "setstatus"
]);

const riskOf = (cmd) => {
  let marks = "";
  if (cmd.group === true || cmd.category === "rpg") marks += " 👥";
  if (RISKY.has(cmd.name)) marks += " 🔒";
  if (cmd.premium === true || cmd.category === "premium") marks += " 💎";
  return marks;
};

const buildMenuText = (p, categories, commands, user) => {
  const lines = [];

  lines.push("╭━━━〔 *ZENYN MENU* 〕━━━⬣");
  lines.push(`┃ ✦ Name   : ${user.name}`);
  lines.push(`┃ ✦ Limit  : ${formatLimit(user)}`);
  lines.push(`┃ ✦ Status : ${statusOf(user)}`);
  lines.push(`┃ ✦ Prefix : ${p}`);
  lines.push("╰━━━━━━━━━━━━━━━━⬣");
  lines.push("");

  const INTERNAL = new Set(["confirmbuy", "confirmsell"]);

  for (const [category, cmds] of Object.entries(categories)) {
    if (!cmds.length) continue;

    const uniqueCmds = new Map();
    cmds.forEach((cmd) => {
      const displayName = cmd.name || (Array.isArray(cmd.command) ? cmd.command[0] : cmd.command);
      if (typeof displayName === "string" && !displayName.includes("_") && !INTERNAL.has(displayName)) {
        uniqueCmds.set(displayName, cmd);
      }
    });

    if (!uniqueCmds.size) continue;

    lines.push(`│╭─▣「 *${category.toUpperCase()} MENU* 」▣─╮`);
    Array.from(uniqueCmds.keys())
      .sort()
      .forEach((name) => {
        const cmd = uniqueCmds.get(name);
        lines.push(`││ ⟿ ${p}${name}${riskOf(cmd)}`);
      });
    lines.push("│╰─➤");
    lines.push("│");
  }

  lines.push(`│╭==⊱ *Zenyn Bot* ▣─╮`);
  lines.push(`││ ✦ Total Commands : ${Object.keys(commands).length}`);
  lines.push(`││ ✦ Kategori       : ${Object.keys(categories).length}`);
  lines.push("│╰───➤");
  lines.push("╰─────┈➤");
  lines.push("");
  lines.push("👥 wajib grup • 🔒 khusus owner • 💎 premium");

  return lines.join("\n");
};

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;

  const p = getPrefix(message);
  const includeHidden = isOwner(message);
  const categories = getCommandsByCategory(commands, { includeHidden });

  const uid = getUserId(message);
  const user = uid ? db.getUser(uid, message.pushName || "Player") : { name: message.pushName || "Player" };

  const menuText = buildMenuText(p, categories, commands, user);

  const sections = [
    {
      title: "🎮 Bermain",
      rows: [
        {
          title: "🎮 RPG Menu",
          description: "Battle, dungeon, shop, pet & lainnya",
          id: "rpg"
        }
      ]
    },
    {
      title: "🔧 Utilitas",
      rows: [
        {
          title: "🏓 Ping",
          description: "Cek latency & kecepatan bot",
          id: "ping"
        }
      ]
    },
    {
      title: "👤 Bantuan",
      rows: [
        {
          title: "📞 Owner / CS",
          description: "Hubungi owner atau customer service",
          id: "owner"
        }
      ]
    }
  ];

  const buttons = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "Buka Menu",
        sections
      })
    }
  ];

  if (config.groupLink) {
    buttons.push({
      name: "cta_url",
      buttonParamsJson: JSON.stringify({
        display_text: "🔗 Join Group",
        url: config.groupLink
      })
    });
  }

  const messageConfig = {
    text: menuText,
    footer: "Zenyn v1.0",
    buttons: buttons
  };

  try {
    await client.sendInteractiveMessage(sender, messageConfig, { quoted: message });
  } catch (err) {
    logger.error("Error sending menu:", err);
    await client.sendMessage(sender, { text: menuText }).catch(async () => {
      await client.sendMessage(sender, { text: "❌ Error menampilkan menu" }, { quoted: message });
    });
  }
};

module.exports = {
  name: "menu",
  command: ["menu", "help"],
  category: "main",
  description: "Tampilkan menu & bantuan",
  visible: true,
  execute: execute
};
