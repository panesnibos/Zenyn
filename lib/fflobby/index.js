// lib/fflobby/index.js — fake FF lobby card (vendor dari paket x-fake-ff, MIT).
// Diubah: jumlah lobby dihitung dari isi folder, kanvas 1080x1920.
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs");

const ASSETS_DIR = path.join(__dirname, "assets");
const LOBBY_DIR = path.join(ASSETS_DIR, "lobby");
const FONT_PATH = path.join(ASSETS_DIR, "fonts", "TeutonNormal.otf");

const lobbyNumbers = () =>
  fs
    .readdirSync(LOBBY_DIR)
    .filter((f) => /\.jpe?g$/i.test(f))
    .map((f) => parseInt(f, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

const getLobbyPath = (num) => path.join(LOBBY_DIR, `${num}.jpg`);

const config = {
  canvas: { width: 1080, height: 1920 },
  username: {
    a: 1491,
    b: 1569,
    c: 409,
    d: 742,
    centerX: 568,
    fontSize: 48,
    maxChars: 20
  },
  debug: false
};

let fontReady = false;
const loadFont = () => {
  if (fontReady) return;
  if (!fs.existsSync(FONT_PATH)) throw new Error(`Font tidak ditemukan: ${FONT_PATH}`);
  GlobalFonts.registerFromPath(FONT_PATH, "TeutonNormal");
  fontReady = true;
};

const drawGradientUsername = (ctx, username, cfg) => {
  const { a, b, c, d, fontSize, maxChars } = cfg;
  const name = String(username || "Player").slice(0, maxChars);
  const boxW = d - c;
  const boxH = b - a;
  const cx = cfg.centerX ?? c + boxW / 2;

  let size = fontSize;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  while (size > 12) {
    ctx.font = `${size}px TeutonNormal`;
    if (ctx.measureText(name).width <= boxW) break;
    size -= 1;
  }

  ctx.font = `${size}px TeutonNormal`;
  const centerY = a + boxH / 2;
  const textW = ctx.measureText(name).width;

  const grad = ctx.createLinearGradient(cx - textW / 2, centerY, cx + textW / 2, centerY);
  grad.addColorStop(0.0, "#FFFDE7");
  grad.addColorStop(0.35, "#FFE57F");
  grad.addColorStop(0.7, "#FFB300");
  grad.addColorStop(1.0, "#FF8F00");

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = grad;
  ctx.fillText(name, cx, centerY);
  ctx.restore();
};

const generateFF = async ({ username = "Player", lobby = null, outputDir = "./" } = {}) => {
  loadFont();

  const numbers = lobbyNumbers();
  if (!numbers.length) throw new Error("Aset lobby kosong.");
  const lobbyNum = lobby ? Math.max(numbers[0], Math.min(Number(lobby) || numbers[0], numbers[numbers.length - 1])) : numbers[Math.floor(Math.random() * numbers.length)];

  const lobbyPath = getLobbyPath(lobbyNum);
  if (!fs.existsSync(lobbyPath)) throw new Error(`Lobby ${lobbyNum} tidak ditemukan.`);

  const { width, height } = config.canvas;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const lobbyImg = await loadImage(lobbyPath);
  ctx.drawImage(lobbyImg, 0, 0, width, height);
  drawGradientUsername(ctx, username, config.username);
  if (config.debug) config.debugFn?.(ctx, config.username);

  const buffer = await canvas.encode("jpeg", 92);

  const outputFolder = path.join(outputDir, "fake-ff");
  fs.mkdirSync(outputFolder, { recursive: true });
  const outputPath = path.join(outputFolder, `${username}.jpg`);
  fs.writeFileSync(outputPath, buffer);

  return { status: "success", code: 200, username, lobby: lobbyNum, result: outputPath };
};

module.exports = generateFF;
module.exports.generateFF = generateFF;
module.exports.config = config;
module.exports.lobbyNumbers = lobbyNumbers;
module.exports.lobbyCount = () => lobbyNumbers().length;
