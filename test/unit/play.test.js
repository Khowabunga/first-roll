/* The player's side has a part with no screen in it: FR.play, at the top of src/app.js. It decides
   which questions a game asks, what a set of answers makes, how a ready-made hero is taken up, what
   a roll adds up to and how that is said in plain words, and when a shaken phone throws the dice.
   These tests run that part alone, against the real packs, with no browser. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const P = require('../../scripts/lib/packs.js');

/* the engine with every pack in it, then src/app.js: with no `document` it stops after FR.play */
function engine() {
  const FR = P.engine();
  P.list().forEach((p) => { const l = P.load(p.file); assert.strictEqual(l.error, '', p.id + ' ' + l.error); FR.scenario(l.def); });
  new Function('FR', fs.readFileSync(path.join(P.ROOT, 'src', 'app.js'), 'utf8'))(FR);
  assert.ok(FR.play, 'src/app.js defines FR.play before it touches the page');
  return FR;
}
const FR = engine();
const IDS = P.list().map((p) => p.id);
/* the words a roll is told in, straight from a pack's copy (the same keys src/app.js hands over) */
const words = (t) => ({ rolled: t.text.saidRolled, keep: t.text.saidKeep, higher: t.text.higher, lower: t.text.lower, and: t.text.and,
  plus: t.text.plus, plusFor: t.text.plusFor, minus: t.text.minus, bestOf: t.text.bestOf, worstOf: t.text.worstOf });
const W = words(FR.useTheme(IDS[0]));

/* ---------- quick start ---------- */
test('a quick game asks the pack\'s five questions, in the pack\'s order, and the full quiz asks them all', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id);
    assert.deepStrictEqual(FR.play.questions('quick'), T.quiz.quick, id);
    assert.strictEqual(FR.play.questions('quick').length, 5, id);
    assert.deepStrictEqual(FR.play.questions('full'), T.questions.map((q, i) => i), id);
  });
});

test('quick ranking: five answers are measured with the quick yardstick and the count of answers given', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id), quick = T.quiz.quick;
    /* every way of answering the first two quick questions, with fixed answers to the other three */
    for (let a = 0; a < T.questions[quick[0]].a.length; a++) {
      for (let b = 0; b < T.questions[quick[1]].a.length; b++) {
        const answers = FR.play.answers([]);
        quick.forEach((qi, i) => { answers[qi] = i === 0 ? a : (i === 1 ? b : 1); });
        const o = FR.play.outcome(answers, 'quick'), u = FR.tally(answers);
        assert.strictEqual(o.mode, 'quick');
        assert.strictEqual(o.answered, 5);
        assert.deepStrictEqual(o.answers.filter((x) => x !== null).length, 5, 'the questions that were not asked stay unanswered');
        assert.deepStrictEqual(o.clsRank, FR.rank(u, T.classes, quick), id + ': classes are ranked against the quick yardstick');
        assert.deepStrictEqual(o.raceRank, FR.rank(u, T.races, quick), id + ': races too');
        assert.strictEqual(o.cls, o.clsRank[0].name);
        assert.strictEqual(o.race, o.raceRank[0].name);
        assert.strictEqual(o.alignment, FR.alignment(u, 5), id + ': the line under the name counts five answers, not twelve');
        assert.ok(T.classes[o.cls] && T.races[o.race]);
        assert.strictEqual(FR.play.modeOf(answers), 'quick', 'and a saved set of quick answers is known for what it is');
      }
    }
  });
});

test('the quick yardstick is not the full one: the same five answers rank differently against each', () => {
  const T = FR.useTheme('tavern'), answers = FR.play.answers([]);
  T.quiz.quick.forEach((qi) => { answers[qi] = 0; });
  const quick = FR.play.outcome(answers, 'quick'), full = FR.play.outcome(answers, 'full');
  assert.notDeepStrictEqual(quick.clsRank.map((r) => r.score), full.clsRank.map((r) => r.score));
});

test('the full quiz comes out exactly as it always has', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id), answers = T.demo.answers, o = FR.play.outcome(answers, 'full'), u = FR.tally(answers);
    assert.strictEqual(o.answered, T.questions.length);
    assert.deepStrictEqual(o.clsRank, FR.rank(u, T.classes));
    assert.deepStrictEqual(o.raceRank, FR.rank(u, T.races));
    assert.strictEqual(o.alignment, FR.alignment(u, T.questions.length));
    assert.strictEqual(FR.play.modeOf(answers), 'full');
  });
});

test('answers that no longer fit the questions are dropped, not allowed to break the sheet', () => {
  FR.useTheme('northpole');
  const a = FR.play.answers([0, 99, undefined, -1, 'x', 2]);
  assert.strictEqual(a.length, FR.QUESTIONS.length);
  assert.deepStrictEqual(a.slice(0, 6), [0, null, null, null, null, 2]);
  assert.strictEqual(FR.play.outcome([], 'quick').answered, 1, 'nothing answered still divides by one');
});

/* ---------- ready-made heroes ---------- */
test('adopting a ready-made hero: a finished character, with the class, race, name and picture the pack gave it', () => {
  IDS.forEach((id) => {
    const T = FR.useTheme(id);
    assert.ok(T.roster.premades.length >= 6, id + ' has a gallery to choose from');
    T.roster.premades.forEach((p) => {
      const k = FR.play.premade(p), at = id + ' ' + p.name;
      assert.strictEqual(k.name, p.name, at);
      assert.strictEqual(k.cls, p.cls, at);
      assert.strictEqual(k.race, p.race, at);
      assert.ok(T.classes[k.cls] && T.races[k.race], at + ' is in the cast');
      assert.ok(k.portrait, at + ' has a picture');
      assert.strictEqual(k.portrait, p.portrait, at);
      assert.strictEqual(k.answers.length, T.questions.length, at + ' has an answer for every question');
      assert.strictEqual(FR.play.modeOf(k.answers), 'full', at);
      assert.deepStrictEqual(k.look, p.look, at);
      assert.notStrictEqual(k.look, p.look, 'the look is a copy: changing the hero never changes the gallery');
      assert.notStrictEqual(k.answers, p.answers);
      /* the saved shape makes a sheet straight away, exactly as the old demo hero did */
      const o = FR.play.outcome(k.answers, 'full'), sheet = FR.build(o.u, k.cls, k.race, o.answered);
      assert.deepStrictEqual(sheet, FR.build(FR.tally(p.answers), p.cls, p.race, T.questions.length), at);
      assert.ok(sheet.hp > 0 && sheet.ac > 0 && sheet.attacks.length > 0, at + ' can play');
      /* the hero's own class is among the closest three, so the reveal would not have been a surprise */
      assert.ok(o.clsRank.slice(0, 3).some((r) => r.name === k.cls), at + ': ' + o.clsRank.slice(0, 3).map((r) => r.name).join(', '));
    });
  });
});

/* ---------- a roll, as arithmetic and as a sentence ---------- */
const sneak = { title: 'Sneak', label: 'Sneak', sides: 20, count: 1, mod: 4, kind: 'check', why: 'being sneaky' };

test('one die, two dice keeping the best or the worst, and several dice added up', () => {
  assert.deepStrictEqual(FR.play.spec(sneak, 'normal'), [20]);
  assert.deepStrictEqual(FR.play.spec(sneak, 'adv'), [20, 20]);
  assert.deepStrictEqual(FR.play.result(sneak, 'normal', [19]), { kept: 19, total: 23, two: false, nat: 19, keptIx: -1 });
  assert.deepStrictEqual(FR.play.result(sneak, 'dis', [9, 17]), { kept: 9, total: 13, two: true, nat: 9, keptIx: 0 });
  assert.deepStrictEqual(FR.play.result(sneak, 'adv', [9, 17]), { kept: 17, total: 21, two: true, nat: 17, keptIx: 1 });
  const dmg = { sides: 6, count: 3, mod: 2, kind: 'damage' };
  assert.deepStrictEqual(FR.play.spec(dmg, 'adv'), [6, 6, 6], 'damage never rolls two and keeps one');
  assert.deepStrictEqual(FR.play.result(dmg, 'normal', [3, 5, 2]), { kept: 10, total: 12, two: false, nat: 0, keptIx: -1 });
  assert.strictEqual(FR.play.result({ sides: 20, count: 1, mod: 0, kind: 'free' }, 'normal', [20]).nat, 0, 'a free roll is never a natural 20');
});

test('results read like a sentence, with the reason for the bonus', () => {
  assert.strictEqual(FR.play.sentence(sneak, 'normal', [19], W), 'You rolled 19, plus 4 for being sneaky: 23.');
  assert.strictEqual(FR.play.sentence(sneak, 'dis', [9, 17], W), 'Rolled 9 and 17, keeping the lower: 9, plus 4 for being sneaky: 13.');
  assert.strictEqual(FR.play.sentence(sneak, 'adv', [9, 17], W), 'Rolled 9 and 17, keeping the higher: 17, plus 4 for being sneaky: 21.');
  assert.strictEqual(FR.play.sentence({ sides: 20, count: 1, mod: 0, kind: 'check' }, 'normal', [14], W), 'You rolled 14.');
  assert.strictEqual(FR.play.sentence({ sides: 6, count: 3, mod: 0, kind: 'damage' }, 'normal', [3, 5, 2], W), 'You rolled 3, 5 and 2: 10.');
  assert.strictEqual(FR.play.sentence({ sides: 8, count: 1, mod: 3, kind: 'damage' }, 'normal', [5], W), 'You rolled 5, plus 3: 8.');
  assert.match(FR.play.sentence({ sides: 20, count: 1, mod: -1, kind: 'check', why: 'being strong' }, 'normal', [7], W), /^You rolled 7, minus 1, .*: 6\.$/);
  assert.doesNotMatch(FR.play.sentence({ sides: 20, count: 1, mod: -1, kind: 'check', why: 'being strong' }, 'normal', [7], W), /being strong/, 'a penalty is never blamed on a strength');
});

test('no sentence carries dice shorthand, an ability abbreviation or a bare bonus, in any pack\'s voice', () => {
  IDS.forEach((id) => {
    const w = words(FR.useTheme(id));
    [[sneak, 'normal', [19]], [sneak, 'adv', [3, 20]], [sneak, 'dis', [1, 20]], [{ sides: 12, count: 2, mod: 5, kind: 'damage', why: 'hitting hard' }, 'normal', [12, 1]]].forEach(([c, adv, v]) => {
      const s = FR.play.sentence(c, adv, v, w);
      assert.doesNotMatch(s, /\bd\d+\b|\b\d+d\d+\b|\b(STR|DEX|CON|INT|WIS|CHA)\b|[+−]\s?\d|\{|\bundefined\b/, id + ': ' + s);
    });
  });
});

test('what the table is told about a roll: its plain name, the short sum, every die', () => {
  assert.deepStrictEqual(FR.play.entry(sneak, 'normal', [19], W), { label: 'Sneak', kind: 'check', total: 23, nat: 0, detail: '19 + 4', dice: [{ sides: 20, value: 19 }] });
  assert.deepStrictEqual(FR.play.entry(sneak, 'normal', [20], W), { label: 'Sneak', kind: 'check', total: 24, nat: 20, detail: '20 + 4', dice: [{ sides: 20, value: 20 }] });
  assert.strictEqual(FR.play.entry(sneak, 'normal', [1], W).nat, 1);
  const two = FR.play.entry(sneak, 'adv', [9, 17], W);
  assert.strictEqual(two.total, 21);
  assert.strictEqual(two.detail, '17 + 4 (best of 9 and 17)');
  assert.deepStrictEqual(two.dice, [{ sides: 20, value: 9 }, { sides: 20, value: 17 }]);
  assert.strictEqual(FR.play.entry({ label: 'Rolling pin damage', sides: 6, count: 2, mod: -1, kind: 'damage' }, 'normal', [3, 5], W).detail, '3 + 5 − 1');
  /* a pack's own special roll is filed as 'extra', and says what came up */
  const extra = FR.play.entry({ label: 'Nibble a cookie', sides: 6, count: 1, mod: 0, kind: 'table', table: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'normal', [4], W);
  assert.strictEqual(extra.kind, 'extra');
  assert.strictEqual(extra.detail, 'd');
  assert.ok(Number.isInteger(extra.total), 'the server only takes whole numbers');
  ['check', 'attack', 'damage', 'init', 'free'].forEach((kind) => assert.strictEqual(FR.play.entry({ sides: 20, count: 1, mod: 0, kind: kind }, 'normal', [5], W).kind, kind));
});

test('dice in words, in every pack', () => {
  IDS.forEach((id) => {
    const t = FR.useTheme(id), w = { numbers: t.text.numberWords, one: t.text.diceOne, many: t.text.diceMany };
    assert.strictEqual(t.text.numberWords.split(' ').length, 8, id + ': a word for every count up to eight (four dice, doubled)');
    for (let n = 1; n <= 8; n++) {
      const s = FR.play.diceWords(n, 6, w);
      assert.ok(s && !/\{|undefined/.test(s), id + ': ' + s);
      assert.doesNotMatch(s, /\bd6\b|\b\d+d6\b/, id + ': ' + s);
    }
  });
  assert.strictEqual(FR.play.diceWords(1, 20, { numbers: W.numbers, one: 'One {s}-sided die', many: '{n} {s}-sided dice' }), 'One 20-sided die');
  assert.strictEqual(FR.play.diceWords(3, 6, { numbers: 'One Two Three', one: 'One {s}-sided die', many: '{n} {s}-sided dice' }), 'Three 6-sided dice');
});

test('every skill and ability has a reason for its bonus, in every pack', () => {
  const KEYS = { Athletics: 'whyAthletics', Acrobatics: 'whyAcrobatics', 'Sleight of Hand': 'whySleight', Stealth: 'whyStealth', Arcana: 'whyArcana', History: 'whyHistory', Investigation: 'whyInvestigation',
    Nature: 'whyNature', Religion: 'whyReligion', 'Animal Handling': 'whyAnimal', Insight: 'whyInsight', Medicine: 'whyMedicine', Perception: 'whyPerception', Survival: 'whySurvival',
    Deception: 'whyDeception', Intimidation: 'whyIntimidation', Performance: 'whyPerformance', Persuasion: 'whyPersuasion' };
  assert.deepStrictEqual(Object.keys(KEYS).sort(), Object.keys(FR.SKILLS).sort(), 'one for each skill in the rules');
  const src = fs.readFileSync(path.join(P.ROOT, 'src', 'app.js'), 'utf8');
  IDS.forEach((id) => {
    const t = FR.useTheme(id);
    Object.keys(KEYS).forEach((skill) => {
      assert.ok(typeof t.text[KEYS[skill]] === 'string' && t.text[KEYS[skill]], id + ': ' + KEYS[skill]);
      assert.ok(src.indexOf("'" + skill + "': tx('" + KEYS[skill] + "')") >= 0 || src.indexOf(skill + ": tx('" + KEYS[skill] + "')") >= 0, 'src/app.js gives ' + skill + ' its reason');
    });
    FR.ABILITIES.forEach((ab) => assert.ok(typeof t.text['why' + ab] === 'string' && t.text['why' + ab], id + ': why' + ab));
  });
});

/* ---------- shake to roll ---------- */
test('shake: the first shake rattles the dice, the second throws them', () => {
  const s = FR.play.shaker();
  assert.deepStrictEqual(s.feed(3, 0), { rattle: 0, throw: false }, 'a phone being carried is not a shake');
  assert.deepStrictEqual(s.feed(9.8, 20), { rattle: 0, throw: false }, 'nor is a nudge');
  const one = s.feed(30, 100);
  assert.ok(one.rattle >= 0.2 && one.rattle <= 1 && !one.throw, 'first shake: a rattle, no throw yet');
  assert.deepStrictEqual(s.feed(40, 150), { rattle: 0, throw: false }, 'readings from the same swing of the arm do not count again');
  assert.deepStrictEqual(s.feed(40, 340), { rattle: 0, throw: false }, 'nothing closer than a quarter of a second');
  const two = s.feed(30, 360);
  assert.ok(two.rattle > 0 && two.throw, 'second shake: rattle and throw');
});

test('shake: a harder shake rattles louder, within bounds', () => {
  const soft = FR.play.shaker().feed(15, 0).rattle, hard = FR.play.shaker().feed(60, 0).rattle;
  assert.ok(soft >= 0.2 && soft < hard && hard <= 1, soft + ' < ' + hard);
});

test('shake: one shake and then stillness throws too, but only once it has been still', () => {
  const s = FR.play.shaker();
  assert.ok(s.feed(25, 1000).rattle > 0);
  assert.strictEqual(s.tick(1300), false, 'still shaking, perhaps');
  assert.strictEqual(s.tick(1000 + s.options.stop), true, 'still for long enough: throw');
  assert.strictEqual(s.tick(5000), false, 'and only once');
});

test('shake: after a throw the phone is ignored for a while, so one bout of shaking is one roll', () => {
  const s = FR.play.shaker();
  s.feed(30, 0); assert.ok(s.feed(30, 300).throw);
  assert.deepStrictEqual(s.feed(50, 600), { rattle: 0, throw: false });
  assert.deepStrictEqual(s.feed(50, 300 + s.options.cooldown - 1), { rattle: 0, throw: false });
  assert.ok(s.feed(50, 300 + s.options.cooldown + 1).rattle > 0, 'then it listens again');
  /* landing starts the quiet spell afresh, and forgets a half-finished shake */
  const t = FR.play.shaker();
  t.feed(30, 0); t.rest(100);
  assert.strictEqual(t.waiting(), 0);
  assert.strictEqual(t.tick(5000), false);
  assert.deepStrictEqual(t.feed(30, 200), { rattle: 0, throw: false });
});

test('shake: the threshold, the gap and the pauses can be tuned', () => {
  const s = FR.play.shaker({ threshold: 5, gap: 100, stop: 200, cooldown: 300 });
  assert.ok(s.feed(6, 0).rattle > 0);
  assert.ok(s.feed(6, 100).throw);
  assert.deepStrictEqual(s.feed(6, 399), { rattle: 0, throw: false });
  assert.ok(s.feed(6, 400).rattle > 0);
  assert.ok(FR.play.shaker().options.gap >= 250, 'no rattle closer than about a quarter of a second');
});

/* ---------- plain words ---------- */
test('the copy a first-timer reads has no rules shorthand in it', () => {
  /* the lines that only show with "Show rules details" on, or that name a thing the DM will say out loud */
  const DETAIL = ['skills', 'attacks', 'tabs', 'initLabel', 'crit', 'advTerm', 'disTerm', 'normalTerm', 'detailsNote', 'railHint', 'checkHints'];
  const JARGON = /\b\d*d(4|6|8|10|12|20|100)\b|\b(STR|DEX|CON|INT|WIS|CHA)\b|\bAC\b|\bHP\b|Armor Class|Hit Points?|\b[Aa]dvantage\b|\b[Dd]isadvantage\b|\binitiative\b|\bmodifier\b|\bproficien/;
  IDS.forEach((id) => {
    const t = FR.useTheme(id);
    Object.keys(t.text).filter((k) => DETAIL.indexOf(k) < 0).forEach((k) => {
      [].concat(t.text[k]).forEach((line) => { if (typeof line === 'string') { assert.doesNotMatch(line, JARGON, id + ' text.' + k + ': ' + line); } });
    });
    /* the DM is introduced where a player first meets the word */
    assert.match(t.text.dm, /story/, id + ': the DM button says what a DM is');
    assert.match(t.text.dmIs, /story/, id + ': so does the table dialog');
    assert.match(t.text.nudge, /story/, id + ': and the first word on the play screen');
    /* an attack's damage is an offer that depends on the DM */
    assert.match(t.text.hitsSay, /[Ii]f /, id + ': ' + t.text.hitsSay);
  });
});

test('the app never says "adults only", in any pack or in the engine', () => {
  const texts = [JSON.stringify(P.engine().scenarioDef('base').text)].concat(IDS.map((id) => JSON.stringify(FR.useTheme(id).text)));
  ['src/app.js', 'src/table.js', 'src/index.html'].forEach((f) => texts.push(fs.readFileSync(path.join(P.ROOT, f), 'utf8')));
  texts.forEach((s) => assert.doesNotMatch(s, /adults? only|for adults|grown-ups only/i));
});
