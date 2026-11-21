# First Roll

A tabletop-adventure companion for phones. A quick quiz turns each player into a hero, the dice
roll on their own phone, and a DM runs the table from a scenario. Sessions are quick and need no
experience: open the address, answer a few questions, play.

The app is an **engine** plus **scenario packs**. The engine (`src/`) is the screens, the dice,
the rules and the shared table. A pack (`scenarios/<id>/`) is one data file with its pictures and
music: a cast, a quiz, the words on every screen and a look. Two packs ship today, chosen on the
title screen: North Pole (opens first) and Tavern Night. A new one takes an afternoon; see
[Make a new scenario](#make-a-new-scenario).

A DM can open a **table** and get a four-letter code. Players type the code on their own phones.
From then on the DM can send everyone a note or a picture, and North Pole comes with a full
adventure for the DM to run. With an OpenAI key the app also paints portraits and scenes and helps
with the story; without one it is still complete, and shows the packs' ready-made pictures.

## Run it on your own computer

Needs Node 18 or newer.

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

Put a passcode of your choice in `.dev.vars` (and an OpenAI key if you have one), then:

```bash
npm run dev
```

Open http://localhost:8787. `npm run dev` is `wrangler dev`: it builds the site into `public/`
first, and builds it again whenever a file in `src/` or `scenarios/` changes. To let phones on the
same Wi-Fi join, run `npx wrangler dev --ip 0.0.0.0` and open `http://<your computer's address>:8787`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the site on your computer |
| `npm run build` | Builds `public/` once (`node build.js --drafts` includes draft packs) |
| `npm run validate` | Checks every scenario pack and says what is wrong, key by key |
| `npm run new-scenario <id>` | Starts a new scenario pack from the template |
| `npm test` | Runs the unit tests |
| `npm run check` | Validate, build and test: run this before you push |

## Put it online

The site runs as one Cloudflare Worker (`worker.js`). Each table is a small Durable Object, which
is where the players, handouts and painted pictures are kept. `wrangler.jsonc` describes all of it,
including the build: `public/` is not kept in git, so Wrangler runs `node build.js` before every
deploy.

With this folder in a GitHub repository:

1. In the Cloudflare dashboard go to **Workers & Pages > Create application**, choose **GitHub**,
   pick the repository, then **Save and Deploy**. Leave the build command empty and the deploy
   command as `npx wrangler deploy`. The Worker must be named `first-roll`.
2. Open the new Worker, then **Settings > Variables and Secrets > Add**. Add two, both of type
   **Secret**, then **Deploy**:
   - `OPENAI_API_KEY`: your OpenAI key. It stays on Cloudflare and never reaches a phone.
   - `DM_PASSCODE`: any word you like. You type it at the DM's door to open a table.
3. Your address is shown on the Worker's page, in the form `first-roll.<your-name>.workers.dev`.
   That is the address everyone opens.

After that, **to deploy, push**. Cloudflare runs `npx wrangler deploy`, which builds the site and
publishes it. A pack with a fault stops the build, so a broken scenario never goes live. Every
file the page asks for carries a hash of its contents in its address, so nobody is served an old
picture or script after a deploy.

Or straight from your own computer, without GitHub:

```bash
npx wrangler login
```

```bash
npm run deploy
```

```bash
npx wrangler secret put OPENAI_API_KEY
```

```bash
npx wrangler secret put DM_PASSCODE
```

Things to know:

- Tables need only `DM_PASSCODE`. Without `OPENAI_API_KEY` the app is complete but has no AI: heroes use the
  pack's ready-made pictures and written backstories, and the DM's helper gives built-in suggestions.
- Only someone with the passcode can open a table, and only people sitting at a table can use
  your OpenAI key. Each table is capped at 150 pictures and each player at 6 portraits.
- A table is cleared away thirty days after its last activity, so a campaign keeps one code.
- A player who joins again under the same name, in a later session or on another phone, gets
  their seat and their character back. Anyone at the table who types that name takes the seat,
  so this suits friends, not strangers.
- The free plan allows 100,000 requests a day. Each open phone checks in every three seconds, so
  a DM and five players use about 22,000 in a three-hour game.

## Game night

1. DM: open the address, tap **I am the DM**, type the passcode. You get a four-letter code and a square to scan.
2. Players: scan the square (or open the link), type a name and tap **Join this table**. Without the link,
   open the same address, tap **Join a table** and type a name and the code. Then **Quick start** (five
   questions), **The full quiz** or **Pick a ready-made hero**, and they are playing.
3. DM: tap the table button at the top right at any time to see who has joined and to send a note
   or a photo. In the story, look for **Show the table** under pictures, **Paint the scene** above
   the text box, and **Paint this** next to anything that just happened.

To send people straight into one scenario, add `?s=<id>` to the address, for example `?s=tavern`.
A table's link already carries both: `?t=CODE&s=<id>`. While a phone is at a table, the table decides
the scenario.

## Where things are

- `src/` is the engine.
  - `rules.js` is the matching maths and the character sheet. `registry.js` turns a pack's data into
    the theme the screens read, fetches packs when they are wanted and chooses the one to open with.
    `base.js` is the base pack every scenario is laid over: plain words and placeholder art.
  - `app.js`, `styles.css`, `index.html` are the screens. `dice.js` is the dice (three.js for
    drawing, cannon.js for physics, Web Audio for the clinks); `flatdice.js` draws them where there
    is no 3D. `audio.js` is music and the small sounds. `fx.js` is the big moments (a natural 20, a
    natural 1). `table.js` is the players' link to the DM's table. `dm.js` is the DM's side: it
    plays whatever adventure the pack brings (`scenarios/<id>/adventure.js`).
  - `img/` is the engine's own art (the default look, and placeholders for packs without art yet).
    `vendor/` is three.js, cannon.js and the QR code maker. `css/` holds extra stylesheets.
- `scenarios/` is the packs, one folder each, and `packs.json`, which says which pack opens first
  and the order of the picker.
- `scripts/` is the tools: `validate.js`, `new-scenario.js`, the scaffold's `template/`, and
  `lib/packs.js`, which holds the checks the build and the tests share.
- `build.js` builds `public/`, the whole website: the page, `packs/<id>/` for each pack, the
  engine's `img/` and `vendor/`, and `_headers`. Never edit `public/`; it is rebuilt from scratch.
- `worker.js`, `server/` and `wrangler.jsonc` are the server: it serves the app, makes the OpenAI
  calls and keeps the tables. The key never reaches the browser.
- `test/unit/` is the unit tests. `rules.test.js` replays 200 recorded players per pack and expects
  exactly the classes, sheets and wording recorded in `fixtures/rules-baseline.json`.

## Make a new scenario

```bash
npm run new-scenario haunted-manor --name "The Haunted Manor"
```

That makes `scenarios/haunted-manor/` with a `scenario.js` that already works: a draft that
borrows the engine's look, art and everyday wording, with a full placeholder cast and quiz.

1. Open `scenarios/haunted-manor/scenario.js` and search for `TODO`. Rename the classes and
   peoples, rewrite the questions in your story's voice (keep the weights and the cast stays
   evenly reachable), and write the handful of lines that are most yours.
2. Run `npm run validate`. It names every problem by pack and key, and shows how evenly the quiz
   spreads players over your cast.
3. Try it: `node build.js --drafts`, then open `http://localhost:8787/?s=haunted-manor`.
   (Or start the dev server with `FR_DRAFTS=1 npm run dev` and drafts are built as you save.)
4. Add your pictures to `scenarios/haunted-manor/img/` and name them in the pack as you go. Until
   then the engine's placeholders stand in.
5. When it is ready, set `visibility: 'public'` and push. It appears on the title screen.

`scenarios/tavern/scenario.js` is a complete example. Its `text` holds only the lines it says in its own
voice; every line a pack may reword is listed, in plain words, in `src/base.js`.
`scenarios/northpole/` shows a pack with its own look, story, music and special rolls.

### The rules of a pack

- **A pack is data only.** `scenario.js` is one call, `FR.scenario({ ... })`, holding text, numbers,
  lists and objects: no functions, nothing computed at run time. The build ships it as JSON. Where a
  theme needs a sentence built from a character, it gives a [template](#wording-templates).
- **A pack is laid over the base.** `extends: 'base'` (the default) means anything the pack does not
  say comes from `src/base.js`. Small settings merge key by key, so `text: { begin: 'Enter' }`
  changes one line and keeps the rest. Content that only makes sense whole replaces the base's
  outright: `quiz.questions`, `quiz.quick`, `quiz.alignment`, everything in `cast`, `look.options`,
  `look.labels`, `roster.demo`, the templates, `music`, `particles`, and every list. `meta`, `id`,
  `version` and `adventure` are never inherited. A pack may extend another pack instead of the base;
  it inherits that pack's data and files, but not its `theme.css`.
- **A pack names its own files from its own folder**: `'img/keyart.webp'`, `'audio/intro.mp3'`.
  `'base:img/seal.webp'` borrows one of the engine's (`src/img/`). File names use letters, digits,
  `_`, `.` and `-`. The engine works out where each file is served from and adds its hash.
- **Every rule in `theme.css` starts with `body[data-theme="<id>"]`**, so one pack can never restyle
  another. Fonts are loaded through `tokens`, not `@import`.

### The pack, field by field

| Field | What it is |
| --- | --- |
| `schema` | `1`. |
| `id` | The folder name and the `?s=` address: lower-case letters, digits, hyphens. |
| `version` | `'1.0.0'`. Raise it when the pack changes. |
| `extends` | `'base'`, or another pack's id. |
| `meta.name`, `meta.blurb` | What the picker shows. |
| `meta.kind` | `'one-shot'` or `'campaign'`. |
| `meta.access`, `meta.sku` | `'free'` or `'paid'`, and the product a paid pack belongs to (`null` if none). The app does nothing with these yet; they are there for a store. |
| `meta.visibility` | `'public'` is listed on the title screen. `'unlisted'` is built and opens with `?s=<id>` but is not listed. `'draft'` is only built with `--drafts` and is never listed. |
| `meta.credits` | A list of `{ type, text }`, where type is `'music'`, `'art'` or `'writing'`. A pack with music must credit it; music credits are shown on the Settings sheet. |
| `adventure` | The id of the DM adventure that belongs to this pack, if it has one. The DM's door only shows for packs that have one. An adventure lives beside the pack as `adventure.js`, one call: `FR.adventure('<id>', { ... })`. |
| `tokens` | The look, as values. See [Tokens](#tokens-and-themecss). |
| `art` | `wordmark`, `divider`, `thumb` (the picker), `floor` (under the dice), and two patterns for the cast: `crest: 'img/crest_{slug}.webp'` and `sample: 'img/sample_{slug}.webp'`. `{slug}` is the class name in lower case with underscores (`Half Orc` is `half_orc`). A pattern without `{slug}` uses one picture for every class. |
| `quiz.questions` | The questions: `{ q, a: [{ t, w }] }`. `w` is how far an answer pushes each of eight traits: `might`, `guile`, `lore`, `faith`, `charm`, `wild`, `order` (minus is chaos) and `light` (minus is shadow). |
| `quiz.quick` | The five questions (numbered from 0) asked in a short game. `npm run validate -- --quick <id>` works out the five that spread players most evenly. |
| `quiz.traits` | The pack's names for the six strength traits, shown as bars. |
| `quiz.axes` | The words at each end of the two sliders: `[[low order, high order], [low light, high light]]`. |
| `quiz.alignment` | The line under the hero's name. `order` and `light` are lists of rules, `{ over, under, say }`, tried in turn against the average push per answer; the last has no limits. `parts` and `join` put the two together; `rename` swaps a whole result for another (`'Neutral Neutral'` becomes `'True Neutral'`). |
| `quiz.count` | The question counter: `{ text: '{i} of {n}', numerals: 'plain' or 'roman' }`. |
| `cast.classes` | By name: `v` (how much the class is about each of the eight traits, in the order above), `hd` (hit die), `prio` (how much it wants STR, DEX, CON, INT, WIS, CHA), `color` (its dice), `blurb`, `armor` (`unarmored`, `monk`, `leather`, `leather+shield`, `scale`, `scale+shield`, `chain+shield`, `none`), `skills`, `attacks` (`{ n, ab, die, cnt, hint, spell }`) and `gear` (for the portrait). |
| `cast.races` | By name: `v`, `bonus` (to ability scores), `speed`, `perk`, `look` (for the portrait), and optionally `tough` (an extra hit point), `lucky` (a rolled 1 may be rolled again) or `flex`. |
| `cast.names` | For each race, `{ m, f, s }`: first names and the second half, for "Roll a name". |
| `cast.samples` | For each class, the race shown in its sample portrait. |
| `cast.armorNotes` | What the sheet calls each kind of armor in this story, or `null`. |
| `look.options`, `look.labels` | The choices on the portrait screen and their headings: `body`, `age`, `build`, `hair`, `mark`, `bearing`. For `body`, `'Male'` and `'Female'` choose a name list. |
| `look.flourish` | Small details; two are drawn for each "Surprise me". |
| `roster.demo` | One finished hero, `{ name, cls, race, answers, look }`: the tests replay it. The app no longer hands it out; players pick from `roster.premades`. |
| `roster.premades` | At least six ready-made heroes: `{ name, cls, race, look, portrait }`. `portrait` defaults to the class's sample; `answers` default to the ones that hero would give. |
| `actions` | The "I want to..." menu: `{ id, label, hint, skill }`. |
| `extras` | Special rolls only this story has: `{ id, label, hint, sides, title, note, table }`, with one result per face. |
| `story` | The story so far, shown before the questions: a list of `{ img, alt, text }`, or `null`. |
| `music` | `{ intro: [...], game: [...], fight: [...] }`: files by scene, or `null`. |
| `particles` | What drifts past, or `null`: `motion` (`'rise'` or `'fall'`), `count`, `speed`, `base` (added to every particle's speed), `size`, `color` (one, or a pair to shade between), `alpha` (faintest and strongest), `flicker`, `fade` (toward the top) and `screens`. |
| `dice` | The 3D tray: `ink`, `inkMetal`, `fleck`, `fight`, `fightInk`, `rim { color, wood, metal, rough }`, `floorTint`, `floorBase`, `exposure`. |
| `sfx` | Which of the engine's sounds mark `tap`, `cheer`, `fumble` and `arrive`: `tink`, `tick`, `jingle`, `fanfare`, `chime`, `lowchime`, `womp`, `dingdong`, `sparkle`. A list plays several together. |
| `fx` | `crit` and `fumble`: a `title` and at least six short `lines`, shown on a natural 20 and a natural 1. |
| `prose` | `describe` and `origin`: [templates](#wording-templates) for the words the app writes with no AI. |
| `ai` | Optional extras for tables with OpenAI switched on: `style`, `describe` and `origin` are the prompts, `subject` is a [template](#wording-templates) for who to paint. |
| `text` | Every word on the screens. `npm run validate` knows which keys the screens use and fails a pack that is missing one. |

### Tokens and theme.css

`tokens` holds the values of a look. The build turns each one into a CSS custom property on
`body[data-theme="<id>"]`, and the engine loads the fonts. The engine's stylesheet
(`src/styles.css`) reads nothing but these properties: every colour, size, corner, shadow and
timing in it is a token, set there to the default look, "Tavern Night". So a pack gives itself
another look by filling in tokens, without touching the stylesheet.

`npm run new-scenario` writes every token into the new pack, set to the default and with a comment
saying what it does. Change the ones you want and delete the rest: a token a pack leaves out keeps
the default. A value may use another token, as `'var(--gilt)'`, or `'rgba(var(--night-rgb), 0.5)'`
for a see-through layer. Tavern Night sets no tokens at all; North Pole sets most of them.

| Group | Tokens | What they control |
| --- | --- | --- |
| `palette` | `night`, `soot` | The dark scene behind everything, and dark panels on it. `night` is also the colour of the phone's own bars (`theme-color`). |
| | `bone`, `mute` | Text and quieter text on the dark scene. |
| | `parch`, `ink`, `inkSoft` | The page (anything you read or fill in), and text and quieter text on it. |
| | `oxblood` | Headings, markers and chosen chips on the page. |
| | `wax`, `waxHi`, `waxDeep` | What you press, its lighter shade and its darkest (for the shadow under a button). |
| | `gilt`, `giltHi`, `giltDeep` | Gold: numbers and wins. |
| | `sage`, `pine` | The helpful note: its background and its edge. |
| | `edge`, `edgeDeep` | The rim of a card or panel, for looks that give them one. |
| | `onGilt`, `onWax` | Text on gold, and on the main button. |
| | `danger`, `dangerHi` | An error on the page, and the fight colour on the dark scene. |
| `channels` | `night`, `soot`, `bone`, `parch`, `ink`, `oxblood`, `wax`, `gilt` | The same colours as `'r, g, b'`, for see-through layers. Worked out from the palette unless given here. |
| `fonts` | `stylesheet` | The address of a font stylesheet, loaded beside the engine's own. |
| | `display`, `body`, `ui`, `sc`, `cap` | Families, most wanted first: headings and numbers, running text, hints and chips, buttons and labels, the drop cap. |
| `type` | `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `num` | The type scale in pixels: fine print, labels and hints, body, buttons and tabs, headings, big headings and stats, the hero's title, the roll. `xs` may not be under 14 and `sm` not under 15. |
| | `lineHeight`, `tracking`, `trackingDisplay` | Line height of body text; letter-spacing (in ems) of labels and of headings. |
| | `caps` | Buttons and labels: `'normal'`, `'small'` (small capitals) or `'upper'`. |
| | `dropCap` | `true` or `false`: a big first letter on the quiz question and the origin story. |
| | `emphasis` | Taglines and asides: `'italic'`, or `'bold'` (upright and heavier). |
| | `lead` | The quiz question: set in the `'body'` face or the `'display'` face. |
| `weight` | `body`, `medium`, `strong`, `label`, `display`, `head`, `lead` | Font weights: running text, fields and chips, emphasis, buttons and labels, headings and numbers, top-bar titles, the quiz question. |
| `space` | `1` to `7` | Spacing steps in pixels (4, 8, 12, 16, 20, 24, 32). |
| | `gutter`, `page`, `pageGap` | The screen's side margin; a page's padding and the gap between its parts. |
| `radii` | `btn`, `page`, `chip`, `pill`, `dialog`, `media`, `frame` | Corners in pixels: buttons and rows, pages, fields and chips, tags, dialogs and sheets, pictures, the phone column on a wide screen. |
| `line` | `border`, `icon`, `bar` | Border width, icon stroke and the height of the trait bars. |
| | `hairline`, `rim`, `rule` | Colours of lines: dividers on the dark scene, the edge of a control on it, dividers on a page. |
| | `divider` | Between sections of a page: `'taper'` (a tapered wedge) or `'line'`. |
| | `marker` | Bullets, answer markers and slider thumbs: `'diamond'` or `'dot'`. |
| | `note` | The helpful note: `'rules'` above and below, or a `'box'`. |
| `shadow` | `cardEdge`, `card` | A ring round a page (its edge), and the shadow under it. |
| | `btn`, `btnPress`, `ghost`, `press` | The main button, the same pressed, a quiet button; and `press`, how a pressed button moves (a CSS transform). |
| | `pop`, `row`, `display`, `text`, `art` | Anything that floats, a row on the play screen, under big type, under words on art, under the wordmark. |
| `motion` | `fast`, `base`, `slow`, `scene`, `loop`, `drift` | Timings in milliseconds: a press, a small change, a screen or dialog, the backdrop, one beat of a waiting mark, the title's slow zoom. |
| | `ease`, `bounce` | The two curves: most movement, and presses and arrivals. |
| `button` | `top`, `mid`, `bottom`, `edge` | The main button's gradient and its border. |
| | `ghost`, `selected`, `onSelected` | The fill of a quiet button; a chosen segment on the dark scene and the text on it. |
| `gold` | `top`, `mid`, `bottom` | The gradient of the roll. |
| | `titleTop`, `titleMid`, `titleBottom` | The gradient of the hero's title on the dark scene. |
| `surface` | `accent`, `accent2` | Titles, icons and the tab in use on the dark scene; and progress and bullets. |
| | `scrim`, `taglineScrim` | How dark the night is behind a dialog, and behind the title's tagline (0 to 1). |
| | `fieldBg`, `fieldEdge`, `placeholder` | A field or chip on a page: its fill, its edge and its hint. |
| | `decor`, `decorRule`, `pageTop`, `headRule`, `tabRule` | The decoration (any CSS gradient) and where it shows: a band across the top of pages and dialogs, the rule under headings, the rule under the tab in use (heights in pixels; 0 for none). |
| | `veilTop`, `veilBottom` | The play screen: how dark the table art is at the top and at the bottom (0 to 1). |
| | `rowBg`, `rowEdge` | A row on the play screen. |
| | `modBg`, `modInk`, `modEdge`, `modFightBg`, `modFightInk`, `modFightEdge` | The round badge a row's modifier sits in, and the same on the fight tab. |
| | `titleVeil`, `sceneFocus`, `sceneTitleFocus`, `sceneTitleFilter`, `sceneDim` | The backdrop: the gradient over it on the title, where the picture is centred, how it is graded on the title, how bright it stays when blurred. |
| | `portrait` | `'vignette'` (painted into the page, edges faded) or `'photo'` (a framed picture laid on it). |
| | `chrome` | The bars round the dice: `'fade'` into the tray, or solid `'panel'`s. |
| `images` | `key`, `page`, `table` | Pictures: the backdrop, behind anything you read (`null` for a flat page in the `parch` colour), behind the play screen. |

`npm run validate` checks every token: that it exists, that its value is the right kind (a colour,
a number, one CSS value), that the type scale keeps its floors, and that the colour pairs text is
set in can be read (4.5 to 1 for text, 3 to 1 for the edge of a field or note). It also checks the
engine itself: `src/styles.css` must declare every property a token can set.

Three more parts of a look sit beside `tokens` in the pack: `dice` (the 3D tray), `particles` (what
drifts past) and `fx`, the big moments. In `fx`, `crit` and `fumble` each take, besides the `title`
(under 22 characters) and `lines`: `particles` (what flies: `sprinkles`, `snow`, `sparks`,
`confetti`, `embers`, `coal` or `stars`), `colors` (two to eight; the first two light the moment,
all of them colour the particles) and, for `fumble`, `object` (the one sad thing that lands: `die`,
`coal`, `tankard`, `candle`, `snowball` or `star`).

Anything a token cannot say goes in `theme.css` beside the pack: a shape drawn with `::before`, one
rule for one thing. It should be small (North Pole's is a dozen rules) and should take its colours
and sizes from the tokens too. A pack with no tokens and no `theme.css` wears the default look, as
Tavern Night does.

### Wording templates

Where the app builds a sentence from a character, the pack gives a template:

```js
origin: {
  text: '{name} grew up {home}. These days {first} travels as a {clsLower}.',
  parts: {
    home: { from: 'race', map: { Dwarf: 'under a mountain', Elf: 'under old trees' }, or: 'on the road' },
    clsLower: { from: 'cls', lower: true }
  }
}
```

`{key}` is one of the template's `parts` if it has one by that name, otherwise a value from the
character: `name`, `first`, `cls`, `race`, `desc`, `top` (their strongest trait), `look.age` and the
other looks, `classInfo.gear`, `raceInfo.look`, `flourishA` and `flourishB`. A part reads one value
(`from`), may swap it through a table (`map`), lower-case it (`lower`) and wrap it (`wrap`, with
`{value}`); `or` is what to say when there is nothing. A part with `list` gathers several parts and
joins the ones that had something to say (`join`). Validation checks that every table has an entry
for every choice, and runs each template for every class and race.

### What validation checks

`npm run validate` fails, naming the pack and the key, when: the pack is not data only; a field is
missing or the wrong shape; a piece of copy the screens use is missing; a class lacks its numbers,
its badge or its sample; a premade or a sample names a class or race that is not in the cast; a
picture or a track that is named does not exist; a pack plays music without a credit; `quiz.quick`
names a question that is not there; a `theme.css` rule is not fenced to the pack; or the quiz
cannot reach the whole cast. For that last one it plays 20,000 seeded random players through the
full quiz and every possible set of answers through the quick one: each class and race must come
up between 0.4 and 2.2 times an even share (0.3 and 2.5 for the quick quiz). It warns, without
failing, about pictures over 400 KB, tracks over 2.6 MB, packs over 20 MB and leftover `TODO`s.

### For engine work

The screens read the pack in play from `FR.theme` (also `FR.THEMES[id]` for every loaded pack):
the cast (`classes`, `races`, `names`, `look`, `actions`, `extras`), the copy (`text`), the art
(`art.wordmark`, `art.thumb`, `art.floor`, `art.crest(cls)`, `art.sample(cls)`), `dice`,
`particles`, `music`, `story`, `sfx`, `fx`, `quiz.quick`, `roster.premades`, and the functions the
templates become (`alignment`, `count`, `describe`, `subject`, `origin`). `FR.MANIFEST` lists every
pack; `FR.loadScenario(id)` fetches one and resolves with its theme; `FR.app.useScenario(id)`
switches the app to it. `FR.sfx('cheer')` plays the pack's sound for a moment. `FR.rank(u, table,
quick)` ranks a short game against its own yardstick. `FR.loadAdventure(id)` fetches a pack's
`adventure.js`.

## Music and sound

Sound effects are made in the browser, so they need no files. Music is ordinary MP3 files in a
pack's `audio/` folder, listed per scene (intro, game, fight) in the pack's `music` entry. Players
switch music and sound effects on or off separately in Settings (the speaker button). Music starts off on a
phone that joins a table as a player, and on for the DM and for anyone playing alone; a choice made in
Settings is remembered and always wins.

The North Pole music is by Kevin MacLeod (incompetech.com), licensed under Creative Commons:
By Attribution 3.0 (https://creativecommons.org/licenses/by/3.0/), re-encoded here at 128 kbps:
"We Wish You a Merry Christmas", "Jingle Bells (Calm)", "Dance of the Sugar Plum Fairies",
"Oh, Christmas Tree", "Sugar Plum Breakdown" and "Sugar Plum Dark Mix". The same credit is in the
pack's `meta.credits` and is shown in the app on the Settings sheet; keep it there if you
keep the music.
