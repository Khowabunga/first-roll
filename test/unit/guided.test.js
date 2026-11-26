/* The guided loop on a player's phone has parts with no screen in them, all in FR.play at the top
   of src/app.js: keeping what the DM has sent in step (and dropping what was taken back), laying
   the story out in order, setting the dice up for a roll the DM asks for, checking a roll typed in
   from real dice, health as three plain states, and what the browser's Back button does. These
   tests run those parts alone, against the real cartridges, with no browser. */
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
const item = (n, more) => Object.assign({ n, at: 1000 + n, kind: 'note', title: 'Note ' + n, text: '', img: '', to: '', hero: '' }, more);

/* ---------- the feed, kept in step ---------- */
test('feed: new items are added in order, and nothing is ever held twice', () => {
  const held = [item(1), item(2)];
  const m = play.feed(held, [item(4), item(2), item(3)], []);
  assert.deepStrictEqual(m.feed.map((f) => f.n), [1, 2, 3, 4]);
  assert.deepStrictEqual(m.fresh.map((f) => f.n), [3, 4], 'only what this device did not have is news');
  assert.strictEqual(m.dropped, 0);
  assert.deepStrictEqual(held.map((f) => f.n), [1, 2], 'the list handed in is left alone');
  const again = play.feed(m.feed, [item(3), item(4)], []);
  assert.deepStrictEqual(again.feed.map((f) => f.n), [1, 2, 3, 4]);
  assert.deepStrictEqual(again.fresh, [], 'the same answer twice changes nothing');
});

test('feed: what the DM took back is dropped, whether it was held or only just arriving', () => {
  const m = play.feed([item(1), item(2), item(3)], [item(4), item(5)], [2, 5, 99]);
  assert.deepStrictEqual(m.feed.map((f) => f.n), [1, 3, 4]);
  assert.deepStrictEqual(m.fresh.map((f) => f.n), [4], 'an item unsent before it was ever shown is not news');
  assert.strictEqual(m.dropped, 1, 'one held item went');
  /* the newest item is taken back: nothing older comes back in its place */
  const last = play.feed([item(1), item(2)], [], [2]);
  assert.deepStrictEqual(last.feed.map((f) => f.n), [1]);
  assert.strictEqual(last.dropped, 1);
  assert.deepStrictEqual(play.feed(last.feed, [item(2)], [2]).feed.map((f) => f.n), [1], 'even if the table sends it once more');
});

test('feed: a server that sends none of the new fields (yesterday\'s) still works', () => {
  const m = play.feed([], [item(1)], undefined);
  assert.deepStrictEqual(m.feed.map((f) => f.n), [1]);
  assert.deepStrictEqual(play.feed(undefined, undefined, undefined), { feed: [], fresh: [], dropped: 0 });
  assert.deepStrictEqual(play.feed([item(1)], [null, {}, item(2)], null).feed.map((f) => f.n), [1, 2], 'junk in the answer is skipped');
});

/* ---------- the story as one list ---------- */
test('timeline: scenes, what the DM sent and this seat\'s own rolls, in the order they happened', () => {
  const feed = [item(1, { at: 100 }), item(2, { at: 300, to: 'me' }), item(3, { at: 500, img: 'img/keyart.webp' }), item(4, { at: 700, kind: 'hero', hero: 'Wren Tealeaf' })];
  const requests = [{ n: 1, label: 'Listen', at: 200, mine: { total: 12, nat: 0, pass: true, say: 'You hear claws.' } }, { n: 2, label: 'Not rolled yet', at: 250 }];
  const scenes = [{ n: 1, id: 'door', title: 'The cellar door', at: 50 }, { n: 3, id: 'below', title: 'Under the taproom', at: 400 }];
  const t = play.timeline(feed, requests, scenes);
  assert.deepStrictEqual(t.map((e) => e.key), ['s1', 'f1', 'r1', 'f2', 's3', 'f3', 'f4']);
  assert.deepStrictEqual(t.map((e) => e.kind), ['scene', 'note', 'roll', 'note', 'scene', 'image', 'hero']);
  assert.strictEqual(t.filter((e) => e.key === 'r2').length, 0, 'a roll the DM asked for is only part of the story once it has been made');
  assert.strictEqual(t[3].item.to, 'me', 'a note for this seat alone keeps its mark');
  assert.deepStrictEqual(play.timeline([], [], []), []);
  assert.deepStrictEqual(play.timeline(undefined, undefined, undefined), [], 'a table with nothing to show');
  /* things stamped with the same moment keep the order they were given in */
  assert.deepStrictEqual(play.timeline([item(1, { at: 5 }), item(2, { at: 5 })], [], [{ n: 1, at: 5 }]).map((e) => e.key), ['s1', 'f1', 'f2']);
  /* an offer with no hero named is an ordinary note */
  assert.strictEqual(play.timeline([item(9, { kind: 'hero', hero: '' })], [], [])[0].kind, 'note');
});

/* ---------- a roll the DM asks for ---------- */
test('asked: the roll the DM is waiting for is the oldest open one this seat has not made', () => {
  const made = { n: 1, label: 'a', mine: { total: 9, nat: 0, pass: null, say: '' } }, off = { n: 2, label: 'b', closed: true }, open = { n: 3, label: 'c', closed: false }, later = { n: 4, label: 'd' };
  assert.strictEqual(play.asked([made, off, open, later]), open);
  assert.strictEqual(play.asked([made, off]), null, 'a request that was called off disappears');
  assert.strictEqual(play.asked([]), null);
  assert.strictEqual(play.asked(undefined), null);
});

test('a roll request sets up the dice: the skill decides the bonus exactly as the standing actions do', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id), u = FR.tally(T.demo.answers), why = (k) => 'because of ' + k;
    Object.keys(T.classes).slice(0, 4).forEach((cls) => {
      const sheet = FR.build(u, cls, T.samples[cls], 12);
      /* every standing action's skill: the same d20, the same bonus */
      T.actions.forEach((a) => {
        const c = play.requestRoll({ n: 7, label: 'Do the thing', why: 'It matters.', skill: a.skill }, sheet, why);
        assert.strictEqual(c.mod, sheet.skills[a.skill].mod, id + ' ' + cls + ' ' + a.skill);
        assert.deepStrictEqual([c.sides, c.count, c.kind, c.request], [20, 1, 'check', 7]);
        assert.strictEqual(c.why, 'because of ' + a.skill, 'the reason for the bonus is the skill\'s own');
        assert.strictEqual(c.title, 'Do the thing'); assert.strictEqual(c.label, 'Do the thing');
        assert.strictEqual(c.plain, 'It matters.', 'the DM\'s reason is the line under the title');
        assert.ok(c.note.indexOf(a.skill + ' · d20 ') === 0, 'with rules details on, the skill and the die: ' + c.note);
        /* and it is told in the same plain words as any other roll */
        assert.deepStrictEqual(play.spec(c, 'normal'), [20]);
        assert.deepStrictEqual(play.spec(c, 'adv'), [20, 20], 'the DM may still ask for two dice and the best of them');
        assert.strictEqual(play.result(c, 'normal', [10]).total, 10 + c.mod);
        assert.strictEqual(play.result(c, 'normal', [20]).nat, 20, 'a natural 20 is still a natural 20');
      });
      /* an ability (STR, DEX...) works as well as a skill */
      FR.ABILITIES.forEach((ab) => assert.strictEqual(play.requestRoll({ n: 1, label: 'x', skill: ab }, sheet, why).mod, sheet.mods[ab], id + ' ' + cls + ' ' + ab));
      /* no skill, or one this sheet does not know: a plain twenty-sided roll */
      [undefined, '', 'Juggling', 'toString', 'constructor'].forEach((sk) => {
        const c = play.requestRoll({ n: 2, label: 'Hold your nerve', skill: sk }, sheet, why);
        assert.deepStrictEqual([c.sides, c.count, c.mod, c.why, c.skill, c.kind], [20, 1, 0, '', '', 'check'], id + ': skill ' + sk);
        assert.strictEqual(c.note, 'd20');
        assert.strictEqual(play.bonus(c.mod, c.why, { plus: 'plus {n}', plusFor: 'plus {n} for {why}', minus: 'minus {n}' }), '', 'and nothing is said about a bonus');
      });
    });
  });
});

test('a roll for a request is posted like any other, tied to the request', () => {
  const T = FR.useTheme(IDS[0]), sheet = FR.build(FR.tally(T.demo.answers), Object.keys(T.classes)[0], T.samples[Object.keys(T.classes)[0]], 12);
  const w = { rolled: T.text.saidRolled, keep: T.text.saidKeep, higher: T.text.higher, lower: T.text.lower, and: T.text.and, plus: T.text.plus, plusFor: T.text.plusFor, minus: T.text.minus, bestOf: T.text.bestOf, worstOf: T.text.worstOf };
  const c = play.requestRoll({ n: 3, label: 'Listen at the door', skill: 'Perception' }, sheet, () => 'sharp eyes');
  const e = play.entry(c, 'normal', [14], w);
  assert.deepStrictEqual([e.label, e.kind, e.total, e.nat], ['Listen at the door', 'check', 14 + c.mod, 0]);
  assert.deepStrictEqual(e.dice, [{ sides: 20, value: 14 }]);
  assert.strictEqual(play.entry(c, 'normal', [1], w).nat, 1, 'a natural 1 is told to the table');
});

/* ---------- "I rolled real dice" ---------- */
test('typed roll: only a whole number the die can show is taken', () => {
  [[' 7 ', 20, 7], ['20', 20, 20], ['1', 4, 1], ['6', 6, 6], [12, 12, 12], ['08', 10, 8]].forEach(([text, sides, want]) => assert.strictEqual(play.typed(text, sides), want, text + ' on a d' + sides));
  [['0', 20], ['21', 20], ['7', 6], ['', 20], ['  ', 20], ['-3', 20], ['3.5', 20], ['1e1', 20], ['twelve', 20], ['12a', 20], ['99999', 20], [null, 20], [undefined, 20], ['+4', 20]]
    .forEach(([text, sides]) => assert.strictEqual(play.typed(text, sides), null, JSON.stringify(text) + ' on a d' + sides));
});

test('typed roll: every die of the roll must be right, and then it counts exactly like a rolled one', () => {
  assert.deepStrictEqual(play.typedAll(['3', '6', '1'], [6, 6, 6]), [3, 6, 1]);
  assert.strictEqual(play.typedAll(['3', '7', '1'], [6, 6, 6]), null, 'one wrong die spoils the roll');
  assert.strictEqual(play.typedAll(['3'], [6, 6]), null, 'a die left empty');
  assert.strictEqual(play.typedAll([], []), null, 'nothing to roll');
  const c = { title: 'Sneak', label: 'Sneak', sides: 20, count: 1, mod: 4, kind: 'check', why: 'being sneaky' };
  /* two dice and keep the best, typed in */
  const adv = play.typedAll(['9', '20'], play.spec(c, 'adv'));
  assert.deepStrictEqual(adv, [9, 20]);
  assert.deepStrictEqual(play.result(c, 'adv', adv), { kept: 20, total: 24, two: true, nat: 20, keptIx: 1 }, 'a typed natural 20 is a natural 20');
  assert.strictEqual(play.result(c, 'normal', play.typedAll(['1'], play.spec(c, 'normal'))).nat, 1, 'and a typed 1 is a natural 1');
  assert.strictEqual(play.result({ sides: 20, count: 1, mod: 0, kind: 'free' }, 'normal', [20]).nat, 0, 'other dice have no natural 20, typed or rolled');
});

/* ---------- health as three plain states ---------- */
test('health: fine, hurt or in trouble, and marking a state puts the number where it says so', () => {
  for (let max = 4; max <= 40; max++) {
    assert.strictEqual(play.health(max, max), 'fine');
    assert.strictEqual(play.health(0, max), 'trouble');
    ['fine', 'hurt', 'trouble'].forEach((state) => {
      const at = play.healthAt(state, max);
      assert.ok(Number.isInteger(at) && at >= 0 && at <= max, state + ' of ' + max + ' is ' + at);
      assert.strictEqual(play.health(at, max), state, 'marking "' + state + '" with ' + max + ' reads back as ' + state);
    });
    /* it only ever gets worse as the number falls */
    const order = { fine: 0, hurt: 1, trouble: 2 };
    for (let n = max; n > 0; n--) { assert.ok(order[play.health(n - 1, max)] >= order[play.health(n, max)], max + ': ' + n); }
  }
  assert.strictEqual(play.health(null, 12), 'fine', 'nothing lost yet');
  assert.strictEqual(play.health(undefined, 12), 'fine');
  IDS.forEach((id) => { const t = FR.useTheme(id).text; ['healthFine', 'healthHurt', 'healthTrouble'].forEach((k) => assert.ok(typeof t[k] === 'string' && t[k], id + ' says ' + k)); });
});

/* ---------- the browser's Back button ---------- */
test('back: a dialog closes first, then the screen steps back, and only the title lets go', () => {
  const step = (screen, dialogs, sheets) => play.backStep({ screen, dialogs: dialogs || [], sheets: sheets || [] });
  assert.deepStrictEqual(step('dice'), { click: 'd-close' }, 'the dice tray closes');
  assert.deepStrictEqual(step('play'), { go: 'title' }, 'play goes to the title');
  assert.deepStrictEqual(step('tale'), { click: 'tl-back' });
  assert.deepStrictEqual(step('sheet'), { click: 'sh-back' }, 'the sheet goes back to wherever it was opened from');
  assert.deepStrictEqual(step('quiz'), { click: 'q-back' }, 'a question back, like the arrow on the screen');
  assert.deepStrictEqual(step('dm'), { click: 'dm-exit' });
  assert.strictEqual(step('title'), null, 'from the title with nothing open, Back leaves');
  /* whatever is open on top goes first */
  assert.deepStrictEqual(step('dice', [{ id: 'typed', close: 'ty-x' }]), { click: 'ty-x' });
  assert.deepStrictEqual(step('play', [{ id: 'menu', close: 'mn-x' }, { id: 'ask', close: 'ask-no' }]), { click: 'ask-no' }, 'the top dialog, by its gentle way out');
  assert.deepStrictEqual(step('title', [{ id: 'switch', close: 'sw-x' }]), { click: 'sw-x' });
  assert.deepStrictEqual(step('title', [{ id: 'back', close: '' }]), { stay: 'back' }, 'a dialog that wants an answer is left open');
  assert.deepStrictEqual(step('dm', [], ['dm-sheet-x']), { click: 'dm-sheet-x' }, 'the DM\'s own sheets close before the DM screens do');
  assert.deepStrictEqual(step('dm', [{ id: 'audio', close: 'au-x' }], ['dm-sheet-x']), { click: 'au-x' });
  /* every screen there is has a way back, but for the big screen (src/tv.js): a page of its own with no controls, which a stray
     press of Back on a remote must not take anywhere */
  assert.strictEqual(step('tv'), null, 'Back does nothing on the big screen');
  const page = fs.readFileSync(path.join(P.ROOT, 'src', 'index.html'), 'utf8');
  (page.match(/<section class="screen[^"]*" id="s-([a-z]+)"/g) || []).map((s) => /id="s-([a-z]+)"/.exec(s)[1]).filter((s) => s !== 'title' && s !== 'tv').forEach((s) => {
    const st = step(s);
    assert.ok(st && (st.go || st.click), 'Back knows what to do on the "' + s + '" screen');
    if (st.click) { assert.ok(page.indexOf('id="' + st.click + '"') > 0 || page.indexOf('data-back') > 0, 'and its button is on the page: ' + st.click); }
  });
});

/* A stand-in for the browser's history: entries, where we are, and what Back and Forward do. The app
   only ever keeps one entry of its own on top of the page's. */
function browser() {
  const h = { entries: ['page'], at: 0 };
  return { h,
    apply(act) { if (act === 'push') { h.entries = h.entries.slice(0, h.at + 1).concat('app'); h.at++; } else if (act === 'pop') { h.at--; } },
    back() { if (h.at === 0) { return 'left'; } h.at--; return h.entries[h.at]; },
    forward() { if (h.at >= h.entries.length - 1) { return null; } h.at++; return h.entries[h.at]; } };
}
test('history: one entry of ours while there is somewhere to go back to, and none at the title', () => {
  const trail = play.trail(), b = browser();
  const sync = (deep) => { const act = trail.sync(deep); b.apply(act); return act; };
  assert.strictEqual(sync(false), '', 'at the title nothing is added: Back leaves, as it should');
  assert.strictEqual(b.back(), 'left');
  /* into the game, and deeper: still just one entry */
  assert.strictEqual(sync(true), 'push');
  assert.strictEqual(sync(true), '', 'play, then the tray, then a dialog: one entry covers them all');
  assert.strictEqual(sync(true), '');
  assert.deepStrictEqual(b.h, { entries: ['page', 'app'], at: 1 });
  /* Back, three times: each lands on the page's own entry, the app steps back and puts its entry on again */
  ['dialog closed', 'tray closed'].forEach(() => {
    assert.strictEqual(b.back(), 'page'); trail.back();
    assert.strictEqual(sync(true), 'push', 'still somewhere to go back to');
    assert.deepStrictEqual(b.h, { entries: ['page', 'app'], at: 1 });
  });
  assert.strictEqual(b.back(), 'page'); trail.back();
  assert.strictEqual(sync(false), '', 'play went to the title: nothing is put back');
  assert.strictEqual(trail.held(), false);
  assert.strictEqual(b.back(), 'left', 'and the next Back leaves the app');
});

test('history: getting home by the app\'s own buttons takes our entry away again, and Forward does not strand it', () => {
  const trail = play.trail(), b = browser();
  const sync = (deep) => { const act = trail.sync(deep); b.apply(act); return act; };
  sync(true);
  assert.strictEqual(sync(false), 'pop', 'tapped Home: our entry is stepped off, so Back leaves at once');
  assert.deepStrictEqual([b.h.at, trail.held()], [0, false]);
  /* Forward, onto our old entry, with nothing open: it is stepped off again */
  assert.strictEqual(b.forward(), 'app'); trail.forward();
  assert.strictEqual(sync(false), 'pop');
  assert.strictEqual(b.h.at, 0);
  /* Forward and then into the game: the entry is simply ours again */
  assert.strictEqual(b.forward(), 'app'); trail.forward();
  assert.strictEqual(sync(true), '');
  assert.deepStrictEqual([b.h.at, trail.held()], [1, true]);
  /* a page reloaded while our entry was on top starts the same way */
  const again = play.trail(); again.forward();
  assert.strictEqual(again.sync(false), 'pop');
});

/* ---------- copy ---------- */
test('every line the guided loop says is in every cartridge, with the blanks the app fills', () => {
  const BLANKS = { fromDMNew: ['{n}'], rollYours: ['{label}'], reqWaiting: ['{label}'], youSaid: ['{text}'], realOne: ['{s}'], realEach: ['{i}', '{s}'], realBad: ['{s}'], healthOf: ['{now}', '{max}'],
    healthSet: ['{state}'], questCount: ['{done}', '{n}'], heroSwap: ['{name}', '{old}'], heroAsk: ['{name}'], heroNow: ['{name}'], playedBy: ['{name}'], leftTable: ['{code}'], leaveTitle: ['{code}'] };
  IDS.forEach((id) => {
    const t = FR.useTheme(id).text;
    Object.keys(BLANKS).forEach((k) => BLANKS[k].forEach((b) => assert.ok(typeof t[k] === 'string' && t[k].indexOf(b) >= 0, id + ': text.' + k + ' has ' + b)));
    assert.match(t.leaveText, /seat/i, id + ': leaving says the seat is freed');
    assert.match(t.leaveText, /forgets/i, id + ': and that the table forgets the hero');
  });
});
