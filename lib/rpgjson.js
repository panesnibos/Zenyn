const fs = require("fs");
const path = require("path");

const stripBom = (raw) => (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

const readJson = (file, fallback) => {
  try {
    return JSON.parse(stripBom(fs.readFileSync(file, "utf-8")));
  } catch {
    return typeof fallback === "function" ? fallback() : fallback;
  }
};

const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const text = JSON.stringify(data, null, 2);

  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    fs.writeFileSync(file, text);
  }
};

module.exports = { readJson, writeJson, stripBom };
