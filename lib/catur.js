// lib/catur.js — mesin catur kecil (legal move gen, status, AI minimax).
// Representasi: index 0..63, row 0 = rank 8, col 0 = file a.
// Piece: "P" putih, "p" hitam (K/Q/R/B/N/P).
const FILES = "abcdefgh";

const sq = (i) => FILES[i % 8] + (8 - (i >> 3));
const sqIndex = (s) => {
  const file = FILES.indexOf(String(s)[0].toLowerCase());
  const rank = Number(String(s)[1]);
  if (file < 0 || !(rank >= 1 && rank <= 8)) return -1;
  return (8 - rank) * 8 + file;
};

const colorOf = (p) => (!p ? null : p === p.toUpperCase() ? "w" : "b");
const other = (c) => (c === "w" ? "b" : "w");
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

const START_ROWS = ["rnbqkbnr", "pppppppp", "........", "........", "........", "........", "PPPPPPPP", "RNBQKBNR"];

const initial = () => ({
  board: START_ROWS.join("").split("").map((c) => (c === "." ? "" : c)),
  turn: "w",
  castling: { wk: true, wq: true, bk: true, bq: true },
  ep: null,
  halfmove: 0,
  fullmove: 1,
  captured: []
});

// FEN -> state (dipakai tes/perft)
const fromFen = (fen) => {
  const [placement, turn = "w", castling = "-", ep = "-", half = "0", full = "1"] = String(fen).trim().split(/\s+/);
  const board = new Array(64).fill("");
  let i = 0;
  for (const ch of placement) {
    if (ch === "/") continue;
    if (/\d/.test(ch)) i += Number(ch);
    else board[i++] = ch;
  }
  const c = String(castling);
  return {
    board,
    turn: turn === "b" ? "b" : "w",
    castling: { wk: c.includes("K"), wq: c.includes("Q"), bk: c.includes("k"), bq: c.includes("q") },
    ep: ep && ep !== "-" ? sqIndex(ep) : null,
    halfmove: Number(half) || 0,
    fullmove: Number(full) || 1,
    captured: []
  };
};

const KNIGHT = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1]
];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIR = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIR = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const addPawn = (moves, from, to, promoteRow, toRow, extra = {}) => {
  if (toRow === promoteRow) {
    for (const promo of ["q", "r", "b", "n"]) moves.push({ from, to, promo, ...extra });
  } else moves.push({ from, to, ...extra });
};

const pseudoMoves = (state, color) => {
  const moves = [];
  const b = state.board;

  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || colorOf(p) !== color) continue;
    const r = i >> 3;
    const c = i & 7;
    const t = p.toUpperCase();

    if (t === "P") {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      const promoteRow = color === "w" ? 0 : 7;

      if (onBoard(r + dir, c) && !b[(r + dir) * 8 + c]) {
        addPawn(moves, i, (r + dir) * 8 + c, promoteRow, r + dir);
        if (r === startRow && !b[(r + 2 * dir) * 8 + c]) {
          moves.push({ from: i, to: (r + 2 * dir) * 8 + c, double: true });
        }
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir;
        const nc = c + dc;
        if (!onBoard(nr, nc)) continue;
        const to = nr * 8 + nc;
        const q = b[to];
        if (q && colorOf(q) !== color) addPawn(moves, i, to, promoteRow, nr, { capture: true });
        else if (!q && state.ep === to) moves.push({ from: i, to, ep: true, capture: true });
      }
      continue;
    }

    if (t === "N" || t === "K") {
      const steps = t === "N" ? KNIGHT : KING;
      for (const [dr, dc] of steps) {
        const nr = r + dr;
        const nc = c + dc;
        if (!onBoard(nr, nc)) continue;
        const to = nr * 8 + nc;
        const q = b[to];
        if (q && colorOf(q) === color) continue;
        moves.push({ from: i, to, capture: !!q });
      }
      if (t === "K") {
        const { castling } = state;
        const home = color === "w" ? 60 : 4;
        if (i === home && !attacked(state, home, other(color))) {
          if (color === "w") {
            if (castling.wk && !b[61] && !b[62] && b[63] === "R" && !attacked(state, 61, "b") && !attacked(state, 62, "b")) {
              moves.push({ from: 60, to: 62, castle: "k" });
            }
            if (castling.wq && !b[59] && !b[58] && !b[57] && b[56] === "R" && !attacked(state, 59, "b") && !attacked(state, 58, "b")) {
              moves.push({ from: 60, to: 58, castle: "q" });
            }
          } else {
            if (castling.bk && !b[5] && !b[6] && b[7] === "r" && !attacked(state, 5, "w") && !attacked(state, 6, "w")) {
              moves.push({ from: 4, to: 6, castle: "k" });
            }
            if (castling.bq && !b[3] && !b[2] && !b[1] && b[0] === "r" && !attacked(state, 3, "w") && !attacked(state, 2, "w")) {
              moves.push({ from: 4, to: 2, castle: "q" });
            }
          }
        }
      }
      continue;
    }

    const dirs = t === "R" ? ROOK_DIR : t === "B" ? BISHOP_DIR : ROOK_DIR.concat(BISHOP_DIR);
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (onBoard(nr, nc)) {
        const to = nr * 8 + nc;
        const q = b[to];
        if (q && colorOf(q) === color) break;
        moves.push({ from: i, to, capture: !!q });
        if (q) break;
        nr += dr;
        nc += dc;
      }
    }
  }

  return moves;
};

const attacked = (state, target, byColor) => {
  const b = state.board;
  const tr = target >> 3;
  const tc = target & 7;

  // pion
  const pawnDir = byColor === "w" ? 1 : -1; // pion putih menyerang ke atas (row-1), jadi ada di row+1
  for (const dc of [-1, 1]) {
    const r = tr + pawnDir;
    const c = tc + dc;
    if (!onBoard(r, c)) continue;
    const p = b[r * 8 + c];
    if (p && colorOf(p) === byColor && p.toUpperCase() === "P") return true;
  }

  for (const [dr, dc] of KNIGHT) {
    const r = tr + dr;
    const c = tc + dc;
    if (!onBoard(r, c)) continue;
    const p = b[r * 8 + c];
    if (p && colorOf(p) === byColor && p.toUpperCase() === "N") return true;
  }

  for (const [dr, dc] of KING) {
    const r = tr + dr;
    const c = tc + dc;
    if (!onBoard(r, c)) continue;
    const p = b[r * 8 + c];
    if (p && colorOf(p) === byColor && p.toUpperCase() === "K") return true;
  }

  for (const [dr, dc] of ROOK_DIR) {
    let r = tr + dr;
    let c = tc + dc;
    while (onBoard(r, c)) {
      const p = b[r * 8 + c];
      if (p) {
        if (colorOf(p) === byColor && /[RQ]/.test(p.toUpperCase())) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  for (const [dr, dc] of BISHOP_DIR) {
    let r = tr + dr;
    let c = tc + dc;
    while (onBoard(r, c)) {
      const p = b[r * 8 + c];
      if (p) {
        if (colorOf(p) === byColor && /[BQ]/.test(p.toUpperCase())) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
};

const kingIndex = (state, color) => {
  const king = color === "w" ? "K" : "k";
  for (let i = 0; i < 64; i++) if (state.board[i] === king) return i;
  return -1;
};

const inCheck = (state, color) => {
  const k = kingIndex(state, color);
  return k >= 0 && attacked(state, k, other(color));
};

const applyMove = (state, move) => {
  const next = {
    board: state.board.slice(),
    turn: other(state.turn),
    castling: { ...state.castling },
    ep: null,
    halfmove: state.halfmove + 1,
    fullmove: state.fullmove + (state.turn === "b" ? 1 : 0),
    captured: state.captured.slice()
  };

  const p = next.board[move.from];
  const mover = colorOf(p);
  const target = next.board[move.to];

  if (move.ep) {
    const capIdx = move.to + (mover === "w" ? 8 : -8);
    const capPiece = next.board[capIdx];
    if (capPiece) next.captured.push(capPiece);
    next.board[capIdx] = "";
  } else if (target) {
    next.captured.push(target);
  }

  next.board[move.from] = "";
  next.board[move.to] = move.promo ? (mover === "w" ? move.promo.toUpperCase() : move.promo) : p;

  if (!target && !move.ep && p.toUpperCase() === "P" && Math.abs(move.to - move.from) === 16) {
    next.ep = (move.from + move.to) / 2;
  }

  if (move.castle) {
    if (move.castle === "k") {
      const rf = mover === "w" ? 63 : 7;
      const rt = mover === "w" ? 61 : 5;
      next.board[rt] = next.board[rf];
      next.board[rf] = "";
    } else {
      const rf = mover === "w" ? 56 : 0;
      const rt = mover === "w" ? 59 : 3;
      next.board[rt] = next.board[rf];
      next.board[rf] = "";
    }
  }

  if (p === "K") next.castling.wk = next.castling.wq = false;
  if (p === "k") next.castling.bk = next.castling.bq = false;
  if (move.from === 56 || move.to === 56) next.castling.wq = false;
  if (move.from === 63 || move.to === 63) next.castling.wk = false;
  if (move.from === 0 || move.to === 0) next.castling.bq = false;
  if (move.from === 7 || move.to === 7) next.castling.bk = false;

  if (p.toUpperCase() === "P" || target) next.halfmove = 0;

  return next;
};

const legalMoves = (state, color = state.turn) => {
  const out = [];
  for (const m of pseudoMoves(state, color)) {
    const next = applyMove({ ...state, turn: color }, m);
    if (!inCheck(next, color)) out.push(m);
  }
  return out;
};

const insufficient = (state) => {
  const pieces = state.board.filter(Boolean);
  if (pieces.length > 4) return false;
  const noPawns = !pieces.some((p) => /[Pp]/.test(p));
  if (!noPawns) return false;
  const others = pieces.filter((p) => !/[Kk]/.test(p));
  if (others.length === 0) return true; // K vs K
  if (others.length === 1 && /[BbNn]/.test(others[0])) return true; // K+B/N vs K
  return false;
};

const status = (state) => {
  const moves = legalMoves(state);
  const check = inCheck(state, state.turn);

  if (!moves.length) {
    return check
      ? { over: true, type: "checkmate", winner: other(state.turn), check: true, moves }
      : { over: true, type: "stalemate", winner: null, check: false, moves };
  }
  if (state.halfmove >= 100) return { over: true, type: "fifty", winner: null, check, moves };
  if (insufficient(state)) return { over: true, type: "material", winner: null, check, moves };
  return { over: false, type: "playing", winner: null, check, moves };
};

// ---------- notasi ----------
const pieceFrom = (state, move) => state.board[move.from];

const describe = (state, move) => {
  const p = pieceFrom(state, move);
  if (move.castle) return move.castle === "k" ? "O-O" : "O-O-O";
  const t = p.toUpperCase();
  const letter = t === "P" ? "" : t;
  return `${letter}${sq(move.from)}${move.capture ? "x" : "-"}${sq(move.to)}${move.promo ? "=" + move.promo.toUpperCase() : ""}`;
};

const san = (state, move) => {
  const p = pieceFrom(state, move);
  if (move.castle) {
    const base = move.castle === "k" ? "O-O" : "O-O-O";
    return base + suffix(state, move);
  }
  const t = p.toUpperCase();
  const target = state.board[move.to];
  let s = "";
  if (t === "P") {
    if (move.capture || move.ep) s += FILES[move.from & 7] + "x";
    s += sq(move.to);
    if (move.promo) s += "=" + move.promo.toUpperCase();
  } else {
    s += t;
    s += captureHint(state, move);
    if (move.capture || target) s += "x";
    s += sq(move.to);
  }
  return s + suffix(state, move);
};

const captureHint = (state, move) => {
  const t = pieceFrom(state, move).toUpperCase();
  const others = legalMoves(state).filter(
    (m) => m.to === move.to && m.from !== move.from && pieceFrom(state, m).toUpperCase() === t
  );
  if (!others.length) return "";
  const sameFile = others.some((m) => (m.from & 7) === (move.from & 7));
  const sameRank = others.some((m) => (m.from >> 3) === (move.from >> 3));
  if (!sameFile) return FILES[move.from & 7];
  if (!sameRank) return String(8 - (move.from >> 3));
  return sq(move.from);
};

const suffix = (state, move) => {
  const next = applyMove(state, move);
  const st = status(next);
  if (st.type === "checkmate") return "#";
  if (st.check) return "+";
  return "";
};

const pick = (state, moves, predicate, label) => {
  const found = moves.filter(predicate);
  if (found.length === 1) return { move: found[0] };
  if (!found.length) return { error: `Langkah ${label || ""} tidak sah.` };
  return {
    error: `Langkah ambigu (${found.map((m) => sq(m.from) + sq(m.to)).join(", ")}). Tulis lengkap, mis. ${sq(found[0].from)}${sq(found[0].to)}.`
  };
};

// dukung: e2e4, e2-e4, "e2 e4", Nf3, nf3, e4, O-O, e7e8q, exd5
const parseMove = (state, raw) => {
  const moves = legalMoves(state);
  if (!moves.length) return { error: "Tidak ada langkah tersisa." };

  let t = String(raw || "").toLowerCase().replace(/[+#!?]/g, "").replace(/\s+/g, "").trim();
  if (!t) return { error: "Langkah kosong." };

  if (t === "o-o-o" || t === "0-0-0" || t === "ooo") return pick(state, moves, (m) => m.castle === "q", t);
  if (t === "o-o" || t === "0-0" || t === "oo") return pick(state, moves, (m) => m.castle === "k", t);

  const coord = t.match(/^([a-h][1-8])-?([a-h][1-8])([qrbn])?$/);
  if (coord) {
    const from = sqIndex(coord[1]);
    const to = sqIndex(coord[2]);
    const promo = coord[3];
    const found = moves.filter((m) => m.from === from && m.to === to && (!promo || m.promo === promo));
    if (found.length) return { move: found.sort((a, b2) => (a.promo === "q" ? -1 : 0) - (b2.promo === "q" ? -1 : 0))[0] };
    return { error: `Langkah ${coord[1]}${coord[2]} tidak sah.` };
  }

  const san = t.match(/^([nbrqk])?([a-h])?([1-8])?x?([a-h][1-8])(?:=?([qrbn]))?$/);
  if (san) {
    const [, pieceLetter, fromFile, fromRank, toSq, promo] = san;
    const type = pieceLetter ? pieceLetter.toUpperCase() : "P";
    const to = sqIndex(toSq);
    return pick(
      state,
      moves,
      (m) => {
        const p = pieceFrom(state, m);
        if (!p || p.toUpperCase() !== type) return false;
        if (m.to !== to) return false;
        if (promo && m.promo !== promo) return false;
        if (fromFile && FILES[m.from & 7] !== fromFile) return false;
        if (fromRank && String(8 - (m.from >> 3)) !== fromRank) return false;
        return true;
      },
      t
    );
  }

  return { error: `Format langkah tidak dikenal: ${raw}` };
};

// ---------- AI ----------
const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

const centerBonus = (i) => {
  const r = i >> 3;
  const c = i & 7;
  const d = Math.abs(3.5 - r) + Math.abs(3.5 - c);
  return Math.round((7 - d) * 2);
};

const evaluate = (state) => {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const t = p.toUpperCase();
    const sign = colorOf(p) === "w" ? 1 : -1;
    let v = VAL[t] + centerBonus(i);
    if (t === "P") v += colorOf(p) === "w" ? (6 - (i >> 3)) * 4 : ((i >> 3) - 1) * 4;
    if (t === "N" || t === "B") v += Math.round(centerBonus(i) / 2);
    score += sign * v;
  }
  return score;
};

const orderMoves = (state, moves) =>
  moves
    .map((m) => {
      const victim = state.board[m.to];
      const score = (victim ? VAL[victim.toUpperCase()] : 0) + (m.promo ? VAL.Q : 0);
      return { m, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);

const search = (state, depth, alpha, beta) => {
  const moves = legalMoves(state);
  if (!moves.length) return inCheck(state, state.turn) ? -100000 - depth : 0;
  if (depth <= 0) return evaluate(state) * (state.turn === "w" ? 1 : -1);

  let best = -Infinity;
  for (const m of orderMoves(state, moves)) {
    const score = -search(applyMove(state, m), depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
};

const LEVELS = { mudah: 1, sedang: 2, susah: 3 };

const bestMove = (state, level = "sedang") => {
  const depth = LEVELS[String(level).toLowerCase()] || 2;
  const moves = legalMoves(state);
  if (!moves.length) return null;

  const scored = orderMoves(state, moves).map((m) => ({
    move: m,
    score: -search(applyMove(state, m), depth - 1, -Infinity, Infinity)
  }));

  scored.sort((a, b) => b.score - a.score);

  if (depth === 1) {
    // mudah: pilih acak dari 3 teratas
    const top = scored.slice(0, Math.min(3, scored.length));
    return top[Math.floor(Math.random() * top.length)].move;
  }

  // sedikit acak di antara nilai setara
  const best = scored[0].score;
  const tied = scored.filter((s) => s.score >= best - 8);
  return tied[Math.floor(Math.random() * tied.length)].move;
};

module.exports = {
  FILES,
  sq,
  sqIndex,
  colorOf,
  initial,
  fromFen,
  pseudoMoves,
  legalMoves,
  applyMove,
  inCheck,
  status,
  parseMove,
  describe,
  san,
  evaluate,
  bestMove,
  LEVELS
};
