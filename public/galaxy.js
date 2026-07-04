/* =====================================================================
   HQ GALAXY — galaxy.js
   Cinematic canvas engine: pan/zoom camera, parallax starfields,
   corona stars, pre-rendered textured planets (your links), asteroid
   mission belts, warp-in system view with alien crew.
   Reads live data through window.HQ (app.js). Exposes window.GX.
   ===================================================================== */
'use strict';
(function(){
const HQ = window.HQ;
const cv = document.getElementById('room');
const ctx = cv.getContext('2d');
const TAU = Math.PI*2;

/* ---------- sizing ---------- */
let W=1280, H=640, dpr=1;
function resize(){
  const r = cv.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio||1);
  W = Math.max(320, r.width); H = Math.max(300, r.height);
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
resize();
window.addEventListener('resize', resize);

/* ---------- rng ---------- */
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hash(s){ let h=1779033703; for(let i=0;i<s.length;i++){ h=Math.imul(h^s.charCodeAt(i),3432918353); h=h<<13|h>>>19; } return h>>>0; }

/* ---------- camera ---------- */
const HOME={x:640,y:330,z:1};
const cam={x:HOME.x,y:HOME.y,z:1,tx:HOME.x,ty:HOME.y,tz:1};
function s2wX(sx){ return (sx-W/2)/cam.z + cam.x; }
function s2wY(sy){ return (sy-H/2)/cam.z + cam.y; }
function w2sX(wx){ return (wx-cam.x)*cam.z + W/2; }
function w2sY(wy){ return (wy-cam.y)*cam.z + H/2; }

/* ---------- modes ---------- */
let mode='galaxy';          // galaxy | warp | system | unwarp
let curP=null;              // project in system view
let warpT=0, savedCam=null;

/* ---------- starfield layers ---------- */
const LAYERS=[{f:.25,n:150,a:.35},{f:.55,n:150,a:.55},{f:.9,n:140,a:.85}];
for(const L of LAYERS){
  const rnd=mulberry(hash('layer'+L.f));
  L.stars=Array.from({length:L.n},()=>({x:rnd()*2200-460,y:rnd()*1400-370,r:rnd()*1.3+.3,ph:rnd()*TAU,sp:.5+rnd()}));
}

/* ---------- planet sprites ---------- */
const spriteCache={};
function planetSprite(key, baseColor){
  if(spriteCache[key]) return spriteCache[key];
  const rnd=mulberry(hash(key));
  const S=96, c=document.createElement('canvas');
  c.width=S; c.height=S;
  const g=c.getContext('2d');
  const R=S/2-2;
  // base colour: blend project colour with a random planetary hue
  const n=parseInt(baseColor.slice(1),16);
  let br=(n>>16)&255, bg=(n>>8)&255, bb=n&255;
  const mix=.35+rnd()*.4, hr=rnd()*255, hg=rnd()*255, hb=rnd()*255;
  br=Math.round(br*(1-mix)+hr*mix); bg=Math.round(bg*(1-mix)+hg*mix); bb=Math.round(bb*(1-mix)+hb*mix);
  g.save();
  g.beginPath(); g.arc(S/2,S/2,R,0,TAU); g.clip();
  g.fillStyle=`rgb(${br},${bg},${bb})`; g.fillRect(0,0,S,S);
  // latitude bands with wavy edges
  const bands=5+Math.floor(rnd()*5);
  for(let i=0;i<bands;i++){
    const y0=(i/bands)*S, bh=S/bands*(0.7+rnd()*.8);
    const l=(rnd()-.5)*70;
    g.fillStyle=`rgba(${Math.min(255,Math.max(0,br+l))},${Math.min(255,Math.max(0,bg+l))},${Math.min(255,Math.max(0,bb+l))},${.5+rnd()*.4})`;
    g.beginPath();
    g.moveTo(0,y0);
    for(let x=0;x<=S;x+=8) g.lineTo(x, y0+Math.sin(x/S*TAU*(1+rnd()*.4)+rnd()*6)*3);
    g.lineTo(S,y0+bh); g.lineTo(0,y0+bh);
    g.closePath(); g.fill();
  }
  // speckle noise / craters
  const spots=30+rnd()*50;
  for(let i=0;i<spots;i++){
    const a=rnd()*TAU, rr=Math.sqrt(rnd())*R, x=S/2+Math.cos(a)*rr, y=S/2+Math.sin(a)*rr;
    g.fillStyle=`rgba(${rnd()<.5?0:255},${rnd()<.5?0:255},255,${.04+rnd()*.08})`;
    g.beginPath(); g.arc(x,y,.6+rnd()*2.4,0,TAU); g.fill();
  }
  // big storm spot on some
  if(rnd()<.4){
    g.fillStyle=`rgba(${255-br},${255-bg},${255-bb},.25)`;
    g.beginPath(); g.ellipse(S*(.3+rnd()*.4),S*(.35+rnd()*.3),7+rnd()*8,4+rnd()*5,rnd(),0,TAU); g.fill();
  }
  // polar caps sometimes
  if(rnd()<.35){
    g.fillStyle='rgba(240,248,255,.5)';
    g.beginPath(); g.ellipse(S/2,4,R*.7,7,0,0,TAU); g.fill();
    g.beginPath(); g.ellipse(S/2,S-4,R*.7,7,0,0,TAU); g.fill();
  }
  // sphere shading: highlight + rim darkening
  let sh=g.createRadialGradient(S*.36,S*.34,R*.1,S/2,S/2,R);
  sh.addColorStop(0,'rgba(255,255,255,.32)');
  sh.addColorStop(.45,'rgba(255,255,255,.05)');
  sh.addColorStop(.82,'rgba(0,0,12,.18)');
  sh.addColorStop(1,'rgba(0,0,14,.62)');
  g.fillStyle=sh; g.fillRect(0,0,S,S);
  g.restore();
  const spr={c, ring:rnd()<.3, ringTilt:(rnd()-.5)*.8, ringHue:`rgba(${180+rnd()*60|0},${170+rnd()*60|0},${140+rnd()*80|0},`, moon:rnd()<.3};
  spriteCache[key]=spr;
  return spr;
}
function drawPlanet(x,y,r,spr,starX,starY,time,spin){
  // ring behind
  if(spr.ring){
    ctx.save(); ctx.translate(x,y); ctx.rotate(spr.ringTilt);
    ctx.strokeStyle=spr.ringHue+'.55)'; ctx.lineWidth=Math.max(1.5,r*.22);
    ctx.beginPath(); ctx.ellipse(0,0,r*1.75,r*.55,0,Math.PI*.06,Math.PI*.94,true); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x,y);
  if(spin) ctx.rotate(Math.sin(time/4000)*.06);
  ctx.drawImage(spr.c,-r,-r,r*2,r*2);
  // day/night terminator facing the star
  const ang=Math.atan2(y-starY,x-starX); // direction away from star
  ctx.rotate(ang);
  const tg=ctx.createLinearGradient(-r,0,r,0);
  tg.addColorStop(0,'rgba(2,3,12,0)');
  tg.addColorStop(.45,'rgba(2,3,12,0)');
  tg.addColorStop(.75,'rgba(2,3,12,.55)');
  tg.addColorStop(1,'rgba(2,3,12,.88)');
  ctx.fillStyle=tg;
  ctx.beginPath(); ctx.arc(0,0,r-0.5,0,TAU); ctx.fill();
  ctx.restore();
  // ring front
  if(spr.ring){
    ctx.save(); ctx.translate(x,y); ctx.rotate(spr.ringTilt);
    ctx.strokeStyle=spr.ringHue+'.8)'; ctx.lineWidth=Math.max(1.5,r*.22);
    ctx.beginPath(); ctx.ellipse(0,0,r*1.75,r*.55,0,-Math.PI*.06,Math.PI*.06); ctx.stroke();
    ctx.restore();
  }
  // moon
  if(spr.moon){
    const ma=time/2600+x;
    const mx=x+Math.cos(ma)*r*2.2, my=y+Math.sin(ma)*r*.7;
    if(Math.sin(ma)>0){ ctx.fillStyle='#b8c4d8'; ctx.beginPath(); ctx.arc(mx,my,Math.max(1.4,r*.16),0,TAU); ctx.fill(); }
  }
}

/* ---------- orbital mechanics (galaxy view) ---------- */
function orbitOf(p,i){ return 30+i*20; }
function planetPos(p,i,time){
  const act=HQ.activityOf(p);
  const speed=(act>=1?1:.3)*(1-i*.15);
  const a=time/2400*speed + i*2.1 + hash(p.id)%7;
  const orad=orbitOf(p,i);
  return [p.sys.x+Math.cos(a)*orad, p.sys.y+Math.sin(a)*orad*.42, Math.sin(a), a];
}
function systemRadius(p){ return orbitOf(p, HQ.planetsOf(p).length)+26; }

/* ---------- backdrop ---------- */
function drawBackdrop(time, slow){
  ctx.fillStyle='#020309'; ctx.fillRect(0,0,W,H);
  // galactic dust band
  ctx.save();
  ctx.translate(W/2,H/2); ctx.rotate(-.32);
  const dg=ctx.createLinearGradient(0,-140,0,140);
  dg.addColorStop(0,'rgba(70,90,180,0)');
  dg.addColorStop(.5,'rgba(90,110,210,.07)');
  dg.addColorStop(1,'rgba(70,90,180,0)');
  ctx.fillStyle=dg; ctx.fillRect(-W,-160,W*2,320);
  ctx.restore();
  for(const L of LAYERS){
    const f = slow ? L.f*.25 : L.f;
    for(const st of L.stars){
      const sx=(st.x-(cam.x*f+HOME.x*(1-f)))*cam.z+W/2;
      const sy=(st.y-(cam.y*f+HOME.y*(1-f)))*cam.z+H/2;
      if(sx<-8||sx>W+8||sy<-8||sy>H+8)continue;
      const tw=Math.max(0,.45+.55*Math.sin(time/700*st.sp+st.ph));
      ctx.fillStyle=`rgba(220,235,255,${L.a*(.25+.6*tw)})`;
      ctx.beginPath(); ctx.arc(sx,sy,st.r*(.8+.4*tw),0,TAU); ctx.fill();
    }
  }
}

/* ---------- galaxy scene ---------- */
function drawStarBody(sx,sy,r,color,act,time,err){
  const pulse=act>=1? .75+.25*Math.sin(time/260) : act;
  // wide corona
  let cg=ctx.createRadialGradient(sx,sy,r*.2,sx,sy,r*3.4);
  cg.addColorStop(0,color+'55'); cg.addColorStop(.4,color+'22'); cg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=cg;
  ctx.beginPath(); ctx.arc(sx,sy,r*3.4,0,TAU); ctx.fill();
  if(err){
    ctx.fillStyle='rgba(255,60,60,.16)';
    ctx.beginPath(); ctx.arc(sx,sy,r*3.8+4*Math.sin(time/180),0,TAU); ctx.fill();
  }
  // rotating diffraction spikes
  ctx.save(); ctx.translate(sx,sy); ctx.rotate(time/9000);
  const L=r*(2+.6*pulse);
  const sg=ctx.createLinearGradient(-L,0,L,0);
  sg.addColorStop(0,color+'00'); sg.addColorStop(.5,color+'99'); sg.addColorStop(1,color+'00');
  ctx.strokeStyle=sg; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(-L,0); ctx.lineTo(L,0); ctx.stroke();
  ctx.rotate(Math.PI/2);
  ctx.beginPath(); ctx.moveTo(-L,0); ctx.lineTo(L,0); ctx.stroke();
  ctx.restore();
  // core
  ctx.shadowColor=color; ctx.shadowBlur=26*pulse+8;
  const g=ctx.createRadialGradient(sx-r*.25,sy-r*.25,1,sx,sy,r);
  g.addColorStop(0,'#ffffff'); g.addColorStop(.45,color); g.addColorStop(1,color+'22');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(sx,sy,r*(.94+.06*Math.sin(time/210)),0,TAU); ctx.fill();
  ctx.shadowBlur=0;
  // flare arcs on very active stars
  if(act>=1){
    const fa=time/900;
    ctx.strokeStyle=color+'66'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(sx,sy,r*1.35,fa,fa+1.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx,sy,r*1.6,fa+2.6,fa+3.3); ctx.stroke();
  }
}
function drawGalaxy(time){
  drawBackdrop(time,false);
  const projs=HQ.state.projects;
  // nebulae
  for(const p of projs){
    const sx=w2sX(p.sys.x), sy=w2sY(p.sys.y), rr=210*cam.z;
    const g=ctx.createRadialGradient(sx,sy,10,sx,sy,rr);
    g.addColorStop(0,p.color+'2c'); g.addColorStop(.5,p.color+'0f'); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.fillRect(sx-rr,sy-rr,rr*2,rr*2);
  }
  // lanes + pulses between active systems
  const active=projs.filter(p=>HQ.activityOf(p)>=1);
  for(let i=0;i<projs.length;i++)for(let j=i+1;j<projs.length;j++){
    const A=projs[i],B=projs[j];
    const d=Math.hypot(A.sys.x-B.sys.x,A.sys.y-B.sys.y);
    if(d>520)continue;
    const ax=w2sX(A.sys.x),ay=w2sY(A.sys.y),bx=w2sX(B.sys.x),by=w2sY(B.sys.y);
    ctx.strokeStyle='rgba(110,170,255,.1)'; ctx.lineWidth=1;
    ctx.setLineDash([2,7]);
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
    ctx.setLineDash([]);
    if(HQ.activityOf(A)>=1&&HQ.activityOf(B)>=1){
      const k=(time/2600+i*.37+j*.61)%1, px=ax+(bx-ax)*k, py=ay+(by-ay)*k;
      ctx.fillStyle='#bfe8ff'; ctx.shadowColor='#7fd0ff'; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.arc(px,py,2.2,0,TAU); ctx.fill(); ctx.shadowBlur=0;
    }
  }
  // comets between active systems
  if(active.length>=2){
    for(let c=0;c<Math.min(2,active.length);c++){
      const A=active[c%active.length], B=active[(c+1)%active.length];
      const k=((time+c*2600)/5200)%1.6; if(k>1)continue;
      const ax=w2sX(A.sys.x),ay=w2sY(A.sys.y),bx=w2sX(B.sys.x),by=w2sY(B.sys.y);
      const px=ax+(bx-ax)*k, py=ay+(by-ay)*k-Math.sin(k*Math.PI)*70*cam.z;
      const grad=ctx.createLinearGradient(px-34,py+12,px,py);
      grad.addColorStop(0,'rgba(140,220,255,0)'); grad.addColorStop(1,'rgba(200,240,255,.9)');
      ctx.strokeStyle=grad; ctx.lineWidth=2.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(px-34,py+12); ctx.lineTo(px,py); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(px,py,2.4,0,TAU); ctx.fill();
    }
  }
  // systems
  for(const p of projs){
    const sx=w2sX(p.sys.x), sy=w2sY(p.sys.y);
    const act=HQ.activityOf(p), planets=HQ.planetsOf(p);
    const sr=(11+8*act)*cam.z;
    // hover/selection ring
    if(hover&&hover.type==='star'&&hover.p===p){
      ctx.strokeStyle='rgba(159,216,255,.5)'; ctx.lineWidth=1.4; ctx.setLineDash([4,5]);
      ctx.beginPath(); ctx.arc(sx,sy,systemRadius(p)*cam.z,0,TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    // arrange-mode marker
    if(HQ.state.settings.arrange){
      ctx.strokeStyle='rgba(255,184,77,.5)'; ctx.setLineDash([3,4]);
      ctx.beginPath(); ctx.arc(sx,sy,systemRadius(p)*cam.z+6,0,TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    // orbits + rear planets
    for(let i=0;i<planets.length;i++){
      const orad=orbitOf(p,i)*cam.z;
      ctx.strokeStyle=`rgba(150,190,255,${.08+.12*act})`; ctx.lineWidth=1;
      ctx.beginPath(); ctx.ellipse(sx,sy,orad,orad*.42,0,0,TAU); ctx.stroke();
      const[wx,wy,depth]=planetPos(p,i,time);
      if(depth>=0)continue;
      const spr=planetSprite(p.id+':'+i+':'+planets[i].label, p.color);
      drawPlanet(w2sX(wx),w2sY(wy),Math.max(3,(4.5+ (i===0?2:0))*cam.z),spr,sx,sy,time,false);
    }
    // asteroid mission belt
    const nAst=Math.min(14,HQ.openTasks(p.id));
    if(nAst>0){
      const belt=(orbitOf(p,planets.length)+12)*cam.z;
      const rnd=mulberry(hash(p.id+'belt'));
      for(let i=0;i<nAst;i++){
        const a=time/9000+(i/nAst)*TAU+rnd()*.4, wob=rnd()*6-3;
        const axp=sx+Math.cos(a)*(belt+wob), ayp=sy+Math.sin(a)*(belt+wob)*.42;
        ctx.fillStyle=`rgba(${150+rnd()*60|0},${150+rnd()*50|0},${140+rnd()*40|0},.75)`;
        ctx.beginPath(); ctx.arc(axp,ayp,(0.9+rnd()*1.4)*cam.z,0,TAU); ctx.fill();
      }
    }
    // star
    drawStarBody(sx,sy,sr,p.color,act,time+hash(p.id)%1000,HQ.errorOf(p));
    // bridge-run warp spiral
    if(HQ.runActive(p.id)){
      for(let i=0;i<10;i++){
        const a=time/300+i*.63, rr2=sr*1.6+i*4*cam.z;
        ctx.fillStyle=`rgba(55,230,176,${.5-(i*.045)})`;
        ctx.beginPath(); ctx.arc(sx+Math.cos(a)*rr2,sy+Math.sin(a)*rr2*.5,1.6*cam.z,0,TAU); ctx.fill();
      }
    }
    // front planets
    for(let i=0;i<planets.length;i++){
      const[wx,wy,depth]=planetPos(p,i,time);
      if(depth<0)continue;
      const spr=planetSprite(p.id+':'+i+':'+planets[i].label, p.color);
      const hov=hover&&hover.type==='planet'&&hover.p===p&&hover.i===i;
      const pr=Math.max(3,(4.5+(i===0?2:0))*cam.z)*(hov?1.35:1);
      drawPlanet(w2sX(wx),w2sY(wy),pr,spr,sx,sy,time,false);
      if(hov){
        ctx.strokeStyle='#bfe4ff'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.arc(w2sX(wx),w2sY(wy),pr+3.5,0,TAU); ctx.stroke();
      }
    }
    // labels
    if(cam.z>.55){
      const ly=sy+systemRadius(p)*cam.z+16;
      ctx.font='600 '+Math.min(16,13*Math.sqrt(cam.z))+'px Exo 2, Segoe UI, sans-serif';
      ctx.fillStyle=hover&&hover.p===p?'#ffffff':'#dce8ff';
      let w=ctx.measureText(p.name).width;
      ctx.fillText(p.name,sx-w/2,ly);
      const st=HQ.statusOf(p);
      const gh=HQ.live.github[p.id];
      const sub=HQ.STATUS_LABEL[st]+(gh&&!gh.error&&gh.commits7d?` · ${gh.commits7d} commits/7d`:'')+` · ${HQ.openTasks(p.id)} missions`;
      ctx.font='400 10px Exo 2, Segoe UI, sans-serif';
      ctx.fillStyle=HQ.activityOf(p)>=1?'#7fe0c0':'#6e87b8';
      w=ctx.measureText(sub).width;
      ctx.fillText(sub,sx-w/2,ly+14);
    }
  }
}

/* ---------- system view ---------- */
let sysHits=[];   // clickable planet rects in system view
function drawSystem(time){
  drawBackdrop(time,true);
  const p=curP;
  if(!p)return;
  sysHits=[];
  const sunX=W*.18, sunY=H*.44, sunR=Math.min(W,H)*.17;
  // nebula wash
  const ng=ctx.createRadialGradient(sunX,sunY,10,sunX,sunY,W*.7);
  ng.addColorStop(0,p.color+'26'); ng.addColorStop(.6,p.color+'0a'); ng.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=ng; ctx.fillRect(0,0,W,H);
  // the sun
  drawStarBody(sunX,sunY,sunR,p.color,Math.max(.5,HQ.activityOf(p)),time,HQ.errorOf(p));
  // planets — the project's links, big and clickable
  const planets=HQ.planetsOf(p);
  const n=Math.max(1,planets.length);
  for(let i=0;i<n && i<planets.length;i++){
    const fr=(i+1)/(n+.4);
    const px=sunX+sunR*.6+ (W*.86-sunX)*fr;
    const py=H*.40 + (i%2?  H*.1 : -H*.07) + Math.sin(time/2100+i*1.9)*6;
    const pr=Math.max(16, Math.min(30, 30-i*2.5));
    // orbit arc hint
    ctx.strokeStyle='rgba(150,190,255,.12)'; ctx.lineWidth=1;
    const od=Math.hypot(px-sunX,py-sunY);
    ctx.beginPath(); ctx.ellipse(sunX,sunY,od,od*.7,0,-.5,.5); ctx.stroke();
    const spr=planetSprite(p.id+':'+i+':'+planets[i].label, p.color);
    const hov=hover&&hover.type==='sysplanet'&&hover.i===i;
    drawPlanet(px,py,pr*(hov?1.12:1),spr,sunX,sunY,time,true);
    if(hov){ ctx.strokeStyle='#bfe4ff'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(px,py,pr+7,0,TAU); ctx.stroke(); }
    // label
    ctx.font='600 12.5px Exo 2, Segoe UI, sans-serif';
    ctx.fillStyle=hov?'#ffffff':'#cfe0ff';
    const lbl=planets[i].label;
    let w=ctx.measureText(lbl).width;
    ctx.fillText(lbl,px-w/2,py+pr+22);
    try{
      const host=new URL(planets[i].url).host;
      ctx.font='400 9.5px Exo 2, Segoe UI, sans-serif'; ctx.fillStyle='#6e87b8';
      w=ctx.measureText(host).width;
      ctx.fillText(host,px-w/2,py+pr+35);
    }catch(e){}
    sysHits.push({x:px,y:py,r:pr+10,i,url:planets[i].url,label:lbl});
  }
  // mission asteroid belt across upper area
  const nAst=Math.min(16,HQ.openTasks(p.id));
  const rnd=mulberry(hash(p.id+'beltbig'));
  for(let i=0;i<nAst;i++){
    const bx=W*.3+((i/Math.max(1,nAst))*W*.62)+Math.sin(time/2600+i*2.2)*8;
    const by=H*.13+rnd()*H*.07;
    ctx.fillStyle=`rgba(${150+rnd()*60|0},${150+rnd()*50|0},${140+rnd()*40|0},.8)`;
    ctx.beginPath(); ctx.arc(bx,by,1.5+rnd()*2.6,0,TAU); ctx.fill();
  }
  if(nAst){
    ctx.font='400 9.5px Exo 2, Segoe UI'; ctx.fillStyle='#6e87b8';
    ctx.fillText(HQ.openTasks(p.id)+' open missions in the belt', W*.3, H*.1);
  }
  // crew deck
  drawDeck(p,time);
}
function drawDeck(p,time){
  const dh=Math.min(150,H*.26), top=H-dh;
  const g=ctx.createLinearGradient(0,top,0,H);
  g.addColorStop(0,'rgba(16,26,64,.92)'); g.addColorStop(1,'rgba(6,10,30,.97)');
  ctx.fillStyle=g; ctx.fillRect(0,top,W,dh);
  ctx.strokeStyle='rgba(63,180,255,.35)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(0,top); ctx.lineTo(W,top); ctx.stroke();
  ctx.strokeStyle='rgba(63,180,255,.14)'; ctx.lineWidth=1;
  for(let i=0;i<=10;i++){ const x=i*W/10;
    ctx.beginPath(); ctx.moveTo(x,top); ctx.lineTo(x+(x-W/2)*.25,H); ctx.stroke(); }
  const st=HQ.statusOf(p);
  const mmode=st==='building'?'type':st==='live'?'idle':'sleep';
  const nCrew=Math.min(4,Math.max(1,HQ.openTasks(p.id)));
  const gap=W/(nCrew+1);
  const cols=['#42e58c','#ffb84d','#b48aff','#ff5e96','#5ba8ff'];
  for(let i=0;i<nCrew;i++) drawAlien(gap*(i+1),H-46,cols[(i+hash(p.id))%cols.length],time,i,mmode);
  // speech bubble with real activity when available
  const gh=HQ.live.github[p.id];
  const msgs=[];
  if(gh&&gh.lastMsg) msgs.push('⎇ '+gh.lastMsg.slice(0,44));
  const vc=HQ.live.vercel[p.id];
  if(vc&&vc.state) msgs.push('deploy: '+vc.state.toLowerCase());
  if(st==='building') msgs.push('compiling…','running tests','wiring things up');
  else if(st==='live') msgs.push('all systems go','orbit stable','monitoring…');
  else msgs.push('zzz…','awaiting orders');
  const msg=msgs[Math.floor(time/3000)%msgs.length];
  ctx.font='600 12.5px Exo 2, Segoe UI';
  const mw=ctx.measureText(msg).width+20;
  const bx=Math.min(W-mw-10,Math.max(10,gap-mw/2));
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.roundRect(bx,top-2-28,mw,24,12); ctx.fill();
  ctx.beginPath(); ctx.arc(bx+mw/2,top-2,3.2,0,TAU); ctx.fill();
  ctx.fillStyle='#152038'; ctx.fillText(msg,bx+10,top-2-11);
}
function drawAlien(x,y,col,time,i,mmode){
  const bob=mmode==='sleep'?.5:1;
  const yy=y+Math.sin(time/260+i*1.7)*2.5*bob;
  ctx.fillStyle=col;
  ctx.beginPath(); ctx.ellipse(x,yy,12,15,0,0,TAU); ctx.fill();
  for(let k=-1;k<=1;k++){
    ctx.beginPath();
    ctx.moveTo(x+k*6,yy+12);
    ctx.quadraticCurveTo(x+k*8,yy+20,x+k*4+Math.sin(time/200+k)*2,yy+22);
    ctx.lineWidth=4; ctx.strokeStyle=col; ctx.lineCap='round'; ctx.stroke();
  }
  if(mmode==='sleep'){
    ctx.strokeStyle='#0c1330'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(x-7,yy-4); ctx.lineTo(x-2,yy-4); ctx.moveTo(x+2,yy-4); ctx.lineTo(x+7,yy-4); ctx.stroke();
    ctx.fillStyle='#7a93c8'; ctx.font='600 11px Exo 2';
    ctx.fillText('z',x+12,yy-14);
  } else if(i%2){
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,yy-4,6.4,0,TAU); ctx.fill();
    ctx.fillStyle='#0c1330'; ctx.beginPath(); ctx.arc(x+Math.sin(time/400)*2,yy-4,3,0,TAU); ctx.fill();
  } else {
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(x-4.5,yy-4,4,0,TAU); ctx.arc(x+4.5,yy-4,4,0,TAU); ctx.fill();
    ctx.fillStyle='#0c1330';
    ctx.beginPath(); ctx.arc(x-4.5+Math.sin(time/400)*1.4,yy-4,1.9,0,TAU); ctx.arc(x+4.5+Math.sin(time/400)*1.4,yy-4,1.9,0,TAU); ctx.fill();
  }
  ctx.strokeStyle=col; ctx.lineWidth=2.2;
  ctx.beginPath(); ctx.moveTo(x,yy-14); ctx.quadraticCurveTo(x+3,yy-21,x+Math.sin(time/300+i)*4,yy-24); ctx.stroke();
  ctx.fillStyle='#ffe97a'; ctx.shadowColor='#ffe97a'; ctx.shadowBlur=mmode==='sleep'?0:7;
  ctx.beginPath(); ctx.arc(x+Math.sin(time/300+i)*4,yy-25,2.6,0,TAU); ctx.fill(); ctx.shadowBlur=0;
  ctx.fillStyle='#0e1834'; ctx.beginPath(); ctx.roundRect(x-15,yy+16,30,9,3); ctx.fill();
  ctx.fillStyle='#3fb4ff';
  if(mmode!=='sleep') for(let b=0;b<4;b++){ if(Math.sin(time/120+b*2+i)>0) ctx.fillRect(x-11+b*7,yy+19,4,2.6); }
}

/* ---------- warp transitions ---------- */
function drawWarp(time){
  const dir = mode==='warp'?1:-1;
  warpT += dir>0 ? .045 : .05;
  const k=Math.min(1,warpT);
  const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;  // easeInOut
  if(mode==='warp'){
    cam.x=savedCam.x+(curP.sys.x-savedCam.x)*e;
    cam.y=savedCam.y+(curP.sys.y-savedCam.y)*e;
    cam.z=savedCam.z+(5-savedCam.z)*e;
    drawGalaxy(time);
  } else {
    cam.x=curP.sys.x+(savedCam.x-curP.sys.x)*e;
    cam.y=curP.sys.y+(savedCam.y-curP.sys.y)*e;
    cam.z=5+(savedCam.z-5)*e;
    drawGalaxy(time);
  }
  // streaks
  ctx.save();
  ctx.translate(W/2,H/2);
  const streaks=26;
  for(let i=0;i<streaks;i++){
    const a=(i/streaks)*TAU+time/4000;
    const inner=40+e*30, outer=inner+e*Math.max(W,H)*.55;
    ctx.strokeStyle=`rgba(160,210,255,${.35*Math.sin(Math.min(1,k)*Math.PI)})`;
    ctx.lineWidth=1.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);
    ctx.lineTo(Math.cos(a)*outer,Math.sin(a)*outer);
    ctx.stroke();
  }
  ctx.restore();
  if(k>=1){
    if(mode==='warp'){ mode='system'; HQ.openSystem(curP); }
    else { mode='galaxy'; cam.tx=savedCam.x; cam.ty=savedCam.y; cam.tz=savedCam.z; curP=null; }
    warpT=0;
  }
}
function warpIn(p){
  if(mode!=='galaxy')return;
  curP=p; savedCam={x:cam.x,y:cam.y,z:cam.z};
  warpT=0; mode='warp';
  hover=null; tip.style.display='none';
  HQ.closeSystem();
}
function warpOut(){
  if(mode!=='system')return;
  warpT=0; mode='unwarp';
  hover=null; tip.style.display='none';
  HQ.closeSystem();
}

/* ---------- input ---------- */
let hover=null, dragging=false, dragMoved=0, dragStarP=null;
let lastPX=0,lastPY=0;
const tip=document.getElementById('gxTip');

function hitTest(mx,my){
  if(mode==='system'){
    for(const h of sysHits){
      if((mx-h.x)**2+(my-h.y)**2 < h.r*h.r) return {type:'sysplanet',i:h.i,url:h.url,label:h.label};
    }
    return null;
  }
  if(mode!=='galaxy') return null;
  const wx=s2wX(mx), wy=s2wY(my);
  const time=lastTime;
  // star core takes priority (innermost planets orbit close to it)
  for(const p of HQ.state.projects){
    const core=14+8*HQ.activityOf(p);
    if((wx-p.sys.x)**2+(wy-p.sys.y)**2 < core*core) return {type:'star',p};
  }
  for(const p of HQ.state.projects){
    const planets=HQ.planetsOf(p);
    for(let i=0;i<planets.length;i++){
      const[px,py]=planetPos(p,i,time);
      if((wx-px)**2+(wy-py)**2 < (8/cam.z+5)**2) return {type:'planet',p,i,url:planets[i].url,label:planets[i].label};
    }
  }
  for(const p of HQ.state.projects){
    const r=Math.max(26, 18+8*HQ.activityOf(p));
    if((wx-p.sys.x)**2+(wy-p.sys.y)**2 < r*r) return {type:'star',p};
  }
  return null;
}
cv.addEventListener('pointerdown',e=>{
  const r=cv.getBoundingClientRect();
  lastPX=e.clientX-r.left; lastPY=e.clientY-r.top;
  dragMoved=0;
  const h=hitTest(lastPX,lastPY);
  if(mode==='galaxy'&&HQ.state.settings.arrange&&h&&h.type==='star'){ dragStarP=h.p; }
  else dragging=true;
  cv.classList.add('dragging');
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove',e=>{
  const r=cv.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  if(dragStarP){
    dragStarP.sys.x=s2wX(mx); dragStarP.sys.y=s2wY(my);
    dragMoved+=Math.abs(mx-lastPX)+Math.abs(my-lastPY);
    lastPX=mx;lastPY=my;
    return;
  }
  if(dragging&&mode==='galaxy'){
    cam.tx-= (mx-lastPX)/cam.z; cam.ty-=(my-lastPY)/cam.z;
    cam.x=cam.tx; cam.y=cam.ty;
    dragMoved+=Math.abs(mx-lastPX)+Math.abs(my-lastPY);
  }
  lastPX=mx;lastPY=my;
  hover=hitTest(mx,my);
  cv.classList.toggle('hover-thing',!!hover&&!dragging);
  if(hover&&!dragging&&dragMoved<5){
    tip.style.display='block';
    tip.style.left=Math.min(mx+16, cv.clientWidth-260)+'px';
    tip.style.top=(my+14)+'px';
    if(hover.type==='star'){
      const p=hover.p, gh=HQ.live.github[p.id];
      tip.innerHTML=`<b style="color:${p.color}">${p.name}</b> — ${HQ.STATUS_LABEL[HQ.statusOf(p)]}
        <div class="t2">${gh&&!gh.error&&gh.lastMsg?('⎇ '+gh.lastMsg.slice(0,48)):'click to warp in'}${HQ.state.settings.arrange?' · drag to move':''}</div>`;
    } else {
      let host=''; try{ host=new URL(hover.url).host; }catch(err){}
      tip.innerHTML=`<b>${hover.label}</b><div class="t2">${host} — click to open</div>`;
    }
  } else tip.style.display='none';
});
cv.addEventListener('pointerup',e=>{
  cv.classList.remove('dragging');
  if(dragStarP){ HQ.save(); dragStarP=null; dragging=false; return; }
  dragging=false;
  if(dragMoved>=5) return;                 // it was a pan, not a click
  const r=cv.getBoundingClientRect();
  const h=hitTest(e.clientX-r.left,e.clientY-r.top);
  if(!h) return;
  if(h.type==='star') warpIn(h.p);
  else if(h.url) window.open(h.url,'_blank','noopener');
});
cv.addEventListener('wheel',e=>{
  if(mode!=='galaxy')return;
  e.preventDefault();
  const rct=cv.getBoundingClientRect();
  const mx=e.clientX-rct.left, my=e.clientY-rct.top;
  const factor=Math.exp(-e.deltaY*.0012);
  const nz=Math.min(3,Math.max(.5,cam.tz*factor));
  const wx=(mx-W/2)/cam.tz+cam.tx, wy=(my-H/2)/cam.tz+cam.ty;
  cam.tx=wx-(mx-W/2)/nz; cam.ty=wy-(my-H/2)/nz; cam.tz=nz;
},{passive:false});
cv.addEventListener('pointerleave',()=>{ tip.style.display='none'; hover=null; });

/* ---------- main loop ---------- */
let lastTime=0;
function frame(time){
  lastTime=time;
  // smooth camera
  if(mode==='galaxy'){
    cam.x+=(cam.tx-cam.x)*.12; cam.y+=(cam.ty-cam.y)*.12; cam.z+=(cam.tz-cam.z)*.12;
  }
  if(mode==='galaxy') drawGalaxy(time);
  else if(mode==='system') drawSystem(time);
  else drawWarp(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- public ---------- */
window.GX={
  resetCam(){ cam.tx=HOME.x; cam.ty=HOME.y; cam.tz=1; if(mode==='system') warpOut(); },
  warpOut,
  inSystem(){ return mode==='system'||mode==='warp'; }
};
})();
