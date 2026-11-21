# Guided D&D App: Feature Ideas

Nov 21, 2026 · @Keith

## Design principles

Get a brand new player from join code to first dice roll in under 10 minutes, with the rules hidden and the story up front. Six principles keep every feature below honest.

1. **Time to first roll under 10 minutes.** Every screen before the story starts has to earn its place. Track this number in analytics from day one.
2. **Intent first, rules second.** Players say what they want to do. The app turns that into the right check, and rules show up only when someone asks.
3. **The phone is a companion, not the table.** Eyes belong on each other and the DM. The phone buzzes when it matters and stays quiet otherwise.
4. **DM superpowers, not DM homework.** Anything a DM would prep by hand (names, art, recaps, read aloud text) ships in the cartridge or appears on demand.
5. **Progressive disclosure.** Beginners see three buttons; curious players can open the full sheet. Research on intergenerational D&D tables found groups lean on gradual rules introduction, visual aids, and a session zero ([DiGRA 2026](https://dl.digra.org/index.php/dl/article/view/3127)).
6. **Rules light core, 5e optional.** Keep one simple resolution (a d20 plus a bonus against a target number). Let a cartridge map to the open 5e rules only when it wants more depth.

## The concept today

The current concept already covers the core loop, so everything after this section is additive.

| Mode | What it does today |
| --- | --- |
| Player | Joins a table with a DM code, picks a cartridge, builds a character through a personality test, generates a portrait, follows the story, and rolls using suggested ideas or DM guided checks |
| DM | Runs pre curated cartridges chapter by chapter with read aloud text, backgrounds, and character sheets; pushes images and text to every phone; generates scene images with the party in them |
| AI copilot | Takes what the players actually did, suggests how to describe the scene and what comes next, and rewrites upcoming chapters so the story ties back |

## Player mode features

The biggest player wins are a join with no friction, a creation flow that ends with a party who already know each other, and an action screen that turns "what do I do?" into tappable choices.

### Joining a table

- **QR code plus a short room code.** The DM screen shows a QR code that opens the table directly; a four letter code works when someone can only hear it called across the room.
- **Guest play, account later.** No sign up to play. Offer to save the character at the end of the night.
- **Rejoin and late join.** A dead phone or a late friend rejoins with the same code and lands in the current scene with a three line "story so far."
- **"Just give me a hero" button.** One tap picks a ready made character from the cartridge for anyone who arrives late or wants to skip the quiz.
- **Lobby with party preview.** Players see who has joined and what they are building, so the party balances itself (a protector, a sneak, a talker) without anyone knowing class names.

### Character creation

- **Strengths in plain words.** Show quiz results as three sentences ("You can talk your way out of almost anything") instead of numbers.
- **Role cards instead of classes.** Offer five or six archetypes (Protector, Trickster, Mystic, Scout, Healer, Face) described by what they do in the story; map them to 5e classes behind the scenes only if the cartridge uses 5e.
- **Party bonds.** After creation, each player answers one prompt about another player's character ("Why do you owe Mira a favor?"). The table starts with relationships and roleplay hooks.
- **Personal hook from the cartridge.** The quiz ends with one backstory hook tied to the plot, such as a missing sibling in the starting town. The DM sees every hook.
- **Art style lock.** Every portrait uses the cartridge's art style so the party looks like one world. Offer three variations, a reroll, and quick tweak chips (hair, armor, mood).
- **Likeness anchor.** Save the chosen portrait as a reference so later scene images keep the same face and outfit.
- **Name and voice helper.** A setting appropriate name generator plus a one line "how you talk" prompt (gruff, flowery, nervous) helps shy players start speaking in character.
- **Character card.** The finished character becomes a shareable card: portrait, name, three strengths, one flaw, one secret.

### During play

- **Story feed.** A scrolling timeline of scene images, DM messages, and key moments so anyone can glance back.
- **"What can I do?" action cards.** Suggestions drawn from the current scene and the character's strengths ("Sneak past the guards", "Bluff your way in"). Tapping one proposes it to the DM.
- **Intent box.** Typed or spoken: "I swing from the chandelier." The app suggests the check and sends it to the DM, so the player never needs a skill name.
- **Roll request flow.** When the DM asks for a roll, the phone buzzes, explains what is being rolled and why, and shows one big dice button. Results read as story ("You catch the ledge, barely").
- **Dice moments.** Animated dice, haptics, and a special effect on a natural 20 or a 1. Players with real dice can type in their number.
- **Advantage made visual.** Show it as rolling two dice and keeping the better one, with no jargon.
- **Health as states.** Hearts or a simple bar labeled fine, hurt, or in trouble instead of hit point math.
- **Items and abilities as cards.** Each has a one line plain description and a "use" button that pings the DM.
- **Secret messages and handouts.** The DM can send one player a private note ("You notice something the others don't"), an item, or a letter. Secrets create table chatter.
- **Quest board and clues.** Pinned goals and discovered clues, updated by the DM or by chapter progress, so the current objective is never a mystery.
- **Who's who.** An NPC gallery with portrait, name, and one line memory ("the innkeeper who lied about the cellar").
- **Notes.** Free notes plus "pin to notes" on any story feed item.
- **Ask the rules.** A private help button that answers "what does this mean?" in plain language, scoped to the cartridge rules.
- **Party vote.** A quick vote when the group splits on a choice (left tunnel or right tunnel), visible to the DM.
- **Hero tokens.** The DM awards a token for great roleplay and the player spends it on a reroll. It teaches that roleplay is rewarded.
- **Reactions.** Light emoji reactions on scene images and moments, which later feed the recap highlights.

### After the session

- **Auto recap.** A "previously on" summary with key images on every phone, the kind of recap tools like [Archivist](https://myarchivist.ai/dnd-session-recap) generate for traditional tables.
- **Comic strip highlights.** The night's scene images and most reacted moments become a shareable four to six panel comic.
- **Character keepsake.** A final card with portrait, notable deeds, and badges earned ("Talked down a dragon").
- **Stars and wishes.** Each player names one thing they loved and one thing they want next time ([StartPlaying safety tools](https://intercom.help/startplaying/en/articles/8719199-safety-tools)). It feeds the DM and the cartridge author.
- **Continue later.** Save table state so the group can pick up chapter three next week with the same characters.

## DM mode features

The DM side should feel like a teleprompter with a copilot: it always shows what to say next, what the players can see, and what to do when they go off script.

### Before the session

- **Cartridge labels.** Session length, player count, DM difficulty, tone, content flags, and age rating on every cartridge card.
- **Ten minute DM brief.** One page on what the story is about, the three key NPCs, and how it can end, plus a short audio version for the drive over.
- **Session zero in two minutes.** A built in tone check plus anonymous lines and veils that players fill in on their phones before play (see Safety).
- **Table setup.** Create the table, show the QR code, see who joined, and assign ready made characters to latecomers.
- **Rehearsal mode.** Run chapter one alone with AI playing the party, so a first time DM can practice before friends arrive.

### Running the table

- **Scene cards.** Each scene shows read aloud text, what is here, likely player actions with suggested checks, and the exits to the next scene.
- **Chapter map with branches.** A visual of chapters and where the party is; branches light up as story flags are set.
- **Preview before push.** See exactly what players will see, then push an image, sound, or message to everyone or to one player.
- **Roll requests.** Ask one or all players for a check with a reason, keep the target number hidden, and watch results arrive live.
- **Spotlight tracker.** Shows who has acted recently and who has gone quiet, so the DM can invite everyone in.
- **Pacing clock.** Time left against chapters left, with suggestions on what to compress ("Skip the bridge encounter and still reach the ending").
- **Instant NPC.** One tap gives a name, look, voice tip, and motive when players talk to someone unplanned; the NPC lands in the player gallery automatically.
- **Light combat tracker.** Turn order, enemy health as states, and suggested enemy moves in plain words. Optional, never required.
- **Difficulty dial.** Make an encounter easier or harder on the fly with concrete suggested changes.
- **Scene image presets and queue.** Presets such as dramatic reveal, aftermath, or NPC close up; renders queue in the background so the DM keeps talking.
- **Soundscapes.** Ambient beds (tavern, storm, cave) and music per scene. [Alchemy RPG](https://startplaying.games/blog/virtual-table-tops/the-new-players-guide-to-alchemy-rpg) built its whole platform around scene art, motion effects, ambient sound, and music.
- **Unsend.** Pull back an image or message pushed by mistake.

### AI copilot

- **"They did what?" button.** The DM types or speaks what happened; the copilot returns three options: go with it, add a complication, or steer back toward the plot.
- **Consequence ledger.** The copilot tracks promises, enemies made, items taken, and lies told, then surfaces them later ("The guard you bribed is on duty again").
- **Rewrite with a diff.** Before it changes upcoming chapters, the copilot shows what changed, what stayed, and which key clues are still undiscovered. The DM approves.
- **Clue safety net.** When the party misses a clue the ending depends on, suggest two other places it could surface.
- **Describe this.** One tap sensory description (sight, sound, smell) of the current location in the cartridge's voice.
- **Push to talk.** Voice input so the DM never types mid scene. An opt in listening mode could transcribe the session, with every player's consent.
- **Rules whisper.** "How do I handle climbing this wall?" answered in one sentence with a suggested ruling.
- **Tone guardrails.** Suggestions and generated images respect the table's lines and veils and the cartridge rating.

### After the session

- **DM notes.** What happened, flags set, open threads, and a suggested opener for next time.
- **Save state.** Resume the same cartridge next session.
- **Author feedback.** Where tables went off script and how long chapters ran, so cartridges improve over time.

## Shared table experience

A shared big screen is the cheapest immersion upgrade: phones hold private information, and the TV shows the world.

- **TV cast mode.** Cast the current scene image, map reveals, and dice results to a TV through a browser link or screen casting. Phones become each player's private hand.
- **Group dice moments.** Everyone's rolls appear on the big screen with names; a natural 20 gets a full screen effect.
- **Map reveal.** Simple illustrated maps the DM uncovers as the party explores. Not a tactical grid.
- **Active character spotlight.** The acting character's portrait fills the screen on their turn, the way [Alchemy RPG](https://startplaying.games/blog/virtual-table-tops/the-new-players-guide-to-alchemy-rpg) puts the active character front and center in fights.
- **Tap to reveal.** The DM holds an image face down on every phone so the whole table flips it at once.
- **Haptic beats.** A buzz on thunder, a critical hit, or a monster reveal, synced across phones.
- **Read aloud voice.** Optional text to speech narration for nervous DMs; [Friends & Fables](https://www.fables.gg/) already voices its narrator and characters.
- **Hybrid play.** A remote friend joins by link, sees the TV feed, and plays from their own phone.
- **Smart light sync (later).** Room lights shift with the scene: red for danger, warm for the tavern.

## Tutorials and onboarding

Teach by playing, not reading: both tutorials should be short playable scenes rather than walkthrough screens.

### Player tutorial

- **Prologue scene (three to five minutes).** A tiny solo scene during character creation: make one choice, roll once, see both success and failure. It teaches the whole loop.
- **Just in time tips.** The first roll request shows a one line tip explaining it, then never again.
- **Tap any game word.** Words like DC, advantage, or check are underlined; a tap gives a plain definition.
- **"What's happening?" button.** Two sentence recap of the current scene for anyone who drifted.
- **Table manners card.** Four tips: say what your character does, build on others' ideas, failing is fun, ask the DM anything.

### DM tutorial

- **First table cartridge.** A purpose built one shot of about an hour, with coaching prompts inside the scene cards ("Now ask a player what their character does").
- **Coach mode toggle.** Extra prompts on how to ask for a roll, pick a difficulty, say yes, and handle a player who wants to do something odd. Experienced DMs turn it off.
- **Five skill micro lessons.** Sixty second cards or videos on describe, ask, roll, consequence, move on.
- **Rehearsal with AI players.** Practice chapter one before the real table (see DM mode).

## Cartridge ecosystem

Treat cartridges as a content format with a written spec, so you, partners, and eventually the community can produce them.

| Cartridge part | What it holds |
| --- | --- |
| Label | Length, player count, tone, age rating, content flags, DM difficulty, art style |
| Chapters and scenes | Read aloud text, images, sound, likely actions with checks, branches, story flags |
| Cast | NPCs with portrait, voice tip, motive, and secret |
| Characters | Archetypes, quiz mapping, ready made heroes, personal backstory hooks |
| Assets | Maps, handouts, items |
| Rules profile | Rules light core, or a mapping to the open 5e rules |
| Endings | Ending variants and epilogue text |

- **Labels that set expectations.** "90 minutes, 3 to 5 players, first time DM friendly, spooky not scary."
- **Cartridge builder.** An authoring tool where AI drafts outline, then chapters, then scenes, with a playtest preview.
- **Series carryover.** Characters move into the next cartridge in a series with their deeds intact.
- **Occasion cartridges.** Halloween, holidays, birthday parties, and team building nights.
- **Marketplace (later).** Partner or community cartridges with ratings.
- **Licensing note.** The 5e System Reference Document 5.2 is under Creative Commons CC BY 4.0, which Wizards of the Coast cannot revoke, and attribution is the only requirement ([D&D Beyond SRD page](https://dndbeyond.com/srd)). That makes an optional 5e profile safe to build on; keep D&D trademarks and anything not in the SRD out, and confirm with counsel.

## Safety, accessibility, and trust

Tables of strangers and first timers need safety tools more than veteran groups do, and phones can make those tools anonymous and quick.

### Safety

- **Lines and veils on phones.** Lines are hard limits; veils are topics that can exist but stay off screen ([StartPlaying](https://intercom.help/startplaying/en/articles/8719199-safety-tools)). Collect them anonymously before play, show the DM the combined list, and feed it to the AI as constraints.
- **Digital X card.** A tap signals that content should be changed, rewound, or skipped with no explanation needed; the DM gets a quiet alert.
- **Content rating per cartridge and per table.** Image generation and copilot suggestions both respect it.
- **Image safeguards.** Filters on portrait and scene generation. If players can upload a selfie for their portrait, get consent and avoid keeping the raw photo.
- **Family mode.** Gentler content and no open chat. If children under 13 might use the app in the US, check COPPA obligations early.

### Accessibility

- Large text, high contrast, and screen reader labels on dice and results.
- Color blind safe dice and status colors.
- Haptics as an alternative to sound, and read aloud for the story feed.
- One handed play and a dyslexia friendly font option.

### Trust

- **DM in the loop.** Nothing the AI writes reaches players until the DM approves it.
- **Minimal data.** Guest mode by default, and a clear "delete my character" option.

## Technical UX considerations

Image generation wait times and character consistency will make or break immersion, so design around them from day one.

| Risk at the table | How to design around it |
| --- | --- |
| A scene image takes long enough to stall the moment | Ship pre made art for planned scenes; start party composites in the background once the party is locked; show a "the scene takes shape" placeholder with ambient text; queue renders |
| Characters look different in every image | Store each portrait as a reference plus a short visual description; regenerate one character without redoing the scene |
| Weak wifi at game night | Keep table state on the DM device; reconnect without losing progress; send small images first |
| Phones sleep mid session | Keep screens awake during play; use push notifications for roll requests and secrets |
| AI cost per table grows with use | Cap generations per session, cache repeats, and price by table or session |
| The AI drifts from the story | Ground it in cartridge facts and the consequence ledger; DM approval before anything reaches players |
| Two people change state at once | The DM device is the source of truth; player actions arrive as proposals |

Instrument a few numbers from the first playtest: time to first roll, drop off during character creation, share of actions that start from action cards, and how often DMs press "They did what?".

## What comparable products do today

Most AI tools either replace the DM or help with prep and notes; few help a human DM run an in person table live, which is your opening.

| Product | What it does | What it means for you |
| --- | --- | --- |
| [Friends & Fables](https://www.fables.gg/) | AI game master with memory, automatic tracking of inventory and HP, image generation, parties of up to six, text to speech narration, 5e style tactical combat | AI replaces the DM there; keeping a human DM at a physical table is a real differentiator |
| [Alchemy RPG](https://startplaying.games/blog/virtual-table-tops/the-new-players-guide-to-alchemy-rpg) | Scene based tabletop built on evocative art, motion effects, ambient sound, and music; the active character goes front and center in fights | Scene first presentation and audio are proven immersion levers worth borrowing |
| [Archivist AI](https://myarchivist.ai/dnd-session-recap) | Turns session audio, transcripts, or notes into recaps, timelines, and tracked characters, places, and quests | DMs value automatic recaps and continuity; build them in rather than leaving them to another tool |
| [D&D Beyond Sigil](https://www.dndbeyond.com/posts/2086-closing-the-chapter-on-sigil-and-thanking-the) | Wizards of the Coast's 3D virtual tabletop; development ended in October 2025 and servers shut down at the end of October 2026 | Many comments on the shutdown post said it felt too much like a video game; lean on imagination and the people at the table |

Two research notes back the fast start goal. A [Konvoy industry report](https://www.konvoy.vc/content/unlocking-role-play-for-the-masses) names finding a group, finding a GM, and learning long rulebooks as the main barriers to entry. The [DiGRA 2026 paper](https://dl.digra.org/index.php/dl/article/view/3127) points to uneven rules literacy and familiarity as the constraint at mixed tables.

### Sources

- [Friends & Fables home page](https://www.fables.gg/)
- [The New Player's Guide to Alchemy RPG (StartPlaying)](https://startplaying.games/blog/virtual-table-tops/the-new-players-guide-to-alchemy-rpg)
- [Archivist D&D session recap](https://myarchivist.ai/dnd-session-recap)
- [Closing the chapter on Sigil (D&D Beyond)](https://www.dndbeyond.com/posts/2086-closing-the-chapter-on-sigil-and-thanking-the)
- [System Reference Document 5.2.1 (D&D Beyond)](https://dndbeyond.com/srd)
- [Safety tools (StartPlaying help center)](https://intercom.help/startplaying/en/articles/8719199-safety-tools)
- [Unlocking role play for the masses (Konvoy)](https://www.konvoy.vc/content/unlocking-role-play-for-the-masses)
- [Rolling Together: Intergenerational D&D, Onboarding, and Infrastructures of Care (DiGRA 2026)](https://dl.digra.org/index.php/dl/article/view/3127)

## Prioritized roadmap

Build the fast start loop first: it is what makes a first session feel easy, and every later feature leans on it.

&#91;embedded content: feature roadmap · 3 phases\]

Now covers joining, acting, rolling, and the DM's off script safety net; Next adds the big screen and deeper character ties; Later turns cartridges into a platform.
