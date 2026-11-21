# First Roll implementation plan

How everything in [feature-ideas.md](feature-ideas.md) gets built, in an order that keeps cartridges
easy to make. Progress is tracked row by row in [LEDGER.md](LEDGER.md). Status: **proposed, 21 Nov
2026**; five decisions at the end need the owner before Phase 1 starts.

## The rule every feature follows

A feature is not done until a cartridge author can use it without touching the engine:

1. **Data, not code.** The feature reads a named part of the cartridge (`scenarios/<id>/scenario.js`
   or `adventure.js`). Nothing about one story lives in `src/`.
2. **A sensible default.** A cartridge that says nothing still works: the base cartridge supplies
   the words, and the feature hides itself when it has nothing to show.
3. **Scaffolded.** `npm run new-scenario <id>` writes that part with a comment explaining it.
4. **Validated.** `npm run validate` refuses a broken one with a message a non-programmer can act on.
5. **Proven on North Pole.** The cookie cartridge uses it before it counts as built.
6. **Documented.** The cartridge spec in the README gains the field.

The owner tests through the front end only at checkpoints, one per phase. Each checkpoint has a
short script of things to try.

## Where it starts

The rebuild (LEDGER Part 1) left: an engine in `src/`; self-contained data-only cartridges with a
scaffold and a validator; a generic DM runner playing an adventure written as data (chapters,
scenes, tries with rolls, outcomes that set flags, hubs, endings, a story bible, helper and painter
wording); a table on the server that holds seats, a feed of handouts, a roll feed and the table's
cartridge; quick start; plain words; a wide DM layout.

What the wish list mostly adds is a **live link between the DM's current scene and every phone**.
Today the phones know nothing about where the story is. Almost every Phase 1 feature is that link
seen from a different side.

## Phase 1: the guided loop

The doc's "Now": joining, acting, rolling, and the DM's off-script safety net. Goal: a brand-new
player goes from code to a first story roll in under ten minutes, and never has to ask "what do I
do?".

**Engine work**

- **Scene state on the table.** The DM's runner publishes where the story is (chapter, scene, what
  has been revealed) to the table; phones receive it with the poll they already make. Everything
  below reads from it.
- **Proposals and requests.** Two small message kinds beside rolls: a player proposes an action or
  an intent to the DM; the DM asks one player or everyone for a roll, with a reason and a hidden
  target. Results come back as story words ("You catch the ledge, barely").
- **Private delivery.** Feed items can be addressed to one seat; the DM previews before sending and
  can unsend.
- **Story feed** on the phone: scene pictures, DM messages and key moments in order, replacing the
  inbox. "Story so far" and "What's happening?" are built from it and from the outcome log.
- **Lobby**: players see who has joined and what each is good at; the DM can hand a latecomer a
  ready-made hero; a player can leave and free the seat.
- **Small things**: type in a real dice roll; health as words; keep the screen awake; Back button
  stays in the app; lighter first load; self-delete of a character; numbers from day one (time to
  first roll, creation drop-off, share of actions from cards, helper presses) kept on Cloudflare.

**Cartridge spec v2 (what authors gain)**

| Part | What it holds | Used by |
| --- | --- | --- |
| `label` | Length, player count, tone, DM difficulty, content flags, rating | Cartridge cards, DM brief |
| Scene `tries` shown to players | The likely actions already written for the DM become action cards on phones, each with its check and a hidden target | Action cards, roll requests |
| `summary` per scene, `log` per outcome | One or two lines of "what is going on" | Story so far, What's happening?, late join |
| `quests` and `clues` | Goals and discoveries, switched on by outcomes | Quest board |
| `people[].public` | The portrait, name and one-line memory players may see, and when | Who's who |
| `handouts` | Letters, notes and items the DM can give one player or all | Secret messages |
| `brief` | One page: what it is about, three key people, how it can end | Ten minute DM brief |
| `strengths` per class, health words | Plain sentences | Lobby, sheet, health as states |
| `dm` copy block | The DM-side wording now fixed in the engine | Lets a cartridge speak in its own voice |
| Neutral base art | The engine's default look stops being Tavern Night's | New cartridges start clean |

Also in this phase: SRD attribution for Tavern Night, and "They did what?" as a first-class button
using the built-in (non-AI) suggestions that already exist.

**Checkpoint 1 script**: start a table on a laptop, join on two phones by QR, one by quick start and
one late with a ready-made hero; play the first three scenes using only action cards and roll
requests; send one phone a secret; open the quest board and who's who; have one phone drop off and
rejoin; read the "story so far".

## Phase 2: big screen and character ties

The doc's "Next".

**Engine work**

- **TV view**: a read-only page for a big screen (`?tv=CODE`) showing the current scene picture,
  map reveals, everyone's dice with names, the acting hero, and full-screen natural 20s. A remote
  friend can watch it by link.
- **Table moments**: tap to reveal (face down on every phone, flipped together), synced haptic
  beats, DM-controlled soundscapes, party vote, hero tokens, reactions, notes with pin.
- **DM tools**: chapter map with branches, spotlight tracker (from the roll feed), pacing clock with
  what to cut, enemy health as states in the turn order, difficulty dial.
- **Character ties**: party bonds, a personal hook per hero, role cards, "how you talk" helper,
  items and abilities as cards.
- **Rules profiles**: the engine's one built-in rule set becomes a named profile. `rules-light`
  (one d20 plus a bonus against a target) becomes the default; `open-5e` keeps today's maths for
  cartridges that want it.

**Cartridge spec additions**: `maps` (image plus regions to uncover), `beats` and `sound` on scenes,
`bonds` prompts, `roster.hooks`, `roles`, `voices`, `items`, `foes`, easier/harder notes on scenes,
minutes per chapter, `rules`.

**Checkpoint 2 script**: the same game with a TV in the room: reveal a map, flip a picture together,
run a short fight with enemy health, award and spend a token, take a vote, and check each hero's bond
and hook showed up for the DM.

## Phase 3: the copilot (AI as an optional layer)

Everything here must leave the no-AI experience complete.

- **AI provider layer**: off (default), the player's or DM's own key, or a signed-in account; a
  site-wide spend ceiling; the cartridge's rating and the table's limits applied to every prompt.
  This closes ledger gap G1. "Sign in with ChatGPT" needs checking against what OpenAI actually
  offers at the time; it is not designed yet.
- **Copilot**: "They did what?" with three options, consequence ledger, rewrite with a diff the DM
  approves, clue safety net, describe this, instant NPC that lands in who's who, rules whisper, push
  to talk, read-aloud voice, audio DM brief.
- **Pictures**: likeness anchor so a hero looks the same in every scene, three variations and tweak
  chips, presets, a background queue.
- **Player side**: intent box that suggests the check, ask the rules.

**Cartridge spec additions**: `clues` marked essential with fallback places, `rating`, name lists for
instant NPCs, a voice per cartridge. The bible, flags, helper and painter wording already exist.

**Checkpoint 3 script**: play two scenes with AI off, then turn it on with a key and go off script
twice; approve one rewrite; make an NPC on the spot; confirm a hero looks the same in two pictures;
confirm the spend ceiling stops a runaway.

## Phase 4: keep it and come back

- **Accounts, lightly**: guest by default, "save my hero" at the end of the night; DM sessions that
  follow the DM across devices; tables that pause and resume a campaign; allowances that roll over
  (gap G2).
- **After the session**: auto recap on every phone, comic strip of the night, keepsake card and
  badges, shareable character card, stars and wishes, DM notes with a suggested opener.
- **Series**: heroes and their deeds carry into the next cartridge.
- **Author feedback**: where tables left the script and how long chapters ran.

**Cartridge spec additions**: `badges`, card and comic templates, `series`.

## Phase 5: teach, protect, include

- **Onboarding**: a three-minute prologue scene during character creation, just-in-time tips, tap
  any game word, table manners card.
- **New DMs**: a "first table" cartridge with coaching inside the scene cards, coach mode, five
  micro lessons, rehearsal with AI players (needs Phase 3).
- **Safety**: lines and veils collected on phones before play, a digital X card, session zero in two
  minutes. Family mode is out (ledger A5).
- **Accessibility**: text size, high contrast, colour-blind safe signals, haptics for sound, read
  aloud, one-handed layout, a dyslexia-friendly font.

**Cartridge spec additions**: `prologue`, `glossary`, `coach` notes on scenes, tone options.

**Checkpoint 4** covers Phases 4 and 5 together: finish a session and get the recap, comic and
keepsake; come back the next day and continue; run the prologue as a new player; set a line and use
the X card; play with large text.

## Phase 6: the platform

- **Cartridge builder**: a web authoring tool on top of the scaffold and validator, with AI drafting
  outline, chapters and scenes, and a playtest preview.
- **The store**: subscription with credits, one-off purchases, and cartridges delivered only to
  people entitled to them (gap G3).
- **Outside authors**: a real sandbox for third-party cartridges (gap G4), ratings, a marketplace.

**Checkpoint 5 script**: build a small cartridge in the builder, publish it as paid, buy it with a
credit on another account, and play it.

## Order and size

| Phase | Depends on | Rough size |
| --- | --- | --- |
| 1 Guided loop | the rebuild | Large: the scene link touches the server, the DM runner and the player screens |
| 2 Big screen and ties | 1 | Large |
| 3 Copilot | 1 | Large; needs the provider decision |
| 4 Keep and come back | 1; recap is better after 3 | Medium to large; needs an accounts decision |
| 5 Teach, protect, include | 1; rehearsal needs 3 | Medium |
| 6 Platform | 4 | Largest; payments, entitlement, sandboxing |

Phases 2 and 3 can swap. Sizes are relative, not estimates in days.

## Checkpoint 0 (now): the rebuild

Run `npm run dev` and open http://localhost:8787 on a laptop and, on the same wifi, a phone.

1. On the phone: Quick start, answer five questions, "Looks good", tap an action, press Roll.
2. Open Settings: switch "Show rules details" on and off; turn music on.
3. In the dice tray: turn on "Shake to roll" and shake; roll until you see a natural 20 or a 1.
4. On the laptop: "I am the DM", start a table, and join from the phone by the QR.
5. Roll on the phone and watch the roll feed; roll "Who goes first?" and watch the turn order.
6. Join from a second device with the same name and answer "Is that you?".
7. Walk a few scenes of the cookie story in the wide layout; show the table a picture.
8. Remove a player, then end the table.
9. Switch to Tavern Night and make a hero with the full quiz.

## Decisions needed before Phase 1

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | Rules: switch to a rules-light core now, or keep today's 5e-style maths hidden under plain words until Phase 2 | Keep today's maths for Phase 1 (players never see it) and introduce rules profiles in Phase 2 |
| 2 | The word: "cartridge" everywhere, including the code's `scenarios/` folder | Say "cartridge" to users and in docs now; rename the folder at the start of Phase 1, before anything else builds on it |
| 3 | Family mode and age ratings from the doc, against "not a children's product" | Drop Family mode; keep a content rating on the cartridge label |
| 4 | The doc says the DM's device is the source of truth; today the server's table is | Keep the server as the truth: TV view, rejoin and remote friends all need it |
| 5 | Where the day-one numbers are kept | Cloudflare's own analytics store; no third-party tracker |
