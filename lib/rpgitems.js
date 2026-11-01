const path = require("path");
const { readJson } = require("./rpgjson");

const DB = path.join(__dirname, "../database/rpg");

const shop = readJson(path.join(DB, "shop.json"), {});
const items = readJson(path.join(DB, "items.json"), {});
const recipes = readJson(path.join(DB, "recipes.json"), {});

const byName = {};
for (const [key, def] of Object.entries(items)) {
  byName[String(def.name || key).toLowerCase()] = { key, ...def };
}
for (const [key, def] of Object.entries(shop)) {
  const name = String(def.name || key).toLowerCase();
  if (!byName[name]) byName[name] = { key, ...def };
}

const findItemDef = (input) => {
  const q = String(input || "").toLowerCase().trim();
  if (!q) return null;
  if (items[q]) return { key: q, ...items[q] };
  if (shop[q]) return { key: q, ...shop[q] };
  return byName[q] || null;
};

const findShopItem = (input) => {
  const q = String(input || "").toLowerCase().trim();
  if (!q) return null;
  if (shop[q]) return { key: q, ...shop[q] };
  const found = Object.keys(shop).find((k) => String(shop[k].name).toLowerCase() === q);
  return found ? { key: found, ...shop[found] } : null;
};

const equipmentDefs = () =>
  Object.entries(items)
    .filter(([, d]) => d.type === "equipment")
    .map(([key, d]) => ({ key, ...d }));

const equipmentByRarity = (rarity) =>
  equipmentDefs().filter((d) => String(d.rarity).toLowerCase() === String(rarity).toLowerCase());

const getRecipe = (id) => {
  const key = String(id || "").toLowerCase().trim();
  if (!key) return null;
  if (recipes[key]) return { key, ...recipes[key] };
  const found = Object.keys(recipes).find((k) => String(recipes[k].name).toLowerCase() === key);
  return found ? { key: found, ...recipes[found] } : null;
};

module.exports = {
  shop,
  items,
  recipes,
  findItemDef,
  findShopItem,
  equipmentDefs,
  equipmentByRarity,
  getRecipe
};
