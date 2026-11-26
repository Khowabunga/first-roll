/* First Roll: the rules of the table, all in one place.

   Everything the server decides lives here: who may sit at a table, what the DM has shown,
   the dice everyone can see, and the OpenAI calls made for people at a table. Nothing in this
   file knows about Cloudflare, so the same code runs on the site and in the tests.

   - createApi() is the front door. It reads a request, slows down anyone who is guessing,
     and hands the call to the right table: table(code).ask(route, body).
   - TableCore is one table. It keeps one blob `t` (players, handouts, dice; for the guided
     loop the current scene, what players have proposed and the rolls the DM has asked for; for
     the shared screen the stage, the vote, reactions and each hero's tokens, bond and hook), a
     picture under each `img:<id>`, a player's whole character under each `save:<id>` and the
     DM's place in the story under `session`, in the store it is given: get(key), put(key, value),
     delete(key), deleteAll(), setAlarm(time), deleteAlarm(). A Durable Object's ctx.storage is
     exactly that; the tests use a Map.
   - Who may see what is decided here and nowhere else: a player is never sent the target of a
     roll request or the lines kept for passing and failing, a note meant for another seat, what
     another player has proposed, another hero's hook, or how a vote stands while it is open. A
     big screen watches with a key of its own and is sent only what the whole room may see.
     docs/PHASE1.md and docs/PHASE2.md (section 1 of each) are the list of calls.

   worker.js is the thin Cloudflare wrapper around this file. test/unit/server.test.js runs it in Node. */
import { Buffer } from 'node:buffer';

export const LIMIT = { players: 8, portraits: 6, images: 150, texts: 800, feed: 300, stored: 220, rolls: 40, bytes: 1900000,
  scene: 24 * 1024, pulled: 30, asks: 30, waiting: 3, requests: 20, barred: 20,
  stage: 16 * 1024, regions: 24, order: 16, options: 4, tokens: 5, reacts: 60, session: 60000 };
const IDLE = 30 * 24 * 3600 * 1000;        // a campaign keeps its table, and its code, between sessions
const ENDED = 3600 * 1000;                 // how long a closed table's code keeps saying "this table has ended"
const HERE = 90 * 1000;                    // a seat heard from this recently is being played right now
const BAR = 3600 * 1000;                   // how long a name the DM has barred is kept away from the table
const VOTED = 10 * 60 * 1000;              // how long everyone is still told how a closed vote went
const SIZES = ['1024x1536', '1536x1024', '1024x1024'];
const KINDS = ['check', 'save', 'attack', 'damage', 'init', 'free', 'extra'];
const ROUTES = ['join', 'me', 'state', 'keep', 'send', 'roll', 'kick', 'close', 'image', 'text', 'dm', 'scene', 'unsend', 'propose', 'answer', 'request', 'judge', 'cancel', 'leave',
  'stage', 'screen', 'vote', 'ballot', 'award', 'spend', 'react', 'session', 'reset'];
const VERDICTS = ['yes', 'roll', 'no'];
const MARKS = ['cheer', 'laugh', 'gasp', 'heart', 'clap', 'wow'];
const THING = /^(feed|scene|roll):([1-9]\d{0,8})$/;       // what a reaction is to: something sent, a scene or a roll, by its number
const EVENTS = ['first_roll', 'screen', 'roll_source', 'helper', 'join', 'request_answered'];
const HONEST = ['name_in_use', 'full', 'no_name', 'removed'];      // refusals at the door that are not guesses (see handle)
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE = /^[A-Z]{4}$/, SCENARIO = /^[a-z0-9-]{1,40}$/, WAY = /^[\w.:-]{1,40}$/;
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
const OWN = /^api\/table\/img\?code=([A-Z]{4})&id=([0-9a-f]{16})$/;       // a picture a table has stored
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
/* What the table may know about a seat. Hero tokens and a bond are listed once the seat has any, so a seat
   with neither looks as it always did. A hook is the player's own and the DM's: `w` is who is asking,
   and nobody else is ever sent it. */
const pub = (p, w) => Object.assign({ id: p.id, name: p.name, char: p.char, portrait: p.portrait }, p.tokens ? { tokens: p.tokens } : null, p.bond ? { bond: p.bond } : null, p.hook && w && (w.dm || w.id === p.id) ? { hook: p.hook } : null, p.voice && w && (w.dm || w.id === p.id) ? { voice: p.voice } : null);
/* Is this more than `max` bytes when written out as JSON? (Every letter is at least one byte, so a long one need not be measured.) */
const over = (v, max) => { const json = JSON.stringify(v); return json.length > max || new TextEncoder().encode(json).length > max; };
/* A list as the table keeps it: `tidy` makes each entry neat, or nothing when there is nothing worth keeping. */
const rows = (v, tidy) => (Array.isArray(v) ? v : []).map((x) => tidy(x && typeof x === 'object' ? x : {}, x)).filter(Boolean);
/* What a table keeps for the guided loop: the scene the DM last published, the numbers of feed items taken
   back, what players have proposed, the rolls the DM has asked for, and the names kept out for an hour. */
const guided = () => ({ scene: null, sceneN: 0, pulled: [], asks: [], askSeq: 0, reqs: [], reqSeq: 0, barred: [] });
/* And for the shared screen: what the whole table is being shown (the stage), the key a big screen watches
   with, the vote on the table, reactions, when the DM last saved the story's place here, and the number at
   or below which a fresh start has cleared everything away. */
const bare = () => ({ reveal: null, map: null, sound: null, beat: null, spot: '', order: [], now: '' });
const shared = () => ({ stage: bare(), stageN: 0, beatSeq: 0, screen: '', vote: null, voteSeq: 0, reacts: [], sessionAt: 0, floor: 0 });
const thing = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);                 // an object, or nothing
const within = (v, max, or) => (typeof v === 'number' && isFinite(v) ? Math.round(Math.min(max, Math.max(0, v)) * 100) / 100 : or);      // a number from 0 to max, to two places
const once = (list) => list.filter((x, i) => list.findIndex((y) => y.id === x.id) === i);         // the first entry with each id
const tally = (by) => { const count = {}; for (const mark of Object.values(by)) { count[mark] = (count[mark] || 0) + 1; } return count; };
/* What one seat's roll for a request came to, as that seat may hear it: the line that goes with
   passing or with failing, never both, and neither until the dice or the DM have decided. */
const mine = (q, id) => { const r = Object.hasOwn(q.results, id) ? q.results[id] : null; return r && { total: r.total, nat: r.nat, pass: r.pass, say: r.pass === null ? '' : r.pass ? q.yes : q.no }; };
const settled = (q) => q.closed || q.to.every((id) => Object.hasOwn(q.results, id));       // called off, or everyone asked has rolled
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
/* The same care for a big screen's key, which is checked on every poll: every letter of the key is
   looked at, however early the first wrong one comes. */
const alike = (guess, key) => { let diff = guess.length ^ key.length; for (let i = 0; i < key.length; i++) { diff |= guess.charCodeAt(i) ^ key.charCodeAt(i); } return diff === 0; };

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
  /* Numbers for the site's owner: how long a first roll took, which way people came in. One line in the
     log for each, with no table, no name and no address in it; thirty a minute from one address, the
     rest dropped. Whatever arrives, the answer is an empty 204: counting must never get in a page's way. */
  const told = new Map();
  const tell = (ip) => { const n = now(), m = told.get(ip); if (m && n - m.t <= 60000) { return ++m.n <= 30; } if (told.size >= 5000) { told.clear(); } told.set(ip, { t: n, n: 1 }); return true; };
  async function event(request, ip) {
    try {
      const b = request.method === 'POST' ? await readJson(request, 1000) : {}, whole = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
      if (EVENTS.includes(b.name) && tell(ip)) {
        const line = { ev: b.name };
        if (whole(b.ms, 24 * 3600 * 1000)) { line.ms = b.ms; }
        if (typeof b.way === 'string' && WAY.test(b.way)) { line.way = b.way; }                         // a short code word such as "qr" or "card": never free text
        if (typeof b.cartridge === 'string' && SCENARIO.test(b.cartridge)) { line.cartridge = b.cartridge; }
        if (whole(b.n, 9999)) { line.n = b.n; }
        console.log(JSON.stringify(line));
      }
    } catch (e) { /* a number that did not arrive is not worth a word to anyone */ }
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

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
      if (url.pathname === '/api/event') { return event(request, ip); }
      const m = /^\/api\/(?:table\/(open|join|me|state|keep|send|roll|kick|close|img|scene|unsend|propose|answer|request|judge|cancel|leave|stage|screen|vote|ballot|award|spend|react|session|reset)|(image|text))$/.exec(url.pathname), route = m && (m[1] || m[2]);
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
         a full table, a missing name or a name the DM has barred: those come from people who are at the
         right table, not from guessing. */
      const honest = r.data && HONEST.includes(r.data.reason);
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
      if (t) {                                                               // tables opened before these existed
        t.scenario = t.scenario || 'northpole'; t.rolls = t.rolls || []; t.rollSeq = t.rollSeq || 0; t.gone = t.gone || [];
        for (const [k, v] of Object.entries(Object.assign(guided(), shared()))) { if (t[k] === undefined) { t[k] = v; } }
        t.feed.forEach((f) => { f.to = f.to || ''; f.hero = f.hero || ''; });      // what was sent before notes could be private was sent to everyone
      }
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

  who(token, watching) {
    const t = this.t;
    if (typeof token !== 'string' || !token) { throw lost(); }
    if (token === t.dm) { return { dm: true }; }
    const p = t.players.find((x) => x.token === token);
    if (p) { return p; }
    /* A big screen's key is good for watching (state asks with `watching`) and for nothing else. A wrong
       key falls through to the same answer as any token nobody holds, and is counted the same way. */
    if (t.screen && alike(token, t.screen)) { if (watching) { return { screen: true }; } throw new Bad(403, 'A big screen only watches the table. It cannot do that.', 'screen_only'); }
    /* A token that used to work gets a straight answer, so the phone that holds it can say what happened. */
    const was = t.players.find((x) => (x.old || []).includes(token));
    if (was) { throw new Bad(409, 'Someone else is now playing as ' + was.name + '.', 'moved', { name: was.name }); }
    if (t.gone.includes(token)) { throw new Bad(409, 'The DM removed you from this table.', 'removed'); }
    throw lost();
  }
  dmOnly(body, msg) { if (!this.who(body.token).dm) { throw new Bad(403, msg, 'dm_only'); } }
  here(w) { if (!w.dm && !w.screen) { this.seen.set(w.id, this.now()); } }
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
  /* Drop a stored picture nothing points at any more. One the DM has shown the table stays, and so
     does one a player still wears as a portrait or the current scene or stage still shows. */
  async forget(url) {
    const t = this.t, s = t.scene, g = t.stage, m = OWN.exec(url || '');
    if (!m || m[1] !== t.code || t.feed.some((f) => f.img === url) || t.players.some((p) => p.portrait === url) || (s && (s.img === url || s.people.some((p) => p.img === url)))) { return; }
    if ((g.reveal && g.reveal.img === url) || (g.map && g.map.img === url) || g.order.some((e) => e.img === url)) { return; }
    await this.store.delete('img:' + m[2]); t.stored = Math.max(0, t.stored - 1);
  }
  /* A picture the scene may show: one that ships with the site, or one this table has stored. Anything else is left out. */
  pic(s) { const m = typeof s === 'string' && OWN.exec(s); return m ? (m[1] === this.t.code ? s : '') : (typeof s === 'string' && SHIPPED.test(s) ? s : ''); }
  /* A seat is given up, by its player or by the DM. Everything kept for that seat alone goes with it:
     the saved character, the portrait (unless the DM has shown it), what the player proposed, their
     place in every roll request, and the notes sent only to them; and with it their vote, their
     reactions, any bond another hero had with them and their place on the stage (their tokens, bond
     and hook were the seat's own). Nothing is left pointing at a seat that is no longer there. */
  async unseat(p) {
    const t = this.t, g = t.stage, notes = t.feed.filter((f) => f.to === p.id);
    t.players.splice(t.players.indexOf(p), 1); this.seen.delete(p.id);
    t.asks = t.asks.filter((a) => a.id !== p.id);
    t.reqs.forEach((q) => { q.to = q.to.filter((id) => id !== p.id); delete q.results[p.id]; });
    t.reqs = t.reqs.filter((q) => q.to.length);                       // a request with nobody left to answer it
    t.feed = t.feed.filter((f) => f.to !== p.id); t.pulled = t.pulled.concat(notes.map((f) => f.n)).slice(-LIMIT.pulled);
    if (t.vote) { delete t.vote.picks[p.id]; }
    t.reacts = t.reacts.filter((r) => { delete r.by[p.id]; return r.to !== p.id && Object.keys(r.by).length; });
    t.players.forEach((x) => { if (x.bond && x.bond.to === p.id) { delete x.bond; } });
    if (g.spot === p.id || g.order.some((e) => e.id === p.id)) {             // the stage has changed, so every device is sent it again
      t.stage = Object.assign({}, g, { spot: g.spot === p.id ? '' : g.spot, order: g.order.filter((e) => e.id !== p.id), now: g.now === p.id ? '' : g.now }); t.stageN++;
    }
    await this.store.delete('save:' + p.id);
    for (const url of new Set([p.portrait].concat(notes.map((f) => f.img)))) { await this.forget(url); }
  }

  /* ---- the table ---- */
  async create(body) {
    if (this.t) { throw new Bad(409, 'That code is in use.'); }
    this.t = Object.assign({ code: String(body.code), dm: rnd(16), created: this.now(), scenario: body.scenario, players: [], feed: [], seq: 0, rolls: [], rollSeq: 0, gone: [], stored: 0, spend: { images: 0, texts: 0 } }, guided(), shared());
    await this.save(); await this.stayOpen();
    return { code: this.t.code, token: this.t.dm, scenario: this.t.scenario };
  }
  async dm() { const t = this.t; await this.stayOpen(); return { code: t.code, token: t.dm, players: t.players.length, scenario: t.scenario }; }
  async join(body) {
    const t = this.t, name = typeof body.name === 'string' ? clean(body.name, 24) : '';
    if (!name) { throw new Bad(400, 'Tell the table your name first.', 'no_name'); }
    if (t.barred.some((b) => b.name === name.toLowerCase() && b.until > this.now())) { throw new Bad(403, 'The DM removed you from this table. You cannot come back to it just yet.', 'removed'); }
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
    /* A bond with another hero at the table, and a hook into the story. For each: an object sets it, null
       takes it away, and leaving it out leaves it be (so a phone on last month's page changes neither). */
    let bond = w.bond || null, hook = w.hook || null;
    if (body.bond !== undefined) {
      const b = thing(body.bond), prompt = b ? clean(b.prompt, 160) : '', words = b ? clean(b.text, 200) : '';
      if (body.bond !== null && (!b || typeof b.to !== 'string' || b.to === w.id || !(prompt || words))) { throw new Bad(400, 'That bond did not come through. Write it again.', 'bad_bond'); }
      if (b && !t.players.some((x) => x.id === b.to)) { throw new Bad(409, 'That player is no longer at this table.', 'no_seat'); }
      bond = b && { to: b.to, prompt, text: words };
    }
    if (body.hook !== undefined) {
      const h = thing(body.hook), id = h ? clean(h.id, 40) : '', words = h ? clean(h.text, 240) : '';
      if (body.hook !== null && !(id || words)) { throw new Bad(400, 'That hook did not come through. Pick it again.', 'bad_hook'); }
      hook = h && { id, text: words };
    }
    if (pic && pic !== w.portrait) { portrait = SHIPPED.test(pic) ? pic : await this.storeImage(pic); }
    else if (!pic && body.clearPortrait === true) { portrait = ''; }       // an empty portrait alone changes nothing: a phone that has lost its picture must not wipe the table's copy
    if (body.char && typeof body.char === 'object') { const c = body.char; w.char = { name: clean(c.name, 40), race: clean(c.race, 30), cls: clean(c.cls, 30), line: clean(c.line, 80), look: clean(c.look, 400) }; }
    w.name = name;
    if (bond) { w.bond = bond; } else { delete w.bond; }
    if (hook) { w.hook = hook; } else { delete w.hook; }
    /* how the hero talks: the label the player picked, for the DM and themselves. A string sets it, an empty one takes it away, leaving it out leaves it be. */
    if (typeof body.voice === 'string') { const v = clean(body.voice, 60); if (v) { w.voice = v; } else { delete w.voice; } }
    if (typeof body.save === 'string' && body.save.length <= 20000) { await this.store.put('save:' + w.id, body.save); }   // the whole character, for taking the seat back later
    if (portrait !== w.portrait) { const old = w.portrait; w.portrait = portrait; await this.forget(old); }
    await this.save(); await this.stayOpen();
    return { ok: true, portrait: w.portrait, name: w.name };
  }
  /* What a phone asks for every few seconds. The DM is sent everything (but the story's place, which is
     fetched when wanted: see session). A player is sent the feed items for everyone or for their own
     seat, their own proposals, and the roll requests addressed to them, each without its target and
     without the lines kept for passing and failing (see mine); of a vote still open, their own pick and
     no count; and their own hook, nobody else's.
     A big screen is sent what the whole room may see: the seats, the scene and stage, the dice, what was
     sent to everyone, each roll request as its label and how each seat's roll went, and the vote with
     its count. Never a private note, a proposal, a target or its lines, or a hook. */
  state(body) {
    const t = this.t, w = this.who(body.token, true), now = this.now(), me = w.dm ? 'dm' : w.id, after = Number(body.after) || 0, afterRoll = Number(body.afterRoll) || 0;
    const answered = t.asks.filter((a) => a.verdict).slice(-10), mayRead = (to) => w.dm || !to || to === w.id;       // a screen has no seat, so nothing private is ever its to read
    const v = t.vote && (t.vote.open || now - t.vote.closedAt < VOTED) ? t.vote : null, marks = t.reacts.filter((r) => mayRead(r.to));
    this.here(w);
    const s = { code: t.code, you: w.screen ? 'screen' : me, players: t.players.map((p) => pub(p, w)), feed: t.feed.filter((f) => f.n > after && mayRead(f.to)), last: t.seq,
      scenario: t.scenario, rolls: t.rolls.filter((r) => r.n > afterRoll).slice(-LIMIT.rolls), lastRoll: t.rollSeq, sceneN: t.sceneN, pulled: t.pulled, stageN: t.stageN, floor: t.floor, time: now,
      requests: w.dm ? t.reqs
        : w.screen ? t.reqs.map((q) => ({ n: q.n, label: q.label, to: q.to, at: q.at, closed: q.closed, results: Object.fromEntries(Object.entries(q.results).map(([id, r]) => [id, { total: r.total, nat: r.nat, pass: r.pass }])) }))
        : t.reqs.filter((q) => q.to.includes(w.id)).map((q) => { const o = { n: q.n, label: q.label, why: q.why, skill: q.skill, at: q.at, closed: q.closed }, r = mine(q, w.id); if (r) { o.mine = r; } return o; }),
      /* the vote on the table, or the last one for ten minutes after it closed. How it stands is for the DM and the screen until then. */
      votes: v ? [Object.assign({ n: v.n, q: v.q, options: v.options, open: v.open, mine: Object.hasOwn(v.picks, me) ? v.picks[me] : null }, !v.open || w.dm || w.screen ? { counts: v.options.map((o, i) => Object.values(v.picks).filter((pick) => pick === i).length) } : null)] : [],
      reacts: Object.fromEntries(marks.map((r) => [r.on, tally(r.by)])) };
    if (!w.screen) {
      s.asks = w.dm ? t.asks.filter((a) => !a.verdict || answered.includes(a)) : t.asks.filter((a) => a.id === w.id).slice(-5);
      s.reacted = Object.fromEntries(marks.filter((r) => Object.hasOwn(r.by, me)).map((r) => [r.on, r.by[me]]));        // which marks are this device's own
    }
    if (w.dm) { s.sessionAt = t.sessionAt; s.screen = !!t.screen; }
    /* the scene and the stage go only to a device that does not have the newest yet. After a fresh start there is no scene, and `scene` says so. */
    if (t.sceneN && t.sceneN > (Number(body.afterScene) || 0)) { s.scene = t.scene; }
    if (t.stageN && t.stageN > (Number(body.afterStage) || 0)) { s.stage = t.stage; }
    return s;
  }
  /* The DM says where the story is: what is happening, what a player might try, who is here. The table
     keeps one copy, made neat (only the parts it knows, nothing longer than it should be), and numbers
     it, so each phone fetches a scene once. Sending the very same scene again changes nothing. */
  async scene(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can set the scene.');
    const s = body.scene;
    if (!s || typeof s !== 'object' || Array.isArray(s)) { throw new Bad(400, 'That scene did not come through. Try again.', 'bad_scene'); }
    if (over(s, LIMIT.scene)) { throw tooMuch(); }
    const neat = { id: clean(s.id, 40), chapter: clean(s.chapter, 80), title: clean(s.title, 80), summary: clean(s.summary, 400), img: this.pic(s.img),
      cards: rows(s.cards, (c) => { const label = clean(c.label, 60); return label && { id: clean(c.id, 40), label, hint: clean(c.hint, 120) }; }).slice(0, 8),
      quests: rows(s.quests, (q) => { const text = clean(q.text, 160); return text && { id: clean(q.id, 40), text, done: q.done === true }; }).slice(0, 12),
      clues: rows(s.clues, (c) => { const text = clean(c.text, 200); return text && { id: clean(c.id, 40), text }; }).slice(0, 20),
      people: rows(s.people, (p) => { const name = clean(p.name, 60); return name && { id: clean(p.id, 40), name, line: clean(p.line, 160), img: this.pic(p.img) }; }).slice(0, 40),
      story: rows(s.story, (o, line) => clean(line, 240)).slice(-30) };                 // the story so far is oldest first, so the newest thirty lines are the ones kept
    if (t.scene && JSON.stringify(t.scene) === JSON.stringify(Object.assign({ n: t.scene.n }, neat))) { return { n: t.scene.n }; }
    t.scene = Object.assign({ n: ++t.sceneN }, neat);
    await this.save(); await this.stayOpen();
    return { n: t.scene.n };
  }
  async keep(body) {              // the DM stores a picture without showing it yet
    this.dmOnly(body, 'Only the DM can do that.');
    const url = await this.storeImage(body.image);
    await this.save();
    return { url };
  }
  /* The DM shows the table a note or a picture, or offers a ready-made hero. With `to` it goes to one
     seat and nobody else is ever sent it (see state). */
  async send(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can send to the table.');
    const title = clean(body.title, 80), text = clean(body.text, 1200), hero = clean(body.hero, 60), to = body.to === undefined || body.to === null || body.to === 'all' ? '' : body.to;
    if (!body.image && !text && !title && !hero) { throw new Bad(400, 'There is nothing to send.', 'empty'); }
    if (to !== '' && !t.players.some((p) => p.id === to)) { throw new Bad(409, 'That player is no longer at this table.', 'no_seat'); }
    let img = '';
    if (body.image) {
      const own = typeof body.image === 'string' && OWN.exec(body.image);
      if (own) {                               // a picture already kept: it has to be this table's, and still here
        if (own[1] !== t.code || !(await this.store.get('img:' + own[2]))) { throw new Bad(409, 'That picture is no longer on this table. Paint or add it again.', 'no_picture'); }
        img = body.image;
      } else { img = typeof body.image === 'string' && SHIPPED.test(body.image) ? body.image : await this.storeImage(body.image); }
    }
    const item = { n: ++t.seq, at: this.now(), kind: hero ? 'hero' : img ? 'image' : 'note', title, text, img, to, hero };
    t.feed.push(item); if (t.feed.length > LIMIT.feed) { t.feed.shift(); }
    await this.save(); await this.stayOpen();
    return { ok: true, n: item.n, players: to ? 1 : t.players.length };
  }
  /* The DM takes back something sent by mistake. Its picture goes too, unless something else still shows
     it. Phones are told the number (the last thirty are remembered) so they drop their copy. */
  async unsend(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can take something back.');
    const i = t.feed.findIndex((f) => f.n === body.n), item = t.feed[i];
    if (item) {
      t.feed.splice(i, 1); t.pulled = t.pulled.concat(item.n).slice(-LIMIT.pulled); t.reacts = t.reacts.filter((r) => r.on !== 'feed:' + item.n);
      await this.forget(item.img);
      await this.save(); await this.stayOpen();
    }
    return { removed: !!item };
  }
  /* A roll everyone at the table can see. The phone that rolled says what came up; the table
     only tidies it (short text, whole numbers, a known kind) and keeps the last forty. */
  async roll(body) {
    const t = this.t, w = this.who(body.token), now = this.now(), id = w.dm ? 'dm' : w.id, whole = Number.isInteger;
    this.here(w);
    if (!whole(body.total) || body.total < -99 || body.total > 999) { throw new Bad(400, 'That roll did not come through. Roll again.', 'bad_roll'); }
    if (t.rolls.some((r) => r.id === id && r.kind !== 'token' && now - r.at < 1000)) { throw new Bad(429, 'The dice are still rolling. Give them a second.', 'slow'); }
    const dice = (Array.isArray(body.dice) ? body.dice : []).filter((d) => d && whole(d.sides) && whole(d.value) && d.sides >= 2 && d.sides <= 1000 && d.value >= 0 && d.value <= d.sides).slice(0, 8).map((d) => ({ sides: d.sides, value: d.value }));
    const item = { n: ++t.rollSeq, id, name: w.dm ? 'DM' : w.name, role: w.dm ? 'dm' : 'player', label: clean(body.label, 60), kind: KINDS.includes(body.kind) ? body.kind : 'free',
      total: body.total, nat: (body.nat === 20 || body.nat === 1) && dice.some((d) => d.sides === 20 && d.value === body.nat) ? body.nat : 0, detail: clean(body.detail, 80), dice, at: now };
    t.rolls.push(item); if (t.rolls.length > LIMIT.rolls) { t.rolls.shift(); }
    /* A roll the DM asked for is also written against the request: once for each seat that was asked.
       At or over the target passes; a natural 20 always does and a natural 1 never does; with no target
       it waits for the DM (see judge). When the roll cannot count, the dice still stand in the roll
       feed, because they were rolled, and the phone is told why in a sentence. */
    let out = { n: item.n }, no = null;
    if (body.request !== undefined && body.request !== null) {
      const q = t.reqs.find((x) => x.n === body.request), had = q && !w.dm && mine(q, w.id);
      if (!q || w.dm || !q.to.includes(w.id)) { no = ['That roll is not being asked of you.', 'no_request']; }       // one answer for "no such request" and "not yours": nobody learns what others were asked
      else if (had) { no = ['You have already rolled for that one.', 'answered', { mine: had }]; }
      else if (q.closed) { no = ['The DM has called that roll off.', 'request_closed']; }
      else {
        const pass = q.target === null ? null : item.nat === 20 ? true : item.nat === 1 ? false : item.total >= q.target;
        q.results[w.id] = { total: item.total, nat: item.nat, pass, at: now };
        out = { n: item.n, pass, say: mine(q, w.id).say };
      }
    }
    await this.save(); await this.stayOpen();
    if (no) { throw new Bad(409, no[0], no[1], Object.assign({ n: item.n }, no[2])); }
    return out;
  }

  /* ---- proposals: a player suggests, the DM answers ---- */
  /* Tapping a card or typing what you do. Three may wait for an answer from one seat; the table keeps
     the last thirty, and lets go of answered ones first so nothing still waiting is ever lost. */
  async propose(body) {
    const t = this.t, w = this.who(body.token);
    if (w.dm) { throw new Bad(403, 'The DM answers suggestions. Only players make them.', 'player_only'); }
    this.here(w);
    const kind = body.kind === 'card' ? 'card' : 'intent', card = clean(body.card, 40), text = clean(body.text, 200);
    if (kind === 'card' ? !card : !text) { throw new Bad(400, 'Say what you want to try first.', 'empty'); }
    if (t.asks.filter((a) => a.id === w.id && !a.verdict).length >= LIMIT.waiting) { throw new Bad(429, 'The DM is still thinking about your last three ideas. Give them a moment.', 'slow'); }
    const a = { n: ++t.askSeq, id: w.id, name: w.name, kind, card, text, at: this.now(), verdict: '', note: '' };
    t.asks.push(a);
    while (t.asks.length > LIMIT.asks) { const i = t.asks.findIndex((x) => x.verdict); t.asks.splice(i < 0 ? 0 : i, 1); }
    await this.save(); await this.stayOpen();
    return { n: a.n };
  }
  /* The DM answers once: yes, no, or roll for it (the DM's page then asks for that roll; see request). */
  async answer(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can answer a suggestion.');
    const a = t.asks.find((x) => x.n === body.n);
    if (!VERDICTS.includes(body.verdict)) { throw new Bad(400, 'Answer with yes, no, or roll for it.', 'bad_verdict'); }
    if (!a) { throw new Bad(409, 'That suggestion is no longer on the table.', 'no_ask'); }
    if (a.verdict) { throw new Bad(409, 'You have already answered that one.', 'answered'); }
    a.verdict = body.verdict; a.note = clean(body.note, 200);
    await this.save(); await this.stayOpen();
    return { ok: true };
  }

  /* ---- roll requests: the DM asks, phones roll ---- */
  /* `to` is "all" (or left out) for every seat at the table now, or a list of seat ids. The target and
     the two lines stay with the DM: a seat hears one line, and only once its own roll is decided. The
     table keeps the last twenty, letting go of settled ones first. */
  async request(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can ask for a roll.');
    const all = body.to === undefined || body.to === null || body.to === 'all', want = Array.isArray(body.to) ? body.to : [body.to];
    const to = t.players.map((p) => p.id).filter((id) => all || want.includes(id)), label = clean(body.label, 60), target = body.target === undefined || body.target === null ? null : body.target;
    if (!label) { throw new Bad(400, 'Say what the roll is for first.', 'empty'); }
    if (target !== null && !(Number.isInteger(target) && target >= 1 && target <= 40)) { throw new Bad(400, 'A target is a whole number from 1 to 40.', 'bad_target'); }
    if (!to.length) { throw new Bad(409, all ? 'There is nobody at the table to ask yet.' : 'That player is no longer at this table.', 'no_seat'); }
    const q = { n: ++t.reqSeq, to, label, why: clean(body.why, 160), skill: clean(body.skill, 30), target, yes: clean(body.yes, 300), no: clean(body.no, 300), at: this.now(), closed: false, results: {} };
    t.reqs.push(q);
    while (t.reqs.length > LIMIT.requests) { const i = t.reqs.findIndex(settled); t.reqs.splice(i < 0 ? 0 : i, 1); }
    await this.save(); await this.stayOpen();
    return { n: q.n };
  }
  /* The DM says how one seat's roll went: needed when there was no target, and the DM's to change at any time. */
  async judge(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can say how a roll went.');
    const q = t.reqs.find((x) => x.n === body.n);
    if (typeof body.pass !== 'boolean') { throw new Bad(400, 'Say whether the roll passed or not.', 'bad_pass'); }
    if (!q) { throw new Bad(409, 'That roll is no longer on the table.', 'no_request'); }
    if (typeof body.id !== 'string' || !Object.hasOwn(q.results, body.id)) { throw new Bad(409, 'That player has not rolled for it yet.', 'no_roll'); }
    q.results[body.id].pass = body.pass;
    await this.save(); await this.stayOpen();
    return { ok: true };
  }
  /* The DM calls a request off: nobody else can roll for it. What was already rolled stays. */
  async cancel(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can call off a roll.');
    const q = t.reqs.find((x) => x.n === body.n);
    if (q && !q.closed) { q.closed = true; await this.save(); await this.stayOpen(); }
    return { closed: !!q };
  }

  /* ---- the stage: what the whole table is shown ---- */
  /* One small object every device is sent: a picture held face down and then shown, a map and which of its
     regions are open, the sound to play, a one-off beat, whose moment it is, and the turn order. The DM
     sends only the parts that change: each part named in `patch` replaces the table's copy of it, made
     neat, and null clears it. The stage is numbered like a scene, so a device fetches each change once;
     a patch that changes nothing keeps the number. A beat is the exception: every one is a new moment,
     so each gets the next number and the table's own time, and a phone that asks late can tell how old it is. */
  async stage(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can set the stage.');
    const p = thing(body.patch), has = (k) => Object.hasOwn(p, k);
    if (!p) { throw new Bad(400, 'That did not come through. Try again.', 'bad_stage'); }
    if (over(p, LIMIT.stage)) { throw tooMuch(); }
    const s = Object.assign({}, t.stage), beat = has('beat') && thing(p.beat) ? clean(p.beat.kind, 20) : '';
    if (has('reveal')) { const r = thing(p.reveal) || {}, title = clean(r.title, 80), img = this.pic(r.img); s.reveal = title || img ? { id: clean(r.id, 40), title, img, shown: r.shown === true } : null; }
    if (has('map')) {
      const m = thing(p.map) || {}, title = clean(m.title, 80), img = this.pic(m.img);
      const regions = once(rows(m.regions, (r) => { const id = clean(r.id, 40); return id && { id, name: clean(r.name, 40), x: within(r.x, 100, 0), y: within(r.y, 100, 0), w: within(r.w, 100, 0), h: within(r.h, 100, 0) }; })).slice(0, LIMIT.regions);
      const open = Array.isArray(m.open) ? m.open : [];
      s.map = title || img ? { id: clean(m.id, 40), title, img, regions, open: regions.map((r) => r.id).filter((id) => open.includes(id)) } : null;     // only regions this map has can be open
    }
    if (has('sound')) { const o = thing(p.sound) || {}, bed = clean(o.bed, 40); s.sound = bed ? { bed, level: within(o.level, 1, 1) } : null; }
    if (has('beat')) { s.beat = beat ? { n: ++t.beatSeq, kind: beat, at: this.now() } : null; }
    if (has('spot')) { s.spot = t.players.some((x) => x.id === p.spot) ? p.spot : ''; }            // a seat at the table, or nobody
    if (has('order')) { s.order = once(rows(p.order, (e) => { const id = clean(e.id, 40), name = clean(e.name, 60); return id && name && { id, name, kind: e.kind === 'foe' ? 'foe' : 'hero', state: clean(e.state, 20), img: this.pic(e.img) }; })).slice(0, LIMIT.order); }
    if (has('now')) { s.now = typeof p.now === 'string' ? p.now : ''; }
    if (!s.order.some((e) => e.id === s.now)) { s.now = ''; }                                      // whose turn it is has to be someone in the order
    if (!beat && JSON.stringify(s) === JSON.stringify(t.stage)) { return { n: t.stageN }; }
    t.stage = s; t.stageN++;
    await this.save(); await this.stayOpen();
    return { n: t.stageN };
  }
  /* The key a big screen watches with. Asking gives the table's key, making one the first time; `new`
     makes another, and the old one stops working at once; `off` throws it away. It is a way in, so it is
     long, random, and never sent with anything else: not even the DM's `state` carries it. */
  async screen(body) {
    const t = this.t, had = t.screen;
    this.dmOnly(body, 'Only the DM can put the table on a big screen.');
    if (body.off === true) { t.screen = ''; } else if (!had || body.new === true) { t.screen = rnd(24); }
    if (t.screen !== had) { await this.save(); await this.stayOpen(); }
    return { key: t.screen };
  }

  /* ---- a vote: the DM asks the table, each seat picks once ---- */
  /* One vote at a time: opening one lets go of the one before. A seat may change its mind while the vote is
     open. Who picked what never leaves the table: phones are sent the count, and only once it is closed. */
  async vote(body) {
    const t = this.t, now = this.now();
    this.dmOnly(body, 'Only the DM can put a vote to the table.');
    if (body.close === true) {
      const v = t.vote && t.vote.n === body.n ? t.vote : null;
      if (v && v.open) { v.open = false; v.closedAt = now; await this.save(); await this.stayOpen(); }
      return { closed: !!v };
    }
    const q = clean(body.q, 120), options = (Array.isArray(body.options) ? body.options : []).map((o) => clean(o, 40)).filter(Boolean);
    if (!q) { throw new Bad(400, 'Say what the vote is about first.', 'empty'); }
    if (options.length < 2 || options.length > LIMIT.options) { throw new Bad(400, 'A vote needs two, three or four choices.', 'bad_options'); }
    t.vote = { n: ++t.voteSeq, q, options, open: true, at: now, closedAt: 0, picks: {} };
    await this.save(); await this.stayOpen();
    return { n: t.vote.n };
  }
  async ballot(body) {
    const t = this.t, w = this.who(body.token), v = t.vote && t.vote.n === body.n ? t.vote : null;
    if (w.dm) { throw new Bad(403, 'The DM puts the question. Only players vote.', 'player_only'); }
    this.here(w);
    if (!v) { throw new Bad(409, 'That vote is no longer on the table.', 'no_vote'); }
    if (!v.open) { throw new Bad(409, 'That vote has closed.', 'vote_closed'); }
    if (!Number.isInteger(body.pick) || body.pick < 0 || body.pick >= v.options.length) { throw new Bad(400, 'Pick one of the choices.', 'bad_pick'); }
    v.picks[w.id] = body.pick;
    await this.save(); await this.stayOpen();
    return { ok: true, mine: body.pick };
  }

  /* ---- hero tokens: the DM gives, a player spends ---- */
  async award(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can give out hero tokens.');
    const p = t.players.find((x) => x.id === body.id), have = (p && p.tokens) || 0;
    if (body.give !== 1 && body.give !== -1) { throw new Bad(400, 'Give one token, or take one back.', 'bad_give'); }
    if (!p) { throw new Bad(409, 'That player is no longer at this table.', 'no_seat'); }
    if (have + body.give > LIMIT.tokens) { throw new Bad(409, p.name + ' already holds five, and that is as many as a hero can.', 'full'); }
    if (have + body.give < 0) { throw new Bad(409, p.name + ' has none to take back.', 'none'); }
    if (have + body.give) { p.tokens = have + body.give; } else { delete p.tokens; }
    await this.save(); await this.stayOpen();
    return { id: p.id, tokens: p.tokens || 0 };
  }
  /* Spending one puts a line in the roll feed, so the whole table sees it happen. With `request` it also
     takes back this seat's roll for that request, so the next roll for it is the one that counts: a token
     buys a second try, and the first is gone. Anything that cannot be done is refused before a token is used. */
  async spend(body) {
    const t = this.t, w = this.who(body.token), asked = body.request !== undefined && body.request !== null, q = asked && t.reqs.find((x) => x.n === body.request);
    if (w.dm) { throw new Bad(403, 'The DM gives hero tokens out. Only players spend them.', 'player_only'); }
    this.here(w);
    if (!w.tokens) { throw new Bad(409, 'You have no hero tokens to spend.', 'none'); }
    if (asked && !(q && Object.hasOwn(q.results, w.id))) { throw new Bad(409, 'You have not rolled for that one yet.', 'no_roll'); }
    if (q && q.closed) { throw new Bad(409, 'The DM has called that roll off.', 'request_closed'); }
    if (q) { delete q.results[w.id]; }
    if (--w.tokens === 0) { delete w.tokens; }
    const item = { n: ++t.rollSeq, id: w.id, name: w.name, role: 'player', label: clean(body.label, 60), kind: 'token', total: 0, nat: 0, detail: '', dice: [], at: this.now() };
    t.rolls.push(item); if (t.rolls.length > LIMIT.rolls) { t.rolls.shift(); }
    await this.save(); await this.stayOpen();
    return { n: item.n, tokens: w.tokens || 0 };
  }

  /* ---- reactions: a cheer or a gasp at something everyone has seen ---- */
  /* One mark from each seat (and the DM) on each thing: the same mark again takes it off, another replaces
     it. The table remembers the last sixty things anyone reacted to. A note sent to one seat can be
     reacted to by that seat and the DM, and to everyone else it is no more there than one never sent. */
  async react(body) {
    const t = this.t, w = this.who(body.token), me = w.dm ? 'dm' : w.id, m = typeof body.on === 'string' && THING.exec(body.on), n = m && Number(m[2]);
    this.here(w);
    if (!m) { throw new Bad(400, 'That is not something to react to.', 'bad_thing'); }
    if (!MARKS.includes(body.mark)) { throw new Bad(400, 'Pick one of the reactions.', 'bad_mark'); }
    const note = m[1] === 'feed' && t.feed.find((f) => f.n === n && (w.dm || !f.to || f.to === w.id));
    if (!(m[1] === 'feed' ? note : m[1] === 'roll' ? t.rolls.some((r) => r.n === n) : n > t.floor && n <= t.sceneN)) { throw new Bad(409, 'That is no longer on the table.', 'no_thing'); }
    const i = t.reacts.findIndex((r) => r.on === body.on), r = i < 0 ? Object.assign({ on: body.on, by: {} }, note && note.to ? { to: note.to } : null) : t.reacts.splice(i, 1)[0];
    if (r.by[me] === body.mark) { delete r.by[me]; } else { r.by[me] = body.mark; }
    if (Object.keys(r.by).length) { t.reacts.push(r); }                    // the newest at the end; a thing nobody marks any more is let go
    if (t.reacts.length > LIMIT.reacts) { t.reacts.shift(); }
    await this.save(); await this.stayOpen();
    return { on: r.on, mark: r.by[me] || '' };
  }

  /* ---- the DM's place in the story, kept on the table ---- */
  /* What the DM's page needs to carry on from the same place on another device, or tomorrow. It is the
     page's own business: a string we keep as it came and hand back as it was, never read. It lives under
     its own key, not in the table's blob, which is written on every roll. An empty save clears it.
     A save may say which save it was made on top of (`base`: the time of the save that page last saw
     here, 0 for none). If another device has saved since, this one is refused as 'stale' and nothing
     changes: two DM devices can then never take the story's place backwards without one of them being
     told. A save that names no base is kept as it comes. */
  async session(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can keep the story’s place here.');
    if (body.get === true) {
      const save = (t.sessionAt && await this.store.get('session')) || '';
      if (!save && t.sessionAt) { t.sessionAt = 0; await this.save(); }          // a time with no save behind it would refuse every save made on top of "nothing"
      return { save, at: save ? t.sessionAt : 0 };
    }
    if (typeof body.save !== 'string') { throw new Bad(400, 'That did not come through. Try again.', 'bad_session'); }
    if (body.save.length > LIMIT.session) { throw tooMuch(); }
    if (body.save && Number.isSafeInteger(body.base) && body.base >= 0 && body.base !== t.sessionAt) { throw new Bad(409, 'Another device has saved a newer place in the story.', 'stale', { at: t.sessionAt }); }
    if (body.save) { await this.store.put('session', body.save); } else { await this.store.delete('session'); }
    t.sessionAt = !body.save ? 0 : Number.isSafeInteger(body.at) && body.at > 0 ? body.at : this.now();      // when the page says it was saved; ours if it does not say
    await this.save(); await this.stayOpen();
    return { ok: true, at: t.sessionAt };
  }
  /* The DM starts the table's run afresh. Everything that was played goes: what was sent, the dice, what
     players proposed, the rolls asked for, the vote, reactions, the scene and the stage. The people stay:
     seats, heroes, portraits, bonds, hooks and tokens (and the DM's saved place, which the DM's page
     replaces when it wants to). Numbers never start again, or a phone would take new things for ones it
     has seen: the three counters phones keep (sent, dice, scene) all jump to one number, `floor`, and
     phones drop everything numbered at or below it. A stored picture that only the feed showed is
     deleted; one a portrait, the scene or the stage showed as well is not the feed's alone, and stays. */
  async reset(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can start the table afresh.');
    const pics = new Set(t.feed.map((f) => f.img));
    t.feed = [];
    for (const url of pics) { await this.forget(url); }             // asked while the scene and stage still stand, so what they show is kept
    t.floor = t.seq = t.rollSeq = t.sceneN = Math.max(t.seq, t.rollSeq, t.sceneN) + 1;
    Object.assign(t, { rolls: [], pulled: [], asks: [], reqs: [], vote: null, reacts: [], scene: null, stage: bare(), stageN: t.stageN + 1 });
    await this.save(); await this.stayOpen();
    return { ok: true, floor: t.floor };
  }
  /* The DM takes a seat away: the player and everything kept for their seat go (see unseat), and the
     name is free again. Their phone is told why (see who), for as long as we remember its token.
     With bar: true the name is also kept from sitting down again for an hour. */
  async kick(body) {
    const t = this.t;
    this.dmOnly(body, 'Only the DM can remove a player.');
    const p = t.players.find((x) => x.id === body.id), bar = !!p && body.bar === true, now = this.now();
    if (p) {
      t.gone = t.gone.concat(p.old || [], p.token).slice(-20);
      if (bar) { const name = p.name.toLowerCase(); t.barred = t.barred.filter((b) => b.until > now && b.name !== name).concat({ name, until: now + BAR }).slice(-LIMIT.barred); }
      await this.unseat(p);
      await this.save(); await this.stayOpen();
    }
    return Object.assign({ players: t.players.map((x) => pub(x, { dm: true })), count: t.players.length, removed: !!p }, bar ? { barred: true } : null);
  }
  /* A player gets up for good. The seat is free at once and nothing about them is kept: not the
     character, not their dice in the roll feed, not even their token (it becomes as unknown as any other). */
  async leave(body) {
    const t = this.t, w = this.who(body.token);
    if (w.dm) { throw new Bad(403, 'The DM cannot leave the table. End it instead.', 'player_only'); }
    await this.unseat(w);
    const dice = t.rolls.filter((r) => r.id === w.id).map((r) => 'roll:' + r.n);
    t.rolls = t.rolls.filter((r) => r.id !== w.id); t.reacts = t.reacts.filter((r) => !dice.includes(r.on));
    await this.save(); await this.stayOpen();
    return { ok: true };
  }
  /* The DM ends the table for good. Everything is deleted at once; for an hour the code still
     answers "this table has ended", so phones left open hear it plainly, and then it is free. */
  async close(body) {
    this.dmOnly(body, 'Only the DM can end the table.');
    const t = this.t, tokens = [t.dm].concat(t.gone || [], t.screen || []);         // a screen left on is told too, like any phone
    t.players.forEach((p) => { tokens.push(p.token); (p.old || []).forEach((o) => tokens.push(o)); });
    await this.store.deleteAll(); await this.store.deleteAlarm();
    this.t = null; this.seen.clear(); this.closed = this.now(); this.wasHere = tokens;
    await this.store.put('closed', { at: this.closed, tokens }); await this.store.setAlarm(this.closed + ENDED);
    return { ok: true };
  }

  /* ---- OpenAI, on behalf of people at this table ---- */
  async charge(w, kind) {
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
    await this.charge(w, kind);
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
