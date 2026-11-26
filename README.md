# First Roll

A tabletop-adventure companion for phones. A quick quiz turns each player into a hero, the dice
roll on their own phone, and a DM runs the table from a cartridge. Sessions are quick and need no
experience: open the address, answer a few questions, play.

The app is an **engine** plus **cartridges**. The engine (`src/`) is the screens, the dice,
the rules and the shared table. A pack (`cartridges/<id>/`) is one data file with its pictures and
music: a cast, a quiz, the words on every screen and a look. Two packs ship today, chosen on the
title screen: North Pole (opens first) and Tavern Night. A new one takes an afternoon; see
[Make a new cartridge](#make-a-new-cartridge).

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
first, and builds it again whenever a file in `src/` or `cartridges/` changes. To let phones on the
same Wi-Fi join, run `npx wrangler dev --ip 0.0.0.0` and open `http://<your computer's address>:8787`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the site on your computer |
| `npm run build` | Builds `public/` once (`node build.js --drafts` includes draft packs) |
| `npm run validate` | Checks every cartridge and says what is wrong, key by key |
| `npm run new-cartridge <id>` | Starts a new cartridge from the template (`--adventure` adds a starter adventure for the DM) |
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
publishes it. A pack with a fault stops the build, so a broken cartridge never goes live. Every
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

To send people straight into one cartridge, add `?s=<id>` to the address, for example `?s=tavern`.
A table's link already carries both: `?t=CODE&s=<id>`. While a phone is at a table, the table decides
the cartridge.

## Where things are

- `src/` is the engine.
  - `rules.js` is the matching maths and the character sheet, and the two sets of rules a cartridge
    may play by (`FR.PROFILES`: `open-5e` and `light`). `registry.js` turns a pack's data into
    the theme the screens read, fetches packs when they are wanted and chooses the one to open with.
    `base.js` is the base pack every cartridge is laid over: plain words and placeholder art.
  - `app.js`, `styles.css`, `index.html` are the screens. `dice.js` is the dice (three.js for
    drawing, cannon.js for physics, Web Audio for the clinks); `flatdice.js` draws them where there
    is no 3D. `audio.js` is music, the small sounds and the soundscapes behind a scene. `fx.js` is the
    big moments (a natural 20, a natural 1). `table.js` is the players' link to the DM's table. `dm.js` is the DM's side: it
    plays whatever adventure the pack brings (`cartridges/<id>/adventure.js`).
  - `img/` is the engine's own art (the default look, and placeholders for packs without art yet).
    `vendor/` is three.js, cannon.js and the QR code maker. `css/` holds extra stylesheets.
- `cartridges/` is the packs, one folder each, and `packs.json`, which says which pack opens first
  and the order of the picker.
- `scripts/` is the tools: `validate.js`, `validate-adventure.js`, `new-cartridge.js`, the scaffold's
  `template/` (a cartridge, the parts of it that depend on its rules in `rules.light.js` and
  `rules.open-5e.js`, a starter adventure and its hand-drawn map), and `lib/packs.js`, which
  holds the checks the build and the tests share.
- `build.js` builds `public/`, the whole website: the page, `packs/<id>/` for each pack, the
  engine's `img/` and `vendor/`, and `_headers`. Never edit `public/`; it is rebuilt from scratch.
- `worker.js`, `server/` and `wrangler.jsonc` are the server: it serves the app, makes the OpenAI
  calls and keeps the tables. The key never reaches the browser.
- `test/unit/` is the unit tests. `rules.test.js` replays 200 recorded players per pack and expects
  exactly the classes, sheets and wording recorded in `fixtures/rules-baseline.json`;
  `profiles.test.js` covers the two sets of rules.

## Make a new cartridge

```bash
npm run new-cartridge haunted-manor --name "The Haunted Manor"
```

That makes `cartridges/haunted-manor/` with a `cartridge.js` that already works: a draft that
borrows the engine's look, art and everyday wording, with a full placeholder cast and quiz. Every
part a cartridge can have is written out in it, with a comment saying what it is for.

It plays by the **light rules**: one twenty-sided die and a bonus, where a class only says what it
is strong at and fair at, and there are no numbers to write. Add `--rules open-5e` for the fuller
rules, where each class carries its numbers. [The two sets of rules](#the-two-sets-of-rules) says
what each needs and when to choose which.

Add `--adventure` and it also writes `adventure.js`, a small starter adventure for the DM (three
scenes, one choice, two endings) that uses every part an adventure can have, names it in
`cartridge.js`, and puts the starter's map in `img/map.svg` for you to redraw. It validates at once
and can be run from the DM's door as it is:

```bash
npm run new-cartridge haunted-manor --name "The Haunted Manor" --adventure
npm run new-cartridge haunted-manor --rules open-5e            # the fuller rules instead
```

1. Open `cartridges/haunted-manor/cartridge.js` and search for `TODO`. Fill in the label (how long,
   how many players, the mood), rename the classes and peoples and say what each class is good at
   (under the light rules: which skills it is strong at and fair at; that is all the rules ask),
   rewrite the questions in your story's voice (keep the weights and the cast stays evenly
   reachable), write the handful of lines that are most yours, and then the parts that tie a
   table together: the roles, the bonds and hooks, the items each class starts with, and what a hero
   token is called in your story.
2. Run `npm run validate`. It names every problem by pack and key, and shows how evenly the quiz
   spreads players over your cast.
3. Try it: `node build.js --drafts`, then open `http://localhost:8787/?s=haunted-manor`.
   (Or start the dev server with `FR_DRAFTS=1 npm run dev` and drafts are built as you save.)
4. Add your pictures to `cartridges/haunted-manor/img/` and name them in the pack as you go. Until
   then the engine's placeholders stand in.
5. When it is ready, set `visibility: 'public'` and push. It appears on the title screen.

`cartridges/tavern/cartridge.js` is a complete example. Its `text` holds only the lines it says in its own
voice; every line a pack may reword is listed, in plain words, in `src/base.js`.
`cartridges/northpole/` shows a pack with its own look, story, music and special rolls. Both play
by the open-5e rules; what `npm run new-cartridge` writes is the example of a light one.

### The two sets of rules

A cartridge says which rules it plays by with one line, `rules: 'light'` or `rules: 'open-5e'`
(a cartridge that says nothing plays by `open-5e`). Everything else in a cartridge, and every
adventure, is the same under both: the questions, the roles, the "I want to…" list, the kit, the
DM's three targets (10 easy, 13 medium, 16 hard).

| | `light` | `open-5e` |
| --- | --- | --- |
| A roll | One twenty-sided die plus a bonus, against a target only the DM sees. Never a second die. | The same, plus two dice keeping the better or worse, and damage dice after a hit. |
| A hero | Strong at a few skills (+5), fair at a few more (+2), plain at the rest (+0). | Six ability scores worked out from the answers, a class and a people; skills, armor, hit points, attacks. |
| Health | Three states: fine, hurt, in trouble. No hit points. | Hit points, said as the same three states unless rules details are on. |
| A fight | The same roll, on the skill a way of fighting comes down to. Whether it lands is the DM's call, and a hit moves the foe one state. | An attack roll against armor, then damage dice. |
| "Show rules details" | Adds each bonus as a number (`+5`). Nothing else. | Opens the full sheet: scores, skills by name, dice. |
| A class, in the cartridge | `role`, `blurb`, `strong`, `fair`, `strengths`, `kit`. No numbers. | Those, without `strong` and `fair`, plus `v`, `hd`, `prio`, `armor`, `skills`, `attacks`, `color`, `gear`. |
| A people, in the cartridge | One line of flavour (`perk`), optional. No numbers; it changes no roll. | `v`, `bonus`, `speed`, `perk`, `look`, and `tough`, `lucky` or `flex`. |
| Who a player becomes | The class is matched from the answers; the people is the one in that class's sample picture, and the player may change it. | The class and the people are both matched from the answers. |

With the light rules a strong hero passes a medium task (13) 13 times in 20 (65%, about two in
three), a fair one 10 in 20 and a plain one 8 in 20 (40%); a hard task (16) is an even chance for
a strong hero, and an easy one (10) is better than even for anybody.

**Choose `light`** for a quick sitting with people who have never played: there is nothing for a
player to keep track of, and far less for you to write (for the twelve classes and nine peoples
of Tavern Night, 174 values and no numbers, where the open-5e cartridge has 585 values, 331 of
them numbers). **Choose `open-5e`** when the table wants the full sheet: ability scores, armor,
weapons with their own damage, a people that changes the numbers. The two existing cartridges
are `open-5e`.

Under the light rules the quiz still finds a class for each player, with no numbers from you. The
engine knows what each of the eighteen skills says about a person (`FR.SKILL_TRAITS` in
`src/rules.js`), and reads a class as its strong skills, its fair skills at half weight, and the
trait of its role. So give every class a mix of skills no other class has: `npm run validate` says
how evenly the quiz spreads players over the classes, and names the class a rarely-reached one is
too much like.

To move a cartridge from one to the other, change the `rules` line and run `npm run validate`: it
lists what each class now needs, and warns (without failing) about what it carries that the new
rules never read.

### The rules of a pack

- **A pack is data only.** `cartridge.js` is one call, `FR.cartridge({ ... })`, holding text, numbers,
  lists and objects: no functions, nothing computed at run time. The build ships it as JSON. Where a
  theme needs a sentence built from a character, it gives a [template](#wording-templates).
- **A pack is laid over the base.** `extends: 'base'` (the default) means anything the pack does not
  say comes from `src/base.js`. Small settings merge key by key, so `text: { begin: 'Enter' }`
  changes one line and keeps the rest. Content that only makes sense whole replaces the base's
  outright: `quiz.questions`, `quiz.quick`, `quiz.alignment`, everything in `cast`, `look.options`,
  `look.labels`, `roster.demo`, the templates, `music`, `particles`, and every list. `meta`, `id`,
  `version` and `adventure` are never inherited. A pack may extend another pack instead of the base;
  it inherits that pack's data and files, but not its `theme.css`. Two tables sit in between:
  `sound.beds` and `kit.items` merge key by key (a cartridge's soundscapes sit beside the engine's
  seven), but each soundscape and each item it writes is taken whole, and `null` takes one away.
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
| `meta.label` | What the cartridge's card says to someone choosing what to play, and what the DM sees on the cover. All of it optional: `length`, `players`, `tone` and `dm` are a few words each (40 characters at most), `rating` is `'everyone'`, `'teen'` or `'mature'`, and `flags` is up to six short warnings (30 characters each). Whatever a cartridge leaves out comes from the base: `{ length: 'One sitting', players: 'Up to 8 players', tone: 'Adventure', dm: 'First-time DMs welcome', rating: 'everyone', flags: [] }`. Example: `label: { length: 'About 2½ hours', players: '3 to 6 players', tone: 'Silly and warm', dm: 'Good for a first-time DM', rating: 'everyone', flags: ['Toilet humor'] }`. |
| `meta.credits` | A list of `{ type, text }`, where type is `'music'`, `'art'`, `'writing'` or `'rules'`. A pack with music must credit it; music credits are shown on the Settings sheet. Every cartridge also carries the engine's `'rules'` credit, from `src/base.js`, without writing it: see [Credits](#credits). |
| `adventure` | The id of the DM adventure that belongs to this pack, if it has one. The DM's door only shows for packs that have one. An adventure lives beside the pack as `adventure.js`, one call: `FR.adventure('<id>', { ... })`. See [The adventure](#the-adventure). |
| `tokens` | The look, as values. See [Tokens](#tokens-and-themecss). |
| `art` | `wordmark`, `divider`, `thumb` (the picker), `floor` (under the dice), and two patterns for the cast: `crest: 'img/crest_{slug}.webp'` and `sample: 'img/sample_{slug}.webp'`. `{slug}` is the class name in lower case with underscores (`Half Orc` is `half_orc`). A pattern without `{slug}` uses one picture for every class. |
| `quiz.questions` | The questions: `{ q, a: [{ t, w }] }`. `w` is how far an answer pushes each of eight traits: `might`, `guile`, `lore`, `faith`, `charm`, `wild`, `order` (minus is chaos) and `light` (minus is shadow). |
| `quiz.quick` | The five questions (numbered from 0) asked in a short game. `npm run validate -- --quick <id>` works out the five that spread players most evenly. |
| `quiz.traits` | The pack's names for the six strength traits, shown as bars. |
| `quiz.axes` | The words at each end of the two sliders: `[[low order, high order], [low light, high light]]`. |
| `quiz.alignment` | The line under the hero's name. `order` and `light` are lists of rules, `{ over, under, say }`, tried in turn against the average push per answer; the last has no limits. `parts` and `join` put the two together; `rename` swaps a whole result for another (`'Neutral Neutral'` becomes `'True Neutral'`). |
| `quiz.count` | The question counter: `{ text: '{i} of {n}', numerals: 'plain' or 'roman' }`. |
| `cast.classes` | By name. Under `open-5e`: `v` (how much the class is about each of the eight traits, in the order above), `hd` (hit die), `prio` (how much it wants STR, DEX, CON, INT, WIS, CHA), `color` (its dice), `blurb`, `armor` (`unarmored`, `monk`, `leather`, `leather+shield`, `scale`, `scale+shield`, `chain+shield`, `none`), `skills`, `attacks` (`{ n, ab, die, cnt, hint, spell }`), `gear` (for the portrait) and `strengths`. Under `light`: `blurb`, `strong` and `fair` (below), with `role`, `strengths` and `kit` as for any cartridge; `color` and `gear` are optional (left out, the dice take a colour that suits the class, and the painter is told nothing about gear). |
| `cast.classes[Name].strong`, `.fair` | The light rules only. The skills the class is strong at (+5 on the die: one to four, two or three reads best) and fair at (+2: up to six, or `[]`). No skill in both. Example: `strong: ['Stealth', 'Sleight of Hand'], fair: ['Deception', 'Perception']`. The quiz matches players to classes from these and the role, so no two classes should have the same. |
| `cast.classes[Name].strengths` | Optional. What the class is good at, as exactly three plain sentences of 80 characters or fewer, with no rules words. Players see them in the lobby and on the sheet, the DM beside each player; the first is the one shown where there is room for one. Example: `strengths: ['You can talk your way out of almost anything.', 'Give you a song or a story and the whole room is yours.', 'You lie beautifully when the truth will not do.']`. A class without them gets one sentence for each of its first three skills. |
| `cast.skillStrengths` | Optional. Those stand-in sentences, one for a skill (80 characters at most). The base has all eighteen; a pack rewords the ones it wants: `skillStrengths: { Stealth: 'Nobody hears you coming.' }`. |
| `cast.roles` | Optional. Five or six plain jobs a hero can do at the table, by name: `{ blurb, does, trait }`. Players see them as role cards over the classes and in the lobby ("the party has no Protector yet"). `blurb` is the one line that sells the role (80 characters at most), `does` what you do with it (160); a name is 24 at most, and there may be two to eight. `trait` (optional) is `might`, `guile`, `lore`, `faith`, `charm` or `wild`: a class that names no role is filed under the role whose trait is its strongest. Example: `roles: { Protector: { trait: 'might', blurb: 'You stand in front, so your friends do not have to.', does: 'Push, lift, block and hold the line.' } }`. A cartridge that writes none gets the base's six (Protector, Trickster, Thinker, Healer, Talker, Scout); one that writes any replaces them all. |
| `cast.classes[Name].role` | Optional. Which role the class plays: one of the names in `cast.roles`. Example: `role: 'Protector'`. Left out, the class goes by its strongest trait. |
| `cast.classes[Name].kit` | Optional. The ids of the items (`kit.items`) a hero of this class starts with, four at most. Example: `kit: ['rope', 'lantern']`. |
| `cast.races` | By name. Under `open-5e`: `v`, `bonus` (to ability scores), `speed`, `perk`, `look` (for the portrait), and optionally `tough` (an extra hit point), `lucky` (a rolled 1 may be rolled again) or `flex`. Under `light` a people is flavour and changes no roll: `perk` (one line about them, shown when a hero is revealed and on the sheet) and `look` (for the painter), both optional. Example: `'Forest Folk': { perk: 'Keen senses: little in the woods gets past them.' }`. |
| `cast.names` | For each race, `{ m, f, s }`: first names and the second half, for "Roll a name". Under `light` one people's list is enough: a people with none of its own borrows the first. |
| `cast.samples` | For each class, the race shown in its sample portrait. Under `light` it is also the people a hero of that class starts as, so the hero and the picture they are handed agree. |
| `cast.armorNotes` | `open-5e` only. What the sheet calls each kind of armor in this story, or `null`. |
| `look.options`, `look.labels` | The choices on the portrait screen and their headings: `body`, `age`, `build`, `hair`, `mark`, `bearing`. For `body`, `'Male'` and `'Female'` choose a name list. |
| `look.flourish` | Small details; two are drawn for each "Surprise me". |
| `roster.demo` | One finished hero, `{ name, cls, race, answers, look }`: the tests replay it. The app no longer hands it out; players pick from `roster.premades`. |
| `roster.premades` | At least six ready-made heroes: `{ name, cls, race, look, portrait }`. `portrait` defaults to the class's sample; `answers` default to the ones that hero would give. |
| `actions` | The "I want to..." menu: `{ id, label, hint, skill }`. |
| `extras` | Special rolls only this story has: `{ id, label, hint, sides, title, note, table }`, with one result per face. |
| `intent` | Optional. The words behind "Or say what you do": when a player types what their hero does, the app suggests the check it most likely comes down to. `words` maps a word, or a phrase of up to four words, to a skill, in lower case and in its plain form (`climb` also answers for climbs, climbed and climbing). The base knows about two hundred everyday words; a pack adds its story's own, moves one to another skill, or drops one with `null`: `intent: { words: { skate: 'Acrobatics', 'ring the bell': 'Performance', lock: null } }`. `why` is the sentence the reason is given in, `'That comes down to {why}.'`, where `{why}` is the pack's own words for that skill (`text.whyAcrobatics` and the rest). |
| `ties.bonds` | Optional. Questions about another player's hero, asked once a hero is made at a table; the answer is shown to the whole table. Each must contain `{name}`, where that hero's name goes, and be 120 characters or fewer (so it fits with a name in it); 20 at most. Example: `bonds: ['Why do you owe {name} a favor?']`. Left out, the base's are used. |
| `ties.hooks` | Optional. A personal stake in the story, picked (or skipped) by each player and seen only by them and the DM: `{ id, text, roles }`. `id` is a short word of its own in lower case (40 characters at most), `text` 240 at most. `roles` keeps a hook for heroes of those roles (names from `cast.roles`); leave it out for a hook anyone may take. 20 at most. Example: `hooks: [{ id: 'debt', text: 'You owe someone a favor that money cannot repay.' }, { id: 'oath', text: 'You promised to look after the others.', roles: ['Protector'] }]`. |
| `ties.voices` | Optional. Ways to talk, for a player who would like to try one: `{ label, tip }`, a word or two (24 characters) and how to do it (120). 12 at most. Example: `voices: [{ label: 'Gruff', tip: 'Short sentences. Long pauses.' }]`. |
| `kit.items` | Optional. What a hero carries or can do, by id: `{ name, text, img, uses }`. Each is a card on the player's phone with a "Use" button that tells the DM, so `text` says what it is good for in plain words (160 characters at most; `name` 40). `uses` is `'once'` (it is used up) or `'always'`. `img` is optional, a picture in the cartridge. An id is a short word in lower case; 40 items at most. Example: `items: { rope: { name: 'Fifty feet of rope', text: 'Climb it, tie it, lower a friend on it.', uses: 'always' } }`. |
| `kit.token` | Optional. What a hero token is called here: `{ name, plural, text }` (24, 24 and 160 characters). The DM hands one out for a great moment; a player spends it to roll again. The base says `{ name: 'Hero token', plural: 'Hero tokens', text: 'Spend one to roll again when it matters. Your DM hands them out for great moments.' }`; a cartridge rewords any of the three: `token: { name: 'Gold star', plural: 'Gold stars' }`. |
| `sound.beds` | Optional. Soundscapes the DM can put behind a scene, by id: `{ label, synth }` for one the engine makes on the spot, or `{ label, file }` for one of the cartridge's audio files. `synth` is `wind`, `fire`, `storm`, `crowd`, `cave`, `night` or `sea`; `label` (40 characters at most) is what the DM's picker says. Every cartridge already has those seven under those ids, so a cartridge only writes the ones it wants to say its own way, add or take away: `beds: { wind: { label: 'Snow on the wind', synth: 'wind' }, carols: { label: 'Carols, softly', file: 'audio/game_jingle.mp3' }, sea: null }`. 24 at most. An adventure names one by its id (`sound: 'wind'`). |
| `rules` | Optional. The rules the cartridge plays by: `'light'` (one die and a bonus; what `npm run new-cartridge` writes) or `'open-5e'` (the fuller maths, hidden under plain words, and what a cartridge that says nothing gets). See [The two sets of rules](#the-two-sets-of-rules). Example: `rules: 'light'`. |
| `light.fight` | Optional, and read only under `rules: 'light'`. The ways to fight listed on the fight tab: `{ id, label, hint, skill }`. Each is a roll like any other; `skill` is the skill it comes down to, or a list of skills (the hero rolls whichever they are best at). `id` is a short word in lower case, `label` 40 characters at most, `hint` 80; eight at most. The base has six that suit most stories; a cartridge that writes the list replaces it. Example: `light: { fight: [{ id: 'steel', label: 'Swing steel', hint: 'Sword, axe, mace or a bar stool', skill: 'Athletics' }, { id: 'spell', label: 'Cast a spell', hint: 'Fire, frost, or the wrath of the gods', skill: ['Arcana', 'Nature', 'Religion'] }] }`. |
| `light.text` | Optional. The eight lines only the light rules say, any of which a cartridge may reword: `fairAt` (`'Fair at this'`, the badge on a row), `fairAtHead` (`'Fair at'`, on the sheet), `hitSay` and `hitNat20` (what the tray says after a fight roll), `fightHowB` and `fightHow` (the line under the fight tab), `detailsNote` (what "Show rules details" does) and `matchNote` (the line under the choices when a hero is revealed). Every other line is in `text`, as for any cartridge. |
| `story` | The story so far, shown before the questions: a list of `{ img, alt, text }`, or `null`. |
| `music` | `{ intro: [...], game: [...], fight: [...] }`: files by scene, or `null`. |
| `particles` | What drifts past, or `null`: `motion` (`'rise'` or `'fall'`), `count`, `speed`, `base` (added to every particle's speed), `size`, `color` (one, or a pair to shade between), `alpha` (faintest and strongest), `flicker`, `fade` (toward the top) and `screens`. |
| `dice` | The 3D tray: `ink`, `inkMetal`, `fleck`, `fight`, `fightInk`, `rim { color, wood, metal, rough }`, `floorTint`, `floorBase`, `exposure`. |
| `sfx` | Which of the engine's sounds mark `tap`, `cheer`, `fumble` and `arrive`: `tink`, `tick`, `jingle`, `fanfare`, `chime`, `lowchime`, `womp`, `dingdong`, `sparkle`. A list plays several together. |
| `fx` | `crit` and `fumble`: a `title` and at least six short `lines`, shown on a natural 20 and a natural 1. |
| `prose` | `describe` and `origin`: [templates](#wording-templates) for the words the app writes with no AI. |
| `ai` | Optional extras for tables with OpenAI switched on: `style`, `describe` and `origin` are the prompts, `subject` is a [template](#wording-templates) for who to paint. |
| `text` | Every word on the screens. `npm run validate` knows which keys the screens use and fails a pack that is missing one. Health is said as a state as well as a number: `healthFine`, `healthHurt` and `healthTrouble` (`'Fine'`, `'Hurt'`, `'In trouble'` in the base; North Pole says `'Merry and bright'`, `'A bit frazzled'`, `'In a real pickle'`). |

### The adventure

A cartridge may bring one adventure for the DM to run: `adventure.js` beside `cartridge.js`, one
call, `FR.adventure('<cartridge id>', { ... })`, data only. `src/dm.js` plays any adventure written
this way. The whole format is written up, part by part, in the comment at the top of
`cartridges/northpole/adventure.js`: the cover, the bible (people, places, things), flags, the
clock, the flow (chapters, scenes, interludes, hubs, shortcuts), conditions, the story helper and
the painter. `npm run new-cartridge <id> --adventure` writes a small one to start from.

The format is now `schema: 3`. Format 2 is format 1 plus what the players' phones are shown. Format 3
adds what the whole table shares (a map, a soundscape, a picture turned over together, a vote) and
what helps the DM pace the night (beats, foes, the easier and harder lines, minutes). Every part is
optional. A `schema: 1` file is still read and checked exactly as before (it may not use the format 2
parts, and is told how to switch them on if it tries), and so is a `schema: 2` file; a format 3 part
in either is read all the same, with a reminder to change the number at the top.

| Field | What it is |
| --- | --- |
| `brief` | The DM's brief, one page to read before the first game. `about` is a few sentences (800 characters at most), `people` the ids of up to six people from the bible, `endings` and `tips` up to six lines each (300 characters). Example: `brief: { about: 'A storm, a lonely inn, and something knocking under the floor.', people: ['keeper', 'ember'], endings: ['They open the door gently and make a friend.'], tips: ['Read the “Read aloud” boxes to the table and keep the rest to yourself.'] }`. |
| `summary` on a chapter, a scene, an interlude or a hub | What players are told is happening: shown under "What's happening?" and read first by someone who joins late. One or two lines (400 characters at most) with nothing in them the DM has not yet revealed. Example: `summary: 'You are at the cellar door. The knocking has stopped. Something on the other side just said hello.'`. |
| `tries[].check` | The roll as the app understands it, beside the free words in `roll`, so the DM can ask for it with one tap and only the DM sees the number to reach. The skill is one the rules know and the target a whole number from 1 to 40 (about 10 is easy, 13 medium, 16 hard). Example: `{ try: 'Listen at the cellar door', roll: 'Perception, easy (10)', check: { skill: 'Perception', target: 10 }, yes: '...', no: '...' }`. `check: false` says there is nothing to roll. |
| `tries[].hint` | The small line under the action card players see for this try (120 characters at most). Example: `hint: 'Put an ear to the wood'`. The card's title is the try's own words, so keep `try` to 60 characters. |
| `tries[].card` | `card: false` keeps a try off the players' phones: for one whose title would give a secret away, or that only makes sense once the DM has brought something in. The DM still sees it. A scene can show eight cards. Example: `{ try: 'Lift the key from her apron pocket', roll: 'Sleight of Hand, medium (13)', check: { skill: 'Sleight of Hand', target: 13 }, card: false, ... }`. |
| `quests` | The quest board: up to 12 of `{ id, text, from, done }`. `text` is 160 characters at most. A quest is on the board once `from` holds (always, with none) and is ticked off once `done` holds. Example: `quests: [{ id: 'door', text: 'You have the key. Open the cellar door.', from: { flag: 'key' }, done: { flag: 'met' } }]`. |
| `clues` | What the party has learned: up to 20 of `{ id, text, when }`, `text` 200 characters at most. A clue shows once `when` holds. Example: `clues: [{ id: 'pocket', text: 'The innkeeper kept the cellar key in her own apron pocket.', when: { flag: 'key' } }]`. |
| `bible.people[].public` | What players may know about someone, for the who's who: `{ line, when }`. `line` is one sentence (160 characters at most) and never the secret; the person shows once `when` holds, or from the start with none. Someone with no `public` is never shown. Example: `public: { line: 'The thing that was knocking: a hearth spirit about the size of a cat.', when: { flag: 'met' } }`. |
| `handouts` | Notes, letters and pictures the DM can give to one player or to everyone: up to 24 of `{ id, title, text, img, at }`. `title` is 80 characters at most, `text` 1200; a handout needs words, a picture, or both. `at` is where it belongs, so the DM is offered it there: the id of a chapter, an interlude or a hub, or one scene as `'chapter/scene'`; leave it out for one that is always to hand. Example: `handouts: [{ id: 'sign', title: 'The sign on the cellar door', at: 'inn/door', text: 'KEEP OUT.\nRats. Very big rats.' }]`. |

Format 3 adds these. A "scene" below is a scene of a chapter or an interlude; a hub may have `map`,
`sound` and `vote` too.

| Field | What it is |
| --- | --- |
| `maps` | Up to 8 maps: `{ id, title, img, regions }`. `img` is any wide picture of the cartridge's own; `title` is 80 characters at most. `regions` are the parts that are uncovered as the story goes, 24 at most: `{ id, name, x, y, w, h, when }`, where `x` and `y` are the top left corner and `w` and `h` the width and height, all in percentages of the picture (0 to 100), and `name` is what the table calls it once it shows (40 characters at most). A region is uncovered when a scene's `map` opens it; with a `when` it also counts as uncovered whenever that condition holds, which keeps the map right when it is put up late. Example: `maps: [{ id: 'inn', title: 'The Last Lantern', img: 'img/map.svg', regions: [{ id: 'taproom', name: 'The taproom', x: 2, y: 6, w: 52, h: 88 }, { id: 'cellar', name: 'The cellar', x: 68, y: 6, w: 30, h: 88, when: { flag: 'met' } }] }]`. |
| scene `map` | The map to put up on arriving here and the regions to uncover, for the DM to do with one tap: `map: { id: 'inn', open: ['taproom'] }`. Leave `open` out to show the map as it stands. |
| `sound` on a chapter or a scene | The soundscape behind it: the id of one of the cartridge's (`sound.beds`, or one of the engine's seven). A scene's own wins over its chapter's. Example: `sound: 'storm'` on the chapter, `sound: 'fire'` on the scene by the hearth. |
| scene `beats` | Moments the DM can fire so that every phone feels them at once, six at most: `{ id, label, kind }`. `label` is the words on the DM's button (40 characters at most); `kind` is `thunder`, `hit`, `reveal`, `bell`, `crash` or `hush`. Example: `beats: [{ id: 'knock', label: 'Knock. Knock. Knock.', kind: 'hit' }]`. |
| scene `reveal` | A picture worth holding face down on every phone and turning over together: `{ id, title, img }`. The title (80 characters at most) is seen before the flip, so it must give nothing away. Example: `reveal: { id: 'ember', title: 'What was knocking', img: 'img/ember.webp' }`. |
| scene `easier`, `harder` | The difficulty dial: one line each for the DM (240 characters at most) on what to change if the table is struggling here, or finding it too easy. Example: `easier: 'She pats her apron pocket whenever the cellar is mentioned.'`, `harder: 'She keeps the bar between herself and anyone who asks twice.'`. |
| `minutes` on a chapter or an interlude | About how long it takes to play, as a whole number (1 to 600), for the DM's pacing clock. Give every chapter and interlude one, or none. Example: `minutes: 25`. |
| `foes`, and scene `foes` | Whatever the party may fight or face down, 12 at most: `{ id, name, img, hits, moves }`. `name` is 40 characters at most and `img` optional. `hits` is how many good hits it takes to deal with it, 1 to 6: nobody keeps numbers, and the DM's screen shows it as a state. `moves` are two or three things it might do on its turn, in plain words (four at most, 120 characters each). A scene lists the ids of the foes that may turn up there (eight at most; the same one may be listed more than once). Example: `foes: [{ id: 'ember', name: 'Something small and bright', hits: 1, moves: ['Darts behind the turnip sacks and dims to almost nothing.'] }]`, and on the scene `foes: ['ember']`. |
| scene `vote` | A choice worth putting to the whole table: a question (120 characters at most) and two to four answers (40 each). Example: `vote: { q: 'How do you open the cellar door?', options: ['Gently, and say hello', 'Fast, ready for anything'] }`. |

`from`, `done` and `when` are conditions, the same ones the story already uses: `{ flag: 'key' }`,
`{ flag: 'met', is: 'friend' }`, `{ seen: 'inn' }`, `{ picked: 'laugh' }`, `{ all: [...] }`,
`{ any: [...] }`, `{ not: {...} }` and the rest. "The story so far" on the phones is built from the
`log` line of each outcome the DM taps, so keep a `log` to 240 characters. A picture is one of the
cartridge's own (`'img/cellar.webp'`) or one of the engine's (`'base:img/keyart.webp'`).

The sizes are the ones the table on the server keeps to (docs/PHASE1.md, section 1.1, and
docs/PHASE2.md, section 1.1), so a scene, and the stage the whole table shares, always arrive whole.

### Tokens and theme.css

`tokens` holds the values of a look. The build turns each one into a CSS custom property on
`body[data-theme="<id>"]`, and the engine loads the fonts. The engine's stylesheet
(`src/styles.css`) reads nothing but these properties: every colour, size, corner, shadow and
timing in it is a token, set there to the default look, "Tavern Night". So a pack gives itself
another look by filling in tokens, without touching the stylesheet.

`npm run new-cartridge` writes every token into the new pack, set to the default and with a comment
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
cannot reach the whole cast.

It checks the newer parts the same way. In the cartridge: a `meta.label` line that is not a few
words or is over 40 characters, a rating that is not one of the three, flags that are not a short
list; `strengths` that are not exactly three sentences of 80 characters or fewer; a word in
`intent.words` that is not plain lower case or names a skill the rules do not know. In the
adventure, where each message begins with `cartridges/<id>/adventure.js` and the place
(`flow.chapters[inn].scenes[taproom].tries[1] ("Listen at the cellar door")`): anything players
read (`summary`, a card's `hint`, a quest, a clue, a `public` line, a handout's title and words)
that is empty or longer than a phone shows; a `check` whose skill the rules do not know or whose
target is not a whole number from 1 to 40; a quest's `from` or `done`, a clue's `when` or a
person's `public.when` that is not a real condition on real flags and places; a `brief` that names
someone who is not in the bible; a handout whose `at` names no chapter, hub or scene, or whose
picture is not there; more than eight cards in a scene, twelve quests or twenty clues; and a
`schema: 1` adventure that uses a format 2 part. For that last one it plays 20,000 seeded random players through the
full quiz and every possible set of answers through the quick one: each class and race must come
up between 0.4 and 2.2 times an even share (0.3 and 2.5 for the quick quiz). It warns, without
failing, about pictures over 400 KB, tracks over 2.6 MB, packs over 20 MB and leftover `TODO`s; and,
in a format 2 adventure, about a scene with things to try but no `check` on any of them (the DM
could not ask for those rolls with one tap: give each a `check`, or `check: false` where there is
nothing to roll), a try over 60 characters, and a `log`, `yes` or `no` longer than a phone shows.

It checks a cartridge by the rules it plays by. An `open-5e` cartridge is checked as above. A
`light` one must give each class a `blurb`, a `strong` list of one to four skills and a `fair`
list of up to six (`[]` is fine), all of them real skills, none twice and none in both lists; it
fails when two classes have the same role and the same skills (the quiz could not tell them apart),
when a `color` is not a colour, when a `perk`, `look` or `gear` that is written says nothing, when
no people has names, when a way to fight has no id, label, hint or skill, or names a skill that
does not exist, or there are more than eight, and when `light.text` holds a line the light rules do
not say. The reach check is the same for the classes (a people is not chosen by the answers), and
names the class that a rarely-reached one reads too much like. It warns, without failing, when a
light cartridge still carries what only `open-5e` reads (`v`, `hd`, `prio`, `armor`, `skills`,
`attacks` on a class; `v`, `bonus`, `speed`, `tough`, `lucky`, `flex` on a people; `armorNotes`),
when a people is no class's sample (no hero would start as one), and when an `open-5e` cartridge
carries `strong`, `fair` or a `light` block of its own.

It checks the parts added since (cartridge spec v3 and adventure format 3) the same way. In the
cartridge: roles that are not two to eight, or whose name, `blurb` or `does` is missing or too long;
a class whose `role` is not one of the roles, or whose `kit` lists more than four items or one that
does not exist; a bond without `{name}`, or with any other blank, or over 120 characters; a hook
with no id, an id used twice, words over 240 characters, or `roles` that do not exist; a voice with
no label or tip; an item with a bad id, no name or line, a `uses` that is not `'once'` or `'always'`,
or a picture that is not there; a token line that is missing or too long; a soundscape with both a
`synth` and a `file` or neither, a `synth` the engine does not make, a `file` that is not an audio
file or is not there; and `rules` that are not `'open-5e'` or `'light'`. In the adventure: a map
with no title, picture or regions, or more than 24; a region with no name, a rectangle that is not
four numbers, is empty or runs off the picture, or a `when` that is not a real condition; a scene
whose `map` names a map or a region that does not exist; a `sound` that is not one of the
cartridge's soundscapes; a beat with no words or a kind the app does not know; a reveal with no
title or picture; an `easier` or `harder` line that is empty or too long; `minutes` that are not a
whole number from 1 to 600; a foe with no name, `hits` outside 1 to 6 or no `moves`, and a scene
that names a foe that is not listed; a vote without two to four different answers. It warns,
without failing, when a cartridge writes its own roles and leaves a class without one, when some
chapters have `minutes` and others do not, and when a file that says `schema: 1` or `2` uses a
format 3 part.

An adventure can also be checked by itself:
`node scripts/validate-adventure.js cartridges/<id>/adventure.js --images cartridges/<id>`. Run
this way it reads the `cartridge.js` beside the file, so a `sound` is checked too.

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

What cartridge spec v2 added to that: `FR.theme.label` is the cartridge's label laid over the
base's, always whole (`length`, `players`, `tone`, `dm`, `rating`, `flags`); `FR.theme.credits` is
every credit the cartridge carries, the base's rules credit first; `FR.theme.classes[Name].strengths`
is always a list of sentences (the cartridge's three, or one for each of the class's first three
skills); each entry of `FR.MANIFEST.packs` carries the same `label` and `credits`, for cartridges
that are not loaded yet. `FR.checkFor(text)` takes what a player typed and returns
`{ skill, word, why }` (the skill, the word that gave it away, and a plain reason) or `null` when
it knows nothing; it reads `FR.theme.intent`, or the theme passed as a second argument. An
adventure reaches `FR.ADVENTURES[id]` exactly as written, with every picture path already an
address the page can load: `brief`, `quests`, `clues` and `handouts` at the top, `summary` on
chapters, scenes, interludes and hubs, `check`, `card` and `hint` on tries, `public` on people.
Its conditions are evaluated by the DM's runner (`holds` in `src/dm.js`); nothing in the registry
evaluates them.

What cartridge spec v3 added: `FR.theme.roles` is the cartridge's roles (or the base's six), in
order, each `{ blurb, does, trait }`; `FR.theme.classes[Name].role` is the class's role (its own, or
the role of its strongest trait) and `.kit` is always a list of item ids; `FR.theme.ties` is
`{ bonds, hooks, voices }`, where a hook always carries `roles` (empty for anyone) and a bond is
filled with `bond.split('{name}').join(name)`; `FR.theme.kit` is `{ items: { id: { name, text, img,
uses } }, token: { name, plural, text } }`; `FR.theme.beds` is the soundscapes by id, each
`{ label, synth }` or `{ label, file }` with the file already an address the page can load;
`FR.theme.rules` is `'open-5e'` or `'light'`. `FR.AMBIENCE`, `FR.BEATS` and `FR.RULES` are the
engine's lists of voices, kinds of beat and rules. `FR.Ambience.play(bed)` takes one of
`FR.theme.beds` (or its id) and plays it; see [Music and sound](#music-and-sound). An adventure's
format 3 parts reach `FR.ADVENTURES[id]` as written: `maps` and `foes` at the top, `map`, `sound`,
`beats`, `reveal`, `foes`, `vote`, `easier` and `harder` on scenes, `sound` and `minutes` on
chapters, with the pictures of maps, reveals and foes already addresses the page can load, which
are also ones the table's stage accepts.

Rules profiles: no screen assumes one set of rules. `FR.profile(theme)` is the profile a cartridge
plays by (of the one in play when none is named), one of `FR.PROFILES` in `src/rules.js`, where
the interface is written out. A profile says who a set of answers makes (`rank`, `raceFor`),
builds the sheet (`build`; `FR.build` uses the profile in play), gives the bonus for a skill
(`bonus`: `{ mod, good, known }`), what a tab of the play screen lists and what each row rolls
(`rows`), what a roll the DM asks for rolls (`request`; `FR.play.requestRoll` asks it), what the
sheet shows (`sheet`), what health is (`healthMax`, `healthSteps`), whether there is armor
(`armor`) or a second go at a rolled 1 (`lucky`), what "Show rules details" opens (`jargon`:
the rule book under `open-5e`; under `light` only the bonuses), and the two lines it says in place
of the cartridge's own (`say`). `prepare(theme)` runs when a
cartridge is put together: under `light` it works out each class's lean on the eight traits
(`FR.theme.classes[Name].v`, from `FR.lightLean`), sets its `skills` to the strong ones and gives
it a dice colour if it named none, so the rest of the app, the DM's side included, reads a light
class as it reads any other. `FR.theme.light` is `{ fight: [{ id, label, hint, skills }], text }`.
To add a third set of rules, add a profile that answers the same questions, a
`scripts/template/rules.<id>.js` for the scaffold, and its checks in `scripts/lib/packs.js`.

## Music and sound

Sound effects are made in the browser, so they need no files. Music is ordinary MP3 files in a
pack's `audio/` folder, listed per scene (intro, game, fight) in the pack's `music` entry. Players
switch music and sound effects on or off separately in Settings (the speaker button). Music starts off on a
phone that joins a table as a player, and on for the DM and for anyone playing alone; a choice made in
Settings is remembered and always wins.

A **soundscape** is a quiet loop behind a scene: wind, a fire, rain, a busy room. The DM picks one
for the table and every device with sound effects switched on plays it, under the talking. Seven are
made in the browser from filtered noise, with no files (`wind`, `fire`, `storm`, `crowd`, `cave`,
`night`, `sea`: the voices of `FR.Ambience` in `src/audio.js`), and a cartridge may add its own audio
files beside them (`sound.beds`). `FR.Ambience.play(bed)` fades one in over about a second,
`stop()` fades it out, `level(0..1)` sets how loud, and `playing()` says what is sounding; it falls
silent with the sound effects switch and while the page is hidden. A soundscape that is a file is
music, so whatever plays it should hush the scene music first.

The North Pole music is by Kevin MacLeod (incompetech.com), licensed under Creative Commons:
By Attribution 3.0 (https://creativecommons.org/licenses/by/3.0/), re-encoded here at 128 kbps:
"We Wish You a Merry Christmas", "Jingle Bells (Calm)", "Dance of the Sugar Plum Fairies",
"Oh, Christmas Tree", "Sugar Plum Breakdown" and "Sugar Plum Dark Mix". The same credit is in the
pack's `meta.credits` and is shown in the app on the Settings sheet; keep it there if you
keep the music.

## Credits

**Rules.** The rules the engine plays by (ability scores, skills, checks, armor, attacks and
damage, in `src/rules.js`) derive from the System Reference Document 5.2, which Wizards of the
Coast LLC released under the Creative Commons Attribution 4.0 International License. First Roll
simplifies those rules and says them in plain words. The attribution the licence asks for:

> This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the
> Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative
> Commons Attribution 4.0 International License, available at
> https://creativecommons.org/licenses/by/4.0/legalcode.

It is a credit of type `'rules'` in the base cartridge (`src/base.js`, `meta.credits`), so every
cartridge carries it: it is in each cartridge's entry in the manifest and in `FR.theme.credits`,
for the Settings sheet to show. Keep it while the rules are the engine's.

**Music.** See [Music and sound](#music-and-sound), above.
