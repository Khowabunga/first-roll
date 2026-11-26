/* First Roll scenario pack: Tavern Night. Classic swords and sorcery.

   This is the complete reference pack: it writes out everything a pack can say, including the
   parts it could have inherited from src/base.js. A new pack only needs what differs.
   It is data only: the build reads this call, checks it (npm run validate) and ships it as JSON.
   The contract is in README.md under "Make a new cartridge". */
FR.cartridge({
  schema: 1,
  id: 'tavern',
  version: '1.0.0',
  extends: 'base',

  meta: {
    name: 'Tavern Night',
    blurb: 'Classic swords and sorcery',
    kind: 'one-shot',              // 'one-shot' or 'campaign'
    access: 'free', sku: null,     // for a store later: 'paid' packs name the product they belong to. The app ignores both for now.
    visibility: 'public',          // 'public' is listed, 'unlisted' opens only with ?s=tavern, 'draft' is not built
    /* what the cartridge's card tells someone choosing what to play. There is no adventure in this cartridge:
       the DM brings the story. */
    label: {
      length: 'As long as you like',
      players: '2 to 8 players',
      tone: 'Classic fantasy',
      dm: 'Bring your own story',
      rating: 'everyone',
      flags: ['Fantasy fighting']
    },
    /* the rules credit every cartridge carries comes from src/base.js and is not repeated here */
    credits: []
  },

  /* No tokens and no theme.css: Tavern Night wears the engine's default look (src/styles.css),
     and its wordmark, key art, page and table are the engine's own (src/img/). Only the cast's art is here. */
  art: { crest: 'img/crest_{slug}.webp', sample: 'img/sample_{slug}.webp' },

  quiz: {
    count: { text: '{i} of {n}', numerals: 'roman' },
    traits: { might: 'Might', guile: 'Guile', lore: 'Lore', faith: 'Faith', charm: 'Charm', wild: 'Wild' },
    axes: [['Chaos', 'Order'], ['Shadow', 'Light']],
    /* the line under the hero's name: each side is the average push per answer, and the first rule it satisfies speaks */
    alignment: {
      order: [{ over: 0.17, say: 'Lawful' }, { under: -0.17, say: 'Chaotic' }, { say: 'Neutral' }],
      light: [{ over: 0.15, say: 'Good' }, { say: 'Neutral' }],
      parts: ['order', 'light'], join: ' ',
      rename: { 'Neutral Neutral': 'True Neutral' },
      detailOnly: true      // these are rule-book words: shown only with "Show rules details" on
    },
    /* Twelve questions. Every answer pushes one or more of eight traits:
       might, guile, lore, faith, charm, wild, order (minus is chaos), light (minus is shadow). */
    questions: [
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
    ],
    /* the five asked in a short game: the set that spreads players most evenly over the cast (npm run validate -- --quick tavern) */
    quick: [0, 1, 2, 3, 8]
  },

  cast: {
    /* Class and race profiles on the same eight traits:
       [might, guile, lore, faith, charm, wild, order(-chaos), light(-shadow)] */
    /* `strengths` is what a class is good at, in three plain sentences: players see them in the lobby and on
       the sheet, the DM beside each player. The first is the one shown where there is room for one.
       `role` is the part the class plays in a party (one of the six below), and `kit` is what a hero of that
       class starts with: two things from `kit.items`, further down. */
    /* Roles: the six parts a party wants filled. Players see them as cards over the classes, and the lobby says
       which part nobody has taken yet. `blurb` sells the role and `does` says what you do with it. (`trait` is
       the fallback for a class that names no role; every class here names its own.) */
    roles: {
      Protector: { trait: 'might', blurb: 'You stand between your friends and whatever wants to eat them.',
        does: 'Take the hits, hold the door, carry the heavy end. When a fight starts, you are already in front.' },
      Sneak: { trait: 'guile', blurb: 'Quiet feet, quick fingers, and a way out nobody else noticed.',
        does: 'Scout ahead, pick the lock, lift the key, and be somewhere else when the shouting starts.' },
      Spellcaster: { trait: 'lore', blurb: 'You do the impossible, usually on purpose.',
        does: 'Know what the glowing thing is, read what the old words say, and bring the fire when nothing else will do.' },
      Healer: { trait: 'faith', blurb: 'You keep the party alive, and mostly in one piece.',
        does: 'Bind wounds, steady nerves, and spot who is hiding how hurt they are. Nobody thanks you until they need you.' },
      Charmer: { trait: 'charm', blurb: 'You do the talking. People tend to agree, and wonder why later.',
        does: 'Bargain, flatter, bluff and perform. Half of every adventure is getting somebody to open a door.' },
      Scout: { trait: 'wild', blurb: 'You find the trail, the ambush and the way home.',
        does: 'Track, forage, spot trouble from a hill away and talk a wolf out of it. You are happiest under open sky.' }
    },
    classes: {
      Barbarian: { v: [1, 0.1, 0, 0.1, 0.1, 0.7, -0.7, 0], hd: 12, prio: [1, 0.7, 0.9, 0.1, 0.4, 0.3], color: '#8c2f1b',
        blurb: 'Fury given legs. You hit hard, shrug off harder, and think later.', armor: 'unarmored', skills: ['Athletics', 'Perception', 'Survival'],
        attacks: [{ n: 'Greataxe', ab: 'STR', die: 12, cnt: 1, hint: 'Someone next to you' }, { n: 'Javelin', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }], gear: 'furs, a heavy greataxe, bare scarred arms',
        role: 'Protector', kit: ['rope', 'flask'],
        strengths: ['You are the strongest in the room, and you hit like a falling tree.', 'You shrug off knocks that would flatten anyone else.', 'You know the wild: its weather, its tracks and its dangers.'] },
      Bard: { v: [0, 0.5, 0.4, 0.1, 1, 0.1, -0.5, 0.2], hd: 8, prio: [0.1, 0.8, 0.6, 0.4, 0.4, 1], color: '#b0457a',
        blurb: 'Words are your weapon and the room is your stage. You make everyone around you better.', armor: 'leather', skills: ['Persuasion', 'Performance', 'Deception'],
        attacks: [{ n: 'Rapier', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Thrown dagger', ab: 'DEX', die: 4, cnt: 1, hint: 'Up to 20 feet' }], gear: 'a lute, a feathered cap, a colorful doublet',
        role: 'Charmer', kit: ['lute', 'purse'],
        strengths: ['You can talk your way out of almost anything.', 'Give you a song or a story and the whole room is yours.', 'You lie beautifully when the truth will not do.'] },
      Cleric: { v: [0.3, 0, 0.3, 1, 0.2, 0, 0.5, 0.7], hd: 8, prio: [0.7, 0.3, 0.8, 0.2, 1, 0.4], color: '#c79a2c',
        blurb: 'Faith made practical. You mend the wounded and stand firm when it counts.', armor: 'scale+shield', skills: ['Insight', 'Medicine', 'Religion'],
        attacks: [{ n: 'Mace', ab: 'STR', die: 6, cnt: 1, hint: 'Someone next to you' }, { n: 'Guiding Bolt', ab: 'WIS', die: 6, cnt: 4, spell: true, hint: 'Spell, up to 120 feet' }], gear: 'chain and tabard, a mace, a glowing holy symbol',
        role: 'Healer', kit: ['symbol', 'draught'],
        strengths: ['You mend wounds and get fallen friends back on their feet.', 'You can tell what someone feels, whatever they say.', 'You know the gods, their rites and what offends them.'] },
      Druid: { v: [0.1, 0.1, 0.4, 0.5, 0, 1, -0.1, 0.3], hd: 8, prio: [0.1, 0.7, 0.8, 0.4, 1, 0.3], color: '#4d7a3a',
        blurb: 'The wild speaks and you answer. Storm, root and claw are yours to call.', armor: 'leather+shield', skills: ['Nature', 'Animal Handling', 'Perception'],
        attacks: [{ n: 'Produce Flame', ab: 'WIS', die: 8, cnt: 1, spell: true, hint: 'Spell, up to 30 feet' }, { n: 'Scimitar', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }], gear: 'a gnarled staff, a cloak of leaves and hide, antler charms',
        role: 'Scout', kit: ['whistle', 'draught'],
        strengths: ['Beasts trust you, and many will do as you ask.', 'You know every root, track and turn of the weather.', 'Out of doors, very little escapes your notice.'] },
      Fighter: { v: [1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.7, 0.1], hd: 10, prio: [1, 0.6, 0.9, 0.2, 0.4, 0.3], color: '#9a3b2a',
        blurb: 'Steel, drilled until it is instinct. You hold the line so others can shine.', armor: 'chain+shield', skills: ['Athletics', 'Intimidation', 'Perception'],
        attacks: [{ n: 'Longsword', ab: 'STR', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Light crossbow', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 80 feet' }], gear: 'chain mail, a longsword, a battered shield',
        role: 'Protector', kit: ['shield', 'rope'],
        strengths: ['You are the best with a blade, and you hold the line.', 'Strong enough to climb it, lift it or break it down.', 'One hard look from you ends most arguments.'] },
      Monk: { v: [0.5, 0.6, 0.2, 0.6, 0, 0.2, 0.9, 0.2], hd: 8, prio: [0.4, 1, 0.7, 0.2, 0.9, 0.2], color: '#c2702a',
        blurb: 'Stillness, then lightning. Your body is the only weapon you need.', armor: 'monk', skills: ['Acrobatics', 'Stealth', 'Insight'],
        attacks: [{ n: 'Unarmed strike', ab: 'DEX', die: 4, cnt: 1, hint: 'Someone next to you' }, { n: 'Quarterstaff', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }], gear: 'simple wrapped robes, bare fists, a quarterstaff',
        role: 'Sneak', kit: ['cloak', 'rope'],
        strengths: ['You are faster than anyone expects, and you never lose your balance.', 'You move without a sound when you choose to.', 'You read a person’s mood before they speak.'] },
      Paladin: { v: [0.8, 0, 0, 0.8, 0.4, 0, 0.8, 0.8], hd: 10, prio: [1, 0.2, 0.8, 0.1, 0.4, 0.9], color: '#b58a2e',
        blurb: 'An oath in shining plate. You protect the weak and smite what threatens them.', armor: 'chain+shield', skills: ['Athletics', 'Persuasion', 'Insight'],
        attacks: [{ n: 'Longsword', ab: 'STR', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Javelin', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }], gear: 'polished plate, a longsword, a heraldic shield',
        role: 'Protector', kit: ['shield', 'symbol'],
        strengths: ['You shield your friends, and you are very hard to knock down.', 'People believe you, because you mean what you say.', 'You can tell an honest face from a false one.'] },
      Ranger: { v: [0.4, 0.6, 0.1, 0.1, 0, 1, 0, 0.2], hd: 10, prio: [0.5, 1, 0.7, 0.3, 0.9, 0.2], color: '#3f6b4f',
        blurb: 'Tracker, hunter, scout. Nothing crosses the wilds without you knowing.', armor: 'scale', skills: ['Survival', 'Stealth', 'Perception'],
        attacks: [{ n: 'Longbow', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 150 feet' }, { n: 'Shortsword', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }], gear: 'a hooded forest cloak, a longbow, a quiver',
        role: 'Scout', kit: ['whistle', 'torch'],
        strengths: ['You can follow any trail and never lose your way.', 'You see and hear trouble long before it sees you.', 'With a bow in your hands, you rarely miss.'] },
      Rogue: { v: [0, 1, 0.3, 0, 0.5, 0.1, -0.6, -0.3], hd: 8, prio: [0.1, 1, 0.6, 0.6, 0.5, 0.7], color: '#3f4f7a',
        blurb: 'Quick, quiet and clever. You win by being where nobody expects you.', armor: 'leather', skills: ['Stealth', 'Sleight of Hand', 'Deception', 'Perception'],
        attacks: [{ n: 'Rapier', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'Shortbow', ab: 'DEX', die: 6, cnt: 1, hint: 'Up to 80 feet' }], gear: 'dark leathers, a hood, a pair of daggers',
        role: 'Sneak', kit: ['lockpicks', 'cloak'],
        strengths: ['You slip in and out without ever being seen.', 'Locks and pockets open for your quick fingers.', 'You lie with a perfectly straight face.'] },
      Sorcerer: { v: [0.1, 0.1, 0.3, 0, 0.9, 0.3, -0.8, 0], hd: 6, prio: [0.1, 0.7, 0.8, 0.3, 0.4, 1], color: '#a23a5a',
        blurb: 'Magic is in your blood, and it does not always ask permission.', armor: 'none', skills: ['Persuasion', 'Arcana', 'Intimidation'],
        attacks: [{ n: 'Fire Bolt', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Spell, up to 120 feet' }, { n: 'Dagger', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'travel-worn finery, crackling arcane energy around the hands',
        role: 'Spellcaster', kit: ['flask', 'purse'],
        strengths: ['Magic comes naturally to you, and it hits hard.', 'You know a spell when you see one, and what it is likely to do.', 'You can charm people or frighten them, as the moment needs.'] },
      Warlock: { v: [0, 0.5, 0.7, 0, 0.6, 0, -0.2, -0.8], hd: 8, prio: [0.1, 0.7, 0.8, 0.5, 0.4, 1], color: '#5b3a7a',
        blurb: 'You made a bargain for power. The terms were… flexible.', armor: 'leather', skills: ['Deception', 'Arcana', 'Intimidation'],
        attacks: [{ n: 'Eldritch Blast', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Spell, up to 120 feet' }, { n: 'Dagger', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'dark robes, an old tome on a chain, a faint eerie glow',
        role: 'Spellcaster', kit: ['spellbook', 'cloak'],
        strengths: ['You know dark and secret magic that others would rather not.', 'You can make people believe things that are not so.', 'You are unsettling when you want to be, and people back down.'] },
      Wizard: { v: [0, 0.2, 1, 0.1, 0, 0, 0.4, 0], hd: 6, prio: [0.1, 0.7, 0.7, 1, 0.5, 0.3], color: '#3a5f8a',
        blurb: 'A scholar of the impossible. Fragile, yes, until the spellbook opens.', armor: 'none', skills: ['Arcana', 'History', 'Investigation'],
        attacks: [{ n: 'Fire Bolt', ab: 'INT', die: 10, cnt: 1, spell: true, hint: 'Spell, up to 120 feet' }, { n: 'Dagger', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'scholar’s robes, a spellbook, a staff',
        role: 'Spellcaster', kit: ['spellbook', 'torch'],
        strengths: ['You know more about magic than anyone at the table.', 'You remember old tales, names and dates just when they matter.', 'You work out puzzles and find the clue others missed.'] }
    },
    races: {
      Dwarf: { v: [0.6, 0, 0.3, 0.5, 0, 0.1, 0.8, 0.3], bonus: { CON: 2, WIS: 1 }, speed: 25, tough: true, perk: 'Dwarven toughness: you can take more knocks than most.', look: 'stocky and broad, a thick braided beard or braids, weathered features' },
      Elf: { v: [0, 0.5, 0.6, 0.2, 0.3, 0.7, 0, 0.1], bonus: { DEX: 2, INT: 1 }, speed: 30, perk: 'Keen senses: you see in the dark and notice more.', look: 'tall and slender, long pointed ears, fine angular features' },
      Halfling: { v: [0, 0.6, 0, 0.4, 0.6, 0.3, -0.3, 0.7], bonus: { DEX: 2, CHA: 1 }, speed: 25, lucky: true, perk: 'Lucky: roll a 1 on the 20-sided die and you may roll again.', look: 'small, about three feet tall, round friendly face, curly hair, slightly pointed ears' },
      Human: { v: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.1, 0.1], bonus: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, speed: 30, perk: 'Versatile: a little better at everything.', look: 'human' },
      Dragonborn: { v: [0.8, 0, 0.1, 0.4, 0.5, 0, 0.6, 0.1], bonus: { STR: 2, CHA: 1 }, speed: 30, perk: 'Breath weapon: breathe fire once, then rest before you can again.', look: 'a tall humanoid with a scaled draconic head, horns and no hair' },
      Gnome: { v: [0, 0.4, 0.9, 0, 0.5, 0.2, -0.5, 0.3], bonus: { INT: 2, CON: 1 }, speed: 25, perk: 'Gnome cunning: hard to fool with mind-bending magic.', look: 'very small, large bright eyes, a prominent nose, wild hair' },
      'Half-Elf': { v: [0.1, 0.4, 0.3, 0.1, 0.9, 0.4, -0.3, 0.2], bonus: { CHA: 2 }, flex: 2, speed: 30, perk: 'Fey ancestry: hard to charm, impossible to put to sleep.', look: 'human build with gently pointed ears and striking eyes' },
      'Half-Orc': { v: [1, 0.1, 0, 0, 0, 0.7, -0.5, -0.1], bonus: { STR: 2, CON: 1 }, speed: 30, perk: 'Relentless: once a day, when a blow would knock you out, stay on your feet.', look: 'tall and powerfully built, grey-green skin, small lower tusks, a heavy brow' },
      Tiefling: { v: [0, 0.6, 0.5, 0, 0.7, 0, -0.3, -0.7], bonus: { CHA: 2, INT: 1 }, speed: 30, perk: 'Infernal legacy: fire barely bothers you.', look: 'curved horns, solid-colored eyes, reddish or violet skin, a slender tail' }
    },
    names: {
      Dwarf: { m: ['Thorin', 'Baern', 'Rurik', 'Dain', 'Harbek', 'Orsik'], f: ['Helja', 'Dagnal', 'Gunnloda', 'Riswynn', 'Vistra', 'Audhild'], s: ['Ironfist', 'Stonehelm', 'Fireforge', 'Rumnaheim', 'Battlehammer', 'Deepdelver'] },
      Elf: { m: ['Aelar', 'Thamior', 'Erevan', 'Riardon', 'Soveliss', 'Varis'], f: ['Naivara', 'Sariel', 'Thia', 'Keyleth', 'Shava', 'Ielenia'], s: ['Moonwhisper', 'Silverfrond', 'Nightbreeze', 'Galanodel', 'Amakiir', 'Starflower'] },
      Halfling: { m: ['Pip', 'Corrin', 'Merric', 'Roscoe', 'Wellby', 'Finnan'], f: ['Wren', 'Merla', 'Callie', 'Seraphina', 'Verna', 'Bree'], s: ['Underbough', 'Tealeaf', 'Goodbarrel', 'Highhill', 'Brushgather', 'Thorngage'] },
      Human: { m: ['Aldric', 'Bram', 'Garrett', 'Tomas', 'Edmund', 'Lorcan'], f: ['Mira', 'Isolde', 'Rowan', 'Elspeth', 'Catrin', 'Sabine'], s: ['Ashdown', 'Blackwood', 'Fairwind', 'Marlowe', 'Thatcher', 'Greycastle'] },
      Dragonborn: { m: ['Arjhan', 'Balasar', 'Kriv', 'Medrash', 'Rhogar', 'Torinn'], f: ['Akra', 'Biri', 'Kava', 'Sora', 'Harann', 'Thava'], s: ['Kepeshkmolik', 'Myastan', 'Delmirev', 'Yarjerit', 'Clethtinthiallor', 'Daardendrian'] },
      Gnome: { m: ['Boddynock', 'Fonkin', 'Wrenn', 'Zook', 'Dimble', 'Orryn'], f: ['Bimpnottin', 'Nissa', 'Waywocket', 'Zanna', 'Ellyjobell', 'Carlin'], s: ['Fizzlebang', 'Nackle', 'Timbers', 'Raulnor', 'Garrick', 'Sparklegem'] },
      'Half-Elf': { m: ['Kael', 'Davin', 'Theren', 'Lucan', 'Emric', 'Soren'], f: ['Lyra', 'Arwyn', 'Senna', 'Maelis', 'Elowen', 'Tamsin'], s: ['Brightwater', 'Duskwalker', 'Evenwood', 'Hartley', 'Vale', 'Swiftbrook'] },
      'Half-Orc': { m: ['Grom', 'Thokk', 'Dench', 'Krusk', 'Holg', 'Ront'], f: ['Baggi', 'Emen', 'Kansif', 'Ovak', 'Sutha', 'Volen'], s: ['Skullsplitter', 'the Unbroken', 'Ashfang', 'Stonejaw', 'of the Red Hand', 'Ironhide'] },
      Tiefling: { m: ['Akmenos', 'Damakos', 'Kairon', 'Mordai', 'Skamos', 'Therai'], f: ['Akta', 'Bryseis', 'Kallista', 'Nemeia', 'Orianna', 'Rieta'], s: ['Ashgrave', 'Nightbloom', 'Vex', 'Cinderfall', 'Morrow', 'Embermane'] }
    },
    /* who is in each class's sample portrait */
    samples: { Barbarian: 'Half-Orc', Bard: 'Half-Elf', Cleric: 'Dwarf', Druid: 'Elf', Fighter: 'Human', Monk: 'Human', Paladin: 'Dragonborn', Ranger: 'Elf', Rogue: 'Halfling', Sorcerer: 'Tiefling', Warlock: 'Tiefling', Wizard: 'Gnome' },
    armorNotes: null
  },

  look: {
    options: {
      body: ['Male', 'Female', 'Neither'],
      age: ['Young', 'In their prime', 'Weathered', 'Elder'],
      build: ['Slight', 'Lean', 'Sturdy', 'Towering'],
      hair: ['Cropped', 'Long and loose', 'Braided', 'Wild curls', 'Shaved', 'Silver'],
      mark: ['Old scar', 'Freckles', 'War paint', 'Tattoos', 'Eyepatch', 'Jewelry'],
      bearing: ['Wry', 'Grim', 'Kind', 'Fierce', 'Dreamy', 'Proud']
    },
    labels: { body: 'Body', age: 'Age', build: 'Build', hair: 'Hair', mark: 'A mark', bearing: 'Bearing' },
    flourish: [
      'a patched travelling cloak the color of wet moss', 'rings on every finger, none of them matching', 'a crooked grin and one chipped tooth',
      'ink-stained fingers and a quill behind one ear', 'a red silk scarf knotted at the throat', 'a necklace of mismatched keys',
      'boots far too fine for the rest of the outfit', 'a falcon feather tucked into a braid', 'burn-scarred knuckles wrapped in linen',
      'a brass spyglass on a belt chain', 'eyes that never stop counting the exits', 'a wide-brimmed hat that has seen better decades',
      'a pewter flask engraved with someone else’s initials', 'a sash embroidered with tiny constellations', 'a sprig of rosemary pinned to the collar'
    ]
  },

  roster: {
    /* the hero behind "I already have a character" when nothing is saved */
    demo: { cls: 'Rogue', race: 'Halfling', name: 'Wren Tealeaf', answers: [1, 0, 1, 1, 3, 2, 1, 1, 1, 1, 0, 2], look: { body: 'Female', age: 'Young', build: 'Lean', hair: 'Wild curls', mark: 'Freckles', bearing: 'Wry' } },
    /* ready-made heroes, for players who want to skip the questions */
    premades: [
      { name: 'Wren Tealeaf', cls: 'Rogue', race: 'Halfling', portrait: 'img/sample_rogue.webp', look: { body: 'Female', age: 'Young', build: 'Lean', hair: 'Wild curls', mark: 'Freckles', bearing: 'Wry' } },
      { name: 'Mira Ashdown', cls: 'Fighter', race: 'Human', portrait: 'img/sample_fighter.webp', look: { body: 'Female', age: 'In their prime', build: 'Sturdy', hair: 'Cropped', bearing: 'Grim' } },
      { name: 'Zanna Fizzlebang', cls: 'Wizard', race: 'Gnome', portrait: 'img/sample_wizard.webp', look: { body: 'Female', age: 'Elder', build: 'Slight', hair: 'Silver', bearing: 'Kind' } },
      { name: 'Rurik Fireforge', cls: 'Cleric', race: 'Dwarf', portrait: 'img/sample_cleric.webp', look: { body: 'Male', age: 'In their prime', build: 'Sturdy', hair: 'Braided', bearing: 'Kind' } },
      { name: 'Varis Nightbreeze', cls: 'Ranger', race: 'Elf', portrait: 'img/sample_ranger.webp', look: { body: 'Male', age: 'In their prime', build: 'Lean', hair: 'Long and loose', bearing: 'Grim' } },
      { name: 'Lyra Brightwater', cls: 'Bard', race: 'Half-Elf', portrait: 'img/sample_bard.webp', look: { body: 'Female', age: 'Young', build: 'Lean', hair: 'Long and loose', mark: 'Jewelry', bearing: 'Wry' } }
    ]
  },

  /* The "I want to..." menu: plain words mapped to the right skill. */
  actions: [
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
    { id: 'recall', label: 'Remember old tales', hint: 'Do I know anything about this?', skill: 'History' },
    { id: 'magic', label: 'Sense magic', hint: 'What is that glowing thing?', skill: 'Arcana' },
    { id: 'track', label: 'Track or forage', hint: 'Follow a trail, find food', skill: 'Survival' },
    { id: 'heal', label: 'Patch someone up', hint: 'Stop the bleeding', skill: 'Medicine' },
    { id: 'beast', label: 'Calm an animal', hint: 'Easy now, easy', skill: 'Animal Handling' },
    { id: 'show', label: 'Perform', hint: 'Sing, juggle, hold the room', skill: 'Performance' }
  ],
  extras: [],

  /* What ties a hero to the rest of the party, and to whatever story the DM has brought. Bonds are asked about
     another player's hero once a hero is made at a table ({name} is that hero), and the whole table sees the
     answer. A hook is a private stake a player picks or skips; only they and the DM see it, and a few are kept
     for certain roles. Voices are ways to talk, for anyone who would like to try one. */
  ties: {
    bonds: [
      'You and {name} were once thrown out of a tavern together. Whose fault was it?',
      'Why do you owe {name} a favor, and are you hoping they have forgotten?',
      '{name} once pulled you out of real trouble. What did it cost them?',
      'What does {name} do on the road that drives you up the wall?',
      'What did {name} win from you at cards that you still want back?',
      'Which of your stories does {name} know is not true?',
      'What would you trust {name} with, and what would you never?',
      'You and {name} are after the same thing. What is it, and have you told them?'
    ],
    hooks: [
      { id: 'debt', text: 'You owe money to someone patient and unpleasant. Whatever tonight’s work pays, most of it is already spent.' },
      { id: 'map', text: 'You carry half of an old map. Somebody has the other half, and you look at every stranger as if it might be them.' },
      { id: 'song', text: 'You want one deed good enough to be sung about. So far the only song about you is rude.' },
      { id: 'home', text: 'You left home after an argument and said you would be back when you had made something of yourself. You are still working on it.' },
      { id: 'name', text: 'You are travelling under a name that is not yours. Sooner or later someone in a room like this will use the real one.', roles: ['Sneak', 'Charmer'] },
      { id: 'oath', text: 'You swore to keep someone safe, and you were not there when it counted. You do not let people out of your sight now.', roles: ['Protector', 'Healer'] },
      { id: 'page', text: 'One page was torn out of the book that taught you everything. You would give a great deal to read it.', roles: ['Spellcaster'] },
      { id: 'follower', text: 'Something has been following you since the last forest. It has done you no harm. You have started leaving food out.', roles: ['Scout'] }
    ],
    voices: [
      { label: 'Gruff', tip: 'Short sentences. Long pauses. Let the mug do some of the talking.' },
      { label: 'Honeyed', tip: 'Warm, slow and flattering. Call everyone “my friend” and mean it about half the time.' },
      { label: 'Booming', tip: 'Speak to the back of the room. Laugh at your own jokes first.' },
      { label: 'Hushed', tip: 'Low and quick, with an eye on the door. Never use a name where “a certain someone” will do.' },
      { label: 'Lofty', tip: 'Choose long words. Sound faintly surprised that anyone else is here.' },
      { label: 'Plainspoken', tip: 'Say what you mean in as few words as it takes. Shrug a lot.' }
    ]
  },

  /* The kit: twelve things a hero might carry, each a card with a "Use" button that tells the DM. Every class
     starts with two (its `kit`, above). There are no numbers on them: the DM decides what using one does.
     The token is this cartridge's hero token: the DM hands one out for a great moment, and a player spends it
     to roll again. */
  kit: {
    items: {
      rope: { name: 'Fifty feet of rope', text: 'Climb it, tie it, lower a friend on it. It solves more problems than a sword does.', uses: 'always' },
      torch: { name: 'Torches and a tinderbox', text: 'Light in dark places, and a fire when you need one.', uses: 'always' },
      lockpicks: { name: 'Lockpicks', text: 'A roll of thin tools for doors that were not meant for you.', uses: 'always' },
      draught: { name: 'Healing draught', text: 'One small bottle. Drink it, or pour it into a friend, and the worst of the hurt is gone.', uses: 'once' },
      lute: { name: 'A well-travelled lute', text: 'Play it and a room goes quiet, or loud, whichever you were after.', uses: 'always' },
      spellbook: { name: 'Battered spellbook', text: 'Look up what the glowing thing is, or what the old words on the wall say.', uses: 'always' },
      symbol: { name: 'Holy symbol', text: 'Hold it up and speak plainly. Things that fear the light take a step back.', uses: 'always' },
      shield: { name: 'Dented shield', text: 'Plant your feet and raise it. Whoever is behind you is safe for as long as you hold.', uses: 'always' },
      cloak: { name: 'Grey travelling cloak', text: 'Hood up, head down, and you are one more traveller nobody remembers.', uses: 'always' },
      whistle: { name: 'Bone whistle', text: 'Too high for people to hear. Animals come to see who is calling.', uses: 'always' },
      purse: { name: 'Purse of silver', text: 'Enough to buy a round, a rumor or a blind eye. Not all three.', uses: 'once' },
      flask: { name: 'Flask of something strong', text: 'Courage for you, a bribe for a guard, or a very small fire.', uses: 'once' }
    },
    token: { name: 'Lucky coin', plural: 'Lucky coins', text: 'Spend one to roll again when it matters. Your DM slides you one for a deed worth a round of applause.' }
  },

  /* Soundscapes for the DM to put behind a scene: the engine's seven, made on the spot with no files, each named
     the way this cartridge would say it. A cartridge may also add its own audio files here, or take one of the
     seven away with null. */
  sound: {
    beds: {
      fire: { label: 'The hearth', synth: 'fire' },
      crowd: { label: 'The taproom, busy', synth: 'crowd' },
      storm: { label: 'A storm outside', synth: 'storm' },
      wind: { label: 'A cold wind on the road', synth: 'wind' },
      night: { label: 'Camp at night', synth: 'night' },
      cave: { label: 'A dripping cave', synth: 'cave' },
      sea: { label: 'The harbor', synth: 'sea' }
    }
  },

  /* The rules underneath: today's, said in plain words. ('light' is the other choice.) */
  rules: 'open-5e',

  story: null,
  music: null,

  /* embers rising past the title: see "particles" in the README for each setting */
  particles: { motion: 'rise', count: 44, speed: 1, base: 0, size: 1, color: ['#ffb446', '#ffd246'], alpha: [0.5, 1], flicker: true, fade: true, screens: ['title', 'heroes', 'reveal'] },

  /* the 3D tray: number ink, the fight dice, the rim and the felt under the floor picture */
  dice: { ink: '#f3d68a', inkMetal: 0.7, fleck: '#f6dd9a', fight: '#1b1820', fightInk: '#ff8a5c',
    rim: { color: '#b09a8c', wood: true, metal: 0.05, rough: 0.6 }, floorTint: '#d8d0cc', floorBase: '#4a1a14', exposure: 0.92 },

  /* which of the engine's sounds mark each moment */
  sfx: { tap: 'tick', cheer: 'chime', fumble: 'lowchime', arrive: 'chime' },

  /* shown on a natural 20 and a natural 1 */
  /* `particles` is what flies (one of FR.FX.particles in src/fx.js), `object` is the one sad thing that lands
     on a natural 1 (one of FR.FX.objects), and `colors` light the moment: the first two colour the beams
     and the title, all of them colour the particles. Titles are short: under 22 characters. */
  fx: {
    crit: { title: 'Natural 20!', particles: 'sparks', colors: ['#f3dc9c', '#c9a45c', '#fff6dc', '#ff9a4a', '#b23a2c'],
      lines: ['The bards will get at least a verse out of that.', 'Even the innkeeper stops polishing to watch.', 'Steel, nerve and luck, all at once.',
        'Somewhere a dragon feels a chill.', 'They will tell this one by the fire for years.', 'The dice bow. So does everyone else.'] },
    fumble: { title: 'Natural 1', particles: 'coal', object: 'tankard', colors: ['#6b5a48', '#3d3128', '#8a7a66', '#241c16'],
      lines: ['The floor was closer than it looked.', 'Somewhere a goblin is laughing, and has no idea why.', 'You are buying the next round.',
        'Nobody mention this to the bard.', 'Even the tavern cat looks away.', 'A lesson, dearly bought. Mostly in dignity.'] }
  },

  /* Words the app writes by itself, with no AI. */
  prose: {
    /* the look "Surprise me" writes */
    describe: {
      text: '{age}, {build}{hair}. Wears {flourishA}, and {flourishB}.',
      parts: {
        age: { from: 'look.age', map: { Young: 'Barely grown', 'In their prime': 'In the prime of life', Weathered: 'Weathered by hard roads', Elder: 'Old enough to have outlived two kings' }, or: 'Hard to place in years' },
        build: { from: 'look.build', lower: true, wrap: '{value} of frame', or: 'unremarkable of frame' },
        hair: { from: 'look.hair', map: { Cropped: 'hair cropped close', 'Long and loose': 'hair worn long and loose', Braided: 'hair bound in tight braids', 'Wild curls': 'a riot of untamed curls', Shaved: 'a clean-shaved head', Silver: 'hair gone early to silver' }, wrap: ', {value}' }
      }
    },
    /* the origin on the sheet */
    origin: {
      text: '{name} grew up {home} and learned early that {lesson}. These days {first} travels as a {clsLower}, and the stories are only getting started.',
      parts: {
        home: { from: 'race', map: { Dwarf: 'in the lamplit halls under a mountain', Elf: 'under trees older than most kingdoms', Halfling: 'in a village where everyone knows your grandmother',
          Human: 'in a market town on a muddy crossroads', Dragonborn: 'in a proud clan that carves its stories in stone', Gnome: 'in a burrow full of half-finished inventions',
          'Half-Elf': 'between two worlds, fully at home in neither', 'Half-Orc': 'on a frontier where respect is earned the hard way', Tiefling: 'in a city that never quite trusted the horns' } },
        lesson: { from: 'top', map: { might: 'most problems move if you push hard enough', guile: 'the quiet ones see everything', lore: 'every answer hides a better question',
          faith: 'a promise kept is worth more than gold', charm: 'a good story opens more doors than a key', wild: 'the road is kinder than any roof' } },
        clsLower: { from: 'cls', lower: true }
      }
    }
  },

  /* Optional: the words that steer OpenAI when a table has it switched on. The app sends finished prompts; the server only forwards them. */
  ai: {
  style: 'Character portrait in the tradition of a classic fantasy tabletop roleplaying game player\'s handbook illustration: realistic painterly digital oil painting with visible confident brushwork, dramatic warm candle-like key light with a cool rim light, rich earthy palette with deep jewel accents, believable anatomy, costume in renaissance-fair fabrics (linen, wool, tooled leather, brass buckles). Waist-up, three-quarter view, the figure centered with space above the head. Behind the figure a loose watercolor and ink wash with splatters in muted tones that dissolves into plain light warm parchment toward every edge, so all four edges of the image are bare parchment. No text, no lettering, no border, no frame, no logo, no watermark.',
  describe: 'You invent the look of a fantasy roleplaying character for a portrait painter. Reply with one or two sentences, 40 words at most, of concrete visual detail only: clothing, colors, one signature object, small quirks. Renaissance-fair fantasy wardrobe. The character\'s fixed features are listed for you: agree with every one of them and never state a different age, build, hair, mark or expression. No name, no backstory, no game terms, no quotation marks.',
  origin: 'You write the opening of a fantasy roleplaying character\'s backstory in the voice of a storyteller at a tavern. Exactly two sentences, 45 words at most, never use "you", use the character\'s name. Warm, a little wry, no cliches about destiny.',
    /* who to paint: the fixed features first, then the player's own words */
    subject: {
      text: 'A {body}{raceLower} {clsLower} ({raceInfo.look}). Typical gear: {classInfo.gear}.{details}{also}',
      parts: {
        body: { from: 'look.body', map: { Male: 'male ', Female: 'female ' }, or: 'androgynous ' },
        raceLower: { from: 'race', lower: true },
        clsLower: { from: 'cls', lower: true },
        details: { join: '; ', wrap: ' Required details, each one clearly visible and taking priority over the typical gear and over anything said later: {value}.', list: [
          { from: 'look.age', map: { Young: 'young, barely an adult', 'In their prime': 'an adult in the prime of life', Weathered: 'middle-aged and weathered, lined face', Elder: 'elderly, deeply lined' }, wrap: 'age: {value}' },
          { from: 'look.build', map: { Slight: 'slight and small-framed', Lean: 'lean and wiry', Sturdy: 'sturdy and solid', Towering: 'towering and very large' }, wrap: 'build: {value}' },
          { from: 'look.hair', map: { Cropped: 'cropped very short', 'Long and loose': 'long, worn loose', Braided: 'in braids', 'Wild curls': 'a mass of wild curls', Shaved: 'a completely shaved head', Silver: 'silver-grey' }, wrap: 'hair: {value}' },
          { from: 'look.mark', map: { 'Old scar': 'an old scar across the face', Freckles: 'heavy freckles', 'War paint': 'bold war paint on the face', Tattoos: 'visible tattoos', Eyepatch: 'an eyepatch over one eye', Jewelry: 'striking jewelry' }, wrap: 'distinguishing mark: {value}' },
          { from: 'look.bearing', lower: true, wrap: 'expression: {value}' }
        ] },
        also: { from: 'desc', wrap: ' Also, where it does not contradict the required details: {value}' }
      }
    }
  },

  /* The words on the screens that this pack says in its own voice. Everything else is the engine's
     plain wording: src/base.js lists every line a pack may say its own way. */
  text: {
    tagline: 'Answer a few questions. Meet your hero. Let the dice decide the rest.',
    begin: 'Begin your tale',
    heroesTitle: 'Pick your adventurer',
    descHint: 'A patched green cloak, a crooked grin, one ear nicked in a bar fight',
    work: ['Grinding pigments', 'Sketching the jaw', 'Laying in the shadows', 'Arguing about the nose', 'Adding the candlelight', 'Signing the corner'],
    nat20: 'A natural 20, the best roll there is. The whole tavern cheers!', nat1: 'A natural 1, the worst roll there is. The tavern winces.',
    whyDeception: 'a card player’s face', whyHistory: 'knowing the old songs'
  }
});
