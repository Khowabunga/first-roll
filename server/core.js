/* First Roll: the rules of the table, all in one place.

   Everything the server decides lives here: who may sit at a table, what the DM has shown,
   the dice everyone can see, and the OpenAI calls made for people at a table. Nothing in this
   file knows about Cloudflare, so the same code runs on the site and in the tests.

   - createApi() is the front door. It reads a request, slows down anyone who is guessing,
     and hands the call to the right table: table(code).ask(route, body).
   - TableCore is one table. It keeps one blob `t` (players, handouts, dice), a picture under
     each `img:<id>` and a player's whole character under each `save:<id>`, in the store it is
     given: get(key), put(key, value), delete(key), deleteAll(), setAlarm(time), deleteAlarm().
     A Durable Object's ctx.storage is exactly that; the tests use a Map.

   worker.js is the thin Cloudflare wrapper around this file. test/unit/server.test.js runs it in Node. */
import { Buffer } from 'node:buffer';

export const LIMIT = { players: 8, portraits: 6, images: 150, texts: 800, feed: 300, stored: 220, rolls: 40, bytes: 1900000 };
const IDLE = 30 * 24 * 3600 * 1000;        // a campaign keeps its table, and its code, between sessions
const ENDED = 3600 * 1000;                 // how long a closed table's code keeps saying "this table has ended"
const HERE = 90 * 1000;                    // a seat heard from this recently is being played right now
const SIZES = ['1024x1536', '1536x1024', '1024x1024'];
const KINDS = ['check', 'save', 'attack', 'damage', 'init', 'free', 'extra'];
const ROUTES = ['join', 'me', 'state', 'keep', 'send', 'roll', 'kick', 'close', 'image', 'text', 'dm'];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE = /^[A-Z]{4}$/, SCENARIO = /^[a-z0-9-]{1,40}$/;
const NO_TABLE = 'No table with that code. Check it with your DM.';
const NO_PICTURE = 'The picture could not be painted just now. Try again.', NO_STORY = 'The story helper is busy. Try again.';

/* An answer that is the caller's doing: a status, a plain sentence a player can read, and
   sometimes a short reason the app can act on. Anything else that goes wrong is ours: it is
   logged, and the caller only hears that something went wrong. */
export class Bad extends Error { constructor(status, message, reason, more) { super(message); this.status = status; this.reason = reason; this.more = more; } }
/* One answer, the same byte for byte, for a code nobody has and for a token nobody holds, so
   guessing teaches nothing. `strike` tells the front door to count it against the caller. */
/* A picture that ships with the site: the engine's own art, or a scenario pack's. Anything else is treated as an upload. */
const SHIPPED = /^(?!.*\.\.)(img\/|packs\/[a-z0-9-]{1,40}\/img\/)[\w.\/-]{1,100}(\?v=[0-9a-f]{1,16})?$/;
const lost = () => Object.assign(new Bad(404, NO_TABLE), { strike: true });
const ended = () => new Bad(410, 'This table has ended.', 'closed');
const slowDown = () => new Bad(429, 'Too many tries. Wait a minute, then try again.', 'blocked');
const tooMuch = () => new Bad(413, 'That is too much to send at once.', 'too_large');
function failed(e) {
  if (e instanceof Bad) { const data = { error: e.message }; if (e.reason) { data.reason = e.reason; } return { status: e.status, data: Object.assign(data, e.more), strike: !!e.strike }; }
  console.error('First Roll: unexpected error:', e);
  return { status: 500, data: { error: 'Something went wrong. Try again.' }, strike: false };
}
const reply = (data, status = 200, more) => new Response(JSON.stringify(data), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, more) });
// keep line breaks, drop other control characters, cap the length; anything that is not text counts as empty
const clean = (s, max) => (typeof s === 'string' || typeof s === 'number' ? String(s) : '').replace(/[\u0000-\u0009\u000b-\u001f]+/g, ' ').trim().slice(0, max);
const rnd = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => LETTERS[b % LETTERS.length]).join('');
const pub = (p) => ({ id: p.id, name: p.name, char: p.char, portrait: p.portrait });
/* Read what was sent, a piece at a time, and stop as soon as it is more than we take: nobody
   gets to fill the Worker's memory by sending something enormous. */
async function readJson(request, limit) {
  if (Number(request.headers.get('content-length') || 0) > limit) { throw tooMuch(); }
  let text = '', size = 0;
  if (request.body) {
    const reader = request.body.getReader(), utf8 = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) { break; }
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw tooMuch(); }
      text += utf8.decode(value, { stream: true });
    }
    text += utf8.decode();
  }
  let body = null;
  try { body = text ? JSON.parse(text) : {}; } catch (e) { /* not JSON at all: answered just below */ }
  if (!body || typeof body !== 'object' || Array.isArray(body)) { throw new Bad(400, 'That did not come through properly. Try again.', 'bad_request'); }
  return body;
}
/* Compare the passcode without giving away, by how long it takes, how much of a guess was right:
   both sides are hashed first, and every byte of the two hashes is looked at. */
async function same(guess, secret) {
  if (typeof guess !== 'string') { return false; }
  const enc = new TextEncoder(), [a, b] = (await Promise.all([guess, secret].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))))).map((h) => new Uint8Array(h));
  let diff = 0;
  for (let i = 0; i < a.length; i++) { diff |= a[i] ^ b[i]; }
  return diff === 0;
}

/* ---------------- the front door ----------------
   handle(request, x) answers every /api call. x is { env, ip, table(code), limit(ip)? }:
   table(code) gives the table for a code, and limit, when the site has one, is a second
   counter shared between copies of the Worker (true means "carry on"). */
export function createApi({ now = Date.now } = {}) {
  /* Slow down anyone guessing table codes, tokens or the passcode: twenty wrong tries a minute
     from one address, then every call from it waits. Kept per running copy of the Worker, so
     it is a speed bump, not a wall. Someone with a seat at the table never adds to it. */
  const misses = new Map();
  const strike = (ip) => { const n = now(), m = misses.get(ip); if (!m || n - m.t > 60000) { misses.set(ip, { t: n, n: 1 }); } else { m.n++; } if (misses.size > 5000) { for (const [k, v] of misses) { if (n - v.t > 60000 || misses.size > 4000) { misses.delete(k); } if (misses.size <= 4000) { break; } } } };
  const blocked = (ip) => { const m = misses.get(ip); return !!m && now() - m.t <= 60000 && m.n >= 20; };
  const allowed = async (x, ip) => { if (!x.limit) { return true; } try { return (await x.limit(ip)) !== false; } catch (e) { return true; } };   // a broken counter must not close the site

  async function open(request, x) {
    if (!x.env.DM_PASSCODE) { throw new Bad(503, 'Tables are switched off on this site. Its owner has not set a DM passcode yet.', 'off'); }
    const body = await readJson(request, 2000);
    if (!(await same(body.passcode, x.env.DM_PASSCODE))) { throw new Bad(403, 'That is not the DM passcode.', 'passcode'); }
    if (body.code) {                           // the DM coming back to a table that is already open: it keeps the adventure it was opened with
      const back = String(body.code).toUpperCase();
      if (!CODE.test(back)) { throw new Bad(404, 'No table with that code. A table code is four letters.'); }
      return x.table(back).ask('dm', {});
    }
    const scenario = body.scenario === undefined || body.scenario === null || body.scenario === '' ? 'northpole' : body.scenario;
    if (typeof scenario !== 'string' || !SCENARIO.test(scenario)) { throw new Bad(400, 'That adventure could not be found. Pick it again.', 'bad_scenario'); }
    for (let i = 0; i < 6; i++) {             // pick a code nobody is using (409), and that has not just ended (410)
      const code = newCode(), r = await x.table(code).ask('create', { code, scenario });
      if (r.status !== 409 && r.status !== 410) { return r; }
    }
    throw new Bad(503, 'Could not open a table just now. Try again.');
  }
  async function seated(route, url, request, x, spending) {
    const sent = url.searchParams.get('c'), code = String(sent || '').toUpperCase();
    if (spending && !sent) { throw new Bad(403, 'Join your DM’s table first. Pictures and story help are for people at a table.', 'no_table'); }
    if (!CODE.test(code)) { throw lost(); }
    return x.table(code).ask(route, await readJson(request, 4500000));
  }
  async function handle(request, x) {
    try {
      const url = new URL(request.url), ip = x.ip || 'unknown';
      if (url.pathname === '/api/health') { return reply({ ok: true, live: !!(x.env.OPENAI_API_KEY && x.env.DM_PASSCODE), tables: !!x.env.DM_PASSCODE, passcode: true, open: false }); }
      const m = /^\/api\/(?:table\/(open|join|me|state|keep|send|roll|kick|close|img)|(image|text))$/.exec(url.pathname), route = m && (m[1] || m[2]);
      if (!route) { throw new Bad(404, 'There is nothing at that address.', 'unknown_route'); }
      if (blocked(ip)) { throw slowDown(); }
      if (route === 'img') {
        const code = String(url.searchParams.get('code') || '').toUpperCase();
        const r = CODE.test(code) ? await x.table(code).ask('img', { id: url.searchParams.get('id') }) : { status: 404 };
        if (r.bytes) { return new Response(r.bytes, { headers: { 'Content-Type': r.type, 'Cache-Control': 'private, max-age=86400' } }); }
        return r.data ? reply(r.data, r.status) : new Response('Not found', { status: 404 });
      }
      if (request.method !== 'POST') { throw new Bad(405, 'This address is used by the app itself. There is nothing to open here.', 'post_only'); }
      const guess = route === 'open' || route === 'join';       // the two calls anyone may make without a seat
      if (guess && !(await allowed(x, ip))) { throw slowDown(); }
      let r;
      try { r = await (route === 'open' ? open(request, x) : seated(route, url, request, x, !!m[2])); } catch (e) { r = failed(e); }
      /* A wrong code or token, or any refused try at opening or joining, counts against the address.
         A table that has ended (410) and our own troubles (5xx) do not. Nor does a name already in use,
         a full table or a missing name: those come from people who are at the right table, not from guessing. */
      const honest = r.data && (r.data.reason === 'name_in_use' || r.data.reason === 'full' || r.data.reason === 'no_name');
      if (r.strike || (guess && !honest && r.status >= 400 && r.status < 500 && r.status !== 410 && r.status !== 429)) {
        strike(ip);
        if (!guess && !(await allowed(x, ip))) { throw slowDown(); }
      }
      return reply(r.data, r.status);
    } catch (e) { const r = failed(e); return reply(r.data, r.status, r.status === 429 ? { 'Retry-After': '60' } : undefined); }
  }
  return { handle };
}

/* ---------------- one table ---------------- */
export class TableCore {
  constructor({ store, env, fetch: send, now }) {
    this.store = store; this.env = env || {}; this.now = now || Date.now;
    this.fetch = send || ((...a) => fetch(...a));
    this.t = undefined;            // the table, once read from the store; null when there is none
    this.closed = 0;               // when the DM ended this table, while its code still says so
    this.wasHere = [];             // the tokens that were at the table when it ended: only they are told
    this.seen = new Map();         // seat id -> when that player was last heard from. Memory only: writing it on every poll would cost far more than it is worth
  }
  async load() {
    if (this.t === undefined) {
      const mark = (await this.store.get('closed')) || 0;                  // { at, tokens }, or just the time in older data
      this.closed = (mark && mark.at) || (typeof mark === 'number' ? mark : 0); this.wasHere = (mark && mark.tokens) || [];
      const t = (!this.closed && (await this.store.get('t'))) || null;
      if (t) { t.scenario = t.scenario || 'northpole'; t.rolls = t.rolls || []; t.rollSeq = t.rollSeq || 0; t.gone = t.gone || []; }     // tables opened before these existed
      this.t = t;
    }
    if (this.closed && this.now() - this.closed >= ENDED) { await this.store.deleteAll(); this.closed = 0; this.wasHere = []; }     // in case the alarm runs late
    return this.t;
  }
  save() { return this.store.put('t', this.t); }
  stayOpen() { return this.store.setAlarm(this.now() + IDLE); }
  /* The alarm rings after thirty quiet days, or an hour after the DM closed the table. Either way
     everything is cleared away and the code is free again. */
  async alarm() { await this.store.deleteAll(); this.t = null; this.closed = 0; this.wasHere = []; this.seen.clear(); }

  /* Every call for this table comes through here and leaves as { status, data } (or the bytes of
     a picture). `create` and `dm` are only ever asked by the front door, after the passcode. */
  async ask(route, body) {
    try {
      const t = await this.load();
      body = body && typeof body === 'object' ? body : {};
      if (this.closed) {
        /* An ended table says so only to the phones that sat at it, and to a DM coming back with the passcode.
           To anyone else the code is as unknown as one never used, so ended tables cannot be picked out. */
        if (route === 'img') { return { status: 404 }; }
        if (route === 'create' || route === 'dm' || (typeof body.token === 'string' && this.wasHere.includes(body.token))) { throw ended(); }
        throw lost();
      }
      if (route === 'create') { return { status: 200, data: await this.create(body) }; }
      if (route === 'img') {
        const im = t && await this.store.get('img:' + String(body.id || '').slice(0, 32));
        return im ? { status: 200, bytes: im.buf, type: im.type } : { status: 404 };
      }
      if (!t) { throw route === 'dm' ? new Bad(404, 'No table with that code. It may have been cleared away; start a new one.') : lost(); }
      if (!ROUTES.includes(route)) { throw new Bad(404, 'There is nothing at that address.', 'unknown_route'); }
      return { status: 200, data: await this[route](body) };
    } catch (e) { return failed(e); }
  }

  who(token) {
    const t = this.t;
    if (typeof token !== 'string' || !token) { throw lost(); }
    if (token === t.dm) { return { dm: true }; }
    const p = t.players.find((x) => x.token === token);
    if (p) { return p; }
    /* A token that used to work gets a straight answer, so the phone that holds it can say what happened. */
    const was = t.players.find((x) => (x.old || []).includes(token));
    if (was) { throw new Bad(409, 'Someone else is now playing as ' + was.name + '.', 'moved', { name: was.name }); }
    if (t.gone.includes(token)) { throw new Bad(409, 'The DM removed you from this table.', 'removed'); }
    throw lost();
  }
  dmOnly(body, msg) { if (!this.who(body.token).dm) { throw new Bad(403, msg, 'dm_only'); } }
  here(w) { if (!w.dm) { this.seen.set(w.id, this.now()); } }
  async storeBytes(buf, type) {
    if (!buf.length) { throw new Bad(400, 'That is not a picture.', 'bad_picture'); }
    if (buf.length > LIMIT.bytes) { throw new Bad(413, 'That picture is too large. Try a smaller one.', 'too_large'); }     // the store takes at most 2 MB in one piece
    if (this.t.stored >= LIMIT.stored) { throw new Bad(429, 'This table has stored as many pictures as it can hold.', 'limit'); }
    const id = rnd(8);
    await this.store.put('img:' + id, { type, buf: new Uint8Array(buf.buffer, buf.byteOffset, buf.length) });
    this.t.stored++;
    return 'api/table/img?code=' + this.t.code + '&id=' + id;
  }
  storeImage(dataUrl) {
    const s = typeof dataUrl === 'string' ? dataUrl : '', m = /^data:image\/(webp|png|jpeg);base64,/.exec(s.slice(0, 40));
    if (!m) { throw new Bad(400, 'That is not a picture.', 'bad_picture'); }
    return this.storeBytes(Buffer.from(s.slice(m[0].length), 'base64'), 'image/' + m[1]);
  }
  async forget(url) {                       // drop a stored picture nobody points at any more
    const m = /^api\/table\/img\?code=([A-Z]{4})&id=([0-9a-f]{16})$/.exec(url || '');
    if (!m || m[1] !== this.t.code || this.t.feed.some((f) => f.img === url)) { return; }       // one the DM has shown the table stays
    await this.store.delete('img:' + m[2]); this.t.stored = Math.max(0, this.t.stored - 1);
  }

  /* ---- the table ---- */
  async create(body) {
    if (this.t) { throw new Bad(409, 'That code is in use.'); }
    this.t = { code: String(body.code), dm: rnd(16), created: this.now(), scenario: body.scenario, players: [], feed: [], seq: 0, rolls: [], rollSeq: 0, gone: [], stored: 0, spend: { images: 0, texts: 0 } };
    await this.save(); await this.stayOpen();
    return { code: this.t.code, token: this.t.dm, scenario: this.t.scenario };
  }
  async dm() { const t = this.t; await this.stayOpen(); return { code: t.code, token: t.dm, players: t.players.length, scenario: t.scenario }; }
  async join(body) {
    const t = this.t, name = typeof body.name === 'string' ? clean(body.name, 24) : '';
    if (!name) { throw new Bad(400, 'Tell the table your name first.', 'no_name'); }
    /* Someone who joins under a name already at the table takes that seat back: a new session, or
       another phone. They get the character they left here; the device they used before lets go.
       If that seat is being played right now, ask first: it may be two friends with one name. */
    const seat = t.players.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (seat) {
      if (body.confirm !== true && this.seen.has(seat.id) && this.now() - this.seen.get(seat.id) < HERE) { throw new Bad(409, seat.name + ' is already at this table. Is that you on another phone?', 'name_in_use', { name: seat.name }); }
      seat.old = (seat.old || []).concat(seat.token).slice(-3);       // so the device left behind can be told why it stopped working
      seat.token = rnd(16);
      await this.save(); await this.stayOpen();
      return { code: t.code, id: seat.id, token: seat.token, name: seat.name, back: true, save: (await this.store.get('save:' + seat.id)) || '', portrait: seat.portrait, scenario: t.scenario };
    }
    if (t.players.length >= LIMIT.players) { throw new Bad(409, 'This table is full.', 'full'); }
    const p = { id: rnd(4), token: rnd(16), name, char: null, portrait: '', portraits: 0, old: [] };
    t.players.push(p);
    await this.save(); await this.stayOpen();
    return { code: t.code, id: p.id, token: p.token, name: p.name, scenario: t.scenario };
  }
  async me(body) {
    const t = this.t, w = this.who(body.token);
    if (w.dm) { throw new Bad(400, 'The DM has no character.', 'dm_has_none'); }
    this.here(w);
    /* check everything first, so a refused call changes nothing */
    let name = w.name, portrait = w.portrait;
    if (body.name !== undefined && body.name !== null && typeof body.name !== 'string') { throw new Bad(400, 'That name could not be read. Type it again.', 'bad_name'); }
    if (body.name) {
      name = clean(body.name, 24);
      if (!name) { throw new Bad(400, 'Tell the table your name first.', 'no_name'); }
      const other = t.players.find((x) => x !== w && x.name.toLowerCase() === name.toLowerCase());
      if (other) { throw new Bad(409, other.name + ' is already at this table. Pick another name.', 'name_in_use', { name: other.name }); }
    }
    const pic = body.portrait;
    if (pic !== undefined && pic !== null && typeof pic !== 'string') { throw new Bad(400, 'That is not a picture.', 'bad_picture'); }
    if (pic && pic !== w.portrait) { portrait = SHIPPED.test(pic) ? pic : await this.storeImage(pic); }
    else if (!pic && body.clearPortrait === true) { portrait = ''; }       // an empty portrait alone changes nothing: a phone that has lost its picture must not wipe the table's copy
    if (body.char && typeof body.char === 'object') { const c = body.char; w.char = { name: clean(c.name, 40), race: clean(c.race, 30), cls: clean(c.cls, 30), line: clean(c.line, 80), look: clean(c.look, 400) }; }
    w.name = name;
    if (typeof body.save === 'string' && body.save.length <= 20000) { await this.store.put('save:' + w.id, body.save); }   // the whole character, for taking the seat back later
    if (portrait !== w.portrait) { const old = w.portrait; w.portrait = portrait; await this.forget(old); }
    await this.save(); await this.stayOpen();
    return { ok: true, portrait: w.portrait, name: w.name };
  }
  state(body) {
    const t = this.t, w = this.who(body.token), after = Number(body.after) || 0, afterRoll = Number(body.afterRoll) || 0;
    this.here(w);
    return { code: t.code, you: w.dm ? 'dm' : w.id, players: t.players.map(pub), feed: t.feed.filter((f) => f.n > after), last: t.seq,
      scenario: t.scenario, rolls: t.rolls.filter((r) => r.n > afterRoll).slice(-LIMIT.rolls), lastRoll: t.rollSeq };
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
    if (!body.image && !text && !title) { throw new Bad(400, 'There is nothing to send.', 'empty'); }
    let img = '';
    if (body.image) {
      const own = typeof body.image === 'string' && /^api\/table\/img\?code=([A-Z]{4})&id=([0-9a-f]{16})$/.exec(body.image);
      if (own) {                               // a picture already kept: it has to be this table's, and still here
        if (own[1] !== t.code || !(await this.store.get('img:' + own[2]))) { throw new Bad(409, 'That picture is no longer on this table. Paint or add it again.', 'no_picture'); }
        img = body.image;
      } else { img = typeof body.image === 'string' && SHIPPED.test(body.image) ? body.image : await this.storeImage(body.image); }
    }
    const item = { n: ++t.seq, at: this.now(), kind: img ? 'image' : 'note', title, text, img };
    t.feed.push(item); if (t.feed.length > LIMIT.feed) { t.feed.shift(); }
    await this.save(); await this.stayOpen();
    return { ok: true, n: item.n, players: t.players.length };
  }
  /* A roll everyone at the table can see. The phone that rolled says what came up; the table
     only tidies it (short text, whole numbers, a known kind) and keeps the last forty. */
  async roll(body) {
    const t = this.t, w = this.who(body.token), now = this.now(), id = w.dm ? 'dm' : w.id, whole = Number.isInteger;
    this.here(w);
    if (!whole(body.total) || body.total < -99 || body.total > 999) { throw new Bad(400, 'That roll did not come through. Roll again.', 'bad_roll'); }
    if (t.rolls.some((r) => r.id === id && now - r.at < 1000)) { throw new Bad(429, 'The dice are still rolling. Give them a second.', 'slow'); }
    const dice = (Array.isArray(body.dice) ? body.dice : []).filter((d) => d && whole(d.sides) && whole(d.value) && d.sides >= 2 && d.sides <= 1000 && d.value >= 0 && d.value <= d.sides).slice(0, 8).map((d) => ({ sides: d.sides, value: d.value }));
    const item = { n: ++t.rollSeq, id, name: w.dm ? 'DM' : w.name, role: w.dm ? 'dm' : 'player', label: clean(body.label, 60), kind: KINDS.includes(body.kind) ? body.kind : 'free',
      total: body.total, nat: (body.nat === 20 || body.nat === 1) && dice.some((d) => d.sides === 20 && d.value === body.nat) ? body.nat : 0, detail: clean(body.detail, 80), dice, at: now };
    t.rolls.push(item); if (t.rolls.length > LIMIT.rolls) { t.rolls.shift(); }
    await this.save(); await this.stayOpen();
    return { n: item.n };
  }
  /* The DM takes a seat away: the player, their saved character and their portrait all go, and the
     name is free again. Their phone is told why (see who), for as long as we remember its token. */
  async kick(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can remove a player.');
    const i = t.players.findIndex((x) => x.id === body.id), p = t.players[i];
    if (p) {
      t.players.splice(i, 1);
      t.gone = t.gone.concat(p.old || [], p.token).slice(-20);
      this.seen.delete(p.id);
      await this.store.delete('save:' + p.id); await this.forget(p.portrait);
      await this.save(); await this.stayOpen();
    }
    return { players: t.players.map(pub), count: t.players.length, removed: !!p };
  }
  /* The DM ends the table for good. Everything is deleted at once; for an hour the code still
     answers "this table has ended", so phones left open hear it plainly, and then it is free. */
  async close(body) {
    this.dmOnly(body, 'Only the DM can end the table.');
    const t = this.t, tokens = [t.dm].concat(t.gone || []);
    t.players.forEach((p) => { tokens.push(p.token); (p.old || []).forEach((o) => tokens.push(o)); });
    await this.store.deleteAll(); await this.store.deleteAlarm();
    this.t = null; this.seen.clear(); this.closed = this.now(); this.wasHere = tokens;
    await this.store.put('closed', { at: this.closed, tokens }); await this.store.setAlarm(this.closed + ENDED);
    return { ok: true };
  }

  /* ---- OpenAI, on behalf of people at this table ---- */
  async spend(w, kind) {
    const t = this.t;
    if (!this.env.OPENAI_API_KEY) { throw new Bad(503, 'Pictures and story help are switched off on this site.', 'off'); }
    if (kind === 'images') {
      if (!w.dm && w.portraits >= LIMIT.portraits) { throw new Bad(429, 'You have painted as many portraits as this table allows.', 'limit'); }
      if (t.spend.images >= LIMIT.images) { throw new Bad(429, 'This table has reached its picture limit.', 'limit'); }
      if (!w.dm) { w.portraits++; }
    } else if (t.spend.texts >= LIMIT.texts) { throw new Bad(429, 'This table has reached its story-help limit.', 'limit'); }
    t.spend[kind]++;
    await this.save();
  }
  /* Take one picture or one piece of story help from the table's allowance, then do the work.
     If nothing comes of it the allowance is handed back: people only use up what they were given. */
  async paid(w, kind, work) {
    const t = this.t;
    await this.spend(w, kind);
    try { return await work(); }
    catch (e) {
      if (this.t === t) { t.spend[kind] = Math.max(0, t.spend[kind] - 1); if (kind === 'images' && !w.dm) { w.portraits = Math.max(0, w.portraits - 1); } await this.save(); }
      throw e;
    }
  }
  /* One call to OpenAI. What OpenAI says when it fails is for the log; the player gets `sorry`. */
  async openai(route, body, sorry) {
    const t = this.t; let r, txt;
    try {
      r = await this.fetch((this.env.OPENAI_BASE_URL || 'https://api.openai.com') + route, { method: 'POST', headers: { Authorization: 'Bearer ' + this.env.OPENAI_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      txt = await r.text();
    } catch (e) { console.error('First Roll: OpenAI could not be reached:', (e && e.message) || e); throw new Bad(502, sorry, 'upstream'); }
    if (!r.ok) {
      let msg = txt; try { msg = JSON.parse(txt).error.message || txt; } catch (e) { /* not JSON: log it as it came */ }
      console.error('First Roll: OpenAI returned ' + r.status + ':', clean(msg, 400));
      throw new Bad(502, sorry, 'upstream');
    }
    if (this.t !== t) { throw ended(); }       // the table was closed while we waited
    return txt;
  }
  async image(body) {
    const t = this.t, w = this.who(body.token);
    const prompt = clean(body.prompt, 6000), size = SIZES.includes(body.size) ? body.size : SIZES[0], model = this.env.IMAGE_MODEL || 'gpt-image-2';
    if (!prompt) { throw new Bad(400, 'Describe the character first.', 'empty'); }
    if (body.keep && t.stored >= LIMIT.stored) { throw new Bad(429, 'This table has stored as many pictures as it can hold.', 'limit'); }     // say so before a picture is paid for
    return this.paid(w, 'images', async () => {
      const t0 = this.now();
      const txt = await this.openai('/v1/images/generations', { model, prompt, size, quality: this.env.IMAGE_QUALITY || 'medium', output_format: 'webp', output_compression: 82, n: 1 }, NO_PICTURE);
      // lift the picture straight out of the reply: it is one long base64 string, and reading it this way keeps the work small
      const k = txt.indexOf('"b64_json"'), s = k < 0 ? 0 : txt.indexOf('"', txt.indexOf(':', k) + 1) + 1, e = s > 0 ? txt.indexOf('"', s) : -1;
      if (e <= s) { console.error('First Roll: OpenAI answered without a picture.'); throw new Bad(502, NO_PICTURE, 'upstream'); }
      const seconds = Math.round((this.now() - t0) / 1000);
      if (!body.keep) { return { image: 'data:image/webp;base64,' + txt.slice(s, e), model, seconds }; }
      const url = await this.storeBytes(Buffer.from(txt.slice(s, e), 'base64'), 'image/webp');     // the picture stays on the table; the phone gets its address
      await this.save();
      return { url, model, seconds };
    });
  }
  async text(body) {
    const w = this.who(body.token), system = clean(body.system, 30000), user = clean(body.user, 12000), model = this.env.TEXT_MODEL || 'gpt-4.1-mini';
    if (!system || !user) { throw new Bad(400, 'There is nothing to ask yet.', 'empty'); }
    return this.paid(w, 'texts', async () => {
      const req = { model, temperature: 0.9, max_tokens: Math.min(800, Number(body.max) || 200), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
      if (body.json) { req.response_format = { type: 'json_object' }; }
      const txt = await this.openai('/v1/chat/completions', req, NO_STORY);
      let j = {}; try { j = JSON.parse(txt) || {}; } catch (e) { /* treated as an empty answer */ }
      const out = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      if (!body.json) { return { text: clean(out, 1500), model }; }
      try { return { json: JSON.parse(out), model }; } catch (e) { console.error('First Roll: the story helper answered with something that is not JSON.'); throw new Bad(502, NO_STORY, 'upstream'); }
    });
  }
}
