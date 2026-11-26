# Phase 2 contract: big screen and character ties

The working spec for Phase 2 of [PLAN.md](PLAN.md). Every builder codes against this page; if something
here turns out wrong, change this page in the same piece of work and say so in your report. Phase 1's
contract, [PHASE1.md](PHASE1.md), still holds: nothing here removes or renames anything in it.

**Goal.** The room gets a shared screen and the party gets ties to each other and to the story. A TV
shows the world; phones stay each player's private hand; the DM gets the tools to pace and steer.

**The rule for every feature** (from PLAN.md): it reads cartridge data, has a default in the base
cartridge, is scaffolded by `npm run new-cartridge`, is checked by `npm run validate`, is used by the
North Pole cartridge, and is documented in the README's cartridge spec. Nothing about one story lives
in `src/` or `server/`. AI stays optional: everything works without it.

Three waves: **A** server and cartridge data; **B** player and DM/TV screens; **C** rules profiles.

---

## 1. Server (`server/core.js`, `worker.js`)

All calls are POST JSON to `/api/table/<route>?c=CODE`; errors are `{ error, reason? }`. Everything that
exists keeps working, including phones running the previous page.

Built, and true of every new route: the token is checked before anything else, so an unknown code or
token gets the same bare 404 as everywhere; a seat that was taken over or removed hears 409 `moved` or
`removed`, and an ended table 410 `closed`. A DM-only route answers a player 403 `dm_only`; the two
player-only routes (`ballot`, `spend`) answer the DM 403 `player_only`; every route but `state` answers a
big screen 403 `screen_only`. A phone on the previous page sends none of the new fields and is answered
as before, and a table saved before these parts existed loads. `worker.js` did not need to change.

`state` now always answers, besides what it did: `stageN`, `floor`, `time` (the server's clock), `votes`,
`reacts`, and for a player or the DM `reacted`; for the DM alone `sessionAt` and `screen`.

### 1.1 The stage (what the whole table is shown)

One small object the DM controls and every device receives. `stage` (DM only) `{ token, patch }` merges
the listed keys into it (a key set to `null` clears it) and answers `{ n }`. `state` takes `afterStage`,
always answers `stageN`, and includes `stage` only when `stageN > afterStage`.

```
stage = {
  reveal: { id (<=40), title (<=80), img, shown: boolean } | null,   // a picture held face down on every phone, then flipped together
  map:    { id (<=40), title (<=80), img, regions: [<=24 of { id (<=40), name (<=40), x, y, w, h }], open: [region ids] } | null,
                                                                     // x, y, w, h are percentages 0..100 of the picture
  sound:  { bed (<=40), level: 0..1 } | null,                        // the ambience to play; what a bed id means is the cartridge's business
  beat:   { n, kind (<=20), at } | null,                             // a one-off moment (a thunderclap, a hit): the server numbers and times it
  spot:   seat id | "",                                              // whose moment it is (the acting hero)
  order:  [<=16 of { id (<=40), name (<=60), kind: "hero" | "foe", state (<=20), img }],   // the turn order, for the big screen
  now:    order entry id | ""                                        // whose turn it is
}
```

Pictures are shipped paths or this table's kept pictures, as for a scene. More than 16 KB is refused.

Built, with these details:

- Each key named in `patch` replaces the table's copy of that part whole: to open one more region, send
  the map again with a longer `open`. Parts not named are untouched; keys that are not parts are
  dropped; `null` sets `spot` and `now` to `""` and `order` to `[]`. A patch that changes nothing keeps
  the number. `stage` always has all seven keys; `stageN` is 0 until the stage is first set.
- Refused: `patch` that is not an object (400 `bad_stage`); more than 16 KB of JSON, measured on the
  patch as it was sent (413 `too_large`). Everything else is tidied, not refused: text is cut to
  length; a `reveal` or `map` with neither a title nor a picture becomes `null`; an `img` that is
  neither kind of picture becomes `""` (an upload goes through `keep` first); `shown` is true only when
  sent as `true`; a region needs an `id` (the first of each id is kept); `x y w h` are held to 0..100
  and two decimal places (0 when not a number); `open` keeps only this map's own region ids, each once,
  in the map's order; `sound` needs a `bed`, and `level` is 1 when left out; a `spot` that is not a
  seat becomes `""`; an `order` entry needs an `id` and a `name` (the first of each id is kept), and
  its `kind` is `"hero"` unless it is `"foe"`; a `now` that is not in the order becomes `""`, also when
  a new order no longer holds it.
- A beat is sent as `beat: { kind }`. The table keeps `{ n, kind, at }`: `n` counts up for the life of
  the table (never reused, not even after `reset`) and `at` is the server's clock. Every patch that
  carries a beat is a new stage number, even the same beat again. A patch without `beat` leaves the
  last one as it is, with its `n` and `at`, so a phone plays a beat only when its `n` is new to it and
  `time - at` (both from the same answer, both the server's clock) is a few seconds at most.
  `beat: null`, or a beat with no `kind`, clears it.
- A stored picture the stage shows is kept while it shows it (as for the scene). When a seat leaves or
  is removed, `spot`, its entry in `order` and `now` let go of it, and the stage gets a new number.
- Not hidden from players: the stage is one object for every device, so a reveal's picture and title
  travel while `shown` is still false, and so do the names of regions not yet open.

### 1.2 The big screen

- `screen` (DM only) `{ token }` → `{ key }`: makes (or returns) this table's screen key. `screen` with
  `{ token, off: true }` throws it away.
- A device holding the key calls `state` with `{ token: key }` and is treated as a **screen**: it gets
  `players` (public parts only), `scene`, `stage`, `rolls`, `requests` reduced to
  `{ n, label, to, results: { seatId: { total, nat, pass } } }`, `votes`, and feed items addressed to
  everyone. It never gets private items, proposals, targets, `yes`/`no` lines or saved characters, and
  every other route refuses it (403 `screen_only`). A wrong key is the same 404 as any unknown token.

Built, with these details:

- The key is 48 hex characters (192 random bits), compared a character at a time without stopping
  early. `{ token, new: true }` makes a fresh key and the old one stops working at once;
  `{ token, off: true }` answers `{ key: "" }`. The key travels only in the answer to `screen`: the
  DM's `state` says `screen: true | false` (is there a key) and no `state` ever carries the key.
- A screen's whole `state`: `code`, `you: "screen"`, `players`, `feed` (items for everyone only),
  `last`, `scenario`, `rolls`, `lastRoll`, `sceneN`, `scene` and `stageN`, `stage` (by `afterScene`
  and `afterStage`, like a phone), `pulled`, `floor`, `time`, `requests`, `votes` (with `counts`, and
  `mine: null`), `reacts` (never for a private item). A request there is
  `{ n, label, to, at, closed, results: { seatId: { total, nat, pass } } }`: `at` and `closed` were
  added so a screen can tell a called-off request from one still waiting. No `asks`, no `reacted`,
  no hooks, no `sessionAt`.
- A wrong key is counted against the guess limiter like any wrong token; so is a key that was
  replaced or thrown away, so a screen page must stop asking on a 404. The right key is never counted,
  whatever it asks for. Pictures are fetched as any device fetches them (`GET /api/table/img`).
- When the table ends the key is deleted with everything else; for the hour that phones are told
  410 `closed`, a screen still holding the last key is told the same.

### 1.3 Votes

- `vote` (DM only) `{ token, q (<=120), options: [2..4 of text (<=40)] }` → `{ n }` opens one (closing any
  other); `vote` with `{ token, n, close: true }` closes it.
- `ballot` (player) `{ token, n, pick: option index }`: one per seat per vote; a second replaces the first
  while the vote is open.
- `state` answers `votes`: the open one, or the last closed one for ten minutes:
  `{ n, q, options, open, counts: [..], mine: index | null }`. Players see `counts` only once it is closed;
  the DM and a screen see them live.

Built, with these details:

- `votes` is a list of none or one. While a vote is open a player's copy has no `counts` key at all.
  `mine` is the seat's own pick (`null` for the DM, a screen, and a seat that has not voted). Who
  picked what never leaves the table, for anyone.
- Opening: 400 `empty` with no `q`; 400 `bad_options` unless two to four options are left once blank
  ones are dropped. The table holds one vote: opening another lets go of the one before, open or
  closed. An open vote stays until it is closed.
- Closing answers `{ closed: boolean }`: `false` when `n` is not the vote on the table, `true` again
  when it was closed already. The ten minutes run from the first close.
- `ballot` answers `{ ok: true, mine }`: 409 `no_vote` (`n` is not the vote on the table), 409
  `vote_closed`, 400 `bad_pick` (not a whole number from 0 to the last option).
- A seat that leaves or is removed takes its ballot with it.

### 1.4 Tokens, reactions, bonds, hooks

- `award` (DM only) `{ token, id, give: 1 | -1 }`: a seat holds 0 to 5 hero tokens; each player's public
  entry gains `tokens`. `spend` (player) `{ token }` uses one (409 `none` with none) and adds a line to
  the roll feed (`kind: "token"`).
- `react` (player or DM) `{ token, on: "feed:<n>" | "scene:<n>" | "roll:<n>", mark }`, `mark` one of
  `cheer`, `laugh`, `gasp`, `heart`, `clap`, `wow`: one mark per seat per thing (sending the same again
  removes it). `state` answers `reacts`: `{ "<on>": { mark: count }, ... }` for the last 60 things.
- `me` gains `bond: { to: seat id, prompt (<=160), text (<=200) }` and `hook: { id (<=40), text (<=240) }`.
  A bond is public (in each player's entry, shown to everyone at the table and to a screen). A hook
  is the player's and the DM's only.

Built, with these details:

- **A player's public entry** is `{ id, name, char, portrait }` as before, plus `tokens` only when the
  seat holds at least one, `bond` only when it has one, and `hook` only in the copy sent to that
  player and to the DM. So a seat with none of them looks exactly as it did (read `tokens` as
  `p.tokens || 0`). `kick`'s answer lists players as the DM sees them.
- `award` answers `{ id, tokens }`: 400 `bad_give`, 409 `no_seat`, 409 `full` (a sixth), 409 `none`
  (taking one from a seat with none).
- `spend` answers `{ n, tokens }` (`n` is the line's number in the roll feed, `tokens` what is left).
  The line is `{ n, id, name, role: "player", label, kind: "token", total: 0, nat: 0, detail: "",
  dice: [], at }`; an optional `label` (<=60) says what it was spent on. It does not count as a roll
  for the one-roll-a-second rule, so the second try can follow at once.
- `spend` with `request: n` also takes back that seat's roll for that request, so its next `roll`
  with `request: n` is the one that counts: 409 `no_roll` (that seat has no roll recorded for it) and
  409 `request_closed`, both before a token is used.
- `react` answers `{ on, mark }` (`mark` is `""` when the mark was taken off; another mark replaces
  the first): 400 `bad_thing`, 400 `bad_mark`, 409 `no_thing`. A feed item must be one the caller can
  see (a note for one seat can be reacted to by that seat and the DM, and to anyone else it is 409
  `no_thing`, the same as an item that is not there); a roll must be in the roll feed; a scene is any
  published since the last fresh start. `reacts` for a private item goes only to its seat and the DM.
  `state` also answers `reacted`: `{ "<on>": mark }`, the caller's own marks. Reactions go when their
  feed item is unsent, and a leaving seat's marks go with it.
- `me`: for `bond` and `hook`, an object sets it, `null` takes it away, and leaving it out leaves it
  as it is. A bond needs a `to` that is another seat at the table and a `prompt` or a `text` (400
  `bad_bond`, 409 `no_seat`); a hook needs an `id` or a `text` (400 `bad_hook`). A refused `me`
  changes nothing. The answer is still `{ ok, portrait, name }`. When a seat goes, a bond another
  seat had with it is taken away.

### 1.5 The DM's session on the table

- `session` (DM only) `{ token, save (a string, <=60,000 characters), at }` stores the DM's story session
  on the table. `state` for the DM answers `sessionAt`; `session` with `{ token, get: true }` answers
  `{ save, at }`. This is what lets a second DM device, or the same DM tomorrow, carry on from the same
  place.
- `reset` (DM only) `{ token }` starts the table's run afresh: the feed, rolls, proposals, requests,
  votes, reactions, scene and stage are cleared, seats and heroes stay. `state` answers `floor`: phones
  drop every feed item and roll numbered at or below it.

Built, with these details:

- `session` answers `{ ok: true, at }`. `save` is kept and handed back exactly as it came and is never
  read; it is stored beside the table, not in it. `at` is the page's own time for the save (a whole
  number above 0); left out or anything else, the server's clock is used. An empty `save` clears it
  (`at` 0). 400 `bad_session` (not a string), 413 `too_large`. With nothing saved, `get` answers
  `{ save: "", at: 0 }` and `sessionAt` is 0. The last save wins: two DM devices are not merged.
- `reset` answers `{ ok: true, floor }`. The three counters phones keep (`last`, `lastRoll`, `sceneN`)
  all jump to the same new number, which is `floor`, so nothing is ever numbered twice and one number
  serves: a phone drops every feed item, roll **and scene** numbered at or below `floor` (0 at a table
  never reset). After a reset `state` answers `scene: null` to a phone whose `afterScene` is behind,
  until the DM publishes again; the stage is emptied under a new `stageN`. Proposal, request, vote and
  beat numbers carry on counting.
- `reset` leaves alone: seats, heroes, saved characters, portraits, bonds, hooks, tokens, the screen
  key, and the DM's `session` save (the DM's page replaces that itself). A stored picture that only the
  cleared feed showed is deleted; one that a portrait, the scene or the stage also showed is not.
- A phone on the previous page does not know `floor`, and keeps what it holds until it is reloaded.

### 1.6 Tests

`test/unit/server.test.js` covers every rule above, especially what a screen and a player may never
receive, old-data loading, and the size bounds.

---

## 2. Cartridge spec v3

Built. Everything is optional: a cartridge that adds none of it validates and plays exactly as it does
today (a unit test strips every field and plays it). The field-by-field reference, with an example of
each, is the README ("The pack, field by field" and "The adventure"); this section is the contract the
screens code against. Sizes are the table's own (section 1), so whatever is built from this data
arrives whole; `npm run validate` enforces them.

### 2.1 `cartridge.js` (still `schema: 1`)

| Field | Holds | Limits | Default (base cartridge) | Read at runtime as |
| --- | --- | --- | --- | --- |
| `cast.roles` | `{ RoleName: { blurb, does, trait? } }`: plain jobs a hero can do. `trait` is `might`, `guile`, `lore`, `faith`, `charm` or `wild` | 2 to 8 roles (five or six reads best); name <=24, `blurb` <=80, `does` <=160 | Six: Protector, Trickster, Thinker, Healer, Talker, Scout, one for each trait. A cartridge that writes `roles` replaces all six | `FR.theme.roles`, in the order written |
| `cast.classes[Name].role` | One of the role names | Must exist | The role whose `trait` is the class's strongest | `FR.theme.classes[Name].role`: always set when a role fits (the class's own, else by trait); left off only when no role names a trait |
| `cast.classes[Name].kit` | `[item ids]` a hero starts with | <=4, each in `kit.items`, none twice | `[]` | `FR.theme.classes[Name].kit`: always a list |
| `ties.bonds` | `[text with {name}]`: questions about another player's hero | <=20; each <=120 and containing `{name}` (so with a 40-character name it fits a bond's `prompt` of 160); no other `{blank}` | Six that suit any story | `FR.theme.ties.bonds`. Fill with `bond.split('{name}').join(heroName)` |
| `ties.hooks` | `[{ id, text, roles?: [role names] }]`: a personal stake | <=20; `id` a lower-case word <=40, unique; `text` <=240; `roles` must exist | Five (three kept for pairs of the base's roles) | `FR.theme.ties.hooks`: each `{ id, text, roles }`, `roles` always a list (`[]` is "anyone") |
| `ties.voices` | `[{ label, tip }]` | <=12; `label` <=24, `tip` <=120 | Six | `FR.theme.ties.voices` |
| `kit.items` | `{ id: { name, text, img?, uses } }`, `uses` `"once"` or `"always"` | <=40; `id` a lower-case word <=40 (it fits `propose`'s `card`); `name` <=40, `text` <=160; `img` a cartridge picture that exists | None | `FR.theme.kit.items[id]`: `{ name, text, img, uses }`, `img` an address the page can load or `""` |
| `kit.token` | `{ name, plural, text }` | `name`, `plural` <=24; `text` <=160 | `Hero token`, `Hero tokens`, and a line saying what it is for; merged key by key | `FR.theme.kit.token`: always whole |
| `sound.beds` | `{ id: { label, synth } \| { label, file } \| null }`. `synth` is one of `FR.AMBIENCE`; `file` is `"audio/x.mp3"`; `null` takes an inherited one away | <=24; `id` a lower-case word <=40 (a stage's `sound.bed`); `label` <=40; exactly one of `synth` and `file`; the file must exist | Seven: `wind`, `fire`, `storm`, `crowd`, `cave`, `night`, `sea`, each the voice of the same name. A cartridge's beds are laid over these by id; one it writes again is taken whole | `FR.theme.beds`: `{ id: { label, synth } }` or `{ id: { label, file } }`, the file an address the page can load. `FR.Ambience.play(FR.theme.beds[id])` or `play(id)` |
| `rules` | `"open-5e"` or `"light"` | One of `FR.RULES` | `"open-5e"` | `FR.theme.rules`; the screens ask `FR.profile(theme)` (section 6) |
| `light` | `{ fight: [{ id, label, hint, skill }], text: { line: words } }`: what only the light rules read (section 6) | `fight` 1 to 8; `label` <=40, `hint` <=80; `skill` a skill or a list of skills; `text` only the eight lines the light rules say | Six ways to fight and the eight lines; `fight` is replaced whole, `text` merges key by key | `FR.theme.light`: `{ fight: [{ id, label, hint, skills: [...] }], text }` |

The engine's three lists are `FR.AMBIENCE`, `FR.BEATS` (`thunder`, `hit`, `reveal`, `bell`, `crash`,
`hush`) and `FR.RULES`, in `src/registry.js`.

### 2.2 `adventure.js` (`schema: 3`; `schema: 1` and `2` files still load and validate)

A "scene" is a scene of a chapter or an interlude. A hub is a place the story stands too, so it may
have `map`, `sound` and `vote`.

| Field | Holds | Limits | Used for |
| --- | --- | --- | --- |
| `maps` | `[{ id, title, img, regions: [{ id, name, x, y, w, h, when? }] }]`. `x`, `y`, `w`, `h` are percentages of the picture | <=8 maps; `title` <=80; 1 to 24 regions; region `name` <=40; `w`, `h` above 0; the rectangle inside 0..100; `when` a real condition | Map reveal |
| scene or hub `map` | `{ id, open?: [region ids] }`: the map to put up on arriving and the regions to uncover | The map and the regions must exist. `open` left out (or empty) shows the map as it stands | The same, one tap |
| chapter `sound`, scene or hub `sound` | A bed id | One of the cartridge's beds (its own or the base's seven it has not taken away) | Soundscapes |
| scene `beats` | `[{ id, label, kind }]` | <=6; `label` <=40 (the DM's button); `kind` one of `FR.BEATS` | Haptic beats |
| scene `reveal` | `{ id, title, img }` | `title` <=80, written to give nothing away before the flip; the picture must exist | Tap to reveal |
| scene `easier`, `harder` | A line each, for the DM | <=240 | Difficulty dial |
| chapter and interlude `minutes` | About how long it runs | A whole number 1..600. A warning when some have it and others do not | Pacing clock |
| `foes` | `[{ id, name, img?, hits, moves: [text] }]` | <=12; `name` <=40; `hits` a whole number 1..6; 1 to 4 `moves`, each <=120 | Enemy health as states, suggested moves |
| scene `foes` | `[foe ids]`; the same id may appear more than once (three of a kind) | <=8, each in `foes` | The same |
| scene or hub `vote` | `{ q, options }` | `q` <=120; 2 to 4 different options, each <=40 (what `vote` takes) | Party vote |

How the map's two mechanisms fit together: a region is uncovered when a scene's `map.open` names it
(the DM taps the suggestion on arriving), and a region with a `when` also counts as uncovered whenever
that condition holds. So the regions to show at any moment are: every region whose `when` holds, plus
the `map.open` of every place the story has reached, plus whatever the DM uncovered by hand. The
first keeps a map right when it is put up late or on a screen that joined late.

With these sizes the largest stage one place can ask for (all 24 regions open, a reveal, a
soundscape, a beat and a full turn order of 16) is about 9 KB, or 13 KB if every letter in it is an
accented one: under the table's 16 KB either way, and a unit test builds it. North Pole's largest,
with eight heroes in the turn order, is 3 KB.

### 2.3 Tooling and content

- `npm run new-cartridge <id>` writes every cartridge field above with a comment (six roles, a role
  and a kit for each class, bonds, hooks, voices, eight items, a token, a soundscape, `rules`); with
  `--adventure` the starter adventure is `schema: 3` and uses every adventure field (a hand-drawn map,
  `img/map.svg`, with three regions; a soundscape on the chapter and one on a scene; beats; a reveal;
  a foe; a vote; easier and harder lines; minutes). It validates at once.
- `npm run validate` checks all of the above: types, lengths and counts; ids that exist (a class's
  `role` and `kit`, a hook's `roles`, a scene's map and regions, its foes, its `sound`, a beat's
  `kind`); rectangles inside the picture and not empty; pictures and audio files that exist; bonds
  that contain `{name}`. It warns when a cartridge writes its own roles and leaves a class without
  one. It also holds the engine to its half: the base must keep a role for each trait, a bed and a
  voice for each of `FR.AMBIENCE`, a whole token and a rules profile it knows.
- The README documents every field with an example.
- **North Pole** uses all of it: six roles with two callings each; eight bonds, eight hooks (three kept
  for certain roles), six voices; twelve items and a kit of two for each calling; a "Gold star" token;
  ten beds (four of the engine's, renamed; three taken away; six of its own music files). Its adventure
  has one map (`img/map_pole.svg`, hand-drawn, nine regions that tile the picture), a bed for every
  chapter, interlude and the hub and for the scenes whose mood differs, beats on 18 of its 20 scenes,
  eight reveals (pictures it already owned), five foes, one vote, the dial on ten scenes, and minutes
  that add up to the label's two and a half hours.
- **Tavern Night** (no adventure) has six roles and a role and kit for each class, eight bonds, eight
  hooks, six voices, twelve items, a "Lucky coin" token and all seven beds in its own words.

### 2.4 Ambience (`src/audio.js`)

`FR.Ambience = { play(bed), stop(), level(0..1), playing(), voices, build(ctx, out, name, rev) }`.
`play` takes `{ synth }`, `{ file }` or the id of one of `FR.theme.beds`; anything else stops. A
synth bed is one of seven voices made on the spot from filtered noise and slow movement, through the
dice's own audio set-up (`FR.Dice.Sound`: its context, `out` and `rev`); a file bed is an `<audio>`
element on a loop at a fifth of full volume. Both fade in over 1.2 seconds and out over 1, play one at
a time, follow the sound effects switch (`FR.Dice.Sound.muted`) as it is flipped, fall silent while
the page is hidden and pick up when it is back. Asking for the bed that is already playing changes
nothing, so a screen may call `play` on every poll. `level` is the stage's `sound.level`.

### 2.5 Changed from the first draft of this section

- `cast.roles[Name].trait` is new: it is what lets a class with no `role` (and so any cartridge that
  writes none of this) still have one, from the base's six.
- `sound.beds` merges by id with the base's seven, each bed taken whole; `null` takes one away.
- A region's `when` is defined (above); a hub may carry `map`, `sound` and `vote`; an interlude has
  `minutes` like a chapter; a scene may list the same foe more than once.
- A format 3 part in a `schema: 1` or `2` file is read and checked, and draws one warning rather than
  an error (format 2 parts in a `schema: 1` file are still refused, as before).
- Tavern Night also has hooks and beds. North Pole has five foes, not one: whatever the party can
  face down is offered, and the DM uses what the table needs.
- The scaffold wrote `rules: 'open-5e'` until wave C; it now writes a light cartridge unless asked
  for `--rules open-5e` (section 6).

---

## 3. The table client (`src/table.js`)

Added to `FR.table`: `stage()`, `setStage(patch)`, `screenKey()` / `screenOff()`, `votes()`,
`vote({ q, options })`, `closeVote(n)`, `ballot(n, pick)`, `award(id, give)`, `spend()`, `react(on, mark)`,
`reacts()`, `saveSession(save)`, `loadSession()`, `reset()`, and `me` carrying `bond` and `hook`. A page
opened as `?tv=CODE&k=KEY` runs as a screen: it polls with the key and draws only the big-screen view.

**Built (in `src/table.js`), with these details:**

- `stage()` is the table's tidy copy (`{ reveal, map, sound, beat, spot, order, now }`) or `null`; `setStage(patch)` replaces each
  named part whole and resolves `{ n }`. `serverNow()` is this device's clock corrected to the server's: play a beat when its `n`
  is new to this device and `serverNow() - beat.at` is under a few seconds.
- `screenKey(fresh?)` resolves the key string; `screenLink(key)` is the address to put on a TV (`?tv=CODE&k=KEY&s=<cartridge>`);
  `screenOff()`; `hasScreen()` says whether the table has a key (DM only).
- `isScreen()`: this page was opened with `?tv=` and `&k=`. It polls with the key, holds no seat, never reads or writes what the
  browser remembers about a seat, and stops polling the moment the key or the table is gone (`onEnd` fires with `role: "screen"`).
  `isDM()` and `isPlayer()` are false on a screen. Nothing draws the big-screen view yet: that is the screen builder's job.
- `votes()` is a list of none or one `{ n, q, options, open, mine, counts? }`; `vote({ q, options })`, `closeVote(n)`,
  `ballot(n, pick)` (the choice shows on this device at once).
- `award(id, give)`, `spend({ label, request })`; a player's public entry carries `tokens` only when it is above zero.
- `react(on, mark)`, `reacts()` (`{ "<on>": { mark: count } }`), `reacted()` (this device's own marks).
- `saveSession(save, at)`, `loadSession()` (resolves `{ save, at }`), `sessionAt()`; `reset()`, `floor()`.
- `setBond(bond | null)`, `setHook(hook | null)`.
- After a reset the poll drops every feed item and roll at or below the floor, forgets the scene and the story trail.

## 4. What players get

1. **Party bonds**: after making a hero at a table, one prompt about another player's hero; shown in
   "Who's here". **A personal hook** picked from the cartridge's (or skipped). **"How you talk"**: a voice
   to try, shown on the sheet.
2. **Role cards**: classes grouped under five or six plain roles in the ready-made gallery, the quiz
   result and the lobby ("the party has no Protector yet").
3. **Items and abilities as cards** with a plain line and a "Use" button that tells the DM.
4. **Hero tokens**: shown on the play screen; spending one offers a reroll of the last roll.
5. **Party vote**: a card on every phone, one tap, the result when the DM closes it.
6. **Reactions** on scene pictures, DM notes and big rolls. **Notes** with "pin to notes" on anything in
   the story feed, kept on the phone.
7. **Table moments**: tap to reveal (face down, then everyone flips together), haptic beats, and the
   soundscape when this phone's sound is on (off by default for a seated player, as music is).
8. Carried over from Phase 1: armor in plain words; the dice libraries load only when the tray first
   opens; everything a first "Start a new session" should clear is cleared (`floor`).

**Built (in `src/app.js`, `src/table.js`, the player markup and `src/css/play.css`), with these details:**

- Added to `FR.table` for the player's screens: `onReset(fn)` (called when `floor` rises, after this device has
  dropped the old story), `pin({ from, title, text, img })`, `pinned(from)`, `notes()`, and `tale('map' | 'notes')`.
  `setBond` remembers which kind of hero made the bond, and `sync` takes the bond away when another kind of hero
  takes the seat; `sync` also tells the table the hero's hook (kept with the hero on the phone) and takes it away
  when the hero has none. `spend({ request })` opens this seat's own copy of the request again at once.
- Added to `FR.app`: `ties(steps?)` opens the bond, hook and voice steps; `tieSteps()` says which there are.
  `FR.lib('dice')` (src/registry.js) fetches three.js and cannon.js; the page no longer carries them.
- The voice is kept with the hero on the phone and in the seat's saved character; the table has no field
  for it, so the DM's screens cannot show it yet.
- A place in the story is published under a new number each time it changes, so marks on a scene are added
  up over the numbers that place went by on this phone (`FR.play.marks`); a tap goes to the newest.
- Notes are kept under `firstroll.notes.<CODE>`. A reset drops what was pinned from the old story and keeps
  what the player wrote. One-use items are un-marked on a reset.
- The soundscape plays for a seated player only, behind the Settings switch (`firstroll.bed`); the DM's
  screens and the big screen play their own.

## 5. What the DM gets, and the big screen

1. **The big screen**: "Put this on a TV" gives a link and QR for `?tv=CODE&k=KEY`. The screen shows the
   scene picture and title, the map as it is uncovered, the reveal, everyone's rolls with names (a
   natural 20 or 1 fills the screen), the acting hero, the turn order, an open vote and its counts, and
   plays the soundscape. It has no controls and shows nothing private.
2. **Stage controls** beside each scene: uncover the map (the scene's suggestion in one tap, or region by
   region), hold and flip a reveal, fire a beat, pick a soundscape, put a vote to the table (the scene's
   suggestion prefilled).
3. **Chapter map**: the adventure's chapters and branches drawn as a graph, where the party is, what the
   flags have opened and closed.
4. **Spotlight tracker**: who has rolled or proposed lately and who has gone quiet. **Pacing clock**:
   time spent against the chapters' minutes, and what can be cut (the adventure's shortcuts).
5. **Fights**: foes from the adventure join the turn order with health as states and their suggested
   moves; the **difficulty dial** shows the scene's easier and harder lines.
6. **Hero tokens**: award one from a player's row. Each player's bond, hook and voice in their glance.
7. **The session lives on the table**: the DM's place is saved to the table on every step and picked up
   by any DM device that joins (the Phase 1 "use this device's place?" question remains only for a true
   conflict). "Start a new session" resets the table's run.
8. Carried over from Phase 1: the composer's preview uses the phone's own card styles; a plain "Yes" on a
   card shows the DM the line that will be sent first.

## 6. Rules profiles (wave C)

`rules: "light"` is one d20 plus a bonus against a target, with no numbers a player must manage:
a hero is a role with strengths (a bonus where they are strong, a smaller one where they are fair,
none elsewhere), health is three states, a fight is the same roll against the foe's target and a hit
moves the foe one state. `rules: "open-5e"` is today's maths, unchanged. The profile is engine code
(`src/rules.js` gains a small profile interface); what a cartridge supplies for the light profile is
far less than today (roles and which skills each is strong and fair at; no ability vectors, hit dice
or attack tables), and the scaffold writes a light cartridge by default. Both existing cartridges stay
on `open-5e` in this phase; the scaffold's starter and one copy of Tavern Night prove the light one.

**Built, with these details.**

### 6.1 The profile interface (`src/rules.js`)

`FR.PROFILES = { 'open-5e': {...}, light: {...} }`; `FR.RULES` is its keys; `FR.profile(theme)` is the
profile a cartridge plays by (of the cartridge in play when none is named; `open-5e` for one that names
no rules, or rules nobody has heard of). Nothing outside `src/rules.js` assumes a set of rules: the
registry, the screens and the tools ask the profile.

| A profile answers | `open-5e` | `light` |
| --- | --- | --- |
| `jargon`: does "Show rules details" open the rule book | yes: dice names, skill names, levels, the full sheet | no: the switch only adds each bonus, as `+5` |
| `two`: may a roll use two dice, keeping the better or worse | yes | no: one die, always |
| `people`: how a hero's people is chosen | `'quiz'`: ranked from the answers | `'class'`: the one in the class's sample picture (`cast.samples`); the player may change it, and changing class brings that class's people along |
| `tabs` of the play screen | `do`, `checks`, `fight` | `do`, `fight` (there are no abilities to check) |
| `prepare(theme)`, when a cartridge is put together | nothing | each class gains `v` (its lean on the eight traits, for the quiz), `skills` (its strong ones, which is what the DM's "Good at" reads) and a `color` if it named none |
| `rank(u, theme, only)` → `{ classes, races }`; `raceFor(cls, races, theme)` | `FR.rank` for both; the top-ranked people | `FR.rank` for the classes; every people listed with `pct: null`; the class's sample |
| `build(u, cls, race, answered)`: the sheet (`FR.build` uses the profile in play) | as before: `scores`, `mods`, `hp`, `ac`, `skills`, `attacks`… | `{ cls, race, rules: 'light', skills: { Skill: { mod, prof, tier } }, states: ['fine','hurt','trouble'], perk, alignment, lucky: false }` |
| `bonus(sheet, key)` → `{ mod, good, known }` | a skill's or an ability's modifier; `good` is `'strong'` where trained | +5, +2 or +0; `good` is `'strong'`, `'fair'` or `''`; an ability is not known |
| `healthMax(sheet)`, `healthSteps` | hit points; may be stepped by hand with details on | 2 (kept as 2 fine, 1 hurt, 0 in trouble); never stepped |
| `armor(sheet)`, `lucky(sheet)`, `say(theme, key)` | `{ ac, note }`; the people's gift; `''` (the cartridge's own line stands) | `null`; `false`; the cartridge's `light.text` line for `detailsNote` (what the switch does) and `matchNote` (under the reveal's choices) |
| `rows(tab, sheet, o)` → `{ rows: [{ label, hint, mod, dot, mark, cls, ctx }], say }` | the "I want to…" rows and special rolls; the six ability checks; initiative, the class's attacks (each with damage dice), shove, hide | the "I want to…" rows and special rolls; who goes first (a plain roll) and the cartridge's ways to fight |
| `request(q, sheet, why)`: what the tray rolls when the DM asks | d20 + the skill's or ability's modifier | d20 + 5, 2 or 0 for the skill; a plain d20 otherwise |
| `sheet(sheet, o)` → `{ line, vitals, abilities, showAbilities, rows }` | plain words, or the full sheet with details on | health as a word, "Good at", "Fair at", the people's line; details add `+5` after each thing and nothing else |

`o` is what only the screens know: `{ theme, details, tx, why, init, health, align }`. A row's `ctx` is
what the tray rolls; it may carry `says: { done, nat20, nat1 }`, its own lines for those moments (the
light rules' fight rolls do, having no damage to offer). In `src/app.js` everything rule-book goes
through `jargon()` (the switch **and** a profile that has a rule book), so under the light rules the
switch changes nothing but the bonuses; `FR.play.outcome`, `FR.play.requestRoll` and `FR.play.tabs` ask
the profile too. `src/dm.js`, `src/tv.js` and `server/` did not change: a light class reaches them with
the same fields they already read (`skills`, `role`, `blurb`, `strengths`, `kit`, `color`), rolls are
posted in the same shape, and the server's rule for a roll with a target (at or over passes, a natural
20 always, a natural 1 never) is the same roll the light rules make.

### 6.2 The light numbers

The DM's targets are the same under both rules (10 easy, 13 medium, 16 hard), so an adventure is
written once. With a bonus `b`, a d20 reaches 13 on `8 + b` faces of 20.

| | Bonus | Easy (10) | Medium (13) | Hard (16) |
| --- | --- | --- | --- | --- |
| Strong | +5 | 80% | **65%** | 50% |
| Fair | +2 | 65% | 50% | 35% |
| Plain | +0 | 55% | **40%** | 25% |

Plain is +0 because four in ten at a medium task is exactly an unmodified d20. Strong is +5 because
13 in 20 is the whole number nearest two in three (+4 is 60%, +6 is 70%), and because it is about what
a trained first-level hero adds under `open-5e`, so the same targets feel the same under both. Fair is
+2: an even chance at a medium task, which is easy to say out loud, and it sits nearer plain than
strong so that being strong is worth having. A class is strong at one to four skills (the scaffold's
are strong at two) and fair at up to six (two), so no hero is good at everything.

Health is three states and no hit points; there is no armor, no ability score and no damage die. A
fight is the same roll: the fight tab lists the cartridge's ways to fight (`light.fight`, with six in
the base), each rolled on the skill it comes down to (or the hero's best of several), so strong,
fair and plain apply as everywhere else. Whether it lands is the DM's call (an adventure's foes have
no target of their own yet; the DM uses the same three numbers, or asks for the roll with a target),
and the DM's turn order already moves a foe one state on "It takes a hit".

### 6.3 What a light cartridge supplies

Per class (not per role: a role is a job several classes share, and the quiz, the samples, the kit
and the DM's side are all keyed by class; a class carries its role as one word):

```
'The Sneak': { role: 'Trickster', blurb: 'One line that sells this class.',
  strong: ['Stealth', 'Sleight of Hand'], fair: ['Deception', 'Perception'], kit: ['lockpicks', 'trinket'],
  strengths: ['You get in and out without being seen.', 'Locks and pockets open for your quick fingers.', 'You can lie with a straight face.'] },
```

`strong` and `fair` are the only new fields, and the only ones the rules need besides `blurb`. `color`
(the dice) and `gear` (for the painter) are optional. No `v`, `hd`, `prio`, `armor`, `skills` or
`attacks`. A people is `{ perk }`: one optional line of flavour, with an optional `look` for the
painter; no `v`, `bonus`, `speed`, `tough`, `lucky` or `flex`, and it changes no roll. `cast.names` needs
one people's list (the others borrow it). `light.fight` and `light.text` are optional rewordings.

For the scaffold's twelve classes and six peoples that is 78 fields and 138 values, none of them a
number, against 176 fields and 546 values (298 numbers) for the same cast under `open-5e`. For Tavern
Night's twelve classes and nine peoples, a light edition made in a scratch copy (same words, roles,
quiz and art) has 114 fields and 174 values with no numbers, against 192 fields and 585 values (331
numbers); it keeps `color`, `gear` and `look` so the two look alike, and without them it would be 81
fields and 141 values.

### 6.4 How the quiz picks a class with no numbers from the author

A class's lean on the eight traits is added up from what its author wrote: each strong skill whole,
each fair skill by half, and half again for the trait of its role (`FR.lightLean`, with the weights in
`FR.LIGHT.weigh`). What a skill says about a hero is the engine's own table, `FR.SKILL_TRAITS`: it
follows what the rules already knew (a skill's ability, and the trait `FR.abilities` reads each
ability from) and tells the skills of one ability apart, so that two classes with different skills
never read alike. The result is stored as the class's `v`, and from there the quiz is exactly today's:
`FR.rank`, measured against the same yardstick of random players, for the full quiz and the quick one.

Reach, on the scaffold's light cartridge (an even share of twelve classes is 8.3%): the full quiz
gives 5.0% (The Sneak) to 13.9% (The Healer), 0.60 to 1.67 of an even share, where 0.4 to 2.2 is
allowed; its quick five give 6.6% to 12.8%, 0.80 to 1.54, where 0.3 to 2.5 is allowed. The light
Tavern Night gives 5.3% to 13.2% and, on Tavern Night's own quick five, 5.5% to 11.4%. Of 10,000
random players of the scaffold's quiz, 61% get the very class the open-5e vectors of the same cast
would give them, and for 94% that class is among the light quiz's closest three (the three the reveal
offers).

A people is not ranked. A hero starts as the people in their class's sample picture, so the hero and
the picture they are handed agree (with no AI, that picture is the portrait); the reveal offers every
people as a chip, with no percentage, and a ready-made hero keeps the people it was written with.

### 6.5 Tooling

- `npm run new-cartridge <id>` writes a light cartridge; `--rules open-5e` writes today's kind (also
  `--rules=open-5e`, and through npm). Both come from one template, `scripts/template/cartridge.js`,
  with the parts that depend on the rules in `scripts/template/rules.light.js` and
  `rules.open-5e.js` (`P.template(rules)` in `scripts/lib/packs.js` puts them together). Both validate
  at once and play end to end, with `--adventure` as well.
- `npm run validate` checks a cartridge by its own rules: `open-5e` exactly as before; `light` as the
  README lists ("What validation checks"). A light cartridge still carrying open-5e's fields, or an
  open-5e one carrying `strong`, `fair` or a `light` block, is warned, not failed. The reach check
  uses the profile (`rank`, `raceFor`), covers the classes only under `light`, and names the class a
  rarely-reached one reads too much like. The engine is held to its half: the base must carry
  `light.fight` and every line in `FR.LIGHT.words`.
- A cartridge's line in the validate report says `· light rules` when it is light; an open-5e
  cartridge's line reads as it always has.
- Tests: `test/unit/profiles.test.js` (which profile, both real cartridges still open-5e, the open-5e
  screens word for word as before, and the light profile: bonuses, odds, health, the quiz and its
  reach, a roll request, the play screen, the sheet in both detail modes) and three more in
  `test/unit/packs.test.js` (the two templates, the scaffold in both kinds, and every light check
  against a deliberately broken copy). `test/unit/rules.test.js` and its fixture are untouched.

### 6.6 Not built

- An adventure's foes have no `target`, so the DM's fight panel cannot ask for a fight roll with one
  tap: the DM judges by the three numbers, or sends a roll request with a target.
- North Pole has no light edition, and neither real cartridge was moved.

## 7. Done means

`npm run check` passes; the Checkpoint 2 script in PLAN.md works on a laptop, a TV-sized window and two
phones; a cartridge with none of the new fields still plays; [LEDGER.md](LEDGER.md) rows are updated
with how each item was checked.

## 7. Changed after the acceptance pass (23 Nov 2026)

Small changes to the contract above, made while fixing what the validator found (docs/LEDGER.md, "Phase 2
validation and fixes"):

- **`session` save takes `base`.** The DM's page sends the time of the save it last saw at this table
  (`base`, 0 for none). If another device has saved since, the server answers 409 with reason `stale` and
  changes nothing; the page then asks for the table's save and `FR.run.sync` decides (take it up, or ask).
  A save with no `base` is kept as it comes. Asking for the save when none is stored also clears a stray
  `sessionAt`.
- **A device's place belongs to one table.** A DM device whose saved place was made at another table starts
  a table that has no story at the cover, and takes up a table that has one without asking.
- **`me` takes `voice`.** The label of the "how you talk" choice (up to 60 characters; an empty string
  clears it). It is sent back only to the DM and to that seat, like the hook.
- **The big screen's side column fits itself** (`fitSide` in `src/tv.js`). Order of giving way: the dice,
  the turn order (down to the next three), a closed vote (to its result), then two columns with a smaller
  picture, then smaller "whose turn" and roll rows, two names to a line for a roll asked of more than four,
  and last a size down. A roll request and an open vote are never cut. A closed vote leaves after a minute.
- **The turn order on the big screen starts at whoever is acting.** With "Whose turn" shown above it, the
  list is headed "Up next". A foe that is out is never announced as whose turn it is.
- **A finished fight comes down by itself.** When the story moves to another place and every foe in the
  turn order is out, the DM's page clears the order (and says so).
