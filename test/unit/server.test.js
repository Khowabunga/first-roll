/* The server's rules (server/core.js), run in Node with a Map for storage and a clock we can
   wind forward. Nothing here touches the network: OpenAI is a function each test hands in.
   Run with:  npm test */
const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.crypto) { globalThis.crypto = require('node:crypto').webcrypto; }       // Node 18
globalThis.fetch = () => { throw new Error('a test tried to reach the network'); };

const core = import('../../server/core.js');
const PASS = 'sesame-for-tests';
const NO_TABLE = '{"error":"No table with that code. Check it with your DM."}';
const PNG = 'data:image/png;base64,' + Buffer.from('a small picture').toString('base64');

/* What a Durable Object's storage does, as far as core.js cares. Values are copied on the way
   in and out, as the real store does, so a test can "put the table to sleep" and read it back. */
function memory() {
  const m = new Map(), s = { m, alarm: null };
  s.get = async (k) => structuredClone(m.get(k));
  s.put = async (k, v) => { m.set(k, structuredClone(v)); };
  s.delete = async (k) => m.delete(k);
  s.deleteAll = async () => { m.clear(); };
  s.setAlarm = async (t) => { s.alarm = t; };
  s.deleteAlarm = async () => { s.alarm = null; };
  return s;
}

/* A whole site: the front door, tables that appear when asked for, one clock for all of them. */
async function world(opt = {}) {
  const { createApi, TableCore } = await core;
  let time = 1800000000000;
  const now = () => time, stores = new Map(), tables = new Map(), limited = [];
  const env = Object.assign({ DM_PASSCODE: PASS, OPENAI_API_KEY: 'test-key-not-real' }, opt.env);
  const w = { env, stores, tables, limited, calls: [], now };
  w.openai = opt.openai || (() => { throw new Error('this test did not expect an OpenAI call'); });
  const api = createApi({ now });
  w.store = (code) => { if (!stores.has(code)) { stores.set(code, (opt.store || memory)()); } return stores.get(code); };
  const table = (code) => { if (!tables.has(code)) { tables.set(code, new TableCore({ store: w.store(code), env, now, fetch: (url, init) => { w.calls.push({ url, init }); return w.openai(url, init); } })); } return tables.get(code); };
  w.tick = (ms) => { time += ms; };
  w.sleep = () => tables.clear();                // the objects are put to sleep: memory gone, storage kept
  w.saved = (code) => stores.get(code).m.get('t');
  w.request = async (method, path, body, o = {}) => {
    const init = { method }; if (method === 'POST') { init.body = o.raw !== undefined ? o.raw : JSON.stringify(body || {}); if (typeof init.body !== 'string') { init.duplex = 'half'; } }
    const x = { env, ip: o.ip || '10.0.0.1', table };
    if (opt.limit) { x.limit = (ip) => { limited.push(path.split('?')[0]); return opt.limit(ip, limited.length); }; }
    const res = await api.handle(new Request('https://first-roll.test' + path, init), x);
    const out = { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
    out.text = Buffer.from(out.bytes).toString(); try { out.json = JSON.parse(out.text); } catch (e) { out.json = null; }
    return out;
  };
  w.post = (route, body, o = {}) => w.request('POST', '/api/' + (route === 'image' || route === 'text' ? route : 'table/' + route) + (o.c ? '?c=' + o.c : ''), body, o);
  w.open = async (extra) => { const r = await w.post('open', Object.assign({ passcode: PASS }, extra)); assert.equal(r.status, 200, r.text); return r.json; };
  w.join = async (code, name, extra) => { const r = await w.post('join', Object.assign({ name }, extra), { c: code }); assert.equal(r.status, 200, r.text); return r.json; };
  return w;
}
const quiet = (t) => t.mock.method(console, 'error', () => {});
const logged = (spy) => spy.mock.calls.map((c) => c.arguments.map((a) => (a && a.stack) || String(a)).join(' ')).join('\n');
const okJson = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/* ---------------- opening a table ---------------- */
test('open: a new table gets a code, a DM token and the default scenario', async () => {
  const w = await world(), j = await w.open();
  assert.match(j.code, /^[A-Z]{4}$/); assert.match(j.token, /^[0-9a-f]{32}$/);
  assert.equal(j.scenario, 'northpole');
  assert.equal(w.saved(j.code).scenario, 'northpole');
  assert.equal(w.store(j.code).alarm, w.now() + 30 * 24 * 3600 * 1000);
});
test('open: the scenario is stored on a new table and returned; by code the stored one wins', async () => {
  const w = await world(), j = await w.open({ scenario: 'haunted-keep' });
  assert.equal(j.scenario, 'haunted-keep');
  assert.equal(w.saved(j.code).scenario, 'haunted-keep');
  await w.join(j.code, 'Ann');
  const back = await w.open({ code: j.code.toLowerCase(), scenario: 'something-else' });
  assert.deepEqual(back, { code: j.code, token: j.token, players: 1, scenario: 'haunted-keep' });
  w.sleep();
  assert.equal((await w.open({ code: j.code })).scenario, 'haunted-keep');
  assert.equal((await w.post('state', { token: j.token }, { c: j.code })).json.scenario, 'haunted-keep');
});
test('open: wrong passcode, bad scenario, unknown code, and a site with no passcode', async () => {
  const w = await world();
  for (const passcode of ['', 'sesame', PASS + 'x', PASS.toUpperCase(), 42, null, [PASS], { a: 1 }]) {
    const r = await w.post('open', { passcode }, { ip: 'p' + String(passcode) });
    assert.equal(r.status, 403); assert.equal(r.json.error, 'That is not the DM passcode.');
  }
  for (const scenario of ['North Pole', 'a/b', '../x', 'x'.repeat(41), 7, ['northpole']]) {
    const r = await w.post('open', { passcode: PASS, scenario }, { ip: 's' + String(scenario) });
    assert.equal(r.status, 400, String(scenario)); assert.equal(r.json.reason, 'bad_scenario');
  }
  assert.equal(w.stores.size, 0, 'nothing was opened along the way');
  assert.equal((await w.post('open', { passcode: PASS, code: 'ZZZZ' })).status, 404);
  assert.equal((await w.post('open', { passcode: PASS, code: 'toolong' })).status, 404);
  const off = await world({ env: { DM_PASSCODE: '' } }), r = await off.post('open', { passcode: '' });
  assert.equal(r.status, 503); assert.equal(r.json.reason, 'off');
});
test('a table opened before scenarios existed counts as northpole', async () => {
  const w = await world();
  await w.store('OLDT').put('t', { code: 'OLDT', dm: 'd'.repeat(32), created: 1, players: [{ id: 'aaaaaaaa', token: 'p'.repeat(32), name: 'Ann', char: null, portrait: '', portraits: 0 }], feed: [], seq: 0, stored: 0, spend: { images: 0, texts: 0 } });
  const s = await w.post('state', { token: 'p'.repeat(32) }, { c: 'OLDT' });
  assert.equal(s.status, 200); assert.equal(s.json.scenario, 'northpole'); assert.deepEqual(s.json.rolls, []); assert.equal(s.json.lastRoll, 0);
  assert.equal((await w.post('roll', { token: 'p'.repeat(32), total: 9 }, { c: 'OLDT' })).status, 200);
  w.tick(91000);
  assert.equal((await w.join('OLDT', 'ann')).back, true);
  assert.equal((await w.post('state', { token: 'p'.repeat(32) }, { c: 'OLDT' })).json.reason, 'moved');
});

/* ---------------- joining ---------------- */
test('join: a new seat, the scenario, and a full table', async () => {
  const w = await world(), dm = await w.open({ scenario: 'deep-mine' });
  const a = await w.join(dm.code, '  Ann  ');
  assert.deepEqual(Object.keys(a).sort(), ['code', 'id', 'name', 'scenario', 'token']);
  assert.equal(a.name, 'Ann'); assert.equal(a.scenario, 'deep-mine'); assert.equal(a.code, dm.code);
  for (const name of ['', '   ', 5, null, ['Ann'], undefined]) { assert.equal((await w.post('join', { name }, { c: dm.code, ip: 'n' + String(name) })).status, 400); }
  for (let i = 2; i <= 8; i++) { await w.join(dm.code, 'Player ' + i); }
  const r = await w.post('join', { name: 'One too many' }, { c: dm.code });
  assert.equal(r.status, 409); assert.equal(r.json.error, 'This table is full.'); assert.equal(r.json.reason, 'full');
  const s = await w.post('state', { token: dm.token }, { c: dm.code });
  assert.equal(s.json.players.length, 8); assert.equal(s.json.you, 'dm');
  assert.deepEqual(s.json.players[0], { id: a.id, name: 'Ann', char: null, portrait: '' });
});
test('join: a quiet seat is taken back by name, with its character and portrait', async () => {
  const w = await world(), dm = await w.open(), a = await w.join(dm.code, 'Ann');
  const me = await w.post('me', { token: a.token, save: '{"name":"Brindle"}', portrait: PNG, char: { name: 'Brindle', cls: 'Scout' } }, { c: dm.code });
  assert.equal(me.status, 200);
  w.tick(91000);                                 // ninety quiet seconds
  const back = await w.join(dm.code, ' ANN ');
  assert.equal(back.back, true); assert.equal(back.id, a.id); assert.equal(back.name, 'Ann'); assert.equal(back.scenario, 'northpole');
  assert.equal(back.save, '{"name":"Brindle"}'); assert.equal(back.portrait, me.json.portrait);
  assert.notEqual(back.token, a.token);
  assert.equal((await w.post('state', { token: back.token }, { c: dm.code })).status, 200);
  /* and after the table has been asleep nobody is remembered as active, so no question is asked */
  w.sleep();
  assert.equal((await w.join(dm.code, 'ann')).back, true);
  assert.equal((await w.post('state', { token: dm.token }, { c: dm.code })).json.players.length, 1);
});
test('join: a name being played right now asks first (name_in_use), then confirm takes the seat', async () => {
  const w = await world(), dm = await w.open(), a = await w.join(dm.code, 'Ann');
  await w.post('state', { token: a.token }, { c: dm.code });
  w.tick(89000);
  const clash = await w.post('join', { name: 'ann' }, { c: dm.code });
  assert.equal(clash.status, 409);
  assert.deepEqual(clash.json, { error: 'Ann is already at this table. Is that you on another phone?', reason: 'name_in_use', name: 'Ann' });
  assert.equal((await w.post('join', { name: 'ann', confirm: 'yes' }, { c: dm.code })).status, 409, 'only confirm:true counts');
  assert.equal((await w.post('state', { token: a.token }, { c: dm.code })).status, 200, 'the seat was not touched');
  const mine = await w.join(dm.code, 'ann', { confirm: true });
  assert.equal(mine.back, true); assert.equal(mine.id, a.id);
  /* rolling and updating the character count as being here too */
  for (const [route, body] of [['roll', { total: 4 }], ['me', { char: { name: 'B' } }]]) {
    w.tick(200000);
    assert.equal((await w.post(route, Object.assign({ token: mine.token }, body), { c: dm.code })).status, 200);
    assert.equal((await w.post('join', { name: 'Ann' }, { c: dm.code })).json.reason, 'name_in_use', route);
  }
});
test('a token whose seat was taken over gets 409 "moved"; only the last three are remembered', async (t) => {
  const w = await world(), dm = await w.open(), tokens = [(await w.join(dm.code, 'Ann')).token];
  tokens.push((await w.join(dm.code, 'Ann')).token);
  for (const [route, body] of [['state', {}], ['me', { name: 'X' }], ['roll', { total: 3 }], ['send', { text: 'hi' }], ['keep', { image: PNG }], ['kick', { id: 'x' }], ['close', {}], ['image', { prompt: 'p' }], ['text', { system: 's', user: 'u' }]]) {
    const r = await w.post(route, Object.assign({ token: tokens[0] }, body), { c: dm.code });
    assert.equal(r.status, 409, route);
    assert.deepEqual(r.json, { error: 'Someone else is now playing as Ann.', reason: 'moved', name: 'Ann' });
  }
  w.sleep();                                      // remembered in storage, not just in memory
  assert.equal((await w.post('state', { token: tokens[0] }, { c: dm.code })).json.reason, 'moved');
  for (let i = 0; i < 3; i++) { tokens.push((await w.join(dm.code, 'Ann')).token); }      // five tokens so far; the newest holds the seat
  assert.deepEqual(w.saved(dm.code).players[0].old, tokens.slice(1, 4));
  assert.equal((await w.post('state', { token: tokens[4] }, { c: dm.code })).status, 200);
  for (const old of tokens.slice(1, 4)) { assert.equal((await w.post('state', { token: old }, { c: dm.code })).json.reason, 'moved'); }
  const first = await w.post('state', { token: tokens[0] }, { c: dm.code });
  assert.equal(first.status, 404); assert.equal(first.text, NO_TABLE);
});

/* ---------------- guessing ---------------- */
test('an unknown code and a bad token get byte-identical 404s on every route', async () => {
  const w = await world(), dm = await w.open(), a = await w.join(dm.code, 'Ann');
  const bodies = { state: { after: 0 }, me: { name: 'Zed', char: { name: 'Z' } }, roll: { total: 12 }, send: { text: 'hello' }, keep: { image: PNG }, kick: { id: a.id }, close: {}, image: { prompt: 'a fox' }, text: { system: 's', user: 'u' } };
  let ip = 0;
  for (const [route, body] of Object.entries(bodies)) {
    const answers = [];
    for (const [c, token] of [['ZZZZ', a.token], ['ZZZZ', undefined], [dm.code, 'f'.repeat(32)], [dm.code, a.token.slice(0, 31)], [dm.code, undefined], [dm.code, ''], [dm.code, 7], [dm.code, { $ne: 1 }], ['nope!', a.token], ['', a.token]]) {
      if ((route === 'image' || route === 'text') && c === '') { continue; }       // no code at all is its own answer, below
      answers.push(await w.post(route, Object.assign({}, body, token === undefined ? {} : { token }), { c, ip: 'guess-' + ip++ }));
    }
    for (const r of answers) {
      assert.equal(r.status, 404, route); assert.equal(r.text, NO_TABLE, route);
      assert.deepEqual([...r.headers].sort(), [...answers[0].headers].sort(), route);
    }
  }
  /* pictures and story help with no code at all keep their own message */
  for (const route of ['image', 'text']) {
    const r = await w.post(route, { token: a.token, prompt: 'p', system: 's', user: 'u' });
    assert.equal(r.status, 403); assert.match(r.json.error, /^Join your DM’s table first\./);
  }
  /* none of that changed the table, and none of it spent anything */
  const s = await w.post('state', { token: dm.token }, { c: dm.code });
  assert.deepEqual(s.json.players.map((p) => p.name), ['Ann']); assert.deepEqual(s.json.feed, []); assert.deepEqual(s.json.rolls, []);
  assert.deepEqual(w.saved(dm.code).spend, { images: 0, texts: 0 }); assert.equal(w.calls.length, 0);
});
test('twenty strikes in a minute, then 429 on every call from that address', async () => {
  const w = await world(), dm = await w.open(), a = await w.join(dm.code, 'Ann'), ip = '203.0.113.9';
  const tries = [['state', { token: 'nope' }, dm.code], ['roll', { token: 'nope', total: 1 }, 'QQQQ'], ['join', { name: 'Zed' }, 'QQQQ'], ['open', { passcode: 'wrong' }, ''], ['image', { token: 'x', prompt: 'p' }, dm.code], ['me', { token: 'nope' }, dm.code]];
  for (let i = 0; i < 20; i++) {
    const [route, body, c] = tries[i % tries.length], r = await w.post(route, body, { c, ip });
    assert.notEqual(r.status, 429, 'try ' + (i + 1)); assert.ok(r.status >= 400);
  }
  for (const [route, body, c] of [['state', { token: a.token }, dm.code], ['join', { name: 'Bea' }, dm.code], ['open', { passcode: PASS }, ''], ['roll', { token: a.token, total: 5 }, dm.code], ['image', { token: a.token, prompt: 'p' }, dm.code], ['text', { token: a.token, system: 's', user: 'u' }, dm.code], ['text', {}, ''], ['close', { token: dm.token }, dm.code]]) {
    const r = await w.post(route, body, { c, ip });
    assert.equal(r.status, 429, route);
    assert.deepEqual(r.json, { error: 'Too many tries. Wait a minute, then try again.', reason: 'blocked' });
    assert.equal(r.headers.get('retry-after'), '60');
  }
  assert.equal((await w.request('GET', '/api/table/img?code=' + dm.code + '&id=0123456789abcdef', null, { ip })).status, 429);
  assert.equal((await w.request('GET', '/api/health', null, { ip })).status, 200, 'the health check always answers');
  assert.equal((await w.post('state', { token: a.token }, { c: dm.code, ip: '203.0.113.10' })).status, 200, 'other addresses are not held up');
  w.tick(61000);
  assert.equal((await w.post('state', { token: a.token }, { c: dm.code, ip })).status, 200, 'and a minute later the door opens again');
  assert.equal((await w.post('join', { name: 'Bea' }, { c: dm.code, ip })).status, 200);
});
test('nineteen strikes are not enough, and old strikes are forgotten', async () => {
  const w = await world(), dm = await w.open(), ip = '198.51.100.1';
  for (let i = 0; i < 19; i++) { await w.post('state', { token: 'nope' }, { c: dm.code, ip }); }
  assert.equal((await w.post('state', { token: dm.token }, { c: dm.code, ip })).status, 200);
  w.tick(61000);
  for (let i = 0; i < 19; i++) { await w.post('state', { token: 'nope' }, { c: dm.code, ip }); }
  assert.equal((await w.post('state', { token: dm.token }, { c: dm.code, ip })).status, 200);
});
test('a valid token never strikes, whatever answer it gets', async () => {
  const w = await world(), dm = await w.open(), a = await w.join(dm.code, 'Ann'), b = await w.join(dm.code, 'Bea'), ip = '192.0.2.77';
  const at = { c: dm.code, ip };
  for (let i = 0; i < 12; i++) {
    assert.equal((await w.post('state', { token: a.token }, at)).status, 200);
    assert.equal((await w.post('send', { token: a.token, text: 'x' }, at)).status, 403);         // not the DM
    assert.equal((await w.post('roll', { token: a.token, total: 5000 }, at)).status, 400);       // a bad roll
    assert.equal((await w.post('me', { token: a.token, name: 'Bea' }, at)).status, 409);         // name taken
    assert.equal((await w.post('state', {}, Object.assign({ raw: '[1,2]' }, at))).status, 400);  // not even an object
  }
  /* a token that has been replaced, one that was removed, and a closed table are not guesses either */
  const a2 = await w.join(dm.code, 'Ann', { confirm: true });
  await w.post('kick', { token: dm.token, id: b.id }, { c: dm.code });
  for (let i = 0; i < 25; i++) {
    assert.equal((await w.post('state', { token: a.token }, at)).json.reason, 'moved');
    assert.equal((await w.post('state', { token: b.token }, at)).json.reason, 'removed');
  }
  assert.equal((await w.post('close', { token: dm.token }, { c: dm.code })).status, 200);
  for (let i = 0; i < 25; i++) {
    assert.equal((await w.post('state', { token: a2.token }, at)).status, 410);
    assert.equal((await w.post('state', { token: dm.token }, at)).status, 410);
  }
  const fresh = await w.post('open', { passcode: PASS }, { ip });
  assert.equal(fresh.status, 200, 'still welcome after all that');
});
test('the shared counter is asked only about open, join and calls with no good token', async () => {
  let allow = true;
  const w = await world({ limit: () => allow }), dm = await w.open(), a = await w.join(dm.code, 'Ann');
  assert.deepEqual(w.limited, ['/api/table/open', '/api/table/join']);
  for (const route of ['state', 'me', 'roll']) { await w.post(route, { token: a.token, total: 3 }, { c: dm.code }); }
  await w.post('send', { token: dm.token, text: 'hi' }, { c: dm.code });
  await w.post('send', { token: a.token, text: 'hi' }, { c: dm.code });                   // refused, but by someone with a seat
  assert.equal(w.limited.length, 2, 'a good token never reaches the counter');
  assert.equal((await w.post('state', {}, { c: dm.code })).status, 404);
  assert.equal((await w.post('state', { token: 'bad' }, { c: dm.code })).status, 404);
  assert.equal((await w.post('roll', { token: a.token, total: 1 }, { c: 'QQQQ' })).status, 404);
  assert.deepEqual(w.limited.slice(2), ['/api/table/state', '/api/table/state', '/api/table/roll']);
  allow = false;                                  // the counter says this address has had enough
  for (const [route, body, c] of [['open', { passcode: PASS }, ''], ['join', { name: 'Bea' }, dm.code], ['state', { token: 'bad' }, dm.code]]) {
    const r = await w.post(route, body, { c });
    assert.equal(r.status, 429, route); assert.equal(r.json.reason, 'blocked');
  }
  assert.equal((await w.post('state', { token: a.token }, { c: dm.code })).status, 200, 'people at the table carry on');
  assert.equal((await w.post('state', { token: dm.token }, { c: dm.code })).json.players.length, 1, 'the refused join did not take a seat');
  /* a counter that breaks must not close the site */
  const broken = await world({ limit: () => { throw new Error('counter down'); } });
  assert.equal((await broken.post('open', { passcode: PASS })).status, 200);
});

/* ---------------- dice ---------------- */
test('roll: stored tidy, seen by everyone through state, numbered from afterRoll', async () => {
  const w = await world(), dm = await w.open(), a = await w.join(dm.code, 'Ann'), at = { c: dm.code };
  const r1 = await w.post('roll', { token: a.token, label: 'Sneak past the guard', kind: 'check', total: 17, nat: 0, detail: 'd20 (14) + 3', dice: [{ sides: 20, value: 14 }] }, at);
  assert.deepEqual(r1.json, { n: 1 });
  w.tick(1000);
  const r2 = await w.post('roll', { token: dm.token, label: 'x'.repeat(100), kind: 'smash', total: -3, nat: 20, detail: 'y'.repeat(100) + '\u0007', dice: 'six' }, at);
  assert.deepEqual(r2.json, { n: 2 });
  const s = (await w.post('state', { token: a.token, afterRoll: 0 }, at)).json;
  assert.equal(s.lastRoll, 2);
  assert.deepEqual(s.rolls[0], { n: 1, id: a.id, name: 'Ann', role: 'player', label: 'Sneak past the guard', kind: 'check', total: 17, nat: 0, detail: 'd20 (14) + 3', dice: [{ sides: 20, value: 14 }], at: w.now() - 1000 });
  assert.deepEqual(s.rolls[1], { n: 2, id: 'dm', name: 'DM', role: 'dm', label: 'x'.repeat(60), kind: 'free', total: -3, nat: 0, detail: 'y'.repeat(80), dice: [], at: w.now() });
  assert.deepEqual((await w.post('state', { token: dm.token, afterRoll: 1 }, at)).json.rolls.map((r) => r.n), [2]);
  assert.deepEqual((await w.post('state', { token: dm.token, afterRoll: 2 }, at)).json.rolls, []);
  w.sleep();
  assert.equal((await w.post('state', { token: dm.token }, at)).json.rolls.length, 2, 'rolls are saved with the table');
});
test('roll: what is refused, and what is quietly tidied', async () => {
  const w = await world(), dm = await w.open(), a = await w.join(dm.code, 'Ann'), at = { c: dm.code };
  for (const total of [undefined, null, '12', 1.5, 1000, -100, NaN, [3], {}, true]) {
    const r = await w.post('roll', { token: a.token, total }, at);
    assert.equal(r.status, 400, String(total)); assert.equal(r.json.reason, 'bad_roll');
  }
  assert.equal((await w.post('state', { token: a.token }, at)).json.lastRoll, 0, 'refused rolls leave no trace and use up no turn');
  for (const total of [-99, 999, 0]) { assert.equal((await w.post('roll', { token: a.token, total }, at)).status, 200, String(total)); w.tick(1000); }
  for (const kind of ['check', 'save', 'attack', 'damage', 'init', 'free', 'extra']) { await w.post('roll', { token: a.token, total: 1, kind }, at); w.tick(1000); }
  const dice = [{ sides: 6, value: 6 }, { sides: 6, value: 7 }, { sides: 1, value: 1 }, { sides: 6.5, value: 2 }, { sides: '6', value: 2 }, null, 'd6', { sides: 20 }, { sides: 100, value: 0, extra: 'dropped' }];
  await w.post('roll', { token: a.token, total: 2, nat: 1, dice: dice.concat(Array(12).fill({ sides: 4, value: 3 })), kind: ['check'] }, at); w.tick(1000);
  await w.post('roll', { token: a.token, total: 2, nat: 19, label: { no: 1 }, detail: 12 }, at);
  const rolls = (await w.post('state', { token: a.token }, at)).json.rolls;
  assert.deepEqual(rolls.slice(3, 10).map((r) => r.kind), ['check', 'save', 'attack', 'damage', 'init', 'free', 'extra']);
  assert.deepEqual(rolls[10].dice, [{ sides: 6, value: 6 }, { sides: 100, value: 0 }].concat(Array(6).fill({ sides: 4, value: 3 })));
  assert.equal(rolls[10].nat, 0, 'a natural 1 with no twenty-sided 1 among the dice is not believed'); assert.equal(rolls[10].kind, 'free');
  assert.equal(rolls[11].nat, 0); assert.equal(rolls[11].label, ''); assert.equal(rolls[11].detail, '12');
});
test('roll: the table keeps the last forty, and each seat rolls at most once a second', async () => {
  const w = await world(), dm = await w.open(), a = await w.join(dm.code, 'Ann'), b = await w.join(dm.code, 'Bea'), at = { c: dm.code };
  assert.equal((await w.post('roll', { token: a.token, total: 1 }, at)).status, 200);
  w.tick(999);
  const fast = await w.post('roll', { token: a.token, total: 2 }, at);
  assert.equal(fast.status, 429); assert.equal(fast.json.reason, 'slow'); assert.equal(typeof fast.json.error, 'string');
  assert.equal((await w.post('roll', { token: b.token, total: 3 }, at)).status, 200, 'another seat is not held up');
  assert.equal((await w.post('roll', { token: dm.token, total: 4 }, at)).status, 200, 'nor is the DM');
  assert.equal((await w.post('roll', { token: dm.token, total: 4 }, at)).status, 429);
  w.tick(1);
  assert.deepEqual((await w.post('roll', { token: a.token, total: 5 }, at)).json, { n: 4 });
  for (let i = 0; i < 50; i++) { w.tick(1000); assert.equal((await w.post('roll', { token: a.token, total: i }, at)).status, 200); }
  const s = (await w.post('state', { token: b.token, afterRoll: 0 }, at)).json;
  assert.equal(s.rolls.length, 40); assert.equal(s.lastRoll, 54);
  assert.deepEqual([s.rolls[0].n, s.rolls[39].n], [15, 54]);
  assert.equal(w.saved(dm.code).rolls.length, 40);
  assert.equal((await w.post('state', { token: b.token, afterRoll: 50 }, at)).json.rolls.length, 4);
});

/* ---------------- the DM's powers ---------------- */
test('kick: the seat, its saved character and its portrait go; its phone hears "removed"; the name is free', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code };
  const a = await w.join(dm.code, 'Ann'), b = await w.join(dm.code, 'Bea');
  const pic = (await w.post('me', { token: a.token, save: '{"hp":7}', portrait: PNG }, at)).json.portrait;
  const a2 = await w.join(dm.code, 'Ann', { confirm: true });          // Ann moves to another phone first
  assert.equal(w.store(dm.code).m.size, 3, 'the table, one saved character, one picture');
  assert.equal((await w.request('GET', '/' + pic)).status, 200);
  const k = await w.post('kick', { token: dm.token, id: a.id }, at);
  assert.equal(k.status, 200);
  assert.deepEqual(k.json, { players: [{ id: b.id, name: 'Bea', char: null, portrait: '' }], count: 1, removed: true });
  assert.deepEqual([...w.store(dm.code).m.keys()], ['t'], 'nothing of the seat is left in storage');
  assert.equal(w.saved(dm.code).stored, 0);
  assert.equal((await w.request('GET', '/' + pic)).status, 404);
  for (const token of [a2.token, a.token]) {
    for (const route of ['state', 'me', 'roll']) {
      const r = await w.post(route, { token, total: 1 }, at);
      assert.equal(r.status, 409, route); assert.deepEqual(r.json, { error: 'The DM removed you from this table.', reason: 'removed' });
    }
  }
  w.sleep();
  assert.equal((await w.post('state', { token: a2.token }, at)).json.reason, 'removed', 'remembered in storage');
  assert.deepEqual((await w.post('state', { token: b.token }, at)).json.players.map((p) => p.name), ['Bea']);
  /* the name can be used again, as a brand new seat with nothing carried over */
  const again = await w.join(dm.code, 'Ann');
  assert.equal(again.back, undefined); assert.notEqual(again.id, a.id);
  /* kicking someone who is not there changes nothing and says so */
  const none = await w.post('kick', { token: dm.token, id: a.id }, at);
  assert.equal(none.status, 200); assert.equal(none.json.removed, false); assert.equal(none.json.count, 2);
});
test('kick: frees a place at a full table, and only twenty removed tokens are remembered', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code }, seats = [];
  for (let i = 1; i <= 8; i++) { seats.push(await w.join(dm.code, 'P' + i)); }
  assert.equal((await w.post('join', { name: 'Late' }, at)).status, 409);
  await w.post('kick', { token: dm.token, id: seats[0].id }, at);
  assert.equal((await w.join(dm.code, 'Late')).name, 'Late');
  assert.equal((await w.post('join', { name: 'Later still' }, at)).status, 409, 'full again');
  await w.post('kick', { token: dm.token, id: seats[1].id }, at);
  const gone = [seats[0].token, seats[1].token];
  for (let i = 0; i < 21; i++) { const p = await w.join(dm.code, 'Guest'); gone.push(p.token); await w.post('kick', { token: dm.token, id: p.id }, at); }
  assert.equal(gone.length, 23); assert.equal(w.saved(dm.code).gone.length, 20);
  assert.equal((await w.post('state', { token: gone[22] }, at)).json.reason, 'removed');
  assert.equal((await w.post('state', { token: gone[3] }, at)).json.reason, 'removed');
  for (const old of gone.slice(0, 3)) { assert.equal((await w.post('state', { token: old }, at)).text, NO_TABLE, 'the oldest are forgotten'); }
});
test('a portrait the DM has shown the table is kept when its player changes it or is removed', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann');
  const pic = (await w.post('me', { token: a.token, portrait: PNG }, at)).json.portrait;
  assert.equal((await w.post('send', { token: dm.token, title: 'Meet Ann', image: pic }, at)).status, 200);
  await w.post('kick', { token: dm.token, id: a.id }, at);
  assert.equal((await w.request('GET', '/' + pic)).status, 200);
});
test('close: everything is deleted, the code says "ended" for an hour, then it is unknown', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann');
  const pic = (await w.post('me', { token: a.token, save: '{}', portrait: PNG }, at)).json.portrait;
  await w.post('send', { token: dm.token, text: 'The end.' }, at);
  const c = await w.post('close', { token: dm.token }, at);
  assert.equal(c.status, 200); assert.deepEqual(c.json, { ok: true });
  assert.deepEqual([...w.store(dm.code).m.keys()], ['closed'], 'only the marker is left');
  assert.equal(w.store(dm.code).alarm, w.now() + 3600000);
  const ENDED = '{"error":"This table has ended.","reason":"closed"}';
  const every = async () => {
    const out = [];
    for (const [route, body] of [['state', { token: a.token }], ['state', { token: dm.token }], ['me', { token: a.token }], ['roll', { token: a.token, total: 3 }], ['send', { token: dm.token, text: 'x' }], ['keep', { token: dm.token, image: PNG }], ['kick', { token: dm.token, id: a.id }], ['close', { token: dm.token }], ['image', { token: a.token, prompt: 'p' }], ['text', { token: a.token, system: 's', user: 'u' }]]) {
      out.push(await w.post(route, body, at));
    }
    out.push(await w.post('open', { passcode: PASS, code: dm.code }));
    return out;
  };
  for (const r of await every()) { assert.equal(r.status, 410); assert.equal(r.text, ENDED); }
  /* to anyone who was not at the table, an ended table looks exactly like a code nobody has */
  for (const [route, body] of [['state', { token: 'never-was' }], ['state', {}], ['join', { name: 'New' }]]) {
    const r = await w.post(route, body, { c: dm.code, ip: 'a-stranger' });
    assert.equal(r.status, 404, route); assert.equal(r.text, NO_TABLE);
  }
  assert.equal((await w.request('GET', '/' + pic, null, { ip: 'a-stranger' })).status, 404, 'its pictures are gone too');
  w.tick(3599000); w.sleep();
  for (const r of await every()) { assert.equal(r.status, 410); }
  assert.equal((await w.post('state', { token: a.token }, { c: dm.code, ip: 'someone-else' })).status, 410, 'none of that was counted as guessing');
  /* an hour on: when the alarm rings... */
  w.tick(1000);
  await w.tables.get(dm.code).alarm();
  assert.equal(w.store(dm.code).m.size, 0);
  const gone = await w.post('state', { token: a.token }, at);
  assert.equal(gone.status, 404); assert.equal(gone.text, NO_TABLE);
  assert.equal((await w.post('open', { passcode: PASS, code: dm.code })).status, 404);
});
test('close: the hour is kept even if the alarm never rings', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code };
  await w.post('close', { token: dm.token }, at);
  w.tick(3600000); w.sleep();
  assert.equal((await w.post('join', { name: 'Ann' }, at)).status, 404);
  assert.equal(w.store(dm.code).m.size, 0);
});
test('a new table is never given a code that is in use or has just ended', async () => {
  const { createApi } = await core, asked = [];
  const table = (code) => ({ ask: async (route, body) => { asked.push(route + ':' + code); return asked.length === 1 ? { status: 409, data: { error: 'That code is in use.' } } : asked.length === 2 ? { status: 410, data: { error: 'This table has ended.', reason: 'closed' } } : { status: 200, data: { code: body.code, token: 't', scenario: body.scenario } }; } });
  const res = await createApi().handle(new Request('https://first-roll.test/api/table/open', { method: 'POST', body: JSON.stringify({ passcode: PASS }) }), { env: { DM_PASSCODE: PASS }, ip: '1', table });
  assert.equal(res.status, 200); assert.equal(asked.length, 3); assert.ok(asked.every((a) => /^create:[A-Z]{4}$/.test(a)));
  assert.equal((await res.json()).code, asked[2].slice(7));
});
test('the DM-only routes turn players away with 403', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann'), b = await w.join(dm.code, 'Bea');
  for (const [route, body] of [['send', { text: 'I am the DM now' }], ['keep', { image: PNG }], ['kick', { id: b.id }], ['close', {}]]) {
    const r = await w.post(route, Object.assign({ token: a.token }, body), at);
    assert.equal(r.status, 403, route); assert.match(r.json.error, /^Only the DM can /); assert.equal(r.json.reason, 'dm_only');
  }
  const s = (await w.post('state', { token: dm.token }, at)).json;
  assert.equal(s.players.length, 2); assert.deepEqual(s.feed, []); assert.equal(w.store(dm.code).m.size, 1);
  /* and the DM can do all four */
  const sent = await w.post('send', { token: dm.token, title: 'A map', text: 'Old and torn.', image: PNG }, at);
  assert.deepEqual(sent.json, { ok: true, n: 1, players: 2 });
  const kept = await w.post('keep', { token: dm.token, image: PNG }, at);
  assert.match(kept.json.url, new RegExp('^api/table/img\\?code=' + dm.code + '&id=[0-9a-f]{16}$'));
  const feed = (await w.post('state', { token: b.token, after: 0 }, at)).json;
  assert.equal(feed.last, 1); assert.equal(feed.feed[0].kind, 'image'); assert.equal(feed.feed[0].title, 'A map'); assert.equal(feed.feed[0].text, 'Old and torn.');
  assert.deepEqual((await w.post('state', { token: b.token, after: 1 }, at)).json.feed, []);
  assert.equal((await w.post('send', { token: dm.token }, at)).status, 400);
  assert.equal((await w.post('me', { token: dm.token, name: 'Boss' }, at)).status, 400, 'the DM has no character');
});

/* ---------------- a player's own seat ---------------- */
test('me: names are checked before anything changes', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann'), b = await w.join(dm.code, 'Bea');
  for (const name of [42, true, ['Zed'], { first: 'Zed' }]) {
    const r = await w.post('me', { token: a.token, name, char: { name: 'Should not stick' } }, at);
    assert.equal(r.status, 400, JSON.stringify(name)); assert.equal(r.json.reason, 'bad_name');
  }
  const clash = await w.post('me', { token: a.token, name: ' bea ', char: { name: 'Should not stick' }, save: 'nor this' }, at);
  assert.equal(clash.status, 409);
  assert.deepEqual(clash.json, { error: 'Bea is already at this table. Pick another name.', reason: 'name_in_use', name: 'Bea' });
  assert.equal((await w.post('me', { token: a.token, name: '   ' }, at)).status, 400);
  let s = (await w.post('state', { token: dm.token }, at)).json;
  assert.deepEqual(s.players, [{ id: a.id, name: 'Ann', char: null, portrait: '' }, { id: b.id, name: 'Bea', char: null, portrait: '' }]);
  assert.equal(w.store(dm.code).m.has('save:' + a.id), false);
  /* a free name, the same name in other letters, and no name at all are fine */
  assert.deepEqual((await w.post('me', { token: a.token, name: 'ANN' }, at)).json, { ok: true, portrait: '', name: 'ANN' });
  assert.equal((await w.post('me', { token: a.token, name: ' Annika the Bold and Very Long-Named ' }, at)).json.name, 'Annika the Bold and Very');
  assert.equal((await w.post('me', { token: a.token, name: null, char: { name: 'Brindle', race: 'Elf', cls: 'Scout', line: 'Quick', look: 'Green cloak', secret: 'dropped' } }, at)).status, 200);
  s = (await w.post('state', { token: dm.token }, at)).json;
  assert.deepEqual(s.players[0], { id: a.id, name: 'Annika the Bold and Very', char: { name: 'Brindle', race: 'Elf', cls: 'Scout', line: 'Quick', look: 'Green cloak' }, portrait: '' });
  assert.equal((await w.join(dm.code, 'Ann')).back, undefined, 'the old name is free for someone new');
});
test('me: an empty portrait only clears the stored one with clearPortrait: true', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann');
  const pic = (await w.post('me', { token: a.token, portrait: PNG }, at)).json.portrait;
  assert.match(pic, /^api\/table\/img\?code=[A-Z]{4}&id=[0-9a-f]{16}$/);
  const got = await w.request('GET', '/' + pic);
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/png'); assert.equal(Buffer.from(got.bytes).toString(), 'a small picture');
  for (const body of [{ portrait: '' }, { portrait: null }, {}, { portrait: '', clearPortrait: 'true' }, { portrait: '', clearPortrait: 1 }, { portrait: pic }, { portrait: pic, clearPortrait: true }]) {
    const r = await w.post('me', Object.assign({ token: a.token }, body), at);
    assert.equal(r.status, 200); assert.equal(r.json.portrait, pic, JSON.stringify(body));
  }
  assert.equal((await w.request('GET', '/' + pic)).status, 200, 'the picture is still there');
  assert.equal((await w.post('me', { token: a.token, portrait: 12 }, at)).status, 400);
  assert.equal((await w.post('me', { token: a.token, portrait: 'not a picture' }, at)).status, 400);
  assert.equal((await w.post('me', { token: a.token, portrait: 'data:image/png;base64,' }, at)).status, 400);
  assert.equal((await w.post('state', { token: a.token }, at)).json.players[0].portrait, pic);
  const cleared = await w.post('me', { token: a.token, portrait: '', clearPortrait: true }, at);
  assert.deepEqual(cleared.json, { ok: true, portrait: '', name: 'Ann' });
  assert.equal((await w.request('GET', '/' + pic)).status, 404, 'and now it is deleted');
  assert.equal(w.saved(dm.code).stored, 0);
  /* a built-in picture is kept by its address; a new painted one replaces and deletes the old */
  assert.equal((await w.post('me', { token: a.token, portrait: 'img/np_elf.webp' }, at)).json.portrait, 'img/np_elf.webp');
  const p1 = (await w.post('me', { token: a.token, portrait: PNG }, at)).json.portrait;
  const p2 = (await w.post('me', { token: a.token, portrait: PNG.replace('png', 'jpeg') }, at)).json.portrait;
  assert.equal((await w.request('GET', '/' + p1)).status, 404); assert.equal((await w.request('GET', '/' + p2)).headers.get('content-type'), 'image/jpeg');
  assert.equal(w.saved(dm.code).stored, 1);
  assert.equal((await w.post('me', { token: a.token, clearPortrait: true }, at)).json.portrait, '', 'clearPortrait alone is enough');
});

/* ---------------- pictures and story help ---------------- */
const b64 = Buffer.from('painted by the test').toString('base64');
test('image and text: a call that works uses up allowance and returns what OpenAI made', async () => {
  const w = await world({ openai: (url) => okJson(/images/.test(url) ? { data: [{ b64_json: b64 }] } : { choices: [{ message: { content: '{"ask":"Roll for it"}' } }] }) });
  const dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann');
  const im = await w.post('image', { token: a.token, prompt: 'a fox in a red scarf', size: '1024x1024' }, at);
  assert.equal(im.status, 200); assert.deepEqual(im.json, { image: 'data:image/webp;base64,' + b64, model: 'gpt-image-2', seconds: 0 });
  const kept = await w.post('image', { token: dm.token, prompt: 'a snowy pass', keep: true }, at);
  const pic = await w.request('GET', '/' + kept.json.url);
  assert.equal(pic.headers.get('content-type'), 'image/webp'); assert.equal(Buffer.from(pic.bytes).toString(), 'painted by the test');
  const tx = await w.post('text', { token: a.token, system: 'You help a DM.', user: 'What now?', json: true, max: 5000 }, at);
  assert.deepEqual(tx.json, { json: { ask: 'Roll for it' }, model: 'gpt-4.1-mini' });
  const t = w.saved(dm.code);
  assert.deepEqual(t.spend, { images: 2, texts: 1 }); assert.equal(t.players[0].portraits, 1); assert.equal(t.stored, 1);
  /* what was sent upstream: the right place, the site's key, a capped answer length */
  assert.deepEqual(w.calls.map((c) => c.url), ['https://api.openai.com/v1/images/generations', 'https://api.openai.com/v1/images/generations', 'https://api.openai.com/v1/chat/completions']);
  assert.equal(w.calls[0].init.headers.Authorization, 'Bearer test-key-not-real');
  assert.equal(JSON.parse(w.calls[0].init.body).size, '1024x1024'); assert.equal(JSON.parse(w.calls[2].init.body).max_tokens, 800);
});
test('image: when OpenAI fails the allowance is refunded and the player gets a plain sentence', async (t) => {
  const spy = quiet(t);
  let mode = 'refuse';
  const w = await world({ openai: () => {
    if (mode === 'refuse') { return okJson({ error: { message: 'Billing hard limit has been reached (secret upstream detail)' } }, 400); }
    if (mode === 'offline') { throw new TypeError('fetch failed: ECONNRESET (secret network detail)'); }
    if (mode === 'empty') { return okJson({ data: [] }); }
    if (mode === 'html') { return new Response('<html>Bad gateway (secret proxy detail)</html>', { status: 502 }); }
    return okJson({ data: [{ b64_json: b64 }] });
  } });
  const dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann');
  for (mode of ['refuse', 'offline', 'empty', 'html']) {
    for (const token of [a.token, dm.token]) {
      const r = await w.post('image', { token, prompt: 'a fox', keep: token === dm.token }, at);
      assert.equal(r.status, 502, mode);
      assert.deepEqual(r.json, { error: 'The picture could not be painted just now. Try again.', reason: 'upstream' });
      assert.doesNotMatch(r.text, /secret|Billing|ECONNRESET|gateway/);
    }
    const saved = w.saved(dm.code);
    assert.deepEqual(saved.spend, { images: 0, texts: 0 }, mode); assert.equal(saved.players[0].portraits, 0, mode); assert.equal(saved.stored, 0, mode);
  }
  assert.match(logged(spy), /OpenAI returned 400: Billing hard limit has been reached \(secret upstream detail\)/);
  assert.match(logged(spy), /ECONNRESET \(secret network detail\)/);
  assert.match(logged(spy), /OpenAI returned 502: <html>Bad gateway/);
  assert.doesNotMatch(logged(spy), /test-key-not-real/, 'the key is never logged');
  /* six failures did not use up the six portraits a player may paint */
  mode = 'paint';
  for (let i = 0; i < 6; i++) { assert.equal((await w.post('image', { token: a.token, prompt: 'a fox' }, at)).status, 200); }
  const full = await w.post('image', { token: a.token, prompt: 'a fox' }, at);
  assert.equal(full.status, 429); assert.equal(full.json.reason, 'limit');
  assert.deepEqual(w.saved(dm.code).spend, { images: 6, texts: 0 }); assert.equal(w.saved(dm.code).players[0].portraits, 6);
  assert.equal(w.calls.length, 14, 'a call refused for the limit never reaches OpenAI');
});
test('text: when OpenAI fails, or answers nonsense, the allowance is refunded', async (t) => {
  const spy = quiet(t);
  let mode = 'busy';
  const w = await world({ openai: () => {
    if (mode === 'busy') { return okJson({ error: { message: 'Rate limit reached for requests (secret)' } }, 429); }
    if (mode === 'offline') { throw new Error('socket hang up (secret)'); }
    return okJson({ choices: [{ message: { content: mode === 'nonsense' ? 'Sure! Here is some JSON: {' : 'The door creaks open.' } }] });
  } });
  const dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann');
  for (mode of ['busy', 'offline', 'nonsense']) {
    const r = await w.post('text', { token: a.token, system: 's', user: 'u', json: true }, at);
    assert.equal(r.status, 502, mode);
    assert.deepEqual(r.json, { error: 'The story helper is busy. Try again.', reason: 'upstream' });
    assert.deepEqual(w.saved(dm.code).spend, { images: 0, texts: 0 }, mode);
  }
  assert.match(logged(spy), /OpenAI returned 429: Rate limit reached for requests \(secret\)/);
  mode = 'fine';
  assert.deepEqual((await w.post('text', { token: dm.token, system: 's', user: 'u' }, at)).json, { text: 'The door creaks open.', model: 'gpt-4.1-mini' });
  assert.deepEqual(w.saved(dm.code).spend, { images: 0, texts: 1 });
});
test('image and text: nothing to ask, no key on the site, and limits are checked before spending', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann');
  assert.equal((await w.post('image', { token: a.token, prompt: '  ' }, at)).status, 400);
  assert.equal((await w.post('text', { token: a.token, system: 's' }, at)).status, 400);
  const t = w.tables.get(dm.code).t;
  t.spend.images = 150; t.spend.texts = 800;
  for (const [route, body] of [['image', { prompt: 'p' }], ['text', { system: 's', user: 'u' }]]) {
    const r = await w.post(route, Object.assign({ token: a.token }, body), at);
    assert.equal(r.status, 429, route); assert.equal(r.json.reason, 'limit');
  }
  assert.equal(t.players[0].portraits, 0, 'a refused picture does not count as one of the player’s portraits');
  t.spend.images = 0; t.stored = 220;
  assert.equal((await w.post('image', { token: dm.token, prompt: 'p', keep: true }, at)).status, 429, 'no room to keep it: say so before paying');
  const off = await world({ env: { OPENAI_API_KEY: '' } }), d2 = await off.open();
  const r = await off.post('image', { token: d2.token, prompt: 'p' }, { c: d2.code });
  assert.equal(r.status, 503); assert.equal(r.json.reason, 'off');
  assert.equal(w.calls.length + off.calls.length, 0);
});
test('a table closed while a picture is being painted answers 410, not a crash', async (t) => {
  quiet(t);
  let w, dm; const closeNow = async () => { await w.post('close', { token: dm.token }, { c: dm.code }); return okJson({ data: [{ b64_json: b64 }] }); };
  w = await world({ openai: closeNow }); dm = await w.open(); const a = await w.join(dm.code, 'Ann');
  const r = await w.post('image', { token: a.token, prompt: 'p', keep: true }, { c: dm.code });
  assert.equal(r.status, 410); assert.deepEqual([...w.store(dm.code).m.keys()], ['closed']);
});

/* ---------------- sturdiness ---------------- */
test('a body that is not a JSON object gets a plain 400', async () => {
  const w = await world(), dm = await w.open();
  for (const raw of ['[]', '[{"token":"x"}]', 'null', '"text"', '7', 'true', '{not json', '{"a":']) {
    for (const [route, c] of [['state', dm.code], ['join', dm.code], ['open', ''], ['image', dm.code]]) {
      const r = await w.post(route, null, { c, raw, ip: 'body-' + raw + route });
      assert.equal(r.status, 400, route + ' ' + raw);
      assert.deepEqual(r.json, { error: 'That did not come through properly. Try again.', reason: 'bad_request' });
    }
  }
  assert.equal((await w.post('state', null, { c: dm.code, raw: '' })).status, 404, 'an empty body is an empty object: no token');
  const big = await w.post('open', null, { raw: JSON.stringify({ passcode: 'x'.repeat(3000) }) });
  assert.equal(big.status, 413); assert.equal(big.json.reason, 'too_large');
  /* sent in pieces with no length given, it is cut off as soon as it is too long */
  let pieces = 0;
  const endless = new ReadableStream({ pull(c) { pieces++; c.enqueue(new TextEncoder().encode('x'.repeat(1000))); } });
  const cut = await w.post('open', null, { raw: endless });
  assert.equal(cut.status, 413); assert.ok(pieces < 10, 'stopped reading after ' + pieces + ' pieces');
  /* and one that arrives in pieces, split in the middle of a letter, is read whole */
  const bytes = new TextEncoder().encode(JSON.stringify({ name: 'Zoë' })), cutAt = bytes.indexOf(0xc3) + 1;
  const split = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, cutAt)); c.enqueue(bytes.slice(cutAt)); c.close(); } });
  assert.equal((await w.post('join', null, { c: dm.code, raw: split })).json.name, 'Zoë');
});
test('other addresses and methods', async () => {
  const w = await world(), dm = await w.open();
  const h = await w.request('GET', '/api/health');
  assert.deepEqual(h.json, { ok: true, live: true, tables: true, passcode: true, open: false });
  assert.equal(h.headers.get('cache-control'), 'no-store');
  const none = await world({ env: { OPENAI_API_KEY: '', DM_PASSCODE: '' } });
  assert.deepEqual((await none.request('GET', '/api/health')).json, { ok: true, live: false, tables: false, passcode: true, open: false });
  for (const path of ['/api/table/dm', '/api/table/create', '/api/table/load', '/api/table/constructor', '/api/table/', '/api/nothing', '/api/table/state/extra']) {
    const r = await w.request('POST', path + '?c=' + dm.code, { token: dm.token });
    assert.equal(r.status, 404, path); assert.equal(r.json.reason, 'unknown_route');
  }
  const get = await w.request('GET', '/api/table/state?c=' + dm.code);
  assert.equal(get.status, 405); assert.equal(get.json.reason, 'post_only');
  for (const q of ['code=' + dm.code + '&id=0123456789abcdef', 'code=' + dm.code, 'code=ZZZZ&id=0123456789abcdef', 'code=bad', '']) {
    const r = await w.request('GET', '/api/table/img?' + q);
    assert.equal(r.status, 404, q); assert.equal(r.text, 'Not found');
  }
});
test('something unexpected is a plain 500, with the real cause only in the log', async (t) => {
  const spy = quiet(t);
  const w = await world({ store: () => { const s = memory(), put = s.put; s.put = async (k, v) => { if (s.broken) { throw new Error('disk on fire (secret detail)'); } return put(k, v); }; return s; } });
  const dm = await w.open(), at = { c: dm.code };
  w.store(dm.code).broken = true;
  for (const [route, body] of [['join', { name: 'Ann' }], ['send', { token: dm.token, text: 'x' }], ['roll', { token: dm.token, total: 3 }]]) {
    const r = await w.post(route, body, at);
    assert.equal(r.status, 500, route); assert.equal(r.text, '{"error":"Something went wrong. Try again."}');
  }
  assert.equal(spy.mock.callCount(), 3); assert.match(logged(spy), /disk on fire \(secret detail\)/);
  /* the same when the table itself cannot be reached */
  const { createApi } = await core;
  const res = await createApi().handle(new Request('https://first-roll.test/api/table/state?c=ABCD', { method: 'POST', body: '{}' }), { env: {}, ip: '1', table: () => { throw new Error('object unreachable (secret detail)'); } });
  assert.equal(res.status, 500); assert.equal(await res.text(), '{"error":"Something went wrong. Try again."}');
  assert.match(logged(spy), /object unreachable/);
});
test('a stored picture is capped at 1,900,000 bytes with a clean 413', async () => {
  const w = await world({ openai: () => okJson({ data: [{ b64_json: Buffer.alloc(1900001, 7).toString('base64') }] }) });
  const dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann');
  const url = (n) => 'data:image/jpeg;base64,' + Buffer.alloc(n, 1).toString('base64');
  for (const [route, body] of [['keep', { token: dm.token, image: url(1900001) }], ['send', { token: dm.token, image: url(1900001) }], ['me', { token: a.token, portrait: url(1900001) }], ['image', { token: dm.token, prompt: 'p', keep: true }]]) {
    const r = await w.post(route, body, at);
    assert.equal(r.status, 413, route); assert.deepEqual(r.json, { error: 'That picture is too large. Try a smaller one.', reason: 'too_large' });
  }
  assert.deepEqual([...w.store(dm.code).m.keys()], ['t']); assert.equal(w.saved(dm.code).stored, 0);
  assert.deepEqual(w.saved(dm.code).spend, { images: 0, texts: 0 }, 'the picture that could not be kept was refunded');
  const ok = await w.post('keep', { token: dm.token, image: url(1900000) }, at);
  assert.equal(ok.status, 200); assert.equal((await w.request('GET', '/' + ok.json.url)).bytes.length, 1900000);
  const huge = await w.post('keep', { token: dm.token, image: 'data:image/png;base64,' + 'A'.repeat(4500000) }, at);
  assert.equal(huge.status, 413, 'and a request over 4.5 MB is turned away before it is read as a picture');
});
test('thirty idle days: the alarm clears the table away and its code is unknown again', async () => {
  const w = await world(), dm = await w.open(), at = { c: dm.code }, a = await w.join(dm.code, 'Ann');
  const DAYS30 = 30 * 24 * 3600 * 1000;
  w.tick(5000); await w.post('state', { token: a.token }, at);
  assert.equal(w.store(dm.code).alarm, w.now() - 5000 + DAYS30, 'looking at the table does not write to storage');
  await w.post('roll', { token: a.token, total: 9 }, at);
  assert.equal(w.store(dm.code).alarm, w.now() + DAYS30, 'playing at it keeps it open');
  await w.tables.get(dm.code).alarm();
  assert.equal(w.store(dm.code).m.size, 0);
  assert.equal((await w.post('state', { token: a.token }, at)).text, NO_TABLE);
  assert.equal((await w.post('join', { name: 'Ann' }, at)).status, 404);
});

test('an honest miss at the right table (name in use, no name, table full) is not counted as guessing', async () => {
  const w = await world(), dm = await w.open(), ip = '203.0.113.44';
  const ann = await w.join(dm.code, 'Ann'); await w.post('state', { token: ann.token }, { c: dm.code, ip });
  for (let i = 0; i < 30; i++) {
    const r = await w.post('join', i % 2 ? { name: 'ann' } : {}, { c: dm.code, ip });
    assert.ok(r.status === 409 || r.status === 400, 'try ' + (i + 1) + ' got ' + r.status);
  }
  assert.equal((await w.post('state', { token: ann.token }, { c: dm.code, ip })).status, 200);
});

test('roll: a natural 20 or 1 is believed only when a twenty-sided die shows it', async () => {
  const w = await world(), dm = await w.open(), a = await w.join(dm.code, 'Ann'), at = { c: dm.code };
  const cases = [[20, [{ sides: 20, value: 20 }], 20], [1, [{ sides: 20, value: 1 }, { sides: 20, value: 12 }], 1], [20, [{ sides: 20, value: 19 }], 0], [20, [{ sides: 6, value: 6 }], 0], [1, [], 0], [20, undefined, 0]];
  for (const [nat, dice] of cases) { await w.post('roll', { token: a.token, total: 5, nat, dice }, at); w.tick(1000); }
  assert.deepEqual((await w.post('state', { token: dm.token }, at)).json.rolls.map((r) => r.nat), cases.map((c) => c[2]));
});
test('send: a kept picture must be this table\'s own and still there', async () => {
  const w = await world(), dm = await w.open(), other = await w.open(), at = { c: dm.code };
  const kept = (await w.post('keep', { token: dm.token, image: PNG }, at)).json.url;
  assert.equal((await w.post('send', { token: dm.token, image: kept }, at)).status, 200);
  const foreign = 'api/table/img?code=' + other.code + '&id=0123456789abcdef', missing = 'api/table/img?code=' + dm.code + '&id=0123456789abcdef';
  for (const image of [foreign, missing]) {
    const r = await w.post('send', { token: dm.token, image }, at);
    assert.equal(r.status, 409, image); assert.equal(r.json.reason, 'no_picture');
  }
});
