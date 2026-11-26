/* First Roll adventure for the cartridge "__NAME__": a starter.

   Made by `npm run new-cartridge __ID__ --adventure`. It is a whole adventure, small enough to read in
   two minutes: three scenes, one choice, two endings. Open the DM's door and you can run it as it is.
   It is here to be replaced: keep the shape, change the story. Every part a new adventure can use is in
   it once, with a comment saying what it is for.

     npm run validate                 checks it with the cartridge, and says what is wrong and where
     node scripts/validate-adventure.js cartridges/__ID__/adventure.js --images cartridges/__ID__

   An adventure is data only: text, numbers, true/false, lists and objects. No functions. The whole
   format is written up at the top of cartridges/northpole/adventure.js and in README.md ("The
   adventure"). Three words turn up everywhere:
     a CONDITION  anything called `when`, `from` or `done`. { flag: 'key' } is "the flag key has been set";
                  { flag: 'met', is: 'friend' }, { seen: 'inn' }, { all: [...] }, { any: [...] }, { not: {...} }.
                  Leave it out to mean "always".
     a FLAG       something the story remembers. Outcomes set flags; conditions read them.
     a PICTURE    'img/cellar.webp' is a file in this cartridge's img/ folder; 'base:img/keyart.webp'
                  borrows one of the engine's.
   The parts that reach the whole table at once (a map, a soundscape, a picture turned over together, a
   vote) and the ones that help the DM pace the night (beats, foes, the easier and harder lines, minutes)
   are format 3. Each is in here once, marked [3]. */
FR.adventure('__ID__', {
  schema: 3,                          // the format. 3 is the one with everything below in it.

  /* ---------------- what it is: the cover the DM sees ---------------- */
  id: '__ID__',                       // never change it once DMs are running it: saved sessions are filed under it
  title: 'The Knock in the Cellar',
  kicker: 'A starter adventure',
  length: 'About ten minutes',
  table: 'One to six players',
  cover: 'base:img/keyart.webp',
  /* the whole story in one breath: shown to the DM, and told to the story helper */
  pitch: 'A storm drives the heroes into a lonely inn. Something under the floor is knocking, the innkeeper will not talk about it, and the cellar door is locked.',
  howto: [
    'Boxes marked “Read aloud” are for the table. Everything else is for your eyes only.',
    'Players roll on their own phones. You never keep score: just say what happens.'
  ],

  /* The DM's brief: one page to read before the first game. `about` is a few sentences; `people` is the ids
     of the people who matter most (from bible.people, six at most); `endings` is how it can end; `tips` is
     for someone who has never run a game. */
  brief: {
    about: 'A storm, a lonely inn, and something knocking under the floor. The heroes find out what it is and choose how to meet it. Nobody has to fight anything. It is here to show how an adventure is written.',
    people: ['keeper', 'ember'],
    endings: [
      'They open the door gently: the knocker turns out to be a small, lonely hearth spirit, and the inn is warmer for it.',
      'They burst in: it bolts into the storm, and nobody ever quite learns what it was.'
    ],
    tips: [
      'Read the “Read aloud” boxes to the table and keep the rest to yourself.',
      'When the players want to try something, look under “If they try…”. If it is not there, decide what seems fair and fun.',
      'The second scene is the one choice. Whatever the players do, tap the outcome that fits and the ending follows.'
    ]
  },

  /* ---------------- the bible: what is true, and the DM's dictionary ---------------- */
  bible: {
    truths: [
      'The knocking is Ember, a young hearth spirit. The innkeeper shut it in the cellar when it frightened her guests.',
      'Ember is not dangerous, only cold and lonely. The innkeeper is ashamed, not wicked.'
    ],
    people: [
      { id: 'keeper', name: 'The innkeeper', full: 'Bess Marrow, the innkeeper', role: 'Runs the inn, and would rather not discuss the cellar',
        where: 'Behind the bar, polishing the same mug',
        look: 'Broad, red-cheeked, sleeves rolled up. One hand keeps straying to her apron pocket.',
        voice: 'Cheerful and a little too loud.',
        wants: 'A quiet night and no questions.',
        secret: 'She locked Ember in the cellar herself and has felt bad about it ever since. The key is in her apron pocket.',
        lines: ['“Rats. Big ones. More stew?”', '“Nobody goes down there. Health and safety.”'],
        /* What players may know about someone, for the "who's who" on their phones: one line (160 characters at
           most) and never the secret. With no `when` it shows from the start. */
        public: { line: 'Runs the inn. Happy to talk about anything except the cellar.' } },
      { id: 'ember', name: 'Ember', full: 'Ember, a hearth spirit', role: 'The thing that is knocking',
        where: 'The cellar, behind the turnip sacks',
        look: 'A flame the size of a cat, with two bright eyes. It dims when it is frightened.',
        voice: 'Small, crackly and very polite.',
        wants: 'To be let out, and to sit by a fire again.',
        secret: 'It did not mean to frighten anyone. It only wanted to join in the singing.',
        lines: ['“Hello? Is somebody there?”', '“I counted the knocks so you would know I was not a rat.”'],
        /* `when` holds this one back until the story reaches it: here, until an outcome has set the flag `met` */
        public: { line: 'The thing that was knocking: a hearth spirit about the size of a cat.', when: { flag: 'met' } } }
    ],
    places: [
      { id: 'inn', name: 'The Last Lantern', blurb: 'A lonely inn at a crossroads, with one lantern over the door and a cellar nobody mentions.', senses: 'Woodsmoke, wet cloaks and onion stew. Rain on the shutters.' }
    ],
    things: [
      { id: 'key', name: 'The cellar key', blurb: 'An iron key on a loop of string, in the innkeeper’s apron pocket.' }
    ]
  },

  /* ---------------- flags: what the story remembers ---------------- */
  flags: {
    key: { values: [true], tell: 'they have the cellar key' },
    met: { values: ['friend', 'foe'], tell: 'they met Ember as a {word}', words: { friend: 'friend', foe: 'threat' } },
    ending: { values: ['warm', 'cold'] }            // which ending the DM read, if they changed the one suggested
  },

  /* ---------------- the flow: one chapter of three scenes ---------------- */
  flow: {
    start: 'inn',
    chapters: [
      { id: 'inn', title: 'The Knock in the Cellar', place: 'inn', length: 'About ten minutes',
        /* [3] `minutes` is about how long the chapter takes, as a number, for the DM's pacing clock (the words in
           `length` are for reading). `sound` is the soundscape to put behind the chapter: the id of one of the
           cartridge's (sound.beds in cartridge.js; every cartridge has wind, fire, storm, crowd, cave, night
           and sea). A scene may name its own, as the first one does below. */
        minutes: 10, sound: 'storm',
        goal: 'Find out what is knocking, and decide how to meet it.',
        /* `summary` is what a player is shown under "What's happening?", and what someone who joins late reads
           first. One or two lines (400 characters at most), with nothing the DM has not yet revealed. A chapter
           has one, and so does each scene. */
        summary: 'A storm has driven you into a lonely inn. Something under the floor keeps knocking, and nobody wants to talk about it.',
        scenes: [
          { id: 'taproom', title: 'Something under the floor',
            summary: 'You are drying off by the fire of the Last Lantern. Every so often something knocks under the floorboards, and the innkeeper pretends not to hear.',
            read: [
              'Rain hammers the shutters of the Last Lantern. You have the fire, a bowl of stew each, and the whole taproom to yourselves.',
              'Knock. Knock. Knock. It comes from under the floor. The innkeeper polishes a mug very hard and says nothing at all.'
            ],
            notes: ['The innkeeper is not a villain. She is embarrassed. Let the players enjoy catching her out.', 'They can go to the cellar door with the key or without it.'],
            cast: ['keeper'],
            /* [3] What this scene offers the whole table, for the DM to tap or leave alone:
                 sound   the soundscape here, when it differs from the chapter's
                 map     which map to put up (an id from `maps`, near the end of this file) and the regions to
                         uncover on arriving
                 beats   moments the DM can fire so that every phone feels them at once. `label` is the DM's
                         button (40 characters at most); `kind` is one of thunder, hit, reveal, bell, crash, hush.
                         Six at most. */
            sound: 'fire',
            map: { id: 'inn', open: ['taproom'] },
            beats: [{ id: 'knock', label: 'Knock. Knock. Knock.', kind: 'hit' }],
            /* [3] The difficulty dial: one line each on what to change if the table is struggling, or coasting.
               For the DM's eyes only. 240 characters at most. */
            easier: 'Let the innkeeper give herself away: she pats her apron pocket whenever the cellar is mentioned.',
            harder: 'The innkeeper has had this conversation before. She keeps the bar between herself and anyone who asks twice.',
            /* Things the players may try. `try`, `roll`, `yes` and `no` are what the DM reads. The other three are
               how the same try reaches the players' phones:
                 check   the roll as the app understands it: a skill and the number to reach (about 10 is easy,
                         13 medium, 16 hard), so the DM can ask for it with one tap. check: false says there is
                         nothing to roll.
                 hint    the small line under the action card (120 characters at most). Only where the title
                         needs one.
                 card    card: false keeps the try off the players' phones. Use it where the title alone would
                         give a secret away. The DM still sees it. */
            tries: [
              { try: 'Ask the innkeeper about the noise', roll: 'No roll needed', check: false,
                yes: '“Rats,” she says, far too quickly. “Big ones.” Her hand goes to her apron pocket.', no: '' },
              { try: 'Listen at the cellar door', roll: 'Perception, easy (10)', check: { skill: 'Perception', target: 10 }, hint: 'Put an ear to the wood',
                yes: 'Three knocks, a pause, three knocks. Rats do not count.', no: 'Rain, wind and knocking. You cannot tell more than that.' },
              { try: 'Talk her into handing over the key', roll: 'Persuasion, medium (13)', check: { skill: 'Persuasion', target: 13 },
                yes: 'She sags. “I only meant it for one night,” she says, and puts an iron key on the bar.', no: '“There is no key,” she says, with her hand on it.' },
              { try: 'Lift the key from her apron pocket', roll: 'Sleight of Hand, medium (13)', check: { skill: 'Sleight of Hand', target: 13 }, card: false,
                yes: 'One loop of string, one iron key, and she is none the wiser.', no: 'She catches your wrist. “That’s my good apron.”' }
            ],
            otherwise: 'Anything kind works on the innkeeper sooner or later. She wants to be talked into it.',
            /* What happened? The DM taps one. `sets` remembers it; `log` is one sentence in the past tense, which
               also becomes a line of "the story so far" on the phones (240 characters at most). */
            outcomes: [
              { id: 'key', label: 'They have the key', sets: { key: true }, log: 'The heroes got the cellar key from the innkeeper of the Last Lantern.' },
              { id: 'nokey', label: 'They go to the door without it', log: 'The heroes went to the cellar door without a key.' }
            ] },

          { id: 'door', title: 'The cellar door',
            summary: 'You are at the cellar door: old oak, bolted and locked. The knocking has stopped. Something on the other side just said hello.',
            read: [
              'The cellar door is old oak, bolted and locked. As you come close, the knocking stops.',
              'Then a very small voice, from the other side: “Hello? Is somebody there?”'
            ],
            /* read aloud as well, but only when its condition holds */
            also: [{ when: { flag: 'key' }, read: 'The key turns as easily as if it had been waiting for you.' }],
            notes: ['This is the one choice in the adventure: do they open the door gently, or go in ready for a fight?', 'Ember will not fight. If the heroes charge in, it bolts.'],
            cast: ['ember'],
            map: { id: 'inn', open: ['door'] },
            beats: [{ id: 'quiet', label: 'The knocking stops', kind: 'hush' }],
            /* [3] A picture worth holding face down on every phone and turning over together. Give it a title
               that gives nothing away before the flip (80 characters at most) and a picture: one of your own
               ('img/ember.webp') or, until you have one, one of the engine's. */
            reveal: { id: 'ember', title: 'What was knocking', img: 'base:img/portrait.svg' },
            /* [3] A choice worth putting to the whole table: a question (120 characters at most) and two to four
               answers (40 each). Every phone gets one tap; the DM sees the count and closes the vote. */
            vote: { q: 'How do you open the cellar door?', options: ['Gently, and say hello', 'Fast, ready for anything'] },
            /* [3] The foes that may turn up here: ids from `foes`, near the end of this file. The DM can add them
               to the turn order with one tap. */
            foes: ['ember'],
            easier: 'The voice does the work for them: “Please do not shout. I am only small.”',
            harder: 'The bolt is rusted. Whoever opens the door, gently or not, has to deal with the bolt first.',
            tries: [
              { try: 'Speak gently through the door', roll: 'Persuasion, easy (10)', check: { skill: 'Persuasion', target: 10 },
                yes: '“Oh, good,” says the voice. “I was beginning to think it was only rats up there.”', no: 'A long silence. Then, smaller: “You sound cross. Are you cross?”' },
              { try: 'Force the door', roll: 'Athletics, hard (16). No roll with the key', check: { skill: 'Athletics', target: 16 }, hint: 'Shoulder first',
                yes: 'The bolt gives and the door bangs open on the dark.', no: 'The door holds. Your shoulder will remember it.' }
            ],
            outcomes: [
              { id: 'friend', label: 'They open it gently and talk', sets: { met: 'friend' }, log: 'The heroes opened the cellar door gently and met Ember, a small hearth spirit.' },
              { id: 'foe', label: 'They burst in ready for a fight', sets: { met: 'foe' }, log: 'The heroes burst into the cellar, and something small and bright fled past them.' }
            ] },

          { id: 'end', title: 'Morning',
            summary: 'The storm is blowing itself out, and the cellar is quiet at last.',
            /* A read-aloud that comes in versions: here, the two endings. The app suggests the first one whose
               condition holds; the DM can tap the other. `flag` remembers the choice, and lists the version ids. */
            versions: {
              ask: 'How did they meet it?', flag: 'ending',
              options: [
                { id: 'warm', label: 'As friends', read: [
                  'By morning the storm has blown itself out. In the taproom hearth sits a flame about the size of a cat, with two bright eyes, toasting a crust for anyone who asks.',
                  'The innkeeper will not take a coin for the night. “It sings,” she tells you, amazed. “Did you know it sings?”'] },
                { id: 'cold', label: 'It fled', read: [
                  'By morning the storm has blown itself out, and so has whatever was in the cellar. A scorched little trail leads up the steps and out under the door.',
                  'The innkeeper watches the road for a long time. Then she goes down and props the cellar door open, in case.'] }
              ],
              suggest: [{ when: { flag: 'met', is: 'friend' }, use: 'warm' }, { use: 'cold' }]
            },
            notes: ['Read the ending that fits, then ask each player for one thing their hero does before setting off.'],
            map: { id: 'inn', open: ['cellar'] },
            cast: ['keeper', 'ember'], tries: [],
            outcomes: [{ id: 'end', label: 'The end', log: 'The storm passed, and the heroes took to the road again.' }] }
        ],
        /* what follows when the scenes run out: here, the story is over */
        next: [{ end: true }]
      }
    ]
  },

  /* ---------------- what the players' phones are shown ---------------- */
  /* The quest board. A quest is on the board once its `from` holds (always, if it has none) and is ticked
     off once its `done` holds. `text` is 160 characters at most, and there may be 12 quests. */
  quests: [
    { id: 'knock', text: 'Find out what is knocking under the inn.', done: { flag: 'met' } },
    { id: 'door', text: 'You have the key. Open the cellar door.', from: { flag: 'key' }, done: { flag: 'met' } }
  ],
  /* What the party has learned. A clue shows once its `when` holds. `text` is 200 characters at most, and
     there may be 20 clues. */
  clues: [
    { id: 'pocket', text: 'The innkeeper kept the cellar key in her own apron pocket. Whatever is down there, she locked it in.', when: { flag: 'key' } },
    { id: 'ember', text: 'The knocking was Ember, a hearth spirit shut in the cellar for frightening the guests. It only wanted to join in the singing.', when: { flag: 'met', is: 'friend' } }
  ],
  /* Notes, letters and pictures the DM can give to one player or to everyone. `at` is where a handout
     belongs, so the DM is offered it there: a chapter by its id ('inn'), or one scene as 'chapter/scene'
     ('inn/door'). Leave `at` out for one that is always to hand. A handout needs a `title` (80 characters
     at most) and `text` (1200 at most), an `img`, or both. */
  handouts: [
    { id: 'sign', title: 'The sign on the cellar door', at: 'inn/door',
      text: 'KEEP OUT.\nRats. Very big rats.\n(Please stop asking.)' },
    { id: 'inn', title: 'The Last Lantern', at: 'inn', img: 'base:img/keyart.webp',
      text: 'The inn at the crossroads, as you first saw it through the rain.' }
  ],

  /* ---------------- [3] what the whole table shares: maps and foes ---------------- */
  /* Maps. A map is a picture and the parts of it ("regions") that are uncovered as the story goes. `img` is any
     wide picture of your own (the scaffold drew img/map.svg for you to replace). A region is a rectangle over
     the picture: `x` and `y` are where its top left corner is and `w` and `h` its width and height, all in
     percentages of the picture (0 to 100). `name` is what the table calls it once it shows (40 characters at
     most). A region is uncovered when a scene's `map` opens it; give it a `when` as well and it also counts
     as uncovered whenever that condition holds, which keeps the map right if it is put up late or on a second
     screen. 24 regions to a map at most. */
  maps: [
    { id: 'inn', title: 'The Last Lantern', img: 'img/map.svg', regions: [
      { id: 'taproom', name: 'The taproom', x: 2, y: 6, w: 52, h: 88 },
      { id: 'door', name: 'The cellar door', x: 54, y: 30, w: 14, h: 40 },
      { id: 'cellar', name: 'The cellar', x: 68, y: 6, w: 30, h: 88, when: { flag: 'met' } }
    ] }
  ],
  /* Foes: whatever the heroes may end up fighting or facing down. Nobody keeps numbers: `hits` is how many good
     hits it takes to deal with one (1 to 6), which the DM's screen shows as a state (fine, hurt, in trouble).
     `moves` are two or three things it might do on its turn, in plain words (120 characters each, four at
     most). `name` is 40 characters at most and should not give a secret away; `img` is optional. */
  foes: [
    { id: 'ember', name: 'Something small and bright', hits: 1,
      moves: ['Darts behind the turnip sacks and dims to almost nothing.', 'Bolts for the stairs, leaving a scorched line across the floor.'] }
  ],

  /* ---------------- the story helper ---------------- */
  /* who the AI co-storyteller is, when a table has one; `builtin` is what the helper offers when it has none */
  helper: {
    role: 'You are the co-storyteller for a DM running a short, friendly adventure for people who have never played before.',
    tone: 'Nobody gets hurt. Trouble means embarrassment, spilled stew and soot.',
    builtin: {
      twists: ['A shutter bangs open and the wind puts out every candle but one.', 'The knocking starts up again, this time in the rhythm of the song somebody was humming.'],
      yes: ['It works, and more neatly than anyone expected.', 'It works. The innkeeper pretends she did not see.'],
      no: ['It does not work, but it makes enough noise that something else happens instead.', 'It does not work. Somewhere below, something small says “Oh dear.”'],
      nothingYet: 'The heroes have only just come in out of the rain.'
    }
  }
});
