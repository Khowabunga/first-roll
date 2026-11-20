/* First Roll: the shared table. A DM opens a table and gets a four-letter code; players join
   it from their own phones. Players' characters reach the DM, and whatever the DM shows
   (a note, a picture) reaches every player. Needs the hosted app: server.js keeps the tables. */
(function () {
  'use strict';
  var A = FR.app, $ = A.$, el = A.el, clear = A.clear;
  var KEY = 'firstroll.table';
  var T = { can: false, passcode: false, code: '', token: '', role: '', id: '', name: '', last: 0, seen: 0, players: [], feed: [] };
  var timer = 0, sentPortrait = '', sentChar = '', sentSave = '', listeners = [];

  function keep() { A.store.set(KEY, JSON.stringify({ code: T.code, token: T.token, role: T.role, id: T.id, name: T.name, seen: T.seen })); }
  function forget() { T.code = ''; T.token = ''; T.role = ''; T.id = ''; T.name = ''; T.last = 0; T.seen = 0; T.players = []; T.feed = []; A.store.set(KEY, ''); clearInterval(timer); sentPortrait = ''; sentChar = ''; sentSave = ''; changed(); }
  function post(act, body) { var b = { code: T.code, token: T.token }; Object.keys(body || {}).forEach(function (k) { b[k] = body[k]; }); return A.fetchJson('api/table/' + act + '?c=' + T.code, b, 25000); }
  function changed() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* keep going */ } }); inbox(); }

  /* ---------- keeping in step with the server ---------- */
  function tick() {
    if (!T.code || document.hidden) { return; }
    post('state', { after: T.last }).then(function (j) {
      var fresh = j.feed || [], before = T.players.length + ':' + T.players.map(function (p) { return p.portrait + (p.char ? p.char.name : ''); }).join('|');
      T.players = j.players || []; T.last = j.last;
      fresh.forEach(function (f) { T.feed.push(f); });
      var after = T.players.length + ':' + T.players.map(function (p) { return p.portrait + (p.char ? p.char.name : ''); }).join('|');
      if (fresh.length || before !== after) { changed(); }
      if (fresh.length && T.role === 'player' && fresh[fresh.length - 1].n > T.seen) { show(T.feed.length - 1, true); }
    }).catch(function (e) { if (e && (e.status === 403 || e.status === 404)) { forget(); } });
  }
  function start() { clearInterval(timer); timer = setInterval(tick, 3000); tick(); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); } });

  /* ---------- the player's side ---------- */
  function join(code, name) {
    code = String(code).toUpperCase().replace(/[^A-Z]/g, '');
    return A.fetchJson('api/table/join?c=' + code, { code: code, name: name }, 20000).then(function (j) {
      T.code = j.code; T.token = j.token; T.id = j.id; T.role = 'player'; T.name = j.name || name; T.last = 0; T.seen = 0; T.players = []; T.feed = [];
      sentPortrait = ''; sentChar = ''; sentSave = '';          // a new table has not met this character yet
      keep(); start(); changed(); if (FR.Dice && FR.Dice.Sound && FR.Dice.Sound.dingdong) { FR.Dice.Sound.dingdong(); } return j;
    });
  }
  /* Send this player's character (and portrait, when it changes) to the table. */
  function sync() {
    if (T.role !== 'player') { return; }
    var c = A.character(); if (!c || !c.cls) { return; }
    var body = {}, sig = [c.name, c.race, c.cls, c.line, c.look].join('|');
    if (sig !== sentChar) { body.char = { name: c.name, race: c.race, cls: c.cls, line: c.line, look: c.look }; }
    var pic = c.portrait || '';
    if (pic.length + ':' + pic.slice(0, 60) !== sentPortrait) { body.portrait = pic; }
    var blob = A.saveBlob();                  // the whole character stays with the seat, so it can be taken up again later or on another phone
    if (blob && blob !== sentSave && blob.length <= 20000) { body.save = blob; }
    if (!body.char && body.portrait === undefined && !body.save) { return; }
    post('me', body).then(function () { if (body.save) { sentSave = blob; } if (body.char) { sentChar = sig; } if (body.portrait !== undefined) { sentPortrait = pic.length + ':' + pic.slice(0, 60); } }).catch(function () { /* next sync will try again */ });
  }

  /* handouts: what the DM has shown the table */
  var at = 0;
  function show(i, chime) {
    if (!T.feed.length) { return; }
    at = Math.max(0, Math.min(T.feed.length - 1, i));
    var f = T.feed[at], img = $('ho-img');
    img.hidden = !f.img; if (f.img) { img.src = f.img; img.alt = f.title || 'A picture from your DM'; }
    $('ho-title').textContent = f.title || (f.img ? '' : 'A note from your DM'); $('ho-title').hidden = !$('ho-title').textContent;
    $('ho-text').textContent = f.text || ''; $('ho-text').hidden = !f.text;
    $('ho-count').textContent = (at + 1) + ' of ' + T.feed.length;
    $('ho-prev').disabled = at === 0; $('ho-next').disabled = at === T.feed.length - 1;
    $('ho-nav').hidden = T.feed.length < 2;
    $('handout').hidden = false;
    T.seen = Math.max(T.seen, f.n); keep(); inbox();
    if (chime && FR.Dice && FR.Dice.Sound) { FR.Dice.Sound.unlock(); if (FR.theme && FR.theme.id === 'northpole') { FR.Dice.Sound.jingle(); } else { FR.Dice.Sound.chime(true); } }
  }
  function inbox() {
    var b = $('pl-inbox'); if (!b) { return; }
    b.hidden = !(T.role === 'player' && T.feed.length);
    var unread = T.feed.filter(function (f) { return f.n > T.seen; }).length;
    b.textContent = unread ? 'From your DM (' + unread + ' new)' : 'From your DM';
    var chip = $('pl-table'), mine = T.role === 'player' && !!T.code;
    if (chip) { chip.hidden = T.role === 'dm' || !(mine || T.can); chip.textContent = mine ? 'Table ' + T.code + ' · Change' : 'Join a table'; }
  }
  $('ho-ok').addEventListener('click', function () { $('handout').hidden = true; });
  $('ho-prev').addEventListener('click', function () { show(at - 1); });
  $('ho-next').addEventListener('click', function () { show(at + 1); });
  $('pl-inbox').addEventListener('click', function () { show(T.feed.length - 1); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('handout').hidden) { $('handout').hidden = true; } });

  /* ---------- welcome back: the seat this name left still has a character ---------- */
  function welcome(j, fresh) {
    var k; try { k = JSON.parse(j.save); } catch (e) { return false; }
    if (!k || !k.name || !k.cls) { return false; }
    var first = k.name.split(' ')[0], close = function () { $('back').hidden = true; };
    $('bk-title').textContent = 'Welcome back, ' + T.name + '!';
    $('bk-text').textContent = k.name + ', your ' + k.race + ' ' + k.cls + ', is still at table ' + T.code + '.';
    $('bk-yes').textContent = 'Continue as ' + first;
    $('bk-yes').onclick = function () { close(); if (!A.restore(j.save, j.portrait)) { fresh(); } };
    $('bk-no').onclick = function () { close(); fresh(); };
    $('back').hidden = false; $('bk-yes').focus();
    return true;
  }

  /* ---------- changing tables: a player can move to another code, or leave ---------- */
  function switcher() {
    var mine = T.role === 'player' && !!T.code;
    var k = A.saved(), who = k ? k.name.split(' ')[0] : '';
    $('sw-title').textContent = mine ? 'You are at table ' + T.code : (who && A.screen() === 'title' ? 'Join the table as ' + who + '?' : 'Join your DM’s table');
    $('sw-lbl').textContent = mine ? 'A different table code' : 'Table code';
    $('sw-join').textContent = mine ? 'Switch to this table' : 'Join this table';
    $('sw-who').hidden = !(mine && T.name); $('sw-who').textContent = mine && T.name ? 'You are seated as ' + T.name + '. Use the same name and this code to come back later, or on another phone.' : '';
    $('sw-leave').hidden = !mine; $('sw-code').value = ''; $('sw-err').hidden = true;
    $('switch').hidden = false; $('sw-code').focus();
  }
  function switchTo() {
    var code = $('sw-code').value.trim(), err = $('sw-err'), b = $('sw-join'), c = A.character();
    var k = A.saved(), name = T.name || A.player() || $('j-name').value.trim() || ((c && c.name) || (k && k.name) || 'Player').split(' ')[0];
    var say = function (m) { err.textContent = m; err.hidden = false; $('sw-code').focus(); };
    err.hidden = true;
    if (code.length !== 4) { say('A table code is four letters. Ask your DM to read it out again.'); return; }
    if (T.role === 'player' && code === T.code) { say('You are already at that table.'); return; }
    b.disabled = true;
    join(code, name).then(function () { $('switch').hidden = true; if (A.screen() === 'title' && A.saved()) { A.resume(); } sync(); })   // from a table link: straight to the game with the saved character
      .catch(function (x) { say((x && x.message) || 'Could not join that table. Check the code and try again.'); })
      .then(function () { b.disabled = false; });
  }
  $('pl-table').addEventListener('click', switcher);
  $('sw-code').addEventListener('input', function () { $('sw-code').value = $('sw-code').value.toUpperCase().replace(/[^A-Z]/g, ''); });
  $('sw-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); switchTo(); } });
  $('sw-join').addEventListener('click', switchTo);
  $('sw-leave').addEventListener('click', function () { forget(); $('switch').hidden = true; });
  $('sw-x').addEventListener('click', function () { $('switch').hidden = true; });
  $('switch').addEventListener('click', function (e) { if (e.target === $('switch')) { $('switch').hidden = true; } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('switch').hidden) { $('switch').hidden = true; } });

  /* ---------- the DM's side ---------- */
  /* Open a new table, or with a code come back as DM to one that is already open. */
  function open(passcode, code) {
    var body = { passcode: passcode || '' }; if (code) { body.code = String(code).toUpperCase().replace(/[^A-Z]/g, ''); }
    return A.fetchJson('api/table/open', body, 20000).then(function (j) {
      T.code = j.code; T.token = j.token; T.role = 'dm'; T.id = ''; T.last = 0; T.feed = []; T.players = []; keep(); start(); changed(); return j;
    });
  }
  function send(item) { return post('send', item); }
  function stash(dataUrl) { return post('keep', { image: dataUrl }).then(function (j) { return j.url; }); }

  /* ---------- waking up ---------- */
  function ready(info) {
    T.can = !!(info && info.tables); T.passcode = !!(info && info.passcode);
    $('j-code-wrap').hidden = !T.can;
    var q = /[?&]t=([A-Za-z]{4})/.exec(location.search || '');
    if (q && T.can) { $('j-code').value = q[1].toUpperCase(); }
    if (!T.can) { changed(); return; }
    try { var k = JSON.parse(A.store.get(KEY) || 'null'); if (k && k.code && k.token) { T.code = k.code; T.token = k.token; T.role = k.role; T.id = k.id || ''; T.name = k.name || ''; T.seen = k.seen || 0; start(); } } catch (e) { /* no table remembered */ }
    changed();
    /* a table link (?t=CODE) opened by someone who already made a character: offer to join now, no retyping */
    if (q && T.role !== 'dm' && q[1].toUpperCase() !== T.code && A.saved() && A.screen() === 'title') { switcher(); $('sw-code').value = q[1].toUpperCase(); }
  }

  FR.table = {
    ready: ready, join: join, sync: sync, welcome: welcome, open: open, send: send, stash: stash, leave: forget, show: show,
    can: function () { return T.can; }, needsPasscode: function () { return T.passcode; },
    active: function () { return !!T.code; }, isDM: function () { return T.role === 'dm' && !!T.code; }, isPlayer: function () { return T.role === 'player' && !!T.code; },
    code: function () { return T.code; }, players: function () { return T.players; }, feed: function () { return T.feed; },
    cred: function () { return T.code ? { code: T.code, token: T.token } : {}; },
    link: function () { return location.origin + location.pathname + '?t=' + T.code; },
    onChange: function (fn) { listeners.push(fn); }
  };
})();
