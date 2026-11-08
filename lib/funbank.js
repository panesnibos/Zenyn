const fs = require("fs");
const path = require("path");

let bank;
const load = () => {
  if (bank) return bank;
  const raw = fs.readFileSync(path.join(__dirname, "../database/fun.json"), "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  for (const key of ["tebak", "truth", "dare", "roast", "gombalan", "pantun", "zodiak"]) {
    if (!Array.isArray(parsed[key]) || !parsed[key].length) throw new Error(`Bank fun ${key} kosong.`);
  }
  for (const quiz of parsed.tebak) {
    if (!quiz.question || quiz.options?.length !== 4 || !Number.isInteger(quiz.answer) || quiz.answer < 0 || quiz.answer > 3) {
      throw new Error("Bank tebak tidak valid.");
    }
  }
  bank = parsed;
  return bank;
};

module.exports = { load };
