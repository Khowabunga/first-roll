/* The player's side of the shared table (docs/PHASE2.md, section 4) has parts with no screen in them,
   in FR.play at the top of src/app.js: which stakes and bonds a hero is offered, what the party still
   lacks, when a beat is played and how it buzzes, a closed vote as bars, the marks on a thing in the
   story, the notes kept on the phone, and armor in plain words. These tests run those parts alone,
   against the real cartridges, with no browser. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const P = require('../../scripts/lib/packs.js');

function engine() {
  const FR = P.engine();
  P.list().forEach((p) => { const l = P.load(p.file); assert.strictEqual(l.error, '', p.id + ' ' + l.error); FR.cartridge(l.def); });
  new Function('FR', fs.readFileSync(path.join(P.ROOT, 'src', 'app.js'), 'utf8'))(FR);
  return FR;
}
const FR = engine(), play = FR.play;
const IDS = P.list().map((p) => p.id);
const seat = (id, name, hero, cls, more) => Object.assign({ id: id, name: name, char: hero ? { name: hero, race: 'Human', cls: cls || '' } : null, portrait: '' }, more || {});

/* ---------- ties: a stake in the story ---------- */
test('a hero is offered the stakes written for their role first, then ones for anyone, three at most, and never another role\'s', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id), hooks = T.ties.hooks;
    assert.ok(hooks.length > 0, id + ' has stakes to offer');
    Object.keys(T.roles).forEach((role) => {
      for (let turn = 0; turn < 7; turn++) {
        const got = play.hookChoices(hooks, role, turn);
        assert.ok(got.length >= 1 && got.length <= 3, id + ' ' + role + ': one to three');
        assert.strictEqual(new Set(got.map((h) => h.id)).size, got.length, 'none twice');
        got.forEach((h) => assert.ok(!h.roles.length || h.roles.indexOf(role) >= 0, id + ': "' + h.id + '" is not for ' + role));
        const own = hooks.filter((h) => h.roles.indexOf(role) >= 0).slice(0, 3);
        assert.deepStrictEqual(got.slice(0, own.length).map((h) => h.id), own.map((h) => h.id), id + ' ' + role + ': the role\'s own come first');
      }
    });
  });
});

test('the stakes for anyone start at a different place for each hero, and a hero with no role is still offered some', () => {
  const hooks = [{ id: 'a', text: 'A', roles: [] }, { id: 'b', text: 'B', roles: [] }, { id: 'c', text: 'C', roles: [] }, { id: 'd', text: 'D', roles: [] }, { id: 'x', text: 'X', roles: ['Scout'] }];
  assert.deepStrictEqual(play.hookChoices(hooks, 'Scout', 0).map((h) => h.id), ['x', 'a', 'b']);
  assert.deepStrictEqual(play.hookChoices(hooks, 'Scout', 3).map((h) => h.id), ['x', 'd', 'a']);
  assert.deepStrictEqual(play.hookChoices(hooks, '', 1).map((h) => h.id), ['b', 'c', 'd'], 'no role: only the ones for anyone');
  assert.deepStrictEqual(play.hookChoices(hooks, 'Healer', 5, 2).map((h) => h.id), ['b', 'c'], 'a smaller limit is kept');
  assert.deepStrictEqual(play.hookChoices([], 'Scout', 0), []);
  assert.deepStrictEqual(play.hookChoices(null, 'Scout', 0), []);
  assert.deepStrictEqual(play.hookChoices([{ id: '', text: 'no id' }, { id: 'ok', text: '' }, null], '', 0), [], 'anything that is not a stake is left out');
});

/* ---------- ties: a bond with another hero ---------- */
test('a bond can be made with every other seat that has a hero, and with nobody else', () => {
  const players = [seat('a', 'Ana', 'Rurik Fireforge', 'Cleric'), seat('b', 'Bea', 'Brannoc Stonehand', 'Fighter'), seat('c', 'Cal', ''), seat('d', 'Dee', 'Mira Quickfingers', 'Rogue', { portrait: 'p.webp' })];
  assert.deepStrictEqual(play.bondChoices(players, 'a'), [
    { id: 'b', name: 'Brannoc Stonehand', player: 'Bea', cls: 'Fighter', portrait: '' },
    { id: 'd', name: 'Mira Quickfingers', player: 'Dee', cls: 'Rogue', portrait: 'p.webp' }]);
  assert.deepStrictEqual(play.bondChoices(players, 'b').map((o) => o.id), ['a', 'd'], 'never this seat itself');
  assert.deepStrictEqual(play.bondChoices([seat('a', 'Ana', 'Rurik', 'Cleric')], 'a'), [], 'alone at the table: nobody to bond with yet');
  assert.deepStrictEqual(play.bondChoices(null, 'a'), []);
});

test('every question about another hero carries that hero\'s name, in both cartridges', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id), asked = play.bondPrompts(T.ties.bonds, 'Brannoc');
    assert.strictEqual(asked.length, T.ties.bonds.length, id);
    asked.forEach((q) => { assert.ok(q.indexOf('Brannoc') >= 0, id + ': ' + q); assert.ok(q.indexOf('{name}') < 0, id + ': no blank is left'); assert.ok(q.length <= 160, id + ': fits a bond\'s prompt'); });
  });
  assert.deepStrictEqual(play.bondPrompts(['Why {name}? Really, {name}?', '', null], 'Mira'), ['Why Mira? Really, Mira?']);
});

/* ---------- roles: what the party still lacks ---------- */
test('the party is told which roles nobody plays yet, in the cartridge\'s order and its own words', () => {
  const roles = { Protector: {}, Trickster: {}, Healer: {}, Scout: {} }, classes = { Fighter: { role: 'Protector' }, Rogue: { role: 'Trickster' }, Cleric: { role: 'Healer' }, Ranger: { role: 'Scout' }, Oddity: {} };
  const w = { one: 'Nobody is the {role} yet.', and: ', the ', or: ' or the ' };
  const at = (list) => list.map((c, i) => seat('s' + i, 'P' + i, c ? 'Hero ' + i : '', c));
  assert.deepStrictEqual(play.rolesMissing(roles, classes, at(['Fighter', 'Cleric'])), ['Trickster', 'Scout']);
  assert.strictEqual(play.partyLine(roles, classes, at(['Fighter', 'Rogue', 'Cleric']), w), 'Nobody is the Scout yet.');
  assert.strictEqual(play.partyLine(roles, classes, at(['Fighter', 'Cleric']), w), 'Nobody is the Trickster or the Scout yet.');
  assert.strictEqual(play.partyLine(roles, classes, at(['Fighter']), w), 'Nobody is the Trickster, the Healer or the Scout yet.');
  assert.strictEqual(play.partyLine(roles, classes, at(['Fighter', 'Rogue', 'Cleric', 'Ranger']), w), '', 'every role is filled: nothing to say');
  assert.strictEqual(play.partyLine(roles, classes, at(['', '']), w), '', 'nobody has a hero yet: everything is missing, and that is no news');
  assert.strictEqual(play.partyLine(roles, classes, at(['Oddity']), w), '', 'a class with no role fills none');
  assert.strictEqual(play.partyLine({}, classes, at(['Fighter']), w), '', 'a cartridge with no roles says nothing');
  assert.strictEqual(play.partyLine(roles, classes, at(['Fighter', 'Fighter', 'Fighter']), w), 'Nobody is the Trickster, the Healer or the Scout yet.', 'three of a kind fill one role');
});

test('with the real cartridges: every class has a role the lobby can name, and a full party lacks nothing', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id), w = { one: T.text.partyMissing, and: T.text.partyAnd, or: T.text.partyOr }, names = Object.keys(T.roles);
    assert.ok(w.one.indexOf('{role}') >= 0, id + ': the line names the role');
    const one = Object.keys(T.classes).filter((c) => T.classes[c].role === names[0])[0];
    const line = play.partyLine(T.roles, T.classes, [seat('a', 'Ana', 'Hero', one)], w);
    names.slice(1).forEach((r) => assert.ok(line.indexOf(r) >= 0, id + ': "' + line + '" names ' + r));
    assert.ok(line.indexOf(names[0]) < 0, id + ': the role that is played is not called missing');
    const full = names.map((r, i) => seat('s' + i, 'P' + i, 'Hero ' + i, Object.keys(T.classes).filter((c) => T.classes[c].role === r)[0]));
    assert.strictEqual(play.partyLine(T.roles, T.classes, full, w), '', id + ': one hero of each role');
  });
});

/* ---------- table moments: a beat ---------- */
test('a beat is played once, and only while it is fresh by the server\'s own clock', () => {
  const now = 1000000, beat = { n: 7, kind: 'thunder', at: now - 1200 };
  assert.strictEqual(play.beatFresh(beat, 6, now), true, 'new to this device, fired a second ago');
  assert.strictEqual(play.beatFresh(beat, 0, now), true, 'the first beat this device has heard of');
  assert.strictEqual(play.beatFresh(beat, 7, now), false, 'already played here');
  assert.strictEqual(play.beatFresh(beat, 9, now), false, 'older than one already played');
  assert.strictEqual(play.beatFresh({ n: 7, kind: 'thunder', at: now - 5000 }, 6, now), false, 'five seconds old: a phone that sat down late does not play it');
  assert.strictEqual(play.beatFresh({ n: 7, kind: 'thunder', at: now - 4999 }, 6, now), true);
  assert.strictEqual(play.beatFresh({ n: 7, kind: 'thunder', at: now - 600000 }, 6, now), false, 'ten minutes old');
  assert.strictEqual(play.beatFresh({ n: 7, kind: 'thunder', at: now + 300 }, 6, now), true, 'this device\'s clock a little behind the table\'s');
  assert.strictEqual(play.beatFresh({ n: 7, kind: 'thunder', at: now - 8000 }, 6, now, 10000), true, 'a longer allowance when one is given');
  assert.strictEqual(play.beatFresh(null, 0, now), false);
  assert.strictEqual(play.beatFresh({ n: 7, kind: '', at: now }, 0, now), false, 'a beat with no kind is no beat');
  assert.strictEqual(play.beatFresh({ kind: 'hit', at: now }, 0, now), false, 'nor is one the table has not numbered');
});

test('every kind of beat the engine knows has a buzz of its own, and an unknown kind still buzzes', () => {
  const seen = {};
  FR.BEATS.forEach((kind) => {
    const p = play.beatBuzz(kind);
    assert.ok(Array.isArray(p) && p.length >= 1 && p.length % 2 === 1, kind + ': on, off, on...');
    p.forEach((ms) => assert.ok(Number.isInteger(ms) && ms > 0 && ms <= 500, kind + ': ' + ms + ' ms'));
    assert.ok(p.reduce((a, b) => a + b, 0) <= 1000, kind + ': over within a second');
    assert.ok(!seen[p.join()], kind + ' does not feel like another kind'); seen[p.join()] = true;
  });
  assert.deepStrictEqual(play.beatBuzz('nobody-knows-this'), [90]);
  assert.deepStrictEqual(play.beatBuzz('constructor'), [90], 'a name every object has is not a kind');
  const p = play.beatBuzz('hit'); p.push(1); assert.deepStrictEqual(play.beatBuzz('hit'), [110], 'the pattern handed out is a copy');
});

/* ---------- the party vote ---------- */
test('a closed vote becomes bars: the count of each choice, its share, and the most-picked the longest', () => {
  const bars = play.voteBars({ n: 1, q: 'Which way?', options: ['Gate', 'Wall', 'Well'], open: false, counts: [0, 1, 2], mine: 1 });
  assert.deepStrictEqual(bars.map((b) => [b.label, b.count, b.width, b.mine, b.top]), [['Gate', 0, 0, false, false], ['Wall', 1, 50, true, false], ['Well', 2, 100, false, true]]);
  assert.deepStrictEqual(bars.map((b) => Math.round(b.share * 100)), [0, 33, 67]);
  const tie = play.voteBars({ options: ['Stay', 'Run'], counts: [2, 2], mine: null });
  assert.deepStrictEqual(tie.map((b) => [b.width, b.top, b.mine, b.share]), [[100, true, false, 0.5], [100, true, false, 0.5]], 'a tie has two winners, and a seat that did not vote has no pick');
  const none = play.voteBars({ options: ['Stay', 'Run'], counts: [0, 0], mine: null });
  assert.deepStrictEqual(none.map((b) => [b.count, b.width, b.share, b.top]), [[0, 0, 0, false], [0, 0, 0, false]], 'nobody voted: no bar, no winner');
  const odd = play.voteBars({ options: ['A', 'B', 'C', 'D'], counts: [3, -2, 'x'], mine: 0 });
  assert.deepStrictEqual(odd.map((b) => b.count), [3, 0, 0, 0], 'a count that is missing or makes no sense is none');
  assert.deepStrictEqual(play.voteBars({ options: ['A', 'B'], open: true, mine: 1 }).map((b) => [b.count, b.mine]), [[0, false], [0, true]], 'an open vote has no counts yet');
  assert.deepStrictEqual(play.voteBars(null), []);
});

/* ---------- marks on things in the story ---------- */
test('the marks on one thing are added up over every number it was published under, and a tap goes where this seat\'s mark already is', () => {
  const reacts = { 'scene:2': { heart: 1 }, 'scene:3': { heart: 1, wow: 2 }, 'feed:9': { clap: 4 }, 'scene:4': { junk: 5, laugh: 0 } };
  assert.deepStrictEqual(play.MARKS, ['cheer', 'laugh', 'gasp', 'heart', 'clap', 'wow']);
  assert.deepStrictEqual(play.marks(['scene:2', 'scene:3', 'scene:4'], reacts, {}), { counts: { heart: 2, wow: 2 }, mine: '', on: 'scene:4' });
  assert.deepStrictEqual(play.marks(['scene:2', 'scene:3', 'scene:4'], reacts, { 'scene:2': 'heart' }), { counts: { heart: 2, wow: 2 }, mine: 'heart', on: 'scene:2' }, 'the same mark again must reach the one already left');
  assert.deepStrictEqual(play.marks(['feed:9'], reacts, { 'scene:2': 'heart' }), { counts: { clap: 4 }, mine: '', on: 'feed:9' });
  assert.deepStrictEqual(play.marks(['feed:1'], {}, {}), { counts: {}, mine: '', on: 'feed:1' });
  assert.deepStrictEqual(play.marks([], reacts, {}), { counts: {}, mine: '', on: '' });
  assert.deepStrictEqual(play.marks(['feed:1'], null, null), { counts: {}, mine: '', on: 'feed:1' });
});

test('a natural 20 and a natural 1 from the table\'s roll feed join the story, in order; other rolls do not', () => {
  const feed = [{ n: 1, kind: 'note', title: 'A letter', at: 100 }], rolls = [{ n: 1, name: 'Bea', label: 'Climb', nat: 20, total: 24, at: 150 }, { n: 2, name: 'Cal', label: 'Look', nat: 0, total: 12, at: 160 },
    { n: 3, name: 'Cal', label: 'Pick the lock', nat: 1, total: 3, at: 90 }, { n: 4, name: 'Ana', label: '', kind: 'token', nat: 0, total: 0, at: 170 }];
  const got = play.timeline(feed, [], [], rolls);
  assert.deepStrictEqual(got.map((e) => [e.kind, e.key]), [['nat', 'n3'], ['note', 'f1'], ['nat', 'n1']]);
  assert.strictEqual(got[2].roll.name, 'Bea');
  assert.deepStrictEqual(play.timeline(feed, [], []).map((e) => e.key), ['f1'], 'with no roll feed handed over it is as it was');
});

/* ---------- notes kept on the phone ---------- */
test('notes: written and pinned ones are kept newest first, nothing is pinned twice, and each is deleted by itself', () => {
  const N = play.notes;
  let list = N.add([], '  The ferryman knows more than he says  ', 1000);
  assert.deepStrictEqual(list, [{ id: 1, at: 1000, text: 'The ferryman knows more than he says', title: '', img: '', from: '' }]);
  assert.deepStrictEqual(N.add(list, '   ', 1001), list, 'nothing but spaces is no note');
  assert.notStrictEqual(N.add(list, '', 1001), list, 'and the list handed in is never the one handed back');
  list = N.pin(list, { from: 'feed:4', title: 'A torn letter', text: 'Meet me where the river bends.', img: '' }, 2000);
  assert.deepStrictEqual(list.map((n) => [n.id, n.from, n.title]), [[2, 'feed:4', 'A torn letter'], [1, '', '']]);
  assert.strictEqual(N.pinned(list, 'feed:4'), true); assert.strictEqual(N.pinned(list, 'feed:5'), false); assert.strictEqual(N.pinned(list, ''), false);
  assert.deepStrictEqual(N.pin(list, { from: 'feed:4', title: 'again' }, 3000), list, 'the same thing is not pinned twice');
  assert.deepStrictEqual(N.pin(list, { from: '', title: 'no source' }, 3000), list, 'a pin has to say what it was pinned from');
  assert.deepStrictEqual(N.pin(list, { from: 'feed:6' }, 3000), list, 'and has to have something in it');
  list = N.pin(list, { from: 'scene:ch1/gate', title: 'The broken gate', text: '', img: 'img/keyart.webp' }, 3000);
  list = N.add(list, 'x'.repeat(900), 4000);
  assert.strictEqual(list[0].text.length, N.LONG, 'a long note is cut to length');
  assert.deepStrictEqual(list.map((n) => n.id), [4, 3, 2, 1]);
  const less = N.drop(list, 3);
  assert.deepStrictEqual(less.map((n) => n.id), [4, 2, 1]); assert.strictEqual(list.length, 4, 'the list handed in is left alone');
  assert.strictEqual(N.next(less), 5, 'a number is never used twice while a higher one is in the list');
  assert.deepStrictEqual(N.own(list).map((n) => n.id), [4, 1], 'a fresh start keeps what the player wrote and lets go of what was copied from the old story');
});

test('notes: what is stored is read back for its own table only, and anything that is not a note is left out', () => {
  const N = play.notes;
  const list = N.pin(N.add([], 'One', 1), { from: 'roll:7', title: 'Bea rolled a natural 20', text: 'Climb the wall' }, 2), json = N.write(list, 'GRYJ');
  assert.deepStrictEqual(N.read(json, 'GRYJ'), list);
  assert.deepStrictEqual(N.read(json, 'ABCD'), [], 'another table\'s notes are not this table\'s');
  assert.deepStrictEqual(N.read('', 'GRYJ'), []); assert.deepStrictEqual(N.read(null, 'GRYJ'), []); assert.deepStrictEqual(N.read('{not json', 'GRYJ'), []);
  assert.deepStrictEqual(N.read(JSON.stringify({ code: 'GRYJ', list: 'nope' }), 'GRYJ'), []);
  assert.deepStrictEqual(N.read(JSON.stringify({ code: 'GRYJ', list: [null, 7, { id: 'x', text: 'no number' }, { id: 3 }, { id: 4, text: 'kept', at: 'soon' }] }), 'GRYJ'), [{ id: 4, at: 0, text: 'kept', title: '', img: '', from: '' }]);
  let many = [];
  for (let i = 0; i < N.MAX + 20; i++) { many = N.add(many, 'note ' + i, i); }
  assert.strictEqual(many.length, N.MAX, 'the oldest fall off the end');
  assert.strictEqual(many[0].text, 'note ' + (N.MAX + 19));
  assert.strictEqual(N.read(N.write(many, 'GRYJ'), 'GRYJ').length, N.MAX);
});

/* ---------- armor in plain words ---------- */
test('armor is one of three plain bands, by the number an attack has to reach', () => {
  [[8, 'light'], [10, 'light'], [12, 'light'], [13, 'well'], [15, 'well'], [16, 'heavy'], [18, 'heavy'], [21, 'heavy']].forEach((c) => assert.strictEqual(play.armor(c[0]), c[1], 'armor ' + c[0]));
  assert.strictEqual(play.armor(undefined), 'light', 'no number: nothing is claimed');
  assert.strictEqual(play.armor(NaN), 'light');
});

test('every hero of every cartridge has armor words to show, and the cartridges\' casts cover more than one band', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id), words = { light: T.text.armorLight, well: T.text.armorWell, heavy: T.text.armorHeavy }, bands = {};
    Object.keys(words).forEach((k) => assert.ok(typeof words[k] === 'string' && words[k], id + ': words for ' + k));
    const u = FR.tally(T.demo.answers);
    Object.keys(T.classes).forEach((c) => Object.keys(T.races).forEach((r) => {
      const band = play.armor(FR.build(u, c, r, 12).ac);
      assert.ok(words[band], id + ' ' + c + ' ' + r); bands[band] = true;
    }));
    assert.ok(Object.keys(bands).length >= 2, id + ': not every hero is protected alike (' + Object.keys(bands).join(', ') + ')');
  });
});

/* ---------- the words the new parts use ---------- */
test('the kit and the token have the words the screens fill in, in both cartridges', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id);
    assert.ok(T.text.kitSay.indexOf('{item}') >= 0 && T.text.kitTell.indexOf('{item}') >= 0, id + ': what the DM is told names the thing');
    assert.ok(T.text.tokenSpend.indexOf('{token}') >= 0 && T.text.tokenSpent.indexOf('{token}') >= 0, id + ': the token is called by the cartridge\'s word');
    assert.ok(T.text.bondWith.indexOf('{name}') >= 0 && T.text.bondFrom.indexOf('{name}') >= 0 && T.text.bondFrom.indexOf('{hero}') >= 0, id + ': a bond names both heroes');
    assert.ok(T.kit.token.name && T.kit.token.plural, id + ': a token has a name');
    Object.keys(T.classes).forEach((c) => {
      T.classes[c].kit.forEach((k) => {
        const it = T.kit.items[k];
        assert.ok(it && it.name && it.text, id + ' ' + c + ': ' + k + ' is a thing with a name and a line');
        assert.ok(play.fill(T.text.kitSay, { item: it.name }).length <= 200, id + ': "' + it.name + '" fits what a player may tell the DM');
      });
    });
  });
});
