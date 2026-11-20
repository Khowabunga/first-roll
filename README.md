# First Roll

A beginner's D&D companion for phones. Twelve questions pick your class and race, OpenAI paints
the portrait, and physically simulated dice do the rest. It ships with two themes, chosen on the
title screen: North Pole (the default) and Tavern Night.

The North Pole theme also has a DM side. The DM opens a **table** and gets a four-letter code.
Players type the code on their own phones. From then on the DM can send everyone a note or a
picture, and can have a scene, or the thing that just happened, painted with the players' own
characters in it.

## Put it online (so phones can reach it)

### Cloudflare (recommended: free, and it never goes to sleep)

The site runs as one Cloudflare Worker (`worker.js`). Each table is a small Durable Object, which
is where the players, handouts and painted pictures are kept. `wrangler.jsonc` describes all of it.

With this folder in a GitHub repository:

1. In the Cloudflare dashboard go to **Workers & Pages > Create application**, choose **GitHub**,
   pick the repository, then **Save and Deploy**. Leave the build command empty and the deploy
   command as `npx wrangler deploy`. The Worker must be named `first-roll`.
2. Open the new Worker, then **Settings > Variables and Secrets > Add**. Add two, both of type
   **Secret**, then **Deploy**:
   - `OPENAI_API_KEY`: your OpenAI key. It stays on Cloudflare and never reaches a phone.
   - `DM_PASSCODE`: any word you like. You type it at the DM's door to open a table.
3. Your address is shown on the Worker's page, in the form `first-roll.<your-name>.workers.dev`.
   That is the address everyone opens. Every later push to GitHub redeploys by itself.

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

- Until both secrets are set the site works but shows sample pictures, and tables are off.
- Only someone with the passcode can open a table, and only people sitting at a table can use
  your OpenAI key. Each table is capped at 150 pictures and each player at 6 portraits.
- A table is cleared away thirty days after its last activity, so a campaign keeps one code.
- A player who joins again under the same name, in a later session or on another phone, gets
  their seat and their character back. Anyone at the table who types that name takes the seat,
  so this suits friends and family, not strangers.
- The free plan allows 100,000 requests a day. Each open phone checks in every three seconds, so
  a DM and five players use about 22,000 in a three-hour game.

### Any Node host (Render, Fly.io, Railway, your own machine)

`server.js` does the same job as the Worker for hosts that run Node. `render.yaml` and a
`Dockerfile` are included. Set the same two values, `OPENAI_API_KEY` and `DM_PASSCODE`, as
environment variables. Here tables live in the server's memory, so a restart ends them, and
Render's free plan sleeps after fifteen quiet minutes.

## Game night

1. DM: open the address, tap **I am the DM**, type the passcode. You get a four-letter code and a square to scan.
2. Players: open the same address (or scan the square), tap **Begin**, type a name and the code.
3. DM: tap the table button at the top right at any time to see who has joined and to send a note
   or a photo. In the story, look for **Show the table** under pictures, **Paint the scene** above
   the text box, and **Paint this** next to anything that just happened.

## Run it on your own computer

Needs Node 18 or newer.

```bash
cp .env.example .env
```

Put your OpenAI key in `.env`, then:

```bash
node server.js
```

Open http://localhost:8787. Without a key the app still runs and shows sample portraits.
Phones on the same Wi-Fi can join at `http://<your computer's address>:8787`.

## Where things are

- `worker.js` and `wrangler.jsonc` are the Cloudflare version of the server: it serves the app, makes the OpenAI calls and keeps the tables. The key never reaches the browser.
- `server.js` is the same thing for plain Node.
- `public/` is the website itself: the built page plus `img/` (all the art) and `vendor/` (three.js, cannon.js, the QR code maker).
- `src/data.js` holds the matching maths and the Tavern Night theme (questions, classes, races, copy).
- `src/theme-northpole.js` is the North Pole theme. Copy it to add another theme.
- `src/story-cookie.js` is the DM's adventure, "The Great Cookie Calamity": cast, places, chapters, read-aloud text and outcomes.
- `src/dm.js` is the DM's side: the session feed, the dictionary, the AI story helper, the painter and the table controls.
- `src/table.js` is the players' link to the DM's table: joining, sending their character, receiving notes and pictures.
- `src/dice.js` is the dice: three.js for drawing, cannon.js for physics, Web Audio for the clinks.
- `src/app.js`, `src/styles.css`, `src/index.html` are the screens.
- `node build.js` rebuilds `public/index.html` after you edit anything in `src/`. Commit the rebuilt file with your change.
- `node test/table.js http://localhost:8787/ <passcode>` plays a DM and two players against a running server (needs Playwright).

## Music and sound

Sound effects are made in the browser, so they need no files. Music is ordinary MP3 files in
`public/audio/`, listed per scene (intro, game, fight) in each theme's `music` entry. Players
switch music and sound effects on or off separately from the speaker button.

The North Pole music is by Kevin MacLeod (incompetech.com), licensed under Creative Commons:
By Attribution 3.0 (https://creativecommons.org/licenses/by/3.0/), re-encoded here at 128 kbps:
"We Wish You a Merry Christmas", "Jingle Bells (Calm)", "Dance of the Sugar Plum Fairies",
"Oh, Christmas Tree", "Sugar Plum Breakdown" and "Sugar Plum Dark Mix". The same credit is shown
in the app on the Music and sound sheet; keep it there if you keep the music.
