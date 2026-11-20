// Paints one sample portrait per class through the running server (the same route the app uses).
// node test/samples.js <theme> [Class Name]
const fs = require('fs'), path = require('path'), FR = require('../src/theme-northpole.js');
const sets = {
  northpole: [
    ['Santa', 'Penguin', { body: 'Male', age: 'Grandparent', build: 'Round', hair: 'Santa hat', mark: 'Jingle bells', bearing: 'Jolly' }],
    ['Toymaker', 'Workshop Elf', { body: 'Female', age: 'Grown-up', build: 'Tiny', hair: 'Earmuffs', mark: 'Round glasses', bearing: 'Dreamy' }],
    ['Baker', 'Human', { body: 'Female', age: 'Grandparent', build: 'Round', hair: 'Nothing', mark: 'Floury apron', bearing: 'Jolly' }],
    ['Caroler', 'Snowman', { body: 'Male', age: 'Grown-up', build: 'Round', hair: 'Top hat', mark: 'Striped scarf', bearing: 'Jolly' }],
    ['Sleigh Pilot', 'Reindeer', { body: 'Female', age: 'Grown-up', build: 'Slim', hair: 'Nothing', mark: 'Striped scarf', bearing: 'Brave' }],
    ['Candy Cane Knight', 'Nutcracker', { body: 'Male', age: 'Grown-up', build: 'Huge', hair: 'Nothing', mark: 'Candy cane', bearing: 'Brave' }],
    ['Chimney Sneak', 'Gingerbread', { body: 'Female', age: 'Grown-up', build: 'Slim', hair: 'Bobble hat', mark: 'Striped scarf', bearing: 'Mischievous' }],
    ['Frost Mage', 'Snow Fox', { body: 'Female', age: 'Grown-up', build: 'Slim', hair: 'Holly crown', mark: 'Jingle bells', bearing: 'Dreamy' }],
    ['Blizzard Brawler', 'Yeti', { body: 'Male', age: 'Grown-up', build: 'Huge', hair: 'Bobble hat', mark: 'Mittens', bearing: 'Jolly' }],
    ['Tree Tender', 'Reindeer', { body: 'Male', age: 'Grandparent', build: 'Slim', hair: 'Holly crown', mark: 'Round glasses', bearing: 'Shy' }],
    ['Mischief Maker', 'Workshop Elf', { body: 'Male', age: 'Little', build: 'Tiny', hair: 'Bobble hat', mark: 'Mittens', bearing: 'Mischievous' }],
    ['Ice Skater', 'Penguin', { body: 'Female', age: 'Little', build: 'Tiny', hair: 'Earmuffs', mark: 'Striped scarf', bearing: 'Brave' }]
  ]
};
const theme = process.argv[2] || 'northpole', only = process.argv[3];
FR.useTheme(theme);
const one = async ([cls, race, look]) => {
  const subject = FR.portraitSubject({ cls, race, look, desc: '' });
  const r = await fetch('http://127.0.0.1:8787/api/portrait', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, theme }) });
  const j = await r.json();
  if (!r.ok) { console.log(cls, 'ERR', j.error); return; }
  fs.writeFileSync(path.join(__dirname, '..', FR.theme.art.sample(cls)), Buffer.from(j.image.split(',')[1], 'base64'));
  console.log(cls, race, 'ok', j.seconds + 's');
};
(async () => {
  const todo = sets[theme].filter((s) => !only || s[0] === only);
  for (let i = 0; i < todo.length; i += 6) { await Promise.all(todo.slice(i, i + 6).map(one)); }
})();
