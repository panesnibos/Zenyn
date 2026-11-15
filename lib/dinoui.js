// lib/dinoui.js — game dino runner HTML untuk kartu rich WhatsApp.
// Semua jalan di dalam kartu (tap = lompat, tahan = merunduk), skor di HUD kartu.
// Top score disimpan per nama di localStorage kartu (per user), bukan di bot.
// Self-contained: tanpa CDN/font/script luar (webview WhatsApp blokir resource luar).
//
// Angka dunia: lebar desain 360, tinggi 180, tanah di y=150. Semua koordinat
// gambar memakai satuan dunia; ctx di-scale oleh fit() supaya tajam di semua layar.

const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Zenyn Dino</title>
<style>
:root{--line:rgba(255,255,255,.09);--text:#fff;--muted:#aaa1ae}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0;background:radial-gradient(circle at top,#21101c 0%,#0b080d 45%,#050407 100%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
body{min-height:100vh;padding:10px}.app{width:min(100%,760px);margin:auto}
.header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.avatar{width:46px;height:46px;border-radius:15px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7c3aed,#38bdf8);font-size:25px}
.title{font-size:19px;font-weight:800}.subtitle{color:var(--muted);font-size:11px;margin-top:2px}
.hud{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.stat{padding:9px 12px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.04);color:var(--muted);font-size:11px;letter-spacing:.3px}
.stat b{display:block;margin-top:2px;color:#fff;font:800 17px ui-monospace,SFMono-Regular,Menlo,monospace}
.stat.top{text-align:right}
.field{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 11px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.035)}
.field label{color:var(--muted);font-size:11px}
.field input{flex:1;min-width:0;border:0;background:transparent;color:#fff;font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;outline:none}
.wrap{position:relative;border-radius:21px;padding:7px;background:linear-gradient(145deg,rgba(255,255,255,.10),rgba(255,255,255,.025));box-shadow:0 20px 60px rgba(0,0,0,.45),0 0 40px rgba(124,58,237,.18)}
canvas{display:block;width:100%;aspect-ratio:2/1;border-radius:15px;background:#0a0810;touch-action:none;user-select:none}
.over{position:absolute;inset:7px;border-radius:15px;display:none;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px;text-align:center;background:rgba(6,4,9,.84);backdrop-filter:blur(6px)}
.over.show{display:flex}
.over h2{margin:0;font-size:22px}.over p{margin:0;color:var(--muted);font-size:12px}
.over b{color:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.btn{min-height:46px;border-radius:13px;border:1px solid var(--line);background:rgba(255,255,255,.045);color:#fff;font-size:14px;font-weight:800;cursor:pointer;touch-action:none}
.btn:active{transform:scale(.97)}.btn.primary{background:linear-gradient(135deg,#7c3aed,#38bdf8);border:0}
.tip{margin-top:9px;color:var(--muted);font-size:11px;text-align:center}
@media(max-width:430px){body{padding:7px}.wrap{padding:5px;border-radius:17px}.over{inset:5px}}
</style>
</head>
<body>
<div class="app">
<div class="header"><div class="avatar">🦖</div><div><div class="title">Zenyn Dino</div><div class="subtitle">Tap = lompat, tahan = merunduk</div></div></div>
<div class="hud"><div class="stat">Score:<b id="score">0</b></div><div class="stat top">Top Score:<b id="top">0</b></div></div>
<div class="field"><label for="name">Nama</label><input id="name" maxlength="14" autocomplete="off" spellcheck="false" placeholder="Pemain"></div>
<div class="wrap">
<canvas id="cvs"></canvas>
<div class="over" id="over"><h2 id="resTitle">Game Over</h2><p id="resText">Score: <b>0</b> • Top Score: <b>0</b></p><button class="btn primary" id="again" style="min-width:150px;margin-top:6px">♻️ Main Lagi</button></div>
</div>
<div class="btns"><button class="btn primary" id="jump">⬆️ Lompat</button><button class="btn" id="duck">⬇️ Merunduk</button></div>
<div class="tip">Top score disimpan per nama di HP ini.</div>
</div>
<script>
'use strict';
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const cvs=document.getElementById('cvs'),ctx=cvs.getContext('2d'),overEl=document.getElementById('over'),resTitle=document.getElementById('resTitle'),resText=document.getElementById('resText'),scoreEl=document.getElementById('score'),topEl=document.getElementById('top'),nameEl=document.getElementById('name'),againEl=document.getElementById('again');
const GROUND=150,GRAV=2400,JUMP_V=620,DINO_X=34,DINO_W=32,DINO_H=40,DUCK_H=24,BIRD_BOTTOM=GROUND-46,BIRD_H=20;
const EMOJI='"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';
let W=360,H=180,S=1,dpr=1,dino,obs,dist,score,speed,spawnAt,over,running,last,top=0;
let name=String(store.get('zenyn_dino_user','Pemain')||'Pemain');
const topKey=()=>'zenyn_dino_top_'+String(name||'Pemain').trim().toLowerCase();
const loadTop=()=>{top=Number(store.get(topKey(),'0'))||0;topEl.textContent=top};

function fit(){
  const r=cvs.getBoundingClientRect();
  if(!r.width) return;
  dpr=Math.min(window.devicePixelRatio||1,2);
  cvs.width=Math.round(r.width*dpr);cvs.height=Math.round(r.height*dpr);
  S=r.width/360;W=360;H=r.height/S;
  ctx.setTransform(dpr*S,0,0,dpr*S,0,0);
  draw();
}
function reset(){
  dino={y:0,vy:0,duck:false};obs=[];dist=0;score=0;speed=250;spawnAt=340;
  over=false;running=false;last=0;scoreEl.textContent='0';overEl.classList.remove('show');draw();
}
const airBox=()=>{const h=(dino.duck&&dino.y===0)?DUCK_H:DINO_H;const bottom=GROUND-dino.y;return{l:DINO_X+5,r:DINO_X+DINO_W-5,t:bottom-h+2,b:bottom}};
const obsBox=(o)=>({l:o.x+3,r:o.x+o.w-3,t:o.y-o.h+(o.bird?3:2),b:o.y-(o.bird?3:0)});
const hit=(a,b)=>a.r>b.l&&a.l<b.r&&a.b>b.t&&a.t<b.b;
function spawnObstacle(){
  if(score>25&&Math.random()<0.3) obs.push({bird:true,x:W+20,w:26,h:BIRD_H,y:BIRD_BOTTOM});
  else{const h=30+Math.random()*12;obs.push({bird:false,x:W+20,w:16+Math.random()*10,h,y:GROUND})}
}
function jump(){if(over) return;if(dino.y<=0){dino.vy=JUMP_V;dino.y=0.01;running=true}}
const setDuck=(v)=>{dino.duck=!!v&&dino.y<=0};
function gameOver(){
  over=true;running=false;
  if(score>top){top=score;store.set(topKey(),String(top));topEl.textContent=top}
  resTitle.textContent='Game Over';
  resText.innerHTML='Score: <b>'+score+'</b> • Top Score: <b>'+top+'</b>';
  overEl.classList.add('show');
}
function step(dt){
  if(dino.y>0||dino.vy>0){dino.vy-=GRAV*dt;dino.y+=dino.vy*dt;if(dino.y<=0){dino.y=0;dino.vy=0}}
  dist+=speed*dt;score=Math.floor(dist/10);scoreEl.textContent=score;
  speed=250+Math.min(score*1.6,260);
  if(dist>spawnAt){spawnObstacle();spawnAt=dist+300+Math.random()*220+speed*0.55}
  const db=airBox();
  for(let i=obs.length-1;i>=0;i--){
    const o=obs[i];o.x-=speed*dt;
    if(o.x+o.w<-20){obs.splice(i,1);continue}
    if(hit(db,obsBox(o))){gameOver();return}
  }
  draw();
}
function emoji(ch,size,x,bottom){ctx.font='900 '+size+'px '+EMOJI;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(ch,x,bottom)}
function draw(){
  ctx.clearRect(0,0,W,H);
  const g=ctx.createRadialGradient(W/2,0,0,W/2,0,H*1.2);
  g.addColorStop(0,'rgba(124,58,237,.20)');g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(255,255,255,.16)';
  const span=W+80;
  for(let i=0;i<18;i++){
    const x=(((i*53-dist*0.6)%span)+span)%span-40;
    ctx.fillRect(x,GROUND+6+(i%3)*4,i%4?3:6,1.5);
  }
  ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(0,GROUND+1);ctx.lineTo(W,GROUND+1);ctx.stroke();
  for(const o of obs) emoji(o.bird?'🦅':'🌵',o.bird?26:o.h+8,o.x-2,o.y);
  const size=(dino.duck&&dino.y===0)?DUCK_H+10:DINO_H+8;
  const bob=running?(dist%14<7?0:-1.5):0;
  emoji('🦖',size,DINO_X-4,GROUND-dino.y+bob);
  if(!running&&!over){
    ctx.fillStyle='rgba(255,255,255,.7)';ctx.textAlign='center';
    ctx.font='700 13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
    ctx.fillText('Tap / Lompat untuk mulai 🦖',W/2,GROUND-78);
    ctx.textAlign='left';
  }
}
function frame(t){
  requestAnimationFrame(frame);
  if(!running||over){last=t;return}
  if(!last){last=t;return}
  let dt=(t-last)/1000;last=t;
  if(dt>0.05) dt=0.05;
  step(dt);
}
nameEl.value=name;loadTop();
nameEl.addEventListener('input',()=>{name=nameEl.value.trim()||'Pemain';store.set('zenyn_dino_user',name);loadTop()});
cvs.addEventListener('pointerdown',(e)=>{e.preventDefault();jump()});
document.getElementById('jump').addEventListener('pointerdown',(e)=>{e.preventDefault();jump()});
const duckBtn=document.getElementById('duck');
duckBtn.addEventListener('pointerdown',(e)=>{e.preventDefault();setDuck(true)});
for(const ev of ['pointerup','pointercancel','pointerleave']) duckBtn.addEventListener(ev,()=>setDuck(false));
window.addEventListener('keydown',(e)=>{
  if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'){e.preventDefault();jump()}
  else if(e.code==='ArrowDown'||e.code==='KeyS'){e.preventDefault();setDuck(true)}
});
window.addEventListener('keyup',(e)=>{if(e.code==='ArrowDown'||e.code==='KeyS') setDuck(false)});
againEl.addEventListener('pointerdown',(e)=>{e.preventDefault();reset();jump()});
window.addEventListener('resize',fit);
reset();fit();requestAnimationFrame(frame);
</script>
</body></html>`;

module.exports = { html };
