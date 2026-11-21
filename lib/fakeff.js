// lib/fakeff.js — kartu profil FF palsu dari template lokal (canvas, tanpa API).
const path = require("path");
const crypto = require("crypto");
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

const DIR = path.join(__dirname, "../assets/fakeff");
const FONT = path.join(__dirname, "../assets/fonts/NotoSans-Regular.ttf");
const ALIAS = "FFName";
const GOLD = "#E6C480";
const SCALE_X = 0.74;
const MAX_NAME = 20;

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

const renderFakeFF = async (rawName, { template } = {}) => {
  ensureFont();
  const name = cleanName(rawName);
  if (!name) throw new Error("Nama tidak boleh kosong.");

  const tpl = (template && TEMPLATES.find((t) => t.file === template)) || pickTemplate(name);
  const img = await loadImage(path.join(DIR, tpl.file));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  ctx.save();
  ctx.translate(tpl.cx, tpl.cy + tpl.cap / 2);
  ctx.scale(SCALE_X, 1);

  let size = tpl.size;
  for (; size >= 12; size--) {
    ctx.font = `${size}px ${ALIAS}`;
    if (ctx.measureText(name).width <= tpl.maxW / SCALE_X) break;
  }

  ctx.font = `${size}px ${ALIAS}`;
  ctx.fillStyle = GOLD;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(name, 0, 0);
  ctx.restore();

  return {
    buffer: await canvas.encode("jpeg", 95),
    template: tpl.file,
    width: img.width,
    height: img.height
  };
};

module.exports = { TEMPLATES, MAX_NAME, cleanName, pickTemplate, renderFakeFF };
