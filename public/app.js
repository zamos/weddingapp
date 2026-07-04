/* =====================================================================
   HQ GALAXY — app.js
   State, migration, live data sync (GitHub / usage / Vercel / Stripe),
   panels, settings modal (project CRUD), and The Bridge prompt console.
   galaxy.js reads everything through window.HQ.
   ===================================================================== */
'use strict';

const $ = id => document.getElementById(id);
const t = () => Math.random().toString(36).slice(2, 9);
function esc(s){ const d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
function fmtAgo(ts){
  if(!ts) return '';
  const s = Math.max(1,(Date.now()-new Date(ts))/1000);
  if(s<60) return Math.floor(s)+'s ago';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}

/* ============================ STATE ============================ */
const LS_KEY = 'pixelhq-state-v1';

const DEFAULT_PROJECTS = [
  { id:'proofbase', name:'ProofBase', icon:'📄', color:'#5ba8ff',
    tagline:'PDF proofing + approval for photo/design studios.',
    stack:'Next.js 15 · Supabase · Tailwind · Stripe · Vercel',
    phase:'Live at proofbase.co.uk', repo:'zamos/proofbase',
    appUrl:'https://proofbase.co.uk', adminUrl:'https://proofbase.co.uk/admin',
    links:{ 'Supabase':'https://supabase.com/dashboard/project/dgtdocjckmkmdmpdjwpn',
            'Stripe':'https://dashboard.stripe.com', 'Vercel':'https://vercel.com/dashboard' },
    path:'', vercelName:'proofbase', stripe:true, archived:false,
    sys:{x:250,y:200,planets:3} },
  { id:'quotebake', name:'QuoteBake', icon:'🧁', color:'#ff5e96',
    tagline:'Quoting SaaS for baking businesses — recipes, ingredients, costs → professional quotes.',
    stack:'React 19 + Vite · Express · PostgreSQL · Stripe · 20i VPS',
    phase:'Phase 4 of 6 — wire frontend to API', repo:'zamos/quotebake',
    appUrl:'https://app.quotebake.co.uk', adminUrl:'https://app.quotebake.co.uk',
    links:{ 'Landing page':'https://quotebake.co.uk', 'Stripe':'https://dashboard.stripe.com' },
    path:'', vercelName:'', stripe:true, archived:false,
    sys:{x:610,y:160,planets:4} },
  { id:'furbase', name:'Furbase', icon:'🐶', color:'#42e58c',
    tagline:'Grooming management for independent dog groomers — calendar, customers, portal.',
    stack:'Next.js · Prisma · FullCalendar · Vercel Blob',
    phase:'Onboarding + customer portal in progress', repo:'zamos/anthropic',
    appUrl:'https://furbase.vercel.app', adminUrl:'https://furbase.vercel.app/admin',
    links:{ 'Vercel':'https://vercel.com/dashboard' },
    path:'', vercelName:'furbase', stripe:false, archived:false,
    sys:{x:965,y:230,planets:3} },
  { id:'drivingapp', name:'Driving App', icon:'🚗', color:'#ffb84d',
    tagline:'Driving instructor / learner app — early idea stage, repo is a stub.',
    stack:'TBD', phase:'Needs an MVP brief', repo:'zamos/drivingapp',
    appUrl:'', adminUrl:'', links:{}, path:'', vercelName:'', stripe:false, archived:false,
    sys:{x:400,y:470,planets:1} },
  { id:'aisle', name:'Aisle', icon:'💍', color:'#b48aff',
    tagline:'Wedding planning prototype — this repo now hosts HQ Galaxy.',
    stack:'HQ Galaxy dashboard + companion server', phase:'Hosting mission control',
    repo:'zamos/weddingapp', appUrl:'', adminUrl:'', links:{}, path:'',
    vercelName:'', stripe:false, archived:true,
    sys:{x:790,y:490,planets:2} }
];

function seedExtras(){
  return {
    todos:[
      {id:t(),p:'quotebake', txt:'Phase 4 — wire React app to the API (api.js, auth screens, replace localStorage)', done:false},
      {id:t(),p:'quotebake', txt:'Phase 5 — static landing page at quotebake.co.uk', done:false},
      {id:t(),p:'quotebake', txt:'Phase 6 — deploy to 20i VPS (PM2, reverse proxy, SSL, live Stripe keys)', done:false},
      {id:t(),p:'proofbase', txt:'Set SUPABASE_ACCESS_TOKEN + SUPABASE_DB_PASSWORD secrets so db-migrate workflow can run', done:false},
      {id:t(),p:'furbase',   txt:'Finish onboarding flow + polish CSV customer import', done:false},
      {id:t(),p:'drivingapp',txt:'Write the project brief / define the MVP', done:false},
      {id:t(),p:'aisle',     txt:'Set tokens in ⚙ Settings so the galaxy runs on live data', done:false}
    ],
    campaigns:[
      {id:t(),p:'quotebake', name:'Pre-launch waitlist on landing page', st:'planned'},
      {id:t(),p:'quotebake', name:'Facebook baking groups — soft launch posts', st:'planned'},
      {id:t(),p:'proofbase', name:'Direct outreach emails to photo studios', st:'active'},
      {id:t(),p:'furbase',   name:'Instagram before/after grooming reels', st:'planned'}
    ],
    channels:[
      {id:t(), name:'Instagram', on:true,  who:'QuoteBake · Furbase'},
      {id:t(), name:'Facebook groups', on:true, who:'QuoteBake'},
      {id:t(), name:'TikTok', on:false, who:'—'},
      {id:t(), name:'SEO blog posts', on:false, who:'ProofBase · QuoteBake'},
      {id:t(), name:'Cold email outreach', on:true, who:'ProofBase'}
    ],
    ideas:[
      'Free "price your bakes" calculator as a QuoteBake lead magnet',
      'ProofBase case study with first studio customer',
      'Furbase: partner with local pet shops for referral codes',
      'Cross-promote: one shared "built by" footer across all apps'
    ]
  };
}
function makeSpark(seedStr){
  let h=0; for(const c of seedStr) h=(h*31+c.charCodeAt(0))>>>0;
  const out=[]; let v=20+(h%30);
  for(let i=0;i<24;i++){ h=(h*1103515245+12345)>>>0; v=Math.max(2,v+((h>>>16)%11)-4); out.push(v); }
  return out;
}

function defaultState(){
  const ex = seedExtras();
  return {
    v:2,
    projects: JSON.parse(JSON.stringify(DEFAULT_PROJECTS)),
    todos: ex.todos, campaigns: ex.campaigns, channels: ex.channels, ideas: ex.ideas,
    stats: Object.fromEntries(DEFAULT_PROJECTS.map(p=>[p.id,{users:0,mrr:0,revenue:0,spark:makeSpark(p.id)}])),
    usage:{ plan:'Pro', sessionUsed:0, weeklyUsed:0, sessionResetAt:null, weeklyResetAt:null },
    tokens:{ github:'', vercel:'' },
    limits:{ session:1000000, weekly:10000000 },
    settings:{ arrange:false },
    runs:[]
  };
}

function migrate(old){
  // v1 had a fixed PROJECTS array in code + old.links overrides; v2 stores projects in state
  const st = defaultState();
  for(const k of ['todos','campaigns','channels','ideas','stats','usage']) if(old[k]) st[k]=old[k];
  if(old.tokens) st.tokens = Object.assign(st.tokens, old.tokens);
  if(old.limits) st.limits = Object.assign(st.limits, old.limits);
  if(old.projects){ st.projects = old.projects; }
  else if(old.links){ // merge v1 link URL overrides into the seeded projects
    for(const p of st.projects){
      const ov = old.links[p.id]; if(!ov) continue;
      if(ov['Open app']) p.appUrl = ov['Open app'];
      if(ov['Admin panel']) p.adminUrl = ov['Admin panel'];
      for(const [label,url] of Object.entries(ov))
        if(label!=='Open app'&&label!=='Admin panel') p.links[label]=url;
    }
  }
  if(old.settings) st.settings = Object.assign(st.settings, old.settings);
  if(old.runs) st.runs = old.runs;
  st.v = 2;
  return st;
}

let state;
try{
  const raw = localStorage.getItem(LS_KEY);
  const parsed = raw ? JSON.parse(raw) : null;
  state = !parsed ? defaultState() : (parsed.v===2 ? Object.assign(defaultState(), parsed) : migrate(parsed));
}catch(e){ state = defaultState(); }
// ensure every project has required fields + a stats row
for(const p of state.projects){
  p.links = p.links||{}; p.sys = p.sys||autoPosition();
  if(!state.stats[p.id]) state.stats[p.id]={users:0,mrr:0,revenue:0,spark:makeSpark(p.id)};
}
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
save();

/* ------------ live (never persisted) ------------ */
const live = {
  server:false, serverInfo:null,
  usage:null,               // {sessionTokens,weeklyTokens,sessionResetAt,weeklyResetAt}
  github:{},                // pid -> {commits24h,commits7d,lastMsg,lastAt,openIssues,error}
  vercel:{},                // pid -> {state,url,at,error}
  stripe:null,              // {subs,mrr,revenue30d}
  lastSync:0, syncing:false, runsActive:{}   // pid -> true while a Bridge run is live
};

const API = location.protocol==='file:' ? 'http://127.0.0.1:4560' : '';

/* ============================ DERIVED ============================ */
const STATUS_LABEL = {live:'LIVE', building:'BUILDING', prototype:'ARCHIVED', idea:'UNCHARTED'};
const STATUS_DESC  = {live:'stable orbit', building:'agents active', prototype:'dormant', idea:'needs a brief'};

function projById(id){ return state.projects.find(p=>p.id===id); }
function statusOf(p){
  if(p.archived) return 'prototype';
  const gh = live.github[p.id];
  if(gh && gh.lastAt && (Date.now()-new Date(gh.lastAt)) < 48*3600e3) return 'building';
  if(live.runsActive[p.id]) return 'building';
  if(p.appUrl) return 'live';
  return 'idea';
}
function activityOf(p){
  const vc = live.vercel[p.id];
  if(vc && (vc.state==='BUILDING'||vc.state==='QUEUED')) return 1;
  if(live.runsActive[p.id]) return 1;
  const st = statusOf(p);
  const gh = live.github[p.id];
  if(st==='building') return gh && gh.commits24h>0 ? 1 : .7;
  if(st==='live') return .45;
  if(st==='prototype') return .2;
  return .12;
}
function errorOf(p){ const vc=live.vercel[p.id]; return !!(vc && vc.state==='ERROR'); }
function openTasks(pid){
  const local = state.todos.filter(td=>td.p===pid&&!td.done).length;
  const gh = live.github[pid];
  return local + (gh ? (gh.openIssues||0) : 0);
}
function planetsOf(p){
  const out=[];
  if(p.appUrl)   out.push({label:'Open app', url:p.appUrl});
  if(p.adminUrl && p.adminUrl!==p.appUrl) out.push({label:'Admin panel', url:p.adminUrl});
  if(p.repo)     out.push({label:'GitHub — '+p.repo, url:'https://github.com/'+p.repo});
  for(const [label,url] of Object.entries(p.links||{})) out.push({label, url});
  return out.slice(0,6);
}
function feedFor(pid){
  const out=[];
  const gh=live.github[pid], vc=live.vercel[pid];
  if(vc && vc.state) out.push({msg:'Vercel deploy — '+vc.state.toLowerCase(), at:vc.at});
  if(gh){
    if(gh.lastMsg) out.push({msg:'⎇ '+gh.lastMsg, at:gh.lastAt});
    if(gh.openIssues) out.push({msg:gh.openIssues+' open issue'+(gh.openIssues>1?'s':'')+' on GitHub', at:null});
  }
  for(const r of state.runs.filter(r=>r.projectId===pid).slice(-3).reverse())
    out.push({msg:'◈ bridge: '+r.prompt.slice(0,60), at:r.ts});
  if(!out.length) out.push({msg:'No recent activity — connect GitHub in ⚙ Settings', at:null});
  return out.slice(0,8);
}
function autoPosition(){
  // golden-angle spiral around galactic centre, skipping occupied space
  const cx=640, cy=330, GA=Math.PI*(3-Math.sqrt(5));
  for(let n=1;n<60;n++){
    const r=120+34*Math.sqrt(n)*2.2, a=n*GA;
    const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r*.6;
    if(x<120||x>1160||y<90||y>560) continue;
    if(!state || state.projects.every(p=>((p.sys.x-x)**2+(p.sys.y-y)**2)>200*200/2)) return {x,y,planets:2};
  }
  return {x:300+Math.random()*700, y:150+Math.random()*380, planets:2};
}

/* ============================ SYNC ============================ */
async function detectServer(){
  try{
    const r = await fetch(API+'/api/health',{signal:AbortSignal.timeout(2500)});
    if(r.status===401 && location.protocol!=='file:'){
      // password cookie expired — reload so the server shows its login page
      location.reload();
      return false;
    }
    const j = await r.json();
    live.server = true; live.serverInfo = j;
  }catch(e){ live.server = false; live.serverInfo = null; }
  $('modeBanner').classList.toggle('show', !live.server && location.protocol==='file:');
  return live.server;
}

async function ghApi(path){
  const headers = {'Accept':'application/vnd.github+json'};
  if(state.tokens.github) headers['Authorization'] = 'Bearer '+state.tokens.github;
  const r = await fetch('https://api.github.com'+path, {headers, signal:AbortSignal.timeout(9000)});
  if(!r.ok) throw new Error('GitHub '+r.status);
  return r.json();
}
async function syncGithub(p){
  if(!p.repo) return;
  try{
    const since = new Date(Date.now()-7*86400e3).toISOString();
    const [commits, issues] = await Promise.all([
      ghApi(`/repos/${p.repo}/commits?since=${since}&per_page=100`),
      ghApi(`/repos/${p.repo}/issues?state=open&per_page=100`)
    ]);
    const day = Date.now()-86400e3;
    live.github[p.id] = {
      commits7d: commits.length,
      commits24h: commits.filter(c=>new Date(c.commit.author.date)>day).length,
      lastMsg: commits[0] ? commits[0].commit.message.split('\n')[0] : null,
      lastAt: commits[0] ? commits[0].commit.author.date : null,
      openIssues: issues.filter(i=>!i.pull_request).length,
      error:null
    };
  }catch(e){
    live.github[p.id] = Object.assign(live.github[p.id]||{}, {error:e.message});
  }
}
async function syncUsage(){
  if(!live.server) return;
  try{
    const r = await fetch(API+'/api/usage',{signal:AbortSignal.timeout(8000)});
    live.usage = await r.json();
  }catch(e){ live.usage = null; }
}
async function syncVercel(p){
  if(!live.server || !p.vercelName) return;
  try{
    const headers = {};
    if(state.tokens.vercel) headers['x-vercel-token'] = state.tokens.vercel;
    const r = await fetch(API+'/api/vercel?project='+encodeURIComponent(p.vercelName), {headers, signal:AbortSignal.timeout(9000)});
    const j = await r.json();
    if(j.error) throw new Error(j.error);
    live.vercel[p.id] = j;   // {state,url,at}
  }catch(e){ live.vercel[p.id] = {error:e.message}; }
}
async function syncStripe(){
  if(!live.server || !live.serverInfo || !live.serverInfo.hasStripe) return;
  try{
    const r = await fetch(API+'/api/stripe/summary',{signal:AbortSignal.timeout(15000)});
    const j = await r.json();
    if(!j.error) live.stripe = j;
  }catch(e){ /* keep old */ }
}

let syncTimer=null;
async function syncAll(){
  if(live.syncing) return;
  live.syncing = true;
  $('syncDot').className='sync-dot stale';
  await detectServer();
  const jobs=[syncUsage(), syncStripe()];
  for(const p of state.projects){ jobs.push(syncGithub(p)); jobs.push(syncVercel(p)); }
  await Promise.allSettled(jobs);
  live.lastSync = Date.now();
  live.syncing = false;
  const anyGh = Object.values(live.github).some(g=>g && !g.error);
  $('syncDot').className = 'sync-dot ' + (anyGh||live.server ? 'ok' : (state.tokens.github?'err':''));
  $('syncDot').title = 'last sync '+new Date().toLocaleTimeString()+(live.server?' · server online':' · server offline');
  renderAll();
}
function startPolling(){
  syncAll();
  clearInterval(syncTimer);
  syncTimer = setInterval(()=>{ if(document.visibilityState==='visible') syncAll(); }, 180000);
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='visible' && Date.now()-live.lastSync>180000) syncAll();
  });
}

/* ============================ PANELS ============================ */
function renderProjects(){
  const grid = $('projectsGrid'); grid.innerHTML='';
  for(const p of state.projects){
    const st = statusOf(p), gh = live.github[p.id], vc = live.vercel[p.id];
    const card = document.createElement('div');
    card.className='gx-panel proj'; card.id='proj-'+p.id;
    const btns=[];
    if(p.appUrl) btns.push(`<a class="gx-btn" target="_blank" rel="noopener" href="${esc(p.appUrl)}">Open app</a>`);
    if(p.adminUrl) btns.push(`<a class="gx-btn amber" target="_blank" rel="noopener" href="${esc(p.adminUrl)}">⚙ Admin panel</a>`);
    for(const [l,u] of Object.entries(p.links||{})) btns.push(`<a class="gx-btn" target="_blank" rel="noopener" href="${esc(u)}">${esc(l)}</a>`);
    if(p.repo) btns.push(`<a class="gx-btn ghost" target="_blank" rel="noopener" href="https://github.com/${esc(p.repo)}">GitHub ↗</a>`);
    const bits=[];
    if(gh && !gh.error){
      bits.push(`<span><b>${gh.commits7d}</b> commits/7d</span>`);
      if(gh.openIssues) bits.push(`<span><b>${gh.openIssues}</b> issues</span>`);
      if(gh.lastAt) bits.push(`<span>last push <b>${fmtAgo(gh.lastAt)}</b></span>`);
    } else if(p.repo && state.tokens.github && gh && gh.error){
      bits.push(`<span style="color:var(--red)">github: ${esc(gh.error)}</span>`);
    }
    if(vc && vc.state) bits.push(`<span>deploy <b style="color:${vc.state==='READY'?'var(--teal)':vc.state==='ERROR'?'var(--red)':'var(--amber)'}">${esc(vc.state)}</b></span>`);
    card.innerHTML = `
      <div class="head">
        <div class="swatch" style="background:${p.color}1f;box-shadow:0 0 16px ${p.color}55;border:1px solid ${p.color}66">${esc(p.icon)}</div>
        <div>
          <h3 style="color:${p.color}">${esc(p.name)}</h3>
          <div class="repo">${esc(p.repo||'no repo linked')}</div>
        </div>
        <span class="status ${st}">${STATUS_LABEL[st]}</span>
      </div>
      <div class="tagline">${esc(p.tagline||'')}</div>
      <div class="stack">${esc(p.stack||'')}</div>
      <div class="phase">${esc(p.phase||'')}</div>
      ${bits.length?`<div class="livebits">${bits.join('')}</div>`:''}
      <div class="links">${btns.join('')}</div>
      <button class="edit-links" data-p="${p.id}">✎ edit system</button>`;
    grid.appendChild(card);
  }
  grid.querySelectorAll('.edit-links').forEach(b=>{ b.onclick=()=>openProjectForm(b.dataset.p); });
}

function renderTodoSelects(){
  const opts = state.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('todoProj').innerHTML = opts;
  $('campProj').innerHTML = opts;
  const bp = $('bridgeProj');
  bp.innerHTML = `<option value="">— quick chat (no project) —</option>` +
    state.projects.map(p=>`<option value="${p.id}" ${p.path?'':'disabled'}>${esc(p.name)}${p.path?'':' (no local path)'}</option>`).join('');
}

function renderTodos(){
  const list = $('todoList'); list.innerHTML='';
  for(const p of state.projects){
    const items = state.todos.filter(td=>td.p===p.id);
    const gh = live.github[p.id];
    const ghIssues = gh && gh.openIssues ? gh.openIssues : 0;
    if(!items.length && !ghIssues) continue;
    const open = items.filter(i=>!i.done).length;
    const g = document.createElement('div');
    g.className='todo-group';
    g.innerHTML = `<div class="gh"><i style="background:${p.color};color:${p.color}"></i>${esc(p.name)}
      <span class="count">${open} open${ghIssues?` · ${ghIssues} gh issues`:''}</span>
      ${ghIssues?`<a class="count" style="color:var(--cyan)" target="_blank" href="https://github.com/${esc(p.repo)}/issues">view issues ↗</a>`:''}</div>`;
    for(const td of items){
      const row=document.createElement('div');
      row.className='todo'+(td.done?' done':'');
      row.innerHTML=`<input type="checkbox" ${td.done?'checked':''}>
        <span class="txt">${esc(td.txt)}</span><button class="del">✕</button>`;
      row.querySelector('input').onchange=e=>{ td.done=e.target.checked; save(); renderTodos(); };
      row.querySelector('.del').onclick=()=>{ state.todos=state.todos.filter(x=>x.id!==td.id); save(); renderTodos(); };
      g.appendChild(row);
    }
    list.appendChild(g);
  }
  if(!list.children.length) list.innerHTML='<div class="usage-note">Mission log clear. Log the next thing above.</div>';
}
$('todoAdd').onclick = addTodo;
$('todoText').addEventListener('keydown',e=>{ if(e.key==='Enter') addTodo(); });
function addTodo(){
  const txt=$('todoText').value.trim(); if(!txt) return;
  state.todos.push({id:t(), p:$('todoProj').value, txt, done:false});
  $('todoText').value=''; save(); renderTodos();
}
$('clearDone').onclick=()=>{ state.todos=state.todos.filter(td=>!td.done); save(); renderTodos(); };

/* ---------- usage / fuel ---------- */
function fmtCountdown(iso){
  if(!iso) return 'reset time not set';
  const ms=new Date(iso)-Date.now();
  if(ms<=0) return 'window has reset';
  const h=Math.floor(ms/3600e3), m=Math.floor(ms%3600e3/60e3), d=Math.floor(h/24);
  return d>=1?`resets in ${d}d ${h%24}h`:`resets in ${h}h ${m}m`;
}
function fuelGrad(left){
  if(left>50) return 'linear-gradient(90deg,#37e6b0,#3fb4ff);box-shadow:0 0 12px rgba(63,180,255,.5)';
  if(left>20) return 'linear-gradient(90deg,#ffb84d,#ff8a4d);box-shadow:0 0 12px rgba(255,184,77,.5)';
  return 'linear-gradient(90deg,#ff6b81,#ff4d6b);box-shadow:0 0 12px rgba(255,107,129,.5)';
}
function usageBar(el,title,leftPct,detail,resetIso){
  const left=Math.max(0,Math.min(100,Math.round(leftPct)));
  el.innerHTML=`
    <div class="lbl"><span>${title}</span><b>${left}% left</b></div>
    <div class="track"><div class="fill" style="width:${left}%;background:${fuelGrad(left)}"></div></div>
    <div class="reset">⏱ ${fmtCountdown(resetIso)}${detail?' · '+detail:''}</div>`;
}
function renderUsage(){
  let sLeft, wLeft, sReset, wReset, sDetail='', wDetail='', auto=false;
  if(live.usage){
    auto = true;
    sLeft = 100 - (live.usage.sessionTokens / state.limits.session * 100);
    wLeft = 100 - (live.usage.weeklyTokens  / state.limits.weekly  * 100);
    sReset = live.usage.sessionResetAt; wReset = live.usage.weeklyResetAt;
    sDetail = Math.round(live.usage.sessionTokens/1000)+'k tokens this window';
    wDetail = Math.round(live.usage.weeklyTokens/1000)+'k tokens this week';
  } else {
    sLeft = 100-state.usage.sessionUsed; wLeft = 100-state.usage.weeklyUsed;
    sReset = state.usage.sessionResetAt; wReset = state.usage.weeklyResetAt;
  }
  usageBar($('barSession'), 'Session tank (5h window)', sLeft, sDetail, sReset);
  usageBar($('barWeekly'), 'Weekly reserves', wLeft, wDetail, wReset);
  $('usageAutoTag').style.display = auto?'':'none';
  $('usageNote').innerHTML = auto
    ? `Reading your local Claude Code data automatically (refreshes with each sync). Percentages
       are measured against the limits in ⚙ Settings — tune them until they match <code>/status</code>.`
    : `Companion server offline — manual mode. Click <b>edit</b> and copy numbers from <code>/status</code>.`;
  const chipLeft = Math.max(0,Math.min(100,Math.round(wLeft)));
  $('chipPct').textContent = chipLeft+'%';
  const bar=$('chipBar');
  bar.style.width=chipLeft+'%';
  bar.style.cssText += ';background:'+fuelGrad(chipLeft); bar.style.width=chipLeft+'%';
}
function editUsage(){
  const u=state.usage;
  const s=prompt('Session used % (from /status):',u.sessionUsed); if(s===null)return;
  const w=prompt('Weekly used %:',u.weeklyUsed); if(w===null)return;
  const sh=prompt('Hours until session reset:','5');
  const wd=prompt('Days until weekly reset:','7');
  u.sessionUsed=Math.min(100,Math.max(0,parseFloat(s)||0));
  u.weeklyUsed=Math.min(100,Math.max(0,parseFloat(w)||0));
  if(sh!==null)u.sessionResetAt=new Date(Date.now()+(parseFloat(sh)||0)*3600e3).toISOString();
  if(wd!==null)u.weeklyResetAt=new Date(Date.now()+(parseFloat(wd)||0)*86400e3).toISOString();
  save(); renderUsage();
}
$('usageEdit').onclick=editUsage;
$('usageChip').onclick=()=>{ if(!live.usage) editUsage(); else $('usage').scrollIntoView({behavior:'smooth'}); };
setInterval(renderUsage,60000);

/* ---------- stats ---------- */
const STAT_KEYS=[['users','users'],['mrr','MRR £/mo'],['revenue','revenue £']];
function renderStats(){
  const grid=$('statsGrid'); grid.innerHTML='';
  if(live.stripe){
    const c=document.createElement('div');
    c.className='gx-panel stat-card';
    c.innerHTML=`
      <div class="head"><i style="background:#635bff;color:#635bff"></i><h3 style="color:#8f88ff">Stripe — account<span class="auto-tag">LIVE</span></h3></div>
      <div class="nums">
        <div class="num"><div class="v">${live.stripe.subs}</div><div class="k">active subs</div></div>
        <div class="num"><div class="v">£${live.stripe.mrr}</div><div class="k">MRR</div></div>
        <div class="num"><div class="v">£${live.stripe.revenue30d}</div><div class="k">rev 30d</div></div>
      </div>
      <div class="foot">pulled from Stripe by the companion server</div>`;
    grid.appendChild(c);
  }
  for(const p of state.projects){
    const s=state.stats[p.id];
    const card=document.createElement('div');
    card.className='gx-panel stat-card';
    card.innerHTML=`
      <div class="head"><i style="background:${p.color};color:${p.color}"></i><h3 style="color:${p.color}">${esc(p.name)}</h3></div>
      <div class="nums">
        ${STAT_KEYS.map(([k,lbl])=>`
          <div class="num" data-k="${k}" title="click to edit">
            <div class="v">${k==='users'?s[k]:'£'+s[k]}</div><div class="k">${lbl}</div>
          </div>`).join('')}
      </div>
      <canvas width="600" height="100"></canvas>
      <div class="foot">sample curve · click numbers to update${p.stripe?' · stripe-linked':''}</div>`;
    card.querySelectorAll('.num').forEach(el=>{
      el.onclick=()=>{
        const k=el.dataset.k, v=prompt(`${p.name} — ${k}:`,s[k]);
        if(v===null)return;
        s[k]=Math.max(0,parseFloat(String(v).replace(/[£,]/g,''))||0);
        save(); renderStats();
      };
    });
    grid.appendChild(card);
    drawSpark(card.querySelector('canvas'), s.spark, p.color);
  }
}
function drawSpark(cv,data,color){
  const c=cv.getContext('2d');
  c.clearRect(0,0,cv.width,cv.height);
  const max=Math.max(...data), W=cv.width, H=cv.height, pad=6;
  const pt=i=>[pad+i*(W-2*pad)/(data.length-1), H-pad-(data[i]/max)*(H-2*pad)];
  c.beginPath(); c.moveTo(pad,H);
  data.forEach((_,i)=>{const[x,y]=pt(i);c.lineTo(x,y);});
  c.lineTo(W-pad,H); c.closePath();
  const g=c.createLinearGradient(0,0,0,H);
  g.addColorStop(0,color+'45'); g.addColorStop(1,color+'05');
  c.fillStyle=g; c.fill();
  c.beginPath();
  data.forEach((_,i)=>{const[x,y]=pt(i); i?c.lineTo(x,y):c.moveTo(x,y);});
  c.strokeStyle=color;c.lineWidth=2.5;c.lineJoin='round';c.lineCap='round';
  c.shadowColor=color;c.shadowBlur=8;c.stroke();c.shadowBlur=0;
}

/* ---------- marketing ---------- */
const ST_CYCLE={planned:'active',active:'done',done:'planned'};
function renderMarketing(){
  const list=$('campList'); list.innerHTML='';
  for(const c of state.campaigns){
    const p=projById(c.p);
    const row=document.createElement('div');
    row.className='camp';
    row.innerHTML=`<span class="dot" style="background:${p?p.color:'#888'};color:${p?p.color:'#888'}"></span>
      <span class="name">${esc(c.name)} <span class="proj-tag">· ${p?esc(p.name):esc(c.p)}</span></span>
      <span class="st ${c.st}">${c.st}</span><button class="del">✕</button>`;
    row.querySelector('.st').onclick=()=>{ c.st=ST_CYCLE[c.st]; save(); renderMarketing(); };
    row.querySelector('.del').onclick=()=>{ state.campaigns=state.campaigns.filter(x=>x.id!==c.id); save(); renderMarketing(); };
    list.appendChild(row);
  }
  if(!state.campaigns.length) list.innerHTML='<div class="usage-note">No campaigns yet.</div>';
  const ch=$('channelList'); ch.innerHTML='';
  for(const c of state.channels){
    const row=document.createElement('div');
    row.className='channel';
    row.innerHTML=`<input type="checkbox" ${c.on?'checked':''}> ${esc(c.name)} <span class="who">${esc(c.who)}</span>`;
    row.querySelector('input').onchange=e=>{ c.on=e.target.checked; save(); };
    ch.appendChild(row);
  }
  $('ideaList').innerHTML=state.ideas.map(i=>`<div class="idea">${esc(i)}</div>`).join('');
}
$('campAdd').onclick=()=>{
  const inp=$('campText'); if(!inp.value.trim())return;
  state.campaigns.push({id:t(),p:$('campProj').value,name:inp.value.trim(),st:'planned'});
  inp.value=''; save(); renderMarketing();
};
$('campText').addEventListener('keydown',e=>{ if(e.key==='Enter')$('campAdd').click(); });

/* ---------- legend ---------- */
function renderLegend(){
  $('legend').innerHTML = state.projects.map(p=>
    `<span><i style="background:${p.color};color:${p.color}"></i>${esc(p.name)} — ${STATUS_LABEL[statusOf(p)].toLowerCase()}</span>`
  ).join('') + `<span style="margin-left:auto">planets = your links · asteroids = open missions · ☄ = active work</span>`;
}

function renderAll(){
  renderProjects(); renderTodoSelects(); renderTodos();
  renderUsage(); renderStats(); renderMarketing(); renderLegend();
}

/* ============================ SETTINGS ============================ */
const veil=$('settingsVeil');
$('settingsBtn').onclick=()=>{ openSettings(); };
$('settingsClose').onclick=()=>veil.classList.remove('show');
veil.addEventListener('click',e=>{ if(e.target===veil) veil.classList.remove('show'); });

function openSettings(){
  renderProjList();
  $('tokGithub').value=state.tokens.github||'';
  $('tokVercel').value=state.tokens.vercel||'';
  $('limSession').value=state.limits.session;
  $('limWeekly').value=state.limits.weekly;
  $('arrangeMode').checked=!!state.settings.arrange;
  $('projForm').style.display='none';
  veil.classList.add('show');
}
function renderProjList(){
  const el=$('projList'); el.innerHTML='';
  for(const p of state.projects){
    const row=document.createElement('div');
    row.className='prow';
    row.innerHTML=`<i style="background:${p.color};color:${p.color}"></i>
      <span class="nm">${esc(p.icon)} ${esc(p.name)} <span class="sub">· ${esc(p.repo||'no repo')} ${p.archived?'· archived':''}</span></span>
      <button class="gx-btn ghost" data-e="${p.id}">edit</button>`;
    row.querySelector('button').onclick=()=>openProjectForm(p.id);
    el.appendChild(row);
  }
}
let editingId=null;
function openProjectForm(id){
  veil.classList.add('show');
  editingId=id||null;
  const p=id?projById(id):null;
  $('projFormTitle').textContent=p?('Edit — '+p.name):'Add system';
  $('pfName').value=p?p.name:'';
  $('pfIcon').value=p?p.icon:'🪐';
  $('pfColor').value=p?p.color:'#3fb4ff';
  $('pfTagline').value=p?p.tagline:'';
  $('pfStack').value=p?p.stack:'';
  $('pfPhase').value=p?p.phase:'';
  $('pfRepo').value=p?p.repo:'';
  $('pfApp').value=p?p.appUrl:'';
  $('pfAdmin').value=p?p.adminUrl:'';
  $('pfLinks').value=p?Object.entries(p.links||{}).map(([l,u])=>l+' | '+u).join('\n'):'';
  $('pfPath').value=p?p.path:'';
  $('pfVercel').value=p?p.vercelName:'';
  $('pfStripe').checked=p?!!p.stripe:false;
  $('pfDelete').style.display=p?'':'none';
  $('projForm').style.display='';
  $('projForm').scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('projAddBtn').onclick=()=>openProjectForm(null);
$('addProjectBtn').onclick=()=>{ openSettings(); openProjectForm(null); };
$('pfCancel').onclick=()=>{ $('projForm').style.display='none'; editingId=null; };
$('pfSave').onclick=()=>{
  const name=$('pfName').value.trim();
  if(!name){ alert('Name required'); return; }
  const links={};
  for(const line of $('pfLinks').value.split('\n')){
    const m=line.split('|');
    if(m.length>=2 && m[0].trim() && m[1].trim()) links[m[0].trim()]=m.slice(1).join('|').trim();
  }
  const fields={
    name, icon:$('pfIcon').value.trim()||'🪐', color:$('pfColor').value,
    tagline:$('pfTagline').value.trim(), stack:$('pfStack').value.trim(),
    phase:$('pfPhase').value.trim(), repo:$('pfRepo').value.trim().replace(/^https:\/\/github\.com\//,''),
    appUrl:$('pfApp').value.trim(), adminUrl:$('pfAdmin').value.trim(), links,
    path:$('pfPath').value.trim(), vercelName:$('pfVercel').value.trim(),
    stripe:$('pfStripe').checked
  };
  if(editingId){
    Object.assign(projById(editingId), fields);
  } else {
    const id=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||t();
    const p=Object.assign({id, archived:false, sys:autoPosition()}, fields);
    p.sys.planets=Math.max(1,Math.min(6,planetsOf(p).length||1));
    state.projects.push(p);
    state.stats[p.id]={users:0,mrr:0,revenue:0,spark:makeSpark(p.id)};
  }
  save(); renderAll(); renderProjList();
  $('projForm').style.display='none'; editingId=null;
  syncAll();
};
$('pfDelete').onclick=()=>{
  if(!editingId) return;
  const p=projById(editingId);
  if(!confirm(`Delete "${p.name}" from the galaxy? Its missions and stats go too.`)) return;
  state.projects=state.projects.filter(x=>x.id!==editingId);
  state.todos=state.todos.filter(td=>td.p!==editingId);
  state.campaigns=state.campaigns.filter(c=>c.p!==editingId);
  delete state.stats[editingId];
  save(); renderAll(); renderProjList();
  $('projForm').style.display='none'; editingId=null;
};
$('arrangeMode').onchange=e=>{ state.settings.arrange=e.target.checked; save(); };
$('tokGithub').onchange=e=>{ state.tokens.github=e.target.value.trim(); save(); syncAll(); };
$('tokVercel').onchange=e=>{ state.tokens.vercel=e.target.value.trim(); save(); syncAll(); };
$('limSession').onchange=e=>{ state.limits.session=Math.max(1000,parseInt(e.target.value)||1000000); save(); renderUsage(); };
$('limWeekly').onchange=e=>{ state.limits.weekly=Math.max(1000,parseInt(e.target.value)||10000000); save(); renderUsage(); };
document.querySelectorAll('[data-test]').forEach(btn=>{
  btn.onclick=async()=>{
    const kind=btn.dataset.test, el=$(kind==='github'?'tstGithub':'tstVercel');
    el.textContent='…'; el.className='tst';
    try{
      if(kind==='github'){
        state.tokens.github=$('tokGithub').value.trim(); save();
        const me=await ghApi('/user');
        el.textContent='✓ '+me.login; el.className='tst ok';
      } else {
        state.tokens.vercel=$('tokVercel').value.trim(); save();
        const r=await fetch(API+'/api/vercel?project=__test__',{headers:{'x-vercel-token':state.tokens.vercel}});
        const j=await r.json();
        if(j.authOk){ el.textContent='✓ token ok'; el.className='tst ok'; }
        else throw new Error(j.error||'failed');
      }
    }catch(e){ el.textContent='✕ failed'; el.className='tst bad'; }
  };
});
$('exportBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='hq-galaxy-backup.json';
  a.click();
};
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{
  const f=e.target.files[0]; if(!f)return;
  try{
    const j=JSON.parse(await f.text());
    if(!j.projects) throw new Error('not a HQ Galaxy backup');
    state=Object.assign(defaultState(), j);
    save(); renderAll(); renderProjList();
    alert('Imported ✓');
  }catch(err){ alert('Import failed: '+err.message); }
};

/* ============================ THE BRIDGE ============================ */
const bridge=$('bridge');
let currentRun=null;   // {id, abort}
$('bridgeBar').onclick=()=>bridge.classList.toggle('open');
$('bridgeBtn').onclick=()=>bridge.classList.toggle('open');
document.addEventListener('keydown',e=>{
  if(e.key==='`' && !/input|textarea|select/i.test(document.activeElement.tagName)){
    e.preventDefault(); bridge.classList.toggle('open');
  }
  if(e.key==='Escape' && window.GX && window.GX.inSystem()) window.GX.warpOut();
});
$('bridgePrompt').addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter') $('bridgeRun').click();
});

function bLog(html,cls){
  const out=$('bridgeOut');
  const el=document.createElement('div');
  if(cls)el.className=cls;
  el.innerHTML=html;
  out.appendChild(el);
  out.scrollTop=out.scrollHeight;
}
function bText(txt){
  const out=$('bridgeOut');
  let last=out.lastElementChild;
  if(!last||!last.classList.contains('txtline')){
    last=document.createElement('div');
    last.className='txtline';
    out.appendChild(last);
  }
  last.textContent+=txt;
  out.scrollTop=out.scrollHeight;
}

$('bridgeRun').onclick=async()=>{
  const promptTxt=$('bridgePrompt').value.trim();
  if(!promptTxt) return;
  const pid=$('bridgeProj').value;
  const p=pid?projById(pid):null;

  if(!live.server){
    window.open('https://claude.ai/new?q='+encodeURIComponent(promptTxt),'_blank');
    bLog('◈ server offline — opened claude.ai with your prompt instead','sysline');
    return;
  }
  if(currentRun){ bLog('a run is already active — stop it first','errline'); return; }

  $('bridgeOut').innerHTML='';
  bLog(`◈ ${esc(p?p.name:'quick chat')} › ${esc(promptTxt)}`,'sysline');
  $('bridgeRun').disabled=true; $('bridgeKill').style.display='';
  $('bridgeStat').textContent='running…';
  if(p) live.runsActive[p.id]=true;

  const run={id:null, abort:new AbortController()};
  currentRun=run;
  try{
    const res=await fetch(API+'/api/run',{
      method:'POST', signal:run.abort.signal,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt:promptTxt, cwd:p?p.path:'', mode:$('bridgeMode').value})
    });
    if(!res.ok || !res.body) throw new Error('server returned '+res.status);
    const reader=res.body.getReader(), dec=new TextDecoder();
    let buf='';
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      buf+=dec.decode(value,{stream:true});
      const parts=buf.split('\n\n'); buf=parts.pop();
      for(const part of parts){
        const line=part.split('\n').find(l=>l.startsWith('data: '));
        if(!line)continue;
        let ev; try{ ev=JSON.parse(line.slice(6)); }catch(e){ continue; }
        handleRunEvent(ev, run);
      }
    }
  }catch(e){
    if(e.name!=='AbortError') bLog('✕ '+esc(e.message),'errline');
  }
  state.runs.push({id:t(), projectId:pid||null, prompt:promptTxt, ts:new Date().toISOString()});
  state.runs=state.runs.slice(-20); save();
  if(p) delete live.runsActive[p.id];
  currentRun=null;
  $('bridgeRun').disabled=false; $('bridgeKill').style.display='none';
  $('bridgeStat').textContent='run Claude prompts · start new projects · press `';
  $('bridgePrompt').value='';
};
function handleRunEvent(ev, run){
  if(ev.type==='start'){ run.id=ev.id; bLog('◈ session started ('+esc(ev.cwd||'no dir')+')','sysline'); return; }
  if(ev.type==='exit'){ bLog(`◈ done (exit ${ev.code})`, ev.code===0?'okline':'errline'); return; }
  if(ev.type==='err'){ bLog('✕ '+esc(ev.msg),'errline'); return; }
  if(ev.type!=='line') return;
  const d=ev.data||{};
  if(d.type==='system'&&d.subtype==='init'){ bLog('◈ model: '+esc(d.model||'?'),'sysline'); return; }
  if(d.type==='assistant'&&d.message&&Array.isArray(d.message.content)){
    for(const c of d.message.content){
      if(c.type==='text') bText(c.text);
      if(c.type==='tool_use') bLog('⚙ '+esc(c.name)+' '+esc(JSON.stringify(c.input||{}).slice(0,110)),'toolline');
    }
    return;
  }
  if(d.type==='result'){
    bLog('◈ finished'+(d.total_cost_usd?` · $${d.total_cost_usd.toFixed(3)}`:'')+(d.num_turns?` · ${d.num_turns} turns`:''),'okline');
  }
}
$('bridgeKill').onclick=async()=>{
  if(!currentRun) return;
  try{ if(currentRun.id) await fetch(API+'/api/kill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:currentRun.id})}); }catch(e){}
  currentRun.abort.abort();
  bLog('■ stopped','errline');
};
$('newProjBtn').onclick=async()=>{
  if(!live.server){ alert('New-project needs the companion server (npm start).'); return; }
  const name=prompt('New project name (folder will be created under your projects root):');
  if(!name)return;
  const kickoff=prompt('Kickoff prompt for Claude (optional — leave blank to just create it):','');
  bridge.classList.add('open');
  bLog('◈ creating project "'+esc(name)+'"…','sysline');
  try{
    const r=await fetch(API+'/api/new-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    const j=await r.json();
    if(j.error) throw new Error(j.error);
    const id=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||t();
    const colors=['#3fb4ff','#37e6b0','#ffb84d','#ff5e96','#b48aff','#ffd75e'];
    const p={id, name, icon:'🌱', color:colors[state.projects.length%colors.length],
      tagline:'Newly charted system.', stack:'', phase:'Just created', repo:'',
      appUrl:'', adminUrl:'', links:{}, path:j.path, vercelName:'', stripe:false,
      archived:false, sys:autoPosition()};
    state.projects.push(p);
    state.stats[p.id]={users:0,mrr:0,revenue:0,spark:makeSpark(p.id)};
    save(); renderAll();
    bLog('◈ created at '+esc(j.path)+' — added to the galaxy','okline');
    if(kickoff){
      $('bridgeProj').value=p.id;
      $('bridgePrompt').value=kickoff;
      $('bridgeRun').click();
    }
  }catch(e){ bLog('✕ '+esc(e.message),'errline'); }
};
$('bridgeProj').addEventListener('change',()=>{
  const p=projById($('bridgeProj').value);
  $('bridgeCwd').textContent=p&&p.path?('cwd: '+p.path):'';
});

/* ============================ SYSTEM VIEW OVERLAY ============================ */
function openSystem(p){
  $('sysName').textContent=p.name+' system';
  $('sysName').style.color=p.color;
  const st=statusOf(p);
  $('sysStatus').textContent=`${STATUS_LABEL[st]} · ${STATUS_DESC[st]} · ${openTasks(p.id)} open missions`;
  const acts=$('sysActions'); acts.innerHTML='';
  for(const pl of planetsOf(p)){
    const a=document.createElement('a');
    a.className='gx-btn'+(pl.label==='Admin panel'?' amber':'');
    a.target='_blank'; a.rel='noopener'; a.href=pl.url;
    a.textContent=(pl.label==='Admin panel'?'⚙ ':'')+pl.label.replace(/^GitHub — .*/,'GitHub');
    acts.appendChild(a);
  }
  const runBtn=document.createElement('button');
  runBtn.className='gx-btn teal'; runBtn.textContent='◈ run prompt';
  runBtn.onclick=()=>{ bridge.classList.add('open'); $('bridgeProj').value=p.path?p.id:''; $('bridgePrompt').focus(); };
  acts.appendChild(runBtn);
  const back=document.createElement('button');
  back.className='gx-btn ghost'; back.textContent='← galaxy';
  back.onclick=()=>window.GX && window.GX.warpOut();
  acts.appendChild(back);
  $('sysFeedList').innerHTML=feedFor(p.id).map(f=>
    `<div class="fi">${esc(f.msg)}${f.at?` <span class="ago">· ${fmtAgo(f.at)}</span>`:''}</div>`).join('');
  $('sysBar').classList.add('show');
}
function closeSystem(){ $('sysBar').classList.remove('show'); }

/* ============================ HQ interface for galaxy.js ============================ */
window.HQ = {
  get state(){ return state; },
  live, save,
  projById, statusOf, activityOf, errorOf, openTasks, planetsOf, feedFor,
  STATUS_LABEL, openSystem, closeSystem,
  runActive: pid => !!live.runsActive[pid]
};

/* ============================ boot ============================ */
$('resetCam').onclick=()=>window.GX && window.GX.resetCam();
renderAll();
startPolling();
