/* What the tools know about scenario packs on disk: finding them, reading them and checking them.
   Shared by build.js, scripts/validate.js, scripts/new-cartridge.js and the unit tests, so there is
   one definition of "a valid pack". The contract itself is described in README.md. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
/* FR_ROOT points the tools at another copy of the project (the unit tests build one in a temporary folder) */
const ROOT = process.env.FR_ROOT ? path.resolve(process.env.FR_ROOT) : path.join(__dirname, '..', '..');

/* how evenly a quiz must spread players over a cast, as a share of an even split (1 = everyone equally likely) */
const REACH = { full: { min: 0.4, max: 2.2 }, quick: { min: 0.3, max: 2.5 }, samples: 20000, seed: 20261120 };
/* size budgets: over these is a warning, not a failure */
const BUDGET = { image: 400 * 1024, audio: 2600 * 1024, pack: 20 * 1024 * 1024 };
const KINDS = ['one-shot', 'campaign'], ACCESS = ['free', 'paid'], VISIBILITY = ['public', 'unlisted', 'draft'];
const TOP_KEYS = ['schema', 'id', 'version', 'extends', 'meta', 'adventure', 'tokens', 'art', 'quiz', 'cast', 'look', 'roster', 'actions', 'extras', 'intent', 'ties', 'kit', 'sound', 'rules', 'light',
  'story', 'music', 'particles', 'dice', 'sfx', 'fx', 'prose', 'ai', 'text'];
/* a cartridge's label (meta.label): what a cartridge card says. Sizes are what a card has room for. */
const LABEL = { words: { length: 'About 2 hours', players: '3 to 6 players', tone: 'Silly and warm', dm: 'Good for a first-time DM' }, max: 40, ratings: ['everyone', 'teen', 'mature'], flags: 6, flag: 30 };
/* what a class is good at (cast.classes[Name].strengths): three plain sentences, each short enough to sit under a name in the lobby */
const STRENGTHS = { count: 3, max: 80 };
const CREDITS = ['music', 'art', 'writing', 'rules'];
/* Cartridge spec v3 (docs/PHASE2.md, section 2): roles, ties, the kit and soundscapes. The sizes are the ones the
   table on the server keeps to, so that whatever a phone sends from this data arrives whole: a bond's question
   with a hero's name in it must fit a bond's prompt (160: a name can be 40), a hook its text (240) and its id
   (40), an item's id the card a "Use" sends (40). The rest is what a card on a phone has room for. */
const ROLES = { min: 2, max: 8, name: 24, blurb: 80, does: 160 };
const TIES = { bonds: 20, bond: 120, hooks: 20, hook: 240, voices: 12, voice: 24, tip: 120 };
const KIT = { items: 40, name: 40, text: 160, uses: ['once', 'always'], each: 4, token: 24, tokenText: 160 };
const BEDS = { max: 24, label: 40 };
/* The rules profiles (docs/PHASE2.md, section 6). A cartridge on the light rules writes far less for a class and a
   people; these are the fields only the open-5e rules read, so that a light cartridge still carrying them can be
   told (a warning: they do no harm), and the sizes of a way to fight on the fight tab. */
const ONLY_5E = { cls: ['v', 'hd', 'prio', 'armor', 'skills', 'attacks'], race: ['v', 'bonus', 'speed', 'tough', 'lucky', 'flex'] };
const ONLY_LIGHT = { cls: ['strong', 'fair'] };
const FIGHT = { max: 8, label: 40, hint: 80 };
const WORD = /^(?=.{1,40}$)[a-z0-9][a-z0-9_-]*$/;      // an id written inside a cartridge: a short word in lower case
const ID = /^(?=.{2,40}$)[a-z][a-z0-9]*(-[a-z0-9]+)*$/, COLOR = /^#[0-9a-f]{6}$/i, FILE = /^(img|audio)\/[\w.\/-]+$/;
const LOOK_KEYS = ['body', 'age', 'build', 'hair', 'mark', 'bearing'], DICE = [4, 6, 8, 10, 12, 20];

const read = (f) => fs.readFileSync(f, 'utf8');
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '';
const num = (v) => typeof v === 'number' && isFinite(v);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';

/* A fresh copy of the engine's rules and registry, with the base pack in it and no others. The three
   files are run as one script, the way the page runs them, so nothing leaks between two checks. */
function engine(root) {
  const src = ['src/rules.js', 'src/registry.js', 'src/base.js'].map((f) => read(path.join(root || ROOT, f))).join('\n');
  return new Function(src + '\nreturn FR;')();
}

/* the packs in a folder: every cartridges/<name>/cartridge.js. Names starting with _ or . are left alone. */
function list(root) {
  const dir = path.join(root || ROOT, 'cartridges');
  if (!fs.existsSync(dir)) { return []; }
  return fs.readdirSync(dir).sort().filter((n) => !/^[._]/.test(n) && fs.existsSync(path.join(dir, n, 'cartridge.js')))
    .map((n) => ({ id: n, dir: path.join(dir, n), file: path.join(dir, n, 'cartridge.js') }));
}
/* cartridges/packs.json: which pack opens first, and the order of the picker */
function site(root) {
  const f = path.join(root || ROOT, 'cartridges', 'packs.json');
  if (!fs.existsSync(f)) { return { default: '', order: [] }; }
  const j = JSON.parse(read(f));
  return { default: j.default || '', order: Array.isArray(j.order) ? j.order : [] };
}

/* Why a value is not plain data, or '' when it is. Packs must survive JSON.parse(JSON.stringify(def)) unchanged. */
function notData(v, at, seen) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') { return ''; }
  if (typeof v === 'number') { return isFinite(v) ? '' : at + ' is ' + v + ', which JSON cannot hold'; }
  if (typeof v === 'function') { return at + ' is a function; a pack is data only (use a template, see README)'; }
  if (typeof v === 'undefined') { return at + ' is undefined'; }
  if (typeof v !== 'object') { return at + ' is a ' + typeof v; }
  const proto = Object.prototype.toString.call(v);
  if (proto !== '[object Object]' && proto !== '[object Array]') { return at + ' is a ' + proto.slice(8, -1) + ', not plain data'; }
  seen = seen || [];
  if (seen.indexOf(v) >= 0) { return (at || 'the pack') + ' contains itself, which JSON cannot hold'; }
  seen.push(v);
  for (const k of Object.keys(v)) { const why = notData(v[k], at ? at + (Array.isArray(v) ? '[' + k + ']' : '.' + k) : k, seen); if (why) { return why; } }
  seen.pop();
  return '';
}

/* Run a pack file with a stand-in FR and hand back what it passed to FR.cartridge. */
function load(file) {
  const calls = [], out = { def: null, error: '' };
  try {
    vm.runInNewContext(read(file), { FR: { cartridge: (d) => { calls.push(d); return d; } } }, { filename: file, timeout: 2000 });
  } catch (e) { out.error = 'could not be read: ' + e.message; return out; }
  if (calls.length !== 1) { out.error = 'must call FR.cartridge({...}) exactly once (it called it ' + calls.length + ' times)'; return out; }
  if (!plain(calls[0])) { out.error = 'FR.cartridge was not given an object'; return out; }
  out.error = notData(calls[0], '');
  if (!out.error) { out.def = JSON.parse(JSON.stringify(calls[0])); }
  return out;
}
/* the same for cartridges/<id>/adventure.js, which calls FR.adventure('<id>', {...}) */
function loadAdventure(file) {
  const calls = [];
  try { vm.runInNewContext(read(file), { FR: { adventure: (id, d) => { calls.push({ id: id, def: d }); return d; } } }, { filename: file, timeout: 2000 }); }
  catch (e) { return { error: 'could not be read: ' + e.message }; }
  if (calls.length !== 1) { return { error: 'must call FR.adventure(id, {...}) exactly once' }; }
  return { id: calls[0].id, def: calls[0].def, error: '', notData: notData(calls[0].def, '') };
}

/* ---------- reach: can a player actually end up as each class and race? ---------- */
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function shares(FR, t, only, sets) {
  /* who a set of answers makes is for the cartridge's rules to say (FR.profile in src/rules.js): under open-5e the
     class and the people are both ranked from the answers; under the light rules the class is, and the people
     is the one in that class's sample picture */
  const tables = { classes: t.classes, races: t.races }, out = {}, rules = FR.profile(t);
  Object.keys(tables).forEach((kind) => { out[kind] = {}; Object.keys(tables[kind]).forEach((n) => { out[kind][n] = 0; }); });
  sets.forEach((answers) => {
    const u = FR.zero();
    answers.forEach((ai, qi) => { if (ai === null) { return; } const w = t.questions[qi].a[ai].w; Object.keys(w).forEach((k) => { u[k] += w[k]; }); });
    const r = rules.rank(u, t, only), cls = r.classes[0].name;
    out.classes[cls]++; out.races[rules.raceFor(cls, r.races, t)]++;
  });
  Object.keys(out).forEach((kind) => { Object.keys(out[kind]).forEach((n) => { out[kind][n] /= sets.length; }); });
  return out;
}
function spread(share) {            // lowest and highest share, each as a multiple of an even split
  const names = Object.keys(share), even = 1 / names.length;
  let lo = names[0], hi = names[0];
  names.forEach((n) => { if (share[n] < share[lo]) { lo = n; } if (share[n] > share[hi]) { hi = n; } });
  return { min: share[lo] / even, max: share[hi] / even, minName: lo, maxName: hi, minShare: share[lo], maxShare: share[hi], even: even };
}
/* every way of answering just these questions */
function combos(t, only) {
  const sets = [], pick = t.questions.map(() => null);
  (function each(i) {
    if (i === only.length) { sets.push(pick.slice()); return; }
    for (let a = 0; a < t.questions[only[i]].a.length; a++) { pick[only[i]] = a; each(i + 1); }
  })(0);
  return sets;
}
/* Full quiz: a seeded sample of random players. Quick quiz: every possible set of answers, exactly. */
function reach(FR, t, opts) {
  const o = opts || {}, rnd = lcg(REACH.seed), sets = [], n = o.samples || REACH.samples;
  for (let i = 0; i < n; i++) { sets.push(t.questions.map((q) => Math.floor(rnd() * q.a.length))); }
  const full = shares(FR, t, null, sets), res = { full: { classes: spread(full.classes), races: spread(full.races), share: full, samples: n } };
  const quick = t.quick || [];
  if (quick.length && quick.every((qi) => Number.isInteger(qi) && qi >= 0 && qi < t.questions.length)) {
    const all = combos(t, quick), q = shares(FR, t, quick, all);
    res.quick = { classes: spread(q.classes), races: spread(q.races), share: q, samples: all.length };
  }
  return res;
}
/* The best five questions for a short game: of every choice of `size` questions, the ones that leave the
   least likely class or race as likely as possible (then the most likely one as unlikely as possible). */
function bestQuick(FR, t, size, keep) {
  const n = t.questions.length, k = size || 5, found = [], both = FR.profile(t).people === 'quiz';      // where the answers do not choose the people, only the classes count
  (function choose(start, picked) {
    if (picked.length === k) {
      const q = shares(FR, t, picked, combos(t, picked)), c = spread(q.classes), r = spread(q.races);
      found.push({ quick: picked.slice(), min: both ? Math.min(c.min, r.min) : c.min, max: both ? Math.max(c.max, r.max) : c.max, classes: c, races: r });
      return;
    }
    for (let i = start; i <= n - (k - picked.length); i++) { choose(i + 1, picked.concat(i)); }
  })(0, []);
  found.sort((a, b) => b.min - a.min || a.max - b.max);
  return found.slice(0, keep || 5);
}

/* ---------- the scaffold's template ---------- */
/* What `npm run new-cartridge` starts from, for one set of rules ('light' unless told otherwise). Most of a new
   cartridge is the same whatever its rules: scripts/template/cartridge.js. The parts that are not (what a class
   and a people must say, and the `rules` line) are in scripts/template/rules.<rules>.js, and each goes where the
   template has a marker of its name. __ID__ and __NAME__ are still in what comes back, for the caller to fill. */
function template(rules) {
  const dir = path.join(__dirname, '..', 'template'), id = rules || 'light', file = path.join(dir, 'rules.' + id + '.js'), parts = {};
  if (!fs.existsSync(file)) { throw new Error('There is no template for the rules "' + id + '" (scripts/template/rules.' + id + '.js).'); }
  let name = '';
  read(file).split('\n').forEach((line) => { const m = /^\/\/=== (\w+) ===$/.exec(line); if (m) { name = m[1]; parts[name] = []; } else if (name) { parts[name].push(line); } });
  return read(path.join(dir, 'cartridge.js')).split('__RULESET__').join(id).replace(/^[ \t]*\/\*__([A-Z]+)__\*\/\n/gm, (whole, key) => {
    const part = parts[key.toLowerCase()];
    if (!part) { throw new Error('scripts/template/rules.' + id + '.js has no "' + key.toLowerCase() + '" part, which scripts/template/cartridge.js asks for.'); }
    return part.join('\n').replace(/\n+$/, '') + '\n';
  });
}

/* ---------- the words the screens ask a pack for ---------- */
/* Read from the engine's own source, so a screen that starts using a new piece of copy makes every
   pack answer for it: tx('key') in the scripts and data-t="key" in the page. */
function textKeys(root) {
  const dir = path.join(root || ROOT, 'src'), keys = new Set();
  fs.readdirSync(dir).filter((f) => /\.(js|html)$/.test(f)).forEach((f) => {
    const src = read(path.join(dir, f));
    let m; const a = /\btx\(\s*'([A-Za-z0-9_]+)'/g, b = /data-t="([A-Za-z0-9_]+)"/g;
    while ((m = a.exec(src))) { keys.add(m[1]); }
    while ((m = b.exec(src))) { keys.add(m[1]); }
  });
  return Array.from(keys).sort();
}
/* copy that is not a single line of text, and the blanks some lines must leave for the app to fill */
const TEXT_SHAPES = { tabs: 'three', work: 'list', checkHints: 'abilities' };
const TEXT_BLANKS = { painted: ['{s}'], sample: ['{race}', '{cls}'], failed: ['{e}'], initDone: ['{n}'] };

/* ---------- tokens ---------- */
/* what to tell an author whose token is the wrong kind of value (the kinds are in src/registry.js) */
const TOKEN_KINDS = {
  hex: 'must be a colour like "#0a1626"', px: 'must be a number of pixels, like 14', ms: 'must be a number of milliseconds, like 220', num: 'must be a number',
  em: 'must be a number of ems, like 0.06', alpha: 'must be a number from 0 to 1', weight: 'must be a font weight from 100 to 900',
  color: 'must be a colour: "#rrggbb", "rgba(8, 20, 40, 0.5)" or "var(--name)"', css: 'must be one CSS value in quotes (a gradient, a shadow), with no ; { } and no url()',
  ease: 'must be an easing like "cubic-bezier(0.16, 1, 0.3, 1)"', pos: 'must be a position like "center 46%"'
};
/* The pairs of colours that text and control edges are set in, and the least contrast each needs:
   [foreground token, its property, background token, its property, least ratio, what it is]. */
const CONTRAST = [
  ['ink', '--ink', 'parch', '--parch', 4.5, 'text on a page'], ['inkSoft', '--ink-soft', 'parch', '--parch', 4.5, 'soft text on a page'],
  ['oxblood', '--oxblood', 'parch', '--parch', 4.5, 'a heading on a page'], ['danger', '--danger', 'parch', '--parch', 4.5, 'an error message on a page'],
  ['bone', '--bone', 'night', '--night', 4.5, 'text on the dark scene'], ['mute', '--mute', 'night', '--night', 4.5, 'quiet text on the dark scene'],
  ['bone', '--bone', 'soot', '--soot', 4.5, 'text on a dark panel'], ['mute', '--mute', 'soot', '--soot', 4.5, 'quiet text on a dark panel'],
  ['giltHi', '--gilt-hi', 'night', '--night', 4.5, 'a number on the dark scene'], ['dangerHi', '--danger-hi', 'night', '--night', 4.5, 'the fight colour on the dark scene'],
  ['onGilt', '--on-gilt', 'gilt', '--gilt', 4.5, 'text on gold'], ['onWax', '--on-wax', 'button.top', '--btn-1', 4.5, 'the words on the main button (at its lightest, the top)'],
  ['onWax', '--on-wax', 'oxblood', '--oxblood', 4.5, 'the words on a chosen chip'], ['pine', '--pine', 'sage', '--sage', 3, 'the edge of a note'],
  ['surface.fieldEdge', '--field-edge', 'parch', '--parch', 3, 'the edge of a field on a page']
];
const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].reduce((sum, c, i) => { c /= 255; return sum + [0.2126, 0.7152, 0.0722][i] * (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); }, 0); };
const contrast = (a, b) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
/* the custom properties src/styles.css declares, with the first value given to each: the default look */
function styleDefaults(root) {
  const f = path.join(root || ROOT, 'src', 'styles.css'), out = {};
  if (!fs.existsSync(f)) { return out; }
  const css = read(f).replace(/\/\*[\s\S]*?\*\//g, ''), re = /(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g;
  let m; while ((m = re.exec(css))) { if (!(m[1] in out)) { out[m[1]] = m[2].trim().replace(/\s+/g, ' '); } }
  return out;
}

/* ---------- theme.css ---------- */
/* Every rule in a pack's stylesheet must be fenced to that pack, so it cannot touch another. */
function cssBlocks(css) {                 // top-level "prelude { body }" pairs, comments removed
  const src = css.replace(/\/\*[\s\S]*?\*\//g, ''), out = [];
  let depth = 0, start = 0, open = -1, quote = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') { i++; } else if (c === quote) { quote = ''; } continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') { if (depth === 0) { open = i; } depth++; }
    else if (c === '}') { depth--; if (depth === 0) { out.push({ prelude: src.slice(start, open).trim(), body: src.slice(open + 1, i) }); start = i + 1; } }
    else if (c === ';' && depth === 0) { out.push({ prelude: src.slice(start, i).trim(), body: null }); start = i + 1; }
  }
  if (depth !== 0) { out.push({ prelude: '', body: null, broken: true }); }
  return out;
}
function selectors(prelude) {             // split on commas that are not inside () or []
  const out = []; let depth = 0, start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];
    if (c === '(' || c === '[') { depth++; } else if (c === ')' || c === ']') { depth--; }
    else if (c === ',' && depth === 0) { out.push(prelude.slice(start, i).trim()); start = i + 1; }
  }
  out.push(prelude.slice(start).trim());
  return out.filter(Boolean);
}
function checkCss(css, id, dir, E, W) {
  if (/<\/?\s*(style|script)/i.test(css)) { E('theme.css: must not contain <style> or <script> tags'); return; }
  const fence = new RegExp('^body\\[data-theme=(["\']?)' + id + '\\1\\](?![\\w-])');
  (function walk(text, inside) {
    cssBlocks(text).forEach((b) => {
      if (b.broken) { E('theme.css: the braces do not match up'); return; }
      if (b.body === null) { if (b.prelude) { E('theme.css: "' + b.prelude.slice(0, 60) + '" is not allowed here (fonts are loaded through tokens.fonts.stylesheet)'); } return; }
      if (/^@(media|supports|container|layer)\b/.test(b.prelude)) { walk(b.body, b.prelude); return; }
      if (/^@(-webkit-)?keyframes\b/.test(b.prelude)) {
        const name = b.prelude.replace(/^@(-webkit-)?keyframes\s+/, '');
        if (name.indexOf(id + '-') !== 0) { E('theme.css: @keyframes ' + name + ' must be named ' + id + '-' + name + ', because animation names are shared by the whole page'); }
        if (/url\s*\(/i.test(b.body)) { E('theme.css: @keyframes ' + name + ' may not load a file with url()'); }
        return;
      }
      if (b.prelude[0] === '@') { E('theme.css: ' + b.prelude.split(/\s/)[0] + ' is not allowed in a pack stylesheet'); return; }
      selectors(b.prelude).forEach((sel) => { if (!fence.test(sel)) { E('theme.css: "' + sel.slice(0, 70) + '" must start with body[data-theme="' + id + '"]' + (inside ? ' (inside ' + inside + ')' : '')); } });
      let m; const re = /url\(\s*(["']?)(.*?)\1\s*\)/g;
      while ((m = re.exec(b.body))) {
        const u = m[2];
        if (u.indexOf('data:') === 0) { continue; }
        if (!FILE.test(u)) { E('theme.css: url(' + u + ') must name one of the pack\'s own files, like url(img/page.webp)'); }
        else if (!fs.existsSync(path.join(dir, u))) { E('theme.css: url(' + u + ') is not in ' + path.relative(ROOT, dir) + '/'); }
      }
    });
  })(css, '');
}

/* ---------- checking ---------- */
/* Read every pack under <root>/scenarios and check it against the contract. Nothing is thrown:
   the report lists what is wrong (errors: the build refuses) and what is merely worth a look (warnings). */
function check(root, opts) {
  const R = root || ROOT, o = opts || {}, FR = engine(R), cfg = site(R), keys = textKeys(R);
  const report = { root: R, FR: FR, site: cfg, packs: [], errors: [], warnings: [], textKeys: keys };
  const srcOf = (located) => { const m = /^packs\/([^/]+)\/(.*)$/.exec(located); return m ? path.join(R, 'cartridges', m[1], m[2]) : path.join(R, 'src', located); };

  /* 1. read them all, so a pack can extend another */
  list(R).forEach((p) => {
    const got = load(p.file), pack = { id: p.id, dir: p.dir, file: p.file, def: got.def, theme: null, errors: [], warnings: [], reach: null, bytes: 0 };
    if (got.error) { pack.errors.push('cartridge.js ' + got.error); }
    else if (got.def.id !== p.id) { pack.errors.push('id: is "' + got.def.id + '" but the folder is cartridges/' + p.id + '/ (they must match)'); pack.def = null; }
    else if (got.def.id === 'base') { pack.errors.push('id: "base" is the engine\'s own pack; choose another name'); pack.def = null; }
    report.packs.push(pack);
  });
  report.packs.forEach((p) => { if (p.def) { try { FR.cartridge(p.def); } catch (e) { /* reported below, with the key that caused it */ } } });

  /* what every cartridge is given from the base: a whole label to lay its own over, and the rules credit */
  const baseMeta = (FR.scenarioDef('base') || {}).meta || {}, baseLabel = plain(baseMeta.label) ? baseMeta.label : {};
  Object.keys(LABEL.words).forEach((k) => { if (!str(baseLabel[k]) || baseLabel[k].length > LABEL.max) { report.errors.push('engine: src/base.js meta.label.' + k + ' must be a few words (' + LABEL.max + ' characters at most); every cartridge card falls back on it'); } });
  if (LABEL.ratings.indexOf(baseLabel.rating) < 0 || !Array.isArray(baseLabel.flags)) { report.errors.push('engine: src/base.js meta.label needs a rating (' + LABEL.ratings.join(', ') + ') and a list of flags'); }
  if (!(Array.isArray(baseMeta.credits) && baseMeta.credits.some((c) => plain(c) && c.type === 'rules' && str(c.text)))) { report.errors.push('engine: src/base.js meta.credits must hold the { type: "rules", text: "..." } credit that every cartridge carries (the licence of the rules asks for it)'); }

  /* the engine's sounds must still be there under the names packs use */
  const voices = read(path.join(R, 'src/dice.js')) + read(path.join(R, 'src/audio.js'));
  FR.SFX.forEach((v) => { const real = v === 'lowchime' ? 'chime' : v; if (!new RegExp('Sound\\.' + real + '\\s*=').test(voices)) { report.errors.push('engine: the sound "' + v + '" (FR.SFX in src/registry.js) is no longer defined in src/dice.js or src/audio.js'); } });

  /* cartridge spec v3: what every cartridge is given from the base when it says nothing. A class that names no
     role is filed under the role of its strongest trait, so the base needs a role for each trait; every
     soundscape the engine can make needs a bed a scene can name, and a voice in src/audio.js to make it; and a
     hero token needs its three lines. */
  const baseDef = FR.scenarioDef('base') || {}, audioSrc = read(path.join(R, 'src/audio.js'));
  const baseRoles = plain(baseDef.cast) && plain(baseDef.cast.roles) ? baseDef.cast.roles : {}, baseBeds = plain(baseDef.sound) && plain(baseDef.sound.beds) ? baseDef.sound.beds : {};
  FR.STRENGTHS.forEach((tr) => { if (!Object.keys(baseRoles).some((r) => plain(baseRoles[r]) && baseRoles[r].trait === tr)) { report.errors.push('engine: src/base.js cast.roles has no role with trait: "' + tr + '". A class that names no role is filed under the role of its strongest trait, so each of ' + FR.STRENGTHS.join(', ') + ' needs one'); } });
  FR.AMBIENCE.forEach((v) => {
    if (!Object.keys(baseBeds).some((k) => plain(baseBeds[k]) && baseBeds[k].synth === v)) { report.errors.push('engine: src/base.js sound.beds has no soundscape with synth: "' + v + '"; every cartridge is given one for each of the engine\'s voices (FR.AMBIENCE in src/registry.js)'); }
    if (!new RegExp('\\n\\s*' + v + ':\\s*function').test(audioSrc)) { report.errors.push('engine: the soundscape "' + v + '" (FR.AMBIENCE in src/registry.js) is no longer made in src/audio.js (FR.Ambience)'); }
  });
  ['name', 'plural', 'text'].forEach((k) => { if (!(plain(baseDef.kit) && plain(baseDef.kit.token) && str(baseDef.kit.token[k]))) { report.errors.push('engine: src/base.js kit.token.' + k + ' is missing; every cartridge falls back on it for what a hero token is called'); } });
  if (FR.RULES.indexOf(baseDef.rules) < 0) { report.errors.push('engine: src/base.js rules must be one of ' + FR.RULES.join(', ') + '; it is what a cartridge that names none plays by'); }
  /* the light rules read their ways to fight and a few lines of their own from the cartridge, so the base must have them all */
  const baseLight = plain(baseDef.light) ? baseDef.light : {};
  if (!(Array.isArray(baseLight.fight) && baseLight.fight.length)) { report.errors.push('engine: src/base.js light.fight is missing; a cartridge on the light rules that writes no ways to fight falls back on it'); }
  FR.LIGHT.words.forEach((k) => { if (!(plain(baseLight.text) && str(baseLight.text[k]))) { report.errors.push('engine: src/base.js light.text.' + k + ' is missing; the light rules say it (FR.LIGHT.words in src/rules.js), and every cartridge falls back on the base for it'); } });

  /* the dressing a pack may give a natural 20 and a natural 1: FR.FX.particles and FR.FX.objects, read from
     src/fx.js (it needs a page to run, so its two tables are read as text) */
  const fxSrc = fs.existsSync(path.join(R, 'src/fx.js')) ? read(path.join(R, 'src/fx.js')) : '';
  const tableKeys = (name) => { const m = new RegExp('var ' + name + ' = \\{\\n([\\s\\S]*?)\\n  \\};').exec(fxSrc), out = []; let k; const re = /^ {4}([A-Za-z0-9_]+):\s*\{/gm; while (m && (k = re.exec(m[1]))) { out.push(k[1]); } return out; };
  const fxNames = { particles: tableKeys('KIND'), objects: tableKeys('PROPS') };
  if (!fxNames.particles.length || !fxNames.objects.length) { report.errors.push('engine: the particles (KIND) and objects (PROPS) of src/fx.js could not be read, so a pack\'s fx dressing cannot be checked'); }
  report.fxNames = fxNames;

  /* the engine's stylesheet must declare every property a pack's tokens can set (or setting one would do
     nothing), with the default look's own choice for each switch; and the page must start in the same night */
  const defaults = styleDefaults(R);
  if (Object.keys(defaults).length) {
    FR.tokenProperties().forEach((p) => { if (!(p in defaults)) { report.errors.push('engine: src/styles.css does not declare ' + p + ', which a pack\'s tokens can set (FR.TOKENS in src/registry.js)'); } });
    Object.keys(FR.TOKEN_SWITCHES).forEach((sw) => {
      const first = Object.keys(FR.TOKEN_SWITCHES[sw])[0], set = FR.TOKEN_SWITCHES[sw][first];
      Object.keys(set).forEach((p) => { if (p in defaults && defaults[p] !== set[p].replace(/\s+/g, ' ')) { report.errors.push('engine: ' + p + ' is "' + defaults[p] + '" in src/styles.css but "' + set[p] + '" for ' + sw + ': \'' + first + '\' in src/registry.js; the two must agree'); } });
    });
    const pagePath = path.join(R, 'src', 'index.html'), tc = fs.existsSync(pagePath) ? /<meta name="theme-color" content="([^"]*)"/.exec(read(pagePath)) : null;
    if (fs.existsSync(pagePath) && !tc) { report.errors.push('engine: src/index.html has no <meta name="theme-color">; the registry sets it to each pack\'s night colour'); }
    else if (tc && defaults['--night'] && tc[1].toLowerCase() !== defaults['--night'].toLowerCase()) { report.errors.push('engine: <meta name="theme-color"> in src/index.html is ' + tc[1] + ' but --night in src/styles.css is ' + defaults['--night'] + '; the two must agree'); }
  }

  report.packs.forEach((pack) => {
    const d = pack.def, E = (m) => pack.errors.push(m), W = (m) => pack.warnings.push(m);
    if (!d) { return; }
    const id = d.id;

    /* 2. the pack's own header */
    if (d.schema !== FR.SCHEMA) { E('schema: must be ' + FR.SCHEMA); }
    if (!ID.test(id)) { E('id: "' + id + '" must be lower-case letters, digits and hyphens, starting with a letter'); }
    if (!str(d.version) || !/^\d+\.\d+\.\d+$/.test(d.version)) { E('version: must look like "1.0.0"'); }
    Object.keys(d).forEach((k) => { if (TOP_KEYS.indexOf(k) < 0) { W(k + ': not a key the engine reads (a typo?)'); } });
    const up = d.extends === undefined ? 'base' : d.extends;
    if (up !== null && up !== 'base') {
      const parent = report.packs.filter((x) => x.id === up)[0];
      if (!parent || !parent.def) { E('extends: there is no pack called "' + up + '"'); return; }
      if (parent.def.meta && parent.def.meta.visibility === 'draft' && !(d.meta && d.meta.visibility === 'draft')) { E('extends: "' + up + '" is a draft, so it is not built; a pack that is built cannot extend it'); }
    }
    const meta = d.meta;
    if (!plain(meta)) { E('meta: missing (name, blurb, kind, access, sku, visibility, credits)'); }
    else {
      if (!str(meta.name)) { E('meta.name: missing'); } else if (meta.name.length > 28) { W('meta.name: "' + meta.name + '" is long for the picker (28 characters at most reads well)'); }
      if (!str(meta.blurb)) { E('meta.blurb: missing'); }
      if (KINDS.indexOf(meta.kind) < 0) { E('meta.kind: must be one of ' + KINDS.join(', ')); }
      if (ACCESS.indexOf(meta.access) < 0) { E('meta.access: must be one of ' + ACCESS.join(', ')); }
      if (!(meta.sku === null || str(meta.sku))) { E('meta.sku: must be null or the product id'); }
      if (meta.access === 'paid' && !str(meta.sku)) { E('meta.sku: a paid pack must name its product'); }
      if (VISIBILITY.indexOf(meta.visibility) < 0) { E('meta.visibility: must be one of ' + VISIBILITY.join(', ')); }
      if (!Array.isArray(meta.credits)) { E('meta.credits: must be a list (empty is fine)'); }
      else { meta.credits.forEach((c, i) => { if (!plain(c) || !str(c.type) || !str(c.text)) { E('meta.credits[' + i + ']: needs { type: "music" | "art" | "writing" | "rules", text: "..." }'); } else if (CREDITS.indexOf(c.type) < 0) { W('meta.credits[' + i + '].type: "' + c.type + '" is not a kind of credit the app knows (' + CREDITS.join(', ') + '), so it will not be shown anywhere'); } }); }
      /* the label on a cartridge card: all optional, laid over the base's */
      const label = meta.label;
      if (label !== undefined) {
        if (!plain(label)) { E('meta.label: must be an object, like { length: "' + LABEL.words.length + '", players: "' + LABEL.words.players + '", tone: "' + LABEL.words.tone + '", dm: "' + LABEL.words.dm + '", rating: "everyone", flags: [] }'); }
        else {
          const parts = Object.keys(LABEL.words).concat(['rating', 'flags']);
          Object.keys(label).forEach((k) => { if (parts.indexOf(k) < 0) { E('meta.label.' + k + ': not part of a label (it may have ' + parts.join(', ') + ')'); } });
          Object.keys(LABEL.words).forEach((k) => {
            if (label[k] === undefined) { return; }
            if (!str(label[k])) { E('meta.label.' + k + ': must be a few words, like "' + LABEL.words[k] + '" (leave the line out to use the standard wording)'); }
            else if (label[k].length > LABEL.max) { E('meta.label.' + k + ': "' + label[k] + '" is ' + label[k].length + ' characters, and a cartridge card has room for ' + LABEL.max + '. Shorten it by ' + (label[k].length - LABEL.max)); }
          });
          if (label.rating !== undefined && LABEL.ratings.indexOf(label.rating) < 0) { E('meta.label.rating: must be one of "' + LABEL.ratings.join('", "') + '" (it is ' + JSON.stringify(label.rating) + ')'); }
          if (label.flags !== undefined) {
            if (!Array.isArray(label.flags)) { E('meta.label.flags: must be a list of short warnings, like ["Spiders"] (an empty list is fine)'); }
            else {
              if (label.flags.length > LABEL.flags) { E('meta.label.flags: lists ' + label.flags.length + ' things; a cartridge card has room for ' + LABEL.flags); }
              label.flags.forEach((f, i) => { if (!str(f)) { E('meta.label.flags[' + i + ']: must be a word or two, like "Spiders"'); } else if (f.length > LABEL.flag) { E('meta.label.flags[' + i + ']: "' + f + '" is ' + f.length + ' characters; keep each to ' + LABEL.flag + ' or fewer'); } });
            }
          }
        }
      }
    }
    if (!(d.adventure === undefined || d.adventure === null || str(d.adventure))) { E('adventure: must be the adventure\'s id, or left out'); }

    /* placeholder wording left over from the template */
    const todo = [];
    (function find(v, at) {
      if (typeof v === 'string') { if (/\bTODO\b/.test(v)) { todo.push(at); } }
      else if (v && typeof v === 'object') { Object.keys(v).forEach((k) => { if (/\bTODO\b/.test(k)) { todo.push(at ? at + '.' + k : k); } find(v[k], at ? at + '.' + k : k); }); }
    })(d, '');
    if (todo.length) { W(todo.length + ' piece' + (todo.length === 1 ? '' : 's') + ' of wording still say' + (todo.length === 1 ? 's' : '') + ' TODO (the first is ' + todo[0] + ')'); }

    /* 3. the pack with everything it inherits */
    let m, t;
    try { m = FR.resolved(id); } catch (e) { E('extends: ' + e.message); return; }
    try { t = FR.useTheme(id); if (t.id !== id) { throw new Error('the pack could not be put together'); } } catch (e) { E('cartridge.js: the engine could not build this pack: ' + e.message); t = null; }
    const quiz = m.quiz || {}, cast = m.cast || {}, look = m.look || {}, roster = m.roster || {};
    /* The rules it plays by decide what a class and a people must say (docs/PHASE2.md, section 6). Under 'light' that is
       far less: no numbers at all. Under 'open-5e' (also what rules nobody has heard of are checked as; the `rules`
       line itself is faulted further down) everything is checked exactly as it always was. */
    const lightRules = m.rules === 'light', listed = (l) => (l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]);
    const skillNames = Object.keys(FR.SKILLS).join(', ');
    const classes = plain(cast.classes) ? cast.classes : {}, races = plain(cast.races) ? cast.races : {}, cNames = Object.keys(classes), rNames = Object.keys(races);
    const options = plain(look.options) ? look.options : {};

    /* quiz */
    const qs = Array.isArray(quiz.questions) ? quiz.questions : [];
    if (qs.length < 5) { E('quiz.questions: a pack needs at least 5 questions (it has ' + qs.length + ')'); }
    qs.forEach((q, qi) => {
      const at = 'quiz.questions[' + qi + ']';
      if (!plain(q) || !str(q.q)) { E(at + '.q: the question text is missing'); return; }
      if (!Array.isArray(q.a) || q.a.length < 2) { E(at + '.a: needs at least 2 answers'); return; }
      q.a.forEach((a, ai) => {
        if (!plain(a) || !str(a.t)) { E(at + '.a[' + ai + '].t: the answer text is missing'); return; }
        if (!plain(a.w) || !Object.keys(a.w).length) { E(at + '.a[' + ai + '].w: needs weights, like { might: 2, order: -1 }'); return; }
        Object.keys(a.w).forEach((k) => { if (FR.TRAITS.indexOf(k) < 0) { E(at + '.a[' + ai + '].w.' + k + ': not a trait (use ' + FR.TRAITS.join(', ') + ')'); } else if (!num(a.w[k])) { E(at + '.a[' + ai + '].w.' + k + ': must be a number'); } });
      });
    });
    const quick = quiz.quick;
    if (!Array.isArray(quick) || quick.length !== 5) { E('quiz.quick: must list 5 question numbers (0 is the first question); run "npm run validate -- --quick ' + id + '" for the best five'); }
    else {
      quick.forEach((qi) => { if (!Number.isInteger(qi) || qi < 0 || qi >= qs.length) { E('quiz.quick: ' + JSON.stringify(qi) + ' is not a question (there are ' + qs.length + ', numbered from 0)'); } });
      if (new Set(quick).size !== quick.length) { E('quiz.quick: lists a question twice'); }
    }
    FR.STRENGTHS.forEach((k) => { if (!plain(quiz.traits) || !str(quiz.traits[k])) { E('quiz.traits.' + k + ': missing (the name this pack gives the trait)'); } });
    if (!Array.isArray(quiz.axes) || quiz.axes.length !== 2 || !quiz.axes.every((a) => Array.isArray(a) && a.length === 2 && a.every(str))) { E('quiz.axes: must be two pairs of words, like [["Chaos", "Order"], ["Shadow", "Light"]]'); }
    const al = quiz.alignment;
    if (!plain(al)) { E('quiz.alignment: missing'); }
    else {
      ['order', 'light'].forEach((side) => {
        const rules = al[side];
        if (!Array.isArray(rules) || !rules.length) { E('quiz.alignment.' + side + ': needs a list of rules'); return; }
        rules.forEach((r, i) => {
          if (!plain(r) || typeof r.say !== 'string') { E('quiz.alignment.' + side + '[' + i + ']: needs say: "..."'); return; }
          ['over', 'under'].forEach((k) => { if (r[k] !== undefined && !num(r[k])) { E('quiz.alignment.' + side + '[' + i + '].' + k + ': must be a number'); } });
        });
        const last = rules[rules.length - 1];
        if (plain(last) && (last.over !== undefined || last.under !== undefined)) { E('quiz.alignment.' + side + ': the last rule must have no "over" or "under", so there is always something to say'); }
      });
      if (!Array.isArray(al.parts) || !al.parts.length || !al.parts.every((k) => k === 'order' || k === 'light')) { E('quiz.alignment.parts: must list "order" and "light" in the order they are said'); }
    }
    const count = quiz.count;
    if (!plain(count) || !str(count.text) || count.text.indexOf('{i}') < 0 || count.text.indexOf('{n}') < 0) { E('quiz.count.text: must contain {i} and {n}, like "{i} of {n}"'); }
    else if (['plain', 'roman'].indexOf(count.numerals) < 0) { E('quiz.count.numerals: must be "plain" or "roman"'); }

    /* cast */
    if (cNames.length < 2) { E('cast.classes: a pack needs at least 2 classes'); }
    if (rNames.length < 2) { E('cast.races: a pack needs at least 2 races'); }
    const vec = (v, n) => Array.isArray(v) && v.length === n && v.every(num);
    /* a line a player reads: there, in words, and short enough for where it is shown */
    const line = (v, at, max, what, fits) => {
      if (!str(v)) { E(at + ': ' + (v === undefined ? 'is missing' : 'is empty or is not words') + '. Write ' + what + ' (' + max + ' characters at most)'); return false; }
      if (v.length > max) { E(at + ': is ' + v.length + ' characters long, and ' + max + ' is ' + fits + '. Shorten it by ' + (v.length - max)); return false; }
      return true;
    };
    const only = (o, at, keys, what) => Object.keys(o).forEach((k) => { if (keys.indexOf(k) < 0) { E(at + '.' + k + ': not part of ' + what + ' (it may have ' + keys.join(', ') + ')'); } });
    /* roles: a handful of plain jobs a hero can do, for the role cards and "the party has no Protector yet" (cartridge spec v3) */
    const roles = cast.roles, ownRoles = plain(d.cast) && d.cast.roles !== undefined, roleNames = plain(roles) ? Object.keys(roles) : [];
    if (roles !== undefined) {
      if (!plain(roles)) { E('cast.roles: must be an object of roles by name, like { Protector: { blurb: "You stand in front, so your friends do not have to.", does: "Push, lift, block and hold the line." } }'); }
      else {
        if (roleNames.length < ROLES.min || roleNames.length > ROLES.max) { E('cast.roles: has ' + roleNames.length + (roleNames.length === 1 ? ' role' : ' roles') + '. Role cards are made for ' + ROLES.min + ' to ' + ROLES.max + ', and five or six reads best'); }
        roleNames.forEach((r) => {
          const role = roles[r], at = 'cast.roles.' + r;
          if (r.length > ROLES.name || !r.trim()) { E(at + ': a role\'s name is ' + r.length + ' characters long; ' + ROLES.name + ' is what fits on a role card'); }
          if (!plain(role)) { E(at + ': must be an object, like { blurb: "You stand in front, so your friends do not have to.", does: "Push, lift, block and hold the line." }'); return; }
          only(role, at, ['blurb', 'does', 'trait'], 'a role');
          line(role.blurb, at + '.blurb', ROLES.blurb, 'the one line that sells this role', 'what fits on a role card');
          line(role.does, at + '.does', ROLES.does, 'what a hero in this role does at the table', 'what fits on a role card');
          if (role.trait !== undefined && FR.STRENGTHS.indexOf(role.trait) < 0) { E(at + '.trait: ' + JSON.stringify(role.trait) + ' is not a trait. Use one of ' + FR.STRENGTHS.join(', ') + ' (a class that names no role is filed under the role of its strongest trait), or leave the line out'); }
        });
      }
    }
    /* the kit: items by id, and what a hero token is called */
    const kit = m.kit, items = plain(kit) && plain(kit.items) ? kit.items : {}, itemIds = Object.keys(items).filter((k) => plain(items[k]));
    if (kit !== undefined) {
      if (!plain(kit)) { E('kit: must be an object, like { items: { rope: { name: "Rope", text: "Climb it, tie it, lower a friend on it.", uses: "always" } }, token: { name: "Hero token", plural: "Hero tokens", text: "Spend one to roll again." } }'); }
      else {
        only(kit, 'kit', ['items', 'token'], 'the kit');
        if (kit.items !== undefined && !plain(kit.items)) { E('kit.items: must be an object of items by id, like { rope: { name: "Rope", text: "Climb it, tie it, lower a friend on it.", uses: "always" } }'); }
        if (itemIds.length > KIT.items) { E('kit.items: lists ' + itemIds.length + ' items; ' + KIT.items + ' is the most a cartridge may have. Take ' + (itemIds.length - KIT.items) + ' out'); }
        Object.keys(items).forEach((k) => {
          const it = items[k], at = 'kit.items.' + k;
          if (!WORD.test(k)) { E('kit.items: ' + JSON.stringify(k) + ' cannot be an item\'s id. Use lower-case letters, digits, _ and - with no spaces, 40 at most, like "' + (k.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'rope') + '"'); }
          if (!plain(it)) { E(at + ': must be an object, like { name: "Rope", text: "Climb it, tie it, lower a friend on it.", uses: "always" }'); return; }
          only(it, at, ['name', 'text', 'img', 'uses'], 'an item');
          line(it.name, at + '.name', KIT.name, 'what the item is called', 'what fits on an item card');
          line(it.text, at + '.text', KIT.text, 'one plain line saying what it is good for', 'what fits on an item card');
          if (KIT.uses.indexOf(it.uses) < 0) { E(at + '.uses: must be "once" (it is used up) or "always" (it can be used again and again); it is ' + (it.uses === undefined ? 'missing' : JSON.stringify(it.uses))); }
          if (it.img !== undefined && !str(it.img)) { E(at + '.img: must name a picture, like "img/rope.webp", or be left out'); }
        });
        if (!plain(kit.token)) { E('kit.token: must be an object, like { name: "Hero token", plural: "Hero tokens", text: "Spend one to roll again when it matters." }'); }
        else {
          only(kit.token, 'kit.token', ['name', 'plural', 'text'], 'a token');
          line(kit.token.name, 'kit.token.name', KIT.token, 'what one hero token is called here', 'what fits beside a player\'s name');
          line(kit.token.plural, 'kit.token.plural', KIT.token, 'what several of them are called', 'what fits beside a player\'s name');
          line(kit.token.text, 'kit.token.text', KIT.tokenText, 'one plain line saying what a token is for', 'what fits under it on a phone');
        }
      }
    }
    const sameAs = {};                 // light: role + strong + fair -> the first class written that way
    cNames.forEach((c) => {
      const k = classes[c], at = 'cast.classes.' + c;
      if (!plain(k)) { E(at + ': must be an object'); return; }
      if (lightRules) {
        /* the light rules: a blurb, and the skills the class is strong at and fair at. No numbers. */
        if (!str(k.blurb)) { E(at + '.blurb: missing'); }
        if (k.color !== undefined && !COLOR.test(k.color || '')) { E(at + '.color: must be a colour like #8c2f1b (the dice are cast in it), or be left out: the engine then picks one that suits the class'); }
        if (k.gear !== undefined && !str(k.gear)) { E(at + '.gear: is empty. Write what the class wears and carries (it is for the painter, when AI portraits are on), or leave the line out'); }
        const tiers = {};
        [['strong', 'a clear bonus', '"Athletics", "Survival"', 1], ['fair', 'a small bonus', '"Perception", "Insight"', 0]].forEach(([tier, what, like, least]) => {
          const list = k[tier], most = FR.LIGHT.most[tier];
          tiers[tier] = [];
          if (list === undefined) {
            const had = tier === 'strong' && Array.isArray(k.skills) && k.skills.length ? ' Its open-5e skills are ' + k.skills.join(', ') + ': start from those' : (tier === 'fair' ? ' Write fair: [] if there are none' : '');
            E(at + '.' + tier + ': is missing. Under the light rules a class lists the skills it is ' + tier + ' at (' + what + ' on the die), like ' + tier + ': [' + like + '].' + had); return;
          }
          if (!Array.isArray(list) || !list.every((sk) => typeof sk === 'string')) { E(at + '.' + tier + ': must be a list of skills, like ' + tier + ': [' + like + ']'); return; }
          if (list.length < least) { E(at + '.' + tier + ': is empty. A class must be strong at something: name one to ' + most + ' skills, like strong: [' + like + ']'); }
          if (list.length > most) { E(at + '.' + tier + ': lists ' + list.length + ' skills; a class is ' + tier + ' at ' + most + ' at most' + (tier === 'strong' ? ' (two or three reads best). Move ' + (list.length - most) + ' to fair, or take them out' : '. Take ' + (list.length - most) + ' out') + ', so that no hero is good at everything'); }
          list.forEach((sk, i) => {
            if (!FR.SKILLS[sk]) { E(at + '.' + tier + ': "' + sk + '" is not a skill (' + skillNames + ')'); }
            else if (list.indexOf(sk) !== i) { E(at + '.' + tier + ': names "' + sk + '" twice'); }
            else if (tier === 'fair' && tiers.strong.indexOf(sk) >= 0) { E(at + '.fair: "' + sk + '" is already one of this class\'s strong skills. Keep it in one list only'); }
            else { tiers[tier].push(sk); }
          });
        });
        /* two classes written the same way come out the same in the quiz: one of them would never be anybody's hero */
        if (tiers.strong.length) {
          const key = [k.role || '', tiers.strong.slice().sort().join('|'), tiers.fair.slice().sort().join('|')].join(' / ');
          if (sameAs[key]) { E(at + ': has the same role and the same strong and fair skills as ' + sameAs[key] + ', so the quiz cannot tell them apart and nobody would ever be given one of them. Change a skill in one of the two'); }
          else { sameAs[key] = c; }
        }
        const left = ONLY_5E.cls.filter((f) => k[f] !== undefined);
        if (left.length) { W(at + ': has ' + listed(left) + ', which only the "open-5e" rules read. This cartridge plays by "light", where ' + (left.length === 1 ? 'it does' : 'they do') + ' nothing: delete ' + (left.length === 1 ? 'it' : 'them') + ' (or set rules: "open-5e" to play by the fuller rules)'); }
      } else {
        if (!vec(k.v, 8)) { E(at + '.v: needs 8 numbers (' + FR.TRAITS.join(', ') + ')'); }
        if ([6, 8, 10, 12].indexOf(k.hd) < 0) { E(at + '.hd: the hit die must be 6, 8, 10 or 12'); }
        if (!vec(k.prio, 6)) { E(at + '.prio: needs 6 numbers, how much the class wants ' + FR.ABILITIES.join(', ')); }
        if (!COLOR.test(k.color || '')) { E(at + '.color: must be a colour like #8c2f1b (the dice are cast in it)'); }
        if (!str(k.blurb)) { E(at + '.blurb: missing'); }
        if (!str(k.gear)) { E(at + '.gear: missing (what the class wears and carries, for the portrait)'); }
        if (FR.ARMOR.indexOf(k.armor) < 0) { E(at + '.armor: must be one of ' + FR.ARMOR.join(', ')); }
        if (!Array.isArray(k.skills) || !k.skills.length) { E(at + '.skills: needs at least one skill'); }
        else { k.skills.forEach((sk) => { if (!FR.SKILLS[sk]) { E(at + '.skills: "' + sk + '" is not a skill (' + Object.keys(FR.SKILLS).join(', ') + ')'); } }); }
        if (!Array.isArray(k.attacks) || !k.attacks.length) { E(at + '.attacks: needs at least one attack'); }
        else {
          k.attacks.forEach((a, i) => {
            if (!plain(a) || !str(a.n) || !str(a.hint)) { E(at + '.attacks[' + i + ']: needs a name (n) and a hint'); return; }
            if (FR.ABILITIES.indexOf(a.ab) < 0) { E(at + '.attacks[' + i + '].ab: must be one of ' + FR.ABILITIES.join(', ')); }
            if (DICE.indexOf(a.die) < 0) { E(at + '.attacks[' + i + '].die: must be one of ' + DICE.join(', ')); }
            if (!Number.isInteger(a.cnt) || a.cnt < 1 || a.cnt > 6) { E(at + '.attacks[' + i + '].cnt: must be 1 to 6 dice'); }
          });
        }
        const extra = ONLY_LIGHT.cls.filter((f) => k[f] !== undefined);
        if (extra.length) { W(at + ': has ' + listed(extra) + ', which only the "light" rules read. This cartridge plays by "open-5e", where ' + (extra.length === 1 ? 'it does' : 'they do') + ' nothing: delete ' + (extra.length === 1 ? 'it' : 'them') + ' (or set rules: "light" to play by the lighter rules)'); }
      }
      /* what the class is good at, for the lobby and the sheet: optional (its skills speak for it otherwise) */
      if (k.strengths !== undefined) {
        if (!Array.isArray(k.strengths) || k.strengths.length !== STRENGTHS.count) { E(at + '.strengths: must be ' + STRENGTHS.count + ' plain sentences, like ["You can talk your way out of almost anything.", "...", "..."]' + (Array.isArray(k.strengths) ? ' (it has ' + k.strengths.length + ')' : '')); }
        else { k.strengths.forEach((line, i) => { if (!str(line)) { E(at + '.strengths[' + i + ']: is empty. Write one plain sentence about what this class is good at'); } else if (line.length > STRENGTHS.max) { E(at + '.strengths[' + i + ']: is ' + line.length + ' characters long, and ' + STRENGTHS.max + ' is what fits under a name in the lobby. Shorten it by ' + (line.length - STRENGTHS.max)); } }); }
      }
      /* the role the class plays and the items a hero of it starts with (cartridge spec v3): both optional */
      if (k.role !== undefined) {
        if (!str(k.role) || roleNames.indexOf(k.role) < 0) { E(at + '.role: ' + JSON.stringify(k.role) + ' is not one of this cartridge\'s roles (' + roleNames.join(', ') + '). Use one of those, or add the role to cast.roles'); }
      } else if (ownRoles && roleNames.length) {
        const given = t && plain(t.classes[c]) ? t.classes[c].role : '';
        W(at + ': has no role, though this cartridge writes its own roles. ' + (given ? 'It is filed under "' + given + '", the role of its strongest trait. To choose' : 'It will not appear under any role card. To give it one') + ', add role: "' + (given || roleNames[0]) + '" (one of ' + roleNames.join(', ') + ')');
      }
      if (k.kit !== undefined) {
        if (!Array.isArray(k.kit) || !k.kit.every(str)) { E(at + '.kit: must be a list of item ids, like ["' + (itemIds[0] || 'rope') + '"] (the items are listed under kit.items)'); }
        else {
          if (k.kit.length > KIT.each) { E(at + '.kit: lists ' + k.kit.length + ' items; a hero starts with ' + KIT.each + ' at most. Take ' + (k.kit.length - KIT.each) + ' out'); }
          k.kit.forEach((it, i) => {
            if (itemIds.indexOf(it) < 0) { E(at + '.kit: "' + it + '" is not one of this cartridge\'s items (' + (itemIds.join(', ') || 'it has none yet') + '). Check the spelling, or add it to kit.items'); }
            else if (k.kit.indexOf(it) !== i) { E(at + '.kit: names "' + it + '" twice'); }
          });
        }
      }
      if (!plain(cast.samples) || !str(cast.samples[c])) { E('cast.samples.' + c + ': missing (which race is in this class\'s sample portrait)'); }
      else if (!races[cast.samples[c]]) { E('cast.samples.' + c + ': "' + cast.samples[c] + '" is not one of this pack\'s races'); }
    });
    if (plain(cast.samples)) { Object.keys(cast.samples).forEach((c) => { if (!classes[c]) { E('cast.samples.' + c + ': there is no class called "' + c + '"'); } }); }
    rNames.forEach((r) => {
      const k = races[r], at = 'cast.races.' + r;
      if (!plain(k)) { E(at + ': must be an object'); return; }
      const nm = plain(cast.names) ? cast.names[r] : null;
      if (lightRules) {
        /* the light rules: a people is flavour. A line about them and a look for the painter, both optional; no numbers. */
        if (k.perk !== undefined && !str(k.perk)) { E(at + '.perk: is empty. Write one line about this people, like "Keen senses: little in the woods gets past them.", or leave the line out'); }
        if (k.look !== undefined && !str(k.look)) { E(at + '.look: is empty. Write what this people looks like (it is for the painter, when AI portraits are on), or leave the line out'); }
        const left = ONLY_5E.race.filter((f) => k[f] !== undefined);
        if (left.length) { W(at + ': has ' + listed(left) + ', which only the "open-5e" rules read. This cartridge plays by "light", where a people changes no roll: delete ' + (left.length === 1 ? 'it' : 'them') + ' (or set rules: "open-5e" to play by the fuller rules)'); }
        /* names: a people with no list of its own borrows the first one written, so only that one is needed */
        if (nm !== null && nm !== undefined) {
          if (!plain(nm)) { E('cast.names.' + r + ': must be { m: [...], f: [...], s: [...] }'); }
          else { ['m', 'f', 's'].forEach((k2) => { if (!Array.isArray(nm[k2]) || !nm[k2].length || !nm[k2].every(str)) { E('cast.names.' + r + '.' + k2 + ': needs at least one name'); } }); }
        }
        if (!cNames.some((c) => plain(cast.samples) && cast.samples[c] === r)) { W(at + ': no class\'s sample shows this people (cast.samples), so no hero starts as one. A player can still choose it. To have it come up, name it as the sample of a class'); }
        return;
      }
      if (!vec(k.v, 8)) { E(at + '.v: needs 8 numbers (' + FR.TRAITS.join(', ') + ')'); }
      if (!plain(k.bonus)) { E(at + '.bonus: missing, like { DEX: 2, INT: 1 }'); }
      else { Object.keys(k.bonus).forEach((ab) => { if (FR.ABILITIES.indexOf(ab) < 0 || !Number.isInteger(k.bonus[ab])) { E(at + '.bonus.' + ab + ': must be a whole number for one of ' + FR.ABILITIES.join(', ')); } }); }
      if (!num(k.speed)) { E(at + '.speed: must be a number of feet'); }
      if (!str(k.perk)) { E(at + '.perk: missing'); }
      if (!str(k.look)) { E(at + '.look: missing (what this race looks like, for the portrait)'); }
      if (!plain(nm)) { E('cast.names.' + r + ': missing ({ m: [...], f: [...], s: [...] })'); }
      else { ['m', 'f', 's'].forEach((k2) => { if (!Array.isArray(nm[k2]) || !nm[k2].length || !nm[k2].every(str)) { E('cast.names.' + r + '.' + k2 + ': needs at least one name'); } }); }
    });
    if (lightRules && rNames.length && !rNames.some((r) => plain(cast.names) && plain(cast.names[r]))) { E('cast.names: needs the names of at least one people, like { ' + rNames[0] + ': { m: ["Bram"], f: ["Mira"], s: ["Ashdown"] } }, for "Roll a name". A people with no list of its own borrows the first one'); }
    if (lightRules && cast.armorNotes !== null && cast.armorNotes !== undefined) { W('cast.armorNotes: only the "open-5e" rules have armor. This cartridge plays by "light", where it does nothing: delete it'); }
    /* the plain sentence each skill gives a class that writes no strengths of its own */
    if (cast.skillStrengths !== undefined) {
      if (!plain(cast.skillStrengths)) { E('cast.skillStrengths: must be an object with one sentence for a skill, like { Stealth: "You move quietly and are hard to spot." }'); }
      else { Object.keys(cast.skillStrengths).forEach((sk) => {
        const line = cast.skillStrengths[sk];
        if (!FR.SKILLS[sk]) { E('cast.skillStrengths.' + sk + ': "' + sk + '" is not a skill (' + Object.keys(FR.SKILLS).join(', ') + ')'); }
        else if (!str(line)) { E('cast.skillStrengths.' + sk + ': must be one plain sentence'); }
        else if (line.length > STRENGTHS.max) { E('cast.skillStrengths.' + sk + ': is ' + line.length + ' characters long; keep it to ' + STRENGTHS.max + ' or fewer'); }
      }); }
    }
    if (cast.armorNotes !== null && cast.armorNotes !== undefined) {
      if (!plain(cast.armorNotes)) { E('cast.armorNotes: must be null or { leather: "thick winter coat", ... }'); }
      else { Object.keys(cast.armorNotes).forEach((k) => { if (FR.ARMOR.indexOf(k) < 0) { E('cast.armorNotes.' + k + ': not a kind of armor (' + FR.ARMOR.join(', ') + ')'); } }); }
    }

    /* looks */
    LOOK_KEYS.forEach((k) => {
      if (!Array.isArray(options[k]) || !options[k].length || !options[k].every(str)) { E('look.options.' + k + ': needs a list of choices'); }
      if (!plain(look.labels) || !str(look.labels[k])) { E('look.labels.' + k + ': missing'); }
    });
    Object.keys(options).forEach((k) => { if (LOOK_KEYS.indexOf(k) < 0) { E('look.options.' + k + ': the app only knows ' + LOOK_KEYS.join(', ')); } });
    if (!Array.isArray(look.flourish) || new Set(look.flourish).size < 2 || !look.flourish.every(str)) { E('look.flourish: needs at least 2 different details (two are drawn for each description)'); }
    const lookOk = (lk, at) => {
      if (lk === undefined) { return; }
      if (!plain(lk)) { E(at + ': must be an object'); return; }
      Object.keys(lk).forEach((k) => {
        if (LOOK_KEYS.indexOf(k) < 0) { E(at + '.' + k + ': not a look (' + LOOK_KEYS.join(', ') + ')'); }
        else if (lk[k] !== null && (options[k] || []).indexOf(lk[k]) < 0) { E(at + '.' + k + ': "' + lk[k] + '" is not one of look.options.' + k); }
      });
    };

    /* roster */
    const answersOk = (a, at) => {
      if (!Array.isArray(a) || a.length !== qs.length) { E(at + ': needs one answer per question (' + qs.length + ')'); return; }
      a.forEach((ai, qi) => { if (!Number.isInteger(ai) || ai < 0 || !qs[qi] || !Array.isArray(qs[qi].a) || ai >= qs[qi].a.length) { E(at + '[' + qi + ']: ' + JSON.stringify(ai) + ' is not an answer to question ' + qi); } });
    };
    const hero = (h, at, full) => {
      if (!plain(h)) { E(at + ': must be an object'); return; }
      if (!str(h.name)) { E(at + '.name: missing'); }
      if (!classes[h.cls]) { E(at + '.cls: "' + h.cls + '" is not one of this pack\'s classes'); }
      if (!races[h.race]) { E(at + '.race: "' + h.race + '" is not one of this pack\'s races'); }
      lookOk(h.look, at + '.look');
      if (full || h.answers !== undefined) { answersOk(h.answers, at + '.answers'); }
    };
    if (!plain(roster.demo)) { E('roster.demo: missing (the hero behind "I already have a character")'); } else { hero(roster.demo, 'roster.demo', true); }
    const pre = Array.isArray(roster.premades) ? roster.premades : [];
    if (pre.length < 6) { E('roster.premades: a pack needs at least 6 ready-made heroes (it has ' + pre.length + ')'); }
    pre.forEach((h, i) => { hero(h, 'roster.premades[' + i + ']', false); if (plain(h) && !plain(h.look)) { E('roster.premades[' + i + '].look: missing'); } });
    if (new Set(pre.map((h) => h && h.name)).size !== pre.length) { E('roster.premades: two heroes share a name'); }

    /* the menu, the special rolls, the story */
    const acts = Array.isArray(m.actions) ? m.actions : [];
    if (!acts.length) { E('actions: missing (the "I want to..." menu)'); }
    acts.forEach((a, i) => {
      if (!plain(a) || !str(a.id) || !str(a.label) || !str(a.hint)) { E('actions[' + i + ']: needs id, label and hint'); return; }
      if (!FR.SKILLS[a.skill]) { E('actions[' + i + '].skill: "' + a.skill + '" is not a skill'); }
    });
    if (new Set(acts.map((a) => a && a.id)).size !== acts.length) { E('actions: two entries share an id'); }
    (Array.isArray(m.extras) ? m.extras : []).forEach((x, i) => {
      const at = 'extras[' + i + ']';
      if (!plain(x) || !['id', 'label', 'hint', 'title', 'note'].every((k) => str(x[k]))) { E(at + ': needs id, label, hint, title and note'); return; }
      if (DICE.indexOf(x.sides) < 0) { E(at + '.sides: must be one of ' + DICE.join(', ')); }
      else if (!Array.isArray(x.table) || x.table.length !== x.sides || !x.table.every(str)) { E(at + '.table: needs exactly ' + x.sides + ' results, one for each face'); }
    });
    if (m.extras !== undefined && !Array.isArray(m.extras)) { E('extras: must be a list (empty is fine)'); }
    /* "say what you do": the words that suggest a check (FR.checkFor in src/registry.js) */
    const intent = m.intent;
    if (intent !== undefined) {
      if (!plain(intent)) { E('intent: must be an object, like { words: { skate: "Acrobatics" } }'); }
      else {
        Object.keys(intent).forEach((k) => { if (['words', 'why'].indexOf(k) < 0) { E('intent.' + k + ': not part of intent (it may have words and why)'); } });
        if (intent.why !== undefined && (!str(intent.why) || intent.why.indexOf('{why}') < 0)) { E('intent.why: must be a sentence containing {why}, like "That comes down to {why}."'); }
        if (intent.words !== undefined && !plain(intent.words)) { E('intent.words: must be an object of word: "Skill", like { skate: "Acrobatics" }'); }
        else { Object.keys(intent.words || {}).forEach((w) => {
          const sk = intent.words[w];
          if (!/^[a-z\u00e0-\u024f]+( [a-z\u00e0-\u024f]+){0,3}$/.test(w)) { E('intent.words: "' + w + '" must be one to four plain words in lower case, with single spaces and no punctuation'); }
          else if (sk !== null && !FR.SKILLS[sk]) { E('intent.words.' + w + ': ' + JSON.stringify(sk) + ' is not a skill. Use one of ' + Object.keys(FR.SKILLS).join(', ') + ' (or null to drop a word the engine knows)'); }
        }); }
      }
    }
    /* ties: what links a hero to the others at the table and to the story (cartridge spec v3) */
    const ties = m.ties;
    if (ties !== undefined) {
      if (!plain(ties)) { E('ties: must be an object, like { bonds: ["Why do you owe {name} a favor?"], hooks: [{ id: "debt", text: "You owe someone a favor." }], voices: [{ label: "Gruff", tip: "Short sentences. Long pauses." }] }'); }
      else {
        only(ties, 'ties', ['bonds', 'hooks', 'voices'], 'ties');
        if (ties.bonds !== undefined) {
          if (!Array.isArray(ties.bonds)) { E('ties.bonds: must be a list of questions about another player\'s hero, like ["Why do you owe {name} a favor?"]'); }
          else {
            if (ties.bonds.length > TIES.bonds) { E('ties.bonds: lists ' + ties.bonds.length + ' questions; keep it to ' + TIES.bonds + ' or fewer (each player is asked only one)'); }
            ties.bonds.forEach((b, i) => {
              const at = 'ties.bonds[' + i + ']';
              if (!line(b, at, TIES.bond, 'a question about another player\'s hero, with {name} where that hero\'s name goes', 'the most that leaves room for the name on a phone')) { return; }
              if (b.indexOf('{name}') < 0) { E(at + ': "' + b + '" has no {name} in it. A bond is about another player\'s hero: write {name} where that hero\'s name goes, like "Why do you owe {name} a favor?"'); }
              (b.match(/\{[^{}]*\}/g) || []).forEach((blank) => { if (blank !== '{name}') { E(at + ': ' + blank + ' is not something a bond can fill in. The only blank is {name}, the other hero\'s name'); } });
            });
          }
        }
        if (ties.hooks !== undefined) {
          if (!Array.isArray(ties.hooks)) { E('ties.hooks: must be a list of personal stakes in the story, like [{ id: "debt", text: "You owe someone a favor that money cannot repay." }]'); }
          else {
            if (ties.hooks.length > TIES.hooks) { E('ties.hooks: lists ' + ties.hooks.length + ' hooks; keep it to ' + TIES.hooks + ' or fewer (a player picks one from the list)'); }
            const seenHook = {};
            ties.hooks.forEach((h, i) => {
              const at = 'ties.hooks[' + (plain(h) && str(h.id) ? h.id : i) + ']';
              if (!plain(h)) { E(at + ': must be an object, like { id: "debt", text: "You owe someone a favor that money cannot repay." }'); return; }
              only(h, at, ['id', 'text', 'roles'], 'a hook');
              if (!str(h.id) || !WORD.test(h.id)) { E(at + '.id: ' + (h.id === undefined ? 'is missing' : JSON.stringify(h.id) + ' cannot be an id') + '. Give the hook a short word of its own in lower case with no spaces, like "debt" (40 characters at most): it is how the table remembers which hook a player took'); }
              else if (seenHook[h.id]) { E('ties.hooks: two hooks share the id "' + h.id + '". Each needs its own'); }
              else { seenHook[h.id] = true; }
              line(h.text, at + '.text', TIES.hook, 'the hook as the player reads it: a personal stake in the story', 'what the table keeps of a hook');
              if (h.roles !== undefined) {
                if (!Array.isArray(h.roles) || !h.roles.length || !h.roles.every(str)) { E(at + '.roles: must be a list of role names, like ["' + (roleNames[0] || 'Protector') + '"]. Leave the line out for a hook anyone may take'); }
                else { h.roles.forEach((r) => { if (roleNames.indexOf(r) < 0) { E(at + '.roles: "' + r + '" is not one of this cartridge\'s roles (' + roleNames.join(', ') + '). Check the spelling, or add the role to cast.roles'); } }); }
              }
            });
          }
        }
        if (ties.voices !== undefined) {
          if (!Array.isArray(ties.voices)) { E('ties.voices: must be a list of ways to talk, like [{ label: "Gruff", tip: "Short sentences. Long pauses." }]'); }
          else {
            if (ties.voices.length > TIES.voices) { E('ties.voices: lists ' + ties.voices.length + ' voices; keep it to ' + TIES.voices + ' or fewer'); }
            ties.voices.forEach((v, i) => {
              const at = 'ties.voices[' + i + ']';
              if (!plain(v)) { E(at + ': must be an object, like { label: "Gruff", tip: "Short sentences. Long pauses." }'); return; }
              only(v, at, ['label', 'tip'], 'a voice');
              line(v.label, at + '.label', TIES.voice, 'a word or two that names the voice', 'what fits on a chip');
              line(v.tip, at + '.tip', TIES.tip, 'how to do the voice, in a sentence or two', 'what fits under it on a phone');
            });
          }
        }
      }
    }
    /* soundscapes: the engine's own (synth) or one of the cartridge's audio files (file); null takes an inherited one away */
    const sound = m.sound, beds = plain(sound) && plain(sound.beds) ? sound.beds : {}, bedIds = Object.keys(beds).filter((k) => plain(beds[k]));
    if (sound !== undefined) {
      if (!plain(sound)) { E('sound: must be an object, like { beds: { rain: { label: "Rain on the roof", synth: "storm" } } }'); }
      else {
        only(sound, 'sound', ['beds'], 'sound');
        if (sound.beds !== undefined && !plain(sound.beds)) { E('sound.beds: must be an object of soundscapes by id, like { rain: { label: "Rain on the roof", synth: "storm" } }'); }
        if (bedIds.length > BEDS.max) { E('sound.beds: lists ' + bedIds.length + ' soundscapes; ' + BEDS.max + ' is the most the DM\'s picker shows. Take ' + (bedIds.length - BEDS.max) + ' out (null takes away one of the engine\'s)'); }
        Object.keys(beds).forEach((k) => {
          const b = beds[k], at = 'sound.beds.' + k;
          if (b === null) { return; }
          if (!WORD.test(k)) { E('sound.beds: ' + JSON.stringify(k) + ' cannot be a soundscape\'s id. Use lower-case letters, digits, _ and - with no spaces, 40 at most, like "' + (k.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'rain') + '"'); }
          if (!plain(b)) { E(at + ': must be { label, synth } for one of the engine\'s soundscapes, { label, file } for one of your own audio files, or null to take one of the engine\'s away'); return; }
          only(b, at, ['label', 'synth', 'file'], 'a soundscape');
          line(b.label, at + '.label', BEDS.label, 'what the DM\'s picker calls this soundscape', 'what fits in the picker');
          if (b.synth !== undefined && b.file !== undefined) { E(at + ': has both synth and file. A soundscape is one or the other: keep synth for one the engine makes, or file for one of your own'); }
          else if (b.synth === undefined && b.file === undefined) { E(at + ': needs synth: one of ' + FR.AMBIENCE.join(', ') + ' (made by the engine, no file needed), or file: one of your own, like "audio/rain.mp3"'); }
          else if (b.synth !== undefined && FR.AMBIENCE.indexOf(b.synth) < 0) { E(at + '.synth: ' + JSON.stringify(b.synth) + ' is not one of the engine\'s soundscapes. Use one of ' + FR.AMBIENCE.join(', ') + ', or give a file of your own instead (file: "audio/rain.mp3")'); }
          else if (b.file !== undefined && (!str(b.file) || !/^(packs\/[^/]+\/)?audio\//.test(b.file))) {
            const wrote = plain(d.sound) && plain(d.sound.beds) && plain(d.sound.beds[k]) && d.sound.beds[k].file !== undefined ? d.sound.beds[k].file : b.file;      // as the author wrote it, not where it was looked for
            E(at + '.file: ' + JSON.stringify(wrote) + ' must be an audio file in the cartridge\'s audio folder, like "audio/rain.mp3"');
          }
        });
      }
    }
    if (m.rules !== undefined && FR.RULES.indexOf(m.rules) < 0) { E('rules: must be "' + FR.RULES.join('" or "') + '" (it is ' + JSON.stringify(m.rules) + '). "open-5e" is today\'s rules; leave the line out to use them'); }
    /* what only the light rules read: the ways to fight, and the few lines of their own. Inherited whole from the base
       unless the cartridge writes its own, so an open-5e cartridge only hears about it if it wrote one for nothing. */
    const lt = m.light;
    if (!lightRules && plain(d.light)) { W('light: this block is only read under rules: "light". This cartridge plays by "open-5e", so it does nothing: delete it, or set rules: "light"'); }
    if (lt !== undefined) {
      if (!plain(lt)) { E('light: must be an object, like { fight: [{ id: "strike", label: "Hit it hard", hint: "Fists, a blade, anything heavy", skill: "Athletics" }] }'); }
      else {
        only(lt, 'light', ['fight', 'text'], 'the light rules');
        if (!Array.isArray(lt.fight) || !lt.fight.length) { E('light.fight: must be a list of ways to fight, like [{ id: "strike", label: "Hit it hard", hint: "Fists, a blade, anything heavy", skill: "Athletics" }]. Leave the line out to use the engine\'s'); }
        else {
          if (lt.fight.length > FIGHT.max) { E('light.fight: lists ' + lt.fight.length + ' ways to fight; the fight tab has room for ' + FIGHT.max + '. Take ' + (lt.fight.length - FIGHT.max) + ' out'); }
          const seenMove = {};
          lt.fight.forEach((mv, i) => {
            const at = 'light.fight[' + (plain(mv) && str(mv.id) ? mv.id : i) + ']';
            if (!plain(mv)) { E(at + ': must be an object, like { id: "strike", label: "Hit it hard", hint: "Fists, a blade, anything heavy", skill: "Athletics" }'); return; }
            only(mv, at, ['id', 'label', 'hint', 'skill'], 'a way to fight');
            if (!str(mv.id) || !WORD.test(mv.id)) { E(at + '.id: ' + (mv.id === undefined ? 'is missing' : JSON.stringify(mv.id) + ' cannot be an id') + '. Give each way to fight a short word of its own in lower case with no spaces, like "strike"'); }
            else if (seenMove[mv.id]) { E('light.fight: two ways to fight share the id "' + mv.id + '". Each needs its own'); }
            else { seenMove[mv.id] = true; }
            line(mv.label, at + '.label', FIGHT.label, 'what the row on the fight tab says, like "Hit it hard"', 'what fits on a row');
            line(mv.hint, at + '.hint', FIGHT.hint, 'the small line under it, like "Fists, a blade, anything heavy"', 'what fits under a row');
            const sk = Array.isArray(mv.skill) ? mv.skill : [mv.skill];
            if (mv.skill === undefined || !sk.length) { E(at + '.skill: is missing. Name the skill this way of fighting comes down to, like skill: "Athletics" (or a list, like ["Arcana", "Nature"]: the hero rolls whichever they are best at)'); }
            else { sk.forEach((x) => { if (!FR.SKILLS[x]) { E(at + '.skill: ' + JSON.stringify(x) + ' is not a skill. Use one of ' + skillNames); } }); }
          });
        }
        if (lt.text !== undefined && !plain(lt.text)) { E('light.text: must be an object of lines, like { fairAt: "Fair at this" }'); }
        else {
          Object.keys(lt.text || {}).forEach((k) => {
            if (FR.LIGHT.words.indexOf(k) < 0) { E('light.text.' + k + ': not a line the light rules say (they say ' + FR.LIGHT.words.join(', ') + '). Every other line on the screens goes in `text`'); }
            else if (!str(lt.text[k])) { E('light.text.' + k + ': must be a line of text'); }
          });
        }
      }
    }
    if (!(m.story === null || m.story === undefined || Array.isArray(m.story))) { E('story: must be null or a list of { img, alt, text }'); }
    (Array.isArray(m.story) ? m.story : []).forEach((b, i) => { if (!plain(b) || !str(b.img) || !str(b.text) || typeof b.alt !== 'string') { E('story[' + i + ']: needs img, alt and text'); } });

    /* wording templates */
    const sources = { race: rNames, cls: cNames, top: FR.STRENGTHS };
    LOOK_KEYS.forEach((k) => { sources['look.' + k] = options[k] || []; });
    const checkPart = (rule, at) => {
      if (!plain(rule)) { E(at + ': must be an object'); return; }
      Object.keys(rule).forEach((k) => { if (['from', 'map', 'lower', 'wrap', 'or', 'list', 'join'].indexOf(k) < 0) { E(at + '.' + k + ': not something a template part understands (from, map, lower, wrap, or, list, join)'); } });
      if (rule.wrap !== undefined && (typeof rule.wrap !== 'string' || rule.wrap.indexOf('{value}') < 0)) { E(at + '.wrap: must contain {value}'); }
      if (rule.or !== undefined && typeof rule.or !== 'string') { E(at + '.or: must be text'); }
      if (rule.list !== undefined) {
        if (!Array.isArray(rule.list) || !rule.list.length) { E(at + '.list: must be a list of parts'); return; }
        rule.list.forEach((r, i) => checkPart(r, at + '.list[' + i + ']'));
        return;
      }
      if (FR.TEMPLATE_KEYS.indexOf(rule.from) < 0) { E(at + '.from: "' + rule.from + '" is not a value a template can read (' + FR.TEMPLATE_KEYS.join(', ') + ')'); return; }
      if (rule.map !== undefined) {
        if (!plain(rule.map)) { E(at + '.map: must be an object'); return; }
        const known = sources[rule.from];
        if (known) {
          if (rule.or === undefined) { known.forEach((v) => { if (typeof rule.map[v] !== 'string') { E(at + '.map: has nothing for "' + v + '" (add it, or give the part an `or` to say instead)'); } }); }
          Object.keys(rule.map).forEach((v) => { if (known.indexOf(v) < 0) { W(at + '.map.' + v + ': never used; "' + v + '" is not a choice for ' + rule.from); } });
        }
      }
    };
    const checkTemplate = (tpl, at) => {
      if (!plain(tpl) || !str(tpl.text)) { E(at + ': missing ({ text: "...", parts: {...} })'); return; }
      const parts = plain(tpl.parts) ? tpl.parts : {}, used = (tpl.text.match(/\{([A-Za-z0-9_.]+)\}/g) || []).map((x) => x.slice(1, -1));
      used.forEach((k) => { if (!parts[k] && FR.TEMPLATE_KEYS.indexOf(k) < 0) { E(at + '.text: {' + k + '} is neither one of this template\'s parts nor a value the app knows'); } });
      Object.keys(parts).forEach((k) => { checkPart(parts[k], at + '.parts.' + k); if (used.indexOf(k) < 0) { W(at + '.parts.' + k + ': defined but never used in the text'); } });
    };
    checkTemplate((m.prose || {}).describe, 'prose.describe');
    checkTemplate((m.prose || {}).origin, 'prose.origin');
    checkTemplate((m.ai || {}).subject, 'ai.subject');
    ['style', 'describe', 'origin'].forEach((k) => { if (!str((m.ai || {})[k])) { E('ai.' + k + ': missing'); } });

    /* dice, particles, sounds, the lines for a 20 and a 1 */
    const dice = m.dice;
    if (!plain(dice)) { E('dice: missing'); }
    else {
      ['ink', 'fleck', 'fight', 'fightInk', 'floorTint', 'floorBase'].forEach((k) => { if (!COLOR.test(dice[k] || '')) { E('dice.' + k + ': must be a colour like #f3d68a'); } });
      ['inkMetal', 'exposure'].forEach((k) => { if (!num(dice[k])) { E('dice.' + k + ': must be a number'); } });
      if (!plain(dice.rim) || !COLOR.test(dice.rim.color || '') || typeof dice.rim.wood !== 'boolean' || !num(dice.rim.metal) || !num(dice.rim.rough)) { E('dice.rim: needs { color: "#b09a8c", wood: true or false, metal: 0 to 1, rough: 0 to 1 }'); }
    }
    const pt = m.particles;
    if (pt !== null && pt !== undefined) {
      if (!plain(pt)) { E('particles: must be null or an object'); }
      else {
        if (['rise', 'fall'].indexOf(pt.motion) < 0) { E('particles.motion: must be "rise" or "fall"'); }
        if (!Number.isInteger(pt.count) || pt.count < 1 || pt.count > 200) { E('particles.count: must be 1 to 200'); }
        ['speed', 'base', 'size'].forEach((k) => { if (!num(pt[k]) || pt[k] < 0) { E('particles.' + k + ': must be a number, 0 or more'); } });
        const cols = Array.isArray(pt.color) ? pt.color : [pt.color];
        if (cols.length < 1 || cols.length > 2 || !cols.every((c) => COLOR.test(c || ''))) { E('particles.color: must be a colour like #ffffff, or a pair to shade between'); }
        if (!Array.isArray(pt.alpha) || pt.alpha.length !== 2 || !pt.alpha.every((a) => num(a) && a >= 0 && a <= 1)) { E('particles.alpha: must be two numbers from 0 to 1, faintest and strongest'); }
        ['flicker', 'fade'].forEach((k) => { if (typeof pt[k] !== 'boolean') { E('particles.' + k + ': must be true or false'); } });
        if (!Array.isArray(pt.screens) || !pt.screens.length) { E('particles.screens: must list the screens they show on'); }
        else { pt.screens.forEach((sc) => { if (FR.SCREENS.indexOf(sc) < 0) { E('particles.screens: "' + sc + '" is not a screen (' + FR.SCREENS.join(', ') + ')'); } }); }
      }
    }
    ['tap', 'cheer', 'fumble', 'arrive'].forEach((slot) => {
      const v = (m.sfx || {})[slot], namesOf = Array.isArray(v) ? v : [v];
      if (v === undefined || !namesOf.length) { E('sfx.' + slot + ': missing'); return; }
      namesOf.forEach((n) => { if (FR.SFX.indexOf(n) < 0) { E('sfx.' + slot + ': "' + n + '" is not one of the engine\'s sounds (' + FR.SFX.join(', ') + ')'); } });
    });
    ['crit', 'fumble'].forEach((k) => {
      const f = (m.fx || {})[k];
      if (!plain(f) || !str(f.title)) { E('fx.' + k + '.title: missing'); return; }
      if (f.title.length >= 22) { E('fx.' + k + '.title: "' + f.title + '" is ' + f.title.length + ' characters; it is set large on one line, so keep it under 22'); }
      if (!Array.isArray(f.lines) || f.lines.length < 6 || !f.lines.every(str)) { E('fx.' + k + '.lines: needs at least 6 lines'); }
      else { f.lines.forEach((l, i) => { if (l.length > 70) { W('fx.' + k + '.lines[' + i + ']: ' + l.length + ' characters; these are meant to be read at a glance'); } }); }
      /* the dressing: what flies, what lands on a natural 1, and the colours of the moment (src/fx.js) */
      if (f.particles !== undefined && fxNames.particles.indexOf(f.particles) < 0) { E('fx.' + k + '.particles: "' + f.particles + '" is not one of the engine\'s (' + fxNames.particles.join(', ') + ')'); }
      if (f.object !== undefined && fxNames.objects.indexOf(f.object) < 0) { E('fx.' + k + '.object: "' + f.object + '" is not one of the engine\'s (' + fxNames.objects.join(', ') + ')'); }
      if (f.object !== undefined && k === 'crit') { W('fx.crit.object: only a natural 1 drops an object; this is never shown'); }
      if (f.colors !== undefined && (!Array.isArray(f.colors) || f.colors.length < 2 || f.colors.length > 8 || !f.colors.every((c) => COLOR.test(c || '')))) { E('fx.' + k + '.colors: must be 2 to 8 colours like "#ffe7a6" (the first two light the moment, all of them colour the particles)'); }
      if (f.tilt !== undefined && !num(f.tilt)) { E('fx.' + k + '.tilt: must be a number of degrees'); }
      Object.keys(f).forEach((key) => { if (['title', 'lines', 'particles', 'object', 'colors', 'tilt'].indexOf(key) < 0) { W('fx.' + k + '.' + key + ': not something the effects read (title, lines, particles, object, colors, tilt)'); } });
    });

    /* copy */
    const text = plain(m.text) ? m.text : {};
    keys.forEach((k) => {
      const v = text[k], shape = TEXT_SHAPES[k];
      if (v === undefined) { E('text.' + k + ': missing (the screens use it)'); return; }
      if (shape === 'three') { if (!Array.isArray(v) || v.length !== 3 || !v.every(str)) { E('text.' + k + ': must be three labels'); } }
      else if (shape === 'list') { if (!Array.isArray(v) || !v.length || !v.every(str)) { E('text.' + k + ': must be a list of lines'); } }
      else if (shape === 'abilities') { FR.ABILITIES.forEach((ab) => { if (!plain(v) || !str(v[ab])) { E('text.' + k + '.' + ab + ': missing'); } }); }
      else if (typeof v !== 'string' || !v) { E('text.' + k + ': must be a line of text'); }
      else { (TEXT_BLANKS[k] || []).forEach((b) => { if (v.indexOf(b) < 0) { E('text.' + k + ': must contain ' + b + ', which the app fills in'); } }); }
    });
    /* a line is known when a screen uses it, or when the base cartridge lists it (copy for a screen that is still being built) */
    const baseText = (FR.scenarioDef('base') || {}).text || {};
    Object.keys(plain(d.text) ? d.text : {}).forEach((k) => { if (keys.indexOf(k) < 0 && baseText[k] === undefined) { W('text.' + k + ': no screen uses this'); } });

    /* tokens: every group and key is one the styles read (FR.TOKENS, FR.TOKEN_SWITCHES in src/registry.js), and every value is the right kind */
    const tk = plain(m.tokens) ? m.tokens : {};
    const groups = Object.keys(FR.TOKENS).concat(['channels', 'fonts', 'images']);
    Object.keys(tk).forEach((k) => { if (groups.indexOf(k) < 0) { E('tokens.' + k + ': not a kind of token (' + groups.join(', ') + ')'); } });
    Object.keys(FR.TOKENS).forEach((g) => {
      const mine = tk[g];
      if (mine === undefined) { return; }
      if (!plain(mine)) { E('tokens.' + g + ': must be an object'); return; }
      const switches = Object.keys(FR.TOKEN_SWITCHES).filter((s) => s.indexOf(g + '.') === 0).map((s) => s.slice(g.length + 1));
      Object.keys(mine).forEach((k) => {
        const at = 'tokens.' + g + '.' + k, sw = FR.TOKEN_SWITCHES[g + '.' + k], t = FR.tokenOf(g, k);
        if (sw) { if (!FR.switchChoice(g + '.' + k, mine[k])) { E(at + ': must be one of ' + Object.keys(sw).map((c) => (c === 'on' ? 'true' : (c === 'off' ? 'false' : '"' + c + '"'))).join(', ')); } return; }
        if (!t) { E(at + ': the styles have no such token (' + Object.keys(FR.TOKENS[g].keys).concat(switches).join(', ') + ')'); return; }
        if (!FR.tokenOk(t[1], mine[k])) { E(at + ': ' + TOKEN_KINDS[t[1]]); }
      });
    });
    const channels = Object.keys(FR.TOKEN_CHANNELS);
    Object.keys(tk.channels || {}).forEach((k) => { if (channels.indexOf(k) < 0 || !/^\d{1,3}, \d{1,3}, \d{1,3}$/.test(tk.channels[k])) { E('tokens.channels.' + k + ': must be one of ' + channels.join(', ') + ', written "8, 18, 34"'); } });
    const fonts = tk.fonts || {};
    Object.keys(fonts).forEach((k) => {
      if (k === 'stylesheet') { if (!/^https:\/\/[^\s"'<>]+$/.test(fonts[k])) { E('tokens.fonts.stylesheet: must be an https address of a font stylesheet'); } }
      else if (k === 'warm') { if (!Array.isArray(fonts[k]) || !fonts[k].every(str)) { E('tokens.fonts.warm: must be a list like ["800 40px \'Alegreya\'"]'); } }
      else if (FR.TOKEN_FONTS.indexOf(k) < 0) { E('tokens.fonts.' + k + ': not a font the styles use (' + FR.TOKEN_FONTS.join(', ') + ')'); }
      else if (!Array.isArray(fonts[k]) || !fonts[k].length || !fonts[k].every((f) => str(f) && !/[;{}<>]/.test(f))) { E('tokens.fonts.' + k + ': must be a list of family names, most wanted first'); }
    });
    Object.keys(tk.images || {}).forEach((k) => {
      if (['key', 'page', 'table'].indexOf(k) < 0) { E('tokens.images.' + k + ': must be one of key, page, table'); }
      else if (tk.images[k] === null && k !== 'page') { E('tokens.images.' + k + ': needs a picture (only page may be null, for a flat page)'); }
      else if (tk.images[k] !== null && !str(tk.images[k])) { E('tokens.images.' + k + ': must name a picture, like "img/keyart.webp"' + (k === 'page' ? ', or be null for a flat page' : '')); }
    });
    /* the type scale: nothing on a screen is set below 14px, and nothing a player has to read below 15px */
    const ty = plain(tk.type) ? tk.type : {}, steps = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'num'].map((k) => (num(ty[k]) ? ty[k] : parseFloat(defaults['--t-' + k])));
    if (num(ty.xs) && ty.xs < 14) { E('tokens.type.xs: ' + ty.xs + 'px is too small; the smallest step must be 14 or more'); }
    if (num(ty.sm) && ty.sm < 15) { E('tokens.type.sm: ' + ty.sm + 'px is too small; hints and labels a player reads are set in it, so it must be 15 or more'); }
    if (num(ty.md) && ty.md < 16) { E('tokens.type.md: ' + ty.md + 'px is too small for body text; use 16 or more'); }
    if (Object.keys(ty).length && steps.every(num) && steps.some((s, i) => i > 0 && s < steps[i - 1])) { E('tokens.type: the steps must grow from xs to num (they are ' + steps.join(', ') + ')'); }
    /* contrast: the pairs of flat colours that text is set in, with the default look's colour standing in for any the pack leaves alone */
    if (plain(tk.palette) || plain(tk.button) || plain(tk.surface)) {
      const pal = plain(tk.palette) ? tk.palette : {}, btn = plain(tk.button) ? tk.button : {}, surf = plain(tk.surface) ? tk.surface : {};
      const col = (key, prop) => { const own = key.indexOf('button.') === 0 ? btn[key.slice(7)] : (key.indexOf('surface.') === 0 ? surf[key.slice(8)] : pal[key]); return COLOR.test(own || '') ? own : (COLOR.test(defaults[prop] || '') ? defaults[prop] : ''); };
      CONTRAST.forEach(([fg, fgProp, bg, bgProp, least, what]) => {
        const a = col(fg, fgProp), b = col(bg, bgProp);
        if (!a || !b) { return; }
        const ratio = contrast(a, b);
        if (ratio < least) { E('tokens: ' + what + ' is ' + ratio.toFixed(2) + ':1 (' + fg + ' ' + a + ' on ' + bg + ' ' + b + '); it needs ' + least + ':1 to be read. Change one of the two.'); }
      });
    }

    /* 4. files: everything named must exist; everything in the folder counts toward the budget */
    const raw = JSON.parse(JSON.stringify(d));
    FR.eachAsset(raw, (v, at) => { if (!FILE.test(v.replace(/^base:/, '').split(/^art\.(crest|sample)$/.test(at) ? '{slug}' : '\u0000').join('slug')) || v.indexOf('..') >= 0) { E(at + ': "' + v + '" must be a file in the pack, like "img/keyart.webp" (letters, digits, _ . - only), or "base:img/..." to borrow the engine\'s'); } });
    const need = (located, at) => { if (located && !fs.existsSync(srcOf(located))) { E(at + ': ' + path.relative(R, srcOf(located)) + ' does not exist'); } };
    const art = m.art || {};
    ['wordmark', 'divider', 'thumb', 'floor'].forEach((k) => { if (!str(art[k])) { E('art.' + k + ': missing'); } else { need(art[k], 'art.' + k); } });
    ['crest', 'sample'].forEach((k) => {
      if (!str(art[k])) { E('art.' + k + ': missing'); return; }
      cNames.forEach((c) => need(art[k].split('{slug}').join(FR.slug(c)), 'art.' + k + ' for ' + c));
    });
    Object.keys(tk.images || {}).forEach((k) => need(tk.images[k], 'tokens.images.' + k));
    (Array.isArray(m.story) ? m.story : []).forEach((b, i) => { if (plain(b)) { need(b.img, 'story[' + i + '].img'); } });
    const music = m.music;
    let tracks = 0;
    if (music !== null && music !== undefined) {
      if (!plain(music)) { E('music: must be null or { intro: [...], game: [...], fight: [...] }'); }
      else {
        Object.keys(music).forEach((k) => { if (['intro', 'game', 'fight'].indexOf(k) < 0) { E('music.' + k + ': not a scene (intro, game, fight); credits go in meta.credits'); } });
        ['intro', 'game', 'fight'].forEach((k) => { (Array.isArray(music[k]) ? music[k] : []).forEach((f, i) => { tracks++; need(f, 'music.' + k + '[' + i + ']'); }); });
      }
    }
    if (tracks && !(plain(meta) && Array.isArray(meta.credits) && meta.credits.some((c) => plain(c) && c.type === 'music' && str(c.text)))) { E('meta.credits: this pack plays music, so it needs a { type: "music", text: "..." } credit (shown on the Music and sound sheet)'); }
    pre.forEach((h, i) => { if (plain(h) && h.portrait) { need(h.portrait, 'roster.premades[' + i + '].portrait'); } });
    itemIds.forEach((k) => { if (str(items[k].img)) { need(items[k].img, 'kit.items.' + k + '.img'); } });
    bedIds.forEach((k) => { if (str(beds[k].file)) { need(beds[k].file, 'sound.beds.' + k + '.file'); } });

    const cssFile = path.join(pack.dir, 'theme.css');
    if (fs.existsSync(cssFile)) { checkCss(read(cssFile), id, pack.dir, E, W); }
    const advFile = path.join(pack.dir, 'adventure.js'), advAt = 'cartridges/' + id + '/adventure.js';      // every message says whose adventure it is
    if (fs.existsSync(advFile)) {
      const adv = loadAdventure(advFile);
      if (adv.error) { E(advAt + ' ' + adv.error); }
      else {
        if (adv.id !== id) { E(advAt + ': calls FR.adventure("' + adv.id + '", ...) but this pack is "' + id + '"'); }
        if (adv.notData) { E(advAt + ': ' + adv.notData); }
        if (!str(d.adventure)) { E('adventure: the pack has an adventure.js, so say which adventure it is (adventure: "its-id")'); }
        else if (adv.def && adv.def.id !== d.adventure) { E('adventure: the pack says "' + d.adventure + '" but adventure.js is "' + adv.def.id + '"'); }
        /* the adventure may name the cartridge's soundscapes (its own and the ones it inherits) and the engine's kinds of beat */
        const found = require('../validate-adventure.js').check(adv.def, { images: pack.dir, engine: path.join(R, 'src'), skills: Object.keys(FR.SKILLS), beds: bedIds, beats: FR.BEATS });
        found.forEach((m) => E(advAt + ': ' + m));
        found.warnings.forEach((m) => W(advAt + ': ' + m));
      }
    } else if (str(d.adventure)) { E('adventure: "' + d.adventure + '" is named, but there is no adventure.js beside the pack'); }
    ['img', 'audio'].forEach((sub) => {
      const dir = path.join(pack.dir, sub);
      if (!fs.existsSync(dir)) { return; }
      fs.readdirSync(dir).filter((f) => f[0] !== '.').forEach((f) => {
        const size = fs.statSync(path.join(dir, f)).size, limit = sub === 'img' ? BUDGET.image : BUDGET.audio;
        pack.bytes += size;
        if (!/^[\w.-]+$/.test(f)) { E(sub + '/' + f + ': file names may only use letters, digits, _ . and -'); }
        if (size > limit) { W(sub + '/' + f + ': ' + kb(size) + ' is over the ' + kb(limit) + ' budget for ' + (sub === 'img' ? 'a picture' : 'a track')); }
      });
    });
    if (pack.bytes > BUDGET.pack) { W('the pack is ' + (pack.bytes / 1048576).toFixed(1) + ' MB; ' + (BUDGET.pack / 1048576) + ' MB is the budget'); }

    /* 5. the pack in use: every sentence it can write, and who can be reached */
    if (!t || pack.errors.length) { return; }
    pack.theme = t;
    const bad = /undefined|\bnull\b|NaN|\[object|\{[A-Za-z0-9_.]+\}/;
    const say = (what, textOut) => { if (typeof textOut !== 'string' || !textOut || bad.test(textOut)) { E(what + ': comes out as "' + String(textOut).slice(0, 140) + '"'); return false; } return true; };
    let fine = true;
    cNames.forEach((c, ci) => {
      rNames.forEach((r, ri) => {
        if (!fine) { return; }
        const lk = {}; LOOK_KEYS.forEach((k, ki) => { const opts = options[k]; lk[k] = opts[(ci + ri + ki) % opts.length]; });
        [{ cls: c, race: r, look: lk, desc: 'a test', name: 'Test Name' }, { cls: c, race: r, look: {}, desc: '', name: 'Test Name' }].forEach((ch) => {
          fine = fine && say('ai.subject for a ' + r + ' ' + c, t.subject(ch)) && say('prose.describe for a ' + r + ' ' + c, t.describe(ch));
        });
        FR.STRENGTHS.forEach((top) => { fine = fine && say('prose.origin for a ' + r + ' ' + c, t.origin({ name: 'Test Name', first: 'Test', race: r, cls: c, top: top })); });
      });
    });
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 0], [1, 1, 0], [-1, -1, 0]].forEach((v) => { say('quiz.alignment', t.alignment({ order: v[0], light: v[1] }, 1)); });
    say('quiz.count', t.count(0, qs.length));
    if (pack.errors.length) { return; }
    if (o.reach !== false) {
      pack.reach = reach(FR, t, o);
      const pct = (x) => (100 * x).toFixed(1) + '%';
      /* Under the light rules a class is matched by its role and its strong and fair skills, so that is where the
         remedy is: the class it is most often mistaken for is named. A people is not chosen by the answers there. */
      const nearest = (c) => {
        const mine = FR.centre(t.classes[c].v); let best = '', top = -Infinity;
        cNames.forEach((o) => { if (o !== c) { const sim = FR.cosine(mine, FR.centre(t.classes[o].v)); if (sim > top) { top = sim; best = o; } } });
        return best;
      };
      [['full', 'quiz.questions', REACH.full, 'the full quiz'], ['quick', 'quiz.quick', REACH.quick, 'the quick quiz']].forEach(([mode, key, bound, name]) => {
        (lightRules ? ['classes'] : ['classes', 'races']).forEach((kind) => {
          const sp = pack.reach[mode][kind];
          if (sp.min < bound.min && lightRules) { E(key + ': ' + sp.minName + ' is the result for only ' + pct(sp.minShare) + ' of players in ' + name + ' (an even share is ' + pct(sp.even) + '; at least ' + pct(sp.even * bound.min) + ' is needed). The quiz matches a class by its role and its strong and fair skills, and ' + sp.minName + ' reads too much like ' + nearest(sp.minName) + ': give it a strong or fair skill that ' + nearest(sp.minName) + ' does not have.'); }
          else if (sp.min < bound.min) { E(key + ': ' + sp.minName + ' is the result for only ' + pct(sp.minShare) + ' of players in ' + name + ' (an even share is ' + pct(sp.even) + '; at least ' + pct(sp.even * bound.min) + ' is needed). Give some answers more of what it stands for.'); }
          if (sp.max > bound.max) { E(key + ': ' + sp.maxName + ' is the result for ' + pct(sp.maxShare) + ' of players in ' + name + ' (an even share is ' + pct(sp.even) + '; at most ' + pct(sp.even * bound.max) + ' is allowed).'); }
        });
      });
    }
  });

  /* 6. the site as a whole */
  const good = report.packs.filter((p) => p.def && p.def.meta), pub = good.filter((p) => p.def.meta.visibility === 'public');
  if (!pub.length) { report.errors.push('cartridges/: there is no public pack to open'); }
  if (cfg.default) {
    const dp = good.filter((p) => p.id === cfg.default)[0];
    if (!dp) { report.errors.push('cartridges/packs.json: default "' + cfg.default + '" is not a pack'); }
    else if (dp.def.meta.visibility !== 'public') { report.errors.push('cartridges/packs.json: default "' + cfg.default + '" must be a public pack'); }
  }
  cfg.order.forEach((x) => { if (!report.packs.some((p) => p.id === x)) { report.warnings.push('cartridges/packs.json: order lists "' + x + '", which is not a pack'); } });
  report.ok = !report.errors.length && report.packs.every((p) => !p.errors.length);
  return report;
}

/* The packs a build ships, in picker order: the default first, then cartridges/packs.json's order, then by name.
   Drafts only when asked for. */
function shipping(report, drafts) {
  const cfg = report.site, packs = report.packs.filter((p) => p.def && p.def.meta && (drafts || p.def.meta.visibility !== 'draft'));
  const first = cfg.default || (packs.filter((p) => p.def.meta.visibility === 'public')[0] || {}).id || '';
  const rank = (p) => (p.id === first ? -1 : (cfg.order.indexOf(p.id) >= 0 ? cfg.order.indexOf(p.id) : 1000));
  packs.sort((a, b) => rank(a) - rank(b) || a.def.meta.name.localeCompare(b.def.meta.name));
  return { default: first, packs: packs };
}

module.exports = { ROOT, REACH, BUDGET, KINDS, ACCESS, VISIBILITY, TOP_KEYS, ID, COLOR, FILE, LOOK_KEYS, DICE, LABEL, STRENGTHS, CREDITS, ROLES, TIES, KIT, BEDS, ONLY_5E, ONLY_LIGHT, FIGHT,
  read, hash, plain, str, num, kb, engine, list, site, notData, load, loadAdventure, lcg, shares, spread, combos, reach, bestQuick, template,
  textKeys, styleDefaults, contrast, cssBlocks, selectors, checkCss, check, shipping };
