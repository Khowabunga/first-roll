/* First Roll: game data and the matching maths. Pure functions, no DOM. */
var FR = (typeof FR !== 'undefined') ? FR : {};

FR.TRAITS = ['might', 'guile', 'lore', 'faith', 'charm', 'wild', 'order', 'light'];
FR.TRAIT_LABELS = { might: 'Might', guile: 'Guile', lore: 'Lore', faith: 'Faith', charm: 'Charm', wild: 'Wild' };
FR.ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
FR.ABILITY_NAMES = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };

/* Twelve questions. Every answer pushes one or more of eight traits. */
FR.QUESTIONS = [
  { q: 'A stranger at the next table is cheating at cards.', a: [
    { t: 'Flip the table. Cheats get what is coming.', w: { might: 2, order: -1.5 } },
    { t: 'Out-cheat him. Quietly.', w: { guile: 2, light: -1 } },
    { t: 'Warn the poor soul he is fleecing.', w: { faith: 1.5, light: 1.5, order: 0.5 } },
    { t: 'Buy him a drink and learn the trick.', w: { charm: 1.5, lore: 1 } } ] },
  { q: 'The road forks at dusk. Which way?', a: [
    { t: 'The old forest path. It is quieter.', w: { wild: 2 } },
    { t: 'The king’s highway. Lamps and patrols.', w: { order: 2, faith: 0.5 } },
    { t: 'Whichever leads to the ruins on my map.', w: { lore: 2 } },
    { t: 'Toward the music drifting over the hill.', w: { charm: 1.5, order: -1 } } ] },
  { q: 'A locked door stands between you and what you came for.', a: [
    { t: 'Shoulder it open.', w: { might: 2 } },
    { t: 'Pick the lock.', w: { guile: 2 } },
    { t: 'Study the markings on the frame first.', w: { lore: 2, order: 0.5 } },
    { t: 'Knock. Someone always answers.', w: { charm: 2 } } ] },
  { q: 'A beaten enemy drops their sword and begs for mercy.', a: [
    { t: 'Granted. And I will see to that wound.', w: { faith: 2, light: 2 } },
    { t: 'Granted. For a price.', w: { charm: 1, guile: 1, light: -1.5 } },
    { t: 'That is for the magistrate to decide.', w: { order: 2.5 } },
    { t: 'I walk away. The wilds can judge them.', w: { wild: 1.5, order: -0.5 } } ] },
  { q: 'Your friends would call you…', a: [
    { t: 'The strong one.', w: { might: 2 } },
    { t: 'The clever one.', w: { lore: 1.5, guile: 0.5 } },
    { t: 'The kind one.', w: { faith: 1.5, light: 1.5 } },
    { t: 'The trouble.', w: { charm: 1, guile: 1, order: -1.5 } } ] },
  { q: 'In a dusty cellar you find a book that whispers your name.', a: [
    { t: 'Open it. Obviously.', w: { lore: 1.5, light: -1, order: -1 } },
    { t: 'Burn it before it gets ideas.', w: { faith: 1.5, order: 1 } },
    { t: 'Find a buyer. Whispering books fetch a fortune.', w: { guile: 1.5, charm: 1 } },
    { t: 'Bury it deep in the woods.', w: { wild: 1.5, light: 0.5 } } ] },
  { q: 'The first real gold in your purse goes on…', a: [
    { t: 'A better blade.', w: { might: 1.5, order: 0.5 } },
    { t: 'A round for the whole tavern.', w: { charm: 2, order: -1, light: 0.5 } },
    { t: 'A rare and slightly forbidden tome.', w: { lore: 2, light: -0.5 } },
    { t: 'The shrine’s poor box.', w: { faith: 2, light: 1.5 } } ] },
  { q: 'Your turn on night watch. You pass the hours…', a: [
    { t: 'Running sword drills.', w: { might: 1.5, order: 1.5 } },
    { t: 'Listening to the forest breathe.', w: { wild: 2 } },
    { t: 'Working on a new song.', w: { charm: 2 } },
    { t: 'In quiet prayer.', w: { faith: 1.5, order: 1 } } ] },
  { q: 'The plan has fallen apart. Now what?', a: [
    { t: 'I am the plan now.', w: { might: 1.5, order: -1.5 } },
    { t: 'Good thing I brought a second plan.', w: { guile: 1.5, lore: 1, order: 1 } },
    { t: 'Improvise. It is more fun this way.', w: { charm: 1, order: -2 } },
    { t: 'Get everyone out alive. Nothing else matters.', w: { faith: 1.5, light: 2 } } ] },
  { q: 'A festival fills the town square. Where are you?', a: [
    { t: 'In the wrestling ring, taking all comers.', w: { might: 2 } },
    { t: 'Slipping through the crowd, unnoticed.', w: { guile: 2, light: -0.5 } },
    { t: 'On the stage.', w: { charm: 2 } },
    { t: 'At the edge of it, with the falconer’s birds.', w: { wild: 2 } } ] },
  { q: 'What frightens you most?', a: [
    { t: 'Being caged.', w: { wild: 1.5, order: -1.5 } },
    { t: 'Being fooled.', w: { guile: 1, lore: 1.5 } },
    { t: 'Failing those who trust me.', w: { faith: 1.5, light: 1.5, order: 0.5 } },
    { t: 'Being forgotten.', w: { charm: 1.5, light: -0.5 } } ] },
  { q: 'A dragon, amused, offers you a single gift.', a: [
    { t: 'Strength no one can match.', w: { might: 2 } },
    { t: 'The secrets of magic.', w: { lore: 2, light: -0.5 } },
    { t: 'A voice no one can refuse.', w: { charm: 2, light: -0.5 } },
    { t: 'The speech of beasts and birds.', w: { wild: 2, light: 0.5 } } ] }
];

/* Class and race profiles on the same eight traits:
   [might, guile, lore, faith, charm, wild, order(-chaos), light(-shadow)] */
FR.CLASSES = {
  Barbarian: { v: [1, 0.1, 0, 0.1, 0.1, 0.7, -0.7, 0], hd: 12, prio: [1, 0.7, 0.9, 0.1, 0.4, 0.3], color: '#8c2f1b',
    blurb: 'Fury given legs. You hit hard, shrug off harder, and think later.', armor: 'unarmored', skills: ['Athletics', 'Perception', 'Survival'],
    attacks: [{ n: 'Greataxe', ab: 'STR', die: 12, cnt: 1, hint: 'Someone next to you' }, { n: 'Javelin', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }], gear: 'furs, a heavy greataxe, bare scarred arms' },
  Bard: { v: [0, 0.5, 0.4, 0.1, 1, 0.1, -0.5, 0.2], hd: 8, prio: [0.1, 0.8, 0.6, 0.4, 0.4, 1], color: '#b0457a',
    blurb: 'Words are your weapon and the room is your stage. You make everyone around you better.', armor: 'leather', skills: ['Persuasion', 'Performance', 'Deception'],
    attacks: [{ n: 'Rapier', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Thrown dagger', ab: 'DEX', die: 4, cnt: 1, hint: 'Up to 20 feet' }], gear: 'a lute, a feathered cap, a colorful doublet' },
  Cleric: { v: [0.3, 0, 0.3, 1, 0.2, 0, 0.5, 0.7], hd: 8, prio: [0.7, 0.3, 0.8, 0.2, 1, 0.4], color: '#c79a2c',
    blurb: 'Faith made practical. You mend the wounded and stand firm when it counts.', armor: 'scale+shield', skills: ['Insight', 'Medicine', 'Religion'],
    attacks: [{ n: 'Mace', ab: 'STR', die: 6, cnt: 1, hint: 'Someone next to you' }, { n: 'Guiding Bolt', ab: 'WIS', die: 6, cnt: 4, spell: true, hint: 'Spell, up to 120 feet' }], gear: 'chain and tabard, a mace, a glowing holy symbol' },
  Druid: { v: [0.1, 0.1, 0.4, 0.5, 0, 1, -0.1, 0.3], hd: 8, prio: [0.1, 0.7, 0.8, 0.4, 1, 0.3], color: '#4d7a3a',
    blurb: 'The wild speaks and you answer. Storm, root and claw are yours to call.', armor: 'leather+shield', skills: ['Nature', 'Animal Handling', 'Perception'],
    attacks: [{ n: 'Produce Flame', ab: 'WIS', die: 8, cnt: 1, spell: true, hint: 'Spell, up to 30 feet' }, { n: 'Scimitar', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }], gear: 'a gnarled staff, a cloak of leaves and hide, antler charms' },
  Fighter: { v: [1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.7, 0.1], hd: 10, prio: [1, 0.6, 0.9, 0.2, 0.4, 0.3], color: '#9a3b2a',
    blurb: 'Steel, drilled until it is instinct. You hold the line so others can shine.', armor: 'chain+shield', skills: ['Athletics', 'Intimidation', 'Perception'],
    attacks: [{ n: 'Longsword', ab: 'STR', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Light crossbow', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 80 feet' }], gear: 'chain mail, a longsword, a battered shield' },
  Monk: { v: [0.5, 0.6, 0.2, 0.6, 0, 0.2, 0.9, 0.2], hd: 8, prio: [0.4, 1, 0.7, 0.2, 0.9, 0.2], color: '#c2702a',
    blurb: 'Stillness, then lightning. Your body is the only weapon you need.', armor: 'monk', skills: ['Acrobatics', 'Stealth', 'Insight'],
    attacks: [{ n: 'Unarmed strike', ab: 'DEX', die: 4, cnt: 1, hint: 'Someone next to you' }, { n: 'Quarterstaff', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }], gear: 'simple wrapped robes, bare fists, a quarterstaff' },
  Paladin: { v: [0.8, 0, 0, 0.8, 0.4, 0, 0.8, 0.8], hd: 10, prio: [1, 0.2, 0.8, 0.1, 0.4, 0.9], color: '#b58a2e',
    blurb: 'An oath in shining plate. You protect the weak and smite what threatens them.', armor: 'chain+shield', skills: ['Athletics', 'Persuasion', 'Insight'],
    attacks: [{ n: 'Longsword', ab: 'STR', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Javelin', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }], gear: 'polished plate, a longsword, a heraldic shield' },
  Ranger: { v: [0.4, 0.6, 0.1, 0.1, 0, 1, 0, 0.2], hd: 10, prio: [0.5, 1, 0.7, 0.3, 0.9, 0.2], color: '#3f6b4f',
    blurb: 'Tracker, hunter, scout. Nothing crosses the wilds without you knowing.', armor: 'scale', skills: ['Survival', 'Stealth', 'Perception'],
    attacks: [{ n: 'Longbow', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 150 feet' }, { n: 'Shortsword', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }], gear: 'a hooded forest cloak, a longbow, a quiver' },
  Rogue: { v: [0, 1, 0.3, 0, 0.5, 0.1, -0.6, -0.3], hd: 8, prio: [0.1, 1, 0.6, 0.6, 0.5, 0.7], color: '#3f4f7a',
    blurb: 'Quick, quiet and clever. You win by being where nobody expects you.', armor: 'leather', skills: ['Stealth', 'Sleight of Hand', 'Deception', 'Perception'],
    attacks: [{ n: 'Rapier', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Shortbow', ab: 'DEX', die: 6, cnt: 1, hint: 'Up to 80 feet' }], gear: 'dark leathers, a hood, a pair of daggers' },
  Sorcerer: { v: [0.1, 0.1, 0.3, 0, 0.9, 0.3, -0.8, 0], hd: 6, prio: [0.1, 0.7, 0.8, 0.3, 0.4, 1], color: '#a23a5a',
    blurb: 'Magic is in your blood, and it does not always ask permission.', armor: 'none', skills: ['Persuasion', 'Arcana', 'Intimidation'],
    attacks: [{ n: 'Fire Bolt', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Spell, up to 120 feet' }, { n: 'Dagger', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'travel-worn finery, crackling arcane energy around the hands' },
  Warlock: { v: [0, 0.5, 0.7, 0, 0.6, 0, -0.2, -0.8], hd: 8, prio: [0.1, 0.7, 0.8, 0.5, 0.4, 1], color: '#5b3a7a',
    blurb: 'You made a bargain for power. The terms were… flexible.', armor: 'leather', skills: ['Deception', 'Arcana', 'Intimidation'],
    attacks: [{ n: 'Eldritch Blast', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Spell, up to 120 feet' }, { n: 'Dagger', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'dark robes, an old tome on a chain, a faint eerie glow' },
  Wizard: { v: [0, 0.2, 1, 0.1, 0, 0, 0.4, 0], hd: 6, prio: [0.1, 0.7, 0.7, 1, 0.5, 0.3], color: '#3a5f8a',
    blurb: 'A scholar of the impossible. Fragile, yes, until the spellbook opens.', armor: 'none', skills: ['Arcana', 'History', 'Investigation'],
    attacks: [{ n: 'Fire Bolt', ab: 'INT', die: 10, cnt: 1, spell: true, hint: 'Spell, up to 120 feet' }, { n: 'Dagger', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'scholar’s robes, a spellbook, a staff' }
};

FR.RACES = {
  Dwarf: { v: [0.6, 0, 0.3, 0.5, 0, 0.1, 0.8, 0.3], bonus: { CON: 2, WIS: 1 }, speed: 25, tough: true, perk: 'Dwarven toughness: one extra hit point each level.', look: 'stocky and broad, a thick braided beard or braids, weathered features' },
  Elf: { v: [0, 0.5, 0.6, 0.2, 0.3, 0.7, 0, 0.1], bonus: { DEX: 2, INT: 1 }, speed: 30, perk: 'Keen senses: you see in the dark and notice more.', look: 'tall and slender, long pointed ears, fine angular features' },
  Halfling: { v: [0, 0.6, 0, 0.4, 0.6, 0.3, -0.3, 0.7], bonus: { DEX: 2, CHA: 1 }, speed: 25, lucky: true, perk: 'Lucky: roll a 1 on a d20 and you may roll again.', look: 'small, about three feet tall, round friendly face, curly hair, slightly pointed ears' },
  Human: { v: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.1, 0.1], bonus: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, speed: 30, perk: 'Versatile: a little better at everything.', look: 'human' },
  Dragonborn: { v: [0.8, 0, 0.1, 0.4, 0.5, 0, 0.6, 0.1], bonus: { STR: 2, CHA: 1 }, speed: 30, perk: 'Breath weapon: breathe fire once per rest.', look: 'a tall humanoid with a scaled draconic head, horns and no hair' },
  Gnome: { v: [0, 0.4, 0.9, 0, 0.5, 0.2, -0.5, 0.3], bonus: { INT: 2, CON: 1 }, speed: 25, perk: 'Gnome cunning: hard to fool with mind-bending magic.', look: 'very small, large bright eyes, a prominent nose, wild hair' },
  'Half-Elf': { v: [0.1, 0.4, 0.3, 0.1, 0.9, 0.4, -0.3, 0.2], bonus: { CHA: 2 }, flex: 2, speed: 30, perk: 'Fey ancestry: hard to charm, impossible to put to sleep.', look: 'human build with gently pointed ears and striking eyes' },
  'Half-Orc': { v: [1, 0.1, 0, 0, 0, 0.7, -0.5, -0.1], bonus: { STR: 2, CON: 1 }, speed: 30, perk: 'Relentless: once a day, refuse to fall when you drop to zero.', look: 'tall and powerfully built, grey-green skin, small lower tusks, a heavy brow' },
  Tiefling: { v: [0, 0.6, 0.5, 0, 0.7, 0, -0.3, -0.7], bonus: { CHA: 2, INT: 1 }, speed: 30, perk: 'Infernal legacy: fire barely bothers you.', look: 'curved horns, solid-colored eyes, reddish or violet skin, a slender tail' }
};

FR.SKILLS = {
  Athletics: 'STR', Acrobatics: 'DEX', 'Sleight of Hand': 'DEX', Stealth: 'DEX', Arcana: 'INT', History: 'INT', Investigation: 'INT', Nature: 'INT', Religion: 'INT',
  'Animal Handling': 'WIS', Insight: 'WIS', Medicine: 'WIS', Perception: 'WIS', Survival: 'WIS', Deception: 'CHA', Intimidation: 'CHA', Performance: 'CHA', Persuasion: 'CHA'
};

/* The "I want to..." menu: plain words mapped to the right skill. */
FR.ACTIONS = [
  { id: 'look', label: 'Look around', hint: 'Notice what is nearby', skill: 'Perception' },
  { id: 'search', label: 'Search', hint: 'Dig for clues or loot', skill: 'Investigation' },
  { id: 'sneak', label: 'Sneak', hint: 'Move without being seen', skill: 'Stealth' },
  { id: 'lock', label: 'Pick a lock or pocket', hint: 'Nimble fingers', skill: 'Sleight of Hand' },
  { id: 'persuade', label: 'Persuade', hint: 'Talk someone round', skill: 'Persuasion' },
  { id: 'bluff', label: 'Bluff', hint: 'Lie with a straight face', skill: 'Deception' },
  { id: 'scare', label: 'Intimidate', hint: 'Make them think twice', skill: 'Intimidation' },
  { id: 'read', label: 'Read someone', hint: 'Are they hiding something?', skill: 'Insight' },
  { id: 'climb', label: 'Climb, jump or swim', hint: 'Scale it, leap it, cross it', skill: 'Athletics' },
  { id: 'tumble', label: 'Tumble or balance', hint: 'Dodge, roll, keep your feet', skill: 'Acrobatics' },
  { id: 'recall', label: 'Recall lore', hint: 'Do I know anything about this?', skill: 'History' },
  { id: 'magic', label: 'Sense magic', hint: 'What is that glowing thing?', skill: 'Arcana' },
  { id: 'track', label: 'Track or forage', hint: 'Follow a trail, find food', skill: 'Survival' },
  { id: 'heal', label: 'Patch someone up', hint: 'Stop the bleeding', skill: 'Medicine' },
  { id: 'beast', label: 'Calm an animal', hint: 'Easy now, easy', skill: 'Animal Handling' },
  { id: 'show', label: 'Perform', hint: 'Sing, juggle, hold the room', skill: 'Performance' }
];

FR.NAMES = {
  Dwarf: { m: ['Thorin', 'Baern', 'Rurik', 'Dain', 'Harbek', 'Orsik'], f: ['Helja', 'Dagnal', 'Gunnloda', 'Riswynn', 'Vistra', 'Audhild'], s: ['Ironfist', 'Stonehelm', 'Fireforge', 'Rumnaheim', 'Battlehammer', 'Deepdelver'] },
  Elf: { m: ['Aelar', 'Thamior', 'Erevan', 'Riardon', 'Soveliss', 'Varis'], f: ['Naivara', 'Sariel', 'Thia', 'Keyleth', 'Shava', 'Ielenia'], s: ['Moonwhisper', 'Silverfrond', 'Nightbreeze', 'Galanodel', 'Amakiir', 'Starflower'] },
  Halfling: { m: ['Pip', 'Corrin', 'Merric', 'Roscoe', 'Wellby', 'Finnan'], f: ['Wren', 'Merla', 'Callie', 'Seraphina', 'Verna', 'Bree'], s: ['Underbough', 'Tealeaf', 'Goodbarrel', 'Highhill', 'Brushgather', 'Thorngage'] },
  Human: { m: ['Aldric', 'Bram', 'Garrett', 'Tomas', 'Edmund', 'Lorcan'], f: ['Mira', 'Isolde', 'Rowan', 'Elspeth', 'Catrin', 'Sabine'], s: ['Ashdown', 'Blackwood', 'Fairwind', 'Marlowe', 'Thatcher', 'Greycastle'] },
  Dragonborn: { m: ['Arjhan', 'Balasar', 'Kriv', 'Medrash', 'Rhogar', 'Torinn'], f: ['Akra', 'Biri', 'Kava', 'Sora', 'Harann', 'Thava'], s: ['Kepeshkmolik', 'Myastan', 'Delmirev', 'Yarjerit', 'Clethtinthiallor', 'Daardendrian'] },
  Gnome: { m: ['Boddynock', 'Fonkin', 'Wrenn', 'Zook', 'Dimble', 'Orryn'], f: ['Bimpnottin', 'Nissa', 'Waywocket', 'Zanna', 'Ellyjobell', 'Carlin'], s: ['Fizzlebang', 'Nackle', 'Timbers', 'Raulnor', 'Garrick', 'Sparklegem'] },
  'Half-Elf': { m: ['Kael', 'Davin', 'Theren', 'Lucan', 'Emric', 'Soren'], f: ['Lyra', 'Arwyn', 'Senna', 'Maelis', 'Elowen', 'Tamsin'], s: ['Brightwater', 'Duskwalker', 'Evenwood', 'Hartley', 'Vale', 'Swiftbrook'] },
  'Half-Orc': { m: ['Grom', 'Thokk', 'Dench', 'Krusk', 'Holg', 'Ront'], f: ['Baggi', 'Emen', 'Kansif', 'Ovak', 'Sutha', 'Volen'], s: ['Skullsplitter', 'the Unbroken', 'Ashfang', 'Stonejaw', 'of the Red Hand', 'Ironhide'] },
  Tiefling: { m: ['Akmenos', 'Damakos', 'Kairon', 'Mordai', 'Skamos', 'Therai'], f: ['Akta', 'Bryseis', 'Kallista', 'Nemeia', 'Orianna', 'Rieta'], s: ['Ashgrave', 'Nightbloom', 'Vex', 'Cinderfall', 'Morrow', 'Embermane'] }
};

FR.LOOK = {
  body: ['Male', 'Female', 'Neither'],
  age: ['Young', 'In their prime', 'Weathered', 'Elder'],
  build: ['Slight', 'Lean', 'Sturdy', 'Towering'],
  hair: ['Cropped', 'Long and loose', 'Braided', 'Wild curls', 'Shaved', 'Silver'],
  mark: ['Old scar', 'Freckles', 'War paint', 'Tattoos', 'Eyepatch', 'Jewelry'],
  bearing: ['Wry', 'Grim', 'Kind', 'Fierce', 'Dreamy', 'Proud']
};
FR.LOOK_LABELS = { body: 'Body', age: 'Age', build: 'Build', hair: 'Hair', mark: 'A mark', bearing: 'Bearing' };

FR.FLOURISH = [
  'a patched travelling cloak the color of wet moss', 'rings on every finger, none of them matching', 'a crooked grin and one chipped tooth',
  'ink-stained fingers and a quill behind one ear', 'a red silk scarf knotted at the throat', 'a necklace of mismatched keys',
  'boots far too fine for the rest of the outfit', 'a falcon feather tucked into a braid', 'burn-scarred knuckles wrapped in linen',
  'a brass spyglass on a belt chain', 'eyes that never stop counting the exits', 'a wide-brimmed hat that has seen better decades',
  'a pewter flask engraved with someone else’s initials', 'a sash embroidered with tiny constellations', 'a sprig of rosemary pinned to the collar'
];

/* ---------- the maths ---------- */
FR.zero = function () { var o = {}; FR.TRAITS.forEach(function (k) { o[k] = 0; }); return o; };

FR.tally = function (answers) {           // answers: array of chosen indexes (or null)
  var u = FR.zero();
  answers.forEach(function (ai, qi) {
    if (ai === null || ai === undefined) { return; }
    var w = FR.QUESTIONS[qi].a[ai].w;
    Object.keys(w).forEach(function (k) { u[k] += w[k]; });
  });
  return u;
};

FR.cosine = function (a, b) {
  var d = 0, na = 0, nb = 0, i;
  for (i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
};

/* Rank a table of profiles against the player's trait vector.
   1. The six "strength" traits are centred on their mean, so being middling at
      everything reads as balanced rather than as a weak match for each.
   2. The raw similarity is then compared with how a few thousand random players
      score against the same profile, so every class and race is equally reachable
      and the percentage means "a closer match than this share of adventurers". */
FR.centre = function (v) {
  var m = (v[0] + v[1] + v[2] + v[3] + v[4] + v[5]) / 6;
  return [v[0] - m, v[1] - m, v[2] - m, v[3] - m, v[4] - m, v[5] - m, v[6] * 0.8, v[7] * 0.8];
};
FR.raw = function (u, table) {
  var cu = FR.centre(FR.TRAITS.map(function (k) { return u[k]; })), out = {};
  Object.keys(table).forEach(function (name) { out[name] = FR.cosine(cu, FR.centre(table[name].v)); });
  return out;
};
FR.baseline = function (table) {
  if (table._base) { return table._base; }
  var seed = 20240611, rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  var names = Object.keys(table), sum = {}, sq = {}, N = 3000, i;
  names.forEach(function (n) { sum[n] = 0; sq[n] = 0; });
  for (i = 0; i < N; i++) {
    var r = FR.raw(FR.tally(FR.QUESTIONS.map(function (q) { return Math.floor(rnd() * q.a.length); })), table);
    names.forEach(function (n) { sum[n] += r[n]; sq[n] += r[n] * r[n]; });
  }
  var base = {};
  names.forEach(function (n) { var m = sum[n] / N; base[n] = { mean: m, sd: Math.sqrt(Math.max(1e-6, sq[n] / N - m * m)) }; });
  Object.defineProperty(table, '_base', { value: base, enumerable: false });
  return base;
};
FR.phi = function (z) {                  // normal CDF, Abramowitz-Stegun
  var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};
FR.rank = function (u, table) {
  var raw = FR.raw(u, table), base = FR.baseline(table);
  return Object.keys(table).map(function (name) {
    var z = (raw[name] - base[name].mean) / base[name].sd;
    return { name: name, score: z, raw: raw[name], pct: Math.max(1, Math.min(99, Math.round(100 * FR.phi(z)))) };
  }).sort(function (x, y) { return y.score - x.score; });
};

FR.alignment = function (u, answered) {
  var n = Math.max(1, answered), o = u.order / n, l = u.light / n;
  var a = o > 0.17 ? 'Lawful' : (o < -0.17 ? 'Chaotic' : 'Neutral');
  var b = l > 0.15 ? 'Good' : 'Neutral';
  return a === 'Neutral' && b === 'Neutral' ? 'True Neutral' : a + ' ' + b;
};

FR.mod = function (score) { return Math.floor((score - 10) / 2); };
FR.fmt = function (m) { return (m >= 0 ? '+' : '−') + Math.abs(m); };

/* Ability scores: the standard array, handed out by blending what the class
   needs with what the answers showed, then racial bonuses on top. */
FR.abilities = function (u, clsName, raceName) {
  var cls = FR.CLASSES[clsName], race = FR.RACES[raceName];
  var aff = [u.might, u.guile, 0.5 * u.might + 0.5 * u.wild, u.lore, 0.6 * u.faith + 0.4 * u.wild, u.charm];
  var mx = Math.max.apply(null, aff.concat([0.001]));
  var blend = aff.map(function (a, i) { return { i: i, s: 0.65 * cls.prio[i] + 0.35 * Math.max(0, a) / mx }; });
  blend.sort(function (x, y) { return y.s - x.s || x.i - y.i; });
  var arr = [15, 14, 13, 12, 10, 8], scores = [0, 0, 0, 0, 0, 0];
  blend.forEach(function (b, r) { scores[b.i] = arr[r]; });
  var out = {};
  FR.ABILITIES.forEach(function (k, i) { out[k] = scores[i] + (race.bonus[k] || 0); });
  if (race.flex) {                        // half-elf: +1 to the two best non-Charisma scores
    FR.ABILITIES.filter(function (k) { return k !== 'CHA'; }).sort(function (a, b) { return out[b] - out[a]; }).slice(0, race.flex).forEach(function (k) { out[k] += 1; });
  }
  return out;
};

FR.armor = function (kind, s) {
  var dex = FR.mod(s.DEX), con = FR.mod(s.CON), wis = FR.mod(s.WIS);
  var a = FR.armorBase(kind, dex, con, wis), notes = FR.theme && FR.theme.armorNotes;
  if (notes && notes[kind]) { a.note = notes[kind]; }
  return a;
};
FR.armorBase = function (kind, dex, con, wis) {
  switch (kind) {
    case 'unarmored': return { ac: 10 + dex + con, note: 'unarmored defense' };
    case 'monk': return { ac: 10 + dex + wis, note: 'unarmored defense' };
    case 'leather': return { ac: 11 + dex, note: 'leather armor' };
    case 'leather+shield': return { ac: 13 + dex, note: 'leather armor, shield' };
    case 'scale': return { ac: 14 + Math.min(2, dex), note: 'scale mail' };
    case 'scale+shield': return { ac: 16 + Math.min(2, dex), note: 'scale mail, shield' };
    case 'chain+shield': return { ac: 18, note: 'chain mail, shield' };
    default: return { ac: 10 + dex, note: 'no armor' };
  }
};

/* Everything the play screen needs, derived from class + race + answers. */
FR.build = function (u, clsName, raceName, answered) {
  var cls = FR.CLASSES[clsName], race = FR.RACES[raceName];
  var s = FR.abilities(u, clsName, raceName), mods = {};
  FR.ABILITIES.forEach(function (k) { mods[k] = FR.mod(s[k]); });
  var prof = 2, arm = FR.armor(cls.armor, s);
  var skills = {};
  Object.keys(FR.SKILLS).forEach(function (k) {
    var p = cls.skills.indexOf(k) >= 0;
    skills[k] = { mod: mods[FR.SKILLS[k]] + (p ? prof : 0), prof: p, ab: FR.SKILLS[k] };
  });
  return {
    cls: clsName, race: raceName, level: 1, scores: s, mods: mods, prof: prof,
    hp: cls.hd + mods.CON + (race.tough ? 1 : 0), ac: arm.ac, armor: arm.note, speed: race.speed, init: mods.DEX,
    skills: skills, perk: race.perk, alignment: FR.alignment(u, answered), lucky: !!race.lucky,
    attacks: cls.attacks.map(function (a) {
      return { n: a.n, hint: a.hint, spell: !!a.spell, hit: prof + mods[a.ab], die: a.die, cnt: a.cnt, dmg: a.spell ? 0 : mods[a.ab], ab: a.ab };
    })
  };
};

FR.pick = function (arr, rnd) { return arr[Math.floor((rnd || Math.random)() * arr.length)]; };

FR.rollName = function (raceName, body) {
  var t = FR.NAMES[raceName] || FR.NAMES.Human;
  var pool = body === 'Male' ? t.m : (body === 'Female' ? t.f : t.m.concat(t.f));
  return FR.pick(pool) + ' ' + FR.pick(t.s);
};

/* Local stand-in for the AI description, used when the server is not there. */
FR.localDescription = function (ch) {
  var bits = [];
  var age = { Young: 'Barely grown', 'In their prime': 'In the prime of life', Weathered: 'Weathered by hard roads', Elder: 'Old enough to have outlived two kings' }[ch.look.age] || 'Hard to place in years';
  bits.push(age + ', ' + (ch.look.build ? ch.look.build.toLowerCase() + ' of frame' : 'unremarkable of frame'));
  if (ch.look.hair) { bits.push({ Cropped: 'hair cropped close', 'Long and loose': 'hair worn long and loose', Braided: 'hair bound in tight braids', 'Wild curls': 'a riot of untamed curls', Shaved: 'a clean-shaved head', Silver: 'hair gone early to silver' }[ch.look.hair]); }
  var a = FR.pick(FR.FLOURISH), b = FR.pick(FR.FLOURISH);
  while (b === a) { b = FR.pick(FR.FLOURISH); }
  return bits.join(', ') + '. Wears ' + a + ', and ' + b + '.';
};

/* The words handed to the painter. The server adds the house style. */
FR.portraitSubject = function (ch) {
  var race = FR.RACES[ch.race], cls = FR.CLASSES[ch.cls], l = ch.look || {}, req = [];
  var g = l.body === 'Male' ? 'male ' : (l.body === 'Female' ? 'female ' : 'androgynous ');
  var s = 'A ' + g + ch.race.toLowerCase() + ' ' + ch.cls.toLowerCase() + ' (' + race.look + '). Typical gear: ' + cls.gear + '.';
  if (l.age) { req.push('age: ' + { Young: 'young, barely an adult', 'In their prime': 'an adult in the prime of life', Weathered: 'middle-aged and weathered, lined face', Elder: 'elderly, deeply lined' }[l.age]); }
  if (l.build) { req.push('build: ' + { Slight: 'slight and small-framed', Lean: 'lean and wiry', Sturdy: 'sturdy and solid', Towering: 'towering and very large' }[l.build]); }
  if (l.hair) { req.push('hair: ' + { Cropped: 'cropped very short', 'Long and loose': 'long, worn loose', Braided: 'in braids', 'Wild curls': 'a mass of wild curls', Shaved: 'a completely shaved head', Silver: 'silver-grey' }[l.hair]); }
  if (l.mark) { req.push('distinguishing mark: ' + { 'Old scar': 'an old scar across the face', Freckles: 'heavy freckles', 'War paint': 'bold war paint on the face', Tattoos: 'visible tattoos', Eyepatch: 'an eyepatch over one eye', Jewelry: 'striking jewelry' }[l.mark]); }
  if (l.bearing) { req.push('expression: ' + l.bearing.toLowerCase()); }
  if (req.length) { s += ' Required details, each one clearly visible and taking priority over the typical gear and over anything said later: ' + req.join('; ') + '.'; }
  if (ch.desc) { s += ' Also, where it does not contradict the required details: ' + ch.desc.trim(); }
  return s;
};


/* ---------- themes ----------
   A theme swaps the cast, the questions' wording, the copy and the art. The trait
   maths, the dice and the rules underneath stay the same. */
FR.THEMES = {};
FR.slug = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); };

FR.THEMES.tavern = {
  id: 'tavern', name: 'Tavern Night', blurb: 'Classic swords and sorcery',
  questions: FR.QUESTIONS, classes: FR.CLASSES, races: FR.RACES, names: FR.NAMES, look: FR.LOOK, lookLabels: FR.LOOK_LABELS,
  flourish: FR.FLOURISH, actions: FR.ACTIONS, traitLabels: FR.TRAIT_LABELS, axes: [['Chaos', 'Order'], ['Shadow', 'Light']],
  alignment: FR.alignment, describe: FR.localDescription, subject: FR.portraitSubject, armorNotes: null,
  samples: { Barbarian: 'Half-Orc', Bard: 'Half-Elf', Cleric: 'Dwarf', Druid: 'Elf', Fighter: 'Human', Monk: 'Human', Paladin: 'Dragonborn', Ranger: 'Elf', Rogue: 'Halfling', Sorcerer: 'Tiefling', Warlock: 'Tiefling', Wizard: 'Gnome' },
  demo: { cls: 'Rogue', race: 'Halfling', name: 'Wren Tealeaf', answers: [1, 0, 1, 1, 3, 2, 1, 1, 1, 1, 0, 2], look: { body: 'Female', age: 'Young', build: 'Lean', hair: 'Wild curls', mark: 'Freckles', bearing: 'Wry' } },
  art: {
    wordmark: 'img/wordmark.webp', divider: 'img/divider.webp', thumb: 'img/keyart.webp', floor: 'img/table.webp',
    crest: function (cls) { return 'img/crest_' + FR.slug(cls) + '.webp'; },
    sample: function (cls) { return 'img/sample_' + FR.slug(cls) + '.webp'; }
  },
  dice: { ink: '#f3d68a', inkMetal: 0.7, fleck: '#f6dd9a', fight: '#1b1820', fightInk: '#ff8a5c', rim: { color: 0xb09a8c, wood: true, metal: 0.05, rough: 0.6 }, floorTint: 0xd8d0cc, floorBase: 0x4a1a14, exposure: 0.92 },
  particles: 'embers', story: null, extras: [],
  /* The words that steer the AI. The app sends finished prompts; the server only forwards them. */
  ai: {
    style: 'Character portrait in the tradition of a classic fantasy tabletop roleplaying game player\'s handbook illustration: realistic painterly digital oil painting with visible confident brushwork, dramatic warm candle-like key light with a cool rim light, rich earthy palette with deep jewel accents, believable anatomy, costume in renaissance-fair fabrics (linen, wool, tooled leather, brass buckles). Waist-up, three-quarter view, the figure centered with space above the head. Behind the figure a loose watercolor and ink wash with splatters in muted tones that dissolves into plain light warm parchment toward every edge, so all four edges of the image are bare parchment. No text, no lettering, no border, no frame, no logo, no watermark.',
    describe: 'You invent the look of a fantasy roleplaying character for a portrait painter. Reply with one or two sentences, 40 words at most, of concrete visual detail only: clothing, colors, one signature object, small quirks. Renaissance-fair fantasy wardrobe. The character\'s fixed features are listed for you: agree with every one of them and never state a different age, build, hair, mark or expression. No name, no backstory, no game terms, no quotation marks.',
    origin: 'You write the opening of a fantasy roleplaying character\'s backstory in the voice of a storyteller at a tavern. Exactly two sentences, 45 words at most, never use "you", use the character\'s name. Warm, a little wry, no cliches about destiny.'
  },
  count: function (i, n) { var R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV']; return R[i] + ' of ' + R[n - 1]; },
  origin: function (c) {
    var home = { Dwarf: 'in the lamplit halls under a mountain', Elf: 'under trees older than most kingdoms', Halfling: 'in a village where everyone knows your grandmother',
      Human: 'in a market town on a muddy crossroads', Dragonborn: 'in a proud clan that carves its stories in stone', Gnome: 'in a burrow full of half-finished inventions',
      'Half-Elf': 'between two worlds, fully at home in neither', 'Half-Orc': 'on a frontier where respect is earned the hard way', Tiefling: 'in a city that never quite trusted the horns' };
    var lesson = { might: 'most problems move if you push hard enough', guile: 'the quiet ones see everything', lore: 'every answer hides a better question',
      faith: 'a promise kept is worth more than gold', charm: 'a good story opens more doors than a key', wild: 'the road is kinder than any roof' };
    return c.name + ' grew up ' + home[c.race] + ' and learned early that ' + lesson[c.top] + '. These days ' + c.first + ' travels as a ' + c.cls.toLowerCase() + ', and the stories are only getting started.';
  },
  text: {
    tagline: 'Answer a few questions. Meet your hero. Let the dice decide the rest.',
    begin: 'Begin your tale', have: 'I already have a character', dm: 'I am the DM',
    liveNote: 'Portraits are painted live by OpenAI.', tableNote: 'Sit at your DM’s table and your portrait is painted live. On your own you will see samples.', directNote: 'Portraits are painted live with your OpenAI key.', previewNote: 'Portraits here are ready-made samples. They do not use your choices.',
    connect: 'Connect OpenAI to paint your own', sampleBtn: 'Show a sample portrait', sampleTag: 'Sample', stale: 'Your choices changed. Paint another to see them.',
    ledgerTitle: 'Sign the guest ledger', ledgerLede: 'Tell us what to call you.', ledgerLedeTable: 'Your DM has a four-letter table code. Enter it to sit at their table, or leave it empty to play on your own.', ledgerSign: 'Continue', ledgerJoin: 'Join the table', ledgerSkip: 'Play on my own',
    storyNext: 'Next', storySkip: 'Skip the story', storyGo: 'Begin',
    omen: 'The table has taken your measure.', howRead: 'How the table read you', closestClasses: 'Closest classes', closestRaces: 'Closest peoples',
    toPortrait: 'This is me. Paint my portrait', retake: 'Answer again', asA: 'As a ',
    easelEmpty: 'No portrait yet', paint: 'Paint my portrait', paintAgain: 'Paint another', painting: 'The painter is working',
    keep: 'Keep it and name them', skip: 'Skip the portrait for now', ownWords: 'In your own words',
    descHint: 'A patched green cloak, a crooked grin, one ear nicked in a bar fight', surprise: 'Surprise me', thinking: 'Thinking',
    hintLive: 'Pick a few features, then let the painter work.', hintPreview: 'This preview cannot paint, so your choices are not used here. It shows a ready-made sample.',
    painted: 'Painted just now by OpenAI in {s} seconds.', sample: 'A ready-made sample: a {race} {cls}. It does not use your choices.',
    slow: 'The painter took too long. Try again.', failed: 'The painter could not finish: {e} Change the description or try again.',
    work: ['Grinding pigments', 'Sketching the jaw', 'Laying in the shadows', 'Arguing about the nose', 'Adding the candlelight', 'Signing the corner'],
    sheetTitle: 'Your character', nameLabel: 'Name', rollName: 'Roll a name', originHead: 'Origin', originWait: 'The storyteller clears their throat…', toTable: 'Take your seat at the table',
    skills: 'Skills', attacks: 'Attacks', trait: 'Trait',
    tabs: ['I want to…', 'Checks', 'Fight'], initLabel: 'Roll initiative', initHint: 'Sets the turn order. Do this first.', initDone: 'You are on {n}. Tell your DM.',
    shove: 'Shove or grapple', shoveHint: 'get physical, no weapon', hide: 'Hide', hideHint: 'duck out of sight',
    noRollB: 'No roll needed. ', noRoll: 'Dash to move twice as far, Dodge to be harder to hit, Disengage to back away safely, or Help a friend. Just say it.',
    free: 'The DM named the dice', freeNote: 'Whatever the DM asked for', damage: 'damage',
    tell: 'Tell your DM', tellDamage: 'Tell your DM the damage', nat20: 'Natural 20!', nat20Attack: 'Natural 20. Critical hit!', nat1: 'Natural 1. Oh no.',
    flick: 'Flick the tray, or press Roll', rolling: 'Rolling', hits: 'It hits. Roll damage', lucky: 'Lucky! Roll that 1 again', crit: 'Critical hit, double dice',
    checkHints: { STR: 'Push, lift, break', DEX: 'Quick hands, quick feet', CON: 'Endure, hold your breath', INT: 'Recall, reason, puzzle it out', WIS: 'Notice, sense, trust your gut', CHA: 'Charm, command, perform' }
  }
};

FR.useTheme = function (id) {
  var t = FR.THEMES[id] || FR.THEMES.tavern;
  FR.theme = t; FR.QUESTIONS = t.questions; FR.CLASSES = t.classes; FR.RACES = t.races; FR.NAMES = t.names; FR.LOOK = t.look; FR.LOOK_LABELS = t.lookLabels;
  FR.FLOURISH = t.flourish; FR.ACTIONS = t.actions; FR.TRAIT_LABELS = t.traitLabels; FR.alignment = t.alignment; FR.localDescription = t.describe; FR.portraitSubject = t.subject;
  return t;
};

if (typeof module !== 'undefined') { module.exports = FR; }
