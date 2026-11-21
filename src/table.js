/* First Roll: the shared table. A DM opens a table and gets a four-letter code; players join
   it from their own phones. Players' characters and dice reach the DM, and whatever the DM shows
   (a note, a picture) reaches every player. Needs the hosted app: the Worker keeps the tables (worker.js, server/).

   This file is the device's side of that: FR.table, which the screens (and src/dm.js) talk to, and
   the player's own pieces of it: the dialog for joining or changing table, the handouts, and the
   plain words for losing a seat. */
(function () {
  'use strict';
  var A = FR.app, $ = A.$, tx = A.tx;
  var KEY = 'firstroll.table', KEPT_ROLLS = 80;
  var T = { can: false, passcode: false, code: '', token: '', role: '', id: '', name: '', scenario: '', portrait: '', last: 0, seen: 0, players: [], feed: [], rolls: [], lastRoll: 0, polled: false };
  var timer = 0, sentPortrait = '', sentChar = '', sentSave = '', listeners = [], enders = [];
  /* `epoch` goes up every time this device sits down or gets up, so an answer that comes back for a
     table it has since left is ignored. `flying` is the epoch of the poll in the air, if any. */
  var epoch = 0, flying = -1, fails = 0, holdUntil = 0;
  var invite = '';                                // the table code in the address (?t=CODE), if this device came by a link
  var seatWas = null;                             // whose hero the seat held, and which picture, when this device sat down
  var whoIs = function (c) { return c ? [c.name, c.race, c.cls].join('|') : ''; };

  function stored() { try { return JSON.parse(A.store.get(KEY) || 'null'); } catch (e) { return null; } }
  function keep() { A.store.set(KEY, JSON.stringify({ code: T.code, token: T.token, role: T.role, id: T.id, name: T.name, seen: T.seen, scenario: T.scenario })); }
  /* Get up from the table. What is remembered on this device is wiped only if it is the seat this tab
     was using: with two tabs open, the other one may have sat down again since, and its seat is not ours to clear. */
  function forget() {
    var k = stored();
    if (!k || !k.token || k.token === T.token) { A.store.set(KEY, ''); }
    T.code = ''; T.token = ''; T.role = ''; T.id = ''; T.name = ''; T.scenario = ''; T.portrait = ''; T.last = 0; T.seen = 0; T.players = []; T.feed = []; T.rolls = []; T.lastRoll = 0; T.polled = false;
    epoch++; fails = 0; holdUntil = 0; seatWas = null; clearInterval(timer); sentPortrait = ''; sentChar = ''; sentSave = ''; changed();
  }
  /* Sit down: everything about the last table is put away before the new one is taken up. */
  function seat(j, role, name) {
    epoch++; fails = 0; holdUntil = 0;
    T.code = j.code; T.token = j.token; T.role = role; T.id = j.id || ''; T.name = role === 'player' ? (j.name || name || '') : ''; T.scenario = j.scenario || ''; T.portrait = j.portrait || '';
    T.last = 0; T.seen = 0; T.players = []; T.feed = []; T.rolls = []; T.lastRoll = 0; T.polled = false;
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
  var playersSig = function () { return T.players.length + ':' + T.players.map(function (p) { return p.id + p.name + p.portrait + (p.char ? p.char.name + p.char.cls : ''); }).join('|'); };
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
    if (!T.code || document.hidden || flying === epoch || Date.now() < holdUntil) { return; }       // one poll at a time: a slow answer is waited for, not overtaken
    var ep = epoch, first = !T.polled;
    flying = ep;
    post('state', { after: T.last, afterRoll: T.lastRoll }).then(function (j) {
      if (flying === ep) { flying = -1; }
      if (ep !== epoch) { return; }
      var was = reconnecting(), before = playersSig(), held = T.feed.length ? T.feed[T.feed.length - 1].n : 0, scen = T.scenario;
      fails = 0; T.polled = true;
      T.players = j.players || [];
      if (j.scenario) { T.scenario = j.scenario; }
      /* anything this device already holds is dropped, so nothing is ever shown twice */
      var fresh = (j.feed || []).filter(function (f) { return f && f.n > held; });
      fresh.forEach(function (f) { T.feed.push(f); });
      T.last = Math.max(T.last, Number(j.last) || 0, T.feed.length ? T.feed[T.feed.length - 1].n : 0);
      /* the first answer after sitting down carries the last few rolls: that is history, not news */
      var rolls = (j.rolls || []).filter(function (r) { return r && r.n > T.lastRoll; }).map(function (r) {
        return { n: r.n, id: r.id, name: r.name, role: r.role, label: r.label, kind: r.kind, total: r.total, nat: r.nat, detail: r.detail, dice: r.dice || [], at: r.at, mine: r.id === j.you, old: first };
      });
      rolls.forEach(function (r) { T.rolls.push(r); T.lastRoll = Math.max(T.lastRoll, r.n); });
      T.lastRoll = Math.max(T.lastRoll, Number(j.lastRoll) || 0);
      if (T.rolls.length > KEPT_ROLLS) { T.rolls = T.rolls.slice(-KEPT_ROLLS); }
      if (scen !== T.scenario) { keep(); }
      if (fresh.length || rolls.length || before !== playersSig() || was || scen !== T.scenario || first) { changed(); }
      rolls.forEach(herald);
      if (fresh.length && T.role === 'player' && fresh[fresh.length - 1].n > T.seen) { show(T.feed.length - 1, true); }
      if (T.role === 'player') {
        var me = T.players.filter(function (p) { return p.id === T.id; })[0];
        T.portrait = me ? me.portrait || '' : T.portrait;
        if (first) { seatWas = me && me.char && me.portrait ? { who: whoIs(me.char), portrait: me.portrait } : null; }
        fit();
        if (first) { sync(); }                      // now that the seat's own picture is known, anything held back can be sent
        borrow();
      }
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
    if (!body.char && body.portrait === undefined && !body.clearPortrait && !body.save) { return; }
    post('me', body).then(function (j) {
      if (ep !== epoch) { return; }
      if (body.save) { sentSave = blob; }
      if (body.char) { sentChar = sig; }
      T.portrait = (j && j.portrait) || '';
      if (body.portrait !== undefined) { sentPortrait = sigOf(pic); A.portraitAt(T.portrait); }
      if (body.clearPortrait) { sentPortrait = 'none'; }
    }).catch(function () { /* next sync will try again */ });
  }

  /* handouts: what the DM has shown the table */
  var at = 0;
  function show(i, chime) {
    if (!T.feed.length) { return; }
    at = Math.max(0, Math.min(T.feed.length - 1, i));
    var f = T.feed[at], img = $('ho-img');
    img.hidden = !f.img; if (f.img) { img.src = f.img; img.alt = f.title || tx('handoutPic'); }
    $('ho-title').textContent = f.title || (f.img ? '' : tx('handoutNote')); $('ho-title').hidden = !$('ho-title').textContent;
    $('ho-text').textContent = f.text || ''; $('ho-text').hidden = !f.text;
    $('ho-count').textContent = tx('countOf', { i: at + 1, n: T.feed.length });
    $('ho-prev').disabled = at === 0; $('ho-next').disabled = at === T.feed.length - 1;
    $('ho-nav').hidden = T.feed.length < 2;
    $('handout').hidden = false;
    T.seen = Math.max(T.seen, f.n); keep(); inbox();
    if (chime && FR.Dice && FR.Dice.Sound) { FR.Dice.Sound.unlock(); FR.sfx('arrive'); }      // the scenario's own "something has arrived" sound
  }
  /* the play screen's corner of the table: which table, and an envelope with a count for what the DM has sent */
  function inbox() {
    var b = $('pl-inbox'), badge = $('pl-badge'), chip = $('pl-table'), mine = T.role === 'player' && !!T.code;
    if (!b || !chip) { return; }
    var unread = T.feed.filter(function (f) { return f.n > T.seen; }).length;
    b.hidden = !(mine && T.feed.length);
    b.setAttribute('aria-label', unread ? tx('fromDMNew', { n: unread }) : tx('fromDM')); b.title = tx('fromDM');
    badge.hidden = !unread; badge.textContent = unread > 9 ? '9+' : String(unread);
    chip.hidden = T.role === 'dm' || !(mine || T.can); chip.textContent = mine ? tx('tableChip', { code: T.code }) : tx('joinTable');
  }
  $('ho-ok').addEventListener('click', function () { $('handout').hidden = true; });
  $('ho-prev').addEventListener('click', function () { show(at - 1); });
  $('ho-next').addEventListener('click', function () { show(at + 1); });
  $('pl-inbox').addEventListener('click', function () { show(T.feed.length - 1); });

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

  /* ---------- the table dialog: join one, move to another, or leave ----------
     It always asks who is sitting down. The name is the person's, not their hero's, and it is how
     they get their seat back later, so it is never guessed. */
  function switcher(code) {
    var mine = T.role === 'player' && !!T.code, want = typeof code === 'string' ? code : (mine ? '' : invite), name = mine ? T.name : A.player();
    $('sw-title').textContent = mine ? tx('atTable', { code: T.code }) : (want ? tx('invited', { code: want }) : tx('tableJoinTitle'));
    $('sw-who').hidden = !(mine && T.name); $('sw-who').textContent = mine && T.name ? tx('seatedAs', { name: T.name }) : '';
    $('sw-dm').hidden = mine;
    $('sw-lbl').textContent = mine ? tx('tableCodeOther') : tx('tableCode');
    $('sw-join').textContent = mine ? tx('switchThis') : tx('joinThis');
    $('sw-leave').hidden = !mine; $('sw-leave').textContent = tx('leaveThis');
    $('sw-name').value = name; $('sw-code').value = want; $('sw-err').hidden = true;
    $('switch').hidden = false; (name && !want ? $('sw-code') : (name ? $('sw-join') : $('sw-name'))).focus();
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
  $('sw-leave').addEventListener('click', function () { forget(); $('switch').hidden = true; });
  $('sw-x').addEventListener('click', function () { $('switch').hidden = true; });
  $('switch').addEventListener('click', function (e) { if (e.target === $('switch')) { $('switch').hidden = true; } });

  /* ---------- losing a seat, said plainly ----------
     The server's own sentence is shown as it is. For a seat taken on another device there is a way
     to take it back; for the rest, a word that the hero is still here. The DM's screens say their own piece (src/dm.js). */
  enders.push(function (info) {
    if (info.role !== 'player') { return; }
    ['handout', 'switch', 'back'].forEach(function (id) { $(id).hidden = true; });
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
  function send(item) { return post('send', item); }
  function stash(dataUrl) { return post('keep', { image: dataUrl }).then(function (j) { return j.url; }); }
  /* the DM takes a seat away; the list of players comes straight back */
  function kick(id) { return post('kick', { id: id }).then(function (j) { if (j && j.players) { T.players = j.players; changed(); } return j; }); }
  /* the DM ends the table for everyone. This device gets up without being told it was thrown out. */
  function close() { return post('close', {}).then(function (j) { forget(); return j; }); }

  /* ---------- dice everyone can see ---------- */
  var KINDS = { check: 'check', save: 'save', attack: 'attack', damage: 'damage', init: 'init', free: 'free', extra: 'extra', table: 'extra' };
  /* Tell the table what was just rolled. Never in the way of the game: if it cannot be sent
     (no table, or it still cannot be sent after a few tries) the roll simply stays on this phone. */
  function roll(entry) {
    var e = entry || {};
    if (!T.code || !Number.isInteger(e.total)) { return Promise.resolve(null); }
    var dice = (e.dice || []).slice(0, 8).map(function (d) { return { sides: d.sides, value: d.value }; });
    var body = { label: String(e.label || '').slice(0, 60), kind: KINDS[e.kind] || 'free', total: e.total, nat: e.nat === 20 || e.nat === 1 ? e.nat : 0, detail: String(e.detail || '').slice(0, 80), dice: dice };
    /* No signal for a moment, or the table asked us to wait: keep the roll and try again a few times
       (for about three quarters of a minute) while this phone is still at the same table. */
    var at = epoch, waits = [3000, 6000, 12000, 24000];
    var send = function (i) {
      return post('roll', body).then(function (j) { tick(); return j; }, function (x) {
        var st = x && x.status;
        if (i < waits.length && at === epoch && T.code && (!st || st === 429 || st >= 500)) {
          return new Promise(function (ok) { setTimeout(ok, st === 429 && x.reason === 'slow' ? 1200 : waits[i]); }).then(function () { return send(i + 1); });
        }
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
    var k = stored();
    if (k && k.code && k.token) { T.code = k.code; T.token = k.token; T.role = k.role; T.id = k.id || ''; T.name = k.name || ''; T.seen = k.seen || 0; T.scenario = k.scenario || ''; epoch++; start(); }
    changed();
    fit();
    /* a table link (?t=CODE): say so on the first screen, and ask who is sitting down */
    if (invite && T.role !== 'dm' && invite !== T.code && A.screen() === 'title') { switcher(invite); }
  }

  FR.table = {
    ready: ready, join: join, sync: sync, welcome: welcome, open: open, send: send, stash: stash, leave: forget, show: show,
    roll: roll, kick: kick, close: close, switcher: switcher, tookPortrait: tookPortrait,
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
    /* the link a DM hands out: the table and the scenario it is playing */
    link: function () { return location.origin + location.pathname + '?t=' + T.code + '&s=' + encodeURIComponent(T.scenario || FR.theme.id); },
    onChange: function (fn) { listeners.push(fn); },
    /* fn({ reason: 'moved' | 'removed' | 'closed' | 'gone', name, code, role, message }) when this device loses its table */
    onEnd: function (fn) { enders.push(fn); }
  };
})();
