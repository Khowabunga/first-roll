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

"Cartridge" is the product word for what the code calls a scenario pack (`scenarios/<id>/`).

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
| G5 | Browser Back leaves the app | Phase 1 |
| G6 | First load is about 1.5 MB (table art and the QR maker load for everyone; the other cartridge's key art is its thumbnail) | Phase 1 |
| G7 | Eight 3D dice can stack and hide faces (total is still right) | Phase 1 |
| G8 | The engine's default look and art are Tavern Night's; DM copy and about 15 player strings sit in engine code, not in the cartridge | Phase 1 (cartridge spec v2) |
| G9 | The server falls back to the `northpole` id when a table names no cartridge | Phase 1 |
| G10 | A removed player can rejoin at once; no "leave" that frees a seat | Phase 1 (lobby) |

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

## Part 2. Feature ideas inventory

Every item in [feature-ideas.md](feature-ideas.md), with what exists today and the phase it is planned
for (see PLAN.md). "Cartridge data" names what a cartridge will carry so the feature needs no code per
cartridge.

### Player: joining a table

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| P1 | QR code plus short room code | ✅ | Link, QR and four-letter code | none | done |
| P2 | Guest play, account later | 🟡 | Guest only; nothing to save to | none | 4 |
| P3 | Rejoin and late join with a "story so far" | 🟡 | Rejoin by name restores the hero; no session recap for the latecomer | `log` lines on outcomes (already there) | 1 |
| P4 | "Just give me a hero" | ✅ | Ready-made gallery, 2 taps to play | `roster.premades` | done |
| P5 | Lobby with party preview | ⬜ | Only the DM sees who is here | role words per class | 1 |

### Player: character creation

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| P6 | Strengths in plain words | 🟡 | "Good at" list and plain result sentences; no three-sentence summary | `strengths` lines per class | 1 |
| P7 | Role cards instead of classes | ⬜ | 12 classes per cartridge, named freely | `roles` + rules profile | 2 |
| P8 | Party bonds | ⬜ | | `bonds` prompts | 2 |
| P9 | Personal hook from the cartridge | ⬜ | A written backstory, not tied to the plot | `roster.hooks` | 2 |
| P10 | Art style lock, variations, tweak chips | 🟡 | Cartridge sets the portrait style; look chips exist with AI on | `ai.style` (there) | 3 |
| P11 | Likeness anchor | 🟡 | Scene painter is told each hero's look in words | none | 3 |
| P12 | Name and voice helper | 🟡 | Name generator; no "how you talk" | `voices` list | 2 |
| P13 | Character card to share | ⬜ | The sheet, not shareable | card template | 4 |

### Player: during play

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| P14 | Story feed | 🟡 | "From your DM" inbox with older/newer | none | 1 |
| P15 | "What can I do?" action cards from the scene | 🟡 | A fixed action list per cartridge; rolls reach the DM | scene `tries` (already there) shown to players | 1 |
| P16 | Intent box | ⬜ | | check words per skill | 1 (plain), 3 (AI) |
| P17 | Roll request flow | ⬜ | The DM cannot ask a phone for a roll | none | 1 |
| P18 | Dice moments; type in a real roll | 🟡 | Animated dice, haptics, natural 20/1 moments; no type-in | `fx` | 1 (type-in) |
| P19 | Advantage made visual | ✅ | "Roll two, keep the best" | none | done |
| P20 | Health as states | ⬜ | A number | state words | 1 |
| P21 | Items and abilities as cards | ⬜ | Attack list and special rolls | `items` | 2 |
| P22 | Secret messages and handouts | 🟡 | Notes and pictures to everyone only | `handouts` | 1 |
| P23 | Quest board and clues | ⬜ | | `quests`, `clues` set by outcomes | 1 |
| P24 | Who's who | 🟡 | The DM has a dictionary; players see only what is shown | `bible.people[].public` | 1 |
| P25 | Notes and pin to notes | ⬜ | | none | 2 |
| P26 | Ask the rules | ⬜ | | `glossary` | 5 (plain), 3 (AI) |
| P27 | Party vote | ⬜ | | none | 2 |
| P28 | Hero tokens | ⬜ | | token name and art | 2 |
| P29 | Reactions | ⬜ | | none | 2 |

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
| D1 | Cartridge labels | 🟡 | Name, blurb, kind, access; adventure has length and table size | `label` | 1 |
| D2 | Ten minute DM brief (and audio) | 🟡 | Cover pitch, tips and Story tab | `brief` | 1 (text), 3 (audio) |
| D3 | Session zero in two minutes | ⬜ | | tone options | 5 |
| D4 | Table setup; assign heroes to latecomers | 🟡 | Create, QR, see who joined | none | 1 |
| D5 | Rehearsal mode with AI players | ⬜ | | none | 5 |

### DM: running the table

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| D6 | Scene cards | ✅ | Read-aloud, notes, cast, tries with rolls, outcomes | `flow` | done |
| D7 | Chapter map with branches | 🟡 | Story tab lists chapters and status | `flow` (there) | 2 |
| D8 | Preview before push; one player or all | 🟡 | Push to all, no preview | none | 1 |
| D9 | Roll requests with hidden target | ⬜ | | targets on `tries` | 1 |
| D10 | Spotlight tracker | ⬜ | Roll feed has the data | none | 2 |
| D11 | Pacing clock | 🟡 | Story clock and "short on time?" jumps | `clock`, `shortcuts` (there) + minutes per chapter | 2 |
| D12 | Instant NPC | 🟡 | Helper writes lines for listed people only | name lists, `painter` | 3 |
| D13 | Light combat tracker | 🟡 | Turn order with hand-added monsters; no enemy health | `foes` | 2 |
| D14 | Difficulty dial | ⬜ | | easier/harder notes on scenes | 2 |
| D15 | Scene image presets and queue | 🟡 | "Paint this scene" with AI; shipped art otherwise | `painter` (there) | 3 |
| D16 | Soundscapes | 🟡 | Per-device music by scene type | `sound` per scene | 2 |
| D17 | Unsend | ⬜ | | none | 1 |

### DM: AI copilot

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| D18 | "They did what?" | 🟡 | Helper has try/twist modes with built-in fallbacks | `helper` (there) | 1 (built-in), 3 (AI) |
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
| D27 | Save state | ✅ | DM session saved on the device | none | done (cross-device in 4) |
| D28 | Author feedback | ⬜ | | none | 4 |

### Shared table

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| S1 | TV cast mode | ⬜ | | none | 2 |
| S2 | Group dice moments on the big screen | 🟡 | Banners on every phone and the DM screen | `fx` | 2 |
| S3 | Map reveal | ⬜ | | `maps` | 2 |
| S4 | Active character spotlight | ⬜ | | none | 2 |
| S5 | Tap to reveal | ⬜ | | none | 2 |
| S6 | Haptic beats | 🟡 | Buzz on your own natural 20/1 | `beats` on scenes | 2 |
| S7 | Read aloud voice | 🟡 | Only inside the hosted Claude page | voice per cartridge | 3 |
| S8 | Hybrid play | 🟡 | A remote friend can join by link; no shared view | none | 2 (with S1) |
| S9 | Smart light sync | ⬜ | | scene moods | later |

### Tutorials and onboarding

| # | Feature | Status | Today | Cartridge data | Phase |
| --- | --- | --- | --- | --- | --- |
| T1 | Prologue scene | ⬜ | A one-time nudge | `prologue` | 5 |
| T2 | Just in time tips | 🟡 | First-roll nudge only | none | 5 |
| T3 | Tap any game word | ⬜ | | `glossary` | 5 |
| T4 | "What's happening?" | ⬜ | | scene `summary` | 1 (with P3) |
| T5 | Table manners card | ⬜ | | none | 5 |
| T6 | First table cartridge for new DMs | ⬜ | | a cartridge | 5 |
| T7 | Coach mode | 🟡 | Tips on the cover | `coach` notes on scenes | 5 |
| T8 | Five skill micro lessons | ⬜ | | none | 5 |

### Cartridge ecosystem

| # | Feature | Status | Today | Phase |
| --- | --- | --- | --- | --- |
| C1 | Written cartridge spec | ✅ | README "Make a new scenario"; adventure spec at the top of `adventure.js` | done (v2 in 1) |
| C2 | Scaffold and validator | ✅ | `npm run new-scenario`, `npm run validate` | done |
| C3 | Label | 🟡 | see D1 | 1 |
| C4 | Chapters, scenes, branches, flags, endings | ✅ | `flow`, `flags`, `versions` | done |
| C5 | Cast with voice, motive, secret | ✅ | `bible.people` | done |
| C6 | Characters: archetypes, quiz, ready-made heroes | ✅ | hooks missing (P9) | done |
| C7 | Assets: maps, handouts, items | 🟡 | Pictures only | 1–2 |
| C8 | Rules profile (rules light, or open 5e) | ⬜ | One built-in rule set | 2 |
| C9 | Cartridge builder | ⬜ | Command line only | 6 |
| C10 | Series carryover | ⬜ | | 4 |
| C11 | Occasion cartridges | 🟡 | North Pole | ongoing |
| C12 | Marketplace, subscription, credits | ⬜ | `access` and `sku` fields exist, unused | 6 |
| C13 | 5e licence attribution (SRD 5.2, CC BY 4.0) | ⬜ | Tavern Night uses SRD class names with no credit | 1 |

### Safety, accessibility, trust

| # | Feature | Status | Today | Phase |
| --- | --- | --- | --- | --- |
| A1 | Lines and veils on phones | ⬜ | | 5 |
| A2 | Digital X card | ⬜ | | 5 |
| A3 | Content rating per cartridge and table | ⬜ | | 1 (label), 3 (AI respects it) |
| A4 | Image safeguards | 🟡 | The provider's own moderation; friendly errors | 3 |
| A5 | Family mode | 🚫 | Not a children's product (owner, 20 Nov). Reopen only if that changes | — |
| A6 | Large text, high contrast, screen reader labels | 🟡 | Contrast measured; focus handled in dialogs; results announced; no text-size option | 5 |
| A7 | Colour-blind safe dice and status | 🟡 | Flat dice ink always readable; not checked for colour-only signals | 5 |
| A8 | Haptics as an alternative to sound; read aloud | 🟡 | Haptics on big moments | 5 |
| A9 | One-handed play, dyslexia-friendly font | ⬜ | | 5 |
| A10 | DM in the loop for anything AI writes | ✅ | AI text goes to the DM, who chooses what to show | done |
| A11 | Minimal data; "delete my character" | 🟡 | Guest only; DM can remove a player or end the table; no self-delete | 1 |

### Technical UX

| # | Feature | Status | Today | Phase |
| --- | --- | --- | --- | --- |
| X1 | Pre-made art for planned scenes; placeholder while painting | ✅ | Cartridge ships scene art | done |
| X2 | Character consistency across images | 🟡 | see P11 | 3 |
| X3 | Weak wifi: reconnect without losing progress | 🟡 | Reconnecting pill, retries, table state on the server | 1 |
| X4 | Keep screens awake; push for roll requests | ⬜ | | 1 |
| X5 | AI cost caps | 🟡 | Per table; no site-wide ceiling (G1) | 3 |
| X6 | AI grounded in cartridge facts | ✅ | Bible, flags and log go into every prompt | done |
| X7 | One source of truth for state | ✅ | The table object on the server | done |
| X8 | Numbers from day one: time to first roll, creation drop-off, action-card share, "They did what?" presses | ⬜ | | 1 |

---

## Part 3. Checkpoints (when the owner tests)

Big changes land between checkpoints; at each one the owner plays through the front end.

| Checkpoint | When | Status |
| --- | --- | --- |
| C0 | After the rebuild fixes | ✅ Owner tested 21 Nov on laptop and phone: "looks great". Committed and pushed the same day |
| C1 | End of Phase 1, the guided loop | ⬜ |
| C2 | End of Phase 2, big screen and character ties | ⬜ |
| C3 | End of Phase 3, the copilot | ⬜ |
| C4 | End of Phases 4 and 5 | ⬜ |
| C5 | End of Phase 6, the store | ⬜ |
