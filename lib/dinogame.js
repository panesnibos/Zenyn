// lib/dinogame.js — game dino HTML untuk kartu rich WhatsApp (JS jalan di webview).
// Scene digambar pakai <div> absolut + requestAnimationFrame, BUKAN canvas: kanvas
// butuh pengukuran lebar yang tak selalu tersedia saat skrip kartu jalan, dan font
// emoji tak selalu ada di webview WhatsApp.
// Kontrol: ketuk atas kartu = lompat, tahan bawah kartu = merunduk (tanpa tombol chat).
// Self-contained: tanpa CDN/font/script luar.

const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Zenyn Dino</title>
<style>
:root{--text:#fff;--muted:#a8a3bd;--line:rgba(255,255,255,.1);--sky1:#170f2b;--sky2:#241447;--sky3:#2c1a52}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
html,body{background:#08060d;color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
body{padding:8px}
.card{width:100%;max-width:346px;margin:auto;border-radius:22px;overflow:hidden;background:#0b0813;box-shadow:0 18px 40px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.1)}
.topline{height:3px;background:linear-gradient(90deg,#7c3aed,#38bdf8,#7c3aed)}
.body{padding:12px}
.head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.ico{width:42px;height:42px;flex:none;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7c3aed,#38bdf8)}
.ico svg{width:23px;height:23px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.eye{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.ttl{font-size:16px;font-weight:800;margin-top:2px}
.badge{margin-left:auto;flex:none;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:5px 9px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.stat{padding:8px 11px;border-radius:13px;background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid var(--line);font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.stat b{display:block;margin-top:2px;font-size:18px;letter-spacing:0;text-transform:none;color:#fff}
.stat.r{text-align:right}
.field{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:7px 11px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.035)}
.field label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.field input{flex:1;min-width:0;border:0;background:transparent;color:#fff;font-size:13px;font-weight:700;outline:none;font-family:inherit}
.scene{position:relative;height:170px;border-radius:16px;overflow:hidden;background:linear-gradient(180deg,var(--sky1) 0%,var(--sky2) 58%,var(--sky3) 100%);border:1px solid var(--line);touch-action:none;user-select:none}
.glow{position:absolute;width:150px;height:150px;left:-40px;top:-60px;border-radius:50%;background:rgba(124,58,237,.5);filter:blur(30px)}
.stars{position:absolute;inset:0;background-image:radial-gradient(#fff 1px,transparent 1px),radial-gradient(#fff 1px,transparent 1px);background-size:52px 40px,86px 62px;background-position:6px 8px,30px 22px;opacity:.28}
.moon{position:absolute;right:16px;top:12px;width:22px;height:22px;border-radius:50%;background:#f4e6c8;box-shadow:0 0 18px rgba(244,230,200,.55)}
.ground{position:absolute;left:0;right:0;bottom:22px;height:2px;background:rgba(255,255,255,.3)}
.ticks i{position:absolute;bottom:16px;width:4px;height:1.5px;background:rgba(255,255,255,.22)}
.dino{position:absolute;left:18px;bottom:24px;width:44px;height:44px;transform-origin:50% 100%;will-change:bottom,transform}
.dino i,.obs i{position:absolute;display:block}
.tail{left:0;bottom:12px;width:14px;height:8px;background:#9af7c4;border-radius:2px 0 0 2px}
.torso{left:8px;bottom:8px;width:24px;height:22px;background:#9af7c4;border-radius:3px}
.dhead{left:22px;bottom:26px;width:20px;height:16px;background:#9af7c4;border-radius:3px}
.deye{left:35px;bottom:35px;width:4px;height:4px;background:#0b0813;border-radius:1px}
.arm{left:28px;bottom:19px;width:9px;height:5px;background:#9af7c4;border-radius:2px}
.leg1{left:11px;bottom:0;width:6px;height:10px;background:#9af7c4}
.leg2{left:23px;bottom:0;width:6px;height:13px;background:#9af7c4}
.obs{position:absolute;will-change:left}
.dg-cactus{width:26px;height:44px}
.dg-cactus .trunk{left:8px;bottom:0;width:9px;height:44px;background:#5dffa7;border-radius:3px}
.dg-cactus .l1{left:0;bottom:16px;width:9px;height:6px;background:#5dffa7;border-radius:2px}
.dg-cactus .l2{left:0;bottom:20px;width:5px;height:12px;background:#5dffa7;border-radius:2px}
.dg-cactus .r1{left:16px;bottom:24px;width:9px;height:6px;background:#5dffa7;border-radius:2px}
.dg-cactus .r2{left:20px;bottom:28px;width:5px;height:12px;background:#5dffa7;border-radius:2px}
.dg-bird{width:30px;height:20px}
.dg-bird .b1{left:5px;bottom:0;width:20px;height:12px;background:#ff8ba7;border-radius:6px 4px 6px 4px}
.dg-bird .b2{left:0;bottom:8px;width:14px;height:5px;background:#ff8ba7;border-radius:4px 2px 2px 4px}
.dg-bird .b3{left:24px;bottom:6px;width:6px;height:4px;background:#ffd166;border-radius:1px}
.hint{position:absolute;left:0;right:0;bottom:52px;text-align:center;font-size:11px;color:rgba(255,255,255,.72);pointer-events:none}
.over{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(6,4,9,.86);text-align:center;padding:14px}
.over.show{display:flex}
.over h2{font-size:20px}
.over p{font-size:11px;color:var(--muted)}
.over b{color:#fff}
.again{margin-top:4px;min-width:140px;min-height:40px;border:0;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#38bdf8);color:#fff;font-size:13px;font-weight:800;font-family:inherit}
.foot{margin-top:9px;text-align:center;font-size:10px;line-height:1.6;color:var(--muted)}
.dbg{margin-top:6px;padding:5px 8px;border-radius:9px;background:rgba(255,255,255,.04);color:#9c93a6;font:600 10px ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;min-height:15px}
</style>
</head>
<body>
<div class="card">
<div class="topline"></div>
<div class="body">
<div class="head"><div class="ico"><svg viewBox="0 0 24 24"><path d="M4 20v-4h3l2-6h5V7l3-2 3 3v4h-3l-1 4h-4l-2 4H4z"/></svg></div><div><div class="eye">Zenyn Game</div><div class="ttl">Dino Run</div></div><div class="badge" id="badge">Siap</div></div>
<div class="stats"><div class="stat">Score:<b id="score">0</b></div><div class="stat r">Top Score:<b id="top">0</b></div></div>
<div class="field"><label for="name">Nama</label><input id="name" maxlength="14" autocomplete="off" spellcheck="false" placeholder="Pemain"></div>
<div class="scene" id="scene">
<div class="glow"></div><div class="stars"></div><div class="moon"></div>
<div class="ticks" id="ticks"></div>
<div class="ground"></div>
<div class="dino" id="dino"><i class="tail"></i><i class="torso"></i><i class="dhead"></i><i class="deye"></i><i class="arm"></i><i class="leg1"></i><i class="leg2"></i></div>
<div class="obs" id="obs" style="display:none"></div>
<div class="hint" id="hint">Ketuk atas = lompat · tahan bawah = merunduk</div>
<div class="over" id="over"><h2 id="resTitle">Game Over</h2><p id="resText">Score: <b>0</b> · Top Score: <b>0</b></p><button class="again" id="again">Main Lagi</button></div>
</div>
<div class="foot">Top score disimpan per nama di HP ini.</div>
<div class="dbg" id="dbg">JS belum jalan…</div>
</div></div>
<script>
'use strict';
var dbgEl=document.getElementById('dbg');
var dbg=function(){try{dbgEl.textContent=Array.prototype.join.call(arguments,' ')}catch(e){}};
dbg('JS jalan');
window.onerror=function(m,s,l,c){dbg('ERR',m,l+':'+c);return false};
var scene=document.getElementById('scene'),dinoEl=document.getElementById('dino'),obsEl=document.getElementById('obs'),overEl=document.getElementById('over'),resTitle=document.getElementById('resTitle'),resText=document.getElementById('resText'),scoreEl=document.getElementById('score'),topEl=document.getElementById('top'),badgeEl=document.getElementById('badge'),nameEl=document.getElementById('name'),againEl=document.getElementById('again'),hintEl=document.getElementById('hint'),ticksEl=document.getElementById('ticks');
var GROUND_BOTTOM=24,DINO_LEFT=18,DINO_W=44,DINO_H=44,DUCK_SCALE=0.62,GRAV=2400,JUMP_V=690;
var t=document.createElement('i');
for(var i=0;i<10;i++){t=document.createElement('i');t.style.left=(8+i*9.4)+'%';ticksEl.appendChild(t)}

var store={
  get:function(k,d){try{var v=localStorage.getItem(k);return v===null?d:v}catch(e){return d}},
  set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}
};
var player=String(store.get('zenyn_dino_user','Pemain')||'Pemain');
var best=0,sceneW=0,sceneH=170,dinoY=0,vy=0,duck=false,obs=null,dist=0,score=0,speed=260,gap=0,running=false,over=false,last=0,prev=0;
var topKey=function(){return 'zenyn_dino_top_'+String(player||'Pemain').trim().toLowerCase()};
var loadTop=function(){best=Number(store.get(topKey(),'0'))||0;topEl.textContent=best};

function measure(){
  var r=scene.getBoundingClientRect();
  sceneW=r.width||320;sceneH=r.height||170;
  dbg('JS jalan · scene',Math.round(r.width)+'x'+Math.round(r.height),'· dino',Math.round(dinoY)+'px','· skor',score);
}
function reset(){
  dinoY=0;vy=0;duck=false;obs=null;dist=0;score=0;speed=260;gap=280;running=false;over=false;last=0;
  obsEl.style.display='none';overEl.classList.remove('show');hintEl.style.display='block';
  scoreEl.textContent='0';badgeEl.textContent='Siap';dinoEl.style.bottom=GROUND_BOTTOM+'px';dinoEl.style.transform='';
  loadTop();
}
function jump(){
  if(over)return;
  if(dinoY<=0){vy=JUMP_V;dinoY=0.1;running=true;hintEl.style.display='none';badgeEl.textContent='Main'}
}
function setDuck(v){duck=!!v&&dinoY<=0}
function spawn(){
  var bird=score>3&&Math.random()<0.35;
  obs={bird:bird,x:sceneW+10,w:bird?30:26,h:bird?20:44};
  obsEl.className='obs '+(bird?'dg-bird':'dg-cactus');
  obsEl.innerHTML=bird?'<i class="b1"></i><i class="b2"></i><i class="b3"></i>':'<i class="trunk"></i><i class="l1"></i><i class="l2"></i><i class="r1"></i><i class="r2"></i>';
  obsEl.style.display='block';
  obsEl.style.bottom=(bird?64:GROUND_BOTTOM)+'px';
  obsEl.style.left=obs.x+'px';
}
function dinoBox(){
  var h=dinoY<=0&&duck?DINO_H*DUCK_SCALE:DINO_H;
  var bottom=GROUND_BOTTOM+dinoY;
  return {l:DINO_LEFT+5,r:DINO_LEFT+DINO_W-5,b:bottom,t:bottom-h+2};
}
function obsBox(o){
  var bottom=o.bird?64:GROUND_BOTTOM;
  return {l:o.x+3,r:o.x+o.w-3,b:bottom,t:bottom-o.h+(o.bird?3:0)};
}
function hit(a,b){return a.r>b.l&&a.l<b.r&&a.b>b.t&&a.t<b.b}
function gameOver(){
  over=true;running=false;
  if(score>best){best=score;store.set(topKey(),String(best));topEl.textContent=best}
  resTitle.textContent='Game Over';
  resText.innerHTML='Score: <b>'+score+'</b> · Top Score: <b>'+best+'</b>';
  overEl.classList.add('show');badgeEl.textContent='Selesai';
}
function step(dt){
  if(dinoY>0||vy>0){vy-=GRAV*dt;dinoY+=vy*dt;if(dinoY<=0){dinoY=0;vy=0}}
  dinoEl.style.bottom=(GROUND_BOTTOM+dinoY)+'px';
  dinoEl.style.transform=(dinoY<=0&&duck)?'scaleY('+DUCK_SCALE+')':'';
  dist+=speed*dt;score=Math.floor(dist/10);scoreEl.textContent=score;
  speed=260+Math.min(score*3,260);
  if(!obs){gap-=speed*dt;if(gap<=0)spawn()}
  else{
    obs.x-=speed*dt;obsEl.style.left=obs.x+'px';
    if(obs.x+obs.w<-10){obs=null;obsEl.style.display='none';gap=280+Math.random()*180}
    else if(hit(dinoBox(),obsBox(obs))){gameOver();return}
  }
  if(score%10===0)dbg('JS jalan · skor',score,'· dino',Math.round(dinoY)+'px');
}
function frame(now){
  requestAnimationFrame(frame);
  if(!running||over){last=now;return}
  if(!last){last=now;return}
  var dt=(now-last)/1000;last=now;
  if(dt>0.05)dt=0.05;
  step(dt);
}
nameEl.value=player;
nameEl.addEventListener('input',function(){player=nameEl.value.trim()||'Pemain';store.set('zenyn_dino_user',player);loadTop()});
scene.addEventListener('pointerdown',function(e){
  e.preventDefault();
  var r=scene.getBoundingClientRect(),y=(e.clientY||0)-r.top;
  if(y>r.height*0.6)setDuck(true);else jump();
});
scene.addEventListener('pointerup',function(){setDuck(false)});
scene.addEventListener('pointercancel',function(){setDuck(false)});
window.addEventListener('keydown',function(e){
  if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'){e.preventDefault();jump()}
  else if(e.code==='ArrowDown'||e.code==='KeyS'){e.preventDefault();setDuck(true)}
});
window.addEventListener('keyup',function(e){if(e.code==='ArrowDown'||e.code==='KeyS')setDuck(false)});
againEl.addEventListener('click',function(e){e.preventDefault();reset()});
window.addEventListener('resize',measure);
reset();measure();requestAnimationFrame(frame);
</script>
</body></html>`;

module.exports = { html };
