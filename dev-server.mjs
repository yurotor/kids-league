/* שרת פיתוח מקומי בלבד — לא נפרס ל-Vercel.
   מריץ את האתר + את פונקציית ה-API האמיתית (api/results.js),
   מול חיקוי מקומי של Upstash Redis (REST) כך שהנתונים נשמרים לקובץ .dev-redis.json.
   הרצה: node dev-server.mjs  →  http://localhost:3000 */

import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE_PORT = 3000;
const REDIS_PORT = 3901;
const STORE_FILE = path.join(ROOT, '.dev-redis.json');

/* ---- חיקוי Upstash Redis REST (GET/SET בלבד) ---- */
let store = existsSync(STORE_FILE) ? JSON.parse(readFileSync(STORE_FILE, 'utf8')) : {};

const redisMock = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;

  const run = async (cmd) => { // למשל ["SET","krl:results","{...}"] או ["GET","krl:results"]
    const op = String(cmd[0]).toUpperCase();
    if (op === 'GET') return store[cmd[1]] ?? null;
    if (op === 'SET') { store[cmd[1]] = cmd[2]; await writeFile(STORE_FILE, JSON.stringify(store, null, 2)); return 'OK'; }
    return null;
  };

  let payload = { result: null };
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed[0])) { // pipeline: מערך פקודות ← מערך תשובות
      payload = [];
      for (const cmd of parsed) payload.push({ result: await run(cmd) });
    } else {
      payload = { result: await run(parsed) };
    }
  } catch (e) { /* פקודה לא מוכרת */ }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
});

/* ---- שרת האתר + ה-API ---- */
process.env.UPSTASH_REDIS_REST_URL = `http://localhost:${REDIS_PORT}`;
process.env.UPSTASH_REDIS_REST_TOKEN = 'dev-token';

const { default: resultsHandler } = await import('./api/results.js');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const site = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${SITE_PORT}`);

  if (url.pathname === '/api/results') {
    // מתאם מינימלי לחתימת (req, res) של Vercel
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : undefined; } catch (e) { req.body = undefined; }
    const shim = {
      status(code) { res.statusCode = code; return shim; },
      setHeader(k, v) { res.setHeader(k, v); return shim; },
      json(obj) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); },
      end(s) { res.end(s); }
    };
    try { await resultsHandler(req, shim); }
    catch (e) { console.error(e); res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
    return;
  }

  let file = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const full = path.join(ROOT, path.normalize(file));
  if (!full.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  try {
    const data = await readFile(full);
    res.setHeader('Content-Type', MIME[path.extname(full)] || 'application/octet-stream');
    res.end(data);
  } catch (e) { res.statusCode = 404; res.end('not found'); }
});

redisMock.listen(REDIS_PORT, () =>
  site.listen(SITE_PORT, () =>
    console.log(`✔ האתר + API רצים על http://localhost:${SITE_PORT} (Redis מדומה על ${REDIS_PORT}, נתונים ב-.dev-redis.json)`)));
