/* The rules must not drift. fixtures/rules-baseline.json holds what the scoring, the sheet and the
   wording functions returned before themes became data-only scenario packs: both demo characters,
   every class with every race, and 200 seeded answer sets per pack. These tests replay the same
   inputs through the engine and the packs as they are now and expect the same output, exactly.
   If one fails, a number or a word a player sees has changed: decide whether you meant it. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const P = require('../../scripts/lib/packs.js');
const fixture = require('./fixtures/rules-baseline.json');

function engineWithPacks() {
  const FR = P.engine();
  P.list().forEach((p) => { const l = P.load(p.file); assert.strictEqual(l.error, '', p.id + ' ' + l.error); FR.scenario(l.def); });
  return FR;
}
const json = (v) => JSON.parse(JSON.stringify(v));
const same = (now, then, what) => assert.deepStrictEqual(json(now), then, what);
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/* the fixture was taken with Math.random swapped for a seeded stand-in wherever a name or a flourish is drawn */
function seeded(seed, fn) { const real = Math.random; Math.random = lcg(seed); try { return fn(); } finally { Math.random = real; } }
const rows = (list) => list.map((r) => [r.name, r.score, r.raw, r.pct]);
/* Files moved into packs and lost their old prefix. What a path would have been called before:
   packs/northpole/img/badge_santa.webp?v=1a2b3c4d -> img/np_badge_santa.webp */
function was(url, id) {
  let p = String(url).replace(/\?v=[0-9a-f]+$/, '');
  if (p.indexOf('packs/' + id + '/') !== 0) { return p; }
  p = p.slice(('packs/' + id + '/').length);
  return id === 'northpole' ? p.replace(/^(img|audio)\//, '$1/np_') : p;
}

const FR = engineWithPacks();
const STATIC = ['id', 'name', 'blurb', 'questions', 'classes', 'races', 'names', 'look', 'lookLabels', 'flourish', 'actions', 'traitLabels', 'axes',
  'armorNotes', 'samples', 'demo', 'dice', 'extras', 'text'];

Object.keys(fixture.themes).forEach((id) => {
  const then = fixture.themes[id];
  const use = () => FR.useTheme(id);
  const topTrait = (T, u) => Object.keys(T.traitLabels).slice().sort((a, b) => u[b] - u[a])[0];
  function replay(T, s) {
    const u = FR.tally(s.answers), n = s.answers.filter((x) => x !== null && x !== undefined).length;
    const name = seeded(s.seed, () => FR.rollName(s.race, s.look.body));
    const ch = { cls: s.cls, race: s.race, look: s.look, desc: s.desc, name: name };
    return {
      answers: s.answers, look: s.look, desc: s.desc, seed: s.seed, u: u, answered: n,
      clsRank: rows(FR.rank(u, T.classes)), raceRank: rows(FR.rank(u, T.races)), cls: s.cls, race: s.race, name: name,
      alignment: [FR.alignment(u, n || 1), FR.alignment(u, 12)],
      abilities: FR.abilities(u, s.cls, s.race),
      sheet: FR.build(u, s.cls, s.race, 12),
      subject: FR.portraitSubject(ch),
      describe: seeded(s.seed + 7, () => FR.localDescription(ch)),
      origin: T.origin({ name: name, first: name.split(' ')[0], race: s.race, cls: s.cls, top: topTrait(T, u) })
    };
  }

  test(id + ': the pack holds the same cast, questions and copy as before', () => {
    const T = use();
    STATIC.forEach((k) => same(T[k], then.static[k], id + '.' + k));
    ['style', 'describe', 'origin'].forEach((k) => assert.strictEqual(T.ai[k], then.static.ai[k], id + '.ai.' + k));
    same(T.story ? T.story.map((b) => ({ img: was(b.img, id), alt: b.alt, text: b.text })) : null, then.static.story, id + '.story');
    ['wordmark', 'divider', 'thumb', 'floor'].forEach((k) => assert.strictEqual(was(T.art[k], id), then.static.art[k], id + '.art.' + k));
    if (then.static.music) {
      ['intro', 'game', 'fight'].forEach((k) => same(T.music[k].map((f) => was(f, id)), then.static.music[k], id + '.music.' + k));
      assert.strictEqual(T.music.credit, then.static.music.credit, id + ' music credit');
    } else { assert.strictEqual(T.music, null, id + ' has no music'); }
    assert.strictEqual(T.adventure || null, then.static.adventure || null, id + '.adventure');
  });

  test(id + ': question counter, badges and sample portraits', () => {
    const T = use(), n = T.questions.length;
    same(T.questions.map((q, i) => T.count(i, n)), then.count.full);
    same([0, 1, 2, 3, 4].map((i) => T.count(i, 5)), then.count.five);
    Object.keys(T.classes).forEach((c) => {
      assert.strictEqual(was(T.art.crest(c), id), then.art.crest[c], 'badge for ' + c);
      assert.strictEqual(was(T.art.sample(c), id), then.art.sample[c], 'sample for ' + c);
    });
  });

  test(id + ': the yardstick random players are measured against', () => {
    const T = use();
    same(FR.baseline(T.classes), then.baseline.classes);
    same(FR.baseline(T.races), then.baseline.races);
  });

  test(id + ': the demo character, as saved and as ranked', () => {
    const T = use();
    same(replay(T, then.demo), then.demo);
    same(replay(T, then.demoTop), then.demoTop);
  });

  test(id + ': every class with every race makes the same sheet', () => {
    const T = use(), u = FR.tally(T.demo.answers);
    assert.strictEqual(Object.keys(then.grid).length, Object.keys(T.classes).length * Object.keys(T.races).length);
    Object.keys(T.classes).forEach((c) => Object.keys(T.races).forEach((r) => same(FR.build(u, c, r, 12), then.grid[c + '|' + r], c + ' ' + r)));
  });

  test(id + ': 200 seeded answer sets give the same class, race, abilities, sheet and words', () => {
    const T = use();
    assert.strictEqual(then.sets.length, 200);
    then.sets.forEach((s, i) => same(replay(T, s), s, id + ' set ' + i));
  });

  test(id + ': a table is always measured with its own questions, whichever pack is in play', () => {
    const fresh = engineWithPacks(), other = Object.keys(fixture.themes).filter((x) => x !== id)[0];
    fresh.useTheme(other);
    same(fresh.baseline(fresh.THEMES[id].classes), then.baseline.classes);
  });

  test(id + ': every class and race can be reached, by the full quiz and by the quick one', () => {
    const T = use(), r = P.reach(FR, T);
    assert.ok(r.quick, 'quiz.quick is usable');
    [['full', r.full, P.REACH.full], ['quick', r.quick, P.REACH.quick]].forEach(([mode, got, bound]) => {
      ['classes', 'races'].forEach((kind) => {
        const s = got[kind];
        assert.ok(s.min >= bound.min, id + ' ' + mode + ': ' + s.minName + ' comes up for only ' + (100 * s.minShare).toFixed(1) + '% of players');
        assert.ok(s.max <= bound.max, id + ' ' + mode + ': ' + s.maxName + ' comes up for ' + (100 * s.maxShare).toFixed(1) + '% of players');
      });
    });
  });
});

test('a short quiz is ranked against its own yardstick', () => {
  const T = FR.useTheme('tavern'), quick = T.quiz.quick, answers = T.questions.map((q, i) => (quick.indexOf(i) >= 0 ? 0 : null));
  const u = FR.tally(answers), full = FR.rank(u, T.classes), short = FR.rank(u, T.classes, quick);
  assert.strictEqual(short.length, Object.keys(T.classes).length);
  assert.notDeepStrictEqual(short.map((r) => r.score), full.map((r) => r.score));
  assert.deepStrictEqual(FR.rank(u, T.classes, quick.slice().reverse()), short, 'the order the questions are named in does not matter');
  short.forEach((r) => assert.ok(r.pct >= 1 && r.pct <= 99 && isFinite(r.score)));
});

test('a ready-made hero with no answers of their own gets ones that suit them', () => {
  Object.keys(fixture.themes).forEach((id) => {
    const T = FR.useTheme(id);
    Object.keys(T.classes).forEach((c) => {
      const answers = FR.answersFor(c, T.samples[c]);
      assert.strictEqual(answers.length, T.questions.length);
      const top = FR.rank(FR.tally(answers), T.classes).slice(0, 3).map((r) => r.name);
      assert.ok(top.indexOf(c) >= 0, id + ': answering as a ' + c + ' ranks ' + top.join(', '));
    });
  });
});
