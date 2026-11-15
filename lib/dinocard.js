// lib/dinocard.js — kartu rich HTML (statis, TANPA JS) untuk .dino.
// Webview beberapa client tak mengeksekusi JS kartu, jadi scene digambar pakai <div>+CSS,
// bukan canvas. Papan hanya tampilan; aksi tetap lewat tombol chat.
const { esc } = require("./richcard");

const CSS = `
.dn-wrap{display:flex;justify-content:center;padding:6px}
.dn-card{width:100%;max-width:346px;border-radius:22px;overflow:hidden;background:#0b0813;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;box-shadow:0 18px 40px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.1)}
.dn-top{height:3px;background:linear-gradient(90deg,#7c3aed,#38bdf8,#7c3aed)}
.dn-body{padding:13px}
.dn-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.dn-ico{width:42px;height:42px;flex:none;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7c3aed,#38bdf8)}
.dn-ico svg{width:23px;height:23px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dn-eye{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#a8a3bd}
.dn-ttl{font-size:16px;font-weight:800;margin-top:2px}
.dn-badge{margin-left:auto;flex:none;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:5px 9px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)}
.dn-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.dn-stat{padding:8px 11px;border-radius:13px;background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.1);font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#a8a3bd}
.dn-stat b{display:block;margin-top:2px;font-size:18px;letter-spacing:0;text-transform:none;color:#fff}
.dn-stat.r{text-align:right}
.dn-scene{position:relative;height:150px;border-radius:16px;overflow:hidden;background:linear-gradient(180deg,#170f2b 0%,#241447 58%,#2c1a52 100%);border:1px solid rgba(255,255,255,.1)}
.dn-glow{position:absolute;width:150px;height:150px;left:-40px;top:-56px;border-radius:50%;background:rgba(124,58,237,.5);filter:blur(30px)}
.dn-moon{position:absolute;right:16px;top:13px;width:24px;height:24px;border-radius:50%;background:#f4e6c8;box-shadow:0 0 18px rgba(244,230,200,.55)}
.dn-stars{position:absolute;inset:0;background-image:radial-gradient(#fff 1px,transparent 1px),radial-gradient(#fff 1px,transparent 1px);background-size:52px 40px,86px 62px;background-position:6px 8px,30px 22px;opacity:.28}
.dn-ground{position:absolute;left:0;right:0;bottom:22px;height:2px;background:rgba(255,255,255,.30)}
.dn-tick{position:absolute;bottom:16px;width:4px;height:1.5px;background:rgba(255,255,255,.22)}
.dn-dino,.dn-obs{position:absolute;bottom:24px}
.dn-dino{left:18px;width:44px;height:44px}
.dn-dino i,.dn-obs i{position:absolute;display:block}
.dn-tail{left:0;bottom:12px;width:14px;height:8px;background:#9af7c4;border-radius:2px 0 0 2px}
.dn-torso{left:8px;bottom:8px;width:24px;height:22px;background:#9af7c4;border-radius:3px}
.dn-head{left:22px;bottom:26px;width:20px;height:16px;background:#9af7c4;border-radius:3px}
.dn-eye{left:35px;bottom:35px;width:4px;height:4px;background:#0b0813;border-radius:1px}
.dn-arm{left:28px;bottom:19px;width:9px;height:5px;background:#9af7c4;border-radius:2px}
.dn-leg1{left:11px;bottom:0;width:6px;height:10px;background:#9af7c4}
.dn-leg2{left:23px;bottom:0;width:6px;height:13px;background:#9af7c4}
.dn-obs{right:26px}
.dn-cactus{width:26px;height:44px}
.dn-cactus .trunk{left:8px;bottom:0;width:9px;height:44px;background:#5dffa7;border-radius:3px}
.dn-cactus .l1{left:0;bottom:16px;width:9px;height:6px;background:#5dffa7;border-radius:2px}
.dn-cactus .l2{left:0;bottom:20px;width:5px;height:12px;background:#5dffa7;border-radius:2px}
.dn-cactus .r1{left:16px;bottom:24px;width:9px;height:6px;background:#5dffa7;border-radius:2px}
.dn-cactus .r2{left:20px;bottom:28px;width:5px;height:12px;background:#5dffa7;border-radius:2px}
.dn-bird{width:30px;height:20px;bottom:64px}
.dn-bird .b1{left:5px;bottom:0;width:20px;height:12px;background:#ff8ba7;border-radius:6px 4px 6px 4px}
.dn-bird .b2{left:0;bottom:8px;width:14px;height:5px;background:#ff8ba7;border-radius:4px 2px 2px 4px}
.dn-bird .b3{left:24px;bottom:6px;width:6px;height:4px;background:#ffd166;border-radius:1px}
.dn-foot{margin-top:10px;text-align:center;font-size:10px;line-height:1.6;color:#a8a3bd}
`;

const DINO_ICON = '<path d="M4 20v-4h3l2-6h5V7l3-2 3 3v4h-3l-1 4h-4l-2 4H4z"/>';

const ticks = (n) =>
  Array.from({ length: 10 }, (_, i) => `<span class="dn-tick" style="left:${8 + i * 9.4}%"></span>`).join("");

const obstacle = (type) =>
  `<div class="dn-obs ${type === "duck" ? "dn-bird" : "dn-cactus"}">${type === "duck"
    ? '<i class="b1"></i><i class="b2"></i><i class="b3"></i>'
    : '<i class="trunk"></i><i class="l1"></i><i class="l2"></i><i class="r1"></i><i class="r2"></i>'}</div>`;

// data: { score, top, round, obstacle: "jump"|"duck", secs }
const sceneCard = (d = {}) =>
  `<style>${CSS}</style>
<div class="dn-wrap"><div class="dn-card">
<div class="dn-top"></div>
<div class="dn-body">
<div class="dn-head"><div class="dn-ico"><svg viewBox="0 0 24 24">${DINO_ICON}</svg></div><div><div class="dn-eye">Zenyn Game</div><div class="dn-ttl">Dino Run</div></div><div class="dn-badge">Ronde ${esc(d.round ?? 1)}</div></div>
<div class="dn-stats"><div class="dn-stat">Score:<b>${esc(d.score ?? 0)}</b></div><div class="dn-stat r">Top Score:<b>${esc(d.top ?? 0)}</b></div></div>
<div class="dn-scene"><div class="dn-glow"></div><div class="dn-stars"></div><div class="dn-moon"></div>
<div class="dn-dino"><i class="dn-tail"></i><i class="dn-torso"></i><i class="dn-head"></i><i class="dn-eye"></i><i class="dn-arm"></i><i class="dn-leg1"></i><i class="dn-leg2"></i></div>
${obstacle(d.obstacle)}
<div class="dn-ground"></div>${ticks()}
</div>
<div class="dn-foot">${esc(d.secs)}s lagi · tap tombol di chat untuk aksi</div>
</div></div></div>`;

module.exports = { sceneCard };
