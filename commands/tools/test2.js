// commands/tools/test2.js — fake FF lobby card pakai paket x-fake-ff.
// Format: .test2 <nama> [lobby 1-30]
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const generate = require("x-fake-ff");
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, cooldown } = require("../../lib/featureutil");

const MAX_NAME = 20;
const MAX_LOBBY = 30;

const clean = (value) =>
  String(value || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const words = (args || []).map((a) => String(a));
  const last = words[words.length - 1];
  const hasLobby = words.length > 1 && /^\d{1,2}$/.test(last);
  const lobby = hasLobby ? Number(words.pop()) : null;
  const username = clean(words.join(" "));

  if (!username) {
    await reply(
      client,
      message,
      `🎮 *FAKE FF LOBBY*\n\nFormat: ${p}test2 <nama> [lobby]\nContoh: ${p}test2 Panes\nContoh: ${p}test2 Panes 12\n\nNama maksimal ${MAX_NAME} karakter, lobby 1–${MAX_LOBBY} (kosong = acak). Biaya 1 limit.`
    );
    return false;
  }

  cooldown(message, "test2", 8000);

  const dir = path.join(os.tmpdir(), "zenyn-ff", crypto.randomBytes(4).toString("hex"));
  try {
    const out = await generate({ username, lobby, outputDir: dir });
    const buffer = fs.readFileSync(out.result);
    return client.sendMessage(
      message.key.remoteJid,
      { image: buffer, caption: `🎮 Fake FF Lobby — ${username}\n🏠 Lobby ${out.lobby}` },
      { quoted: message }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

module.exports = {
  name: "test2",
  command: ["test2"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Fake FF lobby card (x-fake-ff, 30 lobby)",
  subcommands: ["<nama> [lobby]"],
  execute: guarded("test2", execute),
  _internal: { clean, MAX_LOBBY }
};
