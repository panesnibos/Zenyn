// lib/iteminfo.js — kartu info item: stat, sumber, bahan craft, dipakai untuk apa.
// short-cut: angka efek konsumabel dicerminkan dari use.js/heal.json (info saja).
const path = require("path");
const { readJson } = require("./rpgjson");
const { items, shop, recipes, findItemDef } = require("./rpgitems");
const { SPOTS } = require("./gatherspots");

const DB = path.join(__dirname, "../database/rpg");
const gacha = readJson(path.join(DB, "gacha.json"), {}) || {};
const levelup = readJson(path.join(DB, "levelup.json"), []) || [];
const heal = readJson(path.join(DB, "heal.json"), {}) || {};

const gold = (n) => `${Number(n || 0).toLocaleString("id-ID")} gold`;
const num = (n) => Number(n || 0).toLocaleString("id-ID");
const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

const EFFECTS = {
  "exp-scroll": "+150 EXP sekali pakai",
  "ancient-scroll": "+500 EXP sekali pakai",
  "pet-food": "+50 EXP pet",
  bait: "+1 hasil mancing (otomatis)",
  "anti-death-charm": "1x bebas cooldown mati",
  "strength-tonic": "+20% ATK untuk 1 pertarungan"
};

const catalog = () => {
  const map = new Map();
  for (const [key, def] of Object.entries(items)) map.set(key, { key, ...def });
  for (const [key, def] of Object.entries(shop)) {
    map.set(key, { ...(map.get(key) || {}), key, ...def });
  }
  return [...map.values()];
};

const distance = (a, b) => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
};

const resolveItem = (input) => {
  const q = String(input || "").toLowerCase().trim();
  if (!q) return { item: null, suggestions: [] };

  const list = catalog();
  const exact = list.find((it) => it.key === q || same(it.name, q));
  if (exact) return { item: exact, suggestions: [] };

  const near = list.filter((it) => it.key.includes(q) || String(it.name || "").toLowerCase().includes(q));
  if (near.length === 1) return { item: near[0], suggestions: [] };
  if (near.length > 1) return { item: null, suggestions: near.slice(0, 5).map((it) => it.key) };

  const loose = findItemDef(q);
  if (loose) return { item: { ...loose }, suggestions: [] };

  // typo ringan: bandingkan ke key dan tiap kata nama
  const scored = list
    .map((it) => ({
      key: it.key,
      d: Math.min(
        ...[it.key, ...String(it.name || "").toLowerCase().split(/[\s-]+/)].map((token) =>
          distance(q, token)
        )
      )
    }))
    .sort((a, b) => a.d - b.d);
  const best = scored.filter((it) => it.d <= 2);
  if (best.length === 1) {
    const found = list.find((it) => it.key === best[0].key);
    if (found) return { item: found, suggestions: [] };
  }
  return { item: null, suggestions: best.slice(0, 5).map((it) => it.key) };
};

const craftOf = (item) =>
  recipes[item.key] || Object.values(recipes).find((r) => same(r.name, item.name)) || null;

const usedIn = (item) =>
  Object.entries(recipes)
    .filter(([, r]) => Object.keys(r.materials || {}).some((m) => same(m, item.name)))
    .map(([key, r]) => ({ key, name: r.name }));

const effectsOf = (item) => {
  const healing = heal[item.key] || (item.key === "greater-potion" ? heal.greaterpotion : null);
  if (healing) return [`Heal +${healing.effect} HP`];
  return EFFECTS[item.key] ? [EFFECTS[item.key]] : [];
};

const sourcesOf = (item) => {
  const out = [];
  if (item.bmOnly) {
    out.push(`Black Market — ${gold(item.price)}, stok 1–2/sesi`);
  } else if (item.buyable !== false && item.price) {
    out.push(`Toko — ${gold(item.price)}`);
  }

  if (item.type === "equipment") {
    out.push(item.noDrop ? "Tidak bisa drop — harus craft" : `Drop acak ${item.rarity}: battle, raid, dungeon`);
  }

  const spots = new Set();
  for (const [type, spot] of Object.entries(SPOTS)) {
    if (spot.main === item.key) spots.add(`.gather ${type}`);
    if (spot.rare === item.key) spots.add(`.gather ${type} (rare 15%)`);
  }
  for (const line of spots) out.push(line);

  const tiers = levelup.filter((t) => (t.items || []).some((it) => same(it.name, item.name)));
  if (tiers.length) out.push(`Level up ${tiers[0].min}–${tiers[tiers.length - 1].max}`);

  for (const [key, crate] of Object.entries(gacha)) {
    if ((crate.items || []).some((r) => same(r.name, item.name))) out.push(`Isi crate ${key}`);
  }
  if (gacha[item.key]) out.push(`Dibuka dengan .open ${item.key}`);

  return [...new Set(out)];
};

// isi crate: gold + daftar item dengan peluang per roll
const crateInfoText = (key) => {
  const crate = gacha[key];
  if (!crate) return "";
  const items = crate.items || [];
  const total = items.reduce((sum, it) => sum + (Number(it.weight) || 1), 0);

  const lines = [];
  const g = crate.gold || {};
  if (g.max) lines.push(`💰 Gold ${num(g.min)}–${num(g.max)} + ${crate.rolls || 1} item`);
  else lines.push(`${crate.rolls || 1} item per buka`);

  for (const it of items) {
    const qty = Array.isArray(it.qty) ? `${it.qty[0]}–${it.qty[1]}` : it.qty || 1;
    const name = findItemDef(it.name)?.name || it.name;
    const pct = Math.round(((Number(it.weight) || 1) / total) * 100);
    lines.push(`${it.cap ? "⭐ " : ""}${it.emoji || "📦"} ${name} x${qty} ${pct}%`);
  }
  return lines.join("\n");
};

const infoText = (item) => {
  const lines = [`${item.emoji || "📦"} *${String(item.name).toUpperCase()}*`];

  const tags = [];
  if (item.type === "equipment") {
    tags.push(item.slot === "weapon" ? "Weapon" : item.slot === "armor" ? "Armor" : "Accessory");
    if (item.rarity) tags.push(item.rarity);
  } else {
    tags.push(item.type === "consumable" ? "Consumable" : item.type === "material" ? "Material" : "Item");
  }
  if (item.bmOnly) tags.push("hanya Black Market");
  const recipe = craftOf(item);
  if (recipe) tags.push("craft-only");
  if (gacha[item.key]) tags.push("kunci crate");
  lines.push(tags.join(" · "));

  const effects = effectsOf(item);
  if (effects.length) lines.push("", "✨ Efek", ...effects.map((e) => `• ${e}`));

  const crate = gacha[item.key];
  if (crate) {
    lines.push("", "🎁 Isi crate", ...crateInfoText(item.key).split("\n").map((l) => `• ${l}`));
  }

  if (item.type === "equipment") {
    const stats = [];
    if (item.atk) stats.push(`ATK ${item.atk}`);
    if (item.def) stats.push(`DEF ${item.def}`);
    if (item.hp) stats.push(`HP ${item.hp}`);
    if (item.goldBonus) stats.push(`+${Math.round(item.goldBonus * 100)}% gold`);
    lines.push("", "📊 Stat dasar", stats.join(" · ") || "-");

    const per = [];
    for (const [label, value] of [["ATK", item.atk], ["DEF", item.def], ["HP", item.hp]]) {
      if (value) per.push(`${label} +${Math.max(1, Math.round(value * 0.1))}`);
    }
    if (per.length) lines.push(`📈 Per enhance (+1): ${per.join(" · ")}`);
  }

  const sources = sourcesOf(item);
  if (sources.length) lines.push("", "🛒 Didapat", ...sources.map((s) => `• ${s}`));

  if (recipe) {
    lines.push("", "🛠️ Craft (butuh)");
    for (const [name, qty] of Object.entries(recipe.materials || {})) lines.push(`• ${name} x${qty}`);
    lines.push(`• ${gold(recipe.cost)}`);
  }

  const used = usedIn(item);
  if (used.length) lines.push("", "🔨 Dipakai untuk", ...used.map((u) => `• ${u.name}`));

  if (item.noSell) lines.push("", "🔒 Tidak bisa dijual");
  else if (item.sell) lines.push("", `💰 Jual: ${gold(item.sell)}`);

  return lines.join("\n");
};

const listText = () => {
  const list = catalog();
  const groups = [
    ["⚔️ Senjata", (it) => it.type === "equipment" && it.slot === "weapon"],
    ["🛡️ Armor", (it) => it.type === "equipment" && it.slot === "armor"],
    ["💍 Aksesori", (it) => it.type === "equipment" && it.slot === "accessory"],
    ["🧱 Material", (it) => it.type === "material"],
    ["🎁 Konsumabel & kunci", (it) => it.type !== "equipment" && it.type !== "material"]
  ];

  const lines = ["📖 *DAFTAR ITEM*", "", "Ketik *.item <nama>* untuk detail.", ""];
  for (const [title, match] of groups) {
    const names = list.filter(match).map((it) => it.name);
    if (names.length) lines.push(`${title} (${names.length})`, names.join(", "), "");
  }
  return lines.join("\n").trim();
};

module.exports = {
  resolveItem,
  infoText,
  listText,
  usedIn,
  crateInfoText,
  _internal: { catalog, distance }
};
