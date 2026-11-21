/* What the tools know about scenario packs on disk: finding them, reading them and checking them.
   Shared by build.js, scripts/validate.js, scripts/new-scenario.js and the unit tests, so there is
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
const TOP_KEYS = ['schema', 'id', 'version', 'extends', 'meta', 'adventure', 'tokens', 'art', 'quiz', 'cast', 'look', 'roster', 'actions', 'extras', 'story', 'music',
  'particles', 'dice', 'sfx', 'fx', 'prose', 'ai', 'text'];
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

/* the packs in a folder: every scenarios/<name>/scenario.js. Names starting with _ or . are left alone. */
function list(root) {
  const dir = path.join(root || ROOT, 'scenarios');
  if (!fs.existsSync(dir)) { return []; }
  return fs.readdirSync(dir).sort().filter((n) => !/^[._]/.test(n) && fs.existsSync(path.join(dir, n, 'scenario.js')))
    .map((n) => ({ id: n, dir: path.join(dir, n), file: path.join(dir, n, 'scenario.js') }));
}
/* scenarios/packs.json: which pack opens first, and the order of the picker */
function site(root) {
  const f = path.join(root || ROOT, 'scenarios', 'packs.json');
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

/* Run a pack file with a stand-in FR and hand back what it passed to FR.scenario. */
function load(file) {
  const calls = [], out = { def: null, error: '' };
  try {
    vm.runInNewContext(read(file), { FR: { scenario: (d) => { calls.push(d); return d; } } }, { filename: file, timeout: 2000 });
  } catch (e) { out.error = 'could not be read: ' + e.message; return out; }
  if (calls.length !== 1) { out.error = 'must call FR.scenario({...}) exactly once (it called it ' + calls.length + ' times)'; return out; }
  if (!plain(calls[0])) { out.error = 'FR.scenario was not given an object'; return out; }
  out.error = notData(calls[0], '');
  if (!out.error) { out.def = JSON.parse(JSON.stringify(calls[0])); }
  return out;
}
/* the same for scenarios/<id>/adventure.js, which calls FR.adventure('<id>', {...}) */
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
  const tables = { classes: t.classes, races: t.races }, out = {};
  Object.keys(tables).forEach((kind) => { out[kind] = {}; Object.keys(tables[kind]).forEach((n) => { out[kind][n] = 0; }); });
  sets.forEach((answers) => {
    const u = FR.zero();
    answers.forEach((ai, qi) => { if (ai === null) { return; } const w = t.questions[qi].a[ai].w; Object.keys(w).forEach((k) => { u[k] += w[k]; }); });
    Object.keys(tables).forEach((kind) => { out[kind][FR.rank(u, tables[kind], only)[0].name]++; });
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
  const n = t.questions.length, k = size || 5, found = [];
  (function choose(start, picked) {
    if (picked.length === k) {
      const q = shares(FR, t, picked, combos(t, picked)), c = spread(q.classes), r = spread(q.races);
      found.push({ quick: picked.slice(), min: Math.min(c.min, r.min), max: Math.max(c.max, r.max), classes: c, races: r });
      return;
    }
    for (let i = start; i <= n - (k - picked.length); i++) { choose(i + 1, picked.concat(i)); }
  })(0, []);
  found.sort((a, b) => b.min - a.min || a.max - b.max);
  return found.slice(0, keep || 5);
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
  const srcOf = (located) => { const m = /^packs\/([^/]+)\/(.*)$/.exec(located); return m ? path.join(R, 'scenarios', m[1], m[2]) : path.join(R, 'src', located); };

  /* 1. read them all, so a pack can extend another */
  list(R).forEach((p) => {
    const got = load(p.file), pack = { id: p.id, dir: p.dir, file: p.file, def: got.def, theme: null, errors: [], warnings: [], reach: null, bytes: 0 };
    if (got.error) { pack.errors.push('scenario.js ' + got.error); }
    else if (got.def.id !== p.id) { pack.errors.push('id: is "' + got.def.id + '" but the folder is scenarios/' + p.id + '/ (they must match)'); pack.def = null; }
    else if (got.def.id === 'base') { pack.errors.push('id: "base" is the engine\'s own pack; choose another name'); pack.def = null; }
    report.packs.push(pack);
  });
  report.packs.forEach((p) => { if (p.def) { try { FR.scenario(p.def); } catch (e) { /* reported below, with the key that caused it */ } } });

  /* the engine's sounds must still be there under the names packs use */
  const voices = read(path.join(R, 'src/dice.js')) + read(path.join(R, 'src/audio.js'));
  FR.SFX.forEach((v) => { const real = v === 'lowchime' ? 'chime' : v; if (!new RegExp('Sound\\.' + real + '\\s*=').test(voices)) { report.errors.push('engine: the sound "' + v + '" (FR.SFX in src/registry.js) is no longer defined in src/dice.js or src/audio.js'); } });

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
      else { meta.credits.forEach((c, i) => { if (!plain(c) || !str(c.type) || !str(c.text)) { E('meta.credits[' + i + ']: needs { type: "music" | "art" | "writing", text: "..." }'); } }); }
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
    try { t = FR.useTheme(id); if (t.id !== id) { throw new Error('the pack could not be put together'); } } catch (e) { E('scenario.js: the engine could not build this pack: ' + e.message); t = null; }
    const quiz = m.quiz || {}, cast = m.cast || {}, look = m.look || {}, roster = m.roster || {};
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
    cNames.forEach((c) => {
      const k = classes[c], at = 'cast.classes.' + c;
      if (!plain(k)) { E(at + ': must be an object'); return; }
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
      if (!plain(cast.samples) || !str(cast.samples[c])) { E('cast.samples.' + c + ': missing (which race is in this class\'s sample portrait)'); }
      else if (!races[cast.samples[c]]) { E('cast.samples.' + c + ': "' + cast.samples[c] + '" is not one of this pack\'s races'); }
    });
    if (plain(cast.samples)) { Object.keys(cast.samples).forEach((c) => { if (!classes[c]) { E('cast.samples.' + c + ': there is no class called "' + c + '"'); } }); }
    rNames.forEach((r) => {
      const k = races[r], at = 'cast.races.' + r;
      if (!plain(k)) { E(at + ': must be an object'); return; }
      if (!vec(k.v, 8)) { E(at + '.v: needs 8 numbers (' + FR.TRAITS.join(', ') + ')'); }
      if (!plain(k.bonus)) { E(at + '.bonus: missing, like { DEX: 2, INT: 1 }'); }
      else { Object.keys(k.bonus).forEach((ab) => { if (FR.ABILITIES.indexOf(ab) < 0 || !Number.isInteger(k.bonus[ab])) { E(at + '.bonus.' + ab + ': must be a whole number for one of ' + FR.ABILITIES.join(', ')); } }); }
      if (!num(k.speed)) { E(at + '.speed: must be a number of feet'); }
      if (!str(k.perk)) { E(at + '.perk: missing'); }
      if (!str(k.look)) { E(at + '.look: missing (what this race looks like, for the portrait)'); }
      const nm = plain(cast.names) ? cast.names[r] : null;
      if (!plain(nm)) { E('cast.names.' + r + ': missing ({ m: [...], f: [...], s: [...] })'); }
      else { ['m', 'f', 's'].forEach((k2) => { if (!Array.isArray(nm[k2]) || !nm[k2].length || !nm[k2].every(str)) { E('cast.names.' + r + '.' + k2 + ': needs at least one name'); } }); }
    });
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
    Object.keys(plain(d.text) ? d.text : {}).forEach((k) => { if (keys.indexOf(k) < 0) { W('text.' + k + ': no screen uses this'); } });

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

    const cssFile = path.join(pack.dir, 'theme.css');
    if (fs.existsSync(cssFile)) { checkCss(read(cssFile), id, pack.dir, E, W); }
    const advFile = path.join(pack.dir, 'adventure.js');
    if (fs.existsSync(advFile)) {
      const adv = loadAdventure(advFile);
      if (adv.error) { E('adventure.js ' + adv.error); }
      else {
        if (adv.id !== id) { E('adventure.js: calls FR.adventure("' + adv.id + '", ...) but this pack is "' + id + '"'); }
        if (adv.notData) { E('adventure.js: ' + adv.notData); }
        if (!str(d.adventure)) { E('adventure: the pack has an adventure.js, so say which adventure it is (adventure: "its-id")'); }
        else if (adv.def && adv.def.id !== d.adventure) { E('adventure: the pack says "' + d.adventure + '" but adventure.js is "' + adv.def.id + '"'); }
        require('../validate-adventure.js').check(adv.def, { images: pack.dir }).forEach((m) => E('adventure.js: ' + m));
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
      [['full', 'quiz.questions', REACH.full, 'the full quiz'], ['quick', 'quiz.quick', REACH.quick, 'the quick quiz']].forEach(([mode, key, bound, name]) => {
        ['classes', 'races'].forEach((kind) => {
          const sp = pack.reach[mode][kind];
          if (sp.min < bound.min) { E(key + ': ' + sp.minName + ' is the result for only ' + pct(sp.minShare) + ' of players in ' + name + ' (an even share is ' + pct(sp.even) + '; at least ' + pct(sp.even * bound.min) + ' is needed). Give some answers more of what it stands for.'); }
          if (sp.max > bound.max) { E(key + ': ' + sp.maxName + ' is the result for ' + pct(sp.maxShare) + ' of players in ' + name + ' (an even share is ' + pct(sp.even) + '; at most ' + pct(sp.even * bound.max) + ' is allowed).'); }
        });
      });
    }
  });

  /* 6. the site as a whole */
  const good = report.packs.filter((p) => p.def && p.def.meta), pub = good.filter((p) => p.def.meta.visibility === 'public');
  if (!pub.length) { report.errors.push('scenarios/: there is no public pack to open'); }
  if (cfg.default) {
    const dp = good.filter((p) => p.id === cfg.default)[0];
    if (!dp) { report.errors.push('scenarios/packs.json: default "' + cfg.default + '" is not a pack'); }
    else if (dp.def.meta.visibility !== 'public') { report.errors.push('scenarios/packs.json: default "' + cfg.default + '" must be a public pack'); }
  }
  cfg.order.forEach((x) => { if (!report.packs.some((p) => p.id === x)) { report.warnings.push('scenarios/packs.json: order lists "' + x + '", which is not a pack'); } });
  report.ok = !report.errors.length && report.packs.every((p) => !p.errors.length);
  return report;
}

/* The packs a build ships, in picker order: the default first, then scenarios/packs.json's order, then by name.
   Drafts only when asked for. */
function shipping(report, drafts) {
  const cfg = report.site, packs = report.packs.filter((p) => p.def && p.def.meta && (drafts || p.def.meta.visibility !== 'draft'));
  const first = cfg.default || (packs.filter((p) => p.def.meta.visibility === 'public')[0] || {}).id || '';
  const rank = (p) => (p.id === first ? -1 : (cfg.order.indexOf(p.id) >= 0 ? cfg.order.indexOf(p.id) : 1000));
  packs.sort((a, b) => rank(a) - rank(b) || a.def.meta.name.localeCompare(b.def.meta.name));
  return { default: first, packs: packs };
}

module.exports = { ROOT, REACH, BUDGET, KINDS, ACCESS, VISIBILITY, TOP_KEYS, ID, COLOR, FILE, LOOK_KEYS, DICE,
  read, hash, plain, str, num, kb, engine, list, site, notData, load, loadAdventure, lcg, shares, spread, combos, reach, bestQuick,
  textKeys, styleDefaults, contrast, cssBlocks, selectors, checkCss, check, shipping };
