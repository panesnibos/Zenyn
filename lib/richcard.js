// lib/richcard.js — kartu HTML untuk rich message WhatsApp (richResponseMessage).
// Gaya mirip Meta AI card: self-contained, NOL emoji (webview WA blokir CDN + font),
// ikon = SVG inline. Payload dirender WhatsApp di dalam bubble.

const esc = (t = '') =>
  String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// ikon vektor 24x24 (gaya Feather/MIT)
const ICONS = {
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  crown: '<path d="M3 7l4 4 5-6 5 6 4-4v11H3z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'
};

const FILLED = new Set(["crown", "zap"]);

const symbol = (name, inner) =>
  `<symbol id="i-${name}" viewBox="0 0 24 24"><g fill="${FILLED.has(name) ? "currentColor" : "none"}" stroke="${FILLED.has(name) ? "none" : "currentColor"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g></symbol>`;

const sprite = (names) =>
  `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${[...new Set(names)]
    .map((n) => symbol(n, ICONS[n] || ICONS.grid))
    .join("")}</svg>`;

const ic = (name, cls = "fi") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${ICONS[name] ? name : "grid"}"/></svg>`;

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
.card{position:relative;width:100%;max-width:346px;margin:0 auto;border-radius:24px;overflow:hidden;background:var(--deep);box-shadow:0 22px 48px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.1);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.card::after{content:'';position:absolute;inset:0;border-radius:24px;pointer-events:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
.bg{position:absolute;inset:-30%;width:160%;height:160%;object-fit:cover;filter:blur(40px) saturate(1.6);opacity:.5}
.orb{position:absolute;border-radius:50%;filter:blur(46px);pointer-events:none}
.o1{width:200px;height:200px;right:-64px;top:-76px;background:var(--a);opacity:.5}
.o2{width:180px;height:180px;left:-78px;bottom:-66px;background:var(--b);opacity:.3}
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(12,8,18,.5) 0%,rgba(9,6,13,.9) 40%,rgba(7,5,11,.98) 100%)}
.topline{position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,var(--a),var(--b),var(--a));z-index:3}
.content{position:relative;padding:16px 14px 14px;z-index:2}
.fi{width:1em;height:1em;fill:none;stroke:currentColor;flex:none;vertical-align:-.14em}
.head{display:flex;align-items:center;gap:11px;margin-bottom:12px}
.ico{width:48px;height:48px;flex:none;border-radius:16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--a),var(--b));box-shadow:0 8px 18px rgba(0,0,0,.4)}
.ico .fi{width:24px;height:24px;color:#fff}
.ht{min-width:0;flex:1}
.eyebrow{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#a8a3bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.title{font-size:17px;font-weight:800;line-height:1.22;margin-top:2px;word-break:break-word}
.badge{flex:none;font-size:9px;font-weight:800;padding:5px 9px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.15);letter-spacing:.05em;text-transform:uppercase}
.body{display:flex;flex-direction:column;gap:10px}
.panel{background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:3px 12px}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07)}
.row:last-child{border-bottom:0}
.k{display:flex;align-items:center;font-size:11.5px;color:#a8a3bd}
.ki{display:inline-flex;align-items:center;justify-content:center;width:23px;height:23px;margin-right:8px;border-radius:8px;background:rgba(255,255,255,.1)}
.ki .fi{width:12px;height:12px;color:var(--b)}
.v{font-size:13px;font-weight:700;text-align:right;word-break:break-word}
.pf{display:flex;align-items:center;gap:12px}
.av{width:58px;height:58px;border-radius:50%;object-fit:cover;flex:none;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;background:linear-gradient(135deg,var(--a),var(--b));color:#0b0716;border:3px solid var(--deep);box-shadow:0 0 20px var(--a)}
.pf .nm{font-size:17px;font-weight:800;word-break:break-word}
.pf .sb{font-size:10.5px;color:#b7b1cc;margin-top:3px;display:flex;align-items:center;gap:4px}
.sb .fi{width:11px;height:11px;color:var(--b)}
.pb{display:flex;flex-direction:column;gap:6px;padding:9px 0}
.pb .t{display:flex;justify-content:space-between;font-size:11.5px;color:#a8a3bd}
.pb .t b{color:#fff}
.tr{height:9px;border-radius:9px;background:rgba(255,255,255,.14);overflow:hidden}
.fl{height:100%;border-radius:9px;background:linear-gradient(90deg,var(--a),var(--b))}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tile{background:linear-gradient(160deg,rgba(255,255,255,.11),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.1);border-radius:15px;padding:10px 11px;min-width:0}
.tile .tl{display:flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#a8a3bd}
.tile .tl .fi{width:12px;height:12px;color:var(--h,#60a5fa)}
.tile .tv{font-size:16px;font-weight:800;margin-top:4px;word-break:break-word}
.catrow{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:15px;background:linear-gradient(90deg,rgba(255,255,255,.09),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.08)}
.catrow .ce{width:38px;height:38px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex:none;background:var(--cc,linear-gradient(135deg,var(--a),var(--b)))}
.catrow .ce .fi{width:19px;height:19px;color:#fff}
.catrow .tx{min-width:0;flex:1}
.catrow .n{font-size:13px;font-weight:800}
.catrow .d{font-size:10.5px;color:#a8a3bd;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.catrow .cnt{flex:none;font-size:11px;font-weight:800;padding:3px 9px;border-radius:99px;background:rgba(255,255,255,.13)}
.foot{margin-top:12px;text-align:center;font-size:10px;color:#a8a3bd;line-height:1.6;letter-spacing:.03em}
.foot::before{content:'';display:block;height:1px;margin:0 18px 9px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent)}
`;

// data: { brand, eyebrow, title, badge, greeting, name, role, roleIcon, avatar(dataURI),
//         level, expPct, expText, uptime, clock, tiles:[{l,v,fa,hue}], cats:[{n,d,cnt,fa,cc}], foot }
const card = (d = {}) => {
  const names = ["user", "users", "clock", "zap", "grid", "target", "tool", "download", "info", "cpu", "settings", "shield", "crown", "wrench"];
  const roleIc = ICONS[d.roleIcon] ? d.roleIcon : "user";

  const avatar = d.avatar
    ? `<img class="av" src="${esc(d.avatar)}" alt="">`
    : `<div class="av">${esc((String(d.name || "?").trim()[0] || "?").toUpperCase())}</div>`;

  const tiles = (d.tiles || [])
    .map(
      (t) =>
        `<div class="tile" style="--h:${esc(t.hue || "#60a5fa")}"><div class="tl">${t.fa ? ic(t.fa) : ""}${esc(t.l)}</div><div class="tv">${esc(t.v)}</div></div>`
    )
    .join("");

  const cats = (d.cats || [])
    .map(
      (c) =>
        `<div class="catrow"><div class="ce" style="--cc:${esc(c.cc || "linear-gradient(135deg,#6366f1,#38bdf8)")}">${ic(c.fa || "grid")}</div><div class="tx"><div class="n">${esc(c.n)}</div><div class="d">${esc(c.d || "")}</div></div><div class="cnt">${esc(c.cnt)}</div></div>`
    )
    .join("");

  const pct = Math.max(0, Math.min(100, Number(d.expPct) || 0));

  const head = d.title
    ? `<div class="head"><div class="ico">${ic(d.icon || "grid")}</div><div class="ht"><div class="eyebrow">${esc(d.eyebrow || d.brand || "")}</div><div class="title">${esc(d.title)}</div></div>${d.badge ? `<div class="badge">${esc(d.badge)}</div>` : ""}</div>`
    : "";

  const profile = d.name
    ? `<div class="panel"><div class="pf">${avatar}<div style="min-width:0"><div class="nm">${esc(d.name)}</div><div class="sb">${ic(roleIc)}${esc(d.role || "")}</div></div></div></div>`
    : "";

  const bar = d.name
    ? `<div class="panel"><div class="pb"><div class="t"><span>Level ${esc(d.level ?? 0)}</span><span><b>${pct}%</b>${d.expText ? ` · ${esc(d.expText)}` : ""}</span></div><div class="tr"><div class="fl" style="width:${pct}%"></div></div></div></div>`
    : "";

  return `${sprite(names)}<style>${CSS}</style>
<div class="wrap" style="display:flex;justify-content:center;padding:8px"><div class="card" style="--a:${esc(d.a || "#7c3aed")};--b:${esc(d.b || "#38bdf8")};--deep:${esc(d.deep || "#0c0a16")}">
${d.avatar ? `<img class="bg" src="${esc(d.avatar)}" alt="">` : ""}<div class="orb o1"></div><div class="orb o2"></div><div class="veil"></div><div class="topline"></div>
<div class="content">${head}<div class="body">${profile}${bar}${tiles ? `<div class="tiles">${tiles}</div>` : ""}${cats}</div>${d.foot ? `<div class="foot">${esc(d.foot)}</div>` : ""}</div>
</div></div>`;
};

module.exports = { card, esc, ICONS };
