/* First Roll scenario pack: North Pole.
   Premise (the DM's own): a team of bakers wins a Christmas cookie bake-off, finds a note
   from the C.O.O.K.I.E. Department in the winning box, laughs it off, nibbles a cookie
   and lands at the North Pole. Here the enchanted cookie also decides what each baker
   turns into, which is what the questions work out. Rules underneath are unchanged.

   It is data only: the build reads this call, checks it (npm run validate) and ships it as JSON.
   The look is the `tokens` block below (theme.css beside this file holds the few rules tokens cannot say);
   the contract is in README.md under "Make a new scenario". */
FR.scenario({
  schema: 1,
  id: 'northpole',
  version: '1.0.0',
  extends: 'base',

  meta: {
    name: 'North Pole',
    blurb: 'The great cookie mystery',
    kind: 'one-shot',              // 'one-shot' or 'campaign'
    access: 'free', sku: null,     // for a store later: 'paid' packs name the product they belong to. The app ignores both for now.
    visibility: 'public',          // 'public' is listed, 'unlisted' opens only with ?s=northpole, 'draft' is not built
    /* shown on the Music and sound sheet: the licence asks for it, so keep it while the music stays */
    credits: [{ type: 'music', text: 'Music: “We Wish You a Merry Christmas”, “Jingle Bells (Calm)”, “Dance of the Sugar Plum Fairies”, “Oh, Christmas Tree”, “Sugar Plum Breakdown” and “Sugar Plum Dark Mix” by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 3.0.' }]
  },

  /* The DM's adventure that belongs to this pack. For now it is still bundled with the engine
     (src/story-cookie.js); it moves to adventure.js beside this file. */
  adventure: 'cookie',

  /* The look: "Iced gingerbread at midnight". The world is a deep aurora-blue night. Everything you
     read is a cookie-box card: flat icing white with a baked gingerbread edge. Everything you press
     is glossy candy with a chunky bite of shadow under it, and it squashes when you tap it. Gold is
     kept for numbers and wins, pine green for helpful notes. The candy stripe appears once on a card
     (across the top, and under its headings); every other divider is plain. Motion is soft and
     bouncy, like a marshmallow.
     The build turns these into custom properties on body[data-theme="northpole"]. Every token is
     listed in README.md under "Tokens and theme.css"; theme.css beside this file holds the few
     things a token cannot say. */
  tokens: {
    palette: {
      night: '#081428', soot: '#102544', bone: '#f7fbff', mute: '#b9cbe2',              // the night, and words on it
      parch: '#fffaf0', ink: '#1d2b45', inkSoft: '#4a5873',                            // icing, and words on it
      oxblood: '#b3122b', wax: '#c8102e', waxHi: '#ef3b4f', waxDeep: '#7d0a1c',         // candy red: headings, buttons, the bite under a button
      gilt: '#f2b84b', giltHi: '#ffe7a6', giltDeep: '#c98a1b',                          // gold: numbers and wins only
      sage: '#d7efe2', pine: '#1f7a4d',                                                // the helpful note
      edge: '#b9743a', edgeDeep: '#7a4420',                                            // gingerbread: the baked edge of a card
      onGilt: '#1c1108', onWax: '#ffffff', danger: '#a10f27', dangerHi: '#ff9fb0'
    },
    fonts: {
      stylesheet: 'https://fonts.googleapis.com/css2?family=Grandstander:wght@700;800&family=Nunito:wght@600;700;800&display=swap',
      display: ['Grandstander', 'Trebuchet MS', 'Segoe UI', 'sans-serif'],
      body: ['Nunito', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
      ui: ['Nunito', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
      sc: ['Grandstander', 'Trebuchet MS', 'Segoe UI', 'sans-serif'],
      cap: ['Grandstander', 'Trebuchet MS', 'sans-serif']
    },
    /* heavy rounded type: no small caps, no drop cap, no italics; the quiz question is set in the display face */
    type: { xs: 14, sm: 16, md: 18, lg: 20, xl: 24, '2xl': 30, '3xl': 42, num: 80, tracking: 0.01, trackingDisplay: 0,
      caps: 'normal', dropCap: false, emphasis: 'bold', lead: 'display' },
    weight: { body: 600, medium: 700, strong: 800, label: 800, display: 800, head: 800, lead: 800 },
    radii: { chip: 14, btn: 18, page: 22, dialog: 22, media: 16, pill: 999, frame: 28 },
    /* chunky lines to sit beside the type; plain dividers, round markers, a boxed note */
    line: { border: 2, icon: 2.4, bar: 12, divider: 'line', marker: 'dot', note: 'box',
      hairline: 'rgba(247, 251, 255, 0.16)', rim: 'rgba(247, 251, 255, 0.78)', rule: 'rgba(29, 43, 69, 0.16)' },
    shadow: {
      cardEdge: '0 0 0 3px var(--edge), 0 6px 0 var(--edge-deep)',                     // the gingerbread edge, and its baked underside
      card: '0 18px 44px rgba(4, 12, 28, 0.5)',
      btn: 'inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 5px 0 var(--wax-deep), 0 14px 22px rgba(4, 12, 28, 0.4)',      // gloss on top, a bite underneath
      btnPress: 'inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 2px 0 var(--wax-deep), 0 6px 12px rgba(4, 12, 28, 0.4)',
      ghost: 'inset 0 2px 0 rgba(255, 255, 255, 0.16), 0 4px 0 rgba(4, 12, 28, 0.6)',
      row: 'inset 0 2px 0 rgba(255, 255, 255, 0.12), 0 4px 0 rgba(4, 12, 28, 0.55)',
      pop: '0 10px 26px rgba(4, 12, 28, 0.45)',
      display: '0 3px 0 rgba(5, 14, 30, 0.75)',
      text: '0 1px 6px rgba(4, 12, 28, 0.9)',
      press: 'translateY(3px) scale(1.01, 0.97)'                                       // a press sinks three pixels and squashes
    },
    motion: { fast: 120, base: 220, slow: 420, scene: 900, ease: 'cubic-bezier(0.16, 1, 0.3, 1)', bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    /* the main button, top to bottom (white on the top stop is 4.5:1); a chosen segment is icing, not gold */
    button: { top: '#e22a45', mid: '#c8102e', bottom: '#a80b25', edge: '#ffffff', ghost: 'rgba(8, 20, 40, 0.55)', selected: '#f7fbff', onSelected: '#1d2b45' },
    /* gold for the roll; the hero's title on the night is ice, not gold */
    gold: { top: '#ffffff', mid: '#ffe7a6', bottom: '#f2b84b', titleTop: '#ffffff', titleMid: '#e6f3ff', titleBottom: '#a9d4f5' },
    surface: {
      accent: '#f7fbff', accent2: '#a9d4f5',                                           // accents on the night are white and ice
      scrim: 0.8,
      fieldBg: '#f3f7fc', fieldEdge: '#6f86a6', placeholder: '#5d6b85',
      decor: 'repeating-linear-gradient(135deg, #c8102e 0 11px, #ffffff 11px 22px)',    // the candy stripe: the top of a card, the tab in use
      decorRule: 'repeating-linear-gradient(135deg, #c8102e 0 7px, #f6c9d0 7px 14px)',  // a finer one under headings, pink where the card is white
      pageTop: 10, headRule: 4, tabRule: 5,
      veilTop: 0.62, veilBottom: 0.9,                                                  // the play screen lets the table art show at the top
      rowBg: 'linear-gradient(180deg, rgba(30, 58, 102, 0.92), rgba(16, 37, 68, 0.92))', rowEdge: 'rgba(247, 251, 255, 0.42)',
      modBg: 'linear-gradient(180deg, #ffe7a6 0%, #f2b84b 100%)', modInk: '#1c1108', modEdge: '#ffffff',             // a gold ornament
      modFightBg: 'linear-gradient(180deg, #e22a45 0%, #a80b25 100%)', modFightInk: '#ffffff', modFightEdge: '#ffffff',
      titleVeil: 'linear-gradient(rgba(8, 20, 40, 0.3) 0%, rgba(8, 20, 40, 0) 30%, rgba(8, 20, 40, 0) 46%, rgba(8, 20, 40, 0.82) 74%, rgba(8, 20, 40, 0.97) 100%)',
      taglineScrim: 0.62,                                                              // the tagline sits on the aurora, so its patch of night is stronger
      sceneFocus: 'center 46%', sceneTitleFocus: 'center 46%', sceneTitleFilter: 'brightness(1.06) saturate(1.05)', sceneDim: 0.42,
      portrait: 'photo', chrome: 'panel'
    },
    images: { key: 'img/keyart.webp', page: null, table: 'img/table.webp' }               // page: null is a flat page in the parch colour
  },

  art: {
    wordmark: 'img/wordmark.webp', divider: 'img/divider.webp', thumb: 'img/keyart.webp', floor: 'img/table.webp',
    crest: 'img/badge_{slug}.webp', sample: 'img/sample_{slug}.webp'       // {slug} is the class name in lower case with underscores
  },

  quiz: {
    count: { text: '{i} of {n}', numerals: 'plain' },
    traits: { might: 'Oomph', guile: 'Sneak', lore: 'Smarts', faith: 'Heart', charm: 'Sparkle', wild: 'Wild' },
    axes: [['Rowdy', 'Tidy'], ['Naughty', 'Nice']],
    /* the line under the hero's name: each side is the average push per answer, and the first rule it satisfies speaks */
    alignment: {
      order: [{ over: 0.17, say: 'by the book' }, { under: -0.17, say: 'gloriously rowdy' }, { say: '' }],
      light: [{ over: 0.15, say: 'Nice List' }, { under: -0.12, say: 'Naughty List (the fun end)' }, { say: 'Somewhere between the lists' }],
      parts: ['light', 'order'], join: ', '
    },
    /* Twelve questions. Every answer pushes one or more of eight traits:
       might, guile, lore, faith, charm, wild, order (minus is rowdy), light (minus is naughty). */
    questions: [
      { q: 'At the bake-off, the team at the next table is sneaking in store-bought frosting.', a: [
        { t: 'Tip their table over. Cheaters never prosper.', w: { might: 2, order: -1.5 } },
        { t: 'Peek at their recipe while they are busy cheating.', w: { guile: 2, light: -1 } },
        { t: 'Quietly tell the judges.', w: { faith: 1.5, light: 1.5, order: 0.5 } },
        { t: 'Bring them cocoa and ask how they got away with it.', w: { charm: 1.5, lore: 1 } }] },
      { q: 'The cookie drops you in a snowy forest. Which way?', a: [
        { t: 'Into the quiet pines.', w: { wild: 2 } },
        { t: 'Along the path with the candy-cane lamp posts.', w: { order: 2, faith: 0.5 } },
        { t: 'Toward that tower full of gears and blinking lights.', w: { lore: 2 } },
        { t: 'Toward the sleigh bells and singing.', w: { charm: 1.5, order: -1 } }] },
      { q: 'The workshop door is locked, and the cookies are inside.', a: [
        { t: 'Shoulder it open.', w: { might: 2 } },
        { t: 'Pick the lock with a candy cane.', w: { guile: 2 } },
        { t: 'Read the tiny instructions carved on the frame.', w: { lore: 2, order: 0.5 } },
        { t: 'Knock and sing. Someone always answers a carol.', w: { charm: 2 } }] },
      { q: 'You catch the gingerbread thief who has been swiping sprinkles. He is very sorry.', a: [
        { t: 'Forgive him and share my cookie.', w: { faith: 2, light: 2 } },
        { t: 'Forgive him. For half his sprinkles.', w: { charm: 1, guile: 1, light: -1.5 } },
        { t: 'Rules are rules. Santa decides.', w: { order: 2.5 } },
        { t: 'Let him go. The snow will sort it out.', w: { wild: 1.5, order: -0.5 } }] },
      { q: 'Your friends would call you…', a: [
        { t: 'The strong one.', w: { might: 2 } },
        { t: 'The clever one.', w: { lore: 1.5, guile: 0.5 } },
        { t: 'The kind one.', w: { faith: 1.5, light: 1.5 } },
        { t: 'The trouble.', w: { charm: 1, guile: 1, order: -1.5 } }] },
      { q: 'Under the tree sits a present with no tag. It is humming.', a: [
        { t: 'Open it. Obviously.', w: { lore: 1.5, light: -1, order: -1 } },
        { t: 'Hand it straight to Santa. Not my present.', w: { faith: 1.5, order: 1 } },
        { t: 'Trade it. Mystery presents are worth a fortune.', w: { guile: 1.5, charm: 1 } },
        { t: 'Bury it in a snowdrift, far from town.', w: { wild: 1.5, light: 0.5 } }] },
      { q: 'You won the bake-off prize money. It goes on…', a: [
        { t: 'A bigger, better rolling pin.', w: { might: 1.5, order: 0.5 } },
        { t: 'Cocoa for the whole town.', w: { charm: 2, order: -1, light: 0.5 } },
        { t: 'A rare book of secret recipes.', w: { lore: 2, light: -0.5 } },
        { t: 'Mittens for everyone who has none.', w: { faith: 2, light: 1.5 } }] },
      { q: 'It is Christmas Eve and you cannot sleep. You…', a: [
        { t: 'Shovel the whole street. Twice.', w: { might: 1.5, order: 1.5 } },
        { t: 'Sit outside and listen to the snow fall.', w: { wild: 2 } },
        { t: 'Practice a new carol.', w: { charm: 2 } },
        { t: 'Make a wish on the brightest star.', w: { faith: 1.5, order: 1 } }] },
      { q: 'Your gingerbread house starts collapsing in front of the judges. Now what?', a: [
        { t: 'Hold the roof up myself.', w: { might: 1.5, order: -1.5 } },
        { t: 'Good thing I baked a spare wall.', w: { guile: 1.5, lore: 1, order: 1 } },
        { t: 'Call it a gingerbread ruin. More fun this way.', w: { charm: 1, order: -2 } },
        { t: 'Make sure nobody gets frosting in their eye.', w: { faith: 1.5, light: 2 } }] },
      { q: 'The North Pole winter fair is in full swing. Where are you?', a: [
        { t: 'Winning the tug of war.', w: { might: 2 } },
        { t: 'Slipping between stalls, sampling everything unnoticed.', w: { guile: 2, light: -0.5 } },
        { t: 'On the stage.', w: { charm: 2 } },
        { t: 'Out back with the reindeer.', w: { wild: 2 } }] },
      { q: 'What worries you most?', a: [
        { t: 'Being stuck indoors.', w: { wild: 1.5, order: -1.5 } },
        { t: 'Being tricked.', w: { guile: 1, lore: 1.5 } },
        { t: 'Letting my friends down.', w: { faith: 1.5, light: 1.5, order: 0.5 } },
        { t: 'Being left off the list entirely.', w: { charm: 1.5, light: -0.5 } }] },
      { q: 'Santa winks and offers you one gift.', a: [
        { t: 'Strength to lift the whole sleigh.', w: { might: 2 } },
        { t: 'To know how every toy and trick works.', w: { lore: 2, light: -0.5 } },
        { t: 'A voice everyone stops to listen to.', w: { charm: 2, light: -0.5 } },
        { t: 'To talk with reindeer and snow owls.', w: { wild: 2, light: 0.5 } }] }
    ],
    /* the five asked in a short game: the set that spreads players most evenly over the cast (npm run validate -- --quick northpole) */
    quick: [1, 2, 3, 7, 9]
  },

  cast: {
    /* Callings. Each sits on a familiar rules chassis so the DM can run it as written.
       [might, guile, lore, faith, charm, wild, order(-chaos), light(-shadow)] */
    classes: {
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
    },
    /* Forms: what the cookie turns you into. */
    races: {
      'Workshop Elf': { v: [0, 0.5, 0.9, 0, 0.4, 0.1, 0.2, 0.3], bonus: { DEX: 2, INT: 1 }, speed: 25, perk: 'Tinker’s touch: you can fix, or jam, almost any gadget.',
        look: 'a small Christmas workshop elf with pointed ears and rosy cheeks' },
      Reindeer: { v: [0.5, 0.4, 0, 0.1, 0.1, 1, -0.2, 0.2], bonus: { DEX: 2, STR: 1 }, speed: 40, perk: 'Sky-hop: leap as far as you can see, then rest before the next one.',
        look: 'a young anthropomorphic reindeer standing upright, soft brown fur, small antlers, a big black nose' },
      Snowman: { v: [0.3, 0, 0.1, 0.6, 0.5, 0.2, 0.1, 0.7], bonus: { CON: 2, CHA: 1 }, speed: 25, tough: true, perk: 'Pack it back on: fresh snow patches you up, so you can take more knocks than most.',
        look: 'a living snowman made of three packed snowballs, with stick arms, coal eyes and a carrot nose' },
      Gingerbread: { v: [0, 0.6, 0, 0.3, 0.8, 0.2, -0.5, 0.5], bonus: { DEX: 2, CHA: 1 }, speed: 35, lucky: true, perk: 'Lucky crumb: roll a 1 on the 20-sided die and you may roll again.',
        look: 'a living gingerbread cookie person with white icing trim and gumdrop buttons' },
      Nutcracker: { v: [0.8, 0, 0.2, 0.5, 0.1, 0, 1, 0.3], bonus: { STR: 2, CON: 1 }, speed: 30, perk: 'Iron jaw: you can crack, crunch or clamp almost anything.',
        look: 'a living wooden nutcracker toy soldier with a painted face, a square jaw and a tall hat' },
      Penguin: { v: [0.1, 0.5, 0.2, 0.3, 0.6, 0.5, 0.2, 0.4], bonus: { DEX: 2, WIS: 1 }, speed: 25, perk: 'Belly slide: on ice or snow you move twice as far.',
        look: 'a small round penguin with bright eyes' },
      Yeti: { v: [1, 0.1, 0, 0, 0, 0.8, -0.5, 0], bonus: { STR: 2, CON: 1 }, speed: 30, perk: 'Too big to bully: once a day, when a blow would knock you out, stay on your feet.',
        look: 'a huge fluffy friendly white yeti with a pale blue face and hands' },
      'Snow Fox': { v: [0, 0.8, 0.4, 0, 0.6, 0.4, -0.4, -0.5], bonus: { CHA: 2, INT: 1 }, speed: 30, perk: 'White on white: in falling snow you are very hard to spot.',
        look: 'an anthropomorphic white arctic fox standing upright, with a big fluffy tail' },
      Human: { v: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.1, 0.1], bonus: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, speed: 30, perk: 'Flour power: the cookie left you as you were, and a little better at everything.',
        look: 'a human baker with flour on their cheeks' }
    },
    names: {
      'Workshop Elf': { m: ['Jingle', 'Sprocket', 'Figgy', 'Pepper', 'Tinsel', 'Bramble'], f: ['Nutmeg', 'Tinsel', 'Holly', 'Pippin', 'Clove', 'Mistle'], s: ['Twinkletoes', 'Sugarplum', 'Snowbell', 'Cogsworthy', 'Glitterpine', 'Buttonbright'] },
      Reindeer: { m: ['Bolt', 'Thistle', 'Flurry', 'Juniper', 'Sprint', 'Birch'], f: ['Aurora', 'Skye', 'Clover', 'Starla', 'Willow', 'Ember'], s: ['Starhoof', 'the Swift', 'Hoofbright', 'Skyrunner', 'Frostantler', 'of the North Wind'] },
      Snowman: { m: ['Parsnip', 'Coalby', 'Buttons', 'Flurrick', 'Drift', 'Chilly'], f: ['Flurrietta', 'Icelyn', 'Crystal', 'Snowdrop', 'Pearl', 'Wintry'], s: ['Frostwick', 'Meltnot', 'Carrotnose', 'Snowpacker', 'Coldbottom', 'Icebloom'] },
      Gingerbread: { m: ['Crumb', 'Clove', 'Biscotti', 'Snap', 'Molasses', 'Dunk'], f: ['Ginger', 'Nutmeg', 'Honey', 'Cinnamon', 'Sprinkle', 'Treacle'], s: ['McCrumble', 'Sprinklesworth', 'Gumdrop', 'Icingham', 'Snapwell', 'Butterbake'] },
      Nutcracker: { m: ['Captain Walnut', 'Sir Hazel', 'Major Chestnut', 'Sergeant Pecan', 'Colonel Acorn', 'Corporal Almond'], f: ['Captain Hazel', 'Dame Chestnut', 'Major Pecan', 'Lady Filbert', 'Sergeant Almond', 'Colonel Walnut'], s: ['Brassbuttons', 'von Kracken', 'Oakenjaw', 'Steadfast', 'Drumroll', 'Lacquer'] },
      Penguin: { m: ['Waddles', 'Tux', 'Pebble', 'Flip', 'Skipper', 'Snowcone'], f: ['Pip', 'Pebble', 'Dottie', 'Flurry', 'Splash', 'Mittens'], s: ['Icebottom', 'McSlide', 'Featherby', 'Bellyflop', 'Frostwing', 'Slipperton'] },
      Yeti: { m: ['Boulder', 'Mogul', 'Snug', 'Tundra', 'Thump', 'Bigsby'], f: ['Fluff', 'Avalanche', 'Tundra', 'Snowberry', 'Hilda', 'Puff'], s: ['Snowmuncher', 'the Gentle', 'Peakstomper', 'Softpaw', 'Hugsalot', 'Cavehum'] },
      'Snow Fox': { m: ['Whisper', 'Quill', 'Nix', 'Sable', 'Flint', 'Jasper'], f: ['Ember', 'Nix', 'Wisp', 'Velvet', 'Sable', 'Lark'], s: ['Frostpaw', 'Snowtail', 'Quickwhisker', 'Moonprint', 'Silverbrush', 'Softstep'] },
      Human: { m: ['Hank', 'Otis', 'Barnaby', 'Walt', 'Gus', 'Theo'], f: ['Rosie', 'Marigold', 'Clementine', 'Dot', 'Winnie', 'Pearl'], s: ['Butterworth', 'Crumpet', 'Bunsby', 'Flourman', 'Sweetwater', 'Whiskley'] }
    },
    /* who is in each calling's sample picture */
    samples: { Santa: 'Penguin', Toymaker: 'Workshop Elf', Baker: 'Human', Caroler: 'Snowman', 'Sleigh Pilot': 'Reindeer', 'Candy Cane Knight': 'Nutcracker', 'Chimney Sneak': 'Gingerbread', 'Frost Mage': 'Snow Fox', 'Blizzard Brawler': 'Yeti', 'Tree Tender': 'Reindeer', 'Mischief Maker': 'Workshop Elf', 'Ice Skater': 'Penguin' },
    /* what the sheet calls each kind of armor here */
    armorNotes: { unarmored: 'too fluffy to hurt', monk: 'never standing still', leather: 'thick winter coat', 'leather+shield': 'winter coat, wreath shield', scale: 'jingle-bell mail', 'scale+shield': 'oven mitts, cookie-sheet shield', 'chain+shield': 'tin-soldier plate, sled-lid shield', none: 'festive sweater' }
  },

  look: {
    options: {
      body: ['Male', 'Female', 'Neither'],
      age: ['Little', 'Grown-up', 'Grandparent'],
      build: ['Tiny', 'Slim', 'Round', 'Huge'],
      hair: ['Santa hat', 'Earmuffs', 'Bobble hat', 'Top hat', 'Holly crown', 'Nothing'],
      mark: ['Striped scarf', 'Jingle bells', 'Round glasses', 'Mittens', 'Candy cane', 'Floury apron'],
      bearing: ['Jolly', 'Mischievous', 'Shy', 'Brave', 'Dreamy', 'Grumpy']
    },
    labels: { body: 'Body', age: 'Age', build: 'Size', hair: 'On top', mark: 'Wearing', bearing: 'Mood' },
    flourish: [
      'a scarf at least three times too long', 'one mitten red and one mitten green', 'a string of tiny lights that will not switch off',
      'frosting on one eyebrow that nobody has mentioned', 'a bell that jingles at the worst possible moments', 'pockets full of sprinkles',
      'a wooden spoon tucked in the belt like a sword', 'earmuffs shaped like cinnamon buns', 'a patched sweater with a wonky snowflake',
      'boots that squeak with every step', 'a candy cane behind one ear', 'a tiny whisk on a necklace'
    ]
  },

  roster: {
    /* the hero behind "I have a character" when nothing is saved */
    demo: { cls: 'Chimney Sneak', race: 'Gingerbread', name: 'Ginger McCrumble', answers: [1, 3, 1, 1, 3, 2, 1, 2, 2, 1, 1, 2], look: { body: 'Female', age: 'Grown-up', build: 'Slim', hair: 'Bobble hat', mark: 'Striped scarf', bearing: 'Mischievous' } },
    /* ready-made heroes, for players who want to skip the questions */
    premades: [
      { name: 'Ginger McCrumble', cls: 'Chimney Sneak', race: 'Gingerbread', portrait: 'img/sample_chimney_sneak.webp', look: { body: 'Female', age: 'Grown-up', build: 'Slim', hair: 'Bobble hat', mark: 'Striped scarf', bearing: 'Mischievous' } },
      { name: 'Skipper Featherby', cls: 'Santa', race: 'Penguin', portrait: 'img/sample_santa.webp', look: { body: 'Male', age: 'Grown-up', build: 'Round', hair: 'Santa hat', mark: 'Mittens', bearing: 'Jolly' } },
      { name: 'Nutmeg Cogsworthy', cls: 'Toymaker', race: 'Workshop Elf', portrait: 'img/sample_toymaker.webp', look: { body: 'Female', age: 'Grown-up', build: 'Tiny', hair: 'Earmuffs', mark: 'Round glasses', bearing: 'Dreamy' } },
      { name: 'Rosie Butterworth', cls: 'Baker', race: 'Human', portrait: 'img/sample_baker.webp', look: { body: 'Female', age: 'Grandparent', build: 'Round', mark: 'Floury apron', bearing: 'Jolly' } },
      { name: 'Bolt Skyrunner', cls: 'Sleigh Pilot', race: 'Reindeer', portrait: 'img/sample_sleigh_pilot.webp', look: { body: 'Male', age: 'Grown-up', build: 'Slim', mark: 'Striped scarf', bearing: 'Brave' } },
      { name: 'Boulder Peakstomper', cls: 'Blizzard Brawler', race: 'Yeti', portrait: 'img/sample_blizzard_brawler.webp', look: { body: 'Male', age: 'Grown-up', build: 'Huge', hair: 'Bobble hat', mark: 'Mittens', bearing: 'Jolly' } }
    ]
  },

  /* The "I want to..." menu: plain words mapped to the right skill. */
  actions: [
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
  ],

  /* extra rolls that only this story has */
  extras: [
    { id: 'cookie', label: 'Nibble a North Pole cookie', hint: 'The recipe has gone wrong. Roll to see how.', sides: 6, title: 'Cookie side effect', note: 'd6 · something is off with the recipe',
      table: ['Endless farts. They will not stop for a full minute.', 'A sneezing fit: three enormous sneezes.', 'A massively runny nose. Find a hankie, fast.', 'Hiccups that jingle like sleigh bells.', 'Your voice goes squeaky until your next roll.', 'Nothing happens. Which is suspicious.'] }
  ],

  /* the story so far, shown before the questions */
  story: [
    { img: 'img/story1.webp', alt: 'Four bakers lifting a cookie trophy on a small-town stage', text: 'You did it. Your team just won the town’s Christmas cookie bake-off, trophy and all.' },
    { img: 'img/story2.webp', alt: 'An open box of cookies with a glowing sealed note tucked inside', text: 'That night you open the box of winning cookies to finally taste them. Tucked inside is a note: the North Pole needs your help. It is signed by the C.O.O.K.I.E. Department, the Committee of Operatives Keeping Ingredients Enchanted.' },
    { img: 'img/story3.webp', alt: 'The bakers swept off the kitchen floor in a swirl of sparkles and snow', text: 'A prank, obviously. You all laugh and take a nibble. The kitchen starts to spin, the air smells of peppermint, and the cookie begins deciding who you really are…' }
  ],

  /* Music by scene. A scene with several pieces plays them in turn; a missing file is skipped. */
  music: {
    intro: ['audio/intro.mp3'],
    game: ['audio/game_jingle.mp3', 'audio/game_sugarplum.mp3', 'audio/game_tree.mp3'],
    fight: ['audio/fight_breakdown.mp3', 'audio/fight_dark.mp3']
  },

  /* falling snow: see "particles" in the README for each setting */
  particles: { motion: 'fall', count: 44, speed: 1.5, base: 0.3, size: 1.25, color: '#ffffff', alpha: [0.6, 0.85], flicker: false, fade: false, screens: ['title', 'heroes', 'story', 'quiz', 'reveal'] },

  /* the 3D tray: number ink, the fight dice, the rim and the felt under the floor picture */
  dice: { ink: '#ffffff', inkMetal: 0.05, fleck: '#ffffff', fight: '#c8102e', fightInk: '#ffffff',
    rim: { color: '#b5121f', wood: false, metal: 0.55, rough: 0.34 }, floorTint: '#e6efe9', floorBase: '#0f4a30', exposure: 1.05 },

  /* which of the engine's sounds mark each moment; a list plays them together */
  sfx: { tap: 'tink', cheer: ['jingle', 'fanfare'], fumble: 'womp', arrive: 'jingle' },

  /* shown on a natural 20 and a natural 1 */
  /* `particles` is what flies (one of FR.FX.particles in src/fx.js), `object` is the one sad thing that lands
     on a natural 1 (one of FR.FX.objects), and `colors` light the moment: the first two colour the beams
     and the title, all of them colour the particles. Titles are short: under 22 characters. */
  fx: {
    crit: { title: 'Natural 20!', particles: 'sprinkles', colors: ['#ffe7a6', '#f2b84b', '#ffffff', '#ef3b4f', '#3fbf7f', '#7fd4ff'],
      lines: ['Jingle all the way!', 'Straight to the top of the Nice List.', 'Somewhere a sleigh bell rings just for you.',
        'Even the reindeer are impressed.', 'Smoother than fresh icing.', 'Baked to perfection.'] },
    fumble: { title: 'Natural 1', particles: 'coal', object: 'coal', colors: ['#2a2a30', '#4a4a54', '#77778a', '#15151a'],
      lines: ['Oh, crumbs.', 'That is going on the Naughty List.', 'Face first into a snowdrift.',
        'Flat as a dropped fruitcake.', 'The gingerbread saw everything.', 'Burnt on the bottom, raw in the middle.'] }
  },

  /* Words the app writes by itself, with no AI. */
  prose: {
    /* the look "Surprise me" writes */
    describe: {
      text: '{size}{mood}. Wears {flourishA}, and {flourishB}.',
      parts: {
        size: { from: 'look.build', map: { Tiny: 'Pocket-sized', Slim: 'Slim as a candle', Round: 'Round as a pudding', Huge: 'Big enough to block a doorway' }, or: 'Hard to miss' },
        mood: { from: 'look.bearing', lower: true, wrap: ' and plainly {value}' }
      }
    },
    /* how you got here, on the sheet */
    origin: {
      text: '{name} was a prize-winning baker until one nibble of an enchanted cookie. Now {first} is a {race} {cls} at the North Pole, where {lesson}.',
      parts: {
        lesson: { from: 'top', map: { might: 'the heaviest sacks always seem to find the strongest arms', guile: 'nobody hears you coming on fresh snow', lore: 'every gadget in the workshop is hiding a secret',
          faith: 'kindness is the one ingredient that never runs out', charm: 'a good song opens more doors than a key', wild: 'the reindeer already treat you like family' } }
      }
    }
  },

  /* Optional: the words that steer OpenAI when a table has it switched on. The app sends finished prompts; the server only forwards them. */
  ai: {
    style: 'Character portrait as a still from a modern 3D computer-animated family feature film: stylized, appealing character design with big expressive eyes and friendly exaggerated proportions, soft detailed materials (knit wool, fur, felt, icing) with gentle subsurface glow, warm key light and a cool winter rim light, shallow depth of field. Waist-up, three-quarter view, centered, full of personality, with space above the head. Background: a softly blurred snowy North Pole village at night with warm string lights and bokeh. Wholesome, festive and funny. No text, no lettering, no border, no frame, no logo, no watermark.',
    describe: 'You design characters for a 3D animated Christmas family film set at the North Pole. Reply with one or two sentences, 40 words at most, of concrete visual detail only: outfit, colors, one signature prop, small quirks. Cute, festive and a little funny. The character\'s fixed features are listed for you: agree with every one of them and never state a different age, size, headwear, accessory or mood. No name, no backstory, no game terms, no quotation marks.',
    origin: 'You narrate a cozy, funny animated Christmas film. The description starts with the character\'s name, then the two or three words for what they are now (for example "Reindeer Sleigh Pilot"). In exactly two sentences, 45 words at most, tell how they were a prize-winning cookie baker who nibbled an enchanted cookie from the C.O.O.K.I.E. Department and woke up at the North Pole as that, using those exact words for what they became and inventing no other creature. Use the name, never "you". Playful and kid-friendly.',
    /* who to picture: the fixed features first, then the player's own words */
    subject: {
      text: 'A {body}character: {raceInfo.look}, who is a {cls} ({classInfo.gear}).{details}{also}',
      parts: {
        body: { from: 'look.body', map: { Male: 'male ', Female: 'female ' }, or: '' },
        details: { join: '; ', wrap: ' Required details, each one clearly visible and taking priority over the usual outfit and over anything said later: {value}.', list: [
          { from: 'look.age', map: { Little: 'a small child', 'Grown-up': 'an adult', Grandparent: 'elderly, grandparent-aged, with grey or white hair or whiskers' }, wrap: 'age: {value}' },
          { from: 'look.build', map: { Tiny: 'tiny and dainty', Slim: 'tall and slim', Round: 'very round and plump', Huge: 'huge, towering and broad' }, wrap: 'body shape: {value}' },
          { from: 'look.hair', map: { 'Santa hat': 'a red Santa hat', Earmuffs: 'fluffy earmuffs and no hat', 'Bobble hat': 'a knitted bobble hat', 'Top hat': 'a tall black top hat', 'Holly crown': 'a crown of holly leaves and berries', Nothing: 'nothing at all, bare-headed' }, wrap: 'on the head: {value}' },
          { from: 'look.mark', map: { 'Striped scarf': 'a long striped scarf', 'Jingle bells': 'a string of jingle bells', 'Round glasses': 'round glasses', Mittens: 'big knitted mittens', 'Candy cane': 'a candy cane', 'Floury apron': 'an apron dusted with flour' }, wrap: 'wearing or holding: {value}' },
          { from: 'look.bearing', map: { Jolly: 'jolly, laughing', Mischievous: 'mischievous, a sly grin', Shy: 'shy, bashful, peeking', Brave: 'brave and determined', Dreamy: 'dreamy, gazing off', Grumpy: 'grumpy, scowling, arms folded' }, wrap: 'mood and expression: {value}' }
        ] },
        also: { from: 'desc', wrap: ' Also, where it does not contradict the required details: {value}' }
      }
    }
  },

  /* The words on the screens that this story says in its own voice. Everything else is the engine's
     plain wording (the full list is in src/base.js); add a line here to say it the North Pole way. */
  text: {
    tagline: 'Something is wrong with the Christmas cookies, and the North Pole needs its best bakers.',
    begin: 'Open the cookie box',
    storyGo: 'Take a nibble',
    omen: 'Snow. Sleigh bells. You open your eyes at the North Pole, and you are not quite yourself.', howRead: 'How the cookie read you', closestClasses: 'Your calling', closestRaces: 'Your new shape',
    /* pictures, not portraits; artists and elves, not painters */
    easelEmpty: 'No picture yet', skip: 'Skip the picture for now', paintMine: 'Make my picture',
    paint: 'Make my picture', paintAgain: 'Make another', painting: 'The elves are busy on it',
    descHint: 'A scarf three times too long, frosting on one eyebrow, a very determined look',
    hintLive: 'Pick a few features, then let the artist work.', stale: 'Your choices changed. Make another to see them.',
    painted: 'Made just now by OpenAI in {s} seconds.', slow: 'The artist took too long. Try again.', failed: 'The artist could not finish: {e} Change the description or try again.',
    work: ['Sharpening pencils', 'Shaping the cheeks', 'Knitting the scarf', 'Hanging the twinkle lights', 'Dusting on the snow', 'Adding the sparkle'],
    originHead: 'How you got here', originWait: 'The narrator clears their throat…', toTable: 'Off to the North Pole',
    tabs: ['I want to…', 'Checks', 'Snow fight'],
    shove: 'Shove or grab', hideHint: 'duck behind a snowdrift',
    checkHints: { STR: 'Push, lift, haul the sleigh', DEX: 'Quick hands, quick feet', CON: 'Brave the cold, hold your breath', INT: 'Recall, reason, puzzle it out', WIS: 'Notice, sense, trust your gut', CHA: 'Charm, cheer, perform' },
    howRoll: 'Press Roll, or flick the tin.',
    nat20: 'A natural 20, the best roll there is. Jingle all the way!', nat1: 'A natural 1, the worst roll there is. Oh, crumbs.',
    lucky: 'Lucky crumb! Roll that 1 again',
    whyAthletics: 'being strong as a sleigh team', whyStealth: 'being quiet as falling snow', whySurvival: 'knowing your way in the snow', whyDeception: 'a perfectly straight face',
    musicNote: 'Carols for the title, the game and the snow fights'
  }
});
