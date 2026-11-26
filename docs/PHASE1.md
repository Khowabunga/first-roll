# Phase 1 contract: the guided loop

The working spec for Phase 1 of [PLAN.md](PLAN.md). Every builder codes against this page; if something
here turns out wrong, change this page in the same piece of work and say so in your report.

**Goal.** A brand-new player goes from a table code to a first story roll in under ten minutes and
never has to ask "what do I do?". The missing piece is a live link between the DM's current scene and
every phone. Decisions already taken: today's rules maths stays (hidden under plain words); the server's
table is the source of truth; numbers go to Cloudflare's own logs; no Family mode.

**The rule for every feature** (from PLAN.md): it reads cartridge data, has a default in the base
cartridge, is scaffolded by `npm run new-cartridge`, is checked by `npm run validate`, is used by the
North Pole cartridge, and is documented in the README's cartridge spec. Nothing about one story lives
in `src/` or `server/`.

Words: a **cartridge** is `cartridges/<id>/` (`cartridge.js`, optional `adventure.js`, `theme.css`,
`img/`, `audio/`). On the wire and in storage its id is still called `scenario` (`?s=`, the table's
`scenario` field, `FR.app.useScenario`): leave those names alone.

---

## 1. Server (`server/core.js`, `worker.js`)

All calls are POST JSON to `/api/table/<route>?c=CODE`; errors are `{ error, reason? }` (`error` is a
sentence a player can read, `reason` a word the app can act on). Everything that exists today keeps
working, including phones running yesterday's page.

Built, and true of every new route: the token is checked before anything else, so an unknown code or
token gets the same bare 404 as everywhere; a seat that was taken over or removed hears 409 `moved` or
`removed`, and an ended table 410 `closed`. A DM-only route answers a player 403 `dm_only`; the two
player-only routes (`propose`, `leave`) answer the DM 403 `player_only`. `worker.js` did not need to
change.

### 1.1 Scene state

`scene` (DM only) `{ token, scene }` → `{ n }`. The table keeps one tidy copy, numbered. Unknown keys are
dropped, strings are cut to length, lists to size; more than 24 KB of JSON is refused (413 `too_large`,
measured on the scene as it was sent), and a `scene` that is not an object is 400 `bad_scene`. An entry
with no label (cards), text (quests, clues) or name (people) is dropped; an `img` that is neither kind
of picture becomes `""`; of more than 30 story lines the newest 30 are kept. Publishing the very same
scene again keeps its number, so no phone fetches it twice.

```
scene = {
  id (<=40), chapter (<=80), title (<=80),
  summary (<=400),                                  // "what is happening", safe for players
  img,                                              // a shipped picture path, or one of this table's kept pictures
  cards:  [<=8  of { id (<=40), label (<=60), hint (<=120) }],   // things a player might try here
  quests: [<=12 of { id (<=40), text (<=160), done: boolean }],
  clues:  [<=20 of { id (<=40), text (<=200) }],
  people: [<=40 of { id (<=40), name (<=60), line (<=160), img }],
  story:  [<=30 of text (<=240)]                     // "the story so far", oldest first
}
```

`state` takes `afterScene` (left out counts as 0, like `after`) and always answers `sceneN` (0 until a
scene is published); it includes `scene` (with its `n`) only when `sceneN > afterScene`. Players and the
DM both get it.

### 1.2 Feed: private items, offered heroes, unsend

- `send` gains `to` (a seat id; left out, `"all"` or `""` means everyone) and `hero` (<=60: the name of a
  ready-made hero being offered, which makes the item's `kind` `"hero"`; a hero alone is enough to
  send). Every feed item now carries `to` (`""` for everyone) and `hero` (`""` for none). A player's
  `state` carries only items for everyone or for that seat; the DM's carries all, each with its `to`.
  A `to` that is not a seat at the table is 409 `no_seat`, and nothing is stored. The answer is still
  `{ ok, n, players }`, with `players: 1` for a private item.
- `unsend` (DM only) `{ token, n }` → `{ removed: boolean }` removes a feed item (and its stored picture
  when nothing else uses it: no other item, no player's portrait, not the scene). `state` answers
  `pulled`: the last 30 unsent numbers, so phones drop them. A number that is not there is
  `{ removed: false }`, not an error.

### 1.3 Proposals (a player suggests, the DM answers)

- `propose` (player) `{ token, kind: "card" | "intent", card (<=40), text (<=200) }` → `{ n }`. A card
  needs its `card` and an intent its `text` (400 `empty`); any other `kind` counts as an intent. At most
  3 unanswered per seat (429 `slow`). The table keeps the last 30, letting go of answered ones first, so
  one still waiting is never lost: `{ n, id, name, kind, card, text, at, verdict: "", note: "" }`.
- `answer` (DM only) `{ token, n, verdict: "yes" | "roll" | "no", note (<=200) }` → `{ ok: true }`, once
  for each proposal: 400 `bad_verdict`, 409 `no_ask` (not on the table), 409 `answered`.
- `state` answers `asks`: for the DM, every unanswered one plus the last 10 answered; for a player, their
  own last 5. Always the whole list, oldest first.

### 1.4 Roll requests (the DM asks, phones roll)

- `request` (DM only) `{ token, to: "all" | [seat ids], label (<=60), why (<=160), skill (<=30),
  target (whole number 1..40, optional), yes (<=300), no (<=300) }` → `{ n }`. `"all"` (or `to` left
  out) is every seat at the table at that moment; ids that are not seats are dropped, and with nobody
  left to ask it is 409 `no_seat`. A label is needed (400 `empty`); a target outside 1..40 is 400
  `bad_target`. The table keeps the last 20, letting go of settled ones (closed, or everyone asked has
  rolled) first:
  `{ n, to: [ids], label, why, skill, target, yes, no, at, closed: false, results: { seatId: { total, nat, pass, at } } }`
  (`target` is `null` when there is none).
- A player's `state` answers `requests`: those addressed to that seat, each as
  `{ n, label, why, skill, at, closed }`, **never with `target`, `yes` or `no`** (nor `to` or `results`).
  Once that seat has rolled, its entry carries `mine: { total, nat, pass, say }`: `say` is the one line
  that goes with its own result, and `""` while `pass` is `null`.
- `roll` gains `request: n`. The result is recorded against the request, once for each seat that was
  asked. With a target, `pass = total >= target` (a natural 20 always passes, a natural 1 never does) and
  the answer is `{ n, pass, say }` (`n` is the roll's own number in the roll feed), `say` being the
  request's `yes` or `no`. Without a target the answer is `{ n, pass: null, say: "" }` until `judge`.
  A roll that cannot count is still put in the roll feed (the dice were rolled) and is answered 409
  with a sentence and the roll's `n`: `no_request` (no such request, or one not addressed to this seat:
  the same answer for both), `answered` (this seat has rolled for it already; the answer carries `mine`,
  what the first roll came to) or `request_closed`.
- `judge` (DM only) `{ token, n, id, pass: true | false }` → `{ ok: true }` sets one seat's result. It is
  needed when there is no target, and the DM may use it at any time to change a result: 400 `bad_pass`,
  409 `no_request`, 409 `no_roll` (that seat has not rolled).
- `cancel` (DM only) `{ token, n }` → `{ closed: boolean }` closes a request: nobody else can roll for
  it, and what was rolled stays. The DM's `state` carries every request in full.

### 1.5 Seats

- `leave` (player) `{ token }` → `{ ok: true }` frees the seat and deletes everything the table holds
  about that player (saved character, portrait unless the DM has shown it, their proposals, their place
  and results in roll requests, notes sent only to them, their dice in the roll feed). Their token is
  then as unknown as any other (404).
- `kick` gains `bar: true`: that name, in any letter case, cannot rejoin for an hour (`join` answers 403
  `removed`, which is not counted as guessing), and the answer carries `barred: true`. The table
  remembers the last 20 barred names. Without it, as today.
- When a seat goes, by `leave` or `kick`, its proposals, its place and results in roll requests and the
  notes sent only to it go too (the notes' numbers are added to `pulled`), and a request left with
  nobody to answer is removed. Nothing is left pointing at a seat that is not there.

### 1.6 Numbers

`POST /api/event` `{ name, ms, way, cartridge, n }` → 204 always, with an empty body, whatever is sent
and by whatever method. `name` is one of `first_roll`, `screen`, `roll_source`, `helper`, `join`,
`request_answered`; anything else is ignored. Each accepted event is one
`console.log(JSON.stringify({ ev: name, ... }))` line (Workers Logs are already on). No table, no
personal data, at most 30 a minute per address. A field that does not fit is left out of the line:
`ms` a whole number 0..86,400,000, `way` 1..40 letters, digits or `_ . : -` (a code word such as `qr`
or `card`, never free text), `cartridge` a cartridge id, `n` a whole number 0..9999. A body over 1000
bytes is ignored.

### 1.7 Tests

`test/unit/server.test.js` covers every rule above, including: a player never receives `target`, `yes`,
`no`, another seat's private item or another seat's proposals; unsend; the 3-proposal cap; pass rules;
leave; bar; tables saved before these fields existed; phones that send none of the new fields.

---

## 2. Cartridge spec v2

Built. Everything is optional: a cartridge that adds none of it still validates and plays exactly as
it did. The field-by-field reference, with an example of each, is the README ("The pack, field by
field" and "The adventure"); this section is the contract the screens code against. Limits are the
table's own (section 1.1), so a scene built from a cartridge always arrives whole; `npm run validate`
enforces them.

### 2.1 `cartridge.js` (still `schema: 1`)

| Field | Holds | Default (base cartridge) | Read at runtime as |
| --- | --- | --- | --- |
| `meta.label` | `{ length, players, tone, dm }`: a few words each, <=40; `rating`: `"everyone" \| "teen" \| "mature"`; `flags`: <=6 strings of <=30 | `{ length: "One sitting", players: "Up to 8 players", tone: "Adventure", dm: "First-time DMs welcome", rating: "everyone", flags: [] }`, laid under the cartridge's own key by key | `FR.theme.label` (always whole), and `label` on each entry of `FR.MANIFEST.packs` for cartridges not loaded yet |
| `meta.credits` | `[{ type: "music" \| "art" \| "writing" \| "rules", text }]` | One `rules` credit (the SRD 5.2 attribution), which every cartridge inherits | `FR.theme.credits` (the rules credit first, then the cartridge's own), and `credits` in the manifest. `FR.theme.music.credit` is still the music line alone |
| `cast.classes[Name].strengths` | Exactly three plain sentences, each <=80 (it fits a seat's `line`) | One sentence for each of the class's first three `skills`, from `cast.skillStrengths` | `FR.theme.classes[Name].strengths`: always a list (three, unless a class has fewer than three skills) |
| `cast.skillStrengths` | `{ Skill: sentence <=80 }`, merged key by key | All eighteen skills | Only through `strengths` |
| `intent` | `{ words: { "word or short phrase": "Skill" \| null }, why: "… {why} …" }` | About 220 everyday words, and `"That comes down to {why}."` | `FR.checkFor(text[, theme])` → `{ skill, word, why }` or `null`. Pure: no page, no network |
| `text` health words | `healthFine`, `healthHurt`, `healthTrouble` | `"Fine"`, `"Hurt"`, `"In trouble"` | `FR.theme.text.healthFine` and the rest. Thresholds are the screen's to choose |
| `text` DM wording | The DM-side strings now fixed in `src/dm.js` and `src/index.html` | Not built: a stretch goal, left to whoever builds the DM screens (add the keys to `src/base.js` as they are used) | |

`FR.checkFor` matches whole words against `intent.words` after taking endings off ("climbing" → climb,
"grabbed" → grab), scores a phrase above a single word, and between equal skills takes the one said
first. `why` is `intent.why` with the cartridge's own why-words for that skill (`text.whyAthletics`
and the rest), so the reason is in the cartridge's voice.

Rules attribution: the engine's rules derive from the System Reference Document 5.2 (CC BY 4.0). The
credit is data in `src/base.js` (`meta.credits`, type `rules`), is listed in the README ("Credits"),
and is for the Settings sheet to show from `FR.theme.credits`. Its wording still needs a legal read.

### 2.2 `adventure.js` (`schema: 2`; a `schema: 1` file still loads and validates)

| Field | Holds | Limits | Used for |
| --- | --- | --- | --- |
| `brief` | `{ about, people: [person ids], endings: [text], tips: [text] }` | `about` <=800; `people`, `endings`, `tips` <=6 entries; an ending or tip <=300 | The ten-minute DM brief |
| `summary` on chapters, scenes, interludes and hubs | One or two player-safe lines | <=400 | "What's happening?", late join |
| `tries[].check` | `{ skill, target }` beside the free-text `roll`, or `false` for "nothing to roll" | `skill` one of `FR.SKILLS`; `target` a whole number 1..40 | Roll requests with a hidden target |
| `tries[].hint` | The action card's small line | <=120 | Action cards |
| `tries[].card` | `false` hides the try from players (left out: shown) | <=8 shown in a scene; `try` (the card's label) <=60 | Action cards |
| `quests` | `[{ id, text, from: when, done: when }]` | <=12; `id` <=40, `text` <=160 | Quest board |
| `clues` | `[{ id, text, when }]` | <=20; `id` <=40, `text` <=200 | Clues |
| `bible.people[].public` | `{ line, when }`: what players may know, and from when | `line` <=160; the person's `name` <=60 and `id` <=40; <=40 people with one | Who's who |
| `handouts` | `[{ id, title, text, img, at }]` | <=24; `title` <=80, `text` <=1200 (what `send` takes); needs `text`, `img` or both | Notes and letters the DM can give one player or all |

- `when`, `from` and `done` are the condition language the runner already has (`{ flag }`, `{ seen }`,
  `{ picked }`, `{ all: [] }`...), left out to mean "always"; they are checked like every other
  condition. A quest is on the board once `from` holds and done once `done` holds. A person with no
  `public` is never shown to players.
- A handout's `at` is the id of a chapter, an interlude or a hub, or one scene of a chapter written
  `"chapter/scene"` (scene ids only have to differ inside their own chapter, so a bare scene id would
  not say which); left out, the handout is always to hand.
- A try with no `check` is still a card; the DM asks for its roll by hand. `check: false` is the
  author saying there is nothing to roll.
- The "story so far" is built from the `log` lines outcomes (and hub options) already carry: <=240.
- Pictures (`img`) are the cartridge's own (`"img/x.webp"`) or the engine's (`"base:img/x.webp"`);
  `FR.adventure` turns both into addresses the page can load, which are also ones `send` and `scene`
  accept as shipped pictures. Everything else reaches `FR.ADVENTURES[id]` exactly as written.

Changed from the first draft of this page: `check` may be `false`; `summary` is also allowed on
interludes and hubs; a handout's `at` names a scene as `"chapter/scene"` and may be left out; the
`intent` block, `cast.skillStrengths` and `FR.checkFor` are named; the label and credits are in the
manifest.

### 2.3 Tooling

- `npm run new-cartridge <id>` writes every new cartridge field with a comment; with `--adventure` it
  also writes a starter adventure (three scenes, one choice, two endings) that uses every new
  adventure field, validates at once and runs from the DM's door.
- `npm run validate` checks all of the above: types and lengths, ids that exist, conditions, a
  `check.skill` the rules know, a target in 1..40, pictures that exist, and that a `schema: 1` file
  does not use format 2 parts. Messages name the cartridge's file and the place, with what to do. It
  warns, without failing, when a scene has tries but no `check` on any of them, and when a try's
  label, a `log` or a try's `yes`/`no` is longer than a phone shows (60, 240, 300).
- The README documents every field with an example. North Pole uses all of them; Tavern Night has a
  label and strengths (it has no adventure).

---

## 3. The table client (`src/table.js`)

Added to `FR.table` (everything there today stays):

```
scene()                     the latest scene state, or null
publish(scene)              DM: send the scene state
send({ title, text, image, to, hero })      to and hero are new
unsend(n)
propose({ kind, card, text })     asks()     answer(n, verdict, note)
request({ to, label, why, skill, target, yes, no })     requests()     judge(n, id, pass)     cancel(n)
roll(entry)                 entry.request = n ties the roll to a request; resolves { n, pass, say }
leaveSeat()                 leave and free the seat
```

Changes to any of these notify the existing change listeners. `FR.app.event(name, data)` posts a number.

Built, with these additions (all in `src/table.js` unless said):

- Every call resolves with the server's answer or rejects with an `Error` carrying `{ status, reason, message }`.
  A change this device makes itself (a proposal, an answer, a judged or called-off roll, its own roll for a
  request) is on its own lists at once; the next poll confirms it. `scene()` is the table's tidy copy, so
  after `publish` it changes when the next poll lands (asked for at once).
- `roll(entry)` with `entry.request` rejects with reason `no_request` or `request_closed` (the dice are still
  in the roll feed); a second roll for the same request resolves with the first one's `{ n, pass, say }`.
  Without `request` it behaves as before (resolves `null` when it could not be sent).
- `kick(id, true)` sends `bar: true`. `link('qr')` is the table link marked `&w=qr`, for the QR code, so a
  join by QR is counted as one (`join` event: `qr`, `link` or `code`, with `.back` for a seat taken up again).
- `id()` is this device's seat id. For the player's screens: `unread()`, `asksNow()` (proposals made in the
  scene the story is in now), `tale(tab, where)` (open the story screen), `leaveAsk()` (confirm, then
  `leaveSeat()`), `nudge()` (tell the change listeners to draw again).
- `FR.app.event(name, { ms, way, n })` adds the cartridge id itself. `FR.app.need('qr')` resolves when the QR
  code maker (`window.qrcode`) is loaded: it is no longer in the page, and is fetched when the DM's door or
  the DM screens open (`src/registry.js`, `FR.lib`); the table's change listeners are told when it arrives.
- A seat's public `line` (`char.line`) is now the first of the class's `strengths`.

---

## 4. What players get (`src/app.js`, `src/table.js`, player markup, `src/css/play.css`)

1. **Story feed** in place of the inbox: scene pictures, DM messages, private notes (marked "only you"),
   your own key rolls, in order; unsent items disappear. **"What's happening?"** shows the scene summary
   and **"Story so far"** the story lines; a late joiner lands here.
2. **Action cards** from the current scene on the play screen, above the standing action list. Tapping
   one proposes it to the DM; the card shows "asked", then the DM's answer.
3. **Intent box**: "Or say what you do". The engine suggests a check from plain keywords (data in the
   base cartridge) and sends the proposal.
4. **Roll requests**: the phone buzzes, a card says what is being rolled and why, one big button rolls
   it, and the result reads as story (the request's words) rather than numbers.
5. **Type in a real roll**: "I rolled real dice" beside Roll.
6. **Health as words** (fine / hurt / in trouble) unless rules details are on.
7. **Quest board, clues and who's who** from the scene state.
8. **Lobby**: who is at the table, each with a portrait and one plain strength; "Leave the table" frees
   the seat; accepting a hero the DM offers takes two taps.
9. **Small things**: screen stays awake at a table; the Back button moves inside the app; table art and
   the QR maker load only when needed; a way to delete your character from the table; numbers posted for
   time to first roll, how you came in, and whether a roll started from a card, a request or the list.

## 5. What the DM gets (`src/dm.js`, DM markup, `src/css/dm.css`)

1. **Scene state published** on every move through the story, built from the adventure (summary, cards
   from `tries`, quests, clues, people, story lines, the scene picture).
2. **Proposals** arrive in the side pane; one tap answers yes, no, or "roll for it" (which opens a roll
   request prefilled from the matching try).
3. **Roll requests** from any try with one tap, or made by hand, to one player or everyone; results
   arrive live; without a target the DM taps pass or fail.
4. **Sending**: a preview of exactly what a phone will show, to everyone or one player; unsend; offer a
   ready-made hero to a latecomer; handouts from the adventure as buttons.
5. **The brief** on the cover, and the cartridge's label.
6. **"They did what?"** as a first-class button, using the built-in suggestions (AI stays optional).
7. Remove a player with or without keeping them out.

Built. What the screens on the other side can rely on (`FR.run` at the top of `src/dm.js` is the one
place that decides it, and `test/unit/dm.test.js` plays whole adventures through it):

- **`scene.id`** names where the story stands: `chapter/scene` for a scene of a chapter (the way a
  handout's `at` writes it), the id of an interlude or a hub, `/cover` before the story begins and
  `/end` once it is over. It changes whenever the place does, and only then.
- **On the cover** a scene carries the adventure's title and cover picture and nothing else (nothing
  has been read out yet). **At a hub** it carries the hub's title and summary and no cards. **At the
  end** the title is "The end", the chapter is the adventure's title, and the quests, clues, people
  and story stay as they finished.
- **A card's id** is `t<i>@<scene.id>`: the try's place in its scene (counting tries kept off the
  phones) and the scene it belongs to. Phones send it back untouched in `propose`; the DM's screen
  matches it to its own try even after the story has moved on.
- **Format 1 adventures** were never written with phones in mind, so they publish where the story is
  (id, chapter, title, picture) and nothing else: no cards and no story lines. To publish their
  tries and `log` lines as well, change the two `schema` tests in `FR.run.cards` and `FR.run.scene`.
- **A hero offer** is sent as `{ to, hero, title, text }`: `text` is the DM's own optional words, and
  `title` is only there for a phone still running yesterday's page.

## 6. Done means

`npm run check` passes; the checkpoint script in PLAN.md (Checkpoint 1) works end to end on a laptop
plus two phones; a cartridge with none of the new fields still plays; [LEDGER.md](LEDGER.md) rows are
updated with how each item was checked.
