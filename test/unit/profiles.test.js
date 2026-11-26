/* Rules profiles (docs/PHASE2.md, section 6; the interface is at the end of src/rules.js).
   A cartridge names the rules it plays by, and everything else asks the profile. These tests cover:
     which profile a cartridge gets, and that the two real cartridges are still on today's rules;
     the light profile: its bonuses, the odds they were chosen for, health in three states, how the quiz
       finds a class from what the author wrote (and that every class can be reached), what a roll request
       sets up, what the play screen lists and what the sheet shows with rules details off and on;
     the open-5e profile: that the play screen and the sheet say, word for word, what they said before
       the screens were made to ask a profile (the expected lines were read off the running app first).
   The light cartridge here is the scaffold's own: what `npm run new-cartridge <id>` writes. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../../scripts/lib/packs.js');

const json = (v) => JSON.parse(JSON.stringify(v));
/* the scaffold's cartridge for one set of rules, as data */
function scaffold(rules, id) {
  const calls = [];
  vm.runInNewContext(P.template(rules).split('__ID__').join(id).split('__NAME__').join('Scaffold'), { FR: { cartridge: (d) => calls.push(d) } });
  return json(calls[0]);
}
/* the engine with the real packs and the scaffold's light cartridge in it, then src/app.js: with no `document` it stops after FR.play */
function engine() {
  const FR = P.engine();
  P.list().forEach((p) => { const l = P.load(p.file); assert.strictEqual(l.error, '', p.id + ' ' + l.error); FR.cartridge(l.def); });
  FR.cartridge(scaffold('light', 'hollow'));
  new Function('FR', fs.readFileSync(path.join(P.ROOT, 'src', 'app.js'), 'utf8'))(FR);
  return FR;
}
const FR = engine(), play = FR.play;
const REAL = P.list().map((p) => p.id);
/* what the screens hand a profile: the cartridge's copy, and the reason for a bonus in its words */
const tx = (T) => (key, vars) => (vars && typeof T.text[key] === 'string' ? play.fill(T.text[key], vars) : T.text[key]);
const whyOf = (T) => (k) => T.text['why' + String(k).split(' ')[0]] || '';
const words = (T) => ({ rolled: T.text.saidRolled, keep: T.text.saidKeep, higher: T.text.higher, lower: T.text.lower, and: T.text.and, plus: T.text.plus, plusFor: T.text.plusFor, minus: T.text.minus, bestOf: T.text.bestOf, worstOf: T.text.worstOf });
const rowsOf = (T, sheet, tab, details, init) => FR.profile(T).rows(tab, sheet, { theme: T, details: !!details && FR.profile(T).jargon, tx: tx(T), why: whyOf(T), init: init === undefined ? null : init });
const sheetOf = (T, sheet, details, health, align) => FR.profile(T).sheet(sheet, { theme: T, details: !!details, tx: tx(T), health: health, align: !!align });
/* a hero of a class, as the app makes one from a ready-made hero's answers */
function hero(T, cls) {
  const R = FR.profile(T), u = FR.tally(FR.answersFor(cls, T.samples[cls])), r = R.rank(u, T);
  return FR.build(u, cls, R.raceFor(cls, r.races, T), 12);
}
const light = () => FR.useTheme('hollow');

/* ---------- which rules ---------- */
test('a cartridge plays by the rules it names: open-5e when it names none, or names rules nobody has heard of', () => {
  assert.deepStrictEqual(FR.RULES, ['open-5e', 'light'], 'the rules a cartridge may name are the profiles');
  assert.deepStrictEqual(Object.keys(FR.PROFILES), FR.RULES);
  assert.strictEqual(light().rules, 'light');
  assert.strictEqual(FR.profile(FR.THEMES.hollow), FR.PROFILES.light);
  assert.strictEqual(FR.profile(), FR.PROFILES.light, 'with no cartridge named, the one in play');
  assert.strictEqual(FR.profile({ rules: 'house' }).id, 'open-5e');
  assert.strictEqual(FR.profile({}).id, 'open-5e');
  /* a cartridge that says nothing, and one that says something the engine does not know, are both put together as open-5e */
  const quiet = scaffold('open-5e', 'quiet'); delete quiet.rules;
  const odd = scaffold('open-5e', 'odd'); odd.rules = 'house';
  FR.cartridge(quiet); FR.cartridge(odd);
  assert.deepStrictEqual([FR.THEMES.quiet.rules, FR.THEMES.odd.rules], ['open-5e', 'open-5e']);
  /* every profile answers everything the screens ask */
  FR.RULES.forEach((id) => {
    const R = FR.PROFILES[id];
    assert.strictEqual(R.id, id);
    ['prepare', 'rank', 'raceFor', 'build', 'bonus', 'healthMax', 'armor', 'lucky', 'say', 'rows', 'request', 'sheet'].forEach((k) => assert.strictEqual(typeof R[k], 'function', id + '.' + k));
    ['jargon', 'two', 'healthSteps'].forEach((k) => assert.strictEqual(typeof R[k], 'boolean', id + '.' + k));
    assert.ok(['quiz', 'class'].indexOf(R.people) >= 0 && R.tabs.length >= 2 && R.tabs.every((x) => ['do', 'checks', 'fight'].indexOf(x) >= 0), id);
  });
  /* FR.build makes the sheet of whichever rules the cartridge in play uses */
  light();
  assert.strictEqual(FR.build(FR.zero(), 'The Sneak', 'Little Folk', 12).rules, 'light');
  const T = FR.useTheme('quiet');
  assert.deepStrictEqual(FR.build(FR.zero(), 'The Sneak', 'Little Folk', 12), FR.build5e(FR.zero(), 'The Sneak', 'Little Folk', 12));
  assert.ok(T.classes['The Sneak'].hd && !('strong' in T.classes['The Sneak']), 'and an open-5e class is left exactly as its author wrote it');
});

test('North Pole and Tavern Night are still on today\'s rules, and nothing was added to them', () => {
  REAL.forEach((id) => {
    const T = FR.useTheme(id), R = FR.profile(T);
    assert.strictEqual(T.rules, 'open-5e', id);
    assert.strictEqual(R, FR.PROFILES['open-5e']);
    assert.deepStrictEqual([R.jargon, R.two, R.people, R.tabs, R.healthSteps], [true, true, 'quiz', ['do', 'checks', 'fight'], true]);
    Object.keys(T.classes).forEach((c) => ['strong', 'fair'].forEach((k) => assert.ok(!(k in T.classes[c]), id + ' ' + c + ' has no ' + k)));
    /* the sheet is the one FR.build has always made (test/unit/rules.test.js holds it to the recorded fixture) */
    const c = Object.keys(T.classes)[0], sheet = hero(T, c);
    assert.deepStrictEqual(Object.keys(sheet), ['cls', 'race', 'level', 'scores', 'mods', 'prof', 'hp', 'ac', 'armor', 'speed', 'init', 'skills', 'perk', 'alignment', 'lucky', 'attacks']);
    assert.deepStrictEqual([R.healthMax(sheet), R.armor(sheet), R.lucky(sheet), R.say(T, 'detailsNote'), R.say(T, 'matchNote')], [sheet.hp, { ac: sheet.ac, note: sheet.armor }, sheet.lucky, '', ''], 'and the cartridge\'s own lines stand');
    /* who a set of answers makes is what FR.rank says, as before */
    const u = FR.tally(T.demo.answers), o = play.outcome(T.demo.answers, 'full');
    assert.deepStrictEqual(o.clsRank, FR.rank(u, T.classes)); assert.deepStrictEqual(o.raceRank, FR.rank(u, T.races));
    assert.deepStrictEqual([o.cls, o.race], [o.clsRank[0].name, o.raceRank[0].name]);
  });
});

/* ---------- open-5e: the screens say what they said before they asked a profile ---------- */
test('open-5e: the play screen and the sheet of a Tavern Night hero, word for word as before', () => {
  const T = FR.useTheme('tavern'), p = T.premades.filter((x) => x.name === 'Wren Tealeaf')[0], k = play.premade(p), o = play.outcome(k.answers, play.modeOf(play.answers(k.answers)));
  const sheet = FR.build(o.u, k.cls, k.race, o.answered), R = FR.profile(T);
  const said = (tab, details, init) => { const v = rowsOf(T, sheet, tab, details, init); return v.rows.map((r) => [r.cls, r.dot, r.label, r.hint, r.mod, r.mark]); };
  /* rules details off: plain words, "Good at this" where the hero is trained */
  assert.deepStrictEqual(said('do', false).slice(0, 4), [['', true, 'Look around', 'Notice what is nearby', '+2', 'Good at this'], ['', false, 'Search', 'Dig for clues or loot', '+1', ''],
    ['', true, 'Sneak', 'Move without being seen', '+5', 'Good at this'], ['', true, 'Pick a lock or pocket', 'Nimble fingers', '+5', 'Good at this']]);
  assert.strictEqual(said('do', false).length, 16);
  assert.deepStrictEqual(said('checks', false), [['', false, 'Strength', 'Push, lift, break', '−1', ''], ['', true, 'Dexterity', 'Quick hands, quick feet', '+3', 'Good at this'], ['', false, 'Constitution', 'Endure, hold your breath', '+1', ''],
    ['', false, 'Intelligence', 'Recall, reason, puzzle it out', '+1', ''], ['', false, 'Wisdom', 'Notice, sense, trust your gut', '+0', ''], ['', true, 'Charisma', 'Charm, command, perform', '+2', 'Good at this']]);
  assert.deepStrictEqual(said('fight', false), [['first', false, 'Who goes first?', 'Roll when a fight starts. Highest goes first.', '+3', ''], ['', false, 'Rapier', 'Someone next to you', '+5', ''], ['', false, 'Shortbow', 'Up to 80 feet', '+5', ''],
    ['', false, 'Shove or grab', 'Get physical, no weapon', '−1', ''], ['', true, 'Hide', 'Duck out of sight', '+5', 'Good at this']]);
  assert.deepStrictEqual(rowsOf(T, sheet, 'fight', false).say, ['No roll needed. ', 'Dash to move twice as far, Dodge to be harder to hit, Disengage to back away safely, or Help a friend. Just say it.']);
  /* rules details on: the skill's name in the hint, and nobody is marked on the ability checks */
  assert.deepStrictEqual(said('do', true).slice(0, 2), [['', true, 'Look around', 'Perception · Notice what is nearby', '+2', 'Good at this'], ['', false, 'Search', 'Investigation · Dig for clues or loot', '+1', '']]);
  assert.ok(said('checks', true).every((r) => r[1] === false && r[5] === ''));
  assert.deepStrictEqual(said('fight', true, 6), [['first', false, 'Roll initiative', 'You rolled 6. Tell the DM.', '+3', ''], ['', false, 'Rapier', 'Someone next to you · 1d8 + 3 damage', '+5', ''], ['', false, 'Shortbow', 'Up to 80 feet · 1d6 + 3 damage', '+5', ''],
    ['', false, 'Shove or grab', 'Athletics · get physical, no weapon', '−1', ''], ['', true, 'Hide', 'Stealth · duck out of sight', '+5', 'Good at this']]);
  /* what the rows roll */
  const ctx = (tab, details, i) => rowsOf(T, sheet, tab, details).rows[i].ctx;
  assert.deepStrictEqual(ctx('do', false, 0), { title: 'Look around', label: 'Look around', note: 'Perception · d20 + 2', plain: 'Notice what is nearby', sides: 20, count: 1, mod: 2, kind: 'check', why: 'sharp eyes' });
  assert.deepStrictEqual(ctx('checks', true, 0), { title: 'Strength', label: 'Strength', note: 'Ability check · d20 − 1', plain: 'Push, lift, break', sides: 20, count: 1, mod: -1, kind: 'check', why: 'being strong' });
  assert.deepStrictEqual(ctx('fight', true, 0), { title: 'Initiative', label: 'Initiative', note: 'Turn order · d20 + 3', plain: 'Roll when a fight starts. Highest goes first.', sides: 20, count: 1, mod: 3, kind: 'init', why: 'being quick off the mark' });
  assert.strictEqual(ctx('fight', false, 0).title, 'Who goes first?');
  assert.deepStrictEqual(ctx('fight', true, 1), { title: 'Rapier', label: 'Rapier', note: 'Attack roll · d20 + 5', plain: 'Someone next to you', sides: 20, count: 1, mod: 5, kind: 'attack', why: 'your skill with it', dmg: { sides: 8, count: 1, mod: 3 } });
  assert.strictEqual(play.sentence(ctx('do', false, 0), 'normal', [11], words(T)), 'You rolled 11, plus 2 for sharp eyes: 13.');
  assert.strictEqual(play.sentence(ctx('checks', false, 0), 'normal', [11], words(T)), 'You rolled 11, minus 1, as this is not your strong suit: 10.');
  /* the sheet, both ways */
  const fine = { now: sheet.hp, state: 'fine', word: 'Fine' };
  assert.deepStrictEqual(sheetOf(T, sheet, false, fine, false), { line: 'Halfling Rogue', vitals: [['Health', 'Fine'], ['Armor', 'Well protected (leather armor)']],
    abilities: [['STR', '8', '(−1)'], ['DEX', '17', '(+3)'], ['CON', '12', '(+1)'], ['INT', '13', '(+1)'], ['WIS', '10', '(+0)'], ['CHA', '15', '(+2)']], showAbilities: false,
    rows: [['Good at', 'Look around, Sneak, Pick a lock or pocket, Bluff'], ['Fights with', 'Rapier, Shortbow'], ['Trait', 'Lucky: roll a 1 on the 20-sided die and you may roll again.']] });
  const full = sheetOf(T, sheet, true, fine, true);
  assert.deepStrictEqual([full.line, full.vitals, full.showAbilities, full.rows], ['Level 1 Halfling Rogue · Chaotic Neutral', [['Armor Class', '14 (leather armor)'], ['Hit Points', '9 (1d8 + 1)'], ['Speed', '25 feet']], true,
    [['Skills', 'Stealth +5, Sleight of Hand +5, Deception +4, Perception +2'], ['Attacks', 'Rapier +5 (1d8 + 3), Shortbow +5 (1d6 + 3)'], ['Trait', 'Lucky: roll a 1 on the 20-sided die and you may roll again.']]]);
  assert.strictEqual(sheetOf(T, sheet, true, { now: 4, state: 'hurt', word: 'Hurt' }, true).vitals[1][1], '4 of 9 (1d8 + 1)', 'hit points lost are said as "4 of 9"');
  /* a roll the DM asks for, a lucky hero, armor, health */
  assert.deepStrictEqual(play.requestRoll({ n: 3, label: 'Listen at the door', why: 'Voices.', skill: 'Perception' }, sheet, whyOf(T)),
    { title: 'Listen at the door', label: 'Listen at the door', note: 'Perception · d20 + 2', plain: 'Voices.', sides: 20, count: 1, mod: 2, kind: 'check', why: 'sharp eyes', skill: 'Perception', request: 3 });
  assert.deepStrictEqual([R.lucky(sheet), R.armor(sheet), R.healthMax(sheet)], [true, { ac: 14, note: 'leather armor' }, 9]);
  assert.deepStrictEqual(play.tabs(R.tabs, T.text.tabs, T.text.tabOther, false), [{ id: 'do', label: 'I want to…' }, { id: 'checks', label: 'Other' }, { id: 'fight', label: 'Fight' }]);
  assert.deepStrictEqual(play.tabs(R.tabs, T.text.tabs, T.text.tabOther, true).map((x) => x.label), ['I want to…', 'Checks', 'Fight']);
});

/* ---------- light: the numbers ---------- */
test('light: a hero is strong (+5), fair (+2) or plain (+0) at each skill, and nothing else has a number', () => {
  const T = light(), R = FR.profile(T), def = scaffold('light', 'hollow');
  assert.deepStrictEqual(FR.LIGHT.bonus, { strong: 5, fair: 2, plain: 0 });
  Object.keys(T.classes).forEach((c) => {
    const sheet = hero(T, c), wrote = def.cast.classes[c];
    assert.deepStrictEqual(Object.keys(sheet), ['cls', 'race', 'rules', 'skills', 'states', 'perk', 'alignment', 'lucky'], 'no scores, hit points, armor or attacks');
    assert.deepStrictEqual(Object.keys(sheet.skills), Object.keys(FR.SKILLS), 'every skill the rules know');
    Object.keys(FR.SKILLS).forEach((sk) => {
      const tier = wrote.strong.indexOf(sk) >= 0 ? 'strong' : (wrote.fair.indexOf(sk) >= 0 ? 'fair' : 'plain'), b = R.bonus(sheet, sk);
      assert.deepStrictEqual(sheet.skills[sk], { mod: { strong: 5, fair: 2, plain: 0 }[tier], prof: tier === 'strong', tier: tier }, c + ' ' + sk);
      assert.deepStrictEqual(b, { mod: sheet.skills[sk].mod, good: tier === 'plain' ? '' : tier, known: true }, c + ' ' + sk);
    });
    assert.strictEqual(wrote.strong.length + wrote.fair.length, 4, c + ' is strong at two things and fair at two');
    /* an ability is not something these rules know, and neither is a made-up skill or a name every object has */
    ['STR', 'DEX', 'Juggling', '', 'toString', 'constructor', undefined].forEach((k) => assert.deepStrictEqual(R.bonus(sheet, k), { mod: 0, good: '', known: false }, String(k)));
    assert.deepStrictEqual([R.armor(sheet), R.lucky(sheet)], [null, false], 'no armor, and nobody rolls a 1 again');
  });
  assert.deepStrictEqual([R.jargon, R.two, R.people, R.tabs, R.healthSteps], [false, false, 'class', ['do', 'fight'], false]);
  assert.strictEqual(R.say(T, 'detailsNote'), 'The bonus behind each roll, as a number', 'what "Show rules details" does here, in the cartridge\'s words');
  assert.strictEqual(R.say(T, 'matchNote'), 'The numbers show how closely each kind of hero fits your answers. Your people is yours to choose. Tap another to switch.');
  assert.strictEqual(R.say(T, 'tagline'), '', 'only the lines these rules say; every other line is the cartridge\'s `text`');
  FR.LIGHT.words.forEach((k) => assert.ok(typeof T.light.text[k] === 'string' && T.light.text[k], 'the base has the line ' + k));
});

test('light: the bonuses give the odds they were chosen for', () => {
  const T = light(), R = FR.profile(T), sheet = hero(T, 'The Sneak');
  const row = (label) => rowsOf(T, sheet, 'do', false).rows.filter((r) => r.label === label)[0];
  const strong = row('Sneak').ctx, fair = row('Look around').ctx, plain = row('Climb, jump or swim').ctx;
  assert.deepStrictEqual([strong.mod, fair.mod, plain.mod], [5, 2, 0]);
  /* how many faces of the die reach a target, with the roll added up the way the tray adds it up, and judged the way
     the table judges a roll the DM asked for: at or over the target passes, a natural 20 always, a natural 1 never */
  const odds = (c, target) => { let n = 0; for (let face = 1; face <= 20; face++) { const r = play.result(c, 'normal', [face]); if (r.nat === 20 || (r.nat !== 1 && r.total >= target)) { n++; } } return n / 20; };
  /* a medium task (13): a strong hero about two times in three, a plain one four times in ten, a fair one an even chance */
  assert.deepStrictEqual([odds(strong, 13), odds(fair, 13), odds(plain, 13)], [0.65, 0.5, 0.4]);
  assert.ok(Math.abs(odds(strong, 13) - 2 / 3) < 0.02, '65% is two in three to within two points');
  [4, 6].forEach((b) => assert.ok(Math.abs((8 + b) / 20 - 2 / 3) > Math.abs(0.65 - 2 / 3), '+' + b + ' would be further from two in three than +5'));
  /* and the other two targets every adventure is written against */
  assert.deepStrictEqual([odds(strong, 10), odds(fair, 10), odds(plain, 10)], [0.8, 0.65, 0.55], 'easy (10)');
  assert.deepStrictEqual([odds(strong, 16), odds(fair, 16), odds(plain, 16)], [0.5, 0.35, 0.25], 'hard (16)');
  [10, 13, 16].forEach((target) => assert.ok(odds(strong, target) > odds(fair, target) && odds(fair, target) > odds(plain, target), 'strong beats fair beats plain at ' + target));
  /* one die, always: there is no second die to keep the better of */
  [strong, fair, plain].forEach((c) => assert.deepStrictEqual([c.sides, c.count, play.spec(c, 'normal')], [20, 1, [20]]));
});

test('light: health is three states and no hit points', () => {
  const T = light(), R = FR.profile(T), sheet = hero(T, 'The Healer');
  assert.deepStrictEqual(sheet.states, ['fine', 'hurt', 'trouble']);
  assert.ok(!('hp' in sheet) && !('ac' in sheet) && !('scores' in sheet) && !('attacks' in sheet));
  const max = R.healthMax(sheet);
  assert.strictEqual(max, 2, 'kept as 2, 1 or 0: one step for each state below fine');
  assert.deepStrictEqual([2, 1, 0].map((n) => play.health(n, max)), ['fine', 'hurt', 'trouble']);
  ['fine', 'hurt', 'trouble'].forEach((state) => assert.strictEqual(play.health(play.healthAt(state, max), max), state, 'marking "' + state + '" reads back as ' + state));
  assert.deepStrictEqual(['fine', 'hurt', 'trouble'].map((s) => play.healthAt(s, max)), [2, 1, 0]);
  assert.strictEqual(play.health(null, max), 'fine', 'nothing lost yet');
  assert.strictEqual(R.healthSteps, false, 'there is no number to step up and down');
  /* the sheet says it as a word, with rules details on as well as off */
  [false, true].forEach((d) => assert.deepStrictEqual(sheetOf(T, sheet, d, { now: 1, state: 'hurt', word: 'Hurt' }, false).vitals, [['Health', 'Hurt']]));
});

/* ---------- light: the quiz ---------- */
test('light: the quiz finds a class from what the author wrote, with no numbers from them', () => {
  const T = light(), def = scaffold('light', 'hollow'), R = FR.profile(T);
  const numbers = (v) => (typeof v === 'number' ? 1 : (v && typeof v === 'object' ? Object.keys(v).reduce((n, k) => n + numbers(v[k]), 0) : 0));
  assert.strictEqual(numbers(def.cast.classes) + numbers(def.cast.races), 0, 'the author wrote no number for a class or a people');
  /* every skill has a lean on the eight traits, and it leads with the trait the rules already read its ability from */
  const lead = { STR: ['might'], DEX: ['guile'], INT: ['lore'], WIS: ['faith', 'wild'], CHA: ['charm'] }, told = { Nature: 'wild', Religion: 'faith' };       // two of the lore skills are about the wild and the gods
  assert.deepStrictEqual(Object.keys(FR.SKILL_TRAITS), Object.keys(FR.SKILLS));
  Object.keys(FR.SKILLS).forEach((sk) => {
    const v = FR.SKILL_TRAITS[sk], top = FR.STRENGTHS.slice().sort((a, b) => v[FR.TRAITS.indexOf(b)] - v[FR.TRAITS.indexOf(a)])[0];
    assert.strictEqual(v.length, 8, sk);
    assert.ok(told[sk] ? top === told[sk] : lead[FR.SKILLS[sk]].indexOf(top) >= 0, sk + ' leads with ' + top);
  });
  /* a class's lean is its strong skills whole, its fair ones by half, and half again for the trait its role stands for */
  const sneak = T.classes['The Sneak'], add = (a, b, w) => a.map((x, i) => x + w * b[i]);
  let want = [0, 0, 0, 0, 0, 0, 0, 0];
  ['Stealth', 'Sleight of Hand'].forEach((sk) => { want = add(want, FR.SKILL_TRAITS[sk], 1); });
  ['Deception', 'Perception'].forEach((sk) => { want = add(want, FR.SKILL_TRAITS[sk], 0.5); });
  want[FR.TRAITS.indexOf('guile')] += 0.5;                 // The Sneak is a Trickster, and the Trickster's trait is guile
  assert.deepStrictEqual(sneak.v, want.map((x) => Math.round(x * 1000) / 1000));
  assert.deepStrictEqual(FR.lightLean({ strong: ['Stealth', 'Sleight of Hand'], fair: ['Deception', 'Perception'] }, T.roles.Trickster), sneak.v);
  Object.keys(T.classes).forEach((c) => {
    const k = T.classes[c], top = FR.STRENGTHS.slice().sort((a, b) => k.v[FR.TRAITS.indexOf(b)] - k.v[FR.TRAITS.indexOf(a)])[0];
    assert.strictEqual(top, T.roles[k.role].trait, c + ' leans most on its role\'s trait');
    assert.deepStrictEqual(k.skills, k.strong, c + ': what the DM\'s side lists as "Good at" is what the class is strong at');
    assert.match(k.color, /^#[0-9a-f]{6}$/, c + ' was given a colour for its dice');
    assert.strictEqual(k.color, FR.LIGHT.dice[top]);
    assert.deepStrictEqual(k.strengths, def.cast.classes[c].strengths);
  });
  /* no two classes read alike */
  const names = Object.keys(T.classes);
  names.forEach((a, i) => names.slice(i + 1).forEach((b) => assert.ok(FR.cosine(FR.centre(T.classes[a].v), FR.centre(T.classes[b].v)) < 0.9, a + ' and ' + b)));
  /* answering the way a class would makes that class, or all but: it is among the closest three */
  names.forEach((c) => {
    const answers = FR.answersFor(c, T.samples[c]);
    assert.strictEqual(answers.length, T.questions.length);
    const top = R.rank(FR.tally(answers), T).classes.slice(0, 3).map((r) => r.name);
    assert.ok(top.indexOf(c) >= 0, 'answering as ' + c + ' ranks ' + top.join(', '));
  });
  /* the same answers always make the same hero, by the full quiz and the quick one */
  const answers = T.questions.map((q, i) => i % q.a.length), quick = T.questions.map((q, i) => (T.quick.indexOf(i) >= 0 ? 1 : null));
  assert.deepStrictEqual(play.outcome(answers, 'full'), play.outcome(answers, 'full'));
  const o = play.outcome(quick, 'quick');
  assert.strictEqual(o.clsRank.length, 12);
  assert.ok(o.clsRank.every((r) => r.pct >= 1 && r.pct <= 99 && isFinite(r.score)), 'a class still says how closely it fits');
  assert.deepStrictEqual(o.clsRank, FR.rank(o.u, T.classes, T.quick), 'the class is ranked as it always was, against the quick yardstick');
  assert.strictEqual(o.cls, o.clsRank[0].name);
});

test('light: a people is flavour: a hero starts as the one in their class\'s picture, and every one is offered', () => {
  const T = light(), R = FR.profile(T);
  Object.keys(T.classes).forEach((c) => {
    const u = FR.tally(FR.answersFor(c, T.samples[c])), r = R.rank(u, T);
    assert.deepStrictEqual(r.races, Object.keys(T.races).map((name) => ({ name: name, score: 0, raw: 0, pct: null })), 'every people, as the cartridge wrote them, with no score to show');
    assert.strictEqual(R.raceFor(c, r.races, T), T.samples[c], c + ' starts as the people in its sample picture');
  });
  const o = play.outcome(T.questions.map(() => 0), 'full');
  assert.strictEqual(o.race, T.samples[o.cls], 'so the hero and the picture they are handed agree');
  assert.strictEqual(R.raceFor('Nobody', R.rank(FR.zero(), T).races, T), 'Townsfolk', 'a class with no sample falls back on the first people');
  /* ready-made heroes keep the people they were written with, and get answers that suit their class */
  T.premades.forEach((p) => {
    const k = play.premade(p);
    assert.deepStrictEqual([k.cls, k.race, k.answers.length], [p.cls, p.race, T.questions.length], p.name);
    assert.ok(R.rank(FR.tally(k.answers), T).classes.slice(0, 3).some((r) => r.name === p.cls), p.name + ' answers like a ' + p.cls);
  });
  /* a people may say nothing at all: no line on the sheet, and the painter is told nothing about them */
  const sheet = hero(T, 'The Scout');
  assert.strictEqual(sheet.perk, T.races['Forest Folk'].perk);
  const bare = json(sheet); bare.perk = '';
  assert.ok(!sheetOf(T, bare, false, { now: 2, word: 'Fine' }, false).rows.some((r) => r[0] === 'Trait'));
  assert.strictEqual(T.subject({ cls: 'The Scout', race: 'Forest Folk', look: { body: 'Female' }, desc: '', name: 'Rowan Fairwind' }), 'A female forest folk the scout.');
});

test('light: every class can be reached, by the full quiz and by the quick one', () => {
  const T = light(), r = P.reach(FR, T);
  assert.ok(r.quick, 'quiz.quick is usable');
  [['full', r.full, P.REACH.full], ['quick', r.quick, P.REACH.quick]].forEach(([mode, got, bound]) => {
    const s = got.classes;
    assert.ok(s.min >= bound.min, mode + ': ' + s.minName + ' comes up for only ' + (100 * s.minShare).toFixed(1) + '% of players');
    assert.ok(s.max <= bound.max, mode + ': ' + s.maxName + ' comes up for ' + (100 * s.maxShare).toFixed(1) + '% of players');
    assert.ok(s.min >= 0.55 && s.max <= 1.85, mode + ': and with room to spare (x' + s.min.toFixed(2) + ' to x' + s.max.toFixed(2) + ' of an even share)');
    /* a people comes up as often as the classes whose picture shows it */
    Object.keys(T.races).forEach((race) => {
      const want = Object.keys(T.classes).filter((c) => T.samples[c] === race).reduce((n, c) => n + got.share.classes[c], 0);
      assert.ok(Math.abs(got.share.races[race] - want) < 1e-9, mode + ': ' + race);
    });
  });
  /* the best five questions for a short game are chosen for the classes alone */
  const best = P.bestQuick(FR, T, 5, 1)[0];
  assert.deepStrictEqual([best.min, best.max], [best.classes.min, best.classes.max]);
  assert.ok(best.classes.min - r.quick.classes.min < 0.05, 'and the five the scaffold asks are as even as any (x' + r.quick.classes.min.toFixed(2) + ' against the best, x' + best.classes.min.toFixed(2) + ')');
});

/* ---------- light: at the table ---------- */
test('light: a roll request sets up one die and the hero\'s bonus for the skill, exactly as the standing actions do', () => {
  const T = light(), why = whyOf(T);
  Object.keys(T.classes).forEach((cls) => {
    const sheet = hero(T, cls), rows = rowsOf(T, sheet, 'do', false).rows;
    Object.keys(FR.SKILLS).forEach((sk) => {
      const c = play.requestRoll({ n: 7, label: 'Do the thing', why: 'It matters.', skill: sk }, sheet, why);
      assert.deepStrictEqual(c, { title: 'Do the thing', label: 'Do the thing', note: '', plain: 'It matters.', sides: 20, count: 1, mod: sheet.skills[sk].mod, kind: 'check', why: why(sk), skill: sk, request: 7 }, cls + ' ' + sk);
      /* the same die and the same bonus as the row for that skill on the play screen */
      T.actions.filter((a) => a.skill === sk).forEach((a) => { const row = rows.filter((r) => r.label === a.label)[0]; assert.deepStrictEqual([row.ctx.sides, row.ctx.count, row.ctx.mod, row.ctx.why], [c.sides, c.count, c.mod, c.why]); });
      assert.deepStrictEqual(play.spec(c, 'normal'), [20]);
      assert.strictEqual(play.result(c, 'normal', [10]).total, 10 + c.mod);
      assert.strictEqual(play.result(c, 'normal', [20]).nat, 20, 'a natural 20 is still a natural 20');
      assert.strictEqual(play.entry(c, 'normal', [14], words(T)).total, 14 + c.mod);
    });
    /* no skill, an ability (these rules have none) or a skill nobody has heard of: a plain roll, and nothing said about a bonus */
    [undefined, '', 'STR', 'Juggling', 'toString'].forEach((sk) => {
      const c = play.requestRoll({ n: 2, label: 'Hold your nerve', skill: sk }, sheet, why);
      assert.deepStrictEqual([c.sides, c.count, c.mod, c.why, c.skill, c.kind, c.note, c.request], [20, 1, 0, '', '', 'check', '', 2], cls + ': skill ' + sk);
      assert.strictEqual(play.sentence(c, 'normal', [12], words(T)), 'You rolled 12.');
    });
  });
  /* told in the same plain words as any other roll: strong, fair and plain */
  const sheet = hero(T, 'The Sneak'), said = (sk) => play.sentence(play.requestRoll({ n: 1, label: 'x', skill: sk }, sheet, why), 'normal', [11], words(T));
  assert.deepStrictEqual([said('Stealth'), said('Perception'), said('Athletics')], ['You rolled 11, plus 5 for being sneaky: 16.', 'You rolled 11, plus 2 for sharp eyes: 13.', 'You rolled 11.']);
});

test('light: the play screen lists what a hero can do and how to fight, and a fight is the same roll', () => {
  const T = light(), R = FR.profile(T), sheet = hero(T, 'The Sneak');
  assert.deepStrictEqual(play.tabs(R.tabs, T.text.tabs, T.text.tabOther, false), [{ id: 'do', label: 'I want to…' }, { id: 'fight', label: 'Fight' }], 'no tab of ability checks: there are no abilities');
  assert.deepStrictEqual(play.tabs(R.tabs, T.text.tabs, T.text.tabOther, true), play.tabs(R.tabs, T.text.tabs, T.text.tabOther, false));
  const todo = rowsOf(T, sheet, 'do', false);
  assert.strictEqual(todo.rows.length, T.actions.length); assert.strictEqual(todo.say, null);
  const by = (v, label) => v.rows.filter((r) => r.label === label)[0];
  /* a strong, a fair and a plain row: the badge in plain words, the bonus as "+5" for when rules details are on */
  assert.deepStrictEqual(by(todo, 'Sneak'), { label: 'Sneak', hint: 'Move without being seen', mod: '+5', dot: true, mark: 'Good at this', cls: '',
    ctx: { title: 'Sneak', label: 'Sneak', note: '', plain: 'Move without being seen', sides: 20, count: 1, mod: 5, kind: 'check', why: 'being sneaky' } });
  assert.deepStrictEqual([by(todo, 'Look around').mod, by(todo, 'Look around').dot, by(todo, 'Look around').mark, by(todo, 'Look around').ctx.mod], ['+2', false, 'Fair at this', 2]);
  assert.deepStrictEqual([by(todo, 'Persuade').mod, by(todo, 'Persuade').dot, by(todo, 'Persuade').mark, by(todo, 'Persuade').ctx.mod], ['+0', false, '', 0]);
  assert.deepStrictEqual(rowsOf(T, sheet, 'do', true), todo, 'rules details change nothing a row says: the screen only shows the bonus in place of the badge');
  todo.rows.forEach((r) => assert.ok(!/d20|Stealth ·|Perception ·/.test(r.hint + r.ctx.note), 'no dice names, no skill names: ' + r.label));
  assert.deepStrictEqual([play.sentence(by(todo, 'Sneak').ctx, 'normal', [9], words(T)), play.sentence(by(todo, 'Look around').ctx, 'normal', [9], words(T)), play.sentence(by(todo, 'Persuade').ctx, 'normal', [9], words(T))],
    ['You rolled 9, plus 5 for being sneaky: 14.', 'You rolled 9, plus 2 for sharp eyes: 11.', 'You rolled 9.']);
  /* the fight tab: who goes first (a plain roll), then the ways to fight, each a roll on the skill it comes down to */
  const fight = rowsOf(T, sheet, 'fight', false);
  assert.deepStrictEqual(fight.rows.map((r) => [r.label, r.mod, r.mark, r.cls, r.ctx.kind]), [['Who goes first?', '+0', '', 'first', 'init'], ['Hit it hard', '+0', '', '', 'attack'], ['Strike fast', '+5', 'Good at this', '', 'attack'],
    ['Aim and let fly', '+2', 'Fair at this', '', 'attack'], ['Strike from hiding', '+5', 'Good at this', '', 'attack'], ['Use magic', '+0', '', '', 'attack'], ['Trick or scare them', '+2', 'Fair at this', '', 'attack']]);
  assert.deepStrictEqual(by(fight, 'Strike fast').ctx, { title: 'Strike fast', label: 'Strike fast', note: '', plain: 'Quick and nimble, in and out', sides: 20, count: 1, mod: 5, kind: 'attack', why: 'quick fingers', skill: 'Sleight of Hand',
    says: { done: 'Tell the DM. If it lands, the foe takes a hit.', nat20: 'A natural 20 always lands. Tell the DM: the foe takes a hit.' } }, 'a way to fight that names several skills is rolled with the hero\'s best');
  fight.rows.forEach((r) => assert.ok(!('dmg' in r.ctx), r.label + ' has no damage dice to roll'));
  assert.deepStrictEqual(fight.say, ['How a fight goes. ', 'Pick a way to fight and roll. If it lands, the foe takes a hit: a few hits and it is out of the fight. Your DM keeps track.']);
  assert.strictEqual(rowsOf(T, sheet, 'fight', false, 14).rows[0].hint, 'You rolled 14. Tell the DM.');
  assert.strictEqual(play.sentence(by(fight, 'Strike from hiding').ctx, 'normal', [8], words(T)), 'You rolled 8, plus 5 for being sneaky: 13.', 'the same roll as any other, against the foe\'s target');
  /* a hero of another kind fights another way: every class in the scaffold is strong at one of them */
  Object.keys(T.classes).forEach((c) => assert.ok(rowsOf(T, hero(T, c), 'fight', false).rows.some((r) => r.ctx.kind === 'attack' && r.dot), c + ' has a way to fight they are strong at'));
  assert.deepStrictEqual(rowsOf(T, sheet, 'checks', false), { rows: [], say: null }, 'a tab these rules do not have lists nothing');
  /* a cartridge's own special rolls are listed as ever, without the die's name */
  const withExtras = json(scaffold('light', 'extras')); withExtras.extras = [{ id: 'omen', label: 'Read the omens', hint: 'What do the stars say?', sides: 6, title: 'The omens', note: 'd6', table: ['Doom', 'Rain', 'Luck', 'Love', 'Gold', 'Glory'] }];
  FR.cartridge(withExtras);
  const E = FR.useTheme('extras'), last = rowsOf(E, hero(E, 'The Sneak'), 'do', true).rows.pop();
  assert.deepStrictEqual([last.label, last.mod, last.cls, last.ctx.kind, last.ctx.sides], ['Read the omens', '', 'extra', 'table', 6]);
  light();
});

test('light: the sheet says what the hero is good and fair at; rules details add the bonuses and nothing else', () => {
  const T = light(), sheet = hero(T, 'The Sneak'), fine = { now: 2, state: 'fine', word: 'Fine' };
  const plain = sheetOf(T, sheet, false, fine, false), detail = sheetOf(T, sheet, true, fine, false);
  assert.deepStrictEqual(plain, { line: 'Little Folk The Sneak', vitals: [['Health', 'Fine']], abilities: null, showAbilities: false,
    rows: [['Good at', 'Sneak, Pick a lock or pocket'], ['Fair at', 'Look around, Bluff'], ['Trait', 'TODO Lucky: things have a way of working out for them.']] });
  assert.deepStrictEqual(detail, { line: 'Little Folk The Sneak', vitals: [['Health', 'Fine']], abilities: null, showAbilities: false,
    rows: [['Good at', 'Sneak +5, Pick a lock or pocket +5'], ['Fair at', 'Look around +2, Bluff +2'], ['Trait', 'TODO Lucky: things have a way of working out for them.']] });
  /* nothing from the rule book in either: no level, no armor, no scores, no dice, no skill names where the cartridge has its own words */
  [plain, detail].forEach((v) => assert.ok(!/Level|Armor|Hit Points|Speed|d20|1d|Stealth|Sleight/.test(JSON.stringify(v)), JSON.stringify(v)));
  /* the cartridge's own line under the name is shown when it is allowed (it never is for rule-book wording: see alignShown in src/app.js) */
  assert.strictEqual(sheetOf(T, sheet, true, fine, true).line, 'Little Folk The Sneak · ' + sheet.alignment);
  /* a skill with no line of its own on the "I want to…" list goes by its name */
  const wild = sheetOf(T, hero(T, 'The Wild One'), true, fine, false);
  assert.deepStrictEqual(wild.rows.slice(0, 2), [['Good at', 'Calm an animal +5, Nature +5'], ['Fair at', 'Look around +2, Patch someone up +2']]);
  /* a class with no fair skills has no "Fair at" line */
  const bare = json(sheet); Object.keys(bare.skills).forEach((k) => { if (bare.skills[k].tier === 'fair') { bare.skills[k] = { mod: 0, prof: false, tier: 'plain' }; } });
  assert.deepStrictEqual(sheetOf(T, bare, false, fine, false).rows.map((r) => r[0]), ['Good at', 'Trait']);
  /* the words are the cartridge's: one that rewords them is heard */
  const own = scaffold('light', 'reworded'); own.light.text = { fairAt: 'Not bad at this', fairAtHead: 'Not bad at' }; own.text.goodAt = 'Great at this';
  FR.cartridge(own);
  const W = FR.useTheme('reworded'), ws = hero(W, 'The Sneak');
  assert.deepStrictEqual(rowsOf(W, ws, 'do', false).rows.slice(0, 3).map((r) => r.mark), ['Not bad at this', '', 'Great at this']);
  assert.strictEqual(sheetOf(W, ws, false, fine, false).rows[1][0], 'Not bad at');
  assert.strictEqual(W.light.text.hitSay, 'Tell the DM. If it lands, the foe takes a hit.', 'and the lines it left alone are the engine\'s');
  light();
});
