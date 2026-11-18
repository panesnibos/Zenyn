// commands/tools/hash.js — hash teks (md5/sha1/sha256).
const crypto = require("crypto");
const { guarded, reply, quotedText } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");

const ALGOS = ["md5", "sha1", "sha256"];

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  let algo = "sha256";
  const words = [...args];
  if (words.length && ALGOS.includes(String(words[0]).toLowerCase())) algo = String(words.shift()).toLowerCase();

  const text = (words.join(" ") || quotedText(message)).trim();
  if (!text) {
    await reply(client, message, `#️⃣ Format: *${p}hash [md5|sha1|sha256] <teks>*\nAtau reply teks. Default sha256.`);
    return false;
  }

  const digest = crypto.createHash(algo).update(text, "utf8").digest("hex");
  return reply(client, message, `#️⃣ *${algo.toUpperCase()}*\n\n\`${digest}\``);
};

module.exports = {
  name: "hash",
  command: ["hash", "md5", "sha256"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Hash teks (md5/sha1/sha256)",
  execute: guarded("hash", execute)
};
