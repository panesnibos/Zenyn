// Fake quote chat ala iPhone (WhatsApp dark), port lokal dari layout
// 3scode/iqc-generator (QuoteCard 440x956). Tanpa headless browser: semua
// digambar pakai @napi-rs/canvas, hanya ikon emoji yang diambil dari CDN.
const path = require("path");
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

const S = 2; // render 2x untuk ketajaman (880x1912)
const W = 440;
const H = 956;
const MAX_TEXT = 400;
const FONT = { text: "QuoteReg", bold: "QuoteBold", semi: "QuoteSemi" };

let ready = false;
const ensureFonts = () => {
  if (ready) return;
  const dir = path.join(__dirname, "../assets/fonts");
  GlobalFonts.registerFromPath(path.join(dir, "NotoSans-Regular.ttf"), FONT.text);
  GlobalFonts.registerFromPath(path.join(dir, "NotoSans-Bold.ttf"), FONT.bold);
  GlobalFonts.registerFromPath(path.join(dir, "NotoSans-SemiBold.ttf"), FONT.semi);
  ready = true;
};

const C = {
  bgFrom: "#1a1a2e",
  bgTo: "#16213e",
  sent: "#075E54",
  recv: "#1C1C1E",
  text: "#FFFFFF",
  time: "rgba(142,142,147,0.65)",
  status: "#F2F2F7",
  sub: "#8E8E93",
  pillBg: "rgba(36,36,38,0.85)",
  pillBorder: "rgba(255,255,255,0.10)",
  menuBg: "rgba(38,38,40,0.72)",
  menuIcon: "rgba(255,255,255,0.55)",
  danger: "#FF453A",
  hair: "rgba(255,255,255,0.05)",
  ink: "rgba(255,255,255,0.06)",
};

// chat samar di belakang quote, sama seperti bgMessages di repo asal
const BG_CHAT = [
  ["Gimana kabarnya?", "in"], ["Baik banget nih", "out"], ["Syukurlah", "in"],
  ["Udah makan?", "in"], ["Belom, sibuk", "out"], ["Yaudah", "in"],
  ["Nanti aku telpon ya", "out"], ["Oke siap", "in"], ["Eh iya, aku liat story kamu", "in"],
  ["Haha iya kemarin", "out"], ["Keren sih tempatnya", "in"], ["Makasih", "out"],
  ["Besok jadi?", "in"], ["Jadi dong, jam 2 ya", "out"], ["Siap, aku jemput", "in"],
  ["Oke ditunggu", "out"], ["Oh iya, jangan lupa bawa", "in"], ["Siap boss", "out"],
  ["Udah dulu ya, mandi dulu", "out"], ["Yoi", "in"], ["Lagi dimana?", "in"],
  ["Dirumah aja", "out"], ["Mau mampir?", "in"], ["Boleh, nanti sore", "out"],
  ["Oke kabarin ya", "in"], ["Siap", "out"],
];

const EMOJIS = [
  ["\u{1F44D}", "1f44d"],
  ["\u2764\uFE0F", "2764"],
  ["\u{1F602}", "1f602"],
  ["\u{1F62E}", "1f62e"],
  ["\u{1F622}", "1f622"],
  ["\u{1F64F}", "1f64f"],
];

const emojiCache = new Map();
const emojiImage = async (code) => {
  if (emojiCache.has(code)) return emojiCache.get(code);
  let img = null;
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/gh/iamcal/emoji-data@master/img-apple-64/${code}.png`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) img = await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    img = null;
  }
  emojiCache.set(code, img);
  return img;
};

const roundRect = (ctx, x, y, w, h, r) => {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
};

const wrapText = (ctx, value, maxW) => {
  const lines = [];
  for (const paragraph of String(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width <= maxW) { line = next; continue; }
      if (line) lines.push(line);
      let chunk = "";
      for (const char of [...word]) {
        if (ctx.measureText(chunk + char).width > maxW && chunk) { lines.push(chunk); chunk = ""; }
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

// satu bubble: teks 15px + jam 12px di bawahnya, radius 20 dengan sudut ekor 4
const bubbleSize = (ctx, text, maxW) => {
  ctx.font = `15px ${FONT.text}`;
  const inner = maxW - 28;
  const lines = wrapText(ctx, text, inner);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
  return { lines, w: Math.min(maxW, Math.ceil(widest) + 30), h: lines.length * 19.5 + 30, lineH: 19.5 };
};

const drawBubble = (ctx, { text, time, type, x, y, maxW, alpha = 1, highlighted = false, label }) => {
  const size = bubbleSize(ctx, text, maxW);
  const isSent = type === "out";
  const bx = isSent ? x + maxW - size.w : x;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (label) {
    ctx.font = `12px ${FONT.text}`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(label, bx + 14, y - 3);
  }
  if (highlighted) {
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
  }
  ctx.fillStyle = isSent ? C.sent : C.recv;
  roundRect(ctx, bx, y, size.w, size.h, isSent ? [20, 20, 4, 20] : [20, 20, 20, 4]);
  ctx.fill();
  if (highlighted) {
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = C.text;
  ctx.font = `15px ${FONT.text}`;
  size.lines.forEach((line, i) => ctx.fillText(line, bx + 14, y + 8 + 15 + i * size.lineH));
  ctx.fillStyle = C.time;
  ctx.font = `12px ${FONT.text}`;
  ctx.fillText(time, bx + 14, y + size.h - 10);
  ctx.restore();
  return size;
};

const drawStatusBar = (ctx, { time, battery, carrier }) => {
  const color = battery <= 20 ? "#FFD60A" : C.status;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `17px ${FONT.semi}`;
  ctx.fillText(carrier, 28, 35);
  const cw = ctx.measureText(carrier).width;
  let sx = 28 + cw + 6;
  for (const [dy, bh, op] of [[9, 3, 0.3], [6, 6, 0.5], [3, 9, 0.75], [0, 12, 1]]) {
    ctx.globalAlpha = op;
    roundRect(ctx, sx, 23 + dy, 2.5, bh, 0.8);
    ctx.fill();
    sx += 4.5;
  }
  ctx.globalAlpha = 1;
  const wx = sx + 4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  for (const r of [4.5, 8.5]) {
    ctx.beginPath();
    ctx.arc(wx + 7, 33, r, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(wx + 7, 30, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `16px ${FONT.semi}`;
  ctx.textAlign = "center";
  ctx.fillText(time, W / 2, 35);
  ctx.textAlign = "left";
  const bx = W - 28 - 27;
  ctx.strokeStyle = battery <= 20 ? color : "rgba(242,242,247,0.4)";
  ctx.lineWidth = 1;
  roundRect(ctx, bx + 0.5, 23.5, 22, 12, 3.5);
  ctx.stroke();
  ctx.fillStyle = color;
  roundRect(ctx, bx + 2, 25, Math.max(2, (Math.min(battery, 100) / 100) * 19), 9, 1.5);
  ctx.fill();
  ctx.globalAlpha = battery <= 20 ? 1 : 0.4;
  roundRect(ctx, bx + 24, 27, 2.5, 4, 1);
  ctx.fill();
  ctx.restore();
};

const drawHeader = (ctx, name) => {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.fillRect(0, 54, W, 60);
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(38, 76);
  ctx.lineTo(28, 84);
  ctx.lineTo(38, 92);
  ctx.stroke();
  ctx.fillStyle = "#3A3A3C";
  ctx.beginPath();
  ctx.arc(62, 84, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `14px ${FONT.bold}`;
  ctx.textAlign = "center";
  ctx.fillText(String(name).charAt(0).toUpperCase(), 62, 89);
  ctx.textAlign = "left";
  ctx.font = `18px ${FONT.semi}`;
  ctx.fillText(name, 86, 82);
  ctx.fillStyle = C.sub;
  ctx.font = `13px ${FONT.text}`;
  ctx.fillText("Online", 86, 98);
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, 394, 77, 16, 12, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(412, 80);
  ctx.lineTo(420, 76);
  ctx.lineTo(420, 90);
  ctx.lineTo(412, 86);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(364, 79);
  ctx.quadraticCurveTo(377, 76, 377, 84);
  ctx.quadraticCurveTo(377, 92, 364, 89);
  ctx.stroke();
  ctx.restore();
};

const drawInputBar = (ctx) => {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, H - 50, W, 50);
  ctx.fillStyle = C.hair;
  ctx.fillRect(0, H - 50, W, 0.5);
  const cy = H - 25;
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(26, cy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(26, cy - 7);
  ctx.lineTo(26, cy + 7);
  ctx.moveTo(19, cy);
  ctx.lineTo(33, cy);
  ctx.stroke();
  ctx.fillStyle = C.ink;
  roundRect(ctx, 48, cy - 18, 344, 36, 10);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.font = `15px ${FONT.text}`;
  ctx.fillText("Pesan", 60, cy + 5);
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(W - 26, cy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.8;
  roundRect(ctx, W - 30, cy - 9, 8, 12, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W - 26, cy - 2, 8, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
};

const drawReactions = async (ctx, x, y) => {
  const px = 18;
  const gap = 12;
  const size = 34;
  const width = px * 2 + EMOJIS.length * size + (EMOJIS.length - 1) * gap + gap + size;
  const h = 64;
  ctx.save();
  ctx.fillStyle = C.pillBg;
  roundRect(ctx, x, y, width, h, 32);
  ctx.fill();
  ctx.strokeStyle = C.pillBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  let ex = x + px;
  const imgs = await Promise.all(EMOJIS.map(([, code]) => emojiImage(code)));
  for (const img of imgs) {
    if (img) ctx.drawImage(img, ex, y + (h - size) / 2, size, size);
    ex += size + gap;
  }
  const cx = ex + size / 2;
  const cy = y + h / 2;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.stroke();
  ctx.restore();
  return { width, h };
};

const MENU_ITEMS = [
  ["Beri Bintang", "star"],
  ["Balas", "reply"],
  ["Teruskan", "forward"],
  ["Salin", "copy"],
  ["Ucapkan", "chat"],
  ["Laporkan", "warn"],
  ["Hapus", "trash"],
];

const drawMenuIcon = (ctx, kind, x, y, color) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const cx = x + 11;
  const cy = y + 11;
  if (kind === "star") {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 4.6 : 10;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === "reply" || kind === "forward") {
    const dir = kind === "reply" ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + dir * 9, cy);
    ctx.lineTo(cx - dir * 9, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - dir * 3, cy - 5);
    ctx.lineTo(cx - dir * 9, cy);
    ctx.lineTo(cx - dir * 3, cy + 5);
    ctx.stroke();
  } else if (kind === "copy") {
    roundRect(ctx, cx - 4, cy - 9, 11, 11, 2);
    ctx.stroke();
    roundRect(ctx, cx - 8, cy - 4, 11, 11, 2);
    ctx.stroke();
  } else if (kind === "chat") {
    roundRect(ctx, cx - 9, cy - 8, 18, 13, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy + 5);
    ctx.lineTo(cx - 5, cy + 10);
    ctx.lineTo(cx + 2, cy + 5);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "warn") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx + 10, cy + 8);
    ctx.lineTo(cx - 10, cy + 8);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3);
    ctx.lineTo(cx, cy + 2);
    ctx.moveTo(cx, cy + 4.5);
    ctx.lineTo(cx, cy + 5);
    ctx.stroke();
  } else if (kind === "trash") {
    roundRect(ctx, cx - 7, cy - 5, 14, 13, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 7);
    ctx.lineTo(cx + 9, cy - 7);
    ctx.moveTo(cx - 3, cy - 9);
    ctx.lineTo(cx + 3, cy - 9);
    ctx.stroke();
  }
  ctx.restore();
};

const drawContextMenu = (ctx, x, y) => {
  const w = 300;
  const rowH = 48;
  const h = rowH * MENU_ITEMS.length;
  ctx.save();
  ctx.fillStyle = C.menuBg;
  roundRect(ctx, x, y, w, h, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 0.5;
  ctx.stroke();
  MENU_ITEMS.forEach(([label, icon], i) => {
    const top = y + i * rowH;
    if (i) {
      ctx.fillStyle = C.hair;
      ctx.fillRect(x + 14, top, w - 26, 0.5);
    }
    const danger = label === "Hapus";
    ctx.fillStyle = danger ? C.danger : "#FFFFFF";
    ctx.font = `16px ${FONT.text}`;
    ctx.fillText(label, x + 14, top + rowH / 2 + 6);
    drawMenuIcon(ctx, icon, x + w - 12 - 22, top + rowH / 2 - 11, danger ? C.danger : C.menuIcon);
  });
  ctx.restore();
  return { w, h };
};

const paintBackground = (ctx) => {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, C.bgFrom);
  g.addColorStop(1, C.bgTo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
};

const paintBackdropChat = (ctx, time) => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 54, W, H - 54);
  ctx.clip();
  ctx.filter = "blur(5px)";
  let y = 64;
  for (const [text, type] of BG_CHAT) {
    if (y > H - 20) break;
    const size = drawBubble(ctx, { text, time, type, x: 16, y, maxW: 343, alpha: 0.55 });
    y += size.h + 2;
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.375)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
};

const clock = () =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date())
    .replace(":", ".");

const renderQuote = async (input, options = {}) => {
  const text = normalize(input);
  if (!text) throw new Error("Teks kosong");
  if (text.length > MAX_TEXT) throw new Error(`Teks maksimal ${MAX_TEXT} karakter`);

  ensureFonts();
  const contact = String(options.contact || "Zenyn").trim().slice(0, 24) || "Zenyn";
  const type = options.outgoing ? "out" : "in";
  const time = options.time || clock();
  const battery = Number.isFinite(options.battery) ? options.battery : 85;
  const carrier = String(options.carrier || "Axis").slice(0, 12);

  const canvas = createCanvas(W * S, H * S);
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);

  paintBackground(ctx);
  paintBackdropChat(ctx, time);
  drawStatusBar(ctx, { time, battery, carrier });
  drawHeader(ctx, contact);
  drawInputBar(ctx);

  const maxW = 343;
  const probe = bubbleSize(ctx, text, maxW);
  const pillX = type === "out" ? W - 16 - 346 : 16;
  const menuX = type === "out" ? W - 16 - 300 : 16;

  const blockH = 64 + 6 + probe.h + 6 + MENU_ITEMS.length * 48;
  const areaTop = 114;
  const areaBottom = H - 50;
  let top = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2);
  if (top + blockH > areaBottom) top = Math.max(areaTop + 4, areaBottom - blockH);

  await drawReactions(ctx, pillX, top);
  const bubbleY = top + 64 + 6;
  drawBubble(ctx, { text, time, type, x: 16, y: bubbleY, maxW, highlighted: true });
  drawContextMenu(ctx, menuX, bubbleY + probe.h + 6);

  return canvas.encode("png");
};

module.exports = { renderQuote, MAX_TEXT, W, H };
