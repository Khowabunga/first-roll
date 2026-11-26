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

/* ================= Phase 1: the guided loop (docs/PHASE1.md, section 1) ================= */
/* A table with its DM and a seat for each name, and short ways to call it: call() gives the whole
   answer, ok() insists on a 200 and gives the data, see() is that seat's `state`. */
async function party(names = ['Ann', 'Bea'], opt) {
  const w = await world(opt), dm = await w.open(), at = { c: dm.code }, seats = [];
  for (const name of names) { seats.push(await w.join(dm.code, name)); }
  const call = (who, route, body) => w.post(route, Object.assign({ token: who.token }, body), at);
  const ok = async (who, route, body) => { const r = await call(who, route, body); assert.equal(r.status, 200, route + ': ' + r.text); return r.json; };
  const see = (who, extra) => ok(who, 'state', extra);
  return { w, dm, at, seats, call, ok, see };
}
const ROLL_KEYS = ['at', 'detail', 'dice', 'id', 'kind', 'label', 'n', 'name', 'nat', 'role', 'total'];
const NEW_ROUTES = { scene: { scene: { title: 'x' } }, unsend: { n: 1 }, propose: { kind: 'intent', text: 'x' }, answer: { n: 1, verdict: 'yes' }, request: { to: 'all', label: 'x' }, judge: { n: 1, id: 'x', pass: true }, cancel: { n: 1 }, leave: {} };
const DM_ROUTES = ['scene', 'unsend', 'answer', 'request', 'judge', 'cancel'];

/* ---------------- what a player must never be sent ---------------- */
test('privacy: a player never receives a request\'s target, yes or no, and a seat that was not asked receives none of it', async () => {
  const { w, dm, at, seats: [ann, bea], call, ok, see } = await party();
  const ask = { to: [ann.id], label: 'Pick the vault lock', why: 'The guard is nearly back.', skill: 'Sleight', target: 15, yes: 'The lock clicks open: SECRET-YES.', no: 'The pick snaps: SECRET-NO.' };
  assert.deepEqual(await ok(dm, 'request', ask), { n: 1 });
  const HIDDEN = /SECRET|"target"|"yes"|"no"|"results"|"to"/;
  for (const extra of [{}, { after: 0, afterRoll: 0, afterScene: 0 }, { after: -5, afterRoll: 'x', afterScene: null }]) {
    const a = await call(ann, 'state', extra), b = await call(bea, 'state', extra);
    assert.doesNotMatch(a.text, HIDDEN);
    assert.deepEqual(a.json.requests, [{ n: 1, label: 'Pick the vault lock', why: 'The guard is nearly back.', skill: 'Sleight', at: w.now(), closed: false }]);
    assert.deepEqual(b.json.requests, []); assert.doesNotMatch(b.text, /SECRET|vault|guard|Sleight|"target"/);
  }
  /* the DM, and only the DM, has all of it */
  assert.deepEqual((await see(dm)).requests, [Object.assign({ n: 1 }, ask, { at: w.now(), closed: false, results: {} })]);
  /* Ann rolls and passes: she is told the yes line, and still nothing of the target or the other line */
  assert.deepEqual(await ok(ann, 'roll', { total: 17, request: 1, kind: 'check', label: 'A steady hand', dice: [{ sides: 20, value: 14 }] }), { n: 1, pass: true, say: ask.yes });
  const a = await call(ann, 'state', {}), b = await call(bea, 'state', {});
  assert.deepEqual(a.json.requests[0].mine, { total: 17, nat: 0, pass: true, say: ask.yes });
  assert.doesNotMatch(a.text, /SECRET-NO|"target"|"yes"|"no"|"results"/);
  /* Bea sees the dice, as everyone at a table does, and nothing about what they were for */
  assert.deepEqual(b.json.requests, []); assert.doesNotMatch(b.text, /SECRET|vault|"pass"|"say"|"target"|"request"/);
  assert.deepEqual(Object.keys(b.json.rolls[0]).sort(), ROLL_KEYS);
  /* a roll for everyone: each seat hears its own line only, and never another seat's result */
  const both = { to: 'all', label: 'Cross the ice', target: 10, yes: 'You glide across: SECRET-GLIDE.', no: 'You go through the ice: SECRET-SPLASH.' };
  assert.deepEqual(await ok(dm, 'request', both), { n: 2 });
  w.tick(1000);
  assert.deepEqual(await ok(ann, 'roll', { total: 12, request: 2 }), { n: 2, pass: true, say: both.yes });
  assert.deepEqual(await ok(bea, 'roll', { total: 5, request: 2 }), { n: 3, pass: false, say: both.no });
  w.sleep();                                     // and it is no different once the table has been asleep
  const a2 = await call(ann, 'state', {}), b2 = await call(bea, 'state', {});
  assert.doesNotMatch(a2.text, /SECRET-NO|SECRET-SPLASH|"target"|"results"/); assert.doesNotMatch(b2.text, /SECRET-YES|SECRET-NO|SECRET-GLIDE|vault|"target"|"results"/);
  assert.deepEqual(b2.json.requests, [{ n: 2, label: 'Cross the ice', why: '', skill: '', at: w.now() - 1000, closed: false, mine: { total: 5, nat: 0, pass: false, say: both.no } }]);
  assert.deepEqual(a2.json.requests.map((q) => q.mine.say), [ask.yes, both.yes]);
  assert.deepEqual((await see(dm)).requests[1].results, { [ann.id]: { total: 12, nat: 0, pass: true, at: w.now() }, [bea.id]: { total: 5, nat: 0, pass: false, at: w.now() } });
});
test('privacy: a private feed item reaches its own seat and the DM, and no other seat, whatever is asked for', async () => {
  const { w, dm, at, seats: [ann, bea], call, ok, see } = await party();
  assert.deepEqual(await ok(dm, 'send', { text: 'Snow begins to fall.' }), { ok: true, n: 1, players: 2 });
  assert.deepEqual(await ok(dm, 'send', { to: ann.id, title: 'A whisper', text: 'SECRET-NOTE: the key is under the mat.', image: PNG }), { ok: true, n: 2, players: 1 });
  assert.deepEqual(await ok(dm, 'send', { text: 'The bells ring.' }), { ok: true, n: 3, players: 2 });
  for (const extra of [{}, { after: 0 }, { after: 1 }, { after: -1 }, { after: 'x' }, { after: 1.5 }]) {
    const b = await call(bea, 'state', extra);
    assert.doesNotMatch(b.text, /SECRET-NOTE|whisper|under the mat/, JSON.stringify(extra));
    assert.ok(b.json.feed.every((f) => f.to === '' && f.n !== 2));
    assert.equal(b.json.last, 3);
  }
  assert.deepEqual((await see(bea)).feed.map((f) => f.n), [1, 3]);
  const mine = (await see(ann)).feed;
  assert.deepEqual(mine.map((f) => [f.n, f.to]), [[1, ''], [2, ann.id], [3, '']]);
  assert.equal(mine[1].text, 'SECRET-NOTE: the key is under the mat.'); assert.equal(mine[1].kind, 'image');
  assert.deepEqual((await see(dm)).feed.map((f) => [f.n, f.to]), [[1, ''], [2, ann.id], [3, '']], 'the DM sees every item, each with who it was for');
  /* someone who sits down later, and the table after a sleep, are no different */
  const cal = await w.join(dm.code, 'Cal');
  w.sleep();
  assert.doesNotMatch((await call(cal, 'state', {})).text, /SECRET-NOTE|whisper/);
  assert.doesNotMatch((await call(bea, 'state', {})).text, /SECRET-NOTE|whisper/);
  assert.equal((await see(ann)).feed.length, 3);
});
test('privacy: a player sees their own proposals and the DM\'s answers to them, never another seat\'s', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  assert.deepEqual(await ok(ann, 'propose', { kind: 'intent', text: 'SECRET-PLAN: I slip the letter into my boot.' }), { n: 1 });
  assert.deepEqual(await ok(bea, 'propose', { kind: 'card', card: 'listen', text: 'Listen at the door' }), { n: 2 });
  const b = await call(bea, 'state', {});
  assert.doesNotMatch(b.text, /SECRET-PLAN|boot/);
  assert.deepEqual(b.json.asks, [{ n: 2, id: bea.id, name: 'Bea', kind: 'card', card: 'listen', text: 'Listen at the door', at: w.now(), verdict: '', note: '' }]);
  assert.deepEqual((await see(ann)).asks.map((a) => a.n), [1]);
  assert.deepEqual((await see(dm)).asks.map((a) => [a.n, a.name]), [[1, 'Ann'], [2, 'Bea']]);
  assert.deepEqual(await ok(dm, 'answer', { n: 1, verdict: 'no', note: 'SECRET-ANSWER: the letter is watched.' }), { ok: true });
  w.sleep();
  assert.doesNotMatch((await call(bea, 'state', {})).text, /SECRET-PLAN|SECRET-ANSWER|boot/);
  const a = (await see(ann)).asks;
  assert.deepEqual([a[0].verdict, a[0].note], ['no', 'SECRET-ANSWER: the letter is watched.']);
});

/* ---------------- the scene ---------------- */
test('scene: the DM publishes one tidy, numbered copy, and everyone gets it once through state', async () => {
  const { w, dm, seats: [ann], call, ok, see } = await party(['Ann']);
  const before = await see(ann);
  assert.equal(before.sceneN, 0); assert.equal('scene' in before, false);
  const kept = (await ok(dm, 'keep', { image: PNG })).url;
  const sent = { id: 'vault', chapter: 'Chapter 2', title: 'T'.repeat(100), summary: 'S'.repeat(500), img: 'packs/northpole/img/dm_hq.webp', secret: 'dropped', n: 77,
    cards: [{ id: 'pick', label: 'Pick the lock', hint: 'Quiet hands.', check: { skill: 'Sleight', target: 15 } }, { id: 'no-label' }, 'junk', null, 7].concat(Array(10).fill({ id: 'c', label: 'L'.repeat(70), hint: 'H'.repeat(130) })),
    quests: [{ id: 'q1', text: 'Find the list', done: true }, { id: 'q2', text: 'Q'.repeat(170), done: 'yes' }, { id: 'no-text' }].concat(Array(14).fill({ text: 'More' })),
    clues: Array(22).fill({ id: 'k'.repeat(50), text: 'K'.repeat(210), spoiler: 'dropped' }),
    people: [{ id: 'dot', name: 'Dot', line: 'Runs the bakery.', img: kept, secret: 'dropped' }, { id: 'x', name: 'X', img: 'https://elsewhere.example/x.png' }, { id: 'y', name: 'Y', img: 'api/table/img?code=ZZZZ&id=0123456789abcdef' }, { id: 'z', name: 'Z', img: 'img/../../secret' }, { line: 'nameless' }].concat(Array(40).fill({ name: 'N'.repeat(70), line: 'L'.repeat(170) })),
    story: Array.from({ length: 35 }, (_, i) => 'Line ' + i).concat(['', null, { a: 1 }, 'S'.repeat(250)]) };
  assert.ok(Buffer.byteLength(JSON.stringify(sent)) < 24576, 'the test scene itself is under the limit');
  assert.deepEqual(await ok(dm, 'scene', { scene: sent }), { n: 1 });
  const got = await see(ann), s = got.scene;
  assert.equal(got.sceneN, 1);
  assert.deepEqual(Object.keys(s), ['n', 'id', 'chapter', 'title', 'summary', 'img', 'cards', 'quests', 'clues', 'people', 'story'], 'unknown keys are dropped');
  assert.deepEqual([s.n, s.id, s.chapter, s.title, s.summary, s.img], [1, 'vault', 'Chapter 2', 'T'.repeat(80), 'S'.repeat(400), 'packs/northpole/img/dm_hq.webp']);
  assert.equal(s.cards.length, 8); assert.deepEqual(s.cards[0], { id: 'pick', label: 'Pick the lock', hint: 'Quiet hands.' }); assert.deepEqual(s.cards[1], { id: 'c', label: 'L'.repeat(60), hint: 'H'.repeat(120) });
  assert.equal(s.quests.length, 12); assert.deepEqual(s.quests.slice(0, 3), [{ id: 'q1', text: 'Find the list', done: true }, { id: 'q2', text: 'Q'.repeat(160), done: false }, { id: '', text: 'More', done: false }]);
  assert.equal(s.clues.length, 20); assert.deepEqual(s.clues[0], { id: 'k'.repeat(40), text: 'K'.repeat(200) });
  assert.equal(s.people.length, 40);
  assert.deepEqual(s.people.slice(0, 5), [{ id: 'dot', name: 'Dot', line: 'Runs the bakery.', img: kept }, { id: 'x', name: 'X', line: '', img: '' }, { id: 'y', name: 'Y', line: '', img: '' }, { id: 'z', name: 'Z', line: '', img: '' }, { id: '', name: 'N'.repeat(60), line: 'L'.repeat(160), img: '' }]);
  assert.equal(s.story.length, 30); assert.equal(s.story[0], 'Line 6', 'the newest thirty story lines are the ones kept'); assert.equal(s.story[29], 'S'.repeat(240));
  /* the DM gets the same copy; a phone that already has it is not sent it again */
  assert.deepEqual((await see(dm)).scene, s);
  for (const who of [ann, dm]) { const again = await see(who, { afterScene: 1 }); assert.equal(again.sceneN, 1); assert.equal('scene' in again, false); }
  /* publishing the very same scene again changes nothing; a different one gets the next number */
  assert.deepEqual(await ok(dm, 'scene', { scene: sent }), { n: 1 });
  assert.deepEqual(await ok(dm, 'scene', { scene: { title: 'The roof', quests: [{ id: 'q1', text: 'Find the list', done: true }] } }), { n: 2 });
  w.sleep();
  assert.deepEqual((await see(ann, { afterScene: 1 })).scene, { n: 2, id: '', chapter: '', title: 'The roof', summary: '', img: '', cards: [], quests: [{ id: 'q1', text: 'Find the list', done: true }], clues: [], people: [], story: [] });
  assert.equal((await see(ann, { afterScene: 2 })).sceneN, 2);
  /* what is refused: more than 24 KB of JSON, and anything that is not a scene at all */
  const sized = (k) => ({ junk: 'x'.repeat(k) });           // {"junk":"..."} is k + 11 bytes
  assert.equal((await call(dm, 'scene', { scene: sized(24565) })).status, 200, 'exactly 24 KB is taken');
  for (const scene of [sized(24566), { summary: 'é'.repeat(13000) }, { story: Array(5000).fill('a long tale') }]) {
    const r = await call(dm, 'scene', { scene });
    assert.equal(r.status, 413); assert.deepEqual(r.json, { error: 'That is too much to send at once.', reason: 'too_large' });
  }
  for (const scene of [undefined, null, 'vault', 7, ['a'], true]) {
    const r = await call(dm, 'scene', { scene });
    assert.equal(r.status, 400, String(scene)); assert.equal(r.json.reason, 'bad_scene');
  }
  assert.equal((await see(dm)).sceneN, 3, 'refused scenes changed nothing');
  assert.ok(Buffer.byteLength(JSON.stringify(w.saved(dm.code).scene)) < 26000);
});

/* ---------------- the feed: private items, offered heroes, unsend ---------------- */
test('send: `to` picks one seat, `hero` offers a ready-made hero; with neither it is for everyone, as before', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  assert.deepEqual(await ok(dm, 'send', { title: 'A map', text: 'Old and torn.' }), { ok: true, n: 1, players: 2 });
  assert.deepEqual(await ok(dm, 'send', { to: bea.id, hero: 'Brindle the Scout' }), { ok: true, n: 2, players: 1 });
  assert.deepEqual(await ok(dm, 'send', { hero: 'H'.repeat(70), title: 'Take a hero', image: 'img/np_elf.webp' }), { ok: true, n: 3, players: 2 });
  for (const to of ['all', '', null]) { assert.equal((await ok(dm, 'send', { to, text: 'For all.' })).players, 2, String(to)); }
  const feed = (await see(dm)).feed;
  assert.deepEqual(feed[0], { n: 1, at: w.now(), kind: 'note', title: 'A map', text: 'Old and torn.', img: '', to: '', hero: '' });
  assert.deepEqual(feed[1], { n: 2, at: w.now(), kind: 'hero', title: '', text: '', img: '', to: bea.id, hero: 'Brindle the Scout' });
  assert.deepEqual(feed[2], { n: 3, at: w.now(), kind: 'hero', title: 'Take a hero', text: '', img: 'img/np_elf.webp', to: '', hero: 'H'.repeat(60) });
  assert.deepEqual(feed.slice(3).map((f) => f.to), ['', '', '']);
  assert.deepEqual((await see(ann)).feed.map((f) => f.n), [1, 3, 4, 5, 6]);
  assert.deepEqual((await see(bea)).feed.map((f) => f.n), [1, 2, 3, 4, 5, 6]);
  /* a seat that is not there is refused before anything is stored */
  for (const to of ['nobody00', 'dm', 7, [ann.id], { id: ann.id }]) {
    const r = await call(dm, 'send', { to, text: 'Psst.', image: PNG });
    assert.equal(r.status, 409, JSON.stringify(to)); assert.deepEqual(r.json, { error: 'That player is no longer at this table.', reason: 'no_seat' });
  }
  assert.equal((await call(dm, 'send', { hero: '   ' })).json.reason, 'empty');
  assert.deepEqual([...w.store(dm.code).m.keys()], ['t']); assert.equal((await see(dm)).last, 6);
});
test('unsend: the item goes, with its stored picture when nothing else uses it, and phones are told which numbers to drop', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  const face = (await ok(ann, 'me', { portrait: PNG })).portrait, kept = (await ok(dm, 'keep', { image: PNG })).url;
  await ok(dm, 'send', { text: 'One' });                                        // 1
  await ok(dm, 'send', { title: 'Painted', image: PNG });                        // 2: a picture of its own
  await ok(dm, 'send', { title: 'Kept', image: kept });                          // 3 and 4 share a picture
  await ok(dm, 'send', { title: 'Kept again', image: kept, to: bea.id });
  await ok(dm, 'send', { title: 'Meet Ann', image: face });                      // 5: a player's portrait
  await ok(dm, 'send', { title: 'Shipped', image: 'img/np_elf.webp' });          // 6
  const own = (await see(dm)).feed[1].img, shown = async (url) => (await w.request('GET', '/' + url)).status;
  assert.equal(w.saved(dm.code).stored, 3);
  assert.deepEqual((await see(ann)).pulled, []);
  assert.deepEqual(await ok(dm, 'unsend', { n: 2 }), { removed: true });
  assert.equal(await shown(own), 404, 'its picture is deleted'); assert.equal(w.saved(dm.code).stored, 2);
  assert.deepEqual(await ok(dm, 'unsend', { n: 3 }), { removed: true });
  assert.equal(await shown(kept), 200, 'another item still shows that picture');
  assert.deepEqual(await ok(dm, 'unsend', { n: 4 }), { removed: true });
  assert.equal(await shown(kept), 404, 'and now nothing does');
  assert.deepEqual(await ok(dm, 'unsend', { n: 5 }), { removed: true });
  assert.equal(await shown(face), 200, 'a portrait still worn by its player is not deleted');
  assert.deepEqual(await ok(dm, 'unsend', { n: 6 }), { removed: true });
  assert.equal(w.saved(dm.code).stored, 1);
  for (const who of [ann, bea, dm]) {
    const s = await see(who);
    assert.deepEqual(s.feed.map((f) => f.n), [1]); assert.deepEqual(s.pulled, [2, 3, 4, 5, 6]); assert.equal(s.last, 6);
  }
  /* something that is not there (or was already taken back) changes nothing and says so */
  for (const n of [2, 99, '1', null, undefined, 1.5]) { assert.deepEqual(await ok(dm, 'unsend', { n }), { removed: false }, String(n)); }
  assert.deepEqual((await see(dm)).pulled, [2, 3, 4, 5, 6]);
  /* only the last thirty numbers are remembered */
  for (let i = 7; i <= 40; i++) { await ok(dm, 'send', { text: 'Note ' + i }); await ok(dm, 'unsend', { n: i }); }
  w.sleep();
  const p = (await see(ann)).pulled;
  assert.equal(p.length, 30); assert.deepEqual([p[0], p[29]], [11, 40]);
  assert.equal(w.saved(dm.code).pulled.length, 30);
});

/* ---------------- proposals ---------------- */
test('propose and answer: a player suggests, the DM says yes, no or roll for it', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  assert.deepEqual(await ok(ann, 'propose', { kind: 'card', card: 'c'.repeat(50), text: 'T'.repeat(250), extra: 'dropped' }), { n: 1 });
  assert.deepEqual(await ok(ann, 'propose', { kind: 'intent', text: '  I climb the tree.  ' }), { n: 2 });
  assert.deepEqual(await ok(bea, 'propose', { kind: 'shout', card: 'listen', text: 'Anything else counts as an intent' }), { n: 3 });
  assert.deepEqual((await see(dm)).asks, [
    { n: 1, id: ann.id, name: 'Ann', kind: 'card', card: 'c'.repeat(40), text: 'T'.repeat(200), at: w.now(), verdict: '', note: '' },
    { n: 2, id: ann.id, name: 'Ann', kind: 'intent', card: '', text: 'I climb the tree.', at: w.now(), verdict: '', note: '' },
    { n: 3, id: bea.id, name: 'Bea', kind: 'intent', card: 'listen', text: 'Anything else counts as an intent', at: w.now(), verdict: '', note: '' }]);
  /* nothing to suggest, and the DM suggesting to themselves */
  for (const body of [{}, { kind: 'card', text: 'A card needs its id' }, { kind: 'intent', card: 'pick' }, { kind: 'intent', text: '   ' }, { text: { a: 1 } }]) {
    const r = await call(bea, 'propose', body);
    assert.equal(r.status, 400, JSON.stringify(body)); assert.equal(r.json.reason, 'empty');
  }
  const self = await call(dm, 'propose', { kind: 'intent', text: 'I am a player now' });
  assert.equal(self.status, 403); assert.equal(self.json.reason, 'player_only');
  /* answers: only yes, roll or no; only once; only for something that is there */
  for (const verdict of [undefined, '', 'maybe', 'YES', true, 1, ['yes']]) {
    const r = await call(dm, 'answer', { n: 1, verdict });
    assert.equal(r.status, 400, String(verdict)); assert.equal(r.json.reason, 'bad_verdict');
  }
  for (const n of [99, '1', null, undefined]) {
    const r = await call(dm, 'answer', { n, verdict: 'yes' });
    assert.equal(r.status, 409, String(n)); assert.deepEqual(r.json, { error: 'That suggestion is no longer on the table.', reason: 'no_ask' });
  }
  assert.deepEqual(await ok(dm, 'answer', { n: 1, verdict: 'roll', note: 'N'.repeat(250) }), { ok: true });
  assert.deepEqual(await ok(dm, 'answer', { n: 3, verdict: 'yes' }), { ok: true });
  const twice = await call(dm, 'answer', { n: 1, verdict: 'no' });
  assert.equal(twice.status, 409); assert.equal(twice.json.reason, 'answered');
  w.sleep();
  const mine = (await see(ann)).asks;
  assert.deepEqual(mine.map((a) => [a.n, a.verdict, a.note]), [[1, 'roll', 'N'.repeat(200)], [2, '', '']]);
  assert.deepEqual((await see(bea)).asks.map((a) => [a.n, a.verdict, a.note]), [[3, 'yes', '']]);
});
test('propose: three unanswered a seat, the table keeps thirty, and state carries the right few', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  for (let i = 1; i <= 3; i++) { assert.deepEqual(await ok(ann, 'propose', { kind: 'intent', text: 'Idea ' + i }), { n: i }); }
  const fourth = await call(ann, 'propose', { kind: 'intent', text: 'Idea 4' });
  assert.equal(fourth.status, 429); assert.equal(fourth.json.reason, 'slow'); assert.equal(typeof fourth.json.error, 'string');
  assert.deepEqual(await ok(bea, 'propose', { kind: 'intent', text: 'Another seat is not held up' }), { n: 4 });
  await ok(dm, 'answer', { n: 2, verdict: 'yes' });
  assert.deepEqual(await ok(ann, 'propose', { kind: 'intent', text: 'Idea 4' }), { n: 5 }, 'an answer makes room for the next idea');
  assert.equal((await call(ann, 'propose', { kind: 'intent', text: 'Idea 5' })).status, 429);
  assert.equal((await see(dm)).asks.length, 5);
  /* a busy evening: forty more ideas from Ann, each answered as it comes; Bea's first is still waiting */
  for (const n of [1, 3, 5]) { await ok(dm, 'answer', { n, verdict: 'no' }); }
  for (let i = 6; i <= 45; i++) { assert.deepEqual(await ok(ann, 'propose', { kind: 'intent', text: 'Idea ' + i }), { n: i }); await ok(dm, 'answer', { n: i, verdict: i % 2 ? 'yes' : 'roll' }); }
  const saved = w.saved(dm.code).asks;
  assert.equal(saved.length, 30); assert.equal(saved[0].n, 4, 'one that is still waiting is never the one dropped'); assert.equal(saved[29].n, 45);
  /* the DM: everything unanswered and the last ten answered. A player: their own last five. */
  assert.deepEqual((await see(dm)).asks.map((a) => a.n), [4, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45]);
  assert.deepEqual((await see(ann)).asks.map((a) => a.n), [41, 42, 43, 44, 45]);
  assert.deepEqual((await see(bea)).asks.map((a) => a.n), [4]);
});

/* ---------------- roll requests ---------------- */
test('request: who is asked, what is kept, and what is refused', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  assert.deepEqual(await ok(dm, 'request', { to: 'all', label: 'L'.repeat(70), why: 'W'.repeat(170), skill: 'S'.repeat(40), target: 40, yes: 'Y'.repeat(310), no: 'N'.repeat(310), extra: 'dropped' }), { n: 1 });
  assert.deepEqual(await ok(dm, 'request', { label: 'Left out means everyone' }), { n: 2 });
  assert.deepEqual(await ok(dm, 'request', { to: [bea.id, 'nobody00', bea.id, 7, null], label: 'Only seats that are here', target: 1 }), { n: 3 });
  assert.deepEqual(await ok(dm, 'request', { to: ann.id, label: 'One id alone', target: null }), { n: 4 });
  const q = (await see(dm)).requests;
  assert.deepEqual(q[0], { n: 1, to: [ann.id, bea.id], label: 'L'.repeat(60), why: 'W'.repeat(160), skill: 'S'.repeat(30), target: 40, yes: 'Y'.repeat(300), no: 'N'.repeat(300), at: w.now(), closed: false, results: {} });
  assert.deepEqual(q[1], { n: 2, to: [ann.id, bea.id], label: 'Left out means everyone', why: '', skill: '', target: null, yes: '', no: '', at: w.now(), closed: false, results: {} });
  assert.deepEqual([q[2].to, q[2].target, q[3].to, q[3].target], [[bea.id], 1, [ann.id], null]);
  assert.deepEqual((await see(ann)).requests.map((x) => x.n), [1, 2, 4]); assert.deepEqual((await see(bea)).requests.map((x) => x.n), [1, 2, 3]);
  for (const target of [0, 41, -3, 1.5, '15', '', true, [15], {}]) {
    const r = await call(dm, 'request', { to: 'all', label: 'x', target });
    assert.equal(r.status, 400, String(target)); assert.deepEqual(r.json, { error: 'A target is a whole number from 1 to 40.', reason: 'bad_target' });
  }
  for (const label of [undefined, '', '   ', { a: 1 }]) { assert.equal((await call(dm, 'request', { to: 'all', label })).json.reason, 'empty', String(label)); }
  for (const to of [[], ['nobody00'], 'nobody00', 7, { id: ann.id }]) {
    const r = await call(dm, 'request', { to, label: 'x' });
    assert.equal(r.status, 409, JSON.stringify(to)); assert.equal(r.json.reason, 'no_seat');
  }
  assert.equal((await see(dm)).requests.length, 4, 'refused requests left nothing behind');
  const empty = await party([]), none = await empty.call(empty.dm, 'request', { to: 'all', label: 'Anyone?' });
  assert.equal(none.status, 409); assert.deepEqual(none.json, { error: 'There is nobody at the table to ask yet.', reason: 'no_seat' });
});
test('roll for a request: at or over the target passes, a natural 20 always passes, a natural 1 never does', async () => {
  const { w, dm, seats: [ann], call, ok, see } = await party(['Ann']);
  const d20 = (value) => [{ sides: 20, value }];
  const cases = [[15, 0, d20(12), true], [14, 0, d20(11), false], [40, 0, [], true], [3, 20, d20(20), true], [30, 1, d20(1), false],
    [30, 1, d20(7), true],          // a "natural 1" no twenty-sided die shows is not believed, so the total decides
    [2, 20, [{ sides: 6, value: 6 }], false]];
  let n = 0;
  for (const [total, nat, dice, pass] of cases) {
    n++; w.tick(1000);
    await ok(dm, 'request', { to: [ann.id], label: 'Try ' + n, target: 15, yes: 'It works.', no: 'It does not.' });
    assert.deepEqual(await ok(ann, 'roll', { total, nat, dice, request: n }), { n, pass, say: pass ? 'It works.' : 'It does not.' }, 'case ' + n);
  }
  const d = (await see(dm)).requests;
  assert.deepEqual(d.map((q) => q.results[ann.id].pass), cases.map((c) => c[3]));
  assert.deepEqual(d[3].results[ann.id], { total: 3, nat: 20, pass: true, at: w.now() - 3000 });
  assert.deepEqual((await see(ann)).requests.map((q) => q.mine.pass), cases.map((c) => c[3]));
  assert.equal((await see(ann)).rolls.length, 7, 'every one of them is in the roll feed too');
});
test('roll for a request with no target: nothing is decided until the DM judges it', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  await ok(dm, 'request', { to: 'all', label: 'Sing for the crowd', yes: 'They cheer.', no: 'They wince.' });
  assert.deepEqual(await ok(ann, 'roll', { total: 11, request: 1 }), { n: 1, pass: null, say: '' });
  assert.deepEqual((await see(ann)).requests[0].mine, { total: 11, nat: 0, pass: null, say: '' });
  assert.doesNotMatch((await call(ann, 'state', {})).text, /cheer|wince/, 'neither line is sent before the DM has decided');
  /* judging: a seat that has rolled, a request that is there, and a plain true or false */
  for (const pass of [undefined, null, 'yes', 1, 0]) { const r = await call(dm, 'judge', { n: 1, id: ann.id, pass }); assert.equal(r.status, 400, String(pass)); assert.equal(r.json.reason, 'bad_pass'); }
  for (const [body, reason] of [[{ n: 9, id: ann.id }, 'no_request'], [{ n: 1, id: bea.id }, 'no_roll'], [{ n: 1, id: 'nobody00' }, 'no_roll'], [{ n: 1, id: 'constructor' }, 'no_roll'], [{ n: 1 }, 'no_roll']]) {
    const r = await call(dm, 'judge', Object.assign({ pass: true }, body));
    assert.equal(r.status, 409, JSON.stringify(body)); assert.equal(r.json.reason, reason);
  }
  assert.deepEqual(await ok(dm, 'judge', { n: 1, id: ann.id, pass: false }), { ok: true });
  assert.deepEqual((await see(ann)).requests[0].mine, { total: 11, nat: 0, pass: false, say: 'They wince.' });
  assert.doesNotMatch((await call(ann, 'state', {})).text, /cheer/);
  /* the DM has the last word, and may change it, with or without a target */
  assert.deepEqual(await ok(dm, 'judge', { n: 1, id: ann.id, pass: true }), { ok: true });
  assert.deepEqual((await see(ann)).requests[0].mine, { total: 11, nat: 0, pass: true, say: 'They cheer.' });
  assert.equal((await see(dm)).requests[0].results[ann.id].pass, true);
  assert.deepEqual((await see(bea)).requests, [{ n: 1, label: 'Sing for the crowd', why: '', skill: '', at: w.now(), closed: false }], 'Bea has not rolled: nothing of Ann\'s is hers to see');
});
test('roll for a request: once a seat, only the seats asked, and a closed or unknown request is refused in a plain sentence', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  await ok(dm, 'request', { to: [ann.id], label: 'Leap the gap', target: 12, yes: 'Over you go.', no: 'Down you go.' });       // 1
  await ok(dm, 'request', { to: 'all', label: 'Hold your breath', target: 8 });                                             // 2
  assert.deepEqual(await ok(ann, 'roll', { total: 5, request: 1 }), { n: 1, pass: false, say: 'Down you go.' });
  /* a second try at the same request does not count, and says what the first one came to */
  w.tick(1000);
  const again = await call(ann, 'roll', { total: 19, request: 1 });
  assert.equal(again.status, 409);
  assert.deepEqual(again.json, { error: 'You have already rolled for that one.', reason: 'answered', n: 2, mine: { total: 5, nat: 0, pass: false, say: 'Down you go.' } });
  assert.deepEqual((await see(dm)).requests[0].results[ann.id], { total: 5, nat: 0, pass: false, at: w.now() - 1000 });
  /* a seat that was not asked, the DM, and a number nobody has asked for all get the same answer */
  const notAsked = await call(bea, 'roll', { total: 20, request: 1 }), byDm = await call(dm, 'roll', { total: 20, request: 1 });
  w.tick(1000);
  const unknown = await call(bea, 'roll', { total: 20, request: 99 });
  w.tick(1000);
  const odd = await call(bea, 'roll', { total: 20, request: 'one' });
  for (const [r, n] of [[notAsked, 3], [byDm, 4], [unknown, 5], [odd, 6]]) {
    assert.equal(r.status, 409); assert.deepEqual(r.json, { error: 'That roll is not being asked of you.', reason: 'no_request', n });
  }
  /* the DM calls request 2 off before Bea has rolled */
  assert.deepEqual(await ok(dm, 'cancel', { n: 2 }), { closed: true });
  assert.deepEqual(await ok(dm, 'cancel', { n: 2 }), { closed: true }, 'calling it off twice is no trouble');
  for (const n of [99, '2', null, undefined]) { assert.deepEqual(await ok(dm, 'cancel', { n }), { closed: false }, String(n)); }
  w.tick(1000);
  const late = await call(bea, 'roll', { total: 18, request: 2 });
  assert.equal(late.status, 409); assert.deepEqual(late.json, { error: 'The DM has called that roll off.', reason: 'request_closed', n: 7 });
  const s = await see(bea);
  assert.deepEqual(s.requests, [{ n: 2, label: 'Hold your breath', why: '', skill: '', at: w.now() - 4000, closed: true }]);
  /* every one of those rolls was real, so every one is in the roll feed; none of them touched a request */
  assert.equal(s.lastRoll, 7); assert.deepEqual(s.rolls.map((r) => r.total), [5, 19, 20, 20, 20, 20, 18]);
  assert.deepEqual((await see(dm)).requests.map((q) => Object.keys(q.results)), [[ann.id], []]);
  /* a roll that is not a roll is refused as ever, and leaves nothing anywhere */
  w.tick(1000);
  assert.equal((await call(ann, 'roll', { total: 'lots', request: 2 })).json.reason, 'bad_roll');
  assert.equal((await see(dm)).lastRoll, 7);
  /* a phone running yesterday's page sends no request and gets yesterday's answer */
  assert.deepEqual(await ok(ann, 'roll', { total: 9 }), { n: 8 });
});
test('request: the table keeps the last twenty, letting go of finished ones first', async () => {
  const { w, dm, seats: [ann], call, ok, see } = await party(['Ann']);
  await ok(dm, 'request', { to: 'all', label: 'Still waiting on Ann' });                    // 1 stays open
  for (let n = 2; n <= 30; n++) {
    await ok(dm, 'request', { to: 'all', label: 'Request ' + n, target: 10 });
    if (n % 2) { await ok(dm, 'cancel', { n }); } else { w.tick(1000); await ok(ann, 'roll', { total: 12, request: n }); }
  }
  const saved = w.saved(dm.code).reqs;
  assert.equal(saved.length, 20); assert.deepEqual(saved.map((q) => q.n), [1].concat(Array.from({ length: 19 }, (_, i) => i + 12)));
  assert.equal((await see(dm)).requests.length, 20); assert.equal((await see(ann)).requests.length, 20);
  w.tick(1000);
  assert.deepEqual(await ok(ann, 'roll', { total: 4, request: 1 }), { n: 16, pass: null, say: '' }, 'the one still open was kept all along');
});

/* ---------------- seats: leaving, and being kept out ---------------- */
test('leave: the seat is freed and everything the table held about that player is deleted', async () => {
  const { w, dm, at, seats: [ann, bea], call, ok, see } = await party();
  const face = (await ok(ann, 'me', { save: '{"hp":7}', portrait: PNG, char: { name: 'Brindle', cls: 'Scout' } })).portrait;
  const beaFace = (await ok(bea, 'me', { save: '{"hp":9}', portrait: PNG })).portrait;
  await ok(dm, 'send', { text: 'For everyone.' });                                           // feed 1
  await ok(dm, 'send', { to: ann.id, text: 'For Ann alone.', image: PNG });                   // feed 2
  await ok(dm, 'send', { to: bea.id, text: 'For Bea alone.' });                               // feed 3
  await ok(dm, 'send', { title: 'Meet Bea', image: beaFace });                                // feed 4: the DM shows Bea's portrait
  const note = (await see(dm)).feed[1].img;
  await ok(ann, 'propose', { kind: 'intent', text: 'Answered' }); await ok(ann, 'propose', { kind: 'intent', text: 'Still open' }); await ok(bea, 'propose', { kind: 'intent', text: 'Bea\'s idea' });
  await ok(dm, 'answer', { n: 1, verdict: 'yes' });
  await ok(dm, 'request', { to: 'all', label: 'Both', target: 10 }); await ok(dm, 'request', { to: [ann.id], label: 'Ann only' }); await ok(dm, 'request', { to: 'all', label: 'Both, not yet rolled' });
  await ok(ann, 'roll', { total: 12, request: 1 }); await ok(bea, 'roll', { total: 3, request: 1 });
  assert.equal(w.store(dm.code).m.size, 6, 'the table, two saved characters, two portraits, one private picture');
  assert.deepEqual(await ok(ann, 'leave', {}), { ok: true });
  /* nothing of Ann is left: not her seat, her character, her portrait, her ideas, her rolls, or the notes meant for her */
  assert.deepEqual([...w.store(dm.code).m.keys()].sort(), ['img:' + beaFace.slice(-16), 'save:' + bea.id, 't']);
  assert.equal((await w.request('GET', '/' + face)).status, 404); assert.equal((await w.request('GET', '/' + note)).status, 404);
  const t = w.saved(dm.code);
  assert.doesNotMatch(JSON.stringify(t), new RegExp(ann.id + '|' + ann.token + '|Ann|Brindle'));
  assert.equal(t.stored, 1);
  const d = await see(dm);
  assert.deepEqual(d.players.map((p) => p.name), ['Bea']);
  assert.deepEqual(d.feed.map((f) => f.n), [1, 3, 4]); assert.deepEqual(d.pulled, [2]);
  assert.deepEqual(d.asks.map((a) => a.text), ['Bea\'s idea']);
  assert.deepEqual(d.requests.map((q) => [q.n, q.to, Object.keys(q.results)]), [[1, [bea.id], [bea.id]], [3, [bea.id], []]], 'the request that was for Ann alone has gone');
  assert.deepEqual(d.rolls.map((r) => r.name), ['Bea']);
  /* her phone's token is now as unknown as any other; the name is free, as a brand new seat */
  for (const route of ['state', 'me', 'roll', 'leave', 'propose']) { const r = await call(ann, route, { total: 1 }); assert.equal(r.status, 404, route); assert.equal(r.text, NO_TABLE); }
  w.sleep();
  const again = await w.join(dm.code, 'Ann');
  assert.equal(again.back, undefined); assert.notEqual(again.id, ann.id);
  assert.deepEqual((await w.post('state', { token: again.token }, at)).json.feed.map((f) => f.n), [1, 4]);
  /* Bea leaves too: her portrait stays, because the DM has shown it to the table */
  assert.deepEqual(await ok(bea, 'leave', {}), { ok: true });
  assert.equal((await w.request('GET', '/' + beaFace)).status, 200);
  assert.deepEqual([...w.store(dm.code).m.keys()].sort(), ['img:' + beaFace.slice(-16), 't']);
  /* the DM cannot leave: ending the table is its own button */
  const r = await call(dm, 'leave', {});
  assert.equal(r.status, 403); assert.equal(r.json.reason, 'player_only');
  assert.equal((await see(dm)).players.length, 1);
});
test('leave: frees a place at a full table', async () => {
  const { w, dm, at, seats, ok } = await party(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
  assert.equal((await w.post('join', { name: 'Late' }, at)).json.reason, 'full');
  await ok(seats[3], 'leave', {});
  assert.equal((await w.join(dm.code, 'Late')).name, 'Late');
});
test('kick: the seat\'s proposals, request entries and private notes do not linger', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  await ok(ann, 'propose', { kind: 'intent', text: 'Ann, open' }); await ok(bea, 'propose', { kind: 'intent', text: 'Bea, open' });
  await ok(dm, 'request', { to: 'all', label: 'Both' }); await ok(dm, 'request', { to: [ann.id], label: 'Ann only' });
  await ok(dm, 'send', { to: ann.id, text: 'For Ann alone.', image: PNG }); await ok(dm, 'send', { text: 'For everyone.' });
  await ok(ann, 'roll', { total: 7, request: 1 });
  const k = await ok(dm, 'kick', { id: ann.id });
  assert.deepEqual(k, { players: [{ id: bea.id, name: 'Bea', char: null, portrait: '' }], count: 1, removed: true }, 'the answer is the one it has always been');
  const d = await see(dm);
  assert.deepEqual(d.asks.map((a) => a.text), ['Bea, open']);
  assert.deepEqual(d.requests.map((q) => [q.n, q.to, q.results]), [[1, [bea.id], {}]]);
  assert.deepEqual(d.feed.map((f) => f.n), [2]); assert.deepEqual(d.pulled, [1]);
  assert.deepEqual([...w.store(dm.code).m.keys()], ['t'], 'the private note\'s picture went with it');
  assert.equal(d.rolls.length, 1, 'dice already seen by the table stay in the roll feed, as before');
  assert.equal((await call(ann, 'state', {})).json.reason, 'removed');
  assert.equal((await w.join(dm.code, 'Ann')).back, undefined, 'without bar the name is free again at once');
});
test('kick with bar: that name cannot sit down again for an hour', async () => {
  const { w, dm, at, seats: [ann, bea], call, ok, see } = await party();
  const k = await ok(dm, 'kick', { id: ann.id, bar: true });
  assert.deepEqual(k, { players: [{ id: bea.id, name: 'Bea', char: null, portrait: '' }], count: 1, removed: true, barred: true });
  const ip = '203.0.113.50';
  for (let i = 0; i < 25; i++) {
    const r = await w.post('join', { name: i % 2 ? 'ann' : '  ANN ', confirm: true }, { c: dm.code, ip });
    assert.equal(r.status, 403, 'try ' + (i + 1)); assert.deepEqual(r.json, { error: 'The DM removed you from this table. You cannot come back to it just yet.', reason: 'removed' });
  }
  assert.equal((await w.post('state', { token: bea.token }, { c: dm.code, ip })).status, 200, 'being turned away is not counted as guessing: others on that wifi carry on');
  assert.equal((await w.join(dm.code, 'Anna')).name, 'Anna', 'other names are welcome');
  w.tick(3599000); w.sleep();
  assert.equal((await w.post('join', { name: 'Ann' }, at)).status, 403, 'remembered in storage, for the whole hour');
  w.tick(1000);
  const back = await w.join(dm.code, 'Ann');
  assert.equal(back.back, undefined); assert.notEqual(back.id, ann.id);
  /* only bar: true bars; nobody removed means nobody barred; and the list of barred names stays short */
  for (const bar of ['true', 1, 'yes', false, null]) {
    const p = await w.join(dm.code, 'Guest'), r = await ok(dm, 'kick', { id: p.id, bar });
    assert.equal('barred' in r, false, String(bar)); assert.equal((await w.join(dm.code, 'Guest')).name, 'Guest'); await ok(dm, 'kick', { id: (await see(dm)).players.pop().id });
  }
  assert.deepEqual(await ok(dm, 'kick', { id: 'nobody00', bar: true }), { players: (await see(dm)).players, count: 3, removed: false });
  for (let i = 0; i < 25; i++) { const p = await w.join(dm.code, 'Visitor ' + i); await ok(dm, 'kick', { id: p.id, bar: true }); }
  assert.equal(w.saved(dm.code).barred.length, 20);
  assert.equal((await w.post('join', { name: 'Visitor 24' }, at)).status, 403); assert.equal((await w.post('join', { name: 'Visitor 4' }, at)).status, 200, 'the oldest are forgotten');
});

/* ---------------- numbers ---------------- */
test('event: always 204, one log line for each one accepted, nothing personal, thirty a minute from one address', async (t) => {
  const lines = [], spy = t.mock.method(console, 'log', (s) => { lines.push(s); });
  const w = await world(), send = (body, o) => w.request('POST', '/api/event', body, o);
  const empty = async (r) => { assert.equal(r.status, 204); assert.equal(r.bytes.length, 0); };
  await empty(await send({ name: 'first_roll', ms: 412000, way: 'card', cartridge: 'northpole', n: 3 }));
  assert.deepEqual(lines, ['{"ev":"first_roll","ms":412000,"way":"card","cartridge":"northpole","n":3}']);
  for (const name of ['screen', 'roll_source', 'helper', 'join', 'request_answered']) { await empty(await send({ name })); }
  assert.deepEqual(lines.slice(1), ['screen', 'roll_source', 'helper', 'join', 'request_answered'].map((ev) => JSON.stringify({ ev })));
  /* anything else in it is dropped: a name it does not know, text where a number belongs, anything that could be about a person */
  lines.length = 0;
  await empty(await send({ name: 'join', ms: '12', way: 'Ann Smith <ann@example.com>', cartridge: '../x', n: 1.5, token: 'secret', code: 'ABCD', player: 'Ann', ip: '1.2.3.4' }));
  await empty(await send({ name: 'screen', ms: -1, way: 'w'.repeat(41), cartridge: 7, n: 100000 }));
  await empty(await send({ name: 'screen', ms: 0, way: 'play.sheet_2', n: 0 }));
  assert.deepEqual(lines, ['{"ev":"join"}', '{"ev":"screen"}', '{"ev":"screen","ms":0,"way":"play.sheet_2","n":0}']);
  lines.length = 0;
  for (const body of [{}, { name: 'nonsense' }, { name: 'FIRST_ROLL' }, { name: ['join'] }, { name: 7 }, { ev: 'join' }]) { await empty(await send(body)); }
  for (const raw of ['', 'not json', '[1,2]', 'null', '{"name":', JSON.stringify({ name: 'join', way: 'x'.repeat(2000) })]) { await empty(await send(null, { raw })); }
  for (const method of ['GET', 'PUT', 'DELETE']) { await empty(await w.request(method, '/api/event')); }
  await empty(await w.request('POST', '/api/event?c=ZZZZ', { name: 'nonsense' }));
  assert.deepEqual(lines, [], 'none of that was logged, and none of it was an error');
  assert.equal(w.stores.size, 0, 'no table is ever touched');
  /* thirty a minute from one address; the rest are dropped, quietly */
  for (let i = 0; i < 40; i++) { await empty(await send({ name: 'screen', n: i }, { ip: '198.51.100.7' })); }
  assert.equal(lines.length, 30); assert.equal(lines[29], '{"ev":"screen","n":29}');
  await send({ name: 'join' }, { ip: '198.51.100.8' });
  assert.equal(lines.length, 31, 'another address is not held up');
  w.tick(61000);
  await send({ name: 'join' }, { ip: '198.51.100.7' });
  assert.equal(lines.length, 32, 'and a minute later it counts again');
  /* an address that has been guessing table codes still gets its 204, and events never count as guesses */
  const dm = await w.open();
  for (let i = 0; i < 20; i++) { await w.post('state', { token: 'nope' }, { c: dm.code, ip: '198.51.100.9' }); }
  assert.equal((await w.post('state', { token: dm.token }, { c: dm.code, ip: '198.51.100.9' })).status, 429);
  await empty(await send({ name: 'join' }, { ip: '198.51.100.9' }));
  for (let i = 0; i < 60; i++) { await send({ name: 'nonsense' }, { ip: '198.51.100.10' }); }
  assert.equal((await w.post('state', { token: dm.token }, { c: dm.code, ip: '198.51.100.10' })).status, 200);
  assert.ok(spy.mock.callCount() > 0);
});

/* ---------------- old tables, old phones, and the rules that hold everywhere ---------------- */
test('a table saved before any of this existed loads, and every new call works at it', async () => {
  const w = await world(), DM = 'd'.repeat(32), ANN = 'p'.repeat(32), at = { c: 'OLDT' };
  await w.store('OLDT').put('t', { code: 'OLDT', dm: DM, created: 1, scenario: 'northpole', players: [{ id: 'aaaaaaaa', token: ANN, name: 'Ann', char: null, portrait: '', portraits: 0, old: [] }],
    feed: [{ n: 1, at: 5, kind: 'note', title: 'An old note', text: 'From before.', img: '' }], seq: 1, rolls: [], rollSeq: 0, gone: [], stored: 0, spend: { images: 0, texts: 0 } });
  const s = (await w.post('state', { token: ANN }, at)).json;
  assert.deepEqual([s.sceneN, s.pulled, s.asks, s.requests, 'scene' in s], [0, [], [], [], false]);
  assert.deepEqual(s.feed, [{ n: 1, at: 5, kind: 'note', title: 'An old note', text: 'From before.', img: '', to: '', hero: '' }], 'an old item is for everyone');
  const post = async (token, route, body) => { const r = await w.post(route, Object.assign({ token }, body), at); assert.equal(r.status, 200, route + ': ' + r.text); return r.json; };
  assert.deepEqual(await post(DM, 'scene', { scene: { title: 'Here' } }), { n: 1 });
  assert.deepEqual(await post(DM, 'send', { to: 'aaaaaaaa', text: 'Psst.' }), { ok: true, n: 2, players: 1 });
  assert.deepEqual(await post(ANN, 'propose', { kind: 'intent', text: 'I look around.' }), { n: 1 });
  assert.deepEqual(await post(DM, 'answer', { n: 1, verdict: 'roll' }), { ok: true });
  assert.deepEqual(await post(DM, 'request', { to: 'all', label: 'Look around', target: 5, yes: 'You see it.', no: 'Nothing.' }), { n: 1 });
  assert.deepEqual(await post(ANN, 'roll', { total: 9, request: 1 }), { n: 1, pass: true, say: 'You see it.' });
  assert.deepEqual(await post(DM, 'judge', { n: 1, id: 'aaaaaaaa', pass: false }), { ok: true });
  assert.deepEqual(await post(DM, 'cancel', { n: 1 }), { closed: true });
  assert.deepEqual(await post(DM, 'unsend', { n: 1 }), { removed: true });
  w.sleep();
  const after = (await w.post('state', { token: ANN }, at)).json;
  assert.deepEqual([after.sceneN, after.scene.title, after.pulled, after.asks[0].verdict, after.requests[0].mine.say, after.feed.map((f) => f.n)], [1, 'Here', [1], 'roll', 'Nothing.', [2]]);
  assert.deepEqual(await post(DM, 'kick', { id: 'aaaaaaaa', bar: true }), { players: [], count: 0, removed: true, barred: true });
  assert.equal((await w.post('join', { name: 'Ann' }, at)).status, 403);
  const bea = await w.join('OLDT', 'Bea');
  assert.deepEqual(await post(bea.token, 'leave', {}), { ok: true });
});
test('a phone running yesterday\'s page sends none of the new fields and gets what it always got', async () => {
  const { w, dm, seats: [ann, bea], call, ok, see } = await party();
  assert.deepEqual(await ok(dm, 'send', { title: 'A map', text: 'Old and torn.' }), { ok: true, n: 1, players: 2 });
  assert.deepEqual(await ok(ann, 'roll', { total: 12, kind: 'check', label: 'Look' }), { n: 1 });
  assert.deepEqual(await ok(dm, 'kick', { id: bea.id }), { players: [{ id: ann.id, name: 'Ann', char: null, portrait: '' }], count: 1, removed: true });
  const s = await see(ann, { after: 0, afterRoll: 0 });
  for (const [k, v] of Object.entries({ code: dm.code, you: ann.id, last: 1, scenario: 'northpole', lastRoll: 1 })) { assert.equal(s[k], v, k); }
  assert.deepEqual(s.players, [{ id: ann.id, name: 'Ann', char: null, portrait: '' }]);
  assert.deepEqual([s.feed[0].n, s.feed[0].kind, s.feed[0].title, s.feed[0].text, s.feed[0].img], [1, 'note', 'A map', 'Old and torn.', '']);
  assert.deepEqual(Object.keys(s.rolls[0]).sort(), ROLL_KEYS);
  /* and what is new rides along without getting in the way */
  assert.deepEqual([s.sceneN, s.pulled, s.asks, s.requests], [0, [], [], []]);
  assert.deepEqual((await see(ann, { after: 1, afterRoll: 1 })).feed, []);
});
test('new routes: an unknown code and a bad token get the same byte-identical 404 as everywhere else', async () => {
  const { w, dm, seats: [ann] } = await party(['Ann']);
  let ip = 0;
  for (const [route, body] of Object.entries(NEW_ROUTES)) {
    for (const [c, token] of [['ZZZZ', ann.token], ['ZZZZ', dm.token], ['ZZZZ', undefined], [dm.code, 'f'.repeat(32)], [dm.code, ann.token.slice(0, 31)], [dm.code, undefined], [dm.code, ''], [dm.code, 7], [dm.code, { $ne: 1 }], ['nope!', dm.token], ['', dm.token]]) {
      const r = await w.post(route, Object.assign({}, body, token === undefined ? {} : { token }), { c, ip: 'new-guess-' + ip++ });
      assert.equal(r.status, 404, route); assert.equal(r.text, NO_TABLE, route);
      assert.deepEqual([...r.headers].sort(), [['cache-control', 'no-store'], ['content-type', 'application/json']], route);
    }
    /* even when what was sent would be refused for another reason, were the token good */
    for (const bad of [{ scene: 'x'.repeat(30000) }, { n: 'x', verdict: 'maybe', pass: 'x', target: 99, to: 'nobody00' }]) {
      const r = await w.post(route, Object.assign({ token: 'f'.repeat(32) }, bad), { c: dm.code, ip: 'new-guess-' + ip++ });
      assert.equal(r.status, 404, route); assert.equal(r.text, NO_TABLE, route);
    }
  }
  /* a roll for a request, and a private note, from nobody: the same again, and nothing was recorded */
  for (const [route, body] of [['roll', { total: 5, request: 1 }], ['send', { to: ann.id, text: 'x' }], ['state', { afterScene: 0 }], ['kick', { id: ann.id, bar: true }]]) {
    const r = await w.post(route, Object.assign({ token: 'f'.repeat(32) }, body), { c: dm.code, ip: 'new-guess-' + ip++ });
    assert.equal(r.status, 404, route); assert.equal(r.text, NO_TABLE, route);
  }
  const s = (await w.post('state', { token: dm.token }, { c: dm.code })).json;
  assert.deepEqual([s.players.length, s.feed, s.rolls, s.sceneN, s.asks, s.requests, s.pulled], [1, [], [], 0, [], [], []]);
  /* twenty of them from one address and the door closes, as for any other guessing */
  for (let i = 0; i < 20; i++) { await w.post(Object.keys(NEW_ROUTES)[i % 8], { token: 'nope' }, { c: dm.code, ip: 'one-guesser' }); }
  assert.equal((await w.post('leave', { token: ann.token }, { c: dm.code, ip: 'one-guesser' })).status, 429);
  assert.equal((await w.post('state', { token: ann.token }, { c: dm.code })).status, 200, 'the 429 kept Ann in her seat');
});
test('new routes: DM-only calls turn players away, a moved or removed seat hears why, an ended table says so, and none of it counts as guessing', async () => {
  const { w, dm, at, seats: [ann, bea], call, ok, see } = await party();
  const ip = '192.0.2.99', from = { c: dm.code, ip };
  for (let i = 0; i < 5; i++) {
    for (const route of DM_ROUTES) {
      const r = await w.post(route, Object.assign({ token: ann.token }, NEW_ROUTES[route]), from);
      assert.equal(r.status, 403, route); assert.match(r.json.error, /^Only the DM can /); assert.equal(r.json.reason, 'dm_only');
    }
  }
  const s = await see(dm);
  assert.deepEqual([s.sceneN, s.requests, s.pulled], [0, [], []], 'none of those changed anything');
  /* Ann moves to another phone; Bea is removed */
  const ann2 = await w.join(dm.code, 'Ann', { confirm: true });
  await ok(dm, 'kick', { id: bea.id });
  for (let i = 0; i < 4; i++) {
    for (const [route, body] of Object.entries(NEW_ROUTES)) {
      const moved = await w.post(route, Object.assign({ token: ann.token }, body), from), removed = await w.post(route, Object.assign({ token: bea.token }, body), from);
      assert.equal(moved.status, 409, route); assert.deepEqual(moved.json, { error: 'Someone else is now playing as Ann.', reason: 'moved', name: 'Ann' });
      assert.equal(removed.status, 409, route); assert.deepEqual(removed.json, { error: 'The DM removed you from this table.', reason: 'removed' });
    }
  }
  assert.equal((await w.post('state', { token: ann2.token }, from)).status, 200, 'sixty refusals later, that address is still welcome');
  await ok(dm, 'close', {});
  for (const [route, body] of Object.entries(NEW_ROUTES)) {
    for (const token of [dm.token, ann2.token, ann.token, bea.token]) {
      const r = await w.post(route, Object.assign({ token }, body), from);
      assert.equal(r.status, 410, route); assert.equal(r.text, '{"error":"This table has ended.","reason":"closed"}');
    }
    const stranger = await w.post(route, Object.assign({ token: 'never-was' }, body), { c: dm.code, ip: 'a-stranger-' + route });
    assert.equal(stranger.status, 404, route); assert.equal(stranger.text, NO_TABLE);
  }
});
test('everything a table keeps for the new features stays inside its bounds', async () => {
  const { w, dm, seats, call, ok } = await party(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
  const long = 'é'.repeat(2000);
  await ok(dm, 'scene', { scene: { summary: 'é'.repeat(400), story: Array(30).fill('é'.repeat(240)), people: Array(18).fill({ name: 'N', line: 'é'.repeat(160) }) } });
  for (let i = 0; i < 25; i++) { await ok(dm, 'request', { to: 'all', label: long, why: long, skill: long, yes: long, no: long, target: 20 }); }
  for (const p of seats) { for (let i = 0; i < 4; i++) { await call(p, 'propose', { kind: 'card', card: long, text: long }); } }
  for (let i = 0; i < 35; i++) { const n = (await ok(dm, 'send', { text: 'x', hero: long })).n; await ok(dm, 'unsend', { n }); }
  for (const p of seats) { w.tick(1000); await ok(p, 'roll', { total: 10, request: 25 }); }
  const t = w.saved(dm.code);
  assert.deepEqual([t.reqs.length, t.asks.length, t.pulled.length, t.feed.length], [20, 24, 30, 0]);
  assert.equal(Object.keys(t.reqs[19].results).length, 8);
  const size = (v) => Buffer.byteLength(JSON.stringify(v));
  assert.ok(size(t.scene) < 26000, 'scene: ' + size(t.scene)); assert.ok(size(t.reqs) < 20 * 3200, 'requests: ' + size(t.reqs)); assert.ok(size(t.asks) < 30 * 900, 'proposals: ' + size(t.asks));
  assert.ok(size(t) < 150000, 'the whole table: ' + size(t));
});

/* ================= Phase 2: the big screen and character ties (docs/PHASE2.md, section 1) ================= */
/* What each new route is sent when all that matters is who is asking. */
const P2_ROUTES = { stage: { patch: { spot: '' } }, screen: {}, vote: { q: 'Left or right?', options: ['Left', 'Right'] }, ballot: { n: 1, pick: 0 }, award: { id: 'x', give: 1 }, spend: {}, react: { on: 'roll:1', mark: 'cheer' }, session: { save: 'x' }, reset: {} };
const P2_DM = ['stage', 'screen', 'vote', 'award', 'session', 'reset'], P2_PLAYER = ['ballot', 'spend'];
const BARE = { reveal: null, map: null, sound: null, beat: null, spot: '', order: [], now: '' };
/* A big screen at a party's table. It holds its key the way a seat holds a token, so call(), ok() and see() work for it too. */
const tv = async (p, extra) => ({ token: (await p.ok(p.dm, 'screen', extra)).key });
/* Everything a table can hold that somebody must not be sent, each piece carrying a word that can be searched for. */
async function secrets(p) {
  const { dm, seats: [ann, bea, cal], ok } = p;
  await ok(ann, 'me', { save: '{"hp":7,"note":"SECRET-SAVE"}', portrait: PNG, char: { name: 'Brindle', cls: 'Scout', line: 'Quick on her feet.' },
    hook: { id: 'debt', text: 'SECRET-HOOK-ANN: I owe the baker everything.' }, bond: { to: bea.id, prompt: 'Why do you owe Bea a favor?', text: 'She pulled me out of the river.' } });
  await ok(bea, 'me', { hook: { id: 'crown', text: 'SECRET-HOOK-BEA: the crown is mine by right.' } });
  await ok(dm, 'send', { title: 'Snow', text: 'Snow begins to fall.' });                                                     // feed 1: for everyone
  await ok(dm, 'send', { to: ann.id, title: 'SECRET-WHISPER', text: 'SECRET-NOTE: the key is under the mat.', image: PNG });   // feed 2: for Ann alone
  await ok(dm, 'send', { to: bea.id, hero: 'SECRET-HERO' });                                                                 // feed 3: for Bea alone
  await ok(ann, 'propose', { kind: 'intent', text: 'SECRET-PLAN: I slip the letter into my boot.' });
  await ok(bea, 'propose', { kind: 'card', card: 'SECRET-CARD', text: 'Listen at the door' });
  await ok(dm, 'answer', { n: 1, verdict: 'no', note: 'SECRET-ANSWER: the letter is watched.' });
  await ok(dm, 'request', { to: [ann.id, bea.id], label: 'Cross the ice', why: 'SECRET-WHY', skill: 'SECRET-SKILL', target: 13, yes: 'SECRET-PASSED', no: 'SECRET-FAILED' });
  await ok(ann, 'roll', { total: 17, request: 1, kind: 'check', label: 'Careful steps', dice: [{ sides: 20, value: 14 }] });
  await ok(dm, 'session', { save: '{"at":"vault","flags":["SECRET-SESSION"]}', at: 1700000000000 });
  await ok(ann, 'react', { on: 'feed:2', mark: 'gasp' });                                                                    // to her private note
  await ok(dm, 'react', { on: 'feed:1', mark: 'heart' });
  await ok(dm, 'scene', { scene: { id: 'ice', title: 'The frozen lake', summary: 'The ice creaks.', img: 'packs/northpole/img/dm_bridge.webp' } });
  await ok(dm, 'stage', { patch: { spot: ann.id, sound: { bed: 'wind', level: 0.5 } } });
  await ok(dm, 'vote', { q: 'Cross now, or wait for dawn?', options: ['Cross now', 'Wait'] });
  await ok(ann, 'ballot', { n: 1, pick: 0 }); await ok(bea, 'ballot', { n: 1, pick: 1 }); await ok(cal, 'ballot', { n: 1, pick: 1 });
}
const ASKING = [{}, { after: 0, afterRoll: 0, afterScene: 0, afterStage: 0 }, { after: -5, afterRoll: 'x', afterScene: null, afterStage: -1 }, { after: 1.5, afterStage: 'x' }, { id: 'dm', you: 'dm', dm: true, screen: false, to: 'all' }];

/* ---------------- what a big screen, and a player, must never be sent ---------------- */
test('privacy: a big screen is never sent a private note, a proposal, a target or its two lines, a saved character, a hook or the DM\'s session', async () => {
  const p = await party(['Ann', 'Bea', 'Cal']), { w, dm, seats: [ann, bea, cal], call, ok, see } = p, screen = await tv(p);
  await secrets(p);
  const HIDDEN = new RegExp(['SECRET', '"target"', '"yes"', '"no"', '"why"', '"skill"', '"asks"', '"hook"', '"save"', '"session', '"reacted"', '"screen":', 'feed:2', 'boot', 'vault', 'Listen at', dm.token, ann.token, bea.token, cal.token, screen.token].join('|'));
  const look = async () => {
    for (const extra of ASKING) {
      const r = await call(screen, 'state', extra);
      assert.equal(r.status, 200, r.text); assert.doesNotMatch(r.text, HIDDEN, JSON.stringify(extra));
    }
  };
  await look();
  /* what it does get: the public face of the table, and nothing with a seat's name on it that the seat alone should read */
  const s = await see(screen), face = (await see(ann)).players[0].portrait;
  assert.deepEqual(Object.keys(s).sort(), ['code', 'feed', 'floor', 'last', 'lastRoll', 'players', 'pulled', 'reacts', 'requests', 'rolls', 'scenario', 'scene', 'sceneN', 'stage', 'stageN', 'time', 'votes', 'you']);
  assert.equal(s.you, 'screen');
  assert.deepEqual(s.players, [{ id: ann.id, name: 'Ann', char: { name: 'Brindle', race: '', cls: 'Scout', line: 'Quick on her feet.', look: '' }, portrait: face, bond: { to: bea.id, prompt: 'Why do you owe Bea a favor?', text: 'She pulled me out of the river.' } },
    { id: bea.id, name: 'Bea', char: null, portrait: '' }, { id: cal.id, name: 'Cal', char: null, portrait: '' }]);
  assert.deepEqual(s.feed.map((f) => [f.n, f.to, f.text]), [[1, '', 'Snow begins to fall.']]);
  assert.deepEqual(s.requests, [{ n: 1, label: 'Cross the ice', to: [ann.id, bea.id], at: w.now(), closed: false, results: { [ann.id]: { total: 17, nat: 0, pass: true } } }]);
  assert.deepEqual(s.votes, [{ n: 1, q: 'Cross now, or wait for dawn?', options: ['Cross now', 'Wait'], open: true, mine: null, counts: [1, 2] }]);
  assert.deepEqual(s.reacts, { 'feed:1': { heart: 1 } });
  assert.deepEqual([s.rolls.length, s.rolls[0].label, s.scene.title, s.stage.spot, s.stage.sound, s.last, s.lastRoll], [1, 'Careful steps', 'The frozen lake', ann.id, { bed: 'wind', level: 0.5 }, 3, 1]);
  /* more of the same after a sleep, a second roll judged by the DM, a new private note and a vote that has closed */
  w.sleep(); w.tick(1000);
  await ok(bea, 'roll', { total: 4, request: 1 }); await ok(dm, 'judge', { n: 1, id: bea.id, pass: true });
  await ok(dm, 'send', { to: cal.id, text: 'SECRET-LATER: you alone hear the bells.' }); await ok(dm, 'vote', { n: 1, close: true });
  await ok(dm, 'session', { save: 'SECRET-SESSION-2', at: 1700000000001 });
  await look();
  assert.deepEqual((await see(screen)).requests[0].results[bea.id], { total: 4, nat: 0, pass: true });
});
test('privacy: a player is never sent another seat\'s hook, the DM\'s session, the screen key, or the counts of a vote that is still open', async () => {
  const p = await party(['Ann', 'Bea', 'Cal']), { w, dm, seats: [ann, bea, cal], call, ok, see } = p, screen = await tv(p);
  await secrets(p);
  const never = ['SECRET-SESSION', 'SECRET-SAVE', 'vault', '"session', '"screen":', '"counts"', '"target"', '"yes":', '"no":', dm.token, screen.token];
  const hidden = { Ann: ['SECRET-HOOK-BEA', 'SECRET-HERO', 'SECRET-CARD', 'SECRET-FAILED', 'feed:3', bea.token, cal.token], Bea: ['SECRET-HOOK-ANN', 'SECRET-NOTE', 'SECRET-WHISPER', 'SECRET-PLAN', 'SECRET-ANSWER', 'SECRET-PASSED', 'SECRET-FAILED', 'feed:2', ann.token, cal.token], Cal: ['SECRET', '"hook"', 'feed:2', 'feed:3', ann.token, bea.token] };
  const look = async (more = []) => {
    for (const who of [ann, bea, cal]) {
      for (const extra of ASKING) { assert.doesNotMatch((await call(who, 'state', extra)).text, new RegExp(never.concat(hidden[who.name], more).join('|')), who.name + ' ' + JSON.stringify(extra)); }
    }
  };
  await look();
  /* a hook is in its own seat's entry for that seat and for the DM, and in nobody else's copy */
  const hooks = async (who) => (await see(who)).players.map((x) => (x.hook ? x.hook.id : ''));
  assert.deepEqual(await hooks(ann), ['debt', '', '']); assert.deepEqual(await hooks(bea), ['', 'crown', '']); assert.deepEqual(await hooks(cal), ['', '', '']);
  assert.deepEqual((await see(dm)).players.map((x) => x.hook), [{ id: 'debt', text: 'SECRET-HOOK-ANN: I owe the baker everything.' }, { id: 'crown', text: 'SECRET-HOOK-BEA: the crown is mine by right.' }, undefined]);
  /* a bond is the table's to see */
  for (const who of [ann, bea, cal, dm]) { assert.deepEqual((await see(who)).players[0].bond, { to: bea.id, prompt: 'Why do you owe Bea a favor?', text: 'She pulled me out of the river.' }); }
  /* the vote: each seat is told its own pick and nothing of the others'; the DM watches the count as it moves */
  const open = { n: 1, q: 'Cross now, or wait for dawn?', options: ['Cross now', 'Wait'], open: true };
  assert.deepEqual((await see(ann)).votes, [Object.assign({}, open, { mine: 0 })]); assert.deepEqual((await see(cal)).votes, [Object.assign({}, open, { mine: 1 })]);
  assert.deepEqual((await see(dm)).votes, [Object.assign({}, open, { mine: null, counts: [1, 2] })]);
  const changed = await call(ann, 'ballot', { n: 1, pick: 1 });
  assert.deepEqual(changed.json, { ok: true, mine: 1 }); assert.doesNotMatch(changed.text, /counts/);
  w.sleep();
  await look();
  assert.deepEqual((await see(dm)).votes[0].counts, [0, 3]);
  /* only the DM is told when the session was last saved, and whether a screen is watching */
  const d = await see(dm);
  assert.deepEqual([d.sessionAt, d.screen], [1700000000000, true]); assert.doesNotMatch(JSON.stringify(d), new RegExp('SECRET-SESSION|vault|' + screen.token));
  /* once the DM closes it, everyone is told how it went */
  assert.deepEqual(await ok(dm, 'vote', { n: 1, close: true }), { closed: true });
  for (const who of [ann, bea, cal]) { assert.deepEqual((await see(who)).votes, [{ n: 1, q: open.q, options: open.options, open: false, mine: 1, counts: [0, 3] }]); }
  never.splice(never.indexOf('"counts"'), 1);
  await look();
});
test('privacy: a reaction to a private note is seen by its seat and the DM alone, and no other seat can react to it or learn that it is there', async () => {
  const p = await party(['Ann', 'Bea', 'Cal']), { w, dm, seats: [ann, bea, cal], call, ok, see } = p, screen = await tv(p);
  await ok(dm, 'send', { text: 'For everyone.' }); await ok(dm, 'send', { to: ann.id, text: 'For Ann alone.' });
  assert.deepEqual(await ok(ann, 'react', { on: 'feed:2', mark: 'gasp' }), { on: 'feed:2', mark: 'gasp' });
  assert.deepEqual(await ok(dm, 'react', { on: 'feed:2', mark: 'heart' }), { on: 'feed:2', mark: 'heart' });
  assert.deepEqual(await ok(bea, 'react', { on: 'feed:1', mark: 'clap' }), { on: 'feed:1', mark: 'clap' });
  /* Bea reacting to Ann's note gets, byte for byte, what she gets for a note that was never sent */
  const theirs = await call(bea, 'react', { on: 'feed:2', mark: 'wow' }), none = await call(bea, 'react', { on: 'feed:99', mark: 'wow' });
  assert.equal(theirs.status, 409); assert.equal(theirs.text, none.text); assert.equal(theirs.json.reason, 'no_thing');
  w.sleep();
  for (const who of [ann, dm]) { assert.deepEqual((await see(who)).reacts, { 'feed:2': { gasp: 1, heart: 1 }, 'feed:1': { clap: 1 } }); }
  for (const who of [bea, cal, screen]) {
    const r = await call(who, 'state', {});
    assert.deepEqual(r.json.reacts, { 'feed:1': { clap: 1 } }); assert.doesNotMatch(r.text, /feed:2|gasp|heart|Ann alone/);
  }
  /* each is told which marks are their own, and only those */
  assert.deepEqual([(await see(ann)).reacted, (await see(bea)).reacted, (await see(cal)).reacted, (await see(dm)).reacted], [{ 'feed:2': 'gasp' }, { 'feed:1': 'clap' }, {}, { 'feed:2': 'heart' }]);
});

/* ---------------- the big screen's key ---------------- */
test('screen: the key is long and random, made once, replaced or thrown away by the DM, and a wrong one is as unknown as any token', async () => {
  const p = await party(['Ann']), { w, dm, seats: [ann], call, ok, see } = p;
  assert.equal((await see(dm)).screen, false);
  const { key } = await ok(dm, 'screen', {});
  assert.match(key, /^[0-9a-f]{48}$/);
  assert.equal((await see(dm)).screen, true);
  w.sleep();
  for (const extra of [{}, { off: false }, { off: 'true', new: 'yes' }, { new: 1 }]) { assert.deepEqual(await ok(dm, 'screen', extra), { key }, 'asking again gives the same key: ' + JSON.stringify(extra)); }
  assert.equal((await see({ token: key })).you, 'screen');
  /* a near miss is a code nobody has, byte for byte */
  let ip = 0;
  const wrong = async (token) => { const r = await w.post('state', { token }, { c: dm.code, ip: 'key-guess-' + ip++ }); assert.equal(r.status, 404, String(token)); assert.equal(r.text, NO_TABLE); };
  const flip = (c) => (c === '0' ? '1' : '0');
  for (const guess of [key.slice(0, 47), key + '0', key.toUpperCase(), key.slice(1) + key[0], ' ' + key, key + ' ', key.slice(0, 47) + flip(key[47]), flip(key[0]) + key.slice(1), '0'.repeat(48), [key], { key }].filter((g) => g !== key)) { await wrong(guess); }
  /* a new key: the old one stops working at once */
  const next = (await ok(dm, 'screen', { new: true })).key;
  assert.match(next, /^[0-9a-f]{48}$/); assert.notEqual(next, key);
  await wrong(key); assert.equal((await see({ token: next })).you, 'screen');
  w.sleep();
  await wrong(key); assert.equal((await see({ token: next })).you, 'screen');
  /* thrown away: no key works, and the DM is told there is none */
  assert.deepEqual(await ok(dm, 'screen', { off: true }), { key: '' });
  assert.deepEqual(await ok(dm, 'screen', { off: true, new: true }), { key: '' }, 'off wins');
  await wrong(next); await wrong(key); await wrong('');
  assert.equal((await see(dm)).screen, false); assert.equal(w.saved(dm.code).screen, '');
  const third = (await ok(dm, 'screen', {})).key;
  assert.match(third, /^[0-9a-f]{48}$/); assert.ok(![key, next].includes(third), 'the next one asked for is new again');
  /* the key is the DM's to make: a player is turned away, and no poll ever carries it, not even the DM's */
  const r = await call(ann, 'screen', {});
  assert.equal(r.status, 403); assert.equal(r.json.reason, 'dm_only');
  assert.doesNotMatch(JSON.stringify([await see(ann), await see(dm), await see({ token: third })]), new RegExp(third));
});
test('screen: the right key may watch and fetch pictures and nothing else, and a wrong one counts as guessing like any wrong token', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], ok } = p, screen = await tv(p);
  const face = (await ok(ann, 'me', { portrait: PNG, save: '{"hp":7}' })).portrait;
  await ok(dm, 'send', { text: 'Hello.' }); await ok(dm, 'request', { to: 'all', label: 'Look' }); await ok(dm, 'vote', P2_ROUTES.vote); await ok(ann, 'propose', { kind: 'intent', text: 'I look.' });
  await ok(dm, 'award', { id: ann.id, give: 1 }); await ok(ann, 'roll', { total: 9, request: 1 });
  const before = JSON.stringify(w.saved(dm.code)), keys = [...w.store(dm.code).m.keys()].sort(), ip = '203.0.113.61';
  /* every other call there is, each with something it could have done were it allowed */
  const every = Object.assign({ me: { name: 'Zed', char: { name: 'Z' } }, keep: { image: PNG }, send: { text: 'I am the DM now' }, roll: { total: 12 }, kick: { id: ann.id, bar: true }, close: {}, image: { prompt: 'a fox' }, text: { system: 's', user: 'u' } }, NEW_ROUTES, P2_ROUTES,
    { answer: { n: 1, verdict: 'yes' }, judge: { n: 1, id: ann.id, pass: false }, award: { id: ann.id, give: 1 }, react: { on: 'feed:1', mark: 'cheer' }, screen: { new: true } });
  assert.equal(Object.keys(every).length, 25);
  for (let i = 0; i < 2; i++) {
    for (const [route, body] of Object.entries(every)) {
      const r = await w.post(route, Object.assign({ token: screen.token }, body), { c: dm.code, ip });
      assert.equal(r.status, 403, route); assert.deepEqual(r.json, { error: 'A big screen only watches the table. It cannot do that.', reason: 'screen_only' }, route);
    }
  }
  assert.equal(JSON.stringify(w.saved(dm.code)), before, 'none of it changed the table'); assert.deepEqual([...w.store(dm.code).m.keys()].sort(), keys); assert.equal(w.calls.length, 0);
  /* fifty refusals with the right key are not guesses: it still watches, and it can fetch the table's pictures */
  assert.equal((await w.post('state', { token: screen.token }, { c: dm.code, ip })).status, 200);
  assert.equal((await w.request('GET', '/' + face, null, { ip })).status, 200);
  /* watching is not sitting: a screen never makes a seat look as if it is being played */
  w.tick(91000); await w.post('state', { token: screen.token }, { c: dm.code });
  assert.equal((await w.join(dm.code, 'Bea')).back, true);
  /* twenty wrong keys from one address, and the door closes on it as it does for any other guessing */
  const guesser = '203.0.113.62';
  for (let i = 0; i < 20; i++) { const r = await w.post('state', { token: screen.token.slice(0, 47) + 'x' }, { c: dm.code, ip: guesser }); assert.equal(r.status, 404); assert.equal(r.text, NO_TABLE); }
  const shut = await w.post('state', { token: screen.token }, { c: dm.code, ip: guesser });
  assert.equal(shut.status, 429); assert.equal(shut.json.reason, 'blocked');
  /* the counter shared between copies of the Worker hears of a wrong key, and never of a right one */
  const lim = await party(['Ann'], { limit: () => true }), key = (await lim.ok(lim.dm, 'screen', {})).key, asked = lim.w.limited.length;
  await lim.w.post('state', { token: key }, { c: lim.dm.code }); await lim.w.post('roll', { token: key, total: 3 }, { c: lim.dm.code });
  assert.equal(lim.w.limited.length, asked);
  await lim.w.post('state', { token: key + '0' }, { c: lim.dm.code });
  assert.deepEqual(lim.w.limited.slice(asked), ['/api/table/state']);
});
test('screen: when the table ends, a screen left on is told so like the phones, and its key opens nothing', async () => {
  const p = await party(['Ann']), { w, dm, call, ok } = p, old = await tv(p), screen = await tv(p, { new: true });
  await ok(dm, 'session', { save: 'place', at: 5 });
  await ok(dm, 'close', {});
  assert.deepEqual([...w.store(dm.code).m.keys()], ['closed'], 'the key went with everything else');
  for (const route of ['state'].concat(Object.keys(P2_ROUTES))) {
    const r = await call(screen, route, P2_ROUTES[route]);
    assert.equal(r.status, 410, route); assert.equal(r.text, '{"error":"This table has ended.","reason":"closed"}');
  }
  const was = await w.post('state', { token: old.token }, { c: dm.code, ip: 'an-old-key' });
  assert.equal(was.status, 404); assert.equal(was.text, NO_TABLE, 'a key that had been replaced is as unknown as ever');
  w.tick(3600000); w.sleep();
  const later = await w.post('state', { token: screen.token }, { c: dm.code, ip: 'an-hour-on' });
  assert.equal(later.status, 404); assert.equal(later.text, NO_TABLE);
});

/* ---------------- the stage ---------------- */
test('stage: the DM patches one small object a part at a time, and every device is sent each change once', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], ok, see } = p, screen = await tv(p), all = [ann, bea, dm, screen];
  const before = await see(ann);
  assert.equal(before.stageN, 0); assert.equal('stage' in before, false);
  const kept = (await ok(dm, 'keep', { image: PNG })).url;
  const stage = async (patch) => (await ok(dm, 'stage', { patch })).n, now = async (who = ann) => (await see(who)).stage;
  /* a picture held face down, then shown: each part named is replaced whole, and no other part is touched */
  const reveal = (shown) => ({ id: 'portrait', title: 'The lost portrait', img: kept, shown });
  assert.equal(await stage({ reveal: Object.assign({ secret: 'dropped' }, reveal(false)), junk: 'dropped' }), 1);
  for (const who of all) { const s = await see(who); assert.equal(s.stageN, 1); assert.deepEqual(s.stage, Object.assign({}, BARE, { reveal: reveal(false) })); }
  for (const who of all) { const s = await see(who, { afterStage: 1 }); assert.equal(s.stageN, 1); assert.equal('stage' in s, false, 'a device that has it is not sent it again'); }
  assert.equal(await stage({ sound: { bed: 'wind', level: 0.4 } }), 2);
  assert.equal(await stage({ reveal: reveal(true) }), 3);
  assert.deepEqual(await now(), Object.assign({}, BARE, { reveal: reveal(true), sound: { bed: 'wind', level: 0.4 } }));
  /* the very same patch again changes nothing and keeps the number; so does one that names no part of a stage */
  assert.equal(await stage({ reveal: reveal(true) }), 3); assert.equal(await stage({ junk: 1, n: 99, stageN: 99 }), 3); assert.equal(await stage({}), 3);
  /* a map, its regions opened one at a time */
  const regions = [{ id: 'gate', name: 'The gate', x: 0, y: 0, w: 50, h: 50 }, { id: 'vault', name: 'The vault', x: 50, y: 0, w: 50, h: 50 }, { id: 'roof', name: 'The roof', x: 0, y: 50, w: 100, h: 50 }];
  const map = (open) => ({ id: 'keep', title: 'The old keep', img: 'packs/northpole/img/dm_hq.webp', regions, open });
  assert.equal(await stage({ map: map([]) }), 4); assert.equal(await stage({ map: map(['gate']) }), 5); assert.equal(await stage({ map: map(['gate', 'roof']) }), 6);
  assert.deepEqual((await now(screen)).map, map(['gate', 'roof'])); assert.deepEqual((await now(bea)).reveal, reveal(true));
  /* whose moment it is, the turn order, and whose turn */
  const order = [{ id: ann.id, name: 'Brindle', kind: 'hero', state: 'fine', img: kept }, { id: 'goblin', name: 'A goblin', kind: 'foe', state: 'hurt', img: '' }];
  assert.equal(await stage({ spot: bea.id, order, now: 'goblin' }), 7);
  assert.deepEqual(await now(screen), { reveal: reveal(true), map: map(['gate', 'roof']), sound: { bed: 'wind', level: 0.4 }, beat: null, spot: bea.id, order, now: 'goblin' });
  /* null clears a part, and only that part */
  assert.equal(await stage({ reveal: null, sound: null }), 8);
  assert.deepEqual(await now(), Object.assign({}, BARE, { map: map(['gate', 'roof']), spot: bea.id, order, now: 'goblin' }));
  assert.equal(await stage({ map: null, spot: null, order: null, now: null, beat: null }), 9);
  assert.deepEqual(await now(), BARE);
  w.sleep();
  assert.deepEqual([(await see(bea)).stageN, (await see(bea)).stage, 'stage' in (await see(bea, { afterStage: 9 }))], [9, BARE, false]);
});
test('stage: every part is made neat, and what is not a stage at all, or is more than 16 KB, is refused', async () => {
  const p = await party(['Ann']), { w, dm, seats: [ann], call, ok, see } = p, other = await w.open();
  const kept = (await ok(dm, 'keep', { image: PNG })).url, foreign = 'api/table/img?code=' + other.code + '&id=0123456789abcdef';
  const set = async (patch) => { await ok(dm, 'stage', { patch }); return (await see(dm)).stage; };
  /* a reveal: text cut to length, a picture that is the site's or this table's own, shown only when it is true */
  let s = await set({ reveal: { id: 'i'.repeat(50), title: 'T'.repeat(90), img: foreign, shown: 'yes' } });
  assert.deepEqual(s.reveal, { id: 'i'.repeat(40), title: 'T'.repeat(80), img: '', shown: false });
  for (const img of ['https://elsewhere.example/x.png', 'img/../../secret', 'javascript:alert(1)', 7, null, { a: 1 }, PNG]) { assert.equal((await set({ reveal: { title: 'x', img } })).reveal.img, '', String(img).slice(0, 30)); }
  assert.equal((await set({ reveal: { img: kept } })).reveal.img, kept); assert.deepEqual(await set({ reveal: { img: 'img/np_elf.webp', shown: true } }), Object.assign({}, BARE, { reveal: { id: '', title: '', img: 'img/np_elf.webp', shown: true } }));
  for (const reveal of ['a picture', 7, [], {}, { id: 'only-an-id', shown: true }, { title: '   ', img: foreign }, true]) { await set({ reveal: { title: 'x' } }); assert.equal((await set({ reveal })).reveal, null, JSON.stringify(reveal)); }
  /* a map: at most twenty-four regions, each with an id, its place as percentages; only its own regions can be open */
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, name: 'Region ' + i, x: i, y: i, w: 10, h: 10 }));
  s = await set({ map: { id: 'm'.repeat(50), title: 'M'.repeat(90), img: kept, secret: 'dropped',
    regions: [{ id: 'a', name: 'N'.repeat(50), x: -5, y: 150, w: '10', h: NaN, secret: 'dropped' }, { id: 'a', name: 'the same id again' }, { name: 'no id' }, 'junk', null, { id: 'b', x: 33.33333, y: 0.126, w: 99.999, h: 1e9 }].concat(many),
    open: ['b', 'nowhere', 'a', 'b', 7, null, 'r29'] } });
  assert.deepEqual(Object.keys(s.map), ['id', 'title', 'img', 'regions', 'open']); assert.deepEqual([s.map.id, s.map.title, s.map.img], ['m'.repeat(40), 'M'.repeat(80), kept]);
  assert.equal(s.map.regions.length, 24);
  assert.deepEqual(s.map.regions.slice(0, 3), [{ id: 'a', name: 'N'.repeat(40), x: 0, y: 100, w: 0, h: 0 }, { id: 'b', name: '', x: 33.33, y: 0.13, w: 100, h: 100 }, { id: 'r0', name: 'Region 0', x: 0, y: 0, w: 10, h: 10 }]);
  assert.deepEqual(s.map.open, ['a', 'b'], 'the regions this map has, each once, in the map\'s own order');
  for (const map of ['a map', 7, [], {}, { id: 'only-an-id', regions: many }, { img: foreign }]) { await set({ map: { title: 'x' } }); assert.equal((await set({ map })).map, null, JSON.stringify(map).slice(0, 40)); }
  assert.deepEqual(await set({ map: { title: 'No regions yet', open: 'all' } }), Object.assign({}, BARE, { reveal: null, map: { id: '', title: 'No regions yet', img: '', regions: [], open: [] } }));
  /* a sound bed: a name is needed, and how loud is from 0 to 1 (as loud as it goes when not said) */
  assert.deepEqual((await set({ sound: { bed: 'b'.repeat(50), level: 0.333333, secret: 'dropped' } })).sound, { bed: 'b'.repeat(40), level: 0.33 });
  for (const [level, heard] of [[7, 1], [-1, 0], ['loud', 1], [undefined, 1], [null, 1], [0, 0], [1, 1], [0.5, 0.5]]) { assert.deepEqual((await set({ sound: { bed: 'storm', level } })).sound, { bed: 'storm', level: heard }, String(level)); }
  for (const sound of ['wind', 7, [], {}, { level: 1 }, { bed: '  ' }]) { await set({ sound: { bed: 'x' } }); assert.equal((await set({ sound })).sound, null, JSON.stringify(sound)); }
  /* the spotlight is on a seat at the table, or on nobody */
  assert.equal((await set({ spot: ann.id })).spot, ann.id);
  for (const spot of ['nobody00', 'dm', 7, [ann.id], { id: ann.id }, '']) { await set({ spot: ann.id }); assert.equal((await set({ spot })).spot, '', JSON.stringify(spot)); }
  /* the turn order: at most sixteen, each with an id and a name, a hero unless it is a foe; a turn belongs to someone in it */
  const crowd = Array.from({ length: 20 }, (_, i) => ({ id: 'f' + i, name: 'Foe ' + i, kind: 'foe' }));
  s = await set({ order: [{ id: 'i'.repeat(50), name: 'N'.repeat(70), kind: 'villain', state: 'S'.repeat(30), img: foreign, hp: 12 }, { id: 'x' }, { name: 'no id' }, 'junk', { id: 'f0', name: 'The first f0', kind: 'foe', img: kept }].concat(crowd), now: 'f3' });
  assert.equal(s.order.length, 16);
  assert.deepEqual(s.order.slice(0, 3), [{ id: 'i'.repeat(40), name: 'N'.repeat(60), kind: 'hero', state: 'S'.repeat(20), img: '' }, { id: 'f0', name: 'The first f0', kind: 'foe', state: '', img: kept }, { id: 'f1', name: 'Foe 1', kind: 'foe', state: '', img: '' }]);
  assert.deepEqual([s.order[15].id, s.now], ['f14', 'f3']);
  for (const now of ['f19', 'nobody', 7, null, ['f3'], '']) { await set({ now: 'f3' }); assert.equal((await set({ now })).now, '', JSON.stringify(now)); }
  await set({ now: 'f3' });
  assert.equal((await set({ order: [{ id: 'f1', name: 'Foe 1', kind: 'foe' }] })).now, '', 'when the order changes, a turn cannot stay with someone who is no longer in it');
  /* what is refused, leaving the stage as it was */
  const n = (await see(dm)).stageN, was = JSON.stringify((await see(dm)).stage);
  for (const patch of [undefined, null, 'reveal', 7, ['a'], true]) { const r = await call(dm, 'stage', { patch }); assert.equal(r.status, 400, String(patch)); assert.equal(r.json.reason, 'bad_stage'); assert.equal(typeof r.json.error, 'string'); }
  const sized = (k) => ({ junk: 'x'.repeat(k) });           // {"junk":"..."} is k + 11 bytes
  assert.equal((await call(dm, 'stage', { patch: sized(16373) })).status, 200, 'exactly 16 KB is taken');
  for (const patch of [sized(16374), { reveal: { title: 'é'.repeat(9000) } }, { order: Array(3000).fill({ id: 'x', name: 'y' }) }]) {
    const r = await call(dm, 'stage', { patch });
    assert.equal(r.status, 413); assert.deepEqual(r.json, { error: 'That is too much to send at once.', reason: 'too_large' });
  }
  assert.deepEqual([(await see(dm)).stageN, JSON.stringify((await see(dm)).stage)], [n, was]);
});
test('stage: every beat gets the next number and the table\'s own time, so a phone that asks late can tell how old it is', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], ok, see } = p, screen = await tv(p);
  assert.equal((await see(ann)).time, w.now(), 'every answer carries the table\'s clock');
  assert.deepEqual(await ok(dm, 'stage', { patch: { beat: { kind: 'thunder', n: 99, at: 5, secret: 'dropped' } } }), { n: 1 });
  const t1 = w.now();
  for (const who of [ann, dm, screen]) { assert.deepEqual((await see(who)).stage.beat, { n: 1, kind: 'thunder', at: t1 }); }
  /* the very same beat again is a new moment: a new number for it and for the stage */
  w.tick(4000);
  assert.deepEqual(await ok(dm, 'stage', { patch: { beat: { kind: 'thunder' } } }), { n: 2 });
  assert.deepEqual((await see(ann, { afterStage: 1 })).stage.beat, { n: 2, kind: 'thunder', at: t1 + 4000 });
  /* a phone that was asleep for a minute is sent the beat with the time it happened, and the time it is now */
  w.tick(60000);
  const late = await see(bea);
  assert.deepEqual([late.stage.beat.n, late.time - late.stage.beat.at], [2, 60000]);
  /* a patch with no beat in it does not sound the last one again: the beat keeps its number and its time */
  assert.deepEqual(await ok(dm, 'stage', { patch: { spot: ann.id } }), { n: 3 });
  assert.deepEqual((await see(bea)).stage.beat, { n: 2, kind: 'thunder', at: t1 + 4000 });
  /* a kind is needed and is cut to twenty letters; anything else, or null, clears the beat */
  assert.deepEqual(await ok(dm, 'stage', { patch: { beat: { kind: 'k'.repeat(30) } } }), { n: 4 });
  assert.deepEqual((await see(bea)).stage.beat, { n: 3, kind: 'k'.repeat(20), at: w.now() });
  for (const beat of [{}, { kind: '  ' }, 'thunder', 7, ['thunder'], null]) {
    await ok(dm, 'stage', { patch: { beat: { kind: 'hit' } } });
    await ok(dm, 'stage', { patch: { beat } });
    assert.equal((await see(bea)).stage.beat, null, JSON.stringify(beat));
  }
  /* and the numbers carry on through a sleep and a fresh start: no beat is ever numbered like an earlier one */
  w.sleep();
  await ok(dm, 'reset', {});
  await ok(dm, 'stage', { patch: { beat: { kind: 'bell' } } });
  assert.deepEqual((await see(ann)).stage.beat, { n: 10, kind: 'bell', at: w.now() });
});
test('a picture the stage shows is not deleted from under it', async () => {
  const p = await party(['Ann']), { w, dm, seats: [ann], ok, see } = p, shown = async (url) => (await w.request('GET', '/' + url)).status;
  const face = (await ok(ann, 'me', { portrait: PNG })).portrait;
  await ok(dm, 'send', { title: 'Painted', image: PNG }); await ok(dm, 'send', { title: 'A map', image: PNG }); await ok(dm, 'send', { title: 'Gone', image: PNG });
  const [one, two, three] = (await see(dm)).feed.map((f) => f.img);
  await ok(dm, 'stage', { patch: { reveal: { title: 'Painted', img: one }, map: { title: 'A map', img: two }, order: [{ id: 'npc', name: 'An old friend', img: face }] } });
  for (const n of [1, 2, 3]) { await ok(dm, 'unsend', { n }); }
  await ok(ann, 'me', { clearPortrait: true });
  assert.deepEqual([await shown(one), await shown(two), await shown(three), await shown(face)], [200, 200, 404, 200]);
  assert.equal(w.saved(dm.code).stored, 3);
});

/* ---------------- votes ---------------- */
test('vote: the DM puts a question, each seat picks once and may change its mind, and closing it tells everyone how it went', async () => {
  const p = await party(['Ann', 'Bea', 'Cal']), { w, dm, seats: [ann, bea, cal], call, ok, see } = p, screen = await tv(p);
  assert.deepEqual((await see(ann)).votes, []);
  /* what is not a vote */
  for (const q of [undefined, '', '   ', { a: 1 }, null]) { const r = await call(dm, 'vote', { q, options: ['a', 'b'] }); assert.equal(r.status, 400, String(q)); assert.equal(r.json.reason, 'empty'); }
  for (const options of [undefined, [], ['only one'], ['a', '', '  ', null], 'ab', { 0: 'a', 1: 'b' }, ['a', 'b', 'c', 'd', 'e'], Array(50).fill('x')]) {
    const r = await call(dm, 'vote', { q: 'Which way?', options });
    assert.equal(r.status, 400, JSON.stringify(options)); assert.deepEqual(r.json, { error: 'A vote needs two, three or four choices.', reason: 'bad_options' });
  }
  assert.deepEqual((await see(dm)).votes, [], 'refused votes left nothing behind');
  assert.deepEqual(await ok(dm, 'vote', { q: 'Q'.repeat(130), options: ['O'.repeat(50), ' Right ', 7, '', 'Back'], extra: 'dropped' }), { n: 1 });
  const vote = { n: 1, q: 'Q'.repeat(120), options: ['O'.repeat(40), 'Right', '7', 'Back'] };
  assert.deepEqual((await see(dm)).votes, [Object.assign({ open: true, mine: null, counts: [0, 0, 0, 0] }, vote)]);
  /* a ballot is for the vote that is on the table, and for one of its choices; the DM has none */
  for (const n of [2, 0, '1', null, undefined]) { const r = await call(ann, 'ballot', { n, pick: 0 }); assert.equal(r.status, 409, String(n)); assert.deepEqual(r.json, { error: 'That vote is no longer on the table.', reason: 'no_vote' }); }
  for (const pick of [-1, 4, 1.5, '0', null, undefined, [0], true]) { const r = await call(ann, 'ballot', { n: 1, pick }); assert.equal(r.status, 400, String(pick)); assert.equal(r.json.reason, 'bad_pick'); }
  const self = await call(dm, 'ballot', { n: 1, pick: 0 });
  assert.equal(self.status, 403); assert.equal(self.json.reason, 'player_only');
  assert.deepEqual((await see(dm)).votes[0].counts, [0, 0, 0, 0]);
  assert.deepEqual(await ok(ann, 'ballot', { n: 1, pick: 0 }), { ok: true, mine: 0 });
  assert.deepEqual(await ok(bea, 'ballot', { n: 1, pick: 3 }), { ok: true, mine: 3 });
  assert.deepEqual(await ok(cal, 'ballot', { n: 1, pick: 3 }), { ok: true, mine: 3 });
  assert.deepEqual((await see(screen)).votes[0].counts, [1, 0, 0, 2]);
  /* a second ballot replaces the first: there is still one a seat */
  assert.deepEqual(await ok(cal, 'ballot', { n: 1, pick: 1 }), { ok: true, mine: 1 });
  assert.deepEqual(await ok(cal, 'ballot', { n: 1, pick: 1 }), { ok: true, mine: 1 });
  w.sleep();
  assert.deepEqual((await see(dm)).votes[0].counts, [1, 1, 0, 1]); assert.deepEqual(w.saved(dm.code).vote.picks, { [ann.id]: 0, [bea.id]: 3, [cal.id]: 1 });
  assert.deepEqual([(await see(ann)).votes[0].mine, (await see(bea)).votes[0].mine, (await see(cal)).votes[0].mine], [0, 3, 1]);
  /* an open vote waits as long as it takes */
  w.tick(3 * 3600 * 1000);
  assert.deepEqual((await see(ann)).votes, [Object.assign({ open: true, mine: 0 }, vote)]);
  /* closing: only the vote that is on the table, and once is enough */
  for (const n of [2, '1', null, undefined]) { assert.deepEqual(await ok(dm, 'vote', { n, close: true }), { closed: false }, String(n)); }
  assert.equal((await see(ann)).votes[0].open, true);
  assert.deepEqual(await ok(dm, 'vote', { n: 1, close: true }), { closed: true });
  w.tick(1000);
  assert.deepEqual(await ok(dm, 'vote', { n: 1, close: true }), { closed: true }, 'closing it twice is no trouble');
  const late = await call(bea, 'ballot', { n: 1, pick: 0 });
  assert.equal(late.status, 409); assert.deepEqual(late.json, { error: 'That vote has closed.', reason: 'vote_closed' });
  for (const [who, mine] of [[ann, 0], [bea, 3], [cal, 1], [dm, null], [screen, null]]) { assert.deepEqual((await see(who)).votes, [Object.assign({ open: false, mine, counts: [1, 1, 0, 1] }, vote)]); }
  /* everyone is told for ten minutes, counted from when it was first closed, and then it is off the table */
  w.tick(598000); w.sleep();
  assert.equal((await see(cal)).votes.length, 1);
  w.tick(1000);
  for (const who of [ann, dm, screen]) { assert.deepEqual((await see(who)).votes, []); }
  assert.equal((await call(bea, 'ballot', { n: 1, pick: 0 })).json.reason, 'vote_closed');
  /* opening a vote lets go of the one before, open or not */
  assert.deepEqual(await ok(dm, 'vote', { q: 'Second?', options: ['Yes', 'No'] }), { n: 2 });
  await ok(ann, 'ballot', { n: 2, pick: 1 });
  assert.deepEqual(await ok(dm, 'vote', { q: 'Third?', options: ['Yes', 'No', 'Maybe'] }), { n: 3 });
  assert.equal((await call(ann, 'ballot', { n: 2, pick: 1 })).json.reason, 'no_vote');
  assert.deepEqual((await see(dm)).votes, [{ n: 3, q: 'Third?', options: ['Yes', 'No', 'Maybe'], open: true, mine: null, counts: [0, 0, 0] }]);
  assert.deepEqual((await see(ann)).votes, [{ n: 3, q: 'Third?', options: ['Yes', 'No', 'Maybe'], open: true, mine: null }]);
});

/* ---------------- hero tokens ---------------- */
test('award and spend: a seat holds from none to five hero tokens, and spending one is seen by the whole table', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], call, ok, see } = p, screen = await tv(p);
  for (const give of [0, 2, -2, '1', true, null, undefined, 1.5, [1]]) { const r = await call(dm, 'award', { id: ann.id, give }); assert.equal(r.status, 400, String(give)); assert.equal(r.json.reason, 'bad_give'); }
  for (const id of ['nobody00', 'dm', 7, null, undefined, [ann.id]]) { const r = await call(dm, 'award', { id, give: 1 }); assert.equal(r.status, 409, String(id)); assert.deepEqual(r.json, { error: 'That player is no longer at this table.', reason: 'no_seat' }); }
  const none = await call(dm, 'award', { id: ann.id, give: -1 });
  assert.equal(none.status, 409); assert.deepEqual(none.json, { error: 'Ann has none to take back.', reason: 'none' });
  for (let i = 1; i <= 5; i++) { assert.deepEqual(await ok(dm, 'award', { id: ann.id, give: 1 }), { id: ann.id, tokens: i }); }
  const full = await call(dm, 'award', { id: ann.id, give: 1 });
  assert.equal(full.status, 409); assert.deepEqual(full.json, { error: 'Ann already holds five, and that is as many as a hero can.', reason: 'full' });
  w.sleep();
  /* everyone can see who holds how many; a seat with none looks as it always did */
  for (const who of [ann, bea, dm, screen]) { assert.deepEqual((await see(who)).players, [{ id: ann.id, name: 'Ann', char: null, portrait: '', tokens: 5 }, { id: bea.id, name: 'Bea', char: null, portrait: '' }]); }
  /* spending is a player's, and takes a token to spend */
  const broke = await call(bea, 'spend', {});
  assert.equal(broke.status, 409); assert.deepEqual(broke.json, { error: 'You have no hero tokens to spend.', reason: 'none' });
  const self = await call(dm, 'spend', {});
  assert.equal(self.status, 403); assert.equal(self.json.reason, 'player_only');
  assert.equal((await see(dm)).lastRoll, 0, 'neither left a line in the roll feed');
  /* a roll, a token, and the second try straight after: a token is not a roll, so the dice are not "still rolling" */
  assert.deepEqual(await ok(ann, 'roll', { total: 3, label: 'Leap the gap' }), { n: 1 });
  w.tick(1000);
  assert.deepEqual(await ok(ann, 'spend', { label: 'L'.repeat(70), extra: 'dropped' }), { n: 2, tokens: 4 });
  assert.deepEqual(await ok(ann, 'roll', { total: 18, label: 'Leap the gap' }), { n: 3 });
  assert.equal((await call(ann, 'roll', { total: 18 })).json.reason, 'slow', 'a real roll still is');
  for (const who of [ann, bea, dm, screen]) {
    const s = await see(who);
    assert.deepEqual(s.rolls[1], { n: 2, id: ann.id, name: 'Ann', role: 'player', label: 'L'.repeat(60), kind: 'token', total: 0, nat: 0, detail: '', dice: [], at: w.now() });
    assert.deepEqual(s.rolls.map((r) => r.kind), ['free', 'token', 'free']); assert.equal(s.players[0].tokens, 4);
  }
  /* the DM can take one back; spent or taken down to none, the count is gone from the seat */
  assert.deepEqual(await ok(dm, 'award', { id: ann.id, give: -1 }), { id: ann.id, tokens: 3 });
  for (let left = 2; left >= 0; left--) { assert.equal((await ok(ann, 'spend', {})).tokens, left); }
  assert.equal((await call(ann, 'spend', {})).json.reason, 'none');
  assert.deepEqual((await see(bea)).players[0], { id: ann.id, name: 'Ann', char: null, portrait: '' });
  assert.equal('tokens' in w.saved(dm.code).players[0], false); assert.equal((await see(dm)).lastRoll, 6);
});
test('spend with `request`: the seat\'s roll for that request is taken back, so the next one is the one that counts', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], call, ok, see } = p;
  await ok(dm, 'request', { to: 'all', label: 'Leap the gap', target: 12, yes: 'Over you go.', no: 'Down you go.' });       // 1
  await ok(dm, 'request', { to: [bea.id], label: 'Bea only' });                                                          // 2
  assert.deepEqual(await ok(ann, 'roll', { total: 5, request: 1 }), { n: 1, pass: false, say: 'Down you go.' });
  /* no token, no second try */
  assert.equal((await call(ann, 'spend', { request: 1 })).json.reason, 'none');
  await ok(dm, 'award', { id: ann.id, give: 1 }); await ok(dm, 'award', { id: ann.id, give: 1 }); await ok(dm, 'award', { id: bea.id, give: 1 });
  /* a request this seat has not rolled for, was never asked, or that is not there, costs nothing */
  for (const [who, request] of [[ann, 2], [ann, 99], [ann, '1'], [ann, 'constructor'], [bea, 1], [bea, 2]]) {
    const r = await call(who, 'spend', { request });
    assert.equal(r.status, 409, who.name + ' ' + request); assert.deepEqual(r.json, { error: 'You have not rolled for that one yet.', reason: 'no_roll' });
  }
  assert.deepEqual((await see(dm)).players.map((x) => x.tokens), [2, 1]); assert.equal((await see(dm)).lastRoll, 1);
  /* the token is spent, the first roll is gone from the request, and the dice that were rolled stay in the roll feed */
  w.tick(1000);
  assert.deepEqual(await ok(ann, 'spend', { request: 1, label: 'Leap the gap' }), { n: 2, tokens: 1 });
  assert.deepEqual((await see(dm)).requests[0].results, {}); assert.equal('mine' in (await see(ann)).requests[0], false);
  assert.deepEqual(await ok(ann, 'roll', { total: 15, request: 1 }), { n: 3, pass: true, say: 'Over you go.' });
  assert.deepEqual((await see(ann)).requests[0].mine, { total: 15, nat: 0, pass: true, say: 'Over you go.' });
  assert.deepEqual((await see(bea)).rolls.map((r) => [r.kind, r.total]), [['free', 5], ['token', 0], ['free', 15]]);
  /* a roll the DM has called off cannot be tried again, and the token is kept */
  await ok(dm, 'cancel', { n: 1 });
  const off = await call(ann, 'spend', { request: 1 });
  assert.equal(off.status, 409); assert.deepEqual(off.json, { error: 'The DM has called that roll off.', reason: 'request_closed' });
  assert.equal((await see(ann)).players[0].tokens, 1); assert.equal((await see(dm)).requests[0].results[ann.id].total, 15);
});

/* ---------------- reactions ---------------- */
test('react: one mark from each seat on each thing, the same again takes it off, and the table keeps the last sixty things', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], call, ok, see } = p, screen = await tv(p);
  await ok(dm, 'send', { text: 'A note.' }); await ok(ann, 'roll', { total: 20, nat: 20, dice: [{ sides: 20, value: 20 }] }); await ok(dm, 'scene', { scene: { title: 'The vault' } });
  assert.deepEqual([(await see(ann)).reacts, (await see(ann)).reacted], [{}, {}]);
  /* something sent, a roll and a scene can each be reacted to, by a player or the DM, with any of the six marks */
  for (const [who, on, mark] of [[ann, 'feed:1', 'cheer'], [bea, 'feed:1', 'cheer'], [dm, 'feed:1', 'wow'], [bea, 'roll:1', 'clap'], [dm, 'scene:1', 'heart'], [ann, 'scene:1', 'laugh'], [bea, 'scene:1', 'gasp']]) { assert.deepEqual(await ok(who, 'react', { on, mark, extra: 'dropped' }), { on, mark }); }
  const all = { 'feed:1': { cheer: 2, wow: 1 }, 'roll:1': { clap: 1 }, 'scene:1': { heart: 1, laugh: 1, gasp: 1 } };
  w.sleep();
  for (const who of [ann, bea, dm, screen]) { assert.deepEqual((await see(who)).reacts, all); }
  assert.deepEqual([(await see(ann)).reacted, (await see(dm)).reacted, 'reacted' in (await see(screen))], [{ 'feed:1': 'cheer', 'scene:1': 'laugh' }, { 'feed:1': 'wow', 'scene:1': 'heart' }, false]);
  /* another mark replaces the first; the same mark again takes it off */
  assert.deepEqual(await ok(ann, 'react', { on: 'feed:1', mark: 'laugh' }), { on: 'feed:1', mark: 'laugh' });
  assert.deepEqual((await see(bea)).reacts['feed:1'], { cheer: 1, wow: 1, laugh: 1 });
  assert.deepEqual(await ok(ann, 'react', { on: 'feed:1', mark: 'laugh' }), { on: 'feed:1', mark: '' });
  assert.deepEqual((await see(bea)).reacts['feed:1'], { cheer: 1, wow: 1 }); assert.deepEqual((await see(ann)).reacted, { 'scene:1': 'laugh' });
  /* a thing nobody marks any more is let go */
  assert.deepEqual(await ok(bea, 'react', { on: 'roll:1', mark: 'clap' }), { on: 'roll:1', mark: '' });
  assert.equal('roll:1' in (await see(dm)).reacts, false); assert.equal(w.saved(dm.code).reacts.length, 2);
  /* what is refused: something that is not a thing, a mark that is not one of the six, a thing that is not on the table */
  for (const on of [undefined, null, 7, '', 'feed', 'feed:', 'feed:0', 'feed:01', 'feed:1.5', 'feed:-1', 'feed:1 ', ' feed:1', 'FEED:1', 'note:1', 'feed:1234567890', ['feed:1'], { on: 'feed:1' }, 'constructor:1']) {
    const r = await call(ann, 'react', { on, mark: 'cheer' });
    assert.equal(r.status, 400, String(on)); assert.equal(r.json.reason, 'bad_thing');
  }
  for (const mark of [undefined, null, '', 'boo', 'CHEER', 7, ['cheer'], 'constructor']) { const r = await call(ann, 'react', { on: 'feed:1', mark }); assert.equal(r.status, 400, String(mark)); assert.equal(r.json.reason, 'bad_mark'); }
  for (const on of ['feed:2', 'roll:2', 'scene:2', 'feed:999999999']) { const r = await call(ann, 'react', { on, mark: 'cheer' }); assert.equal(r.status, 409, on); assert.deepEqual(r.json, { error: 'That is no longer on the table.', reason: 'no_thing' }); }
  assert.equal(w.saved(dm.code).reacts.length, 2, 'refused reactions left nothing behind');
  /* taking back what was sent takes its reactions with it */
  await ok(dm, 'unsend', { n: 1 });
  assert.deepEqual(Object.keys((await see(bea)).reacts), ['scene:1']);
  /* the last sixty things: the oldest are let go */
  for (let i = 2; i <= 71; i++) { await ok(dm, 'send', { text: 'Note ' + i }); await ok(bea, 'react', { on: 'feed:' + i, mark: 'heart' }); }
  const kept = Object.keys((await see(ann)).reacts);
  assert.equal(kept.length, 60); assert.deepEqual([kept[0], kept[59]], ['feed:12', 'feed:71']); assert.equal(w.saved(dm.code).reacts.length, 60);
  /* reacting to an old one makes it one of the newest again */
  await ok(ann, 'react', { on: 'feed:12', mark: 'wow' }); await ok(dm, 'send', { text: 'One more' }); await ok(bea, 'react', { on: 'feed:72', mark: 'heart' });
  const now = Object.keys((await see(ann)).reacts);
  assert.equal(now.length, 60); assert.ok(now.includes('feed:12')); assert.ok(!now.includes('feed:13'));
});

/* ---------------- bonds and hooks ---------------- */
test('me: a bond is for the table to see and a hook for its player and the DM; null takes either away, and leaving them out changes nothing', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], call, ok, see } = p;
  const r = await ok(ann, 'me', { bond: { to: bea.id, prompt: 'P'.repeat(170), text: 'T'.repeat(210), secret: 'dropped' }, hook: { id: 'h'.repeat(50), text: 'H'.repeat(250), roles: ['dropped'] } });
  assert.deepEqual(r, { ok: true, portrait: '', name: 'Ann' }, 'the answer is the one it has always been');
  const bond = { to: bea.id, prompt: 'P'.repeat(160), text: 'T'.repeat(200) }, hook = { id: 'h'.repeat(40), text: 'H'.repeat(240) }, seat = { id: ann.id, name: 'Ann', char: null, portrait: '' };
  assert.deepEqual((await see(dm)).players[0], Object.assign({ bond, hook }, seat)); assert.deepEqual((await see(ann)).players[0], Object.assign({ bond, hook }, seat));
  assert.deepEqual((await see(bea)).players[0], Object.assign({ bond }, seat));
  /* a phone on last month's page sends neither, and neither is touched */
  await ok(ann, 'me', { name: 'Annie', char: { name: 'Brindle' }, save: '{}' }); await ok(ann, 'me', {});
  w.sleep();
  assert.deepEqual([(await see(ann)).players[0].bond, (await see(ann)).players[0].hook], [bond, hook]);
  /* a prompt alone, or the words alone, is a bond; an id alone, or the words alone, is a hook */
  await ok(ann, 'me', { bond: { to: bea.id, prompt: 'Why do you trust her?' }, hook: { id: 'debt' } });
  assert.deepEqual([(await see(ann)).players[0].bond, (await see(ann)).players[0].hook], [{ to: bea.id, prompt: 'Why do you trust her?', text: '' }, { id: 'debt', text: '' }]);
  await ok(ann, 'me', { bond: { to: bea.id, text: 'We grew up together.' }, hook: { text: 'I am looking for my brother.' } });
  const kept = [{ to: bea.id, prompt: '', text: 'We grew up together.' }, { id: '', text: 'I am looking for my brother.' }];
  assert.deepEqual([(await see(ann)).players[0].bond, (await see(ann)).players[0].hook], kept);
  /* what is refused; and a refused call changes nothing at all: not the name, not the hero, not a picture */
  const bad = [[{ bond: 'Bea' }, 400, 'bad_bond'], [{ bond: 7 }, 400, 'bad_bond'], [{ bond: [bea.id] }, 400, 'bad_bond'], [{ bond: {} }, 400, 'bad_bond'], [{ bond: { to: bea.id } }, 400, 'bad_bond'], [{ bond: { to: bea.id, prompt: '  ', text: '' } }, 400, 'bad_bond'],
    [{ bond: { to: ann.id, text: 'I trust myself.' } }, 400, 'bad_bond'], [{ bond: { to: 7, text: 'x' } }, 400, 'bad_bond'], [{ bond: { text: 'x' } }, 400, 'bad_bond'], [{ bond: { to: 'nobody00', text: 'x' } }, 409, 'no_seat'], [{ bond: { to: 'dm', text: 'x' } }, 409, 'no_seat'],
    [{ hook: 'debt' }, 400, 'bad_hook'], [{ hook: 7 }, 400, 'bad_hook'], [{ hook: ['debt'] }, 400, 'bad_hook'], [{ hook: {} }, 400, 'bad_hook'], [{ hook: { id: ' ', text: '' } }, 400, 'bad_hook'], [{ bond: null, hook: 'debt' }, 400, 'bad_hook']];
  for (const [body, status, reason] of bad) {
    const no = await call(ann, 'me', Object.assign({ name: 'Zed', char: { name: 'Should not stick' }, portrait: PNG, save: 'nor this' }, body));
    assert.equal(no.status, status, JSON.stringify(body)); assert.equal(no.json.reason, reason, JSON.stringify(body)); assert.equal(typeof no.json.error, 'string');
  }
  const hero = { name: 'Brindle', race: '', cls: '', line: '', look: '' };
  assert.deepEqual((await see(dm)).players[0], { id: ann.id, name: 'Annie', char: hero, portrait: '', bond: kept[0], hook: kept[1] });
  assert.deepEqual([...w.store(dm.code).m.keys()].sort(), ['save:' + ann.id, 't'], 'no picture was stored for a call that was refused'); assert.equal(w.saved(dm.code).stored, 0);
  assert.equal(w.store(dm.code).m.get('save:' + ann.id), '{}');
  /* null takes one away and leaves the other */
  await ok(ann, 'me', { bond: null });
  assert.deepEqual((await see(bea)).players[0], { id: ann.id, name: 'Annie', char: hero, portrait: '' }); assert.deepEqual((await see(dm)).players[0].hook, kept[1]);
  await ok(ann, 'me', { hook: null, bond: { to: bea.id, text: 'Back again.' } });
  assert.deepEqual((await see(dm)).players[0], { id: ann.id, name: 'Annie', char: hero, portrait: '', bond: { to: bea.id, prompt: '', text: 'Back again.' } });
  assert.deepEqual(Object.keys(w.saved(dm.code).players[0]).sort(), ['bond', 'char', 'id', 'name', 'old', 'portrait', 'portraits', 'token']);
});

test('how a hero talks is kept with the seat, for the DM and that player alone', async () => {
  const p = await party(['Ann', 'Bea']), { dm, seats: [ann, bea], call, ok, see } = p, screen = await tv(p);
  const of = (j, id) => j.players.filter((x) => x.id === id)[0];
  await ok(ann, 'me', { name: 'Ann', voice: '  Gruff and short  ' });
  assert.equal(of(await see(dm), ann.id).voice, 'Gruff and short'); assert.equal(of(await see(ann), ann.id).voice, 'Gruff and short');
  assert.equal(of(await see(bea), ann.id).voice, undefined, 'not another player'); assert.doesNotMatch((await call(screen, 'state', {})).text, /Gruff/, 'not the big screen');
  /* leaving it out leaves it be; an empty one takes it away; anything that is not words changes nothing */
  await ok(ann, 'me', { name: 'Ann' }); assert.equal(of(await see(dm), ann.id).voice, 'Gruff and short');
  for (const bad of [null, 7, ['x'], { label: 'x' }]) { await ok(ann, 'me', { name: 'Ann', voice: bad }); assert.equal(of(await see(dm), ann.id).voice, 'Gruff and short'); }
  await ok(ann, 'me', { name: 'Ann', voice: 'x'.repeat(500) }); assert.equal(of(await see(dm), ann.id).voice.length, 60);
  await ok(ann, 'me', { name: 'Ann', voice: '' }); assert.equal(of(await see(dm), ann.id).voice, undefined);
});
/* ---------------- the DM's session, and a fresh start ---------------- */
test('session: a save made on top of an older save is refused, so two DM devices never take the story backwards unseen', async () => {
  const p = await party(['Ann']), { dm, call, ok, see } = p;
  /* the first save is made on top of nothing */
  assert.deepEqual(await ok(dm, 'session', { save: 'one', at: 100, base: 0 }), { ok: true, at: 100 });
  /* a device that last saw "nothing" is behind: refused, told why, and nothing changes */
  const late = await call(dm, 'session', { save: 'from the device that was offline', at: 90, base: 0 });
  assert.equal(late.status, 409); assert.equal(late.json.reason, 'stale');
  assert.deepEqual(await ok(dm, 'session', { get: true }), { save: 'one', at: 100 }); assert.equal((await see(dm)).sessionAt, 100);
  /* a newer time does not get a stale save through: it is what the save was made on top of that counts */
  assert.equal((await call(dm, 'session', { save: 'newer clock, old base', at: 500, base: 40 })).json.reason, 'stale');
  /* made on top of the save that is there: kept */
  assert.deepEqual(await ok(dm, 'session', { save: 'two', at: 200, base: 100 }), { ok: true, at: 200 });
  assert.equal((await call(dm, 'session', { save: 'three', at: 300, base: 100 })).status, 409);
  assert.deepEqual(await ok(dm, 'session', { get: true }), { save: 'two', at: 200 });
  /* a save that names no base (or a base that is no number) is kept as it comes, as before */
  for (const base of [undefined, null, 'x', -1, 1.5]) { assert.equal((await call(dm, 'session', { save: 'plain', at: 250, base })).status, 200, String(base)); }
  /* asking never trips on it, and clearing is always allowed */
  assert.deepEqual(await ok(dm, 'session', { get: true, base: 1 }), { save: 'plain', at: 250 });
  assert.deepEqual(await ok(dm, 'session', { save: '', base: 1 }), { ok: true, at: 0 });
  assert.deepEqual(await ok(dm, 'session', { save: 'again', at: 400, base: 0 }), { ok: true, at: 400 });
});
test('session: the DM\'s place in the story is kept exactly as it came, beside the table\'s blob, and only the DM is told of it', async () => {
  const p = await party(['Ann']), { w, dm, seats: [ann], call, ok, see } = p, screen = await tv(p);
  assert.equal((await see(dm)).sessionAt, 0); assert.deepEqual(await ok(dm, 'session', { get: true }), { save: '', at: 0 });
  /* it is the page's own business: here it is not JSON, and has in it what a tidy-up would have taken out */
  const save = '{"unclosed": [1, 2, "__proto__", </script> \u0000\u0007\t\n  é☃ SESSION-MARK ' + 'x'.repeat(500) + '   ';
  assert.deepEqual(await ok(dm, 'session', { save, at: 1700000000123 }), { ok: true, at: 1700000000123 });
  assert.deepEqual(await ok(dm, 'session', { get: true }), { save, at: 1700000000123 });
  assert.equal((await see(dm)).sessionAt, 1700000000123);
  assert.equal(w.store(dm.code).m.get('session'), save); assert.doesNotMatch(JSON.stringify(w.saved(dm.code)), /SESSION-MARK|unclosed/, 'kept beside the table, not in the blob every roll rewrites');
  for (const who of [ann, dm, screen]) { assert.doesNotMatch((await call(who, 'state', {})).text, /SESSION-MARK|unclosed/); }
  for (const who of [ann, screen]) { assert.doesNotMatch((await call(who, 'state', {})).text, /session/i); }
  w.sleep();
  assert.deepEqual(await ok(dm, 'session', { get: true }), { save, at: 1700000000123 });
  assert.deepEqual(await ok(dm, 'session', { get: true, save: 'not stored', at: 9 }), { save, at: 1700000000123 }, 'asking never overwrites');
  /* when the page does not say when, or says something that is not a time, the table's own clock is used */
  for (const at of [undefined, null, 'soon', -5, 0, 1.5, [1]]) { w.tick(1000); assert.deepEqual(await ok(dm, 'session', { save: 'second', at }), { ok: true, at: w.now() }, String(at)); }
  /* 60,000 characters are taken, one more is not, and what was there stays */
  const big = 'é'.repeat(60000);
  assert.equal((await call(dm, 'session', { save: big, at: 5 })).status, 200); assert.equal((await ok(dm, 'session', { get: true })).save, big);
  const over = await call(dm, 'session', { save: big + 'x', at: 6 });
  assert.equal(over.status, 413); assert.deepEqual(over.json, { error: 'That is too much to send at once.', reason: 'too_large' });
  for (const bad of [undefined, null, 7, true, { place: 'vault' }, ['vault']]) { const r = await call(dm, 'session', { save: bad }); assert.equal(r.status, 400, String(bad)); assert.equal(r.json.reason, 'bad_session'); }
  assert.deepEqual(await ok(dm, 'session', { get: true }), { save: big, at: 5 });
  assert.ok(Buffer.byteLength(JSON.stringify(w.saved(dm.code))) < 2000, 'the table itself is no bigger for it');
  /* an empty save clears it */
  assert.deepEqual(await ok(dm, 'session', { save: '', at: 7 }), { ok: true, at: 0 });
  assert.deepEqual(await ok(dm, 'session', { get: true }), { save: '', at: 0 }); assert.equal((await see(dm)).sessionAt, 0); assert.equal(w.store(dm.code).m.has('session'), false);
  /* and it goes when the table does */
  await ok(dm, 'session', { save: 'last', at: 8 }); await ok(dm, 'close', {});
  assert.deepEqual([...w.store(dm.code).m.keys()], ['closed']);
});
test('reset: what was played is cleared away, the people stay, and no number is ever used twice', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], call, ok, see } = p, screen = await tv(p);
  const shown = async (url) => (await w.request('GET', '/' + url)).status;
  /* the people: a saved hero with a portrait, a bond, a hook and tokens */
  const face = (await ok(ann, 'me', { save: '{"hp":7}', portrait: PNG, char: { name: 'Brindle', cls: 'Scout' }, bond: { to: bea.id, text: 'We grew up together.' }, hook: { id: 'debt', text: 'I owe the baker.' } })).portrait;
  await ok(dm, 'award', { id: ann.id, give: 1 }); await ok(dm, 'award', { id: ann.id, give: 1 });
  /* the run: things sent (some with pictures), dice, a proposal, a request, a vote, reactions, a scene and a stage */
  const both = (await ok(dm, 'keep', { image: PNG })).url, sceneOnly = (await ok(dm, 'keep', { image: PNG })).url, stageOnly = (await ok(dm, 'keep', { image: PNG })).url;
  await ok(dm, 'send', { text: 'One' });                                             // 1
  await ok(dm, 'send', { title: 'Painted', image: PNG });                             // 2: a picture only the feed shows
  await ok(dm, 'send', { title: 'Meet Brindle', image: face });                       // 3: a portrait still worn
  await ok(dm, 'send', { to: bea.id, text: 'For Bea alone.', image: PNG });           // 4: a private picture
  await ok(dm, 'send', { title: 'The vault', image: both });                          // 5: shown in the feed and in the scene
  await ok(dm, 'send', { text: 'Taken back' }); await ok(dm, 'unsend', { n: 6 });     // 6
  const d0 = await see(dm), painted = d0.feed[1].img, whisper = d0.feed[3].img;
  await ok(dm, 'scene', { scene: { title: 'The gate' } });
  await ok(dm, 'scene', { scene: { title: 'The vault', img: both, people: [{ name: 'Dot', img: sceneOnly }] } });
  await ok(dm, 'stage', { patch: { reveal: { title: 'A portrait', img: stageOnly, shown: true }, spot: ann.id, sound: { bed: 'wind' }, beat: { kind: 'thunder' }, order: [{ id: ann.id, name: 'Brindle', img: face }], now: ann.id } });
  await ok(ann, 'roll', { total: 12 }); await ok(bea, 'roll', { total: 7 }); await ok(ann, 'spend', {});                 // rolls 1, 2 and 3
  await ok(ann, 'propose', { kind: 'intent', text: 'I look around.' }); await ok(dm, 'request', { to: 'all', label: 'Look around', target: 10 });
  await ok(dm, 'vote', { q: 'Left or right?', options: ['Left', 'Right'] }); await ok(ann, 'ballot', { n: 1, pick: 0 });
  await ok(bea, 'react', { on: 'feed:1', mark: 'cheer' }); await ok(dm, 'react', { on: 'roll:1', mark: 'wow' });
  await ok(dm, 'session', { save: 'the story so far', at: 42 });
  const d1 = await see(dm), people = d1.players;
  assert.equal(w.saved(dm.code).stored, 6); assert.deepEqual([d1.last, d1.lastRoll, d1.sceneN, d1.stageN, d1.floor], [6, 3, 2, 1, 0]);
  assert.deepEqual(people[0], { id: ann.id, name: 'Ann', char: { name: 'Brindle', race: '', cls: 'Scout', line: '', look: '' }, portrait: face, tokens: 1, bond: { to: bea.id, prompt: '', text: 'We grew up together.' }, hook: { id: 'debt', text: 'I owe the baker.' } });
  /* the fresh start */
  assert.deepEqual(await ok(dm, 'reset', {}), { ok: true, floor: 7 });
  w.sleep();
  for (const who of [ann, bea, dm, screen]) {
    const s = await see(who, { after: 0, afterRoll: 0, afterScene: 0, afterStage: 0 });
    assert.deepEqual([s.feed, s.rolls, s.pulled, s.requests, s.votes, s.reacts, s.scene, s.stage], [[], [], [], [], [], {}, null, BARE]);
    assert.deepEqual([s.last, s.lastRoll, s.sceneN, s.stageN, s.floor], [7, 7, 7, 2, 7]);
    if (who !== screen) { assert.deepEqual([s.asks, s.reacted], [[], {}]); }
  }
  const t = w.saved(dm.code);
  assert.deepEqual([t.feed, t.rolls, t.pulled, t.asks, t.reqs, t.vote, t.reacts, t.scene, t.stage], [[], [], [], [], [], null, [], null, BARE]);
  /* a phone that has caught up is not sent the empty scene and stage again */
  const caught = await see(ann, { after: 7, afterRoll: 7, afterScene: 7, afterStage: 2 });
  assert.equal('scene' in caught, false); assert.equal('stage' in caught, false);
  /* the people are as they were: seats, heroes, portraits, bonds, hooks and tokens, and the hero each phone would get back */
  assert.deepEqual((await see(dm)).players, people); assert.equal(w.store(dm.code).m.get('save:' + ann.id), '{"hp":7}');
  assert.equal((await see(screen)).players[0].bond.text, 'We grew up together.');
  assert.deepEqual(await ok(dm, 'session', { get: true }), { save: 'the story so far', at: 42 }, 'the DM\'s saved place is for the DM\'s page to replace');
  /* a picture only the feed showed is deleted; a portrait still worn, and what the scene and the stage showed, are not */
  assert.deepEqual([await shown(painted), await shown(whisper), await shown(face), await shown(both), await shown(sceneOnly), await shown(stageOnly)], [404, 404, 200, 200, 200, 200]);
  assert.equal(w.saved(dm.code).stored, 4);
  /* nothing starts counting again: whatever a phone holds numbered seven or below is from before */
  assert.deepEqual(await ok(dm, 'send', { text: 'A new day.' }), { ok: true, n: 8, players: 2 });
  w.tick(1000);
  assert.deepEqual(await ok(ann, 'roll', { total: 9 }), { n: 8 });
  assert.deepEqual(await ok(dm, 'scene', { scene: { title: 'Morning' } }), { n: 8 });
  assert.deepEqual(await ok(ann, 'propose', { kind: 'intent', text: 'I wake up.' }), { n: 2 });
  assert.deepEqual(await ok(dm, 'request', { to: 'all', label: 'Wake up' }), { n: 2 });
  assert.deepEqual(await ok(dm, 'vote', { q: 'Breakfast?', options: ['Yes', 'No'] }), { n: 2 });
  assert.deepEqual(await ok(dm, 'stage', { patch: { beat: { kind: 'bell' } } }), { n: 3 });
  assert.deepEqual((await see(bea)).stage.beat, { n: 2, kind: 'bell', at: w.now() });
  /* a scene from before the fresh start is no longer something to react to */
  for (const on of ['scene:2', 'scene:7', 'feed:1', 'roll:1']) { assert.equal((await call(ann, 'react', { on, mark: 'cheer' })).json.reason, 'no_thing', on); }
  assert.deepEqual(await ok(ann, 'react', { on: 'scene:8', mark: 'cheer' }), { on: 'scene:8', mark: 'cheer' });
  /* and again: the floor only ever rises, even at a table where nothing has happened */
  assert.deepEqual(await ok(dm, 'reset', {}), { ok: true, floor: 9 }); assert.deepEqual(await ok(dm, 'reset', {}), { ok: true, floor: 10 });
  const fresh = await party([]);
  assert.deepEqual(await fresh.ok(fresh.dm, 'reset', {}), { ok: true, floor: 1 });
  assert.deepEqual(await fresh.ok(fresh.dm, 'send', { text: 'First.' }), { ok: true, n: 2, players: 0 });
});

/* ---------------- seats that go ---------------- */
test('leave and kick: the seat\'s ballot, reactions, bond and hook go with it, and so does any bond or place on the stage that pointed at it', async () => {
  const p = await party(['Ann', 'Bea', 'Cal']), { w, dm, seats: [ann, bea, cal], ok, see } = p;
  const face = (await ok(ann, 'me', { portrait: PNG, bond: { to: bea.id, text: 'My oldest friend.' }, hook: { id: 'debt', text: 'A debt to pay.' } })).portrait;
  await ok(bea, 'me', { bond: { to: ann.id, text: 'She saved my life.' }, hook: { id: 'crown', text: 'The crown is mine.' } });
  await ok(cal, 'me', { bond: { to: ann.id, text: 'She owes me money.' } });
  await ok(dm, 'award', { id: ann.id, give: 1 });
  await ok(dm, 'send', { text: 'For everyone.' }); await ok(dm, 'send', { to: ann.id, text: 'For her alone.' }); await ok(ann, 'roll', { total: 15 }); await ok(bea, 'roll', { total: 4 });
  await ok(dm, 'vote', { q: 'Left or right?', options: ['Left', 'Right'] });
  for (const [who, pick] of [[ann, 0], [bea, 0], [cal, 1]]) { await ok(who, 'ballot', { n: 1, pick }); }
  for (const [who, on, mark] of [[ann, 'feed:1', 'cheer'], [bea, 'feed:1', 'cheer'], [dm, 'feed:2', 'heart'], [ann, 'roll:2', 'laugh'], [dm, 'roll:1', 'wow'], [cal, 'roll:1', 'clap']]) { await ok(who, 'react', { on, mark }); }
  const order = [{ id: ann.id, name: 'Brindle', kind: 'hero', state: 'fine', img: face }, { id: bea.id, name: 'Thorn', kind: 'hero', state: 'hurt', img: '' }, { id: 'goblin', name: 'A goblin', kind: 'foe', state: '', img: '' }];
  await ok(dm, 'stage', { patch: { spot: ann.id, order, now: ann.id, sound: { bed: 'wind' } } });
  /* Ann gets up */
  await ok(ann, 'leave', {});
  assert.doesNotMatch(JSON.stringify(w.saved(dm.code)), new RegExp(ann.id + '|' + ann.token + '|Ann|Brindle|debt|oldest friend'), 'nothing of Ann, and nothing pointing at her seat, is left');
  const d = await see(dm);
  assert.deepEqual(d.players, [{ id: bea.id, name: 'Bea', char: null, portrait: '', hook: { id: 'crown', text: 'The crown is mine.' } }, { id: cal.id, name: 'Cal', char: null, portrait: '' }], 'the bonds that were with Ann are gone; Bea\'s hook is still hers');
  assert.deepEqual(d.votes[0].counts, [1, 1]);
  assert.deepEqual(d.reacts, { 'feed:1': { cheer: 1 } }, 'her marks are gone, and so is every mark on her dice and on the note sent only to her, which left with her');
  assert.deepEqual([d.stageN, d.stage], [2, Object.assign({}, BARE, { order: order.slice(1), sound: { bed: 'wind', level: 1 } })], 'the stage lost her and was numbered again, so every device hears of it');
  assert.equal((await w.request('GET', '/' + face)).status, 404, 'her place in the turn order did not keep her portrait');
  /* Bea is removed: the same; the dice the table saw stay, as they always have, and the DM's answer shows who is left */
  await ok(cal, 'me', { bond: { to: bea.id, text: 'We share a secret.' }, hook: { id: 'map', text: 'Half a map.' } });
  await ok(dm, 'stage', { patch: { spot: bea.id, now: bea.id } });
  assert.deepEqual(await ok(dm, 'kick', { id: bea.id }), { players: [{ id: cal.id, name: 'Cal', char: null, portrait: '', hook: { id: 'map', text: 'Half a map.' } }], count: 1, removed: true });
  const d2 = await see(dm), t = w.saved(dm.code);
  assert.deepEqual([d2.votes[0].counts, d2.reacts, d2.stage.spot, d2.stage.order, d2.stage.now, d2.stageN, d2.rolls.length], [[0, 1], {}, '', [order[2]], '', 4, 1]);
  assert.deepEqual([t.vote.picks, t.reacts, t.players.length, 'bond' in t.players[0]], [{ [cal.id]: 1 }, [], 1, false]);
  /* a seat that goes while nothing on the stage points at it leaves the stage, and its number, alone */
  const dee = await w.join(dm.code, 'Dee');
  await ok(dee, 'leave', {});
  assert.equal((await see(dm)).stageN, 4);
});

/* ---------------- old tables, old phones, and the rules that hold everywhere ---------------- */
test('a table saved before the big screen existed loads, and every new call works at it', async () => {
  const w = await world(), DM = 'd'.repeat(32), ANN = 'p'.repeat(32), BEA = 'q'.repeat(32), at = { c: 'OLDT' }, hero = { name: 'Brindle', race: 'Elf', cls: 'Scout', line: 'Quick.', look: '' };
  /* as the guided loop left it: a scene, a request with a result, a private note, and none of the newer parts */
  await w.store('OLDT').put('t', { code: 'OLDT', dm: DM, created: 1, scenario: 'northpole',
    players: [{ id: 'aaaaaaaa', token: ANN, name: 'Ann', char: hero, portrait: '', portraits: 0, old: [] }, { id: 'bbbbbbbb', token: BEA, name: 'Bea', char: null, portrait: '', portraits: 0, old: [] }],
    feed: [{ n: 1, at: 5, kind: 'note', title: 'An old note', text: 'From before.', img: '', to: '', hero: '' }, { n: 2, at: 6, kind: 'note', title: '', text: 'For Ann alone.', img: '', to: 'aaaaaaaa', hero: '' }], seq: 2,
    rolls: [{ n: 1, id: 'aaaaaaaa', name: 'Ann', role: 'player', label: 'Look', kind: 'check', total: 12, nat: 0, detail: '', dice: [], at: 7 }], rollSeq: 1, gone: [], stored: 0, spend: { images: 0, texts: 0 },
    scene: { n: 3, id: 'gate', chapter: '', title: 'The gate', summary: '', img: '', cards: [], quests: [], clues: [], people: [], story: [] }, sceneN: 3, pulled: [], asks: [], askSeq: 0,
    reqs: [{ n: 1, to: ['aaaaaaaa'], label: 'Look', why: '', skill: '', target: 10, yes: 'You see it.', no: 'Nothing.', at: 8, closed: false, results: { aaaaaaaa: { total: 12, nat: 0, pass: true, at: 9 } } }], reqSeq: 1, barred: [] });
  const post = async (token, route, body) => { const r = await w.post(route, Object.assign({ token }, body), at); assert.equal(r.status, 200, route + ': ' + r.text); return r.json; };
  const s = await post(ANN, 'state', {});
  assert.deepEqual([s.stageN, s.floor, s.votes, s.reacts, s.reacted, 'stage' in s, s.time], [0, 0, [], {}, {}, false, w.now()]);
  assert.deepEqual(s.players, [{ id: 'aaaaaaaa', name: 'Ann', char: hero, portrait: '' }, { id: 'bbbbbbbb', name: 'Bea', char: null, portrait: '' }], 'a seat from before has no tokens, bond or hook, and looks as it did');
  assert.deepEqual([s.feed.length, s.rolls.length, s.scene.title, s.requests[0].mine.say], [2, 1, 'The gate', 'You see it.']);
  const d = await post(DM, 'state', {});
  assert.deepEqual([d.sessionAt, d.screen], [0, false]); assert.deepEqual(await post(DM, 'session', { get: true }), { save: '', at: 0 });
  /* every new call */
  const key = (await post(DM, 'screen', {})).key;
  assert.deepEqual(await post(DM, 'stage', { patch: { spot: 'aaaaaaaa', beat: { kind: 'bell' } } }), { n: 1 });
  assert.deepEqual(await post(DM, 'vote', { q: 'On?', options: ['Yes', 'No'] }), { n: 1 });
  assert.deepEqual(await post(ANN, 'ballot', { n: 1, pick: 0 }), { ok: true, mine: 0 });
  assert.deepEqual(await post(DM, 'award', { id: 'aaaaaaaa', give: 1 }), { id: 'aaaaaaaa', tokens: 1 });
  assert.deepEqual(await post(ANN, 'spend', { request: 1 }), { n: 2, tokens: 0 });
  assert.deepEqual(await post(ANN, 'roll', { total: 3, request: 1 }), { n: 3, pass: false, say: 'Nothing.' });
  assert.deepEqual(await post(BEA, 'react', { on: 'feed:1', mark: 'cheer' }), { on: 'feed:1', mark: 'cheer' });
  assert.deepEqual(await post(ANN, 'react', { on: 'scene:3', mark: 'wow' }), { on: 'scene:3', mark: 'wow' });
  assert.deepEqual(await post(ANN, 'me', { bond: { to: 'bbbbbbbb', text: 'Old friends.' }, hook: { id: 'debt', text: 'A debt.' } }), { ok: true, portrait: '', name: 'Ann' });
  assert.deepEqual(await post(DM, 'session', { save: 'place', at: 5 }), { ok: true, at: 5 });
  w.sleep();
  const big = await post(key, 'state', {});
  assert.deepEqual([big.you, big.feed.map((f) => f.n), big.stage.spot, big.stage.beat.n, big.votes[0].counts, big.reacts, big.players[0].bond.text, big.requests[0].results.aaaaaaaa.pass],
    ['screen', [1], 'aaaaaaaa', 1, [1, 0], { 'feed:1': { cheer: 1 }, 'scene:3': { wow: 1 } }, 'Old friends.', false]);
  assert.deepEqual(await post(DM, 'reset', {}), { ok: true, floor: 4 });
  assert.deepEqual(await post(ANN, 'leave', {}), { ok: true });
  /* and one older still, from before scenes: the same */
  await w.store('OLDR').put('t', { code: 'OLDR', dm: DM, created: 1, players: [{ id: 'cccccccc', token: ANN, name: 'Ann', char: null, portrait: '', portraits: 0 }], feed: [{ n: 1, at: 5, kind: 'note', title: '', text: 'Old.', img: '' }], seq: 1, stored: 0, spend: { images: 0, texts: 0 } });
  const call = async (token, route, body) => (await w.post(route, Object.assign({ token }, body), { c: 'OLDR' })).json;
  assert.deepEqual(await call(DM, 'stage', { patch: { sound: { bed: 'fire' } } }), { n: 1 });
  assert.deepEqual(await call(DM, 'award', { id: 'cccccccc', give: 1 }), { id: 'cccccccc', tokens: 1 });
  assert.deepEqual(await call(ANN, 'spend', {}), { n: 1, tokens: 0 });
  assert.deepEqual(await call(ANN, 'react', { on: 'feed:1', mark: 'heart' }), { on: 'feed:1', mark: 'heart' });
  assert.deepEqual(await call(DM, 'reset', {}), { ok: true, floor: 2 });
  const o = await call(ANN, 'state', {});
  assert.deepEqual([o.players, o.feed, o.rolls, o.floor, o.stage, o.votes], [[{ id: 'cccccccc', name: 'Ann', char: null, portrait: '' }], [], [], 2, BARE, []]);
});
test('a phone running last month\'s page sends none of the new fields, and what it is sent is what it was sent before', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], ok, see } = p;
  /* an evening of the guided loop */
  assert.deepEqual(await ok(ann, 'me', { name: 'Ann', char: { name: 'Brindle', cls: 'Scout' }, save: '{"hp":7}', portrait: 'img/np_elf.webp' }), { ok: true, portrait: 'img/np_elf.webp', name: 'Ann' });
  await ok(dm, 'send', { title: 'A map', text: 'Old and torn.' }); await ok(dm, 'scene', { scene: { title: 'The gate' } });
  await ok(dm, 'request', { to: 'all', label: 'Look', target: 10, yes: 'You see it.', no: 'Nothing.' });
  assert.deepEqual(await ok(ann, 'roll', { total: 12, request: 1 }), { n: 1, pass: true, say: 'You see it.' });
  assert.deepEqual(await ok(ann, 'propose', { kind: 'intent', text: 'I look around.' }), { n: 1 });
  const OLD = ['code', 'you', 'players', 'feed', 'last', 'scenario', 'rolls', 'lastRoll', 'sceneN', 'pulled', 'asks', 'requests', 'scene'];
  const old = async (who) => { const s = await see(who, { after: 0, afterRoll: 0, afterScene: 0 }); return Object.fromEntries(OLD.map((k) => [k, s[k]])); };
  const before = { ann: await old(ann), bea: await old(bea), dm: await old(dm) };
  assert.deepEqual(before.ann.players, [{ id: ann.id, name: 'Ann', char: { name: 'Brindle', race: '', cls: 'Scout', line: '', look: '' }, portrait: 'img/np_elf.webp' }, { id: bea.id, name: 'Bea', char: null, portrait: '' }]);
  /* the newer parts of the table are used all around it, and nothing an old page reads is any different */
  await tv(p);
  await ok(dm, 'stage', { patch: { spot: ann.id, sound: { bed: 'wind' }, beat: { kind: 'bell' } } }); await ok(dm, 'vote', { q: 'On?', options: ['Yes', 'No'] }); await ok(bea, 'ballot', { n: 1, pick: 0 });
  await ok(bea, 'react', { on: 'feed:1', mark: 'cheer' }); await ok(dm, 'session', { save: 'place', at: 5 }); await ok(dm, 'vote', { n: 1, close: true });
  assert.deepEqual({ ann: await old(ann), bea: await old(bea), dm: await old(dm) }, before);
  /* what is new rides along beside it: with no afterStage the stage comes every time, and an old page takes no notice */
  const s = await see(ann, { after: 1, afterRoll: 1, afterScene: 1 });
  assert.deepEqual([s.feed, s.rolls, 'scene' in s, s.stageN, s.floor, s.stage.spot], [[], [], false, 1, 0, ann.id]);
  /* and its own calls are answered as they were */
  assert.deepEqual(await ok(ann, 'me', { char: { name: 'Brindle', cls: 'Scout' } }), { ok: true, portrait: 'img/np_elf.webp', name: 'Ann' });
  w.tick(1000);
  assert.deepEqual(await ok(ann, 'roll', { total: 9 }), { n: 2 });
  assert.deepEqual(await ok(dm, 'kick', { id: bea.id }), { players: before.ann.players.slice(0, 1), count: 1, removed: true });
});
test('Phase 2 routes: an unknown code and a bad token get the same byte-identical 404 as everywhere else', async () => {
  const p = await party(['Ann']), { w, dm, seats: [ann] } = p, screen = await tv(p);
  let ip = 0;
  for (const [route, body] of Object.entries(P2_ROUTES)) {
    for (const [c, token] of [['ZZZZ', ann.token], ['ZZZZ', dm.token], ['ZZZZ', screen.token], ['ZZZZ', undefined], [dm.code, 'f'.repeat(32)], [dm.code, 'f'.repeat(48)], [dm.code, ann.token.slice(0, 31)], [dm.code, screen.token.slice(0, 47)], [dm.code, undefined], [dm.code, ''], [dm.code, 7], [dm.code, { $ne: 1 }], ['nope!', dm.token], ['', dm.token]]) {
      const r = await w.post(route, Object.assign({}, body, token === undefined ? {} : { token }), { c, ip: 'p2-guess-' + ip++ });
      assert.equal(r.status, 404, route); assert.equal(r.text, NO_TABLE, route);
      assert.deepEqual([...r.headers].sort(), [['cache-control', 'no-store'], ['content-type', 'application/json']], route);
    }
    /* even when what was sent would be refused for another reason, or would do something, were the token good */
    for (const bad of [{ patch: 'x'.repeat(30000), save: 7, q: '', options: [], give: 9, on: 'nothing', mark: 'boo', pick: 99 }, { patch: null, n: 'x', id: 7, request: 'x', get: true, off: true, close: true, new: true }]) {
      const r = await w.post(route, Object.assign({ token: 'f'.repeat(32) }, bad), { c: dm.code, ip: 'p2-guess-' + ip++ });
      assert.equal(r.status, 404, route); assert.equal(r.text, NO_TABLE, route);
    }
  }
  const s = (await w.post('state', { token: dm.token }, { c: dm.code })).json;
  assert.deepEqual([s.stageN, s.votes, s.reacts, s.sessionAt, s.floor, s.rolls, s.players, s.screen], [0, [], {}, 0, 0, [], [{ id: ann.id, name: 'Ann', char: null, portrait: '' }], true]);
  assert.equal(w.saved(dm.code).screen, screen.token, 'and the screen\'s key is the one it was');
  /* twenty of them from one address and the door closes, as for any other guessing */
  for (let i = 0; i < 20; i++) { await w.post(Object.keys(P2_ROUTES)[i % 9], { token: 'nope' }, { c: dm.code, ip: 'one-p2-guesser' }); }
  assert.equal((await w.post('reset', { token: dm.token }, { c: dm.code, ip: 'one-p2-guesser' })).status, 429);
  assert.equal((await w.post('state', { token: dm.token }, { c: dm.code })).json.floor, 0, 'the 429 left the table as it was');
});
test('Phase 2 routes: DM-only calls turn players away and players\' calls the DM, a moved or removed seat hears why, an ended table says so, and none of it counts as guessing', async () => {
  const p = await party(['Ann', 'Bea']), { w, dm, seats: [ann, bea], ok } = p, ip = '192.0.2.98', from = { c: dm.code, ip };
  const before = JSON.stringify(w.saved(dm.code));
  for (let i = 0; i < 4; i++) {
    for (const route of P2_DM) {
      const r = await w.post(route, Object.assign({ token: ann.token }, P2_ROUTES[route], { id: bea.id }), from);
      assert.equal(r.status, 403, route); assert.match(r.json.error, /^Only the DM can /); assert.equal(r.json.reason, 'dm_only');
    }
    for (const route of P2_PLAYER) {
      const r = await w.post(route, Object.assign({ token: dm.token }, P2_ROUTES[route]), from);
      assert.equal(r.status, 403, route); assert.equal(r.json.reason, 'player_only'); assert.equal(typeof r.json.error, 'string');
    }
  }
  assert.equal(JSON.stringify(w.saved(dm.code)), before, 'none of those changed anything'); assert.deepEqual([...w.store(dm.code).m.keys()], ['t']);
  /* Ann moves to another phone; Bea is removed */
  const ann2 = await w.join(dm.code, 'Ann', { confirm: true });
  await ok(dm, 'kick', { id: bea.id });
  for (let i = 0; i < 3; i++) {
    for (const [route, body] of Object.entries(P2_ROUTES)) {
      const moved = await w.post(route, Object.assign({ token: ann.token }, body), from), removed = await w.post(route, Object.assign({ token: bea.token }, body), from);
      assert.equal(moved.status, 409, route); assert.deepEqual(moved.json, { error: 'Someone else is now playing as Ann.', reason: 'moved', name: 'Ann' });
      assert.equal(removed.status, 409, route); assert.deepEqual(removed.json, { error: 'The DM removed you from this table.', reason: 'removed' });
    }
  }
  assert.equal((await w.post('state', { token: ann2.token }, from)).status, 200, 'eighty refusals later, that address is still welcome');
  await ok(dm, 'close', {});
  for (const [route, body] of Object.entries(P2_ROUTES)) {
    for (const token of [dm.token, ann2.token, ann.token, bea.token]) {
      const r = await w.post(route, Object.assign({ token }, body), from);
      assert.equal(r.status, 410, route); assert.equal(r.text, '{"error":"This table has ended.","reason":"closed"}');
    }
    const stranger = await w.post(route, Object.assign({ token: 'never-was' }, body), { c: dm.code, ip: 'a-p2-stranger-' + route });
    assert.equal(stranger.status, 404, route); assert.equal(stranger.text, NO_TABLE);
  }
});
test('everything a table keeps for the big screen and the party\'s ties stays inside its bounds', async () => {
  const p = await party(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']), { w, dm, seats, call, ok } = p, wide = (n) => '漢'.repeat(n), long = wide(3000);
  await tv(p);
  const kept = (await ok(dm, 'keep', { image: PNG })).url, two = (i) => String(i).padStart(2, '0');
  /* every seat with the longest bond and hook it can have, and as many tokens as the DM can be made to give */
  for (const [i, s] of seats.entries()) {
    await ok(s, 'me', { bond: { to: seats[(i + 1) % 8].id, prompt: long, text: long }, hook: { id: long, text: long } });
    for (let k = 0; k < 7; k++) { await call(dm, 'award', { id: s.id, give: 1 }); }
  }
  /* the fullest stage: every part, every list at its limit, every text at its length and three bytes a letter */
  await ok(dm, 'stage', { patch: { reveal: { id: wide(40), title: wide(80), img: kept, shown: true }, sound: { bed: wide(40), level: 0.33 }, beat: { kind: wide(20) }, spot: seats[0].id } });
  await ok(dm, 'stage', { patch: { map: { id: wide(40), title: wide(80), img: kept, regions: Array.from({ length: 24 }, (_, i) => ({ id: two(i) + wide(38), name: wide(40), x: 33.33, y: 66.66, w: 12.34, h: 98.76 })), open: Array.from({ length: 24 }, (_, i) => two(i) + wide(38)) } } });
  await ok(dm, 'stage', { patch: { order: Array.from({ length: 16 }, (_, i) => ({ id: two(i) + wide(38), name: wide(60), kind: 'hero', state: wide(20), img: kept })), now: '15' + wide(38) } });
  /* the longest vote with every seat's ballot, and more things reacted to than are kept, each by everyone */
  await ok(dm, 'vote', { q: long, options: [long, long, long, long] });
  for (const s of seats) { await ok(s, 'ballot', { n: 1, pick: 3 }); }
  for (let i = 1; i <= 65; i++) { await ok(dm, 'send', { text: 'Note ' + i }); for (const who of seats.concat(dm)) { await ok(who, 'react', { on: 'feed:' + i, mark: 'cheer' }); } }
  await ok(dm, 'session', { save: wide(60000) });
  const t = w.saved(dm.code), size = (v) => Buffer.byteLength(JSON.stringify(v));
  assert.deepEqual([t.reacts.length, Object.keys(t.reacts[59].by).length, t.stage.map.regions.length, t.stage.map.open.length, t.stage.order.length, t.vote.options.length, Object.keys(t.vote.picks).length, t.players.map((x) => x.tokens).join('')], [60, 9, 24, 24, 16, 4, 8, '55555555']);
  assert.deepEqual([t.stage.now, t.stage.reveal.title.length, t.vote.q.length, t.vote.options[3].length, t.players[0].bond.prompt.length, t.players[0].bond.text.length, t.players[0].hook.id.length, t.players[0].hook.text.length], ['15' + wide(38), 80, 120, 40, 160, 200, 40, 240]);
  assert.ok(size(t.stage) < 24000, 'stage: ' + size(t.stage)); assert.ok(size(t.reacts) < 60 * 260, 'reactions: ' + size(t.reacts)); assert.ok(size(t.vote) < 1500, 'vote: ' + size(t.vote));
  assert.ok(size(t.players) < 8 * 2600, 'seats: ' + size(t.players)); assert.equal(t.screen.length, 48);
  assert.ok(size(t) < 80000, 'the whole table: ' + size(t));
  assert.equal(JSON.stringify(t).includes(wide(241)), false, 'and the DM\'s place in the story, longer than anything the table holds, is not in it');
});
