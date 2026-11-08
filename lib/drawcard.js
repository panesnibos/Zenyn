const path = require("path");
const sharp = require("sharp");
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

let ready = false;
const ensureFonts = () => {
  if (ready) return;
  GlobalFonts.registerFromPath(path.join(__dirname, "../assets/fonts/NotoSans-Regular.ttf"), "FunNoto");
  GlobalFonts.registerFromPath(path.join(__dirname, "../assets/fonts/NotoSans-Bold.ttf"), "FunBold");
  ready = true;
};

const wrap = (ctx, value, width) => {
  const lines = [];
  for (const paragraph of String(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      for (const char of [...word]) {
        if (ctx.measureText(line + char).width > width && line) { lines.push(line); line = ""; }
        line += char;
      }
      if (ctx.measureText(line + " ").width > width) { lines.push(line); line = ""; }
      else line += " ";
    }
    lines.push(line.trimEnd());
  }
  return lines;
};

const fit = (ctx, text, width, height, initial = 36, family = "FunNoto") => {
  for (let size = initial; size >= 12; size--) {
    ctx.font = `${size}px ${family}`;
    const lines = wrap(ctx, text, width);
    if (lines.length * size * 1.5 <= height) return { lines, size };
  }
  throw new Error("Teks terlalu panjang untuk kartu.");
};

const renderCard = async ({ title, text, subtitle = "Zenyn • Just for fun", score }) => {
  ensureFonts();
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 800, 600);
  gradient.addColorStop(0, "#191537"); gradient.addColorStop(1, "#383779");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = "#aaa5ff"; ctx.fillRect(48, 55, 65, 5);
  ctx.fillStyle = "#d8d6ff"; ctx.font = "28px FunBold";
  ctx.fillText(String(title).slice(0, 50), 48, 112);
  const hasScore = Number.isFinite(score);
  const { lines, size } = fit(ctx, String(text).slice(0, 1200), 704, hasScore ? 210 : 335);
  ctx.font = `${size}px FunNoto`; ctx.fillStyle = "#ffffff";
  lines.forEach((line, i) => ctx.fillText(line, 48, 180 + i * size * 1.5));
  if (hasScore) {
    const value = Math.min(100, Math.max(0, score));
    ctx.font = "64px FunBold"; ctx.fillText(`${value}%`, 48, 466);
    ctx.fillStyle = "#555079"; ctx.fillRect(48, 487, 704, 14);
    ctx.fillStyle = "#a4a0ff"; ctx.fillRect(48, 487, 704 * value / 100, 14);
  }
  ctx.font = "19px FunNoto"; ctx.fillStyle = "#bebddd";
  ctx.fillText(String(subtitle).slice(0, 80), 48, 558);
  return canvas.encode("png");
};

const renderMeme = async (buffer, top, bottom) => {
  ensureFonts();
  // Decode with a pixel limit and flatten the first frame before handing it to canvas.
  const safe = await sharp(buffer, { limitInputPixels: 25000000 })
    .rotate().resize(512, 512, { fit: "cover" }).png().toBuffer();
  const image = await loadImage(safe);
  const canvas = createCanvas(512, 512);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, 512, 512);
  for (const [text, atTop] of [[top, true], [bottom, false]]) {
    if (!text) continue;
    const { lines, size } = fit(ctx, text.toUpperCase(), 464, 170, 48, "FunBold");
    ctx.font = `${size}px FunBold`; ctx.textAlign = "center";
    ctx.textBaseline = "top"; ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = "#000000"; ctx.fillStyle = "#ffffff";
    const start = atTop ? 20 : 492 - lines.length * size * 1.5;
    lines.forEach((line, i) => {
      const y = start + i * size * 1.5;
      ctx.strokeText(line, 256, y); ctx.fillText(line, 256, y);
    });
  }
  return canvas.encode("png");
};

module.exports = { renderCard, renderMeme };
