// lib/pity.js — counter "pity" gacha per user per crate.
// Setelah THRESHOLD buka tanpa jaminan, buka berikutnya dapat bonus langka.
const path = require("path");
const { readJson, writeJson } = require("./rpgjson");

const FILE = path.join(__dirname, "../database/rpg/pity.json");
const THRESHOLD = Math.max(5, Number(process.env.PITY_THRESHOLD) || 50);

let cache = null;
const load = () => {
  if (!cache) cache = readJson(FILE, {}) || {};
  return cache;
};
const save = () => writeJson(FILE, load());

const get = (uid, crate) => Number((load()[uid] || {})[crate] || 0);
const needed = (uid, crate) => Math.max(0, THRESHOLD - get(uid, crate));

const bump = (uid, crate) => {
  const data = load();
  data[uid] = data[uid] || {};
  data[uid][crate] = (Number(data[uid][crate]) || 0) + 1;
  save();
  return data[uid][crate];
};

const reset = (uid, crate) => {
  const data = load();
  if (data[uid]) delete data[uid][crate];
  save();
};

module.exports = {
  FILE,
  THRESHOLD,
  get,
  needed,
  bump,
  reset,
  _internal: { reset: () => { cache = null; } }
};
