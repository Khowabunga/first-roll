/* Starts a new cartridge from the template: a working draft that extends the base cartridge, with
   every piece of placeholder wording marked TODO.

     npm run new-cartridge <id> [--name "Its Name"] [--adventure] [--rules light|open-5e]
     e.g.  npm run new-cartridge haunted-manor --name "The Haunted Manor"
           npm run new-cartridge haunted-manor --adventure        (through npm, `-- --adventure` works too)
           npm run new-cartridge haunted-manor --rules open-5e    (`--rules=open-5e` and `-- --rules open-5e` work too)

   <id> is the folder and the ?s= address: lower-case letters, digits and hyphens.
   --rules chooses the rules the cartridge plays by. 'light' (what you get when you say nothing) is one die
   and a bonus, and a class only says what it is strong and fair at; 'open-5e' is the fuller rules, and the
   cartridge then carries each class's numbers. README.md says when to choose which.
   --adventure also writes adventure.js, a small starter adventure for the DM to run (three scenes, one
   choice, two endings) that uses every part an adventure can have, names it in cartridge.js, and puts
   the starter's hand-drawn map in img/map.svg. */
'use strict';
const fs = require('fs'), path = require('path');
const P = require('./lib/packs.js');

const args = process.argv.slice(2);
let id = '', name = process.env.npm_config_name && process.env.npm_config_name !== 'true' ? process.env.npm_config_name : '';     // npm hands "--name X" over this way
let adventure = !!process.env.npm_config_adventure && process.env.npm_config_adventure !== 'false';                               // and "--adventure" this way
let rules = process.env.npm_config_rules && process.env.npm_config_rules !== 'true' ? process.env.npm_config_rules : '';          // and "--rules X" this way
const loose = [];                   // words that belong to no flag
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name') { name = args[++i] || ''; } else if (args[i].indexOf('--name=') === 0) { name = args[i].slice(7); }
  else if (args[i] === '--rules') { rules = args[++i] || ''; } else if (args[i].indexOf('--rules=') === 0) { rules = args[i].slice(8); }
  else if (args[i] === '--adventure') { adventure = true; } else if (args[i][0] !== '-') { if (!id) { id = args[i]; } else { loose.push(args[i]); } }
}
const stop = (msg) => { console.error('\n' + msg + '\n\nUsage: npm run new-cartridge <id> [--name "Its Name"] [--adventure] [--rules light|open-5e]\n'); process.exit(1); };
const RULES = P.engine().RULES;         // the rules the engine knows (src/rules.js)
/* Newer npm keeps "--rules" for itself and hands its value over as a loose word ("npm run new-cartridge x
   --rules open-5e" arrives as "x open-5e"). A loose word that names a set of rules is therefore the rules;
   any other is a mistake worth stopping for, not something to drop without a word. */
loose.forEach((w) => {
  if (!rules && RULES.indexOf(w) >= 0) { rules = w; return; }
  stop('I do not know what to do with "' + w + '". A name of more than one word goes in quotes after --name; the rules are --rules light or --rules open-5e.');
});
if (!rules && process.env.npm_config_rules === 'true') { stop('--rules needs to say which: --rules light or --rules open-5e.'); }
rules = rules || 'light';               // the lighter rules unless asked otherwise: far less for an author to write
if (RULES.indexOf(rules) < 0) { stop('"' + rules + '" is not a set of rules. Use --rules light (one die and a bonus; the least to write) or --rules open-5e (the fuller rules).'); }

if (!id) { stop('Give the new scenario an id.'); }
if (!P.ID.test(id) || id === 'base') { stop('"' + id + '" cannot be an id. Use lower-case letters, digits and hyphens, starting with a letter (and not "base").'); }
const dir = path.join(P.ROOT, 'cartridges', id);
if (fs.existsSync(dir)) { stop('cartridges/' + id + '/ already exists.'); }
name = (name || id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')).trim();
const quoted = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const fill = (text) => text.split('__ID__').join(id).split('__NAME__').join(quoted(name));
let cartridge = P.template(rules);
if (adventure) {                    // the template carries the line switched off; with an adventure beside it, it is switched on
  const off = "  // adventure: '__ID__',";
  if (cartridge.indexOf(off) < 0) { stop('scripts/template/cartridge.js no longer has its "// adventure:" line, so the starter adventure cannot be named in the new cartridge.'); }
  cartridge = cartridge.replace(off, "  adventure: '__ID__',");
}
fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
fs.writeFileSync(path.join(dir, 'cartridge.js'), fill(cartridge));
if (adventure) {
  fs.writeFileSync(path.join(dir, 'adventure.js'), fill(P.read(path.join(__dirname, 'template', 'adventure.js'))));
  fs.copyFileSync(path.join(__dirname, 'template', 'img', 'map.svg'), path.join(dir, 'img', 'map.svg'));      // the map the starter adventure uncovers
}
fs.writeFileSync(path.join(dir, 'theme.css'), fill(P.read(path.join(__dirname, 'template', 'theme.css'))));
fs.writeFileSync(path.join(dir, 'img', '.gitkeep'), '');

const mine = P.check().packs.filter((p) => p.id === id)[0];
console.log('\nMade cartridges/' + id + '/ ("' + name + '"), a draft that extends the base cartridge and plays by the ' + rules + ' rules:');
console.log('  cartridge.js   the cartridge: its label, cast, questions and wording. Search it for TODO.');
console.log(rules === 'light' ? '                 Light rules: a class says what it is strong and fair at, and there are no numbers to write.'
  : '                 Open-5e rules: each class carries its numbers. (Leave --rules out for the lighter rules, with far less to write.)');
if (adventure) { console.log('  adventure.js   a starter adventure for the DM to run: three scenes, one choice, two endings. Rewrite it as your own.'); }
console.log('  theme.css      its own styles, if it wants any (empty for now)');
console.log('  img/           its pictures, as you make them' + (adventure ? ' (map.svg is the starter adventure\'s map: redraw it as your own)' : ''));
if (mine && mine.errors.length) { console.log('\nIt does not validate yet:'); mine.errors.forEach((e) => console.log('  x ' + e)); process.exit(1); }
console.log('\nNext:');
console.log('  npm run validate -- ' + id + '       check it, and see how evenly the quiz spreads players');
console.log('  node build.js --drafts          build it while it is a draft, then open the app with ?s=' + id);
if (adventure) { console.log('  tap "I am the DM" there       to run the starter adventure'); }
else { console.log('  add --adventure next time       to get a starter adventure for the DM as well'); }
console.log('  set visibility to \'public\' in cartridge.js when it is ready to be listed\n');
