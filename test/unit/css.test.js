/* Every stylesheet the build ships must be made of real declarations. A slip in a search-and-replace
   once left "$1: var(--bw) $2 ..." in two files and nothing noticed, because browsers skip what they
   cannot read. This reads the sheets the way a browser would and fails on anything that is not
   `property: value`. */
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const sheets = ['src/styles.css']
  .concat(fs.readdirSync(path.join(ROOT, 'src/css')).filter((f) => f.endsWith('.css')).sort().map((f) => 'src/css/' + f))
  .concat(fs.readdirSync(path.join(ROOT, 'scenarios')).map((d) => 'scenarios/' + d + '/theme.css').filter((f) => fs.existsSync(path.join(ROOT, f))))
  .concat(['scripts/template/theme.css'].filter((f) => fs.existsSync(path.join(ROOT, f))));

/* the declarations of every rule, however deeply it is nested in @media and friends */
function declarations(css) {
  const out = [], text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  (function walk(s) {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i); if (open < 0) { break; }
      let depth = 1, j = open + 1;
      while (j < s.length && depth) { if (s[j] === '{') { depth++; } else if (s[j] === '}') { depth--; } j++; }
      const prelude = s.slice(i, open).trim(), body = s.slice(open + 1, j - 1);
      if (/^@(media|supports|container|layer)\b/.test(prelude) || /^@(-webkit-)?keyframes\b/.test(prelude)) { walk(body); }
      else if (body.indexOf('{') < 0) { body.split(';').map((d) => d.trim()).filter(Boolean).forEach((d) => out.push({ rule: prelude, text: d })); }
      i = j;
    }
  })(text);
  return out;
}

for (const file of sheets) {
  test(file + ': every declaration is a real "property: value"', () => {
    const css = fs.readFileSync(path.join(ROOT, file), 'utf8'), bad = [];
    assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, 'braces match up');
    for (const d of declarations(css)) {
      const m = /^(-{0,2}[a-zA-Z_][\w-]*)\s*:\s*(\S[\s\S]*)$/.exec(d.text);
      if (!m || /\$\d|\bundefined\b|\bNaN\b|\[object /.test(d.text)) { bad.push(d.rule.slice(0, 50) + ' { ' + d.text.slice(0, 70) + ' }'); }
    }
    assert.deepEqual(bad, []);
  });
}
