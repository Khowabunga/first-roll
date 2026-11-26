/* First Roll: the shared table. A DM opens a table and gets a four-letter code; players join
   it from their own phones. Players' characters and dice reach the DM, and whatever the DM shows
   (a note, a picture) reaches every player. Needs the hosted app: the Worker keeps the tables (worker.js, server/).

   This file is the device's side of that: FR.table, which the screens (and src/dm.js) talk to, and
   the player's own pieces of it: the dialog for joining or changing table (which is also where a
   seated player sees who else is here), the story screen that holds everything the DM has shown,
   and the plain words for losing a seat. */
(function () {
  'use strict';
  var A = FR.app, $ = A.$, tx = A.tx, el = A.el, clear = A.clear;
  var KEY = 'firstroll.table', KEPT_ROLLS = 80;
  var T = { can: false, passcode: false, code: '', token: '', role: '', id: '', name: '', scenario: '', portrait: '', last: 0, seen: 0, players: [], feed: [], rolls: [], lastRoll: 0, polled: false,
    /* the guided loop: the scene the DM last published (and its number), what has been proposed (a player's own, or for the
       DM everyone's), the rolls the DM has asked for, and the numbers of feed items the DM took back */
    scene: null, sceneN: 0, asks: [], requests: [], pulled: [],
    /* the shared table (docs/PHASE2.md): what the whole table is shown (the stage), the vote on the table, the marks people
       have left on things, the number below which a reset has cleared everything, the server's clock against this device's,
       and for the DM when the story session was last saved to the table and whether a big screen has a key */
    stage: null, stageN: 0, votes: [], reacts: {}, reacted: {}, floor: 0, skew: 0, sessionAt: 0, screenOn: false,
    /* the kind of hero (race and class) this seat's bond was made by, so a bond does not outlive its hero */
    bondBy: '' };
  var timer = 0, sentPortrait = '', sentChar = '', sentSave = '', listeners = [], enders = [], wipers = [];
  /* the hero's stake in the story, as the table was last told it (null until the table has said what the seat holds) */
  var sentVoice = null, sentHook = null, hookSig = function (h) { return h ? h.id + '|' + h.text : ''; };
  /* `epoch` goes up every time this device sits down or gets up, so an answer that comes back for a
     table it has since left is ignored. `flying` is the epoch of the poll in the air, if any. */
  var epoch = 0, flying = -1, fails = 0, holdUntil = 0;
  /* `again`: a poll was wanted while one was in the air, so another follows as soon as it lands.
     `acted` goes up whenever this device changes the proposals or the roll requests itself: a poll
     that set off before that knows less than we do, so its lists are not taken. */
  var again = false, acted = 0;
  var unguided = function () { T.scene = null; T.sceneN = 0; T.asks = []; T.requests = []; T.pulled = []; again = false;
    T.stage = null; T.stageN = 0; T.votes = []; T.reacts = {}; T.reacted = {}; T.floor = 0; T.sessionAt = 0; T.screenOn = false; T.bondBy = ''; sentHook = null; sentVoice = null; };
  var invite = '';                                // the table code in the address (?t=CODE), if this device came by a link
  var seatWas = null;                             // whose hero the seat held, and which picture, when this device sat down
  var whoIs = function (c) { return c ? [c.name, c.race, c.cls].join('|') : ''; };

  function stored() { try { return JSON.parse(A.store.get(KEY) || 'null'); } catch (e) { return null; } }
  function keep() { if (T.role === 'screen') { return; } A.store.set(KEY, JSON.stringify({ code: T.code, token: T.token, role: T.role, id: T.id, name: T.name, seen: T.seen, scenario: T.scenario, floor: T.floor, bondBy: T.bondBy })); }
  /* Get up from the table. What is remembered on this device is wiped only if it is the seat this tab
     was using: with two tabs open, the other one may have sat down again since, and its seat is not ours to clear. */
  function forget() {
    var k = stored();
    if (T.role !== 'screen' && (!k || !k.token || k.token === T.token)) { A.store.set(KEY, ''); }
    T.code = ''; T.token = ''; T.role = ''; T.id = ''; T.name = ''; T.scenario = ''; T.portrait = ''; T.last = 0; T.seen = 0; T.players = []; T.feed = []; T.rolls = []; T.lastRoll = 0; T.polled = false;
    unguided(); scenes = []; notes = []; draft = ''; catchUp = false;
    epoch++; fails = 0; holdUntil = 0; seatWas = null; clearInterval(timer); sentPortrait = ''; sentChar = ''; sentSave = ''; changed();
  }
  /* Sit down: everything about the last table is put away before the new one is taken up. */
  function seat(j, role, name) {
    epoch++; fails = 0; holdUntil = 0;
    T.code = j.code; T.token = j.token; T.role = role; T.id = j.id || ''; T.name = role === 'player' ? (j.name || name || '') : ''; T.scenario = j.scenario || ''; T.portrait = j.portrait || '';
    T.last = 0; T.seen = 0; T.players = []; T.feed = []; T.rolls = []; T.lastRoll = 0; T.polled = false;
    unguided(); loadScenes(); loadNotes();
    catchUp = role === 'player';                  // sitting down afresh: if the story is already under way, show where it has got to (see landed)
    sentPortrait = ''; sentChar = ''; sentSave = ''; seatWas = null;          // a new table has not met this character yet
    keep(); start(); changed();
  }
  /* Why the server will not talk to this device about its table any more, or '' if it still will.
     A code or token nobody knows is a bare 404; the others say so in `reason`. */
  function ending(e) {
    if (!e) { return ''; }
    if (e.status === 410 && (!e.reason || e.reason === 'closed')) { return 'closed'; }
    if (e.status === 409 && (e.reason === 'moved' || e.reason === 'removed')) { return e.reason; }
    if (e.status === 404 && !e.reason) { return 'gone'; }
    return '';
  }
  /* This device has lost its table: stop asking at once (every further try would count against
     everyone on this network), forget the seat, and tell whoever wants to say so on screen. */
  function end(reason, e) {
    var info = { reason: reason, name: (e && e.data && e.data.name) || T.name, code: T.code, role: T.role, message: (e && e.message) || '' };
    if ((reason === 'closed' || reason === 'gone') && invite === T.code) { invite = ''; }      // the link in the address leads nowhere now: stop offering it
    forget();
    enders.forEach(function (fn) { try { fn(info); } catch (x) { /* keep going */ } });
  }
  function post(act, body) {
    var b = { code: T.code, token: T.token }, ep = epoch;
    Object.keys(body || {}).forEach(function (k) { b[k] = body[k]; });
    return A.fetchJson('api/table/' + act + '?c=' + T.code, b, 25000).catch(function (e) {
      var why = ending(e);
      if (why && ep === epoch) { end(why, e); }
      throw e;
    });
  }
  function changed() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* keep going */ } }); inbox(); net(); }
  /* three polls in a row with no answer: say so, quietly, until one gets through */
  function reconnecting() { return !!T.code && fails >= 3; }
  function net() { var n = $('net'); if (!n) { return; } n.hidden = !reconnecting(); if (!n.hidden) { n.textContent = tx('reconnecting'); } }

  /* ---------- keeping in step with the server ---------- */
  /* the scene's number and the two lists, as one string: has any of it changed? */
  var guidedSig = function () { return T.sceneN + '|' + JSON.stringify(T.asks) + '|' + JSON.stringify(T.requests); };
  var playersSig = function () { return T.players.length + ':' + T.players.map(function (p) { return p.id + p.name + p.portrait + (p.char ? p.char.name + p.char.cls : '') + (p.tokens || 0) + (p.bond ? p.bond.to + p.bond.text : '') + (p.hook ? p.hook.id + p.hook.text : '') + (p.voice || ''); }).join('|'); };
  var sharedSig = function () { return T.stageN + '|' + T.floor + '|' + JSON.stringify(T.votes) + '|' + JSON.stringify(T.reacts) + '|' + JSON.stringify(T.reacted) + '|' + T.sessionAt + '|' + T.screenOn; };
  /* someone else's natural 20 or natural 1 is news for the whole table, whatever screen this device is on */
  function herald(r) {
    if (r.old || r.mine || !(r.nat === 20 || r.nat === 1) || !FR.FX) { return; }
    FR.FX.herald({ kind: r.nat === 20 ? 'crit' : 'fumble', name: r.name, label: r.label, host: $('app'), fx: FR.theme.fx, reduced: A.reduced });
  }
  /* The table owns the scenario. A player whose app is showing another one is switched over (app.js decides what happens to their hero). */
  var fitting = '';
  function fit() {
    if (T.role !== 'player' || !T.scenario || T.scenario === FR.theme.id || fitting === T.scenario || !FR.pack(T.scenario)) { return; }
    fitting = T.scenario;
    A.seated({ scenario: T.scenario }).then(function () { fitting = ''; }, function () { fitting = ''; });
  }
  function tick() {
    if (!T.code || document.hidden || Date.now() < holdUntil) { return; }
    if (flying === epoch) { again = true; return; }       // one poll at a time: a slow answer is waited for, not overtaken
    var ep = epoch, first = !T.polled, mark = acted;
    flying = ep; again = false;
    post('state', { after: T.last, afterRoll: T.lastRoll, afterScene: T.sceneN, afterStage: T.stageN }).then(function (j) {
      if (flying === ep) { flying = -1; }
      if (ep !== epoch) { return; }
      var was = reconnecting(), before = playersSig(), scen = T.scenario, guided = guidedSig(), shared = sharedSig(), wiped = false;
      /* The DM started the table's run afresh: everything numbered at or below the floor is gone, here too. */
      if (Number(j.floor) > T.floor) {
        T.floor = Number(j.floor);
        T.feed = T.feed.filter(function (f) { return f.n > T.floor; }); T.rolls = T.rolls.filter(function (r) { return r.n > T.floor; });
        T.last = Math.max(T.last, T.floor); T.lastRoll = Math.max(T.lastRoll, T.floor); T.seen = Math.max(T.seen, T.floor);
        if (T.sceneN <= T.floor) { T.scene = null; T.sceneN = T.floor; }
        scenes = []; catchUp = false; offered = {}; tale.from = T.seen;
        /* what this device remembers goes too, or a reload would bring the old story back: the trail of scenes, and
           anything pinned from the old run (a note the player wrote is theirs, and stays) */
        if (T.role === 'player') { keep(); keepScenes(); notes = FR.play.notes.own(notes); keepNotes(); }
        wiped = true;
      }
      if (typeof j.time === 'number') { T.skew = j.time - Date.now(); }
      fails = 0; T.polled = true;
      T.players = j.players || [];
      if (j.scenario) { T.scenario = j.scenario; }
      /* anything this device already holds is dropped, so nothing is ever shown twice; anything the DM
         has taken back goes from this device too */
      var merged = FR.play.feed(T.feed, j.feed, j.pulled), fresh = merged.fresh;
      T.feed = merged.feed; T.pulled = Array.isArray(j.pulled) ? j.pulled.slice() : [];
      T.last = Math.max(T.last, Number(j.last) || 0, T.feed.length ? T.feed[T.feed.length - 1].n : 0);
      /* the scene comes only when the table has a newer one than this device holds; the proposals and
         the roll requests come whole every time */
      if (j.scene && j.scene.n > T.sceneN) { T.scene = j.scene; T.sceneN = j.scene.n; if (T.role === 'player') { sceneMark(j.scene); } }
      if (first && catchUp && !(T.scene && T.scene.story.length)) { catchUp = false; }      // sat down at the start of the story: there is nothing to catch up on
      if (mark === acted) { T.asks = Array.isArray(j.asks) ? j.asks : []; T.requests = Array.isArray(j.requests) ? j.requests : []; }
      /* the stage comes only when the table has a newer one; votes and marks come whole every time */
      if (j.stage && Number(j.stageN) > T.stageN) { T.stage = j.stage; T.stageN = Number(j.stageN); }
      if (mark === acted) {
        T.votes = Array.isArray(j.votes) ? j.votes : []; T.reacts = j.reacts && typeof j.reacts === 'object' ? j.reacts : {}; T.reacted = j.reacted && typeof j.reacted === 'object' ? j.reacted : {};
      }
      if (typeof j.sessionAt === 'number') { T.sessionAt = j.sessionAt; }
      if (typeof j.screen === 'boolean') { T.screenOn = j.screen; }
      /* the first answer after sitting down carries the last few rolls: that is history, not news */
      var rolls = (j.rolls || []).filter(function (r) { return r && r.n > T.lastRoll; }).map(function (r) {
        return { n: r.n, id: r.id, name: r.name, role: r.role, label: r.label, kind: r.kind, total: r.total, nat: r.nat, detail: r.detail, dice: r.dice || [], at: r.at, mine: r.id === j.you, old: first };
      });
      rolls.forEach(function (r) { T.rolls.push(r); T.lastRoll = Math.max(T.lastRoll, r.n); });
      T.lastRoll = Math.max(T.lastRoll, Number(j.lastRoll) || 0);
      if (T.rolls.length > KEPT_ROLLS) { T.rolls = T.rolls.slice(-KEPT_ROLLS); }
      if (scen !== T.scenario) { keep(); }
      /* what is news to this player, worked out before the screens are told (an open story screen marks everything as seen) */
      var news = T.role === 'player' ? fresh.filter(function (f) { return f.n > T.seen; }) : [];
      if (wiped) { wipers.forEach(function (fn) { try { fn(); } catch (e) { /* keep going */ } }); }      // the screens put away what they still held of the old run
      if (fresh.length || merged.dropped || rolls.length || before !== playersSig() || guided !== guidedSig() || shared !== sharedSig() || was || scen !== T.scenario || first) { changed(); }
      rolls.forEach(herald);
      /* Something new from the DM: the cartridge's own "something has arrived" sound, and a count on the
         envelope. Nothing opens by itself, except a hero the DM offers, which is put straight in front of the player. */
      if (news.length) {
        if (!first && FR.Dice && FR.Dice.Sound && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { FR.Dice.Sound.unlock(); FR.sfx('arrive'); }
        news.filter(function (f) { return f.kind === 'hero' && f.hero; }).slice(-1).forEach(offer);
      }
      if (T.role === 'player') {
        landed();
        var me = T.players.filter(function (p) { return p.id === T.id; })[0];
        T.portrait = me ? me.portrait || '' : T.portrait;
        if (first) { seatWas = me && me.char && me.portrait ? { who: whoIs(me.char), portrait: me.portrait } : null; sentHook = hookSig(me ? me.hook : null); sentVoice = (me && me.voice) || ''; }
        fit();
        if (first) { sync(); }                      // now that the seat's own picture is known, anything held back can be sent
        borrow();
      }
      if (again) { tick(); }                        // something changed while this poll was in the air: ask once more, now
    }, function (e) {
      if (flying === ep) { flying = -1; }
      if (ep !== epoch) { return; }                 // the table ended (post has said so) or this device has moved on
      var was = reconnecting();
      fails++;
      if (e && e.status === 429) { holdUntil = Date.now() + 60000; fails = Math.max(fails, 3); }      // too many wrong tries from this network: leave it alone for a minute
      if (was !== reconnecting()) { changed(); }
    });
  }
  function start() { clearInterval(timer); timer = setInterval(tick, 3000); tick(); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); } });

  /* ---------- the player's side ---------- */
  /* opts.confirm: the server asked whether this name, already at the table, is the same person, and they said yes */
  function join(code, name, opts) {
    code = String(code).toUpperCase().replace(/[^A-Z]/g, '');
    var body = { code: code, name: name };
    if (opts && opts.confirm) { body.confirm = true; }
    return A.fetchJson('api/table/join?c=' + code, body, 20000).then(function (j) {
      seat(j, 'player', name);
      if (FR.Dice && FR.Dice.Sound && FR.Dice.Sound.dingdong) { FR.Dice.Sound.dingdong(); }
      return j;
    });
  }
  var sigOf = function (pic) { return pic.length + ':' + pic.slice(0, 60); };
  /* This device has no picture of its hero but the seat does (the phone lost its copy, or the picture
     was too big to keep): take the seat's. Only ever for the hero the seat already held when this
     device sat down: a picture of somebody else's hero, or of the last one, is never borrowed. */
  function borrow() {
    var c = A.character(), url = T.portrait, ep = epoch;
    if (!c || c.portrait || c.noPicture || !url || !seatWas || seatWas.portrait !== url || seatWas.who !== whoIs(c)) { return; }
    A.takePortrait(url).then(function (got) { if (got && ep === epoch) { tookPortrait(url); } });
  }
  /* the picture now on this device is the seat's own: there is nothing to send back */
  function tookPortrait(url) { var c = A.character(); if (c && c.portrait) { sentPortrait = sigOf(c.portrait); T.portrait = url; A.portraitAt(url); } }
  /* Send this player's character (and portrait, when it changes) to the table. */
  function sync() {
    if (T.role !== 'player') { return; }
    var c = A.character(); if (!c || !c.cls) { return; }
    var body = {}, sig = [c.name, c.race, c.cls, c.line, c.look].join('|'), ep = epoch;
    if (sig !== sentChar) { body.char = { name: c.name, race: c.race, cls: c.cls, line: c.line, look: c.look }; }
    /* A picture is only ever sent, never un-sent by accident: a phone that has lost its copy must not
       wipe the table's. Taking the picture away is its own message, sent only when the player chose to.
       And a picture the table already holds (this phone took it from the seat, or sent it before) is not sent again. */
    var pic = c.portrait || '', held = !!pic && !!T.portrait && (pic === T.portrait || c.portraitFrom === T.portrait);
    var unsure = !T.polled && !!c.portraitFrom;       // just sat down, and this picture came from a table: wait to hear whether this table already has it
    if (pic && !held && !unsure && sigOf(pic) !== sentPortrait) { body.portrait = pic; }
    else if (!pic && c.noPicture && T.portrait && sentPortrait !== 'none') { body.clearPortrait = true; }
    var blob = A.saveBlob();                  // the whole character stays with the seat, so it can be taken up again later or on another phone
    if (blob && blob !== sentSave && blob.length <= 20000) { body.save = blob; }
    /* The hero's stake in the story is kept with the hero on this phone; the table is told, for the DM alone. Nothing
       is said until the table has told this device what the seat holds, so nothing is ever wiped by guesswork. */
    if (T.polled && sentHook !== null && hookSig(c.hook) !== sentHook) { body.hook = c.hook ? { id: c.hook.id, text: c.hook.text } : null; }
    /* how the hero talks goes the same way: the DM's glance shows it */
    if (T.polled && sentVoice !== null && (c.voice || '') !== sentVoice) { body.voice = c.voice || ''; }
    /* A bond was made by one hero about another. When a different kind of hero takes this seat, it goes. */
    var seatNow = T.players.filter(function (p) { return p.id === T.id; })[0];
    if (T.polled && seatNow && seatNow.bond && T.bondBy && T.bondBy !== c.race + '|' + c.cls) { body.bond = null; }
    if (!body.char && body.portrait === undefined && !body.clearPortrait && !body.save && body.hook === undefined && body.bond === undefined && body.voice === undefined) { return; }
    post('me', body).then(function (j) {
      if (ep !== epoch) { return; }
      if (body.hook !== undefined) { sentHook = hookSig(body.hook); }
      if (body.voice !== undefined) { sentVoice = body.voice; }
      if (body.bond === null) { T.bondBy = ''; keep(); tick(); }
      if (body.save) { sentSave = blob; }
      if (body.char) { sentChar = sig; }
      T.portrait = (j && j.portrait) || '';
      if (body.portrait !== undefined) { sentPortrait = sigOf(pic); A.portraitAt(T.portrait); }
      if (body.clearPortrait) { sentPortrait = 'none'; }
    }).catch(function () { /* next sync will try again */ });
  }

  /* ---------- the story: where it is now, the story so far, and everything the DM has shown this seat ----------
     One screen (s-tale) in place of the old pile of handouts. Its first tab is the story: what is
     happening now, the story so far, and then one list in the order things happened: each scene the
     story reached, the DM's notes and pictures (a note sent to this seat alone says so), a hero the
     DM offers, and this seat's own rolls for the DM. Beside it, when the scene has them: the quests,
     the clues and the people met. Nothing here knows any one story: it all comes from the scene the
     DM publishes and from the table's feed. */
  var SCENES = 'firstroll.scenes', scenes = [], tale = { tab: 'story', from: 0 }, catchUp = false, offered = {};
  var mineHere = function () { return T.role === 'player' && !!T.code; };
  var unread = function () { return T.feed.filter(function (f) { return f.n > T.seen; }); };
  /* The scenes the story has been through, as this device saw them: { n, id, chapter, title, img, at, asks }.
     `at` puts a scene after everything this device already held when it arrived, so the list reads in order;
     `asks` is the last proposal made before it, so an answer to a card in an earlier scene is never shown on a
     card of this one. Kept on the device (for this table only), so a reload does not lose the order. */
  function keepScenes() { A.store.set(SCENES, JSON.stringify({ code: T.code, list: scenes.slice(-30) })); }
  function loadScenes() {
    var k = null; try { k = JSON.parse(A.store.get(SCENES) || 'null'); } catch (e) { k = null; }
    scenes = k && k.code === T.code && Array.isArray(k.list) ? k.list : [];
  }
  /* Every number a place was published under, from the one after the place before it: a phone that polls every few
     seconds does not see each one, and someone else may have left a mark on one it missed. (The newest twelve.)
     The first place a phone sees has no place before it to count from, so it goes by its own number alone. */
  function numbers(from, to) { var out = [], n; for (n = Math.max(from, to - 11); n <= to; n++) { out.push(n); } return out; }
  function sceneMark(sc) {
    var last = scenes[scenes.length - 1], when = 0, asks = 0;
    if (!sc || !(sc.title || sc.chapter || sc.img)) { return; }
    if (last && last.id === sc.id && last.title === sc.title && last.chapter === sc.chapter) {      // the same place in the story, with something new in it
      last.ns = (last.ns || [last.n]).concat(numbers(last.n + 1, sc.n)).slice(-12); last.n = sc.n; last.img = sc.img; keepScenes(); return;
    }
    T.feed.forEach(function (f) { when = Math.max(when, f.at || 0); });
    T.requests.forEach(function (q) { when = Math.max(when, q.at || 0); });
    T.asks.forEach(function (a) { asks = Math.max(asks, a.n || 0); });
    if (last) { when = Math.max(when, last.at || 0); }
    scenes.push({ n: sc.n, ns: last ? numbers(last.n + 1, sc.n) : [sc.n], id: sc.id, chapter: sc.chapter, title: sc.title, img: sc.img, at: when ? when + 1 : Date.now(), asks: asks });
    keepScenes();
  }
  /* the proposals made in the scene the story is in now (see sceneMark) */
  function asksNow() { var floor = scenes.length ? scenes[scenes.length - 1].asks || 0 : 0; return T.asks.filter(function (a) { return a.n > floor; }); }
  /* one of the cartridge's ready-made heroes, by name */
  function premade(name) {
    var want = String(name || '').trim().toLowerCase();
    return ((FR.theme && FR.theme.premades) || []).filter(function (p) { return p.name.toLowerCase() === want; })[0] || null;
  }
  /* "Take this hero": the cartridge's ready-made hero of that name becomes this player's, and they are playing */
  function takeHero(name) {
    if (!A.takeHero(name)) { return false; }
    A.toast(tx('heroNow', { name: name }));
    return true;
  }
  /* A hero the DM has just offered is put in front of the player at once: one tap takes it. */
  function offer(f) {
    var p = premade(f.hero), c = A.character() || A.saved();        // the hero in play, or the one waiting on this device
    if (!p || offered[f.n] || (c && c.name === p.name && c.cls === p.cls)) { return; }
    offered[f.n] = true;
    A.ask({ kicker: tx('heroOffer'), img: p.portrait, title: p.name, text: [p.race + ' ' + p.cls + '. ' + (FR.CLASSES[p.cls] ? FR.CLASSES[p.cls].blurb : ''), f.text || '', c ? tx('heroSwap', { name: p.name.split(' ')[0], old: c.name.split(' ')[0] }) : ''].filter(Boolean).join('\n'),
      yes: tx('heroTake'), no: tx('heroLater'), onYes: function () { answeredOffer(f); takeHero(p.name); }, onNo: function () { answeredOffer(f); } });
  }
  /* an offer the player has answered is not news any more (unless something else they have not looked at came before it) */
  function answeredOffer(f) {
    if (f.n > T.seen && unread().every(function (x) { return x.kind === 'hero' && x.n <= f.n; })) { T.seen = f.n; keep(); changed(); }
  }
  var block = function (cls, kicker) { var b = el('article', 'tl-item' + (cls ? ' ' + cls : '')); if (kicker) { b.appendChild(el('div', 'tl-k', kicker)); } return b; };
  var picture = function (src, alt) { var im = el('img', 'tl-img'); im.src = src; im.alt = alt || ''; im.loading = 'lazy'; return im; };
  /* how one of this seat's rolls for the DM went, in the story's own words (the DM's line when there is one) */
  function told(mine) {
    if (!mine) { return ''; }
    return mine.pass === null || mine.pass === undefined ? tx('reqDecide') : (mine.say || (mine.pass ? tx('reqPassed') : tx('reqFailed')));
  }
  /* ---- notes: kept on this phone, for this table alone ----
     Anything in the story can be pinned to them, and the player can write their own. They are this
     player's and nobody else's: nothing here is ever sent to the table. */
  var NOTES = 'firstroll.notes.', notes = [], draft = '';
  /* how the map is being looked at on this phone: made bigger or not, and where it has been dragged to */
  var mapView = { big: false, x: 0, y: 0 };
  function loadNotes() { notes = T.code && T.role === 'player' ? FR.play.notes.read(A.store.get(NOTES + T.code), T.code) : []; draft = ''; }
  function keepNotes() { if (T.code && T.role === 'player') { A.store.set(NOTES + T.code, FR.play.notes.write(notes, T.code)); } }
  /* copy something from the story into the notes: { from, title, text, img }. False when it was there already. */
  function pin(item) {
    var next = FR.play.notes.pin(notes, item, Date.now());
    if (next[0] === notes[0]) { return false; }
    notes = next; keepNotes();
    return true;
  }
  /* ---- marks: six small pictures anyone at the table can leave on a thing in the story ----
     Drawn here as plain line drawings, so they look the same on every phone and wear the cartridge's colours. */
  var MARK_PATH = {
    cheer: 'M4 20l4.500-11 6.500 6.500zM14.500 3v2.500M19.500 4.500l-2 2M21 10h-2.500M11.500 6.500q2 1.500 1 4',
    laugh: 'M3 12a9 9 0 1018 0 9 9 0 10-18 0M7.500 10.500q1.200-1.800 2.400 0M14.100 10.500q1.200-1.800 2.400 0M7.500 13.500h9a4.500 4.500 0 01-9 0z',
    gasp: 'M3 12a9 9 0 1018 0 9 9 0 10-18 0M8.800 9.200v1M15.200 9.200v1M10 15.500a2 2.400 0 104 0 2 2.400 0 10-4 0',
    heart: 'M12 20s-7.500-4.600-7.500-10.200A4.200 4.200 0 0112 7.600a4.200 4.200 0 017.500 2.200C19.500 15.400 12 20 12 20z',
    clap: 'M8 13V7a1.500 1.500 0 013 0v4.500m0-5a1.500 1.500 0 013 0v5m0-3.500a1.500 1.500 0 013 0V14c0 3.500-2.300 6-5.500 6-2.700 0-4.300-1.500-5.800-4.500L5.300 13a1.400 1.400 0 012.400-1.400L8 13M18 4l1-1.500M20.500 6.500L22 5.500M4 5.500L5.500 7',
    wow: 'M12 3l2.600 5.800 6.300.700-4.700 4.300 1.300 6.200L12 16.800 6.500 20l1.300-6.200L3.100 9.500l6.300-.700z'
  };
  function icon(d) {
    var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); s.appendChild(p);
    return s;
  }
  /* The row of marks under one thing: how many of each, and this seat's own filled in. A tap leaves a mark,
     the same tap again takes it off, another mark takes its place. `keys` are the names the thing goes by
     on the table (FR.play.marks). A note sent to this seat alone takes marks from this seat alone: the
     table sees to that. */
  function marksRow(keys) {
    var m = FR.play.marks(keys, T.reacts, T.reacted), row = el('div', 'ply-marks');
    var names = { cheer: tx('markCheer'), laugh: tx('markLaugh'), gasp: tx('markGasp'), heart: tx('markHeart'), clap: tx('markClap'), wow: tx('markWow') };
    row.setAttribute('role', 'group'); row.setAttribute('aria-label', tx('marksLabel'));
    FR.play.MARKS.forEach(function (k) {
      var n = m.counts[k] || 0, on = m.mine === k, b = el('button', 'ply-mark' + (n ? ' has' : '') + (on ? ' on' : ''));
      b.type = 'button'; b.title = names[k]; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', names[k] + (n ? ': ' + n : ''));
      b.setAttribute('data-fk', m.on + '|' + k);
      b.appendChild(icon(MARK_PATH[k])); if (n) { b.appendChild(el('span', '', String(n))); }
      b.addEventListener('click', function () { react(m.on, k).catch(function (e) { if (mineHere()) { A.toast(e && e.status && e.message ? e.message : tx('askFailed')); } }); });
      row.appendChild(b);
    });
    return row;
  }
  /* what sits under a thing in the story: the marks (when it can take them) and the way to keep a copy in the notes */
  function foot(keys, note) {
    var f = el('div', 'ply-foot'), has = FR.play.notes.pinned(notes, note.from), b = el('button', 'ply-pin', has ? tx('pinned') : tx('pin'));
    if (keys && keys.length) { f.appendChild(marksRow(keys)); }
    b.type = 'button'; b.disabled = has; b.setAttribute('data-fk', 'pin|' + note.from);
    b.addEventListener('click', function () { if (pin(note)) { A.toast(tx('pinDone')); taleChanged(); } });
    f.appendChild(b);
    return f;
  }
  /* the names a place in the story goes by on the table, one for each time it was published since the last fresh start */
  var sceneKeys = function (s) { return (s.ns && s.ns.length ? s.ns : [s.n]).filter(function (n) { return n > T.floor; }).map(function (n) { return 'scene:' + n; }); };
  function entry(e, fresh) {
    var f = e.item, q = e.request, s = e.scene, r = e.roll, b, p, btn, c, big;
    if (e.kind === 'scene') {
      b = block('tl-scene', tx('sceneNow'));
      if (s.img) { b.appendChild(picture(s.img, s.title)); }
      if (s.chapter && s.chapter !== s.title) { b.appendChild(el('small', 'tl-c', s.chapter)); }
      if (s.title) { b.appendChild(el('h3', 'tl-t', s.title)); }
      b.appendChild(foot(sceneKeys(s), { from: 'scene:' + s.id, title: s.title || s.chapter || '', text: s.chapter && s.chapter !== s.title ? s.chapter : '', img: s.img || '' }));
      return b;
    }
    if (e.kind === 'roll') {
      b = block('tl-roll', tx('rollYours', { label: q.label }));
      b.appendChild(el('p', 'tl-p', told(q.mine)));
      b.appendChild(el('small', 'tl-c', tx('saidRolled', { dice: q.mine.total }) + '.'));
      b.appendChild(foot(null, { from: 'req:' + q.n, title: tx('rollYours', { label: q.label }), text: told(q.mine), img: '' }));
      return b;
    }
    if (e.kind === 'nat') {
      /* a natural 20 or a natural 1, whoever rolled it: the whole table saw it, and may say what they made of it */
      big = (FR.theme.fx || {})[r.nat === 20 ? 'crit' : 'fumble'];
      c = r.mine ? tx('natYou', { n: r.nat }) : tx('natRolled', { name: r.name, n: r.nat });
      b = block('ply-nat' + (r.nat === 1 ? ' is-low' : ''), (big && big.title) || '');
      b.appendChild(el('h3', 'tl-t', c));
      if (r.label) { b.appendChild(el('p', 'tl-p', r.label)); }
      b.appendChild(foot(['roll:' + r.n], { from: 'roll:' + r.n, title: c, text: r.label || '', img: '' }));
      return b;
    }
    b = block('tl-' + e.kind + (f.to ? ' tl-own' : '') + (fresh ? ' tl-new' : ''), e.kind === 'hero' ? tx('heroOffer') : (f.to ? tx('onlyYou') : tx('fromDM')));
    if (e.kind === 'hero') {
      p = premade(f.hero); c = A.character();
      if (!p) { b.appendChild(el('p', 'tl-p', tx('heroAsk', { name: f.hero }))); }
      else {
        b.appendChild(picture(p.portrait, ''));
        b.appendChild(el('h3', 'tl-t', p.name)); b.appendChild(el('small', 'tl-c', p.race + ' ' + p.cls));
        if (!(c && c.name === p.name && c.cls === p.cls)) {
          btn = el('button', 'btn wax', tx('heroTake')); btn.type = 'button';
          btn.addEventListener('click', function () { takeHero(p.name); });
        }
      }
      if (f.text) { b.appendChild(el('p', 'tl-p', f.text)); }
      if (btn) { b.appendChild(btn); }
      b.appendChild(foot(null, { from: 'feed:' + f.n, title: p ? p.name : f.hero, text: f.text || tx('heroAsk', { name: f.hero }), img: p ? p.portrait : '' }));
      return b;
    }
    if (f.img) { b.appendChild(picture(f.img, f.title || tx('handoutPic'))); }
    if (f.title || !f.img) { b.appendChild(el('h3', 'tl-t', f.title || tx('handoutNote'))); }
    if (f.text) { b.appendChild(el('p', 'tl-p', f.text)); }
    b.appendChild(foot(['feed:' + f.n], { from: 'feed:' + f.n, title: f.title || (f.img ? tx('handoutPic') : tx('handoutNote')), text: f.text || '', img: f.img || '' }));
    return b;
  }
  /* the tabs there is anything behind: the story and the notes always, the rest when the scene or the stage has them */
  function taleTabs() {
    var sc = T.scene, st = T.stage;
    return [['story', tx('tabStory'), true], ['quests', tx('tabQuests'), !!sc && sc.quests.length > 0], ['clues', tx('tabClues'), !!sc && sc.clues.length > 0],
      ['people', tx('tabPeople'), !!sc && sc.people.length > 0], ['map', tx('tabMap'), !!st && !!st.map], ['notes', tx('tabNotes'), true]].filter(function (t) { return t[2]; });
  }
  function renderTabs() {
    var bar = $('tl-tabs'), tabs = taleTabs();
    if (!tabs.some(function (t) { return t[0] === tale.tab; })) { tale.tab = 'story'; }
    clear(bar); bar.hidden = tabs.length < 2;
    tabs.forEach(function (t) {
      var b = el('button', 'tab' + (tale.tab === t[0] ? ' on' : ''), t[1]); b.type = 'button'; b.setAttribute('aria-pressed', tale.tab === t[0] ? 'true' : 'false');
      b.addEventListener('click', function () { tale.tab = t[0]; tale.from = T.seen; renderTale(); $('tl-body').scrollTop = 0; });
      bar.appendChild(b);
      /* six tabs do not fit across a phone: the one in use is always brought into view */
      var x = b.offsetLeft - bar.offsetLeft;
      if (tale.tab === t[0] && (x < bar.scrollLeft || x + b.offsetWidth > bar.scrollLeft + bar.clientWidth)) { bar.scrollLeft = Math.max(0, x - 24); }
    });
  }
  function renderTale() {
    var sc = T.scene, body = $('tl-body'), firstNew = null;
    renderTabs();
    clear(body);
    var sec = function (title) { var s = el('section', 'tl-sec'); if (title) { s.appendChild(el('h2', 'tl-h', title)); } body.appendChild(s); return s; };
    if (tale.tab === 'quests') {
      var qs = sec(''), done = sc.quests.filter(function (q) { return q.done; }).length, ul = el('ul', 'tl-list quests');
      qs.appendChild(el('p', 'tl-c', tx('questCount', { done: done, n: sc.quests.length })));
      sc.quests.forEach(function (q) {
        var li = el('li', q.done ? 'is-done' : ''); li.appendChild(el('i')); li.appendChild(el('span', '', q.text));
        if (q.done) { li.appendChild(el('small', '', tx('questDone'))); }
        ul.appendChild(li);
      });
      qs.appendChild(ul); return;
    }
    if (tale.tab === 'clues') {
      var cl = el('ul', 'tl-list clues');
      sc.clues.forEach(function (c) { var li = el('li'); li.appendChild(el('i')); li.appendChild(el('span', '', c.text)); cl.appendChild(li); });
      sec('').appendChild(cl); return;
    }
    if (tale.tab === 'people') {
      var pl = el('div', 'here');
      sc.people.forEach(function (p) {
        var row = el('div', 'here-p'), t = el('span', 'here-t');
        if (p.img) { var im = el('img'); im.src = p.img; im.alt = ''; im.loading = 'lazy'; row.appendChild(im); } else { row.appendChild(el('span', 'here-none', p.name.charAt(0))); }
        t.appendChild(el('b', '', p.name)); if (p.line) { t.appendChild(el('span', '', p.line)); }
        row.appendChild(t); pl.appendChild(row);
      });
      sec('').appendChild(pl); return;
    }
    if (tale.tab === 'map') {
      /* The map the DM has put on the table. The picture has no lettering of its own: each place the party has
         found carries its name, and everything else lies under fog until the DM uncovers it. The places found
         are listed in words underneath as well. */
      var mp = T.stage.map, ms = sec(''), open = {}, found = [];
      mp.open.forEach(function (id) { open[id] = true; });
      if (mp.title) { ms.appendChild(el('h3', 'tl-t', mp.title)); }
      if (mp.img) {
        var wrap = el('div', 'ply-map' + (mapView.big ? ' is-big' : '')), pic = el('img'), pan = el('div', 'ply-map-pan'), zoom = el('button', 'ply-pin', mapView.big ? tx('mapSmaller') : tx('mapBigger'));
        pic.src = mp.img; pic.alt = tx('mapAlt', { title: mp.title || '' });
        wrap.appendChild(pic);
        mp.regions.forEach(function (r) {
          var box = el('div', 'ply-region ' + (open[r.id] ? 'is-open' : 'is-fog'));
          box.style.left = r.x + '%'; box.style.top = r.y + '%'; box.style.width = r.w + '%'; box.style.height = r.h + '%'; box.setAttribute('aria-hidden', 'true');
          if (open[r.id] && r.name) { box.appendChild(el('span', '', r.name)); }
          wrap.appendChild(box);
        });
        /* a map is small on a phone: it can be made bigger and dragged about, and stays where it was put when news redraws it */
        pan.appendChild(wrap); ms.appendChild(pan);
        pan.scrollLeft = mapView.x; pan.scrollTop = mapView.y;
        pan.addEventListener('scroll', function () { mapView.x = pan.scrollLeft; mapView.y = pan.scrollTop; });
        zoom.type = 'button'; zoom.setAttribute('aria-pressed', mapView.big ? 'true' : 'false'); zoom.setAttribute('data-fk', 'map|zoom');
        zoom.addEventListener('click', function () { mapView.big = !mapView.big; mapView.x = 0; mapView.y = 0; taleChanged(); });
        ms.appendChild(zoom);
      }
      mp.regions.forEach(function (r) { if (open[r.id] && r.name) { found.push(r.name); } });
      if (!found.length) { ms.appendChild(el('p', 'tl-empty', tx('mapNone'))); return; }
      var names = el('ul', 'tl-list clues');
      found.forEach(function (name) { var li = el('li'); li.appendChild(el('i')); li.appendChild(el('span', '', name)); names.appendChild(li); });
      sec(tx('mapFound')).appendChild(names); return;
    }
    if (tale.tab === 'notes') {
      /* the player's own notes: a box to write one, then every note, newest first, each with the way to delete it */
      var form = el('form', 'ply-note-form'), lab = el('label', 'guide-h', tx('noteLabel')), ta = el('textarea', 'field ply-note-in'), add = el('button', 'btn wax', tx('noteAdd'));
      form.noValidate = true; lab.setAttribute('for', 'tl-note'); ta.id = 'tl-note'; ta.rows = 3; ta.maxLength = FR.play.notes.LONG; ta.value = draft; ta.setAttribute('placeholder', tx('noteHint'));
      add.type = 'submit';
      ta.addEventListener('input', function () { draft = ta.value; });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var next = FR.play.notes.add(notes, ta.value, Date.now()), again;
        if (next[0] === notes[0]) { ta.focus(); return; }               // nothing written: nothing to keep
        notes = next; keepNotes(); draft = ''; renderTale(); inbox();
        again = $('tl-note'); if (again) { again.focus(); }
      });
      form.appendChild(lab); form.appendChild(ta); form.appendChild(add); sec('').appendChild(form);
      if (!notes.length) { sec('').appendChild(el('p', 'tl-empty', tx('notesEmpty'))); return; }
      var all = sec('');
      notes.forEach(function (n) {
        var card = block('ply-note', n.from ? tx('notePinned') : tx('noteYours')), row = el('div', 'ply-note-foot'), del = el('button', 'ply-pin is-del', tx('noteDelete'));
        var at = n.at ? new Date(n.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
        if (n.img) { card.appendChild(picture(n.img, n.title)); }
        if (n.title) { card.appendChild(el('h3', 'tl-t', n.title)); }
        if (n.text) { card.appendChild(el('p', 'tl-p', n.text)); }
        del.type = 'button'; del.setAttribute('aria-label', tx('noteDelete') + (n.title ? ': ' + n.title : ''));
        del.addEventListener('click', function () {
          A.ask({ title: tx('noteDeleteTitle'), text: (n.title || n.text).slice(0, 140), yes: tx('noteDeleteYes'), no: tx('noteKeep'), onYes: function () {
            notes = FR.play.notes.drop(notes, n.id); keepNotes(); inbox();
            if (A.screen() === 'tale') { renderTale(); }
          } });
        });
        row.appendChild(el('small', 'tl-c', at)); row.appendChild(del); card.appendChild(row);
        all.appendChild(card);
      });
      return;
    }
    /* the story: now, so far, and as it happened */
    var has = false;
    if (sc && (sc.summary || sc.title || sc.img)) {
      var now = sec(tx('happening')), here = scenes[scenes.length - 1]; has = true;
      if (sc.img) { now.appendChild(picture(sc.img, sc.title)); }
      if (sc.chapter && sc.chapter !== sc.title) { now.appendChild(el('small', 'tl-c', sc.chapter)); }
      if (sc.title) { now.appendChild(el('h3', 'tl-t', sc.title)); }
      if (sc.summary) { now.appendChild(el('p', 'tl-p', sc.summary)); }
      now.appendChild(foot(here && here.id === sc.id ? sceneKeys(here) : ['scene:' + sc.n], { from: 'scene:' + sc.id, title: sc.title || sc.chapter || '', text: sc.summary || '', img: sc.img || '' }));
    }
    if (sc && sc.story.length) {
      var far = sec(tx('soFar')); has = true;
      sc.story.forEach(function (line) { far.appendChild(el('p', 'tl-p', line)); });
    }
    /* the scene the story is in now is said above; the list below is how it got here */
    var items = FR.play.timeline(T.feed, T.requests, scenes.slice(0, -1), T.rolls);
    if (!items.length) { if (!has) { sec('').appendChild(el('p', 'tl-empty', tx('feedEmpty'))); } }
    else {
      var went = sec(has ? tx('asItWent') : '');
      items.forEach(function (e) {
        var isNew = !!e.item && e.item.n > tale.from, node = entry(e, isNew);
        if (isNew && !firstNew) { firstNew = node; }
        went.appendChild(node);
      });
    }
    return firstNew;
  }
  /* everything on the story tab has now been seen */
  function sawAll() { var last = T.feed.length ? T.feed[T.feed.length - 1].n : 0; if (last > T.seen) { T.seen = last; keep(); inbox(); } }
  /* Open the story. tab: 'story' | 'quests' | 'clues' | 'people'. where: 'new' brings the first thing
     not yet seen into view (or the newest, when all has been seen); anything else starts at the top. */
  function openTale(tab, where) {
    if (!mineHere()) { return; }
    tale.tab = tab || 'story'; tale.from = T.seen;
    A.go('tale');
    var body = $('tl-body'), first = renderTale();
    if (tale.tab === 'story') { sawAll(); }
    body.scrollTop = 0;
    if (where === 'new' && tale.tab === 'story') {
      if (first) { body.scrollTop = Math.max(0, first.offsetTop - body.offsetTop - 12); } else if (T.feed.length || T.requests.some(function (q) { return q.mine; })) { body.scrollTop = body.scrollHeight; }
    }
  }
  /* Something changed at the table while the story is open: draw it again where the reader is, with the
     focus back on whatever they had just pressed. The notes are the player's own and no news from the
     table changes them, so a note half written is never drawn over. */
  function taleChanged() {
    if (A.screen() !== 'tale') { return; }
    if (!mineHere()) { A.go(A.character() ? 'play' : 'title'); return; }
    if (tale.tab === 'notes') { renderTabs(); if (tale.tab === 'notes') { return; } }
    var body = $('tl-body'), at = body.scrollTop, end = body.scrollHeight - body.clientHeight - at < 40;
    var fk = document.activeElement && body.contains(document.activeElement) ? document.activeElement.getAttribute('data-fk') : '';
    renderTale();
    if (tale.tab === 'story') { sawAll(); }
    body.scrollTop = end ? body.scrollHeight : at;
    if (fk) {
      Array.prototype.some.call(body.querySelectorAll('[data-fk]'), function (b) {
        if (b.getAttribute('data-fk') !== fk || b.disabled) { return false; }
        try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
        return true;
      });
    }
  }
  /* Someone who sits down when the story is already under way is shown where it has got to, once,
     as soon as they have a hero and are on the play screen. */
  function landed() {
    if (!catchUp || !mineHere() || !T.scene || A.screen() !== 'play' || !A.character()) { return; }
    catchUp = false;
    openTale('story', 'top');
  }
  /* the play screen's corner of the table: which table, and an envelope with a count for what the DM has sent */
  function inbox() {
    var b = $('pl-inbox'), badge = $('pl-badge'), chip = $('pl-table'), mine = mineHere(), sc = T.scene;
    if (!b || !chip) { return; }
    var n = unread().length;
    /* the envelope is only there when there is something behind it: a table that publishes no story looks as it always did */
    b.hidden = !(mine && (T.feed.length || (sc && (sc.summary || sc.story.length)) || T.requests.some(function (q) { return q.mine; }) || (T.stage && T.stage.map)));
    b.setAttribute('aria-label', n ? tx('fromDMNew', { n: n }) : tx('taleTitle')); b.title = tx('taleTitle');
    badge.hidden = !n; badge.textContent = n > 9 ? '9+' : String(n);
    chip.hidden = T.role === 'dm' || !(mine || T.can); chip.textContent = mine ? tx('tableChip', { code: T.code }) : tx('joinTable');
  }
  $('pl-inbox').addEventListener('click', function () { openTale('story', 'new'); });
  $('tl-back').addEventListener('click', function () { A.go(A.character() ? 'play' : 'title'); });
  listeners.push(taleChanged);

  /* ---------- welcome back: the seat this name left still has a character ---------- */
  function welcome(j, otherwise) {
    var k; try { k = JSON.parse(j.save); } catch (e) { return false; }
    if (!k || !k.name || !k.cls) { return false; }
    var close = function () { $('back').hidden = true; };
    $('bk-title').textContent = tx('welcomeTitle', { name: T.name });
    $('bk-text').textContent = tx('welcomeText', { hero: k.name, race: k.race, cls: k.cls, code: T.code });
    $('bk-yes').textContent = tx('continueAs', { name: k.name.split(' ')[0] });
    $('bk-yes').onclick = function () { close(); if (!A.restore(j.save, j.portrait)) { otherwise(); } };
    $('bk-no').onclick = function () { close(); otherwise(); };
    $('back').hidden = false; $('bk-yes').focus();
    return true;
  }

  /* ---------- the table dialog: join one, see who is here, move to another, or leave ----------
     Joining always asks who is sitting down. The name is the person's, not their hero's, and it is how
     they get their seat back later, so it is never guessed. For someone already seated the dialog is
     the lobby: everyone at the table, each with a portrait and one thing they are good at; the name
     and code only come out when they ask to move to another table. */
  function renderHere() {
    var box = $('sw-here'), mine = mineHere(), t = FR.theme, roles = t.roles || {}, byId = {};
    clear(box); box.hidden = !mine || !T.players.length;
    if (box.hidden) { return; }
    box.setAttribute('aria-label', tx('whoHere'));
    box.appendChild(el('div', 'handout-k', tx('whoHere')));
    T.players.forEach(function (p) { byId[p.id] = p; });
    /* the name a hero goes by in a line about them: the hero's first name, or the player's while they have no hero */
    var short = function (p) { return String((p.char && p.char.name) || p.name).split(' ')[0]; };
    var bondLine = function (label, bond) {
      var line = el('span', 'ply-bond'); line.appendChild(el('strong', '', label)); line.appendChild(document.createTextNode([bond.prompt, bond.text].filter(Boolean).join(' ')));
      return line;
    };
    T.players.forEach(function (p) {
      var c = p.char && p.char.cls ? p.char : null, me = p.id === T.id, cls = c ? t.classes[c.cls] : null, row = el('div', 'here-p' + (me ? ' me' : '')), txt = el('span', 'here-t');
      var pic = p.portrait || (cls ? t.art.crest(c.cls) : ''), who = me ? tx('thatsYou') : tx('playedBy', { name: p.name });
      /* the job this hero does at the table, in the cartridge's plain words: it comes first, the class beneath it */
      var role = cls && cls.role && roles[cls.role] ? cls.role : '', job;
      /* one plain thing this hero is good at, for a class with no role: the cartridge's own sentence, or whatever line the seat carries */
      var good = (cls && cls.strengths && cls.strengths[0]) || (c && c.line) || '';
      if (pic) { var im = el('img', p.portrait ? '' : 'here-crest'); im.src = pic; im.alt = ''; im.loading = 'lazy'; row.appendChild(im); } else { row.appendChild(el('span', 'here-none', p.name.charAt(0).toUpperCase())); }
      txt.appendChild(el('b', '', c ? c.name || p.name : p.name));
      if (role) { job = el('span', 'ply-here-role'); job.appendChild(el('strong', '', role)); job.appendChild(document.createTextNode(roles[role].blurb ? ': ' + roles[role].blurb : '')); txt.appendChild(job); }
      txt.appendChild(el('small', '', c ? [c.race, c.cls].filter(Boolean).join(' ') + ' · ' + who : (me ? tx('thatsYou') + ' · ' : '') + tx('noHeroYet')));
      if (good && !role) { txt.appendChild(el('span', '', good)); }
      /* a bond is shown under both heroes it joins: the one who made it, and the one it is about */
      if (p.bond && byId[p.bond.to]) { txt.appendChild(bondLine(tx('bondWith', { name: short(byId[p.bond.to]) }), p.bond)); }
      T.players.forEach(function (q) { if (q.id !== p.id && q.bond && q.bond.to === p.id) { txt.appendChild(bondLine(tx('bondFrom', { name: short(q), hero: short(p) }), q.bond)); } });
      row.appendChild(txt); box.appendChild(row);
    });
    /* what the party still lacks, once somebody has a hero */
    var lack = FR.play.partyLine(roles, t.classes, T.players, { one: tx('partyMissing'), and: tx('partyAnd'), or: tx('partyOr') });
    if (lack) { box.appendChild(el('p', 'ply-missing', lack)); }
    /* a bond can be made (or changed) from here whenever another hero is at the table */
    if (A.character() && A.tieSteps && A.tieSteps().indexOf('bond') >= 0) {
      var b = el('button', 'btn ink', byId[T.id] && byId[T.id].bond ? tx('bondChange') : tx('bondAdd')); b.type = 'button';
      b.addEventListener('click', function () { $('switch').hidden = true; A.ties(['bond']); });
      box.appendChild(b);
    }
  }
  function switcher(code) {
    var mine = mineHere(), want = typeof code === 'string' ? code : (mine ? '' : invite), name = mine ? T.name : A.player();
    var moving = !mine || typeof code === 'string';       // the name and the code are on show: always for someone joining, and for someone seated who is on their way to another table
    $('sw-title').textContent = mine ? tx('atTable', { code: T.code }) : (want ? tx('invited', { code: want }) : tx('tableJoinTitle'));
    $('sw-who').hidden = !(mine && T.name); $('sw-who').textContent = mine && T.name ? tx('seatedAs', { name: T.name }) : '';
    $('sw-dm').hidden = mine;
    $('sw-lbl').textContent = mine ? tx('tableCodeOther') : tx('tableCode');
    $('sw-join').textContent = mine ? tx('switchThis') : tx('joinThis');
    $('sw-form').hidden = !moving; $('sw-move').hidden = moving;
    $('sw-leave').hidden = !mine; $('sw-leave').textContent = tx('leaveYes');
    $('sw-name').value = name; $('sw-code').value = want; $('sw-err').hidden = true;
    renderHere();
    $('switch').hidden = false; (!moving ? $('sw-x') : (name && !want ? $('sw-code') : (name ? $('sw-join') : $('sw-name')))).focus();
    if (!moving) { $('switch').querySelector('.handout-card').scrollTop = 0; }       // the lobby is read from the top: who is here, then the ways out
  }
  /* the lobby keeps in step while it is open: someone sits down, someone finishes their hero */
  listeners.push(function () { if (!$('switch').hidden) { renderHere(); } });
  /* "Leave the table": the seat is freed for good and the table forgets this player's hero (the hero
     itself stays on this phone). Said plainly first, because it cannot be taken back. */
  var leaving = false;
  function leaveAsk() {
    if (!mineHere()) { return; }
    var code = T.code;
    A.ask({ kicker: tx('endTitle', { code: code }), title: tx('leaveTitle', { code: code }), text: tx('leaveText'), yes: tx('leaveYes'), no: tx('stay'), onYes: function () {
      if (leaving || !mineHere() || T.code !== code) { return; }
      leaving = true;
      leaveSeat().then(function () { leaving = false; $('switch').hidden = true; A.toast(tx('leftTable', { code: code })); },
        function () { leaving = false; if (T.code === code) { A.toast(tx('leaveFailed')); } });       // a seat that had already gone is told by the dialog for losing a seat
    } });
  }
  var joining = false;
  /* Sit down at `code` as `name`. If that name is being played on another device right now, the
     server asks first, and so do we. */
  function sitDown(code, name, confirm) {
    var err = $('sw-err'), b = $('sw-join');
    if (joining) { return; }
    joining = true; b.disabled = true; err.hidden = true;
    join(code, name, { confirm: confirm }).then(function (j) {
      joining = false; b.disabled = false;
      A.setPlayer(j.name || name); $('switch').hidden = true;
      /* how they came in: by the QR code, by a link, or by typing the code ('.back' for a seat taken up again) */
      A.event('join', { way: (code === invite ? (/[?&]w=qr(&|$)/.test(location.search || '') ? 'qr' : 'link') : 'code') + (j.back ? '.back' : '') });
      fitting = j.scenario || '';                 // app.js is about to deal with the table's scenario: the poll need not ask again
      A.seated(j).then(function () { fitting = ''; }, function () { fitting = ''; });
    }, function (e) {
      joining = false; b.disabled = false;
      if (e && e.reason === 'name_in_use') {
        A.ask({ kicker: tx('endTitle', { code: code }), title: tx('clashTitle'), text: e.message, yes: tx('clashYes'), no: tx('clashNo'),
          onYes: function () { sitDown(code, name, true); },
          onNo: function () { if ($('switch').hidden) { switcher(code); } $('sw-name').focus(); $('sw-name').select(); } });
        return;
      }
      if ($('switch').hidden) { switcher(code); }
      err.textContent = (e && e.status && e.message) || tx('joinFailed'); err.hidden = false;
    });
  }
  function switchTo() {
    var name = $('sw-name').value.trim(), code = $('sw-code').value.trim(), err = $('sw-err');
    var say = function (m, field) { err.textContent = m; err.hidden = false; $(field).focus(); };
    err.hidden = true;
    if (!name) { say(tx('needName'), 'sw-name'); return; }
    if (code.length !== 4) { say(tx('needCode'), 'sw-code'); return; }
    if (T.role === 'player' && code === T.code) { say(tx('alreadyThere'), 'sw-code'); return; }
    sitDown(code, name, false);
  }
  $('pl-table').addEventListener('click', function () { switcher(); });
  $('sw-code').addEventListener('input', function () { $('sw-code').value = $('sw-code').value.toUpperCase().replace(/[^A-Z]/g, ''); });
  ['sw-code', 'sw-name'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); switchTo(); } }); });
  $('sw-join').addEventListener('click', switchTo);
  $('sw-leave').addEventListener('click', leaveAsk);
  $('sw-move').addEventListener('click', function () { $('sw-form').hidden = false; $('sw-move').hidden = true; $('sw-code').focus(); });
  $('sw-x').addEventListener('click', function () { $('switch').hidden = true; });
  $('switch').addEventListener('click', function (e) { if (e.target === $('switch')) { $('switch').hidden = true; } });

  /* ---------- losing a seat, said plainly ----------
     The server's own sentence is shown as it is. For a seat taken on another device there is a way
     to take it back; for the rest, a word that the hero is still here. The DM's screens say their own piece (src/dm.js). */
  enders.push(function (info) {
    if (info.role !== 'player') { return; }
    ['switch', 'back'].forEach(function (id) { $(id).hidden = true; });
    var moved = info.reason === 'moved', said = info.reason === 'gone' ? tx('endGone') : (info.message || tx('endGone'));
    A.ask({ kicker: tx('endTitle', { code: info.code }), title: said, text: moved ? '' : tx('endKeep'), yes: moved ? tx('movedYes') : tx('ok'), no: moved ? tx('movedNo') : '',
      onYes: moved ? function () { sitDown(info.code, info.name, true); } : null });
  });

  /* ---------- the DM's side ---------- */
  /* Open a new table, or with a code come back as DM to one that is already open. */
  function open(passcode, code, scenario) {
    var body = { passcode: passcode || '' };
    if (code) { body.code = String(code).toUpperCase().replace(/[^A-Z]/g, ''); }
    else { body.scenario = scenario || FR.theme.id; }             // a new table is for the scenario in play; a table that is already open keeps its own
    return A.fetchJson('api/table/open', body, 20000).then(function (j) { seat(j, 'dm'); return j; });
  }
  /* What every call below does when the table has answered: ask for the table's state again at once,
     so the screens show the change without waiting for the next poll. */
  var refresh = function (j) { tick(); return j; };
  /* Show the table a note or a picture, or offer a ready-made hero: { title, text, image, to, hero }.
     `to` is a seat id (left out, or 'all', for everyone); `hero` is the name of one of the cartridge's ready-made heroes. */
  function send(item) { return post('send', item).then(refresh); }
  /* take back something sent by mistake; resolves { removed } */
  function unsend(n) {
    return post('unsend', { n: n }).then(function (j) {
      var merged = FR.play.feed(T.feed, [], [n]);
      if (merged.dropped) { T.feed = merged.feed; changed(); }
      return refresh(j);
    });
  }
  /* the DM says where the story is; resolves { n }. scene() gives the table's own tidy copy once the next poll lands. */
  function publish(scene) { return post('scene', { scene: scene }).then(refresh); }
  /* A player suggests something: { kind: 'card' | 'intent', card, text }; resolves { n }. It is on this
     device's own list at once, waiting for the DM. */
  function propose(p) {
    var b = { kind: p && p.kind === 'card' ? 'card' : 'intent', card: String((p && p.card) || '').slice(0, 40), text: String((p && p.text) || '').slice(0, 200) };
    return post('propose', b).then(function (j) {
      if (j && j.n && !T.asks.some(function (a) { return a.n === j.n; })) {
        acted++; T.asks = T.asks.concat({ n: j.n, id: T.id, name: T.name, kind: b.kind, card: b.card, text: b.text, at: Date.now(), verdict: '', note: '' }); changed();
      }
      return refresh(j);
    });
  }
  /* the DM answers a proposal, once: verdict is 'yes', 'roll' or 'no' */
  function answer(n, verdict, note) {
    return post('answer', { n: n, verdict: verdict, note: note || '' }).then(function (j) {
      var a = T.asks.filter(function (x) { return x.n === n; })[0];
      if (a) { acted++; a.verdict = verdict; a.note = String(note || '').slice(0, 200); changed(); }
      return refresh(j);
    });
  }
  /* The DM asks for a roll: { to: 'all' | [seat ids], label, why, skill, target, yes, no }; resolves { n }. */
  function request(r) { return post('request', r || {}).then(refresh); }
  /* the DM says how one seat's roll went (needed when the request had no target) */
  function judge(n, id, pass) {
    return post('judge', { n: n, id: id, pass: pass }).then(function (j) {
      var q = T.requests.filter(function (x) { return x.n === n; })[0];
      if (q && q.results && q.results[id]) { acted++; q.results[id].pass = pass; changed(); }
      return refresh(j);
    });
  }
  /* the DM calls a request off; resolves { closed } */
  function cancel(n) {
    return post('cancel', { n: n }).then(function (j) {
      var q = T.requests.filter(function (x) { return x.n === n; })[0];
      if (q && j && j.closed && !q.closed) { acted++; q.closed = true; changed(); }
      return refresh(j);
    });
  }
  /* A player gets up for good: the seat is free at once and the table keeps nothing about them. The
     token is unknown from that moment, so this device forgets the table before it can ask again. */
  function leaveSeat() { return post('leave', {}).then(function (j) { forget(); return j; }); }

  /* ---------- the shared table (docs/PHASE2.md, sections 1 and 3) ---------- */
  /* The stage: the DM changes the named parts ({ reveal, map, sound, beat, spot, order, now }; null clears one);
     a part is replaced whole. Resolves { n }. */
  function setStage(patch) { return post('stage', { patch: patch || {} }).then(refresh); }
  /* The big screen's key: asked for by the DM, who then hands the screen its address. */
  function screenKey(fresh) { return post('screen', fresh ? { new: true } : {}).then(function (j) { T.screenOn = !!(j && j.key); changed(); return j.key || ''; }); }
  function screenOff() { return post('screen', { off: true }).then(function (j) { T.screenOn = false; changed(); return j; }); }
  function screenLink(key) { return location.origin + location.pathname + '?tv=' + T.code + '&k=' + key + '&s=' + (T.scenario || FR.theme.id); }
  /* A vote: the DM opens one ({ q, options }) and closes it; a player picks. This device's own choice shows at once. */
  function vote(v) { return post('vote', { q: v && v.q, options: v && v.options }).then(refresh); }
  function closeVote(n) { return post('vote', { n: n, close: true }).then(refresh); }
  function ballot(n, pick) {
    return post('ballot', { n: n, pick: pick }).then(function (j) {
      acted++; T.votes = T.votes.map(function (v) { return v.n === n ? Object.assign({}, v, { mine: j.mine }) : v; }); changed();
      return refresh(j);
    });
  }
  /* Hero tokens: the DM gives or takes one; a player spends one (with { request: n } the spent token also
     takes back this seat's roll for that request, so it can be rolled again). */
  function award(id, give) { return post('award', { id: id, give: give < 0 ? -1 : 1 }).then(refresh); }
  function spend(o) {
    return post('spend', { label: o && o.label, request: o && o.request }).then(function (j) {
      var q = o && Number.isInteger(o.request) ? T.requests.filter(function (x) { return x.n === o.request; })[0] : null;
      if (q && q.mine) { acted++; delete q.mine; changed(); }            // the roll was taken back: the next one for this request is the one that counts
      return refresh(j);
    });
  }
  /* A mark on something: on is 'feed:<n>', 'scene:<n>' or 'roll:<n>'; the same mark again takes it off. */
  function react(on, mark) {
    return post('react', { on: on, mark: mark }).then(function (j) {
      var was = T.reacted[on] || '', counts = Object.assign({}, T.reacts[on] || {});
      acted++;
      if (was) { counts[was] = Math.max(0, (counts[was] || 1) - 1); if (!counts[was]) { delete counts[was]; } }
      if (j.mark) { counts[j.mark] = (counts[j.mark] || 0) + 1; T.reacted[on] = j.mark; } else { delete T.reacted[on]; }
      T.reacts[on] = counts; changed();
      return refresh(j);
    });
  }
  /* The DM's story session, kept on the table so any DM device can carry on from the same place. */
  function saveSession(save, at, base) { return post('session', Object.assign({ save: String(save || ''), at: at || Date.now() }, typeof base === 'number' ? { base: base } : null)).then(function (j) { T.sessionAt = j.at || 0; return j; }); }
  function loadSession() { return post('session', { get: true }); }
  /* The DM starts the table's run afresh: seats and heroes stay, everything said and rolled goes. */
  function reset() { return post('reset', {}).then(refresh); }
  /* A player's tie to another hero, and their personal stake in the story (null clears one). */
  function tie(what) { return post('me', what || {}).then(refresh); }
  function stash(dataUrl) { return post('keep', { image: dataUrl }).then(function (j) { return j.url; }); }
  /* the DM takes a seat away; the list of players comes straight back */
  /* kick(id, true) also keeps that name from sitting down again for an hour (the answer then carries barred: true) */
  function kick(id, bar) { return post('kick', bar === true ? { id: id, bar: true } : { id: id }).then(function (j) { if (j && j.players) { T.players = j.players; changed(); } return refresh(j); }); }
  /* the DM ends the table for everyone. This device gets up without being told it was thrown out. */
  function close() { return post('close', {}).then(function (j) { forget(); return j; }); }

  /* ---------- dice everyone can see ---------- */
  var KINDS = { check: 'check', save: 'save', attack: 'attack', damage: 'damage', init: 'init', free: 'free', extra: 'extra', table: 'extra' };
  /* Tell the table what was just rolled. Never in the way of the game: if it cannot be sent
     (no table, or it still cannot be sent after a few tries) the roll simply stays on this phone
     and this resolves with null.
     entry.request = n ties the roll to a roll request the DM made. It then resolves { n, pass, say }
     (pass is null, and say '', while the DM has still to decide), and this seat's own copy of the
     request carries the result at once. A roll the table could not count for that request is still
     in the roll feed, and this rejects with the server's own { status, reason, message }: reason is
     'no_request' or 'request_closed'. A second roll for the same request resolves with the first. */
  function roll(entry) {
    var e = entry || {}, asked = Number.isInteger(e.request);
    if (!T.code || !Number.isInteger(e.total)) { return Promise.resolve(null); }
    var dice = (e.dice || []).slice(0, 8).map(function (d) { return { sides: d.sides, value: d.value }; });
    var body = { label: String(e.label || '').slice(0, 60), kind: KINDS[e.kind] || 'free', total: e.total, nat: e.nat === 20 || e.nat === 1 ? e.nat : 0, detail: String(e.detail || '').slice(0, 80), dice: dice };
    if (asked) { body.request = e.request; }
    /* this seat's result, written on its own copy of the request so the screens need not wait for the next poll */
    var took = function (r) {
      var q = T.requests.filter(function (x) { return x.n === e.request; })[0];
      if (q && r && !q.mine) { acted++; q.mine = { total: r.total, nat: r.nat, pass: r.pass, say: r.say || '' }; changed(); }
    };
    /* No signal for a moment, or the table asked us to wait: keep the roll and try again a few times
       (for about three quarters of a minute) while this phone is still at the same table. */
    var at = epoch, waits = [3000, 6000, 12000, 24000];
    var send = function (i) {
      return post('roll', body).then(function (j) {
        if (asked && j) { took({ total: body.total, nat: body.nat, pass: j.pass === undefined ? null : j.pass, say: j.say }); }
        tick(); return j;
      }, function (x) {
        var st = x && x.status, mine = x && x.data && x.data.mine;
        if (i < waits.length && at === epoch && T.code && (!st || st === 429 || st >= 500)) {
          return new Promise(function (ok) { setTimeout(ok, st === 429 && x.reason === 'slow' ? 1200 : waits[i]); }).then(function () { return send(i + 1); });
        }
        if (asked && st === 409 && x.reason === 'answered' && mine) { took(mine); tick(); return { n: x.data.n, pass: mine.pass, say: mine.say || '' }; }      // the first roll stands
        if (asked && st === 409 && (x.reason === 'no_request' || x.reason === 'request_closed')) { tick(); throw x; }
        return null;
      });
    };
    return send(0);
  }

  /* ---------- waking up ---------- */
  function ready(info) {
    T.can = !!(info && info.tables); T.passcode = !!(info && info.passcode);
    var q = /[?&]t=([A-Za-z]{4})(?![A-Za-z])/.exec(location.search || '');
    invite = q && T.can ? q[1].toUpperCase() : '';
    if (!T.can) { changed(); return; }
    var tv = /[?&]tv=([A-Za-z]{4})(?![A-Za-z])/.exec(location.search || ''), key = /[?&]k=([0-9a-f]{16,64})(?![0-9a-f])/.exec(location.search || '');
    if (tv && key) {                               // nothing is read from or written to what this browser remembers
      invite = ''; T.code = tv[1].toUpperCase(); T.token = key[1]; T.role = 'screen'; T.id = ''; T.name = '';
      epoch++; start(); changed();
      return;
    }
    var k = stored();
    if (k && k.code && k.token) { T.code = k.code; T.token = k.token; T.role = k.role; T.id = k.id || ''; T.name = k.name || ''; T.seen = k.seen || 0; T.scenario = k.scenario || ''; T.floor = Number(k.floor) || 0; T.bondBy = k.bondBy || ''; loadScenes(); loadNotes(); epoch++; start(); }
    changed();
    fit();
    /* a table link (?t=CODE): say so on the first screen, and ask who is sitting down */
    if (invite && T.role !== 'dm' && invite !== T.code && A.screen() === 'title') { switcher(invite); }
  }

  FR.table = {
    ready: ready, join: join, sync: sync, welcome: welcome, open: open, send: send, stash: stash, leave: forget,
    /* open the story screen at the newest thing the DM has shown (it was once a dialog of its own) */
    show: function () { openTale('story', 'new'); },
    roll: roll, kick: kick, close: close, switcher: switcher, tookPortrait: tookPortrait,
    /* ---- the guided loop (docs/PHASE1.md, section 3). Every call resolves with the server's answer, or
       rejects with an Error carrying its { status, reason, message }; every change they make, and every
       change a poll brings, is told to the onChange listeners. ---- */
    /* the scene the DM last published: { n, id, chapter, title, summary, img, cards, quests, clues, people, story }, or null */
    scene: function () { return T.scene; },
    publish: publish, unsend: unsend,
    /* Proposals, oldest first: { n, id, name, kind, card, text, at, verdict, note }. A player's own last
       five; for the DM, every one still waiting and the last ten answered. */
    propose: propose, asks: function () { return T.asks.slice(); }, answer: answer,
    /* Roll requests, oldest first. For the DM, each in full: { n, to, label, why, skill, target, yes, no, at,
       closed, results }. For a player, those asked of this seat: { n, label, why, skill, at, closed }, with
       mine: { total, nat, pass, say } once this seat has rolled. */
    request: request, requests: function () { return T.requests.slice(); }, judge: judge, cancel: cancel,
    leaveSeat: leaveSeat,
    /* ---- the shared table (docs/PHASE2.md, section 3) ---- */
    /* the stage the whole table is shown: { reveal, map, sound, beat, spot, order, now }, or null before the DM sets one */
    stage: function () { return T.stage; }, setStage: setStage,
    /* a beat is worth playing only if it is new to this device and recent by the server's own clock */
    serverNow: function () { return Date.now() + T.skew; },
    screenKey: screenKey, screenOff: screenOff, screenLink: screenLink, hasScreen: function () { return T.screenOn; },
    /* this page is the big screen (opened as ?tv=CODE&k=KEY): it only watches */
    isScreen: function () { return T.role === 'screen' && !!T.code; },
    /* the vote on the table, if any: [{ n, q, options, open, mine, counts? }] (players see counts only once it is closed) */
    votes: function () { return T.votes.slice(); }, vote: vote, closeVote: closeVote, ballot: ballot,
    award: award, spend: spend,
    /* marks on things: reacts() is { '<on>': { mark: count } }, reacted() this device's own { '<on>': mark } */
    react: react, reacts: function () { return T.reacts; }, reacted: function () { return T.reacted; },
    saveSession: saveSession, loadSession: loadSession, sessionAt: function () { return T.sessionAt; },
    reset: reset, floor: function () { return T.floor; },
    /* A bond is remembered with the kind of hero that made it, so it can be taken away when another hero takes the seat.
       A stake set here is not sent a second time by sync. */
    setBond: function (bond) { var c = A.character(); T.bondBy = bond && c ? c.race + '|' + c.cls : ''; keep(); return tie({ bond: bond }); },
    setHook: function (hook) { sentHook = hookSig(hook); return tie({ hook: hook }); },
    /* fn() when the DM starts the table's run afresh, after this device has dropped the old story: the screens put away whatever else they held of it */
    onReset: function (fn) { wipers.push(fn); },
    /* the player's own notes on this phone: copy something from the story into them ({ from, title, text, img }; false when it is there already), and ask whether something is */
    pin: function (item) { var done = mineHere() && pin(item); if (done) { inbox(); taleChanged(); } return done; },
    pinned: function (from) { return FR.play.notes.pinned(notes, from); },
    notes: function () { return notes.slice(); },
    /* this device's own seat id ('' for the DM, or at no table) */
    id: function () { return T.id; },
    /* ---- for the player's screens (src/app.js) ---- */
    /* what the DM has sent that this player has not looked at yet, oldest first */
    unread: function () { return mineHere() ? unread() : []; },
    /* this seat's proposals made in the scene the story is in now */
    asksNow: function () { return mineHere() ? asksNow() : []; },
    /* open the story: tale('story' | 'quests' | 'clues' | 'people' | 'map' | 'notes', 'new' | 'top') */
    tale: openTale,
    /* the player has just reached the play screen: a latecomer is shown where the story has got to */
    landed: landed,
    /* "Leave the table": asks first, then frees the seat (leaveSeat) */
    leaveAsk: leaveAsk,
    /* tell the screens to draw themselves again (something they show arrived by another road, such as the QR code maker) */
    nudge: function () { changed(); },
    can: function () { return T.can; }, needsPasscode: function () { return T.passcode; },
    active: function () { return !!T.code; }, isDM: function () { return T.role === 'dm' && !!T.code; }, isPlayer: function () { return T.role === 'player' && !!T.code; },
    code: function () { return T.code; }, players: function () { return T.players; }, feed: function () { return T.feed; },
    /* the name this device is seated under ('' for the DM, or at no table) */
    name: function () { return T.name; },
    /* the table's scenario id ('' when this device is at no table) */
    scenario: function () { return T.scenario; },
    /* the table this device was invited to by its link and has not joined ('' if none) */
    invite: function () { return invite && invite !== T.code && T.role !== 'dm' ? invite : ''; },
    /* every roll seen so far, oldest first: { n, id, name, role, label, kind, total, nat, detail, dice, at, mine, old }.
       `old` marks the history that was already there when this device sat down. */
    rolls: function () { return T.rolls.slice(); },
    reconnecting: reconnecting,
    cred: function () { return T.code ? { code: T.code, token: T.token } : {}; },
    /* the link a DM hands out: the table and the scenario it is playing. link('qr') is the same address
       marked as the one inside the QR code, so the site can count how people came in. */
    link: function (way) { return location.origin + location.pathname + '?t=' + T.code + '&s=' + encodeURIComponent(T.scenario || FR.theme.id) + (way === 'qr' ? '&w=qr' : ''); },
    onChange: function (fn) { listeners.push(fn); },
    /* fn({ reason: 'moved' | 'removed' | 'closed' | 'gone', name, code, role, message }) when this device loses its table */
    onEnd: function (fn) { enders.push(fn); }
  };
})();
