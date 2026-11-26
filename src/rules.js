/* First Roll: the rules engine. The matching maths and the character sheet: pure functions,
   no DOM, and no words or pictures of its own. Everything a player reads comes from a scenario
   pack (see src/registry.js and cartridges/); FR.useTheme points the tables below at one.

   The rules come in profiles (FR.PROFILES, at the end of this file): 'open-5e' is the maths in the
   first half of the file, and 'light' is one die and a bonus. A cartridge names the one it plays by
   (rules: 'light'), and the rest of the app asks the profile (FR.profile()) instead of assuming
   either. The only words written here are rule-book ones ("Armor Class", "Hit Points"), which a
   player sees only with "Show rules details" on. */
var FR = (typeof FR !== 'undefined') ? FR : {};

FR.TRAITS = ['might', 'guile', 'lore', 'faith', 'charm', 'wild', 'order', 'light'];
FR.STRENGTHS = ['might', 'guile', 'lore', 'faith', 'charm', 'wild'];      // the six a pack names and shows as bars; order and light are the two sliders
FR.ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
FR.ABILITY_NAMES = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };
FR.SKILLS = {
  Athletics: 'STR', Acrobatics: 'DEX', 'Sleight of Hand': 'DEX', Stealth: 'DEX', Arcana: 'INT', History: 'INT', Investigation: 'INT', Nature: 'INT', Religion: 'INT',
  'Animal Handling': 'WIS', Insight: 'WIS', Medicine: 'WIS', Perception: 'WIS', Survival: 'WIS', Deception: 'CHA', Intimidation: 'CHA', Performance: 'CHA', Persuasion: 'CHA'
};
FR.ARMOR = ['unarmored', 'monk', 'leather', 'leather+shield', 'scale', 'scale+shield', 'chain+shield', 'none'];

/* The tables in play. A scenario pack fills them (FR.useTheme); the rules only read them. */
FR.QUESTIONS = []; FR.CLASSES = {}; FR.RACES = {}; FR.NAMES = {}; FR.LOOK = {}; FR.LOOK_LABELS = {}; FR.FLOURISH = []; FR.ACTIONS = []; FR.TRAIT_LABELS = {};

/* ---------- the maths ---------- */
FR.zero = function () { var o = {}; FR.TRAITS.forEach(function (k) { o[k] = 0; }); return o; };

FR.tally = function (answers) {           // answers: array of chosen indexes (or null)
  var u = FR.zero();
  answers.forEach(function (ai, qi) {
    if (ai === null || ai === undefined) { return; }
    var w = FR.QUESTIONS[qi].a[ai].w;
    Object.keys(w).forEach(function (k) { u[k] += w[k]; });
  });
  return u;
};

FR.cosine = function (a, b) {
  var d = 0, na = 0, nb = 0, i;
  for (i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
};

/* Rank a table of profiles against the player's trait vector.
   1. The six "strength" traits are centred on their mean, so being middling at
      everything reads as balanced rather than as a weak match for each.
   2. The raw similarity is then compared with how a few thousand random players
      score against the same profile, so every class and race is equally reachable
      and the percentage means "a closer match than this share of adventurers". */
FR.centre = function (v) {
  var m = (v[0] + v[1] + v[2] + v[3] + v[4] + v[5]) / 6;
  return [v[0] - m, v[1] - m, v[2] - m, v[3] - m, v[4] - m, v[5] - m, v[6] * 0.8, v[7] * 0.8];
};
FR.raw = function (u, table) {
  var cu = FR.centre(FR.TRAITS.map(function (k) { return u[k]; })), out = {};
  Object.keys(table).forEach(function (name) { out[name] = FR.cosine(cu, FR.centre(table[name].v)); });
  return out;
};
/* How random players score against each profile: the yardstick FR.rank measures with.
   `only` is for a short quiz: the question indexes that were asked. A short quiz gets its own
   yardstick, because five answers swing much further than twelve do. */
FR.baseline = function (table, only) {
  var qs = table._quiz || FR.QUESTIONS, names = Object.keys(table), sum = {}, sq = {}, N = 0, base = {};
  names.forEach(function (n) { sum[n] = 0; sq[n] = 0; });
  var add = function (answers) {
    var u = FR.zero(), r;
    answers.forEach(function (ai, qi) { if (ai === null) { return; } var w = qs[qi].a[ai].w; Object.keys(w).forEach(function (k) { u[k] += w[k]; }); });
    r = FR.raw(u, table); N++;
    names.forEach(function (n) { sum[n] += r[n]; sq[n] += r[n] * r[n]; });
  };
  if (only && only.length) {
    var key = only.slice().sort(function (a, b) { return a - b; }).join(',');
    if (table._baseOnly && table._baseOnly[key]) { return table._baseOnly[key]; }
    /* few enough combinations to try every one of them: exact, and the same on every device */
    var asked = only.filter(function (qi) { return !!qs[qi]; }), pick = qs.map(function () { return null; });
    (function each(i) {
      if (i === asked.length) { add(pick); return; }
      for (var a = 0; a < qs[asked[i]].a.length; a++) { pick[asked[i]] = a; each(i + 1); }
    })(0);
    names.forEach(function (n) { var m = sum[n] / N; base[n] = { mean: m, sd: Math.sqrt(Math.max(1e-6, sq[n] / N - m * m)) }; });
    if (!table._baseOnly) { Object.defineProperty(table, '_baseOnly', { value: {}, enumerable: false }); }
    table._baseOnly[key] = base;
    return base;
  }
  if (table._base) { return table._base; }
  var seed = 20240611, rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }, i;
  for (i = 0; i < 3000; i++) { add(qs.map(function (q) { return Math.floor(rnd() * q.a.length); })); }
  names.forEach(function (n) { var m = sum[n] / N; base[n] = { mean: m, sd: Math.sqrt(Math.max(1e-6, sq[n] / N - m * m)) }; });
  Object.defineProperty(table, '_base', { value: base, enumerable: false });
  return base;
};
FR.phi = function (z) {                  // normal CDF, Abramowitz-Stegun
  var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};
/* `only`: pass the pack's quiz.quick when the player answered just those questions. */
FR.rank = function (u, table, only) {
  var raw = FR.raw(u, table), base = FR.baseline(table, only);
  return Object.keys(table).map(function (name) {
    var z = (raw[name] - base[name].mean) / base[name].sd;
    return { name: name, score: z, raw: raw[name], pct: Math.max(1, Math.min(99, Math.round(100 * FR.phi(z)))) };
  }).sort(function (x, y) { return y.score - x.score; });
};

FR.mod = function (score) { return Math.floor((score - 10) / 2); };
FR.fmt = function (m) { return (m >= 0 ? '+' : '−') + Math.abs(m); };

/* Ability scores: the standard array, handed out by blending what the class
   needs with what the answers showed, then racial bonuses on top. */
FR.abilities = function (u, clsName, raceName) {
  var cls = FR.CLASSES[clsName], race = FR.RACES[raceName];
  var aff = [u.might, u.guile, 0.5 * u.might + 0.5 * u.wild, u.lore, 0.6 * u.faith + 0.4 * u.wild, u.charm];
  var mx = Math.max.apply(null, aff.concat([0.001]));
  var blend = aff.map(function (a, i) { return { i: i, s: 0.65 * cls.prio[i] + 0.35 * Math.max(0, a) / mx }; });
  blend.sort(function (x, y) { return y.s - x.s || x.i - y.i; });
  var arr = [15, 14, 13, 12, 10, 8], scores = [0, 0, 0, 0, 0, 0];
  blend.forEach(function (b, r) { scores[b.i] = arr[r]; });
  var out = {};
  FR.ABILITIES.forEach(function (k, i) { out[k] = scores[i] + (race.bonus[k] || 0); });
  if (race.flex) {                        // +1 to the two best scores other than Charisma
    FR.ABILITIES.filter(function (k) { return k !== 'CHA'; }).sort(function (a, b) { return out[b] - out[a]; }).slice(0, race.flex).forEach(function (k) { out[k] += 1; });
  }
  return out;
};

FR.armor = function (kind, s) {
  var dex = FR.mod(s.DEX), con = FR.mod(s.CON), wis = FR.mod(s.WIS);
  var a = FR.armorBase(kind, dex, con, wis), notes = FR.theme && FR.theme.armorNotes;
  if (notes && notes[kind]) { a.note = notes[kind]; }
  return a;
};
FR.armorBase = function (kind, dex, con, wis) {
  switch (kind) {
    case 'unarmored': return { ac: 10 + dex + con, note: 'unarmored defense' };
    case 'monk': return { ac: 10 + dex + wis, note: 'unarmored defense' };
    case 'leather': return { ac: 11 + dex, note: 'leather armor' };
    case 'leather+shield': return { ac: 13 + dex, note: 'leather armor, shield' };
    case 'scale': return { ac: 14 + Math.min(2, dex), note: 'scale mail' };
    case 'scale+shield': return { ac: 16 + Math.min(2, dex), note: 'scale mail, shield' };
    case 'chain+shield': return { ac: 18, note: 'chain mail, shield' };
    default: return { ac: 10 + dex, note: 'no armor' };
  }
};

/* Everything the play screen needs, derived from class + race + answers: the open-5e sheet.
   (FR.build, further down, makes the sheet of whichever rules the cartridge in play uses.) */
FR.build5e = function (u, clsName, raceName, answered) {
  var cls = FR.CLASSES[clsName], race = FR.RACES[raceName];
  var s = FR.abilities(u, clsName, raceName), mods = {};
  FR.ABILITIES.forEach(function (k) { mods[k] = FR.mod(s[k]); });
  var prof = 2, arm = FR.armor(cls.armor, s);
  var skills = {};
  Object.keys(FR.SKILLS).forEach(function (k) {
    var p = cls.skills.indexOf(k) >= 0;
    skills[k] = { mod: mods[FR.SKILLS[k]] + (p ? prof : 0), prof: p, ab: FR.SKILLS[k] };
  });
  return {
    cls: clsName, race: raceName, level: 1, scores: s, mods: mods, prof: prof,
    hp: cls.hd + mods.CON + (race.tough ? 1 : 0), ac: arm.ac, armor: arm.note, speed: race.speed, init: mods.DEX,
    skills: skills, perk: race.perk, alignment: FR.alignment(u, answered), lucky: !!race.lucky,
    attacks: cls.attacks.map(function (a) {
      return { n: a.n, hint: a.hint, spell: !!a.spell, hit: prof + mods[a.ab], die: a.die, cnt: a.cnt, dmg: a.spell ? 0 : mods[a.ab], ab: a.ab };
    })
  };
};

FR.pick = function (arr, rnd) { return arr[Math.floor((rnd || Math.random)() * arr.length)]; };
FR.slug = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); };

/* body is one of the pack's look.options.body; 'Male' and 'Female' choose a name list, anything else draws from both */
FR.rollName = function (raceName, body) {
  var t = FR.NAMES[raceName] || FR.NAMES[Object.keys(FR.NAMES)[0]];
  var pool = body === 'Male' ? t.m : (body === 'Female' ? t.f : t.m.concat(t.f));
  return FR.pick(pool) + ' ' + FR.pick(t.s);
};

/* The answers a ready-made hero would have given: for each question, the one that leans furthest
   toward their class (and a little toward their race). Used for premades that list no answers.
   `t` is the pack to read; the one in play when left out. */
FR.answersFor = function (clsName, raceName, t) {
  var qs = t ? t.questions : FR.QUESTIONS, cls = (t ? t.classes : FR.CLASSES)[clsName], race = (t ? t.races : FR.RACES)[raceName];
  if (!cls) { return qs.map(function () { return 0; }); }
  var c = FR.centre(cls.v), r = race && race.v ? FR.centre(race.v) : null;      // a people with no numbers (the light rules) has no say
  return qs.map(function (q) {
    var best = 0, top = -Infinity;
    q.a.forEach(function (a, ai) {
      var cw = FR.centre(FR.TRAITS.map(function (k) { return a.w[k] || 0; })), s = FR.cosine(cw, c) + (r ? 0.35 * FR.cosine(cw, r) : 0);
      if (s > top) { top = s; best = ai; }
    });
    return best;
  });
};

/* ---------- rules profiles ----------
   A cartridge says which rules it plays by (rules: 'open-5e' or 'light'). Everything else asks the
   profile rather than assuming one set of rules: the registry when it puts a cartridge together, the
   screens when they draw a sheet or set up a roll, the tools when they check a cartridge.
   FR.profile(theme) is a cartridge's profile (that of the cartridge in play when none is named).

   What every profile answers:
     id          its name, as a cartridge writes it
     jargon      does "Show rules details" open the rule book (dice names, skill names, the full sheet)?
                 When false, the switch only adds each bonus as a number ("+5") and nothing else.
     two         may a roll be made with two dice, keeping the better or the worse?
     people      how a hero's people (race) is chosen: 'quiz' (ranked from the answers, as the class is)
                 or 'class' (the one in the class's sample picture, which the player may then change)
     tabs        the tabs of the play screen, from 'do', 'checks' and 'fight'
     prepare(t)                 a cartridge is being put together: fill in what these rules work out from
                                what its author wrote. Nothing for open-5e, where the author wrote it all.
     rank(u, t, only)           { classes, races }: both tables ranked for a player's answers (FR.rank's rows;
                                a row's pct is null where there is no score to show)
     raceFor(cls, races, t)     the people a hero of that class starts as
     build(u, cls, race, n)     the sheet, from the cast in play
     bonus(sheet, key)          { mod, good, known } for a skill by name: the number added to the die, whether
                                the hero is 'strong' or 'fair' at it ('' otherwise), and whether the sheet
                                knows it at all
     healthMax(sheet)           health is kept as a whole number from 0 to this (FR.play.health turns it into
                                fine, hurt or in trouble)
     healthSteps                may that number be stepped by hand, with rules details on?
     armor(sheet)               { ac, note }, or null where the rules have no armor
     lucky(sheet)               may a rolled 1 be rolled again?
     say(t, key)                a line these rules say in place of the cartridge's own, or '' to leave the cartridge's:
                                'detailsNote' (what the "Show rules details" switch does) and 'matchNote' (the line under
                                the choices when a hero is revealed)
     rows(tab, sheet, o)        what a tab of the play screen lists: { rows: [{ label, hint, mod, dot, mark, cls, ctx }], say }.
                                `mod` is the bonus as text and `dot` marks a strong suit (both shown with rules
                                details on); `mark` is the plain-words badge shown with them off; `ctx` is what
                                the tray rolls; `say` is the line under the fight tab's rows: [bold start, the rest]
     request(q, sheet, why)     what the tray rolls when the DM asks for a roll
     sheet(sheet, o)            what the sheet shows: { line, vitals: [[k, v]], abilities: [[k, score, mod]] or null,
                                showAbilities, rows: [[k, v]] }
   `o` is what only the screens know: { theme, details ("Show rules details" is on), tx(key, vars) (the cartridge's
   copy), why(skill) (the reason for a bonus, in the cartridge's words), init (the turn roll, or null),
   health { now, word }, align (may the line under the name be shown) }. */
(function () {
  'use strict';
  var plain = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  var own = function (o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); };
  var cap = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  var spaced = function (m) { return FR.fmt(m).replace(/^([+−])/, '$1 '); };            // a bonus as part of a sum: "+ 4"
  /* what a row of the play screen rolls. title/label: its plain name; note: the rules line; plain: the line shown
     instead when details are off; why: the reason for the bonus */
  var check = function (title, note, mod, kind, extra) {
    var c = { title: title, label: title, note: note, plain: '', sides: 20, count: 1, mod: mod, kind: kind || 'check', why: '' };
    if (extra) { Object.keys(extra).forEach(function (k) { c[k] = extra[k]; }); }
    return c;
  };
  /* the special rolls only this story has (a table of results, one for each face): the same under any rules.
     `dice` says whether the row names its die with rules details on */
  var extras = function (t, add, dice) {
    (t.extras || []).forEach(function (x) {
      add(x.label, x.hint, dice ? 'd' + x.sides : '', { title: x.title, label: x.label, note: x.note, plain: x.hint, sides: x.sides, count: 1, mod: 0, kind: 'table', table: x.table }, '', 'extra');
    });
  };

  /* Armor in three plain bands, by the number an attack has to reach to hit: 'light' up to 12, 'well' up to
     15, 'heavy' above that. The screens put the cartridge's words to them. */
  FR.armorBand = function (ac) { return !(ac > 12) ? 'light' : (ac > 15 ? 'heavy' : 'well'); };

  FR.PROFILES = {};

  /* ----- open-5e: today's rules. Ability scores, hit points, armor, attack and damage dice, all hidden under
     plain words until "Show rules details" is switched on. The maths is the first half of this file. ----- */
  FR.PROFILES['open-5e'] = {
    id: 'open-5e', jargon: true, two: true, people: 'quiz', tabs: ['do', 'checks', 'fight'], healthSteps: true,
    prepare: function () { /* the author wrote every number: there is nothing to work out */ },
    rank: function (u, t, only) { return { classes: FR.rank(u, t.classes, only), races: FR.rank(u, t.races, only) }; },
    raceFor: function (cls, races) { return races[0].name; },
    build: FR.build5e,
    bonus: function (sheet, key) {
      var skill = sheet && own(sheet.skills, key) ? sheet.skills[key] : null;
      if (skill) { return { mod: skill.mod, good: skill.prof ? 'strong' : '', known: true }; }
      if (sheet && own(sheet.mods, key)) { return { mod: sheet.mods[key], good: '', known: true }; }      // an ability, such as STR, works too
      return { mod: 0, good: '', known: false };
    },
    healthMax: function (sheet) { return sheet.hp; },
    armor: function (sheet) { return { ac: sheet.ac, note: sheet.armor }; },
    lucky: function (sheet) { return !!(sheet && sheet.lucky); },
    say: function () { return ''; },
    rows: function (tab, sh, o) {
      var d = !!o.details, tx = o.tx, why = o.why, t = o.theme, out = { rows: [], say: null };
      /* `good` is 'strong' where the hero is trained: a gold dot with rules details on, "Good at this" with them off */
      var add = function (label, hint, modText, ctx, good, cls) { out.rows.push({ label: label, hint: hint, mod: modText, dot: !!good, mark: good ? tx('goodAt') : '', cls: cls || '', ctx: ctx }); };
      var roll = function (title, what, mod, kind, extra) { return check(title, what + ' · d20 ' + spaced(mod), mod, kind, extra); };
      var skillRow = function (label, skill, hintPlain, hintDetail) {
        var sk = sh.skills[skill];
        add(label, d ? hintDetail : hintPlain, FR.fmt(sk.mod), roll(label, skill, sk.mod, 'check', { plain: hintPlain, why: why(skill) }), sk.prof ? 'strong' : '');
      };
      if (tab === 'do') {
        (t.actions || []).forEach(function (a) { skillRow(a.label, a.skill, a.hint, a.skill + ' · ' + a.hint); });
        extras(t, add, true);
      } else if (tab === 'checks') {
        var hints = tx('checkHints');
        FR.ABILITIES.forEach(function (k) {
          add(FR.ABILITY_NAMES[k], hints[k], FR.fmt(sh.mods[k]), roll(FR.ABILITY_NAMES[k], 'Ability check', sh.mods[k], 'check', { plain: hints[k], why: why(k) }), !d && sh.mods[k] >= 2 ? 'strong' : '');
        });
      } else {
        var turnName = d ? tx('initLabel') : tx('initPlain');
        add(turnName, o.init === null || o.init === undefined ? tx('initHint') : tx('initDone', { n: o.init }), FR.fmt(sh.init), roll(d ? 'Initiative' : turnName, 'Turn order', sh.init, 'init', { plain: tx('initHint'), why: tx('whyInit') }), '', 'first');
        sh.attacks.forEach(function (a) {
          var dmg = a.cnt + 'd' + a.die + (a.dmg ? ' ' + spaced(a.dmg) : '');
          add(a.n, d ? a.hint + ' · ' + dmg + ' ' + tx('damage') : a.hint, FR.fmt(a.hit),
            roll(a.n, a.spell ? 'Magic attack' : 'Attack roll', a.hit, 'attack', { plain: a.hint, why: a.spell ? tx('whySpell') : tx('whyAttack'), dmg: { sides: a.die, count: a.cnt, mod: a.dmg } }));
        });
        skillRow(tx('shove'), 'Athletics', cap(tx('shoveHint')), 'Athletics · ' + tx('shoveHint'));
        skillRow(tx('hide'), 'Stealth', cap(tx('hideHint')), 'Stealth · ' + tx('hideHint'));
        out.say = [tx('noRollB'), tx('noRoll')];
      }
      return out;
    },
    /* One twenty-sided die. The skill decides the bonus exactly as the rows on the play screen do (an ability, such
       as STR, works too); with no skill, or one this hero's sheet does not know, it is a plain twenty-sided roll. */
    request: function (q, sheet, why) {
      var sk = (q && q.skill) || '', b = this.bonus(sheet, sk);
      return { title: q.label || '', label: q.label || '', note: (b.known ? sk + ' · ' : '') + 'd20' + (b.known ? ' ' + spaced(b.mod) : ''), plain: q.why || '',
        sides: 20, count: 1, mod: b.mod, kind: 'check', why: b.known && why ? why(sk) || '' : '', skill: b.known ? sk : '', request: q.n };
    },
    /* The sheet in plain words, unless "Show rules details" is on: then it is the full one, numbers and all. */
    sheet: function (sh, o) {
      var d = !!o.details, tx = o.tx, t = o.theme, cls = t.classes[sh.cls], h = o.health, out = { line: '', vitals: [], abilities: [], showAbilities: d, rows: [] };
      out.line = (d ? 'Level 1 ' : '') + sh.race + ' ' + sh.cls + (sh.alignment && o.align ? ' · ' + sh.alignment : '');
      if (d) {
        out.vitals.push(['Armor Class', sh.ac + ' (' + sh.armor + ')']);
        out.vitals.push(['Hit Points', (h.now < sh.hp ? tx('healthOf', { now: h.now, max: sh.hp }) : sh.hp) + ' (1d' + cls.hd + ' ' + spaced(sh.mods.CON) + ')']);
        out.vitals.push(['Speed', sh.speed + ' feet']);
      } else {
        out.vitals.push([tx('health'), h.word]);
        /* armor as a phrase, for everyone who has not asked for the numbers: lightly, well or heavily protected */
        out.vitals.push([tx('armor'), { light: tx('armorLight'), well: tx('armorWell'), heavy: tx('armorHeavy') }[FR.armorBand(sh.ac)] + (sh.armor ? ' (' + sh.armor + ')' : '')]);
      }
      FR.ABILITIES.forEach(function (k) { out.abilities.push([k, String(sh.scores[k]), '(' + FR.fmt(sh.mods[k]) + ')']); });
      if (d) {
        out.rows.push([tx('skills'), cls.skills.map(function (k) { return k + ' ' + FR.fmt(sh.skills[k].mod); }).join(', ')]);
        out.rows.push([tx('attacks'), sh.attacks.map(function (a) { return a.n + ' ' + FR.fmt(a.hit) + ' (' + a.cnt + 'd' + a.die + (a.dmg ? ' ' + spaced(a.dmg) : '') + ')'; }).join(', ')]);
      } else {
        var good = (t.actions || []).filter(function (a) { return sh.skills[a.skill] && sh.skills[a.skill].prof; }).map(function (a) { return a.label; });
        if (good.length) { out.rows.push([tx('goodAtHead'), good.join(', ')]); }
        out.rows.push([tx('fightsWith'), sh.attacks.map(function (a) { return a.n; }).join(', ')]);
      }
      out.rows.push([tx('trait'), sh.perk]);
      return out;
    }
  };

  /* ----- light: one twenty-sided die plus a bonus, against a target. Nothing else. -----
     A hero is strong at a few things, fair at a few more and plain at the rest. There are no ability scores,
     no hit points, no armor number and no damage dice: health is three states, and a fight is the same roll
     against the foe's target, where a hit moves the foe one state (the DM's side keeps track of those).

     The numbers. The DM's three targets are 10 (easy), 13 (medium) and 16 (hard), the same under either rules,
     so an adventure is written once. With a bonus b, a twenty-sided die reaches 13 on (8 + b) faces of 20:
       plain   +0   8 in 20, 40%: four times in ten, as asked
       fair    +2  10 in 20, 50%: an even chance, which is easy to say out loud
       strong  +5  13 in 20, 65%: the whole number nearest to two times in three (+6 would be 70%)
     That leaves a strong hero an even chance at a hard task (16) and four in five at an easy one (10), and a
     plain one better than even at an easy one (55%). +5 is also about what a trained hero adds under open-5e,
     so the same targets feel the same whichever rules a cartridge chose. */
  var LIGHT = {
    bonus: { strong: 5, fair: 2, plain: 0 },
    states: ['fine', 'hurt', 'trouble'],
    /* how a class's lean on the eight traits is added up from what its author wrote: each strong skill counts
       whole, each fair one half, and the trait its role stands for half as well */
    weigh: { strong: 1, fair: 0.5, role: 0.5 },
    /* the colour a class's dice are cast in when it names none, by the trait it leans on most */
    dice: { might: '#8c2f1b', guile: '#3f4f7a', lore: '#3a5f8a', faith: '#c79a2c', charm: '#b0457a', wild: '#4d7a3a' },
    /* the lines only these rules say, kept in the cartridge (light.text, with the base's behind them) */
    words: ['fairAt', 'fairAtHead', 'hitSay', 'hitNat20', 'fightHowB', 'fightHow', 'detailsNote', 'matchNote'],
    /* how many skills a class may be strong and fair at, so that no hero is good at everything */
    most: { strong: 4, fair: 6 }
  };
  FR.LIGHT = LIGHT;

  /* What each skill says about a hero, on the eight traits the questions push:
     [might, guile, lore, faith, charm, wild, order (minus is chaos), light (minus is shadow)].
     It follows what the rules already know (a skill's ability in FR.SKILLS, and the trait FR.abilities reads
     each ability from: strength from might, dexterity from guile, intelligence from lore, wisdom from faith
     and wild, charisma from charm), told apart skill by skill so that two classes with different skills never
     look alike. This is how the light rules match a player to a class with no numbers from the author. */
  FR.SKILL_TRAITS = {
    Athletics: [1, 0, 0, 0, 0, 0.1, 0, 0],
    Acrobatics: [0.4, 0.7, 0, 0, 0, 0, 0.2, 0],
    'Sleight of Hand': [0, 1, 0, 0, 0.1, 0, -0.5, -0.4],
    Stealth: [0, 1, 0, 0, 0, 0.2, -0.3, -0.2],
    Arcana: [0, 0, 1, 0, 0.1, 0, -0.1, -0.2],
    History: [0, 0, 1, 0.1, 0, 0, 0.5, 0],
    Investigation: [0, 0.3, 0.8, 0, 0, 0, 0.3, 0],
    Nature: [0, 0, 0.4, 0.1, 0, 0.8, -0.1, 0.2],
    Religion: [0, 0, 0.4, 0.8, 0, 0, 0.5, 0.4],
    'Animal Handling': [0, 0, 0, 0.3, 0, 0.9, 0, 0.3],
    Insight: [0, 0, 0.1, 0.6, 0.4, 0, 0.2, 0.3],
    Medicine: [0, 0, 0.3, 0.9, 0, 0, 0.3, 0.6],
    Perception: [0, 0.3, 0, 0, 0, 0.7, 0, 0],
    Survival: [0.2, 0, 0, 0, 0, 1, -0.3, 0],
    Deception: [0, 0.5, 0, 0, 0.6, 0, -0.5, -0.6],
    Intimidation: [0.4, 0, 0, 0, 0.6, 0, -0.1, -0.5],
    Performance: [0, 0.1, 0, 0, 1, 0, -0.4, 0.1],
    Persuasion: [0, 0, 0, 0.1, 1, 0, 0.1, 0.2]
  };
  /* the skills in a list that the rules know, each once */
  var skillsIn = function (list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (sk) { if (own(FR.SKILLS, sk) && out.indexOf(sk) < 0) { out.push(sk); } });
    return out;
  };
  /* A light class's lean on the eight traits, from its role and its strong and fair skills: FR.rank reads it as `v`. */
  FR.lightLean = function (cls, role) {
    var v = [0, 0, 0, 0, 0, 0, 0, 0], strong = skillsIn(cls.strong);
    var put = function (list, w) { list.forEach(function (sk) { FR.SKILL_TRAITS[sk].forEach(function (x, i) { v[i] += w * x; }); }); };
    put(strong, LIGHT.weigh.strong);
    put(skillsIn(cls.fair).filter(function (sk) { return strong.indexOf(sk) < 0; }), LIGHT.weigh.fair);
    if (plain(role) && FR.STRENGTHS.indexOf(role.trait) >= 0) { v[FR.TRAITS.indexOf(role.trait)] += LIGHT.weigh.role; }
    return v.map(function (x) { return Math.round(x * 1000) / 1000; });
  };
  var lightText = function (t, key) { var w = t && t.light && t.light.text; return w && typeof w[key] === 'string' ? w[key] : ''; };

  FR.PROFILES.light = {
    id: 'light', jargon: false, two: false, people: 'class', tabs: ['do', 'fight'], healthSteps: false,
    /* The author wrote, for each class, its role and the skills it is strong and fair at. From those: the
       lean the quiz matches against (v), the list the DM's "Good at" reads (skills: the strong ones), and a
       colour for its dice if it named none. */
    prepare: function (t) {
      Object.keys(t.classes).forEach(function (name) {
        var c = t.classes[name], role, top = '', best = -Infinity;
        if (!plain(c)) { return; }
        c.strong = skillsIn(c.strong);
        c.fair = skillsIn(c.fair).filter(function (sk) { return c.strong.indexOf(sk) < 0; });
        c.skills = c.strong.slice();
        role = plain(t.roles) && typeof c.role === 'string' ? t.roles[c.role] : null;
        c.v = FR.lightLean(c, role);
        if (typeof c.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.color)) {
          FR.STRENGTHS.forEach(function (tr, i) { if (c.v[i] > best) { best = c.v[i]; top = tr; } });
          c.color = LIGHT.dice[top];
        }
      });
    },
    /* The class is ranked from the answers, as ever. A people is flavour here and has no numbers, so it is not
       ranked: every one is listed as the cartridge wrote it, with no score to show. */
    rank: function (u, t, only) {
      return { classes: FR.rank(u, t.classes, only), races: Object.keys(t.races).map(function (name) { return { name: name, score: 0, raw: 0, pct: null }; }) };
    },
    /* A hero starts as the people in their class's sample picture (cast.samples), so the hero and the picture
       they are handed agree. The player may change it with one tap. */
    raceFor: function (cls, races, t) {
      var want = t.samples ? t.samples[cls] : '';
      return want && own(t.races, want) ? want : (races[0] ? races[0].name : Object.keys(t.races)[0]);
    },
    build: function (u, clsName, raceName, answered) {
      var cls = FR.CLASSES[clsName] || {}, race = FR.RACES[raceName] || {}, strong = skillsIn(cls.strong), fair = skillsIn(cls.fair), skills = {};
      Object.keys(FR.SKILLS).forEach(function (k) {
        var tier = strong.indexOf(k) >= 0 ? 'strong' : (fair.indexOf(k) >= 0 ? 'fair' : 'plain');
        skills[k] = { mod: LIGHT.bonus[tier], prof: tier === 'strong', tier: tier };
      });
      return { cls: clsName, race: raceName, rules: 'light', skills: skills, states: LIGHT.states.slice(),
        perk: typeof race.perk === 'string' ? race.perk : '', alignment: FR.alignment(u, answered), lucky: false };
    },
    bonus: function (sheet, key) {
      var sk = sheet && own(sheet.skills, key) ? sheet.skills[key] : null;
      return sk ? { mod: sk.mod, good: sk.tier === 'plain' ? '' : sk.tier, known: true } : { mod: 0, good: '', known: false };
    },
    /* three states and no hit points: kept as 2 (fine), 1 (hurt) or 0 (in trouble) */
    healthMax: function () { return LIGHT.states.length - 1; },
    armor: function () { return null; },
    lucky: function () { return false; },
    say: function (t, key) { return LIGHT.words.indexOf(key) >= 0 ? lightText(t, key) : ''; },
    rows: function (tab, sh, o) {
      var tx = o.tx, why = o.why, t = o.theme, self = this, out = { rows: [], say: null };
      var add = function (label, hint, modText, ctx, good, cls) {
        out.rows.push({ label: label, hint: hint, mod: modText, dot: good === 'strong', mark: good === 'strong' ? tx('goodAt') : (good === 'fair' ? lightText(t, 'fairAt') : ''), cls: cls || '', ctx: ctx });
      };
      if (tab === 'do') {
        (t.actions || []).forEach(function (a) {
          var b = self.bonus(sh, a.skill);
          add(a.label, a.hint, FR.fmt(b.mod), check(a.label, '', b.mod, 'check', { plain: a.hint, why: why(a.skill) }), b.good);
        });
        extras(t, add, false);
      } else if (tab === 'fight') {
        /* who goes first is a plain roll: nobody is quicker by the rules */
        add(tx('initPlain'), o.init === null || o.init === undefined ? tx('initHint') : tx('initDone', { n: o.init }), FR.fmt(0), check(tx('initPlain'), '', 0, 'init', { plain: tx('initHint') }), '', 'first');
        /* a way to fight is a roll like any other: the skill it comes down to decides the bonus. Whether it lands
           is the DM's call (the foe's target is theirs to know), and so is moving the foe one state. */
        ((t.light && t.light.fight) || []).forEach(function (m) {
          var skill = m.skills[0], b = self.bonus(sh, skill);
          m.skills.forEach(function (sk) { var x = self.bonus(sh, sk); if (x.mod > b.mod) { b = x; skill = sk; } });      // a way to fight that names several skills is rolled with the hero's best
          add(m.label, m.hint, FR.fmt(b.mod), check(m.label, '', b.mod, 'attack', { plain: m.hint, why: why(skill), skill: skill, says: { done: lightText(t, 'hitSay'), nat20: lightText(t, 'hitNat20') } }), b.good);
        });
        out.say = [lightText(t, 'fightHowB'), lightText(t, 'fightHow')];
      }
      return out;
    },
    /* One twenty-sided die, plus the hero's bonus for the skill the DM named: +5 strong, +2 fair, nothing otherwise
       (or when no skill is named, or it is not one the rules know). */
    request: function (q, sheet, why) {
      var sk = (q && q.skill) || '', b = this.bonus(sheet, sk);
      return { title: q.label || '', label: q.label || '', note: '', plain: q.why || '', sides: 20, count: 1, mod: b.mod, kind: 'check',
        why: b.known && why ? why(sk) || '' : '', skill: b.known ? sk : '', request: q.n };
    },
    /* The sheet: health as a word, what the hero is good at and fair at, and their people's line. With "Show
       rules details" on, each thing gains its bonus ("Sneak +5") and nothing else changes. */
    sheet: function (sh, o) {
      var d = !!o.details, tx = o.tx, t = o.theme, out = { line: '', vitals: [], abilities: null, showAbilities: false, rows: [] };
      var named = function (tier) {
        var seen = {}, list = [];
        (t.actions || []).forEach(function (a) { if (sh.skills[a.skill] && sh.skills[a.skill].tier === tier) { seen[a.skill] = true; list.push(a.label + (d ? ' ' + FR.fmt(sh.skills[a.skill].mod) : '')); } });
        /* a skill with no line of its own on the "I want to…" list goes by its name */
        Object.keys(sh.skills).forEach(function (k) { if (sh.skills[k].tier === tier && !seen[k]) { list.push(k + (d ? ' ' + FR.fmt(sh.skills[k].mod) : '')); } });
        return list.join(', ');
      };
      out.line = sh.race + ' ' + sh.cls + (sh.alignment && o.align ? ' · ' + sh.alignment : '');
      out.vitals.push([tx('health'), o.health.word]);
      if (named('strong')) { out.rows.push([tx('goodAtHead'), named('strong')]); }
      if (named('fair')) { out.rows.push([lightText(t, 'fairAtHead'), named('fair')]); }
      if (sh.perk) { out.rows.push([tx('trait'), sh.perk]); }
      return out;
    }
  };

  /* The profile a cartridge plays by: of the theme given, or of the one in play. One that names no rules,
     or rules nobody has heard of, plays by the first (open-5e). */
  FR.profile = function (t) {
    var id = (t || FR.theme || {}).rules;
    return own(FR.PROFILES, id) ? FR.PROFILES[id] : FR.PROFILES[Object.keys(FR.PROFILES)[0]];
  };
  /* Everything the play screen needs, derived from class + race + answers, by the rules of the cartridge in play. */
  FR.build = function (u, clsName, raceName, answered) { return FR.profile().build(u, clsName, raceName, answered); };
})();

if (typeof module !== 'undefined') { module.exports = FR; }
