const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

const FONT_DIR = path.join(__dirname, "../assets/fonts");
const FONTS = [
  ["NotoSans-Regular.ttf", "Noto"],
  ["NotoSans-SemiBold.ttf", "NotoSemi"],
  ["NotoSans-Bold.ttf", "NotoBold"]
];

let fontsReady = false;
const ensureFonts = () => {
  if (fontsReady) return;
  for (const [file, family] of FONTS) {
    const filePath = path.join(FONT_DIR, file);
    try {
      if (fs.existsSync(filePath)) GlobalFonts.registerFromPath(filePath, family);
    } catch {
      /* abaikan, pakai font sistem kalau ada */
    }
  }
  fontsReady = true;
};

// Ikon vektor (24x24, gaya Feather/MIT). Emoji tak render di Skia.
const ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  crown: '<path d="M3 7l4 4 5-6 5 6 4-4v11H3z"/>',
  chevron: '<polyline points="6 9 12 15 18 9"/>'
};

const FILLED = new Set(["crown", "zap"]);

const iconSvg = (name, color) => {
  const inner = ICONS[name] || ICONS.grid;
  const fill = FILLED.has(name) ? color : "none";
  const stroke = FILLED.has(name) ? "none" : color;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
};

const iconCache = new Map();
const getIcon = async (name, color) => {
  const key = `${name}|${color}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const img = await loadImage(Buffer.from(iconSvg(name, color)));
  iconCache.set(key, img);
  return img;
};

const roundRect = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

const fillRound = (ctx, x, y, w, h, r, style) => {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = style;
  ctx.fill();
};

const strokeRound = (ctx, x, y, w, h, r, style, width = 1) => {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
};

const fitText = (ctx, text, family, size, maxWidth) => {
  let s = size;
  ctx.font = `${s}px ${family}`;
  while (s > 12 && ctx.measureText(text).width > maxWidth) {
    s -= 1;
    ctx.font = `${s}px ${family}`;
  }
  return s;
};

const drawIconAt = async (ctx, name, color, x, y, size) => {
  const img = await getIcon(name, color);
  ctx.drawImage(img, x, y, size, size);
};

const circleImage = async (buffer, size) => {
  const img = await loadImage(buffer);
  const cv = createCanvas(size, size);
  const cx = cv.getContext("2d");
  cx.beginPath();
  cx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  cx.closePath();
  cx.clip();
  cx.drawImage(img, 0, 0, size, size);
  return cv;
};

const drawStat = async (ctx, x, y, w, h, iconName, color, text) => {
  fillRound(ctx, x, y, w, h, h / 2, "rgba(255,255,255,0.06)");
  strokeRound(ctx, x, y, w, h, h / 2, "rgba(255,255,255,0.09)", 1);

  const iconSize = 30;
  await drawIconAt(ctx, iconName, color, x + 26, y + (h - iconSize) / 2, iconSize);

  ctx.fillStyle = "#e9eaff";
  ctx.font = "26px NotoSemi";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 68, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
};

const renderMenu = async (data = {}) => {
  ensureFonts();

  const W = 720;
  const S = 2;
  const pad = 40;
  const innerW = W - pad * 2;

  const cats = Array.isArray(data.categories) ? data.categories : [];
  const cols = 3;
  const gap = 20;
  const tileW = Math.floor((innerW - gap * (cols - 1)) / cols);
  const tileH = 176;
  const gridTop = 664;
  const rows = Math.max(1, Math.ceil(cats.length / cols));
  const gridH = rows * tileH + (rows - 1) * gap;
  const H = gridTop + gridH + 120;

  const canvas = createCanvas(W * S, H * S);
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#171733");
  bg.addColorStop(1, "#0a0a16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 250, 30, W / 2, 250, 460);
  glow.addColorStop(0, "rgba(124,58,237,0.38)");
  glow.addColorStop(1, "rgba(124,58,237,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 760);

  // Search bar
  fillRound(ctx, pad, pad, innerW, 76, 28, "rgba(255,255,255,0.06)");
  strokeRound(ctx, pad, pad, innerW, 76, 28, "rgba(255,255,255,0.08)", 1);
  await drawIconAt(ctx, "search", "#9aa0c0", pad + 26, pad + 23, 30);
  ctx.fillStyle = "#868cb0";
  ctx.font = "28px Noto";
  ctx.textAlign = "left";
  ctx.fillText("Cari fitur...", pad + 70, pad + 49);

  // Profile card
  const cardX = pad;
  const cardY = 140;
  const cardW = innerW;
  const cardH = 300;
  const card = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  card.addColorStop(0, "#5b4bd6");
  card.addColorStop(1, "#332a78");
  fillRound(ctx, cardX, cardY, cardW, cardH, 34, card);
  strokeRound(ctx, cardX, cardY, cardW, cardH, 34, "rgba(255,255,255,0.14)", 1);

  // aksen atas
  const accent = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
  accent.addColorStop(0, "#f472b6");
  accent.addColorStop(1, "#8b5cf6");
  fillRound(ctx, cardX + 26, cardY - 5, cardW - 52, 10, 5, accent);

  // Avatar
  const avatarSize = 124;
  const avatarX = cardX + 30;
  const avatarY = cardY + (cardH - avatarSize) / 2 - 10;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  try {
    if (data.avatar?.length) {
      const av = await circleImage(data.avatar, avatarSize);
      ctx.drawImage(av, avatarX, avatarY, avatarSize, avatarSize);
    } else {
      throw new Error("no avatar");
    }
  } catch {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    await drawIconAt(ctx, "user", "rgba(255,255,255,0.85)", avatarX + 30, avatarY + 30, avatarSize - 60);
    ctx.restore();
  }

  const textX = avatarX + avatarSize + 26;
  const maxTextW = cardX + cardW - 30 - textX;

  ctx.textAlign = "left";
  ctx.fillStyle = "#d7d9ff";
  ctx.font = "26px NotoSemi";
  ctx.fillText(data.greeting || "Selamat Malam", textX, cardY + 74);

  const nameSize = fitText(ctx, data.name || "Player", "NotoBold", 44, maxTextW);
  ctx.fillStyle = "#ffffff";
  ctx.font = `${nameSize}px NotoBold`;
  ctx.fillText(data.name || "Player", textX, cardY + 130);

  // Pill LV
  const lvText = `LV ${data.level ?? 0}`;
  ctx.font = "24px NotoBold";
  const lvW = ctx.measureText(lvText).width + 40;
  const lvGrad = ctx.createLinearGradient(textX, 0, textX + lvW, 0);
  lvGrad.addColorStop(0, "#3b82f6");
  lvGrad.addColorStop(1, "#60a5fa");
  fillRound(ctx, textX, cardY + 150, lvW, 40, 20, lvGrad);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(lvText, textX + 20, cardY + 178);

  // Role
  await drawIconAt(ctx, data.roleIcon || "user", "#c7c9ef", textX, cardY + 206, 26);
  ctx.fillStyle = "#c7c9ef";
  ctx.font = "24px NotoSemi";
  ctx.fillText(data.role || "Member · Grup", textX + 36, cardY + 227);

  // Level / EXP
  ctx.fillStyle = "#e3e4ff";
  ctx.font = "23px NotoSemi";
  ctx.textAlign = "left";
  ctx.fillText(`Level ${data.level ?? 0}`, cardX + 32, cardY + 268);

  ctx.textAlign = "right";
  ctx.fillStyle = "#c9cbf0";
  ctx.fillText(
    `${data.expPct ?? 0}%  ·  ${data.expText || "-"}`,
    cardX + cardW - 32,
    cardY + 268
  );

  const barX = cardX + 32;
  const barY = cardY + 282;
  const barW = cardW - 64;
  const barH = 14;
  fillRound(ctx, barX, barY, barW, barH, 7, "rgba(255,255,255,0.18)");
  const pct = Math.max(0, Math.min(100, Number(data.expPct) || 0)) / 100;
  if (pct > 0) {
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, "#facc15");
    barGrad.addColorStop(1, "#f59e0b");
    fillRound(ctx, barX, barY, Math.max(barH, barW * pct), barH, 7, barGrad);
  }

  // Stat pills
  const statW = Math.floor((innerW - gap) / 2);
  const statH = 78;
  const statY1 = 470;
  const statY2 = statY1 + statH + gap;
  const colX = [pad, pad + statW + gap];

  await drawStat(ctx, colX[0], statY1, statW, statH, "zap", "#22c55e", data.uptime || "-");
  await drawStat(ctx, colX[1], statY1, statW, statH, "clock", "#60a5fa", data.clock || "-");
  await drawStat(ctx, colX[0], statY2, statW, statH, "grid", "#a78bfa", `${data.totalFitur ?? 0} fitur`);
  await drawStat(ctx, colX[1], statY2, statW, statH, "users", "#f59e0b", `${data.totalUser ?? 0} user`);

  // Category tiles
  for (let i = 0; i < cats.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (tileW + gap);
    const y = gridTop + row * (tileH + gap);
    const cat = cats[i];

    fillRound(ctx, x, y, tileW, tileH, 28, "rgba(255,255,255,0.06)");
    strokeRound(ctx, x, y, tileW, tileH, 28, "rgba(255,255,255,0.09)", 1);

    const iconSize = 72;
    ctx.save();
    const tileGrad = ctx.createLinearGradient(x, y, x, y + tileH);
    tileGrad.addColorStop(0, `${cat.color}40`);
    tileGrad.addColorStop(1, "rgba(255,255,255,0)");
    fillRound(ctx, x, y, tileW, tileH, 28, tileGrad);
    ctx.restore();

    await drawIconAt(ctx, cat.icon || "grid", cat.color || "#818cf8", x + (tileW - iconSize) / 2, y + 34, iconSize);

    ctx.textAlign = "center";
    ctx.fillStyle = "#eef0ff";
    const label = String(cat.label || cat.key || "");
    const labelSize = fitText(ctx, label, "NotoSemi", 26, tileW - 20);
    ctx.font = `${labelSize}px NotoSemi`;
    ctx.fillText(label, x + tileW / 2, y + 150);
  }

  // Chevron bawah
  const cyY = H - 66;
  ctx.beginPath();
  ctx.arc(W / 2, cyY, 28, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  await drawIconAt(ctx, "chevron", "#c7c9ef", W / 2 - 16, cyY - 16, 32);

  const png = canvas.toBuffer("image/png");
  return await sharp(png).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
};

module.exports = { renderMenu, ensureFonts };
