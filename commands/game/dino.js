// commands/game/dino.js — dino runner versi chat (tombol).
// Kartu HTML canvas tak dipakai: webview beberapa client (termasuk user bot ini)
// tidak mengeksekusi JS kartu, jadi kanvas selalu kosong.
// Top score per user disimpan di DB (user.dinoTop) -> siap untuk leaderboard.
const config = require("../../config");
const logger = require("../../lib/logger");
const { getPrefix } = require("../../lib/prefix");
const { db } = require("../../lib/rpgdb");
const { sendRichHtml, supported } = require("../../lib/richsend");
const { sceneCard } = require("../../lib/dinocard");
const { guarded, reply, interactive, quick, token, identity, timedStore } = require("../../lib/featureutil");

const games = timedStore(500);
const CLEAR = { jump: "🌵", duck: "🦅" };
const ACT = { jump: "Lompat", duck: "Merunduk" };
const keyOf = (chat, uid) => `dino:${chat}:${uid}`;

// updateUser melempar null untuk user yang belum ada: baca tanpa bikin akun.
const topOf = (uid) => Number(db.updateUser(uid, () => {})?.dinoTop) || 0;

const saveTop = (uid, name, score) => {
  const user = db.getUser(uid, name || "Pemain");
  if (score > (Number(user.dinoTop) || 0)) {
    user.dinoTop = score;
    db.saveUser(user);
  }
  return Number(user.dinoTop) || 0;
};

const endGame = async (client, game, reason) => {
  clearTimeout(game.timer);
  games.delete(game.key);
  const best = saveTop(game.uid, game.name, game.score);
  const lines = [
    "🦖 *DINO SELESAI*",
    reason,
    "",
    `Score: ${game.score} • Top Score: ${best}`,
    game.score > 0 && game.score > game.top ? "🏆 Rekor baru!" : null,
    `Main lagi: *${game.prefix}dino* • Top: *${game.prefix}dino top*`
  ].filter((line) => line !== null);
  await client.sendMessage(game.chat, { text: lines.join("\n") }, game.message ? { quoted: game.message } : {}).catch(() => {});
};

// Kartu rich statis (CSS, tanpa JS) + tombol aksi di chat.
const sendScene = async (client, game, secs) => {
  if (config.richCard === false || !supported(client)) return false;
  try {
    await sendRichHtml(
      client,
      game.chat,
      sceneCard({
        score: game.score,
        top: Math.max(game.top, game.score),
        round: game.score + 1,
        obstacle: game.obstacle,
        secs: secs.toFixed(1)
      }),
      `Zenyn Dino · ronde ${game.score + 1}`
    );
    return true;
  } catch (err) {
    logger.warn(`dino: kartu gagal (${err.message})`);
    return false;
  }
};

const ask = async (client, message, game) => {
  clearTimeout(game.timer);
  game.id = token();
  game.obstacle = Math.random() < 0.5 ? "jump" : "duck";
  game.message = message;
  const secs = Math.max(3.5, 9 - game.score * 0.4);
  games.set(game.key, game, Math.round(secs * 1000) + 20000);
  const richOk = await sendScene(client, game, secs);
  const lines = richOk
    ? [`Pilih *${ACT[game.obstacle]}* • sisa ${secs.toFixed(1)}s`, "Salah pilih atau telat = selesai."]
    : [
        "🦖 *DINO RUN*",
        "",
        `Score: ${game.score} • Top Score: ${Math.max(game.top, game.score)}`,
        "",
        `🦖 ─ ─ ─ ─ ${CLEAR[game.obstacle]}`,
        `Pilih *${ACT[game.obstacle]}* • sisa ${secs.toFixed(1)}s`,
        "Salah pilih atau telat = selesai."
      ];
  await interactive(client, message, lines.join("\n"), [
    quick("⬆️ Lompat", `dino act ${game.id} jump`),
    quick("⬇️ Merunduk", `dino act ${game.id} duck`),
    quick("🛑 Stop", "dino stop")
  ]);
  game.timer = setTimeout(() => { endGame(client, game, "⏰ Telat merespons").catch(() => {}); }, Math.round(secs * 1000));
  game.timer.unref?.();
};

const execute = async (client, message, args = []) => {
  const uid = identity(message);
  const chat = message.key.remoteJid;
  const key = keyOf(chat, uid);
  const p = getPrefix(message);
  const sub = String(args[0] || "").toLowerCase();
  const game = games.get(key);

  if (sub === "stop") {
    if (!game) return reply(client, message, `Tidak ada game dino aktif. Mulai: *${p}dino*`);
    clearTimeout(game.timer);
    games.delete(key);
    return reply(client, message, `🛑 Game dino dihentikan. Score: ${game.score}`);
  }

  if (sub === "top") return reply(client, message, `🏆 Top Score dino kamu: ${topOf(uid)}`);

  if (sub === "act") {
    if (!game) return reply(client, message, `Game sudah selesai. Mulai lagi: *${p}dino*`);
    if (String(args[1] || "") !== game.id) return reply(client, message, "Tombol itu sudah kedaluwarsa. Pakai tombol pesan terbaru.");
    if (game.obstacle !== String(args[2] || "")) return endGame(client, game, `❌ Salah — harus *${ACT[game.obstacle]}*`);
    game.score += 1;
    return ask(client, message, game);
  }

  if (game) return reply(client, message, `Game dino masih jalan (score ${game.score}). Pakai tombol terakhir atau *${p}dino stop*.`);

  const fresh = { key, uid, name: message.pushName, chat, score: 0, top: topOf(uid), prefix: p };
  games.set(key, fresh, 60000);
  return ask(client, message, fresh);
};

module.exports = {
  name: "dino",
  command: ["dino"],
  category: "game",
  description: "Game dino runner lewat tombol (skor + top score per user)",
  visible: true,
  execute: guarded("dino", execute),
  _internal: { games, keyOf, ask, endGame, topOf, saveTop }
};
