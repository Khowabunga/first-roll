/* First Roll scenario pack: __NAME__.

   Made by `npm run new-scenario __ID__`. It already works: it borrows the engine's art and everyday
   wording (src/base.js), starts with the engine's look written out as tokens for you to change, and
   brings a full placeholder cast and quiz of its own.
   To make it yours, search this file for TODO and replace each one. Anything you do not need to
   change you can leave alone; anything you delete falls back to the base pack.

     npm run validate                 says what is missing or broken, and how evenly the quiz spreads players
     node build.js --drafts           builds it while it is still a draft; open the app with ?s=__ID__
     visibility: 'public'             lists it on the title screen once it is ready

   A pack is data only: no functions, nothing computed. The contract, field by field, is in README.md
   under "Make a new scenario". scenarios/tavern/scenario.js is a complete example. */
FR.scenario({
  schema: 1,
  id: '__ID__',
  version: '0.1.0',
  extends: 'base',

  meta: {
    name: '__NAME__',
    blurb: 'TODO one line for the picker',
    kind: 'one-shot',              // 'one-shot' or 'campaign'
    access: 'free', sku: null,     // for a store later; the app ignores both for now
    visibility: 'draft',           // 'draft' is not built, 'unlisted' opens only with ?s=__ID__, 'public' is listed
    credits: []                    // { type: 'music' | 'art' | 'writing', text: '...' }; music needs one
  },

  /* TODO the look. Every token is here, set to the default look ("Tavern Night"), so the pack looks
     like the engine until you change a value. Change colours first (palette), then the typefaces, then
     anything else; delete any line you leave alone and it falls back to the default. The build turns
     these into custom properties on body[data-theme="__ID__"]; `npm run validate` checks every value,
     the type sizes and the contrast of the colour pairs that text is set in. README.md describes
     each token under "Tokens and theme.css". Values may use other tokens: var(--gilt), or
     rgba(var(--night-rgb), 0.5) for a see-through layer. */
  tokens: {
    /* colours, each '#rrggbb' */
    palette: {
      night: '#0b0705',            // the dark scene behind everything; also the colour of the phone's own bars
      soot: '#17100b',             // dark panels on it: the DM's tab bar, a sheet
      bone: '#efe3c8',             // text on the dark scene
      mute: '#b9a88a',             // quieter text on the dark scene: hints, labels
      parch: '#e8d6b0',            // the page: anything you read or fill in
      ink: '#2a1b10',              // text on the page
      inkSoft: '#4d3826',          // quieter text on the page
      oxblood: '#6b170f',          // headings, markers and chosen things on the page
      wax: '#8f1d14',              // what you press: a switch that is on, the DM's send button
      waxHi: '#b23a2c',            // its lighter shade: the fight tab's rule
      waxDeep: '#4a0e08',          // its darkest shade: for the bite of shadow under a button
      gilt: '#c9a45c',             // gold: numbers and wins (and, in the default look, accents)
      giltHi: '#f3dc9c',           // bright gold: the number itself
      giltDeep: '#a87c33',         // dark gold
      sage: '#dadcb8',             // the helpful note's background
      pine: '#3c3a22',             // the helpful note's edge
      edge: '#8a6a3a',             // the rim of a card or panel, when the look gives them one (see shadow.cardEdge)
      edgeDeep: '#4a3418',         // the underside of that rim
      onGilt: '#1c1108',           // text on gold
      onWax: '#f3dc9c',            // text on the main button and on a chosen chip
      danger: '#7a1208',           // an error message on the page
      dangerHi: '#ff9a80'          // the fight colour on the dark scene
    },
    /* The same colours as 'r, g, b', for see-through layers. They are worked out from the palette (night, soot,
       bone, parch, ink, oxblood, wax, gilt); give one here only to make it differ. The default look's
       see-through ink is a warmer brown than its text ink. */
    channels: { ink: '60, 35, 15' },
    /* Typefaces, most wanted first. To load your own, add  stylesheet: 'https://fonts.googleapis.com/css2?family=...&display=swap'
       (the engine's own faces, named below, are always loaded). */
    fonts: {
      display: ['Baskervville SC', 'Baskervville', 'Times New Roman', 'serif'],        // headings, numbers
      body: ['Alegreya', 'Georgia', 'Times New Roman', 'serif'],                       // running text
      ui: ['Alegreya Sans', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],           // hints, chips, small print
      sc: ['Alegreya Sans SC', 'Alegreya Sans', 'Segoe UI', 'sans-serif'],             // buttons, tabs, labels
      cap: ['Baskervville SC', 'Baskervville', 'Georgia', 'serif']                     // the drop cap
    },
    /* The type scale, in pixels. xs may not be under 14 (the floor for anything on a screen) and sm not under 15
       (hints and labels a player reads); the steps must grow. */
    type: {
      xs: 14,                      // fine print, tiny labels
      sm: 16,                      // labels, hints, chips
      md: 17,                      // body text, fields, answers
      lg: 19,                      // buttons, tabs, the tagline
      xl: 22,                      // headings, the quiz question
      '2xl': 26,                   // big headings, stat numbers
      '3xl': 42,                   // the hero's title
      num: 80,                     // the roll
      lineHeight: 1.45,            // of body text
      tracking: 0.06,              // letter-spacing of buttons and labels, in ems
      trackingDisplay: 0.02,       // letter-spacing of headings, in ems
      caps: 'normal',              // buttons and labels: 'normal', 'small' (small capitals) or 'upper' (all capitals)
      dropCap: true,               // a big first letter on the question and the origin story: true or false
      emphasis: 'italic',          // taglines and asides: 'italic', or 'bold' (upright and heavier)
      lead: 'body'                 // the quiz question: set in the 'body' face or the 'display' face
    },
    /* font weights, 100 to 900 (use ones your typefaces have) */
    weight: {
      body: 400,                   // running text
      medium: 500,                 // fields, chips, a dialog's words
      strong: 700,                 // emphasis
      label: 700,                  // buttons, tabs, small labels
      display: 700,                // headings and numbers
      head: 400,                   // the quiet titles in the top bar
      lead: 500                    // the quiz question
    },
    /* spacing, in pixels: seven steps, then the screen's side gutter and the page's own padding and gap */
    space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, gutter: 20, page: 22, pageGap: 14 },
    /* corners, in pixels */
    radii: {
      btn: 3,                      // buttons and rows
      page: 2,                     // pages
      chip: 2,                     // fields, chips, small boxes
      pill: 999,                   // tags and counters
      dialog: 10,                  // dialogs and sheets
      media: 8,                    // pictures
      frame: 18                    // the phone column on a wide screen
    },
    line: {
      border: 1,                   // the width of borders, in pixels
      icon: 1.8,                   // the stroke of icons
      bar: 9,                      // the height of the trait bars, in pixels
      hairline: 'rgba(var(--gilt-rgb), 0.25)',       // dividers on the dark scene
      rim: 'rgba(var(--gilt-rgb), 0.6)',             // the edge of a control on the dark scene (keep it 3:1 against night)
      rule: 'rgba(var(--ox-rgb), 0.3)',              // dividers on a page
      divider: 'taper',            // between sections of a page: a 'taper' (tapered wedge) or a plain 'line'
      marker: 'diamond',           // bullets, answer markers, slider thumbs: 'diamond' or 'dot'
      note: 'rules'                // the helpful note: 'rules' above and below it, or a 'box' round it
    },
    /* shadows, each a CSS box-shadow value; press is the transform of a pressed button */
    shadow: {
      cardEdge: '0 0 0 0 transparent',               // a ring round a page (none here; try '0 0 0 3px var(--edge)')
      card: '0 22px 50px rgba(0, 0, 0, 0.65), inset 0 0 50px rgba(120, 78, 30, 0.22)',       // under a page (and, inset, its aged edges)
      btn: 'inset 0 1px 0 rgba(255, 210, 170, 0.35), inset 0 -8px 14px rgba(0, 0, 0, 0.25), 0 8px 22px rgba(0, 0, 0, 0.55)',        // the main button
      btnPress: 'inset 0 1px 0 rgba(255, 210, 170, 0.35), inset 0 -8px 14px rgba(0, 0, 0, 0.25), 0 8px 22px rgba(0, 0, 0, 0.55)',   // the same, pressed
      ghost: 'none',               // a quiet button
      pop: '0 10px 26px rgba(0, 0, 0, 0.5)',         // anything that floats: a toast, a picture, a medal
      row: 'inset 0 1px 0 rgba(var(--gilt-rgb), 0.12), 0 4px 12px rgba(0, 0, 0, 0.4)',       // a row on the play screen
      display: '0 2px 0 rgba(0, 0, 0, 0.75)',        // under the big number and the hero's title
      text: '0 1px 8px #000',                        // under words that sit on art
      art: '0 12px 24px rgba(0, 0, 0, 0.82)',        // under the wordmark and a badge
      press: 'translateY(1px) scale(0.99)'           // how a pressed button moves
    },
    /* timings in milliseconds, and the two curves */
    motion: {
      fast: 120,                   // a press
      base: 220,                   // a colour change, a small move
      slow: 420,                   // a screen, a card, a dialog
      scene: 900,                  // the backdrop and big reveals
      loop: 1400,                  // one beat of a waiting animation
      drift: 26000,                // the title backdrop's slow zoom
      ease: 'cubic-bezier(0.16, 1, 0.3, 1)',         // most movement
      bounce: 'cubic-bezier(0.16, 1, 0.3, 1)'        // presses and arrivals; for an overshoot try 'cubic-bezier(0.34, 1.56, 0.64, 1)'
    },
    button: {
      top: '#a52a1d', mid: '#84190f', bottom: '#6a120a',       // the main button, top to bottom (keep onWax readable on `top`)
      edge: 'var(--gilt)',         // its border, and the ring round the hero's medal
      ghost: 'rgba(var(--night-rgb), 0.5)',          // the fill of a quiet button
      selected: 'var(--gilt)',     // a chosen segment or dice button on the dark scene
      onSelected: 'var(--on-gilt)' // and the text on it
    },
    gold: {
      top: '#fbeab8', mid: '#d9b469', bottom: '#a87c33',       // the roll, top to bottom
      titleTop: 'var(--gold-1)', titleMid: 'var(--gold-2)', titleBottom: 'var(--gold-3)'      // the hero's title on the dark scene
    },
    surface: {
      accent: 'var(--gilt-hi)',    // titles, icons and the tab in use, on the dark scene
      accent2: 'var(--gilt)',      // its quieter partner: progress, bullets
      scrim: 0.82,                 // how dark the night behind a dialog is, 0 to 1
      fieldBg: 'rgba(255, 250, 235, 0.55)',          // the fill of a field or chip on a page
      fieldEdge: 'rgba(var(--ink-rgb), 0.62)',       // its edge (keep it 3:1 against the page)
      placeholder: 'var(--ink-soft)',                // the hint inside an empty field
      decor: 'linear-gradient(var(--gilt), var(--gilt))',      // the decoration: the band on a page (if pageTop is not 0) and the rule under the tab in use; any CSS gradient
      decorRule: 'var(--decor)',   // the rule under a heading on a page
      pageTop: 0,                  // the height of a band across the top of every page and dialog, in pixels (0: none)
      headRule: 2,                 // the height of the rule under a heading
      tabRule: 3,                  // the height of the rule under the tab in use
      veilTop: 0.66,               // the play screen: how dark the table art is at the top, 0 to 1
      veilBottom: 0.93,            // and at the bottom
      rowBg: 'linear-gradient(180deg, rgba(var(--soot-rgb), 0.9), rgba(var(--night-rgb), 0.88))',     // a row on the play screen
      rowEdge: 'var(--rim)',       // its edge (keep it 3:1 against the row)
      modBg: 'radial-gradient(circle at 50% 30%, rgba(var(--gilt-rgb), 0.22), rgba(var(--night-rgb), 0.9) 70%)',      // the round badge a row's modifier sits in
      modInk: 'var(--gilt-hi)',    // the modifier itself
      modEdge: 'var(--gilt)',      // the badge's ring
      modFightBg: 'radial-gradient(circle at 50% 30%, rgba(var(--wax-rgb), 0.7), rgba(var(--night-rgb), 0.9) 75%)',   // the same three, on the fight tab
      modFightInk: 'var(--danger-hi)',
      modFightEdge: 'var(--wax-hi)',
      titleVeil: 'linear-gradient(rgba(var(--night-rgb), 0.55) 0%, rgba(var(--night-rgb), 0.1) 34%, rgba(var(--night-rgb), 0) 52%, rgba(var(--night-rgb), 0.8) 78%, rgba(var(--night-rgb), 0.97) 100%)',     // the title screen: dark for the wordmark, clear for the art, dark under the buttons
      taglineScrim: 0.3,           // the soft patch of night behind the tagline, 0 to 1 (raise it if your art is bright there)
      sceneFocus: 'center 30%',    // where the backdrop picture is centred behind most screens
      sceneTitleFocus: 'center 62%',                 // and on the title screen
      sceneTitleFilter: 'brightness(1.35) contrast(1.05) saturate(1.1)',     // how the backdrop is graded on the title screen
      sceneDim: 0.34,              // how bright the backdrop stays when it is blurred behind a screen, 0 to 1
      portrait: 'vignette',        // a portrait is painted into the page ('vignette') or laid on it like a 'photo'
      chrome: 'fade'               // the bars round the dice 'fade' into the tray, or are solid 'panel's
    },
    /* Backdrop pictures. key: the scene behind everything. page: behind anything you read (null for a flat page in the
       parch colour). table: behind the play screen. Yours go in scenarios/__ID__/img/ and are named 'img/keyart.webp'. */
    images: { key: 'base:img/keyart.webp', page: 'base:img/parchment.webp', table: 'base:img/table.webp' }
  },

  /* TODO art. Every picture here is borrowed from the engine ("base:..."). As you make your own, put the
     files in scenarios/__ID__/img/ and name them here: wordmark: 'img/wordmark.webp', and for the cast
     crest: 'img/crest_{slug}.webp' and sample: 'img/sample_{slug}.webp', where {slug} is the class name in
     lower case with underscores ("The Brawler" is the_brawler). */
  art: {
    wordmark: 'base:img/wordmark.webp', divider: 'base:img/divider.webp', thumb: 'base:img/keyart.webp', floor: 'base:img/table.webp',
    crest: 'base:img/seal.webp', sample: 'base:img/portrait.svg'
  },

  quiz: {
    /* TODO rewrite every question and answer in your story's voice. Keep the weights (w) as they are and
       the cast stays evenly reachable: each answer pushes one or more of eight traits, which are
       might, guile, lore, faith, charm, wild, order (minus is chaos) and light (minus is shadow). */
    questions: [
      { q: 'TODO Someone nearby is cheating at a game.', a: [
        { t: 'TODO Tip the table over.', w: { might: 2, order: -1.5 } },
        { t: 'TODO Cheat better, quietly.', w: { guile: 2, light: -1 } },
        { t: 'TODO Warn the person being cheated.', w: { faith: 1.5, light: 1.5, order: 0.5 } },
        { t: 'TODO Make friends and learn the trick.', w: { charm: 1.5, lore: 1 } }] },
      { q: 'TODO The path splits. Which way?', a: [
        { t: 'TODO The quiet way through the wilds.', w: { wild: 2 } },
        { t: 'TODO The safe, well-kept road.', w: { order: 2, faith: 0.5 } },
        { t: 'TODO Whichever leads to the old ruins.', w: { lore: 2 } },
        { t: 'TODO Toward the music.', w: { charm: 1.5, order: -1 } }] },
      { q: 'TODO A locked door is in your way.', a: [
        { t: 'TODO Shoulder it open.', w: { might: 2 } },
        { t: 'TODO Pick the lock.', w: { guile: 2 } },
        { t: 'TODO Study the markings on the frame first.', w: { lore: 2, order: 0.5 } },
        { t: 'TODO Knock. Someone always answers.', w: { charm: 2 } }] },
      { q: 'TODO Someone who wronged you asks for mercy.', a: [
        { t: 'TODO Granted, and I will help them up.', w: { faith: 2, light: 2 } },
        { t: 'TODO Granted. For a price.', w: { charm: 1, guile: 1, light: -1.5 } },
        { t: 'TODO That is for the proper authority to decide.', w: { order: 2.5 } },
        { t: 'TODO I walk away and leave it to fate.', w: { wild: 1.5, order: -0.5 } }] },
      { q: 'TODO Your friends would call you…', a: [
        { t: 'TODO The strong one.', w: { might: 2 } },
        { t: 'TODO The clever one.', w: { lore: 1.5, guile: 0.5 } },
        { t: 'TODO The kind one.', w: { faith: 1.5, light: 1.5 } },
        { t: 'TODO The trouble.', w: { charm: 1, guile: 1, order: -1.5 } }] },
      { q: 'TODO You find something strange that seems to know your name.', a: [
        { t: 'TODO Open it. Obviously.', w: { lore: 1.5, light: -1, order: -1 } },
        { t: 'TODO Destroy it before it gets ideas.', w: { faith: 1.5, order: 1 } },
        { t: 'TODO Find a buyer.', w: { guile: 1.5, charm: 1 } },
        { t: 'TODO Bury it far from anyone.', w: { wild: 1.5, light: 0.5 } }] },
      { q: 'TODO Your first real money goes on…', a: [
        { t: 'TODO Better gear.', w: { might: 1.5, order: 0.5 } },
        { t: 'TODO A treat for everyone.', w: { charm: 2, order: -1, light: 0.5 } },
        { t: 'TODO A rare book I probably should not have.', w: { lore: 2, light: -0.5 } },
        { t: 'TODO Someone who needs it more.', w: { faith: 2, light: 1.5 } }] },
      { q: 'TODO It is your turn to keep watch. You pass the time…', a: [
        { t: 'TODO Practising.', w: { might: 1.5, order: 1.5 } },
        { t: 'TODO Listening to the night.', w: { wild: 2 } },
        { t: 'TODO Working on a new song.', w: { charm: 2 } },
        { t: 'TODO In quiet thought.', w: { faith: 1.5, order: 1 } }] },
      { q: 'TODO The plan has fallen apart. Now what?', a: [
        { t: 'TODO I am the plan now.', w: { might: 1.5, order: -1.5 } },
        { t: 'TODO Good thing I brought a second plan.', w: { guile: 1.5, lore: 1, order: 1 } },
        { t: 'TODO Improvise. It is more fun this way.', w: { charm: 1, order: -2 } },
        { t: 'TODO Get everyone out safely. Nothing else matters.', w: { faith: 1.5, light: 2 } }] },
      { q: 'TODO There is a big celebration. Where are you?', a: [
        { t: 'TODO Winning the contest of strength.', w: { might: 2 } },
        { t: 'TODO Slipping through the crowd, unnoticed.', w: { guile: 2, light: -0.5 } },
        { t: 'TODO On the stage.', w: { charm: 2 } },
        { t: 'TODO At the edge of it, with the animals.', w: { wild: 2 } }] },
      { q: 'TODO What worries you most?', a: [
        { t: 'TODO Being shut in.', w: { wild: 1.5, order: -1.5 } },
        { t: 'TODO Being fooled.', w: { guile: 1, lore: 1.5 } },
        { t: 'TODO Letting down those who trust me.', w: { faith: 1.5, light: 1.5, order: 0.5 } },
        { t: 'TODO Being forgotten.', w: { charm: 1.5, light: -0.5 } }] },
      { q: 'TODO You are offered a single gift.', a: [
        { t: 'TODO Strength no one can match.', w: { might: 2 } },
        { t: 'TODO To know how everything works.', w: { lore: 2, light: -0.5 } },
        { t: 'TODO A voice no one can refuse.', w: { charm: 2, light: -0.5 } },
        { t: 'TODO To speak with beasts and birds.', w: { wild: 2, light: 0.5 } }] }
    ],
    /* the five asked in a short game. After changing weights, ask for the best five: npm run validate -- --quick __ID__ */
    quick: [1, 2, 3, 7, 8]
  },

  cast: {
    /* TODO rename each class, and write its blurb, attacks and gear. The numbers are a standard set that
       plays well; leave them unless you mean to rebalance.
       v:    how much the class is about each trait [might, guile, lore, faith, charm, wild, order(-chaos), light(-shadow)]
       hd:   hit die (6, 8, 10 or 12)      prio: how much it wants [STR, DEX, CON, INT, WIS, CHA]
       color: the dice are cast in it      armor: unarmored, monk, leather, leather+shield, scale, scale+shield, chain+shield or none */
    classes: {
      'The Brawler': { v: [1, 0.1, 0, 0.1, 0.1, 0.7, -0.7, 0], hd: 12, prio: [1, 0.7, 0.9, 0.1, 0.4, 0.3], color: '#8c2f1b',
        blurb: 'TODO one line that sells this class.', armor: 'unarmored', skills: ['Athletics', 'Perception', 'Survival'],
        attacks: [{ n: 'TODO Heavy weapon', ab: 'STR', die: 12, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Thrown weapon', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Performer': { v: [0, 0.5, 0.4, 0.1, 1, 0.1, -0.5, 0.2], hd: 8, prio: [0.1, 0.8, 0.6, 0.4, 0.4, 1], color: '#b0457a',
        blurb: 'TODO one line that sells this class.', armor: 'leather', skills: ['Persuasion', 'Performance', 'Deception'],
        attacks: [{ n: 'TODO Light blade', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Thrown knife', ab: 'DEX', die: 4, cnt: 1, hint: 'Up to 20 feet' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Healer': { v: [0.3, 0, 0.3, 1, 0.2, 0, 0.5, 0.7], hd: 8, prio: [0.7, 0.3, 0.8, 0.2, 1, 0.4], color: '#c79a2c',
        blurb: 'TODO one line that sells this class.', armor: 'scale+shield', skills: ['Insight', 'Medicine', 'Religion'],
        attacks: [{ n: 'TODO Blunt weapon', ab: 'STR', die: 6, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Bright bolt', ab: 'WIS', die: 6, cnt: 4, spell: true, hint: 'Magic, up to 120 feet' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Wild One': { v: [0.1, 0.1, 0.4, 0.5, 0, 1, -0.1, 0.3], hd: 8, prio: [0.1, 0.7, 0.8, 0.4, 1, 0.3], color: '#4d7a3a',
        blurb: 'TODO one line that sells this class.', armor: 'leather+shield', skills: ['Nature', 'Animal Handling', 'Perception'],
        attacks: [{ n: 'TODO Nature magic', ab: 'WIS', die: 8, cnt: 1, spell: true, hint: 'Magic, up to 30 feet' }, { n: 'TODO Curved blade', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Guardian': { v: [1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.7, 0.1], hd: 10, prio: [1, 0.6, 0.9, 0.2, 0.4, 0.3], color: '#9a3b2a',
        blurb: 'TODO one line that sells this class.', armor: 'chain+shield', skills: ['Athletics', 'Intimidation', 'Perception'],
        attacks: [{ n: 'TODO Sword', ab: 'STR', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Crossbow', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 80 feet' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Acrobat': { v: [0.5, 0.6, 0.2, 0.6, 0, 0.2, 0.9, 0.2], hd: 8, prio: [0.4, 1, 0.7, 0.2, 0.9, 0.2], color: '#c2702a',
        blurb: 'TODO one line that sells this class.', armor: 'monk', skills: ['Acrobatics', 'Stealth', 'Insight'],
        attacks: [{ n: 'TODO Bare hands', ab: 'DEX', die: 4, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Staff', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Champion': { v: [0.8, 0, 0, 0.8, 0.4, 0, 0.8, 0.8], hd: 10, prio: [1, 0.2, 0.8, 0.1, 0.4, 0.9], color: '#b58a2e',
        blurb: 'TODO one line that sells this class.', armor: 'chain+shield', skills: ['Athletics', 'Persuasion', 'Insight'],
        attacks: [{ n: 'TODO Sword', ab: 'STR', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Thrown spear', ab: 'STR', die: 6, cnt: 1, hint: 'Thrown, up to 30 feet' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Scout': { v: [0.4, 0.6, 0.1, 0.1, 0, 1, 0, 0.2], hd: 10, prio: [0.5, 1, 0.7, 0.3, 0.9, 0.2], color: '#3f6b4f',
        blurb: 'TODO one line that sells this class.', armor: 'scale', skills: ['Survival', 'Stealth', 'Perception'],
        attacks: [{ n: 'TODO Bow', ab: 'DEX', die: 8, cnt: 1, hint: 'Up to 150 feet' }, { n: 'TODO Short blade', ab: 'DEX', die: 6, cnt: 1, hint: 'Someone next to you' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Sneak': { v: [0, 1, 0.3, 0, 0.5, 0.1, -0.6, -0.3], hd: 8, prio: [0.1, 1, 0.6, 0.6, 0.5, 0.7], color: '#3f4f7a',
        blurb: 'TODO one line that sells this class.', armor: 'leather', skills: ['Stealth', 'Sleight of Hand', 'Deception', 'Perception'],
        attacks: [{ n: 'TODO Light blade', ab: 'DEX', die: 8, cnt: 1, hint: 'Someone next to you' }, { n: 'TODO Short bow', ab: 'DEX', die: 6, cnt: 1, hint: 'Up to 80 feet' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Spark': { v: [0.1, 0.1, 0.3, 0, 0.9, 0.3, -0.8, 0], hd: 6, prio: [0.1, 0.7, 0.8, 0.3, 0.4, 1], color: '#a23a5a',
        blurb: 'TODO one line that sells this class.', armor: 'none', skills: ['Persuasion', 'Arcana', 'Intimidation'],
        attacks: [{ n: 'TODO Wild magic', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Magic, up to 120 feet' }, { n: 'TODO Knife', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Trickster': { v: [0, 0.5, 0.7, 0, 0.6, 0, -0.2, -0.8], hd: 8, prio: [0.1, 0.7, 0.8, 0.5, 0.4, 1], color: '#5b3a7a',
        blurb: 'TODO one line that sells this class.', armor: 'leather', skills: ['Deception', 'Arcana', 'Intimidation'],
        attacks: [{ n: 'TODO Dark magic', ab: 'CHA', die: 10, cnt: 1, spell: true, hint: 'Magic, up to 120 feet' }, { n: 'TODO Knife', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'TODO what they wear and carry, for the portrait' },
      'The Scholar': { v: [0, 0.2, 1, 0.1, 0, 0, 0.4, 0], hd: 6, prio: [0.1, 0.7, 0.7, 1, 0.5, 0.3], color: '#3a5f8a',
        blurb: 'TODO one line that sells this class.', armor: 'none', skills: ['Arcana', 'History', 'Investigation'],
        attacks: [{ n: 'TODO Studied magic', ab: 'INT', die: 10, cnt: 1, spell: true, hint: 'Magic, up to 120 feet' }, { n: 'TODO Knife', ab: 'DEX', die: 4, cnt: 1, hint: 'Next to you, or thrown 20 feet' }], gear: 'TODO what they wear and carry, for the portrait' }
    },
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
    /* TODO names for "Roll a name": m and f are first names, s is the second half. One list per people. */
    names: {
      Townsfolk: { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      'Mountain Folk': { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      'Forest Folk': { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      'Little Folk': { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      Tinkers: { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      Outlanders: { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] }
    },
    /* who is in each class's sample portrait (said beside the sample when no AI is painting) */
    samples: { 'The Brawler': 'Outlanders', 'The Performer': 'Little Folk', 'The Healer': 'Mountain Folk', 'The Wild One': 'Forest Folk', 'The Guardian': 'Townsfolk', 'The Acrobat': 'Townsfolk',
      'The Champion': 'Mountain Folk', 'The Scout': 'Forest Folk', 'The Sneak': 'Little Folk', 'The Spark': 'Tinkers', 'The Trickster': 'Outlanders', 'The Scholar': 'Tinkers' }
  },

  roster: {
    /* the hero behind "I already have a character" when nothing is saved: answers is one choice (0 to 3) per question */
    demo: { cls: 'The Sneak', race: 'Little Folk', name: 'Mira Fairwind', answers: [1, 0, 1, 1, 3, 2, 1, 1, 1, 1, 0, 2], look: { body: 'Female', age: 'Young', build: 'Lean', hair: 'Wild curls', mark: 'Freckles', bearing: 'Wry' } },
    /* TODO at least six ready-made heroes for players who skip the questions. Add portrait: 'img/hero_mira.webp' when you
       have one; until then each shows their class's sample. look uses the choices in look.options (see src/base.js). */
    premades: [
      { name: 'Mira Fairwind', cls: 'The Sneak', race: 'Little Folk', look: { body: 'Female', age: 'Young', build: 'Lean', hair: 'Wild curls', bearing: 'Wry' } },
      { name: 'Bram Ashdown', cls: 'The Guardian', race: 'Townsfolk', look: { body: 'Male', age: 'In their prime', build: 'Sturdy', hair: 'Cropped', bearing: 'Grim' } },
      { name: 'Sabine Marlowe', cls: 'The Scholar', race: 'Tinkers', look: { body: 'Female', age: 'Elder', build: 'Slight', hair: 'Silver', bearing: 'Kind' } },
      { name: 'Tomas Ashdown', cls: 'The Healer', race: 'Mountain Folk', look: { body: 'Male', age: 'Weathered', build: 'Sturdy', hair: 'Braided', bearing: 'Kind' } },
      { name: 'Rowan Fairwind', cls: 'The Scout', race: 'Forest Folk', look: { body: 'Neither', age: 'In their prime', build: 'Lean', hair: 'Long and loose', bearing: 'Dreamy' } },
      { name: 'Aldric Marlowe', cls: 'The Brawler', race: 'Outlanders', look: { body: 'Male', age: 'Young', build: 'Towering', hair: 'Shaved', bearing: 'Fierce' } }
    ]
  },

  /* TODO the words that are most yours. Every other line on the screens comes from src/base.js: copy any
     key from its `text` into here to say it your way. */
  text: {
    tagline: 'TODO one or two sentences that set the scene on the title screen.',
    begin: 'Begin',
    omen: 'TODO the line shown just before a player meets their hero.'
  }

  /* Other things a pack can have, all optional and all described in the README: story (pictures and words
     before the questions), music, particles (what drifts past), extras (special rolls), fx (the words and the
     dressing of a natural 20 and a natural 1), sfx, dice (the 3D tray), look, prose and ai (wording), actions;
     and a theme.css beside this file for the few things about a look that no token can say. */
});
