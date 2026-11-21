// Minimal static server for the EJ frontend (no dependencies).
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT) || 3000;
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

http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
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
