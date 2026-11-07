const fetch = require("node-fetch");
const logger = require("../../lib/logger");
const config = require("../../config");
const { getCommandsByCategory } = require("../../lib/commandLoader");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const { db } = require("../../lib/rpgdb");
const { getUserId, getSenderJids, normalizeNumber } = require("../../lib/rpgutil");
const { footerFor } = require("../../lib/tips");
const { timeWIB, greeting } = require("../../lib/stamp");
const { renderMenu } = require("../../lib/menuImage");

const CAT_META = {
  main: { label: "MAIN", icon: "user", color: "#3b82f6" },
  info: { label: "INFO", icon: "info", color: "#38bdf8" },
  rpg: { label: "RPG", icon: "target", color: "#a855f7" },
  tools: { label: "TOOLS", icon: "tool", color: "#10b981" },
  downloader: { label: "DOWNLOAD", icon: "download", color: "#f59e0b" },
  owner: { label: "OWNER", icon: "settings", color: "#ef4444" }
};

const metaFor = (key) =>
  CAT_META[key] || { label: String(key).toUpperCase(), icon: "grid", color: "#818cf8" };

const buildCategories = (cats) =>
  Object.keys(cats)
    .filter((key) => Array.isArray(cats[key]) && cats[key].length)
    .map((key) => ({ key, ...metaFor(key) }));

const pad = (n) => String(n).padStart(2, "0");

const formatUptime = (sec) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}h ${pad(m)}m ${pad(r)}s`;
};

const getAvatar = async (client, message, sender) => {
  const targetJid =
    message.key.participant ||
    (message.canonicalUserId ? `${message.canonicalUserId}@s.whatsapp.net` : sender);

  try {
    const url = await client.profilePictureUrl(targetJid, "image");
    if (!url) return null;
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
};

const getRole = async (client, message, sender) => {
  const isGroup = /@g\.us$/i.test(String(sender));

  if (isOwner(message)) return { text: "OWNER · Grup", icon: "crown" };
  if (!isGroup) return { text: "Private Chat", icon: "user" };

  try {
    const meta = await client.groupMetadata(sender);
    const mine = getSenderJids(message).map(normalizeNumber).filter(Boolean);
    const part = (meta?.participants || []).find((pt) =>
      mine.includes(normalizeNumber(pt.id || pt.jid || ""))
    );
    if (part?.admin === "superadmin") return { text: "OWNER · Grup", icon: "crown" };
    if (part?.admin === "admin") return { text: "ADMIN · Grup", icon: "shield" };
  } catch {
    /* fallback ke member */
  }

  return { text: "MEMBER · Grup", icon: "user" };
};

const menuButtons = () => {
  const sections = [
    {
      title: "🎮 Bermain",
      rows: [{ title: "🎮 RPG Menu", description: "Battle, dungeon, shop, pet & lainnya", id: "rpg" }]
    },
    {
      title: "🔧 Utilitas",
      rows: [{ title: "🏓 Ping", description: "Cek latency & kecepatan bot", id: "ping" }]
    },
    {
      title: "👤 Bantuan",
      rows: [{ title: "📞 Owner / CS", description: "Hubungi owner atau customer service", id: "owner" }]
    }
  ];

  const buttons = [
    { name: "single_select", buttonParamsJson: JSON.stringify({ title: "Buka Menu", sections }) }
  ];

  if (config.groupLink) {
    buttons.push({
      name: "cta_url",
      buttonParamsJson: JSON.stringify({ display_text: "🔗 Join Group", url: config.groupLink })
    });
  }

  return buttons;
};

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  const uid = getUserId(message);
  const user = uid ? db.getUser(uid, message.pushName || "Player") : {};

  const categoriesMap = getCommandsByCategory(commands, { includeHidden: isOwner(message) });
  const categories = buildCategories(categoriesMap);
  const totalUser = Object.keys(db.all()).length;

  const exp = Number(user.exp) || 0;
  const expNeeded = Number(user.expNeeded) || 100;
  const expPct = Math.max(0, Math.min(100, Math.round((exp / expNeeded) * 100)));

  const [avatar, role] = await Promise.all([
    getAvatar(client, message, sender),
    getRole(client, message, sender)
  ]);

  try {
    const image = await renderMenu({
      greeting: greeting(),
      name: user.name || message.pushName || "Player",
      level: user.level ?? 0,
      role: role.text,
      roleIcon: role.icon,
      expPct,
      expText: `${exp.toLocaleString("id-ID")} / ${expNeeded.toLocaleString("id-ID")} EXP`,
      uptime: formatUptime(process.uptime()),
      clock: timeWIB(),
      totalFitur: Object.keys(commands).length,
      totalUser,
      categories,
      avatar
    });

    await client.sendMessage(
      sender,
      { image, caption: `*${config.botName} Menu*  •  ${Object.keys(commands).length} fitur` },
      { quoted: message }
    );

    await client.sendInteractiveMessage(
      sender,
      {
        text: `Halo *${user.name || message.pushName || "Player"}*! Pilih menu di bawah.`,
        footer: footerFor("main", p),
        buttons: menuButtons()
      },
      { quoted: message }
    );

    logger.cmd(`test: rich menu -> ${sender}`);
  } catch (err) {
    logger.error(`test menu: ${err.message}`);
    await client.sendMessage(
      sender,
      { text: `❌ Gagal render menu: ${err.message}` },
      { quoted: message }
    );
  }
};

module.exports = {
  name: "test",
  command: ["test"],
  category: "main",
  description: "Tampilkan menu tampilan rich (gambar)",
  visible: true,
  execute: execute
};
