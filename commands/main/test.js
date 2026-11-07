const fetch = require("node-fetch");
const sharp = require("sharp");
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
const { card } = require("../../lib/richcard");
const { sendRichHtml, supported } = require("../../lib/richsend");

const CAT_META = {
  main: { label: "MAIN", icon: "user", color: "#3b82f6" },
  info: { label: "INFO", icon: "info", color: "#38bdf8" },
  rpg: { label: "RPG", icon: "target", color: "#a855f7" },
  tools: { label: "TOOLS", icon: "tool", color: "#10b981" },
  downloader: { label: "DOWNLOAD", icon: "download", color: "#f59e0b" },
  owner: { label: "OWNER", icon: "settings", color: "#ef4444" },
  fun: { label: "FUN", icon: "zap", color: "#ec4899" }
};

const metaFor = (key) =>
  CAT_META[key] || { label: String(key).toUpperCase(), icon: "grid", color: "#818cf8" };

const buildCategories = (cats) =>
  Object.keys(cats)
    .filter((key) => Array.isArray(cats[key]) && cats[key].length)
    .map((key) => ({ key, count: cats[key].length, ...metaFor(key) }));

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

const toDataUri = async (buf) => {
  if (!buf?.length) return "";
  try {
    const out = await sharp(buf).resize(160, 160, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return "";
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

const sendButtons = async (client, sender, message, name, p) => {
  try {
    await client.sendInteractiveMessage(
      sender,
      {
        text: `Halo *${name}*! Pilih menu di bawah.`,
        footer: footerFor("main", p),
        buttons: menuButtons()
      },
      { quoted: message }
    );
  } catch (err) {
    logger.warn(`test: tombol gagal: ${err.message}`);
  }
};

const sendImage = async (client, sender, message, view) => {
  const image = await renderMenu({
    greeting: view.greeting,
    name: view.name,
    level: view.level,
    role: view.role,
    roleIcon: view.roleIcon,
    expPct: view.expPct,
    expText: view.expText,
    uptime: view.uptime,
    clock: view.clock,
    totalFitur: view.totalFitur,
    totalUser: view.totalUser,
    categories: view.categories.map((c) => ({ label: c.label, icon: c.icon, color: c.color })),
    avatar: view.avatarBuf
  });

  await client.sendMessage(
    sender,
    { image, caption: `*${config.botName} Menu*  •  ${view.totalFitur} fitur` },
    { quoted: message }
  );
};

const sendCard = async (client, sender, view) => {
  const html = card({
    brand: config.botName,
    eyebrow: `${config.botName} • menu`,
    title: "",
    icon: "grid",
    greeting: view.greeting,
    name: view.name,
    role: view.role,
    roleIcon: view.roleIcon,
    avatar: view.avatarUri,
    level: view.level,
    expPct: view.expPct,
    expText: view.expText,
    a: "#7c3aed",
    b: "#38bdf8",
    tiles: [
      { l: "Uptime", v: view.uptime, fa: "zap", hue: "#22c55e" },
      { l: "Jam", v: view.clock, fa: "clock", hue: "#60a5fa" },
      { l: "Fitur", v: `${view.totalFitur}`, fa: "grid", hue: "#a78bfa" },
      { l: "User", v: `${view.totalUser}`, fa: "users", hue: "#f59e0b" }
    ],
    cats: view.categories.map((c) => ({
      n: c.label,
      d: `${c.count} fitur`,
      cnt: c.count,
      fa: c.icon,
      cc: c.color
    })),
    foot: `${config.botName} • ${timeWIB()}`
  });

  return await sendRichHtml(client, sender, html, `Menu ${config.botName}`);
};

const execute = async (client, message, args, commands) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const mode = String(args?.[0] || "").toLowerCase();

  const uid = getUserId(message);
  const user = uid ? db.getUser(uid, message.pushName || "Player") : {};

  const categoriesMap = getCommandsByCategory(commands, { includeHidden: isOwner(message) });
  const categories = buildCategories(categoriesMap);
  const totalUser = Object.keys(db.all()).length;

  const exp = Number(user.exp) || 0;
  const expNeeded = Number(user.expNeeded) || 100;
  const expPct = Math.max(0, Math.min(100, Math.round((exp / expNeeded) * 100)));

  const [avatarBuf, role] = await Promise.all([
    getAvatar(client, message, sender),
    getRole(client, message, sender)
  ]);

  const view = {
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
    avatarBuf,
    avatarUri: await toDataUri(avatarBuf)
  };

  const wantImage = mode === "img" || mode === "image";

  if (!wantImage && config.richCard && supported(client)) {
    try {
      await sendCard(client, sender, view);
      await sendButtons(client, sender, message, view.name, p);
      logger.cmd(`test: rich card -> ${sender}`);
      return;
    } catch (err) {
      logger.warn(`test: rich gagal, fallback gambar: ${err.message}`);
    }
  }

  try {
    await sendImage(client, sender, message, view);
    await sendButtons(client, sender, message, view.name, p);
    logger.cmd(`test: image menu -> ${sender}`);
  } catch (err) {
    logger.error(`test menu: ${err.message}`);
    await client.sendMessage(sender, { text: `❌ Gagal render menu: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "test",
  command: ["test"],
  category: "main",
  description: "Tampilkan menu (rich HTML, fallback gambar). .test img = paksa gambar",
  visible: true,
  execute: execute
};
