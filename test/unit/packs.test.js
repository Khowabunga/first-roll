/* Scenario packs: every pack in cartridges/ is valid and is data only, the registry lays packs over
   the base as promised, the build writes a correct manifest, drafts stay out, the scaffold makes
   a pack that works, and the validator catches the mistakes an author is likely to make.
   The second part is cartridge spec v2 (docs/PHASE1.md, section 2): the label, strengths, the words
   behind "say what you do", and everything an adventure in format 2 can say to the players' phones.
   The third is cartridge spec v3 (docs/PHASE2.md, section 2): roles, ties, the kit, soundscapes and the
   rules profile in a cartridge; maps, soundscapes, beats, reveals, foes, votes, the difficulty dial and
   minutes in an adventure (format 3).
   Anything that writes files does so in a throwaway copy of the project, never in the real one. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { spawnSync } = require('child_process');
const P = require('../../scripts/lib/packs.js');
const A = require('../../scripts/validate-adventure.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(f, 'utf8');
const json = (v) => JSON.parse(JSON.stringify(v));

/* A throwaway project: the real engine and the real packs by link, and a cartridges/ folder of its own. */
function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-roll-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.symlinkSync(path.join(ROOT, 'src'), path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'cartridges'));
  fs.copyFileSync(path.join(ROOT, 'cartridges', 'packs.json'), path.join(dir, 'cartridges', 'packs.json'));
  P.list(ROOT).forEach((p) => fs.symlinkSync(p.dir, path.join(dir, 'cartridges', p.id)));
  return dir;
}
function run(script, args, root) {
  const env = Object.assign({}, process.env, { FR_ROOT: root }); delete env.FR_DRAFTS; delete env.npm_config_name; delete env.npm_config_adventure;
  const r = spawnSync(process.execPath, [path.join(ROOT, script)].concat(args || []), { env: env, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
/* A pack of our own in the sandbox, made from the scaffold's template and then altered by `change`. The template
   comes in two kinds (docs/PHASE2.md, section 6): the open-5e one, which is what these tests alter unless they
   say otherwise, and the light one (`rules`: 'light'), which is what the scaffold writes when asked nothing. */
function addPack(root, id, change, extra, rules) {
  const dir = path.join(root, 'cartridges', id);
  let text = P.template(rules || 'open-5e').split('__ID__').join(id).split('__NAME__').join('Test Pack');
  text = change ? change(text) : text;
  fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cartridge.js'), text);
  Object.keys(extra || {}).forEach((f) => fs.writeFileSync(path.join(dir, f), extra[f]));
  if (extra && extra['adventure.js']) { fs.copyFileSync(path.join(ROOT, 'scripts', 'template', 'img', 'map.svg'), path.join(dir, 'img', 'map.svg')); }     // the starter adventure's map, as the scaffold gives it
  return dir;
}
const errorsOf = (root, id) => { const p = P.check(root, { samples: 2000 }).packs.filter((x) => x.id === id)[0]; return p.errors.join('\n'); };
const swap = (from, to) => (text) => { assert.ok(text.indexOf(from) >= 0, 'the template still contains ' + from); return text.replace(from, to); };

/* ---------- the packs that ship ---------- */
test('every pack in cartridges/ is valid', () => {
  const r = P.check(ROOT);
  r.packs.forEach((p) => assert.deepStrictEqual(p.errors, [], p.id + ' has faults'));
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.ok);
  assert.ok(r.packs.length >= 2);
});

test('every pack is data only: it survives a trip through JSON unchanged', () => {
  P.list(ROOT).forEach((p) => {
    const calls = [];
    vm.runInNewContext(read(p.file), { FR: { cartridge: (d) => { calls.push(d); } } }, { filename: p.file });
    assert.strictEqual(calls.length, 1, p.id + ' calls FR.cartridge once');
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
  const mini = json(P.load(path.join(ROOT, 'cartridges', 'tavern', 'cartridge.js')).def);
  mini.id = 'mini'; mini.text = { begin: 'Go' }; delete mini.actions; delete mini.fx; delete mini.sfx;
  mini.fx = { crit: { title: 'Yes!' } };
  FR.cartridge(mini);
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
  P.list(ROOT).forEach((p) => FR.cartridge(P.load(p.file).def));
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
  P.list(ROOT).forEach((p) => FR.cartridge(P.load(p.file).def));
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
  const root = sandbox(t), tpl = P.template('open-5e').split('__ID__').join('look').split('__NAME__').join('Look');
  const from = tpl.indexOf('  tokens: {'), to = tpl.indexOf('\n  },', from);
  assert.ok(from > 0 && to > from, 'the template has a tokens block');
  const errs = (text) => { fs.rmSync(path.join(root, 'cartridges', 'look'), { recursive: true, force: true }); addPack(root, 'look', () => tpl.slice(0, from) + '  tokens: { ' + text + ' },' + tpl.slice(to + 5)); return errorsOf(root, 'look'); };
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
  /* format 2: everything new is handed on as written, and a handout's picture is found like any other */
  const two = { schema: 2, id: 'y', brief: { about: 'About.', people: ['a'], endings: ['One.'], tips: ['Tip.'] },
    bible: { people: [{ id: 'a', name: 'A', public: { line: 'Seen about.', when: { flag: 'met' } } }] },
    flow: { chapters: [{ id: 'c', summary: 'In brief.', scenes: [{ id: 's', summary: 'Now.', tries: [{ try: 'Jump', roll: 'Athletics, medium (13)', check: { skill: 'Athletics', target: 13 }, hint: 'Over it', card: false }, { try: 'Wave', roll: 'No roll', check: false }] }] }] },
    quests: [{ id: 'q', text: 'Do it.', from: { seen: 'c' }, done: { flag: 'met' } }], clues: [{ id: 'k', text: 'A clue.', when: { flag: 'met' } }],
    handouts: [{ id: 'h', title: 'A note', text: 'Line one.\nLine two.', img: 'img/story2.webp', at: 'c/s' }, { id: 'b', title: 'Borrowed', img: 'base:img/keyart.webp' }] };
  const b = FR.adventure('northpole', two), want = json(two);
  want.handouts[0].img = 'packs/northpole/img/story2.webp'; want.handouts[1].img = 'img/keyart.webp';
  assert.deepStrictEqual(json(b), want, 'nothing is added, dropped or reworded on the way through');
  assert.strictEqual(two.handouts[0].img, 'img/story2.webp', 'and what the author wrote is not altered');
});

/* ---------- the build ---------- */
test('the build writes the manifest, the packs and the page, and leaves drafts out', (t) => {
  const root = sandbox(t), pub = path.join(root, 'public');
  addPack(root, 'side-quest');                                    // a draft, straight from the template
  let r = run('build.js', [], root);
  assert.strictEqual(r.code, 0, r.out);
  const site = json(JSON.parse(read(path.join(ROOT, 'cartridges', 'packs.json'))));
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
    /* what a cartridge card shows before the cartridge is fetched, and every credit it carries: its own, and the rules credit from the base */
    assert.deepStrictEqual(Object.keys(e.label).sort(), ['dm', 'flags', 'length', 'players', 'rating', 'tone'], e.id + ' label');
    Object.keys(src.meta.label || {}).forEach((k) => assert.deepStrictEqual(e.label[k], src.meta.label[k], e.id + ' label.' + k));
    assert.strictEqual(e.credits.filter((c) => c.type === 'rules').length, 1, e.id + ' carries the rules credit');
    assert.match(e.credits.filter((c) => c.type === 'rules')[0].text, /System Reference Document 5\.2 .* Wizards of the Coast LLC.* Creative Commons Attribution 4\.0 International License.*creativecommons\.org\/licenses\/by\/4\.0\/legalcode/);
    src.meta.credits.forEach((c) => assert.ok(e.credits.some((x) => x.type === c.type && x.text === c.text), e.id + ' keeps its own ' + c.type + ' credit'));
    ['thumb', 'js', 'css', 'adventure'].forEach((k) => {
      if (e[k] === null) { return; }
      const parts = /^(.*)\?v=([0-9a-f]{8})$/.exec(e[k]);
      assert.ok(parts, e.id + ' ' + k + ' carries a hash');
      assert.strictEqual(P.hash(fs.readFileSync(path.join(pub, parts[1]))), parts[2], e.id + ' ' + k + ' hash matches the file');
    });
    /* the pack that ships is the pack that was written, as JSON, plus the hashes of its files */
    const calls = [];
    vm.runInNewContext(read(path.join(pub, 'packs', e.id, 'pack.js')), { FR: { cartridge: (d, built) => calls.push([d, built]) } });
    assert.deepStrictEqual(json(calls[0][0]), src, e.id + ' pack.js');
    Object.keys(calls[0][1].assets).forEach((f) => assert.strictEqual(P.hash(fs.readFileSync(path.join(pub, f))), calls[0][1].assets[f], f));
    assert.ok(fs.existsSync(path.join(root, 'cartridges', e.id, 'theme.css')) === (e.css !== null), e.id + ' has a stylesheet exactly when it has a theme.css');
  });
  const page = read(path.join(pub, 'index.html'));
  const inlined = /FR\.manifest\((\{.*?\}), \{/.exec(page);
  assert.ok(inlined, 'the page carries the manifest');
  assert.deepStrictEqual(JSON.parse(inlined[1]), m, 'and it is the same one');
  assert.ok(page.indexOf('<style data-pack="' + m.default + '">') > 0, 'the default pack\'s look is in the page');
  assert.ok(page.indexOf('FR.cartridge({"schema":1,"id":"' + m.default + '"') > 0, 'the default pack is in the page');
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
  fs.rmSync(path.join(root, 'cartridges', 'broken'), { recursive: true });
  addPack(root, 'broken', swap('quick: [1, 2, 3, 7, 8]', 'quick: [0, 1, 99]'));
  r = run('build.js', [], root);
  assert.strictEqual(r.code, 0, r.out);
  r = run('scripts/validate.js', [], root);
  assert.strictEqual(r.code, 1, 'but validate still says so');
  assert.match(r.out, /FAIL {2}broken/);
});

test('a pack can extend another pack: it inherits the data and finds the files where they are', (t) => {
  const root = sandbox(t), dir = path.join(root, 'cartridges', 'tavern-after-dark');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'cartridge.js'), "FR.cartridge({ schema: 1, id: 'tavern-after-dark', version: '1.0.0', extends: 'tavern',\n" +
    "  meta: { name: 'After Dark', blurb: 'The same tavern, later', kind: 'one-shot', access: 'free', sku: null, visibility: 'public', credits: [] },\n" +
    "  text: { begin: 'Stay a while' } });\n");
  fs.writeFileSync(path.join(root, 'cartridges', 'packs.json'), JSON.stringify({ default: 'tavern-after-dark', order: [] }));
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
  assert.ok(page.indexOf('FR.cartridge({"schema":1,"id":"tavern"') > 0 && page.indexOf('FR.cartridge({"schema":1,"id":"tavern"') < page.indexOf('FR.cartridge({"schema":1,"id":"tavern-after-dark"'));
  /* a pack that extends itself, or one that is not there, is refused with the reason */
  fs.writeFileSync(path.join(dir, 'cartridge.js'), read(path.join(dir, 'cartridge.js')).replace("extends: 'tavern'", "extends: 'nowhere'"));
  assert.match(errorsOf(root, 'tavern-after-dark'), /extends: there is no pack called "nowhere"/);
});

/* ---------- the scaffold ---------- */
test('npm run new-cartridge makes a draft that validates, builds and is not listed', (t) => {
  const root = sandbox(t);
  let r = run('scripts/new-cartridge.js', ['haunted-manor', '--name', "The Baker's Dozen"], root);
  assert.strictEqual(r.code, 0, r.out);
  const dir = path.join(root, 'cartridges', 'haunted-manor'), got = P.load(path.join(dir, 'cartridge.js'));
  assert.strictEqual(got.error, '');
  assert.strictEqual(got.def.id, 'haunted-manor');
  assert.strictEqual(got.def.meta.name, "The Baker's Dozen");
  assert.strictEqual(got.def.meta.visibility, 'draft');
  assert.strictEqual(got.def.extends, 'base');
  assert.ok(/TODO/.test(read(path.join(dir, 'cartridge.js'))), 'the placeholder wording is marked');
  assert.ok(Object.keys(got.def.art).every((k) => got.def.art[k].indexOf('base:') === 0), 'its art is borrowed from the base by reference');
  assert.ok(fs.existsSync(path.join(dir, 'theme.css')));
  const p = P.check(root, { samples: 4000 }).packs.filter((x) => x.id === 'haunted-manor')[0];
  assert.deepStrictEqual(p.errors, []);
  assert.ok(p.warnings.some((w) => /still say TODO/.test(w)));
  assert.strictEqual(Object.keys(p.theme.text).length, Object.keys(P.engine(ROOT).scenarioDef('base').text).length, 'the copy it did not write comes from the base');
  r = run('scripts/validate.js', ['haunted-manor'], root);
  assert.strictEqual(r.code, 0, r.out);
  /* made public, it is listed after the packs named in packs.json */
  fs.writeFileSync(path.join(dir, 'cartridge.js'), read(path.join(dir, 'cartridge.js')).replace("visibility: 'draft'", "visibility: 'public'"));
  r = run('build.js', [], root);
  assert.strictEqual(r.code, 0, r.out);
  const m = JSON.parse(read(path.join(root, 'public', 'packs', 'manifest.json')));
  assert.strictEqual(m.packs[m.packs.length - 1].id, 'haunted-manor');
  assert.strictEqual(m.packs[m.packs.length - 1].visibility, 'public');
  /* names that cannot be ids are refused, and nothing is overwritten */
  assert.strictEqual(run('scripts/new-cartridge.js', ['Haunted Manor'], root).code, 1);
  assert.strictEqual(run('scripts/new-cartridge.js', ['base'], root).code, 1);
  assert.strictEqual(run('scripts/new-cartridge.js', ['haunted-manor'], root).code, 1);
});

/* ---------- the validator ---------- */
test('the validator names the pack and the key for the mistakes an author is likely to make', (t) => {
  const root = sandbox(t);
  const cases = [
    ['a function in the pack', swap("blurb: 'TODO one line for the picker'", 'blurb: function () { return 1; }'), null, /cartridge\.js .*meta\.blurb is a function/],
    ['an id that is not the folder', swap("id: 'case'", "id: 'other'"), null, /id: is "other" but the folder is cartridges\/case\//],
    ['a bad visibility', swap("visibility: 'draft'", "visibility: 'hidden'"), null, /meta\.visibility: must be one of public, unlisted, draft/],
    ['a paid pack with no product', swap("access: 'free', sku: null", "access: 'paid', sku: null"), null, /meta\.sku: a paid pack must name its product/],
    ['a weight on a trait that does not exist', swap('w: { might: 2, order: -1.5 } }', 'w: { muscle: 2 } }'), null, /quiz\.questions\[0\]\.a\[0\]\.w\.muscle: not a trait/],
    ['quick questions out of range', swap('quick: [1, 2, 3, 7, 8]', 'quick: [0, 1, 2, 3, 40]'), null, /quiz\.quick: 40 is not a question/],
    ['a class with no hit die', swap("-0.7, 0], hd: 12,", "-0.7, 0],"), null, /cast\.classes\.The Brawler\.hd: the hit die must be/],
    ['a sample that names no race', swap("'The Brawler': 'Outlanders'", "'The Brawler': 'Nobody'"), null, /cast\.samples\.The Brawler: "Nobody" is not one of this pack's races/],
    ['a premade of a class that does not exist', swap("{ name: 'Bram Ashdown', cls: 'The Guardian'", "{ name: 'Bram Ashdown', cls: 'The Baker'"), null, /roster\.premades\[1\]\.cls: "The Baker" is not one of this pack's classes/],
    ['too few premades', (s) => s.replace(/ {6}\{ name: 'Aldric Marlowe'[^\n]*\n/, ''), null, /roster\.premades: a pack needs at least 6/],
    ['a picture that is not there', swap("wordmark: 'base:img/wordmark.webp'", "wordmark: 'img/wordmark.webp'"), null, /art\.wordmark: cartridges\/case\/img\/wordmark\.webp does not exist/],
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
  fs.mkdirSync(path.join(root, 'cartridges'));
  P.list(ROOT).forEach((p) => fs.symlinkSync(p.dir, path.join(root, 'cartridges', p.id)));
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

/* ================= cartridge spec v2: the label, strengths, "say what you do", and adventures in format 2 ================= */
const engineWith = () => { const FR = P.engine(ROOT); P.list(ROOT).forEach((p) => FR.cartridge(P.load(p.file).def)); return FR; };
const NP = path.join(ROOT, 'cartridges', 'northpole'), TEMPLATE = path.join(ROOT, 'scripts', 'template');
/* the scaffold's starter adventure as data: a fresh copy every time, for a test to break */
function starter(id) {
  const calls = [], text = read(path.join(TEMPLATE, 'adventure.js')).split('__ID__').join(id || 'starter').split('__NAME__').join('Starter');
  vm.runInNewContext(text, { FR: { adventure: (i, d) => { calls.push(d); } } });
  assert.strictEqual(calls.length, 1);
  return json(calls[0]);
}
/* every scene an adventure has: [where it is, the scene] */
const scenesOf = (adv) => [].concat(...adv.flow.chapters.map((c) => c.scenes.map((s) => [c.id + '/' + s.id, s])), (adv.flow.interludes || []).map((s) => [s.id, s]));
/* an adventure with everything format 2 added taken back out: what a format 1 file looks like */
function asFormat1(adv) {
  const a = json(adv); a.schema = 1;
  ['brief', 'quests', 'clues', 'handouts'].forEach((k) => delete a[k]);
  a.bible.people.forEach((p) => delete p.public);
  a.flow.chapters.concat(a.flow.hubs || []).forEach((c) => delete c.summary);
  scenesOf(a).forEach(([, s]) => { delete s.summary; (s.tries || []).forEach((t) => { delete t.check; delete t.card; delete t.hint; }); });
  return asFormat2(a, 1);
}
/* an adventure with everything format 3 added taken back out: what a format 2 file looks like */
const SCENE3 = ['map', 'sound', 'beats', 'reveal', 'foes', 'vote', 'easier', 'harder', 'minutes'];
function asFormat2(adv, schema) {
  const a = json(adv); a.schema = schema || 2;
  delete a.maps; delete a.foes;
  a.flow.chapters.concat(a.flow.hubs || []).forEach((c) => SCENE3.forEach((k) => delete c[k]));
  scenesOf(a).forEach(([, s]) => SCENE3.forEach((k) => delete s[k]));
  return a;
}
/* a scene as the DM's screen would publish it to the table, with everything switched on at once (docs/PHASE1.md 1.1) */
function sceneState(adv, chapter, s) {
  return { id: s.id, chapter: chapter.title, title: s.title, summary: s.summary || chapter.summary || '', img: s.img || chapter.img || '',
    cards: (s.tries || []).map((t, i) => ({ t: t, i: i })).filter((x) => x.t.card !== false).map((x) => ({ id: 't' + x.i, label: x.t.try, hint: x.t.hint || '' })),
    quests: (adv.quests || []).map((q) => ({ id: q.id, text: q.text, done: false })),
    clues: (adv.clues || []).map((c) => ({ id: c.id, text: c.text })),
    people: adv.bible.people.filter((p) => p.public).map((p) => ({ id: p.id, name: p.name, line: p.public.line, img: p.img || '' })),
    story: [].concat(...scenesOf(adv).map(([, x]) => x.outcomes.map((o) => o.log).filter(Boolean))).slice(-30) };
}

test('FR.checkFor: what a player typed suggests the check it most likely comes down to', () => {
  const FR = engineWith(); FR.useTheme('tavern');
  const twenty = [
    ['I swing from the chandelier', 'Acrobatics'], ['I want to sneak past the guard', 'Stealth'], ['Can I pick the lock on the chest?', 'Sleight of Hand'],
    ['I try to convince the troll to let us in', 'Persuasion'], ['I lie and say we are the cleaners', 'Deception'], ['Is he lying to us?', 'Insight'],
    ['I climb up the side of the tower', 'Athletics'], ['I search the desk for clues', 'Investigation'], ['I look around the room', 'Perception'],
    ['I LISTEN AT THE DOOR!!', 'Perception'], ['I bandage her arm', 'Medicine'], ['Do I remember any legends about this place?', 'History'],
    ['I try to calm the frightened horse', 'Animal Handling'], ['I sing a song to cheer everyone up', 'Performance'], ['I glare at him until he backs down', 'Intimidation'],
    ['I follow the footprints in the snow', 'Survival'], ['What kind of mushroom is that?', 'Nature'], ['I say a prayer at the shrine', 'Religion'],
    ['Is that glowing thing magic?', 'Arcana'], ['I shove the cart out of the way', 'Athletics']
  ];
  assert.strictEqual(twenty.length, 20);
  assert.strictEqual(new Set(twenty.map((c) => c[1])).size, 18, 'between them, the twenty reach every skill the rules know');
  twenty.forEach(([said, skill]) => {
    const got = FR.checkFor(said);
    assert.ok(got, '"' + said + '" suggests something');
    assert.strictEqual(got.skill, skill, said);
    assert.ok(FR.SKILLS[got.skill], 'a skill the rules know');
    assert.match(got.why, /^That comes down to [a-z].+\.$/, 'a plain reason: ' + got.why);
    assert.ok(FR.theme.intent.words[got.word] === skill, 'and the word that gave it away: ' + got.word);
  });
  assert.deepStrictEqual(FR.checkFor('I swing from the chandelier'), { skill: 'Acrobatics', word: 'swing', why: 'That comes down to being nimble.' });
  /* the forms a word is typed in */
  [['She is sneaking along the wall', 'Stealth'], ['He grabbed the rope', 'Athletics'], ['We are hiding in the barrels', 'Stealth'], ['Kira tries climbing it', 'Athletics'], ['He tumbles down the stairs on purpose', 'Acrobatics']]
    .forEach(([said, skill]) => assert.strictEqual(FR.checkFor(said).skill, skill, said));
  /* a phrase says more than a word, and between equals the one said first wins */
  assert.strictEqual(FR.checkFor('I look for a hidden door').skill, 'Investigation');
  assert.strictEqual(FR.checkFor('I look at the door').skill, 'Perception');
  assert.strictEqual(FR.checkFor('I sneak up and steal the key').skill, 'Stealth');
  assert.strictEqual(FR.checkFor('I steal the key and sneak away').skill, 'Sleight of Hand');
  /* nothing it knows: say so, and leave it to the DM */
  ['', '   ', 'Hello there', 'I do the thing', 42, null, undefined, {}].forEach((said) => assert.strictEqual(FR.checkFor(said), null, JSON.stringify(said)));
  /* pure: the same answer every time, and nothing in the theme is touched */
  const before = JSON.stringify(FR.theme.intent);
  assert.deepStrictEqual(FR.checkFor('I swing from the chandelier'), FR.checkFor('I swing from the chandelier'));
  assert.strictEqual(JSON.stringify(FR.theme.intent), before);
  /* a cartridge adds its own words, and the reason is said in its own voice */
  const np = FR.THEMES.northpole;
  assert.strictEqual(FR.checkFor('I skate across the canal'), null, 'Tavern Night has no word for it');
  assert.deepStrictEqual(FR.checkFor('I skate across the canal', np), { skill: 'Acrobatics', word: 'skate', why: 'That comes down to being nimble.' });
  assert.strictEqual(FR.checkFor('I sneak past the troll', np).why, 'That comes down to being quiet as falling snow.');
  assert.strictEqual(FR.checkFor('I climb the wall', np).skill, 'Athletics', 'and it keeps every word the base knows');
  /* a cartridge can move a word, drop one with null, and add a phrase */
  const own = json(P.load(path.join(ROOT, 'cartridges', 'tavern', 'cartridge.js')).def);
  own.id = 'own'; own.intent = { why: 'A matter of {why}.', words: { swing: 'Athletics', climb: null, 'ring the bell': 'Performance' } };
  FR.cartridge(own);
  assert.deepStrictEqual(FR.checkFor('I swing from the chandelier', FR.THEMES.own), { skill: 'Athletics', word: 'swing', why: 'A matter of being strong.' });
  assert.strictEqual(FR.checkFor('I climb', FR.THEMES.own), null);
  assert.strictEqual(FR.checkFor('I ring the bell', FR.THEMES.own).skill, 'Performance');
  /* the theme in play is the one read when none is named */
  FR.useTheme('own'); assert.strictEqual(FR.checkFor('I climb'), null);
  FR.useTheme('tavern'); assert.strictEqual(FR.checkFor('I climb').skill, 'Athletics');
});

test('the label, the credits and the strengths reach the theme, with the base behind them', () => {
  const FR = engineWith(), base = FR.scenarioDef('base'), np = FR.THEMES.northpole, tv = FR.THEMES.tavern;
  assert.deepStrictEqual(json(np.label), { length: 'About 2½ hours', players: '3 to 6 players', tone: 'Silly and warm', dm: 'Good for a first-time DM', rating: 'everyone', flags: ['Toilet humor'] });
  assert.deepStrictEqual(json(tv.label), { length: 'As long as you like', players: '2 to 8 players', tone: 'Classic fantasy', dm: 'Bring your own story', rating: 'everyone', flags: ['Fantasy fighting'] });
  /* the rules credit comes first, from the base; a cartridge's own follow; the music line is still only the music */
  const rules = base.meta.credits.filter((c) => c.type === 'rules');
  assert.strictEqual(rules.length, 1);
  assert.deepStrictEqual(json(tv.credits), json(rules));
  assert.deepStrictEqual(json(np.credits), json(rules.concat(P.load(path.join(NP, 'cartridge.js')).def.meta.credits)));
  assert.ok(np.music.credit.indexOf('Kevin MacLeod') >= 0 && np.music.credit.indexOf('System Reference') < 0);
  /* both cartridges: three strengths a class, short and in plain words */
  const jargon = /\b(DC|d20|d\d+|modifier|proficien\w*|saving throw|hit points?|HP|AC|STR|DEX|CON|INT|WIS|CHA|bonus|skill check|ability|initiative)\b/;
  [np, tv].forEach((t) => {
    assert.strictEqual(Object.keys(t.classes).length, 12);
    Object.keys(t.classes).forEach((c) => {
      const lines = t.classes[c].strengths;
      assert.strictEqual(lines.length, 3, t.id + ' ' + c);
      lines.forEach((line) => { assert.ok(line.length <= P.STRENGTHS.max && /[.!]$/.test(line), t.id + ' ' + c + ': ' + line); assert.ok(!jargon.test(line), 'plain words: ' + line); });
      assert.strictEqual(new Set(lines).size, 3);
    });
    assert.deepStrictEqual(json(t.classes[Object.keys(t.classes)[0]].strengths), P.load(path.join(ROOT, 'cartridges', t.id, 'cartridge.js')).def.cast.classes[Object.keys(t.classes)[0]].strengths, 'the cartridge\'s own, not the stand-ins');
  });
  /* a cartridge that says none of it: the base's label whole, and a sentence for each of a class's first three skills */
  const bare = json(P.load(path.join(ROOT, 'cartridges', 'tavern', 'cartridge.js')).def);
  bare.id = 'bare'; delete bare.meta.label; Object.keys(bare.cast.classes).forEach((c) => delete bare.cast.classes[c].strengths);
  FR.cartridge(bare);
  const b = FR.THEMES.bare, say = base.cast.skillStrengths;
  assert.deepStrictEqual(json(b.label), base.meta.label);
  assert.deepStrictEqual(json(b.classes.Rogue.strengths), [say.Stealth, say['Sleight of Hand'], say.Deception]);
  Object.keys(b.classes).forEach((c) => assert.strictEqual(b.classes[c].strengths.length, 3, c));
  Object.keys(FR.SKILLS).forEach((sk) => assert.ok(say[sk] && say[sk].length <= P.STRENGTHS.max, 'the base has a sentence for ' + sk));
  /* a label is laid over the base's key by key, and a cartridge may reword a skill's sentence */
  const some = json(bare); some.id = 'some'; some.meta.label = { tone: 'Grim', flags: ['Spiders'] }; some.cast.skillStrengths = { Stealth: 'Nobody hears you coming.' };
  FR.cartridge(some);
  assert.deepStrictEqual(json(FR.THEMES.some.label), Object.assign({}, base.meta.label, { tone: 'Grim', flags: ['Spiders'] }));
  assert.deepStrictEqual(json(FR.THEMES.some.classes.Rogue.strengths), ['Nobody hears you coming.', say['Sleight of Hand'], say.Deception]);
  assert.deepStrictEqual(base.meta.label.flags, [], 'and the base is never written to');
  /* health as words: plain in the base, and a cartridge says them its own way */
  ['healthFine', 'healthHurt', 'healthTrouble'].forEach((k) => { assert.ok(base.text[k] && tv.text[k] === base.text[k]); assert.ok(np.text[k] && np.text[k] !== base.text[k], 'North Pole says ' + k + ' its own way'); });
});

test('a cartridge that uses none of the new fields is still valid, and a format 1 adventure still checks clean', (t) => {
  const root = sandbox(t), cut = (text, re, to, times) => { const n = (text.match(re) || []).length; assert.strictEqual(n, times, re + ' matched ' + n + ' times in the template'); return text.replace(re, to); };
  addPack(root, 'plain', (text) => {
    text = cut(text, / {4}label: \{[\s\S]*?\n {4}\},\n/g, '', 1);
    text = cut(text, / {8}role: '[^']*', kit: \[[^\]]*\],\n/g, '', 12);          // spec v3: no role or kit on a class (the rest of v3 goes below)
    text = cut(text, /,\n {8}strengths: \[[^\n]*\] \}/g, ' }', 12);
    text = cut(text, / {2}intent: \{[\s\S]*?\n {2}\},\n/g, '', 1);
    /* and none of spec v3 either: no roles, no role or kit on a class, no ties, no kit, no soundscapes, no rules line */
    text = cut(text, / {4}roles: \{[\s\S]*?\n {4}\},\n/g, '', 1);
    text = cut(text, / {2}ties: \{[\s\S]*?\n {2}\},\n/g, '', 1);
    text = cut(text, / {2}kit: \{[\s\S]*?\n {2}\},\n/g, '', 1);
    text = cut(text, / {2}sound: \{[\s\S]*?\n {2}\},\n/g, '', 1);
    text = cut(text, / {2}rules: 'open-5e',\n/g, '', 1);
    return cut(text, /,\n[^\n]*\n[^\n]*\n {4}healthFine: [^\n]*\n/g, '\n', 1);
  });
  const def = P.load(path.join(root, 'cartridges', 'plain', 'cartridge.js')).def;
  assert.ok(def.meta.label === undefined && def.intent === undefined && def.text.healthFine === undefined && Object.keys(def.cast.classes).every((c) => def.cast.classes[c].strengths === undefined));
  assert.ok(def.cast.roles === undefined && def.ties === undefined && def.kit === undefined && def.sound === undefined && def.rules === undefined && Object.keys(def.cast.classes).every((c) => def.cast.classes[c].role === undefined && def.cast.classes[c].kit === undefined));
  const r = P.check(root, { samples: 2000 }), p = r.packs.filter((x) => x.id === 'plain')[0], base = r.FR.scenarioDef('base');
  assert.deepStrictEqual(p.errors, []);
  assert.deepStrictEqual(json(p.theme.label), base.meta.label);
  assert.strictEqual(p.theme.credits.length, 1);
  assert.strictEqual(p.theme.classes['The Sneak'].strengths[0], base.cast.skillStrengths.Stealth);
  assert.strictEqual(r.FR.checkFor('I climb the wall', p.theme).skill, 'Athletics');
  assert.strictEqual(p.theme.text.healthHurt, 'Hurt');
  assert.deepStrictEqual(p.warnings.filter((w) => !/TODO/.test(w)), [], 'and nothing to warn about');
  /* spec v3 with nothing written: the base's six roles, each class filed under the role of its strongest trait, the
     base's bonds, hooks and voices, no items, a plain hero token, the engine's seven soundscapes and today's rules */
  assert.deepStrictEqual(json(p.theme.roles), base.cast.roles);
  assert.deepStrictEqual(Object.keys(p.theme.classes).map((c) => p.theme.classes[c].role),
    ['Protector', 'Talker', 'Healer', 'Scout', 'Protector', 'Trickster', 'Protector', 'Scout', 'Trickster', 'Talker', 'Thinker', 'Thinker']);
  Object.keys(p.theme.classes).forEach((c) => assert.deepStrictEqual(json(p.theme.classes[c].kit), [], c));
  assert.deepStrictEqual(json(p.theme.ties.bonds), base.ties.bonds);
  assert.deepStrictEqual(json(p.theme.ties.hooks), base.ties.hooks.map((h) => ({ id: h.id, text: h.text, roles: h.roles || [] })));
  assert.deepStrictEqual(json(p.theme.ties.voices), base.ties.voices);
  assert.deepStrictEqual(json(p.theme.kit), { items: {}, token: base.kit.token });
  assert.deepStrictEqual(Object.keys(p.theme.beds), r.FR.AMBIENCE.slice());
  assert.strictEqual(p.theme.rules, 'open-5e');
  /* adventures: format 1 is still read, and says nothing about the parts it never had */
  [P.loadAdventure(path.join(NP, 'adventure.js')).def, starter()].forEach((adv) => {
    const old = asFormat1(adv), found = A.check(old, { images: NP });
    assert.strictEqual(old.schema, 1);
    assert.ok(JSON.stringify(old).length < JSON.stringify(adv).length && !/"(summary|check|card|hint|public|quests|clues|handouts|brief|maps|foes|map|sound|beats|reveal|vote|easier|harder|minutes)":/.test(JSON.stringify(old)));
    assert.deepStrictEqual(found.slice(), [], 'a format 1 adventure is valid');
    assert.deepStrictEqual(found.warnings, [], 'and is not nagged about checks it could not have had');
    /* and it reaches the DM's runner as it always did: as written, with its pictures found */
    const FR = P.engine(ROOT), given = json(FR.adventure('northpole', old)), want = json(old);
    (function find(a, b) { Object.keys(a).forEach((k) => { if (typeof a[k] === 'string') { if (/^(base:)?img\//.test(a[k])) { b[k] = FR.asset('northpole', a[k]); } } else if (a[k] && typeof a[k] === 'object') { find(a[k], b[k]); } }); })(old, want);
    assert.deepStrictEqual(given, want);
  });
  /* but a format 1 file that reaches for a format 2 part is told how to switch it on */
  const mixed = asFormat1(starter()); mixed.quests = [{ id: 'q', text: 'Find the key.' }]; mixed.flow.chapters[0].scenes[0].summary = 'Now.';
  const told = A.check(mixed, {}).join('\n');
  assert.match(told, /adventure: has "quests", which belongs to format 2\. To use it, change schema: 1 to schema: 2/);
  assert.match(told, /scenes\[taproom\]: has "summary", which belongs to format 2/);
  assert.match(A.check(Object.assign(starter(), { schema: 4 }), {}).join('\n'), /^schema: must be 3, the current format \(1 and 2 are still read/m);
  /* format 2 is still read too: the same adventures with everything format 3 added taken out check clean, without a word */
  [P.loadAdventure(path.join(NP, 'adventure.js')).def, starter()].forEach((adv) => {
    const two = asFormat2(adv), found = A.check(two, { images: NP });
    assert.strictEqual(two.schema, 2);
    assert.deepStrictEqual(found.slice(), [], 'a format 2 adventure is valid');
    assert.deepStrictEqual(found.warnings, []);
  });
});

test('North Pole fills in every part of format 2, and any scene built from it fits what the table accepts', () => {
  const adv = json(P.loadAdventure(path.join(NP, 'adventure.js')).def), L = A.LIMITS, found = A.check(adv, { images: NP });
  assert.strictEqual(adv.schema, 3, 'format 3 now: format 2 and everything in it, plus what the whole table shares');
  assert.deepStrictEqual(found.slice(), []);
  assert.deepStrictEqual(found.warnings, [], 'not one warning');
  /* the brief: three people, how it can end, three tips */
  assert.deepStrictEqual(adv.brief.people, ['crumb', 'grumbleknot', 'fizzwick']);
  assert.ok(adv.brief.about.length > 200 && adv.brief.endings.length >= 3 && adv.brief.tips.length === 3);
  /* a summary for every chapter, scene, interlude and hub */
  const scenes = scenesOf(adv), tries = [].concat(...scenes.map(([, s]) => s.tries || []));
  adv.flow.chapters.concat(adv.flow.hubs).forEach((c) => assert.ok(c.summary && c.summary.length <= L.summary, c.id));
  scenes.forEach(([at, s]) => assert.ok(s.summary && s.summary.length <= L.summary, at));
  assert.strictEqual(scenes.length, 20);
  /* every try says what to roll, says there is nothing to roll, or is left to the DM's free words */
  const rolled = tries.filter((x) => x.check), none = tries.filter((x) => x.check === false), hidden = tries.filter((x) => x.card === false);
  assert.strictEqual(tries.length, 61);
  assert.deepStrictEqual([rolled.length, none.length, tries.length - rolled.length - none.length, hidden.length], [44, 16, 1, 14]);
  rolled.forEach((x) => { assert.ok([10, 13, 16].indexOf(x.check.target) >= 0, x.try); assert.ok(x.roll.indexOf('(' + x.check.target + ')') >= 0 && x.roll.indexOf(x.check.skill) >= 0 || /clever|Trade|fitting/.test(x.roll), 'the check agrees with the free words: ' + x.try + ' / ' + x.roll); });
  none.forEach((x) => assert.match(x.roll, /No roll|no roll/, x.try));
  /* quests: the main goal and each errand; clues; a public line for all ten people; four to six handouts where they belong */
  assert.deepStrictEqual(adv.quests.map((q) => q.id), ['why', 'batch', 'laugh', 'flake', 'coal', 'culprit', 'machine']);
  assert.strictEqual(adv.clues.length, 18);
  assert.strictEqual(adv.bible.people.length, 10);
  adv.bible.people.forEach((p) => { assert.ok(p.public && p.public.line.length <= L.line && p.public.when, p.id); assert.ok(p.public.line.indexOf(p.secret.slice(0, 30)) < 0); });
  assert.ok(adv.handouts.length >= 4 && adv.handouts.length <= 6);
  assert.deepStrictEqual(adv.handouts.map((h) => h.at), ['arrival/box', 'arrival/crumb', 'errands', 'laugh/nook', 'coal/office', 'coal/cellar']);
  assert.strictEqual(adv.handouts.filter((h) => h.img).length, 3, 'three use pictures the cartridge already had');
  /* the scene the DM's screen would publish, with every quest, clue and person switched on at once, for every scene */
  adv.flow.chapters.forEach((c) => c.scenes.forEach((s) => {
    const st = sceneState(adv, c, s), at = c.id + '/' + s.id;
    assert.ok(st.id.length <= L.id && st.chapter.length <= L.title && st.title.length <= L.title && st.summary.length <= L.summary, at);
    assert.ok(st.cards.length <= L.cards, at + ' cards');
    st.cards.forEach((x) => assert.ok(x.label.length <= L.label && x.hint.length <= L.hint, at + ' ' + x.label));
    assert.ok(st.quests.length <= L.quests && st.quests.every((q) => q.id.length <= L.id && q.text.length <= L.quest));
    assert.ok(st.clues.length <= L.clues && st.clues.every((q) => q.id.length <= L.id && q.text.length <= L.clue));
    assert.ok(st.people.length <= L.people && st.people.every((q) => q.id.length <= L.id && q.name.length <= L.name && q.line.length <= L.line));
    assert.ok(st.story.length <= 30 && st.story.every((line) => line.length <= L.log));
    assert.ok(Buffer.byteLength(JSON.stringify(st)) < 24 * 1024, at + ' is ' + Buffer.byteLength(JSON.stringify(st)) + ' bytes');
  }));
  /* and a roll the DM asks for from a try fits too: the label, and the words for "it works" and "it does not" */
  rolled.forEach((x) => assert.ok(x.try.length <= L.label && x.yes.length <= L.say && x.no.length <= L.say, x.try));
});

test('the adventure checks: each one catches a deliberately broken copy, and says where and what to do', () => {
  const long = (n) => 'x'.repeat(n), inn = (a) => a.flow.chapters[0], tap = (a) => inn(a).scenes[0], door = (a) => inn(a).scenes[1];
  assert.deepStrictEqual(A.check(starter(), { images: TEMPLATE }).slice(), [], 'the starter is sound to begin with');
  assert.deepStrictEqual(A.check(starter(), { images: TEMPLATE }).warnings, []);
  const errors = [
    /* the brief */
    ['a brief with no "about"', (a) => { delete a.brief.about; }, /^brief: needs "about": what the adventure is about/m],
    ['a brief that goes on', (a) => { a.brief.about = long(801); }, /^brief\.about: is 801 characters long\. .* 800 is all that fits: shorten it by 1$/m],
    ['a brief naming someone who is not in the story', (a) => { a.brief.people = ['keeper', 'nobody']; }, /^brief\.people\[1\]: names "nobody", who is not in bible\.people\. Use the id of one of: keeper, ember$/m],
    ['brief people that is not a list', (a) => { a.brief.people = 'keeper'; }, /^brief\.people: must be a list of the ids/m],
    ['an empty ending', (a) => { a.brief.endings[1] = '  '; }, /^brief\.endings\[1\]: is empty\. Write one way the story can end/m],
    ['a tip that is a number', (a) => { a.brief.tips[0] = 7; }, /^brief\.tips\[0\]: must be text/m],
    ['seven tips', (a) => { a.brief.tips = [1, 2, 3, 4, 5, 6, 7].map((n) => 'Tip ' + n + '.'); }, /^brief\.tips: has 7 entries\. A brief is one page: keep it to 6 at most$/m],
    /* summaries */
    ['an empty scene summary', (a) => { tap(a).summary = ''; }, /^flow\.chapters\[inn\]\.scenes\[taproom\]\.summary: is empty\. Write what players are told is happening in this scene/m],
    ['a chapter summary too long for a phone', (a) => { inn(a).summary = long(430); }, /^flow\.chapters\[inn\]\.summary: is 430 characters long\. .* 400 is all that fits: shorten it by 30$/m],
    ['a summary that is not text', (a) => { door(a).summary = ['One.', 'Two.']; }, /^flow\.chapters\[inn\]\.scenes\[door\]\.summary: must be text/m],
    /* checks */
    ['a check on a skill the rules do not know', (a) => { tap(a).tries[1].check.skill = 'Listening'; }, /^flow\.chapters\[inn\]\.scenes\[taproom\]\.tries\[1\] \("Listen at the cellar door"\)\.check\.skill: is "Listening", which is not a skill the rules know\. Use one of: Athletics, Acrobatics, .*Persuasion$/m],
    ['a check with no skill', (a) => { delete tap(a).tries[1].check.skill; }, /tries\[1\] \("Listen at the cellar door"\)\.check: needs "skill": the skill to roll\. One of: Athletics/],
    ['a target of 0', (a) => { tap(a).tries[1].check.target = 0; }, /tries\[1\] \("Listen at the cellar door"\)\.check\.target: must be a whole number from 1 to 40 .*found 0$/m],
    ['a target of 41', (a) => { tap(a).tries[1].check.target = 41; }, /\.check\.target: must be a whole number from 1 to 40 .*found 41$/m],
    ['a target that is not whole', (a) => { tap(a).tries[1].check.target = 12.5; }, /\.check\.target: must be a whole number from 1 to 40 .*found 12\.5$/m],
    ['a target written as words', (a) => { tap(a).tries[1].check.target = 'medium'; }, /\.check\.target: must be a whole number from 1 to 40 .*found "medium"$/m],
    ['a check with no target', (a) => { delete tap(a).tries[1].check.target; }, /\.check: needs "target": the number the roll has to reach/],
    ['a check written as a sentence', (a) => { tap(a).tries[1].check = 'Perception 10'; }, /\.check: must say which skill to roll and the number to reach, like \{ skill: "Athletics", target: 13 \}, or be false/],
    ['a check with something extra in it', (a) => { tap(a).tries[1].check.dc = 10; }, /\.check: has "dc", which is not part of an adventure \(check may have: skill, target\)/],
    /* cards and hints */
    ['card that is not true or false', (a) => { tap(a).tries[3].card = 'no'; }, /tries\[3\] \("Lift the key from her apron pocket"\)\.card: must be true or false\. card: false keeps this try off the players' phones/],
    ['an empty hint', (a) => { tap(a).tries[1].hint = ' '; }, /tries\[1\] \("Listen at the cellar door"\)\.hint: is empty\. Write the small line under this action card/],
    ['a hint too long for a card', (a) => { tap(a).tries[1].hint = long(121); }, /\.hint: is 121 characters long\. .* 120 is all that fits: shorten it by 1$/m],
    ['nine cards in one scene', (a) => { const t = tap(a).tries[0]; tap(a).tries = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => Object.assign({}, t, { try: 'Try ' + n })); }, /^flow\.chapters\[inn\]\.scenes\[taproom\]\.tries: would put 9 action cards on a phone, and a scene can show 8\. Give 1 of the tries card: false/m],
    ['a scene title longer than a phone shows', (a) => { tap(a).title = long(81); }, /scenes\[taproom\]\.title: is 81 characters long\. A scene's title can be 80 at most/],
    /* quests */
    ['a quest with no words', (a) => { delete a.quests[0].text; }, /^quests\[knock\]: needs "text": the quest as players read it on the quest board$/m],
    ['an empty quest', (a) => { a.quests[0].text = ''; }, /^quests\[knock\]\.text: is empty\./m],
    ['a quest too long for the board', (a) => { a.quests[0].text = long(161); }, /^quests\[knock\]\.text: is 161 characters long\. .* 160 is all that fits/m],
    ['a quest that starts on a flag nobody listed', (a) => { a.quests[1].from = { flag: 'kee' }; }, /^quests\[door\]\.from: uses the flag "kee", which is not listed in flags$/m],
    ['a quest done by a value the flag never takes', (a) => { a.quests[0].done = { flag: 'met', is: 'pal' }; }, /^quests\[knock\]\.done: compares the flag "met" with "pal", which is not one of its values \("friend", "foe"\)$/m],
    ['a quest done when a chapter that does not exist is seen', (a) => { a.quests[0].done = { seen: 'cellar' }; }, /^quests\[knock\]\.done\.seen: points at "cellar", but there is no chapter, interlude or hub with that id$/m],
    ['a quest condition that is not one', (a) => { a.quests[0].done = 'met'; }, /^quests\[knock\]\.done: must be a condition such as/m],
    ['two quests with one id', (a) => { a.quests[1].id = 'knock'; }, /^quests\[knock\]: this id is used twice$/m],
    ['a quest id too long to send', (a) => { a.quests[0].id = long(41); }, /\.id: is 41 characters long\. An id can be 40 at most/],
    ['thirteen quests', (a) => { a.quests = Array.from({ length: 13 }, (x, i) => ({ id: 'q' + i, text: 'Quest ' + i + '.' })); }, /^quests: lists 13 quests, and the quest board on a phone holds 12\. Take 1 out/m],
    ['a quest with something extra', (a) => { a.quests[0].when = { flag: 'key' }; }, /^quests\[knock\]: has "when", which is not part of an adventure \(quest may have: id, text, from, done\)$/m],
    /* clues */
    ['an empty clue', (a) => { a.clues[0].text = ''; }, /^clues\[pocket\]\.text: is empty\./m],
    ['a clue too long', (a) => { a.clues[0].text = long(201); }, /^clues\[pocket\]\.text: is 201 characters long\. .* 200 is all that fits/m],
    ['a clue with a condition on an unknown flag', (a) => { a.clues[1].when = { all: [{ flag: 'met' }, { flag: 'seen_it' }] }; }, /^clues\[ember\]\.when\.all\[1\]: uses the flag "seen_it", which is not listed in flags$/m],
    ['twenty-one clues', (a) => { a.clues = Array.from({ length: 21 }, (x, i) => ({ id: 'c' + i, text: 'Clue ' + i + '.' })); }, /^clues: lists 21 clues, and a phone holds 20\. Take 1 out/m],
    /* who's who */
    ['a public line that is empty', (a) => { a.bible.people[0].public.line = ''; }, /^bible\.people\[keeper\]\.public\.line: is empty\. Write the one line players may read about The innkeeper \(never their secret\)/m],
    ['a public line too long', (a) => { a.bible.people[1].public.line = long(161); }, /^bible\.people\[ember\]\.public\.line: is 161 characters long\. .* 160 is all that fits/m],
    ['public with no line', (a) => { a.bible.people[1].public = { when: { flag: 'met' } }; }, /^bible\.people\[ember\]\.public: needs "line"/m],
    ['public written as a sentence', (a) => { a.bible.people[0].public = 'Runs the inn.'; }, /^bible\.people\[keeper\]\.public: must be an object$/m],
    ['a public line that waits for a place that does not exist', (a) => { a.bible.people[1].public.when = { seen: 'attic' }; }, /^bible\.people\[ember\]\.public\.when\.seen: points at "attic", but there is no chapter/m],
    ['a name too long for who is who', (a) => { a.bible.people[0].name = long(61); }, /^bible\.people\[keeper\]\.name: is 61 characters long\. A name shown to players can be 60 at most/m],
    /* handouts */
    ['a handout with no title', (a) => { delete a.handouts[0].title; }, /^handouts\[sign\]: needs "title": the title of the note, as a player sees it$/m],
    ['a handout with nothing to give', (a) => { delete a.handouts[0].text; }, /^handouts\[sign\]: has nothing to give: add "text" \(the words of the note\), "img" \(a picture\), or both$/m],
    ['a handout too long to send', (a) => { a.handouts[0].text = long(1201); }, /^handouts\[sign\]\.text: is 1201 characters long\. .* 1200 is all that fits/m],
    ['a handout whose picture is not in the cartridge', (a) => { a.handouts[1].img = 'img/lantern.webp'; }, /^handouts\[inn\]\.img: the picture "img\/lantern\.webp" is not in .*template\. Put the file there, or correct the name$/m],
    ['a handout that borrows a picture the engine does not have', (a) => { a.handouts[1].img = 'base:img/lantern.webp'; }, /^handouts\[inn\]\.img: the picture "base:img\/lantern\.webp" is not one of the engine's/m],
    ['a handout at a place that does not exist', (a) => { a.handouts[1].at = 'stables'; }, /^handouts\[inn\]\.at: names "stables", but there is no chapter, interlude or hub with that id\. The ids are: inn$/m],
    ['a handout at a scene, without its chapter', (a) => { a.handouts[0].at = 'door'; }, /^handouts\[sign\]\.at: names "door", but there is no chapter, interlude or hub with that id\. For the scene of that name, write "inn\/door"$/m],
    ['a handout at a scene the chapter does not have', (a) => { a.handouts[0].at = 'inn/attic'; }, /^handouts\[sign\]\.at: names "inn\/attic", but the chapter "inn" has no scene called "attic"\. Its scenes are: taproom, door, end$/m],
    ['a handout at a chapter that does not exist', (a) => { a.handouts[0].at = 'barn/door'; }, /^handouts\[sign\]\.at: names "barn\/door", but there is no chapter called "barn"\. The chapters are: inn$/m],
    ['two handouts with one id', (a) => { a.handouts[1].id = 'sign'; }, /^handouts\[sign\]: this id is used twice$/m]
  ];
  errors.forEach(([what, breakIt, expected]) => {
    const a = starter(); breakIt(a);
    const found = A.check(a, { images: TEMPLATE });
    assert.match(found.join('\n'), expected, what);
    assert.ok(found.length <= 2, what + ' is reported once, not buried: ' + found.join(' | '));
  });
  /* worth a look, but nothing is stopped */
  const warnings = [
    ['a scene with things to try and no check on any of them', (a) => { tap(a).tries.forEach((x) => delete x.check); },
      /^flow\.chapters\[inn\]\.scenes\[taproom\]\.tries: none of the things to try here has a "check", so the DM cannot ask for any of these rolls with one tap\. Give each try that needs a roll a check, like check: \{ skill: "Athletics", target: 13 \}, and check: false to the ones that need none$/m],
    ['a try whose title is too long for a card', (a) => { tap(a).tries[0].try = long(61); }, /tries\[0\]\.try: is 61 characters long\. On a phone it is the title of an action card and of a roll the DM asks for, which show 60: shorten it by 1$/m],
    ['a log too long for the story so far', (a) => { tap(a).outcomes[0].log = long(250); }, /outcomes\[key\]\.log: is 250 characters long\. It becomes a line of "the story so far" on the phones, which shows 240: shorten it by 10$/m],
    ['a result too long to read out', (a) => { tap(a).tries[1].yes = long(301); }, /tries\[1\]\.yes: is 301 characters long\. When the DM asks for this roll, a phone reads it out as the result and shows 300/m]
  ];
  warnings.forEach(([what, breakIt, expected]) => {
    const a = starter(); breakIt(a);
    const found = A.check(a, { images: TEMPLATE });
    assert.deepStrictEqual(found.slice(), [], what + ' is not an error');
    assert.strictEqual(found.warnings.length, 1, what);
    assert.match(found.warnings[0], expected, what);
  });
  /* saying "nothing to roll here" out loud is an answer, so the warning goes */
  const quiet = starter(); tap(quiet).tries.forEach((x) => { x.check = false; });
  assert.deepStrictEqual(A.check(quiet, { images: TEMPLATE }).warnings, []);
  /* the checker reads the engine's own skills unless it is handed others */
  assert.match(A.check(starter(), { skills: ['Cooking'] }).join('\n'), /is "Perception", which is not a skill the rules know\. Use one of: Cooking$/m);
});

test('npm run validate names the cartridge and the place for a broken label, strengths, words or adventure', (t) => {
  const root = sandbox(t), on = swap("  // adventure: 'case',", "  adventure: 'case',"), both = (a, b) => (text) => b(a(text));
  const adventure = (breakIt) => { const a = starter('case'); if (breakIt) { breakIt(a); } return { 'adventure.js': "FR.adventure('case', " + JSON.stringify(a, null, 2) + ');\n' }; };
  const cases = [
    ['a label that is not an object', swap("    label: {\n", "    label: 'Short and silly',\n    labels: {\n"), null, /^meta\.label: must be an object, like \{ length: "About 2 hours", players: "3 to 6 players"/m],
    ['a rating the app does not know', swap("rating: 'everyone',", "rating: 'kids',"), null, /^meta\.label\.rating: must be one of "everyone", "teen", "mature" \(it is "kids"\)$/m],
    ['a label line too long for a card', swap("length: 'One sitting',", "length: 'About two and a half hours, three with a break for tea',"), null, /^meta\.label\.length: "About two and a half hours, three with a break for tea" is 54 characters, and a cartridge card has room for 40\. Shorten it by 14$/m],
    ['a label line that is not words', swap("players: 'Up to 8 players',", "players: 6,"), null, /^meta\.label\.players: must be a few words, like "3 to 6 players"/m],
    ['flags that are not a list', swap("flags: []    ", "flags: 'Spiders'"), null, /^meta\.label\.flags: must be a list of short warnings, like \["Spiders"\]/m],
    ['a flag that runs on', swap("flags: []    ", "flags: ['A great many spiders, some of them quite large']"), null, /^meta\.label\.flags\[0\]: "A great many spiders, some of them quite large" is 46 characters; keep each to 30 or fewer$/m],
    ['something that is not part of a label', swap("tone: 'Adventure',", "mood: 'Adventure',"), null, /^meta\.label\.mood: not part of a label \(it may have length, players, tone, dm, rating, flags\)$/m],
    ['two strengths instead of three', swap("'TODO You are the strongest one here.', ", ''), null, /^cast\.classes\.The Brawler\.strengths: must be 3 plain sentences, like \[.*\] \(it has 2\)$/m],
    ['a strength too long for the lobby', swap("'TODO You are the strongest one here.'", "'" + 'You are so strong that '.repeat(4) + "nothing stops you.'"), null, /^cast\.classes\.The Brawler\.strengths\[0\]: is 110 characters long, and 80 is what fits under a name in the lobby\. Shorten it by 30$/m],
    ['an empty strength', swap("'TODO You are the strongest one here.'", "''"), null, /^cast\.classes\.The Brawler\.strengths\[0\]: is empty\. Write one plain sentence about what this class is good at$/m],
    ['strengths written as one sentence', swap("strengths: ['TODO You are the strongest one here.', 'TODO You can take a knock that would flatten most.', 'TODO You know the wild and its dangers.']", "strengths: 'Strong.'"), null, /^cast\.classes\.The Brawler\.strengths: must be 3 plain sentences/m],
    ['a stand-in sentence for a skill that does not exist', swap("  cast: {\n", "  cast: {\n    skillStrengths: { Cooking: 'You can cook.' },\n"), null, /^cast\.skillStrengths\.Cooking: "Cooking" is not a skill \(Athletics, /m],
    ['a stand-in sentence that runs on', swap("  cast: {\n", "  cast: {\n    skillStrengths: { Stealth: '" + 'Quiet as a mouse. '.repeat(5) + "' },\n"), null, /^cast\.skillStrengths\.Stealth: is 90 characters long; keep it to 80 or fewer$/m],
    ['a word mapped to a skill that does not exist', swap("barricade: 'Athletics'", "barricade: 'Building'"), null, /^intent\.words\.barricade: "Building" is not a skill\. Use one of Athletics, .* \(or null to drop a word the engine knows\)$/m],
    ['a word with punctuation in it', swap("barricade: 'Athletics'", "'Barricade!': 'Athletics'"), null, /^intent\.words: "Barricade!" must be one to four plain words in lower case/m],
    ['a reason with nowhere to put the reason', swap("    words: { barricade", "    why: 'Because.',\n    words: { barricade"), null, /^intent\.why: must be a sentence containing \{why\}, like "That comes down to \{why\}\."$/m],
    ['a check on an unknown skill, in the cartridge\'s adventure', on, adventure((a) => { a.flow.chapters[0].scenes[0].tries[1].check.skill = 'Listening'; }),
      /^cartridges\/case\/adventure\.js: flow\.chapters\[inn\]\.scenes\[taproom\]\.tries\[1\] \("Listen at the cellar door"\)\.check\.skill: is "Listening", which is not a skill the rules know\. Use one of: Athletics/m],
    ['a handout picture that is not in the cartridge', on, adventure((a) => { a.handouts[0].img = 'img/sign.webp'; }), /^cartridges\/case\/adventure\.js: handouts\[sign\]\.img: the picture "img\/sign\.webp" is not in .*cartridges\/case\. Put the file there, or correct the name$/m],
    ['a quest on an unknown flag', on, adventure((a) => { a.quests[0].done = { flag: 'mett' }; }), /^cartridges\/case\/adventure\.js: quests\[knock\]\.done: uses the flag "mett", which is not listed in flags$/m],
    ['a scene with no check at all', on, adventure((a) => { a.flow.chapters[0].scenes[1].tries.forEach((x) => delete x.check); }), /^cartridges\/case\/adventure\.js: flow\.chapters\[inn\]\.scenes\[door\]\.tries: none of the things to try here has a "check"/m, 'warnings']
  ];
  cases.forEach(([what, change, extra, expected, where]) => {
    const dir = addPack(root, 'case', change, extra), p = P.check(root, { samples: 2000 }).packs.filter((x) => x.id === 'case')[0];
    assert.match(p[where || 'errors'].join('\n'), expected, what);
    if (where === 'warnings') { assert.deepStrictEqual(p.errors, [], what + ' is a warning, not an error'); }
    fs.rmSync(dir, { recursive: true });
  });
  /* a warning never fails a check or a build; an error does, under the cartridge's name */
  addPack(root, 'case', both(on, swap("visibility: 'draft'", "visibility: 'public'")), adventure((a) => { a.flow.chapters[0].scenes[1].tries.forEach((x) => delete x.check); }));
  let r = run('scripts/validate.js', ['case'], root);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /ok {4}case[^\n]*\n(.*\n)*? {6}! cartridges\/case\/adventure\.js: flow\.chapters\[inn\]\.scenes\[door\]\.tries: none of the things to try/);
  assert.strictEqual(run('build.js', [], root).code, 0);
  fs.rmSync(path.join(root, 'cartridges', 'case'), { recursive: true });
  addPack(root, 'case', both(on, swap("visibility: 'draft'", "visibility: 'public'")), adventure((a) => { a.flow.chapters[0].scenes[0].tries[1].check.target = 99; }));
  r = run('scripts/validate.js', ['case'], root);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /FAIL {2}case[^\n]*\n {6}x cartridges\/case\/adventure\.js: .*tries\[1\] \("Listen at the cellar door"\)\.check\.target: must be a whole number from 1 to 40/);
  r = run('build.js', [], root);
  assert.strictEqual(r.code, 1, 'and the build refuses it');
  assert.match(r.out, /case: cartridges\/case\/adventure\.js: .*check\.target: must be a whole number from 1 to 40/);
  /* the engine's own half is held to it too: the base must keep a whole label and the rules credit */
  const eng = fs.mkdtempSync(path.join(os.tmpdir(), 'first-roll-'));
  t.after(() => fs.rmSync(eng, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'src'), path.join(eng, 'src'), { recursive: true });
  fs.mkdirSync(path.join(eng, 'cartridges'));
  P.list(ROOT).forEach((p) => fs.symlinkSync(p.dir, path.join(eng, 'cartridges', p.id)));
  const baseFile = path.join(eng, 'src', 'base.js'), baseText = read(baseFile);
  fs.writeFileSync(baseFile, swap("credits: [{ type: 'rules',", "credits: [{ type: 'thanks',")(swap("rating: 'everyone',                    // 'everyone', 'teen' or 'mature'", "rating: 'all',")(baseText)));
  const broken = P.check(eng, { reach: false }).errors.join('\n');
  assert.match(broken, /^engine: src\/base\.js meta\.label needs a rating \(everyone, teen, mature\) and a list of flags$/m);
  assert.match(broken, /^engine: src\/base\.js meta\.credits must hold the \{ type: "rules", text: "\.\.\." \} credit that every cartridge carries/m);
});

test('npm run new-cartridge --adventure: a starter adventure that uses every new part, validates at once and builds', (t) => {
  const root = sandbox(t);
  let r = run('scripts/new-cartridge.js', ['lantern', '--name', 'The Last Lantern', '--adventure'], root);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /adventure\.js {3}a starter adventure for the DM to run: three scenes, one choice, two endings/);
  const dir = path.join(root, 'cartridges', 'lantern'), def = P.load(path.join(dir, 'cartridge.js')).def, got = P.loadAdventure(path.join(dir, 'adventure.js'));
  assert.strictEqual(def.adventure, 'lantern', 'the cartridge names its adventure');
  assert.strictEqual(got.error, ''); assert.strictEqual(got.notData, ''); assert.strictEqual(got.id, 'lantern');
  const adv = json(got.def), p = P.check(root, { samples: 3000 }).packs.filter((x) => x.id === 'lantern')[0];
  assert.deepStrictEqual(p.errors, []);
  assert.deepStrictEqual(p.warnings.filter((w) => /adventure/.test(w)), [], 'and nothing about the adventure to warn of');
  assert.ok(!/__ID__|__NAME__/.test(read(path.join(dir, 'adventure.js')) + read(path.join(dir, 'cartridge.js'))));
  /* its shape: three scenes, one choice, two endings */
  const scenes = adv.flow.chapters[0].scenes, tries = [].concat(...scenes.map((s) => s.tries));
  assert.strictEqual(adv.schema, 3);
  assert.strictEqual(adv.flow.chapters.length, 1); assert.strictEqual(scenes.length, 3);
  assert.deepStrictEqual(scenes[1].outcomes.map((o) => o.sets.met), ['friend', 'foe'], 'the choice');
  assert.strictEqual(scenes[2].versions.options.length, 2, 'two endings');
  assert.deepStrictEqual(scenes[2].versions.suggest, [{ when: { flag: 'met', is: 'friend' }, use: 'warm' }, { use: 'cold' }]);
  /* every part format 2 added is in it at least once */
  assert.ok(adv.brief.about && adv.brief.people.length && adv.brief.endings.length === 2 && adv.brief.tips.length);
  assert.ok(adv.flow.chapters[0].summary && scenes.every((s) => s.summary));
  assert.ok(tries.some((x) => x.check && x.check.skill && x.check.target) && tries.some((x) => x.check === false) && tries.some((x) => x.card === false) && tries.some((x) => x.hint));
  assert.ok(adv.quests.some((q) => q.from) && adv.quests.some((q) => !q.from) && adv.quests.every((q) => q.done));
  assert.ok(adv.clues.length && adv.clues.every((c) => c.when));
  assert.ok(adv.bible.people.some((x) => x.public && x.public.when) && adv.bible.people.some((x) => x.public && !x.public.when));
  assert.ok(adv.handouts.some((h) => h.at.indexOf('/') > 0) && adv.handouts.some((h) => h.at.indexOf('/') < 0) && adv.handouts.some((h) => h.img) && adv.handouts.some((h) => !h.img));
  /* each of them comes with a comment saying what it is for, in the adventure and in the cartridge */
  const told = read(path.join(dir, 'adventure.js')), cart = read(path.join(dir, 'cartridge.js'));
  ['The DM\'s brief', '`summary` is what a player is shown', 'check   the roll as the app understands it', 'hint    the small line under the action card', 'card    card: false keeps the try off',
    'The quest board.', 'What the party has learned.', 'What players may know about someone', 'Notes, letters and pictures the DM can give'].forEach((line) => assert.ok(told.indexOf(line) >= 0, 'the starter explains: ' + line));
  ['TODO the label', 'strengths: three plain sentences', '"Or say what you do"', 'health as a state rather than a number', 'The DM\'s adventure, if this cartridge has one'].forEach((line) => assert.ok(cart.indexOf(line) >= 0, 'the template explains: ' + line));
  /* format 3: a small map with three regions (drawn for the author to replace), a soundscape, beats, a reveal, a foe, a vote,
     the easier and harder lines and minutes, each in it at least once and each with its comment */
  assert.strictEqual(read(path.join(dir, 'img', 'map.svg')), read(path.join(TEMPLATE, 'img', 'map.svg')), 'the starter\'s map is put in the new cartridge\'s img folder');
  assert.deepStrictEqual([adv.maps.length, adv.maps[0].img, adv.maps[0].regions.map((x) => x.id)], [1, 'img/map.svg', ['taproom', 'door', 'cellar']]);
  assert.ok(adv.maps[0].regions.some((x) => x.when) && adv.maps[0].regions.some((x) => !x.when));
  assert.deepStrictEqual(scenes.map((x) => x.map), [{ id: 'inn', open: ['taproom'] }, { id: 'inn', open: ['door'] }, { id: 'inn', open: ['cellar'] }]);
  assert.deepStrictEqual([adv.flow.chapters[0].minutes, adv.flow.chapters[0].sound, scenes[0].sound], [10, 'storm', 'fire']);
  assert.ok(scenes[0].beats.length && scenes[1].beats.length && scenes[1].reveal.title && scenes[1].reveal.img);
  assert.deepStrictEqual(scenes[1].vote, { q: 'How do you open the cellar door?', options: ['Gently, and say hello', 'Fast, ready for anything'] });
  assert.deepStrictEqual([adv.foes.length, adv.foes[0].hits, adv.foes[0].moves.length, scenes[1].foes], [1, 1, 2, ['ember']]);
  assert.strictEqual(scenes.filter((x) => x.easier && x.harder).length, 2);
  assert.ok(adv.bible.people.every((who) => adv.foes[0].name.indexOf(who.name) < 0 && scenes[1].reveal.title.indexOf(who.name) < 0), 'neither the foe\'s name nor the reveal\'s title says who it is');
  ['[3] `minutes` is about how long the chapter takes', 'sound   the soundscape here', 'map     which map to put up', 'beats   moments the DM can fire', '[3] The difficulty dial', '[3] A picture worth holding face down',
    '[3] A choice worth putting to the whole table', '[3] The foes that may turn up here', 'Maps. A map is a picture and the parts of it', 'Foes: whatever the heroes may end up fighting or facing down'].forEach((line) => assert.ok(told.indexOf(line) >= 0, 'the starter explains: ' + line));
  /* and the cartridge beside it writes out every field of spec v3, each with its comment */
  assert.strictEqual(Object.keys(def.cast.roles).length, 6);
  Object.keys(def.cast.classes).forEach((c) => { assert.ok(def.cast.roles[def.cast.classes[c].role], c + ' has a role'); assert.strictEqual(def.cast.classes[c].kit.length, 2, c); def.cast.classes[c].kit.forEach((k) => assert.ok(def.kit.items[k], c + ' starts with ' + k)); });
  assert.ok(def.ties.bonds.length >= 3 && def.ties.bonds.every((b) => b.indexOf('{name}') >= 0) && def.ties.hooks.some((h) => h.roles) && def.ties.hooks.some((h) => !h.roles) && def.ties.voices.length >= 3);
  assert.ok(Object.keys(def.kit.items).length >= 6 && Object.keys(def.kit.items).some((k) => def.kit.items[k].uses === 'once') && def.kit.token.name && def.kit.token.plural && def.kit.token.text);
  assert.deepStrictEqual([def.sound.beds.wind.synth, def.rules], ['wind', 'light'], 'the scaffold writes a light cartridge unless asked otherwise');
  ['TODO roles: five or six plain jobs', 'role: which of the roles below the class plays', 'kit:  the ids of the items', 'TODO ties: what links a hero to the others', 'bonds   questions about ANOTHER player\'s hero', 'hooks   a personal stake in the story',
    'voices  a way to talk', 'TODO the kit: what a hero carries or can do', 'token   what a hero token is called in this story', 'TODO soundscapes: quiet loops of sound', 'take one away            sea: null', 'The rules this cartridge plays by']
    .forEach((line) => assert.ok(cart.indexOf(line) >= 0, 'the template explains: ' + line));
  assert.deepStrictEqual(Object.keys(p.theme.beds), ['wind', 'fire', 'storm', 'crowd', 'cave', 'night', 'sea'], 'so the starter adventure\'s storm and fire are there to be named');
  /* made public, it builds, and the manifest says there is an adventure to fetch */
  fs.writeFileSync(path.join(dir, 'cartridge.js'), cart.replace("visibility: 'draft'", "visibility: 'public'"));
  r = run('build.js', [], root);
  assert.strictEqual(r.code, 0, r.out);
  const m = JSON.parse(read(path.join(root, 'public', 'packs', 'manifest.json'))), e = m.packs.filter((x) => x.id === 'lantern')[0];
  assert.match(e.adventure, /^packs\/lantern\/adventure\.js\?v=[0-9a-f]{8}$/);
  assert.strictEqual(e.label.rating, 'everyone');
  const shipped = [];
  vm.runInNewContext(read(path.join(root, 'public', 'packs', 'lantern', 'adventure.js')), { FR: { adventure: (id, d) => shipped.push([id, d]) } });
  assert.deepStrictEqual(json(shipped[0]), ['lantern', adv], 'the adventure that ships is the adventure that was written');
  assert.ok(fs.existsSync(path.join(root, 'public', 'packs', 'lantern', 'img', 'map.svg')), 'and its map ships with it');
  /* without the flag there is no adventure, and the cartridge does not claim one */
  r = run('scripts/new-cartridge.js', ['no-story'], root);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(!fs.existsSync(path.join(root, 'cartridges', 'no-story', 'adventure.js')) && !fs.existsSync(path.join(root, 'cartridges', 'no-story', 'img', 'map.svg')));
  assert.strictEqual(P.load(path.join(root, 'cartridges', 'no-story', 'cartridge.js')).def.adventure, undefined);
  assert.match(r.out, /add --adventure next time/);
});

/* ================= cartridge spec v3: roles, ties, the kit, soundscapes and rules; adventures in format 3 ================= */
const own = (id) => P.load(path.join(ROOT, 'cartridges', id, 'cartridge.js')).def;
/* words a player should never have to decode */
const JARGON = /\b(DC|d20|d\d+|modifier|proficien\w*|saving throw|hit points?|HP|AC|STR|DEX|CON|INT|WIS|CHA|bonus|skill check|ability|initiative)\b/;
/* everything in a cartridge's v3 fields that a player reads */
const readByPlayers = (t) => [].concat(
  ...Object.keys(t.roles).map((r) => [r, t.roles[r].blurb, t.roles[r].does]), t.ties.bonds, t.ties.hooks.map((h) => h.text), ...t.ties.voices.map((v) => [v.label, v.tip]),
  ...Object.keys(t.kit.items).map((k) => [t.kit.items[k].name, t.kit.items[k].text]), [t.kit.token.name, t.kit.token.plural, t.kit.token.text]);
/* every place the story can stand that may offer the table something: [where, the scene or hub, its chapter] */
const placesOf = (adv) => [].concat(...adv.flow.chapters.map((c) => c.scenes.map((s) => [c.id + '/' + s.id, s, c])), (adv.flow.interludes || []).map((s) => [s.id, s, s]), (adv.flow.hubs || []).map((h) => [h.id, h, null]));
/* The stage the DM's screen would put up from one place, with everything it offers switched on at once and a full
   turn order beside it (docs/PHASE2.md, section 1.1). Pictures are written as the page holds them. */
function stageOf(adv, place, chapter) {
  const addr = (p) => (p ? 'packs/northpole/' + p + '?v=0123abcd' : ''), map = place.map ? adv.maps.filter((m) => m.id === place.map.id)[0] : null;
  const foes = (place.foes || []).map((id, i) => { const f = adv.foes.filter((x) => x.id === id)[0]; return { id: f.id + '-' + (i + 1), name: f.name, kind: 'foe', state: 'In a real pickle', img: addr(f.img) }; });
  const heroes = Array.from({ length: 8 }, (x, i) => ({ id: 'seat' + i + 'x'.repeat(35), name: 'N'.repeat(60), kind: 'hero', state: 'Merry and bright', img: addr('img/sample_candy_cane_knight.webp') }));
  return {
    reveal: place.reveal ? { id: place.reveal.id, title: place.reveal.title, img: addr(place.reveal.img), shown: true } : null,
    map: map ? { id: map.id, title: map.title, img: addr(map.img), regions: map.regions.map((r) => ({ id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h })), open: map.regions.map((r) => r.id) } : null,
    sound: { bed: place.sound || (chapter && chapter.sound) || '', level: 1 },
    beat: (place.beats || []).length ? { n: 99999, kind: place.beats[0].kind, at: 1800000000000 } : null,
    spot: heroes[0].id, order: foes.concat(heroes).slice(0, 16), now: heroes[0].id
  };
}
/* the table's own limits for a stage */
function fitsTheTable(st, where) {
  const len = (v, max, what) => assert.ok(typeof v === 'string' && v.length <= max, where + ': ' + what + ' is ' + String(v).length + ' long, over ' + max);
  if (st.reveal) { len(st.reveal.id, 40, 'reveal id'); len(st.reveal.title, 80, 'reveal title'); len(st.reveal.img, 160, 'reveal picture'); }
  if (st.map) {
    len(st.map.id, 40, 'map id'); len(st.map.title, 80, 'map title'); assert.ok(st.map.regions.length <= 24, where + ': regions');
    st.map.regions.forEach((r) => { len(r.id, 40, 'region id'); len(r.name, 40, 'region name'); ['x', 'y', 'w', 'h'].forEach((k) => assert.ok(r[k] >= 0 && r[k] <= 100, where + ' ' + r.id + '.' + k)); });
    st.map.open.forEach((id) => assert.ok(st.map.regions.some((r) => r.id === id), where + ': opens ' + id));
  }
  len(st.sound.bed, 40, 'bed'); if (st.beat) { len(st.beat.kind, 20, 'beat kind'); }
  assert.ok(st.order.length <= 16);
  st.order.forEach((o) => { len(o.id, 40, 'order id'); len(o.name, 60, 'order name'); len(o.state, 20, 'state'); });
  const bytes = Buffer.byteLength(JSON.stringify(st));
  assert.ok(bytes <= A.LIMITS.stage, where + ': the stage is ' + bytes + ' bytes, over 16 KB');
  return bytes;
}

test('spec v3: roles, ties, the kit, soundscapes and the rules reach the theme, with the base behind them', () => {
  const FR = engineWith(), base = FR.scenarioDef('base'), np = FR.THEMES.northpole, tv = FR.THEMES.tavern;
  /* the engine's three short lists */
  assert.deepStrictEqual(FR.AMBIENCE, ['wind', 'fire', 'storm', 'crowd', 'cave', 'night', 'sea']);
  assert.deepStrictEqual(FR.BEATS, ['thunder', 'hit', 'reveal', 'bell', 'crash', 'hush']);
  assert.deepStrictEqual(FR.RULES, ['open-5e', 'light']);
  [np, tv].forEach((t) => {
    const d = own(t.id);
    /* roles: the cartridge's own, in its order, in place of the base's; each class its own role and its own kit */
    assert.deepStrictEqual(json(t.roles), d.cast.roles);
    Object.keys(t.classes).forEach((c) => {
      assert.strictEqual(t.classes[c].role, d.cast.classes[c].role, t.id + ' ' + c);
      assert.ok(t.roles[t.classes[c].role], t.id + ' ' + c + ' plays a role that exists');
      assert.deepStrictEqual(json(t.classes[c].kit), d.cast.classes[c].kit);
      t.classes[c].kit.forEach((k) => assert.ok(t.kit.items[k], t.id + ' ' + c + ' starts with ' + k));
    });
    assert.deepStrictEqual(json(t.ties.bonds), d.ties.bonds);
    assert.deepStrictEqual(json(t.ties.hooks), d.ties.hooks.map((h) => ({ id: h.id, text: h.text, roles: h.roles || [] })), 'a hook always carries a list of roles: empty means anyone');
    assert.deepStrictEqual(json(t.ties.voices), d.ties.voices);
    assert.deepStrictEqual(Object.keys(t.kit.items), Object.keys(d.kit.items));
    Object.keys(t.kit.items).forEach((k) => assert.deepStrictEqual(json(t.kit.items[k]), { name: d.kit.items[k].name, text: d.kit.items[k].text, img: '', uses: d.kit.items[k].uses }));
    assert.deepStrictEqual(json(t.kit.token), d.kit.token);
    assert.strictEqual(t.rules, 'open-5e');
  });
  /* soundscapes: the base's seven laid under the cartridge's; one written again is taken as written, null takes one away,
     and a file is found in the cartridge that names it */
  assert.deepStrictEqual(Object.keys(tv.beds), FR.AMBIENCE.slice());
  assert.deepStrictEqual(json(tv.beds.fire), { label: 'The hearth', synth: 'fire' });
  assert.deepStrictEqual(Object.keys(np.beds), ['wind', 'fire', 'crowd', 'cave', 'carols', 'tiptoe', 'warm', 'trouble', 'frantic', 'merry']);
  assert.deepStrictEqual(json(np.beds.wind), { label: 'Snow on the wind', synth: 'wind' });
  assert.deepStrictEqual(json(np.beds.carols), { label: 'Carols, softly', file: 'packs/northpole/audio/game_jingle.mp3' });
  Object.keys(np.beds).filter((k) => np.beds[k].file).forEach((k) => assert.ok(fs.existsSync(path.join(NP, np.beds[k].file.replace('packs/northpole/', ''))), k + ' is a file the cartridge has'));
  /* with the build's hashes, a file bed and an item's picture carry them like every other file */
  const hashed = P.engine(ROOT), pictured = json(own('northpole')); pictured.kit.items.bell.img = 'img/badge_santa.webp';
  hashed.manifest(hashed.MANIFEST, { 'packs/northpole/audio/intro.mp3': 'abc12345', 'packs/northpole/img/badge_santa.webp': 'def67890' });
  hashed.cartridge(pictured);
  assert.strictEqual(hashed.THEMES.northpole.beds.merry.file, 'packs/northpole/audio/intro.mp3?v=abc12345');
  assert.strictEqual(hashed.THEMES.northpole.kit.items.bell.img, 'packs/northpole/img/badge_santa.webp?v=def67890');
  /* laid over the base key by key: one line of the token with the base's other two, a bed of its own beside the engine's,
     its own roles instead of the base's six, and whatever it does not write left as the base has it */
  const mix = json(own('tavern')); mix.id = 'mix';
  mix.kit = { items: { rope: mix.kit.items.rope }, token: { name: 'Doubloon' } };
  mix.sound = { beds: { drums: { label: 'Drums in the deep', synth: 'cave' }, sea: null, fire: { label: 'Hearth', file: 'audio/hearth.mp3' } } };
  mix.cast.roles = { Muscle: { trait: 'might', blurb: 'Strong.', does: 'Lifts.' }, Brains: { blurb: 'Clever.', does: 'Thinks.' } };
  Object.keys(mix.cast.classes).forEach((c) => { delete mix.cast.classes[c].role; mix.cast.classes[c].kit = ['rope', 'nothing']; });
  mix.cast.classes.Wizard.role = 'Brains'; mix.cast.classes.Bard.role = 'Nobody';
  mix.ties = { bonds: ['Who is {name} to you?'] }; mix.rules = 'light';
  FR.cartridge(mix);
  const m = FR.THEMES.mix;
  assert.deepStrictEqual(json(m.kit.token), { name: 'Doubloon', plural: base.kit.token.plural, text: base.kit.token.text });
  assert.deepStrictEqual(Object.keys(m.beds), ['wind', 'fire', 'storm', 'crowd', 'cave', 'night', 'drums']);
  assert.deepStrictEqual(json(m.beds.fire), { label: 'Hearth', file: 'packs/mix/audio/hearth.mp3' }, 'a bed written again is taken whole: its file, and not the base\'s synth as well');
  assert.deepStrictEqual(Object.keys(m.roles), ['Muscle', 'Brains']);
  assert.strictEqual(m.classes.Wizard.role, 'Brains');
  assert.strictEqual(m.classes.Fighter.role, 'Muscle', 'a class with no role goes to the role that names its strongest trait');
  assert.strictEqual(m.classes.Bard.role, 'Muscle', 'and so does one that names a role the cartridge does not have');
  assert.deepStrictEqual(json(m.classes.Rogue.kit), ['rope'], 'an item the cartridge does not have is not kept');
  assert.deepStrictEqual(json(m.ties.bonds), ['Who is {name} to you?']);
  assert.deepStrictEqual(m.ties.hooks.map((h) => h.id), base.ties.hooks.map((h) => h.id), 'a list the cartridge does not write is the base\'s');
  assert.strictEqual(m.rules, 'light');
  const none = json(mix); none.id = 'none'; none.cast.roles = { Brains: { blurb: 'Clever.', does: 'Thinks.' } }; none.rules = 'house';
  FR.cartridge(none);
  assert.strictEqual(FR.THEMES.none.classes.Fighter.role, undefined, 'when no role names a trait, a class without a role has none');
  assert.strictEqual(FR.THEMES.none.rules, 'open-5e', 'rules the engine does not know fall back to today\'s');
  /* the base: six plain roles, one for each trait; bonds with {name}; a neutral token; a bed for every voice; and it is never written to */
  assert.deepStrictEqual(Object.keys(base.cast.roles).map((r) => base.cast.roles[r].trait), FR.STRENGTHS.slice());
  base.ties.bonds.forEach((b) => assert.ok(b.indexOf('{name}') >= 0 && b.length <= P.TIES.bond, b));
  assert.ok(base.ties.bonds.length >= 4 && base.ties.hooks.length >= 4 && base.ties.voices.length >= 4);
  base.ties.hooks.forEach((h) => (h.roles || []).forEach((r) => assert.ok(base.cast.roles[r], h.id + ' is for a role the base has')));
  assert.deepStrictEqual(base.kit, { items: {}, token: { name: 'Hero token', plural: 'Hero tokens', text: base.kit.token.text } });
  assert.deepStrictEqual(Object.keys(base.sound.beds).map((k) => base.sound.beds[k].synth), FR.AMBIENCE.slice());
  assert.strictEqual(base.rules, 'open-5e');
  readByPlayers({ roles: base.cast.roles, ties: { bonds: base.ties.bonds, hooks: base.ties.hooks, voices: base.ties.voices }, kit: base.kit }).forEach((line) => assert.ok(!JARGON.test(line), 'plain words: ' + line));
});

test('North Pole and Tavern Night fill in spec v3 in their own voices', () => {
  const FR = engineWith(), np = FR.THEMES.northpole, tv = FR.THEMES.tavern;
  /* North Pole: six roles with two callings each, eight bonds, eight hooks (three kept for certain roles), six voices,
     twelve items with a kit of two for each calling, a festive token, and beds from the engine and from its own music */
  assert.deepStrictEqual(Object.keys(np.roles), ['Heavy Lifter', 'Cookie Thief', 'Bright Spark', 'Warm Heart', 'Showstopper', 'Pathfinder']);
  const share = (t) => { const n = {}; Object.keys(t.classes).forEach((c) => { n[t.classes[c].role] = (n[t.classes[c].role] || 0) + 1; }); return n; };
  assert.deepStrictEqual(share(np), { 'Heavy Lifter': 2, 'Cookie Thief': 2, 'Bright Spark': 2, 'Warm Heart': 2, Showstopper: 2, Pathfinder: 2 });
  assert.deepStrictEqual([np.ties.bonds.length, np.ties.hooks.length, np.ties.hooks.filter((h) => h.roles.length).length, np.ties.voices.length], [8, 8, 3, 6]);
  assert.strictEqual(Object.keys(np.kit.items).length, 12);
  assert.deepStrictEqual(json(np.kit.token), { name: 'Gold star', plural: 'Gold stars', text: own('northpole').kit.token.text });
  assert.deepStrictEqual([Object.keys(np.beds).filter((k) => np.beds[k].synth).length, Object.keys(np.beds).filter((k) => np.beds[k].file).length], [4, 6]);
  assert.deepStrictEqual(['storm', 'night', 'sea'].map((k) => own('northpole').sound.beds[k]), [null, null, null], 'no rain, crickets or seaside at the North Pole');
  /* Tavern Night: six roles, every one played by a class, eight bonds, eight hooks, six voices, twelve items, a token and all seven beds in its own words */
  assert.deepStrictEqual(Object.keys(tv.roles), ['Protector', 'Sneak', 'Spellcaster', 'Healer', 'Charmer', 'Scout']);
  assert.deepStrictEqual(share(tv), { Protector: 3, Sneak: 2, Spellcaster: 3, Healer: 1, Charmer: 1, Scout: 2 });
  assert.deepStrictEqual([tv.ties.bonds.length, tv.ties.hooks.length, tv.ties.hooks.filter((h) => h.roles.length).length, tv.ties.voices.length], [8, 8, 4, 6]);
  assert.strictEqual(Object.keys(tv.kit.items).length, 12);
  assert.strictEqual(tv.kit.token.name, 'Lucky coin');
  Object.keys(tv.beds).forEach((k) => assert.notStrictEqual(tv.beds[k].label, FR.scenarioDef('base').sound.beds[k].label, 'Tavern Night names ' + k + ' its own way'));
  [np, tv].forEach((t) => {
    Object.keys(t.classes).forEach((c) => { assert.strictEqual(t.classes[c].kit.length, 2, t.id + ' ' + c); assert.strictEqual(new Set(t.classes[c].kit).size, 2); });
    const carried = new Set([].concat(...Object.keys(t.classes).map((c) => t.classes[c].kit)));
    Object.keys(t.kit.items).forEach((k) => assert.ok(carried.has(k), t.id + ': somebody starts with ' + k));
    t.ties.bonds.forEach((b) => { assert.ok(b.indexOf('{name}') >= 0 && b.length <= P.TIES.bond, b); assert.ok(b.split('{name}').join('N'.repeat(40)).length <= 160, 'with the longest name a hero can have, it still fits a bond\'s prompt'); });
    assert.strictEqual(new Set(t.ties.bonds).size, t.ties.bonds.length);
    t.ties.hooks.forEach((h) => { assert.ok(h.id.length <= 40 && h.text.length <= 240, h.id); h.roles.forEach((r) => assert.ok(t.roles[r], h.id + ' is for a role the cartridge has')); });
    assert.ok(t.ties.hooks.filter((h) => !h.roles.length).length >= 4, t.id + ': at least four hooks anyone may take');
    Object.keys(t.roles).forEach((r) => assert.ok(t.ties.hooks.filter((h) => !h.roles.length || h.roles.indexOf(r) >= 0).length >= 4, t.id + ': a ' + r + ' has hooks to choose from'));
    Object.keys(t.kit.items).forEach((k) => assert.ok(['once', 'always'].indexOf(t.kit.items[k].uses) >= 0));
    readByPlayers(t).forEach((line) => { assert.ok(!JARGON.test(line), 'plain words: ' + line); assert.ok(!/TODO|undefined|\{(?!name\})/.test(line), line); });
  });
});

test('North Pole fills in every part of format 3, and any stage built from it fits what the table accepts', () => {
  const FR = engineWith(), np = FR.THEMES.northpole, adv = json(P.loadAdventure(path.join(NP, 'adventure.js')).def), L = A.LIMITS;
  const found = A.check(adv, { images: NP, beds: Object.keys(np.beds), beats: FR.BEATS });
  assert.deepStrictEqual(found.slice(), []);
  assert.deepStrictEqual(found.warnings, [], 'not one warning');
  const places = placesOf(adv), scenes = places.filter(([, , c]) => c);
  /* one map, drawn by hand with no lettering, whose nine regions tile the picture: no gap and no overlap */
  assert.strictEqual(adv.maps.length, 1);
  const map = adv.maps[0], svg = read(path.join(NP, map.img));
  assert.deepStrictEqual([map.id, map.title, map.img], ['pole', 'The North Pole', 'img/map_pole.svg']);
  assert.ok(/^<svg [^>]*viewBox="0 0 1600 900"/.test(svg) && !/<text|<image|<script|<foreignObject|url\(http|href="http/.test(svg) && svg.length < 40 * 1024, 'a hand-written picture: no lettering, nothing fetched, nothing run');
  assert.strictEqual(map.regions.length, 9);
  let area = 0;
  map.regions.forEach((r, i) => { area += r.w * r.h; map.regions.slice(i + 1).forEach((o) => assert.ok(r.x + r.w <= o.x || o.x + o.w <= r.x || r.y + r.h <= o.y || o.y + o.h <= r.y, r.id + ' overlaps ' + o.id)); });
  assert.strictEqual(area, 100 * 100);
  map.regions.forEach((r) => assert.ok(svg.indexOf(r.id.padEnd(11) + ' x ' + r.x) >= 0, 'the picture\'s own notes list ' + r.id + ' where the adventure puts it'));
  /* each region is uncovered by the scene where the party first gets there; a `when`, where there is one, says the same */
  const first = {};
  places.forEach(([at, s]) => { if (s.map) { assert.strictEqual(s.map.id, 'pole', at); (s.map.open || []).forEach((r) => { first[r] = first[r] || at; }); } });
  assert.deepStrictEqual(first, { snowbank: 'arrival/snowbank', square: 'arrival/square', bakery: 'arrival/crumb', bridge: 'laugh/nook', peak: 'snow/school', lights: 'snow/aurora',
    listoffice: 'coal/office', santa: 'sneezles', sky: 'midnight/end' });
  assert.deepStrictEqual(map.regions.filter((r) => r.when).map((r) => [r.id, r.when]), [['bakery', { flag: 'choir' }], ['bridge', { seen: 'laugh' }], ['peak', { seen: 'snow' }],
    ['listoffice', { seen: 'coal' }], ['santa', { seen: 'sneezles' }], ['sky', { seen: 'midnight' }]]);
  assert.deepStrictEqual(adv.flow.hubs[0].map, { id: 'pole' }, 'at the hub the map goes up as it stands');
  /* minutes for every chapter and interlude, adding up to the label's two and a half hours, and agreeing with the words beside them */
  const parts = adv.flow.chapters.concat(adv.flow.interludes);
  parts.forEach((c) => { assert.ok(Number.isInteger(c.minutes), c.id); assert.strictEqual(c.length, 'About ' + c.minutes + ' minutes', c.id); });
  assert.strictEqual(parts.reduce((n, c) => n + c.minutes, 0), 150);
  assert.strictEqual(np.label.length, 'About 2½ hours');
  /* a soundscape behind every chapter, interlude and the hub, and for the scenes whose mood differs: all the cartridge's own, and all ten used */
  const beds = new Set();
  parts.concat(adv.flow.hubs).forEach((c) => { assert.ok(np.beds[c.sound], c.id + ' has a soundscape'); beds.add(c.sound); });
  scenes.forEach(([at, s, c]) => { if (s.sound) { assert.ok(np.beds[s.sound], at); assert.notStrictEqual(s.sound, s === c ? '' : c.sound, at + ' only names a soundscape when it differs from its chapter\'s'); beds.add(s.sound); } });
  assert.deepStrictEqual(Array.from(beds).sort(), Object.keys(np.beds).sort());
  /* beats where the story has them: every kind the engine knows is used, and a clock bell at eight, nine, ten, eleven and twelve */
  const beats = [].concat(...scenes.map(([at, s]) => (s.beats || []).map((b) => [at, b])));
  assert.ok(beats.length >= 25 && scenes.filter(([, s]) => (s.beats || []).length).length >= 16);
  assert.deepStrictEqual(Array.from(new Set(beats.map(([, b]) => b.kind))).sort(), FR.BEATS.slice().sort());
  assert.deepStrictEqual(beats.filter(([, b]) => b.kind === 'bell' && /strikes/.test(b.label)).map(([at]) => at), ['arrival/snowbank', 'finale/doors', 'midnight/end', 'sneezles', 'drip']);
  beats.forEach(([at, b]) => assert.ok(b.label.length <= L.beat && b.id.length <= L.id, at + ' ' + b.label));
  /* reveals: pictures the cartridge owns, never the one the scene is already showing, under a title that does not say who it is */
  const reveals = scenes.filter(([, s]) => s.reveal);
  assert.deepStrictEqual(reveals.map(([at, s]) => [at, s.reveal.img]), [['arrival/crumb', 'img/dm_crumb.webp'], ['laugh/nook', 'img/dm_grumbleknot.webp'], ['snow/school', 'img/dm_thunderhoof.webp'],
    ['coal/office', 'img/dm_twice.webp'], ['finale/doors', 'img/dm_fizzwick.webp'], ['finale/machine', 'img/dm_cookiematic.webp'], ['sneezles', 'img/dm_mrs_claus.webp'], ['drip', 'img/dm_dot.webp']]);
  reveals.forEach(([at, s, c]) => {
    const who = adv.bible.people.filter((p) => p.img === s.reveal.img)[0];
    assert.ok(fs.existsSync(path.join(NP, s.reveal.img)), at);
    assert.notStrictEqual(s.reveal.img, c.img, at + ' reveals something the scene is not already showing');
    assert.ok(who && s.cast.indexOf(who.id) >= 0, at + ' reveals someone who is in the scene');
    who.name.split(/\s+/).concat(who.full.split(/\s+/)).filter((w) => w.length > 3 && !/^(the|agent|director|dame)$/i.test(w)).forEach((w) => assert.ok(s.reveal.title.indexOf(w) < 0, at + ': the title "' + s.reveal.title + '" gives away ' + w));
  });
  /* foes for whatever the party can end up fighting or facing down: health as a few hits, and two to four moves in plain words */
  assert.deepStrictEqual(adv.foes.map((f) => [f.id, f.hits, f.moves.length]), [['cart', 1, 3], ['laugh', 3, 3], ['owl', 1, 2], ['sprites', 2, 3], ['cookiematic', 3, 4]]);
  assert.deepStrictEqual(scenes.filter(([, s]) => s.foes).map(([at, s]) => [at, s.foes]), [['arrival/square', ['cart']], ['laugh/chase', ['laugh']], ['snow/aurora', ['owl']], ['coal/cellar', ['sprites']], ['finale/machine', ['cookiematic']]]);
  adv.foes.forEach((f) => { assert.ok(f.name.length <= L.foe); f.moves.forEach((mv) => { assert.ok(mv.length <= L.move && /[.!]$/.test(mv), mv); assert.ok(!JARGON.test(mv) && !/\b(damage|attack|hit points|turn)\b/i.test(mv), 'plain words: ' + mv); }); });
  /* one vote, where the whole party has to choose one thing: its answers are the three outcomes of that scene */
  const votes = places.filter(([, s]) => s.vote);
  assert.deepStrictEqual(votes.map(([at]) => at), ['sneezles']);
  assert.deepStrictEqual(votes[0][1].vote.options.length, votes[0][1].outcomes.length);
  votes[0][1].outcomes.forEach((o, i) => assert.ok(o.label.toLowerCase().indexOf(votes[0][1].vote.options[i].replace(/^(A|The) /, '').toLowerCase().split(' ').pop()) >= 0, 'the answer "' + votes[0][1].vote.options[i] + '" is the outcome "' + o.label + '"'));
  /* the dial: an easier and a harder line on the scenes where a table could stall or coast, both or neither */
  const dialled = scenes.filter(([, s]) => s.easier || s.harder);
  assert.strictEqual(dialled.length, 10);
  dialled.forEach(([at, s]) => { assert.ok(s.easier && s.harder && s.tries.length, at + ' has both lines, and something to try'); assert.ok(s.easier.length <= L.dial && s.harder.length <= L.dial && s.easier !== s.harder); });
  /* what reaches every phone: names of 40, titles of 80, no rules words, and nothing kept for the DM */
  const shown = [map.title].concat(map.regions.map((r) => r.name), reveals.map(([, s]) => s.reveal.title), adv.foes.map((f) => f.name), [votes[0][1].vote.q], votes[0][1].vote.options);
  shown.forEach((line) => assert.ok(!JARGON.test(line) && line.trim() === line && line.length <= 120, line));
  /* the stage the DM's screen would put up at every place, with everything switched on at once */
  let largest = 0;
  places.forEach(([at, s, c]) => { largest = Math.max(largest, fitsTheTable(stageOf(adv, s, c), at)); });
  assert.ok(largest > 2000 && largest < 8 * 1024, 'the largest North Pole stage is ' + largest + ' bytes');
});

test('the sizes the validator allows keep the largest possible stage inside the table\'s 16 KB', () => {
  const L = A.LIMITS, wide = (n) => 'é'.repeat(n);                 // two bytes a letter, to be on the safe side
  const adv = { maps: [{ id: wide(L.id), title: wide(L.mapTitle), img: 'img/' + 'm'.repeat(60) + '.svg', regions: Array.from({ length: L.regions }, (x, i) => ({ id: i + wide(L.id - 2), name: wide(L.region), x: 12.345, y: 23.456, w: 34.567, h: 45.678 })) }],
    foes: Array.from({ length: L.sceneFoes }, (x, i) => ({ id: 'f' + i + wide(L.id - 4), name: wide(L.foe), img: 'img/' + 'f'.repeat(60) + '.webp', hits: 6, moves: ['It moves.'] })) };
  const place = { map: { id: adv.maps[0].id }, reveal: { id: wide(L.id), title: wide(L.revealTitle), img: 'img/' + 'r'.repeat(60) + '.webp' }, sound: 'b'.repeat(40), beats: [{ id: 'b', label: 'B', kind: 'thunder' }], foes: adv.foes.map((f) => f.id) };
  const st = stageOf(adv, place, null);
  assert.deepStrictEqual([st.map.regions.length, st.order.length], [24, 16]);
  const bytes = Buffer.byteLength(JSON.stringify(st));
  assert.ok(bytes < L.stage, 'the largest stage the limits allow is ' + bytes + ' bytes');
  assert.ok(bytes > 6000, 'and it is a real test of them: ' + bytes);
  assert.deepStrictEqual([L.regions, L.region, L.mapTitle, L.revealTitle, L.voteQ, L.voteOption, L.voteMin, L.voteMax, L.id, L.stage], [24, 40, 80, 80, 120, 40, 2, 4, 40, 16384], 'the table\'s own sizes (docs/PHASE2.md 1.1 and 1.3)');
  assert.deepStrictEqual([P.TIES.bond - '{name}'.length + 40 <= 160, P.TIES.hook, A.LIMITS.id], [true, 240, 40], 'a bond with the longest hero name fits a prompt of 160; a hook is 240; an id is 40');
});

test('an adventure in format 3 is registered as written, with the pictures of its maps, reveals and foes found in its cartridge', () => {
  const FR = P.engine(ROOT), raw = P.loadAdventure(path.join(NP, 'adventure.js')).def, a = json(FR.adventure('northpole', raw)), want = json(raw);
  (function find(x, y) { Object.keys(x).forEach((k) => { if (typeof x[k] === 'string') { if (/^(base:)?(img|audio)\/[\w.\/-]+\.\w+$/.test(x[k])) { y[k] = FR.asset('northpole', x[k]); } } else if (x[k] && typeof x[k] === 'object') { find(x[k], y[k]); } }); })(raw, want);
  assert.deepStrictEqual(a, want, 'nothing is added, dropped or reworded on the way through');
  assert.strictEqual(a.maps[0].img, 'packs/northpole/img/map_pole.svg');
  assert.strictEqual(a.flow.chapters[0].scenes[3].reveal.img, 'packs/northpole/img/dm_crumb.webp');
  assert.strictEqual(a.foes[4].img, 'packs/northpole/img/dm_cookiematic.webp');
  assert.strictEqual(a.flow.chapters[0].sound, 'crowd', 'a soundscape is an id, not a file, and is left alone');
  assert.deepStrictEqual(a.flow.chapters[0].scenes[1].map, { id: 'pole', open: ['snowbank'] });
  assert.deepStrictEqual(a.flow.interludes[0].vote, json(raw.flow.interludes[0].vote));
});

test('the cartridge checks of spec v3: each one catches a deliberately broken copy, and says where and what to do', (t) => {
  const root = sandbox(t), block = (name, to) => (text) => { const re = new RegExp(' {2}' + name + ': \\{[\\s\\S]*?\\n {2}\\},\\n'); assert.ok(re.test(text), 'the template has a ' + name + ' block'); return text.replace(re, to); };
  const roles = (to) => (text) => { const re = / {4}roles: \{[\s\S]*?\n {4}\},\n/; assert.ok(re.test(text)); return text.replace(re, to); };
  const long = (n) => 'x'.repeat(n), brawler = "role: 'Protector', kit: ['rope', 'trinket'],", protector = "Protector: { trait: 'might', blurb: 'TODO You stand in front, so your friends do not have to.'";
  const bond = "'TODO Why do you owe {name} a favor?'", hook = "{ id: 'prove', text: 'TODO Somebody said you would never amount to much. You mean to prove them wrong.' }";
  const voice = "{ label: 'Gruff', tip: 'TODO Short sentences. Long pauses. Never use three words where one will do.' }", rope = "rope: { name: 'TODO Rope', text: 'TODO Climb it, tie it, or lower a friend on it.', uses: 'always' }";
  const wind = "wind: { label: 'TODO A cold wind', synth: 'wind' }", six = 'Protector, Trickster, Thinker, Healer, Talker, Scout';
  const cases = [
    /* roles */
    ['roles that are not an object', roles("    roles: 'Protector, Trickster',\n"), /^cast\.roles: must be an object of roles by name, like \{ Protector: \{ blurb: /m],
    ['one role', roles("    roles: { Protector: { blurb: 'In front.', does: 'Holds the line.' } },\n"), /^cast\.roles: has 1 role\. Role cards are made for 2 to 8, and five or six reads best$/m],
    ['nine roles', roles('    roles: { ' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => 'R' + n + ": { blurb: 'B.', does: 'D.' }").join(', ') + ' },\n'), /^cast\.roles: has 9 roles\. Role cards are made for 2 to 8/m],
    ['a role with no object', swap(protector + ", does: 'TODO Push, lift, block and hold the line. When trouble arrives, it meets you first.' }", "Protector: 'Stands in front'"), /^cast\.roles\.Protector: must be an object, like \{ blurb: /m],
    ['a blurb too long for a role card', swap("blurb: 'TODO You stand in front, so your friends do not have to.'", "blurb: '" + long(81) + "'"), /^cast\.roles\.Protector\.blurb: is 81 characters long, and 80 is what fits on a role card\. Shorten it by 1$/m],
    ['a role that does not say what it does', swap(", does: 'TODO Push, lift, block and hold the line. When trouble arrives, it meets you first.'", ''), /^cast\.roles\.Protector\.does: is missing\. Write what a hero in this role does at the table \(160 characters at most\)$/m],
    ['an empty blurb', swap("blurb: 'TODO You stand in front, so your friends do not have to.'", "blurb: ' '"), /^cast\.roles\.Protector\.blurb: is empty or is not words\. Write the one line that sells this role \(80 characters at most\)$/m],
    ['a trait the engine does not have', swap("Protector: { trait: 'might'", "Protector: { trait: 'muscle'"), /^cast\.roles\.Protector\.trait: "muscle" is not a trait\. Use one of might, guile, lore, faith, charm, wild \(a class that names no role is filed under the role of its strongest trait\), or leave the line out$/m],
    ['something that is not part of a role', swap("Protector: { trait: 'might',", "Protector: { trait: 'might', colour: 'red',"), /^cast\.roles\.Protector\.colour: not part of a role \(it may have blurb, does, trait\)$/m],
    ['a role name too long for a card', swap("      Scout: { trait: 'wild'", "      'The One Who Goes On Ahead Alone': { trait: 'wild'"), /^cast\.roles\.The One Who Goes On Ahead Alone: a role's name is 31 characters long; 24 is what fits on a role card$/m],
    ['a class in a role that does not exist', swap(brawler, "role: 'Tank', kit: ['rope', 'trinket'],"), new RegExp('^cast\\.classes\\.The Brawler\\.role: "Tank" is not one of this cartridge\'s roles \\(' + six + '\\)\\. Use one of those, or add the role to cast\\.roles$', 'm')],
    ['a role that is not a name', swap(brawler, "role: 3, kit: ['rope', 'trinket'],"), /^cast\.classes\.The Brawler\.role: 3 is not one of this cartridge's roles/m],
    /* a class's kit */
    ['a kit that is not a list', swap(brawler, "role: 'Protector', kit: 'rope',"), /^cast\.classes\.The Brawler\.kit: must be a list of item ids, like \["rope"\] \(the items are listed under kit\.items\)$/m],
    ['a kit naming an item that does not exist', swap(brawler, "role: 'Protector', kit: ['rop', 'trinket'],"), /^cast\.classes\.The Brawler\.kit: "rop" is not one of this cartridge's items \(rope, lantern, bandages, lockpicks, notebook, horn, trinket, treats\)\. Check the spelling, or add it to kit\.items$/m],
    ['a kit of five', swap(brawler, "role: 'Protector', kit: ['rope', 'lantern', 'bandages', 'horn', 'treats'],"), /^cast\.classes\.The Brawler\.kit: lists 5 items; a hero starts with 4 at most\. Take 1 out$/m],
    ['the same item twice', swap(brawler, "role: 'Protector', kit: ['rope', 'rope'],"), /^cast\.classes\.The Brawler\.kit: names "rope" twice$/m],
    /* ties */
    ['ties that are not an object', block('ties', "  ties: ['bonds'],\n"), /^ties: must be an object, like \{ bonds: \["Why do you owe \{name\} a favor\?"\], hooks: /m],
    ['something that is not part of ties', swap("  ties: {\n    bonds: [", "  ties: {\n    oaths: [],\n    bonds: ["), /^ties\.oaths: not part of ties \(it may have bonds, hooks, voices\)$/m],
    ['bonds that are not a list', swap("    bonds: [\n      " + bond, "    bonds: 'Why do you owe {name} a favor?',\n    more: [\n      " + bond), /^ties\.bonds: must be a list of questions about another player's hero, like \["Why do you owe \{name\} a favor\?"\]$/m],
    ['a bond with nobody in it', swap(bond, "'TODO Why do you owe them a favor?'"), /^ties\.bonds\[0\]: "TODO Why do you owe them a favor\?" has no \{name\} in it\. A bond is about another player's hero: write \{name\} where that hero's name goes, like "Why do you owe \{name\} a favor\?"$/m],
    ['a bond too long to leave room for a name', swap(bond, "'Why does {name} " + long(110) + "?'"), /^ties\.bonds\[0\]: is 127 characters long, and 120 is the most that leaves room for the name on a phone\. Shorten it by 7$/m],
    ['a bond with a blank the app cannot fill', swap(bond, "'Why does {hero} owe {name}?'"), /^ties\.bonds\[0\]: \{hero\} is not something a bond can fill in\. The only blank is \{name\}, the other hero's name$/m],
    ['an empty bond', swap(bond, "''"), /^ties\.bonds\[0\]: is empty or is not words\. Write a question about another player's hero, with \{name\} where that hero's name goes \(120 characters at most\)$/m],
    ['twenty-one bonds', swap(bond + ',', Array.from({ length: 18 }, (x, i) => "'Bond " + i + " with {name}?'").join(', ') + ',\n      ' + bond + ','), /^ties\.bonds: lists 21 questions; keep it to 20 or fewer \(each player is asked only one\)$/m],
    ['hooks that are not a list', swap("    hooks: [\n      " + hook, "    hooks: { prove: 'x' },\n    more: [\n      " + hook), /^ties\.hooks: must be a list of personal stakes in the story, like \[\{ id: "debt", text: /m],
    ['a hook with no id', swap("{ id: 'prove', text: 'TODO Somebody", "{ text: 'TODO Somebody"), /^ties\.hooks\[0\]\.id: is missing\. Give the hook a short word of its own in lower case with no spaces, like "debt" \(40 characters at most\): it is how the table remembers which hook a player took$/m],
    ['a hook whose id has a space in it', swap("{ id: 'prove', text: 'TODO Somebody", "{ id: 'Prove It', text: 'TODO Somebody"), /^ties\.hooks\[Prove It\]\.id: "Prove It" cannot be an id\. Give the hook a short word of its own/m],
    ['two hooks with one id', swap("{ id: 'debt', text", "{ id: 'prove', text"), /^ties\.hooks: two hooks share the id "prove"\. Each needs its own$/m],
    ['a hook too long for the table', swap("text: 'TODO Somebody said you would never amount to much. You mean to prove them wrong.'", "text: '" + long(241) + "'"), /^ties\.hooks\[prove\]\.text: is 241 characters long, and 240 is what the table keeps of a hook\. Shorten it by 1$/m],
    ['a hook with no words', swap(hook, "{ id: 'prove' }"), /^ties\.hooks\[prove\]\.text: is missing\. Write the hook as the player reads it: a personal stake in the story \(240 characters at most\)$/m],
    ['a hook for a role that does not exist', swap("roles: ['Protector', 'Healer'] }", "roles: ['Protector', 'Medic'] }"), new RegExp('^ties\\.hooks\\[promise\\]\\.roles: "Medic" is not one of this cartridge\'s roles \\(' + six + '\\)\\. Check the spelling, or add the role to cast\\.roles$', 'm')],
    ['hook roles that are not a list', swap("roles: ['Protector', 'Healer'] }", "roles: 'Protector' }"), /^ties\.hooks\[promise\]\.roles: must be a list of role names, like \["Protector"\]\. Leave the line out for a hook anyone may take$/m],
    ['something that is not part of a hook', swap("{ id: 'prove', text:", "{ id: 'prove', secret: true, text:"), /^ties\.hooks\[prove\]\.secret: not part of a hook \(it may have id, text, roles\)$/m],
    ['voices that are not a list', swap("    voices: [\n      " + voice, "    voices: 'Gruff',\n    more: [\n      " + voice), /^ties\.voices: must be a list of ways to talk, like \[\{ label: "Gruff", tip: "Short sentences\. Long pauses\." \}\]$/m],
    ['a voice whose name is too long for a chip', swap("{ label: 'Gruff',", "{ label: 'Gruff and rather hard of hearing',"), /^ties\.voices\[0\]\.label: is 32 characters long, and 24 is what fits on a chip\. Shorten it by 8$/m],
    ['a voice with no tip', swap(voice, "{ label: 'Gruff' }"), /^ties\.voices\[0\]\.tip: is missing\. Write how to do the voice, in a sentence or two \(120 characters at most\)$/m],
    ['thirteen voices', swap(voice + ',', Array.from({ length: 10 }, (x, i) => "{ label: 'V" + i + "', tip: 'Tip.' }").join(', ') + ',\n      ' + voice + ','), /^ties\.voices: lists 13 voices; keep it to 12 or fewer$/m],
    /* the kit */
    ['a kit that is not an object', block('kit', "  kit: 'rope',\n"), /^kit: must be an object, like \{ items: \{ rope: /m],
    ['something that is not part of the kit', swap("  kit: {\n    items: {", "  kit: {\n    spells: {},\n    items: {"), /^kit\.spells: not part of the kit \(it may have items, token\)$/m],
    ['an item whose id has a space in it', swap("      rope: { name: 'TODO Rope'", "      'Magic Rope': { name: 'TODO Rope'"), /^kit\.items: "Magic Rope" cannot be an item's id\. Use lower-case letters, digits, _ and - with no spaces, 40 at most, like "magic_rope"$/m],
    ['an item with no name', swap("rope: { name: 'TODO Rope', text:", 'rope: { text:'), /^kit\.items\.rope\.name: is missing\. Write what the item is called \(40 characters at most\)$/m],
    ['an item whose line is too long for a card', swap("text: 'TODO Climb it, tie it, or lower a friend on it.'", "text: '" + long(161) + "'"), /^kit\.items\.rope\.text: is 161 characters long, and 160 is what fits on an item card\. Shorten it by 1$/m],
    ['an item used "sometimes"', swap("lower a friend on it.', uses: 'always' }", "lower a friend on it.', uses: 'sometimes' }"), /^kit\.items\.rope\.uses: must be "once" \(it is used up\) or "always" \(it can be used again and again\); it is "sometimes"$/m],
    ['an item that does not say how often', swap("lower a friend on it.', uses: 'always' }", "lower a friend on it.' }"), /^kit\.items\.rope\.uses: must be "once" \(it is used up\) or "always" \(it can be used again and again\); it is missing$/m],
    ['an item whose picture is not there', swap("rope: { name: 'TODO Rope',", "rope: { img: 'img/rope.webp', name: 'TODO Rope',"), /^kit\.items\.rope\.img: cartridges\/case\/img\/rope\.webp does not exist$/m],
    ['an item whose picture is not one of the cartridge\'s files', swap("rope: { name: 'TODO Rope',", "rope: { img: 'http://example.test/rope.png', name: 'TODO Rope',"), /^kit\.items\.rope\.img: "http:\/\/example\.test\/rope\.png" must be a file in the pack, like "img\/keyart\.webp"/m],
    ['something that is not part of an item', swap("rope: { name: 'TODO Rope',", "rope: { cost: 5, name: 'TODO Rope',"), /^kit\.items\.rope\.cost: not part of an item \(it may have name, text, img, uses\)$/m],
    ['an item that is only a name', swap(rope, "rope: 'Rope'"), /^kit\.items\.rope: must be an object, like \{ name: "Rope", text: /m],
    ['forty-one items', swap('      ' + rope + ',', '      ' + rope + ',\n      ' + Array.from({ length: 33 }, (x, i) => 'extra' + i + ": { name: 'Extra', text: 'An extra thing.', uses: 'once' }").join(', ') + ','), /^kit\.items: lists 41 items; 40 is the most a cartridge may have\. Take 1 out$/m],
    ['a token that is only a name', swap("token: { name: 'Hero token', plural: 'Hero tokens', text: 'TODO Spend one to roll again when it matters. Your DM hands them out for great moments.' }", "token: 'Hero token'"), /^kit\.token: must be an object, like \{ name: "Hero token", plural: "Hero tokens", text: /m],
    ['a token name too long to sit beside a player', swap("token: { name: 'Hero token',", "token: { name: 'A token of the table’s esteem',"), /^kit\.token\.name: is 29 characters long, and 24 is what fits beside a player's name\. Shorten it by 5$/m],
    ['something that is not part of a token', swap("token: { name: 'Hero token',", "token: { worth: 2, name: 'Hero token',"), /^kit\.token\.worth: not part of a token \(it may have name, plural, text\)$/m],
    /* soundscapes */
    ['sound that is not an object', block('sound', "  sound: 'wind',\n"), /^sound: must be an object, like \{ beds: \{ rain: \{ label: "Rain on the roof", synth: "storm" \} \} \}$/m],
    ['something that is not part of sound', swap("  sound: {\n    beds: {", "  sound: {\n    tracks: [],\n    beds: {"), /^sound\.tracks: not part of sound \(it may have beds\)$/m],
    ['a soundscape whose id has a space in it', swap('      ' + wind, "      'Cold Wind': { label: 'A cold wind', synth: 'wind' }"), /^sound\.beds: "Cold Wind" cannot be a soundscape's id\. Use lower-case letters, digits, _ and - with no spaces, 40 at most, like "cold_wind"$/m],
    ['a soundscape that is both made and played', swap(wind, "wind: { label: 'A cold wind', synth: 'wind', file: 'audio/wind.mp3' }"), /^sound\.beds\.wind: has both synth and file\. A soundscape is one or the other: keep synth for one the engine makes, or file for one of your own$/m],
    ['a soundscape that is neither', swap(wind, "wind: { label: 'A cold wind' }"), /^sound\.beds\.wind: needs synth: one of wind, fire, storm, crowd, cave, night, sea \(made by the engine, no file needed\), or file: one of your own, like "audio\/rain\.mp3"$/m],
    ['a voice the engine does not have', swap(wind, "wind: { label: 'A cold wind', synth: 'rain' }"), /^sound\.beds\.wind\.synth: "rain" is not one of the engine's soundscapes\. Use one of wind, fire, storm, crowd, cave, night, sea, or give a file of your own instead \(file: "audio\/rain\.mp3"\)$/m],
    ['a picture where a sound should be', swap(wind, wind + ",\n      rain: { label: 'Rain', file: 'img/rain.webp' }"), /^sound\.beds\.rain\.file: "img\/rain\.webp" must be an audio file in the cartridge's audio folder, like "audio\/rain\.mp3"$/m],
    ['an audio file that is not there', swap(wind, wind + ",\n      rain: { label: 'Rain', file: 'audio/rain.mp3' }"), /^sound\.beds\.rain\.file: cartridges\/case\/audio\/rain\.mp3 does not exist$/m],
    ['a label too long for the picker', swap("label: 'TODO A cold wind'", "label: '" + long(41) + "'"), /^sound\.beds\.wind\.label: is 41 characters long, and 40 is what fits in the picker\. Shorten it by 1$/m],
    ['a soundscape with no label', swap(wind, "wind: { synth: 'wind' }"), /^sound\.beds\.wind\.label: is missing\. Write what the DM's picker calls this soundscape \(40 characters at most\)$/m],
    ['a soundscape that is only a word', swap(wind, "wind: 'wind'"), /^sound\.beds\.wind: must be \{ label, synth \} for one of the engine's soundscapes, \{ label, file \} for one of your own audio files, or null to take one of the engine's away$/m],
    ['twenty-five soundscapes', swap(wind, wind + ',\n      ' + Array.from({ length: 18 }, (x, i) => 'bed' + i + ": { label: 'Bed', synth: 'wind' }").join(', ')), /^sound\.beds: lists 25 soundscapes; 24 is the most the DM's picker shows\. Take 1 out \(null takes away one of the engine's\)$/m],
    ['something that is not part of a soundscape', swap(wind, "wind: { label: 'A cold wind', synth: 'wind', loud: true }"), /^sound\.beds\.wind\.loud: not part of a soundscape \(it may have label, synth, file\)$/m],
    /* rules */
    ['rules the engine does not know', swap("  rules: 'open-5e',", "  rules: 'house',"), /^rules: must be "open-5e" or "light" \(it is "house"\)\. "open-5e" is today's rules; leave the line out to use them$/m]
  ];
  cases.forEach(([what, change, expected]) => {
    const dir = addPack(root, 'case', change), p = P.check(root, { reach: false }).packs.filter((x) => x.id === 'case')[0];
    assert.match(p.errors.join('\n'), expected, what);
    fs.rmSync(dir, { recursive: true });
  });
  assert.ok(cases.length >= 60, 'every check has its broken copy');
  /* worth a look, but nothing is stopped: a cartridge that writes its own roles and leaves a class without one */
  const warned = (change) => { const dir = addPack(root, 'case', change), p = P.check(root, { reach: false }).packs.filter((x) => x.id === 'case')[0]; fs.rmSync(dir, { recursive: true }); assert.deepStrictEqual(p.errors, []); return p.warnings.join('\n'); };
  assert.match(warned(swap(brawler, "kit: ['rope', 'trinket'],")), new RegExp('^cast\\.classes\\.The Brawler: has no role, though this cartridge writes its own roles\\. It is filed under "Protector", the role of its strongest trait\\. To choose, add role: "Protector" \\(one of ' + six + '\\)$', 'm'));
  assert.match(warned((text) => swap(brawler, "kit: ['rope', 'trinket'],")(text).replace(/\{ trait: '[a-z]+', /g, '{ ').replace(/ {8}role: 'Protector', kit: \[[^\]]*\],\n/g, '')),
    new RegExp('^cast\\.classes\\.The Brawler: has no role, though this cartridge writes its own roles\\. It will not appear under any role card\\. To give it one, add role: "Protector" \\(one of ' + six + '\\)$', 'm'));
  /* and what is allowed says nothing: null takes one of the engine's soundscapes away, a hook may be for anyone, a kit may be empty,
     and a cartridge on the base's roles may leave its classes to their strongest trait */
  const fine = [swap(wind, 'wind: null, sea: null'), swap(brawler, "role: 'Protector', kit: [],"),
    (text) => roles('')(text).replace(/ {8}role: '[^']*', kit: (\[[^\]]*\]),\n/g, '        kit: $1,\n').replace("roles: ['Protector', 'Healer'] }", "roles: ['Protector', 'Healer', 'Scout'] }")];
  fine.forEach((change, i) => { const dir = addPack(root, 'case', change), p = P.check(root, { reach: false }).packs.filter((x) => x.id === 'case')[0]; assert.deepStrictEqual(p.errors, [], 'allowed ' + i); assert.deepStrictEqual(p.warnings.filter((w) => !/TODO/.test(w)), [], 'allowed ' + i); fs.rmSync(dir, { recursive: true }); });
  const gone = addPack(root, 'case', swap(wind, 'wind: null, sea: null'));
  assert.deepStrictEqual(Object.keys(P.check(root, { reach: false }).packs.filter((x) => x.id === 'case')[0].theme.beds), ['fire', 'storm', 'crowd', 'cave', 'night']);
  fs.rmSync(gone, { recursive: true });
});

test('the adventure checks of format 3: each one catches a deliberately broken copy, and says where and what to do', () => {
  const long = (n) => 'x'.repeat(n), inn = (a) => a.flow.chapters[0], tap = (a) => inn(a).scenes[0], door = (a) => inn(a).scenes[1], last = (a) => inn(a).scenes[2];
  const BEDS = ['wind', 'fire', 'storm', 'crowd', 'cave', 'night', 'sea'], check = (a) => A.check(a, { images: TEMPLATE, beds: BEDS });
  const noOpens = (a) => inn(a).scenes.forEach((s) => { delete s.map; });
  assert.deepStrictEqual(check(starter()).slice(), [], 'the starter is sound to begin with');
  assert.deepStrictEqual(check(starter()).warnings, []);
  const at = 'flow\\.chapters\\[inn\\]\\.scenes';
  const errors = [
    /* maps */
    ['a map with no title', (a) => { delete a.maps[0].title; }, /^maps\[inn\]: needs "title": the name of the map, as the whole table reads it$/m],
    ['a map title too long for the table', (a) => { a.maps[0].title = long(81); }, /^maps\[inn\]\.title: is 81 characters long\. .* 80 is all that fits: shorten it by 1$/m],
    ['a map with no picture', (a) => { delete a.maps[0].img; }, /^maps\[inn\]: needs "img": the picture the map is drawn on, like "img\/map\.svg"\. Any wide picture in the cartridge's img folder will do$/m],
    ['a map whose picture is not in the cartridge', (a) => { a.maps[0].img = 'img/plan.svg'; }, /^maps\[inn\]\.img: the picture "img\/plan\.svg" is not in .*template\. Put the file there, or correct the name$/m],
    ['a map with no regions', (a) => { delete a.maps[0].regions; noOpens(a); }, /^maps\[inn\]: needs "regions"$/m],
    ['a map whose regions are an empty list', (a) => { a.maps[0].regions = []; noOpens(a); }, /^maps\[inn\]\.regions: is empty: a map needs at least one region to uncover$/m],
    ['twenty-five regions', (a) => { a.maps[0].regions = Array.from({ length: 25 }, (x, i) => ({ id: 'r' + i, name: 'Room ' + i, x: i, y: 0, w: 4, h: 100 })); noOpens(a); }, /^maps\[inn\]\.regions: lists 25 regions, and the table holds 24 for one map\. Take 1 out, or fold two into one$/m],
    ['a region with no name', (a) => { delete a.maps[0].regions[1].name; }, /^maps\[inn\]\.regions\[door\]: needs "name": what this part of the map is called once it is uncovered$/m],
    ['a region name longer than the table keeps', (a) => { a.maps[0].regions[1].name = long(41); }, /^maps\[inn\]\.regions\[door\]\.name: is 41 characters long\. .* 40 is all that fits: shorten it by 1$/m],
    ['a region with no x', (a) => { delete a.maps[0].regions[1].x; }, /^maps\[inn\]\.regions\[door\]: needs x, y, w and h as numbers: where the region starts \(x across, y down\) and how wide and how tall it is, each a percentage of the picture from 0 to 100\. Here x is missing or not a number$/m],
    ['a region measured in words', (a) => { a.maps[0].regions[1].w = '14%'; a.maps[0].regions[1].h = 'tall'; }, /^maps\[inn\]\.regions\[door\]: needs x, y, w and h as numbers: .* Here w, h are missing or not a number$/m],
    ['a region with no width', (a) => { a.maps[0].regions[1].w = 0; }, /^maps\[inn\]\.regions\[door\]: is 0 wide and 40 tall, so there is nothing to uncover\. Give w and h a size above 0 \(they are percentages of the picture\)$/m],
    ['a region with a negative height', (a) => { a.maps[0].regions[1].h = -5; }, /^maps\[inn\]\.regions\[door\]: is 14 wide and -5 tall, so there is nothing to uncover/m],
    ['a region that runs off the right of the picture', (a) => { a.maps[0].regions[1].x = 90; }, /^maps\[inn\]\.regions\[door\]: runs off the picture: it goes from 90 to 104 across and from 30 to 70 down, and both must stay between 0 and 100\. x, y, w and h are percentages of the picture$/m],
    ['a region that runs off the bottom', (a) => { a.maps[0].regions[1].h = 71; }, /^maps\[inn\]\.regions\[door\]: runs off the picture: it goes from 54 to 68 across and from 30 to 101 down/m],
    ['a region that starts left of the picture', (a) => { a.maps[0].regions[1].x = -1; }, /^maps\[inn\]\.regions\[door\]: runs off the picture: it goes from -1 to 13 across/m],
    ['a region measured in pixels', (a) => { a.maps[0].regions[1] = Object.assign(a.maps[0].regions[1], { x: 648, y: 180, w: 168, h: 240 }); }, /^maps\[inn\]\.regions\[door\]: runs off the picture: it goes from 648 to 816 across/m],
    ['a region that waits on a flag nobody listed', (a) => { a.maps[0].regions[2].when = { flag: 'mett' }; }, /^maps\[inn\]\.regions\[cellar\]\.when: uses the flag "mett", which is not listed in flags$/m],
    ['a region that waits on a place that does not exist', (a) => { a.maps[0].regions[2].when = { seen: 'attic' }; }, /^maps\[inn\]\.regions\[cellar\]\.when\.seen: points at "attic", but there is no chapter, interlude or hub with that id$/m],
    ['two regions with one id', (a) => { a.maps[0].regions[1].id = 'taproom'; }, /^maps\[inn\]\.regions\[taproom\]: this id is used twice$/m, 3],
    ['two maps with one id', (a) => { a.maps.push(json(a.maps[0])); }, /^maps\[inn\]: this id is used twice$/m],
    ['nine maps', (a) => { a.maps = Array.from({ length: 9 }, (x, i) => Object.assign(json(a.maps[0]), { id: i ? 'inn' + i : 'inn' })); }, /^maps: lists 9 maps; 8 is the most an adventure may have\. Take 1 out$/m],
    ['something that is not part of a map', (a) => { a.maps[0].scale = 2; }, /^maps\[inn\]: has "scale", which is not part of an adventure \(map may have: id, title, img, regions\)$/m],
    ['something that is not part of a region', (a) => { a.maps[0].regions[0].colour = 'red'; }, /^maps\[inn\]\.regions\[taproom\]: has "colour", which is not part of an adventure \(region may have: id, name, x, y, w, h, when\)$/m],
    ['a map id too long to send', (a) => { a.maps[0].id = long(41); noOpens(a); }, /^maps\[x{41}\]\.id: is 41 characters long\. An id can be 40 at most/m],
    /* a scene's map */
    ['a scene that puts up a map that does not exist', (a) => { tap(a).map.id = 'in'; }, new RegExp('^' + at + '\\[taproom\\]\\.map: names the map "in", which is not in maps\\. The maps are: inn$', 'm')],
    ['a scene map that names no map', (a) => { delete tap(a).map.id; }, new RegExp('^' + at + '\\[taproom\\]\\.map: needs "id": which map to show\\. The maps are: inn$', 'm')],
    ['a map named when the adventure has none', (a) => { delete a.maps; inn(a).scenes.slice(1).forEach((s) => { delete s.map; }); }, new RegExp('^' + at + '\\[taproom\\]\\.map: names the map "inn", which is not in maps\\. Add the map to "maps" at the top of the adventure first$', 'm')],
    ['a scene that uncovers a region the map does not have', (a) => { tap(a).map.open = ['bar']; }, new RegExp('^' + at + '\\[taproom\\]\\.map\\.open\\[0\\]: names the region "bar", which the map "inn" does not have\\. Its regions are: taproom, door, cellar$', 'm')],
    ['regions to uncover that are not a list', (a) => { tap(a).map.open = 'taproom'; }, new RegExp('^' + at + '\\[taproom\\]\\.map\\.open: must be a list of the regions to uncover here, like \\["taproom"\\]\\. Leave it out to show the map without uncovering anything new$', 'm')],
    ['a region uncovered twice at once', (a) => { tap(a).map.open = ['taproom', 'door', 'taproom']; }, new RegExp('^' + at + '\\[taproom\\]\\.map\\.open: names "taproom" twice$', 'm')],
    ['a scene map written as a word', (a) => { tap(a).map = 'inn'; }, new RegExp('^' + at + '\\[taproom\\]\\.map: must be an object$', 'm')],
    ['something that is not part of a scene\'s map', (a) => { tap(a).map.zoom = 2; }, new RegExp('^' + at + '\\[taproom\\]\\.map: has "zoom", which is not part of an adventure \\(a scene\'s map may have: id, open\\)$', 'm')],
    /* soundscapes */
    ['a scene with a soundscape the cartridge does not have', (a) => { tap(a).sound = 'hearth'; }, new RegExp('^' + at + '\\[taproom\\]\\.sound: is "hearth", which is not one of this cartridge\'s soundscapes\\. Use one of: wind, fire, storm, crowd, cave, night, sea\\. They are listed under sound\\.beds in cartridge\\.js, where you can add your own$', 'm')],
    ['a chapter with a soundscape the cartridge does not have', (a) => { inn(a).sound = 'rain'; }, /^flow\.chapters\[inn\]\.sound: is "rain", which is not one of this cartridge's soundscapes\. Use one of: wind, fire/m],
    ['a soundscape that is not an id', (a) => { tap(a).sound = { synth: 'fire' }; }, new RegExp('^' + at + '\\[taproom\\]\\.sound: must be the id of one of the cartridge\'s soundscapes, like "wind"$', 'm')],
    /* beats */
    ['seven beats in one scene', (a) => { tap(a).beats = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: 'b' + n, label: 'Beat ' + n, kind: 'hit' })); }, new RegExp('^' + at + '\\[taproom\\]\\.beats: lists 7 beats, and a scene shows 6 at most\\. Keep the ones the moment needs and take 1 out$', 'm')],
    ['a beat with no words for its button', (a) => { delete tap(a).beats[0].label; }, new RegExp('^' + at + '\\[taproom\\]\\.beats\\[knock\\]: needs "label": the words on the DM\'s button for this moment$', 'm')],
    ['a beat label too long for a button', (a) => { tap(a).beats[0].label = long(41); }, new RegExp('^' + at + '\\[taproom\\]\\.beats\\[knock\\]\\.label: is 41 characters long\\. .* 40 is all that fits: shorten it by 1$', 'm')],
    ['a kind of beat the app does not know', (a) => { tap(a).beats[0].kind = 'boom'; }, new RegExp('^' + at + '\\[taproom\\]\\.beats\\[knock\\]\\.kind: is "boom", which is not a kind of beat the app knows\\. Use one of: thunder, hit, reveal, bell, crash, hush$', 'm')],
    ['a beat with no kind', (a) => { delete tap(a).beats[0].kind; }, new RegExp('^' + at + '\\[taproom\\]\\.beats\\[knock\\]: needs "kind": the sort of moment it is\\. One of: thunder, hit, reveal, bell, crash, hush$', 'm')],
    ['two beats with one id', (a) => { tap(a).beats.push({ id: 'knock', label: 'Again', kind: 'hit' }); }, new RegExp('^' + at + '\\[taproom\\]\\.beats\\[knock\\]: this id is used twice$', 'm')],
    ['a beat with no id', (a) => { delete tap(a).beats[0].id; }, new RegExp('^' + at + '\\[taproom\\]\\.beats\\[0\\]: needs an "id": a short word with no spaces$', 'm')],
    ['beats that are not a list', (a) => { tap(a).beats = { knock: 'hit' }; }, new RegExp('^' + at + '\\[taproom\\]\\.beats: must be a list$', 'm')],
    ['something that is not part of a beat', (a) => { tap(a).beats[0].volume = 11; }, new RegExp('^' + at + '\\[taproom\\]\\.beats\\[knock\\]: has "volume", which is not part of an adventure \\(beat may have: id, label, kind\\)$', 'm')],
    /* reveals */
    ['a reveal with no title', (a) => { delete door(a).reveal.title; }, new RegExp('^' + at + '\\[door\\]\\.reveal: needs "title": what the picture is called, in words that give nothing away before it is turned over$', 'm')],
    ['a reveal title too long for the table', (a) => { door(a).reveal.title = long(81); }, new RegExp('^' + at + '\\[door\\]\\.reveal\\.title: is 81 characters long\\. .* 80 is all that fits: shorten it by 1$', 'm')],
    ['a reveal with no picture', (a) => { delete door(a).reveal.img; }, new RegExp('^' + at + '\\[door\\]\\.reveal: needs "img": the picture to hold face down and then show, like "img/stranger\\.webp"$', 'm')],
    ['a reveal whose picture is not in the cartridge', (a) => { door(a).reveal.img = 'img/ember.webp'; }, new RegExp('^' + at + '\\[door\\]\\.reveal\\.img: the picture "img/ember\\.webp" is not in .*template\\. Put the file there, or correct the name$', 'm')],
    ['a reveal that borrows a picture the engine does not have', (a) => { door(a).reveal.img = 'base:img/ember.webp'; }, new RegExp('^' + at + '\\[door\\]\\.reveal\\.img: the picture "base:img/ember\\.webp" is not one of the engine\'s', 'm')],
    ['a reveal with no id', (a) => { delete door(a).reveal.id; }, new RegExp('^' + at + '\\[door\\]\\.reveal: needs an "id": a short word with no spaces$', 'm')],
    ['a reveal written as a file name', (a) => { door(a).reveal = 'img/map.svg'; }, new RegExp('^' + at + '\\[door\\]\\.reveal: must be an object$', 'm')],
    ['something that is not part of a reveal', (a) => { door(a).reveal.shown = true; }, new RegExp('^' + at + '\\[door\\]\\.reveal: has "shown", which is not part of an adventure \\(reveal may have: id, title, img\\)$', 'm')],
    /* the dial */
    ['an empty easier line', (a) => { tap(a).easier = ''; }, new RegExp('^' + at + '\\[taproom\\]\\.easier: is empty\\. Write what the DM can change here if the table is struggling, or take the line out$', 'm')],
    ['a harder line that goes on', (a) => { tap(a).harder = long(241); }, new RegExp('^' + at + '\\[taproom\\]\\.harder: is 241 characters long\\. This is what the DM can change here if the table is finding it too easy, and 240 is all that fits: shorten it by 1$', 'm')],
    ['an easier line that is a list', (a) => { tap(a).easier = ['One.', 'Two.']; }, new RegExp('^' + at + '\\[taproom\\]\\.easier: must be text', 'm')],
    /* minutes */
    ['a chapter that takes no time', (a) => { inn(a).minutes = 0; }, /^flow\.chapters\[inn\]\.minutes: must be a whole number of minutes from 1 to 600 \(about how long this part takes to play\); found 0$/m],
    ['minutes that are not whole', (a) => { inn(a).minutes = 12.5; }, /^flow\.chapters\[inn\]\.minutes: must be a whole number of minutes from 1 to 600 .*; found 12\.5$/m],
    ['minutes written as words', (a) => { inn(a).minutes = 'ten'; }, /^flow\.chapters\[inn\]\.minutes: must be a whole number of minutes from 1 to 600 .*; found "ten"$/m],
    ['a chapter eleven hours long', (a) => { inn(a).minutes = 660; }, /^flow\.chapters\[inn\]\.minutes: must be a whole number of minutes from 1 to 600 .*; found 660$/m],
    ['minutes on a scene, where they do not belong', (a) => { tap(a).minutes = 3; }, new RegExp('^' + at + '\\[taproom\\]: has "minutes", which is not part of an adventure \\(scene may have: ', 'm')],
    /* foes */
    ['a foe with no name', (a) => { delete a.foes[0].name; }, /^foes\[ember\]: needs "name": what the table calls this foe$/m],
    ['a foe name longer than the table keeps', (a) => { a.foes[0].name = long(41); }, /^foes\[ember\]\.name: is 41 characters long\. .* 40 is all that fits: shorten it by 1$/m],
    ['a foe that takes no hits', (a) => { a.foes[0].hits = 0; }, /^foes\[ember\]\.hits: must be a whole number from 1 to 6 \(how many good hits it takes to deal with this foe\); found 0$/m],
    ['a foe that takes seven', (a) => { a.foes[0].hits = 7; }, /^foes\[ember\]\.hits: must be a whole number from 1 to 6 .*; found 7$/m],
    ['a foe with hit points', (a) => { a.foes[0].hits = '2d8'; }, /^foes\[ember\]\.hits: must be a whole number from 1 to 6 .*; found "2d8"$/m],
    ['a foe with no hits at all', (a) => { delete a.foes[0].hits; }, /^foes\[ember\]: needs "hits": how many good hits it takes to deal with this foe, a whole number from 1 to 6$/m],
    ['a foe with nothing to do', (a) => { delete a.foes[0].moves; }, /^foes\[ember\]: needs "moves": two or three things this foe might do on its turn, in plain words, like \["Slams the door and holds it shut\."\]$/m],
    ['a foe with an empty list of moves', (a) => { a.foes[0].moves = []; }, /^foes\[ember\]: needs "moves": two or three things this foe might do on its turn/m],
    ['a foe with five moves', (a) => { a.foes[0].moves = [1, 2, 3, 4, 5].map((n) => 'Move ' + n + '.'); }, /^foes\[ember\]\.moves: lists 5 moves; keep it to 4 at most, so the DM can take them in at a glance$/m],
    ['a move that goes on', (a) => { a.foes[0].moves[1] = long(121); }, /^foes\[ember\]\.moves\[1\]: is 121 characters long\. This is one thing this foe might do on its turn, in plain words, and 120 is all that fits: shorten it by 1$/m],
    ['an empty move', (a) => { a.foes[0].moves[0] = ' '; }, /^foes\[ember\]\.moves\[0\]: is empty\. Write one thing this foe might do on its turn, in plain words, or take the line out$/m],
    ['a foe whose picture is not in the cartridge', (a) => { a.foes[0].img = 'img/ember.webp'; }, /^foes\[ember\]\.img: the picture "img\/ember\.webp" is not in .*template\. Put the file there, or correct the name$/m],
    ['two foes with one id', (a) => { a.foes.push(json(a.foes[0])); }, /^foes\[ember\]: this id is used twice$/m],
    ['thirteen foes', (a) => { a.foes = Array.from({ length: 13 }, (x, i) => Object.assign(json(a.foes[0]), { id: i ? 'ember' + i : 'ember' })); }, /^foes: lists 13 foes; 12 is the most an adventure may have\. Take 1 out, or let two share an entry$/m],
    ['something that is not part of a foe', (a) => { a.foes[0].armour = 14; }, /^foes\[ember\]: has "armour", which is not part of an adventure \(foe may have: id, name, img, hits, moves\)$/m],
    ['a scene with a foe that is not listed', (a) => { door(a).foes = ['embr']; }, new RegExp('^' + at + '\\[door\\]\\.foes\\[0\\]: names the foe "embr", which is not in foes\\. The foes are: ember$', 'm')],
    ['a scene foe when the adventure lists none', (a) => { delete a.foes; }, new RegExp('^' + at + '\\[door\\]\\.foes\\[0\\]: names the foe "ember", which is not in foes\\. Add it to "foes" at the top of the adventure first$', 'm')],
    ['scene foes that are not a list', (a) => { door(a).foes = 'ember'; }, new RegExp('^' + at + '\\[door\\]\\.foes: must be a list of foe ids, like \\["ember"\\]\\. The foes themselves are listed under "foes" at the top of the adventure$', 'm')],
    ['nine foes in one scene', (a) => { door(a).foes = Array.from({ length: 9 }, () => 'ember'); }, new RegExp('^' + at + '\\[door\\]\\.foes: lists 9 foes, and the turn order has room for 8 beside the heroes\\. Take 1 out$', 'm')],
    /* votes */
    ['a vote with no question', (a) => { delete door(a).vote.q; }, new RegExp('^' + at + '\\[door\\]\\.vote: needs "q": the question put to the table$', 'm')],
    ['a question too long for the table', (a) => { door(a).vote.q = long(121); }, new RegExp('^' + at + '\\[door\\]\\.vote\\.q: is 121 characters long\\. .* 120 is all that fits: shorten it by 1$', 'm')],
    ['a vote with one answer', (a) => { door(a).vote.options = ['Gently']; }, new RegExp('^' + at + '\\[door\\]\\.vote\\.options: has 1 answer\\. A vote needs 2 to 4 to choose between$', 'm')],
    ['a vote with five answers', (a) => { door(a).vote.options = ['A', 'B', 'C', 'D', 'E']; }, new RegExp('^' + at + '\\[door\\]\\.vote\\.options: has 5 answers\\. A vote needs 2 to 4 to choose between$', 'm')],
    ['an answer too long for a button', (a) => { door(a).vote.options[0] = long(41); }, new RegExp('^' + at + '\\[door\\]\\.vote\\.options\\[0\\]: is 41 characters long\\. .* 40 is all that fits: shorten it by 1$', 'm')],
    ['the same answer twice', (a) => { door(a).vote.options[1] = door(a).vote.options[0]; }, new RegExp('^' + at + '\\[door\\]\\.vote\\.options: offers "Gently, and say hello" twice$', 'm')],
    ['an empty answer', (a) => { door(a).vote.options[1] = ''; }, new RegExp('^' + at + '\\[door\\]\\.vote\\.options\\[1\\]: is empty\\. Write one answer the table can vote for, or take the line out$', 'm')],
    ['answers that are not a list', (a) => { door(a).vote.options = 'Gently or fast'; }, new RegExp('^' + at + '\\[door\\]\\.vote: has "options" that is not a list: 2 to 4 answers to choose between, like \\["Open the door", "Leave it shut"\\]$', 'm')],
    ['a vote with no answers', (a) => { delete door(a).vote.options; }, new RegExp('^' + at + '\\[door\\]\\.vote: needs "options": 2 to 4 answers to choose between', 'm')],
    ['something that is not part of a vote', (a) => { door(a).vote.secret = true; }, new RegExp('^' + at + '\\[door\\]\\.vote: has "secret", which is not part of an adventure \\(vote may have: q, options\\)$', 'm')]
  ];
  errors.forEach(([what, breakIt, expected, most]) => {
    const a = starter(); breakIt(a);
    const found = check(a);
    assert.match(found.join('\n'), expected, what);
    assert.ok(found.length <= (most || 2), what + ' is reported once, not buried: ' + found.join(' | '));
  });
  assert.ok(errors.length >= 80, 'every check has its broken copy');
  /* what is allowed says nothing: a map put up with nothing new to uncover, the same foe three times over, and any soundscape
     when the checker has not been told the cartridge's (it cannot know them from the adventure alone) */
  const ok = starter(); delete tap(ok).map.open; last(ok).map.open = []; door(ok).foes = ['ember', 'ember', 'ember'];
  assert.deepStrictEqual(check(ok).slice(), []); assert.deepStrictEqual(check(ok).warnings, []);
  const anyBed = starter(); tap(anyBed).sound = 'hearth';
  assert.deepStrictEqual(A.check(anyBed, { images: TEMPLATE }).slice(), []);
  /* a hub is a place the story stands too: its map, soundscape and vote are checked like a scene's */
  const hubs = (breakIt) => { const a = json(P.loadAdventure(path.join(NP, 'adventure.js')).def); breakIt(a.flow.hubs[0], a); return A.check(a, { images: NP, beds: ['wind', 'fire', 'crowd', 'cave', 'carols', 'tiptoe', 'warm', 'trouble', 'frantic', 'merry'] }).join('\n'); };
  assert.match(hubs((h) => { h.map.open = ['nowhere']; }), /^flow\.hubs\[errands\]\.map\.open\[0\]: names the region "nowhere", which the map "pole" does not have\. Its regions are: snowbank, square, bakery, bridge, peak, lights, listoffice, santa, sky$/m);
  assert.match(hubs((h) => { h.sound = 'storm'; }), /^flow\.hubs\[errands\]\.sound: is "storm", which is not one of this cartridge's soundscapes\. Use one of: wind, fire, crowd, cave, carols, tiptoe, warm, trouble, frantic, merry\./m);
  assert.match(hubs((h) => { h.vote = { q: 'Where first?', options: ['The laugh'] }; }), /^flow\.hubs\[errands\]\.vote\.options: has 1 answer\. A vote needs 2 to 4 to choose between$/m);
  assert.match(hubs((h, a) => { a.flow.interludes[0].minutes = 0; }), /^flow\.interludes\[sneezles\]\.minutes: must be a whole number of minutes from 1 to 600/m);
  assert.strictEqual(hubs(() => {}), '');
  /* worth a look, but nothing is stopped */
  const timed = json(P.loadAdventure(path.join(NP, 'adventure.js')).def); delete timed.flow.interludes[0].minutes; delete timed.flow.chapters[5].minutes;
  const clock = A.check(timed, { images: NP });
  assert.deepStrictEqual(clock.slice(), []);
  assert.deepStrictEqual(clock.warnings, ['flow: the pacing clock adds up each part\'s "minutes", but the chapter "midnight", the interlude "sneezles" have none. Give every chapter and interlude its minutes, or none of them']);
  /* format 3 parts in a file that says it is older: read and checked all the same, with one reminder to say which format it is */
  const two = starter(); two.schema = 2;
  const said = check(two);
  assert.deepStrictEqual(said.slice(), [], 'not an error');
  assert.deepStrictEqual(said.warnings, ['adventure: uses "maps", "foes", "minutes", "sound", "map", "beats", "easier", "harder", "reveal", "vote", which belong to format 3. They are read all the same, but say which format this file is written in: change schema: 2 to schema: 3 at the top of the adventure']);
  const oneFoe = asFormat2(starter()); oneFoe.foes = starter().foes;
  assert.deepStrictEqual(check(oneFoe).warnings, ['adventure: uses "foes", which belongs to format 3. It is read all the same, but say which format this file is written in: change schema: 2 to schema: 3 at the top of the adventure']);
  const old = asFormat1(starter()); old.maps = starter().maps; inn(old).minutes = 10;
  assert.deepStrictEqual(check(old).slice(), [], 'and in a format 1 file too');
  assert.match(check(old).warnings.join('\n'), /^adventure: uses "maps", "minutes", which belong to format 3\. .* change schema: 1 to schema: 3 at the top of the adventure$/m);
  const stillBroken = starter(); stillBroken.schema = 2; stillBroken.foes[0].hits = 9;
  assert.match(check(stillBroken).join('\n'), /^foes\[ember\]\.hits: must be a whole number from 1 to 6/m, 'and a broken one is still refused, whatever the file calls itself');
});

test('npm run validate names the cartridge and the place for a broken spec v3 field, in the cartridge and in its adventure', (t) => {
  const root = sandbox(t), on = swap("  // adventure: 'case',", "  adventure: 'case',"), open = swap("visibility: 'draft'", "visibility: 'public'"), both = (...fs2) => (text) => fs2.reduce((s, f) => f(s), text);
  const adventure = (breakIt) => { const a = starter('case'); if (breakIt) { breakIt(a); } return { 'adventure.js': "FR.adventure('case', " + JSON.stringify(a, null, 2) + ');\n' }; };
  /* sound: the scaffold's cartridge has the engine's seven beds and renames one, so its starter adventure's `storm` and `fire` are found */
  let dir = addPack(root, 'case', both(on, open), adventure());
  let r = run('scripts/validate.js', ['case'], root);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /ok {4}case /);
  fs.rmSync(dir, { recursive: true });
  /* in the cartridge */
  dir = addPack(root, 'case', both(open, swap("'TODO Why do you owe {name} a favor?'", "'TODO Why do you owe them a favor?'"), swap("role: 'Protector', kit: ['rope', 'trinket'],", "role: 'Tank', kit: ['rope', 'string'],")));
  r = run('scripts/validate.js', ['case'], root);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /FAIL {2}case [^\n]*\n(.*\n)*? {6}x cast\.classes\.The Brawler\.role: "Tank" is not one of this cartridge's roles/);
  assert.match(r.out, / {6}x cast\.classes\.The Brawler\.kit: "string" is not one of this cartridge's items/);
  assert.match(r.out, / {6}x ties\.bonds\[0\]: "TODO Why do you owe them a favor\?" has no \{name\} in it/);
  r = run('build.js', [], root);
  assert.strictEqual(r.code, 1, 'and the build refuses it');
  assert.match(r.out, /case: ties\.bonds\[0\]: /);
  fs.rmSync(dir, { recursive: true });
  /* in its adventure: every message starts with whose adventure it is, then the place */
  const broken = [
    [(a) => { a.maps[0].regions[1].w = 0; }, /x cartridges\/case\/adventure\.js: maps\[inn\]\.regions\[door\]: is 0 wide and 40 tall, so there is nothing to uncover/],
    [(a) => { a.flow.chapters[0].scenes[0].sound = 'hearth'; }, /x cartridges\/case\/adventure\.js: flow\.chapters\[inn\]\.scenes\[taproom\]\.sound: is "hearth", which is not one of this cartridge's soundscapes\. Use one of: wind, fire, storm, crowd, cave, night, sea\./],
    [(a) => { a.flow.chapters[0].scenes[0].beats[0].kind = 'boom'; }, /x cartridges\/case\/adventure\.js: flow\.chapters\[inn\]\.scenes\[taproom\]\.beats\[knock\]\.kind: is "boom", which is not a kind of beat the app knows\. Use one of: thunder, hit, reveal, bell, crash, hush/],
    [(a) => { a.flow.chapters[0].scenes[1].foes = ['embers']; }, /x cartridges\/case\/adventure\.js: flow\.chapters\[inn\]\.scenes\[door\]\.foes\[0\]: names the foe "embers", which is not in foes\. The foes are: ember/],
    [(a) => { a.maps[0].img = 'img/plan.svg'; }, /x cartridges\/case\/adventure\.js: maps\[inn\]\.img: the picture "img\/plan\.svg" is not in .*cartridges\/case\. Put the file there, or correct the name/]
  ];
  broken.forEach(([breakIt, expected]) => {
    dir = addPack(root, 'case', both(on, open), adventure(breakIt));
    r = run('scripts/validate.js', ['case'], root);
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, expected);
    fs.rmSync(dir, { recursive: true });
  });
  /* a cartridge that takes a soundscape away cannot then use it in its adventure */
  dir = addPack(root, 'case', both(on, open, swap("wind: { label: 'TODO A cold wind', synth: 'wind' }", 'storm: null')), adventure());
  r = run('scripts/validate.js', ['case'], root);
  assert.match(r.out, /x cartridges\/case\/adventure\.js: flow\.chapters\[inn\]\.sound: is "storm", which is not one of this cartridge's soundscapes\. Use one of: wind, fire, crowd, cave, night, sea\./);
  fs.rmSync(dir, { recursive: true });
  /* from the command line an adventure is checked against the cartridge it sits in, soundscapes included */
  dir = addPack(root, 'case', both(on, open), adventure((a) => { a.flow.chapters[0].sound = 'rain'; }));
  r = run('scripts/validate-adventure.js', [path.join(dir, 'adventure.js'), '--images', dir], root);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /- flow\.chapters\[inn\]\.sound: is "rain", which is not one of this cartridge's soundscapes/);
  fs.rmSync(dir, { recursive: true });
  r = run('scripts/validate-adventure.js', [path.join(NP, 'adventure.js'), '--images', NP], root);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /^OK {2}The Great Cookie Calamity: format 3, 6 chapters, 18 scenes, 13 flags, pictures checked in .*northpole, soundscapes checked against cartridge\.js$/m);
  /* the engine's own half is held to it too: a role for every trait, a bed and a voice for every soundscape, a whole token, rules it knows */
  const eng = fs.mkdtempSync(path.join(os.tmpdir(), 'first-roll-'));
  t.after(() => fs.rmSync(eng, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'src'), path.join(eng, 'src'), { recursive: true });
  fs.mkdirSync(path.join(eng, 'cartridges'));
  P.list(ROOT).forEach((p) => fs.symlinkSync(p.dir, path.join(eng, 'cartridges', p.id)));
  const baseFile = path.join(eng, 'src', 'base.js'), audioFile = path.join(eng, 'src', 'audio.js');
  fs.writeFileSync(baseFile, [swap("Scout: { trait: 'wild',", 'Scout: {'), swap("      sea: { label: 'The sea', synth: 'sea' }", "      sea: { label: 'The sea', synth: 'wind' }"),
    swap("plural: 'Hero tokens', ", ''), swap("  rules: 'open-5e',", "  rules: 'classic',")].reduce((s, f) => f(s), read(baseFile)));
  fs.writeFileSync(audioFile, swap('    cave: function (R) {', '    cavern: function (R) {')(read(audioFile)));
  const engine = P.check(eng, { reach: false }).errors.join('\n');
  assert.match(engine, /^engine: src\/base\.js cast\.roles has no role with trait: "wild"\. A class that names no role is filed under the role of its strongest trait, so each of might, guile, lore, faith, charm, wild needs one$/m);
  assert.match(engine, /^engine: src\/base\.js sound\.beds has no soundscape with synth: "sea"; every cartridge is given one for each of the engine's voices/m);
  assert.match(engine, /^engine: the soundscape "cave" \(FR\.AMBIENCE in src\/registry\.js\) is no longer made in src\/audio\.js \(FR\.Ambience\)$/m);
  assert.match(engine, /^engine: src\/base\.js kit\.token\.plural is missing; every cartridge falls back on it for what a hero token is called$/m);
  assert.match(engine, /^engine: src\/base\.js rules must be one of open-5e, light; it is what a cartridge that names none plays by$/m);
});

/* ---------- rules profiles (docs/PHASE2.md, section 6): the light cartridge, checked and scaffolded ---------- */
const lightPack = (root, id, change, extra) => addPack(root, id, change, extra, 'light');
const checked = (root, id, opts) => P.check(root, opts || { reach: false }).packs.filter((x) => x.id === id)[0];

test('the template comes in two kinds, and all that differs is what the rules need', () => {
  const light = P.template('light'), open = P.template('open-5e'), def = (text) => { const c = []; vm.runInNewContext(text.split('__ID__').join('kind').split('__NAME__').join('Kind'), { FR: { cartridge: (d) => c.push(d) } }); return json(c[0]); };
  const L = def(light), O = def(open);
  assert.strictEqual(P.template(), light, 'light is what you get when you ask for nothing');
  assert.throws(() => P.template('house'), /There is no template for the rules "house"/);
  [light, open].forEach((text) => assert.ok(!/__[A-Z]+__/.test(text.split('__ID__').join('').split('__NAME__').join('')), 'every marker was filled'));
  assert.deepStrictEqual([L.rules, O.rules], ['light', 'open-5e']);
  /* everything but the cast's numbers, the rules line and the light rules' own block is the same in both */
  const rest = (d) => { const c = json(d); delete c.rules; delete c.light; delete c.cast.classes; delete c.cast.races; delete c.quiz.quick; return c; };
  assert.deepStrictEqual(rest(L), rest(O));
  assert.deepStrictEqual(Object.keys(L.cast.classes), Object.keys(O.cast.classes), 'the same twelve classes');
  assert.deepStrictEqual(Object.keys(L.cast.races), Object.keys(O.cast.races), 'the same six peoples');
  /* what an author writes for a class and a people, in each kind */
  Object.keys(L.cast.classes).forEach((c) => {
    assert.deepStrictEqual(Object.keys(L.cast.classes[c]).sort(), ['blurb', 'fair', 'kit', 'role', 'strengths', 'strong'], c + ' (light)');
    assert.deepStrictEqual(Object.keys(O.cast.classes[c]).sort(), ['armor', 'attacks', 'blurb', 'color', 'gear', 'hd', 'kit', 'prio', 'role', 'skills', 'strengths', 'v'], c + ' (open-5e)');
    assert.deepStrictEqual([L.cast.classes[c].role, L.cast.classes[c].kit, L.cast.classes[c].strengths], [O.cast.classes[c].role, O.cast.classes[c].kit, O.cast.classes[c].strengths], c + ' has the same role, kit and strengths in both');
  });
  Object.keys(L.cast.races).forEach((r) => assert.deepStrictEqual(Object.keys(L.cast.races[r]), ['perk'], r + ' is one line of flavour'));
  /* no number anywhere in a light class or people */
  const numbers = (v) => (typeof v === 'number' ? 1 : (v && typeof v === 'object' ? Object.keys(v).reduce((n, k) => n + numbers(v[k]), 0) : 0));
  assert.strictEqual(numbers(L.cast.classes) + numbers(L.cast.races), 0);
  assert.deepStrictEqual([numbers(O.cast.classes), numbers(O.cast.races)], [228, 70], 'where open-5e has three hundred');
  /* each part comes with its comment */
  ['strong: the skills the class is strong at', 'fair:  the skills it is fair at', 'Under the light rules a\n       people is flavour', 'The rules this cartridge plays by', 'Ways to fight (the light rules only)',
    'npm run new-cartridge <id> --rules open-5e', 'role: which of the roles below the class plays', 'strengths: three plain sentences', 'kit:  the ids of the items'].forEach((line) => assert.ok(light.indexOf(line) >= 0, 'the light template explains: ' + line));
  ['The rules this cartridge plays by', "'light'    one twenty-sided die and a bonus", 'hd:   hit die'].forEach((line) => assert.ok(open.indexOf(line) >= 0, 'the open-5e template explains: ' + line));
});

test('npm run new-cartridge writes a light cartridge that validates at once and builds; --rules open-5e writes today\'s kind', (t) => {
  const root = sandbox(t);
  let r = run('scripts/new-cartridge.js', ['hollow', '--name', 'Starlight Hollow', '--adventure'], root);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /plays by the light rules/);
  const dir = path.join(root, 'cartridges', 'hollow'), def = P.load(path.join(dir, 'cartridge.js')).def;
  assert.strictEqual(def.rules, 'light');
  assert.strictEqual(def.adventure, 'hollow');
  let p = checked(root, 'hollow', { samples: 4000 });
  assert.deepStrictEqual(p.errors, []);
  assert.deepStrictEqual(p.warnings.filter((w) => !/TODO/.test(w)), [], 'nothing to warn of but the placeholder wording');
  assert.strictEqual(p.theme.rules, 'light');
  r = run('scripts/validate.js', ['hollow'], root);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /ok {4}hollow {3}Starlight Hollow 0\.1\.0 · draft · one-shot · free · 0\.0 MB · light rules/);
  assert.match(r.out, /races {3}not chosen by the answers: a hero starts as the people in their class's sample picture/);
  assert.ok(!/· light rules/.test(run('scripts/validate.js', ['tavern'], root).out), 'an open-5e cartridge\'s line reads as it always has');
  /* made public, it builds, with its starter adventure */
  fs.writeFileSync(path.join(dir, 'cartridge.js'), read(path.join(dir, 'cartridge.js')).replace("visibility: 'draft'", "visibility: 'public'"));
  r = run('build.js', [], root);
  assert.strictEqual(r.code, 0, r.out);
  const m = JSON.parse(read(path.join(root, 'public', 'packs', 'manifest.json'))), e = m.packs.filter((x) => x.id === 'hollow')[0];
  assert.ok(e && /^packs\/hollow\/adventure\.js\?v=/.test(e.adventure));
  assert.match(read(path.join(root, 'public', 'packs', 'hollow', 'pack.js')), /"rules":"light"/);
  /* today's kind, on request: by flag, by flag=value, and the way npm hands a flag over */
  r = run('scripts/new-cartridge.js', ['classic', '--rules', 'open-5e'], root);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /plays by the open-5e rules/);
  const classic = P.load(path.join(root, 'cartridges', 'classic', 'cartridge.js')).def;
  assert.strictEqual(classic.rules, 'open-5e');
  assert.ok(classic.cast.classes['The Brawler'].hd === 12 && classic.cast.classes['The Brawler'].attacks.length === 2, 'with each class\'s numbers');
  p = checked(root, 'classic', { samples: 4000 });
  assert.deepStrictEqual(p.errors, []); assert.deepStrictEqual(p.warnings.filter((w) => !/TODO/.test(w)), []);
  assert.strictEqual(run('scripts/new-cartridge.js', ['classic-two', '--rules=open-5e'], root).code, 0);
  assert.strictEqual(P.load(path.join(root, 'cartridges', 'classic-two', 'cartridge.js')).def.rules, 'open-5e');
  const viaNpm = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'new-cartridge.js'), 'classic-three'], { env: Object.assign({}, process.env, { FR_ROOT: root, npm_config_rules: 'open-5e' }), encoding: 'utf8' });
  assert.strictEqual(viaNpm.status, 0, viaNpm.stdout + viaNpm.stderr);
  assert.strictEqual(P.load(path.join(root, 'cartridges', 'classic-three', 'cartridge.js')).def.rules, 'open-5e');
  /* rules nobody has heard of are refused, and nothing is written */
  r = run('scripts/new-cartridge.js', ['homebrew', '--rules', 'house'], root);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /"house" is not a set of rules\. Use --rules light .* or --rules open-5e/);
  assert.ok(!fs.existsSync(path.join(root, 'cartridges', 'homebrew')));
});

test('the light checks: each one catches a deliberately broken copy, and says where and what to do', (t) => {
  const root = sandbox(t), SKILLS = 'Athletics, Acrobatics, Sleight of Hand, Stealth, Arcana, History, Investigation, Nature, Religion, Animal Handling, Insight, Medicine, Perception, Survival, Deception, Intimidation, Performance, Persuasion';
  const brawler = "strong: ['Athletics', 'Survival'], fair: ['Perception', 'Intimidation'], kit: ['rope', 'trinket'],", strike = "{ id: 'strike', label: 'Hit it hard', hint: 'Fists, a blade, anything heavy', skill: 'Athletics' }";
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cases = [
    /* what a class must say */
    ['a class that does not say what it is strong at', swap(brawler, "fair: ['Perception', 'Intimidation'], kit: ['rope', 'trinket'],"), /^cast\.classes\.The Brawler\.strong: is missing\. Under the light rules a class lists the skills it is strong at \(a clear bonus on the die\), like strong: \["Athletics", "Survival"\]\.$/m],
    ['a class that does not say what it is fair at', swap(brawler, "strong: ['Athletics', 'Survival'], kit: ['rope', 'trinket'],"), /^cast\.classes\.The Brawler\.fair: is missing\. Under the light rules a class lists the skills it is fair at \(a small bonus on the die\), like fair: \["Perception", "Insight"\]\. Write fair: \[\] if there are none$/m],
    ['strong skills written as one word', swap(brawler, "strong: 'Athletics', fair: [], kit: ['rope', 'trinket'],"), /^cast\.classes\.The Brawler\.strong: must be a list of skills, like strong: \["Athletics", "Survival"\]$/m],
    ['a class that is strong at nothing', swap(brawler, "strong: [], fair: ['Perception'], kit: ['rope', 'trinket'],"), /^cast\.classes\.The Brawler\.strong: is empty\. A class must be strong at something: name one to 4 skills, like strong: \["Athletics", "Survival"\]$/m],
    ['a skill that does not exist', swap(brawler, "strong: ['Athletics', 'Brawling'], fair: [], kit: ['rope', 'trinket'],"), new RegExp('^cast\\.classes\\.The Brawler\\.strong: "Brawling" is not a skill \\(' + SKILLS + '\\)$', 'm')],
    ['a fair skill that does not exist', swap(brawler, "strong: ['Athletics'], fair: ['Cooking'], kit: ['rope', 'trinket'],"), new RegExp('^cast\\.classes\\.The Brawler\\.fair: "Cooking" is not a skill \\(' + SKILLS + '\\)$', 'm')],
    ['a class that is strong at everything', swap(brawler, "strong: ['Athletics', 'Survival', 'Stealth', 'Arcana', 'Insight', 'Medicine'], fair: [], kit: ['rope', 'trinket'],"), /^cast\.classes\.The Brawler\.strong: lists 6 skills; a class is strong at 4 at most \(two or three reads best\)\. Move 2 to fair, or take them out, so that no hero is good at everything$/m],
    ['a class that is fair at too much', swap(brawler, "strong: ['Athletics'], fair: ['Survival', 'Stealth', 'Arcana', 'Insight', 'Medicine', 'History', 'Nature'], kit: ['rope', 'trinket'],"), /^cast\.classes\.The Brawler\.fair: lists 7 skills; a class is fair at 6 at most\. Take 1 out, so that no hero is good at everything$/m],
    ['a skill named twice', swap(brawler, "strong: ['Athletics', 'Athletics'], fair: [], kit: ['rope', 'trinket'],"), /^cast\.classes\.The Brawler\.strong: names "Athletics" twice$/m],
    ['a skill in both lists', swap(brawler, "strong: ['Athletics', 'Survival'], fair: ['Survival'], kit: ['rope', 'trinket'],"), /^cast\.classes\.The Brawler\.fair: "Survival" is already one of this class's strong skills\. Keep it in one list only$/m],
    ['two classes the quiz cannot tell apart', swap("strong: ['Athletics', 'Intimidation'], fair: ['Perception', 'History'], kit: ['rope', 'lantern'],", "strong: ['Survival', 'Athletics'], fair: ['Intimidation', 'Perception'], kit: ['rope', 'lantern'],"), /^cast\.classes\.The Guardian: has the same role and the same strong and fair skills as The Brawler, so the quiz cannot tell them apart and nobody would ever be given one of them\. Change a skill in one of the two$/m],
    ['a class with no blurb', swap("'The Brawler': { role: 'Protector', blurb: 'TODO one line that sells this class.',", "'The Brawler': { role: 'Protector',"), /^cast\.classes\.The Brawler\.blurb: missing$/m],
    ['a dice colour that is not a colour', swap("'The Brawler': { role: 'Protector',", "'The Brawler': { color: 'red', role: 'Protector',"), /^cast\.classes\.The Brawler\.color: must be a colour like #8c2f1b \(the dice are cast in it\), or be left out: the engine then picks one that suits the class$/m],
    ['gear that says nothing', swap("'The Brawler': { role: 'Protector',", "'The Brawler': { gear: '', role: 'Protector',"), /^cast\.classes\.The Brawler\.gear: is empty\. Write what the class wears and carries \(it is for the painter, when AI portraits are on\), or leave the line out$/m],
    ['a class in a role that does not exist', swap("'The Brawler': { role: 'Protector',", "'The Brawler': { role: 'Tank',"), /^cast\.classes\.The Brawler\.role: "Tank" is not one of this cartridge's roles \(Protector, Trickster, Thinker, Healer, Talker, Scout\)/m],
    ['two strengths instead of three', swap("'TODO You are the strongest one here.', ", ''), /^cast\.classes\.The Brawler\.strengths: must be 3 plain sentences, like \[.*\] \(it has 2\)$/m],
    ['a sample that names no people', swap("'The Brawler': 'Outlanders'", "'The Brawler': 'Nobody'"), /^cast\.samples\.The Brawler: "Nobody" is not one of this pack's races$/m],
    /* what a people may say */
    ['a people whose line is empty', swap("Townsfolk: { perk: 'TODO Adaptable: they have turned a hand to most things.' }", "Townsfolk: { perk: '' }"), /^cast\.races\.Townsfolk\.perk: is empty\. Write one line about this people, like "Keen senses: little in the woods gets past them\.", or leave the line out$/m],
    ['a look that says nothing', swap("Townsfolk: { perk:", "Townsfolk: { look: ' ', perk:"), /^cast\.races\.Townsfolk\.look: is empty\. Write what this people looks like \(it is for the painter, when AI portraits are on\), or leave the line out$/m],
    ['a people that is only a word', swap("Townsfolk: { perk: 'TODO Adaptable: they have turned a hand to most things.' }", "Townsfolk: 'Adaptable'"), /^cast\.races\.Townsfolk: must be an object$/m],
    ['names with no first names', swap("Townsfolk: { m: ['Aldric', 'Bram', 'Tomas'],", "Townsfolk: { m: [],"), /^cast\.names\.Townsfolk\.m: needs at least one name$/m],
    ['no names at all', (text) => { const re = / {4}names: \{[\s\S]*?\n {4}\},\n/; assert.ok(re.test(text), 'the template has a names block'); return text.replace(re, '    names: {},\n'); }, /^cast\.names: needs the names of at least one people, like \{ Townsfolk: \{ m: \["Bram"\], f: \["Mira"\], s: \["Ashdown"\] \} \}, for "Roll a name"\. A people with no list of its own borrows the first one$/m],
    /* the ways to fight, and the lines only these rules say */
    ['ways to fight that are not a list', (text) => { const re = / {4}fight: \[[\s\S]*?\n {4}\]\n/; assert.ok(re.test(text), 'the template has a list of ways to fight'); return text.replace(re, "    fight: 'Hit it hard'\n"); }, /^light\.fight: must be a list of ways to fight, like \[\{ id: "strike", label: "Hit it hard", hint: "Fists, a blade, anything heavy", skill: "Athletics" \}\]\. Leave the line out to use the engine's$/m],
    ['a way to fight with no skill', swap(strike, "{ id: 'strike', label: 'Hit it hard', hint: 'Fists, a blade, anything heavy' }"), /^light\.fight\[strike\]\.skill: is missing\. Name the skill this way of fighting comes down to, like skill: "Athletics" \(or a list, like \["Arcana", "Nature"\]: the hero rolls whichever they are best at\)$/m],
    ['a way to fight on a skill that does not exist', swap(strike, "{ id: 'strike', label: 'Hit it hard', hint: 'Fists, a blade, anything heavy', skill: ['Athletics', 'Fencing'] }"), new RegExp('^light\\.fight\\[strike\\]\\.skill: "Fencing" is not a skill\\. Use one of ' + SKILLS + '$', 'm')],
    ['a way to fight with no label', swap(strike, "{ id: 'strike', hint: 'Fists, a blade, anything heavy', skill: 'Athletics' }"), /^light\.fight\[strike\]\.label: is missing\. Write what the row on the fight tab says, like "Hit it hard" \(40 characters at most\)$/m],
    ['a label too long for a row', swap("label: 'Hit it hard'", "label: '" + 'Hit it very hard indeed, '.repeat(2) + "'"), /^light\.fight\[strike\]\.label: is 50 characters long, and 40 is what fits on a row\. Shorten it by 10$/m],
    ['a way to fight with no hint', swap(strike, "{ id: 'strike', label: 'Hit it hard', skill: 'Athletics' }"), /^light\.fight\[strike\]\.hint: is missing\. Write the small line under it, like "Fists, a blade, anything heavy" \(80 characters at most\)$/m],
    ['a way to fight with no id', swap(strike, "{ label: 'Hit it hard', hint: 'Fists, a blade, anything heavy', skill: 'Athletics' }"), /^light\.fight\[0\]\.id: is missing\. Give each way to fight a short word of its own in lower case with no spaces, like "strike"$/m],
    ['two ways to fight with one id', swap("{ id: 'dart',", "{ id: 'strike',"), /^light\.fight: two ways to fight share the id "strike"\. Each needs its own$/m],
    ['something that is not part of a way to fight', swap(strike, "{ id: 'strike', label: 'Hit it hard', hint: 'Fists, a blade, anything heavy', skill: 'Athletics', damage: 8 }"), /^light\.fight\[strike\]\.damage: not part of a way to fight \(it may have id, label, hint, skill\)$/m],
    ['nine ways to fight', swap(strike + ',', strike + ',\n      ' + Array.from({ length: 3 }, (x, i) => "{ id: 'extra" + i + "', label: 'Extra', hint: 'One more', skill: 'Stealth' }").join(', ') + ','), /^light\.fight: lists 9 ways to fight; the fight tab has room for 8\. Take 1 out$/m],
    ['a line the light rules do not say', swap("  light: {\n    fight: [", "  light: {\n    text: { strongAt: 'Great at this' },\n    fight: ["), /^light\.text\.strongAt: not a line the light rules say \(they say fairAt, fairAtHead, hitSay, hitNat20, fightHowB, fightHow, detailsNote, matchNote\)\. Every other line on the screens goes in `text`$/m],
    ['a line that is not words', swap("  light: {\n    fight: [", "  light: {\n    text: { fairAt: 3 },\n    fight: ["), /^light\.text\.fairAt: must be a line of text$/m],
    ['something that is not part of the block', swap("  light: {\n    fight: [", "  light: {\n    damage: true,\n    fight: ["), /^light\.damage: not part of the light rules \(it may have fight, text\)$/m]
  ];
  cases.forEach(([what, change, want]) => {
    const dir = lightPack(root, 'case', change), p = checked(root, 'case');
    assert.match(p.errors.join('\n'), want, what + '\n' + p.errors.join('\n'));
    assert.strictEqual(p.errors.length, 1, what + ' is the only fault:\n' + p.errors.join('\n'));
    fs.rmSync(dir, { recursive: true });
  });

  /* what is allowed: a class with no fair skills, one fair at six, a people with nothing to say, one list of names for
     everybody, a class with its own dice colour and gear, a cartridge with no ways to fight of its own, a reworded line */
  const fine = [swap(brawler, "strong: ['Athletics', 'Survival'], fair: [], kit: ['rope', 'trinket'],"),
    swap(brawler, "strong: ['Athletics'], fair: ['Survival', 'Stealth', 'Arcana', 'Insight', 'Medicine', 'History'], kit: ['rope', 'trinket'],"),
    swap("Townsfolk: { perk: 'TODO Adaptable: they have turned a hand to most things.' }", 'Townsfolk: {}'),
    (text) => text.replace(/ {4}names: \{[\s\S]*?\n {4}\},\n/, "    names: { Townsfolk: { m: ['Bram'], f: ['Mira'], s: ['Ashdown'] } },\n"),
    swap("'The Brawler': { role: 'Protector',", "'The Brawler': { color: '#225588', gear: 'furs and a very large axe', role: 'Protector',"),
    (text) => { const re = / {2}light: \{[\s\S]*?\n {2}\},\n/; assert.ok(re.test(text), 'the template has a light block'); return text.replace(re, ''); },
    swap("  light: {\n    fight: [", "  light: {\n    text: { fairAt: 'Not bad at this' },\n    fight: [")];
  fine.forEach((change, i) => { const dir = lightPack(root, 'case', change), p = checked(root, 'case'); assert.deepStrictEqual(p.errors, [], 'allowed ' + i); assert.deepStrictEqual(p.warnings.filter((w) => !/TODO/.test(w)), [], 'allowed ' + i); fs.rmSync(dir, { recursive: true }); });
  /* ...and what each of those means once the cartridge is put together */
  let dir = lightPack(root, 'case', (text) => fine[3](fine[4](fine[5](text)))), th = checked(root, 'case').theme;
  assert.strictEqual(th.light.fight.length, 6, 'the engine\'s six ways to fight stand in');
  assert.deepStrictEqual([th.classes['The Brawler'].color, th.classes['The Brawler'].gear], ['#225588', 'furs and a very large axe']);
  assert.strictEqual(th.classes['The Sneak'].color, '#3f4f7a', 'a class that names no colour is given one that suits it');
  const FRc = P.check(root, { reach: false }).FR; FRc.useTheme('case');
  assert.ok(FRc.NAMES.Townsfolk && !FRc.NAMES.Tinkers, 'one list of names was written');
  assert.match(FRc.rollName('Tinkers', 'Male'), /^Bram Ashdown$/, 'and a people with none of its own borrows it');
  assert.strictEqual(th.subject({ cls: 'The Sneak', race: 'Tinkers', look: {}, desc: '', name: 'Bram Ashdown' }), 'A androgynous tinkers the sneak.', 'with no gear and no look, the painter is told nothing about either');
  assert.strictEqual(th.subject({ cls: 'The Brawler', race: 'Tinkers', look: {}, desc: '', name: 'Bram Ashdown' }), 'A androgynous tinkers the brawler. Typical gear: furs and a very large axe.');
  fs.rmSync(dir, { recursive: true });

  /* a light cartridge still carrying open-5e's numbers is told so, as a warning: they do no harm */
  const warned = (change, rules) => { const d = addPack(root, 'case', change, null, rules), p = checked(root, 'case'); fs.rmSync(d, { recursive: true }); assert.deepStrictEqual(p.errors, [], p.errors.join('\n')); return p.warnings.join('\n'); };
  assert.match(warned(swap("'The Brawler': { role: 'Protector',", "'The Brawler': { v: [1, 0.1, 0, 0.1, 0.1, 0.7, -0.7, 0], hd: 12, prio: [1, 0.7, 0.9, 0.1, 0.4, 0.3], armor: 'unarmored', skills: ['Athletics'], attacks: [{ n: 'Axe', ab: 'STR', die: 12, cnt: 1, hint: 'Close' }], role: 'Protector',"), 'light'),
    /^cast\.classes\.The Brawler: has v, hd, prio, armor, skills and attacks, which only the "open-5e" rules read\. This cartridge plays by "light", where they do nothing: delete them \(or set rules: "open-5e" to play by the fuller rules\)$/m);
  assert.match(warned(swap("'The Brawler': { role: 'Protector',", "'The Brawler': { hd: 12, role: 'Protector',"), 'light'), /^cast\.classes\.The Brawler: has hd, which only the "open-5e" rules read\. This cartridge plays by "light", where it does nothing: delete it /m);
  assert.match(warned(swap("Townsfolk: { perk:", "Townsfolk: { v: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.1, 0.1], bonus: { STR: 1 }, speed: 30, lucky: true, perk:"), 'light'),
    /^cast\.races\.Townsfolk: has v, bonus, speed and lucky, which only the "open-5e" rules read\. This cartridge plays by "light", where a people changes no roll: delete them \(or set rules: "open-5e" to play by the fuller rules\)$/m);
  assert.match(warned(swap("  cast: {\n", "  cast: {\n    armorNotes: { leather: 'a thick coat' },\n"), 'light'), /^cast\.armorNotes: only the "open-5e" rules have armor\. This cartridge plays by "light", where it does nothing: delete it$/m);
  assert.match(warned((text) => swap("'The Brawler': 'Outlanders'", "'The Brawler': 'Townsfolk'")(swap("'The Trickster': 'Outlanders'", "'The Trickster': 'Townsfolk'")(text)), 'light'), /^cast\.races\.Outlanders: no class's sample shows this people \(cast\.samples\), so no hero starts as one\. A player can still choose it\. To have it come up, name it as the sample of a class$/m);
  /* and the other way about: an open-5e cartridge carrying what only the light rules read */
  assert.match(warned(swap("role: 'Protector', kit: ['rope', 'trinket'],", "role: 'Protector', strong: ['Athletics'], fair: [], kit: ['rope', 'trinket'],")),
    /^cast\.classes\.The Brawler: has strong and fair, which only the "light" rules read\. This cartridge plays by "open-5e", where they do nothing: delete them \(or set rules: "light" to play by the lighter rules\)$/m);
  assert.match(warned(swap("  rules: 'open-5e',", "  rules: 'open-5e',\n  light: { fight: [" + strike + "] },")), /^light: this block is only read under rules: "light"\. This cartridge plays by "open-5e", so it does nothing: delete it, or set rules: "light"$/m);

  /* An open-5e cartridge switched to the light rules by its one line is told, class by class, what to write: starting
     from the skills it already has. Its numbers are then only warned about. */
  dir = addPack(root, 'case', swap("  rules: 'open-5e',", "  rules: 'light',"));
  let p = checked(root, 'case');
  assert.strictEqual(p.errors.length, 24, 'a strong and a fair list for each of the twelve classes');
  assert.match(p.errors.join('\n'), /^cast\.classes\.The Brawler\.strong: is missing\. Under the light rules a class lists the skills it is strong at \(a clear bonus on the die\), like strong: \["Athletics", "Survival"\]\. Its open-5e skills are Athletics, Perception, Survival: start from those$/m);
  assert.strictEqual(p.warnings.filter((w) => /which only the "open-5e" rules read/.test(w)).length, 18, 'twelve classes and six peoples still carry their numbers');
  fs.rmSync(dir, { recursive: true });

  /* the reach check, the light way: a class written too much like another is nobody's hero, and the message says which */
  dir = lightPack(root, 'case', (text) => swap("strong: ['Arcana', 'History'], fair: ['Investigation', 'Nature'],", "strong: ['Arcana', 'Persuasion'], fair: ['Intimidation', 'Nature', 'Performance'],")(swap("  cast: {\n", "  cast: {\n    /* the Scholar is now the Spark with one more fair skill */\n")(text)).replace("'The Scholar': { role: 'Thinker',", "'The Scholar': { role: 'Talker',"));
  p = checked(root, 'case', { samples: 3000 });
  assert.match(p.errors.join('\n'), /^quiz\.questions: The (Scholar|Spark) is the result for only \d+\.\d% of players in the full quiz \(an even share is 8\.3%; at least 3\.3% is needed\)\. The quiz matches a class by its role and its strong and fair skills, and The (Scholar|Spark) reads too much like The (Spark|Scholar): give it a strong or fair skill that The (Spark|Scholar) does not have\.$/m, p.errors.join('\n'));
  fs.rmSync(dir, { recursive: true });

  /* the engine's half: the base must carry the ways to fight and every line the light rules say */
  const own = fs.mkdtempSync(path.join(os.tmpdir(), 'first-roll-'));
  t.after(() => fs.rmSync(own, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'src'), path.join(own, 'src'), { recursive: true });
  fs.mkdirSync(path.join(own, 'cartridges'));
  fs.copyFileSync(path.join(ROOT, 'cartridges', 'packs.json'), path.join(own, 'cartridges', 'packs.json'));
  P.list(ROOT).forEach((x) => fs.symlinkSync(x.dir, path.join(own, 'cartridges', x.id)));
  const baseFile = path.join(own, 'src', 'base.js');
  fs.writeFileSync(baseFile, swap("fairAt: 'Fair at this', ", '')(read(baseFile)).replace(/ {4}fight: \[[\s\S]*?\n {4}\],\n/, '    fight: [],\n'));
  const r = run('scripts/validate.js', [], own);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /^FAIL {2}engine: src\/base\.js light\.fight is missing; a cartridge on the light rules that writes no ways to fight falls back on it$/m);
  assert.match(r.out, /^FAIL {2}engine: src\/base\.js light\.text\.fairAt is missing; the light rules say it \(FR\.LIGHT\.words in src\/rules\.js\), and every cartridge falls back on the base for it$/m);
});
