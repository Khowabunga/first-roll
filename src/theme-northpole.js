/* First Roll theme: North Pole.
   Premise (the DM's own): a team of bakers wins a Christmas cookie bake-off, finds a note
   from the C.O.O.K.I.E. Department in the winning box, laughs it off, nibbles a cookie
   and lands at the North Pole. Here the enchanted cookie also decides what each baker
   turns into, which is what the questions work out. Rules underneath are unchanged. */
var FR = (typeof FR !== 'undefined') ? FR : {};
if (typeof module !== 'undefined' && typeof require === 'function' && !FR.THEMES) { FR = require('./data.js'); }

(function () {
  var W = FR.THEMES.tavern.questions.map(function (q) { return q.a.map(function (a) { return a.w; }); });
  var Q = function (i, q, answers) { return { q: q, a: answers.map(function (t, k) { return { t: t, w: W[i][k] }; }) }; };

  /* Same twelve questions, same scoring, new clothes. */
  var questions = [
    Q(0, 'At the bake-off, the team at the next table is sneaking in store-bought frosting.', [
      'Tip their table over. Cheaters never prosper.', 'Peek at their recipe while they are busy cheating.', 'Quietly tell the judges.', 'Bring them cocoa and ask how they got away with it.']),
    Q(1, 'The cookie drops you in a snowy forest. Which way?', [
      'Into the quiet pines.', 'Along the path with the candy-cane lamp posts.', 'Toward that tower full of gears and blinking lights.', 'Toward the sleigh bells and singing.']),
    Q(2, 'The workshop door is locked, and the cookies are inside.', [
      'Shoulder it open.', 'Pick the lock with a candy cane.', 'Read the tiny instructions carved on the frame.', 'Knock and sing. Someone always answers a carol.']),
    Q(3, 'You catch the gingerbread thief who has been swiping sprinkles. He is very sorry.', [
      'Forgive him and share my cookie.', 'Forgive him. For half his sprinkles.', 'Rules are rules. Santa decides.', 'Let him go. The snow will sort it out.']),
    Q(4, 'Your friends would call you…', [
      'The strong one.', 'The clever one.', 'The kind one.', 'The trouble.']),
    Q(5, 'Under the tree sits a present with no tag. It is humming.', [
      'Open it. Obviously.', 'Hand it straight to Santa. Not my present.', 'Trade it. Mystery presents are worth a fortune.', 'Bury it in a snowdrift, far from town.']),
    Q(6, 'You won the bake-off prize money. It goes on…', [
      'A bigger, better rolling pin.', 'Cocoa for the whole town.', 'A rare book of secret recipes.', 'Mittens for everyone who has none.']),
    Q(7, 'It is Christmas Eve and you cannot sleep. You…', [
      'Shovel the whole street. Twice.', 'Sit outside and listen to the snow fall.', 'Practice a new carol.', 'Make a wish on the brightest star.']),
    Q(8, 'Your gingerbread house starts collapsing in front of the judges. Now what?', [
      'Hold the roof up myself.', 'Good thing I baked a spare wall.', 'Call it a gingerbread ruin. More fun this way.', 'Make sure nobody gets frosting in their eye.']),
    Q(9, 'The North Pole winter fair is in full swing. Where are you?', [
      'Winning the tug of war.', 'Slipping between stalls, sampling everything unnoticed.', 'On the stage.', 'Out back with the reindeer.']),
    Q(10, 'What worries you most?', [
      'Being stuck indoors.', 'Being tricked.', 'Letting my friends down.', 'Being left off the list entirely.']),
    Q(11, 'Santa winks and offers you one gift.', [
      'Strength to lift the whole sleigh.', 'To know how every toy and trick works.', 'A voice everyone stops to listen to.', 'To talk with reindeer and snow owls.'])
  ];

  /* Callings. Each sits on a familiar rules chassis so the DM can run it as written.
     [might, guile, lore, faith, charm, wild, order(-chaos), light(-shadow)] */
  var classes = {
    'Blizzard Brawler': { v: [1, 0.1, 0, 0.1, 0.1, 0.7, -0.7, 0], hd: 12, prio: [1, 0.7, 0.9, 0.1, 0.4, 0.3], color: '#3d6fb0',
      blurb: 'When the snowball fight starts, you are the avalanche.', armor: 'unarmored', skills: ['Athletics', 'Perception', 'Survival'],
      attacks: [{ n: 'Giant snowball', ab: 'STR', die: 12, cnt: 1, hint: 'Someone next to you' }, { n: 'Icicle toss', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }],
      gear: 'a thick fur vest and big red mittens, holding a giant snowball overhead' },
    Caroler: { v: [0, 0.5, 0.4, 0.1, 1, 0.1, -0.5, 0.2], hd: 8, prio: [0.1, 0.8, 0.6, 0.4, 0.4, 1], color: '#b0457a',
      blurb: 'Your song can lift a whole room, or crack an icicle clean in two.', armor: 'leather', skills: ['Persuasion', 'Performance', 'Deception'],
      attacks: [{ n: 'Jingle-bell flail', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Piercing high note', ab: 'CHA', die: 6, cnt: 1, spell: true, hint: 'Song, up to 60 feet' }],
      gear: 'a caroler’s cape and long scarf, holding a songbook and a golden bell' },
    Baker: { v: [0.3, 0, 0.3, 1, 0.2, 0, 0.5, 0.7], hd: 8, prio: [0.7, 0.3, 0.8, 0.2, 1, 0.4], color: '#c9862c',
      blurb: 'Still a baker at heart. Your treats mend scraped knees and sagging spirits.', armor: 'scale+shield', skills: ['Insight', 'Medicine', 'Religion'],
      attacks: [{ n: 'Rolling pin', ab: 'STR', die: 6, cnt: 1, hint: 'Someone next to you' }, { n: 'Oven blast', ab: 'WIS', die: 6, cnt: 4, spell: true, hint: 'Kitchen magic, up to 120 feet' }],
      gear: 'a puffy chef hat and apron, holding a tray of softly glowing cookies' },
    'Tree Tender': { v: [0.1, 0.1, 0.4, 0.5, 0, 1, -0.1, 0.3], hd: 8, prio: [0.1, 0.7, 0.8, 0.4, 1, 0.3], color: '#2f7d4f',
      blurb: 'The evergreens whisper, and you whisper back.', armor: 'leather+shield', skills: ['Nature', 'Animal Handling', 'Perception'],
      attacks: [{ n: 'Pine-needle burst', ab: 'WIS', die: 8, cnt: 1, spell: true, hint: 'Tree magic, up to 30 feet' }, { n: 'Holly whip', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }],
      gear: 'a cloak of pine boughs woven with tiny lights, a staff topped with a glowing star' },
    'Candy Cane Knight': { v: [1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.7, 0.1], hd: 10, prio: [1, 0.6, 0.9, 0.2, 0.4, 0.3], color: '#c8102e',
      blurb: 'Peppermint armor, a striped lance and a promise to hold the line.', armor: 'chain+shield', skills: ['Athletics', 'Intimidation', 'Perception'],
      attacks: [{ n: 'Candy-cane lance', ab: 'STR', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Gumdrop crossbow', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 80 feet' }],
      gear: 'armor made of red-and-white peppermint candy, a candy-cane lance and a round cookie shield' },
    'Ice Skater': { v: [0.5, 0.6, 0.2, 0.6, 0, 0.2, 0.9, 0.2], hd: 8, prio: [0.4, 1, 0.7, 0.2, 0.9, 0.2], color: '#7a6fc0',
      blurb: 'You glide, you spin, and it is over before anyone blinks.', armor: 'monk', skills: ['Acrobatics', 'Stealth', 'Insight'],
      attacks: [{ n: 'Spinning skate kick', ab: 'DEX', die: 4, cnt: 1, hint: 'Someone next to you' }, { n: 'Hockey stick', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }],
      gear: 'a sleek skating outfit with a short cape, silver ice skates, poised mid-glide' },
    Santa: { v: [0.8, 0, 0, 0.8, 0.4, 0, 0.8, 0.8], hd: 10, prio: [1, 0.2, 0.8, 0.1, 0.4, 0.9], color: '#b3122b',
      blurb: 'The red suit fits. You lead with a laugh and a sack full of surprises.', armor: 'chain+shield', skills: ['Athletics', 'Persuasion', 'Insight'],
      attacks: [{ n: 'Sack of presents', ab: 'STR', die: 8, cnt: 1, hint: 'Swing it at someone next to you' }, { n: 'Lump of coal', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }],
      gear: 'a red Santa suit with white fur trim and a wide black belt, a sack of presents over one shoulder' },
    'Sleigh Pilot': { v: [0.4, 0.6, 0.1, 0.1, 0, 1, 0, 0.2], hd: 10, prio: [0.5, 1, 0.7, 0.3, 0.9, 0.2], color: '#2f6f8f',
      blurb: 'Fastest thing in the winter sky, and you never miss a rooftop.', armor: 'scale', skills: ['Survival', 'Stealth', 'Perception'],
      attacks: [{ n: 'Snowball slingshot', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 150 feet' }, { n: 'Harness hook', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }],
      gear: 'aviator goggles, a leather flight cap and a very long scarf streaming in the wind' },
    'Chimney Sneak': { v: [0, 1, 0.3, 0, 0.5, 0.1, -0.6, -0.3], hd: 8, prio: [0.1, 1, 0.6, 0.6, 0.5, 0.7], color: '#48566f',
      blurb: 'Down the chimney and out again before the cocoa cools.', armor: 'leather', skills: ['Stealth', 'Sleight of Hand', 'Deception', 'Perception'],
      attacks: [{ n: 'Fireplace poker', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Pea shooter', ab: 'DEX', die: 6, cnt: 1, hint: 'Up to 80 feet' }],
      gear: 'soot-smudged dark clothes and a little eye mask, tiptoeing with a coil of rope' },
    'Frost Mage': { v: [0.1, 0.1, 0.3, 0, 0.9, 0.3, -0.8, 0], hd: 6, prio: [0.1, 0.7, 0.8, 0.3, 0.4, 1], color: '#3aa0c8',
      blurb: 'Winter itself does what you ask. Mostly.', armor: 'none', skills: ['Persuasion', 'Arcana', 'Intimidation'],
      attacks: [{ n: 'Frost ray', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Snow magic, up to 120 feet' }, { n: 'Pocket icicle', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }],
      gear: 'an icy blue cloak embroidered with snowflakes, frost magic swirling around the hands' },
    'Mischief Maker': { v: [0, 0.5, 0.7, 0, 0.6, 0, -0.2, -0.8], hd: 8, prio: [0.1, 0.7, 0.8, 0.5, 0.4, 1], color: '#6a3f9a',
      blurb: 'You know every trick on the Naughty List, and a few that are not on it yet.', armor: 'leather', skills: ['Deception', 'Arcana', 'Intimidation'],
      attacks: [{ n: 'Coal blast', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Naughty magic, up to 120 feet' }, { n: 'Pointy icicle', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }],
      gear: 'a purple-and-black striped scarf, juggling lumps of coal with a sly grin' },
    Toymaker: { v: [0, 0.2, 1, 0.1, 0, 0, 0.4, 0], hd: 6, prio: [0.1, 0.7, 0.7, 1, 0.5, 0.3], color: '#2f8f8a',
      blurb: 'If it can be built, wound up or glued, you can finish it by Christmas Eve.', armor: 'none', skills: ['Arcana', 'History', 'Investigation'],
      attacks: [{ n: 'Wind-up rocket', ab: 'INT', die: 10, cnt: 1, spell: true, hint: 'Gadget, up to 120 feet' }, { n: 'Trusty wrench', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }],
      gear: 'a tool apron stuffed with tiny tools, holding a half-built wind-up toy' }
  };

  /* Forms: what the cookie turns you into. */
  var races = {
    'Workshop Elf': { v: [0, 0.5, 0.9, 0, 0.4, 0.1, 0.2, 0.3], bonus: { DEX: 2, INT: 1 }, speed: 25, perk: 'Tinker’s touch: you can fix, or jam, almost any gadget.',
      look: 'a small Christmas workshop elf with pointed ears and rosy cheeks' },
    Reindeer: { v: [0.5, 0.4, 0, 0.1, 0.1, 1, -0.2, 0.2], bonus: { DEX: 2, STR: 1 }, speed: 40, perk: 'Sky-hop: once per rest, leap as far as you can see.',
      look: 'a young anthropomorphic reindeer standing upright, soft brown fur, small antlers, a big black nose' },
    Snowman: { v: [0.3, 0, 0.1, 0.6, 0.5, 0.2, 0.1, 0.7], bonus: { CON: 2, CHA: 1 }, speed: 25, tough: true, perk: 'Pack it back on: fresh snow patches you up, so one extra hit point each level.',
      look: 'a living snowman made of three packed snowballs, with stick arms, coal eyes and a carrot nose' },
    Gingerbread: { v: [0, 0.6, 0, 0.3, 0.8, 0.2, -0.5, 0.5], bonus: { DEX: 2, CHA: 1 }, speed: 35, lucky: true, perk: 'Lucky crumb: roll a 1 on a d20 and you may roll again.',
      look: 'a living gingerbread cookie person with white icing trim and gumdrop buttons' },
    Nutcracker: { v: [0.8, 0, 0.2, 0.5, 0.1, 0, 1, 0.3], bonus: { STR: 2, CON: 1 }, speed: 30, perk: 'Iron jaw: you can crack, crunch or clamp almost anything.',
      look: 'a living wooden nutcracker toy soldier with a painted face, a square jaw and a tall hat' },
    Penguin: { v: [0.1, 0.5, 0.2, 0.3, 0.6, 0.5, 0.2, 0.4], bonus: { DEX: 2, WIS: 1 }, speed: 25, perk: 'Belly slide: on ice or snow you move twice as far.',
      look: 'a small round penguin with bright eyes' },
    Yeti: { v: [1, 0.1, 0, 0, 0, 0.8, -0.5, 0], bonus: { STR: 2, CON: 1 }, speed: 30, perk: 'Too big to bully: once a day, refuse to fall when you drop to zero.',
      look: 'a huge fluffy friendly white yeti with a pale blue face and hands' },
    'Snow Fox': { v: [0, 0.8, 0.4, 0, 0.6, 0.4, -0.4, -0.5], bonus: { CHA: 2, INT: 1 }, speed: 30, perk: 'White on white: in falling snow you are very hard to spot.',
      look: 'an anthropomorphic white arctic fox standing upright, with a big fluffy tail' },
    Human: { v: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.1, 0.1], bonus: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, speed: 30, perk: 'Flour power: the cookie left you as you were, and a little better at everything.',
      look: 'a human baker with flour on their cheeks' }
  };

  var names = {
    'Workshop Elf': { m: ['Jingle', 'Sprocket', 'Figgy', 'Pepper', 'Tinsel', 'Bramble'], f: ['Nutmeg', 'Tinsel', 'Holly', 'Pippin', 'Clove', 'Mistle'], s: ['Twinkletoes', 'Sugarplum', 'Snowbell', 'Cogsworthy', 'Glitterpine', 'Buttonbright'] },
    Reindeer: { m: ['Bolt', 'Thistle', 'Flurry', 'Juniper', 'Sprint', 'Birch'], f: ['Aurora', 'Skye', 'Clover', 'Starla', 'Willow', 'Ember'], s: ['Starhoof', 'the Swift', 'Hoofbright', 'Skyrunner', 'Frostantler', 'of the North Wind'] },
    Snowman: { m: ['Parsnip', 'Coalby', 'Buttons', 'Flurrick', 'Drift', 'Chilly'], f: ['Flurrietta', 'Icelyn', 'Crystal', 'Snowdrop', 'Pearl', 'Wintry'], s: ['Frostwick', 'Meltnot', 'Carrotnose', 'Snowpacker', 'Coldbottom', 'Icebloom'] },
    Gingerbread: { m: ['Crumb', 'Clove', 'Biscotti', 'Snap', 'Molasses', 'Dunk'], f: ['Ginger', 'Nutmeg', 'Honey', 'Cinnamon', 'Sprinkle', 'Treacle'], s: ['McCrumble', 'Sprinklesworth', 'Gumdrop', 'Icingham', 'Snapwell', 'Butterbake'] },
    Nutcracker: { m: ['Captain Walnut', 'Sir Hazel', 'Major Chestnut', 'Sergeant Pecan', 'Colonel Acorn', 'Corporal Almond'], f: ['Captain Hazel', 'Dame Chestnut', 'Major Pecan', 'Lady Filbert', 'Sergeant Almond', 'Colonel Walnut'], s: ['Brassbuttons', 'von Kracken', 'Oakenjaw', 'Steadfast', 'Drumroll', 'Lacquer'] },
    Penguin: { m: ['Waddles', 'Tux', 'Pebble', 'Flip', 'Skipper', 'Snowcone'], f: ['Pip', 'Pebble', 'Dottie', 'Flurry', 'Splash', 'Mittens'], s: ['Icebottom', 'McSlide', 'Featherby', 'Bellyflop', 'Frostwing', 'Slipperton'] },
    Yeti: { m: ['Boulder', 'Mogul', 'Snug', 'Tundra', 'Thump', 'Bigsby'], f: ['Fluff', 'Avalanche', 'Tundra', 'Snowberry', 'Hilda', 'Puff'], s: ['Snowmuncher', 'the Gentle', 'Peakstomper', 'Softpaw', 'Hugsalot', 'Cavehum'] },
    'Snow Fox': { m: ['Whisper', 'Quill', 'Nix', 'Sable', 'Flint', 'Jasper'], f: ['Ember', 'Nix', 'Wisp', 'Velvet', 'Sable', 'Lark'], s: ['Frostpaw', 'Snowtail', 'Quickwhisker', 'Moonprint', 'Silverbrush', 'Softstep'] },
    Human: { m: ['Hank', 'Otis', 'Barnaby', 'Walt', 'Gus', 'Theo'], f: ['Rosie', 'Marigold', 'Clementine', 'Dot', 'Winnie', 'Pearl'], s: ['Butterworth', 'Crumpet', 'Bunsby', 'Flourman', 'Sweetwater', 'Whiskley'] }
  };

  var look = {
    body: ['Male', 'Female', 'Neither'],
    age: ['Little', 'Grown-up', 'Grandparent'],
    build: ['Tiny', 'Slim', 'Round', 'Huge'],
    hair: ['Santa hat', 'Earmuffs', 'Bobble hat', 'Top hat', 'Holly crown', 'Nothing'],
    mark: ['Striped scarf', 'Jingle bells', 'Round glasses', 'Mittens', 'Candy cane', 'Floury apron'],
    bearing: ['Jolly', 'Mischievous', 'Shy', 'Brave', 'Dreamy', 'Grumpy']
  };
  var lookLabels = { body: 'Body', age: 'Age', build: 'Size', hair: 'On top', mark: 'Wearing', bearing: 'Mood' };
  var flourish = [
    'a scarf at least three times too long', 'one mitten red and one mitten green', 'a string of tiny lights that will not switch off',
    'frosting on one eyebrow that nobody has mentioned', 'a bell that jingles at the worst possible moments', 'pockets full of sprinkles',
    'a wooden spoon tucked in the belt like a sword', 'earmuffs shaped like cinnamon buns', 'a patched sweater with a wonky snowflake',
    'boots that squeak with every step', 'a candy cane behind one ear', 'a tiny whisk on a necklace'
  ];

  var actions = [
    { id: 'look', label: 'Look around', hint: 'Notice what is nearby', skill: 'Perception' },
    { id: 'search', label: 'Search', hint: 'Dig for clues or crumbs', skill: 'Investigation' },
    { id: 'sneak', label: 'Sneak', hint: 'Tiptoe through the snow', skill: 'Stealth' },
    { id: 'lock', label: 'Fiddle with a lock or gadget', hint: 'Nimble fingers', skill: 'Sleight of Hand' },
    { id: 'persuade', label: 'Persuade', hint: 'Talk someone round', skill: 'Persuasion' },
    { id: 'bluff', label: 'Tell a fib', hint: 'With a perfectly straight face', skill: 'Deception' },
    { id: 'scare', label: 'Give the stern look', hint: 'Make them think twice', skill: 'Intimidation' },
    { id: 'read', label: 'Read someone', hint: 'Naughty or nice?', skill: 'Insight' },
    { id: 'climb', label: 'Climb, jump or shove', hint: 'Up the chimney, over the drift', skill: 'Athletics' },
    { id: 'tumble', label: 'Skate, slide or balance', hint: 'Stay on your feet', skill: 'Acrobatics' },
    { id: 'recall', label: 'Remember a tale', hint: 'Have I heard of this?', skill: 'History' },
    { id: 'magic', label: 'Sniff out magic', hint: 'Why is that glowing?', skill: 'Arcana' },
    { id: 'track', label: 'Follow tracks in the snow', hint: 'Or find the way home', skill: 'Survival' },
    { id: 'heal', label: 'Bandages and cocoa', hint: 'Patch a friend up', skill: 'Medicine' },
    { id: 'beast', label: 'Calm an animal', hint: 'Easy now, easy', skill: 'Animal Handling' },
    { id: 'show', label: 'Sing or show off', hint: 'Hold the whole room', skill: 'Performance' }
  ];

  var subject = function (ch) {
    var race = races[ch.race], cls = classes[ch.cls], l = ch.look || {}, req = [];
    var g = l.body === 'Male' ? 'male ' : (l.body === 'Female' ? 'female ' : '');
    var s = 'A ' + g + 'character: ' + race.look + ', who is a ' + ch.cls + ' (' + cls.gear + ').';
    if (l.age) { req.push('age: ' + { Little: 'a small child', 'Grown-up': 'an adult', Grandparent: 'elderly, grandparent-aged, with grey or white hair or whiskers' }[l.age]); }
    if (l.build) { req.push('body shape: ' + { Tiny: 'tiny and dainty', Slim: 'tall and slim', Round: 'very round and plump', Huge: 'huge, towering and broad' }[l.build]); }
    if (l.hair) { req.push('on the head: ' + { 'Santa hat': 'a red Santa hat', Earmuffs: 'fluffy earmuffs and no hat', 'Bobble hat': 'a knitted bobble hat', 'Top hat': 'a tall black top hat', 'Holly crown': 'a crown of holly leaves and berries', Nothing: 'nothing at all, bare-headed' }[l.hair]); }
    if (l.mark) { req.push('wearing or holding: ' + { 'Striped scarf': 'a long striped scarf', 'Jingle bells': 'a string of jingle bells', 'Round glasses': 'round glasses', Mittens: 'big knitted mittens', 'Candy cane': 'a candy cane', 'Floury apron': 'an apron dusted with flour' }[l.mark]); }
    if (l.bearing) { req.push('mood and expression: ' + { Jolly: 'jolly, laughing', Mischievous: 'mischievous, a sly grin', Shy: 'shy, bashful, peeking', Brave: 'brave and determined', Dreamy: 'dreamy, gazing off', Grumpy: 'grumpy, scowling, arms folded' }[l.bearing]); }
    if (req.length) { s += ' Required details, each one clearly visible and taking priority over the usual outfit and over anything said later: ' + req.join('; ') + '.'; }
    if (ch.desc) { s += ' Also, where it does not contradict the required details: ' + ch.desc.trim(); }
    return s;
  };
  var describe = function (ch) {
    var l = ch.look || {}, size = { Tiny: 'Pocket-sized', Slim: 'Slim as a candle', Round: 'Round as a pudding', Huge: 'Big enough to block a doorway' }[l.build] || 'Hard to miss';
    var a = FR.pick(flourish), b = FR.pick(flourish);
    while (b === a) { b = FR.pick(flourish); }
    return size + (l.bearing ? ' and plainly ' + l.bearing.toLowerCase() : '') + '. Wears ' + a + ', and ' + b + '.';
  };
  var alignment = function (u, answered) {
    var n = Math.max(1, answered), o = u.order / n, l = u.light / n;
    var list = l > 0.15 ? 'Nice List' : (l < -0.12 ? 'Naughty List (the fun end)' : 'Somewhere between the lists');
    var way = o > 0.17 ? 'by the book' : (o < -0.17 ? 'gloriously rowdy' : '');
    return way ? list + ', ' + way : list;
  };

  FR.THEMES.northpole = {
    id: 'northpole', name: 'North Pole', blurb: 'The great cookie mystery',
    questions: questions, classes: classes, races: races, names: names, look: look, lookLabels: lookLabels, flourish: flourish, actions: actions,
    traitLabels: { might: 'Oomph', guile: 'Sneak', lore: 'Smarts', faith: 'Heart', charm: 'Sparkle', wild: 'Wild' }, axes: [['Rowdy', 'Tidy'], ['Naughty', 'Nice']],
    alignment: alignment, describe: describe, subject: subject,
    armorNotes: { unarmored: 'too fluffy to hurt', monk: 'never standing still', leather: 'thick winter coat', 'leather+shield': 'winter coat, wreath shield', scale: 'jingle-bell mail',
      'scale+shield': 'oven mitts, cookie-sheet shield', 'chain+shield': 'tin-soldier plate, sled-lid shield', none: 'festive sweater' },
    samples: { Santa: 'Penguin', Toymaker: 'Workshop Elf', Baker: 'Human', Caroler: 'Snowman', 'Sleigh Pilot': 'Reindeer', 'Candy Cane Knight': 'Nutcracker', 'Chimney Sneak': 'Gingerbread',
      'Frost Mage': 'Snow Fox', 'Blizzard Brawler': 'Yeti', 'Tree Tender': 'Reindeer', 'Mischief Maker': 'Workshop Elf', 'Ice Skater': 'Penguin' },
    demo: { cls: 'Chimney Sneak', race: 'Gingerbread', name: 'Ginger McCrumble', answers: [1, 3, 1, 1, 3, 2, 1, 2, 2, 1, 1, 2], look: { body: 'Female', age: 'Grown-up', build: 'Slim', hair: 'Bobble hat', mark: 'Striped scarf', bearing: 'Mischievous' } },
    art: {
      wordmark: 'img/np_wordmark.webp', divider: 'img/np_divider.webp', thumb: 'img/np_keyart.webp', floor: 'img/np_table.webp',
      crest: function (cls) { return 'img/np_badge_' + FR.slug(cls) + '.webp'; },
      sample: function (cls) { return 'img/np_sample_' + FR.slug(cls) + '.webp'; }
    },
    /* Music by scene. A scene with several pieces plays them in turn. The files live in public/audio/;
       a missing file is skipped. The credit is shown on the Music and sound sheet (the licence asks for it). */
    music: {
      intro: ['audio/np_intro.mp3'],
      game: ['audio/np_game_jingle.mp3', 'audio/np_game_sugarplum.mp3', 'audio/np_game_tree.mp3'],
      fight: ['audio/np_fight_breakdown.mp3', 'audio/np_fight_dark.mp3'],
      credit: 'Music: “We Wish You a Merry Christmas”, “Jingle Bells (Calm)”, “Dance of the Sugar Plum Fairies”, “Oh, Christmas Tree”, “Sugar Plum Breakdown” and “Sugar Plum Dark Mix” by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 3.0.'
    },
    dice: { ink: '#ffffff', inkMetal: 0.05, fleck: '#ffffff', fight: '#c8102e', fightInk: '#ffffff', rim: { color: 0xb5121f, wood: false, metal: 0.55, rough: 0.34 }, floorTint: 0xe6efe9, floorBase: 0x0f4a30, exposure: 1.05 },
    particles: 'snow', adventure: 'cookie',
    ai: {
      style: 'Character portrait as a still from a modern 3D computer-animated family feature film: stylized, appealing character design with big expressive eyes and friendly exaggerated proportions, soft detailed materials (knit wool, fur, felt, icing) with gentle subsurface glow, warm key light and a cool winter rim light, shallow depth of field. Waist-up, three-quarter view, centered, full of personality, with space above the head. Background: a softly blurred snowy North Pole village at night with warm string lights and bokeh. Wholesome, festive and funny. No text, no lettering, no border, no frame, no logo, no watermark.',
      describe: 'You design characters for a 3D animated Christmas family film set at the North Pole. Reply with one or two sentences, 40 words at most, of concrete visual detail only: outfit, colors, one signature prop, small quirks. Cute, festive and a little funny. The character\'s fixed features are listed for you: agree with every one of them and never state a different age, size, headwear, accessory or mood. No name, no backstory, no game terms, no quotation marks.',
      origin: 'You narrate a cozy, funny animated Christmas film. The description starts with the character\'s name, then the two or three words for what they are now (for example "Reindeer Sleigh Pilot"). In exactly two sentences, 45 words at most, tell how they were a prize-winning cookie baker who nibbled an enchanted cookie from the C.O.O.K.I.E. Department and woke up at the North Pole as that, using those exact words for what they became and inventing no other creature. Use the name, never "you". Playful and kid-friendly.'
    },
    story: [
      { img: 'img/np_story1.webp', alt: 'Four bakers lifting a cookie trophy on a small-town stage', text: 'You did it. Your team just won the town’s Christmas cookie bake-off, trophy and all.' },
      { img: 'img/np_story2.webp', alt: 'An open box of cookies with a glowing sealed note tucked inside', text: 'That night you open the box of winning cookies to finally taste them. Tucked inside is a note: the North Pole needs your help. It is signed by the C.O.O.K.I.E. Department, the Committee of Operatives Keeping Ingredients Enchanted.' },
      { img: 'img/np_story3.webp', alt: 'The bakers swept off the kitchen floor in a swirl of sparkles and snow', text: 'A prank, obviously. You all laugh and take a nibble. The kitchen starts to spin, the air smells of peppermint, and the cookie begins deciding who you really are…' }
    ],
    /* extra rolls that only this story has */
    extras: [{ id: 'cookie', label: 'Nibble a North Pole cookie', hint: 'The recipe has gone wrong. Roll to see how.', sides: 6, title: 'Cookie side effect', note: 'd6 · something is off with the recipe',
      table: ['Endless farts. They will not stop for a full minute.', 'A sneezing fit: three enormous sneezes.', 'A massively runny nose. Find a hankie, fast.', 'Hiccups that jingle like sleigh bells.', 'Your voice goes squeaky until your next roll.', 'Nothing happens. Which is suspicious.'] }],
    count: function (i, n) { return (i + 1) + ' of ' + n; },
    origin: function (c) {
      var lesson = { might: 'the heaviest sacks always seem to find the strongest arms', guile: 'nobody hears you coming on fresh snow', lore: 'every gadget in the workshop is hiding a secret',
        faith: 'kindness is the one ingredient that never runs out', charm: 'a good song opens more doors than a key', wild: 'the reindeer already treat you like family' };
      return c.name + ' was a prize-winning baker until one nibble of an enchanted cookie. Now ' + c.first + ' is a ' + c.race + ' ' + c.cls + ' at the North Pole, where ' + lesson[c.top] + '.';
    },
    text: {
      tagline: 'Something is wrong with the Christmas cookies, and the North Pole needs its best bakers.',
      begin: 'Open the cookie box', have: 'I have a character', dm: 'I am the DM',
      liveNote: 'Pictures are rendered live by OpenAI.', tableNote: 'Join your DM’s table and your picture is made live, just for you. On your own you will see samples.', directNote: 'Pictures are rendered live with your OpenAI key.', previewNote: 'Pictures here are ready-made samples. They do not use your choices.',
      connect: 'Connect OpenAI to make your own', sampleBtn: 'Show a sample picture', sampleTag: 'Sample', musicNote: 'Carols for the title, the game and the snow fights', stale: 'Your choices changed. Make another to see them.',
      ledgerTitle: 'Sign the bake-off entry sheet', ledgerLede: 'Tell us what to call you.', ledgerLedeTable: 'Your DM has a four-letter table code. Enter it to sit at their table, or leave it empty to play on your own.', ledgerSign: 'Continue', ledgerJoin: 'Join the table', ledgerSkip: 'Play on my own',
      storyNext: 'Next', storySkip: 'Skip the story', storyGo: 'Take a nibble',
      omen: 'Snow. Sleigh bells. You open your eyes at the North Pole, and you are not quite yourself.', howRead: 'How the cookie read you', closestClasses: 'Closest callings', closestRaces: 'Closest shapes',
      toPortrait: 'That is so me. Take my picture', retake: 'Answer again', asA: 'As a ',
      easelEmpty: 'No picture yet', paint: 'Make my picture', paintAgain: 'Make another', painting: 'The elves are rendering',
      keep: 'Keep it and name them', skip: 'Skip the picture for now', ownWords: 'In your own words',
      descHint: 'A scarf three times too long, frosting on one eyebrow, a very determined look', surprise: 'Surprise me', thinking: 'Thinking',
      hintLive: 'Pick a few features, then let the artist work.', hintPreview: 'This preview cannot make pictures, so your choices are not used here. It shows a ready-made sample.',
      painted: 'Rendered just now by OpenAI in {s} seconds.', sample: 'A ready-made sample: a {race} {cls}. It does not use your choices.',
      slow: 'The artist took too long. Try again.', failed: 'The artist could not finish: {e} Change the description or try again.',
      work: ['Sharpening pencils', 'Sculpting the cheeks', 'Knitting the scarf', 'Hanging the twinkle lights', 'Dusting on the snow', 'Rendering the sparkle'],
      sheetTitle: 'Your character', nameLabel: 'Name', rollName: 'Roll a name', originHead: 'How you got here', originWait: 'The narrator clears their throat…', toTable: 'Off to the North Pole',
      skills: 'Skills', attacks: 'Attacks', trait: 'Trait',
      tabs: ['I want to…', 'Checks', 'Snow fight'], initLabel: 'Roll initiative', initHint: 'Sets the turn order. Do this first.', initDone: 'You are on {n}. Tell your DM.',
      shove: 'Shove or grab', shoveHint: 'get physical, no weapon', hide: 'Hide', hideHint: 'duck behind a snowdrift',
      noRollB: 'No roll needed. ', noRoll: 'Dash to move twice as far, Dodge to be harder to hit, Disengage to back away safely, or Help a friend. Just say it.',
      free: 'The DM named the dice', freeNote: 'Whatever the DM asked for', damage: 'damage',
      tell: 'Tell your DM', tellDamage: 'Tell your DM the damage', nat20: 'Natural 20! Jingle all the way', nat20Attack: 'Natural 20. Critical hit!', nat1: 'Natural 1. Oh, crumbs.',
      flick: 'Flick the tin, or press Roll', rolling: 'Rolling', hits: 'It hits. Roll damage', lucky: 'Lucky crumb! Roll that 1 again', crit: 'Critical hit, double dice',
      checkHints: { STR: 'Push, lift, haul the sleigh', DEX: 'Quick hands, quick feet', CON: 'Brave the cold, hold your breath', INT: 'Recall, reason, puzzle it out', WIS: 'Notice, sense, trust your gut', CHA: 'Charm, cheer, perform' }
    }
  };
})();

if (typeof module !== 'undefined') { module.exports = FR; }
