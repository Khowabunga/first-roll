/* The parts of a new cartridge that depend on its rules: these are for rules: 'open-5e'.
   scripts/lib/packs.js (template) puts each part where scripts/template/cartridge.js has a marker of the
   same name. This file is pieces of a cartridge, not a cartridge: it is never run. */
//=== quick ===
    quick: [1, 2, 3, 7, 8]
//=== notes ===
    /* TODO rename each class, and write its blurb, attacks and gear. The numbers are a standard set that
       plays well; leave them unless you mean to rebalance.
       v:    how much the class is about each trait [might, guile, lore, faith, charm, wild, order(-chaos), light(-shadow)]
       hd:   hit die (6, 8, 10 or 12)      prio: how much it wants [STR, DEX, CON, INT, WIS, CHA]
       color: the dice are cast in it      armor: unarmored, monk, leather, leather+shield, scale, scale+shield, chain+shield or none
       strengths: three plain sentences about what the class is good at, 80 characters each at most and with no
             rules words. Players see them in the lobby and on the sheet, the DM beside each player; the first is
             the one shown when there is room for one. Delete the line and the engine writes them from the
             class's first three skills.
       role: which of the roles below the class plays. Delete the line and the class is filed under the role of
             its strongest trait.
       kit:  the ids of the items (see `kit`, further down) a hero of this class starts with: four at most. */
//=== classes ===
    classes: {
      'The Brawler': { v: [1, 0.1, 0, 0.1, 0.1, 0.7, -0.7, 0], hd: 12, prio: [1, 0.7, 0.9, 0.1, 0.4, 0.3], color: '#8c2f1b',
        blurb: 'TODO one line that sells this class.', armor: 'unarmored', skills: ['Athletics', 'Perception', 'Survival'],
        attacks: [{ n: 'TODO Heavy weapon', ab: 'STR', die: 12, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Thrown weapon', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Protector', kit: ['rope', 'trinket'],
        strengths: ['TODO You are the strongest one here.', 'TODO You can take a knock that would flatten most.', 'TODO You know the wild and its dangers.'] },
      'The Performer': { v: [0, 0.5, 0.4, 0.1, 1, 0.1, -0.5, 0.2], hd: 8, prio: [0.1, 0.8, 0.6, 0.4, 0.4, 1], color: '#b0457a',
        blurb: 'TODO one line that sells this class.', armor: 'leather', skills: ['Persuasion', 'Performance', 'Deception'],
        attacks: [{ n: 'TODO Light blade', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Thrown knife', ab: 'DEX', die: 4, cnt: 1, hint: 'Up to 20 feet' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Talker', kit: ['horn', 'treats'],
        strengths: ['TODO You can talk your way out of almost anything.', 'TODO Give you an audience and it is yours.', 'TODO You can lie with a straight face.'] },
      'The Healer': { v: [0.3, 0, 0.3, 1, 0.2, 0, 0.5, 0.7], hd: 8, prio: [0.7, 0.3, 0.8, 0.2, 1, 0.4], color: '#c79a2c',
        blurb: 'TODO one line that sells this class.', armor: 'scale+shield', skills: ['Insight', 'Medicine', 'Religion'],
        attacks: [{ n: 'TODO Blunt weapon', ab: 'STR', die: 6, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Bright bolt', ab: 'WIS', die: 6, cnt: 4, spell: true, hint: 'Magic, up to 120 feet' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Healer', kit: ['bandages', 'lantern'],
        strengths: ['TODO You patch people up and get them back on their feet.', 'TODO You can tell what people are really feeling.', 'TODO You know the old faiths and their stories.'] },
      'The Wild One': { v: [0.1, 0.1, 0.4, 0.5, 0, 1, -0.1, 0.3], hd: 8, prio: [0.1, 0.7, 0.8, 0.4, 1, 0.3], color: '#4d7a3a',
        blurb: 'TODO one line that sells this class.', armor: 'leather+shield', skills: ['Nature', 'Animal Handling', 'Perception'],
        attacks: [{ n: 'TODO Nature magic', ab: 'WIS', die: 8, cnt: 1, spell: true, hint: 'Magic, up to 30 feet' }, { n: 'TODO Curved blade', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Scout', kit: ['treats', 'rope'],
        strengths: ['TODO Animals trust you, and often do as you ask.', 'TODO You know plants, tracks and the weather.', 'TODO You notice what others walk past.'] },
      'The Guardian': { v: [1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.7, 0.1], hd: 10, prio: [1, 0.6, 0.9, 0.2, 0.4, 0.3], color: '#9a3b2a',
        blurb: 'TODO one line that sells this class.', armor: 'chain+shield', skills: ['Athletics', 'Intimidation', 'Perception'],
        attacks: [{ n: 'TODO Sword', ab: 'STR', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Crossbow', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 80 feet' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Protector', kit: ['rope', 'lantern'],
        strengths: ['TODO You stand in front and hold the line.', 'TODO Strong enough to climb it, lift it or break it.', 'TODO One hard look from you ends most arguments.'] },
      'The Acrobat': { v: [0.5, 0.6, 0.2, 0.6, 0, 0.2, 0.9, 0.2], hd: 8, prio: [0.4, 1, 0.7, 0.2, 0.9, 0.2], color: '#c2702a',
        blurb: 'TODO one line that sells this class.', armor: 'monk', skills: ['Acrobatics', 'Stealth', 'Insight'],
        attacks: [{ n: 'TODO Bare hands', ab: 'DEX', die: 4, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Staff', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Trickster', kit: ['rope', 'trinket'],
        strengths: ['TODO You never lose your balance.', 'TODO You move quietly when you choose to.', 'TODO You read a mood before a word is said.'] },
      'The Champion': { v: [0.8, 0, 0, 0.8, 0.4, 0, 0.8, 0.8], hd: 10, prio: [1, 0.2, 0.8, 0.1, 0.4, 0.9], color: '#b58a2e',
        blurb: 'TODO one line that sells this class.', armor: 'chain+shield', skills: ['Athletics', 'Persuasion', 'Insight'],
        attacks: [{ n: 'TODO Sword', ab: 'STR', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Thrown spear', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Protector', kit: ['bandages', 'horn'],
        strengths: ['TODO You protect your friends and are hard to knock down.', 'TODO People believe you, because you mean it.', 'TODO You can tell an honest face from a false one.'] },
      'The Scout': { v: [0.4, 0.6, 0.1, 0.1, 0, 1, 0, 0.2], hd: 10, prio: [0.5, 1, 0.7, 0.3, 0.9, 0.2], color: '#3f6b4f',
        blurb: 'TODO one line that sells this class.', armor: 'scale', skills: ['Survival', 'Stealth', 'Perception'],
        attacks: [{ n: 'TODO Bow', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 150 feet' }, { n: 'TODO Short blade', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Scout', kit: ['lantern', 'treats'],
        strengths: ['TODO You can follow any trail and never get lost.', 'TODO You see trouble long before it sees you.', 'TODO You rarely miss what you aim at.'] },
      'The Sneak': { v: [0, 1, 0.3, 0, 0.5, 0.1, -0.6, -0.3], hd: 8, prio: [0.1, 1, 0.6, 0.6, 0.5, 0.7], color: '#3f4f7a',
        blurb: 'TODO one line that sells this class.', armor: 'leather', skills: ['Stealth', 'Sleight of Hand', 'Deception', 'Perception'],
        attacks: [{ n: 'TODO Light blade', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Short bow', ab: 'DEX', die: 6, cnt: 1, hint: 'Up to 80 feet' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Trickster', kit: ['lockpicks', 'trinket'],
        strengths: ['TODO You get in and out without being seen.', 'TODO Locks and pockets open for your quick fingers.', 'TODO You can lie with a straight face.'] },
      'The Spark': { v: [0.1, 0.1, 0.3, 0, 0.9, 0.3, -0.8, 0], hd: 6, prio: [0.1, 0.7, 0.8, 0.3, 0.4, 1], color: '#a23a5a',
        blurb: 'TODO one line that sells this class.', armor: 'none', skills: ['Persuasion', 'Arcana', 'Intimidation'],
        attacks: [{ n: 'TODO Wild magic', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Magic, up to 120 feet' }, { n: 'TODO Knife', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Talker', kit: ['lantern', 'trinket'],
        strengths: ['TODO Magic comes naturally to you, and it hits hard.', 'TODO You can charm people round to your side.', 'TODO You are frightening when you want to be.'] },
      'The Trickster': { v: [0, 0.5, 0.7, 0, 0.6, 0, -0.2, -0.8], hd: 8, prio: [0.1, 0.7, 0.8, 0.5, 0.4, 1], color: '#5b3a7a',
        blurb: 'TODO one line that sells this class.', armor: 'leather', skills: ['Deception', 'Arcana', 'Intimidation'],
        attacks: [{ n: 'TODO Dark magic', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Magic, up to 120 feet' }, { n: 'TODO Knife', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Trickster', kit: ['lockpicks', 'horn'],
        strengths: ['TODO You can fool almost anyone.', 'TODO You know the kind of magic others leave alone.', 'TODO When you make a threat, people believe it.'] },
      'The Scholar': { v: [0, 0.2, 1, 0.1, 0, 0, 0.4, 0], hd: 6, prio: [0.1, 0.7, 0.7, 1, 0.5, 0.3], color: '#3a5f8a',
        blurb: 'TODO one line that sells this class.', armor: 'none', skills: ['Arcana', 'History', 'Investigation'],
        attacks: [{ n: 'TODO Studied magic', ab: 'INT', die: 10, cnt: 1, spell: true, hint: 'Magic, up to 120 feet' }, { n: 'TODO Knife', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'TODO what they wear and carry, for the portrait',
        role: 'Thinker', kit: ['notebook', 'lantern'],
        strengths: ['TODO You know more about magic than anyone here.', 'TODO You remember old tales when they matter.', 'TODO You find the clue everyone else missed.'] }
    },
//=== races ===
    /* TODO rename each people and write its perk and look. Add or remove as you like (at least two).
       bonus: added to ability scores    tough: true gives an extra hit point    lucky: true lets a rolled 1 be rolled again */
    races: {
      Townsfolk: { v: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.1, 0.1], bonus: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, speed: 30, perk: 'TODO Versatile: a little better at everything.', look: 'TODO what they look like, for the portrait' },
      'Mountain Folk': { v: [0.6, 0, 0.3, 0.5, 0, 0.1, 0.8, 0.3], bonus: { CON: 2, WIS: 1 }, speed: 25, tough: true, perk: 'TODO Tough: one extra hit point each level.', look: 'TODO what they look like, for the portrait' },
      'Forest Folk': { v: [0, 0.5, 0.6, 0.2, 0.3, 0.7, 0, 0.1], bonus: { DEX: 2, INT: 1 }, speed: 30, perk: 'TODO Keen senses: you notice more.', look: 'TODO what they look like, for the portrait' },
      'Little Folk': { v: [0, 0.6, 0, 0.4, 0.6, 0.3, -0.3, 0.7], bonus: { DEX: 2, CHA: 1 }, speed: 25, lucky: true, perk: 'TODO Lucky: roll a 1 on a d20 and you may roll again.', look: 'TODO what they look like, for the portrait' },
      Tinkers: { v: [0, 0.4, 0.9, 0, 0.5, 0.2, -0.5, 0.3], bonus: { INT: 2, CON: 1 }, speed: 25, perk: 'TODO Clever hands: you can fix almost anything.', look: 'TODO what they look like, for the portrait' },
      Outlanders: { v: [1, 0.1, 0, 0, 0, 0.7, -0.5, -0.1], bonus: { STR: 2, CON: 1 }, speed: 30, perk: 'TODO Relentless: once a day, refuse to fall when you drop to zero.', look: 'TODO what they look like, for the portrait' }
    },
//=== rules ===
  /* The rules this cartridge plays by.
       'open-5e'  what you have here: ability scores, hit points, armor, attack and damage dice, all hidden under
                  plain words until a player asks for the details. Each class brings its numbers (above).
       'light'    one twenty-sided die and a bonus, and far less to write: a class says only what it is strong at
                  and fair at. To start again that way:  npm run new-cartridge <id>
     Delete the line and the cartridge plays by 'open-5e'. */
  rules: 'open-5e',
