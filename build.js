/* Builds the whole website into public/ from the engine (src/) and the scenario packs (cartridges/).
   public/ is generated: nothing in it is edited by hand or kept in git. Wrangler runs this before
   every deploy and every time a file in src/ or cartridges/ changes during `npm run dev`.

     node build.js            the site as it deploys (draft packs are left out)
     node build.js --drafts   include draft packs too, to try one out at ?s=<id>   (or FR_DRAFTS=1)

   What comes out:
     public/index.html             the engine, its styles, the list of packs, and the default pack, in one page
     public/packs/<id>/pack.js     one pack as data: FR.cartridge({...})
     public/packs/<id>/pack.css    the pack's theme.css, when it has one
     public/packs/<id>/adventure.js, img/, audio/    the pack's own files
     public/packs/manifest.json    the list of packs, for tools (the page carries its own copy)
     public/img/, public/vendor/   the engine's pictures and libraries
     public/_headers               long caching for all of the above (read by Cloudflare)
   Every address the page asks for carries ?v=<hash of the file>, so a week-long cache can never
   serve an old file after a deploy. */
'use strict';
const fs = require('fs'), path = require('path');
const P = require('./scripts/lib/packs.js');

const ROOT = P.ROOT, OUT = path.join(ROOT, 'public');
const drafts = process.argv.indexOf('--drafts') >= 0 || process.env.FR_DRAFTS === '1';
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const has = (f) => fs.existsSync(path.join(ROOT, f));
const files = (dir) => (has(dir) ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f[0] !== '.' && fs.statSync(path.join(ROOT, dir, f)).isFile()).sort() : []);
const fail = (lines) => { console.error('\nBuild stopped:\n  ' + [].concat(lines).join('\n  ') + '\n'); process.exit(1); };

/* ---------- 1. check the packs; a pack with a fault is never shipped ---------- */
const report = P.check(ROOT), FR = report.FR, ship = P.shipping(report, drafts);
const faults = report.errors.slice();
/* a draft that is not being built may be half-written; every other pack must be sound */
report.packs.forEach((p) => { const draft = p.def && p.def.meta && p.def.meta.visibility === 'draft'; if (!draft || drafts) { p.errors.forEach((e) => faults.push(p.id + ': ' + e)); } });
if (faults.length) { fail(faults.concat('', 'Run "npm run validate" for the full report.')); }
if (!ship.packs.some((p) => p.id === ship.default)) { fail('There is no default pack to open. Name one in cartridges/packs.json.'); }
const skipped = report.packs.filter((p) => ship.packs.indexOf(p) < 0).map((p) => p.id);

/* ---------- 2. gather everything that goes out, and a hash of each file ---------- */
const out = new Map();              // path under public/ -> { from: a file to copy } or { data: bytes to write }
const hashes = {};                  // path under public/ -> short hash of its contents
const put = (rel, text) => { const data = Buffer.from(text); out.set(rel, { data: data }); hashes[rel] = P.hash(data); };
const copy = (rel, from) => { out.set(rel, { from: from }); hashes[rel] = P.hash(fs.readFileSync(from)); };
const v = (rel) => { if (!hashes[rel]) { fail('"' + rel + '" is asked for but is not part of the build.'); } return rel + '?v=' + hashes[rel]; };
const only = (prefix) => { const o = {}; Object.keys(hashes).filter((k) => k.indexOf(prefix) === 0).forEach((k) => { o[k] = hashes[k]; }); return o; };
/* JSON that is safe inside a <script> block */
const inline = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
/* Give every url(...) in a stylesheet its hash. `at` is where the sheet's own files live under public/
   ('' for the engine, 'packs/<id>/' for a pack); `rebase` writes the address from the page instead of
   from the sheet, for styles that are written into the page itself. */
function cssUrls(css, at, rebase, what) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (whole, quote, u) => {
    if (/^(data:|https?:|#)/.test(u)) { return whole; }
    if (!hashes[at + u]) { fail(what + ': url(' + u + ') is not a file in ' + (at ? 'the pack' : 'src/') + '.'); }
    return 'url(' + (rebase ? at : '') + u + '?v=' + hashes[at + u] + ')';
  });
}

['img', 'vendor'].forEach((dir) => files('src/' + dir).forEach((f) => copy(dir + '/' + f, path.join(ROOT, 'src', dir, f))));

const entries = ship.packs.map((p) => {
  const id = p.id, at = 'packs/' + id + '/', rel = path.relative(ROOT, p.dir);
  ['img', 'audio'].forEach((dir) => files(rel + '/' + dir).forEach((f) => copy(at + dir + '/' + f, path.join(p.dir, dir, f))));
  let theme = has(rel + '/theme.css') ? src(rel + '/theme.css') : '';
  if (!theme.replace(/\/\*[\s\S]*?\*\//g, '').trim()) { theme = ''; }             // nothing but comments: no stylesheet to ship
  if (theme) { put(at + 'pack.css', cssUrls(theme, at, false, rel + '/theme.css')); }
  if (has(rel + '/adventure.js')) {                         // shipped as plain JSON, like the scenario: a pack file never runs as code in the page
    const adv = P.loadAdventure(path.join(p.dir, 'adventure.js'));
    if (adv.error || adv.notData) { fail(rel + '/adventure.js ' + (adv.error || adv.notData) + '. Run npm run validate.'); }
    put(at + 'adventure.js', '/* First Roll adventure for "' + id + '". Generated from ' + rel + '/adventure.js: edit that, not this. */\nFR.adventure(' + inline(id) + ', ' + inline(JSON.parse(JSON.stringify(adv.def))) + ');\n');
  }
  /* the pack as it ships: plain JSON, with the hashes of its own files */
  p.call = 'FR.cartridge(' + inline(p.def) + ', ' + inline({ assets: Object.assign(only(at + 'img/'), only(at + 'audio/')) }) + ');';
  put(at + 'pack.js', '/* First Roll scenario pack "' + id + '" ' + p.def.version + '. Generated from ' + rel + '/cartridge.js: edit that, not this. */\n' + p.call + '\n');
  p.theme = theme;
  return p;
});

/* the engine now knows every hash, so the addresses it works out carry them */
FR.manifest(FR.MANIFEST, hashes);
const manifest = { schema: FR.SCHEMA, default: ship.default, packs: entries.map((p) => {
  const id = p.id, at = 'packs/' + id + '/', meta = p.def.meta, whole = FR.resolved(id);
  FR.cartridge(p.def);                                        // again, so its theme is rebuilt with hashed addresses
  return { id: id, version: p.def.version, name: meta.name, blurb: meta.blurb, kind: meta.kind, access: meta.access, sku: meta.sku, visibility: meta.visibility,
    extends: p.def.extends === undefined ? 'base' : p.def.extends, thumb: v(whole.art.thumb), js: v(at + 'pack.js'), css: p.theme ? v(at + 'pack.css') : null,
    adventure: hashes[at + 'adventure.js'] ? v(at + 'adventure.js') : null, fonts: FR.THEMES[id].fonts,
    /* what a cartridge card shows, and every credit the cartridge carries: its own and the ones the base gives every cartridge (the rules credit) */
    label: FR.THEMES[id].label, credits: FR.THEMES[id].credits };
}) };
put('packs/manifest.json', JSON.stringify(manifest, null, 2) + '\n');

/* ---------- 3. the page ---------- */
const first = entries.filter((p) => p.id === ship.default)[0];
const engineCss = [src('src/styles.css')].concat(files('src/css').filter((f) => /\.css$/.test(f)).map((f) => src('src/css/' + f))).join('\n');
const packCss = FR.tokensCss(first.id) + cssUrls(first.theme, 'packs/' + first.id + '/', true, 'theme.css of ' + first.id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const maybe = (list) => list.filter(has);                    // files other parts of the app may or may not have added yet
/* a default pack that extends another pack needs that one in the page too, or it could not be put together */
const under = [];
for (let up = first.def.extends; up && up !== 'base';) { const parent = entries.filter((p) => p.id === up)[0]; under.unshift(parent.call); up = parent.def.extends; }
const boot = ['src/rules.js', 'src/registry.js', 'src/base.js'].map(src).concat([
  'FR.manifest(' + inline(manifest) + ', ' + inline(Object.assign(only('img/'), only('vendor/'))) + ');'
], under, [
  first.call,
  'FR.begin();'
]).join('\n');
const main = ['src/dice.js', 'src/audio.js', 'src/fx.js', 'src/flatdice.js'].map(src).concat([
  '/* the screens: started by FR.boot() once the chosen scenario is here */',
  'FR.main = function () {',
  ['src/app.js', 'src/table.js', 'src/tv.js', 'src/dm.js'].map(src).join('\n'),
  '};',
  'FR.boot();'
]).join('\n');
[boot, main].forEach((js) => { if (/<\/script/i.test(js)) { fail('A script in src/ contains "</script", which would cut the page short. Write it as "<\\/script".'); } });
const fill = {
  '<!--FONTS-->': FR.THEMES[first.id].fonts.map((u) => '<link rel="stylesheet" href="' + esc(u) + '">').join('\n'),
  '/*CSS*/': cssUrls(engineCss, '', false, 'src/styles.css'),
  '<!--PACKCSS-->': packCss ? '<style data-pack="' + first.id + '">\n' + packCss + '</style>' : '',
  '/*BOOT*/': boot,
  /* No library is in the page any more. The QR code maker is fetched when the DM's side first wants one, and the two
     libraries behind the 3D dice when the dice tray first opens: FR.lib('qr') and FR.lib('dice') in src/registry.js. */
  '<!--LIBS-->': '<!-- libraries are fetched when first wanted: FR.lib in src/registry.js -->',
  '/*JS*/': main
};
let page = src('src/index.html');
Object.keys(fill).forEach((mark) => {
  if (page.split(mark).length !== 2) { fail('src/index.html must contain the marker ' + mark + ' exactly once.'); }
  page = page.replace(mark, () => fill[mark]);
});
put('index.html', page);
put('_headers', '/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n' + ['/img/*', '/vendor/*', '/packs/*'].map((p) => p + '\n  Cache-Control: public, max-age=604800\n').join('') + '/packs/manifest.json\n  ! Cache-Control\n');

/* ---------- 4. write public/ to match: new and changed files in, anything else out ---------- */
let wrote = 0, removed = 0, bytes = 0;
out.forEach((o, rel) => {
  const to = path.join(OUT, rel), data = o.data || fs.readFileSync(o.from);
  bytes += data.length;
  if (fs.existsSync(to) && fs.statSync(to).isFile() && fs.readFileSync(to).equals(data)) { return; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, data); wrote++;
});
(function sweep(dir, rel) {
  if (!fs.existsSync(dir)) { return; }
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name), r = rel ? rel + '/' + name : name;
    if (fs.statSync(full).isDirectory()) { sweep(full, r); if (!fs.readdirSync(full).length) { fs.rmdirSync(full); } }
    else if (!out.has(r)) { fs.unlinkSync(full); removed++; }
  });
})(OUT, '');
/* outputs of the old build that nothing makes any more */
['Open First Roll.html', 'dist/first-roll.html'].forEach((f) => { if (has(f)) { fs.unlinkSync(path.join(ROOT, f)); } });
if (has('dist') && !fs.readdirSync(path.join(ROOT, 'dist')).length) { fs.rmdirSync(path.join(ROOT, 'dist')); }

console.log('built public/: ' + entries.map((p) => p.id + (p.id === ship.default ? ' (default)' : '') + (p.def.meta.visibility !== 'public' ? ' [' + p.def.meta.visibility + ']' : '')).join(', ') +
  ' | page ' + P.kb(out.get('index.html').data.length) + ', ' + out.size + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB | ' + wrote + ' written, ' + removed + ' removed' +
  (skipped.length ? ' | left out: ' + skipped.join(', ') + (drafts ? '' : ' (drafts need --drafts)') : ''));
