/* First Roll: the base pack. Every scenario is laid over this one (extends: 'base'), so a new
   pack only writes what differs: its cast, its questions, and whatever words and pictures it wants
   to make its own. Nothing here belongs to a particular story: plain words, the engine's default
   look (src/styles.css) and placeholder art from src/img/.

   A pack must bring its own: meta, quiz.questions, quiz.quick, cast (classes, races, names,
   samples) and roster (demo, premades). `npm run validate` says what is missing.

   Every piece of copy the screens use must have a key in `text` below; validation checks that. */
var FR = (typeof FR !== 'undefined') ? FR : {};
if (typeof module !== 'undefined' && typeof require === 'function' && !FR.scenario) { FR = require('./registry.js'); }

FR.scenario({
  schema: 1,
  id: 'base',
  version: '1.0.0',

  tokens: {
    fonts: {
      /* the typefaces of the default look. The engine always loads this sheet, whichever pack is open:
         the numbers on the dice are drawn in Alegreya (src/dice.js). A pack adds its own sheet beside it. */
      stylesheet: 'https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;0,800;1,400&family=Alegreya+Sans:wght@400;500;700&family=Alegreya+Sans+SC:wght@500;700&family=Baskervville+SC:wght@400;600;700&display=swap',
      /* asked for early, so the first roll is not drawn in a stand-in face */
      warm: ["800 40px 'Alegreya'"]
    }
  },

  /* placeholders: a pack points these at its own files as it gets them */
  art: {
    wordmark: 'img/wordmark.webp', divider: 'img/divider.webp', thumb: 'img/keyart.webp', floor: 'img/table.webp',
    crest: 'img/seal.webp',            // one badge for every class, until the pack has 'img/crest_{slug}.webp'
    sample: 'img/portrait.svg'         // one stand-in portrait for every class
  },

  quiz: {
    count: { text: '{i} of {n}', numerals: 'plain' },
    traits: { might: 'Might', guile: 'Guile', lore: 'Lore', faith: 'Faith', charm: 'Charm', wild: 'Wild' },
    axes: [['Chaos', 'Order'], ['Shadow', 'Light']],
    /* the line under the hero's name. Each side is the average push per answer; the first rule it satisfies speaks. */
    alignment: {
      order: [{ over: 0.17, say: 'Lawful' }, { under: -0.17, say: 'Chaotic' }, { say: 'Neutral' }],
      light: [{ over: 0.15, say: 'Good' }, { say: 'Neutral' }],
      parts: ['order', 'light'], join: ' ',
      rename: { 'Neutral Neutral': 'True Neutral' },
      detailOnly: true      // these are rule-book words: shown only with "Show rules details" on
    }
  },

  cast: { armorNotes: null },

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
      'a patched travelling cloak', 'rings on every finger, none of them matching', 'a crooked grin and one chipped tooth',
      'ink-stained fingers', 'a bright scarf knotted at the throat', 'a necklace of mismatched keys',
      'boots far too fine for the rest of the outfit', 'a feather tucked behind one ear', 'a hat that has seen better decades'
    ]
  },

  /* The "I want to..." menu: plain words mapped to the right skill. */
  actions: [
    { id: 'look', label: 'Look around', hint: 'Notice what is nearby', skill: 'Perception' },
    { id: 'search', label: 'Search', hint: 'Dig for clues', skill: 'Investigation' },
    { id: 'sneak', label: 'Sneak', hint: 'Move without being seen', skill: 'Stealth' },
    { id: 'lock', label: 'Pick a lock or pocket', hint: 'Nimble fingers', skill: 'Sleight of Hand' },
    { id: 'persuade', label: 'Persuade', hint: 'Talk someone round', skill: 'Persuasion' },
    { id: 'bluff', label: 'Bluff', hint: 'Lie with a straight face', skill: 'Deception' },
    { id: 'scare', label: 'Intimidate', hint: 'Make them think twice', skill: 'Intimidation' },
    { id: 'read', label: 'Read someone', hint: 'Are they hiding something?', skill: 'Insight' },
    { id: 'climb', label: 'Climb, jump or swim', hint: 'Scale it, leap it, cross it', skill: 'Athletics' },
    { id: 'tumble', label: 'Tumble or balance', hint: 'Dodge, roll, keep your feet', skill: 'Acrobatics' },
    { id: 'recall', label: 'Recall what you know', hint: 'Do I know anything about this?', skill: 'History' },
    { id: 'magic', label: 'Sense magic', hint: 'What is that glowing thing?', skill: 'Arcana' },
    { id: 'track', label: 'Track or forage', hint: 'Follow a trail, find food', skill: 'Survival' },
    { id: 'heal', label: 'Patch someone up', hint: 'First aid, fast', skill: 'Medicine' },
    { id: 'beast', label: 'Calm an animal', hint: 'Easy now, easy', skill: 'Animal Handling' },
    { id: 'show', label: 'Perform', hint: 'Sing, juggle, hold the room', skill: 'Performance' }
  ],
  extras: [],
  story: null,
  music: null,
  particles: null,

  /* the 3D tray: number ink, the fight dice, the rim and the felt under the floor picture */
  dice: { ink: '#f3d68a', inkMetal: 0.7, fleck: '#f6dd9a', fight: '#1b1820', fightInk: '#ff8a5c',
    rim: { color: '#b09a8c', wood: true, metal: 0.05, rough: 0.6 }, floorTint: '#d8d0cc', floorBase: '#4a1a14', exposure: 0.92 },

  /* which of the engine's sounds mark each moment (see FR.SFX in src/registry.js); a list plays them together */
  sfx: { tap: 'tick', cheer: 'chime', fumble: 'lowchime', arrive: 'chime' },

  /* shown on a natural 20 and a natural 1 */
  fx: {
    crit: { title: 'Natural 20!', lines: ['Nothing could have gone better.', 'The whole table saw that.', 'Exactly as planned. Say so out loud.', 'That one gets told again later.',
      'The dice are on your side tonight.', 'Take a bow. You earned it.'] },
    fumble: { title: 'Natural 1', lines: ['Well. That happened.', 'The dice have a sense of humor.', 'Everyone saw. Nobody will forget.', 'It can only go up from here.',
      'Blame the dice. Everyone does.', 'A bold choice, badly rewarded.'] }
  },

  /* Words the app writes by itself, with no AI: the look a player gets from "Surprise me", and the
     origin on the sheet. See "wording templates" in src/registry.js for how they are filled. */
  prose: {
    describe: {
      text: '{age}, {build}{hair}. Wears {flourishA}, and {flourishB}.',
      parts: {
        age: { from: 'look.age', map: { Young: 'Barely grown', 'In their prime': 'In the prime of life', Weathered: 'Weathered by hard roads', Elder: 'Old enough to have seen it all twice' }, or: 'Hard to place in years' },
        build: { from: 'look.build', lower: true, wrap: '{value} of frame', or: 'unremarkable of frame' },
        hair: { from: 'look.hair', map: { Cropped: 'hair cropped close', 'Long and loose': 'hair worn long and loose', Braided: 'hair bound in tight braids', 'Wild curls': 'a riot of untamed curls', Shaved: 'a clean-shaved head', Silver: 'hair gone early to silver' }, wrap: ', {value}' }
      }
    },
    origin: {
      text: '{name} was nobody in particular until the day the dice came out. These days {first} is a {race} {cls} who has learned that {lesson}, and the story is only getting started.',
      parts: { lesson: { from: 'top', map: { might: 'most problems move if you push hard enough', guile: 'the quiet ones see everything', lore: 'every answer hides a better question',
        faith: 'a promise kept is worth more than gold', charm: 'a good story opens more doors than a key', wild: 'the road is kinder than any roof' }, or: 'luck favors whoever shows up' } }
    }
  },

  /* Optional: the words that steer OpenAI when a table has it switched on. The app sends finished
     prompts; the server only forwards them. A pack is complete without any of this being used. */
  ai: {
    style: 'Character portrait in the tradition of a classic fantasy tabletop roleplaying game player\'s handbook illustration: realistic painterly digital oil painting with visible confident brushwork, dramatic warm key light with a cool rim light, rich earthy palette with deep jewel accents, believable anatomy. Waist-up, three-quarter view, the figure centered with space above the head. Behind the figure a loose watercolor and ink wash in muted tones that dissolves into plain light warm parchment toward every edge, so all four edges of the image are bare parchment. No text, no lettering, no border, no frame, no logo, no watermark.',
    describe: 'You invent the look of a roleplaying character for a portrait painter. Reply with one or two sentences, 40 words at most, of concrete visual detail only: clothing, colors, one signature object, small quirks. The character\'s fixed features are listed for you: agree with every one of them and never state a different age, build, hair, mark or expression. No name, no backstory, no game terms, no quotation marks.',
    origin: 'You write the opening of a roleplaying character\'s backstory. Exactly two sentences, 45 words at most, never use "you", use the character\'s name. Warm, a little wry, no cliches about destiny.',
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

  /* Every word on the screens, in plain words: nobody should need to know the rules to read them.
     The app fills in the blanks in braces ({name}, {code}, {n} and so on). A pack overrides any line
     it wants to say in its own voice. Jargon a first-timer could not decode (ability abbreviations,
     dice shorthand, bonuses with no reason given) only appears when "Show rules details" is on. */
  text: {
    /* ---- the title: three ways in, or straight back to the hero you have ---- */
    tagline: 'Answer a few questions. Meet your hero. Let the dice decide the rest.',
    /* the invitation above the ways in, in the pack's own voice */
    begin: 'Begin',
    quickStart: 'Quick start', fullQuiz: 'The full quiz', premade: 'Pick a ready-made hero',
    continueAs: 'Continue as {name}', newHero: 'Start a new hero',
    /* the one place "DM" is spelled out: the first time a player meets the word */
    dm: 'I am the DM (I tell the story)', dmBack: 'Back to your table {code}',
    joinTable: 'Join a table', invited: 'You are invited to table {code}', atTable: 'You are at table {code}', tableChip: 'Table {code}',
    waysTitle: 'How do you want to start?', waysReplace: 'Your new hero takes {name}’s place as soon as they are ready.',
    quickSub: 'Five questions. About a minute.', fullSub: 'Every question, for the closest match.', premadeSub: 'No questions. Tap one and play.', keepHero: 'Keep {name}',
    heroesTitle: 'Pick your hero',

    /* ---- the story so far, the questions, the reveal ---- */
    storyNext: 'Next', storySkip: 'Skip the story', storyGo: 'Begin', storyBack: 'Back to the game',
    omen: 'The table has taken your measure.', howRead: 'How the table read you', closestClasses: 'Your kind of hero', closestRaces: 'Your people',
    matchNote: 'The numbers show how closely each one fits your answers. Tap another to switch.',
    asA: 'As a ', goesBy: 'Goes by {name}',
    looksGood: 'Looks good. Let’s play', makeMine: 'Change picture or name', paintMine: 'Paint my portrait',
    retake: 'Answer again', retakeTitle: 'Answer again?', retakeText: 'Your new answers make a new hero, and this one will be gone.', keepThis: 'Keep this hero',

    /* ---- the picture ---- */
    easelEmpty: 'No portrait yet', pickHint: 'Pick the picture that feels most like your hero.', noPicture: 'No picture', pictureOf: 'A {race} {cls}',
    keep: 'Keep this one', keepNone: 'Go without a picture', skip: 'Skip the portrait for now',
    /* only where AI pictures are on */
    paint: 'Paint my portrait', paintAgain: 'Paint another', painting: 'The painter is working', ownWords: 'In your own words',
    descHint: 'A patched coat, a crooked grin, one thing they never put down', surprise: 'Surprise me', thinking: 'Thinking',
    hintLive: 'Pick a few features, then let the painter work.', stale: 'Your choices changed. Paint another to see them.',
    painted: 'Painted just now by OpenAI in {s} seconds.', slow: 'The painter took too long. Try again.', failed: 'The painter could not finish: {e} Change the description or try again.',
    work: ['Mixing the colors', 'Sketching the outline', 'Laying in the shadows', 'Adding the light', 'Signing the corner'],

    /* ---- the sheet ---- */
    sheetTitle: 'Your character', nameLabel: 'Name', rollName: 'Roll a name', changePicture: 'Change the picture',
    originHead: 'Origin', originWait: 'The storyteller clears their throat…', toTable: 'Take your seat at the table',
    health: 'Health', healthHint: 'how much harm you can take', armor: 'Armor', armorHint: 'an attack has to roll this high to hit you',
    goodAtHead: 'Good at', fightsWith: 'Fights with', trait: 'Trait',
    /* with rules details on */
    skills: 'Skills', attacks: 'Attacks',

    /* ---- at the table ---- */
    tabs: ['I want to…', 'Checks', 'Fight'], tabOther: 'Other',
    statHealth: 'Health', statArmor: 'Armor', statTurn: 'Turn roll', goodAt: 'Good at this',
    nudge: 'Tap what your hero wants to do, then roll the dice. The DM, the person telling the story, says what happens next.',
    initLabel: 'Roll initiative', initPlain: 'Who goes first?', initHint: 'Roll when a fight starts. Highest goes first.', initDone: 'You rolled {n}. Tell the DM.',
    shove: 'Shove or grab', shoveHint: 'get physical, no weapon', hide: 'Hide', hideHint: 'duck out of sight',
    noRollB: 'No roll needed. ', noRoll: 'Dash to move twice as far, Dodge to be harder to hit, Disengage to back away safely, or Help a friend. Just say it.',
    free: 'Roll other dice', freeNote: 'Whatever dice the DM asks for', damage: 'damage',
    fromDM: 'From your DM', fromDMNew: '{n} new from your DM',
    menu: 'Menu', home: 'Home', storySoFar: 'The story so far', newCharacter: 'New character', settings: 'Settings', leaveTable: 'Leave table {code}', close: 'Close',
    leaveTitle: 'Leave table {code}?', leaveText: 'Your hero stays on this phone. To come back, join with the same name and code.', leaveYes: 'Leave the table', stay: 'Stay',
    checkHints: { STR: 'Push, lift, break', DEX: 'Quick hands, quick feet', CON: 'Endure, hold your breath', INT: 'Recall, reason, puzzle it out', WIS: 'Notice, sense, trust your gut', CHA: 'Charm, command, perform' },

    /* ---- the dice ---- */
    roll: 'Roll', rollAgain: 'Roll again', rolling: 'Rolling…',
    howRoll: 'Press Roll, or flick the tray.', howRollFlat: 'Press Roll.', howShake: 'Or shake your phone.',
    shakeOn: 'Shake to roll: on', shakeOff: 'Shake to roll: off', shakeDenied: 'This phone did not allow it. Check that motion is allowed for this site.',
    /* what is about to be rolled, in words: "One 20-sided die", "Three 6-sided dice" */
    numberWords: 'One Two Three Four Five Six Seven Eight', diceOne: 'One {s}-sided die', diceMany: '{n} {s}-sided dice',
    willBest: 'Two 20-sided dice, keeping the higher', willWorst: 'Two 20-sided dice, keeping the lower',
    advOne: 'Roll one', advBest: 'Roll two, keep the best', advWorst: 'Roll two, keep the worst', advLabel: 'How many dice',
    advTerm: 'Advantage', disTerm: 'Disadvantage', normalTerm: 'Normal',
    /* the result as a sentence: "You rolled 19, plus 4 for being sneaky: 23." */
    saidRolled: 'You rolled {dice}', saidKeep: 'Rolled {a} and {b}, keeping the {which}: {kept}', higher: 'higher', lower: 'lower', and: 'and',
    plus: 'plus {n}', plusFor: 'plus {n} for {why}', minus: 'minus {n}, as this is not your strong suit', bestOf: 'best of', worstOf: 'worst of',
    /* why a roll gets its bonus: one for each thing a hero can be good at */
    whyAthletics: 'being strong', whyAcrobatics: 'being nimble', whySleight: 'quick fingers', whyStealth: 'being sneaky',
    whyArcana: 'knowing magic', whyHistory: 'knowing the old tales', whyInvestigation: 'a sharp mind', whyNature: 'knowing the wild', whyReligion: 'knowing the old faiths',
    whyAnimal: 'a way with animals', whyInsight: 'reading people', whyMedicine: 'steady hands', whyPerception: 'sharp eyes', whySurvival: 'knowing the outdoors',
    whyDeception: 'a straight face', whyIntimidation: 'being scary', whyPerformance: 'loving an audience', whyPersuasion: 'a way with words',
    whySTR: 'being strong', whyDEX: 'being quick', whyCON: 'being tough', whyINT: 'being clever', whyWIS: 'good sense', whyCHA: 'being charming',
    whyInit: 'being quick off the mark', whyAttack: 'your skill with it', whySpell: 'your knack for it', whyDamage: 'hitting hard',
    tell: 'Tell the DM.', tellDamage: 'Tell the DM the damage.', hitsSay: 'Tell the DM. If they say it hits, roll damage.', hits: 'Roll damage',
    nat20: 'A natural 20: the best roll there is!', nat20Attack: 'A natural 20 always hits. Roll damage with twice the dice.', nat1: 'A natural 1: the worst roll there is.', nat1Attack: 'A natural 1 always misses.',
    lucky: 'Lucky! Roll that 1 again', crit: 'Critical hit, double dice', critPlain: 'A perfect hit: twice the dice',
    railHint: 'Pick the dice the DM asks for, by how many sides they have.',

    /* ---- settings ---- */
    music: 'Music', musicNote: 'Music for the title, the game and the fights', musicNone: 'This scenario has no music yet',
    musicTable: 'Starts off at a table, so the phones do not play over each other',
    sfx: 'Sound effects', sfxNote: 'Dice, bells and button taps',
    details: 'Show rules details', detailsNote: 'Bonuses, dice names and the full sheet, for players who know the rules',
    aiHead: 'AI extras', aiOn: 'AI pictures and writing are on.', aiDirect: 'AI pictures and writing are on, with your own OpenAI key.',
    aiTable: 'AI pictures and writing switch on when you join a DM’s table.', aiOff: 'AI pictures and writing are off. The game is complete without them.',
    connect: 'Connect OpenAI', connectChange: 'Change the OpenAI key', done: 'Done', soundOn: 'Settings. Sound is on', soundOff: 'Settings. Sound is off',

    /* ---- the shared table ---- */
    tableKicker: 'Your table', tableJoinTitle: 'Join your DM’s table', dmIs: 'The DM is the person telling the story. Ask them for the table’s four-letter code.',
    yourName: 'Your name', nameHint: 'What should the table call you?', tableCode: 'Table code', tableCodeOther: 'A different table code',
    joinThis: 'Join this table', switchThis: 'Switch to this table', leaveThis: 'Leave this table',
    seatedAs: 'You are seated as {name}. Use the same name and code to come back later, or on another phone.',
    needName: 'Tell the table your name first.', needCode: 'A table code is four letters. Ask your DM to read it out again.', alreadyThere: 'You are already at that table.',
    joinFailed: 'Could not join that table. Check the code and try again.',
    clashTitle: 'Is that you?', clashYes: 'Yes, move me here', clashNo: 'Use another name',
    endTitle: 'Table {code}', movedYes: 'That’s me, take it back', movedNo: 'Leave it', endKeep: 'Your hero is still on this phone, so you can keep playing on your own.',
    endGone: 'That table is no longer there. Ask your DM for a new code.', ok: 'OK',
    welcomeKicker: 'Welcome back', welcomeTitle: 'Welcome back, {name}!', welcomeText: '{hero}, your {race} {cls}, is still at table {code}.', welcomeNew: 'Make a new character',
    handoutPic: 'A picture from your DM', handoutNote: 'A note from your DM', older: 'Older', newer: 'Newer', gotIt: 'Got it', countOf: '{i} of {n}',
    tablePlays: 'This table is playing {scenario}. Let’s make you a hero for it.', reconnecting: 'Reconnecting to the table…'
  }
});

if (typeof module !== 'undefined') { module.exports = FR; }
