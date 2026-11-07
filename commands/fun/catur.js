// commands/fun/catur.js — main catur lewat kartu rich WhatsApp.
// Papan = kartu rich (tampilan). Langkah bisa DIKLIK lewat daftar bidak/tujuan,
// atau diketik: .catur e2e4
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
const PAGE_SIZE = 8; // baris list per halaman (biar aman di WhatsApp)

const LEVELS = { mudah: "mudah", sedang: "sedang", susah: "susah", easy: "mudah", hard: "susah" };

const keyOf = (jid, uid) => `${jid}|bot|${uid}`;
const pvpKey = (jid) => `${jid}|pvp`;

const cut = (s, n) => (String(s || "").length > n ? String(s).slice(0, n - 1) + "…" : String(s || ""));

const prune = () => {
  const now = Date.now();
  for (const [k, g] of games) if (now - g.updatedAt > TTL) games.delete(k);
  if (games.size > MAX_GAMES) {
    const sorted = [...games.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (let i = 0; i < sorted.length - MAX_GAMES; i++) games.delete(sorted[i][0]);
  }
};

const GLYPH = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
const glyphOf = (p) => (p ? GLYPH[p.toUpperCase()] || "?" : "");

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

// ---------- daftar klik ----------
const movesByFrom = (state) => {
  const map = new Map();
  for (const m of catur.legalMoves(state)) {
    if (!map.has(m.from)) map.set(m.from, []);
    map.get(m.from).push(m);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
};

const pageOf = (total, page) => {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  return { pages, cur };
};

const pieceList = (g, page) => {
  const entries = movesByFrom(g.state);
  const { pages, cur } = pageOf(entries.length, page);
  const slice = entries.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

  const rows = slice.map(([from, ms]) => ({
    id: `catur sel ${catur.sq(from)}`,
    title: `${glyphOf(g.state.board[from])} ${catur.sq(from)} — ${ms.length} langkah`,
    description: cut(ms.slice(0, 4).map((m) => catur.san(g.state, m)).join(", ") + (ms.length > 4 ? " …" : ""), 72)
  }));

  if (cur > 0) rows.push({ id: `catur bidak ${cur - 1}`, title: "⬅️ Sebelumnya", description: `Halaman ${cur}/${pages}` });
  if (cur < pages - 1) rows.push({ id: `catur bidak ${cur + 1}`, title: "➡️ Selanjutnya", description: `Halaman ${cur + 2}/${pages}` });

  return { rows, pages, cur, title: "Pilih bidak", count: entries.length };
};

const destList = (g, from, page) => {
  const ms = catur.legalMoves(g.state).filter((m) => m.from === from);
  if (!ms.length) return null;
  const { pages, cur } = pageOf(ms.length, page);
  const slice = ms.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

  const rows = slice.map((m) => ({
    id: `catur mv ${catur.sq(m.from)}${catur.sq(m.to)}${m.promo || ""}`,
    title: cut(catur.san(g.state, m), 24),
    description: cut(`${catur.sq(m.from)}→${catur.sq(m.to)}${m.capture || m.ep ? " (tangkap)" : ""}`, 72)
  }));

  rows.push({ id: "catur bidak 0", title: "↩️ Bidak lain", description: "Pilih bidak lain" });
  if (cur > 0) rows.push({ id: `catur sel ${catur.sq(from)} ${cur - 1}`, title: "⬅️ Sebelumnya", description: `Halaman ${cur}/${pages}` });
  if (cur < pages - 1) rows.push({ id: `catur sel ${catur.sq(from)} ${cur + 1}`, title: "➡️ Selanjutnya", description: `Halaman ${cur + 2}/${pages}` });

  return { rows, pages, cur, title: `Tujuan ${catur.sq(from)}`, count: ms.length };
};

const sendList = async (client, chat, g, text, sec) => {
  try {
    await client.sendInteractiveMessage(
      chat,
      {
        text,
        interactiveButtons: [
          { name: "single_select", buttonParamsJson: JSON.stringify({ title: sec.title, sections: [{ title: sec.title, rows: sec.rows }] }) }
        ]
      },
      { quoted: g.quoted }
    );
    return true;
  } catch (err) {
    logger.warn(`catur: daftar klik gagal: ${err.message}`);
    return false;
  }
};

const renderCard = async (client, chat, g, extraOpts = {}) => {
  if (config.richCard === false || !supported(client)) return false;
  const st = catur.status(g.state);
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
        hint: extraOpts.hint || "Klik bidak di tombol bawah",
        selected: extraOpts.selected,
        targets: extraOpts.targets
      }),
      "Zenyn Catur"
    );
    return true;
  } catch (err) {
    logger.warn(`catur: rich gagal (${err.message}), pakai teks`);
    return false;
  }
};

const withBoard = (text, g, richOk) => (richOk ? text : `${text}\n\n\`\`\`\n${textBoard(g.state, g.last)}\n\`\`\``);

// kirim papan + daftar pilihan (klik). st.over -> cukup papan + hasil.
const render = async (client, chat, g, p, extra = "") => {
  const { st, lines } = statusText(g);
  const body = [lines.join("\n")];
  if (st.over) body.push("", overText(st), "", `Mulai lagi: *${p}catur*`);
  else body.push("", `Klik bidak di tombol bawah, atau ketik *${p}catur e2e4*`);
  if (extra) body.push("", extra);
  const text = body.join("\n");

  const richOk = await renderCard(client, chat, g);

  if (st.over) {
    return client.sendMessage(chat, { text: withBoard(text, g, richOk) }, { quoted: g.quoted });
  }

  const listText = withBoard(text, g, richOk);
  const sec = pieceList(g, 0);
  const ok = await sendList(client, chat, g, listText, sec);
  if (!ok) {
    const moves = catur.legalMoves(g.state).map((m) => catur.san(g.state, m)).slice(0, 14).join(", ");
    return client.sendMessage(chat, { text: `${listText}\n\nLangkah tersedia: ${moves}` }, { quoted: g.quoted });
  }
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

const actorAllowed = (g, uid) => {
  const owner = g.state.turn === "w" ? g.players.white : g.players.black;
  return g.mode === "pvp" ? uid === owner : uid === g.players.white;
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
    if (sub === "help" || sub === "bantuan") {
      return client.sendMessage(chat, { text: usage(p) }, { quoted: message });
    }

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

    if (["papan", "lihat", "show", "peta"].includes(sub)) {
      const g = games.get(botKey) || games.get(pk);
      if (!g) return client.sendMessage(chat, { text: `Belum ada permainan. Mulai: *${p}catur*` }, { quoted: message });
      g.quoted = quoted;
      return await render(client, chat, g, p);
    }

    if (["undo", "batalin", "mundur"].includes(sub)) {
      const g = games.get(botKey);
      if (!g) return client.sendMessage(chat, { text: `Undo hanya untuk mode bot. Lihat: *${p}catur papan*` }, { quoted: message });
      if (uid !== g.players.white) return client.sendMessage(chat, { text: "Ini bukan permainanmu." }, { quoted: message });
      let done = 0;
      while (done < 2 && g.stack.length) {
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

    if (["lawan", "vs", "pvp", "tantang"].includes(sub)) {
      if (!/@g\.us$/i.test(chat)) {
        return client.sendMessage(chat, { text: "Mode lawan pemain hanya di grup. Di chat pribadi main lawan bot saja." }, { quoted: message });
      }
      const existing = games.get(pk);
      if (existing && Date.now() - existing.updatedAt < TTL) {
        return client.sendMessage(
          chat,
          { text: `Masih ada permainan PVP aktif (${existing.players.white} vs ${existing.players.black}). Selesaikan atau *${p}catur batal*.` },
          { quoted: message }
        );
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

    const wantNew = ["baru", "new", "reset", "ulang", "start"].includes(sub) || LEVELS[sub];
    if (wantNew) {
      const level = LEVELS[sub] || "sedang";
      const g = newGame("bot", { level, white: uid, black: "Bot" });
      g.quoted = quoted;
      games.set(botKey, g);
      logger.cmd(`catur: bot ${level} -> ${uid}`);
      return await render(client, chat, g, p, `♟️ Permainan baru vs bot (${level}). Kamu putih.`);
    }

    let g = games.get(botKey) || games.get(pk);

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
    const st0 = catur.status(g.state);
    if (st0.over) return await render(client, chat, g, p);

    // ---- navigasi daftar klik (bidak / tujuan) ----
    if (["bidak", "pick", "main"].includes(sub)) {
      if (!actorAllowed(g, uid)) return client.sendMessage(chat, { text: "⏳ Bukan giliranmu.", }, { quoted: message });
      const sec = pieceList(g, Number(a[1]) || 0);
      const { lines } = statusText(g);
      const richOk = await renderCard(client, chat, g);
      const text = withBoard(`${lines.join("\n")}\n\nPilih bidak (${sec.count} bidak bisa jalan)`, g, richOk);
      const ok = await sendList(client, chat, g, text, sec);
      if (!ok) return client.sendMessage(chat, { text: `${text}\n\nKetik langkah, mis. *${p}catur e2e4*` }, { quoted: message });
      return;
    }

    if (["sel", "pilihbidak"].includes(sub)) {
      if (!actorAllowed(g, uid)) return client.sendMessage(chat, { text: "⏳ Bukan giliranmu." }, { quoted: message });
      const from = catur.sqIndex(String(a[1] || "").toLowerCase());
      if (from < 0) return client.sendMessage(chat, { text: `Format: *${p}catur sel e2*` }, { quoted: message });
      const sec = destList(g, from, Number(a[2]) || 0);
      if (!sec) return client.sendMessage(chat, { text: `Bidak ${catur.sq(from)} tidak punya langkah.` }, { quoted: message });

      const targets = catur.legalMoves(g.state).filter((m) => m.from === from).map((m) => m.to);
      const richOk = await renderCard(client, chat, g, { selected: from, targets, hint: `Bidak ${catur.sq(from)} dipilih — klik tujuan` });
      const { lines } = statusText(g);
      const text = withBoard(`${lines.join("\n")}\n\nBidak *${glyphOf(g.state.board[from])} ${catur.sq(from)}* — pilih tujuan (${sec.count})`, g, richOk);
      const ok = await sendList(client, chat, g, text, sec);
      if (!ok) return client.sendMessage(chat, { text: `${text}\n\nKetik mis. *${p}catur ${catur.sq(from)}${catur.sq(catur.legalMoves(g.state).find((m) => m.from === from).to)}*` }, { quoted: message });
      return;
    }

    // hak langkah
    if (g.mode === "pvp") {
      const owner = g.state.turn === "w" ? g.players.white : g.players.black;
      if (uid !== owner) {
        return client.sendMessage(
          chat,
          { text: `⏳ Sekarang giliran ${g.state.turn === "w" ? "putih" : "hitam"} (${owner}), bukan kamu.` },
          { quoted: message }
        );
      }
    } else if (uid !== g.players.white) {
      return client.sendMessage(chat, { text: `Ini catur milik pemain lain. Mulai punyamu: *${p}catur*` }, { quoted: message });
    }

    // ---- jalan ----
    const raw = (sub === "mv" ? a.slice(1) : a).join(" ").trim();
    if (!raw) return await render(client, chat, g, p, "Klik bidak di daftar, atau ketik mis. e2e4");

    const parsed = catur.parseMove(g.state, raw);
    if (parsed.error) return client.sendMessage(chat, { text: `❌ ${parsed.error}` }, { quoted: message });

    const color = g.state.turn;
    let extra = `✅ ${color === "w" ? "Putih" : "Hitam"}: *${playMove(g, parsed.move)}*`;

    if (g.mode === "bot" && !catur.status(g.state).over) {
      const reply = catur.bestMove(g.state, g.level);
      if (reply) extra += `\n🤖 Bot: *${playMove(g, reply)}*`;
    }

    const st = catur.status(g.state);
    if (st.over) {
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
    "♞ *CATUR* — papan di kartu, langkah bisa diklik",
    "",
    `• *${p}catur* — mulai lawan bot (sedang)`,
    `• *${p}catur mudah | sedang | susah* — level bot`,
    `• *${p}catur lawan @user* — lawan pemain (grup)`,
    `• *${p}catur bidak* — buka daftar bidak (klik)`,
    `• klik bidak ▸ klik tujuan — jalan tanpa ngetik`,
    `• *${p}catur e2e4* / *${p}catur nf3* / *${p}catur o-o* — kalau mau ketik`,
    `• *${p}catur papan* — kirim ulang papan`,
    `• *${p}catur undo* — batalkan (mode bot)`,
    `• *${p}catur batal* — berhenti`,
    "",
    "Papan rich hanya tampilan (WhatsApp tak izinkan klik di kartu). Jalan lewat daftar klik di bawah papan."
  ].join("\n");

module.exports = {
  name: "catur",
  command: ["catur", "chess", "caturs"],
  category: "fun",
  description: "Main catur (papan rich card + langkah klik)",
  visible: true,
  execute,
  _internal: { games, newGame, render, keyOf, pvpKey, TTL, pieceList, destList, PAGE_SIZE }
};
