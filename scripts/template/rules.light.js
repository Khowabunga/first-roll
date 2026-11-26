/* The parts of a new cartridge that depend on its rules: these are for rules: 'light'.
   scripts/lib/packs.js (template) puts each part where scripts/template/cartridge.js has a marker of the
   same name. This file is pieces of a cartridge, not a cartridge: it is never run. */
//=== quick ===
    quick: [2, 5, 8, 9, 11]
//=== notes ===
    /* TODO rename each class, and say in plain words what it is. This cartridge plays by the light rules, so that
       is all there is to write: no numbers anywhere.
       role: which of the roles below the class plays. It also helps the quiz tell classes apart.
       blurb: one line that sells the class.
       strong: the skills the class is strong at (a clear bonus on the die): two or three reads best, four at most.
       fair:  the skills it is fair at (a small bonus): up to six. Everything else is a plain roll.
             The skills are Athletics, Acrobatics, Sleight of Hand, Stealth, Arcana, History, Investigation, Nature,
             Religion, Animal Handling, Insight, Medicine, Perception, Survival, Deception, Intimidation,
             Performance and Persuasion. The quiz matches a player to a class from these two lists and the role,
             so give every class a mix no other class has; `npm run validate` says if two are too alike.
       strengths: three plain sentences about what the class is good at, 80 characters each at most and with no
             rules words. Players see them in the lobby and on the sheet, the DM beside each player; the first is
             the one shown when there is room for one. Delete the line and the engine writes them from the
             class's strong skills.
       kit:  the ids of the items (see `kit`, further down) a hero of this class starts with: four at most.
       Two more you may add to a class, both optional:
       color: '#8c2f1b'   the colour its dice are cast in (left out, the engine picks one that suits it)
       gear: '...'        what they wear and carry, for the painter when AI portraits are switched on */
//=== classes ===
    classes: {
      'The Brawler': { role: 'Protector', blurb: 'TODO one line that sells this class.',
        strong: ['Athletics', 'Survival'], fair: ['Perception', 'Intimidation'], kit: ['rope', 'trinket'],
        strengths: ['TODO You are the strongest one here.', 'TODO You can take a knock that would flatten most.', 'TODO You know the wild and its dangers.'] },
      'The Performer': { role: 'Talker', blurb: 'TODO one line that sells this class.',
        strong: ['Performance', 'Persuasion'], fair: ['Deception', 'History'], kit: ['horn', 'treats'],
        strengths: ['TODO You can talk your way out of almost anything.', 'TODO Give you an audience and it is yours.', 'TODO You can lie with a straight face.'] },
      'The Healer': { role: 'Healer', blurb: 'TODO one line that sells this class.',
        strong: ['Medicine', 'Religion'], fair: ['Insight', 'Persuasion'], kit: ['bandages', 'lantern'],
        strengths: ['TODO You patch people up and get them back on their feet.', 'TODO You can tell what people are really feeling.', 'TODO You know the old faiths and their stories.'] },
      'The Wild One': { role: 'Scout', blurb: 'TODO one line that sells this class.',
        strong: ['Nature', 'Animal Handling'], fair: ['Perception', 'Medicine'], kit: ['treats', 'rope'],
        strengths: ['TODO Animals trust you, and often do as you ask.', 'TODO You know plants, tracks and the weather.', 'TODO You notice what others walk past.'] },
      'The Guardian': { role: 'Protector', blurb: 'TODO one line that sells this class.',
        strong: ['Athletics', 'Intimidation'], fair: ['Perception', 'History'], kit: ['rope', 'lantern'],
        strengths: ['TODO You stand in front and hold the line.', 'TODO Strong enough to climb it, lift it or break it.', 'TODO One hard look from you ends most arguments.'] },
      'The Acrobat': { role: 'Trickster', blurb: 'TODO one line that sells this class.',
        strong: ['Acrobatics', 'Stealth'], fair: ['Insight', 'Athletics'], kit: ['rope', 'trinket'],
        strengths: ['TODO You never lose your balance.', 'TODO You move quietly when you choose to.', 'TODO You read a mood before a word is said.'] },
      'The Champion': { role: 'Protector', blurb: 'TODO one line that sells this class.',
        strong: ['Athletics', 'Persuasion'], fair: ['Insight', 'Religion'], kit: ['bandages', 'horn'],
        strengths: ['TODO You protect your friends and are hard to knock down.', 'TODO People believe you, because you mean it.', 'TODO You can tell an honest face from a false one.'] },
      'The Scout': { role: 'Scout', blurb: 'TODO one line that sells this class.',
        strong: ['Survival', 'Perception'], fair: ['Stealth', 'Nature'], kit: ['lantern', 'treats'],
        strengths: ['TODO You can follow any trail and never get lost.', 'TODO You see trouble long before it sees you.', 'TODO You rarely miss what you aim at.'] },
      'The Sneak': { role: 'Trickster', blurb: 'TODO one line that sells this class.',
        strong: ['Stealth', 'Sleight of Hand'], fair: ['Deception', 'Perception'], kit: ['lockpicks', 'trinket'],
        strengths: ['TODO You get in and out without being seen.', 'TODO Locks and pockets open for your quick fingers.', 'TODO You can lie with a straight face.'] },
      'The Spark': { role: 'Talker', blurb: 'TODO one line that sells this class.',
        strong: ['Arcana', 'Persuasion'], fair: ['Intimidation', 'Nature'], kit: ['lantern', 'trinket'],
        strengths: ['TODO Magic comes naturally to you, and it hits hard.', 'TODO You can charm people round to your side.', 'TODO You are frightening when you want to be.'] },
      'The Trickster': { role: 'Trickster', blurb: 'TODO one line that sells this class.',
        strong: ['Deception', 'Arcana'], fair: ['Intimidation', 'Sleight of Hand'], kit: ['lockpicks', 'horn'],
        strengths: ['TODO You can fool almost anyone.', 'TODO You know the kind of magic others leave alone.', 'TODO When you make a threat, people believe it.'] },
      'The Scholar': { role: 'Thinker', blurb: 'TODO one line that sells this class.',
        strong: ['Arcana', 'History'], fair: ['Investigation', 'Nature'], kit: ['notebook', 'lantern'],
        strengths: ['TODO You know more about magic than anyone here.', 'TODO You remember old tales when they matter.', 'TODO You find the clue everyone else missed.'] }
    },
//=== races ===
    /* TODO rename each people and write its line. Add or remove as you like (at least two). Under the light rules a
       people is flavour: it changes no roll, and it has no numbers.
       perk: one line about them, shown when a hero is revealed and on the sheet. Optional.
       You may also add  look: '...'  (what they look like, for the painter when AI portraits are switched on). */
    races: {
      Townsfolk: { perk: 'TODO Adaptable: they have turned a hand to most things.' },
      'Mountain Folk': { perk: 'TODO Tough: they shrug off cold, rain and bad news.' },
      'Forest Folk': { perk: 'TODO Keen senses: little in the woods gets past them.' },
      'Little Folk': { perk: 'TODO Lucky: things have a way of working out for them.' },
      Tinkers: { perk: 'TODO Clever hands: they can fix almost anything.' },
      Outlanders: { perk: 'TODO Relentless: they do not know when to give up.' }
    },
//=== rules ===
  /* The rules this cartridge plays by.
       'light'    what you have here: every roll is one twenty-sided die plus a bonus (+5 for what a hero is strong
                  at, +2 for what they are fair at, nothing otherwise) against a number only the DM sees. Health is
                  three states, and there are no hit points, armor numbers or damage dice.
       'open-5e'  the fuller rules: ability scores, hit points, armor, attack and damage dice, hidden under plain
                  words. Each class then needs its numbers. To start again that way:
                  npm run new-cartridge <id> --rules open-5e */
  rules: 'light',

  /* Ways to fight (the light rules only). Each is a row on the fight tab, and a roll like any other: `skill` is
     the skill it comes down to, or a list of skills (the hero rolls whichever they are best at), so a hero who
     is strong at it is strong at fighting that way. Whether it lands is the DM's call; a hit moves a foe one
     step closer to out of the fight. `id` is a short word of its own, `label` 40 characters at most and `hint` 80;
     eight ways at most. These six are the engine's own: reword them for your story, or delete the whole block
     and they are used as they are.
     (`text` may sit beside `fight` to reword the few lines only these rules say: see `light` in src/base.js.) */
  light: {
    fight: [
      { id: 'strike', label: 'Hit it hard', hint: 'Fists, a blade, anything heavy', skill: 'Athletics' },
      { id: 'dart', label: 'Strike fast', hint: 'Quick and nimble, in and out', skill: ['Acrobatics', 'Sleight of Hand'] },
      { id: 'aim', label: 'Aim and let fly', hint: 'Throw it, shoot it, sling it', skill: ['Perception', 'Survival'] },
      { id: 'ambush', label: 'Strike from hiding', hint: 'They never see it coming', skill: 'Stealth' },
      { id: 'magic', label: 'Use magic', hint: 'A spell, a charm, a spark', skill: ['Arcana', 'Nature', 'Religion'] },
      { id: 'rattle', label: 'Trick or scare them', hint: 'A feint, a taunt, a terrible glare', skill: ['Deception', 'Intimidation', 'Performance'] }
    ]
  },
