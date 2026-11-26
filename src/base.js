/* First Roll: the base pack. Every scenario is laid over this one (extends: 'base'), so a new
   pack only writes what differs: its cast, its questions, and whatever words and pictures it wants
   to make its own. Nothing here belongs to a particular story: plain words, the engine's default
   look (src/styles.css) and placeholder art from src/img/.

   A pack must bring its own: meta, quiz.questions, quiz.quick, cast (classes, races, names,
   samples) and roster (demo, premades). `npm run validate` says what is missing.
   What every cartridge is given from here even though `meta` is otherwise its own: the label
   (meta.label) and the rules credit (meta.credits).

   Every piece of copy the screens use must have a key in `text` below; validation checks that. */
var FR = (typeof FR !== 'undefined') ? FR : {};
if (typeof module !== 'undefined' && typeof require === 'function' && !FR.cartridge) { FR = require('./registry.js'); }

FR.cartridge({
  schema: 1,
  id: 'base',
  version: '1.0.0',

  /* A cartridge's `meta` is its own and is never inherited, with two exceptions that every cartridge
     gets from here:
       label    what a cartridge card says when the cartridge says nothing itself. A cartridge's own
                meta.label is laid over this one key by key (FR.theme.label).
       credits  credits of type 'rules' are carried by every cartridge (FR.theme.credits, and the manifest),
                because every cartridge plays by the engine's rules. */
  meta: {
    label: {
      length: 'One sitting',                 // how long a game takes
      players: 'Up to 8 players',            // how many can sit at one table
      tone: 'Adventure',                     // the mood, in a word or two
      dm: 'First-time DMs welcome',          // how much the DM needs to know
      rating: 'everyone',                    // 'everyone', 'teen' or 'mature'
      flags: []                              // anything a table may want to know first, e.g. 'Spiders'
    },
    /* The rules under every cartridge derive from the System Reference Document 5.2. This is the attribution
       its licence (CC BY 4.0) asks for, word for word; keep it. It is shown in Settings and listed in the README. */
    credits: [{ type: 'rules', text: 'This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.' }]
  },

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

  cast: {
    armorNotes: null,
    /* Roles: six plain jobs a hero can do at the table, for the role cards and for "the party has no Protector
       yet". `blurb` is the one line that sells the role and `does` is what you actually do with it. A cartridge's
       classes each say which role is theirs (role: 'Protector'). A class that does not is filed under the role
       whose `trait` is the class's strongest (might, guile, lore, faith, charm or wild), so every class of every
       cartridge has a role without anybody writing one. A cartridge that writes `roles` replaces all six. */
    roles: {
      Protector: { trait: 'might', blurb: 'You stand in front, so your friends do not have to.', does: 'Push, lift, block and hold the line. When trouble arrives, it meets you first.' },
      Trickster: { trait: 'guile', blurb: 'You get in where you are not wanted, and out again unnoticed.', does: 'Sneak, pick a lock or a pocket, and pull a fast one when plain dealing will not do.' },
      Thinker: { trait: 'lore', blurb: 'You know things, and you work out the rest.', does: 'Solve the puzzle, read the strange writing, and remember the old story that explains it all.' },
      Healer: { trait: 'faith', blurb: 'You keep everyone on their feet and in good heart.', does: 'Patch people up, calm them down, and notice who is not as fine as they say.' },
      Talker: { trait: 'charm', blurb: 'You do the talking, and people tend to listen.', does: 'Persuade, bargain, perform and make friends. Words get you where muscle cannot.' },
      Scout: { trait: 'wild', blurb: 'You go ahead, see trouble coming and find the way through.', does: 'Follow a trail, spot what is hidden, and get on with animals. You are happiest out of doors.' }
    },
    /* What a class is good at, in plain sentences, when it does not say so itself: one sentence for each
       skill. A class with no `strengths` of its own gets the sentences of its first three skills
       (FR.theme.classes[Name].strengths). A cartridge may reword any of them. */
    skillStrengths: {
      Athletics: 'You are strong: climbing, lifting and shoving come easily.',
      Acrobatics: 'You are nimble, and you keep your feet where others fall.',
      'Sleight of Hand': 'Your fingers are quick: locks, knots and pockets give way.',
      Stealth: 'You move quietly and are hard to spot.',
      Arcana: 'You know magic when you see it, and how it tends to behave.',
      History: 'You remember the old tales, and they are often useful.',
      Investigation: 'You find the clue that everyone else missed.',
      Nature: 'You know plants, animals and the weather.',
      Religion: 'You know the old faiths, their rites and their stories.',
      'Animal Handling': 'Animals trust you, and will often do as you ask.',
      Insight: 'You can tell what people are feeling, and when they are lying.',
      Medicine: 'You can patch people up and get them back on their feet.',
      Perception: 'You notice things: a sound, a movement, something out of place.',
      Survival: 'You can follow a trail and never lose your way.',
      Deception: 'You can lie with a perfectly straight face.',
      Intimidation: 'One hard look from you makes people think twice.',
      Performance: 'Give you an audience and you will hold it.',
      Persuasion: 'You can talk your way out of almost anything.'
    }
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

  /* "Or say what you do": when a player types what their hero does, FR.checkFor(text) suggests the skill it
     most likely comes down to. `words` maps a word, or a short phrase, to a skill; write them in lower case
     and in their plain form ("climb" also answers for climbs, climbed and climbing). A cartridge adds its
     own (words: { skate: 'Acrobatics' }), moves one to another skill, or drops one with null.
     `why` is the plain reason shown with the suggestion; {why} becomes the cartridge's own words for that
     skill (text.whyAthletics and the rest, below). */
  intent: {
    why: 'That comes down to {why}.',
    words: {
      /* muscle */
      climb: 'Athletics', jump: 'Athletics', leap: 'Athletics', swim: 'Athletics', push: 'Athletics', pull: 'Athletics', lift: 'Athletics', shove: 'Athletics',
      grab: 'Athletics', wrestle: 'Athletics', smash: 'Athletics', force: 'Athletics', haul: 'Athletics', drag: 'Athletics', carry: 'Athletics', throw: 'Athletics',
      run: 'Athletics', sprint: 'Athletics', kick: 'Athletics', tackle: 'Athletics', heave: 'Athletics', 'break down': 'Athletics', 'hold on': 'Athletics',
      /* balance and quick feet */
      swing: 'Acrobatics', flip: 'Acrobatics', tumble: 'Acrobatics', balance: 'Acrobatics', dodge: 'Acrobatics', roll: 'Acrobatics', vault: 'Acrobatics',
      slide: 'Acrobatics', somersault: 'Acrobatics', cartwheel: 'Acrobatics', tightrope: 'Acrobatics', dive: 'Acrobatics', duck: 'Acrobatics', squeeze: 'Acrobatics',
      /* quick fingers */
      lock: 'Sleight of Hand', unlock: 'Sleight of Hand', lockpick: 'Sleight of Hand', pickpocket: 'Sleight of Hand', steal: 'Sleight of Hand', swipe: 'Sleight of Hand',
      pocket: 'Sleight of Hand', palm: 'Sleight of Hand', untie: 'Sleight of Hand', disarm: 'Sleight of Hand', 'pick the lock': 'Sleight of Hand',
      /* not being noticed */
      sneak: 'Stealth', hide: 'Stealth', creep: 'Stealth', tiptoe: 'Stealth', quietly: 'Stealth', silently: 'Stealth', unseen: 'Stealth', skulk: 'Stealth',
      lurk: 'Stealth', 'slip past': 'Stealth', 'stay low': 'Stealth', 'without being seen': 'Stealth',
      /* magic */
      magic: 'Arcana', magical: 'Arcana', spell: 'Arcana', rune: 'Arcana', enchant: 'Arcana', enchanted: 'Arcana', arcane: 'Arcana', glow: 'Arcana', curse: 'Arcana',
      potion: 'Arcana', wand: 'Arcana', ritual: 'Arcana',
      /* what you have heard of */
      remember: 'History', recall: 'History', history: 'History', legend: 'History', lore: 'History', ancient: 'History', recognise: 'History', recognize: 'History',
      'heard of': 'History', 'old tale': 'History', 'know about': 'History',
      /* working it out */
      search: 'Investigation', investigate: 'Investigation', examine: 'Investigation', inspect: 'Investigation', study: 'Investigation', clue: 'Investigation',
      rummage: 'Investigation', deduce: 'Investigation', puzzle: 'Investigation', 'look for': 'Investigation', 'look through': 'Investigation', 'figure out': 'Investigation',
      'work out': 'Investigation',
      /* the living world */
      plant: 'Nature', herb: 'Nature', tree: 'Nature', weather: 'Nature', mushroom: 'Nature', berry: 'Nature', flower: 'Nature',
      /* faith */
      pray: 'Religion', prayer: 'Religion', god: 'Religion', holy: 'Religion', temple: 'Religion', shrine: 'Religion', bless: 'Religion', blessing: 'Religion',
      /* animals */
      animal: 'Animal Handling', calm: 'Animal Handling', pet: 'Animal Handling', tame: 'Animal Handling', ride: 'Animal Handling', feed: 'Animal Handling',
      horse: 'Animal Handling', dog: 'Animal Handling', soothe: 'Animal Handling', saddle: 'Animal Handling', 'whistle for': 'Animal Handling',
      /* reading people */
      lying: 'Insight', trust: 'Insight', honest: 'Insight', mood: 'Insight', 'read him': 'Insight', 'read her': 'Insight', 'read them': 'Insight', 'size up': 'Insight',
      'tell if': 'Insight', 'telling the truth': 'Insight', 'really want': 'Insight',
      /* patching up */
      heal: 'Medicine', bandage: 'Medicine', wound: 'Medicine', treat: 'Medicine', patch: 'Medicine', tend: 'Medicine', medicine: 'Medicine', stitch: 'Medicine',
      revive: 'Medicine', 'first aid': 'Medicine',
      /* noticing */
      look: 'Perception', listen: 'Perception', watch: 'Perception', notice: 'Perception', spot: 'Perception', hear: 'Perception', smell: 'Perception', peek: 'Perception',
      scan: 'Perception', eavesdrop: 'Perception', peer: 'Perception', 'look around': 'Perception', 'keep watch': 'Perception',
      /* the outdoors */
      track: 'Survival', trail: 'Survival', hunt: 'Survival', forage: 'Survival', navigate: 'Survival', footprint: 'Survival', camp: 'Survival', shelter: 'Survival',
      'find the way': 'Survival', 'which way': 'Survival',
      /* not telling the truth */
      lie: 'Deception', bluff: 'Deception', trick: 'Deception', fib: 'Deception', pretend: 'Deception', disguise: 'Deception', fake: 'Deception', distract: 'Deception',
      mislead: 'Deception', fool: 'Deception', impersonate: 'Deception', 'make up': 'Deception',
      /* being frightening */
      threaten: 'Intimidation', scare: 'Intimidation', intimidate: 'Intimidation', frighten: 'Intimidation', menace: 'Intimidation', glare: 'Intimidation',
      growl: 'Intimidation', bully: 'Intimidation', roar: 'Intimidation', shout: 'Intimidation', yell: 'Intimidation', loom: 'Intimidation', 'stare down': 'Intimidation', 'or else': 'Intimidation',
      /* an audience */
      sing: 'Performance', song: 'Performance', dance: 'Performance', perform: 'Performance', act: 'Performance', joke: 'Performance', recite: 'Performance',
      entertain: 'Performance', mime: 'Performance', juggle: 'Performance', impress: 'Performance', 'show off': 'Performance', 'tell a story': 'Performance',
      /* talking them round */
      persuade: 'Persuasion', convince: 'Persuasion', ask: 'Persuasion', talk: 'Persuasion', negotiate: 'Persuasion', bargain: 'Persuasion', beg: 'Persuasion',
      plead: 'Persuasion', charm: 'Persuasion', flatter: 'Persuasion', reason: 'Persuasion', haggle: 'Persuasion', compliment: 'Persuasion', apologise: 'Persuasion',
      apologize: 'Persuasion', befriend: 'Persuasion', coax: 'Persuasion', 'make friends': 'Persuasion'
    }
  },

  /* Ties: what links a hero to the others at the table and to the story. A cartridge that writes any of the
     three lists replaces that list.
       bonds   questions about another player's hero, asked once a hero is made at a table. {name} becomes that
               hero's name; the answer is shown to the whole table.
       hooks   a personal stake in the story, picked (or skipped) by each player and seen only by them and the DM.
               `roles` keeps a hook for heroes of those roles; left out, it is for anyone.
       voices  ways to talk, for a player who would like to try one: a word, and how to do it. */
  ties: {
    bonds: [
      'What did {name} do, the day you met, that made you trust them?',
      'Why do you owe {name} a favor?',
      'What is {name} better at than you, and how do you feel about that?',
      'What did {name} once talk you into, and are you glad?',
      'What do you and {name} still argue about?',
      'Which of your secrets does {name} already know?'
    ],
    hooks: [
      { id: 'prove', text: 'Somebody back home said you would never amount to much. You mean to prove them wrong, and you would like there to be witnesses.' },
      { id: 'debt', text: 'You owe someone a favor that money cannot repay. Doing some real good here might square it.' },
      { id: 'promise', text: 'You promised someone you would look after the others. You have not told the others.', roles: ['Protector', 'Healer'] },
      { id: 'curious', text: 'You are not here for glory. You simply cannot bear not knowing how things turn out.', roles: ['Thinker', 'Scout'] },
      { id: 'tale', text: 'You want a story worth telling afterwards, and you would like to be the best part of it.', roles: ['Talker', 'Trickster'] }
    ],
    voices: [
      { label: 'Gruff', tip: 'Short sentences. Long pauses. Never use three words where one will do.' },
      { label: 'Bright', tip: 'Everything is wonderful, and you say so a little too fast.' },
      { label: 'Careful', tip: 'Think before you speak. Start with “Well…” and choose each word.' },
      { label: 'Grand', tip: 'Speak as if to a crowd, even when asking someone to pass the salt.' },
      { label: 'Sly', tip: 'Speak low, smile a little, and never quite answer the question.' },
      { label: 'Dreamy', tip: 'Trail off halfway. Notice something nobody else has.' }
    ]
  },

  /* The kit: things a hero carries or can do, shown as cards with a "Use" button that tells the DM.
       items   { id: { name, text, img, uses } }. `uses` is 'once' (used up) or 'always'. The base has none: a
               cartridge brings its own, and each class lists what it starts with (kit: ['rope', 'torch']).
       token   what a hero token is called here. The DM hands one out for a great moment; a player spends it to
               roll again. */
  kit: {
    items: {},
    token: { name: 'Hero token', plural: 'Hero tokens', text: 'Spend one to roll again when it matters. Your DM hands them out for great moments.' }
  },

  /* Soundscapes ("beds"): a quiet loop of sound behind a scene, chosen by the DM. Each is one of the engine's own
     (synth: one of FR.AMBIENCE in src/registry.js, made on the spot by FR.Ambience in src/audio.js) or one of the
     cartridge's audio files (file: 'audio/rain.mp3'). These seven are every cartridge's unless it says otherwise:
     it may add its own beside them, reword one by writing it again, or take one away with null (sea: null). */
  sound: {
    beds: {
      wind: { label: 'Wind', synth: 'wind' },
      fire: { label: 'A crackling fire', synth: 'fire' },
      storm: { label: 'Rain and far-off thunder', synth: 'storm' },
      crowd: { label: 'A busy room', synth: 'crowd' },
      cave: { label: 'Underground', synth: 'cave' },
      night: { label: 'Night outdoors', synth: 'night' },
      sea: { label: 'The sea', synth: 'sea' }
    }
  },

  /* The rules a cartridge plays by, one of the profiles in src/rules.js:
       'open-5e'  ability scores, hit points, armor, attack and damage dice, all hidden under plain words. A class
                  brings its numbers (v, hd, prio, armor, skills, attacks) and a people brings its own.
       'light'    one twenty-sided die and a bonus. A class says only what it is strong at and fair at.
     A cartridge that names none plays by this one. */
  rules: 'open-5e',

  /* What only the light rules read. A cartridge on 'open-5e' never looks here.
       fight   the ways to fight, listed on the fight tab. Each is a roll like any other: `skill` is the skill it
               comes down to (or a list of them: the hero rolls whichever they are best at), so a hero who is
               strong at it is strong at fighting that way. Whether it lands is the DM's call, and a hit moves
               the foe one step closer to out of the fight. A cartridge that writes the list replaces it.
       text    the lines only these rules say. A cartridge rewords any of them. */
  light: {
    fight: [
      { id: 'strike', label: 'Hit it hard', hint: 'Fists, a blade, anything heavy', skill: 'Athletics' },
      { id: 'dart', label: 'Strike fast', hint: 'Quick and nimble, in and out', skill: ['Acrobatics', 'Sleight of Hand'] },
      { id: 'aim', label: 'Aim and let fly', hint: 'Throw it, shoot it, sling it', skill: ['Perception', 'Survival'] },
      { id: 'ambush', label: 'Strike from hiding', hint: 'They never see it coming', skill: 'Stealth' },
      { id: 'magic', label: 'Use magic', hint: 'A spell, a charm, a spark', skill: ['Arcana', 'Nature', 'Religion'] },
      { id: 'rattle', label: 'Trick or scare them', hint: 'A feint, a taunt, a terrible glare', skill: ['Deception', 'Intimidation', 'Performance'] }
    ],
    text: {
      /* the badge on a row, and the heading on the sheet, for what a hero is fair at (strong is goodAt and goodAtHead, in `text`) */
      fairAt: 'Fair at this', fairAtHead: 'Fair at',
      /* after a fight roll: whether it lands is for the DM to say */
      hitSay: 'Tell the DM. If it lands, the foe takes a hit.',
      hitNat20: 'A natural 20 always lands. Tell the DM: the foe takes a hit.',
      /* the line under the fight tab: a bold start, then the rest */
      fightHowB: 'How a fight goes. ', fightHow: 'Pick a way to fight and roll. If it lands, the foe takes a hit: a few hits and it is out of the fight. Your DM keeps track.',
      /* what "Show rules details" does under these rules */
      detailsNote: 'The bonus behind each roll, as a number',
      /* under the choices when a hero is revealed: the classes carry a number, the peoples do not */
      matchNote: 'The numbers show how closely each kind of hero fits your answers. Your people is yours to choose. Tap another to switch.'
    }
  },

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
      text: 'A {body}{raceLower} {clsLower}{raceLook}.{gear}{details}{also}',
      parts: {
        body: { from: 'look.body', map: { Male: 'male ', Female: 'female ' }, or: 'androgynous ' },
        raceLower: { from: 'race', lower: true },
        clsLower: { from: 'cls', lower: true },
        /* a people with no `look`, or a class with no `gear` (both may be left out under the light rules), leaves its part out */
        raceLook: { from: 'raceInfo.look', wrap: ' ({value})' },
        gear: { from: 'classInfo.gear', wrap: ' Typical gear: {value}.' },
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
    /* health as a state rather than a number: all there, some harm taken, nearly out */
    healthFine: 'Fine', healthHurt: 'Hurt', healthTrouble: 'In trouble',
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
    leaveTitle: 'Leave table {code}?', leaveText: 'Your seat is freed and the table forgets your hero. Your hero stays on this phone.', leaveYes: 'Leave the table', stay: 'Stay',
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
    music: 'Music', musicNote: 'Music for the title, the game and the fights', musicNone: 'This cartridge has no music yet',
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
    tablePlays: 'This table is playing {scenario}. Let’s make you a hero for it.', reconnecting: 'Reconnecting to the table…',
    back: 'Back', cancel: 'Cancel',
    /* who is at the table, and getting up from it for good */
    whoHere: 'Who’s here', playedBy: 'Played by {name}', thatsYou: 'That’s you', noHeroYet: 'Still making a hero', moveTable: 'Move to another table',
    leftTable: 'You have left table {code}.', leaveFailed: 'Could not reach the table, so you are still seated. Try again.',

    /* ---- the story at a DM's table: where it is now, what the DM has shown you, what you could do ---- */
    taleTitle: 'The story', tabStory: 'Story', tabQuests: 'Quests', tabClues: 'Clues', tabPeople: 'Who’s who',
    happening: 'What’s happening?', soFar: 'Story so far', asItWent: 'As it happened',
    feedEmpty: 'Nothing here yet. What your DM shows the table will land here.',
    onlyYou: 'Only for you', sceneNow: 'The story moves on', questDone: 'Done', questCount: '{done} of {n} done',
    rollYours: 'Your roll: {label}',
    /* a ready-made hero the DM offers, mostly to someone who has just sat down */
    heroOffer: 'Your DM offers you a ready-made hero', heroTake: 'Take this hero', heroLater: 'Not now', heroSwap: '{name} takes {old}’s place.',
    heroAsk: 'Your DM suggests you play {name}.', heroNow: 'You are now playing {name}.',
    /* things a player might try in this scene, and saying it in their own words */
    cardsHead: 'Here you could…', cardWaiting: 'Asked. Waiting for your DM…', cardYes: 'Your DM says yes.', cardNo: 'Your DM says no.', cardRoll: 'Your DM wants a roll for that.',
    askWait: 'Your DM is still thinking about three of your ideas. Give them a moment.', askFailed: 'That did not reach the table. Try again.',
    intentLabel: 'Or say what you do', intentHint: 'I climb up to the window', intentSend: 'Tell the DM', youSaid: 'You said: “{text}”',
    /* a roll the DM asks for */
    reqKicker: 'Your DM asks for a roll', reqGo: 'Roll for it', reqSending: 'Telling the table…', reqDecide: 'Your DM will decide how that went.',
    reqPassed: 'It worked.', reqFailed: 'It did not work.', reqLost: 'That did not reach the table. Tell your DM what you rolled.', reqOff: 'Your DM has called that roll off.',
    reqKeep: 'Keep the 1', reqWaiting: 'Waiting for your DM: {label}',
    /* dice rolled on the real table, typed in */
    realDice: 'I rolled real dice', realTitle: 'What did your dice show?', realOne: 'The number on your {s}-sided die', realEach: 'Die {i}, {s}-sided',
    realUse: 'Use this roll', realBad: 'Type the number each die shows, from 1 to {s}.',
    /* marking how the hero is doing */
    healthTitle: 'How is your hero doing?', healthNote: 'Your DM tells you when you are hurt or healed. Mark it here.', healthOf: '{now} of {max}',
    healthLess: 'One less', healthMore: 'One more', healthSet: 'Health: {state}. Tap to change.',
    /* armor as a word rather than a number (the number shows with rules details on): by how high an attack has to roll */
    armorLight: 'Lightly protected', armorWell: 'Well protected', armorHeavy: 'Heavily protected',

    /* ---- the player's side of the shared table (docs/PHASE2.md, section 4) ---- */
    /* ties: three short, optional steps once a hero is made. A bond with another hero, a personal stake, a voice to try */
    tiesMenu: 'Bond, stake and voice', tiesKicker: 'Optional · {i} of {n}', tiesKickerOne: 'Optional', skipStep: 'Skip', tiesLater: 'Not now',
    choose: 'Choose', change: 'Change',
    bondTitle: 'Who do you know here?', bondText: 'Pick another hero and answer one question about them. The whole table sees your answer.',
    bondPick: 'Which hero?', bondOther: 'Ask me another', bondHint: 'One line is plenty', bondSave: 'Save this bond', bondNeed: 'Write a few words first, or skip.',
    bondClear: 'Remove this bond', bondSaved: 'Bond saved. The table can see it under Who’s here.', bondHead: 'Your bond',
    bondWith: 'Bond with {name}', bondFrom: '{name}’s bond with {hero}', bondAdd: 'Add a bond with another hero', bondChange: 'Change your bond',
    hookTitle: 'Your stake in this', hookText: 'Why is {name} here? Pick one, or skip. Only you and your DM see it.', hookClear: 'Go without one', hookNone: 'Nothing chosen yet.',
    voiceTitle: 'How you talk', voiceText: 'A voice to try for {name}. It is only a suggestion.', voiceClear: 'Use my own voice', voiceNone: 'No voice chosen yet.',
    /* roles: what the party still lacks, said in the lobby and on the ready-made heroes */
    partyMissing: 'Nobody is the {role} yet.', partyAnd: ', the ', partyOr: ' or the ', roleNeeded: 'Nobody at your table plays one yet',
    /* things a hero carries: a card each, and a button that tells the DM. {item} is the thing's name */
    kitHead: 'Things you carry', kitUse: 'Use', kitUndo: 'Undo', kitOnce: 'One use', kitUsed: 'Used',
    kitSay: 'I use: {item}', kitTell: 'Tell your DM you are using: {item}',
    /* hero tokens: {token} is the cartridge's word for one (kit.token) */
    tokenSpend: 'Spend a {token}: roll again', tokenSpent: '{token} spent. Roll again.',
    /* a vote the DM puts to the party */
    voteKicker: 'Party vote', voteNote: 'Tap your choice. You can change it until your DM closes the vote.', voteMine: 'Your vote is in. Tap another to change it.',
    voteHide: 'Hide', voteShow: 'Show', voteClosed: 'The vote is in', voteYours: 'Your pick', voteNone: 'Nobody voted.',
    /* marks on things in the story, and the big rolls that land there */
    marksLabel: 'React', markCheer: 'Cheer', markLaugh: 'Laugh', markGasp: 'Gasp', markHeart: 'Love it', markClap: 'Clap', markWow: 'Wow',
    natRolled: '{name} rolled a natural {n}', natYou: 'You rolled a natural {n}',
    /* notes, kept on this phone */
    tabNotes: 'Notes', notesMenu: 'Your notes', pin: 'Pin to notes', pinned: 'In your notes', pinDone: 'Pinned to your notes.',
    noteLabel: 'Write a note', noteHint: 'A name to remember, a plan, a hunch', noteAdd: 'Add note', noteYours: 'Your note', notePinned: 'Pinned from the story',
    notesEmpty: 'Nothing here yet. Pin anything from the story, or write your own. Notes stay on this phone.',
    noteDelete: 'Delete', noteDeleteTitle: 'Delete this note?', noteDeleteYes: 'Delete it', noteKeep: 'Keep it',
    /* table moments: a picture held face down and flipped for everyone at once, the map, and the sound behind a scene */
    revealWait: 'Wait for it…', revealHide: 'Hide for now',
    tabMap: 'Map', mapAlt: 'Map: {title}', mapBigger: 'Bigger map', mapSmaller: 'Smaller map', mapFound: 'Uncovered so far', mapNone: 'Nothing is uncovered yet. Your DM opens the map as you explore.',
    tableSound: 'Table sounds on this phone', tableSoundNote: 'The sound your DM sets behind a scene. Starts off, so the phones do not play over each other',
    tableSoundMuted: 'Switch Sound effects on to hear them',
    creditsHead: 'Credits'
  }
});

if (typeof module !== 'undefined') { module.exports = FR; }
