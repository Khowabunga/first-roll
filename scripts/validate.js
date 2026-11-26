/* Checks every scenario pack against the contract and says, pack by pack and key by key, what is
   wrong. Exits with 1 if anything is, so it can gate a deploy (npm run check).

     npm run validate                      every pack in cartridges/
     npm run validate -- tavern            only the packs named
     npm run validate -- --quick tavern    also work out the best five questions for a short game

   The checks themselves live in scripts/lib/packs.js, which the build uses too. */
'use strict';
const P = require('./lib/packs.js');

const args = process.argv.slice(2), want = [], quick = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--quick') { quick.push(args[++i]); } else if (args[i][0] !== '-') { want.push(args[i]); } }
const only = want.concat(quick).filter(Boolean);
const pct = (x) => (100 * x).toFixed(1) + '%';
const say = (s) => process.stdout.write(s + '\n');

const report = P.check();
const shown = report.packs.filter((p) => !only.length || only.indexOf(p.id) >= 0);
only.forEach((id) => { if (!report.packs.some((p) => p.id === id)) { report.errors.push('there is no pack called "' + id + '" in cartridges/'); } });

say('\nFirst Roll scenario packs (' + report.packs.length + ' in cartridges/, default: ' + (report.site.default || 'none set') + ')\n');
shown.forEach((p) => {
  const m = p.def && p.def.meta ? p.def.meta : null;
  /* which rules it plays by is said only when it is not the usual ones, so the line for an open-5e cartridge reads as it always has */
  const light = !!(p.theme ? p.theme.rules === 'light' : p.def && p.def.rules === 'light');
  say((p.errors.length ? 'FAIL  ' : 'ok    ') + p.id + (m ? '   ' + m.name + ' ' + p.def.version + ' · ' + m.visibility + ' · ' + m.kind + ' · ' + m.access + ' · ' + (p.bytes / 1048576).toFixed(1) + ' MB' + (light ? ' · light rules' : '') : ''));
  p.errors.forEach((e) => say('      x ' + e));
  p.warnings.forEach((w) => say('      ! ' + w));
  if (p.reach) {
    ['full', 'quick'].forEach((mode) => {
      const r = p.reach[mode];
      if (!r) { return; }
      say('      reach, ' + (mode === 'full' ? 'all ' + p.theme.questions.length + ' questions (' + r.samples + ' random players)' : 'quick ' + JSON.stringify(p.theme.quick) + ' (all ' + r.samples + ' ways to answer)') + ':');
      (light ? ['classes'] : ['classes', 'races']).forEach((kind) => {
        const s = r[kind];
        say('        ' + kind.padEnd(8) + pct(s.minShare) + ' ' + s.minName + ' … ' + pct(s.maxShare) + ' ' + s.maxName + '   (even share ' + pct(s.even) + '; allowed ' + pct(s.even * P.REACH[mode].min) + ' to ' + pct(s.even * P.REACH[mode].max) + ')');
      });
      /* under the light rules the answers choose the class only */
      if (light) { say('        races   not chosen by the answers: a hero starts as the people in their class\'s sample picture, and may change it'); }
    });
  }
  if (quick.indexOf(p.id) >= 0 && p.theme) {
    say('      best five questions for a short game (most even first):');
    P.bestQuick(report.FR, p.theme, 5, 5).forEach((b) => {
      say('        quick: ' + JSON.stringify(b.quick).replace(/,/g, ', ') + '   classes ' + pct(b.classes.minShare) + ' to ' + pct(b.classes.maxShare) + (light ? '' : ', races ' + pct(b.races.minShare) + ' to ' + pct(b.races.maxShare)));
    });
  }
  say('');
});
report.errors.forEach((e) => say('FAIL  ' + e));
report.warnings.forEach((w) => say('  !   ' + w));

const failed = report.errors.length + shown.reduce((n, p) => n + p.errors.length, 0);
const warned = report.warnings.length + shown.reduce((n, p) => n + p.warnings.length, 0);
say(failed ? failed + ' problem' + (failed === 1 ? '' : 's') + ' to fix.' : 'All packs are valid.' + (warned ? ' ' + warned + ' warning' + (warned === 1 ? '' : 's') + '.' : ''));
process.exit(failed ? 1 : 0);
