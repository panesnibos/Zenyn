const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { isOwner } = require("../../lib/owner");

const pad = (n) => String(n).padStart(2, "0");

const formatUptime = (sec) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}j ${pad(m)}m ${pad(r)}s`;
};

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;

  if (!isOwner(message)) {
    return await client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  try {
    const users = Object.values(db.all());
    const totalMoney = users.reduce((a, u) => a + (u.money || 0), 0);
    const totalLevel = users.reduce((a, u) => a + (u.level || 0), 0);
    const mem = process.memoryUsage();
    const mb = (n) => (n / 1024 / 1024).toFixed(1);

    const text = `📊 *BOT STATISTICS*

⏱ Uptime     : ${formatUptime(process.uptime())}
👥 Users      : ${users.length}
💰 Total Gold : ${totalMoney}
⭐ Total Lvl  : ${totalLevel}
🧩 Commands   : ${Object.keys(commands).length}

🖥 Node       : ${process.version}
📦 RAM (rss)  : ${mb(mem.rss)} MB
📦 Heap used  : ${mb(mem.heapUsed)} MB
🌐 Platform   : ${process.platform}`;

    logger.cmd("botstats requested");

    return await client.sendMessage(sender, { text }, { quoted: message });

  } catch (err) {
    logger.error(`botstats: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "botstats",
  command: ["botstats", "stats", "status"],
  category: "owner",
  description: "Statistik bot & database (owner)",
  visible: false,
  execute: execute
};
