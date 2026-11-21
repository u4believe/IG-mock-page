// Minimal static server for the EJ frontend (no dependencies).
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT) || 3000;

// --- Load .env (simple, no dependency) ---
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  });
} catch (e) { /* no .env yet */ }
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// --- Live quotes proxy (Yahoo Finance), cached briefly to avoid hammering ---
const quoteCache = new Map(); // symbol -> { t, price, pct }
const QUOTE_TTL = 15000;

async function fetchQuote(symbol) {
  const hit = quoteCache.get(symbol);
  if (hit && Date.now() - hit.t < QUOTE_TTL) return hit;
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) + '?interval=1d&range=1d';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IGDemo/1.0)' } });
  if (!r.ok) throw new Error('upstream ' + r.status);
  const j = await r.json();
  const m = j.chart.result[0].meta;
  const price = m.regularMarketPrice;
  const prev = m.chartPreviousClose ?? m.previousClose ?? price;
  const pct = prev ? ((price - prev) / prev) * 100 : 0;
  const out = { t: Date.now(), price, pct };
  quoteCache.set(symbol, out);
  return out;
}

async function handleQuotes(req, res, url) {
  const symbols = (url.searchParams.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 30);
  const result = {};
  await Promise.all(symbols.map(async s => {
    try { const q = await fetchQuote(s); result[s] = { price: q.price, pct: q.pct }; }
    catch (e) { result[s] = null; }
  }));
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(result));
}

// --- Supabase Auth sign-up (creates a confirmed user via the Admin API) ---
function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
async function handleSignup(req, res) {
  const url = process.env.PROJECT_URL, key = process.env.SERVICE_ROLE;
  if (!url || !key) return sendJson(res, 200, { ok: false, error: 'Supabase not configured yet — fill PROJECT_URL and SERVICE_ROLE in ej-site/.env and restart the server.' });
  const body = await readBody(req);
  const email = (body.email || '').trim(), password = body.password || '';
  if (!email || !password) return sendJson(res, 200, { ok: false, error: 'Email and password are required.' });
  try {
    const r = await fetch(new URL(url).origin + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: body.meta || {} })
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return sendJson(res, 200, { ok: true, id: data.id, email: data.email });
    return sendJson(res, 200, { ok: false, error: data.msg || data.error_description || data.message || ('HTTP ' + r.status) });
  } catch (e) { return sendJson(res, 200, { ok: false, error: String(e) }); }
}

// --- Supabase Auth login (password grant, using the anon public key) ---
async function handleLogin(req, res) {
  const url = process.env.PROJECT_URL, anon = process.env.ANON_PUBLIC_KEY;
  if (!url || !anon) return sendJson(res, 200, { ok: false, error: 'Supabase not configured — fill PROJECT_URL and ANON_PUBLIC_KEY in ej-site/.env and restart the server.' });
  const body = await readBody(req);
  const email = (body.email || '').trim(), password = body.password || '';
  if (!email || !password) return sendJson(res, 200, { ok: false, error: 'Email and password are required.' });
  try {
    const r = await fetch(new URL(url).origin + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.access_token) return sendJson(res, 200, { ok: true, email: data.user && data.user.email, meta: data.user && data.user.user_metadata });
    return sendJson(res, 200, { ok: false, error: data.error_description || data.msg || data.message || 'Invalid login credentials' });
  } catch (e) { return sendJson(res, 200, { ok: false, error: String(e) }); }
}

http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  if (u.pathname === '/api/signup' && req.method === 'POST') { handleSignup(req, res).catch(() => sendJson(res, 500, { ok: false, error: 'server error' })); return; }
  if (u.pathname === '/api/login' && req.method === 'POST') { handleLogin(req, res).catch(() => sendJson(res, 500, { ok: false, error: 'server error' })); return; }
  if (u.pathname === '/api/quotes') { handleQuotes(req, res, u).catch(() => { res.writeHead(502); res.end('{}'); }); return; }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`EJ site running at http://localhost:${port}/`));
