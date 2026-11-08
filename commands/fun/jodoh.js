const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, hash, sendCard, cooldown } = require("../../lib/featureutil");

const execute = async (client, message, args) => {
  const names = args.join(" ").split("|").map((name) => name.trim());
  if (names.length !== 2 || names.some((name) => !name)) return reply(client, message, `💕 Format: ${getPrefix(message)}jodoh nama pertama | nama kedua`);
  if (names.some((name) => name.length > 60)) throw new Error("Maksimal 60 karakter per nama.");
  cooldown(message, "jodoh");
  const seed = JSON.stringify(names.map((name) => name.normalize("NFKC").toLowerCase()).sort());
  const score = hash(`jodoh:${seed}`) % 101;
  return sendCard(client, message, "KECOCOKAN", `${names[0]} × ${names[1]}\nSkor hiburan: ${score}%\nBukan prediksi hubungan nyata.`, { score });
};

module.exports = {
  name: "jodoh", command: ["jodoh", "match"], category: "fun", visible: true,
  description: "Skor kecocokan dua nama (hiburan, hasil konsisten)", execute: guarded("jodoh", execute)
};
