const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");

let ready = false;
const ensureFonts = () => {
  if (ready) return;
  GlobalFonts.registerFromPath(path.join(__dirname, "../assets/fonts/NotoSans-Regular.ttf"), "QuoteNoto");
  GlobalFonts.registerFromPath(path.join(__dirname, "../assets/fonts/NotoSans-Bold.ttf"), "QuoteBold");
  ready = true;
};

const MAX_TEXT = 500;
const W = 900;
const PAD = 56;
const BUBBLE_PAD = 34;
const LINE_H = 50;

const wrap = (ctx, value, width) => {
  const lines = [];
  for (const paragraph of String(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width <= width) { line = next; continue; }
      if (line) lines.push(line);
      line = "";
      let chunk = "";
      for (const char of [...word]) {
        if (ctx.measureText(chunk + char).width > width && chunk) { lines.push(chunk); chunk = ""; }
        chunk += char;
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
};

const normalize = (input) =>
  String(input || "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const clock = (date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(date)
    .replace(":", ".");

const paintBackground = (ctx, w, h) => {
  ctx.fillStyle = "#eef1f7";
  ctx.fillRect(0, 0, w, h);
  const blobs = [
    [0.15, 0.12, "#cfe3ff"],
    [0.88, 0.25, "#fbd7ec"],
    [0.2, 0.92, "#d8f2e4"],
    [0.95, 0.9, "#e6ddff"],
  ];
  for (const [fx, fy, color] of blobs) {
    const cx = w * fx;
    const cy = h * fy;
    const r = Math.max(w, h) * 0.55;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
};

// iOS-style fake quote: white bubble on a soft mesh gradient, no external API.
const renderQuote = async (input, name) => {
  const text = normalize(input);
  if (!text) throw new Error("Teks kosong");
  if (text.length > MAX_TEXT) throw new Error(`Teks maksimal ${MAX_TEXT} karakter`);

  ensureFonts();
  const sender = String(name || "").trim().slice(0, 32);

  const probe = createCanvas(10, 10).getContext("2d");
  probe.font = "38px QuoteNoto";
  const textW = W - PAD * 2 - BUBBLE_PAD * 2;
  const lines = wrap(probe, text, textW);

  const headH = sender ? 40 : 0;
  const metaH = 40;
  const bubbleH = BUBBLE_PAD + headH + lines.length * LINE_H + metaH + BUBBLE_PAD - 12;
  const H = bubbleH + PAD * 2;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  paintBackground(ctx, W, H);

  const bx = PAD;
  const by = PAD;
  const bw = W - PAD * 2;

  ctx.save();
  ctx.shadowColor = "rgba(20, 28, 45, 0.16)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, bx, by, bw, bubbleH, 40);
  ctx.fill();
  ctx.restore();

  // tail
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(bx + 44, by + bubbleH - 4);
  ctx.lineTo(bx + 34, by + bubbleH + 22);
  ctx.lineTo(bx + 82, by + bubbleH - 4);
  ctx.closePath();
  ctx.fill();

  let y = by + BUBBLE_PAD + 26;
  if (sender) {
    ctx.font = "26px QuoteBold";
    ctx.fillStyle = "#8b9099";
    ctx.fillText(sender, bx + BUBBLE_PAD, y);
    y += headH;
  }

  ctx.font = "38px QuoteNoto";
  ctx.fillStyle = "#12141a";
  for (const line of lines) {
    ctx.fillText(line, bx + BUBBLE_PAD, y);
    y += LINE_H;
  }

  ctx.font = "24px QuoteNoto";
  ctx.fillStyle = "#a0a5ae";
  ctx.fillText(`${clock(new Date())} WIB · Diteruskan`, bx + BUBBLE_PAD, by + bubbleH - BUBBLE_PAD + 6);

  return canvas.encode("png");
};

module.exports = { renderQuote, MAX_TEXT, W };
