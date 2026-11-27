const logger = require("../../lib/logger");
const config = require("../../config");
const { getCommandsByCategory } = require("../../lib/commandLoader");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { statusOf, formatLimit } = require("../../lib/rpglimit");

const INTERNAL = new Set(["confirmbuy", "confirmsell"]);
const SKIP = new Set(["test"]);

const CAT_ALIAS = {
  mainmenu: "main",
  ownermenu: "owner",
  toolmenu: "tools",
  downloadermenu: "downloader",
  rpgmenu: "rpg",
  storemenu: "store",
  funmenu: "fun",
  infomenu: "info",
  gatewaymenu: "gateway",
  bugmenu: "bug"
};

const CAT_TITLE = {
  main: "MAIN",
  owner: "OWNER",
  tools: "TOOL",
  downloader: "DOWNLOADER",
  rpg: "RPG",
  store: "STORE",
  fun: "FUN",
  info: "INFO",
  gateway: "GATEWAY",
  bug: "BUG"
};

const ORDER = ["main", "owner", "tools", "downloader", "rpg", "store", "fun", "info", "gateway", "bug"];

const OTHER_ROWS = [
  { id: "ownermenu", emoji: "🔒", title: "Owner Menu", desc: "Menampilkan owner menu" },
  { id: "toolmenu", emoji: "🛠️", title: "Tool Menu", desc: "Menampilkan tool menu" },
  { id: "downloadermenu", emoji: "📥", title: "Downloader Menu", desc: "Menampilkan downloader menu" },
  { id: "rpgmenu", emoji: "🎮", title: "RPG Menu", desc: "Menampilkan rpg menu" },
  { id: "storemenu", emoji: "🛒", title: "Store Menu", desc: "Menampilkan store menu" },
  { id: "funmenu", emoji: "🎲", title: "Fun Menu", desc: "Menampilkan fun menu" },
  { id: "infomenu", emoji: "ℹ️", title: "Info Menu", desc: "Menampilkan info menu" },
  { id: "gatewaymenu", emoji: "🌐", title: "Gateway Menu", desc: "Menampilkan gateway menu" },
  { id: "bugmenu", emoji: "🐞", title: "Bug Menu", desc: "Bug/eksperimen (owner)" }
];

const box = (title, lines) => {
  const body = (lines.length ? lines : ["(kosong)"]).map((line) => `┃ ✦ ${line}`);
  return [`╭━━━〔 *${title}* 〕━━━⬣`, ...body, "╰━━━━━━━━━━━━━━━━⬣"].join("\n");
};

const identityBox = (p, user) =>
  [
    "╭━━━〔 *ZENYN MENU* 〕━━━⬣",
    `┃ ✦ Name   : ${user.name || "Player"}`,
    `┃ ✦ Limit  : ${formatLimit(user)}`,
    `┃ ✦ Status : ${statusOf(user)}`,
    `┃ ✦ Prefix : ${p}`,
    "╰━━━━━━━━━━━━━━━━⬣"
  ].join("\n");

const commandNames = (cmds) => {
  const set = new Set();
  for (const cmd of cmds || []) {
    const name = cmd.name || (Array.isArray(cmd.command) ? cmd.command[0] : cmd.command);
    if (typeof name !== "string" || name.includes("_") || INTERNAL.has(name) || SKIP.has(name)) continue;
    set.add(name);
  }
  return [...set].sort();
};

const greetEn = () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date())
  );
  if (hour < 11) return "Good Morning";
  if (hour < 15) return "Good Afternoon";
  if (hour < 18) return "Good Evening";
  return "Good Night";
};

const displayName = (user, message) =>
  user?.registered ? user.name : message.pushName || user?.name || "Player";

const selectButton = (title, sections) => ({
  name: "single_select",
  buttonParamsJson: JSON.stringify({ title, sections })
});

const ctaButton = () =>
  config.groupLink
    ? {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({ display_text: "🔗 Join Group", url: config.groupLink })
      }
    : null;

const buildButtons = (user, message, categories) => {
  const name = displayName(user, message);
  const sections = [
    {
      title: `👤 ${greetEn()}, ${name}`,
      rows: [
        { id: "owner", title: "📞 Owner / CS", description: "Hubungi owner atau customer service" },
        { id: "ping", title: "🏓 Ping", description: "Cek latency & kecepatan bot" }
      ]
    },
    {
      title: "📂 Kategori",
      rows: OTHER_ROWS.filter((row) => commandNames(categories[CAT_ALIAS[row.id]]).length).map((row) => ({
        id: row.id,
        title: `${row.emoji} ${row.title}`,
        description: row.desc
      }))
    }
  ];

  const buttons = [selectButton("Menu Utama", sections)];
  const cta = ctaButton();
  if (cta) buttons.push(cta);
  return buttons;
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const uid = getUserId(message);
  const user = uid ? db.getUser(uid, message.pushName || "Player") : { name: message.pushName || "Player" };
  const categories = getCommandsByCategory(commands, { includeHidden: isOwner(message) });

  const invoked = String(commandName || "menu").toLowerCase();
  const arg = String(args?.[0] || "").toLowerCase();
  const only = CAT_ALIAS[invoked] || CAT_ALIAS[arg] || (categories[arg] ? arg : null);

  const parts = [identityBox(p, user)];

  if (invoked === "allmenu" || arg === "all") {
    for (const cat of ORDER) {
      const names = commandNames(categories[cat]);
      if (names.length) parts.push(box(`${CAT_TITLE[cat]} MENU`, names.map((n) => `${p}${n}`)));
    }
  } else if (only) {
    const names = commandNames(categories[only]);
    parts.push(
      box(
        `${CAT_TITLE[only] || only.toUpperCase()} MENU`,
        names.length ? names.map((n) => `${p}${n}`) : ["(belum ada command)"]
      )
    );
  } else {
    parts.push(box("MAIN MENU", commandNames(categories.main).map((n) => `${p}${n}`)));
    parts.push(box("MENU LAINNYA", OTHER_ROWS.map((row) => `${p}${row.id}`)));
  }

  parts.push("Zenyn v1.0");
  const text = parts.join("\n\n");
  const footer = `Zenyn Bot • ${Object.keys(commands).length} command\n👥 wajib grup · 🔒 owner · 💎 premium`;

  // .allmenu: tombol cuma link (URL), tanpa list
  const buttons = invoked === "allmenu" ? [ctaButton()].filter(Boolean) : buildButtons(user, message, categories);

  try {
    if (!buttons.length) {
      return await client.sendMessage(sender, { text: `${text}\n\n${footer}` }, { quoted: message });
    }
    return await client.sendInteractiveMessage(
      sender,
      { text, tip: footer, interactiveButtons: buttons },
      { quoted: message }
    );
  } catch (err) {
    logger.error("Error sending menu:", err);
    return await client.sendMessage(sender, { text: `${text}\n\n${footer}` }, { quoted: message }).catch(() => {});
  }
};

module.exports = {
  name: "menu",
  command: [
    "menu",
    "help",
    "allmenu",
    "mainmenu",
    "ownermenu",
    "toolmenu",
    "downloadermenu",
    "rpgmenu",
    "storemenu",
    "funmenu",
    "infomenu",
    "gatewaymenu",
    "bugmenu"
  ],
  category: "main",
  description: "Tampilkan menu & bantuan",
  visible: true,
  execute: execute,
  _internal: { box, commandNames, CAT_ALIAS, OTHER_ROWS, greetEn }
};
