/* The DM's side has a part with no screen in it: FR.run, at the top of src/dm.js. It decides whether
   a condition holds, what follows what, and what the players' phones are told about the story (the
   scene state of docs/PHASE1.md, section 1.1). These tests play whole adventures through it, with no
   browser, and send every scene it builds through the real table (server/core.js) to prove that it
   arrives whole and that nothing kept for the DM is in it.

   Two adventures are played: the North Pole one, and the starter that `npm run new-cartridge` writes.
   Each is also played with everything format 2 added taken back out, as a format 1 file. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../../scripts/lib/packs.js');
const V = require('../../scripts/validate-adventure.js');

if (!globalThis.crypto) { globalThis.crypto = require('node:crypto').webcrypto; }       // Node 18
const core = import('../../server/core.js');
const json = (v) => JSON.parse(JSON.stringify(v));
const DM_JS = fs.readFileSync(path.join(P.ROOT, 'src', 'dm.js'), 'utf8');

/* the engine with every pack in it, then src/dm.js: with no `document` it stops after FR.run */
function engine() {
  const FR = P.engine();
  P.list().forEach((p) => { const l = P.load(p.file); assert.strictEqual(l.error, '', p.id + ' ' + l.error); FR.cartridge(l.def); });
  new Function('FR', DM_JS)(FR);
  assert.ok(FR.run, 'src/dm.js defines FR.run before it touches the page');
  return FR;
}
const FR = engine(), R = FR.run;
const NP_DIR = path.join(P.ROOT, 'cartridges', 'northpole');
const NP_RAW = P.loadAdventure(path.join(NP_DIR, 'adventure.js')).def;
function starterRaw() {
  const calls = [], text = fs.readFileSync(path.join(P.ROOT, 'scripts', 'template', 'adventure.js'), 'utf8').split('__ID__').join('starter').split('__NAME__').join('Starter');
  vm.runInNewContext(text, { FR: { adventure: (i, d) => { calls.push(d); } } });
  return json(calls[0]);
}
/* every scene an adventure has: [where it is, the scene] */
const scenesOf = (adv) => [].concat(...adv.flow.chapters.map((c) => c.scenes.map((s) => [c.id + '/' + s.id, s])), (adv.flow.interludes || []).map((s) => [s.id, s]));
/* an adventure with everything format 2 added taken back out: what a format 1 file looks like */
function asFormat1(adv) {
  const a = json(adv); a.schema = 1;
  ['brief', 'quests', 'clues', 'handouts'].forEach((k) => delete a[k]);
  a.bible.people.forEach((p) => delete p.public);
  a.flow.chapters.concat(a.flow.hubs || []).forEach((c) => delete c.summary);
  scenesOf(a).forEach(([, s]) => { delete s.summary; (s.tries || []).forEach((t) => { delete t.check; delete t.card; delete t.hint; }); });
  return a;
}
/* the adventures as the page holds them: every picture already an address */
const NP = FR.adventure('northpole', NP_RAW), STARTER = FR.adventure('starter', starterRaw());
const NP1 = FR.adventure('northpole', asFormat1(NP_RAW)), STARTER1 = FR.adventure('starter', asFormat1(starterRaw()));
FR.adventure('northpole', NP_RAW);                    // leave the registry as it was

const fresh = () => ({ feed: [{ k: 'cover' }], flags: {}, order: [] });
/* Play a session to its end. `choose(n, step)` says which of n outcomes (or errands still on offer)
   is taken; `each(dm, at)` sees the session at every place it stops, the cover and the end included. */
function play(st, choose, each) {
  const dm = fresh(); let steps = 0;
  each(dm, R.place(st, dm));
  R.begin(st, dm);
  for (;;) {
    const at = R.place(st, dm);
    each(dm, at);
    if (at.kind === 'end') { break; }
    assert.ok(++steps < 200, 'the story reaches an end');
    if (at.kind === 'hub') { const left = R.choices(st, dm, at.hub); R.pick(st, dm, left[choose(left.length, steps)].to); }
    else { const outs = at.scene.outcomes; R.choose(st, dm, dm.feed[at.i], outs[choose(outs.length, steps)]); }
  }
  return dm;
}
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const WAYS = [['the first choice every time', () => 0], ['the last choice every time', (n) => n - 1]]
  .concat([1, 2, 3, 4, 5, 6].map((seed) => { const rnd = lcg(seed); return ['at random, ' + seed, (n) => Math.floor(rnd() * n)]; }));
/* take the outcome that sets a flag to a value, wherever the DM is standing */
function take(st, dm, flag, value) {
  const at = R.place(st, dm), o = at.scene.outcomes.filter((x) => x.sets && x.sets[flag] === value)[0];
  assert.ok(o, 'an outcome here sets ' + flag + ' to ' + value);
  R.choose(st, dm, dm.feed[at.i], o);
}
const first = (st, dm) => { const at = R.place(st, dm); R.choose(st, dm, dm.feed[at.i], at.scene.outcomes[0]); };

/* Everything an adventure keeps for the DM: no whole line of it may ever be in a scene state. */
function secrets(st) {
  const out = [], add = (v) => { [].concat(v || []).forEach((x) => { if (typeof x === 'string' && x.trim().length >= 15) { out.push(x.trim()); } }); };
  const B = st.bible || {};
  add(st.pitch); add(st.howto); add(B.truths); add(B.outline);
  if (st.brief) { add(st.brief.about); add(st.brief.endings); add(st.brief.tips); }
  (B.people || []).forEach((p) => { add([p.secret, p.wants, p.voice, p.look]); add(p.lines); });      // a role or a whereabouts is no secret: a public line may well repeat it
  (B.places || []).forEach((p) => add([p.blurb, p.senses]));
  (B.things || []).forEach((p) => add(p.blurb));
  st.flow.chapters.forEach((c) => { add(c.goal); (c.perks || []).forEach((x) => add(x.text)); (c.leaving || []).forEach((x) => add(x.read)); });
  (st.flow.hubs || []).forEach((h) => { add([h.goal, h.help]); h.options.forEach((o) => add([o.feel])); });
  scenesOf(st).forEach(([, s]) => {
    add(s.notes); add(s.read); add(s.otherwise); add(s.paint); add(s.goal);
    (s.also || []).concat(s.extras || []).forEach((x) => add(x.read));
    ((s.versions && s.versions.options) || []).forEach((o) => add(o.read));
    (s.tries || []).forEach((t) => { add([t.roll, t.yes, t.no]); if (t.card === false) { add([t.try, t.hint]); } });
    s.outcomes.forEach((o) => { if (o.label !== o.log) { add(o.label); } });
  });
  (st.handouts || []).forEach((h) => add(h.text));
  return out;
}
const leaks = (st, scene) => { const text = JSON.stringify(scene); return secrets(st).filter((s) => text.indexOf(JSON.stringify(s).slice(1, -1)) >= 0); };

/* the table's limits for a scene, as docs/PHASE1.md (section 1.1) lists them */
function within(s, where) {
  const len = (v, max, what) => { assert.strictEqual(typeof v, 'string', where + ': ' + what + ' is text'); assert.ok(v.length <= max, where + ': ' + what + ' is ' + v.length + ' long, over ' + max); };
  assert.deepStrictEqual(Object.keys(s), ['id', 'chapter', 'title', 'summary', 'img', 'cards', 'quests', 'clues', 'people', 'story'], where + ': the parts the table knows, and no others');
  len(s.id, 40, 'id'); len(s.chapter, 80, 'chapter'); len(s.title, 80, 'title'); len(s.summary, 400, 'summary'); len(s.img, 200, 'img');
  assert.ok(s.id && s.title, where + ': a scene always has an id and a title');
  assert.ok(s.cards.length <= 8 && s.quests.length <= 12 && s.clues.length <= 20 && s.people.length <= 40 && s.story.length <= 30, where + ': no list is longer than the table keeps');
  s.cards.forEach((c) => { assert.deepStrictEqual(Object.keys(c), ['id', 'label', 'hint']); len(c.id, 40, 'card id'); len(c.label, 60, 'card label'); len(c.hint, 120, 'card hint'); assert.ok(c.label); });
  s.quests.forEach((q) => { assert.deepStrictEqual(Object.keys(q), ['id', 'text', 'done']); len(q.id, 40, 'quest id'); len(q.text, 160, 'quest'); assert.strictEqual(typeof q.done, 'boolean'); assert.ok(q.text); });
  s.clues.forEach((c) => { assert.deepStrictEqual(Object.keys(c), ['id', 'text']); len(c.id, 40, 'clue id'); len(c.text, 200, 'clue'); assert.ok(c.text); });
  s.people.forEach((p) => { assert.deepStrictEqual(Object.keys(p), ['id', 'name', 'line', 'img']); len(p.id, 40, 'person id'); len(p.name, 60, 'name'); len(p.line, 160, 'line'); len(p.img, 200, 'person img'); assert.ok(p.name); });
  s.story.forEach((l) => { len(l, 240, 'story line'); assert.ok(l); });
  assert.ok(Buffer.byteLength(JSON.stringify(s)) <= 24 * 1024, where + ': under 24 KB');
}

/* A table of its own, on the real server code: the DM publishes, a player reads. */
async function table() {
  const { createApi, TableCore } = await core, api = createApi({ now: () => 1800000000000 }), stores = new Map(), tables = new Map();
  const env = { DM_PASSCODE: 'sesame-for-tests', OPENAI_API_KEY: 'test-key-not-real' };
  const store = (code) => {
    if (!stores.has(code)) { const m = new Map(); stores.set(code, { get: async (k) => structuredClone(m.get(k)), put: async (k, v) => { m.set(k, structuredClone(v)); }, delete: async (k) => m.delete(k), deleteAll: async () => { m.clear(); }, setAlarm: async () => {}, deleteAlarm: async () => {} }); }
    return stores.get(code);
  };
  const at = (code) => { if (!tables.has(code)) { tables.set(code, new TableCore({ store: store(code), env, now: () => 1800000000000, fetch: () => { throw new Error('a test tried to reach the network'); } })); } return tables.get(code); };
  const post = async (route, body, code) => {
    const res = await api.handle(new Request('https://first-roll.test/api/table/' + route + (code ? '?c=' + code : ''), { method: 'POST', body: JSON.stringify(body) }), { env, ip: '10.0.0.1', table: at });
    return { status: res.status, json: await res.json() };
  };
  const dm = (await post('open', { passcode: env.DM_PASSCODE })).json, ann = (await post('join', { name: 'Ann' }, dm.code)).json;
  return {
    publish: (scene) => post('scene', { token: dm.token, scene: scene }, dm.code),
    seen: async () => (await post('state', { token: ann.token }, dm.code)).json.scene
  };
}

/* ---------- the three kinds of scene state the brief asks for by name ---------- */
test('the cover: only the name of the adventure and its picture, because nothing has been read out yet', () => {
  [NP, STARTER, NP1].forEach((st) => {
    const s = R.scene(st, fresh());
    assert.deepStrictEqual(s, { id: '/cover', chapter: '', title: st.title, summary: '', img: st.cover, cards: [], quests: [], clues: [], people: [], story: [] });
    within(s, st.id + ' cover');
  });
  assert.strictEqual(R.scene(NP, fresh()).img, FR.asset('northpole', 'img/keyart.webp'), 'the picture is an address a page can load');
});

test('the first scene: its own summary, its chapter and picture, and only the quests that are open from the start', () => {
  const dm = fresh(); R.begin(NP, dm);
  const s = R.scene(NP, dm), ch = NP.flow.chapters[0];
  assert.strictEqual(s.id, 'arrival/box');
  assert.strictEqual(s.chapter, 'Crash Landing');
  assert.strictEqual(s.title, 'The winning batch');
  assert.strictEqual(s.summary, ch.scenes[0].summary);
  assert.strictEqual(s.img, ch.img);
  assert.deepStrictEqual(s.cards, [], 'this scene has no tries');
  assert.deepStrictEqual(s.quests, [{ id: 'why', text: NP.quests[0].text, done: false }], 'the one quest with no `from`');
  assert.deepStrictEqual([s.clues, s.people, s.story], [[], [], []]);
  within(s, 'first scene');
});

test('a scene with no summary of its own tells its chapter\'s', () => {
  const st = json(NP); delete st.flow.chapters[0].scenes[0].summary;
  const dm = fresh(); R.begin(st, dm);
  assert.strictEqual(R.scene(st, dm).summary, st.flow.chapters[0].summary);
});

test('cards are the tries a player may see: card: false keeps one off the phones, title and all', () => {
  const dm = fresh(); R.begin(NP, dm); first(NP, dm);                       // the snowbank: its one try is for the DM alone
  const hidden = R.place(NP, dm).scene.tries[0];
  assert.strictEqual(hidden.card, false);
  let s = R.scene(NP, dm);
  assert.deepStrictEqual(s.cards, []);
  assert.ok(JSON.stringify(s).indexOf(hidden.try) < 0 && JSON.stringify(s).indexOf(hidden.yes) < 0);
  first(NP, dm);                                                            // the square: four tries, all shown
  s = R.scene(NP, dm);
  const tries = R.place(NP, dm).scene.tries;
  assert.deepStrictEqual(s.cards, tries.map((t, i) => ({ id: 't' + i + '@arrival/square', label: t.try, hint: t.hint || '' })));
  assert.strictEqual(s.cards[1].hint, 'Stop the cart any way you can think of');
  /* a hidden try keeps its place in the count, so every card still maps back to its own try */
  const st = json(NP); st.flow.chapters[0].scenes[2].tries[1].card = false;
  const dm2 = fresh(); R.begin(st, dm2); first(st, dm2); first(st, dm2);
  assert.deepStrictEqual(R.scene(st, dm2).cards.map((c) => c.id), ['t0@arrival/square', 't2@arrival/square', 't3@arrival/square']);
});

test('mid-story: flags and what has come up switch on people, clues and quests, and tick quests off', () => {
  const dm = fresh(); R.begin(NP, dm); first(NP, dm); first(NP, dm);
  assert.deepStrictEqual(R.scene(NP, dm).people, [], 'nobody is known before the cart');
  take(NP, dm, 'choir', 'tooty');
  let s = R.scene(NP, dm);
  assert.strictEqual(s.id, 'arrival/crumb');
  assert.deepStrictEqual(s.people.map((p) => p.id), ['crumb'], 'Agent Crumb steps out once the cart is dealt with');
  assert.deepStrictEqual(s.people[0], { id: 'crumb', name: 'Agent Crumb', line: NP.bible.people[0].public.line, img: NP.bible.people[0].img });
  assert.strictEqual(s.story.length, 3);
  assert.strictEqual(s.story[2], 'The cart reached the choir. The Infant Choir now toots in four-part harmony.');
  first(NP, dm);                                                            // on to the hub
  s = R.scene(NP, dm);
  assert.deepStrictEqual([s.id, s.chapter, s.title, s.img], ['errands', '', 'Where first?', '']);
  assert.strictEqual(s.summary, NP.flow.hubs[0].summary);
  assert.deepStrictEqual(s.cards, [], 'a hub has no tries');
  assert.deepStrictEqual(s.quests.map((q) => [q.id, q.done]), [['why', true], ['batch', false], ['laugh', false], ['flake', false], ['coal', false], ['culprit', false]]);
  assert.deepStrictEqual(s.clues.map((c) => c.id), ['recipe', 'santa']);
  R.pick(NP, dm, 'laugh');
  s = R.scene(NP, dm);
  assert.strictEqual(s.id, 'laugh/nook');
  assert.deepStrictEqual(s.people.map((p) => p.id), ['crumb', 'grumbleknot']);
  assert.strictEqual(s.story[s.story.length - 1], NP.flow.hubs[0].options.filter((o) => o.to === 'laugh')[0].log, 'a hub choice adds its own line to the story so far');
  /* play the chapter out, taking whichever outcome sets the laugh to a whole one */
  while (R.place(NP, dm).kind === 'scene' && R.place(NP, dm).chapter.id === 'laugh') {
    const at = R.place(NP, dm), pure = at.scene.outcomes.filter((o) => o.sets && o.sets.laugh === 'pure')[0];
    R.choose(NP, dm, dm.feed[at.i], pure || at.scene.outcomes[0]);
  }
  assert.strictEqual(dm.flags.laugh, 'pure');
  s = R.scene(NP, dm);
  assert.strictEqual(s.id, 'sneezles', 'after the first errand comes the first interlude');
  assert.deepStrictEqual([s.chapter, s.title, s.img], ['', 'The Sneezles', NP.flow.interludes[0].img]);
  assert.strictEqual(s.summary, NP.flow.interludes[0].summary);
  assert.ok(s.quests.filter((q) => q.id === 'laugh')[0].done, 'the laugh is fetched');
  assert.ok(!s.quests.filter((q) => q.id === 'flake')[0].done);
  assert.ok(s.clues.some((c) => c.id === 'laugh_pure') && !s.clues.some((c) => c.id === 'laugh_partial' || c.id === 'laugh_none'));
  assert.ok(s.people.some((p) => p.id === 'santa') && s.people.some((p) => p.id === 'mrsclaus'));
  take(NP, dm, 'gift', 'key');
  s = R.scene(NP, dm);
  assert.strictEqual(s.title, 'Where next?', 'the hub\'s second name, once something has been chosen');
  assert.ok(s.clues.some((c) => c.id === 'key') && !s.clues.some((c) => c.id === 'cocoa'));
  within(s, 'mid-story');
  assert.deepStrictEqual(leaks(NP, s), []);
});

test('a quest with no `done` is never ticked; a person with no `public` is never shown, whatever else is true of them', () => {
  const st = json(NP);
  delete st.quests[0].done;
  delete st.bible.people[0].public;                                        // Agent Crumb, who is in nearly every scene
  const dm = play(st, () => 0, (d) => {
    const s = R.scene(st, d);
    assert.ok(!s.people.some((p) => p.id === 'crumb'));
    assert.ok(s.quests.every((q) => q.id !== 'why' || q.done === false));
  });
  assert.ok(dm.feed.length > 20);
});

test('an ending: the story so far in full, the quests as they finished, and no cards', () => {
  const dm = play(NP, () => 0, () => {}), s = R.scene(NP, dm), outs = dm.feed.filter((e) => e.k === 'out');
  assert.deepStrictEqual([s.id, s.chapter, s.title, s.summary], ['/end', NP.title, 'The end', '']);
  assert.strictEqual(s.img, R.chapter(NP, 'midnight').img, 'the last picture the story showed');
  assert.deepStrictEqual(s.cards, []);
  assert.ok(s.quests.filter((q) => q.id === 'batch')[0].done && s.quests.filter((q) => q.id === 'machine')[0].done);
  assert.strictEqual(s.story[s.story.length - 1], outs[outs.length - 1].log);
  assert.ok(s.story.length >= 20 && s.story.length <= 30);
  assert.deepStrictEqual(s.story, R.story(NP, dm));
  within(s, 'the end');
  /* the story so far keeps the newest thirty lines, oldest first */
  const long = fresh(); for (let i = 0; i < 40; i++) { long.feed.push({ k: 'out', label: 'Outcome ' + i, log: 'Line ' + i + '.' }); }
  assert.deepStrictEqual(R.story(NP, long), Array.from({ length: 30 }, (x, i) => 'Line ' + (i + 10) + '.'));
  /* an outcome with no line of its own was recorded under its button's words, which are the DM's */
  long.feed.push({ k: 'out', label: 'They fell for it', log: 'They fell for it' });
  assert.ok(R.story(NP, long).indexOf('They fell for it') < 0);
});

/* ---------- every place of every way through ---------- */
test('every scene on every way through both adventures is inside the table\'s limits and holds nothing kept for the DM', () => {
  [NP, STARTER].forEach((st) => {
    const kinds = {};
    WAYS.forEach(([how, choose]) => {
      play(st, choose, (dm, at) => {
        const s = R.scene(st, dm), where = st.id + ', ' + how + ', at ' + at.key;
        kinds[at.kind] = true;
        within(s, where);
        assert.deepStrictEqual(json(s), s, where + ': plain data');
        assert.deepStrictEqual(leaks(st, s), [], where);
        assert.strictEqual(s.id, at.key.slice(0, 40));
        /* cards are exactly the tries not kept back, and each maps home */
        const tries = (at.scene && at.scene.tries) || [];
        assert.deepStrictEqual(s.cards.map((c) => c.label), tries.filter((t) => t.card !== false).map((t) => t.try));
        s.cards.forEach((c) => { const hit = R.tryOf(st, c.id); assert.ok(hit && hit.key === at.key && hit.t.try === c.label && hit.t.card !== false, where + ': ' + c.id); });
        /* people: only those with a public line, and only that line */
        s.people.forEach((p) => { const who = st.bible.people.filter((x) => x.id === p.id)[0]; assert.ok(who.public && p.line === who.public.line && p.name === who.name, where + ': ' + p.id); });
      });
    });
    assert.deepStrictEqual(Object.keys(kinds).sort(), st.flow.hubs && st.flow.hubs.length ? ['bridge', 'cover', 'end', 'hub', 'scene'].filter((k) => k !== 'bridge' || (st.flow.interludes || []).length) : ['cover', 'end', 'scene'], st.id + ': every kind of place was visited');
  });
});

test('every scene state reaches a player through the real table exactly as it was built', async () => {
  const T = await table(), seen = new Set();
  for (const st of [NP, STARTER, NP1]) {
    for (const [how, choose] of WAYS.slice(0, 4)) {
      const states = [];
      play(st, choose, (dm) => states.push(R.scene(st, dm)));
      for (const s of states) {
        const sig = JSON.stringify(s);
        if (seen.has(sig)) { continue; }
        seen.add(sig);
        const r = await T.publish(s);
        assert.strictEqual(r.status, 200, st.id + ', ' + how + ': ' + JSON.stringify(r.json));
        const got = await T.seen();
        assert.strictEqual(got.n, r.json.n);
        delete got.n;
        assert.deepStrictEqual(got, s, st.id + ', ' + how + ', ' + s.id + ': nothing cut, dropped or blanked on the way');
      }
    }
  }
  assert.ok(seen.size > 60, 'many different scenes were sent (' + seen.size + ')');
});

test('a scene too big for the table sheds the oldest story lines first, and still arrives', async () => {
  /* the largest adventure the format allows, written in letters that take three bytes each */
  const wide = (n) => '漢'.repeat(n), st = json(STARTER), dm = fresh();
  st.quests = Array.from({ length: 12 }, (x, i) => ({ id: 'q' + i, text: wide(160) }));
  st.clues = Array.from({ length: 20 }, (x, i) => ({ id: 'c' + i, text: wide(200) }));
  st.bible.people = Array.from({ length: 40 }, (x, i) => ({ id: 'p' + i, name: wide(60), public: { line: wide(160) } }));
  R.begin(st, dm);
  for (let i = 0; i < 30; i++) { dm.feed.splice(1, 0, { k: 'out', label: 'x', log: i + wide(238) }); }
  const s = R.scene(st, dm);
  within(s, 'the largest scene');
  assert.ok(s.story.length < 30 && s.quests.length === 12, 'story lines went first; the quest board is whole');
  assert.ok(s.story.length === 0 || s.story[s.story.length - 1].indexOf('0') === 0, 'and the newest line is the last to go');
  const T = await table(), r = await T.publish(s), got = await T.seen();
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  delete got.n;
  assert.deepStrictEqual(got, s);
});

/* ---------- format 1 ---------- */
test('a format 1 adventure plays exactly as before, and tells the phones only where the story is', () => {
  [[NP, NP1, NP_RAW], [STARTER, STARTER1, starterRaw()]].forEach(([two, one, raw]) => {
    assert.deepStrictEqual(V.check(asFormat1(raw), { images: NP_DIR }).filter((e) => !/picture|image|img/i.test(e)), [], 'the stripped copy is a valid format 1 file');
    WAYS.slice(0, 4).forEach(([how, choose], w) => {
      /* the same choices give the same session, entry for entry */
      const pickA = [], pickB = [], states = [];
      const a = play(two, (n, step) => { const c = choose(n, step); pickA.push(c); return c; }, () => {});
      let i = 0;
      const b = play(one, () => pickA[i++], (dm, at) => { pickB.push(at.key); states.push([at, R.scene(one, dm)]); });
      assert.deepStrictEqual(b, a, one.id + ', ' + how + ': the runner takes the same path through a format 1 file');
      states.forEach(([at, s]) => {
        within(s, one.id + ' format 1 at ' + at.key);
        assert.deepStrictEqual([s.summary, s.cards, s.quests, s.clues, s.people, s.story], ['', [], [], [], [], []], 'format 1 at ' + at.key + ': nothing that was written for the DM alone');
        assert.ok(s.title, 'but it still says where the story is');
        assert.deepStrictEqual(leaks(one, s), []);
      });
      assert.ok(w > 0 || pickB.length > 3);
    });
    assert.strictEqual(R.brief(one), null);
    assert.deepStrictEqual(R.handouts(one, fresh()), []);
  });
});

/* ---------- tries, cards and rolls ---------- */
test('the three kinds of try: a roll with one tap, nothing to roll, and a roll the DM asks for by hand', () => {
  const square = NP.flow.chapters[0].scenes[2].tries;
  assert.deepStrictEqual(square.map(R.kind), ['roll', 'roll', 'roll', 'none']);
  assert.deepStrictEqual(R.ask(square[0]), { label: 'Grab the cart and haul it back', why: '', skill: 'Athletics', target: 13, yes: square[0].yes, no: square[0].no });
  assert.strictEqual(R.ask(square[1]).why, 'Stop the cart any way you can think of', 'the card\'s small line says why');
  assert.strictEqual(R.ask(square[2]).skill, 'Persuasion', 'where the free words offer two skills, the check takes the first');
  /* with no `check` the free words are read as far as they go */
  const old = NP1.flow.chapters[0].scenes[2].tries;
  assert.deepStrictEqual(old.map(R.kind), ['hand', 'hand', 'hand', 'hand']);
  assert.deepStrictEqual(old.map((t) => { const a = R.ask(t); return [a.skill, a.target]; }), [['Athletics', 13], ['', 13], ['Persuasion', 10], ['', null]]);
  assert.deepStrictEqual(R.guess('Sleight of Hand or Stealth, hard'), { skill: 'Sleight of Hand', target: 16 });
  assert.deepStrictEqual(R.guess('Leave your signature (99)'), { skill: '', target: null }, 'a word inside another word is not a skill, and 99 is no target');
  assert.deepStrictEqual(R.guess(undefined), { skill: '', target: null });
  assert.deepStrictEqual([R.level(10), R.level(13), R.level(16), R.level(8), R.level(20), R.level(null)], ['Easy (10)', 'Medium (13)', 'Hard (16)', 'Easy (8)', 'Hard (20)', '']);
  /* whatever a try says, what goes to the table fits what the table keeps */
  scenesOf(NP).forEach(([at, s]) => (s.tries || []).forEach((t) => { const a = R.ask(t); assert.ok(a.label.length <= 60 && a.why.length <= 160 && a.yes.length <= 300 && a.no.length <= 300, at); }));
});

test('a card\'s id leads back to its own try, even after the story has moved on, and to nothing if it is not a card', () => {
  scenesOf(NP).forEach(([key, s]) => (s.tries || []).forEach((t, i) => {
    const hit = R.tryOf(NP, R.cardId(key, i));
    assert.ok(hit && hit.t === t && hit.i === i && hit.key === key && hit.scene === s, key + ' try ' + i);
  }));
  assert.strictEqual(R.tryOf(NP, 't0@sneezles').chapter, null, 'an interlude has no chapter');
  assert.strictEqual(R.tryOf(NP, 't0@arrival/square').chapter.id, 'arrival');
  ['', 't9@arrival/square', 't0@nowhere', 't0', 'x', null, undefined, 't0@arrival/'].forEach((id) => assert.strictEqual(R.tryOf(NP, id), null, String(id)));
  /* a very long name is cut to the table's forty letters and still finds its scene, as long as only one fits */
  const st = json(STARTER), long = 'a-scene-with-a-name-that-goes-on-and-on-and-on';
  st.flow.chapters[0].scenes[0].id = long;
  const key = st.flow.chapters[0].id + '/' + long, id = R.cardId(key, 0);
  assert.strictEqual(id.length, 40);
  assert.strictEqual(R.tryOf(st, id).scene, st.flow.chapters[0].scenes[0]);
});

/* ---------- handouts, the brief, the label ---------- */
test('handouts are offered where they belong: by scene, by chapter, interlude or hub, or everywhere', () => {
  const ids = (dm) => R.handouts(NP, dm).map((h) => h.id), dm = fresh();
  assert.deepStrictEqual(ids(dm), [], 'on the cover: only handouts with no `at`, and this adventure has none');
  R.begin(NP, dm); assert.deepStrictEqual(ids(dm), ['note']);
  first(NP, dm); assert.deepStrictEqual(ids(dm), []);
  first(NP, dm); first(NP, dm); assert.deepStrictEqual(ids(dm), ['recipe']);
  first(NP, dm); assert.deepStrictEqual(ids(dm), ['kit'], 'at the hub');
  R.pick(NP, dm, 'coal'); assert.deepStrictEqual(ids(dm), ['wetink']);
  const st = json(NP); delete st.handouts[2].at; st.handouts[0].at = 'arrival'; st.handouts.push({ id: 'empty', at: 'arrival' });
  const d2 = fresh();
  assert.deepStrictEqual(R.handouts(st, d2).map((h) => h.id), ['kit'], 'no `at`: always to hand');
  R.begin(st, d2); first(st, d2);
  assert.deepStrictEqual(R.handouts(st, d2).map((h) => h.id), ['note', 'kit'], 'a chapter\'s handout is offered in each of its scenes; one with nothing in it never is');
  /* every handout fits what `send` takes, and its picture is one the table accepts as shipped */
  NP.handouts.forEach((h) => { assert.ok(h.title.length <= 80 && (h.text || '').length <= 1200); if (h.img) { assert.match(h.img, /^packs\/northpole\/img\/[\w.-]+$/); } });
});

test('the brief: what it is about, the people who matter (looked up), how it can end, and the tips', () => {
  const b = R.brief(NP);
  assert.strictEqual(b.about, NP.brief.about);
  assert.deepStrictEqual(b.people.map((p) => p.name), ['Agent Crumb', 'Grumbleknot', 'Director Fizzwick']);
  assert.ok(b.people.every((p) => p.img && p.role));
  assert.deepStrictEqual([b.endings.length, b.tips.length], [3, 3]);
  const st = json(NP); st.brief = { people: ['nobody-by-that-name'], endings: [''], tips: [] };
  assert.strictEqual(R.brief(st), null, 'a brief with nothing in it is not shown');
  st.brief = { about: 'Short.' };
  assert.deepStrictEqual(R.brief(st), { about: 'Short.', endings: [], tips: [], people: [] });
});

test('the label as chips: every cartridge has a whole one, said in plain words', () => {
  P.list().forEach((p) => {
    const chips = R.chips(FR.useTheme(p.id).label);
    assert.ok(chips.length >= 5, p.id + ': ' + chips.join(' | '));
    chips.forEach((c) => assert.ok(c.length <= 40 && !/adults? only/i.test(c), c));
  });
  assert.deepStrictEqual(R.chips({ length: 'One sitting', players: 'Up to 8 players', tone: 'Adventure', dm: 'First-time DMs welcome', rating: 'teen', flags: ['Spiders'] }),
    ['One sitting', 'Up to 8 players', 'Adventure', 'First-time DMs welcome', 'Best for teens and up', 'Spiders']);
  assert.deepStrictEqual(R.chips({}), []);
  assert.deepStrictEqual(R.chips(undefined), []);
});

/* ---------- the runner knows no story ---------- */
test('src/dm.js holds nothing of any one adventure: no ids, no names, no titles', () => {
  const code = DM_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  [NP_RAW, starterRaw()].forEach((st) => {
    const ids = [st.id].concat(st.flow.chapters.map((c) => c.id), (st.flow.interludes || []).map((c) => c.id), (st.flow.hubs || []).map((c) => c.id), Object.keys(st.flags || {}),
      st.bible.people.map((p) => p.id), (st.bible.places || []).map((p) => p.id), (st.bible.things || []).map((p) => p.id));
    ids.forEach((id) => assert.ok(!new RegExp("['\"]" + id + "['\"]").test(code), 'src/dm.js names "' + id + '" of the adventure "' + st.id + '"'));
    const names = [st.title].concat(st.flow.chapters.map((c) => c.title), (st.flow.interludes || []).map((c) => c.title), st.bible.people.map((p) => p.name), st.bible.people.map((p) => p.full),
      (st.bible.places || []).map((p) => p.name), (st.bible.things || []).map((p) => p.name)).filter((n) => n && n.length >= 5);
    names.forEach((n) => assert.ok(DM_JS.indexOf(n) < 0, 'src/dm.js says "' + n + '", which belongs to the adventure "' + st.id + '"'));
  });
  P.list().forEach((p) => assert.ok(!new RegExp("['\"]" + p.id + "['\"]").test(code), 'src/dm.js names the pack "' + p.id + '"'));
  assert.doesNotMatch(DM_JS, /adults? only|for adults|grown-ups only/i);
});
