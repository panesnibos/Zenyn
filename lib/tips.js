const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const { stamp } = require("./stamp");

let tips = [];

try {
  let raw = fs.readFileSync(path.join(__dirname, "../database/tips.json"), "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  tips = JSON.parse(raw);
} catch {
  logger.warn("tips.json error");
}

const getRandomTip = (prefix = ".") => {
  if (!Array.isArray(tips) || !tips.length) return "💡 Tip: Selamat bermain!";
  const tip = tips[Math.floor(Math.random() * tips.length)].replace(/\{p\}/g, prefix);
  return `💡 Tip: ${tip}`;
};

// Footer pesan interactive:
// - kategori rpg  -> tips acak
// - kategori lain -> tahun-bulan-tanggal, hari, jam (WIB)
const getTip = () => stamp();

const footerFor = (category, prefix = ".") =>
  String(category || "").toLowerCase() === "rpg" ? getRandomTip(prefix) : getTip();

module.exports = { getTip, getRandomTip, footerFor };
