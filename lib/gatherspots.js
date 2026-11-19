// lib/gatherspots.js — satu sumber untuk lokasi gather, dipakai .gather dan .item.
const SPOTS = {
  fish: { label: "Memancing", main: "fish", emoji: "🎣", rare: "rare-fish" },
  mine: { label: "Menambang", main: "ore", emoji: "⛏️", rare: "mithril-ore" },
  chop: { label: "Menebang", main: "wood", emoji: "🪓", rare: "hardwood" },
  wood: { label: "Menebang", main: "wood", emoji: "🪓", rare: "hardwood" },
  herb: { label: "Mencari herbal", main: "herb", emoji: "🌿", rare: "moon-herb" }
};

module.exports = { SPOTS };
