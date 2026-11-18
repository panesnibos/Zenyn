// commands/tools/b64.js — encode/decode base64.
const { guarded, reply, quotedText } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");

const MAX = 3000;

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const mode = String(args[0] || "").toLowerCase();
  const decode = ["decode", "d", "buka"].includes(mode);
  const encode = ["encode", "e", "buat"].includes(mode);
  const rest = encode || decode ? args.slice(1) : [...args];
  const text = (rest.join(" ") || quotedText(message)).trim();

  if (!text) {
    await reply(client, message, `🔡 Format: *${p}b64 encode|decode <teks>*\nAtau reply teks. Tanpa mode = encode.`);
    return false;
  }
  if (text.length > MAX) throw new Error(`Maksimal ${MAX} karakter.`);

  if (decode) {
    const raw = text.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/=_-]+$/.test(raw)) throw new Error("Itu bukan base64 yang valid.");
    const buf = Buffer.from(raw, "base64");
    const out = buf.toString("utf8");
    if (!out || out.includes("\uFFFD")) throw new Error("Hasil decode bukan teks UTF-8.");
    return reply(client, message, `🔓 *BASE64 DECODE*\n\n${out.slice(0, 3500)}`);
  }

  const encoded = Buffer.from(text, "utf8").toString("base64");
  return reply(client, message, `🔐 *BASE64 ENCODE*\n\n${encoded}`);
};

module.exports = {
  name: "b64",
  command: ["b64", "base64"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Encode/decode base64",
  execute: guarded("b64", execute)
};
