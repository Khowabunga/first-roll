# First Roll ledger

The single record of what is built, what is checked, and what is next. Updated at the end of every
working session. The plan it follows is in [PLAN.md](PLAN.md); the source wish list is
[feature-ideas.md](feature-ideas.md).

**Status marks**

| Mark | Meaning |
| --- | --- |
| ✅ | Built and checked (by test, by an independent validator, or in the browser; the row says which) |
| 🟡 | Partly there: something real exists, the row says what is missing |
| ⬜ | Not started |
| 🚫 | Decided against, with the reason |
| 👤 | Needs a person (a real phone, ears, a Cloudflare or OpenAI dashboard) |

"Cartridge" is the product word for what the code calls a cartridge (`cartridges/<id>/`).

---

## Part 1. The rebuild (20–21 Nov 2026)

State when it shipped: `npm run check` passes (both cartridges valid, build ok, 101 unit tests).
Independent acceptance score **81/100** before the fixes in 1.4; the fixed items were not re-graded.
Committed and pushed on 21 Nov after the owner's Checkpoint 0 test.

### 1.1 Asked for

| # | Item | Status | How it was checked |
| --- | --- | --- | --- |
| R1 | Fix 1: table codes cannot be scanned | ✅ | Validator: identical answers on 9 routes; blocked at the 20th wrong try; 6 phones for 4 minutes never tripped it. 38 server tests |
| R2 | Fix 2: a name in use asks first; a displaced phone is told | ✅ | Validator, both directions |
| R3 | Fix 3: DM can remove a player and end a table | ✅ | Validator: phone told in under 4 s, code dead after ending |
| R4 | Fix 8 (cheap half): a portrait is never deleted by accident | ✅ | Server test (`clearPortrait`) |
| R5 | Quick start: 5 questions, full quiz, or a ready-made hero | ✅ | Validator tap counts to a first roll: ready-made 4, quick 9, full 16–19 |
| R6 | Dice wait for Roll, a flick, or a shake | ✅ | Validator: 13 non-roll actions never rolled; 80 rolls correct. 👤 shake on a real phone |
| R7 | Live roll feed and turn order for the DM | ✅ | Validator: roll reached the DM in 1.2 s; order survived a reload |
| R8 | Wide DM layout | ✅ | Validator: two panes from 900 px, three at 1440; 20 scenes walked |
| R9 | Music off by default on player phones | ✅ | Validator |
| R10 | Table link carries the cartridge | ✅ | Validator: `?t=CODE&s=id` switched a phone both ways |
| R11 | Plain words, rules behind a setting | ✅ | Validator found 13 leftover strings; fixed in 1.4, not re-graded |
| R12 | Flat dice that look like dice | ✅ | Validator: 42 layouts, no overlap; contrast 4.6:1 minimum |
| R13 | Natural 20 feels epic, natural 1 feels like a failure | ✅ | Validator, frame by frame, both cartridges. 👤 sound by ear |
| R14 | North Pole as "iced gingerbread at midnight" | ✅ | Validator: about 400 text pairs, minimum 5.2:1, nothing under 14 px |
| R15 | Engine plus cartridges | ✅ | Validator scaffolded, restyled and played a new cartridge in 101 s with no change to `src/`; 14 of 16 deliberate breaks refused |
| R16 | DM adventure as data, run by a generic engine | ✅ | 448-step replay identical to the old code; a second tiny adventure ran unchanged |

### 1.2 Decisions made along the way

| Decision | Why |
| --- | --- |
| Node server twin (`server.js`, Docker, Render) removed | It had drifted from the Cloudflare version; one server now, `wrangler dev` locally |
| `public/` is generated, not committed | Cloudflare runs the build on deploy. The first commit must untrack it |
| No child-safety or parent-privacy work, and no "adults only" wording | Owner's call, 20 Nov |
| North Pole keeps its "Little / Grown-up / Grandparent" look option | Read as character flavour, not audience. Owner can overrule |
| Any DM with the passcode can join or end any table by code | The shared-passcode design that was asked for; per-DM accounts come with the store |

### 1.3 Known gaps carried forward (not fixed in the rebuild)

| # | Gap | Where it goes |
| --- | --- | --- |
| G1 | Anyone at a table can use the site's OpenAI key for any prompt, with only per-table caps | 👤 Set a monthly budget on the OpenAI project now. Proper fix in Phase 3 (AI layer) |
| G2 | Picture and story-help allowances are lifetime counts per table | Phase 4 (campaign play) |
| G3 | The DM adventure is a public file (players never fetch it, but it is not gated) | Phase 6 (paid cartridges need entitlement) |
| G4 | The pack validator is not a sandbox: a hostile third-party cartridge could run code at build time | Phase 6, before outside authors |
| G5 | ~~Browser Back leaves the app~~ | ✅ Fixed in Phase 1 |
| G6 | First load is about 1.5 MB (table art and the QR maker load for everyone; the other cartridge's key art is its thumbnail) | Phase 1 |
| G7 | Eight 3D dice can stack and hide faces (total is still right) | Phase 1 |
| G8 | The engine's default look and art are Tavern Night's; DM copy and about 15 player strings sit in engine code, not in the cartridge | Phase 1 (cartridge spec v2) |
| G9 | The server falls back to the `northpole` id when a table names no cartridge | Phase 1 |
| G10 | ~~A removed player can rejoin at once; no "leave" that frees a seat~~ | ✅ Fixed in Phase 1 (keep out for an hour; Leave the table) |

### 1.4 Fixes after the validator and code review (21 Nov)

| Fix | Status |
| --- | --- |
| 17 dead border rules (a bad search-and-replace during join-up) repaired; a stylesheet test now catches the pattern | ✅ in browser + test |
| Title screen shows every way in and the DM door from 560 to 900 px tall | ✅ measured at 16 sizes, both cartridges |
| Names and titles wrap to a second line instead of being cut | ✅ in browser at 375 px |
| Plain words: rule-book alignment line hidden unless details are on; 8 perks, dice buttons, labels reworded | ✅ tests; not re-graded |
| A closed table says "ended" only to phones that sat at it | ✅ server test |
| Guess limiter counts an IPv6 household as one address; no longer forgets everyone when full | ✅ code; 👤 real Cloudflare |
| "Show the table" refuses a picture from another table or an old session | ✅ server test |
| A natural 20 or 1 is believed only when a twenty-sided die shows it | ✅ server test |
| A mistyped path redirects to the app, keeping `?t=` and `?s=` | ✅ on the local server |
| Site health check retries; an unsent roll is retried for about 45 seconds | ✅ code only; not exercised offline |
| Local server now reloads when `server/` changes (it had been running a day-old server; `worker.js` itself still needs a restart) | ✅ restarted; closed-table, fake-roll and foreign-picture fixes confirmed with a throwaway table |
| Adventure files ship as data (cannot carry code into the DM's page) | ✅ build output checked |
| Scaffold rejects ids like `my-`; anti-framing headers; a waiting flat die shows "?" | ✅ |

### 1.5 Still needs a person before going live

- 👤 Set a hard monthly budget on the OpenAI project.
- 👤 One real game on two phones (one iPhone): shake to roll, sound and music, the natural 20 and 1 moments, a QR join.
- 👤 Listen to every sound once.

---

## Part 1b. Phase 1: the guided loop (21 Nov 2026)

Contract: [PHASE1.md](PHASE1.md). State: `npm run check` passes (both cartridges valid, build ok, 162
unit tests). Independent acceptance score **80/100, "ready for Checkpoint 1"**, before the fixes in the
last table below; those were re-checked by hand, not re-graded. **Not committed.**

### Built

| Part | What | How it was checked |
| --- | --- | --- |
| Server | Scene state, proposals, roll requests with a hidden target, private notes, unsend, hero offers, leave, keep-out, usage events | 61 server tests; a 49-check run on the real local Worker; validator scanned about 8 MB of player responses and found no leak |
| Cartridge spec v2 | Label, strengths, brief, scene summaries, checks on tries, quests, clues, who's who, handouts; scaffold with `--adventure`; validator checks | Validator scaffolded a cartridge and played both endings with no engine edit; 12 deliberate breakages refused |
| North Pole content | 27 summaries, 44 checks, 14 hidden cards, 7 quests, 18 clues, 10 who's-who lines, 6 handouts, a brief | All 20 scenes walked; read back for spoilers and jargon |
| Player screens | Story feed, action cards, say-what-you-do, roll requests, real dice, health words, quests / clues / who's who, lobby, leave, Back, screen awake, numbers | Builder walk on a phone-sized window; validator played three players through the Checkpoint 1 script |
| DM tools | Scene published on every move with a "what players see" preview, proposals, roll requests, composer with take back, hero offers, handouts, brief and label, "They did what?", keep-out | Builder walked 23 places with 0 hits against 490 secret strings; validator at three sizes |
| The two halves together | Card tap → DM's Asks → "Roll for it" → request on the phone → story-worded result → DM's live result | By hand in two browser tabs, before the validator ran |

Measured by the validator: a new player by quick start reached a first story roll in 12 taps plus a
typed name; a latecomer offered a hero was playing in 2 taps; a phone asleep for two minutes caught
up in a quarter of a second. Title screen download: 13 requests, 973 KB.

### Fixed after the validator

| Defect | Status |
| --- | --- |
| A new table opened mid-story if the browser had run the adventure before | ✅ in browser: a browser with a 7-step session opened a new table at the cover |
| A second DM device silently reset every phone | ✅ in browser: the second device now asks, and the table stayed where it was |
| The DM's answer to something asked in an earlier scene never appeared | ✅ in browser: it arrives as a toast |
| A reloaded phone landed on the title and missed a pending roll request | ✅ in browser: it resumes on the play screen |
| Back inside the DM's composer or "They did what?" threw the DM to the title | ✅ in browser: Back closes the dialog and stays on the DM screen (whether a half-written note survives was not confirmed) |
| The ending was not shown on the play screen | ✅ in browser: the play screen shows "The end" |
| A card kept saying a roll was wanted after it was rolled; a duplicate request from "Roll for it"; "Ask for No roll needed"; "sleigh" and "shout" in the word matcher; the preview cropped pictures | ✅ code; not re-checked |

### Still open from Phase 1

| # | Gap | Where it goes |
| --- | --- | --- |
| H1 | The DM's place in the story lives in one browser, not on the table. A second device now asks before taking over, but cannot pick up where the first left off | Phase 4 (sessions that follow the DM) |
| H2 | "Start a new session" leaves the old run's notes, rolls and requests on phones | Phase 2 |
| H3 | The composer's preview has the right words and order but not the phone's exact look | Phase 2 |
| H4 | A plain "Yes" on a card sends the adventure's "it works" line without showing the DM first | Phase 2 |
| H5 | Armor still shows as a bare number with rules details off | Phase 2 |
| H6 | The dice libraries (about 190 KB) still load on the title screen | Phase 2 |
| H7 | Not built from the plan: DM wording as cartridge data, neutral base art (G8), the server's fallback cartridge id (G9), stacked 3D dice (G7), push notifications | Phase 2 |
| H8 | 👤 Vibration, screen-awake, QR by camera, sound, and the whole loop on real phones | Checkpoint 1 |

---

## Part 1c. Phase 2: big screen and character ties (22–23 Nov 2026)

Contract: [PHASE2.md](PHASE2.md). **Not committed. Graded 80/100 by the independent validator on 23 Nov 2026 (see "Phase 2 validation and fixes").**

### Built

| Part | What | How it was checked |
| --- | --- | --- |
| Server | The stage, a watch-only screen key, votes, hero tokens, reactions, bonds and hooks, the DM's session on the table, reset | 84 server tests; a 315-check run on the real local Worker; whole responses scanned for planted secrets |
| Cartridge spec v3 | Roles, bonds, hooks, voices, items and kits, a token, soundscapes; in the adventure a map with regions, beats, reveals, foes, a vote, easier/harder lines, minutes | Over 140 deliberately broken copies each refused with the right message; a scaffolded cartridge played to both endings |
| Soundscapes | Seven synthesised beds (wind, fire, storm, crowd, cave, night, sea), no audio files | Levels and spectra measured; 👤 nobody has heard them |
| North Pole content | A hand-drawn map with 9 regions, 29 beats, 8 reveals, 5 foes, a vote, 6 roles, 8 bonds, 8 hooks, 12 items, a "Gold star" token, minutes adding to 2½ hours | All 20 scenes walked; map checked by eye at TV and phone size |
| Player screens | Ties, role cards, items, tokens with a reroll, vote, reactions and notes, the face-down reveal, beats, the map, table sounds | Builder walk at phone size with a scripted DM and two extra players |
| DM tools and big screen | TV view, stage controls, chapter map, spotlight, pacing clock, foes, tokens, session on the table | Builder walked 22 places with the stage following; the screen's whole response and page read for anything private; three TV sizes |
| The three together | DM moves → stage opens map regions and sets the bed → TV shows it; hold and flip a picture; vote; token; a typed natural 20 on the phone fills the TV | By hand with a DM, a phone and a TV tab on one local table (read from page contents; screenshots were unreliable) |

### Phase 1 gaps closed here

| Gap | Status |
| --- | --- |
| H1 The DM's place lived in one browser | ✅ Saved on the table; a second device adopted it with no question |
| H2 "Start a new session" left the old run on phones | ✅ It now resets the table; a phone came back clean |
| H3 The composer preview did not match the phone | ✅ The preview is the phone's own card in a 390 px frame |
| H4 A plain "Yes" sent the adventure's line unseen | ✅ The line goes into the note box first |
| H5 Armor as a bare number | ✅ "Lightly / Well / Heavily protected" |
| H6 Dice libraries loaded on the title | ✅ Fetched when the tray first opens; flat dice meanwhile |

### Still open

| # | Gap | Where it goes |
| --- | --- | --- |
| J1 | Rules-light profile (Wave C) | ✅ Built: `light` is the default for new cartridges, `open-5e` unchanged (see C8) |
| J2 | Not built: DM wording as cartridge data, neutral base art, the server's fallback cartridge id, stacked 3D dice, push notifications | Phase 3 or later |
| J3 | A face-down picture's address and title reach phones before the flip (so they can preload); a determined player could look | Accepted for now |
| J4 | The hero's "voice" is not sent to the table, so the DM cannot see it | Phase 3 |
| J5 | 👤 A real TV, sound by ear, vibration, the whole loop on real phones | Checkpoint 2 |

---

### Phase 2 validation and fixes (23 Nov 2026)

Independent validator: **80/100, no blockers, "ready for Checkpoint 2"**. Weak areas were the big screen's
layout when several things show at once, and two DM devices on one table. Fixed since, with `npm run check`
at 253 passing, 0 failing:

| # | Validator finding | Fix | How it was checked |
| --- | --- | --- | --- |
| 1 | TV side column overflowed silently (turn order 1 of 4 rows, vote cut to its heading) | The side now fits itself: the dice and turn order give way first, then it runs in two columns with a smaller picture, then a denser roll list; a last resort draws it a size down. Nothing is cut mid-line. | Browser at 1920x1080, 1280x720, 1024x768: whose turn + roll asked of 3 + open four-option vote all whole; same with 8 players |
| 2 | Two DM devices could silently take the story backwards | A save names the save it was made on top of; the server refuses a stale one (409 `stale`) and the device looks at the table again | Unit test. Browser, two DM devices on one table: the offline device that tapped first jumped forward to the table's place (the table and the other device never went back); the offline device that tapped last was asked, and "Use this device's place" moved the table and the other device |
| 3 | Who-rolled caption covered the natural 20 / natural 1 line | Caption moved to the top of the screen | Browser: natural 1, caption 38 to 144 px, number from 252 px, joke readable |
| 4 | TV turn order did not follow the turn | The list starts at whoever is acting ("Up next" under "Whose turn") | Unit test; browser with 16 entries, the 13th acting |
| 5 | A finished fight stayed on the TV | When the story moves on and every foe is out, the turn order comes down by itself; an out foe is never announced as whose turn | Unit test for the TV half. Browser: soot sprites taken to Out, story moved on, toast shown and the table's order came back empty |
| 6 | `npm run new-cartridge x --rules open-5e` wrote a light cartridge on npm 11 | The loose word is taken as the rules; any other loose word stops with a message | Ran five spellings through npm 11.9 |
| 7 | A new table took a device's old place in the story | A place made at another table is not this table's: it starts at the cover, or takes up the table's own | Browser: a device mid-story at one table opened a brand-new table at the cover; the first table kept its place, and the device picked it up again on going back |
| 8 | A phone reloaded within 5 s replayed a beat | The last beat is remembered with the seat | Browser (390x844 player): beat played once, page reloaded 3.8 s later, not played again |
| 9 | An open picture covered a vote or roll request | Requests and votes sit above the picture | Browser: with a picture open, a vote and then a roll request both arrived on top of it |
| 10 | 41 audio warnings on reload | No sound or buzz is asked for before the page is touched | Browser: reload with a request and a vote waiting, 0 console warnings or errors |
| 11 | Offline DM saw "Failed to fetch" and "Sent" for an unsent beat | Plain offline message; an unsent beat is not said to be sent | Browser, DM offline: a beat and a Gold star each gave the plain offline line; nothing said "Sent" |
| 12 | TV names cut short, five stars overflow, "T" disc for every "The ..." foe | Names take two lines; eight players sit in two rows of four; more than three stars show as a count; the article is skipped | Browser, 3 and 8 players |
| 13 | DM's glance had no voice | How a hero talks is kept with the seat, for the DM and that player only | Unit test (privacy included). Browser: the glance reads "How they talk: Gruff and short" |
| 15 | Conflict question named the same scene twice | Says both stand at the same scene by different choices | Browser: the question read "Both stand at ... but they reached it by different choices" |
| 18 | TV fetched intro music after the sound tap | The TV never starts the cartridge's music | Browser: TV in the lobby, sound tapped, no sound file fetched |
| 19 | Story "Map" tab 41 px wide | Tabs are at least 44 px wide | Browser: Map tab 44x48 px |

Also: a closed vote leaves the TV after a minute (browser, with a fast-forwarded clock).

Still open from this pass: 14 (chapter map edges cross), 16 (a stripped cartridge shows the base's roles and
token: decide which rule wins), 17 (server default cartridge id), 20 (server errors say "hero tokens"),
21 (first player seated is not offered the bond step later). J1 rules-light is **built** (see C8).

Every fix above has now been replayed in a browser (23 Nov), and none of the replays turned up anything new.
Not exercised in a browser: the TV's last-resort "a size down" step (nothing tried was crowded enough to need it).

## Part 2. Feature ideas inventory

Every item in [feature-ideas.md](feature-ideas.md), with what exists today and the phase it is planned
for (see PLAN.md). "Cartridge data" names what a cartridge will carry so the feature needs no code per
cartridge.

### Player: joining a table

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| P1 | QR code plus short room code | ✅ | Link, QR and four-letter code | none | done |
| P2 | Guest play, account later | 🟡 | Guest only; nothing to save to | none | 4 |
| P3 | Rejoin and late join with a "story so far" | ✅ | Rejoin restores the hero; "What's happening?" and "Story so far" on the phone; a reloaded phone goes straight back to its hero | `log` lines on outcomes (already there) | 1 |
| P4 | "Just give me a hero" | ✅ | Ready-made gallery, 2 taps to play | `roster.premades` | done |
| P5 | Lobby with party preview | ✅ | "Who's here": portrait, hero, who plays them, one plain strength | role words per class | 1 |

### Player: character creation

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| P6 | Strengths in plain words | 🟡 | Three plain strengths per class in the cartridge; the lobby and the DM's glance show one; the quiz result does not show all three yet | `strengths` lines per class | 1 |
| P7 | Role cards instead of classes | ✅ | Roles lead the ready-made gallery, the quiz result and "Who's here", which says what the party is missing | `roles` + rules profile | 2 |
| P8 | Party bonds | ✅ | One prompt about another player's hero; shown under both heroes | `bonds` prompts | 2 |
| P9 | Personal hook from the cartridge | ✅ | Two or three hooks that suit the hero's role; seen only by that player and the DM | `roster.hooks` | 2 |
| P10 | Art style lock, variations, tweak chips | 🟡 | Cartridge sets the portrait style; look chips exist with AI on | `ai.style` (there) | 3 |
| P11 | Likeness anchor | 🟡 | Scene painter is told each hero's look in words | none | 3 |
| P12 | Name and voice helper | ✅ | Name generator, and a voice to try on the sheet (kept on the phone; the DM does not see it) | `voices` list | 2 |
| P13 | Character card to share | ⬜ | The sheet, not shareable | card template | 4 |

### Player: during play

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| P14 | Story feed | ✅ | One timeline: scenes, DM notes and pictures, private notes, hero offers, your answered rolls | none | 1 |
| P15 | "What can I do?" action cards from the scene | ✅ | Cards from the current scene; a tap asks the DM; the answer comes back on the card | scene `tries` (already there) shown to players | 1 |
| P16 | Intent box | ✅ | "Or say what you do" with a plain-word suggestion of the check (AI version in Phase 3) | check words per skill | 1 (plain), 3 (AI) |
| P17 | Roll request flow | ✅ | The DM asks one player or all; one big button; the result reads as story; the target stays hidden | none | 1 |
| P18 | Dice moments; type in a real roll | ✅ | Animated dice, haptics, natural 20/1 moments, and "I rolled real dice" | `fx` | 1 (type-in) |
| P19 | Advantage made visual | ✅ | "Roll two, keep the best" | none | done |
| P20 | Health as states | ✅ | Fine / hurt / in trouble in the cartridge's words; numbers with rules details on | state words | 1 |
| P21 | Items and abilities as cards | ✅ | "Things you carry" cards with Use, which tells the DM; one-use items mark as used | `items` | 2 |
| P22 | Secret messages and handouts | ✅ | Notes and pictures to one player or all; handouts from the cartridge; take back | `handouts` | 1 |
| P23 | Quest board and clues | ✅ | Quests and clues switch on and off with the story's flags | `quests`, `clues` set by outcomes | 1 |
| P24 | Who's who | ✅ | People appear for players when the cartridge says they are met | `bible.people[].public` | 1 |
| P25 | Notes and pin to notes | ✅ | Pin anything in the story feed; free notes; kept on the phone per table | none | 2 |
| P26 | Ask the rules | ⬜ | | `glossary` | 5 (plain), 3 (AI) |
| P27 | Party vote | ✅ | One tap per option, changeable while open, bars when the DM closes it | none | 2 |
| P28 | Hero tokens | ✅ | Awarded by the DM in the cartridge's word for them; spend one to roll again | token name and art | 2 |
| P29 | Reactions | ✅ | Six marks on scenes, DM notes and natural 20/1 rolls | none | 2 |

### Player: after the session

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| P30 | Auto recap | 🟡 | DM helper can write a "previously" (built-in or AI); not sent to phones | `log` lines | 4 |
| P31 | Comic strip highlights | ⬜ | | panel template | 4 |
| P32 | Character keepsake and badges | ⬜ | | `badges` | 4 |
| P33 | Stars and wishes | ⬜ | | none | 4 |
| P34 | Continue later | 🟡 | Tables last 30 days; seat reclaim; DM session saved on the DM's device only | none | 4 |

### DM: before the session

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| D1 | Cartridge labels | ✅ | Label chips on the DM's cover and in the manifest | `label` | 1 |
| D2 | Ten minute DM brief (and audio) | 🟡 | A printable one-page brief on the cover; no audio yet | `brief` | 1 (text), 3 (audio) |
| D3 | Session zero in two minutes | ⬜ | | tone options | 5 |
| D4 | Table setup; assign heroes to latecomers | ✅ | Create, QR, see who joined, offer a ready-made hero to a latecomer | none | 1 |
| D5 | Rehearsal mode with AI players | ⬜ | | none | 5 |

### DM: running the table

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| D6 | Scene cards | ✅ | Read-aloud, notes, cast, tries with rolls, outcomes | `flow` | done |
| D7 | Chapter map with branches | ✅ | A graph of chapters, hubs and endings on the Story tab: here, seen, ahead, closed | `flow` (there) | 2 |
| D8 | Preview before push; one player or all | ✅ | One composer with a preview, to everyone or one player (the preview's look differs slightly from the phone's) | none | 1 |
| D9 | Roll requests with hidden target | ✅ | From any try in one tap or by hand; live results; the DM judges when there is no target | targets on `tries` | 1 |
| D10 | Spotlight tracker | ✅ | Who has been quiet longest, with "Give them the next moment" | none | 2 |
| D11 | Pacing clock | ✅ | Time in against the chapters' minutes; when behind, the adventure's shortcuts as what to cut | `clock`, `shortcuts` (there) + minutes per chapter | 2 |
| D12 | Instant NPC | 🟡 | Helper writes lines for listed people only | name lists, `painter` | 3 |
| D13 | Light combat tracker | ✅ | Foes join the turn order with health as states and suggested moves | `foes` | 2 |
| D14 | Difficulty dial | ✅ | The scene's easier and harder lines behind two buttons | easier/harder notes on scenes | 2 |
| D15 | Scene image presets and queue | 🟡 | "Paint this scene" with AI; shipped art otherwise | `painter` (there) | 3 |
| D16 | Soundscapes | ✅ | Seven synthesised beds plus the cartridge's own files; follows the story; DM picks level or off (👤 by ear) | `sound` per scene | 2 |
| D17 | Unsend | ✅ | "Take back" on anything sent | none | 1 |

### DM: AI copilot

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| D18 | "They did what?" | 🟡 | A button on every scene with three ways forward from built-in suggestions; AI version later | `helper` (there) | 1 (built-in), 3 (AI) |
| D19 | Consequence ledger | 🟡 | Flags and log feed the helper | `flags` (there) | 3 |
| D20 | Rewrite with a diff | ⬜ | | `clues` marked essential | 3 |
| D21 | Clue safety net | ⬜ | | `clues` with fallback places | 3 |
| D22 | Describe this | 🟡 | Places carry senses text | `places[].senses` (there) | 3 |
| D23 | Push to talk | 🟡 | Dictation only inside the hosted Claude page | none | 3 |
| D24 | Rules whisper | ⬜ | | rules profile | 3 |
| D25 | Tone guardrails | ⬜ | | `rating`, lines and veils | 3 |

### DM: after the session

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| D26 | DM notes and next opener | 🟡 | Session log | none | 4 |
| D27 | Save state | ✅ | Saved on the table after every step; any DM device carries on from the same place | none | done (cross-device in 4) |
| D28 | Author feedback | ⬜ | | none | 4 |

### Shared table

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| S1 | TV cast mode | ✅ | A watch-only page from a link or QR: scene, map, held picture, rolls, turn order, votes, party | none | 2 |
| S2 | Group dice moments on the big screen | ✅ | Rolls ticker with names; a natural 20 or 1 fills the big screen | `fx` | 2 |
| S3 | Map reveal | ✅ | A map with regions, fogged until the story or the DM opens them | `maps` | 2 |
| S4 | Active character spotlight | ✅ | The acting hero, large, on the big screen | none | 2 |
| S5 | Tap to reveal | ✅ | Held face down on every phone and the big screen, flipped together | none | 2 |
| S6 | Haptic beats | ✅ | Six kinds of beat: buzz, sound and a flash (👤 real phones) | `beats` on scenes | 2 |
| S7 | Read aloud voice | 🟡 | Only inside the hosted Claude page | voice per cartridge | 3 |
| S8 | Hybrid play | ✅ | A remote friend joins by link and can open the big-screen link | none | 2 (with S1) |
| S9 | Smart light sync | ⬜ | | scene moods | later |

### Tutorials and onboarding

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| T1 | Prologue scene | ⬜ | A one-time nudge | `prologue` | 5 |
| T2 | Just in time tips | 🟡 | First-roll nudge only | none | 5 |
| T3 | Tap any game word | ⬜ | | `glossary` | 5 |
| T4 | "What's happening?" | ✅ | On the play screen and the story screen | scene `summary` | 1 (with P3) |
| T5 | Table manners card | ⬜ | | none | 5 |
| T6 | First table cartridge for new DMs | ⬜ | | a cartridge | 5 |
| T7 | Coach mode | 🟡 | Tips on the cover | `coach` notes on scenes | 5 |
| T8 | Five skill micro lessons | ⬜ | | none | 5 |

### Cartridge ecosystem

| # | Feature | Status | Today | Phase |
| --- | --- | --- | --- | --- |
| C1 | Written cartridge spec | ✅ | Spec v2 in the README: label, strengths, brief, summaries, checks, quests, clues, who's who, handouts | done (v2 in 1) |
| C2 | Scaffold and validator | ✅ | `npm run new-cartridge`, `npm run validate` | done |
| C3 | Label | ✅ | see D1 | 1 |
| C4 | Chapters, scenes, branches, flags, endings | ✅ | `flow`, `flags`, `versions` | done |
| C5 | Cast with voice, motive, secret | ✅ | `bible.people` | done |
| C6 | Characters: archetypes, quiz, ready-made heroes | ✅ | hooks missing (P9) | done |
| C7 | Assets: maps, handouts, items | ✅ | Pictures, handouts, a map with regions, items with starting kits | 1–2 |
| C8 | Rules profile (rules light, or open 5e) | ✅ | `rules: 'light'` (one d20 plus a bonus: strong +5, fair +2) or `'open-5e'` (today's maths); the scaffold writes light unless told `--rules open-5e` | done |
| C9 | Cartridge builder | ⬜ | Command line only | 6 |
| C10 | Series carryover | ⬜ | | 4 |
| C11 | Occasion cartridges | 🟡 | North Pole | ongoing |
| C12 | Marketplace, subscription, credits | ⬜ | `access` and `sku` fields exist, unused | 6 |
| C13 | 5e licence attribution (SRD 5.2, CC BY 4.0) | 🟡 | Credit added to every cartridge, the README and Settings. 👤 Needs a legal read (wording taken from secondary copies; 5.2 versus 5.2.1) | 1 |

### Safety, accessibility, trust

| # | Feature | Status | Today | Phase |
| --- | --- | --- | --- | --- |
| A1 | Lines and veils on phones | ⬜ | | 5 |
| A2 | Digital X card | ⬜ | | 5 |
| A3 | Content rating per cartridge and table | 🟡 | A rating on the cartridge label; nothing enforces it yet | 1 (label), 3 (AI respects it) |
| A4 | Image safeguards | 🟡 | The provider's own moderation; friendly errors | 3 |
| A5 | Family mode | 🚫 | Not a children's product (owner, 20 Nov). Reopen only if that changes | — |
| A6 | Large text, high contrast, screen reader labels | 🟡 | Contrast measured; focus handled in dialogs; results announced; no text-size option | 5 |
| A7 | Colour-blind safe dice and status | 🟡 | Flat dice ink always readable; not checked for colour-only signals | 5 |
| A8 | Haptics as an alternative to sound; read aloud | 🟡 | Haptics on big moments | 5 |
| A9 | One-handed play, dyslexia-friendly font | ⬜ | | 5 |
| A10 | DM in the loop for anything AI writes | ✅ | AI text goes to the DM, who chooses what to show | done |
| A11 | Minimal data; "delete my character" | ✅ | Guest only; "Leave the table" frees the seat and the table forgets the hero; DM can remove a player or end the table | 1 |

### Technical UX

| # | Feature | Status | Today | Phase |
| --- | --- | --- | --- | --- |
| X1 | Pre-made art for planned scenes; placeholder while painting | ✅ | Cartridge ships scene art | done |
| X2 | Character consistency across images | 🟡 | see P11 | 3 |
| X3 | Weak wifi: reconnect without losing progress | 🟡 | Reconnecting pill, retried rolls and health check, a reloaded phone resumes at the table; the DM's place in the story still lives on one device | 1 |
| X4 | Keep screens awake; push for roll requests | 🟡 | Screen-awake request while seated (👤 real phone); no push notifications | 1 |
| X5 | AI cost caps | 🟡 | Per table; no site-wide ceiling (G1) | 3 |
| X6 | AI grounded in cartridge facts | ✅ | Bible, flags and log go into every prompt | done |
| X7 | One source of truth for state | ✅ | The table object on the server | done |
| X8 | Numbers from day one: time to first roll, creation drop-off, action-card share, "They did what?" presses | ✅ | Six events written to Cloudflare's logs, no personal data | 1 |

---

## Part 3. Checkpoints (when the owner tests)

Big changes land between checkpoints; at each one the owner plays through the front end.

| Checkpoint | When | Status |
| --- | --- | --- |
| C0 | After the rebuild fixes | ✅ Owner tested 21 Nov on laptop and phone: "looks great". Committed and pushed the same day |
| C1 | End of Phase 1, the guided loop | ✅ Not tested on its own: the owner's Checkpoint 2 play-through on 26 Nov ran the same loop |
| C2 | End of Phase 2, big screen and character ties | ✅ Owner tested 26 Nov: "all looks good". Validated 80/100, findings fixed and replayed 23 Nov. Committed and pushed 26 Nov |
| C3 | End of Phase 3, the copilot | ⬜ |
| C4 | End of Phases 4 and 5 | ⬜ |
| C5 | End of Phase 6, the store | ⬜ |
