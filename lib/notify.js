const path = require("path");
const { readJson, writeJson } = require("./rpgjson");

const FILE = path.join(__dirname, "../database/notify/settings.json");

const TYPES = {
  gempa: {
    label: "🚨 Gempa",
    desc: "Notif gempa BMKG ke semua grup bot"
  }
};

const defaults = () => Object.fromEntries(Object.keys(TYPES).map((k) => [k, true]));

const getSettings = () => {
  const saved = readJson(FILE, {});
  return { ...defaults(), ...(saved && typeof saved === "object" ? saved : {}) };
};

const isEnabled = (type) => {
  if (!TYPES[type]) return false;
  return getSettings()[type] !== false;
};

const setEnabled = (type, value) => {
  if (!TYPES[type]) return null;
  const settings = getSettings();
  settings[type] = !!value;
  writeJson(FILE, settings);
  return settings[type];
};

const listTypes = () =>
  Object.entries(TYPES).map(([id, t]) => ({ id, ...t, enabled: isEnabled(id) }));

module.exports = { TYPES, FILE, getSettings, isEnabled, setEnabled, listTypes };
