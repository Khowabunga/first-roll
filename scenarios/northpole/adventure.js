/* First Roll: "The Great Cookie Calamity", a one-session North Pole adventure for the DM.
   Built on the DM's own premise: bakers win a cookie bake-off, find a note from the
   C.O.O.K.I.E. Department, nibble a cookie, land at the North Pole, and must gather
   three ingredients (one is a laugh from the grumpy troll shoemaker) while bad cookies
   cause endless farts, sneezes and a massive runny nose.

   This file is an ADVENTURE: data only, no code. src/dm.js is a runner that plays any
   adventure written this way, and knows nothing about this one. Check an adventure before
   it ships:   npm run validate   (or: node scripts/validate-adventure.js scenarios/northpole/adventure.js --images scenarios/northpole)

   =====================  HOW TO WRITE AN ADVENTURE  (format 1)  =====================

   An adventure is one plain object made of text, numbers, true/false, lists and objects.
   No functions, no dates, nothing that JSON cannot hold: JSON.parse(JSON.stringify(it))
   must give back the same thing. Where a story needs to decide something it uses a
   CONDITION (part 6), and where it needs to fill in a word it uses a {placeholder}.
   Every picture is optional and is a path such as 'img/dm_peak.webp'.
   "Optional" below means you may leave the line out. Anything misspelled is reported
   by the validator, so a typo never reaches a table.

   1. WHAT IT IS
      schema   1. The version of this format.
      id       Short, lower case. Never change it: a DM's saved session is filed under it.
      title, kicker, length, table, cover
               The cover: its name, the line above it, how long it runs, how many play, its picture.
      pitch    The whole story in one breath. Shown to the DM, and told to the story helper.
      howto    Tips for the DM. Shown on the cover and in the Story tab.

   2. THE BIBLE   bible: { truths, outline, people, places, things }
      What is true in this world. The Dictionary tab shows people, places and things, and the
      story helper is told all of it, so it never contradicts the story.
      truths   What is really going on (spoilers), one sentence each.
      outline  Optional. A sentence or two on how the chapters fit together, for the helper.
      people   { id, name, full, role, img, where, look, voice, wants, secret, lines: [...] }
               `lines` are things they say. With no AI connected, the helper offers these.
      places   { id, name, img, blurb, senses }
      things   { id, name, blurb, img }

   3. FLAGS   flags: { name: { values, tell, words, short } }
      What the story remembers. Outcomes set flags; conditions read them.
      values   Every value the flag can be given. Use [true] for a plain yes.
      tell     Optional. What the story helper is told once the flag is set. {word} becomes
               words[value]:  tell: 'the laugh: {word}', words: { pure: 'a whole belly laugh' }.
               Flags are told in the order they are written here.
      short    Optional. { value: 'A few words' } shown under a chapter in the Story tab, for the
               chapter that names this flag as its `flag`.
      scores: { name: { flag: { value: points } } }
               Optional. Adds up points across flags, for conditions like "at least 6".

   4. THE CLOCK   clock: { deadline, times }     (optional)
      Story time. It is there for urgency, not for bookkeeping.
      deadline A sentence the story helper hears after the time.
      times    A list of { when, say }. The first one whose condition holds is the time shown
               under the title. Finish with one that has no `when`.
      A chapter or interlude can also fix its own `time`.

   5. THE FLOW   flow: { start, chapters, interludes, hubs, shortcuts }
      start    The id of where the story begins.
      Chapters, interludes and hubs share one set of ids. Scene ids only need to differ
      inside their own chapter. Every chapter, interlude and hub needs a `next`.
      Once DMs are running an adventure, do not rename a chapter's id, and do not reorder
      the scenes of a chapter or the list of interludes: a saved session remembers chapters
      by id, and scenes and interludes by their place in the list.

      chapters   In the order a DM would expect to see them listed.
        { id, title, img, time, length, goal,
          place     a place id: where pictures of this chapter are set
          flag      optional: the flag that sums up how this chapter went (see `short`)
          perks     optional list of { when, text }: reminders shown under the chapter's
                    banner as "Because of earlier"
          scenes    at least one, played in order (see below)
          leaving   optional list of { when, read }: read aloud as the party leaves.
                    Every one whose condition holds is read, in this order.
          next      a list of { when, to: id } or { when, end: true }: what follows when the
                    scenes run out. The first that holds wins, and the last must have no
                    `when`, so there is always a way on. { end: true } is an ending. }

      a scene
        { id, title,
          read      paragraphs to read aloud
          notes     for the DM's eyes only (notesFirst: true puts them above the read-aloud)
          cast      people ids: who is here. The DM gets a button for each.
          things    optional thing ids: what is here. The painter is told what they look like.
          paint     optional: an instruction to the painter for this scene only
          tries     list of { try, roll, yes, no }: something the players may attempt, the roll
                    to ask for, what to read if it works, and if it does not ('' if it cannot fail)
          otherwise optional: advice for anything that is not on the list
          also      optional list of { when, read }: an extra read-aloud box "because of earlier"
          extras    optional list of { when, read }: a paragraph added to the end of the main
                    read-aloud
          versions  optional: the read-aloud comes in several versions (see below); then `read`
                    may be left out
          outcomes  at least one. Each is a button the DM taps to say what happened:
                    { id, label, log, sets: { flag: value } } and at most one of
                      skip: 1         leave out that many of the scenes that follow
                      scene: 'id'     go straight to that scene of this chapter
                      to: 'id'        leave for that chapter, interlude or hub
                      end: true       the story ends here
                    `log` is one sentence in the past tense. It is what the story helper is
                    told has happened, so write it for someone who was not there. }

      versions: { ask, flag, options: [{ id, label, read }], suggest: [{ when, use: id }] }
        The app shows the first `suggest` that holds. The DM can tap another; the choice is
        kept in `flag`, whose values must be the option ids.

      interludes   optional. Short scenes between chapters, with a banner of their own. Each is
        a scene (read, notes, cast, tries, outcomes and the rest) plus
        { img, place, time, length, goal, next }.

      hubs   optional. A choice put to the players.
        { id, title, first, goal, help,
          options   list of { to: chapter id, title, where, who, feel, img, log }. An option goes
                    away once it has been chosen. `log` is what the story helper is told.
                    A chapter can be on offer at one hub only.
          next      where to go if the story comes back here with nothing left to choose }
        `first` is the title to show while nothing has been chosen yet (optional).

      shortcuts   optional list of { to, at: [ids], button, label, log }. While the DM is waiting
        at one of the hubs, interludes or chapters in `at`, the Story tab offers `button`, which
        jumps to `to`. `label` and `log` record it, like an outcome.

   6. CONDITIONS   anything called `when`. Leave it out to mean "always".
      { flag: 'x' }                    x has been set (to anything but false)
      { flag: 'x', is: 'v' }           x is exactly v
      { flag: 'x', isNot: 'v' }        x is anything else (this is also true if x was never set)
      { flag: 'x', in: ['a', 'b'] }    x is one of these
      { picked: 'c' }                  chapter c has been chosen at a hub
      { before: ['a', 'b'] }           a and b have both been chosen at a hub, a first
      { seen: 'id' }                   that chapter, interlude or hub has come up
      { count: 'picks', is: 1 }        how many hub choices so far. Also 'interludes' and
                                       'chapters' (how many have come up). Use is, atLeast, atMost.
      { score: 'name', atLeast: 6 }    a sum from `scores`. Use is, atLeast, atMost.
      { all: [ ... ] }   { any: [ ... ] }   { not: { ... } }
      Conditions are looked at afresh every time the screen is drawn, with the flags as they
      are now.

   7. THE STORY HELPER AND THE PAINTER
      helper:  { role, tone, voice, fail, flagsHeading, builtin }
        role          who the AI is, in one sentence: the kind of game and the mood
        tone          optional: what must never happen, and what trouble looks like instead
        voice         optional: how read-aloud should sound ('vivid, funny, easy to say out loud')
        fail          optional: how a failed try should feel
        flagsHeading  optional: the heading the flags are listed under for the helper
        builtin       used when no AI is connected: { twists: [...], yes: [...], no: [...],
                      nothingYet: '...' }. The app picks one at random.
      painter: { role, tone, style, heroLook, heroes }
        role          who the illustrator's prompt-writer is, in one sentence
        tone          optional: what must never be in a picture
        style         the look of every picture, added to the end of each picture prompt
        heroLook      optional: how to describe a hero with no description of their own.
                      {kind} becomes what they are, for example 'Reindeer Sleigh Pilot'.
        heroes        optional: who the heroes are when the DM has listed none

   8. LABELS   labels: { hero, race, cls, partyHelp }     (all optional)
      hero       what to call a hero who has no name yet ('A baker')
      race, cls  what this story calls a character's race and class in the Party tab
      partyHelp  the line of help at the top of the Party tab

   Rules the validator checks, beyond spelling: every id that is pointed at exists; every
   chapter can be reached and the story can end; every flag that is used is listed, every
   listed flag and value is set somewhere, and no flag is given a value it does not list;
   every person, place and thing that is named exists; every picture exists; and nothing
   that is read aloud is empty.
   ==================================================================================== */
var FR = (typeof FR !== 'undefined') ? FR : {};

FR.adventure('northpole', {
  schema: 1,

  /* ---------------- 1. what it is ---------------- */
  id: 'cookie',
  title: 'The Great Cookie Calamity',
  kicker: 'A North Pole adventure in one sitting',
  length: 'About two and a half hours',
  table: 'Three to six players',
  cover: 'img/keyart.webp',

  /* The whole thing in one breath, for the DM. Also the spine of what the AI is told. */
  pitch: `Every Christmas Eve the North Pole runs on the Yule Batch: enchanted cookies that keep the elves cheerful and the reindeer in the air. The recipe needs three ingredients, gathered fresh every year. This year someone took a shortcut, the cookies went wrong, and the sleigh leaves at midnight. The only ones who can bake a new batch in time are a team of prize-winning bakers from far away: your players.`,

  howto: [
    `Cream boxes are for reading out loud. Everything on the dark background is for your eyes only.`,
    `Players roll on their own phones or with real dice. You never track hit points or numbers: just say what happens.`,
    `Nobody gets hurt in this story. A "defeated" foe ends up tangled in tinsel or covered in icing.`,
    `The golden rule: if the table laughs, it works.`,
    `When the players do something the story did not plan for, type it into "What do they try?" and the story will bend to fit.`
  ],

  /* ---------------- 2. the bible: what is true, and the dictionary ---------------- */
  bible: {
    truths: [
      `The true recipe needs three things: a belly laugh from someone who had forgotten how, a snowflake that has never touched the ground, and a lump of coal that has been forgiven.`,
      `Director Fizzwick, an efficiency-mad elf, replaced the ingredient gatherers with a machine, the Cookie-Matic 3000, and fakes: canned laughter, spray-on snow and plain coal dust.`,
      `The fake cookies cause the trouble, in three waves: first endless farts, then sneezing fits, then one massive runny nose.`,
      `Santa ate one. He has the Sneezles and cannot fly until he eats a true cookie.`,
      `Fizzwick is not wicked. He has worked every Christmas Eve for forty years and wanted everyone, himself included, to have the night off.`,
      `Agent Crumb, the last agent of the C.O.O.K.I.E. Department, sent the enchanted cookies that brought the bakers here. He is not sure he was allowed to.`
    ],
    outline: 'The three ingredient chapters can come in any order. Between them: at nine bells the town starts sneezing and the party visits Santa; at ten bells the snowman fountain’s nose runs and Dot Dunkwell brings news.',

    /* ---------------- the dictionary: people ---------------- */
    people: [
      { id: 'crumb', name: 'Agent Crumb', full: 'Agent Pumpernickel Crumb', role: 'Last field agent of the C.O.O.K.I.E. Department', img: 'img/dm_crumb.webp',
        where: 'C.O.O.K.I.E. headquarters, a broom cupboard behind the Rolling Pin bakery',
        look: 'A very small elf in a very large trench coat and a fedora with holly in the band. Carries a magnifying glass and evidence bags full of crumbs.',
        voice: 'A 1940s detective. Low, flat, weary. Narrates his own actions out loud.',
        wants: 'To save the Yule Batch and prove his tiny department still matters.',
        secret: 'He sent the enchanted cookies without asking anyone. Also, he cannot bake. He burns toast.',
        lines: ['“The name’s Crumb. Agent Crumb. Committee of Operatives Keeping Ingredients Enchanted. We’re in the phone book. Under C.”', '“It was a cold night. They’re all cold nights. It’s the North Pole.”', '“I’ve seen things, kid. Fig rolls gone bad. Fruitcake that fought back.”', '“I looked at the cookie. The cookie looked at me. One of us was going to crumble.”'] },
      { id: 'mrsclaus', name: 'Mrs. Claus', full: 'Mrs. Claus', role: 'Runs the North Pole whenever Santa cannot', img: 'img/dm_mrs_claus.webp',
        where: 'Santa’s house, at the top of Gumdrop Lane',
        look: 'Silver bun, round glasses, apron. Holds her knitting needles like a general holds a baton.',
        voice: 'Warm, brisk, unflappable. Calls everyone “dear” or “pet”. Never raises her voice and never needs to.',
        wants: 'Santa in the air by midnight, and everyone fed first.',
        secret: 'She has quietly paid for the C.O.O.K.I.E. Department out of the knitting budget for years. She knows the true recipe by heart.',
        lines: ['“Right then, dears. Cocoa first, panic after.”', '“He’s a wonderful man and a dreadful patient.”', '“I’ve run this place through blizzards, a reindeer strike and the Great Tinsel Shortage. We’ll manage a few cookies.”'] },
      { id: 'santa', name: 'Santa', full: 'Santa Claus', role: 'In bed with the Sneezles', img: 'img/dm_santa.webp',
        where: 'Santa’s house, upstairs, under four quilts',
        look: 'Striped pyjamas, nightcap, a very red nose. Every sneeze blows his beard sideways and his hat across the room.',
        voice: 'Big, jolly and bunged up. Every “ho ho ho” turns into a sneeze.',
        wants: 'To fly tonight. He has never missed a Christmas and does not plan to start.',
        secret: 'He ate four of the bad cookies, not one. He will not admit it.',
        lines: ['“Ho ho ha... ha... HATCHOOO!”', '“I’ve never bissed a Christbas yet.”', '“You’re the bakers? Oh, thank goodness. The cookies have been... HATCHOO... dreadful.”'] },
      { id: 'grumbleknot', name: 'Grumbleknot', full: 'Grumbleknot the troll', role: 'Shoemaker, and the grumpiest soul in town', img: 'img/dm_grumbleknot.webp',
        where: 'The Cobbler’s Nook, under Peppermint Bridge',
        look: 'Huge, mossy and hunched, with tiny spectacles. Makes exquisite little elf shoes with enormous fingers.',
        voice: 'Slow, gravelly, full of sighs. Finishes sentences with “Hmph.”',
        wants: 'He says: to be left alone. Really: for someone to laugh with him, not at him.',
        secret: 'He tells jokes to his shoes at night, lined up like an audience. He is on the Naughty List for “three hundred years of grumpiness” and it hurt his feelings. His own boots are too tight.',
        lines: ['“Shop’s closed. Shop’s always closed.”', '“I don’t laugh. I had a laugh once. Didn’t care for it.”', '“Heard that one. Sixteen forty-two. Wasn’t funny then.”', 'His own joke, if coaxed: “Why did the boot go to school? ... To get re-soled.”'] },
      { id: 'thunderhoof', name: 'Dame Thunderhoof', full: 'Dame Thunderhoof', role: 'Retired lead reindeer, head of the Flying School', img: 'img/dm_thunderhoof.webp',
        where: 'Frostwhistle Peak',
        look: 'Grey around the muzzle, leather flying cap, long white scarf, megaphone. Stands very straight.',
        voice: 'A brisk old flight instructor. Short orders. “Chin up! Antlers level!”',
        wants: 'Her students to pass their Christmas Eve flight test.',
        secret: 'She has not left the ground since the Weathervane Incident. She saved the whole team that night and blames herself anyway. She is afraid to fly.',
        lines: ['“In MY day we flew uphill, both ways, in a blizzard, and we LIKED it.”', '“Nobody flies tonight. Weather’s ghastly.” (The sky is perfectly clear.)', '“Chin up! Antlers level! Hooves tucked! No, your OTHER hooves!”'] },
      { id: 'calves', name: 'Pip and Squeak', full: 'Pip and Squeak', role: 'Student flyers, both dreadful', img: 'img/dm_pip_squeak.webp',
        where: 'Frostwhistle Peak, usually upside down',
        look: 'Two tiny reindeer calves in goggles far too big for them.',
        voice: 'Fast, squeaky, both talking at once.',
        wants: 'To fly with the big team one day.',
        secret: 'Pip can only fly in circles. Squeak can only fly backwards. Together, tied side by side, they almost fly straight.',
        lines: ['“I’m flying! I’m flying! ... I’m still flying in a circle!”', '“We can take you! We’ve nearly never crashed!”'] },
      { id: 'twice', name: 'Checker Twice', full: 'Mr. Checker Twice', role: 'Keeper of the Naughty and Nice Lists', img: 'img/dm_twice.webp',
        where: 'The List Office, at a desk as tall as a wardrobe',
        look: 'Ancient, thin as a quill, two pairs of glasses on one nose, ink to the elbows.',
        voice: 'Dry and precise. Says the important word of every sentence twice.',
        wants: 'A correct list. Forms in duplicate.',
        secret: 'He checks everything twice because long ago he put a nice child on the Naughty List by mistake. He never forgave himself. His own lump of coal is hidden in his desk drawer.',
        lines: ['“Name? Name?”', '“I check it. Twice.”', '“Forgiveness is form F-12. In duplicate. Duplicate.”'] },
      { id: 'fizzwick', name: 'Director Fizzwick', full: 'Director Fizzwick', role: 'Head of D.O.U.G.H., inventor of the shortcut', img: 'img/dm_fizzwick.webp',
        where: 'The Rolling Pin bakery, at the controls of the Cookie-Matic',
        look: 'Sharp suit, slick hair, clipboard, stopwatch, a tie covered in tiny bar charts.',
        voice: 'Fast, bright, all business words. Gets squeakier as things go wrong.',
        wants: 'Everything done faster. Underneath: one Christmas Eve off.',
        secret: 'He has worked every Christmas Eve for forty years. He built the machine so that nobody would have to. He knows it has gone wrong and has no idea how to stop it.',
        lines: ['“Laughter is not scalable.”', '“We’ve optimised joy by eleven percent!”', '“It’s fine! It’s a soft launch!”', 'When he cracks: “I just wanted one night. One. With my slippers on.”'] },
      { id: 'cookiematic', name: 'The Cookie-Matic 3000', full: 'The Cookie-Matic 3000', role: 'A cookie machine that will not stop', img: 'img/dm_cookiematic.webp',
        where: 'Filling the main hall of the Rolling Pin bakery',
        look: 'Brass, candy-striped pipes, conveyor belts, piping-bag arms and a glowing oven door for a face.',
        voice: 'A cheerful announcer. Speaks in capital letters.',
        wants: 'MORE COOKIES.',
        secret: 'It is not mean, only proud. It badly wants to make good cookies and has never tasted one. Compliments make it wobble. The true recipe makes it weep sprinkles.',
        lines: ['“NOW BAKING: FUN.”', '“COOKIE OUTPUT AT NINE HUNDRED PERCENT. YOU ARE WELCOME.”', '“PLEASE REMAIN CALM AND DELICIOUS.”'] },
      { id: 'dot', name: 'Dot Dunkwell', full: 'Dot Dunkwell', role: 'Apprentice baker and the party’s biggest fan', img: 'img/dm_dot.webp',
        where: 'Wherever the party is, a few steps behind, holding an autograph book',
        look: 'A small elf in a chef hat that keeps falling over her eyes. Flour on her nose.',
        voice: 'Breathless and thrilled. Hiccups mid-sentence, and each hiccup jingles.',
        wants: 'To bake like the champions. To help.',
        secret: 'She was the first to taste the bad batch and has had jingling hiccups ever since. She saw Fizzwick pour the fake ingredients in.',
        lines: ['“You’re THEM! The bake-off winners! I have your recipe on my wall!”', '“He poured it in from a can. A CAN. It said Laff-O-Lite on the side. *hic-jingle*”'] }
    ],

    /* ---------------- the dictionary: places ---------------- */
    places: [
      { id: 'evergleam', name: 'Evergleam', img: 'img/dm_arrival.webp', blurb: 'The village at the top of the world. Crooked houses, candy-cane lamp posts and a clock tower whose bells count down to the sleigh’s take-off at midnight.', senses: 'Smells of pine and warm sugar. Tonight it also smells, faintly, of farts.' },
      { id: 'rollingpin', name: 'The Rolling Pin', img: 'img/dm_bakery.webp', blurb: 'The great bakery of the North Pole, where the Yule Batch has been baked by hand for a thousand years. This year the Cookie-Matic 3000 fills the main hall.', senses: 'Hot, loud and sticky. Cookies ping off the walls.' },
      { id: 'hq', name: 'C.O.O.K.I.E. Headquarters', img: 'img/dm_hq.webp', blurb: 'A broom cupboard behind the bakery’s flour store. One desk, one filing cabinet, and the Mother Recipe in a frame above three empty jars.', senses: 'Smells of mop water and cold toast. There is only one chair.' },
      { id: 'peppermint', name: 'Peppermint Bridge and the Cobbler’s Nook', img: 'img/dm_bridge.webp', blurb: 'A striped stone bridge over the Cocoa Canal, frozen solid and crowded with skaters. Under the arch is Grumbleknot’s crooked little shop.', senses: 'Leather, boot polish and a kettle that is always almost boiling.' },
      { id: 'peak', name: 'Frostwhistle Peak', img: 'img/dm_peak.webp', blurb: 'Home of the Flying School: a short runway, a windsock, practice chimneys in every size. High above, in the Northern Lights, the year’s first snowflakes are born.', senses: 'Thin, sharp air. New snowflakes chime very quietly as they form.' },
      { id: 'listoffice', name: 'The List Office and the Coal Cellar', img: 'img/dm_list.webp', blurb: 'Canyons of filing drawers, rolling ladders and two enormous scrolls. Under a trapdoor is the Coal Cellar, where every lump has a name tag.', senses: 'Dust, ink and warm coal. The lumps tut quietly when you walk past.' },
      { id: 'santahouse', name: 'Santa’s House', img: 'img/dm_santa.webp', blurb: 'At the top of Gumdrop Lane. Tonight every window rattles when Santa sneezes.', senses: 'Cocoa, liniment and wet handkerchiefs.' },
      { id: 'square', name: 'Snowman Square', img: 'img/dm_drip.webp', blurb: 'The middle of Evergleam, with the bandstand, the clock tower and the great snowman fountain. By ten bells the snowman’s nose has started to run.', senses: 'Cold slush underfoot and the sound of sneezing from every doorway.' }
    ],

    /* ---------------- the dictionary: things ---------------- */
    things: [
      { id: 'batch', name: 'The Yule Batch', blurb: 'The enchanted cookies baked every Christmas Eve. One each keeps an elf merry all night and a reindeer in the air until dawn.' },
      { id: 'recipe', name: 'The Mother Recipe', blurb: 'One yellowed page in a frame at C.O.O.K.I.E. headquarters. Flour, butter, sugar, and three ingredients no shop sells.' },
      { id: 'laugh', name: 'The Belly Laugh', blurb: 'First ingredient. A real laugh from someone who had forgotten how. Caught in the Giggle Jar. The fake: Laff-O-Lite, canned laughter.' },
      { id: 'flake', name: 'The Unfallen Snowflake', blurb: 'Second ingredient. A snowflake that has never touched the ground, caught in the empty Snow Globe. Warm hands melt it. The fake: spray-on snow.' },
      { id: 'coal', name: 'The Forgiven Coal', blurb: 'Third ingredient. When someone on the Naughty List is truly forgiven, their lump of coal cracks open into dark, sparkling sugar. Lifted with the Sugar Tongs. The fake: plain coal dust.' },
      { id: 'kit', name: 'The Gatherer’s Kit', blurb: 'What Agent Crumb hands over: the Giggle Jar (catches laughter), the empty Snow Globe (catches a snowflake) and the Sugar Tongs (lifts forgiven coal).' },
      { id: 'effects', name: 'Bad-cookie effects', blurb: 'Eat a fake cookie and roll a d6. 1: endless farts for a minute. 2: three enormous sneezes. 3: a massively runny nose. 4: hiccups that jingle. 5: a squeaky voice. 6: nothing, which is suspicious. Players can roll this on their own phones.' },
      { id: 'cookiedept', name: 'The C.O.O.K.I.E. Department', blurb: 'The Committee of Operatives Keeping Ingredients Enchanted. Once thirty gatherers strong. Now one agent, one cupboard and no budget.' },
      { id: 'dough', name: 'D.O.U.G.H.', blurb: 'The Department of Output, Upgrades and General Hurry. Fizzwick’s department. Its motto is “Faster is festive.”' },
      { id: 'lists', name: 'The Naughty and Nice Lists', blurb: 'Two scrolls in the List Office. A name on the Naughty List has a lump of coal waiting in the cellar. Forgiveness, properly given, strikes the name off.' },
      { id: 'bells', name: 'The clock', blurb: 'The party arrives at eight bells. Each ingredient takes about an hour of story time. The finale starts at eleven. The sleigh leaves at midnight. It is there for urgency, not for bookkeeping.' }
    ]
  },

  /* ---------------- 3. flags: what the story remembers ---------------- */
  flags: {
    choir: { values: ['safe', 'tooty'] },
    /* the three ingredients: how good is each one? */
    laugh: { values: ['pure', 'partial', 'none'], tell: 'the laugh: {word}',
      words: { pure: 'a whole belly laugh', partial: 'only a small one', none: 'none, just a Hmph' },
      short: { pure: 'A whole belly laugh', partial: 'A small laugh', none: 'Only a Hmph' } },
    flake: { values: ['pure', 'partial', 'none'], tell: 'the snowflake: {word}',
      words: { pure: 'perfect', partial: 'slightly used', none: 'only one from Pip’s antlers' },
      short: { pure: 'A perfect snowflake', partial: 'A slightly used snowflake', none: 'One from Pip’s antlers' } },
    coal: { values: ['pure', 'partial', 'none'], tell: 'the coal: {word}',
      words: { pure: 'truly forgiven, turned to sugar', partial: 'half forgiven', none: 'still unforgiven coal' },
      short: { pure: 'Forgiven, turned to sugar', partial: 'Half forgiven', none: 'Still plain coal' } },
    /* friends made and things picked up on the way */
    ally_grumble: { values: [true], tell: 'Grumbleknot is an ally' },
    ally_thunder: { values: [true], tell: 'Dame Thunderhoof flies again and is an ally' },
    gift: { values: ['cocoa', 'key', 'scarf'], tell: 'Mrs. Claus gave them {word}', words: { cocoa: 'a flask of cocoa', key: 'Santa’s spare key', scarf: 'a forty-foot scarf' } },
    knows_fizz: { values: [true], tell: 'they know Fizzwick is the culprit' },
    twice_forgiven: { values: [true] },
    dot: { values: ['helped'] },
    machine: { values: ['friend', 'off'] },
    fizz: { values: ['forgiven', 'job', 'scolded'] },
    /* which ending the DM chose, if they changed the one the app suggested */
    batch: { values: ['perfect', 'good', 'scrappy'] }
  },
  /* Which ending do the three ingredients earn? Six points is a perfect batch, three a good one. */
  scores: { ingredients: { laugh: { pure: 2, partial: 1 }, flake: { pure: 2, partial: 1 }, coal: { pure: 2, partial: 1 } } },

  /* ---------------- 4. the clock ---------------- */
  clock: {
    deadline: 'The sleigh leaves at midnight.',
    times: [
      { when: { seen: 'midnight' }, say: 'Midnight' },
      { when: { seen: 'finale' }, say: 'Eleven bells' },
      { when: { count: 'interludes', atLeast: 2 }, say: 'Ten bells' },
      { when: { count: 'interludes', is: 1 }, say: 'Nine bells' },
      { say: 'Eight bells' }
    ]
  },

  /* ---------------- 5. the flow: chapters, interludes, the choice between errands ---------------- */
  flow: {
    start: 'arrival',

    chapters: [
      { id: 'arrival', title: 'Crash Landing', place: 'evergleam', time: 'Eight bells', img: 'img/dm_arrival.webp', length: 'About 20 minutes',
        goal: 'Land, meet Agent Crumb, learn the three ingredients, choose where to go first.',
        scenes: [
          { id: 'box', title: 'The winning batch', notesFirst: true,
            paint: 'In this scene the heroes are still ordinary human home bakers in aprons, in the kitchen of a small-town hall back home. They have not changed yet: do not show their creature forms.',
            notes: ['Before you begin, have every player open First Roll on their own phone, type your table code if you opened a table, and answer the cookie’s questions. That is the cookie deciding what they turn into.', 'When everyone has a character, read this.'],
            read: [`It is the night of the town’s Christmas cookie bake-off, and your team has just won. The trophy is on the counter. The winning cookies are in their box. Finally, you get to taste them.`,
              `But tucked between the cookies is a small folded note, sealed with red wax. It says: “The North Pole needs your help. Signed, the C.O.O.K.I.E. Department: the Committee of Operatives Keeping Ingredients Enchanted.”`,
              `A prank, obviously. You laugh. You each take a nibble. The kitchen begins to spin, the air smells of peppermint, and the floor is suddenly not there.`],
            cast: [],
            tries: [],
            outcomes: [{ id: 'go', label: 'They nibbled. On we go', log: 'The bakers ate the cookies and vanished from their kitchen.' }] },
          { id: 'snowbank', title: 'Snowbank',
            read: [`WHUMP. You land face-first in a snowbank. Above you hang the Northern Lights, green and violet. Below you is a village of crooked roofs and candy-cane lamp posts, and a clock tower striking eight.`,
              `You sit up, and that is when you notice. Your hands are not your hands. Your friends are not quite your friends. The cookie has turned each of you into something else.`],
            notes: ['Go round the table. Ask each player: “What are you now, and what is the first thing you notice about your new body?”', 'Let them enjoy it. A reindeer discovering hooves is worth a minute.'],
            cast: [],
            tries: [
              { try: 'They panic about how to get home', roll: 'No roll needed', yes: 'Good. Let them. Then the bell strikes and something in the village goes PARP.', no: '' }
            ],
            outcomes: [{ id: 'go', label: 'Everyone has described their new self', log: 'The bakers landed outside Evergleam and discovered their new shapes.' }] },
          { id: 'square', title: 'A town in trouble',
            read: [`You walk into the village square and into chaos. An elf postman toots with every step like a tiny tuba. A baker sneezes and vanishes in a cloud of flour. Everyone, everywhere, is holding a half-eaten cookie.`,
              `Then you hear rumbling. A cart piled high with cookies has slipped its brake and is rolling downhill, faster and faster, straight at the bandstand, where the Evergleam Infant Choir is halfway through “Jingle Bells”.`],
            notes: ['First action scene. It teaches everyone how rolling works. Any sensible plan succeeds on a medium roll.', 'If a player eats a cookie, wonderful: have them roll the bad-cookie d6 on their phone.'],
            cast: [],
            tries: [
              { try: 'Grab the cart and haul it back', roll: 'Athletics, medium (13)', yes: 'Heels dig in, snow sprays, and the cart stops a whisker from the bandstand. The choir applauds.', no: 'The cart drags you along like a water-skier. It stops, but only because you hit the bandstand first.' },
              { try: 'Block it or tip it over', roll: 'Any clever idea, medium (13)', yes: 'The cart tips. Cookies fountain into the air and come down like hail. Not one reaches a child.', no: 'It tips the wrong way. Cookies skitter across the square and the choir dives for them.' },
              { try: 'Warn the choir', roll: 'Persuasion or Performance, easy (10)', yes: 'Twenty tiny elves scatter in perfect formation, still singing.', no: 'They think it is part of the song and sing louder.' },
              { try: 'Eat the evidence', roll: 'No roll. Roll the bad-cookie d6 instead', yes: 'Whatever the d6 says, it happens immediately and in public.', no: '' }
            ],
            outcomes: [
              { id: 'saved', label: 'The choir is safe', sets: { choir: 'safe' }, log: 'The bakers stopped the runaway cookie cart and saved the Infant Choir.' },
              { id: 'tooty', label: 'The choir got cookied', sets: { choir: 'tooty' }, log: 'The cart reached the choir. The Infant Choir now toots in four-part harmony.' }
            ] },
          { id: 'crumb', title: 'The name’s Crumb',
            read: [`A very small figure in a very large trench coat steps out of the shadows and holds up a badge shaped like a biscuit.`,
              `“The name’s Crumb. Agent Crumb. Committee of Operatives Keeping Ingredients Enchanted. You got my note. You ate my cookies. Good. Walk with me.”`,
              `He leads you behind the bakery, through the flour store, and into what is very clearly a broom cupboard. On the wall hangs a single yellowed page in a frame, above three empty jars.`,
              `“The Mother Recipe. Three ingredients no shop sells. A belly laugh from someone who had forgotten how. A snowflake that has never touched the ground. A lump of coal that has been forgiven. This year somebody used fakes. Now Santa is in bed with the Sneezles, and the sleigh leaves at midnight.”`],
            also: [
              { when: { flag: 'choir', is: 'tooty' }, read: `From the square, faintly, comes “Silent Night”, performed entirely in toots. Crumb closes his eyes. “That’s the sound of a town running out of time.”` },
              { when: { flag: 'choir', is: 'safe' }, read: `“Nice work with the cart,” he adds. “I’d have helped. I was busy narrating.”` }
            ],
            notes: ['Crumb gives them the Gatherer’s Kit: the Giggle Jar, the empty Snow Globe and the Sugar Tongs.', 'He tells them where each ingredient is: the laugh from Grumbleknot the troll shoemaker under Peppermint Bridge, the snowflake above Frostwhistle Peak, the coal in the cellar of the List Office.', 'He cannot come. He has to guard the last of the good flour. Really, he is frightened of the troll.', 'If they ask who used the fakes: “I have a hunch. I always have a hunch. Bring me ingredients and I’ll bring you a culprit.”', 'Let the players pick where to go first. The order changes things later.'],
            cast: ['crumb'],
            tries: [
              { try: 'Ask why he picked them', roll: 'No roll needed', yes: '“I needed bakers. Real ones. Everyone up here has forgotten how to do it by hand.” He will not meet their eyes. “Also yours was the only address I had.”', no: '' },
              { try: 'Ask Crumb to bake it himself', roll: 'No roll needed', yes: 'He looks at his shoes. “I burn toast, kid. I burned soup once.”', no: '' },
              { try: 'Search the cupboard', roll: 'Investigation, easy (10)', yes: 'In the bin: an empty can labelled Laff-O-Lite, “now with 40% more chuckle”. Crumb bags it. “Evidence.”', no: 'Mops. So many mops.' }
            ],
            outcomes: [{ id: 'go', label: 'They have the kit. Choose the first errand', log: 'Agent Crumb explained the three ingredients and handed over the Giggle Jar, the Snow Globe and the Sugar Tongs.' }] }
        ],
        next: [{ to: 'errands' }]
      },

      { id: 'laugh', title: 'The Laugh', place: 'peppermint', img: 'img/dm_bridge.webp', length: 'About 30 minutes',
        goal: 'Make Grumbleknot the troll laugh, and catch the laugh in the Giggle Jar.',
        flag: 'laugh',
        perks: [
          { when: { before: ['coal', 'laugh'] }, text: 'They have been to the List Office. They saw Grumbleknot’s name on the Naughty List: “three hundred years of grumpiness”. If they mention it kindly, he goes very quiet. It is the way in.' },
          { when: { all: [{ flag: 'flake', is: 'pure' }, { before: ['snow', 'laugh'] }] }, text: 'They carry a perfect snowflake. Its twinkle through the glass is the first thing in a century that makes Grumbleknot look up from his work. One roll in the “Make him laugh” scene is easier.' },
          { when: { flag: 'ally_thunder' }, text: 'Dame Thunderhoof flies them here and lands, heavily, on his roof. He is furious. It is a very funny entrance. Start him extra grumpy.' }
        ],
        scenes: [
          { id: 'nook', title: 'Under the bridge',
            read: [`Peppermint Bridge arches over the Cocoa Canal, which is frozen solid and crowded with skating elves. Under the arch, a crooked little shop leans against the stone. The sign is shaped like a boot.`,
              `Inside, an enormous mossy troll sits hunched over a workbench, stitching a shoe no bigger than a walnut. He does not look up.`,
              `“Shop’s closed,” he says. “Shop’s always closed.”`],
            notes: ['Grumbleknot is not dangerous, only immovable. He will not throw them out. He will simply sigh at them.', 'Things to notice in the shop: a hundred pairs of tiny shoes arranged in neat rows, all facing a little stool, like an audience. A notice pinned by the door from the List Office. His own boots, which are clearly two sizes too small.'],
            cast: ['grumbleknot'],
            tries: [
              { try: 'Look around the shop', roll: 'Perception, easy (10)', yes: 'The shoes are set out in rows facing a stool. Like seats in a theatre. There is a worn patch on the floor where someone stands in front of them.', no: 'Shoes. Leather. A kettle. Nothing strange, unless shoes in rows are strange.' },
              { try: 'Read the notice by the door', roll: 'No roll needed', yes: '“NAUGHTY LIST. Grumbleknot, troll. Offence: grumpiness, three hundred years (ongoing).” Someone has drawn a tiny sad face next to it in pencil.', no: '' },
              { try: 'Order a pair of shoes', roll: 'Persuasion, medium (13)', yes: 'He measures the foot in silence, then mutters, “Nice arches. Hmph.” It is the closest thing to a compliment he has given since 1802.', no: '“Closed.”' }
            ],
            outcomes: [{ id: 'go', label: 'They are in, and he is ignoring them', log: 'The bakers found Grumbleknot the troll in his shop under Peppermint Bridge.' }] },
          { id: 'joke', title: 'Make him laugh',
            read: [`“A laugh?” Grumbleknot puts down his needle. “I don’t laugh. I had a laugh once. Didn’t care for it.” He picks the needle up again. “Go on, then. Everyone tries.”`],
            notes: ['The rule for this scene: if the real people at your table laugh, Grumbleknot laughs. You do not need the dice to tell you.', 'Jokes told AT him bounce off. He has heard them all. Rate each one out loud, harshly.', 'What actually works: getting him to tell his own joke and laughing at it. Helping with his tight boots. Being kind about the Naughty List. Honest slapstick, which he finds hilarious and tries to hide.', 'His joke: “Why did the boot go to school? To get re-soled.” If the table groans, that counts.'],
            cast: ['grumbleknot'],
            tries: [
              { try: 'Tell him a joke', roll: 'Performance, hard (16). Or just judge the joke', yes: 'One corner of his mouth twitches. He covers it with a cough that shakes the shelves.', no: '“Heard it. Sixteen forty-two. Wasn’t funny then.”' },
              { try: 'Slapstick: fall over, drop something, slip on the ice', roll: 'Acrobatics, medium (13)', yes: 'A sound escapes him like a kettle starting to boil. He turns to the wall. His shoulders are shaking.', no: 'You fall over properly, and it hurts your pride. He says, “Mind the lasts.”' },
              { try: 'Ask about the shoes in rows, or ask him for a joke', roll: 'Insight or Persuasion, medium (13)', yes: 'A long silence. Then, very quietly: “Why did the boot go to school?” He waits. “To get re-soled.” He watches your faces like a child watching a kettle.', no: '“They’re shoes. They’re in rows. That’s what shoes do.” But he glances at the stool.' },
              { try: 'Help with his too-tight boots', roll: 'Athletics to pull, or Sleight of Hand to unlace, medium (13)', yes: 'The boot comes off with a POP. He wiggles ten enormous toes and makes a noise like a sigh turning into something else.', no: 'The boot does not move. You do. You fly backwards into a shelf of slippers.' },
              { try: 'Tickle him', roll: 'Only works with a boot off. Then no roll needed', yes: 'Troll feet are extremely ticklish. Everybody knows this except trolls.', no: 'Through the boot? “Hmph.”' },
              { try: 'Tell him the Naughty List is wrong about him', roll: 'Persuasion, easy (10)', yes: 'He takes off his spectacles and polishes them for a very long time. “...I send shoes to the ones who’ve none. Every year. Nobody checks THAT twice.”', no: 'He grunts, but he heard you.' }
            ],
            otherwise: 'Anything that makes your table laugh makes him laugh. Anything kind makes him soften, and makes the next try easier.',
            outcomes: [
              { id: 'laughed', label: 'He laughs. A real one', log: 'Grumbleknot the troll laughed for the first time in a hundred years.' },
              { id: 'chuckle', label: 'He manages a chuckle', sets: { laugh: 'partial' }, skip: 1, log: 'Grumbleknot gave a small chuckle. The bakers caught it in the Giggle Jar. It is only a little one.' },
              { id: 'none', label: 'Nothing. He will not laugh', sets: { laugh: 'none' }, skip: 1, log: 'Grumbleknot would not laugh. He gave them a “Hmph” to take away instead.' }
            ] },
          { id: 'chase', title: 'The laugh gets away',
            read: [`It starts in his boots. It rumbles up through his belly like a train in a tunnel. And then Grumbleknot LAUGHS, so hard the bridge shakes and snow slides off every roof on the canal.`,
              `The laugh is so big you can see it: a wobbling golden bubble, the size of a pumpkin. It bounces off the workbench, out of the door, and away down the frozen canal, and every skater it touches bursts into giggles.`],
            notes: ['A quick chase on the ice. The laugh must be caught in the Giggle Jar before it bounces out to sea.', 'It is not hard. It should be silly. Two or three rolls, then it is in the jar.', 'Grumbleknot watches from the door, wiping his eyes. “Hmph. ... Do it again.”'],
            cast: ['grumbleknot'],
            tries: [
              { try: 'Skate after it', roll: 'Acrobatics, medium (13)', yes: 'You swoop under the bridge, jar out like a butterfly net, and the laugh drops in with a sound like a hiccup.', no: 'You skate straight through it. For the next minute you cannot stop giggling, and neither can anyone you look at.' },
              { try: 'Head it off', roll: 'Athletics or a clever plan, medium (13)', yes: 'It bounces off your chest, off a lamp post, off a very surprised penguin, and into the jar.', no: 'It bounces over your head. A whole row of skaters collapses laughing.' },
              { try: 'Lure it back with something funny', roll: 'Performance, easy (10)', yes: 'The laugh wobbles, turns round, and bounces back for more.', no: 'Everyone’s a critic. It keeps going.' }
            ],
            outcomes: [
              { id: 'pure', label: 'The whole laugh is in the jar', sets: { laugh: 'pure', ally_grumble: true }, log: 'The bakers caught Grumbleknot’s whole belly laugh in the Giggle Jar. He gave them a pair of spring-heeled boots and promised to help.' },
              { id: 'partial', label: 'They caught some of it', sets: { laugh: 'partial', ally_grumble: true }, log: 'Most of the laugh bounced away, but the bakers caught a good giggle in the jar. Grumbleknot is their friend now.' }
            ] }
        ],
        leaving: [
          { when: { flag: 'laugh', is: 'pure' }, read: `The Giggle Jar is warm, and it shakes now and then with a small golden snort. Grumbleknot presses something into your hands: a pair of boots with springs in the heels. “For jumping,” he says. “Now clear off.” He is smiling. He is trying not to. “And if you need a door kicked in tonight, I’ve the boots for it.”` },
          { when: { flag: 'laugh', is: 'partial' }, read: `The Giggle Jar holds a small, bright giggle that taps against the glass. “It’s not my best work,” says Grumbleknot. He looks at you over his spectacles. “Come back after Christmas. I’ve another joke.”` },
          { when: { not: { flag: 'laugh', in: ['pure', 'partial'] } }, read: `Grumbleknot goes back to his stitching. But as you leave, he clears his throat. “Hmph,” he says, and somehow a small grey puff of it drifts into the jar. Agent Crumb will have to decide whether a Hmph can stand in for a laugh.` }
        ],
        /* after the first errand the town starts sneezing; after the second its nose runs; after the third, the bakery */
        next: [{ when: { count: 'picks', is: 1 }, to: 'sneezles' }, { when: { count: 'picks', is: 2 }, to: 'drip' }, { to: 'finale' }]
      },

      { id: 'snow', title: 'The Snowflake', place: 'peak', img: 'img/dm_peak.webp', length: 'About 30 minutes',
        goal: 'Get above the clouds and catch a snowflake that has never touched the ground.',
        flag: 'flake',
        perks: [
          { when: { all: [{ flag: 'ally_grumble' }, { flag: 'laugh', is: 'pure' }] }, text: 'They have Grumbleknot’s spring-heeled boots. Whoever wears them can leap as high as a chimney. One roll to get airborne is easier, and the jump is spectacular.' },
          { when: { all: [{ before: ['laugh', 'snow'] }, { flag: 'laugh', isNot: 'none' }] }, text: 'The Giggle Jar is catching. If it is opened a crack near Pip and Squeak, they stop being nervous and start being giddy. That is not safer, but it is braver.' },
          { when: { before: ['coal', 'snow'] }, text: 'In the List Office they saw Dame Thunderhoof’s file: “Weathervane Incident. Saved entire team. Blames herself anyway.” They know why she will not fly before she says a word.' }
        ],
        scenes: [
          { id: 'school', title: 'The Flying School',
            read: [`The path up Frostwhistle Peak ends at a short runway lined with lanterns. There is a windsock, a row of practice chimneys from “cottage” to “castle”, and overhead the Northern Lights, close enough to touch.`,
              `An old reindeer in a flying cap marches along the runway with a megaphone. “Chin up! Antlers level! Hooves tucked! No, Pip, your OTHER hooves!” Above her, one small reindeer flies in a tight circle. Another flies past, backwards.`],
            notes: ['Dame Thunderhoof will not take them up. “Nobody flies tonight. Weather’s ghastly.” The sky is perfectly clear.', 'She teaches from the ground and has for years. The students have noticed. Nobody has dared ask.', 'The snowflakes they need are forming right now, up in the lights, with a sound like tiny bells.'],
            cast: ['thunderhoof', 'calves'],
            tries: [
              { try: 'Ask her to fly them up', roll: 'Persuasion, hard (16)', yes: 'Her ears go flat. “I said the weather is ghastly.” A pause. “...Why. What’s up there that matters so much?”', no: '“Request denied. Next!”' },
              { try: 'Ask the calves about her', roll: 'No roll needed', yes: 'Pip, upside down: “She’s the best flyer that ever was!” Squeak, backwards: “She’s never flown with us. Not once. We’re not supposed to notice.”', no: '' },
              { try: 'Look at the photographs in the tower', roll: 'Investigation, easy (10)', yes: 'Old sleigh teams, year after year, and always the same reindeer in front. The last photograph is dated long ago. A bent weathervane hangs beside it, like a trophy nobody wanted.', no: 'Lots of pictures of reindeer. They all look alike to you. Sorry.' }
            ],
            outcomes: [{ id: 'go', label: 'They need a way up', log: 'The bakers reached the Flying School on Frostwhistle Peak. Dame Thunderhoof refused to fly.' }] },
          { id: 'airborne', title: 'Getting airborne',
            read: [`The snowflakes are up there. You are down here. Between the two is a great deal of very cold air.`],
            notes: ['There are several ways up. All of them are good. Pick whichever the players reach for.', 'Dame Thunderhoof: needs coaxing. She is afraid, and proud. Asking for HELP works better than telling her to be brave. If the calves are in danger, she is in the air before she remembers she is frightened.', 'Pip and Squeak: delighted to help. Pip flies in circles, Squeak flies backwards. Harnessed side by side they go roughly straight, and roughly up.', 'The practice catapult: used for launching sacks at chimneys. It will launch a baker.', 'Climbing the peak: slow, cold, hard.'],
            cast: ['thunderhoof', 'calves'],
            tries: [
              { try: 'Help Dame Thunderhoof find her nerve', roll: 'Persuasion or Insight, medium (13). Easier if they are kind rather than pushy', yes: 'She looks at the sky for a long moment. “Hooves tucked,” she tells herself. Then she runs, and leaps, and she is magnificent.', no: 'She paws the snow. “Perhaps after Christmas.” She hates herself for saying it.' },
              { try: 'Ride Pip and Squeak', roll: 'Animal Handling, medium (13)', yes: 'Tied together they wobble into the sky in a wide, rising spiral, both screaming with joy.', no: 'You go up. Also sideways, and briefly through the windsock.' },
              { try: 'Use the catapult', roll: 'Acrobatics, hard (16). Or Arcana or Investigation to aim it', yes: 'THWANG. For three seconds you are the fastest baker in history.', no: 'THWANG. You sail gracefully over the peak and into a snowdrift on the far side. Try again.' },
              { try: 'Climb', roll: 'Athletics, hard (16)', yes: 'Hand over hand, to the very tip of the peak, where the lowest ribbon of the lights brushes your hat.', no: 'Halfway up you meet a mountain goat who is clearly judging you.' }
            ],
            otherwise: 'If the calves get into trouble in the air, Dame Thunderhoof flies. Use that if the scene needs a rescue.',
            outcomes: [
              { id: 'dame', label: 'Dame Thunderhoof flew them', sets: { ally_thunder: true }, log: 'Dame Thunderhoof faced her fear and flew the bakers above the clouds.' },
              { id: 'other', label: 'They got up another way', log: 'The bakers reached the sky without Dame Thunderhoof.' },
              { id: 'stuck', label: 'They never got off the ground', sets: { flake: 'none' }, skip: 1, log: 'The bakers could not get above the clouds. Pip shook a snowflake off his antlers for them. It might do.' }
            ] },
          { id: 'aurora', title: 'Above the clouds',
            read: [`You rise through the cloud and into silence. The Northern Lights hang all around you like curtains, and in their glow, with a sound like the smallest bells in the world, snowflakes are being born.`,
              `Each one is different. Each one drifts down slowly, and has never touched anything at all.`],
            notes: ['Catching one: it must go straight into the empty Snow Globe. A bare hand melts it. A mitten counts as touching.', 'Add one small complication, then let them win: a gust of wind, a snow owl who collects shiny things, or a snowflake that is shy and keeps dodging.', 'This is the quiet, pretty scene of the adventure. Let it be pretty.'],
            cast: ['thunderhoof', 'calves'],
            tries: [
              { try: 'Scoop one with the globe', roll: 'Sleight of Hand or Acrobatics, medium (13)', yes: 'It settles inside the glass and keeps falling, slowly, forever. The globe glows.', no: 'It lands on your sleeve instead. It is still beautiful. It is also, technically, used.' },
              { try: 'Coax a shy one', roll: 'Animal Handling or Persuasion, easy (10)', yes: 'It circles your head twice, considers, and drifts into the globe of its own accord.', no: 'It hides behind another snowflake.' },
              { try: 'Deal with the snow owl', roll: 'Trade it something shiny, or Intimidation, medium (13)', yes: 'The owl takes a button, or thinks better of it, and glides off into the lights.', no: 'The owl takes your hat. You may have the snowflake.' }
            ],
            outcomes: [
              { id: 'pure', label: 'A perfect snowflake, never touched', sets: { flake: 'pure' }, log: 'The bakers caught a perfect snowflake in the Snow Globe, high in the Northern Lights.' },
              { id: 'partial', label: 'They got one, but it touched something', sets: { flake: 'partial' }, log: 'The bakers caught a snowflake, but it touched a mitten on the way. It is slightly used.' }
            ] }
        ],
        leaving: [
          { when: { flag: 'flake', is: 'pure' }, read: `The Snow Globe glows like a lantern, and inside it one snowflake falls and falls and never lands. Far below, the clock tower begins to strike.` },
          { when: { flag: 'flake', is: 'partial' }, read: `The snowflake in the globe has one bent point where it touched wool. It still glows, a little unevenly. It will have to do.` },
          { when: { not: { flag: 'flake', in: ['pure', 'partial'] } }, read: `Pip lands in a heap and shakes his head, and one snowflake that had been caught in his antlers drifts into the globe. “That one’s never touched the ground!” says Squeak. “It’s touched Pip.” “Pip’s not the ground!” It is a fair point.` },
          { when: { flag: 'ally_thunder' }, read: `Dame Thunderhoof lands without a sound, exactly on the centre line. Her students are staring. “Well?” she barks. “Don’t gawp. Notes!” Then, quietly, to you: “If you need wings again tonight, whistle.”` }
        ],
        /* after the first errand the town starts sneezing; after the second its nose runs; after the third, the bakery */
        next: [{ when: { count: 'picks', is: 1 }, to: 'sneezles' }, { when: { count: 'picks', is: 2 }, to: 'drip' }, { to: 'finale' }]
      },

      { id: 'coal', title: 'The Coal', place: 'listoffice', img: 'img/dm_list.webp', length: 'About 30 minutes',
        goal: 'Find a lump of coal in the Coal Cellar and get it truly forgiven.',
        flag: 'coal',
        perks: [
          { when: { all: [{ flag: 'laugh', is: 'pure' }, { before: ['laugh', 'coal'] }] }, text: 'Grumbleknot has laughed. His name has just been struck off the Naughty List, and Checker Twice is cross about the paperwork but secretly pleased. He is a little softer with the party.' },
          { when: { all: [{ flag: 'flake' }, { flag: 'flake', isNot: 'none' }, { before: ['snow', 'coal'] }] }, text: 'The Snow Globe glows. In the pitch-dark cellar it is as good as a lantern, and the soot sprites are fascinated by it. No fumbling in the dark, and the sprites help rather than hinder.' },
          { when: { flag: 'ally_thunder' }, text: 'Dame Thunderhoof can drop them on the List Office roof. There is a skylight. Checker Twice does not check the skylight even once.' }
        ],
        scenes: [
          { id: 'office', title: 'The List Office',
            read: [`The List Office is a canyon of filing drawers that rises into darkness. Two enormous scrolls hang from the ceiling: one long, one very long. Pneumatic tubes go THOOMP.`,
              `At a desk as tall as a wardrobe sits an elf as thin as a quill, wearing two pairs of glasses. He peers down at you.`,
              `“Name?” he says. “Name?”`],
            notes: ['Checker Twice will explain the rule, twice. A lump of coal is forgiven only when the one named on its tag is truly forgiven by someone they wronged. Then it turns to sugar.', 'He wants form F-12, in duplicate. He will not let them into the cellar without it. He is not unkind, only exact.', 'The freshest entry on the Naughty List is still wet: “FIZZWICK, Director. Replaced a laugh with a laugh track.” If they read it, they know who is behind the bad cookies.', 'His own secret lump is in his desk drawer. See his entry in Lookup.'],
            cast: ['twice'],
            tries: [
              { try: 'Fill in the forms properly', roll: 'Investigation or History, medium (13)', yes: 'He checks it. He checks it again. A very small nod. “Acceptable. Acceptable.” He hands over a brass key.', no: 'He hands it back covered in red ink. “Section four. Section four.”' },
              { try: 'Sweet-talk him', roll: 'Persuasion, hard (16)', yes: '“Highly irregular.” He looks at the clock tower through the window. “...Irregular times. Ten minutes. Ten.”', no: '“Flattery is form F-9. You have not filed form F-9.”' },
              { try: 'Sneak past to the trapdoor', roll: 'Stealth, medium (13)', yes: 'He is checking something. Then checking it again. You are through the trapdoor before the second check.', no: '“Ahem. Ahem.”' },
              { try: 'Read the Naughty List', roll: 'Perception, easy (10)', yes: 'The ink on the last line is still wet. “FIZZWICK, Director. Replaced a laugh with a laugh track.”', no: 'It is very long and the handwriting is very small.' }
            ],
            outcomes: [
              { id: 'clue', label: 'They are in, and they read Fizzwick’s name', sets: { knows_fizz: true }, log: 'The bakers got into the Coal Cellar and saw the newest name on the Naughty List: Director Fizzwick.' },
              { id: 'in', label: 'They are in', log: 'The bakers got into the Coal Cellar beneath the List Office.' }
            ] },
          { id: 'cellar', title: 'The Coal Cellar',
            read: [`Stone steps lead down into the dark. The cellar is warm and smells of fireplaces. Stretching away in every direction are shelves, and on every shelf sit lumps of coal, each with a little paper tag tied on with string.`,
              `As you pass, the lumps tut. Quietly. Disapprovingly.`],
            notes: ['They need a lump, and they need its owner forgiven. Offer this first, it is the heart of the chapter:', 'Ask each player: “There is a lump down here with your name on it. What does the tag say you did this year?” Then ask who at the table was wronged, and whether they forgive it. If the table goes “aww”, the coal turns.', 'Other lumps they might choose: Grumbleknot’s (three hundred years of grumpiness). Fizzwick’s, still warm, which can only be forgiven by facing him. Checker Twice’s own, hidden upstairs.', 'Fake forgiveness does nothing. The coal just sits there and tuts.', 'The soot sprites, little puffs with eyes, love to untie tags and swap them. They are mischief, not menace.'],
            cast: ['twice'],
            tries: [
              { try: 'Find a particular lump', roll: 'Investigation, medium (13). Easy with light', yes: 'Third shelf, between “borrowed a sled without asking” and “told a fib about the last mince pie”.', no: 'The soot sprites have swapped the tags again. This one says “Gerald”. None of you is Gerald.' },
              { try: 'Befriend the soot sprites', roll: 'Animal Handling or Performance, easy (10)', yes: 'They form a small sooty arrow pointing down the right aisle.', no: 'They untie your shoelaces and tie them to each other.' },
              { try: 'Forgive someone, and mean it', roll: 'No roll. Judge it at the table', yes: 'The lump goes quiet. A crack runs across it, and light comes out, warm and dark gold. The coal falls away like a shell, and inside is a crystal of sparkling sugar.', no: 'The lump tuts. It knows.' },
              { try: 'Just take a lump', roll: 'Sleight of Hand, easy (10)', yes: 'It is in your pocket. It is still coal. It grumbles in there.', no: 'It bites. Gently. Coal has no teeth, but it manages.' }
            ],
            otherwise: 'Any honest apology between two characters, or two players, is exactly what this scene is for.',
            outcomes: [
              { id: 'pure', label: 'Truly forgiven. The coal turned to sugar', sets: { coal: 'pure' }, log: 'One of the bakers was truly forgiven, and their lump of coal cracked open into sparkling sugar.' },
              { id: 'partial', label: 'Half-hearted. Sugar with a sooty middle', sets: { coal: 'partial' }, log: 'The forgiveness was a bit grudging. The coal turned to sugar on the outside only.' },
              { id: 'none', label: 'They took a lump, unforgiven', sets: { coal: 'none' }, log: 'The bakers carried off a lump of coal that has not been forgiven. It grumbles in the pocket.' }
            ] },
          { id: 'stamp', title: 'Stamped, twice',
            read: [`At the top of the steps Checker Twice is waiting with a rubber stamp in each hand.`,
              `“Forgiveness leaving the building must be stamped,” he says. “Stamped.”`],
            notes: ['A short closing beat. If the coal is truly forgiven he stamps the tag FORGIVEN, twice, and his hand shakes a little. He has not stamped that word in a long time.', 'If the players have been kind, or curious about him, his drawer comes open. Inside is one old lump with his own name on it: “Put a nice child on the wrong list. Once.” If they forgive HIM, or fetch someone who can (Mrs. Claus was that child), it is the sweetest moment in the adventure. It also gives them a second, perfect crystal.', 'If they are carrying unforgiven coal, he lets them go with a look. “It can still turn. They always can. Always.”'],
            cast: ['twice'],
            tries: [
              { try: 'Ask why he checks everything twice', roll: 'Insight, medium (13)', yes: 'Both pairs of glasses come off. “Because once I only checked once.” He slides the drawer open.', no: '“Because it says so. In the manual. I wrote the manual.”' },
              { try: 'Forgive Checker Twice', roll: 'No roll needed', yes: 'The old lump in the drawer splits with a sound like a sigh. He looks at the sugar for a long time. Then he stamps his own tag. Once. “...Once is enough.”', no: '' }
            ],
            outcomes: [
              { id: 'twice', label: 'They forgave Checker Twice too', sets: { coal: 'pure', twice_forgiven: true }, log: 'The bakers forgave Checker Twice for his old mistake. His own coal turned to sugar, and he gave it to them.' },
              { id: 'go', label: 'Stamped and out', log: 'Checker Twice stamped the bakers out of the List Office.' }
            ] }
        ],
        leaving: [
          { when: { flag: 'coal', is: 'pure' }, read: `In the Sugar Tongs sits a crystal the colour of dark honey, warm as a hand. Behind you, down in the cellar, the other lumps have stopped tutting. They are listening.` },
          { when: { flag: 'coal', is: 'partial' }, read: `The crystal in the tongs sparkles on the outside, but there is a small black heart in the middle of it. Forgiveness, with a grumble left in.` },
          { when: { not: { flag: 'coal', in: ['pure', 'partial'] } }, read: `The lump in your pocket is just coal. It mutters. But Checker Twice’s words follow you out into the snow: it can still turn. They always can.` }
        ],
        /* after the first errand the town starts sneezing; after the second its nose runs; after the third, the bakery */
        next: [{ when: { count: 'picks', is: 1 }, to: 'sneezles' }, { when: { count: 'picks', is: 2 }, to: 'drip' }, { to: 'finale' }]
      },

      { id: 'finale', title: 'The Cookie-Matic', place: 'rollingpin', time: 'Eleven bells', img: 'img/dm_bakery.webp', length: 'About 35 minutes',
        goal: 'Get into the bakery, stop the machine, bake the true Yule Batch by hand, and decide what happens to Fizzwick.',
        perks: [
          { when: { flag: 'ally_grumble' }, text: 'Grumbleknot is with them. One locked door or one jammed gear is his to deal with: a troll boot solves it, no roll needed.' },
          { when: { flag: 'ally_thunder' }, text: 'Dame Thunderhoof is circling overhead. Once tonight she can lift someone anywhere, or drop something exactly where it is needed.' },
          { when: { flag: 'gift', is: 'key' }, text: 'They have Santa’s spare key. It opens any one door at the North Pole, including the bakery’s.' },
          { when: { flag: 'gift', is: 'cocoa' }, text: 'They have Mrs. Claus’s flask of cocoa. Once tonight, any one failed roll may be rolled again.' },
          { when: { flag: 'gift', is: 'scarf' }, text: 'They have the scarf Mrs. Claus was knitting. It is forty feet long and unbreakable. Rope, lasso, safety line or gag for a machine’s gears.' },
          { when: { flag: 'knows_fizz' }, text: 'They already know Fizzwick is behind it. They can call him by name through the door, which rattles him badly.' },
          { when: { flag: 'dot', is: 'helped' }, text: 'Dot Dunkwell told them the machine’s weak spots: the big red lever on top, the plug behind the oven, and the fact that it melts when complimented.' }
        ],
        scenes: [
          { id: 'doors', title: 'Eleven bells',
            read: [`The clock tower strikes eleven. One hour.`,
              `The Rolling Pin bakery is shaking. Cookies are firing out of the chimney like fireworks and raining down across the whole village. Every window glows oven-red. From inside comes a cheerful, enormous voice: “COOKIE OUTPUT AT NINE HUNDRED PERCENT. YOU ARE WELCOME.”`,
              `At an upstairs window, an elf in a sharp suit is waving a clipboard. “It’s fine!” he shouts. “It’s a soft launch!”`],
            also: [
              { when: { not: { flag: 'knows_fizz' } }, read: `Agent Crumb appears at your elbow, pointing. “Director Fizzwick. Department of Output, Upgrades and General Hurry. I had a hunch.” He did not have a hunch.` }
            ],
            notes: ['The doors are locked from inside. Getting in should take one good idea, not ten minutes.', 'Fizzwick is not fighting them. He is panicking. He has lost control of his machine and cannot admit it.'],
            cast: ['fizzwick', 'crumb'],
            tries: [
              { try: 'Force the doors', roll: 'Athletics, hard (16). No roll with Grumbleknot or Santa’s key', yes: 'The doors burst open and a wave of warm cookies pours out and carries you back down the steps. Then you wade in.', no: 'The doors hold. A cookie hits you on the ear.' },
              { try: 'Down the chimney', roll: 'Acrobatics or Stealth, medium (13)', yes: 'You time it between volleys and drop into the hall in a cloud of soot and sprinkles.', no: 'You go down. A volley of cookies comes up. You meet in the middle.' },
              { try: 'The delivery chute round the back', roll: 'Investigation to find it, easy (10)', yes: 'A flour chute, just big enough. You slide in on your stomachs and arrive white from head to foot.', no: 'You find the bins. They are full of empty cans labelled Laff-O-Lite.' },
              { try: 'Talk Fizzwick into opening up', roll: 'Persuasion, medium (13). Easy if they use his name', yes: 'His face crumples. “...It won’t stop. I pressed stop. I pressed it twice.” The bolts slide back.', no: '“We’re not taking visitors during the rollout!” The window slams.' }
            ],
            outcomes: [{ id: 'go', label: 'They are inside', log: 'At eleven bells the bakers got inside the Rolling Pin bakery.' }] },
          { id: 'machine', title: 'The Cookie-Matic 3000',
            read: [`It fills the hall from floor to rafters: brass and candy-striped pipes, a dozen conveyor belts, arms that end in piping bags and cookie cutters, and in the middle a huge round oven door, glowing like a face.`,
              `The face turns towards you. “NEW ARRIVALS DETECTED,” it booms. “PLEASE REMAIN CALM AND DELICIOUS.”`],
            notes: ['This is the big set piece. Nobody is hurt: the machine’s attacks are icing, sprinkles, flour and conveyor belts carrying people the wrong way.', 'Three ways to win. Any one is enough: pull the big red lever on top. Pull the plug behind the oven. Or win the machine over. It is proud, it has never tasted a good cookie, and compliments make it wobble. If they show it the true ingredients it wants, desperately, to help.', 'Give each player one moment to shine, then let the best idea work.', 'Fizzwick hides under a table shouting unhelpful advice.'],
            cast: ['cookiematic', 'fizzwick'],
            tries: [
              { try: 'Climb the belts to the red lever', roll: 'Acrobatics or Athletics, medium (13)', yes: 'Belt to belt, like stepping stones on a river running the wrong way, and your hand closes on the lever.', no: 'The belt you are on reverses. You are carried, with dignity, into a rack of cooling trays.' },
              { try: 'Find and pull the plug', roll: 'Stealth to get behind it, or Investigation to spot it, medium (13)', yes: 'Behind the oven is a plug the size of a dustbin lid. It takes both hands and a foot on the wall.', no: 'A piping arm finds you first and ices “NAUGHTY” across your back.' },
              { try: 'Jam the gears', roll: 'Athletics or a clever tool, medium (13). No roll with Grumbleknot or the scarf', yes: 'There is a crunch, a clank, and a long descending whistle. One whole arm droops.', no: 'The gears chew it up and spit it out as a very small cookie.' },
              { try: 'Compliment it, reason with it, or offer it the real recipe', roll: 'Persuasion or Performance, medium (13). Easy if they show it a true ingredient', yes: 'The oven-door face flickers. “...GOOD COOKIES?” Sprinkles leak from its rivets like tears. “I HAVE ONLY EVER WANTED TO MAKE GOOD COOKIES.”', no: '“FLATTERY DETECTED. INCREASING OUTPUT.”' },
              { try: 'Shield the others from icing and sprinkles', roll: 'Athletics or Acrobatics, easy (10)', yes: 'You take a full blast of royal icing so the others can run. You will be picking it out of your ears until Easter.', no: 'You all get iced. You look like a set of wedding cake figures.' }
            ],
            otherwise: 'Baking ideas are the players’ home ground. Anything a real baker would do to a misbehaving oven deserves to work.',
            outcomes: [
              { id: 'friend', label: 'They won the machine over', sets: { machine: 'friend' }, log: 'The bakers talked the Cookie-Matic 3000 round. It wants to help make good cookies.' },
              { id: 'off', label: 'They shut it down', sets: { machine: 'off' }, log: 'The bakers shut the Cookie-Matic 3000 down.' }
            ] },
          { id: 'bake', title: 'Bake it right',
            read: [`The hall goes quiet. Flour drifts down like snow. On the long wooden table in the middle of the bakery are a bowl, a rolling pin, and a thousand years of floury handprints.`,
              `Agent Crumb sets the Mother Recipe against the bowl. “Half an hour,” he says. “I’d help, but, well.” He looks at the rolling pin as if it might bite him. “This is what you’re for.”`],
            also: [
              { when: { flag: 'machine', is: 'friend' }, read: `Behind you the Cookie-Matic lowers its biggest arm, very gently, and holds out a clean baking tray. “I WILL PREHEAT,” it whispers, as quietly as a thing that size can.` }
            ],
            notes: ['The players are champion bakers. This is their scene. Go round the table: each player takes one step (measure, mix, add an ingredient, roll, cut, bake, decorate) and says how their character does it.', 'One roll each, any skill that fits, easy (10). They are experts: let them roll twice and keep the better one.', 'Count the good ingredients, not the dice. The ingredients decide the batch. See the checklist below.', 'If something is missing or weak, give them a last chance right here. No laugh: somebody at the table has to make everyone laugh, now. No snowflake: Dame Thunderhoof or the calves can make one last dash. Coal unforgiven: it can still turn, in the next scene.'],
            cast: ['crumb', 'dot'],
            tries: [
              { try: 'Add the laugh', roll: 'No roll needed', yes: 'You open the jar over the bowl. The dough giggles. Then the bakers do. Then the whole bakery.', no: '' },
              { try: 'Add the snowflake', roll: 'Sleight of Hand, easy (10)', yes: 'It drifts out of the globe and lands on the dough, the first thing it has ever touched, and the dough turns white and sparkling all the way through.', no: 'It melts on the way down. One drop reaches the bowl. One drop might be enough.' },
              { try: 'Add the forgiven coal', roll: 'No roll needed', yes: 'The crystal dissolves like a sigh, and the whole bakery smells of toffee and woodsmoke.', no: 'Plain coal makes a plain black lump in the dough. It needs forgiving first.' },
              { try: 'Roll, cut, bake, decorate', roll: 'Any fitting skill, easy (10), rolled twice', yes: 'Perfect. Of course it is. You have done this ten thousand times.', no: 'It comes out lopsided. Agent Crumb says that gives it character.' }
            ],
            outcomes: [{ id: 'go', label: 'The batch is in the oven', log: 'The bakers baked the Yule Batch by hand.' }] },
          { id: 'fizz', title: 'Director Fizzwick',
            read: [`While the cookies bake, a small voice comes from under a table.`,
              `“Forty years,” says Director Fizzwick. His tie is in his cocoa. “Forty Christmas Eves. I’ve never once sat down. I thought, if a machine did the gathering, and a machine did the baking, then everybody could have the night off. Everybody.” He sniffs. “Even me.”`,
              `In his top pocket, wrapped in a memo, is a lump of coal. It is still warm. It was only put on the list today.`],
            notes: ['Let the players decide what happens to him. There is no wrong answer, but forgiveness is the one the story is built for.', 'If they forgive him and mean it, his coal cracks into sugar on the spot. That is a perfect third ingredient, in time for a second tray. It repairs a weak or missing coal.', 'Mrs. Claus may arrive here if you want a grown-up to back the players’ decision.'],
            cast: ['fizzwick', 'mrsclaus'],
            tries: [
              { try: 'Forgive him', roll: 'No roll. Judge it at the table', yes: 'The lump in his pocket goes off like a tiny firework, and he is suddenly holding a handful of dark sugar and crying into his clipboard.', no: 'He nods. The coal stays coal. He knew it would.' },
              { try: 'Give him a job', roll: 'No roll needed', yes: '“Taste-tester?” He takes off his headset. He has never looked so tired or so pleased. “I’d have to sit down for that.” “Yes,” says Mrs. Claus. “You would.”', no: '' },
              { try: 'Tell him off', roll: 'Intimidation, easy (10)', yes: 'He takes it. All of it. He writes “do not replace laughter with cans” on his clipboard and underlines it twice.', no: 'He starts explaining his quarterly targets. Mrs. Claus puts a cookie in his mouth.' }
            ],
            outcomes: [
              { id: 'forgiven', label: 'They forgave him', sets: { fizz: 'forgiven', coal: 'pure' }, log: 'The bakers forgave Director Fizzwick. His coal turned to sugar and went into the batch.' },
              { id: 'job', label: 'They gave him a new job', sets: { fizz: 'job' }, log: 'The bakers made Director Fizzwick the official taste-tester. He will have to sit down.' },
              { id: 'scolded', label: 'They told him off', sets: { fizz: 'scolded' }, log: 'The bakers told Director Fizzwick exactly what they thought of his shortcut.' }
            ] }
        ],
        next: [{ to: 'midnight' }]
      },

      { id: 'midnight', title: 'Midnight', place: 'evergleam', time: 'Midnight', img: 'img/dm_midnight.webp', length: 'About 10 minutes',
        goal: 'Santa eats a true cookie. The sleigh flies. The bakers go home.',
        scenes: [
          { id: 'end', title: 'The sleigh',
            /* Three versions of the ending. The app suggests one from how the ingredients turned out; the DM can pick another. */
            versions: {
              ask: 'Which batch did they bake?', flag: 'batch',
              options: [
                { id: 'perfect', label: 'Perfect', read: [`The cookies come out of the oven golden, and the smell rolls through Evergleam like a tide. All over the village, the tooting stops. The sneezing stops. The great snowman in the square gives one last enormous sniff, and is dry.`,
                    `Mrs. Claus carries the first cookie up Gumdrop Lane herself. A minute later a sound comes down the chimney that nobody has heard all night: “HO, HO, HO!” Not a sneeze in it.`,
                    `The clock strikes twelve. The sleigh lifts off the runway, and as it climbs, the Northern Lights fold themselves into two words, right across the sky: THANK YOU.`] },
                { id: 'good', label: 'Good', read: [`The cookies come out of the oven a little uneven and entirely wonderful. Across Evergleam the tooting fades, the sneezes dry up, and the snowman in the square stops dripping, mostly.`,
                    `Santa eats three. “Berfect,” he says. Then, carefully: “Perfect.” He tries a laugh. It comes out whole.`,
                    `The clock strikes twelve and the sleigh goes up, a touch wobbly, then steady, then gone into the stars. One small sneeze drifts back down. Nobody minds.`] },
                { id: 'scrappy', label: 'Scrappy', read: [`The cookies come out of the oven looking like they have had a long night. So has everyone. They work anyway, more or less.`,
                    `Santa eats one and stops sneezing. He eats another to be sure. His nose is still a bit red, but then it always was.`,
                    `The clock strikes twelve and the sleigh heaves itself into the air. As it clears the rooftops there is one last, long, unmistakable toot. “That was the reindeer!” shouts Santa, and nobody believes him, and Christmas is saved.`] }
              ],
              suggest: [
                { when: { score: 'ingredients', atLeast: 6 }, use: 'perfect' },
                { when: { score: 'ingredients', atLeast: 3 }, use: 'good' },
                { use: 'scrappy' }
              ]
            },
            /* added to the end of whichever version is read */
            extras: [
              { when: { flag: 'choir', is: 'tooty' }, read: `On the bandstand the Infant Choir waves the sleigh off with “We Wish You a Merry Christmas”. Sung this time. Mostly.` },
              { when: { flag: 'ally_grumble' }, read: `On Peppermint Bridge a huge mossy figure watches it go. He is laughing again. He has been at it for an hour and shows no sign of stopping.` },
              { when: { flag: 'ally_thunder' }, read: `And flying escort beside the team, scarf streaming, antlers level, hooves perfectly tucked, is an old reindeer who was never supposed to fly again.` },
              { when: { flag: 'fizz', in: ['forgiven', 'job'] }, read: `In the bakery, Director Fizzwick is asleep in a chair with his slippers on and a cookie on his chest. It is his first Christmas Eve off in forty years.` },
              { when: { flag: 'twice_forgiven' }, read: `In the List Office, Checker Twice crosses one very old name off the Naughty List. He only checks it once.` },
              { read: `Agent Crumb tips his hat. “You did good, bakers.” He presses something into each of your hands: a small badge shaped like a biscuit. “The Committee could use a few operatives. Same time next year?” The snow rises around you, peppermint-sweet, and when it clears you are standing in your own kitchen, with flour on your noses, and the trophy still on the counter.` }
            ],
            notes: ['Read the ending that fits. The app has picked one from how the three ingredients turned out; change it if your table earned better.', 'Then go round the table one last time: “You wake up in your own kitchen. What is the first thing your character bakes?”'],
            cast: ['santa', 'mrsclaus', 'crumb'], tries: [],
            outcomes: [{ id: 'end', label: 'The end', log: 'The sleigh flew. The bakers went home.' }] }
        ],
        next: [{ end: true }]
      }
    ],

    /* the two interludes between errands */
    interludes: [
      { id: 'sneezles', title: 'The Sneezles', place: 'santahouse', time: 'Nine bells', img: 'img/dm_santa.webp', length: 'About 5 minutes',
        goal: 'A short interlude between ingredients.',
        read: [`The clock tower strikes nine. And the tooting stops. For one hopeful moment the village is silent.`,
          `Then: “HA... HA... HATCHOOO!” A sneeze like a cannon rolls down Gumdrop Lane. Hats fly. Snow slides off every roof at once. All over Evergleam, elves begin to sneeze.`,
          `A window opens at the top of the lane. “You’ll be the bakers,” calls Mrs. Claus. “Come up, dears. He’s asking for you.”`,
          `Santa is in bed under four quilts, nose like a cherry. “I’ve never bissed a Christbas,” he says. “Not one.” Then he sneezes his own hat across the room.`],
        notes: ['Second wave: sneezing. This is where the players see what is at stake.', 'Mrs. Claus offers them one thing to take along. Let the table choose. The app will remind you when it matters.', 'Santa wants to hear how it is going. Let them tell him. It is a free recap, in character.'],
        cast: ['mrsclaus', 'santa'],
        tries: [
          { try: 'Show Santa what they have so far', roll: 'No roll needed', yes: 'He holds it up to the lamp like treasure. “Ho ho ha... HATCHOO. Bagnificent.”', no: '' },
          { try: 'Ask Mrs. Claus about the recipe', roll: 'No roll needed', yes: '“Oh, I know it by heart, pet. Knowing it isn’t the trouble. It’s the gathering. You can’t fetch a laugh with a shopping basket.”', no: '' }
        ],
        outcomes: [
          { id: 'cocoa', label: 'They took the flask of cocoa', sets: { gift: 'cocoa' }, log: 'Mrs. Claus gave the bakers a flask of cocoa: one failed roll tonight may be rolled again.' },
          { id: 'key', label: 'They took Santa’s spare key', sets: { gift: 'key' }, log: 'Mrs. Claus gave the bakers Santa’s spare key, which opens any one door at the North Pole.' },
          { id: 'scarf', label: 'They took the forty-foot scarf', sets: { gift: 'scarf' }, log: 'Mrs. Claus gave the bakers the forty-foot scarf she was knitting. It is unbreakable.' }
        ],
        next: [{ to: 'errands' }] },
      { id: 'drip', title: 'The Big Drip', place: 'square', time: 'Ten bells', img: 'img/dm_drip.webp', length: 'About 5 minutes',
        goal: 'A short interlude between ingredients.',
        read: [`The clock tower strikes ten. The sneezing stops. Nobody trusts it.`,
          `In Snowman Square, something goes plip. Then plop. You look up. The great snowman fountain, three storeys tall, has a drip on the end of its carrot nose. A drip the size of a bathtub.`,
          `It falls. The square is ankle-deep in slush before you can blink, and all over the village, every nose begins to run.`],
        notes: ['Third wave: the massive runny nose. It is disgusting and the players will love it.', 'Dot Dunkwell splashes up, hiccuping jingles. She saw Fizzwick pour the fakes in from cans. She says he has locked himself in the bakery and turned the machine up to maximum “to catch up”.', 'If they are kind to her she tells them the machine’s weak spots: the big red lever on top, the plug behind the oven, and that it goes wobbly when you say something nice to it.', 'Optional rescue: the slush is carrying the Evergleam Brass Band, still playing, towards the canal.'],
        cast: ['dot'],
        tries: [
          { try: 'Rescue the brass band', roll: 'Athletics or a clever plan, medium (13)', yes: 'You fish them out one tuba at a time. They play you a fanfare. It is damp.', no: 'The band sails gently under Peppermint Bridge, playing bravely. They will be fine. They will be in the next village, but fine.' },
          { try: 'Plug the snowman’s nose', roll: 'Acrobatics to climb, hard (16)', yes: 'One enormous scarf, wound twice round the carrot. The dripping slows to a dribble.', no: 'You get halfway up and the next drip gets you first.' },
          { try: 'Sign Dot’s autograph book', roll: 'No roll needed', yes: 'She cannot speak. She jingles.', no: '' }
        ],
        outcomes: [
          { id: 'helped', label: 'Dot told them the machine’s weak spots', sets: { dot: 'helped' }, log: 'Dot Dunkwell told the bakers how to beat the Cookie-Matic: the red lever, the plug, and compliments.' },
          { id: 'go', label: 'On to the last ingredient', log: 'The snowman’s nose began to run. The bakers pressed on.' }
        ],
        next: [{ to: 'errands' }] }
    ],

    /* the three errands, for the choosing screen */
    hubs: [
      { id: 'errands', title: 'Where next?', first: 'Where first?',
        goal: 'The party chooses which ingredient to fetch.',
        help: 'Let the players choose. The order changes what they bring to the later chapters.',
        options: [
          { to: 'laugh', title: 'The Laugh', where: 'Peppermint Bridge', who: 'Grumbleknot the troll shoemaker', feel: 'Comedy and coaxing', img: 'img/dm_bridge.webp',
            log: 'The party set off for the laugh at Peppermint Bridge.' },
          { to: 'snow', title: 'The Snowflake', where: 'Frostwhistle Peak', who: 'Dame Thunderhoof and her students', feel: 'Daring and flying', img: 'img/dm_peak.webp',
            log: 'The party set off for the snowflake at Frostwhistle Peak.' },
          { to: 'coal', title: 'The Coal', where: 'The List Office', who: 'Checker Twice', feel: 'Sneaking and heart', img: 'img/dm_list.webp',
            log: 'The party set off for the coal at The List Office.' }
        ],
        next: [{ to: 'finale' }] }
    ],

    shortcuts: [
      { to: 'finale', at: ['errands', 'sneezles', 'drip'], button: 'Short on time? Jump to the finale',
        label: 'Skipped ahead to the finale', log: 'Short on time, the DM moved the story on to the bakery.' }
    ]
  },

  /* ---------------- 6. the story helper and the painter ---------------- */
  helper: {
    role: 'You are the co-storyteller for a Dungeon Master running a funny, warm, family-friendly Christmas one-shot at the table right now.',
    tone: 'Nobody gets hurt: trouble means icing, tinsel, snow and embarrassment.',
    voice: 'vivid, funny, easy to say out loud',
    fail: 'funny, failing forward, never a dead end',
    flagsHeading: 'INGREDIENTS AND ALLIES',
    /* what the helper offers when no AI is connected */
    builtin: {
      twists: [
        'A cart of cookies trundles past with nobody pushing it. One cookie hops off and rolls, quite deliberately, towards the nearest pocket.',
        'Dot Dunkwell appears at exactly the wrong moment, autograph book held out, hiccuping like a sleigh bell.',
        'The clock tower clears its throat and strikes a quarter past. Somewhere, a very large sneeze answers it.',
        'A snowball the size of a pumpkin rolls down the lane, getting bigger. It has already collected two elves and a wreath.',
        'Every lantern on the street flickers at once. When they steady, a small trench-coated figure is narrating from a doorway: “They were running out of time. They knew it. The snow knew it.”',
        'A soot sprite has followed you. It has untied something. You are not yet sure what.'
      ],
      yes: [
        'It works, and for one shining moment everything goes exactly to plan. A passing elf drops his cocoa in admiration.',
        'It works better than it had any right to. Something useful comes loose because of it.',
        'It works. Not gracefully, but it works, and somebody nearby starts to clap.'
      ],
      no: [
        'It does not work, but it makes a tremendous noise, and help turns up to see what the noise was.',
        'It fails in the funniest way available. Then a second way in presents itself.',
        'It does not work, and now you are covered in snow. From down here, though, you notice something you had missed.'
      ],
      nothingYet: 'The bakers have only just arrived. Everything is still to come.'
    }
  },
  painter: {
    role: 'You write image prompts for the illustrator of a funny, warm, family Christmas adventure at the North Pole.',
    tone: 'Nobody is hurt or frightened: trouble is icing, tinsel, snow and embarrassment.',
    /* the look of pictures the DM paints during play */
    style: 'Wide cinematic shot. Still from a modern 3D computer-animated family feature film: stylized, rounded, appealing shapes, big expressive eyes on the characters, rich saturated color, soft global illumination, warm festive lighting, snow and twinkle lights, cinematic depth of field. Wholesome and funny, nobody hurt. No text, no lettering, no speech bubbles, no logos, no watermark.',
    heroLook: 'a {kind}, once an ordinary home baker',
    heroes: 'a small team of home bakers, each turned into a different Christmas creature by a magic cookie.'
  },

  /* ---------------- 7. labels ---------------- */
  labels: {
    hero: 'A baker', race: 'Form', cls: 'Calling',
    partyHelp: 'Optional. Add your players and what the cookie turned them into, and the story helper will use their names.'
  }
});
