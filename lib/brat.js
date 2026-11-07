const sharp = require("sharp");

const SIZE = 512;
const PAD = 14;
const AVG_CHAR_RATIO = 0.52;
const LINE_RATIO = 1.06;
const MAX_TEXT = 200;

const escapeXml = (s) =>
  String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

const splitLongWord = (word, maxChars, out) => {
  let w = word;
  while (w.length > maxChars) {
    out.push(w.slice(0, maxChars));
    w = w.slice(maxChars);
  }
  return w;
};

const wrap = (text, maxChars) => {
  const lines = [];
  let cur = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!cur) {
      cur = splitLongWord(word, maxChars, lines);
    } else if ((cur + " " + word).length <= maxChars) {
      cur += " " + word;
    } else {
      lines.push(cur);
      cur = splitLongWord(word, maxChars, lines);
    }
  }

  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
};

const fitText = (text) => {
  const availW = SIZE - PAD * 2;
  const availH = SIZE - PAD * 2;

  for (let fontSize = 190; fontSize >= 18; fontSize -= 1) {
    const maxChars = Math.max(1, Math.floor(availW / (fontSize * AVG_CHAR_RATIO)));
    const lines = wrap(text, maxChars);
    const blockH = lines.length * fontSize * LINE_RATIO;
    const widest = lines.reduce((m, l) => Math.max(m, l.length), 1) * fontSize * AVG_CHAR_RATIO;

    if (blockH <= availH && widest <= availW + fontSize * 0.1) {
      return { fontSize, lines };
    }
  }

  return { fontSize: 18, lines: wrap(text, Math.floor(availW / (18 * AVG_CHAR_RATIO))) };
};

const buildSvg = (text, { fontSize, lines }) => {
  const lineH = fontSize * LINE_RATIO;
  const blockH = lines.length * lineH;
  const startY = SIZE / 2 - blockH / 2 + lineH / 2;

  const tspans = lines
    .map((line, i) => `<tspan x="${SIZE / 2}" y="${(startY + i * lineH).toFixed(1)}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>
  <text text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif" font-weight="500" font-size="${fontSize}" fill="#000000">${tspans}</text>
</svg>`;
};

const renderBrat = async (input) => {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Teks kosong");
  if (text.length > MAX_TEXT) throw new Error(`Teks maksimal ${MAX_TEXT} karakter`);

  const layout = fitText(text);
  const svg = buildSvg(text, layout);

  const png = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  const stats = await sharp(png).stats();
  const darkest = Math.min(...stats.channels.map((c) => c.min));
  if (darkest > 200) {
    throw new Error("Render teks gagal (font tidak tersedia di server)");
  }

  return sharp(png)
    .blur(0.55)
    .png()
    .toBuffer();
};

module.exports = { renderBrat, SIZE, MAX_TEXT };
