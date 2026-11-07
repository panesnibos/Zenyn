// commands/fun/catur.js — main catur lewat kartu rich WhatsApp.
// Papan tampil di kartu (statis); langkah diketik: .catur e2e4
const logger = require("../../lib/logger");
const config = require("../../config");
const { getUserId, resolveTarget, normalizeNumber } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const catur = require("../../lib/catur");
const { boardCard, textBoard } = require("../../lib/caturcard");
const { sendRichHtml, supported } = require("../../lib/richsend");

const games = new Map(); // key -> game
const TTL = 2 * 60 * 60 * 1000;
const MAX_GAMES = 400;

const LEVELS = { mudah: "mudah", sedang: "sedang", susah: "susah", easy: "mudah", hard: "susah" };

const keyOf = (jid, uid) => `${jid}|bot|${uid}`;
const pvpKey = (jid) => `${jid}|pvp`;

const prune = () => {
  const now = Date.now();
  for (const [k, g] of games) if (now - g.updatedAt > TTL) games.delete(k);
  if (games.size > MAX_GAMES) {
    const sorted = [...games.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (let i = 0; i < sorted.length - MAX_GAMES; i++) games.delete(sorted[i][0]);
  }
};

const logLine = (g) => (g.log.length ? g.log.slice(-6).join(" ") : "-");

const statusText = (g) => {
  const st = catur.status(g.state);
  const turn = g.state.turn === "w" ? "Putih" : "Hitam";
  const lines = [];
  lines.push(`♞ *CATUR* • ${g.mode === "pvp" ? "lawan pemain" : `bot ${g.level}`}`);
  lines.push("");
  lines.push(`Giliran : ${turn}${st.check ? " ⚠️ SEKAK" : ""}`);
  lines.push(`Langkah : ${g.state.fullmove}`);
  lines.push(`Riwayat : ${logLine(g)}`);
  return { st, lines };
};

const overText = (st) => {
  if (st.type === "checkmate") return `🏁 *SEKAKMAT!* ${st.winner === "w" ? "Putih" : "Hitam"} menang.`;
  if (st.type === "stalemate") return "🤝 *Remis* — buntu (stalemate).";
  if (st.type === "fifty") return "🤝 *Remis* — aturan 50 langkah.";
  if (st.type === "material") return "🤝 *Remis* — materi tidak cukup.";
  return "🏁 Selesai.";
};

const render = async (client, chat, g, p, extra = "") => {
  const { st, lines } = statusText(g);
  let text = `${lines.join("\n")}\n`;

  if (st.over) {
    text += `\n${overText(st)}\n\nMulai lagi: *${p}catur*`;
  } else {
    const side = g.state.turn === "w" ? "putih" : "hitam";
    const who = g.mode === "pvp" ? `Pemain ${side}` : side === "putih" ? "Kamu" : "Bot";
    text += `\nGiliran ${who}. Ketik langkah, mis. *${p}catur e2e4*${g.state.turn === "b" && g.mode === "pvp" ? " (oleh pemain hitam)" : ""}\n`;
    text += `Bantuan: *${p}catur papan* • *${p}catur undo* • *${p}catur batal*`;
  }

  if (extra) text += `\n\n${extra}`;

  const hint = st.over
    ? overText(st)
    : `Ketik: ${p}catur e2e4  •  papan di atas hanya tampilan  •  ${g.state.turn === "w" ? "putih" : "hitam"} jalan`;

  if (config.richCard !== false && supported(client)) {
    try {
      await sendRichHtml(
        client,
        chat,
        boardCard({
          state: g.state,
          status: st,
          level: g.level,
          badge: g.mode === "pvp" ? "pvp" : g.level,
          mode: g.mode,
          players: g.mode === "pvp" ? g.players : undefined,
          last: g.last,
          headline: st.over ? overText(st).replace(/[*🏁🤝]/g, "").trim() : `Giliran ${g.state.turn === "w" ? "Putih" : "Hitam"}`,
          hint
        }),
        "Zenyn Catur"
      );
      return await client.sendMessage(chat, { text }, { quoted: g.quoted });
    } catch (err) {
      logger.warn(`catur: rich gagal (${err.message}), pakai teks`);
    }
  }

  text += `\n\n\`\`\`\n${textBoard(g.state, g.last)}\n\`\`\``;
  return await client.sendMessage(chat, { text }, { quoted: g.quoted });
};

const newGame = (mode, { level = "sedang", white, black } = {}) => ({
  state: catur.initial(),
  mode,
  level,
  players: { white, black },
  last: {},
  log: [],
  stack: [],
  updatedAt: Date.now()
});

const playMove = (g, move) => {
  const sanText = catur.san(g.state, move);
  g.stack.push(g.state);
  if (g.stack.length > 300) g.stack.shift();
  g.state = catur.applyMove(g.state, move);
  g.last = { from: move.from, to: move.to };
  g.log.push(sanText);
  g.updatedAt = Date.now();
  return sanText;
};

const execute = async (client, message, args, commands, commandName) => {
  const chat = message.key.remoteJid;
  const uid = getUserId(message);
  const p = getPrefix(message);
  const a = (args || []).map((x) => String(x));
  const sub = (a[0] || "").toLowerCase();
  const quoted = { key: message.key, message: message.message, pushName: message.pushName };

  if (!uid) {
    return client.sendMessage(chat, { text: "❌ Tidak bisa mengidentifikasi pengguna." }, { quoted: message });
  }

  prune();

  const botKey = keyOf(chat, uid);
  const pk = pvpKey(chat);

  try {
    // ---------- bantuan ----------
    if (sub === "help" || sub === "bantuan") {
      return client.sendMessage(chat, { text: usage(p) }, { quoted: message });
    }

    // ---------- batal / nyerah ----------
    if (["batal", "nyerah", "resign", "quit", "stop"].includes(sub)) {
      const g = games.get(botKey) || games.get(pk);
      if (!g) return client.sendMessage(chat, { text: "Tidak ada permainan aktif." }, { quoted: message });
      games.delete(games.has(botKey) ? botKey : pk);
      return client.sendMessage(
        chat,
        { text: `🛑 Permainan catur dibatalkan${g.mode === "pvp" ? "" : " (bot menang WO 😄)"}.` },
        { quoted: message }
      );
    }

    // ---------- papan ulang ----------
    if (["papan", "lihat", "show", "peta"].includes(sub)) {
      const g = games.get(botKey) || games.get(pk);
      if (!g) return client.sendMessage(chat, { text: `Belum ada permainan. Mulai: *${p}catur*` }, { quoted: message });
      g.quoted = quoted;
      return await render(client, chat, g, p);
    }

    // ---------- undo ----------
    if (["undo", "batalin", "mundur"].includes(sub)) {
      const g = games.get(botKey);
      if (!g) return client.sendMessage(chat, { text: `Undo hanya untuk mode bot. Lihat: *${p}catur papan*` }, { quoted: message });
      if (uid !== g.players.white) return client.sendMessage(chat, { text: "Ini bukan permainanmu." }, { quoted: message });
      const back = g.mode === "bot" ? 2 : 1;
      let done = 0;
      while (done < back && g.stack.length) {
        g.state = g.stack.pop();
        g.log.pop();
        done++;
      }
      if (!done) return client.sendMessage(chat, { text: "Belum ada langkah untuk dibatalkan." }, { quoted: message });
      g.last = {};
      g.updatedAt = Date.now();
      g.quoted = quoted;
      return await render(client, chat, g, p, `↩️ Dibatalkan ${done} langkah.`);
    }

    // ---------- lawan pemain (PVP) ----------
    if (["lawan", "vs", "pvp", "tantang"].includes(sub)) {
      if (!/@g\.us$/i.test(chat)) {
        return client.sendMessage(chat, { text: "Mode lawan pemain hanya di grup. Di chat pribadi main lawan bot saja." }, { quoted: message });
      }
      const existing = games.get(pk);
      if (existing && Date.now() - existing.updatedAt < TTL) {
        return client.sendMessage(chat, { text: `Masih ada permainan PVP aktif di grup ini (${existing.players.white} vs ${existing.players.black}). Selesaikan atau *${p}catur batal*.` }, { quoted: message });
      }
      const { targetId } = await resolveTarget(message, a.slice(1), client);
      const target = normalizeNumber(targetId);
      if (!target || target === uid) {
        return client.sendMessage(chat, { text: `Tag lawanmu: *${p}catur lawan @user*` }, { quoted: message });
      }
      const g = newGame("pvp", { white: uid, black: target });
      g.quoted = quoted;
      games.set(pk, g);
      logger.cmd(`catur: pvp ${uid} vs ${target} di ${chat}`);
      return await render(client, chat, g, p, `⚔️ *${uid}* (putih) vs *${target}* (hitam). Putih jalan duluan.`);
    }

    // ---------- mulai game bot baru ----------
    const wantNew = ["baru", "new", "reset", "ulang", "start"].includes(sub) || LEVELS[sub];
    if (wantNew) {
      const level = LEVELS[sub] || "sedang";
      const g = newGame("bot", { level, white: uid, black: "Bot" });
      g.quoted = quoted;
      games.set(botKey, g);
      logger.cmd(`catur: bot ${level} -> ${uid}`);
      return await render(client, chat, g, p, `♟️ Permainan baru vs bot (${level}). Kamu putih.`);
    }

    // ---------- pilih game aktif ----------
    let g = games.get(botKey);
    if (!g) g = games.get(pk);

    if (!g || Date.now() - g.updatedAt > TTL) {
      if (g) games.delete(g === games.get(botKey) ? botKey : pk);
      if (!a.length) {
        const fresh = newGame("bot", { level: "sedang", white: uid, black: "Bot" });
        fresh.quoted = quoted;
        games.set(botKey, fresh);
        return await render(client, chat, fresh, p, "♟️ Permainan baru vs bot (sedang). Kamu putih.");
      }
      return client.sendMessage(chat, { text: `Belum ada permainan. Mulai: *${p}catur*` }, { quoted: message });
    }

    g.quoted = quoted;

    // hak langkah
    const color = g.state.turn;
    const owner = color === "w" ? g.players.white : g.players.black;
    if (g.mode === "pvp") {
      if (uid !== owner) {
        const ownerName = owner === "Bot" ? "Bot" : owner;
        return client.sendMessage(chat, { text: `⏳ Sekarang giliran ${color === "w" ? "putih" : "hitam"} (${ownerName}), bukan kamu.` }, { quoted: message });
      }
    } else if (uid !== g.players.white) {
      return client.sendMessage(chat, { text: `Ini catur milik pemain lain. Mulai punyamu: *${p}catur*` }, { quoted: message });
    }

    const st0 = catur.status(g.state);
    if (st0.over) return await render(client, chat, g, p);

    // ---------- jalan pemain ----------
    const raw = a.join(" ").trim();
    if (!raw) {
      return await render(client, chat, g, p, "Ketik langkahmu, mis. e2e4 / nf3 / o-o");
    }

    const parsed = catur.parseMove(g.state, raw);
    if (parsed.error) {
      return client.sendMessage(chat, { text: `❌ ${parsed.error}` }, { quoted: message });
    }

    let extra = `✅ ${color === "w" ? "Putih" : "Hitam"}: *${playMove(g, parsed.move)}*`;

    // ---------- balasan bot ----------
    if (g.mode === "bot" && !catur.status(g.state).over) {
      const reply = catur.bestMove(g.state, g.level);
      if (reply) {
        const sanText = playMove(g, reply);
        extra += `\n🤖 Bot: *${sanText}*`;
      }
    }

    const st = catur.status(g.state);
    if (st.over) {
      g.updatedAt = Date.now();
      const result = st.type === "checkmate" ? (st.winner === "w" ? "Kamu menang! 🎉" : "Bot menang 🤖") : "Remis 🤝";
      if (g.mode === "pvp") games.delete(pk);
      else games.delete(botKey);
      await render(client, chat, g, p, `${extra}\n\n${overText(st)}\n${g.mode === "pvp" ? "" : result}`);
      logger.cmd(`catur: selesai ${st.type} ${g.players.white} vs ${g.players.black}`);
      return;
    }

    return await render(client, chat, g, p, extra);
  } catch (err) {
    logger.error("catur:", err);
    return client.sendMessage(chat, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

const usage = (p) =>
  [
    "♞ *CATUR* — papan tampil di kartu, langkah lewat chat",
    "",
    `• *${p}catur* — mulai lawan bot (sedang)`,
    `• *${p}catur mudah | sedang | susah* — pilih level bot`,
    `• *${p}catur lawan @user* — mode lawan pemain (grup)`,
    `• *${p}catur e2e4* — jalan (putih)`,
    `• *${p}catur nf3* atau *${p}catur e4* — notasi singkat`,
    `• *${p}catur o-o* — rokade • *${p}catur e7e8q* — promosi`,
    `• *${p}catur papan* — kirim ulang papan`,
    `• *${p}catur undo* — batalkan (mode bot)`,
    `• *${p}catur batal* — berhenti`,
    "",
    "Kamu jalan sebagai putih. Bot membalas otomatis."
  ].join("\n");

module.exports = {
  name: "catur",
  command: ["catur", "chess", "caturs"],
  category: "fun",
  description: "Main catur (papan rich card, langkah lewat chat)",
  visible: true,
  execute,
  _internal: { games, newGame, render, keyOf, pvpKey, TTL }
};
