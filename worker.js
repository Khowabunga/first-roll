/* First Roll on Cloudflare. It does the same job as server.js, split in two:

   - The Worker (the default export) is a thin router. Static files come from ./public, and
     every /api call that belongs to a table is handed to that table's Durable Object.
   - Table (a Durable Object, one per table code) keeps the players, what the DM has shown
     them and the pictures, and makes the OpenAI calls. Its state is saved, so a table
     survives being put to sleep between requests. It deletes itself after twelve idle hours.

   Secrets (Worker > Settings > Variables and Secrets): OPENAI_API_KEY and DM_PASSCODE.
   Without both, the site still runs but shows sample pictures only. */
import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';

const LIMIT = { players: 8, portraits: 6, images: 150, texts: 800, feed: 300, stored: 220 };
const IDLE = 12 * 3600 * 1000;
const SIZES = ['1024x1536', '1536x1024', '1024x1024'];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

class Bad extends Error { constructor(status, message) { super(message); this.status = status; } }
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (e) => reply({ error: (e && e.message) || 'Something went wrong' }, e instanceof Bad ? e.status : 500);
// keep line breaks, drop other control characters, cap the length
const clean = (s, max) => String(s || '').replace(/[\u0000-\u0009\u000b-\u001f]+/g, ' ').trim().slice(0, max);
const rnd = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => LETTERS[b % LETTERS.length]).join('');
async function readJson(request, limit) {
  if (Number(request.headers.get('content-length') || 0) > limit) { throw new Bad(413, 'Request too large'); }
  const text = await request.text();
  if (text.length > limit) { throw new Bad(413, 'Request too large'); }
  try { return text ? JSON.parse(text) : {}; } catch (e) { throw new Bad(400, 'Bad JSON'); }
}

/* Slow down anyone guessing table codes or the passcode: twenty wrong tries a minute from one
   address. Kept per running copy of the Worker, so it is a speed bump, not a wall. */
const misses = new Map();
function strike(ip) { const now = Date.now(), m = misses.get(ip); if (!m || now - m.t > 60000) { misses.set(ip, { t: now, n: 1 }); } else { m.n++; } if (misses.size > 5000) { misses.clear(); } }
function blocked(ip) { const m = misses.get(ip); return !!m && Date.now() - m.t <= 60000 && m.n >= 20; }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      const r = await env.ASSETS.fetch(request);
      // any other address (a mistyped link, say) lands on the app itself
      if (r.status === 404 && request.method === 'GET' && !/\.[a-z0-9]+$/i.test(url.pathname)) { return env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers })); }
      return r;
    }
    try {
      if (url.pathname === '/api/health') {
        return reply({ ok: true, live: !!(env.OPENAI_API_KEY && env.DM_PASSCODE), tables: !!env.DM_PASSCODE, passcode: true, open: false });
      }
      const table = (code) => env.TABLES.get(env.TABLES.idFromName(code));
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      if (url.pathname === '/api/table/img') {
        const code = String(url.searchParams.get('code') || '').toUpperCase();
        return /^[A-Z]{4}$/.test(code) ? table(code).fetch(request) : new Response('Not found', { status: 404 });
      }
      if (request.method !== 'POST') { throw new Bad(405, 'POST only'); }
      if (url.pathname === '/api/table/open') {
        if (blocked(ip)) { throw new Bad(429, 'Too many wrong tries. Wait a minute, then try again.'); }
        if (!env.DM_PASSCODE) { throw new Bad(503, 'This site has no DM_PASSCODE set, so tables are switched off.'); }
        const body = await readJson(request, 2000);
        if (String(body.passcode || '') !== env.DM_PASSCODE) { strike(ip); throw new Bad(403, 'That is not the DM passcode.'); }
        for (let i = 0; i < 6; i++) {           // pick a code nobody is using
          const code = newCode(), r = await table(code).fetch(new Request('https://table/api/table/open?c=' + code, { method: 'POST' }));
          if (r.status !== 409) { return r; }
        }
        throw new Bad(503, 'Could not open a table just now. Try again.');
      }
      const spending = url.pathname === '/api/image' || url.pathname === '/api/text';
      if (!spending && !/^\/api\/table\/(join|me|state|keep|send)$/.test(url.pathname)) { throw new Bad(404, 'Unknown route'); }
      const code = String(url.searchParams.get('c') || '').toUpperCase(), joining = url.pathname === '/api/table/join';
      if (joining && blocked(ip)) { throw new Bad(429, 'Too many wrong tries. Wait a minute, then try again.'); }
      if (!/^[A-Z]{4}$/.test(code)) {
        if (joining) { strike(ip); }
        throw spending ? new Bad(403, 'Join your DM’s table first. Pictures and story help are for people at a table.') : new Bad(404, 'No table with that code. Check it with your DM.');
      }
      const r = await table(code).fetch(request);       // the body is passed along untouched
      if (joining && r.status === 404) { strike(ip); }
      return r;
    } catch (e) { return fail(e); }
  }
};

export class Table extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.t = undefined; }
  async load() { if (this.t === undefined) { this.t = (await this.ctx.storage.get('t')) || null; } return this.t; }
  save() { return this.ctx.storage.put('t', this.t); }
  stayOpen() { return this.ctx.storage.setAlarm(Date.now() + IDLE); }
  async alarm() { await this.ctx.storage.deleteAll(); this.t = null; }       // twelve quiet hours: the table is cleared away

  async fetch(request) {
    const url = new URL(request.url);
    try {
      const t = await this.load();
      if (url.pathname === '/api/table/open') {
        if (t) { return reply({ error: 'That code is in use.' }, 409); }
        this.t = { code: String(url.searchParams.get('c')).toUpperCase(), dm: rnd(16), created: Date.now(), players: [], feed: [], seq: 0, stored: 0, spend: { images: 0, texts: 0 } };
        await this.save(); await this.stayOpen();
        return reply({ code: this.t.code, token: this.t.dm });
      }
      if (!t) { throw new Bad(404, 'No table with that code. Check it with your DM.'); }
      if (url.pathname === '/api/table/img') {
        const im = await this.ctx.storage.get('img:' + String(url.searchParams.get('id') || '').slice(0, 32));
        return im ? new Response(im.buf, { headers: { 'Content-Type': im.type, 'Cache-Control': 'private, max-age=86400' } }) : new Response('Not found', { status: 404 });
      }
      const body = await readJson(request, 4500000);
      const act = /^\/api\/table\/(join|me|state|keep|send)$/.exec(url.pathname);
      if (act) { return reply(await this[act[1]](body)); }
      if (url.pathname === '/api/image') { return reply(await this.image(body)); }
      if (url.pathname === '/api/text') { return reply(await this.text(body)); }
      throw new Bad(404, 'Unknown route');
    } catch (e) { return fail(e); }
  }

  who(token) {
    if (token && token === this.t.dm) { return { dm: true }; }
    const p = this.t.players.find((x) => x.token === token);
    if (!token || !p) { throw new Bad(403, 'You are not at this table any more. Join again with the table code.'); }
    return p;
  }
  dmOnly(body, msg) { if (!this.who(body.token).dm) { throw new Bad(403, msg); } }
  async storeBytes(buf, type) {
    if (buf.length > 3000000) { throw new Bad(413, 'That picture is too large.'); }
    if (this.t.stored >= LIMIT.stored) { throw new Bad(429, 'This table has stored as many pictures as it can hold.'); }
    const id = rnd(8);
    await this.ctx.storage.put('img:' + id, { type, buf: new Uint8Array(buf.buffer, buf.byteOffset, buf.length) });
    this.t.stored++;
    return 'api/table/img?code=' + this.t.code + '&id=' + id;
  }
  storeImage(dataUrl) {
    const s = String(dataUrl || ''), m = /^data:image\/(webp|png|jpeg);base64,/.exec(s.slice(0, 40));
    if (!m) { throw new Bad(400, 'That is not a picture.'); }
    return this.storeBytes(Buffer.from(s.slice(m[0].length), 'base64'), 'image/' + m[1]);
  }
  async forget(url) {                       // drop a stored picture nobody points at any more
    const m = /^api\/table\/img\?code=[A-Z]{4}&id=([0-9a-f]{16})$/.exec(url || '');
    if (m) { await this.ctx.storage.delete('img:' + m[1]); this.t.stored = Math.max(0, this.t.stored - 1); }
  }

  /* ---- the table ---- */
  async join(body) {
    const t = this.t, name = clean(body.name, 24);
    if (!name) { throw new Bad(400, 'Tell the table your name first.'); }
    if (t.players.length >= LIMIT.players) { throw new Bad(409, 'This table is full.'); }
    const p = { id: rnd(4), token: rnd(16), name, char: null, portrait: '', portraits: 0 };
    t.players.push(p);
    await this.save(); await this.stayOpen();
    return { code: t.code, id: p.id, token: p.token };
  }
  async me(body) {
    const w = this.who(body.token);
    if (w.dm) { throw new Bad(400, 'The DM has no character.'); }
    if (body.char) { const c = body.char; w.char = { name: clean(c.name, 40), race: clean(c.race, 30), cls: clean(c.cls, 30), line: clean(c.line, 80), look: clean(c.look, 400) }; }
    if (body.name) { w.name = clean(body.name, 24); }
    if (body.portrait === '' || body.portrait) {
      const old = w.portrait;
      w.portrait = body.portrait === '' ? '' : (/^img\//.test(body.portrait) ? clean(body.portrait, 80) : await this.storeImage(body.portrait));
      await this.forget(old);
    }
    await this.save();
    return { ok: true, portrait: w.portrait };
  }
  state(body) {
    const t = this.t, w = this.who(body.token), after = Number(body.after) || 0;
    return { code: t.code, you: w.dm ? 'dm' : w.id, players: t.players.map((p) => ({ id: p.id, name: p.name, char: p.char, portrait: p.portrait })), feed: t.feed.filter((f) => f.n > after), last: t.seq };
  }
  async keep(body) {              // the DM stores a picture without showing it yet
    this.dmOnly(body, 'Only the DM can do that.');
    const url = await this.storeImage(body.image);
    await this.save();
    return { url };
  }
  async send(body) {              // the DM shows every player a note or a picture
    const t = this.t;
    this.dmOnly(body, 'Only the DM can send to the table.');
    const title = clean(body.title, 80), text = clean(body.text, 1200);
    if (!body.image && !text && !title) { throw new Bad(400, 'There is nothing to send.'); }
    const img = body.image ? (/^(img\/|api\/table\/img\?)/.test(body.image) ? clean(body.image, 120) : await this.storeImage(body.image)) : '';
    const item = { n: ++t.seq, at: Date.now(), kind: img ? 'image' : 'note', title, text, img };
    t.feed.push(item); if (t.feed.length > LIMIT.feed) { t.feed.shift(); }
    await this.save(); await this.stayOpen();
    return { ok: true, n: item.n, players: t.players.length };
  }

  /* ---- OpenAI, on behalf of people at this table ---- */
  async spend(body, kind) {
    const t = this.t, w = this.who(body.token);
    if (!this.env.OPENAI_API_KEY) { throw new Bad(503, 'No OPENAI_API_KEY is set for this site.'); }
    if (kind === 'images') {
      if (!w.dm) { if (w.portraits >= LIMIT.portraits) { throw new Bad(429, 'You have painted as many portraits as this table allows.'); } w.portraits++; }
      if (t.spend.images >= LIMIT.images) { throw new Bad(429, 'This table has reached its picture limit.'); }
    } else if (t.spend.texts >= LIMIT.texts) { throw new Bad(429, 'This table has reached its story-help limit.'); }
    t.spend[kind]++;
    await this.save();
  }
  openai(route, body) {
    return fetch((this.env.OPENAI_BASE_URL || 'https://api.openai.com') + route, {
      method: 'POST', headers: { Authorization: 'Bearer ' + this.env.OPENAI_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  }
  async image(body) {
    const prompt = clean(body.prompt, 6000), size = SIZES.includes(body.size) ? body.size : SIZES[0], model = this.env.IMAGE_MODEL || 'gpt-image-2';
    if (!prompt) { throw new Bad(400, 'Describe the character first.'); }
    await this.spend(body, 'images');
    const t0 = Date.now();
    const r = await this.openai('/v1/images/generations', { model, prompt, size, quality: this.env.IMAGE_QUALITY || 'medium', output_format: 'webp', output_compression: 82, n: 1 });
    const txt = await r.text();
    if (!r.ok) { let msg = 'OpenAI returned ' + r.status; try { msg = JSON.parse(txt).error.message || msg; } catch (e) { /* keep the plain message */ } throw new Bad(r.status, msg); }
    // lift the picture straight out of the reply: it is one long base64 string, and reading it this way keeps the work small
    const k = txt.indexOf('"b64_json"'), s = k < 0 ? 0 : txt.indexOf('"', txt.indexOf(':', k) + 1) + 1, e = s > 0 ? txt.indexOf('"', s) : -1;
    if (e < 0) { throw new Bad(502, 'OpenAI sent no picture.'); }
    const seconds = Math.round((Date.now() - t0) / 1000);
    if (!body.keep) { return { image: 'data:image/webp;base64,' + txt.slice(s, e), model, seconds }; }
    const url = await this.storeBytes(Buffer.from(txt.slice(s, e), 'base64'), 'image/webp');     // the picture stays on the table; the phone gets its address
    await this.save();
    return { url, model, seconds };
  }
  async text(body) {
    const system = clean(body.system, 30000), user = clean(body.user, 12000), model = this.env.TEXT_MODEL || 'gpt-4.1-mini';
    if (!system || !user) { throw new Bad(400, 'Nothing to ask.'); }
    await this.spend(body, 'texts');
    const req = { model, temperature: 0.9, max_tokens: Math.min(800, Number(body.max) || 200), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (body.json) { req.response_format = { type: 'json_object' }; }
    const r = await this.openai('/v1/chat/completions', req), j = await r.json().catch(() => ({}));
    if (!r.ok) { throw new Bad(r.status, (j.error && j.error.message) || ('OpenAI returned ' + r.status)); }
    const out = (j.choices && j.choices[0] && j.choices[0].message.content) || '';
    if (!body.json) { return { text: clean(out, 1500), model }; }
    try { return { json: JSON.parse(out), model }; } catch (e) { throw new Bad(502, 'The story helper gave an unreadable answer.'); }
  }
}
