/* Starts a new scenario pack from the template: a working draft that extends the base pack, with
   every piece of placeholder wording marked TODO.

     npm run new-scenario <id> [--name "Its Name"]
     e.g.  npm run new-scenario haunted-manor --name "The Haunted Manor"

   <id> is the folder and the ?s= address: lower-case letters, digits and hyphens. */
'use strict';
const fs = require('fs'), path = require('path');
const P = require('./lib/packs.js');

const args = process.argv.slice(2);
let id = '', name = process.env.npm_config_name && process.env.npm_config_name !== 'true' ? process.env.npm_config_name : '';     // npm hands "--name X" over this way
for (let i = 0; i < args.length; i++) { if (args[i] === '--name') { name = args[++i] || ''; } else if (args[i].indexOf('--name=') === 0) { name = args[i].slice(7); } else if (args[i][0] !== '-' && !id) { id = args[i]; } }
const stop = (msg) => { console.error('\n' + msg + '\n\nUsage: npm run new-scenario <id> [--name "Its Name"]\n'); process.exit(1); };

if (!id) { stop('Give the new scenario an id.'); }
if (!P.ID.test(id) || id === 'base') { stop('"' + id + '" cannot be an id. Use lower-case letters, digits and hyphens, starting with a letter (and not "base").'); }
const dir = path.join(P.ROOT, 'scenarios', id);
if (fs.existsSync(dir)) { stop('scenarios/' + id + '/ already exists.'); }
name = (name || id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')).trim();
const quoted = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const fill = (text) => text.split('__ID__').join(id).split('__NAME__').join(quoted(name));
fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
fs.writeFileSync(path.join(dir, 'scenario.js'), fill(P.read(path.join(__dirname, 'template', 'scenario.js'))));
fs.writeFileSync(path.join(dir, 'theme.css'), fill(P.read(path.join(__dirname, 'template', 'theme.css'))));
fs.writeFileSync(path.join(dir, 'img', '.gitkeep'), '');

const mine = P.check().packs.filter((p) => p.id === id)[0];
console.log('\nMade scenarios/' + id + '/ ("' + name + '"), a draft that extends the base pack:');
console.log('  scenario.js   the pack: cast, questions and wording. Search it for TODO.');
console.log('  theme.css     its own styles, if it wants any (empty for now)');
console.log('  img/          its pictures, as you make them');
if (mine && mine.errors.length) { console.log('\nIt does not validate yet:'); mine.errors.forEach((e) => console.log('  x ' + e)); process.exit(1); }
console.log('\nNext:');
console.log('  npm run validate -- ' + id + '       check it, and see how evenly the quiz spreads players');
console.log('  node build.js --drafts          build it while it is a draft, then open the app with ?s=' + id);
console.log('  set visibility to \'public\' in scenario.js when it is ready to be listed\n');
