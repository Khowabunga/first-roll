/* The shared table, as far as it has no screen in it (docs/PHASE2.md, section 5): the second half of
   FR.run in src/dm.js, and FR.tv.view in src/tv.js. What is tested here:
     - the stage built for a place: its map, its soundscape, its picture held and turned over, a beat
     - which regions of a map are uncovered as flags change, as the story moves and by the DM's hand
     - the chapter map: the adventure's flow laid out as a graph, and how a session colours it
     - the pacing clock's arithmetic, a foe's health as a word, the turn order the table is shown
     - when a DM device takes up the table's session, sends its own, or has to ask
     - that nothing kept for the DM is in any stage built from the North Pole adventure, at every place
       on every way through it, and that every one of them reaches a big screen whole through the real table
     - that the big screen draws only what the whole room may see
   Two adventures are used throughout: the North Pole one and the starter `npm run new-cartridge` writes. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../../scripts/lib/packs.js');

if (!globalThis.crypto) { globalThis.crypto = require('node:crypto').webcrypto; }       // Node 18
const core = import('../../server/core.js');
const json = (v) => JSON.parse(JSON.stringify(v));
const DM_JS = fs.readFileSync(path.join(P.ROOT, 'src', 'dm.js'), 'utf8'), TV_JS = fs.readFileSync(path.join(P.ROOT, 'src', 'tv.js'), 'utf8');

/* the engine with every pack in it, then src/dm.js and src/tv.js: with no `document` each stops after its part with no screen */
const FR = P.engine();
P.list().forEach((p) => { const l = P.load(p.file); assert.strictEqual(l.error, '', p.id + ' ' + l.error); FR.cartridge(l.def); });
new Function('FR', DM_JS)(FR); new Function('FR', TV_JS)(FR);
const R = FR.run, TV = FR.tv;
const NP_RAW = P.loadAdventure(path.join(P.ROOT, 'cartridges', 'northpole', 'adventure.js')).def;
function starterRaw() {
  const calls = [], text = fs.readFileSync(path.join(P.ROOT, 'scripts', 'template', 'adventure.js'), 'utf8').split('__ID__').join('starter').split('__NAME__').join('Starter');
  vm.runInNewContext(text, { FR: { adventure: (i, d) => { calls.push(d); } } });
  return json(calls[0]);
}
const NP = FR.adventure('northpole', NP_RAW), STARTER = FR.adventure('starter', starterRaw());
FR.adventure('northpole', NP_RAW);                    // leave the registry as it was
/* an adventure with everything format 3 added taken back out */
function asFormat2(adv) {
  const a = json(adv); a.schema = 2;
  ['maps', 'foes'].forEach((k) => delete a[k]);
  const strip = (s) => ['map', 'sound', 'beats', 'reveal', 'easier', 'harder', 'foes', 'vote', 'minutes'].forEach((k) => delete s[k]);
  a.flow.chapters.forEach((c) => { strip(c); c.scenes.forEach(strip); });
  (a.flow.interludes || []).forEach(strip); (a.flow.hubs || []).forEach(strip);
  return a;
}

const fresh = () => ({ feed: [{ k: 'cover' }], flags: {}, order: [] });
function step(st, dm, choose) {
  const at = R.place(st, dm), pick = choose || (() => 0);
  if (at.kind === 'cover') { R.begin(st, dm); }
  else if (at.kind === 'hub') { const left = R.choices(st, dm, at.hub); R.pick(st, dm, left[pick(left.length)].to); }
  else { const outs = at.scene.outcomes; R.choose(st, dm, dm.feed[at.i], outs[pick(outs.length)]); }
}
/* play a session to its end; `each(dm, at)` sees it at every place it stops, the cover and the end included */
function play(st, choose, each) {
  const dm = fresh(); let n = 0;
  for (;;) {
    const at = R.place(st, dm);
    each(dm, at);
    if (at.kind === 'end') { break; }
    assert.ok(++n < 200, 'the story reaches an end');
    step(st, dm, choose);
  }
  return dm;
}
const until = (st, dm, key) => { let n = 0; while (R.place(st, dm).key !== key) { assert.ok(++n < 60, 'the story reaches ' + key); step(st, dm); } return dm; };
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const WAYS = [['the first choice every time', () => 0], ['the last choice every time', (n) => n - 1]]
  .concat([1, 2, 3, 4].map((seed) => { const rnd = lcg(seed); return ['at random, ' + seed, (n) => Math.floor(rnd() * n)]; }));
const scenesOf = (adv) => [].concat(...adv.flow.chapters.map((c) => c.scenes), adv.flow.interludes || []);

/* ---------- the stage for a place ---------- */
test('the stage for a place: its map with every region as a name and a rectangle, its soundscape, and its picture face down', () => {
  const dm = until(NP, fresh(), 'arrival/snowbank');
  let s = R.stage(NP, dm, {});
  assert.deepStrictEqual(Object.keys(s), ['map', 'sound'], 'this place has a map and a soundscape, and no picture to hold');
  assert.deepStrictEqual(Object.keys(s.map), ['id', 'title', 'img', 'regions', 'open']);
  assert.strictEqual(s.map.id, 'pole'); assert.strictEqual(s.map.title, 'The North Pole');
  assert.strictEqual(s.map.img, FR.asset('northpole', 'img/map_pole.svg'), 'the picture is an address a page can load');
  assert.strictEqual(s.map.regions.length, 9);
  s.map.regions.forEach((r) => assert.deepStrictEqual(Object.keys(r), ['id', 'name', 'x', 'y', 'w', 'h'], 'a region is a name and a rectangle: its `when` never leaves the DM\'s screen'));
  assert.deepStrictEqual(s.map.open, ['snowbank']);
  assert.deepStrictEqual(s.sound, { bed: 'wind', level: 1 }, 'the scene\'s own soundscape');
  until(NP, dm, 'arrival/square');
  assert.deepStrictEqual(R.stage(NP, dm, { level: 0.4 }).sound, { bed: 'crowd', level: 0.4 }, 'a scene with none of its own plays its chapter\'s, at the level the DM keeps');
  until(NP, dm, 'arrival/crumb');
  s = R.stage(NP, dm, {});
  assert.deepStrictEqual(s.reveal, { id: 'crumb', title: 'Somebody in a very large trench coat', img: FR.asset('northpole', 'img/dm_crumb.webp'), shown: false });
  assert.deepStrictEqual(R.flipped(R.offers(NP, dm).reveal), Object.assign({}, s.reveal, { shown: true }), 'turned over, it is the same picture with shown: true');
  assert.deepStrictEqual(R.beat({ id: 'shadows', label: 'A figure steps out of the shadows', kind: 'reveal' }), { kind: 'reveal' }, 'a beat is sent as its kind alone: the label is the DM\'s button');
  until(NP, dm, 'errands');
  s = R.stage(NP, dm, {});
  assert.deepStrictEqual([s.map.open, s.sound.bed, s.reveal], [['snowbank', 'square', 'bakery'], 'carols', undefined], 'a hub puts the map up as it stands, with its own soundscape');
  assert.deepStrictEqual(R.stage(NP, fresh(), {}), {}, 'the cover asks nothing of the stage');
});

test('what a place offers: its beats, its foes, a vote and the two lines of the dial, each only where the adventure wrote one', () => {
  const dm = until(NP, fresh(), 'arrival/square'), o = R.offers(NP, dm);
  assert.deepStrictEqual(o.beats.map((b) => b.kind), ['thunder', 'crash']);
  assert.deepStrictEqual(o.foes.map((f) => [f.foe, f.name, f.hits]), [['cart', 'The runaway cookie cart', 1]]);
  assert.ok(o.easier && o.harder && o.foes[0].moves.length === 3);
  assert.strictEqual(o.vote, null);
  const at = until(NP, fresh(), 'laugh/nook'); step(NP, at); step(NP, at); step(NP, at);
  assert.strictEqual(R.place(NP, at).key, 'sneezles');
  assert.deepStrictEqual(R.offers(NP, at).vote, { q: 'Mrs. Claus offers one thing to take along. Which?', options: ['A flask of cocoa', 'Santa’s spare key', 'A forty-foot scarf'] });
  /* an adventure written before any of this offers nothing anywhere, and nothing breaks */
  const old = asFormat2(NP);
  play(old, () => 0, (dm2) => {
    assert.deepStrictEqual(R.stage(old, dm2, {}), {});
    const f = R.offers(old, dm2);
    assert.deepStrictEqual([f.map, f.sound, f.reveal, f.beats, f.vote, f.foes, f.easier, f.harder], [null, '', null, [], null, [], '', '']);
    assert.strictEqual(R.pace(old, dm2, 600000), null, 'no minutes anywhere: no clock');
    assert.ok(R.graph(old, dm2).nodes.length > 0, 'the chapter map needs nothing new');
  });
});

test('a picture the DM picks by hand waits under plain words, and is turned over under its own name', () => {
  const dm = until(NP, fresh(), 'arrival/crumb'), pics = R.pictures(NP, dm);
  assert.strictEqual(pics[0].id, 'crumb', 'the scene\'s own reveal comes first');
  assert.strictEqual(pics[0].held, pics[0].title, 'and waits under the title its author wrote for that');
  const other = pics.filter((p) => p.held !== p.title)[0];
  assert.ok(other, 'the scene has other pictures too');
  assert.strictEqual(R.held(other).title, 'A picture, face down');
  assert.strictEqual(R.flipped(other).title, other.title);
  assert.strictEqual(new Set(pics.map((p) => p.img)).size, pics.length, 'no picture is offered twice');
});

/* ---------- the map: what is uncovered ---------- */
test('a map\'s regions are uncovered by the places the story reaches, by flags, and by the DM\'s own hand', () => {
  const dm = fresh();
  assert.deepStrictEqual(R.mapOpen(NP, dm, 'pole'), [], 'nothing before the story begins');
  until(NP, dm, 'arrival/square');
  assert.deepStrictEqual(R.mapOpen(NP, dm, 'pole'), ['snowbank', 'square']);
  dm.flags.choir = 'safe';
  assert.deepStrictEqual(R.mapOpen(NP, dm, 'pole'), ['snowbank', 'square', 'bakery'], 'a region with a `when` is uncovered the moment it holds, before any place opens it');
  delete dm.flags.choir;
  assert.deepStrictEqual(R.mapOpen(NP, dm, 'pole', { lights: true, square: false }), ['snowbank', 'lights'], 'the DM uncovers one by hand and covers another; the order is the map\'s own');
  assert.deepStrictEqual(R.mapOpen(NP, dm, 'nowhere'), []);
  assert.strictEqual(R.stageMap(NP, dm, 'nowhere'), null);
  /* a region with no `when` is never uncovered just because nothing forbids it */
  const st = json(NP); st.maps[0].regions.forEach((r) => delete r.when);
  assert.deepStrictEqual(R.mapOpen(st, fresh(), 'pole'), []);
  /* by the end of the story the whole map has been uncovered */
  const done = play(NP, () => 0, () => {});
  assert.strictEqual(R.mapOpen(NP, done, 'pole').length, 9);
  /* the starter: three regions, the last by a flag */
  const s = until(STARTER, fresh(), 'inn/door');
  assert.deepStrictEqual(R.mapOpen(STARTER, s, 'inn'), ['taproom', 'door']);
  s.flags.met = 'friend';
  assert.deepStrictEqual(R.mapOpen(STARTER, s, 'inn'), ['taproom', 'door', 'cellar']);
});

/* ---------- foes and the turn order ---------- */
test('a foe\'s health is a word: fine, hurt, nearly done, out, and every hit but the middle ones of a big foe moves it on', () => {
  const word = (h, t) => R.foeState(h, t).id;
  assert.deepStrictEqual([0, 1].map((t) => word(1, t)), ['fine', 'out']);
  assert.deepStrictEqual([0, 1, 2].map((t) => word(2, t)), ['fine', 'nearly', 'out']);
  assert.deepStrictEqual([0, 1, 2, 3].map((t) => word(3, t)), ['fine', 'hurt', 'nearly', 'out']);
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7].map((t) => word(6, t)), ['fine', 'hurt', 'hurt', 'hurt', 'hurt', 'nearly', 'out', 'out']);
  assert.strictEqual(word(3, -2), 'fine'); assert.strictEqual(word('x', 0), 'fine'); assert.strictEqual(word(99, 6), 'out', 'never more than six hits');
  assert.deepStrictEqual(R.FOE.map((s) => s.word), ['Fine', 'Hurt', 'Nearly done', 'Out']);
});

test('the same foe listed twice is two of them, told apart by number', () => {
  const st = json(NP), scene = st.flow.chapters[0].scenes[2];
  scene.foes = ['sprites', 'cart', 'sprites', 'nobody'];
  assert.deepStrictEqual(R.foes(st, scene).map((f) => [f.foe, f.name]), [['sprites', 'The soot sprites 1'], ['cart', 'The runaway cookie cart'], ['sprites', 'The soot sprites 2']]);
  assert.deepStrictEqual(R.foes(st, {}), []);
});

test('the turn order the table is shown: heroes under their seat\'s id, foes after everyone who rolled, sixteen at most', () => {
  const players = [{ id: 'aa', name: 'Mira', char: { name: 'Ginger' }, portrait: 'packs/x/img/a.webp' }, { id: 'bb', name: 'Tom', char: null, portrait: '' }];
  const turns = { at: 'f:4', rows: [
    { key: 'f:4', id: '', name: 'The soot sprites 1', total: 0, ord: 4, foe: 'sprites', hits: 2, taken: 1, img: '' },
    { key: 'p:bb', id: 'bb', name: 'Tom', total: 7, ord: 2 }, { key: 'p:aa', id: 'aa', name: 'Mira', total: 19, ord: 1 },
    { key: 'p:zz', id: 'zz', name: 'Gone', total: 30, ord: 3 }, { key: 'h:5', id: '', name: 'A guard', total: 12, ord: 5, hand: true },
    { key: 'f:6', id: '', name: 'The soot sprites 2', total: 0, ord: 6, foe: 'sprites', hits: 2, taken: 2, img: '' }] };
  const o = R.order(turns, players);
  assert.deepStrictEqual(o.order, [
    { id: 'aa', name: 'Ginger', kind: 'hero', state: '', img: 'packs/x/img/a.webp' },
    { id: 'h:5', name: 'A guard', kind: 'foe', state: '', img: '' },
    { id: 'bb', name: 'Tom', kind: 'hero', state: '', img: '' },
    { id: 'f:4', name: 'The soot sprites 1', kind: 'foe', state: 'Nearly done', img: '' },
    { id: 'f:6', name: 'The soot sprites 2', kind: 'foe', state: 'Out', img: '' }], 'a seat that has gone is left out; the two sprites have ids of their own');
  assert.strictEqual(o.now, 'f:4');
  assert.strictEqual(new Set(o.order.map((e) => e.id)).size, o.order.length);
  assert.ok(!JSON.stringify(o).includes('taken') && !JSON.stringify(o).includes('hits'), 'no numbers: a foe\'s health is its word');
  const many = { at: '', rows: Array.from({ length: 30 }, (x, i) => ({ key: 'h:' + i, id: '', name: 'Guard ' + i, total: 30 - i, ord: i })) };
  assert.strictEqual(R.order(many, []).order.length, 16);
  assert.deepStrictEqual(R.order(null, null), { order: [], now: '' });
});

/* ---------- the spotlight ---------- */
test('the spotlight: who has gone longest without a roll, a proposal or a moment, quietest first', () => {
  const ps = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo', char: { name: 'Bright' } }, { id: 'c', name: 'Cy' }], now = 1000000;
  const acts = { rolls: [{ id: 'a', role: 'player', at: now - 60000 }, { id: 'x', role: 'dm', at: now }], asks: [{ id: 'b', at: now - 500000 }], requests: [{ at: now - 900000, results: { b: { at: now - 300000 } } }] };
  let q = R.quiet(ps, acts, { seen: { a: now - 800000, b: now - 800000, c: now - 700000 }, spot: {} }, now);
  assert.deepStrictEqual(q.map((r) => [r.id, r.ms, r.acted]), [['c', 700000, false], ['b', 300000, true], ['a', 60000, true]]);
  assert.strictEqual(q[1].hero, 'Bright');
  q = R.quiet(ps, acts, { seen: { c: now - 700000 }, spot: { c: now - 1000 } }, now);
  assert.strictEqual(q[0].id, 'b', 'someone the DM has just given the next moment is no longer the quietest');
  assert.deepStrictEqual(R.quiet([], null, null, now), []);
  assert.deepStrictEqual([0, 59000 * 0.4, 4 * 60000, 70 * 60000, 120 * 60000].map(R.span), ['just now', 'just now', '4 min', '1 h 10 min', '2 h']);
});

/* ---------- the chapter map ---------- */
function sound(g, st, where) {
  const ids = g.nodes.map((n) => n.id);
  assert.strictEqual(new Set(ids).size, ids.length, where + ': every node once');
  const want = st.flow.chapters.map((c) => c.id).concat((st.flow.interludes || []).map((c) => c.id), (st.flow.hubs || []).map((c) => c.id));
  want.forEach((id) => assert.ok(ids.includes(id), where + ': ' + id + ' is on the map'));
  assert.ok(g.nodes.some((n) => n.kind === 'end'), where + ': an ending is drawn');
  const place = new Set(g.nodes.map((n) => n.layer + '/' + n.slot));
  assert.strictEqual(place.size, g.nodes.length, where + ': no two nodes in the same place');
  g.nodes.forEach((n) => { assert.ok(n.layer >= 0 && n.layer < g.layers && n.slot >= 0 && n.slot < n.of, where + ': ' + n.id + ' is inside the layout'); assert.ok(['here', 'seen', 'ahead', 'closed'].includes(n.state)); });
  g.nodes.filter((n) => n.kind === 'end').forEach((n) => assert.strictEqual(n.layer, g.layers - 1, where + ': endings sit on the last line'));
  g.edges.forEach((e) => {
    assert.ok(ids.includes(e.from) && ids.includes(e.to), where + ': an edge joins two nodes');
    assert.ok(['taken', 'open', 'closed'].includes(e.state));
    const a = g.nodes.find((n) => n.id === e.from), b = g.nodes.find((n) => n.id === e.to);
    if (!e.back) { assert.ok(b.layer > a.layer, where + ': ' + e.from + ' > ' + e.to + ' leads down the page'); }
    assert.strictEqual(e.via, undefined, 'the working notes are not handed out');
  });
  assert.ok(g.nodes.filter((n) => n.state === 'here').length <= 1);
}
const nodeOf = (g, id) => g.nodes.find((n) => n.id === id), edgeOf = (g, a, b) => g.edges.find((e) => e.from === a && e.to === b);

test('the chapter map of the North Pole adventure: laid out in layers from the start, with the hub\'s branches side by side', () => {
  const g = R.graph(NP, fresh());
  sound(g, NP, 'cover');
  assert.strictEqual(g.layers, 7);
  assert.deepStrictEqual(['arrival', 'errands', 'laugh', 'snow', 'coal', 'sneezles', 'drip', 'finale', 'midnight'].map((id) => nodeOf(g, id).layer), [0, 1, 2, 2, 2, 3, 3, 4, 5]);
  assert.deepStrictEqual(['laugh', 'snow', 'coal'].map((id) => [nodeOf(g, id).slot, nodeOf(g, id).of]), [[0, 3], [1, 3], [2, 3]]);
  assert.ok(nodeOf(g, 'arrival').start && nodeOf(g, 'errands').kind === 'hub' && nodeOf(g, 'sneezles').kind === 'interlude');
  assert.ok(g.nodes.every((n) => n.state === 'ahead') && g.edges.every((e) => e.state === 'open'), 'before the story begins everything is still ahead');
  assert.ok(edgeOf(g, 'sneezles', 'errands').back && edgeOf(g, 'drip', 'errands').back, 'the interludes lead back up to the hub');
  assert.deepStrictEqual(g.edges.filter((e) => e.shortcut).map((e) => e.from + '>' + e.to).sort(), ['drip>finale', 'errands>finale', 'sneezles>finale']);
  assert.strictEqual(edgeOf(g, 'errands', 'laugh').kind, 'option');
});

test('the chapter map follows the session: where the party is, the way it came, and what the flags have closed', () => {
  const dm = until(NP, fresh(), 'laugh/nook');
  let g = R.graph(NP, dm); sound(g, NP, 'first errand');
  assert.deepStrictEqual(['arrival', 'errands', 'laugh', 'snow', 'finale'].map((id) => nodeOf(g, id).state), ['seen', 'seen', 'here', 'ahead', 'ahead']);
  assert.deepStrictEqual([edgeOf(g, 'arrival', 'errands').state, edgeOf(g, 'errands', 'laugh').state, edgeOf(g, 'errands', 'snow').state], ['taken', 'taken', 'open']);
  assert.deepStrictEqual(['sneezles', 'drip', 'finale'].map((to) => edgeOf(g, 'laugh', to).state), ['open', 'closed', 'closed'], 'after one errand the story goes to the first interlude: the other two ways out are closed as things stand');
  /* the shortcut: straight from the hub to the finale, and everything skipped is closed */
  until(NP, dm, 'errands');
  R.jump(NP, dm, NP.flow.shortcuts[0]);
  g = R.graph(NP, dm); sound(g, NP, 'after the shortcut');
  assert.deepStrictEqual(['snow', 'coal', 'drip', 'sneezles', 'finale', 'midnight'].map((id) => nodeOf(g, id).state), ['closed', 'closed', 'closed', 'seen', 'here', 'ahead']);
  assert.deepStrictEqual([edgeOf(g, 'errands', 'finale').state, edgeOf(g, 'errands', 'snow').state, edgeOf(g, 'snow', 'finale').state, edgeOf(g, 'finale', 'midnight').state], ['taken', 'closed', 'closed', 'open']);
  /* the whole story, every errand run: the last errand leads straight on to the finale */
  const all = play(NP, () => 0, () => {});
  g = R.graph(NP, all); sound(g, NP, 'the end');
  assert.strictEqual(g.nodes.find((n) => n.state === 'here').kind, 'end');
  assert.ok(g.nodes.every((n) => n.state !== 'ahead'), 'nothing is still ahead at the end');
  assert.deepStrictEqual([edgeOf(g, 'midnight', '/end:midnight').state, edgeOf(g, 'coal', 'finale').state, edgeOf(g, 'errands', 'finale').state], ['taken', 'taken', 'closed']);
  /* an adventure whose errands all lead back to the hub: with nothing left to choose the hub is passed without stopping, and both halves of that way are marked */
  const viaHub = json(NP); viaHub.flow.chapters.filter((c) => ['laugh', 'snow', 'coal'].includes(c.id)).forEach((c) => { c.next = [{ to: 'errands' }]; });
  g = R.graph(viaHub, play(viaHub, () => 0, () => {})); sound(g, viaHub, 'through the hub');
  assert.deepStrictEqual([edgeOf(g, 'coal', 'errands').state, edgeOf(g, 'errands', 'finale').state], ['taken', 'taken']);
  /* every way through, at every stop: the map stays sound and the party is on it */
  WAYS.forEach(([how, choose]) => play(NP, choose, (d, at) => { const x = R.graph(NP, d); sound(x, NP, how + ' at ' + at.key); if (at.kind !== 'cover') { assert.strictEqual(x.nodes.filter((n) => n.state === 'here').length, 1, how + ' at ' + at.key + ': the party is somewhere'); } }));
});

test('the chapter map of the starter adventure: one chapter and its ending, and still a map', () => {
  let g = R.graph(STARTER, fresh()); sound(g, STARTER, 'starter cover');
  assert.deepStrictEqual(g.nodes.map((n) => [n.id, n.kind, n.layer, n.state]), [['inn', 'chapter', 0, 'ahead'], ['/end:inn', 'end', 1, 'ahead']]);
  assert.deepStrictEqual(g.edges.map((e) => [e.from, e.to, e.kind, e.state]), [['inn', '/end:inn', 'next', 'open']]);
  const done = play(STARTER, () => 0, (d) => sound(R.graph(STARTER, d), STARTER, 'starter'));
  g = R.graph(STARTER, done);
  assert.deepStrictEqual([nodeOf(g, 'inn').state, nodeOf(g, '/end:inn').state, g.edges[0].state], ['seen', 'here', 'taken']);
  /* an outcome that ends the story, or sends it somewhere, is a way on the map as well */
  const st = json(STARTER); st.flow.chapters[0].scenes[0].outcomes[1].end = true; st.flow.chapters[0].next = [{ when: { flag: 'key' }, to: 'inn' }, { end: true }];
  g = R.graph(st, fresh()); sound(g, st, 'starter with an early ending');
  assert.strictEqual(g.nodes.filter((n) => n.kind === 'end').length, 1, 'one ending for each part the story can end from');
});

/* ---------- the pacing clock ---------- */
test('the pacing clock: time spent against the chapters\' minutes, with a few minutes\' grace either way', () => {
  const min = (m) => m * 60000, dm = fresh();
  let p = R.pace(NP, dm, 0);
  assert.deepStrictEqual([p.total, p.state, p.lo, p.hi], [150, 'on', 0, 0], 'the label\'s two and a half hours; nothing is behind before it begins');
  until(NP, dm, 'arrival/square');                       // the third of four scenes in a 20-minute chapter
  p = R.pace(NP, dm, min(12));
  assert.deepStrictEqual([p.lo, p.hi, p.state, p.by, p.left], [10, 15, 'on', 0, 140]);
  assert.deepStrictEqual([R.pace(NP, dm, min(7)).state, R.pace(NP, dm, min(6)).state, R.pace(NP, dm, min(6)).by], ['on', 'ahead', 4], 'three minutes of grace, then ahead by the rest');
  assert.deepStrictEqual([R.pace(NP, dm, min(18)).state, R.pace(NP, dm, min(26)).state, R.pace(NP, dm, min(26)).by], ['on', 'behind', 11]);
  assert.deepStrictEqual(R.pace(NP, dm, min(26)).cuts, [], 'no shortcut is on offer in the first chapter');
  assert.strictEqual(R.pace(NP, dm, min(26)).later.length, 1, 'but one is coming, and it is named');
  until(NP, dm, 'errands');
  p = R.pace(NP, dm, min(50));
  assert.deepStrictEqual([p.lo, p.hi, p.state, p.by, p.cuts.map((c) => c.to), p.later], [20, 20, 'behind', 30, ['finale'], []], 'at the hub, behind, the adventure\'s shortcut is what can be cut');
  R.jump(NP, dm, NP.flow.shortcuts[0]);
  p = R.pace(NP, dm, min(50));
  assert.deepStrictEqual([p.lo, p.hi, p.left, p.cuts, p.later], [20, 28.75, 45, [], []], 'what was skipped is no longer counted as still to come');
  const done = play(NP, () => 0, () => {});
  p = R.pace(NP, done, min(140));
  assert.deepStrictEqual([p.lo, p.hi, p.left, p.state], [150, 150, 0, 'behind'].slice(0, 3).concat(['ahead']));
  assert.strictEqual(R.pace(STARTER, until(STARTER, fresh(), 'inn/door'), min(5)).total, 10);
  const none = json(STARTER); delete none.flow.chapters[0].minutes;
  assert.strictEqual(R.pace(none, fresh(), 0), null, 'an adventure that gives no minutes has no clock');
});

/* ---------- the session on the table ---------- */
test('when a DM device looks at the table: take up the table\'s session, send its own, or ask, and only ask for a true conflict', () => {
  const T = (local, base, table, same) => R.sync({ local: local, base: base, table: table, same: !!same });
  assert.strictEqual(T(0, 0, 0), 'none', 'nothing anywhere');
  assert.strictEqual(T(50, 0, 0), 'save', 'the table holds nothing yet: this device\'s story is sent');
  assert.strictEqual(T(0, 0, 100), 'adopt', 'a device with no story of its own takes up the table\'s without asking');
  assert.strictEqual(T(100, 100, 100), 'none', 'in step');
  assert.strictEqual(T(140, 100, 100), 'save', 'this device moved on: its story is sent');
  assert.strictEqual(T(100, 100, 180), 'adopt', 'another device moved the story on: follow it, without asking');
  assert.strictEqual(T(90, 0, 180), 'adopt', 'a session from another table, older than this table\'s save: the table\'s is taken up');
  assert.strictEqual(T(140, 100, 180), 'adopt', 'both moved, the table last: the table\'s save is the newer');
  assert.strictEqual(T(200, 100, 180), 'ask', 'both moved, this device last: each holds a place the other has not seen');
  assert.strictEqual(T(200, 0, 180), 'ask', 'a session this table never saw, newer than the table\'s own');
  assert.strictEqual(T(200, 100, 180, true), 'adopt', 'but not when both already hold the same story');
});

test('the session as the table keeps it: whole when it fits, shedding the helper\'s answers and pictures before any of the story', () => {
  const dm = play(NP, () => 0, () => {});
  Object.assign(dm, { party: [{ who: 'Ann' }], turns: { rows: [{ key: 'h:1' }], at: 'h:1' }, stage: { at: 'x', hand: {} }, clock: { spent: 5 }, at: 77, base: 70, table: 'ABCD' });
  let back = R.unpack(R.pack(dm));
  assert.deepStrictEqual(back.feed, dm.feed); assert.deepStrictEqual([back.flags, back.order, back.at, back.clock], [dm.flags, dm.order, 77, { spent: 5 }]);
  assert.ok(!('base' in back) && !('table' in back), 'which save a device last saw is that device\'s own');
  assert.strictEqual(R.storySig(back), R.storySig(dm));
  const big = json(dm);
  for (let i = 0; i < 80; i++) { big.feed.splice(3, 0, { k: 'ai', mode: 'try', q: 'x'.repeat(200), a: { yes: 'y'.repeat(400), no: 'n'.repeat(400) } }, { k: 'pic', id: 'p' + i, url: 'api/table/img?code=ABCD&id=0123456789abcdef', brief: 'b'.repeat(600) }); }
  assert.ok(JSON.stringify(big).length > 60000);
  const packed = R.pack(big);
  assert.ok(packed.length > 0 && packed.length <= 60000, 'it fits what the table keeps');
  back = R.unpack(packed);
  assert.strictEqual(R.storySig(back), R.storySig(dm), 'the story itself is never cut');
  assert.ok(back.feed.length < big.feed.length);
  assert.strictEqual(R.storySig(Object.assign(json(dm), { feed: dm.feed.slice(0, -2) })) === R.storySig(dm), false);
  assert.deepStrictEqual([R.unpack(''), R.unpack('{'), R.unpack('{"feed":[]}'), R.unpack('[1]')], [null, null, null, null]);
});

/* ---------- nothing kept for the DM is ever on the stage ---------- */
/* Everything an adventure keeps for the DM: no whole line of it may be in anything built for the table. */
function secrets(st) {
  const out = [], add = (v) => { [].concat(v || []).forEach((x) => { if (typeof x === 'string' && x.trim().length >= 12) { out.push(x.trim()); } }); };
  const B = st.bible || {};
  add(st.pitch); add(st.howto); add(B.truths); add(B.outline);
  if (st.brief) { add(st.brief.about); add(st.brief.endings); add(st.brief.tips); }
  (B.people || []).forEach((p) => { add([p.secret, p.wants, p.voice, p.look]); add(p.lines); });
  (B.places || []).forEach((p) => add([p.blurb, p.senses]));
  (B.things || []).forEach((p) => add(p.blurb));
  st.flow.chapters.forEach((c) => { add(c.goal); (c.perks || []).forEach((x) => add(x.text)); (c.leaving || []).forEach((x) => add(x.read)); });
  (st.flow.hubs || []).forEach((h) => { add([h.goal, h.help]); h.options.forEach((o) => add([o.feel])); });
  scenesOf(st).forEach((s) => {
    add(s.notes); add(s.read); add(s.otherwise); add(s.paint); add(s.goal);
    add([s.easier, s.harder]);                                             // the difficulty dial
    (s.beats || []).forEach((b) => add(b.label));                           // a beat's label is the DM's button
    (s.also || []).concat(s.extras || []).forEach((x) => add(x.read));
    ((s.versions && s.versions.options) || []).forEach((o) => add(o.read));
    (s.tries || []).forEach((t) => { add([t.roll, t.yes, t.no]); if (t.card === false) { add([t.try, t.hint]); } });
    s.outcomes.forEach((o) => { if (o.label !== o.log) { add(o.label); } });
  });
  (st.foes || []).forEach((f) => add(f.moves));                             // what a foe might do
  (st.handouts || []).forEach((h) => add(h.text));
  return out;
}
const leaks = (st, thing) => { const text = JSON.stringify(thing); return secrets(st).filter((s) => text.indexOf(JSON.stringify(s).slice(1, -1)) >= 0); };
/* everything a place can put on the stage: arriving, every picture held and turned over, every beat, a full fight */
function patches(st, dm) {
  const o = R.offers(st, dm), out = [R.stage(st, dm, { hand: { pole: { lights: true } }, level: 0.7 })];
  R.pictures(st, dm).forEach((p) => { out.push({ reveal: R.held(p) }); out.push({ reveal: R.flipped(p) }); });
  o.beats.forEach((b) => out.push({ beat: R.beat(b) }));
  const rows = o.foes.map((f, i) => ({ key: 'f:' + i, id: '', name: f.name, total: 0, ord: i, foe: f.foe, hits: f.hits, taken: i % (f.hits + 1), img: f.img }));
  out.push(Object.assign({ spot: 'aa' }, R.order({ rows: rows.concat([{ key: 'p:aa', id: 'aa', name: 'Ann', total: 12, ord: 99 }]), at: rows.length ? rows[0].key : '' }, [{ id: 'aa', name: 'Ann', char: { name: 'Hero' }, portrait: '' }])));
  return out;
}

test('nothing kept for the DM is in any stage or scene built from the North Pole adventure, at every place on every way through', () => {
  assert.ok(secrets(NP).length > 300, 'there is plenty that must not get out');
  assert.ok(secrets(NP).includes(NP.foes[0].moves[0]) && secrets(NP).includes(NP.flow.chapters[0].scenes[2].easier) && secrets(NP).includes(NP.flow.chapters[0].scenes[0].beats[0].label));
  const seen = new Set();
  [[NP, 'North Pole'], [STARTER, 'starter']].forEach(([st, name]) => WAYS.forEach(([how, choose]) => play(st, choose, (dm, at) => {
    const where = name + ', ' + how + ', at ' + at.key;
    seen.add(name + at.key);
    patches(st, dm).forEach((p) => {
      assert.deepStrictEqual(leaks(st, p), [], where + ': the stage says nothing kept for the DM');
      assert.ok(Object.keys(p).every((k) => ['reveal', 'map', 'sound', 'beat', 'spot', 'order', 'now'].includes(k)), where + ': only parts the table knows');
      assert.ok(!/"(when|moves|label|hits|taken|easier|harder|notes)":/.test(JSON.stringify(p)), where + ': and none of the DM\'s own fields');
      assert.ok(Buffer.byteLength(JSON.stringify(p)) < 16 * 1024, where + ': under the table\'s 16 KB');
    });
    assert.deepStrictEqual(leaks(st, R.scene(st, dm)), [], where + ': nor does the scene');
    const o = R.offers(st, dm);
    if (o.vote) { assert.deepStrictEqual(leaks(st, o.vote), [], where + ': a vote is written for the table'); }
  })));
  const every = NP.flow.chapters.reduce((n, c) => n + c.scenes.length, 0) + NP.flow.interludes.length + NP.flow.hubs.length + 2;
  assert.strictEqual([...seen].filter((k) => k.startsWith('North Pole')).length, every, 'every place of the North Pole adventure was stood at, the cover and the end included');
});

/* A table of its own, on the real server code. */
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
  const dm = (await post('open', { passcode: env.DM_PASSCODE, scenario: 'northpole' })).json;
  const join = async (name) => (await post('join', { name: name }, dm.code)).json;
  const key = (await post('screen', { token: dm.token }, dm.code)).json.key;
  return { code: dm.code, dm: dm.token, key: key, join: join, post: (route, body) => post(route, body, dm.code), as: (token, body) => post('state', Object.assign({ token: token }, body), dm.code).then((r) => r.json) };
}

test('every stage the North Pole adventure builds reaches a big screen through the real table exactly as it was built', async () => {
  const t = await table(), ann = await t.join('Ann');
  const dm = fresh(); let n = 0;
  for (;;) {
    const at = R.place(NP, dm), want = R.stage(NP, dm, {});
    for (const p of patches(NP, dm).map((x) => { const y = json(x); if (y.spot) { y.spot = ann.id; y.order.forEach((e) => { if (e.kind === 'hero') { e.id = ann.id; } }); } return y; })) {
      const res = await t.post('stage', { token: t.dm, patch: p });
      assert.strictEqual(res.status, 200, at.key + ': the table takes it');
    }
    if (Object.keys(want).length) {
      await t.post('stage', { token: t.dm, patch: want });
      const got = (await t.as(t.key)).stage;
      Object.keys(want).forEach((k) => assert.deepStrictEqual(got[k], want[k], at.key + ': the ' + k + ' arrives whole'));
    }
    if (at.kind === 'end') { break; }
    assert.ok(++n < 80); step(NP, dm);
  }
});

/* ---------- the big screen ---------- */
test('the big screen draws only what the whole room may see: no hook, no private note, no proposal, no target and neither of its lines', async () => {
  const t = await table(), ann = await t.join('Ann'), bo = await t.join('Bo');
  await t.post('me', { token: ann.token, char: { name: 'Ginger', race: 'Gingerbread', cls: 'Chimney Sneak', line: 'Quick', look: 'SECRET-LOOK of a hero' }, hook: { id: 'h', text: 'HOOK-ONLY-FOR-ANN-AND-THE-DM' }, bond: { to: bo.id, prompt: 'A public question about Bo?', text: 'A public answer' } });
  await t.post('award', { token: t.dm, id: ann.id, give: 1 });
  await t.post('send', { token: t.dm, title: 'For everyone', text: 'A note the whole table may read' });
  await t.post('send', { token: t.dm, to: ann.id, title: 'PRIVATE-TITLE', text: 'PRIVATE-NOTE-FOR-ANN' });
  await t.post('propose', { token: bo.token, kind: 'intent', text: 'PROPOSAL-TEXT-FROM-BO' });
  const rq = (await t.post('request', { token: t.dm, to: 'all', label: 'Sneak past the guard', why: 'WHY-LINE', skill: 'Stealth', target: 13, yes: 'YES-LINE-KEPT-FOR-LATER', no: 'NO-LINE-KEPT-FOR-LATER' })).json.n;
  await t.post('roll', { token: ann.token, label: 'Sneak', kind: 'check', total: 15, nat: 0, detail: '', dice: [], request: rq });
  await t.post('roll', { token: bo.token, label: 'Sneak', kind: 'check', total: 3, nat: 1, detail: '', dice: [{ sides: 20, value: 1 }], request: rq });
  const v = (await t.post('vote', { token: t.dm, q: 'Left or right?', options: ['Left', 'Right'] })).json.n;
  await t.post('ballot', { token: ann.token, n: v, pick: 1 });
  const dm = until(NP, fresh(), 'arrival/crumb');
  await t.post('scene', { token: t.dm, scene: R.scene(NP, dm) });
  await t.post('stage', { token: t.dm, patch: Object.assign(R.stage(NP, dm, {}), { spot: ann.id, beat: { kind: 'bell' } }, R.order({ rows: [{ key: 'p:' + ann.id, id: ann.id, name: 'Ann', total: 9, ord: 1 }, { key: 'f:2', id: '', name: 'A soot sprite', total: 0, ord: 2, foe: 'sprites', hits: 2, taken: 1 }], at: 'f:2' }, [{ id: ann.id, name: 'Ann', char: { name: 'Ginger' }, portrait: '' }])) });
  await t.post('session', { token: t.dm, save: R.pack(Object.assign(dm, { note: 'SESSION-BLOB-ON-THE-TABLE' })), at: 5 });
  const state = await t.as(t.key), raw = JSON.stringify(state);
  ['HOOK-ONLY', 'PRIVATE-TITLE', 'PRIVATE-NOTE', 'PROPOSAL-TEXT', 'YES-LINE', 'NO-LINE', 'WHY-LINE', 'SESSION-BLOB', '"target"', '"asks"', '"sessionAt"', '"save"'].forEach((s) => assert.ok(!raw.includes(s), 'a screen is never sent ' + s));
  assert.strictEqual(state.you, 'screen');
  const view = TV.view({ scene: state.scene, stage: state.stage, players: state.players, rolls: state.rolls, requests: state.requests, votes: state.votes, recent: rq }), text = JSON.stringify(view);
  ['HOOK-ONLY', 'PRIVATE', 'PROPOSAL', 'YES-LINE', 'NO-LINE', 'WHY-LINE', 'SECRET-LOOK', 'target', '13'].forEach((s) => assert.ok(!text.includes(s), 'the screen never draws ' + s));
  assert.deepStrictEqual(leaks(NP, view), [], 'and nothing the adventure keeps for the DM');
  assert.deepStrictEqual(Object.keys(view).sort(), ['chapter', 'img', 'lobby', 'map', 'order', 'party', 'request', 'reveal', 'rolls', 'spot', 'title', 'turn', 'vote']);
  /* what it does draw */
  assert.deepStrictEqual([view.lobby, view.title, view.chapter], [false, 'The name’s Crumb', 'Crash Landing']);
  assert.deepStrictEqual(view.party.map((p) => [p.name, p.hero, p.tokens, p.spot]), [['Ann', 'Ginger', 1, true], ['Bo', '', 0, false]]);
  assert.deepStrictEqual(Object.keys(view.party[0]).sort(), ['hero', 'id', 'kind', 'name', 'portrait', 'spot', 'tokens']);
  assert.strictEqual(view.spot.hero, 'Ginger');
  assert.deepStrictEqual(view.map.regions.filter((r) => r.open).map((r) => r.id), ['snowbank', 'square', 'bakery']);
  assert.deepStrictEqual([view.reveal.title, view.reveal.shown], ['Somebody in a very large trench coat', false]);
  assert.deepStrictEqual(view.order.map((e) => [e.name, e.sub, e.kind, e.state, e.now]), [['A soot sprite', '', 'foe', 'Nearly done', true], ['Ginger', 'Ann', 'hero', '', false]], 'the list starts at whoever is acting');
  assert.strictEqual(view.turn.name, 'A soot sprite');
  /* a long order: whoever is acting is at the top, then the rest in turn, round the end and back to the start */
  const long = { order: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id.toUpperCase(), kind: 'foe', state: id === 'd' ? 'Out' : 'Fine', img: '' })) };
  assert.deepStrictEqual(TV.view({ scene: { id: 's' }, stage: Object.assign({ now: 'c' }, long), players: [] }).order.map((e) => e.id), ['c', 'd', 'e', 'a', 'b']);
  assert.deepStrictEqual(TV.view({ scene: { id: 's' }, stage: Object.assign({ now: '' }, long), players: [] }).order.map((e) => e.id), ['a', 'b', 'c', 'd', 'e'], 'nobody acting: as the DM has it');
  /* a foe that is out of the fight is never announced as whose turn it is */
  assert.strictEqual(TV.view({ scene: { id: 's' }, stage: Object.assign({ now: 'd' }, long), players: [] }).turn, null);
  assert.strictEqual(TV.view({ scene: { id: 's' }, stage: Object.assign({ now: 'c' }, long), players: [] }).turn.id, 'c');
  assert.deepStrictEqual([view.request.who, view.request.label, view.request.waiting], ['Everyone', 'Sneak past the guard', false]);
  assert.deepStrictEqual(view.request.rows.map((r) => [r.name, r.rolled, r.total, r.nat, r.pass]), [['Ann', true, 15, 0, true], ['Bo', true, 3, 1, false]], 'each result as pass or fail, never the number to beat');
  assert.deepStrictEqual([view.vote.q, view.vote.open, view.vote.total, view.vote.rows.map((r) => [r.text, r.n, r.win])], ['Left or right?', true, 1, [['Left', 0, false], ['Right', 1, false]]]);
  assert.deepStrictEqual(view.rolls.map((r) => [r.name, r.total, r.nat]), [['Bo', 3, 1], ['Ann', 15, 0]], 'the newest roll first');
  /* the vote closed: what the table chose */
  await t.post('vote', { token: t.dm, n: v, close: true });
  const closed = TV.view(Object.assign({}, await t.as(t.key))).vote;
  assert.deepStrictEqual([closed.open, closed.result, closed.rows.map((r) => r.win)], [false, 'Right', [false, true]]);
  /* a roll still waited for shows who has not rolled; a request nobody is waiting on any more is not kept up for ever */
  const rq2 = (await t.post('request', { token: t.dm, to: [bo.id], label: 'Climb', target: 10 })).json.n;
  const waiting = TV.view(await t.as(t.key)).request;
  assert.deepStrictEqual([waiting.n, waiting.who, waiting.waiting, waiting.rows.map((r) => [r.name, r.rolled, r.pass])], [rq2, 'Bo', true, [['Bo', false, null]]]);
  await t.post('cancel', { token: t.dm, n: rq2 });
  assert.strictEqual(TV.view(await t.as(t.key)).request, null);
  /* before the story begins, and with nothing sent at all, the screen is the way in */
  assert.strictEqual(TV.view({}).lobby, true);
  assert.strictEqual(TV.view({ scene: { id: '/cover', title: 'A story', chapter: '', img: '' } }).lobby, true);
  assert.deepStrictEqual(TV.view({ votes: [{ n: 1, q: 'Q?', options: ['A', 'B'], open: false, counts: [2, 2] }] }).vote.result, 'It is a tie');
  assert.strictEqual(TV.view({ votes: [{ n: 1, q: 'Q?', options: ['A', 'B'], open: false, counts: [0, 0] }] }).vote.result, 'Nobody voted');
});

test('the address that makes a page a big screen, and the beats it knows', () => {
  assert.ok(TV.wanted('?tv=ABCD&k=0123456789abcdef0123456789abcdef0123456789abcdef&s=northpole'));
  ['', '?t=ABCD', '?tv=ABCD', '?tv=ABC&k=0123456789abcdef', '?tv=ABCD&k=xyz', '?k=0123456789abcdef'].forEach((s) => assert.ok(!TV.wanted(s), s + ' is an ordinary visit'));
  assert.deepStrictEqual(Object.keys(TV.BEATS).sort(), FR.BEATS.slice().sort(), 'one for each kind of beat the engine knows');
});

/* ---------- the runner and the big screen know no story ---------- */
test('src/tv.js and the new half of src/dm.js hold nothing of any one adventure or cartridge', () => {
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  [['src/tv.js', TV_JS], ['src/dm.js', DM_JS]].forEach(([file, src]) => {
    [NP_RAW, starterRaw()].forEach((st) => {
      const ids = [st.id].concat(st.flow.chapters.map((c) => c.id), (st.flow.interludes || []).map((c) => c.id), (st.flow.hubs || []).map((c) => c.id), Object.keys(st.flags || {}),
        (st.maps || []).map((m) => m.id), (st.foes || []).map((f) => f.id), st.bible.people.map((p) => p.id));
      ids.forEach((id) => assert.ok(!new RegExp("['\"]" + id + "['\"]").test(code(src)), file + ' names "' + id + '" of the adventure "' + st.id + '"'));
      const names = [st.title].concat(st.flow.chapters.map((c) => c.title), (st.flow.interludes || []).map((c) => c.title), st.bible.people.map((p) => p.name), (st.maps || []).map((m) => m.title),
        [].concat(...(st.maps || []).map((m) => m.regions.map((r) => r.name))), (st.foes || []).map((f) => f.name)).filter((n) => n && n.length >= 5);
      names.forEach((n) => assert.ok(src.indexOf(n) < 0, file + ' says "' + n + '", which belongs to the adventure "' + st.id + '"'));
    });
    P.list().forEach((p) => {
      assert.ok(!new RegExp("['\"]" + p.id + "['\"]").test(code(src)), file + ' names the pack "' + p.id + '"');
      const t = FR.THEMES[p.id], words = Object.keys(t.beds || {}).map((k) => t.beds[k].label).concat([t.kit.token.name, t.kit.token.plural], Object.keys(t.roles || {})).filter((w) => w && w.length >= 8 && !/^Hero tokens?$/.test(w));
      words.forEach((w) => assert.ok(src.indexOf(w) < 0, file + ' says "' + w + '", which is the cartridge ' + p.id + '\'s own word'));
    });
    assert.doesNotMatch(src, /adults? only|for adults|grown-ups only/i);
  });
});
