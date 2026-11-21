// lib/fakeff.js — kartu profil FF palsu dari template lokal (canvas, tanpa API).
const path = require("path");
const crypto = require("crypto");
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

const DIR = path.join(__dirname, "../assets/fakeff");
const FONT = path.join(__dirname, "../assets/fonts/NotoSans-Regular.ttf");
const ALIAS = "FFName";
const GOLD = "#E6C480";
const SCALE_X = 0.74;
const MIN_SIZE = 16;
const MIN_SCALE = 0.5;
const MAX_NAME = 24;

// cx/cy = pusat slot nama; size = ukuran font dasar; cap = tinggi huruf acuan
const TEMPLATES = [
  { file: "ff1.jpg", cx: 402, cy: 1043, size: 35, cap: 25, maxW: 330 },
  { file: "ff2.jpg", cx: 360, cy: 1038, size: 35, cap: 25, maxW: 330 },
  { file: "ff3.jpg", cx: 400, cy: 1046, size: 35, cap: 25, maxW: 330 },
  { file: "ff4.jpg", cx: 361, cy: 1038, size: 35, cap: 25, maxW: 330 },
  { file: "ff5.jpg", cx: 372, cy: 1040, size: 35, cap: 25, maxW: 330 },
  { file: "ff6.jpg", cx: 376, cy: 1040, size: 35, cap: 25, maxW: 330 },
  { file: "ff7.jpg", cx: 414, cy: 1043, size: 35, cap: 25, maxW: 330 },
  { file: "pin1.jpg", cx: 616, cy: 1528, size: 52, cap: 37, maxW: 380 },
  { file: "pin2.jpg", cx: 593, cy: 1528, size: 52, cap: 37, maxW: 380 },
  { file: "pin3.jpg", cx: 594, cy: 1528, size: 52, cap: 37, maxW: 380 }
];

let ready = false;
const ensureFont = () => {
  if (ready) return;
  try {
    GlobalFonts.registerFromPath(FONT, ALIAS);
  } catch {
    /* pakai font sistem kalau gagal */
  }
  ready = true;
};

const hash = (value) => crypto.createHash("sha256").update(String(value)).digest().readUInt32BE(0);
const cleanName = (name) => String(name || "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
const pickTemplate = (name) => TEMPLATES[hash(name) % TEMPLATES.length];

// turunkan ukuran font dulu, lalu rapatkan huruf, terakhir potong dengan …
const fitText = (ctx, text, maxW, baseSize) => {
  for (let size = baseSize; size >= MIN_SIZE; size--) {
    ctx.font = `${size}px ${ALIAS}`;
    if (ctx.measureText(text).width * SCALE_X <= maxW) return { size, scale: SCALE_X, text };
  }

  ctx.font = `${MIN_SIZE}px ${ALIAS}`;
  for (let scale = SCALE_X - 0.04; scale >= MIN_SCALE - 0.001; scale -= 0.04) {
    if (ctx.measureText(text).width * scale <= maxW) return { size: MIN_SIZE, scale, text };
  }

  let cut = text;
  while (cut.length > 3 && ctx.measureText(cut + "…").width * MIN_SCALE > maxW) cut = cut.slice(0, -1);
  return { size: MIN_SIZE, scale: MIN_SCALE, text: cut + "…" };
};

const renderFakeFF = async (rawName, { template } = {}) => {
  ensureFont();
  const name = cleanName(rawName);
  if (!name) throw new Error("Nama tidak boleh kosong.");

  const tpl = (template && TEMPLATES.find((t) => t.file === template)) || pickTemplate(name);
  const img = await loadImage(path.join(DIR, tpl.file));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const fitted = fitText(ctx, name, tpl.maxW, tpl.size);
  const textWidth = Math.round(ctx.measureText(fitted.text).width * fitted.scale);

  ctx.save();
  ctx.translate(tpl.cx, tpl.cy);
  ctx.scale(fitted.scale, 1);
  ctx.font = `${fitted.size}px ${ALIAS}`;
  const metrics = ctx.measureText(fitted.text);
  const ascent = metrics.actualBoundingBoxAscent || fitted.size * 0.72;
  ctx.fillStyle = GOLD;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fitted.text, 0, ascent / 2);
  ctx.restore();

  return {
    buffer: await canvas.encode("jpeg", 95),
    template: tpl.file,
    width: img.width,
    height: img.height,
    text: fitted.text,
    size: fitted.size,
    scale: fitted.scale,
    textWidth
  };
};

module.exports = { TEMPLATES, MAX_NAME, MIN_SIZE, MIN_SCALE, cleanName, pickTemplate, fitText, renderFakeFF };
