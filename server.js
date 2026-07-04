#!/usr/bin/env node
/* =====================================================================
   HQ GALAXY — companion server
   Zero-dependency Node 18+ server that gives the dashboard superpowers:
     • serves the dashboard (public/)
     • /api/usage        — real Claude usage parsed from ~/.claude data
     • /api/run          — run prompts via the claude CLI, streamed (SSE)
     • /api/kill         — stop a running prompt
     • /api/new-project  — scaffold a new project folder + git init
     • /api/vercel       — latest deployment state (proxy, avoids CORS)
     • /api/stripe/summary — subs / MRR / 30d revenue (key stays in .env)
     • /api/ping         — reachability check for app URLs
   Binds 127.0.0.1 only. Secrets live in .env (never sent to the browser).
   ===================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

/* ---------- .env ---------- */
const ENV = {};
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) ENV[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* no .env is fine */ }
const env = k => process.env[k] || ENV[k] || '';

const PORT = parseInt(env('PORT')) || 4560;
const HOME = os.homedir();
const PROJECTS_ROOT = env('PROJECTS_ROOT') || path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ---------- helpers ---------- */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function within(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/* ---------- Claude usage (ccusage-style JSONL parsing) ---------- */
function collectJsonl(dir, out, depth) {
  if (depth > 6) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) collectJsonl(fp, out, depth + 1);
    else if (e.name.endsWith('.jsonl')) {
      try {
        const st = fs.statSync(fp);
        if (Date.now() - st.mtimeMs < 8 * 86400e3) out.push(fp); // only recent files matter
      } catch (err) {}
    }
  }
}
function apiUsage() {
  const files = [];
  collectJsonl(path.join(HOME, '.claude', 'projects'), files, 0);
  const now = Date.now();
  // 5h session blocks aligned to UTC hour boundaries (ccusage-style)
  const hourMs = 3600e3;
  const blockLen = 5 * hourMs;
  const nowHours = Math.floor(now / hourMs);
  const blockStart = (nowHours - (nowHours % 5)) * hourMs;
  const weekStart = now - 7 * 86400e3;
  let sessionTokens = 0, weeklyTokens = 0, entries = 0;
  const seen = new Set();
  for (const f of files) {
    let txt;
    try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const line of txt.split('\n')) {
      if (!line || line.indexOf('"usage"') === -1) continue;
      let j; try { j = JSON.parse(line); } catch (e) { continue; }
      const u = j.message && j.message.usage;
      if (!u || !j.timestamp) continue;
      const key = (j.message.id || '') + ':' + (j.requestId || '');
      if (key !== ':' && seen.has(key)) continue;
      if (key !== ':') seen.add(key);
      const ts = new Date(j.timestamp).getTime();
      if (isNaN(ts) || ts < weekStart) continue;
      const tok = (u.input_tokens || 0) + (u.output_tokens || 0) +
                  (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) * 0.1;
      weeklyTokens += tok;
      if (ts >= blockStart) sessionTokens += tok;
      entries++;
    }
  }
  return {
    sessionTokens: Math.round(sessionTokens),
    weeklyTokens: Math.round(weeklyTokens),
    sessionResetAt: new Date(blockStart + blockLen).toISOString(),
    weeklyResetAt: null,   // weekly limits roll — treat as trailing 7 days
    entries, files: files.length
  };
}

/* ---------- claude runs ---------- */
const RUNS = new Map();
function findClaude() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0] : null;
}
const CLAUDE_BIN = findClaude();

function apiRun(req, res, body) {
  const prompt = String(body.prompt || '').slice(0, 20000);
  if (!prompt) return json(res, 400, { error: 'prompt required' });
  if (!CLAUDE_BIN) return json(res, 500, { error: 'claude CLI not found on PATH' });
  let cwd = String(body.cwd || '') || PROJECTS_ROOT;
  cwd = path.resolve(cwd);
  if (!within(cwd, PROJECTS_ROOT) && !within(cwd, HOME))
    return json(res, 400, { error: 'cwd outside allowed roots' });
  if (!fs.existsSync(cwd)) return json(res, 400, { error: 'cwd does not exist: ' + cwd });

  const modeFlags = body.mode === 'full' ? ['--dangerously-skip-permissions']
    : body.mode === 'plan' ? ['--permission-mode', 'plan']
    : ['--permission-mode', 'acceptEdits'];

  const id = crypto.randomBytes(6).toString('hex');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  const send = obj => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) {} };
  send({ type: 'start', id, cwd });

  const child = spawn(CLAUDE_BIN,
    ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...modeFlags],
    { cwd, env: Object.assign({}, process.env), stdio: ['ignore', 'pipe', 'pipe'] });
  RUNS.set(id, child);

  let buf = '';
  child.stdout.on('data', d => {
    buf += d.toString();
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try { send({ type: 'line', data: JSON.parse(line) }); }
      catch (e) { send({ type: 'line', data: { type: 'raw', text: line } }); }
    }
  });
  let errBuf = '';
  child.stderr.on('data', d => { errBuf = (errBuf + d.toString()).slice(-2000); });
  child.on('close', code => {
    if (errBuf && code !== 0) send({ type: 'err', msg: errBuf.trim().slice(-500) });
    send({ type: 'exit', code });
    RUNS.delete(id);
    res.end();
  });
  req.on('close', () => { if (RUNS.has(id)) { child.kill('SIGTERM'); RUNS.delete(id); } });
}

function apiNewProject(res, body) {
  const raw = String(body.name || '').trim();
  const name = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (!name) return json(res, 400, { error: 'valid name required' });
  const dir = path.join(PROJECTS_ROOT, name);
  if (!within(dir, PROJECTS_ROOT)) return json(res, 400, { error: 'bad name' });
  if (fs.existsSync(dir)) return json(res, 400, { error: 'folder already exists: ' + dir });
  fs.mkdirSync(dir, { recursive: true });
  spawnSync('git', ['init'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'),
    `# ${raw}\n\nNew project created from HQ Galaxy on ${new Date().toISOString().slice(0, 10)}.\n\n## Notes\n- Describe what this project is for here.\n`);
  return json(res, 200, { path: dir });
}

/* ---------- external proxies ---------- */
async function apiVercel(req, res, url) {
  const token = req.headers['x-vercel-token'] || env('VERCEL_TOKEN');
  if (!token) return json(res, 200, { error: 'no vercel token (set in Settings or .env)' });
  const project = url.searchParams.get('project') || '';
  try {
    if (project === '__test__') {
      const r = await fetch('https://api.vercel.com/v2/user', { headers: { Authorization: 'Bearer ' + token } });
      return json(res, 200, r.ok ? { authOk: true } : { error: 'token rejected (' + r.status + ')' });
    }
    const r = await fetch('https://api.vercel.com/v6/deployments?app=' + encodeURIComponent(project) + '&limit=1',
      { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return json(res, 200, { error: 'vercel ' + r.status });
    const j = await r.json();
    const d = j.deployments && j.deployments[0];
    if (!d) return json(res, 200, { error: 'no deployments for "' + project + '"' });
    return json(res, 200, { state: d.state || d.readyState, url: d.url, at: new Date(d.createdAt).toISOString() });
  } catch (e) { return json(res, 200, { error: e.message }); }
}

async function apiStripe(res) {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) return json(res, 200, { error: 'no STRIPE_SECRET_KEY in .env' });
  const H = { Authorization: 'Bearer ' + key };
  try {
    const subsR = await fetch('https://api.stripe.com/v1/subscriptions?status=active&limit=100', { headers: H });
    const subs = await subsR.json();
    if (subs.error) return json(res, 200, { error: subs.error.message });
    let mrr = 0;
    for (const s of subs.data || []) {
      for (const item of (s.items && s.items.data) || []) {
        const p = item.price || {};
        const amt = (p.unit_amount || 0) * (item.quantity || 1);
        if (p.recurring && p.recurring.interval === 'year') mrr += amt / 12;
        else if (p.recurring && p.recurring.interval === 'month') mrr += amt / (p.recurring.interval_count || 1);
      }
    }
    const since = Math.floor((Date.now() - 30 * 86400e3) / 1000);
    const chR = await fetch('https://api.stripe.com/v1/charges?created[gte]=' + since + '&limit=100', { headers: H });
    const ch = await chR.json();
    let rev = 0;
    for (const c of ch.data || []) if (c.paid && !c.refunded) rev += (c.amount_captured || c.amount || 0);
    return json(res, 200, {
      subs: (subs.data || []).length,
      mrr: Math.round(mrr) / 100,
      revenue30d: Math.round(rev) / 100
    });
  } catch (e) { return json(res, 200, { error: e.message }); }
}

async function apiPing(res, url) {
  const target = url.searchParams.get('url') || '';
  if (!/^https?:\/\//.test(target)) return json(res, 400, { error: 'http(s) url required' });
  try {
    const r = await fetch(target, { method: 'HEAD', signal: AbortSignal.timeout(6000), redirect: 'follow' });
    return json(res, 200, { ok: r.ok, status: r.status });
  } catch (e) { return json(res, 200, { ok: false, error: e.message }); }
}

/* ---------- static ---------- */
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(res, urlPath) {
  let fp = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!within(fp, PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
}

/* ---------- router ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,x-vercel-token'
        });
        return res.end();
      }
      if (p === '/api/health') return json(res, 200, {
        ok: true, version: 2, projectsRoot: PROJECTS_ROOT,
        hasStripe: !!env('STRIPE_SECRET_KEY'), hasVercel: !!env('VERCEL_TOKEN'),
        claude: !!CLAUDE_BIN
      });
      if (p === '/api/usage') return json(res, 200, apiUsage());
      if (p === '/api/vercel') return apiVercel(req, res, url);
      if (p === '/api/stripe/summary') return apiStripe(res);
      if (p === '/api/ping') return apiPing(res, url);
      if (p === '/api/run' && req.method === 'POST') return apiRun(req, res, await readBody(req));
      if (p === '/api/kill' && req.method === 'POST') {
        const b = await readBody(req);
        const child = RUNS.get(b.id);
        if (child) { child.kill('SIGTERM'); RUNS.delete(b.id); }
        return json(res, 200, { ok: !!child });
      }
      if (p === '/api/new-project' && req.method === 'POST') return apiNewProject(res, await readBody(req));
      return json(res, 404, { error: 'unknown endpoint' });
    }
    serveStatic(res, p);
  } catch (e) {
    try { json(res, 500, { error: e.message }); } catch (err) {}
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ◈ HQ GALAXY — mission control');
  console.log('  ──────────────────────────────');
  console.log('  dashboard:      http://localhost:' + PORT);
  console.log('  projects root:  ' + PROJECTS_ROOT);
  console.log('  claude CLI:     ' + (CLAUDE_BIN || 'NOT FOUND — Bridge runs disabled'));
  console.log('  stripe key:     ' + (env('STRIPE_SECRET_KEY') ? 'loaded from .env' : 'not set'));
  console.log('  vercel token:   ' + (env('VERCEL_TOKEN') ? 'loaded from .env' : 'not set (can also be set in UI)'));
  console.log('');
});
