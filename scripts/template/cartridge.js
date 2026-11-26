/* First Roll scenario pack: __NAME__.

   Made by `npm run new-cartridge __ID__`. It already works: it borrows the engine's art and everyday
   wording (src/base.js), starts with the engine's look written out as tokens for you to change, and
   brings a full placeholder cast and quiz of its own. It plays by the __RULESET__ rules: see `rules`,
   near the end, and "The two sets of rules" in README.md.
   To make it yours, search this file for TODO and replace each one. Anything you do not need to
   change you can leave alone; anything you delete falls back to the base pack.

     npm run validate                 says what is missing or broken, and how evenly the quiz spreads players
     node build.js --drafts           builds it while it is still a draft; open the app with ?s=__ID__
     visibility: 'public'             lists it on the title screen once it is ready

   A pack is data only: no functions, nothing computed. The contract, field by field, is in README.md
   under "Make a new cartridge". cartridges/tavern/cartridge.js is a complete example. */
FR.cartridge({
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
    /* TODO the label: what the cartridge's card tells someone choosing what to play, and what the DM sees on the
       cover. A few words each (40 characters at most). Any line you delete falls back to the engine's wording. */
    label: {
      length: 'One sitting',                 // how long a game takes: 'About 2 hours'
      players: 'Up to 8 players',            // how many it suits: '3 to 6 players'
      tone: 'Adventure',                     // the mood: 'Silly and warm', 'Spooky'
      dm: 'First-time DMs welcome',          // how much the DM needs to know
      rating: 'everyone',                    // 'everyone', 'teen' or 'mature'
      flags: []                              // anything a table may want to know first, each a word or two: ['Spiders']
    },
    /* { type: 'music' | 'art' | 'writing', text: '...' }; music needs one. Every cartridge also carries the
       engine's rules credit (src/base.js) without writing it here. */
    credits: []
  },

  /* The DM's adventure, if this cartridge has one: the id written inside adventure.js, beside this file.
     The DM's door only shows for a cartridge with an adventure. To get a small starter adventure and this
     line written for you, make the cartridge with:  npm run new-cartridge __ID__ --adventure */
  // adventure: '__ID__',

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
       parch colour). table: behind the play screen. Yours go in cartridges/__ID__/img/ and are named 'img/keyart.webp'. */
    images: { key: 'base:img/keyart.webp', page: 'base:img/parchment.webp', table: 'base:img/table.webp' }
  },

  /* TODO art. Every picture here is borrowed from the engine ("base:..."). As you make your own, put the
     files in cartridges/__ID__/img/ and name them here: wordmark: 'img/wordmark.webp', and for the cast
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
    /*__QUICK__*/
  },

  cast: {
    /*__NOTES__*/
    /* TODO roles: five or six plain jobs a hero can do at the table. Players see them as role cards over the
       classes ("Protector: Brawler, Guardian, Champion") and in the lobby ("the party has no Healer yet").
       blurb: the one line that sells the role (80 characters at most).   does: what you do with it (160 at most).
       trait: might, guile, lore, faith, charm or wild. A class with no `role` of its own goes to the role whose
              trait is the class's strongest. Leave it out and only classes that name the role get it.
       Delete the whole block and the engine's six plain roles are used. */
    roles: {
      Protector: { trait: 'might', blurb: 'TODO You stand in front, so your friends do not have to.', does: 'TODO Push, lift, block and hold the line. When trouble arrives, it meets you first.' },
      Trickster: { trait: 'guile', blurb: 'TODO You get in where you are not wanted, and out again unnoticed.', does: 'TODO Sneak, pick a lock or a pocket, and pull a fast one when plain dealing will not do.' },
      Thinker: { trait: 'lore', blurb: 'TODO You know things, and you work out the rest.', does: 'TODO Solve the puzzle, read the strange writing, and remember the old story that explains it all.' },
      Healer: { trait: 'faith', blurb: 'TODO You keep everyone on their feet and in good heart.', does: 'TODO Patch people up, calm them down, and notice who is not as fine as they say.' },
      Talker: { trait: 'charm', blurb: 'TODO You do the talking, and people tend to listen.', does: 'TODO Persuade, bargain, perform and make friends. Words get you where muscle cannot.' },
      Scout: { trait: 'wild', blurb: 'TODO You go ahead, see trouble coming and find the way through.', does: 'TODO Follow a trail, spot what is hidden, and get on with animals.' }
    },
    /*__CLASSES__*/
    /*__RACES__*/
    /* TODO names for "Roll a name": m and f are first names, s is the second half. One list per people. */
    names: {
      Townsfolk: { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      'Mountain Folk': { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      'Forest Folk': { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      'Little Folk': { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      Tinkers: { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] },
      Outlanders: { m: ['Aldric', 'Bram', 'Tomas'], f: ['Mira', 'Rowan', 'Sabine'], s: ['Ashdown', 'Fairwind', 'Marlowe'] }
    },
    /* who is in each class's sample portrait (said beside the sample when no AI is painting). Under the light rules
       it is also the people a hero of that class starts as, so hero and picture agree; the player may change it. */
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

  /* "Or say what you do": when a player types what their hero does, the app suggests the check it most likely
     comes down to. The engine knows a couple of hundred everyday words (climb, sneak, persuade: see `intent`
     in src/base.js). Add the words of your own story here, each one mapped to a skill, in lower case and in
     its plain form ("skate" also answers for skates, skated and skating). A short phrase works too. To drop
     one of the engine's words, give it null. The skills are Athletics, Acrobatics, Sleight of Hand, Stealth,
     Arcana, History, Investigation, Nature, Religion, Animal Handling, Insight, Medicine, Perception,
     Survival, Deception, Intimidation, Performance and Persuasion. */
  intent: {
    words: { barricade: 'Athletics', 'keep a straight face': 'Deception' }      // TODO your story's own words
  },

  /* TODO ties: what links a hero to the others at the table, and to your story. Delete any of the three lists
     and the engine's plain ones are used.
       bonds   questions about ANOTHER player's hero. Each player is asked one once their hero is made at a table,
               and the answer is shown to everyone. Write {name} where the other hero's name goes: a bond without
               it is refused. 120 characters at most, 20 bonds at most.
       hooks   a personal stake in the story, picked (or skipped) by each player; only they and the DM see it.
               `id` is a short word of its own; `text` is 240 characters at most. `roles` keeps a hook for heroes
               of those roles (the names in cast.roles); leave it out for a hook anyone may take. 20 at most.
       voices  a way to talk, for a player who would like to try one: `label` names it (24 characters), `tip` says
               how to do it (120 characters). 12 at most. */
  ties: {
    bonds: [
      'TODO Why do you owe {name} a favor?',
      'TODO What did {name} do, the day you met, that made you trust them?',
      'TODO What do you and {name} still argue about?'
    ],
    hooks: [
      { id: 'prove', text: 'TODO Somebody said you would never amount to much. You mean to prove them wrong.' },
      { id: 'debt', text: 'TODO You owe someone a favor that money cannot repay. Doing some good here might square it.' },
      { id: 'promise', text: 'TODO You promised someone you would look after the others. You have not told the others.', roles: ['Protector', 'Healer'] }
    ],
    voices: [
      { label: 'Gruff', tip: 'TODO Short sentences. Long pauses. Never use three words where one will do.' },
      { label: 'Bright', tip: 'TODO Everything is wonderful, and you say so a little too fast.' },
      { label: 'Sly', tip: 'TODO Speak low, smile a little, and never quite answer the question.' }
    ]
  },

  /* TODO the kit: what a hero carries or can do. Each item is a card on the player's phone with a "Use" button
     that tells the DM, so write what it is good for in plain words, with no numbers.
       items   by id (a short word in lower case; never change one once people are playing). `name` is 40
               characters at most and `text` 160. `uses` is 'once' (it is used up) or 'always'. `img` is optional:
               img: 'img/rope.webp', a picture in this cartridge's img folder. 40 items at most.
       token   what a hero token is called in this story. The DM hands one out for a great moment and a player
               spends it to roll again. `name`, `plural` (24 characters each) and `text` (160). */
  kit: {
    items: {
      rope: { name: 'TODO Rope', text: 'TODO Climb it, tie it, or lower a friend on it.', uses: 'always' },
      lantern: { name: 'TODO Lantern', text: 'TODO Light in dark places.', uses: 'always' },
      bandages: { name: 'TODO Bandages', text: 'TODO Patch up one friend who has been hurt.', uses: 'once' },
      lockpicks: { name: 'TODO Lockpicks', text: 'TODO For doors that were not meant for you.', uses: 'always' },
      notebook: { name: 'TODO Notebook', text: 'TODO Everything you have read and half remember. Look something up.', uses: 'always' },
      horn: { name: 'TODO Signal horn', text: 'TODO One blast and everyone for a mile knows where you are.', uses: 'always' },
      trinket: { name: 'TODO Lucky trinket', text: 'TODO Kiss it before something risky. Once it has worked, the luck is used up.', uses: 'once' },
      treats: { name: 'TODO Pocketful of treats', text: 'TODO Most animals, and some guards, will stop for one.', uses: 'once' }
    },
    token: { name: 'Hero token', plural: 'Hero tokens', text: 'TODO Spend one to roll again when it matters. Your DM hands them out for great moments.' }
  },

  /* TODO soundscapes: quiet loops of sound the DM can put behind a scene. Every cartridge already has the
     engine's seven, made on the spot with no files: wind, fire, storm, crowd, cave, night and sea. Here you can
       say one your way         wind: { label: 'A cold wind', synth: 'wind' }
       add one of your own      rain: { label: 'Rain on the roof', file: 'audio/rain.mp3' }     (a file in
                                cartridges/__ID__/audio/; credit it in meta.credits if it is not yours)
       take one away            sea: null
     `label` (40 characters at most) is what the DM's picker says. An adventure names a soundscape by its id:
     sound: 'wind' on a chapter or a scene. */
  sound: {
    beds: {
      wind: { label: 'TODO A cold wind', synth: 'wind' }
    }
  },

  /*__RULES__*/

  /* TODO the words that are most yours. Every other line on the screens comes from src/base.js: copy any
     key from its `text` into here to say it your way. */
  text: {
    tagline: 'TODO one or two sentences that set the scene on the title screen.',
    begin: 'Begin',
    omen: 'TODO the line shown just before a player meets their hero.',
    /* health as a state rather than a number: all there, some harm taken, nearly out. Say them your way
       ('Full of beans', 'A bit battered', 'On your last legs'). */
    healthFine: 'Fine', healthHurt: 'Hurt', healthTrouble: 'In trouble'
  }

  /* Other things a pack can have, all optional and all described in the README: story (pictures and words
     before the questions), music, particles (what drifts past), extras (special rolls), fx (the words and the
     dressing of a natural 20 and a natural 1), sfx, dice (the 3D tray), look, prose and ai (wording), actions;
     a theme.css beside this file for the few things about a look that no token can say; and an adventure.js
     beside it for the DM to run (npm run new-cartridge <id> --adventure writes a starter, with a small map). */
});
