// lib/caturcard.js — render papan catur jadi kartu HTML rich message.
// Statis (tanpa JS): papan hanya tampilan, langkah diketik lewat command.
const { esc } = require("./richcard");
const { FILES, sq } = require("./catur");

const GLYPH = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
const GLYPH_OUT = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" };

const CSS = `
.ct-wrap{display:flex;justify-content:center;padding:6px}
.ct-card{width:100%;max-width:346px;border-radius:22px;overflow:hidden;background:#0c0a16;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;box-shadow:0 18px 40px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.1)}
.ct-top{height:3px;background:linear-gradient(90deg,#f59e0b,#7c3aed,#38bdf8)}
.ct-body{padding:13px 13px 12px}
.ct-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.ct-ico{width:44px;height:44px;flex:none;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7c3aed,#38bdf8);font-size:24px;line-height:1}
.ct-eye{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#a8a3bd}
.ct-title{font-size:16px;font-weight:800;margin-top:2px}
.ct-badge{margin-left:auto;flex:none;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:5px 9px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)}
.ct-panel{background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:2px 11px;margin-bottom:10px}
.ct-row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:11.5px}
.ct-row:last-child{border-bottom:0}
.ct-k{color:#a8a3bd}
.ct-v{font-weight:700;text-align:right}
.ct-board{display:grid;grid-template-columns:repeat(8,1fr);border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 22px rgba(0,0,0,.45)}
.ct-sq{position:relative;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;line-height:1}
.ct-light{background:#e8edf6}
.ct-dark{background:#8b9dbb}
.ct-from{box-shadow:inset 0 0 0 3px rgba(245,158,11,.8)}
.ct-to{background:#f2c86b}
.ct-check{background:#e4675f}
.ct-p{font-size:25px;font-family:'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols 2','Noto Sans Symbols','DejaVu Sans',sans-serif}
.ct-w{color:#fbfdff;text-shadow:-1px -1px 0 #0b1220,1px -1px 0 #0b1220,-1px 1px 0 #0b1220,1px 1px 0 #0b1220,0 2px 3px rgba(0,0,0,.45)}
.ct-b{color:#0f172a;text-shadow:0 0 1px rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.35)}
.ct-coord{position:absolute;font-size:8px;font-weight:800;color:#0b1220;opacity:.5}
.ct-rank{top:2px;left:3px}
.ct-file{bottom:1px;right:3px}
.ct-foot{margin-top:10px;text-align:center;font-size:10px;line-height:1.6;color:#a8a3bd;letter-spacing:.02em}
`;

const pieceHtml = (p) =>
  `<span class="ct-p ${p === p.toUpperCase() ? "ct-w" : "ct-b"}">${GLYPH[p.toUpperCase()] || ""}</span>`;

// data: { state, status, level, mode, players:{white,black}, last, hint }
const boardCard = (d = {}) => {
  const { state, status } = d;
  const last = d.last || {};
  const checkKing = status?.check ? findKing(state, state.turn) : -1;

  let squares = "";
  for (let i = 0; i < 64; i++) {
    const r = i >> 3;
    const c = i & 7;
    const p = state.board[i];
    const cls = ["ct-sq", (r + c) % 2 === 0 ? "ct-light" : "ct-dark"];
    if (i === last.from) cls.push("ct-from");
    if (i === last.to) cls.push("ct-to");
    if (i === checkKing) cls.push("ct-check");

    const rank = r === 7 ? `<span class="ct-coord ct-file">${FILES[c]}</span>` : "";
    const file = c === 0 ? `<span class="ct-coord ct-rank">${8 - r}</span>` : "";

    squares += `<div class="${cls.join(" ")}">${file}${p ? pieceHtml(p) : ""}${rank}</div>`;
  }

  const turnLabel = state.turn === "w" ? "Putih" : "Hitam";
  const rows = [
    ["Mode", d.mode === "pvp" ? "Lawan pemain" : `Bot (${String(d.level || "sedang")})`],
    ["Giliran", `${turnLabel}${status?.check ? " • SEKAK" : ""}`],
    ["Langkah", `${state.fullmove} (${state.turn === "w" ? "putih" : "hitam"} jalan)`]
  ];
  if (d.players) rows.push(["Pemain", `${d.players.white || "-"} vs ${d.players.black || "-"}`]);

  const cap = state.captured || [];
  if (cap.length) {
    const w = cap.filter((p) => p === p.toUpperCase()).map((p) => GLYPH[p]).join(" ");
    const b = cap.filter((p) => p === p.toLowerCase()).map((p) => GLYPH[p.toUpperCase()]).join(" ");
    rows.push(["Tertangkap", `${w || "-"} ${b ? `/ ${b}` : ""}`.trim()]);
  }

  const panel = rows
    .map(([k, v]) => `<div class="ct-row"><span class="ct-k">${esc(k)}</span><span class="ct-v">${esc(v)}</span></div>`)
    .join("");

  const headline = d.headline || (status?.over ? "Selesai" : `Giliran ${turnLabel}`);

  return `<style>${CSS}</style>
<div class="ct-wrap"><div class="ct-card">
<div class="ct-top"></div>
<div class="ct-body">
<div class="ct-head"><div class="ct-ico">♞</div><div><div class="ct-eye">Catur • Zenyn</div><div class="ct-title">${esc(headline)}</div></div><div class="ct-badge">${esc(d.badge || d.level || "sedang")}</div></div>
<div class="ct-panel">${panel}</div>
<div class="ct-board">${squares}</div>
<div class="ct-foot">${esc(d.hint || "")}</div>
</div></div></div>`;
};

const findKing = (state, color) => {
  const king = color === "w" ? "K" : "k";
  for (let i = 0; i < 64; i++) if (state.board[i] === king) return i;
  return -1;
};

const textBoard = (state, last = {}) => {
  const lines = [];
  lines.push("    a b c d e f g h");
  for (let r = 0; r < 8; r++) {
    const cells = [];
    for (let c = 0; c < 8; c++) {
      const i = r * 8 + c;
      const p = state.board[i];
      cells.push(p ? (p === p.toUpperCase() ? GLYPH_OUT[p.toUpperCase()] : GLYPH[p.toUpperCase()]) : "·");
    }
    lines.push(`${8 - r}   ${cells.join(" ")}   ${8 - r}`);
  }
  lines.push("    a b c d e f g h");
  if (last.from !== undefined) lines.push(`Langkah terakhir: ${sq(last.from)}-${sq(last.to)}`);
  return lines.join("\n");
};

module.exports = { boardCard, textBoard, GLYPH };
