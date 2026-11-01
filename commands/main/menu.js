const logger = require("../../lib/logger");
const { getCommandsByCategory } = require("../../lib/commandLoader");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { statusOf, formatLimit } = require("../../lib/rpglimit");

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;

  const p = getPrefix(message);
  const includeHidden = isOwner(message);
  const categories = getCommandsByCategory(commands, { includeHidden });

  const userId = getUserId(message);
  const user = userId ? db.getUser(userId, message.pushName || "Player") : null;
  const name = user?.name || message.pushName || "Player";
  const limit = user ? formatLimit(user) : "0/20";
  const status = isOwner(message) ? "Owner" : (user ? statusOf(user) : "User");

  let menuText = `╭━━━〔 Menu 〕━━━⬣
┃ ✦ Name: ${name}
┃ ✦ Limit: ${limit} 
┃ ✦ Status: ${status}
╰━━━━━━━━━━━━━━━━⬣

╭─────────────────────➤
`;

  const INTERNAL = new Set(["confirmbuy", "confirmsell"]);

  for (const [category, cmds] of Object.entries(categories)) {
    if (!cmds.length) continue;
    const catName = category.toUpperCase();
    menuText += `│╭─▣「 *${catName} MENU* 」▣─╮\n`;
    
    const uniqueCmds = new Set();
    cmds.forEach(cmd => {
      const displayName = cmd.name || (Array.isArray(cmd.command) ? cmd.command[0] : cmd.command);
      if (typeof displayName === 'string' && !displayName.includes('_') && !INTERNAL.has(displayName)) {
        uniqueCmds.add(displayName);
      }
    });
    
    Array.from(uniqueCmds)
      .sort()
      .forEach(cmd => {
        menuText += `││ ⟿ ${p}${cmd}\n`;
      });
    
    menuText += `│╰─➤\n│\n`;
  }

  menuText += `│╭==⊱ *Zenyn Bot* ▣─╮
││↻ Simple & Fast RPG Bot
│╰───➤
╰─────┈➤
`;

  const rows = [
    {
      title: "🏓 Ping Test 1",
      description: "Test ping response",
      id: "ping_1"
    },
    {
      title: "🏓 Ping Test 2",
      description: "Test ping response",
      id: "ping_2"
    },
    {
      title: "🏓 Ping Test 3",
      description: "Test ping response",
      id: "ping_3"
    }
  ];

  const buttons = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "Pilih Opsi",
        sections: [
          {
            title: "Ping Tests",
            rows: rows
          }
        ]
      })
    }
  ];

  const messageConfig = {
    text: menuText,
    footer: "Zenyn v1.0",
    buttons: buttons
  };

  try {
    await client.sendInteractiveMessage(sender, messageConfig, { quoted: message });
  } catch (err) {
    logger.error("Error sending menu:", err);
    await client.sendMessage(sender, { text: "❌ Error menampilkan menu" }, { quoted: message });
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
