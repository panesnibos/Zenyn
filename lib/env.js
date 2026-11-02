const fs = require("fs");
const path = require("path");

const parseLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    const hash = value.indexOf(" #");
    if (hash >= 0) value = value.slice(0, hash).trim();
  }

  return key ? { key, value } : null;
};

const loadEnv = (filePath = path.join(__dirname, "..", ".env")) => {
  const loaded = [];

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return loaded;
  }

  for (const line of content.split(/\r?\n/)) {
    const entry = parseLine(line);
    if (!entry) continue;
    if (process.env[entry.key] === undefined) {
      process.env[entry.key] = entry.value;
      loaded.push(entry.key);
    }
  }

  return loaded;
};

module.exports = { loadEnv };
