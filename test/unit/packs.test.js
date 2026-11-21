/* Scenario packs: every pack in scenarios/ is valid and is data only, the registry lays packs over
   the base as promised, the build writes a correct manifest, drafts stay out, the scaffold makes
   a pack that works, and the validator catches the mistakes an author is likely to make.
   Anything that writes files does so in a throwaway copy of the project, never in the real one. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { spawnSync } = require('child_process');
const P = require('../../scripts/lib/packs.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(f, 'utf8');
const json = (v) => JSON.parse(JSON.stringify(v));

/* A throwaway project: the real engine and the real packs by link, and a scenarios/ folder of its own. */
function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-roll-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.symlinkSync(path.join(ROOT, 'src'), path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'scenarios'));
  fs.copyFileSync(path.join(ROOT, 'scenarios', 'packs.json'), path.join(dir, 'scenarios', 'packs.json'));
  P.list(ROOT).forEach((p) => fs.symlinkSync(p.dir, path.join(dir, 'scenarios', p.id)));
  return dir;
}
function run(script, args, root) {
  const env = Object.assign({}, process.env, { FR_ROOT: root }); delete env.FR_DRAFTS; delete env.npm_config_name;
  const r = spawnSync(process.execPath, [path.join(ROOT, script)].concat(args || []), { env: env, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
/* a pack of our own in the sandbox, made from the scaffold's template and then altered by `change` */
function addPack(root, id, change, extra) {
  const dir = path.join(root, 'scenarios', id);
  let text = read(path.join(ROOT, 'scripts', 'template', 'scenario.js')).split('__ID__').join(id).split('__NAME__').join('Test Pack');
  text = change ? change(text) : text;
  fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scenario.js'), text);
  Object.keys(extra || {}).forEach((f) => fs.writeFileSync(path.join(dir, f), extra[f]));
  return dir;
}
const errorsOf = (root, id) => { const p = P.check(root, { samples: 2000 }).packs.filter((x) => x.id === id)[0]; return p.errors.join('\n'); };
const swap = (from, to) => (text) => { assert.ok(text.indexOf(from) >= 0, 'the template still contains ' + from); return text.replace(from, to); };

/* ---------- the packs that ship ---------- */
test('every pack in scenarios/ is valid', () => {
  const r = P.check(ROOT);
  r.packs.forEach((p) => assert.deepStrictEqual(p.errors, [], p.id + ' has faults'));
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.ok);
  assert.ok(r.packs.length >= 2);
});

test('every pack is data only: it survives a trip through JSON unchanged', () => {
  P.list(ROOT).forEach((p) => {
    const calls = [];
    vm.runInNewContext(read(p.file), { FR: { scenario: (d) => { calls.push(d); } } }, { filename: p.file });
    assert.strictEqual(calls.length, 1, p.id + ' calls FR.scenario once');
    assert.strictEqual(P.notData(calls[0], ''), '', p.id);
    assert.deepStrictEqual(json(json(calls[0])), json(calls[0]), p.id);
    assert.strictEqual(JSON.stringify(json(calls[0])), JSON.stringify(calls[0]), p.id + ' loses nothing in JSON');
    assert.strictEqual(P.load(p.file).error, '');
  });
});

test('what is not data is named, with where it is', () => {
  assert.match(P.notData({ a: { b: () => 1 } }, ''), /^a\.b is a function/);
  assert.match(P.notData({ list: [1, undefined] }, ''), /^list\[1\] is undefined/);
  assert.match(P.notData({ n: NaN }, ''), /^n is NaN/);
  assert.match(P.notData({ when: new Date(0) }, ''), /^when is a Date/);
  assert.strictEqual(P.notData({ a: [1, 'two', null, true, { b: 0x10 }] }, ''), '');
});

test('each pack stands alone and says the things a pack must say', () => {
  const r = P.check(ROOT, { reach: false });
  r.packs.forEach((p) => {
    const d = p.def, t = p.theme;
    assert.strictEqual(d.schema, 1);
    ['name', 'blurb', 'kind', 'access', 'visibility'].forEach((k) => assert.strictEqual(typeof d.meta[k], 'string', p.id + ' meta.' + k));
    assert.ok(d.meta.sku === null || typeof d.meta.sku === 'string');
    assert.ok(Array.isArray(d.meta.credits));
    /* its own quiz, cast, copy and so on: written in the pack, not borrowed */
    ['quiz', 'cast', 'look', 'roster', 'actions', 'extras', 'dice', 'particles', 'sfx', 'fx', 'prose', 'ai', 'text'].forEach((k) => assert.ok(d[k] !== undefined, p.id + ' writes its own ' + k));
    assert.ok(d.quiz.questions.every((q) => q.a.every((a) => a.w && Object.keys(a.w).length)), p.id + ' has its own weights');
    assert.strictEqual(t.quiz.quick.length, 5);
    assert.ok(t.roster.premades.length >= 6);
    t.roster.premades.forEach((h) => {
      assert.ok(t.classes[h.cls] && t.races[h.race], p.id + ' premade ' + h.name);
      assert.strictEqual(h.answers.length, t.questions.length);
      assert.match(h.portrait, /^(packs\/[a-z0-9-]+\/)?img\//);
    });
    ['crit', 'fumble'].forEach((k) => { assert.ok(t.fx[k].title); assert.strictEqual(t.fx[k].lines.length, 6, p.id + ' fx.' + k); });
    ['tap', 'cheer', 'fumble', 'arrive'].forEach((k) => [].concat(t.sfx[k]).forEach((v) => assert.ok(r.FR.SFX.indexOf(v) >= 0, p.id + ' sfx.' + k)));
    Object.keys(t.classes).forEach((c) => { assert.ok(t.samples[c]); assert.ok(t.art.crest(c)); assert.ok(t.art.sample(c)); });
    if (t.music) { assert.ok(t.music.credit, p.id + ' credits its music'); }
  });
});

/* ---------- the engine names no pack ---------- */
test('the engine holds no pack ids and no typefaces of its own', () => {
  const ids = P.list(ROOT).map((p) => p.id);
  ['src/app.js', 'src/table.js', 'src/index.html', 'src/rules.js', 'src/registry.js', 'src/styles.css'].forEach((f) => {
    const text = read(path.join(ROOT, f)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    ids.forEach((id) => assert.ok(!new RegExp("['\"]" + id + "['\"]").test(text), f + ' names the pack "' + id + '"'));
    if (f !== 'src/styles.css') { assert.ok(!/fonts\.googleapis|Alegreya|Grandstander|Nunito/.test(text), f + ' names a typeface'); }
  });
  assert.ok(!/data-theme=/.test(read(path.join(ROOT, 'src/styles.css'))), 'src/styles.css has no pack rules');
});

/* ---------- the registry ---------- */
test('a pack is laid over the base: what it says wins, what it leaves out is inherited', () => {
  const FR = P.engine(ROOT), base = FR.scenarioDef('base');
  const mini = json(P.load(path.join(ROOT, 'scenarios', 'tavern', 'scenario.js')).def);
  mini.id = 'mini'; mini.text = { begin: 'Go' }; delete mini.actions; delete mini.fx; delete mini.sfx;
  mini.fx = { crit: { title: 'Yes!' } };
  FR.scenario(mini);
  const t = FR.useTheme('mini');
  assert.strictEqual(t.text.begin, 'Go');
  assert.strictEqual(t.text.tagline, base.text.tagline, 'copy it did not write comes from the base');
  assert.strictEqual(Object.keys(t.text).length, Object.keys(base.text).length);
  assert.deepStrictEqual(json(t.actions), base.actions);
  assert.strictEqual(t.fx.crit.title, 'Yes!');
  assert.deepStrictEqual(json(t.fx.crit.lines), base.fx.crit.lines, 'small settings merge key by key');
  assert.deepStrictEqual(json(t.sfx), base.sfx);
  assert.strictEqual(Object.keys(t.classes).length, 12, 'a cast replaces the parent\'s whole');
  assert.strictEqual(t.meta.name, mini.meta.name, 'meta is never inherited');
  assert.strictEqual(FR.THEMES.base, undefined, 'the base is never a theme by itself');
});

test('files are found in the pack that names them, and borrowed ones in the engine', () => {
  const FR = P.engine(ROOT);
  P.list(ROOT).forEach((p) => FR.scenario(P.load(p.file).def));
  const tv = FR.THEMES.tavern, np = FR.THEMES.northpole;
  assert.strictEqual(tv.art.wordmark, 'img/wordmark.webp', 'inherited from the base: the engine\'s own file');
  assert.strictEqual(tv.art.crest('Half Orc Bard'), 'packs/tavern/img/crest_half_orc_bard.webp');
  assert.strictEqual(np.art.wordmark, 'packs/northpole/img/wordmark.webp');
  assert.strictEqual(np.story[0].img, 'packs/northpole/img/story1.webp');
  assert.strictEqual(np.music.intro[0], 'packs/northpole/audio/intro.mp3');
  assert.strictEqual(FR.locate('northpole', 'base:img/seal.webp'), 'img/seal.webp');
  FR.manifest(FR.MANIFEST, { 'packs/northpole/img/wordmark.webp': 'abc12345' });
  assert.strictEqual(FR.asset('northpole', 'img/wordmark.webp'), 'packs/northpole/img/wordmark.webp?v=abc12345');
  assert.deepStrictEqual(tv.fonts.length, 1);
  assert.deepStrictEqual(np.fonts.length, 2, 'the engine\'s typefaces and the pack\'s');
});

test('tokens become custom properties on body[data-theme]', () => {
  const FR = P.engine(ROOT);
  P.list(ROOT).forEach((p) => FR.scenario(P.load(p.file).def));
  const css = FR.tokensCss('northpole');
  ['body[data-theme="northpole"] {', '--night: #081428;', '--ink-soft: #4a5873;', '--gilt-hi: #ffe7a6;', '--night-rgb: 8, 20, 40;', '--gilt-rgb: 242, 184, 75;', '--ox-rgb: 179, 18, 43;', '--ink-rgb: 29, 43, 69;',
    "--f-display: 'Grandstander', 'Trebuchet MS', 'Segoe UI', sans-serif;", '--r-btn: 18px;', '--r-page: 22px;', '--r-chip: 14px;',
    '--key-img: url(packs/northpole/img/keyart.webp);', '--page-img: none;', '--table-img: url(packs/northpole/img/table.webp);',
    /* every group: a size, a weight, a line, a shadow, a timing, a gradient stop, a surface, and switches that set several properties */
    '--t-xs: 14px;', '--t-2xl: 30px;', '--w-body: 600;', '--track: 0.01em;', '--bw: 2px;', '--icon-stroke: 2.4;', '--d-fast: 120ms;', '--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);',
    '--sh-card-edge: 0 0 0 3px var(--edge), 0 6px 0 var(--edge-deep);', '--btn-1: #e22a45;', '--gold-3: #f2b84b;', '--scrim-a: 0.8;', '--veil-1: 0.62;', '--page-top-h: 10px;',
    '--cap-float: none;', '--em-style: normal;', '--mark-r: 50%;', '--taper-clip: none;', '--portrait-blend: normal;', '--chrome-bw: 3px;']
    .forEach((line) => assert.ok(css.indexOf(line) >= 0, 'missing ' + line));
  assert.strictEqual(FR.tokensCss('tavern'), '', 'a pack with no tokens of its own adds no rules');
});

test('every token a pack can set is declared in src/styles.css, and no pack names a token the styles do not read', (t) => {
  const FR = P.engine(ROOT), sheet = read(path.join(ROOT, 'src', 'styles.css'));
  FR.tokenProperties().forEach((p) => assert.ok(new RegExp('(^|[\\s;{])' + p + ':').test(sheet), 'src/styles.css does not declare ' + p));
  assert.strictEqual(FR.tokenOf('palette', 'inkSoft')[0], '--ink-soft');
  assert.strictEqual(FR.tokenOf('type', '2xl')[0], '--t-2xl');
  assert.strictEqual(FR.tokenOf('palette', 'nope'), null);
  assert.ok(FR.tokenOk('hex', '#0a1626') && !FR.tokenOk('hex', 'red') && !FR.tokenOk('css', 'red; } body { display: none') && !FR.tokenOk('css', 'url(http://x/y.png)'));
  /* the scaffold's pack with its whole tokens block swapped for `text` */
  const root = sandbox(t), tpl = read(path.join(ROOT, 'scripts', 'template', 'scenario.js')).split('__ID__').join('look').split('__NAME__').join('Look');
  const from = tpl.indexOf('  tokens: {'), to = tpl.indexOf('\n  },', from);
  assert.ok(from > 0 && to > from, 'the template has a tokens block');
  const errs = (text) => { fs.rmSync(path.join(root, 'scenarios', 'look'), { recursive: true, force: true }); addPack(root, 'look', () => tpl.slice(0, from) + '  tokens: { ' + text + ' },' + tpl.slice(to + 5)); return errorsOf(root, 'look'); };
  assert.match(errs('palette: { nite: "#000000" }'), /tokens\.palette\.nite: the styles have no such token/);
  assert.match(errs('palette: { night: "navy" }'), /tokens\.palette\.night: must be a colour/);
  assert.match(errs('type: { xs: 12 }'), /tokens\.type\.xs: 12px is too small/);
  assert.match(errs('type: { dropCap: "maybe" }'), /tokens\.type\.dropCap: must be one of true, false/);
  assert.match(errs('shadow: { card: "0 0 0 red; } body { color: red" }'), /tokens\.shadow\.card: must be one CSS value/);
  assert.match(errs('palette: { ink: "#c8b89a" }'), /text on a page is [\d.]+:1/);
  assert.match(errs('images: { key: null }'), /tokens\.images\.key: needs a picture/);
  assert.strictEqual(errs('palette: { night: "#101820" }, images: { page: null }, type: { caps: "upper", dropCap: false }'), '');
});

test('the scaffold writes out every token, each set to the default look in src/styles.css', (t) => {
  const root = sandbox(t);
  addPack(root, 'look');
  const r = P.check(root, { reach: false }), pack = r.packs.filter((p) => p.id === 'look')[0], defaults = P.styleDefaults(ROOT);
  assert.deepStrictEqual(pack.errors, []);
  const css = r.FR.tokensCss('look'), set = {};
  css.split('\n').forEach((line) => { const m = /^\s*(--[a-z0-9-]+): (.*?);?$/.exec(line); if (m) { set[m[1]] = m[2].replace(/\s+/g, ' '); } });
  r.FR.tokenProperties().forEach((p) => assert.ok(p in set, 'the template does not set ' + p));
  Object.keys(set).forEach((p) => assert.strictEqual(set[p], defaults[p], p + ' in the template is not the default look\'s value'));
});

test('the opening pack: ?s= in the address, else the one used last, else the default', () => {
  const FR = P.engine(ROOT);
  FR.manifest({ schema: 1, default: 'northpole', packs: [{ id: 'northpole' }, { id: 'tavern' }, { id: 'side-quest' }] });
  assert.strictEqual(FR.pickScenario('', ''), 'northpole');
  assert.strictEqual(FR.pickScenario('', 'tavern'), 'tavern');
  assert.strictEqual(FR.pickScenario('?s=side-quest', 'tavern'), 'side-quest');
  assert.strictEqual(FR.pickScenario('?t=ABCD&s=tavern', ''), 'tavern');
  assert.strictEqual(FR.pickScenario('?s=nope', 'tavern'), 'tavern', 'an unknown id is ignored');
  assert.strictEqual(FR.pickScenario('?s=nope', 'gone'), 'northpole');
});

test('wording templates: parts, tables, fallbacks and lists', () => {
  const FR = P.engine(ROOT);
  const tpl = { text: '{name} is {size}{mood}.{details}', parts: {
    size: { from: 'look.build', map: { Tiny: 'small' }, or: 'hard to miss' },
    mood: { from: 'look.bearing', lower: true, wrap: ' and {value}' },
    details: { join: '; ', wrap: ' Details: {value}.', list: [{ from: 'look.age', wrap: 'age {value}' }, { from: 'look.hair', wrap: 'hair {value}' }] } } };
  assert.strictEqual(FR.fill(tpl, { name: 'Pip', look: { build: 'Tiny', bearing: 'Jolly', age: 'old', hair: 'red' } }), 'Pip is small and jolly. Details: age old; hair red.');
  assert.strictEqual(FR.fill(tpl, { name: 'Pip', look: { build: 'Vast', age: 'old' } }), 'Pip is hard to miss. Details: age old.');
  assert.strictEqual(FR.fill(tpl, { name: '{mood}', look: {} }), '{mood} is hard to miss.', 'what a player typed is never read as a template');
});

test('an adventure is registered as data and finds its pictures in its pack', () => {
  const FR = P.engine(ROOT);
  const a = FR.adventure('northpole', { id: 'x', cover: 'img/keyart.webp', people: [{ name: 'A', img: 'img/dm_crumb.webp' }], note: 'img/ is where pictures live' });
  assert.strictEqual(a.cover, 'packs/northpole/img/keyart.webp');
  assert.strictEqual(a.people[0].img, 'packs/northpole/img/dm_crumb.webp');
  assert.strictEqual(a.note, 'img/ is where pictures live', 'only whole file names are touched');
  assert.strictEqual(FR.ADVENTURES.northpole, a);
});

/* ---------- the build ---------- */
test('the build writes the manifest, the packs and the page, and leaves drafts out', (t) => {
  const root = sandbox(t), pub = path.join(root, 'public');
  addPack(root, 'side-quest');                                    // a draft, straight from the template
  let r = run('build.js', [], root);
  assert.strictEqual(r.code, 0, r.out);
  const site = json(JSON.parse(read(path.join(ROOT, 'scenarios', 'packs.json'))));
  const m = JSON.parse(read(path.join(pub, 'packs', 'manifest.json')));
  const live = P.check(ROOT, { reach: false }).packs.filter((p) => p.def.meta.visibility !== 'draft');
  assert.strictEqual(m.schema, 1);
  assert.strictEqual(m.default, site.default);
  assert.strictEqual(m.packs[0].id, site.default, 'the default pack is listed first');
  assert.deepStrictEqual(m.packs.map((p) => p.id).sort(), live.map((p) => p.id).sort(), 'every pack that is not a draft, and no draft');
  assert.ok(!fs.existsSync(path.join(pub, 'packs', 'side-quest')), 'a draft is not built');
  m.packs.forEach((e) => {
    const src = live.filter((p) => p.id === e.id)[0].def;
    ['name', 'blurb', 'kind', 'access', 'sku', 'visibility'].forEach((k) => assert.strictEqual(e[k], src.meta[k], e.id + ' ' + k));
    assert.strictEqual(e.version, src.version);
    ['thumb', 'js', 'css', 'adventure'].forEach((k) => {
      if (e[k] === null) { return; }
      const parts = /^(.*)\?v=([0-9a-f]{8})$/.exec(e[k]);
      assert.ok(parts, e.id + ' ' + k + ' carries a hash');
      assert.strictEqual(P.hash(fs.readFileSync(path.join(pub, parts[1]))), parts[2], e.id + ' ' + k + ' hash matches the file');
    });
    /* the pack that ships is the pack that was written, as JSON, plus the hashes of its files */
    const calls = [];
    vm.runInNewContext(read(path.join(pub, 'packs', e.id, 'pack.js')), { FR: { scenario: (d, built) => calls.push([d, built]) } });
    assert.deepStrictEqual(json(calls[0][0]), src, e.id + ' pack.js');
    Object.keys(calls[0][1].assets).forEach((f) => assert.strictEqual(P.hash(fs.readFileSync(path.join(pub, f))), calls[0][1].assets[f], f));
    assert.ok(fs.existsSync(path.join(root, 'scenarios', e.id, 'theme.css')) === (e.css !== null), e.id + ' has a stylesheet exactly when it has a theme.css');
  });
  const page = read(path.join(pub, 'index.html'));
  const inlined = /FR\.manifest\((\{.*?\}), \{/.exec(page);
  assert.ok(inlined, 'the page carries the manifest');
  assert.deepStrictEqual(JSON.parse(inlined[1]), m, 'and it is the same one');
  assert.ok(page.indexOf('<style data-pack="' + m.default + '">') > 0, 'the default pack\'s look is in the page');
  assert.ok(page.indexOf('FR.scenario({"schema":1,"id":"' + m.default + '"') > 0, 'the default pack is in the page');
  ['<!--FONTS-->', '/*CSS*/', '<!--PACKCSS-->', '/*BOOT*/', '<!--LIBS-->', '/*JS*/'].forEach((mark) => assert.ok(page.indexOf(mark) < 0, mark + ' was filled in'));
  assert.ok(page.indexOf('FR.main = function () {') > 0 && page.indexOf('FR.boot();') > page.indexOf('FR.main = function () {'));
  (page.match(/(?:src|href)="((?:vendor|img|packs)\/[^"]+)"/g) || []).forEach((ref) => assert.match(ref, /\?v=[0-9a-f]{8}"$/, ref + ' carries a hash'));
  assert.match(read(path.join(pub, '_headers')), /\/packs\/\*\n {2}Cache-Control: public, max-age=604800/);
  ['offline.html', '.assetsignore'].forEach((f) => assert.ok(!fs.existsSync(path.join(pub, f)), f + ' is no longer built'));

  /* with the flag, the draft is built, and marked so it is never listed */
  r = run('build.js', ['--drafts'], root);
  assert.strictEqual(r.code, 0, r.out);
  const withDrafts = JSON.parse(read(path.join(pub, 'packs', 'manifest.json')));
  const draft = withDrafts.packs.filter((p) => p.id === 'side-quest')[0];
  assert.ok(draft && draft.visibility === 'draft');
  assert.strictEqual(draft.css, null, 'a stylesheet with no rules is not shipped');
  assert.ok(fs.existsSync(path.join(pub, 'packs', 'side-quest', 'pack.js')));
  assert.match(draft.thumb, /^img\/keyart\.webp\?v=/, 'its art is borrowed from the engine');

  /* and building without the flag again takes it away */
  r = run('build.js', [], root);
  assert.ok(!fs.existsSync(path.join(pub, 'packs', 'side-quest')), 'public/ always matches the build');
});

test('a faulty pack stops the build, and a faulty draft does not', (t) => {
  const root = sandbox(t);
  addPack(root, 'broken', (s) => swap("visibility: 'draft'", "visibility: 'public'")(swap('quick: [1, 2, 3, 7, 8]', 'quick: [0, 1, 99]')(s)));
  let r = run('build.js', [], root);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /broken: quiz\.quick/);
  assert.ok(!fs.existsSync(path.join(root, 'public', 'index.html')), 'nothing is written');
  fs.rmSync(path.join(root, 'scenarios', 'broken'), { recursive: true });
  addPack(root, 'broken', swap('quick: [1, 2, 3, 7, 8]', 'quick: [0, 1, 99]'));
  r = run('build.js', [], root);
  assert.strictEqual(r.code, 0, r.out);
  r = run('scripts/validate.js', [], root);
  assert.strictEqual(r.code, 1, 'but validate still says so');
  assert.match(r.out, /FAIL {2}broken/);
});

test('a pack can extend another pack: it inherits the data and finds the files where they are', (t) => {
  const root = sandbox(t), dir = path.join(root, 'scenarios', 'tavern-after-dark');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'scenario.js'), "FR.scenario({ schema: 1, id: 'tavern-after-dark', version: '1.0.0', extends: 'tavern',\n" +
    "  meta: { name: 'After Dark', blurb: 'The same tavern, later', kind: 'one-shot', access: 'free', sku: null, visibility: 'public', credits: [] },\n" +
    "  text: { begin: 'Stay a while' } });\n");
  fs.writeFileSync(path.join(root, 'scenarios', 'packs.json'), JSON.stringify({ default: 'tavern-after-dark', order: [] }));
  const report = P.check(root, { samples: 3000 }), p = report.packs.filter((x) => x.id === 'tavern-after-dark')[0], tv = report.packs.filter((x) => x.id === 'tavern')[0];
  assert.deepStrictEqual(p.errors, []);
  assert.strictEqual(p.theme.text.begin, 'Stay a while');
  assert.strictEqual(p.theme.text.tagline, tv.def.text.tagline);
  assert.deepStrictEqual(Object.keys(p.theme.classes), Object.keys(tv.def.cast.classes));
  assert.strictEqual(p.theme.art.crest('Rogue'), 'packs/tavern/img/crest_rogue.webp', 'the parent\'s pictures stay in the parent');
  assert.strictEqual(p.theme.premades[0].portrait, 'packs/tavern/img/sample_rogue.webp');
  assert.strictEqual(p.theme.name, 'After Dark');
  /* as the default pack, the page carries the pack it is built on as well */
  const r = run('build.js', [], root);
  assert.strictEqual(r.code, 0, r.out);
  const page = read(path.join(root, 'public', 'index.html')), m = JSON.parse(read(path.join(root, 'public', 'packs', 'manifest.json')));
  assert.strictEqual(m.packs[0].extends, 'tavern');
  assert.ok(page.indexOf('FR.scenario({"schema":1,"id":"tavern"') > 0 && page.indexOf('FR.scenario({"schema":1,"id":"tavern"') < page.indexOf('FR.scenario({"schema":1,"id":"tavern-after-dark"'));
  /* a pack that extends itself, or one that is not there, is refused with the reason */
  fs.writeFileSync(path.join(dir, 'scenario.js'), read(path.join(dir, 'scenario.js')).replace("extends: 'tavern'", "extends: 'nowhere'"));
  assert.match(errorsOf(root, 'tavern-after-dark'), /extends: there is no pack called "nowhere"/);
});

/* ---------- the scaffold ---------- */
test('npm run new-scenario makes a draft that validates, builds and is not listed', (t) => {
  const root = sandbox(t);
  let r = run('scripts/new-scenario.js', ['haunted-manor', '--name', "The Baker's Dozen"], root);
  assert.strictEqual(r.code, 0, r.out);
  const dir = path.join(root, 'scenarios', 'haunted-manor'), got = P.load(path.join(dir, 'scenario.js'));
  assert.strictEqual(got.error, '');
  assert.strictEqual(got.def.id, 'haunted-manor');
  assert.strictEqual(got.def.meta.name, "The Baker's Dozen");
  assert.strictEqual(got.def.meta.visibility, 'draft');
  assert.strictEqual(got.def.extends, 'base');
  assert.ok(/TODO/.test(read(path.join(dir, 'scenario.js'))), 'the placeholder wording is marked');
  assert.ok(Object.keys(got.def.art).every((k) => got.def.art[k].indexOf('base:') === 0), 'its art is borrowed from the base by reference');
  assert.ok(fs.existsSync(path.join(dir, 'theme.css')));
  const p = P.check(root, { samples: 4000 }).packs.filter((x) => x.id === 'haunted-manor')[0];
  assert.deepStrictEqual(p.errors, []);
  assert.ok(p.warnings.some((w) => /still say TODO/.test(w)));
  assert.strictEqual(Object.keys(p.theme.text).length, Object.keys(P.engine(ROOT).scenarioDef('base').text).length, 'the copy it did not write comes from the base');
  r = run('scripts/validate.js', ['haunted-manor'], root);
  assert.strictEqual(r.code, 0, r.out);
  /* made public, it is listed after the packs named in packs.json */
  fs.writeFileSync(path.join(dir, 'scenario.js'), read(path.join(dir, 'scenario.js')).replace("visibility: 'draft'", "visibility: 'public'"));
  r = run('build.js', [], root);
  assert.strictEqual(r.code, 0, r.out);
  const m = JSON.parse(read(path.join(root, 'public', 'packs', 'manifest.json')));
  assert.strictEqual(m.packs[m.packs.length - 1].id, 'haunted-manor');
  assert.strictEqual(m.packs[m.packs.length - 1].visibility, 'public');
  /* names that cannot be ids are refused, and nothing is overwritten */
  assert.strictEqual(run('scripts/new-scenario.js', ['Haunted Manor'], root).code, 1);
  assert.strictEqual(run('scripts/new-scenario.js', ['base'], root).code, 1);
  assert.strictEqual(run('scripts/new-scenario.js', ['haunted-manor'], root).code, 1);
});

/* ---------- the validator ---------- */
test('the validator names the pack and the key for the mistakes an author is likely to make', (t) => {
  const root = sandbox(t);
  const cases = [
    ['a function in the pack', swap("blurb: 'TODO one line for the picker'", 'blurb: function () { return 1; }'), null, /scenario\.js .*meta\.blurb is a function/],
    ['an id that is not the folder', swap("id: 'case'", "id: 'other'"), null, /id: is "other" but the folder is scenarios\/case\//],
    ['a bad visibility', swap("visibility: 'draft'", "visibility: 'hidden'"), null, /meta\.visibility: must be one of public, unlisted, draft/],
    ['a paid pack with no product', swap("access: 'free', sku: null", "access: 'paid', sku: null"), null, /meta\.sku: a paid pack must name its product/],
    ['a weight on a trait that does not exist', swap('w: { might: 2, order: -1.5 } }', 'w: { muscle: 2 } }'), null, /quiz\.questions\[0\]\.a\[0\]\.w\.muscle: not a trait/],
    ['quick questions out of range', swap('quick: [1, 2, 3, 7, 8]', 'quick: [0, 1, 2, 3, 40]'), null, /quiz\.quick: 40 is not a question/],
    ['a class with no hit die', swap("-0.7, 0], hd: 12,", "-0.7, 0],"), null, /cast\.classes\.The Brawler\.hd: the hit die must be/],
    ['a sample that names no race', swap("'The Brawler': 'Outlanders'", "'The Brawler': 'Nobody'"), null, /cast\.samples\.The Brawler: "Nobody" is not one of this pack's races/],
    ['a premade of a class that does not exist', swap("{ name: 'Bram Ashdown', cls: 'The Guardian'", "{ name: 'Bram Ashdown', cls: 'The Baker'"), null, /roster\.premades\[1\]\.cls: "The Baker" is not one of this pack's classes/],
    ['too few premades', (s) => s.replace(/ {6}\{ name: 'Aldric Marlowe'[^\n]*\n/, ''), null, /roster\.premades: a pack needs at least 6/],
    ['a picture that is not there', swap("wordmark: 'base:img/wordmark.webp'", "wordmark: 'img/wordmark.webp'"), null, /art\.wordmark: scenarios\/case\/img\/wordmark\.webp does not exist/],
    ['music with no credit', swap("credits: []", "credits: []\n  },\n  music: { intro: ['base:img/seal.webp'], game: [], fight: []"), null, /meta\.credits: this pack plays music/],
    ['a sound the engine does not have', swap("  text: {\n    tagline", "  sfx: { tap: 'kazoo' },\n  text: {\n    tagline"), null, /sfx\.tap: "kazoo" is not one of the engine's sounds/],
    ['too few lines for a natural 20', swap("  text: {\n    tagline", "  fx: { crit: { lines: ['Only one.'] } },\n  text: {\n    tagline"), null, /fx\.crit\.lines: needs at least 6 lines/],
    ['a template that reads something unknown', swap("  text: {\n    tagline", "  prose: { origin: { text: '{name} of {planet}' } },\n  text: {\n    tagline"), null, /prose\.origin\.text: \{planet\} is neither/],
    ['a style rule that is not fenced to the pack', null, { 'theme.css': '.btn { color: red; }\nbody[data-theme="case"] .btn { color: blue; }\n' }, /theme\.css: "\.btn" must start with body\[data-theme="case"\]/],
    ['a stylesheet picture that is not there', null, { 'theme.css': 'body[data-theme="case"] .page { background: url(img/nope.webp); }\n' }, /theme\.css: url\(img\/nope\.webp\) is not in/],
    ['an adventure filed under the wrong pack', swap("credits: []", "credits: []\n  },\n  adventure: 'quest',\n  look: {"), { 'adventure.js': "FR.adventure('elsewhere', { id: 'quest' });\n" }, /adventure\.js: calls FR\.adventure\("elsewhere", \.\.\.\) but this pack is "case"/]
  ];
  cases.forEach(([what, change, extra, expected]) => {
    const dir = addPack(root, 'case', change, extra);
    assert.match(errorsOf(root, 'case'), expected, what);
    fs.rmSync(dir, { recursive: true });
  });
});

test('copy the screens ask for but no pack supplies is caught, not shown as "undefined"', (t) => {
  const keys = P.textKeys(ROOT);
  assert.ok(keys.length >= 79 && keys.indexOf('tagline') >= 0 && keys.indexOf('checkHints') >= 0);
  const base = P.engine(ROOT).scenarioDef('base');
  keys.forEach((k) => assert.ok(base.text[k] !== undefined, 'src/base.js text.' + k));
  /* a screen that starts using a new key fails every pack until the base (or the pack) says it */
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'first-roll-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'src'), path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scenarios'));
  P.list(ROOT).forEach((p) => fs.symlinkSync(p.dir, path.join(root, 'scenarios', p.id)));
  fs.appendFileSync(path.join(root, 'src', 'app.js'), "\n/* a new screen */ var x = tx('brandNewLine');\n");
  const r = P.check(root, { reach: false });
  r.packs.forEach((p) => assert.ok(p.errors.some((e) => /^text\.brandNewLine: missing/.test(e)), p.id));
});

test('reach bounds catch a class nobody can become', (t) => {
  const root = sandbox(t);
  /* two classes with the same profile always tie, and the second never wins: nobody can become it */
  addPack(root, 'lopsided', swap("'The Scholar': { v: [0, 0.2, 1, 0.1, 0, 0, 0.4, 0]", "'The Scholar': { v: [0, 0.5, 0.7, 0, 0.6, 0, -0.2, -0.8]"));
  const p = P.check(root).packs.filter((x) => x.id === 'lopsided')[0];
  assert.ok(p.errors.some((e) => /^quiz\.questions: The Scholar is the result for only/.test(e)), p.errors.join('\n'));
});
