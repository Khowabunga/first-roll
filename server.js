/* First Roll: tiny server. Serves the app and makes the OpenAI calls, so the
   API key stays on this machine and never reaches the browser.

   Run:  OPENAI_API_KEY=sk-...  node server.js      (or put the key in a .env file)
   Then open http://localhost:8787

   The app builds every prompt itself (see the "ai" block of each theme in src/),
   so this file only forwards them. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

// read a .env file if there is one (KEY=value per line)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) { process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  });
} catch (e) { /* no .env, fine */ }

const PORT = Number(process.env.PORT) || 8787;
const ROOT = path.join(__dirname, 'public');
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gpt-image-2';
const IMAGE_QUALITY = process.env.IMAGE_QUALITY || 'medium';
const TEXT_MODEL = process.env.TEXT_MODEL || 'gpt-4.1-mini';
const key = () => process.env.OPENAI_API_KEY || '';
/* Set DM_PASSCODE when the app is on the public internet: then only someone who knows it can open a
   table, and only people at a table can spend the OpenAI key. */
const DM_PASSCODE = process.env.DM_PASSCODE || '';

async function openai(route, body) {
  const r = await fetch('https://api.openai.com' + route, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || ('OpenAI returned ' + r.status)); e.status = r.status; throw e; }
  return j;
}

// keep line breaks, drop other control characters, cap the length
const clean = (s, max) => String(s || '').replace(/[\u0000-\u0009\u000b-\u001f]+/g, ' ').trim().slice(0, max);

/* One portrait from one finished prompt. */
async function image(body) {
  const prompt = clean(body.prompt, 6000);
  const size = ['1024x1536', '1536x1024', '1024x1024'].includes(body.size) ? body.size : '1024x1536';
  if (!prompt) { const e = new Error('Describe the character first.'); e.status = 400; throw e; }
  const t = Date.now();
  const j = await openai('/v1/images/generations', {
    model: IMAGE_MODEL, prompt, size, quality: IMAGE_QUALITY, output_format: 'webp', output_compression: 82, n: 1
  });
  return { image: 'data:image/webp;base64,' + j.data[0].b64_json, model: IMAGE_MODEL, seconds: Math.round((Date.now() - t) / 1000) };
}

/* One piece of writing: plain text, or a JSON object when json is true. */
async function text(body) {
  const system = clean(body.system, 30000), user = clean(body.user, 12000);
  if (!system || !user) { const e = new Error('Nothing to ask.'); e.status = 400; throw e; }
  const req = { model: TEXT_MODEL, temperature: 0.9, max_tokens: Math.min(800, Number(body.max) || 200), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (body.json) { req.response_format = { type: 'json_object' }; }
  const j = await openai('/v1/chat/completions', req);
  const out = j.choices[0].message.content || '';
  if (!body.json) { return { text: clean(out, 1500), model: TEXT_MODEL }; }
  try { return { json: JSON.parse(out), model: TEXT_MODEL }; } catch (e) { const x = new Error('The story helper gave an unreadable answer.'); x.status = 502; throw x; }
}


/* ---------------- tables: one DM, their players, and what the DM has shown them ----------------
   Kept in memory. A table lasts until it has been idle for twelve hours or the server restarts. */
const tables = new Map();
const LIMIT = { players: 8, portraits: 6, images: 150, texts: 800, feed: 300, tables: 40 };
const rnd = (n) => crypto.randomBytes(n).toString('hex');
const bad = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
function newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = Array.from(crypto.randomBytes(4), (b) => A[b % A.length]).join(''); } while (tables.has(c)); return c; }
function tableOf(body) { const t = tables.get(String(body.code || '').toUpperCase()); if (!t) { throw bad(404, 'No table with that code. Check it with your DM.'); } t.touched = Date.now(); return t; }
/* slow down anyone guessing table codes or passcodes: twenty wrong tries a minute from one address */
const misses = new Map();
function strike(ip) { const now = Date.now(), m = misses.get(ip); if (!m || now - m.t > 60000) { misses.set(ip, { t: now, n: 1 }); } else { m.n++; } }
function blocked(ip) { const m = misses.get(ip); return !!m && Date.now() - m.t <= 60000 && m.n >= 20; }
function whoIs(t, token) { if (token && token === t.dm) { return { dm: true }; } for (const p of t.players.values()) { if (p.token === token) { return p; } } return null; }
function member(body) { const t = tableOf(body), w = whoIs(t, body.token); if (!w) { throw bad(403, 'You are not at this table any more. Join again with the table code.'); } return { t, w }; }
function storeImage(t, dataUrl) {
  const m = /^data:image\/(webp|png|jpeg);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) { throw bad(400, 'That is not a picture.'); }
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3000000) { throw bad(413, 'That picture is too large.'); }
  if (t.imgs.size >= LIMIT.images + 60) { throw bad(429, 'This table has stored as many pictures as it can hold.'); }
  const id = rnd(8); t.imgs.set(id, { buf, type: 'image/' + m[1] });
  return 'api/table/img?code=' + t.code + '&id=' + id;
}
const pubPlayer = (p) => ({ id: p.id, name: p.name, char: p.char, portrait: p.portrait });
const TABLE = {
  open(body) {
    if (DM_PASSCODE && String(body.passcode || '') !== DM_PASSCODE) { throw bad(403, 'That is not the DM passcode.'); }
    if (body.code) {                             // the DM coming back to a table that is already open
      const back = tables.get(String(body.code).toUpperCase());
      if (!back) { throw bad(404, 'No table with that code. It may have been cleared away; start a new one.'); }
      back.touched = Date.now();
      return { code: back.code, token: back.dm, players: back.players.size };
    }
    if (tables.size >= LIMIT.tables) { throw bad(429, 'Too many tables are open right now. Try again later.'); }
    const t = { code: newCode(), dm: rnd(16), created: Date.now(), touched: Date.now(), players: new Map(), feed: [], imgs: new Map(), seq: 0, spend: { images: 0, texts: 0 } };
    tables.set(t.code, t);
    return { code: t.code, token: t.dm };
  },
  join(body) {
    const t = tableOf(body), name = clean(body.name, 24);
    if (!name) { throw bad(400, 'Tell the table your name first.'); }
    if (t.players.size >= LIMIT.players) { throw bad(409, 'This table is full.'); }
    const p = { id: rnd(4), token: rnd(16), name, char: null, portrait: '', portraits: 0 };
    t.players.set(p.id, p);
    return { code: t.code, id: p.id, token: p.token };
  },
  me(body) {
    const { t, w } = member(body);
    if (w.dm) { throw bad(400, 'The DM has no character.'); }
    if (body.char) { const c = body.char; w.char = { name: clean(c.name, 40), race: clean(c.race, 30), cls: clean(c.cls, 30), line: clean(c.line, 80), look: clean(c.look, 400) }; }
    if (body.name) { w.name = clean(body.name, 24); }
    if (body.portrait === '') { w.portrait = ''; }
    else if (body.portrait) { w.portrait = /^img\//.test(body.portrait) ? clean(body.portrait, 80) : storeImage(t, body.portrait); }
    return { ok: true, portrait: w.portrait };
  },
  state(body) {
    const { t, w } = member(body), after = Number(body.after) || 0;
    return { code: t.code, you: w.dm ? 'dm' : w.id, players: Array.from(t.players.values(), pubPlayer), feed: t.feed.filter((f) => f.n > after), last: t.seq };
  },
  keep(body) {                 // the DM stores a picture without showing it yet
    const { t, w } = member(body);
    if (!w.dm) { throw bad(403, 'Only the DM can do that.'); }
    return { url: storeImage(t, body.image) };
  },
  send(body) {                 // the DM shows every player a note or a picture
    const { t, w } = member(body);
    if (!w.dm) { throw bad(403, 'Only the DM can send to the table.'); }
    const img = body.image ? (/^(img\/|api\/table\/img\?)/.test(body.image) ? clean(body.image, 120) : storeImage(t, body.image)) : '';
    const item = { n: ++t.seq, at: Date.now(), kind: img ? 'image' : 'note', title: clean(body.title, 80), text: clean(body.text, 1200), img };
    if (!item.img && !item.text && !item.title) { throw bad(400, 'There is nothing to send.'); }
    t.feed.push(item); if (t.feed.length > LIMIT.feed) { t.feed.shift(); }
    return { ok: true, n: item.n, players: t.players.size };
  }
};
/* Who may spend the key: anyone when no passcode is set (your own computer), otherwise only a table. */
function spend(body, kind) {
  if (!DM_PASSCODE && !body.code) { return; }
  const { t, w } = member(body);
  if (kind === 'images') {
    if (!w.dm) { if (w.portraits >= LIMIT.portraits) { throw bad(429, 'You have painted as many portraits as this table allows.'); } w.portraits++; }
    if (t.spend.images >= LIMIT.images) { throw bad(429, 'This table has reached its picture limit.'); }
  } else if (t.spend.texts >= LIMIT.texts) { throw bad(429, 'This table has reached its story-help limit.'); }
  t.spend[kind]++;
}
setInterval(() => { const cut = Date.now() - 12 * 3600 * 1000; for (const [c, t] of tables) { if (t.touched < cut) { tables.delete(c); } } for (const [ip, m] of misses) { if (Date.now() - m.t > 60000) { misses.delete(ip); } } }, 600000).unref();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

function send(res, status, data, type, extra) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, Object.assign({ 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store' }, extra || {}));
  res.end(body);
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > limit) { reject(bad(413, 'Request too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(bad(400, 'Bad JSON')); } });
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') {
      return send(res, 200, { ok: true, live: !!key(), tables: true, passcode: !!DM_PASSCODE, open: !DM_PASSCODE });
    }
    if (url.pathname === '/api/table/img') {
      const t = tables.get(String(url.searchParams.get('code') || '').toUpperCase()), im = t && t.imgs.get(url.searchParams.get('id'));
      return im ? send(res, 200, im.buf, im.type, { 'Cache-Control': 'private, max-age=86400' }) : send(res, 404, 'Not found', 'text/plain');
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'POST') { return send(res, 405, { error: 'POST only' }); }
      const body = await readJson(req, 4500000);
      const act = /^\/api\/table\/(open|join|me|state|keep|send)$/.exec(url.pathname);
      if (act) {
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), guess = act[1] === 'open' || act[1] === 'join';
        if (guess && blocked(ip)) { return send(res, 429, { error: 'Too many wrong tries. Wait a minute, then try again.' }); }
        try { return send(res, 200, TABLE[act[1]](body)); } catch (e) { if (guess && (e.status === 403 || e.status === 404)) { strike(ip); } throw e; }
      }
      const fn = { '/api/image': image, '/api/text': text }[url.pathname];
      if (!fn) { return send(res, 404, { error: 'Unknown route' }); }
      if (!key()) { return send(res, 503, { error: 'No OPENAI_API_KEY set on the server.' }); }
      spend(body, fn === image ? 'images' : 'texts');
      const out = await fn(body);
      if (fn === image && body.keep && body.code) { out.url = storeImage(member(body).t, out.image); delete out.image; }   // the picture stays on the table; the browser gets its address
      return send(res, 200, out);
    }
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { return send(res, 403, 'Forbidden', 'text/plain'); }
    if (url.pathname === '/' || !path.extname(file)) { file = path.join(ROOT, 'index.html'); }
    fs.readFile(file, (err, data) => {
      if (err) { return send(res, 404, 'Not found', 'text/plain'); }
      const ext = path.extname(file), type = TYPES[ext] || 'application/octet-stream';
      const cache = { 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=604800' };
      if ((ext === '.html' || ext === '.js') && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        return zlib.gzip(data, (e, z) => e ? send(res, 200, data, type, cache) : send(res, 200, z, type, Object.assign({ 'Content-Encoding': 'gzip' }, cache)));
      }
      send(res, 200, data, type, cache);
    });
  } catch (e) {
    send(res, e.status && e.status < 600 ? e.status : 500, { error: e.message || 'Something went wrong' });
  }
}).listen(PORT, () => {
  if (key() && !DM_PASSCODE && (process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME || process.env.NODE_ENV === 'production')) { console.warn('WARNING: this looks like a public server with no DM_PASSCODE. Anyone who finds the address can spend your OpenAI key. Set DM_PASSCODE.'); }
  console.log('First Roll is at http://localhost:' + PORT + (key() ? '  (OpenAI key found: pictures are live)' : '  (no OPENAI_API_KEY: pictures use samples)') + (DM_PASSCODE ? '  (DM passcode set)' : '  (no DM_PASSCODE: anyone can open a table)'));
});
