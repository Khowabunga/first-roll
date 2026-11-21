/* First Roll: the rules engine. The matching maths and the character sheet: pure functions,
   no DOM, and no words or pictures of its own. Everything a player reads comes from a scenario
   pack (see src/registry.js and scenarios/); FR.useTheme points the tables below at one. */
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

/* Everything the play screen needs, derived from class + race + answers. */
FR.build = function (u, clsName, raceName, answered) {
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
  var c = FR.centre(cls.v), r = race ? FR.centre(race.v) : null;
  return qs.map(function (q) {
    var best = 0, top = -Infinity;
    q.a.forEach(function (a, ai) {
      var cw = FR.centre(FR.TRAITS.map(function (k) { return a.w[k] || 0; })), s = FR.cosine(cw, c) + (r ? 0.35 * FR.cosine(cw, r) : 0);
      if (s > top) { top = s; best = ai; }
    });
    return best;
  });
};

if (typeof module !== 'undefined') { module.exports = FR; }
