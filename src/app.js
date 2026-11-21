/* First Roll: screens and flow. Everything a scenario can change (cast, copy, art, sounds, dice
   dressing) is read from FR.theme, which a scenario pack fills in (src/registry.js, scenarios/).
   Nothing here knows any pack by name. This file runs once the opening pack is loaded (FR.boot).

   The first part, FR.play, has no screen in it: which questions a game asks, what a set of answers
   makes, what a roll adds up to and how to say so in plain words, and how a shaken phone is told
   from a nudged one. It runs anywhere, so test/unit/play.test.js can check it without a browser. */
(function () {
  'use strict';

  /* ================= the parts with no screen in them ================= */
  var play = FR.play = {};
  var fill = play.fill = function (s, vars) {
    s = String(s === undefined || s === null ? '' : s);
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  };
  var given = function (a) { return a !== null && a !== undefined; };

  /* ---------- the questions and what they make ---------- */
  /* The questions a game asks, in order: the pack's five for a quick game, otherwise all of them. */
  play.questions = function (mode) {
    var all = FR.QUESTIONS.map(function (q, i) { return i; });
    var quick = ((FR.theme.quiz && FR.theme.quiz.quick) || []).filter(function (i) { return !!FR.QUESTIONS[i]; });
    return mode === 'quick' && quick.length ? quick.slice() : all;
  };
  /* One slot per question, null where none was asked or the answer no longer exists. */
  play.answers = function (list) {
    return FR.QUESTIONS.map(function (q, i) { var a = list ? list[i] : null; return given(a) && q.a[a] ? a : null; });
  };
  play.answered = function (answers) { return (answers || []).filter(given).length; };
  /* Which game a set of answers came from: exactly the pack's quick five, or the full quiz. */
  play.modeOf = function (answers) {
    var quick = play.questions('quick'), got = [];
    (answers || []).forEach(function (a, i) { if (given(a)) { got.push(i); } });
    return got.length < FR.QUESTIONS.length && got.length === quick.length && got.every(function (i) { return quick.indexOf(i) >= 0; }) ? 'quick' : 'full';
  };
  /* What a set of answers makes. A quick game is ranked against its own yardstick (five answers
     swing much further than twelve), and the line under the hero's name is worked out from the
     number of questions that were actually answered. */
  play.outcome = function (answers, mode) {
    var a = play.answers(answers), only = mode === 'quick' ? play.questions('quick') : undefined, u = FR.tally(a), n = Math.max(1, play.answered(a));
    var clsRank = FR.rank(u, FR.CLASSES, only), raceRank = FR.rank(u, FR.RACES, only);
    return { answers: a, mode: mode === 'quick' ? 'quick' : 'full', u: u, answered: n, clsRank: clsRank, raceRank: raceRank, cls: clsRank[0].name, race: raceRank[0].name, alignment: FR.alignment(u, n) };
  };
  /* A ready-made hero, as a finished character in the shape the app saves and takes up again. */
  play.premade = function (p) {
    return { answers: (p.answers || FR.answersFor(p.cls, p.race)).slice(), cls: p.cls, race: p.race, look: JSON.parse(JSON.stringify(p.look || {})), desc: p.desc || '',
      name: p.name, portrait: p.portrait || FR.theme.art.sample(p.cls), portraitNote: '', origin: '', originKey: '', originName: p.name };
  };

  /* ---------- a roll, as arithmetic ---------- */
  /* c is what is being rolled: { sides, count, mod, kind, why }. adv is 'normal', 'adv' or 'dis'. */
  play.usesAdv = function (c) { return c.sides === 20 && c.kind !== 'free' && c.kind !== 'damage' && c.kind !== 'table'; };
  play.spec = function (c, adv) { var n = play.usesAdv(c) && adv !== 'normal' ? 2 : c.count, out = [], i; for (i = 0; i < n; i++) { out.push(c.sides); } return out; };
  play.result = function (c, adv, v) {
    var two = play.usesAdv(c) && adv !== 'normal';
    var kept = two ? (adv === 'adv' ? Math.max.apply(null, v) : Math.min.apply(null, v)) : v.reduce(function (a, b) { return a + b; }, 0);
    return { kept: kept, total: kept + c.mod, two: two, nat: play.usesAdv(c) && (two || v.length === 1) ? kept : 0, keptIx: two ? v.indexOf(kept) : -1 };
  };
  var list = function (v, and) { return v.length < 2 ? String(v[0]) : v.slice(0, -1).join(', ') + ' ' + and + ' ' + v[v.length - 1]; };
  /* the bonus in words: "plus 4 for being sneaky", "minus 1, as this is not your strong suit", or nothing */
  play.bonus = function (mod, why, w) {
    if (!mod) { return ''; }
    if (mod < 0) { return fill(w.minus, { n: -mod }); }
    return why ? fill(w.plusFor, { n: mod, why: why }) : fill(w.plus, { n: mod });
  };
  /* The result as a sentence, for people who have never read a rulebook:
     "You rolled 19, plus 4 for being sneaky: 23." or "Rolled 9 and 17, keeping the lower: 9, plus 4 for being sneaky: 13." */
  play.sentence = function (c, adv, v, w) {
    var r = play.result(c, adv, v), b = play.bonus(c.mod, c.why, w);
    var head = r.two ? fill(w.keep, { a: v[0], b: v[1], which: adv === 'adv' ? w.higher : w.lower, kept: r.kept }) : fill(w.rolled, { dice: list(v, w.and) });
    if (b) { return head + ', ' + b + ': ' + r.total + '.'; }
    return head + (!r.two && v.length > 1 ? ': ' + r.total : '') + '.';
  };
  /* the short sum the rest of the table sees: "19 + 4", "3 + 5 + 2", "17 + 4 (best of 9 and 17)" */
  play.detail = function (c, adv, v, w) {
    var r = play.result(c, adv, v), mod = c.mod ? (c.mod > 0 ? ' + ' : ' − ') + Math.abs(c.mod) : '';
    if (c.table) { return String(c.table[r.kept - 1] || ''); }
    if (r.two) { return r.kept + mod + ' (' + (adv === 'adv' ? w.bestOf : w.worstOf) + ' ' + list(v, w.and) + ')'; }
    return v.join(' + ') + mod;
  };
  /* what FR.table.roll is handed */
  play.entry = function (c, adv, v, w) {
    var r = play.result(c, adv, v);
    return { label: c.label || c.title || '', kind: c.kind === 'table' ? 'extra' : c.kind, total: r.total, nat: r.nat === 20 || r.nat === 1 ? r.nat : 0,
      detail: play.detail(c, adv, v, w), dice: v.map(function (x) { return { sides: c.sides, value: x }; }) };
  };
  /* dice in words: "One 20-sided die", "Three 6-sided dice" */
  play.diceWords = function (n, sides, w) {
    var names = String(w.numbers || '').split(' ');
    return n === 1 ? fill(w.one, { s: sides }) : fill(w.many, { n: names[n - 1] || n, s: sides });
  };

  /* ---------- a shaken phone ----------
     Fed how hard the phone is moving (metres per second squared, gravity taken out) and when.
     A shake is a reading over the threshold, counted at most once every `gap` milliseconds, so one
     swing of the arm is one shake however many readings it gives. The first shake rattles the
     dice; the second throws them, and so does stopping after one (see `tick`). After a throw the
     phone is ignored for `cooldown` milliseconds, so the same shaking cannot throw twice. */
  play.shaker = function (opts) {
    var o = { threshold: 14, gap: 250, stop: 600, cooldown: 1400 }, s = { shakes: 0, last: -1e9, thrown: -1e9 };
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    return {
      /* one reading. Returns { rattle: 0 or how hard (0.2 to 1), throw: true when the dice should go } */
      feed: function (mag, t) {
        var out = { rattle: 0, throw: false };
        if (!(mag > o.threshold) || t - s.thrown < o.cooldown || t - s.last < o.gap) { return out; }
        s.shakes++; s.last = t;
        out.rattle = Math.max(0.2, Math.min(1, 0.35 + (mag - o.threshold) / 30));
        if (s.shakes >= 2) { s.shakes = 0; s.thrown = t; out.throw = true; }
        return out;
      },
      /* asked a little later: true if the phone was shaken once and has been still since */
      tick: function (t) {
        if (s.shakes > 0 && t - s.last >= o.stop) { s.shakes = 0; s.thrown = t; return true; }
        return false;
      },
      /* the dice have just landed (or the tray has just opened): start the quiet spell from now */
      rest: function (t) { s.shakes = 0; s.thrown = t; },
      waiting: function () { return s.shakes; },
      options: o
    };
  };

  if (typeof document === 'undefined') { return; }           // no screen here (the unit tests): the rest is the app itself

  /* ================= the app ================= */
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text !== undefined) { e.textContent = text; } return e; };
  var clear = function (node) { while (node.firstChild) { node.removeChild(node.firstChild); } };
  var app = $('app');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable: carry on without it */ } }
  };

  var TH = FR.theme;                       // the scenario the page opened with (FR.begin chose it, FR.boot loaded it)
  var tx = function (key, vars) {
    var s = TH.text[key];
    return vars && typeof s === 'string' ? fill(s, vars) : s;
  };
  var first = function (name) { return String(name || '').split(' ')[0]; };
  var cap = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };

  var S;
  function blank() {
    return { screen: 'title', mode: 'full', order: [], qi: 0, answers: [], answered: 12, u: FR.zero(), cls: null, race: null, clsRank: [], raceRank: [], look: {}, desc: '', portrait: '', portraitNote: '', portraitFrom: '', noPic: false,
      name: '', origin: '', originKey: '', originName: '', sheet: null, tab: 'do', init: null, email: '', descAuto: false, stale: false };
  }
  S = blank();
  /* a new hero is about to be made: put the one in play away (the saved copy stays until the new one is ready) */
  function fresh() { var scr = S.screen; S = blank(); S.screen = scr; }
  /* How pictures and writing get made: 'server' (the Worker holds the key), 'direct' (this browser calls
     OpenAI with a key kept on this computer) or 'preview' (no AI: the pack's ready-made pictures and words). */
  /* sound effects and music have a switch each; an old 'muted' choice still counts for effects.
     `details` is "Show rules details": off unless someone asked for it. */
  var G = { live: false, mode: 'preview', muted: (store.get('firstroll.sfx') || (store.get('firstroll.muted') === '1' ? '0' : '1')) === '0', music: true, details: store.get('firstroll.details') === '1' };
  var OPENAI = { image: 'gpt-image-2', quality: 'medium', text: 'gpt-4.1-mini' };
  var hosted = !!window.claude;
  var canDirect = !hosted && (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
  var directKey = function () { return canDirect ? (store.get('firstroll.openai') || '') : ''; };
  /* Music: on for the DM and for anyone playing alone; off on a phone that has sat down at a table
     as a player, because five phones playing five tracks out of step is a mess. Once someone has
     chosen in Settings, that choice is the answer everywhere. */
  function musicWanted() {
    var said = store.get('firstroll.music'), tb = FR.table;
    if (said === '1' || said === '0') { return said === '1'; }
    if (tb && tb.isDM()) { return true; }
    return !((tb && tb.isPlayer()) || store.get('firstroll.seated') === '1');
  }
  function applyMusic() { var on = musicWanted(); if (on !== G.music) { G.music = on; FR.Music.enable(on); } }
  G.music = musicWanted();
  FR.Dice.Sound.muted = G.muted; FR.Music.enable(G.music);
  var D = { ctx: null, adv: 'normal', values: [], rolling: false, shown: false, lucky: false, booted: false, flat: false };

  /* A pack may mark its line under the hero's name as rule-book wording (the base pack's "Lawful Good" is):
     then it is only shown with "Show rules details" on. */
  var alignShown = function () { var q = TH.quiz && TH.quiz.alignment; return !(q && q.detailOnly && !G.details); };
  var crestOf = function (cls) { return TH.art.crest(cls); };
  var sampleOf = function (cls) { return TH.art.sample(cls); };

  /* ---------- persistence (a convenience only), one character per scenario ---------- */
  function save() {
    if (!S.cls) { return; }
    var keep = { answers: S.answers, cls: S.cls, race: S.race, look: S.look, desc: S.desc, name: S.name, origin: S.origin, originKey: S.originKey, originName: S.originName,
      portraitNote: S.portraitNote, portrait: S.portrait && S.portrait.length < 700000 ? S.portrait : '', portraitFrom: S.portraitFrom, noPic: S.noPic };
    store.set('firstroll.v3.' + TH.id, JSON.stringify(keep));
  }
  /* the character without its picture: small enough to leave with the table (see table.js) */
  function saveBlob() {
    if (!S.cls) { return ''; }
    return JSON.stringify({ theme: TH.id, answers: S.answers, cls: S.cls, race: S.race, look: S.look, desc: S.desc, name: S.name, origin: S.origin, originKey: S.originKey, originName: S.originName, portraitNote: S.portraitNote });
  }
  /* take up a character that was left at a table: on a new phone, or in a new session */
  function restore(blob, portrait) {
    var k; try { k = JSON.parse(blob); } catch (e) { return false; }
    if (!k) { return false; }
    if (k.theme && k.theme !== TH.id && FR.pack(k.theme)) {      // made in another scenario: fetch that pack, then take the seat
      FR.loadScenario(k.theme).then(function () { applyTheme(k.theme, true); if (!sit(k, portrait)) { go('title'); } }).catch(function () { go('title'); });
      return true;
    }
    return sit(k, portrait);
  }
  function sit(k, portrait) {
    if (!FR.CLASSES[k.cls] || !FR.RACES[k.race]) { return false; }
    k.portrait = ''; k.noPic = false; fresh(); adopt(k); save(); go('play');
    if (portrait) { takePortrait(portrait).then(function (got) { if (got && FR.table && FR.table.tookPortrait) { FR.table.tookPortrait(portrait); } }); }
    return true;
  }
  function load() {
    try {
      var k = JSON.parse(store.get('firstroll.v3.' + TH.id) || 'null');
      if (k && k.cls && FR.CLASSES[k.cls] && FR.RACES[k.race]) { return k; }
    } catch (e) { /* ignore */ }
    return null;
  }
  /* Every change of picture goes through here, so nothing is left believing in the old one. */
  function setPortrait(src, note) { S.portrait = src || ''; S.portraitNote = note || ''; S.portraitFrom = ''; S.stale = false; if (src) { S.noPic = false; } }
  function redraw() { if (S.screen === 'play') { renderPlay(); } else if (S.screen === 'sheet') { renderSheet(); } else if (S.screen === 'portrait') { renderEasel(); } }
  /* The seat at the table has a picture and this device has none: take the seat's. One of the pack's
     own pictures is simply pointed at; one the table stores is fetched once and kept on this device.
     Resolves with the picture taken, or '' if there was nothing to do. */
  var taking = '', badPics = {};
  function takePortrait(url) {
    if (!url || !S.cls || S.portrait || S.noPic || taking === url || badPics[url]) { return Promise.resolve(''); }
    var done = function (src) { setPortrait(src, ''); S.portraitFrom = url; save(); redraw(); return src; };
    if (url.indexOf('api/table/img') !== 0) { return Promise.resolve(done(url)); }
    taking = url;
    return fetch(url).then(function (r) { if (!r.ok) { throw new Error('gone'); } return r.blob(); }).then(function (b) {
      return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); });
    }).then(function (data) {
      taking = '';
      return !S.cls || S.portrait || S.noPic ? '' : done(data);
    }).catch(function () { taking = ''; badPics[url] = true; return ''; });      // no picture: the sheet still works
  }

  /* ---------- server ---------- */
  function fetchJson(url, body, timeout, headers) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, timeout), h = headers || {};
    if (body) { h['Content-Type'] = 'application/json'; }
    var opt = body ? { method: 'POST', headers: h, body: JSON.stringify(body), signal: ctl.signal } : { headers: h, signal: ctl.signal };
    return fetch(url, opt).then(function (r) {
      return r.json().then(function (j) {
        /* the server's own words go to the player as they are; `reason` (and anything else it sent, such as a name) is for the app to act on */
        if (!r.ok) { var m = j && j.error && (j.error.message || j.error); var e = new Error(typeof m === 'string' ? m : 'The request failed.'); e.status = r.status; e.reason = (j && j.reason) || ''; e.data = j || {}; throw e; }
        return j;
      });
    }).finally(function () { clearTimeout(t); });
  }
  var openai = function (route, body, timeout) { return fetchJson('https://api.openai.com' + route, body, timeout, { Authorization: 'Bearer ' + directKey() }); };
  var cred = function () { return FR.table ? FR.table.cred() : {}; };
  var at = function (b) { return b.code ? '?c=' + b.code : ''; };
  /* One place that makes pictures and words, whichever way this copy of the app is connected. */
  var AI = {
    image: function (prompt, opts) {
      var size = (opts && opts.size) || '1024x1536';
      if (G.mode === 'server') { var b = cred(); b.prompt = prompt; b.size = size; b.keep = !!(opts && opts.keep && b.code); return fetchJson('api/image' + at(b), b, 150000); }
      var t0 = Date.now();
      return openai('/v1/images/generations', { model: OPENAI.image, prompt: prompt, size: size, quality: OPENAI.quality, output_format: 'webp', output_compression: 82, n: 1 }, 150000)
        .then(function (j) { return { image: 'data:image/webp;base64,' + j.data[0].b64_json, seconds: Math.round((Date.now() - t0) / 1000) }; });
    },
    text: function (system, user, opts) {
      opts = opts || {};
      if (G.mode === 'server') { var b = cred(); b.system = system; b.user = user; b.json = !!opts.json; b.max = opts.max || 200; return fetchJson('api/text' + at(b), b, 45000); }
      var req = { model: OPENAI.text, temperature: 0.9, max_tokens: opts.max || 200, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
      if (opts.json) { req.response_format = { type: 'json_object' }; }
      return openai('/v1/chat/completions', req, 45000).then(function (j) {
        var out = j.choices[0].message.content || '';
        return opts.json ? { json: JSON.parse(out) } : { text: out.replace(/\s+/g, ' ').trim() };
      });
    }
  };
  var serverKnown = false;
  function setMode() {
    if (G.mode !== 'server') { G.mode = directKey() ? 'direct' : 'preview'; }
    /* a public server only paints for people sitting at a DM's table */
    G.live = G.mode === 'direct' || (G.mode === 'server' && (!G.locked || !!(FR.table && FR.table.active())));
  }
  function checkServer() {
    var info = null;
    /* One missed answer on weak wifi must not switch tables off for the evening: ask three times before
       starting without them, and after that keep asking quietly until the site answers. */
    var ask = function (left) {
      return fetchJson('api/health', null, 4000).catch(function (e) {
        if (left <= 0) { throw e; }
        return new Promise(function (ok) { setTimeout(ok, 1200); }).then(function () { return ask(left - 1); });
      });
    };
    var took = function (j) { info = j; G.mode = j && j.live ? 'server' : 'preview'; G.locked = !!(j && j.passcode); };
    var later = function () {
      var again = function () {
        if (info || document.hidden) { return; }
        fetchJson('api/health', null, 4000).then(function (j) {
          if (info) { return; }
          took(j); clearInterval(timer); setMode(); renderSettings(); if (FR.table) { FR.table.ready(info); } renderTitle();
        }).catch(function () { /* still out of reach: try again shortly */ });
      };
      var timer = setInterval(again, 15000);
      window.addEventListener('online', again); document.addEventListener('visibilitychange', again);
    };
    return ask(2).then(took).catch(function () { G.mode = 'preview'; later(); }).then(function () {
      setMode(); serverKnown = true; renderSettings();
      if (FR.table) {
        FR.table.onChange(function () {
          var was = G.live;
          setMode(); applyMusic(); renderSettings(); renderThemes(); renderTitle();
          if (was !== G.live && S.screen === 'portrait') { renderEasel(); }
        });
        FR.table.ready(info);
      }
      renderTitle();
    });
  }

  /* ---------- scenarios ---------- */
  /* Switch to a pack that is already loaded. To switch to any pack in the manifest, use pickTheme. */
  function applyTheme(id, isFresh) {
    TH = FR.useTheme(id);
    document.body.setAttribute('data-theme', TH.id);
    store.set('firstroll.theme', TH.id);
    if (isFresh) { fresh(); }
    document.querySelectorAll('[data-t]').forEach(function (n) { n.textContent = tx(n.getAttribute('data-t')); });
    $('t-wordmark').src = TH.art.wordmark;
    FR.Music.use(TH.music || null);
    $('p-desc').setAttribute('placeholder', tx('descHint'));
    $('sw-name').setAttribute('placeholder', tx('nameHint'));
    $('b-surprise-t').textContent = tx('surprise');
    $('pl-menu').setAttribute('aria-label', tx('menu'));
    $('b-dm').hidden = !TH.adventure;
    renderSettings(); renderThemes(); renderTitle();
    clear($('q-lean'));
    if (D.booted) { FR.Dice.clear(); FR.Dice.setScene(TH.dice, TH.art.floor); }
  }
  /* Fetch a pack if it is not here yet, then switch to it. Resolves with the pack in play afterwards. */
  var switching = '', switchP = null;
  function pickTheme(id, isFresh) {
    /* one switch at a time: whoever asks while one is under way waits for it, then asks again if it still matters */
    if (switching) { return switchP.then(function () { return pickTheme(id, isFresh); }); }
    if (id === TH.id) { return Promise.resolve(TH); }
    switching = id;
    switchP = FR.loadScenario(id).then(function () { switching = ''; applyTheme(id, isFresh !== false); return TH; }, function () { switching = ''; renderThemes(); return TH; });
    return switchP;
  }
  /* The picker lists every public pack in the manifest the build wrote into the page. A device that is
     seated at a table does not get one: the table owns the scenario. */
  function renderThemes() {
    var box = $('themes'), list = FR.MANIFEST.packs.filter(function (p) { return p.visibility === 'public'; });
    clear(box); box.hidden = list.length < 2 || !!(FR.table && FR.table.active());
    list.forEach(function (p) {
      var b = el('button', 'theme-card' + (p.id === TH.id ? ' on' : '')), img = el('img'), s = el('span');
      b.type = 'button'; b.setAttribute('aria-pressed', p.id === TH.id ? 'true' : 'false');
      img.src = p.thumb; img.alt = ''; b.appendChild(img);
      s.appendChild(el('b', '', p.name)); s.appendChild(el('small', '', p.blurb)); b.appendChild(s);
      b.addEventListener('click', function () { if (p.id !== TH.id && !switching) { b.setAttribute('aria-busy', 'true'); pickTheme(p.id, true); } });
      box.appendChild(b);
    });
  }

  /* ---------- one toast for the whole app: it sits above every screen and every dialog ---------- */
  var toastT = 0;
  function toast(msg) {
    var t = $('toast');
    t.hidden = true; void t.offsetWidth;          // so a second message drops in afresh
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3600);
  }

  /* ---------- dialogs: one small helper ----------
     Every pop-up is a .handout that is opened by clearing `hidden` and closed by setting it. This
     watches for exactly that, so no dialog has to remember the rules: while one is open, Tab stays
     inside it and Escape presses its way out (the button marked data-close); when it opens, focus
     moves into it; when the last one closes, focus goes back to whatever opened it. */
  var Dlg = (function () {
    var opener = null;
    var CAN = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';
    var top = function () { var all = app.querySelectorAll('.handout:not([hidden])'); return all.length ? all[all.length - 1] : null; };
    var seen = function (n) { return !n.disabled && !n.hidden && n.getClientRects().length > 0; };
    var stops = function (box) { return Array.prototype.filter.call(box.querySelectorAll(CAN), seen); };
    document.addEventListener('focusin', function (e) {
      var t = top();
      if (!t) { opener = e.target; } else if (!t.contains(e.target)) { var f = stops(t); if (f.length) { f[0].focus(); } }
    });
    /* some browsers do not focus a button when it is tapped, so the tap itself is remembered too */
    document.addEventListener('pointerdown', function (e) { var b = !top() && e.target.closest ? e.target.closest('button, a, input, textarea') : null; if (b) { opener = b; } }, true);
    document.addEventListener('keydown', function (e) {
      var t = top(), f, i, x;
      if (!t) { return; }
      if (e.key === 'Escape') { x = t.querySelector('[data-close]'); if (x && seen(x)) { e.preventDefault(); x.click(); } return; }
      if (e.key !== 'Tab') { return; }
      f = stops(t); i = f.indexOf(document.activeElement);
      if (!f.length) { e.preventDefault(); return; }
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    });
    if (window.MutationObserver) {
      new MutationObserver(function (changes) {
        changes.forEach(function (m) {
          var n = m.target, f;
          if (!n.classList || !n.classList.contains('handout')) { return; }
          if (!n.hidden) { if (n === top() && !n.contains(document.activeElement)) { f = stops(n); if (f.length) { f[0].focus(); } } }
          else if (!top() && opener && document.contains(opener) && seen(opener)) { opener.focus(); }
        });
      }).observe(app, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    }
    return {
      open: top,
      /* a new screen: move focus to its heading, so a keyboard or a screen reader starts where the eye does */
      land: function (name) {
        var s = $('s-' + name), h = s && s.querySelector('[data-h], h1, h2, .bar-title, .tray-title, .dm-title');
        if (!h || top()) { return; }
        if (!h.hasAttribute('tabindex')) { h.setAttribute('tabindex', '-1'); }
        try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
      }
    };
  })();
  /* "Are you sure?" and "this just happened": one dialog for both.
     o: { kicker, title, text, yes, no, onYes, onNo }. With no `no`, it is a notice with one button. */
  function ask(o) {
    var y = $('ask-yes'), n = $('ask-no'), shut = function (fn) { return function () { $('ask').hidden = true; if (fn) { fn(); } }; };
    $('ask-k').textContent = o.kicker || ''; $('ask-k').hidden = !o.kicker;
    $('ask-title').textContent = o.title || '';
    $('ask-text').textContent = o.text || ''; $('ask-text').hidden = !o.text;
    y.textContent = o.yes || tx('ok'); y.onclick = shut(o.onYes);
    n.textContent = o.no || ''; n.hidden = !o.no; n.onclick = shut(o.onNo);
    /* Escape takes the gentle way out: "no" when there is one */
    if (o.no) { n.setAttribute('data-close', ''); y.removeAttribute('data-close'); } else { y.setAttribute('data-close', ''); n.removeAttribute('data-close'); }
    $('ask').hidden = false; y.focus();
  }

  /* ---------- navigation ---------- */
  var enter = {};
  function go(name) {
    if (S.screen === 'dice' && name !== 'dice') { leaveTray(); }
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('on', s.id === 's-' + name); });
    app.setAttribute('data-screen', name); S.screen = name;
    if (enter[name]) { enter[name](); }
    tune();
    Dlg.land(name);
  }
  /* which music fits where the player is: the way in, the game itself, or a fight */
  function tune() {
    var s = S.screen, rolling = s === 'dice' && D && D.ctx, k = rolling ? D.ctx.kind : '';
    var fight = (s === 'play' && S.tab === 'fight') || (rolling && (k === 'attack' || k === 'damage' || k === 'init' || S.tab === 'fight'));
    FR.Music.scene(fight ? 'fight' : (s === 'title' || s === 'heroes' || s === 'story' || s === 'dmgate' || s === 'connect' ? 'intro' : 'game'));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-back]') : null;
    if (b) { go(b.getAttribute('data-back')); }
  });
  document.addEventListener('pointerdown', function (e) {
    FR.Dice.Sound.unlock(); FR.Music.unlock();
    if (e.target.closest && e.target.closest('.btn, .ans, .chip, .row, .tab, .icon, .theme-card, .seg button, .rail-dice button, .stepper button, .switch, .tablechip, .pre-card, .tile, .shake')) { FR.sfx('tap'); }
  });

  /* ---------- 1. title: three ways in, or straight back to where you were ---------- */
  var mainDo = null, wayDo = [null, null];
  function resume() { var k = load(); if (k) { fresh(); adopt(k); go('play'); } }
  function renderTitle() {
    var k = load(), tb = FR.table, can = !!(tb && tb.can()), dmSeat = !!(tb && tb.isDM()), mine = !!(tb && tb.isPlayer()), inv = tb && tb.invite ? tb.invite() : '';
    /* the table, in one chip: an invitation waiting, the table this device is at, or the way to join one */
    var chip = $('t-table');
    chip.hidden = !can || dmSeat;
    chip.textContent = mine ? tx('atTable', { code: tb.code() }) : (inv ? tx('invited', { code: inv }) : tx('joinTable'));
    chip.classList.toggle('quiet', !mine && !inv);
    /* The first button is the way straight back in when there is one: the DM's table, or the hero
       already made. Someone new gets the three ways to start. */
    var acts = [];
    if (dmSeat) { acts.push([tx('dmBack', { code: tb.code() }), function () { $('b-dm').click(); }]); }
    if (k) { acts.push([tx('continueAs', { name: first(k.name) }), resume]); acts.push([tx('newHero'), openWays]); }
    else { acts.push([tx('quickStart'), function () { startGame('quick'); }]); acts.push([tx('fullQuiz'), function () { startGame('full'); }]); acts.push([tx('premade'), function () { go('heroes'); }]); }
    if (acts.length > 3) { acts = [acts[0], acts[1], [tx('newHero'), openWays]]; }
    $('t-begin').hidden = !!k || dmSeat;                          // the invitation belongs with the ways to start
    $('b-main').textContent = acts[0][0]; mainDo = acts[0][1];
    [$('b-way-a'), $('b-way-b')].forEach(function (b, i) { var a = acts[i + 1]; b.hidden = !a; b.textContent = a ? a[0] : ''; wayDo[i] = a ? a[1] : null; });
    $('b-dm').hidden = !TH.adventure || dmSeat;
  }
  enter.title = renderTitle;
  $('b-main').addEventListener('click', function () { if (mainDo) { mainDo(); } });
  $('b-way-a').addEventListener('click', function () { if (wayDo[0]) { wayDo[0](); } });
  $('b-way-b').addEventListener('click', function () { if (wayDo[1]) { wayDo[1](); } });
  $('t-table').addEventListener('click', function () { if (FR.table) { FR.table.switcher(); } });
  /* Starting over when there is already a hero: the same three ways, with a plain word about what happens to the old one. */
  function openWays() {
    var k = load() || (S.cls ? S : null);
    $('ways-note').hidden = !k; $('ways-note').textContent = k ? tx('waysReplace', { name: first(k.name) }) : '';
    $('w-x').textContent = k ? tx('keepHero', { name: first(k.name) }) : tx('close');
    $('ways').hidden = false; $('w-quick').focus();
  }
  $('w-quick').addEventListener('click', function () { $('ways').hidden = true; startGame('quick'); });
  $('w-full').addEventListener('click', function () { $('ways').hidden = true; startGame('full'); });
  $('w-premade').addEventListener('click', function () { $('ways').hidden = true; go('heroes'); });
  $('w-x').addEventListener('click', function () { $('ways').hidden = true; });
  function adopt(k) {
    var o = play.outcome(k.answers, play.modeOf(play.answers(k.answers)));
    S.answers = o.answers; S.mode = o.mode; S.answered = o.answered; S.u = o.u; S.clsRank = o.clsRank; S.raceRank = o.raceRank;
    S.cls = k.cls; S.race = k.race; S.look = k.look || {}; S.desc = k.desc || '';
    S.name = k.name || FR.rollName(S.race, S.look.body); S.origin = k.origin || ''; S.originKey = k.originKey || ''; S.originName = k.originName || S.name;
    S.portrait = k.portrait || ''; S.portraitNote = k.portraitNote || ''; S.portraitFrom = k.portraitFrom || ''; S.noPic = !!k.noPic; buildSheet();
  }
  /* ready-made heroes: tap one and you are playing */
  enter.heroes = function () {
    var box = $('heroes'); clear(box);
    TH.roster.premades.forEach(function (p) {
      var b = el('button', 'pre-card'), img = el('img'), t = el('span', 'pre-t');
      b.type = 'button'; img.src = p.portrait; img.alt = ''; img.loading = 'lazy';
      t.appendChild(el('b', '', p.name)); t.appendChild(el('small', '', p.race + ' ' + p.cls)); t.appendChild(el('span', '', FR.CLASSES[p.cls].blurb));
      b.appendChild(img); b.appendChild(t);
      b.addEventListener('click', function () { fresh(); adopt(play.premade(p)); save(); go('play'); });
      box.appendChild(b);
    });
  };

  /* ---------- 2. the story so far (before the full quiz, or later from the menu) ---------- */
  var story = { i: 0, then: 'quiz' };
  /* A new hero by the questions. The quick game goes straight to them; the full one tells the story first. */
  function startGame(mode) {
    fresh(); S.mode = mode === 'quick' ? 'quick' : 'full';
    if (S.mode === 'full' && TH.story && TH.story.length) { story.i = 0; story.then = 'quiz'; renderStory(); go('story'); } else { startQuiz(); }
  }
  function renderStory() {
    var beats = TH.story, b = beats[story.i], img = $('st-img'), dots = $('st-dots'), last = story.i === beats.length - 1;
    img.classList.remove('swap'); void img.offsetWidth; img.src = b.img; img.alt = b.alt; img.classList.add('swap');
    $('st-text').textContent = b.text;
    $('st-next').textContent = !last ? tx('storyNext') : (story.then === 'quiz' ? tx('storyGo') : tx('storyBack'));
    $('st-skip').textContent = story.then === 'quiz' ? tx('storySkip') : tx('storyBack');
    clear(dots);
    beats.forEach(function (x, i) { dots.appendChild(el('i', i <= story.i ? 'on' : '')); });
    if (!last) { var pre = new Image(); pre.src = beats[story.i + 1].img; }
  }
  var storyDone = function () { if (story.then === 'quiz') { startQuiz(); } else { go(S.cls ? 'play' : 'title'); } };
  $('st-next').addEventListener('click', function () { if (story.i < TH.story.length - 1) { story.i++; renderStory(); } else { storyDone(); } });
  $('st-back').addEventListener('click', function () { if (story.i > 0) { story.i--; renderStory(); } else if (story.then === 'quiz') { go('title'); } else { storyDone(); } });
  $('st-skip').addEventListener('click', storyDone);

  /* ---------- 3. quiz ---------- */
  var busy = false;
  function startQuiz() { S.order = play.questions(S.mode); S.qi = 0; S.answers = play.answers([]); S.u = FR.zero(); renderQ(); go('quiz'); }
  function renderQ() {
    var n = S.order.length, at = S.order[S.qi], q = FR.QUESTIONS[at], pips = $('q-pips'), box = $('q-answers'), i;
    clear(pips);
    for (i = 0; i < n; i++) { pips.appendChild(el('i', i < S.qi ? 'done' : (i === S.qi ? 'now' : ''))); }
    /* the pack's own counter (some count in roman numerals) with rules details on; plain numbers otherwise */
    $('q-count').textContent = G.details ? TH.count(S.qi, n) : fill((TH.quiz.count && TH.quiz.count.text) || '{i} of {n}', { i: S.qi + 1, n: n });
    $('q-text').textContent = q.q;
    clear(box);
    q.a.forEach(function (a, ai) {
      var b = el('button', 'ans' + (S.answers[at] === ai ? ' on' : ''), a.t); b.type = 'button';
      b.addEventListener('click', function () { answer(ai, b); });
      box.appendChild(b);
    });
    renderLean();
  }
  function renderLean() {
    var row = $('q-lean'), u = FR.tally(S.answers), mx = 4, keys = Object.keys(FR.TRAIT_LABELS);
    keys.forEach(function (k) { mx = Math.max(mx, u[k]); });
    if (!row.firstChild) {
      keys.forEach(function (k) {
        var d = el('div'), b = el('b'), f = el('i'); f.id = 'lean-' + k; b.appendChild(f); d.appendChild(b); d.appendChild(document.createTextNode(FR.TRAIT_LABELS[k])); row.appendChild(d);
      });
    }
    keys.forEach(function (k) { $('lean-' + k).style.width = Math.round(100 * Math.max(0, u[k]) / mx) + '%'; });
  }
  function turn(fn) {
    var card = $('q-card');
    if (reduced) { fn(); return; }
    card.classList.add('out');
    setTimeout(function () {
      fn(); card.classList.remove('out'); card.classList.add('pre');
      void card.offsetWidth; card.classList.remove('pre');
    }, 260);
  }
  function answer(ai, btn) {
    if (busy) { return; }
    busy = true; S.answers[S.order[S.qi]] = ai; FR.Dice.Sound.step(S.qi);
    Array.prototype.forEach.call($('q-answers').children, function (c) { c.classList.toggle('on', c === btn); });
    renderLean();
    setTimeout(function () {
      busy = false;
      if (S.screen !== 'quiz') { return; }
      if (S.qi < S.order.length - 1) { turn(function () { S.qi++; renderQ(); }); }
      else { score(); showReveal(true); }
    }, 420);
  }
  $('q-back').addEventListener('click', function () {
    if (busy) { return; }
    if (S.qi > 0) { turn(function () { S.qi--; renderQ(); }); }
    else if (S.mode === 'full' && TH.story && TH.story.length) { story.i = TH.story.length - 1; story.then = 'quiz'; renderStory(); go('story'); }
    else { go('title'); }
  });

  /* ---------- 4. reveal ---------- */
  /* the answers so far, turned into a hero: the closest class and race, and how close the others came */
  function score() {
    var o = play.outcome(S.answers, S.mode);
    S.u = o.u; S.answered = o.answered; S.clsRank = o.clsRank; S.raceRank = o.raceRank; S.cls = o.cls; S.race = o.race;
  }
  var cheer = function () { FR.sfx('cheer'); };
  var tableSync = function () { if (FR.table) { FR.table.sync(); } };
  function showReveal(intro) {
    renderReveal(); go('reveal'); $('reveal-scroll').scrollTop = 0; tableSync();
    var s = $('s-reveal');
    s.classList.remove('intro');
    if (intro && !reduced) {
      void s.offsetWidth; s.classList.add('intro'); setTimeout(function () { s.classList.remove('intro'); }, 3600);
      setTimeout(function () { FR.Dice.Sound.hit('wood', 1, 0); }, 2350);
      setTimeout(cheer, 2550);
    }
    save();
  }
  function renderReveal() {
    var cls = FR.CLASSES[S.cls], n = S.answered || 1, keys = Object.keys(FR.TRAIT_LABELS);
    if (!S.name) { S.name = FR.rollName(S.race, S.look.body); }       // a name to go by, so "Looks good" is all it takes
    $('r-crest').src = crestOf(S.cls); $('r-crest').alt = S.cls + ' badge';
    $('r-title').textContent = S.race + ' ' + S.cls;
    $('r-sub').textContent = alignShown() ? FR.alignment(S.u, n) : ''; $('r-sub').hidden = !alignShown();
    $('r-name').textContent = tx('goesBy', { name: S.name });
    $('r-blurb').textContent = cls.blurb;
    $('b-to-portrait').textContent = G.live ? tx('paintMine') : tx('makeMine');
    var bars = $('r-bars'), mx = 1; clear(bars);
    keys.forEach(function (k) { mx = Math.max(mx, S.u[k]); });
    keys.forEach(function (k) {
      var b = el('b'), f = el('i'); b.appendChild(f); bars.appendChild(el('span', '', FR.TRAIT_LABELS[k])); bars.appendChild(b);
      setTimeout(function () { f.style.width = Math.round(100 * Math.max(0, S.u[k]) / mx) + '%'; }, 60);
    });
    var axes = $('r-axes'); clear(axes);
    [[TH.axes[0][0], TH.axes[0][1], S.u.order / n / 0.9], [TH.axes[1][0], TH.axes[1][1], S.u.light / n / 0.8]].forEach(function (a) {
      var row = el('div', 'axis'), b = el('b'), dot = el('i'); b.appendChild(dot);
      row.appendChild(el('span', '', a[0])); row.appendChild(b); row.appendChild(el('span', '', a[1])); axes.appendChild(row);
      dot.style.left = '50%';
      setTimeout(function () { dot.style.left = Math.round(50 + 50 * Math.max(-1, Math.min(1, a[2]))) + '%'; }, 60);
    });
    var chips = function (box, ranks, cur, set) {
      clear(box);
      var top = ranks.slice(0, 3);
      if (!top.some(function (r) { return r.name === cur; })) { top[2] = ranks.filter(function (r) { return r.name === cur; })[0]; }
      top.forEach(function (r) {
        var c = el('button', 'chip' + (r.name === cur ? ' on' : '')); c.type = 'button'; c.setAttribute('aria-pressed', r.name === cur ? 'true' : 'false');
        c.appendChild(document.createTextNode(r.name)); c.appendChild(el('small', '', r.pct + '%'));
        c.addEventListener('click', function () { set(r.name); setPortrait('', ''); S.noPic = false; S.origin = ''; S.name = ''; renderReveal(); save(); });
        box.appendChild(c);
      });
    };
    chips($('r-classes'), S.clsRank, S.cls, function (v) { S.cls = v; });
    chips($('r-races'), S.raceRank, S.race, function (v) { S.race = v; });
    $('r-perk').textContent = tx('asA') + S.race + ': ' + FR.RACES[S.race].perk;
  }
  /* "Looks good": a fitting ready-made picture and the suggested name, and straight to the game.
     Both can be changed later from the sheet. */
  $('b-looks').addEventListener('click', function () {
    if (!S.portrait && !S.noPic) { setPortrait(sampleOf(S.cls), ''); }
    buildSheet(); save(); go('play');
  });
  $('b-retake').addEventListener('click', function () {
    ask({ title: tx('retakeTitle'), text: tx('retakeText'), yes: tx('retake'), no: tx('keepThis'), onYes: function () { var m = S.mode; fresh(); S.mode = m; startQuiz(); } });
  });
  var portraitFrom = 'reveal', sheetFrom = 'portrait';
  $('b-to-portrait').addEventListener('click', function () { portraitFrom = 'reveal'; go('portrait'); });

  /* ---------- 5. the picture ----------
     With AI pictures on, this is a studio: pick features, describe, paint. Without, it is a wall of
     the pack's ready-made pictures to choose from, and nothing on it pretends to be more. */
  var character = function () { return { cls: S.cls, race: S.race, look: S.look, desc: S.desc, name: S.name }; };
  var topTraits = function () { return Object.keys(FR.TRAIT_LABELS).sort(function (a, b) { return S.u[b] - S.u[a]; }); };
  var summary = function () {
    var l = S.look, bits = [l.body && l.body !== 'Neither' ? l.body.toLowerCase() : '', S.race, S.cls].filter(Boolean).join(' ');
    var extra = ['age', 'build', 'hair', 'mark', 'bearing'].map(function (k) { return l[k] ? FR.LOOK_LABELS[k].toLowerCase() + ': ' + l[k].toLowerCase() : ''; }).filter(Boolean).join(', ');
    var top = topTraits().slice(0, 2).map(function (k) { return FR.TRAIT_LABELS[k].toLowerCase(); }).join(' and ');
    return (S.name ? S.name + ', a ' : 'A ') + bits + (extra ? '; ' + extra : '') + '; ' + FR.alignment(S.u, S.answered || 12).toLowerCase() + '; strongest in ' + top;
  };
  var painting = false, workTimer = 0;
  var fitDesc = function () { var t = $('p-desc'); t.style.height = 'auto'; t.style.height = Math.max(92, t.scrollHeight + 2) + 'px'; };
  enter.portrait = function () {
    $('p-title').textContent = S.race + ' ' + S.cls;
    $('p-crest').src = crestOf(S.cls);
    $('p-desc').value = S.desc;
    renderLook(); renderGallery(); renderEasel(); setTimeout(fitDesc, 30);
  };
  $('p-back').addEventListener('click', function () { go(portraitFrom); });
  function renderLook() {
    var box = $('p-groups'); clear(box);
    Object.keys(FR.LOOK).forEach(function (k) {
      var g = el('div', 'grp'), r = el('div', 'grp-r'); r.setAttribute('role', 'group'); r.setAttribute('aria-label', FR.LOOK_LABELS[k]);
      g.appendChild(el('div', 'grp-l', FR.LOOK_LABELS[k]));
      FR.LOOK[k].forEach(function (v) {
        var c = el('button', 'chip' + (S.look[k] === v ? ' on' : ''), v); c.type = 'button'; c.setAttribute('aria-pressed', S.look[k] === v ? 'true' : 'false');
        c.addEventListener('click', function () { S.look[k] = S.look[k] === v ? null : v; touched(); renderLook(); save(); });
        r.appendChild(c);
      });
      g.appendChild(r); box.appendChild(g);
    });
  }
  /* the pack's ready-made pictures, the one for this hero's class first, and "no picture" last */
  function renderGallery() {
    var box = $('p-gallery'), names = Object.keys(FR.CLASSES).filter(function (c) { return c !== S.cls; });
    clear(box);
    [S.cls].concat(names).forEach(function (c) {
      var src = sampleOf(c), b = el('button', 'tile' + (S.portrait === src ? ' on' : '')), img = el('img');
      b.type = 'button'; b.setAttribute('aria-pressed', S.portrait === src ? 'true' : 'false'); b.setAttribute('aria-label', tx('pictureOf', { race: TH.samples[c] || '', cls: c }));
      img.src = src; img.alt = ''; img.loading = 'lazy'; b.appendChild(img);
      b.addEventListener('click', function () { setPortrait(src, ''); save(); renderGallery(); renderEasel(); tableSync(); });
      box.appendChild(b);
    });
    var none = el('button', 'tile none' + (!S.portrait && S.noPic ? ' on' : '')), badge = el('img');
    none.type = 'button'; none.setAttribute('aria-pressed', !S.portrait && S.noPic ? 'true' : 'false');
    badge.src = crestOf(S.cls); badge.alt = ''; none.appendChild(badge); none.appendChild(el('span', '', tx('noPicture')));
    /* the one deliberate way to have no picture: the table is told to take its copy down too */
    none.addEventListener('click', function () { setPortrait('', ''); S.noPic = true; save(); renderGallery(); renderEasel(); tableSync(); });
    box.appendChild(none);
  }
  /* A choice changed: an auto-written description no longer fits, and any picture is out of date. */
  function touched() {
    if (S.descAuto) { S.desc = ''; S.descAuto = false; $('p-desc').value = ''; fitDesc(); }
    if (S.portrait) { S.stale = true; }
    renderEasel();
  }
  function renderEasel() {
    var has = !!S.portrait, live = G.live, ready = has && S.portrait.indexOf('data:') !== 0;      // ready: one of the pack's own pictures, not one painted for this hero
    $('p-img').hidden = !has || painting; $('p-empty').hidden = has || painting; $('p-work').hidden = !painting;
    if (has) { $('p-img').src = S.portrait; $('p-img').alt = 'Picture of your ' + S.race + ' ' + S.cls; }
    $('p-src').textContent = painting ? '' : (!live ? tx('pickHint') : (has && !ready ? (S.stale ? tx('stale') + ' ' : '') + S.portraitNote : tx('hintLive')));
    /* the features and the description only steer the painter, so they are only here when there is one */
    ['p-groups', 'p-desc-lbl', 'p-desc', 'b-surprise'].forEach(function (id) { $(id).hidden = !live; });
    $('p-gallery').hidden = live || painting;
    var paint = $('b-paint'), keep = $('b-keep'), keepFirst = !live || (has && !ready);          // once there is a picture of your own, keeping it is the main thing to do
    paint.hidden = !live; paint.disabled = painting;
    paint.textContent = painting ? tx('painting') : (has && !ready ? tx('paintAgain') : tx('paint'));
    keep.hidden = painting; keep.textContent = has ? tx('keep') : (S.noPic ? tx('keepNone') : tx('skip'));
    keep.className = keepFirst ? 'btn wax' : 'btn ghost slim'; paint.className = keepFirst ? 'btn ghost slim' : 'btn wax';
    keep.style.order = keepFirst ? '-1' : '';
  }
  $('p-desc').addEventListener('input', function () { S.desc = $('p-desc').value; S.descAuto = false; fitDesc(); if (S.portrait && !S.stale) { S.stale = true; renderEasel(); } });
  $('b-surprise').addEventListener('click', function () {
    // fill in only what the player left open: their own choices are never changed
    Object.keys(FR.LOOK).forEach(function (k) { if (!S.look[k]) { S.look[k] = FR.pick(FR.LOOK[k]); } });
    renderLook();
    var done = function (t) { S.desc = t; S.descAuto = true; if (S.portrait) { S.stale = true; } $('p-desc').value = t; fitDesc(); $('b-surprise-t').textContent = tx('surprise'); $('b-surprise').disabled = false; renderEasel(); save(); };
    if (!G.live) { done(FR.localDescription(character())); return; }
    $('b-surprise-t').textContent = tx('thinking'); $('b-surprise').disabled = true;
    AI.text(TH.ai.describe, 'Character: ' + summary(), { max: 120 }).then(function (j) { done(j.text); }).catch(function () { done(FR.localDescription(character())); });
  });
  $('b-paint').addEventListener('click', function () {
    if (painting || !G.live) { return; }
    var lines = tx('work'), li = 0;
    painting = true; $('p-err').hidden = true; $('p-work-text').textContent = lines[0]; renderEasel();
    workTimer = setInterval(function () { li = Math.min(lines.length - 1, li + 1); $('p-work-text').textContent = lines[li]; }, 5200);
    var finish = function (src, note) { clearInterval(workTimer); painting = false; setPortrait(src, note); renderEasel(); save(); tableSync(); FR.Dice.Sound.sparkle(); };
    var fail = function (msg) { clearInterval(workTimer); painting = false; renderEasel(); $('p-err').textContent = msg; $('p-err').hidden = false; };
    S.lastPrompt = FR.portraitSubject(character()) + ' ' + TH.ai.style;
    AI.image(S.lastPrompt).then(function (j) {
      finish(j.image, tx('painted', { s: j.seconds }));
    }).catch(function (e) { fail(e.name === 'AbortError' ? tx('slow') : (e.status === 401 ? 'OpenAI did not accept the key. Check it under Connect OpenAI.' : tx('failed', { e: e.message }))); });
  });
  $('b-keep').addEventListener('click', function () { sheetFrom = 'portrait'; go('sheet'); tableSync(); });

  /* ---------- 6. sheet ---------- */
  function buildSheet() { S.sheet = FR.build(S.u, S.cls, S.race, S.answered || 12); return S.sheet; }
  function localOrigin() { return TH.origin({ name: S.name, first: S.name.split(' ')[0], race: S.race, cls: S.cls, top: topTraits()[0] }); }
  var spaced = function (m) { return FR.fmt(m).replace(/^([+−])/, '$1 '); };
  enter.sheet = function () {
    if (!S.name) { S.name = FR.rollName(S.race, S.look.body); }
    buildSheet(); renderSheet(); writeOrigin(); save();
  };
  $('sh-back').addEventListener('click', function () { go(sheetFrom); });
  $('b-repaint').addEventListener('click', function () { portraitFrom = 'sheet'; go('portrait'); });
  function row(dl, k, v) { var d = el('div'); d.appendChild(el('dt', '', k)); d.appendChild(el('dd', '', v)); dl.appendChild(d); }
  /* The sheet in plain words, unless "Show rules details" is on: then it is the full one, numbers and all. */
  function renderSheet() {
    var sh = S.sheet, cls = FR.CLASSES[S.cls], art = $('s-img'), d = G.details;
    art.src = S.portrait || crestOf(S.cls); art.alt = S.portrait ? 'Picture of ' + S.name : S.cls + ' badge';
    art.parentNode.classList.toggle('crest-only', !S.portrait);
    $('s-name').value = S.name;
    $('s-line').textContent = (d ? 'Level 1 ' : '') + S.race + ' ' + S.cls + (sh.alignment && alignShown() ? ' · ' + sh.alignment : '');
    var v = $('s-vitals'); clear(v);
    if (d) {
      row(v, 'Armor Class', sh.ac + ' (' + sh.armor + ')');
      row(v, 'Hit Points', sh.hp + ' (1d' + cls.hd + ' ' + spaced(sh.mods.CON) + ')');
      row(v, 'Speed', sh.speed + ' feet');
    } else {
      row(v, tx('health'), sh.hp + ': ' + tx('healthHint'));
      row(v, tx('armor'), sh.ac + ': ' + tx('armorHint'));
    }
    var ab = $('s-abil'); clear(ab); $('s-abil-wrap').hidden = !d;
    FR.ABILITIES.forEach(function (k) {
      var x = el('div'); x.appendChild(el('b', '', k)); x.appendChild(el('strong', '', String(sh.scores[k]))); x.appendChild(el('span', '', '(' + FR.fmt(sh.mods[k]) + ')')); ab.appendChild(x);
    });
    var s = $('s-skills'); clear(s);
    if (d) {
      row(s, tx('skills'), cls.skills.map(function (k) { return k + ' ' + FR.fmt(sh.skills[k].mod); }).join(', '));
      row(s, tx('attacks'), sh.attacks.map(function (a) { return a.n + ' ' + FR.fmt(a.hit) + ' (' + a.cnt + 'd' + a.die + (a.dmg ? ' ' + spaced(a.dmg) : '') + ')'; }).join(', '));
    } else {
      var good = FR.ACTIONS.filter(function (a) { return sh.skills[a.skill] && sh.skills[a.skill].prof; }).map(function (a) { return a.label; });
      if (good.length) { row(s, tx('goodAtHead'), good.join(', ')); }
      row(s, tx('fightsWith'), sh.attacks.map(function (a) { return a.n; }).join(', '));
    }
    row(s, tx('trait'), sh.perk);
  }
  function swapName(text, from, to) { return text.split(from).join(to).split(from.split(' ')[0]).join(to.split(' ')[0]); }
  function writeOrigin() {
    var keyNow = TH.id + '|' + S.cls + '|' + S.race, box = $('s-origin');
    if (S.origin && S.originKey === keyNow) { box.classList.remove('wait'); box.textContent = S.origin; return; }
    if (!G.live) { S.origin = localOrigin(); S.originKey = keyNow; S.originName = S.name; box.classList.remove('wait'); box.textContent = S.origin; return; }
    box.classList.add('wait'); box.textContent = tx('originWait');
    var asked = S.name;
    AI.text(TH.ai.origin, 'Character: ' + summary(), { max: 140 }).then(function (j) { S.origin = j.text; }).catch(function () { S.origin = localOrigin(); }).then(function () {
      S.originKey = keyNow; S.originName = asked;
      if (S.name !== asked) { S.origin = swapName(S.origin, asked, S.name); S.originName = S.name; }
      box.classList.remove('wait'); box.textContent = S.origin; save();
    });
  }
  function rename(name) {
    var old = S.originName || S.name;
    S.name = name;
    if (S.origin && old && old !== name) { S.origin = swapName(S.origin, old, name); S.originName = name; $('s-origin').textContent = S.origin; }
    save(); tableSync();
  }
  $('b-name').addEventListener('click', function () {
    var n = FR.rollName(S.race, S.look.body), guard = 0;
    while (n === S.name && guard++ < 5) { n = FR.rollName(S.race, S.look.body); }
    $('s-name').value = n; rename(n);
  });
  $('s-name').addEventListener('change', function () { var v = $('s-name').value.trim(); if (v) { rename(v); } else { $('s-name').value = S.name; } });
  $('b-play').addEventListener('click', function () { var v = $('s-name').value.trim(); if (v && v !== S.name) { rename(v); } go('play'); });

  /* ---------- 7. at the table ---------- */
  enter.play = function () { if (!S.sheet) { buildSheet(); } renderPlay(); tableSync(); };
  /* the words a roll is told in: handed to FR.play, which builds the sentences */
  var words = function () { return { rolled: tx('saidRolled'), keep: tx('saidKeep'), higher: tx('higher'), lower: tx('lower'), and: tx('and'), plus: tx('plus'), plusFor: tx('plusFor'), minus: tx('minus'), bestOf: tx('bestOf'), worstOf: tx('worstOf') }; };
  var diceW = function () { return { numbers: tx('numberWords'), one: tx('diceOne'), many: tx('diceMany') }; };
  /* why a roll gets its bonus, by skill or by ability: "being sneaky", "a way with words" */
  var whyOf = function (k) {
    var why = { Athletics: tx('whyAthletics'), Acrobatics: tx('whyAcrobatics'), 'Sleight of Hand': tx('whySleight'), Stealth: tx('whyStealth'), Arcana: tx('whyArcana'), History: tx('whyHistory'),
      Investigation: tx('whyInvestigation'), Nature: tx('whyNature'), Religion: tx('whyReligion'), 'Animal Handling': tx('whyAnimal'), Insight: tx('whyInsight'), Medicine: tx('whyMedicine'),
      Perception: tx('whyPerception'), Survival: tx('whySurvival'), Deception: tx('whyDeception'), Intimidation: tx('whyIntimidation'), Performance: tx('whyPerformance'), Persuasion: tx('whyPersuasion'),
      STR: tx('whySTR'), DEX: tx('whyDEX'), CON: tx('whyCON'), INT: tx('whyINT'), WIS: tx('whyWIS'), CHA: tx('whyCHA') };
    return why[k] || '';
  };
  var rolledOnce = function () { return store.get('firstroll.rolled') === '1'; };
  function renderPlay() {
    var sh = S.sheet, fight = S.tab === 'fight', d = G.details, tabs = tx('tabs').slice();
    if (!d) { tabs[1] = tx('tabOther'); }
    $('s-play').classList.toggle('fight', fight);
    $('pl-img').src = S.portrait || crestOf(S.cls); $('pl-img').alt = '';
    $('pl-medal').classList.toggle('crest-only', !S.portrait);
    $('pl-name').textContent = S.name; $('pl-sub').textContent = S.race + ' ' + S.cls + (d ? ', level 1' : '');
    var st = $('pl-stats'); clear(st);
    (d ? [['HP', sh.hp], ['Armor', sh.ac]] : [[tx('statHealth'), sh.hp], [tx('statArmor'), sh.ac]]).concat(fight ? [[d ? 'Init' : tx('statTurn'), S.init === null ? '–' : S.init]] : []).forEach(function (p) {
      var x = el('div'); x.appendChild(el('strong', '', String(p[1]))); x.appendChild(document.createTextNode(p[0])); st.appendChild(x);
    });
    /* until the first roll has been made on this device: one line that says what to do here */
    $('pl-nudge').hidden = rolledOnce(); $('pl-nudge').textContent = tx('nudge');
    var bar = $('pl-tabs'); clear(bar);
    ['do', 'checks', 'fight'].forEach(function (id, i) {
      var b = el('button', 'tab' + (id === 'fight' ? ' fight' : '') + (S.tab === id ? ' on' : ''), tabs[i]); b.type = 'button'; b.setAttribute('aria-pressed', S.tab === id ? 'true' : 'false');
      b.addEventListener('click', function () { S.tab = id; renderPlay(); $('pl-list').scrollTop = 0; tune(); });
      bar.appendChild(b);
    });
    var list = $('pl-list'); clear(list);
    /* With rules details on, a row carries its bonus and a gold dot for a trained skill. Without, a
       number with no reason given would only puzzle, so the row just says when the hero is good at it. */
    var add = function (label, hint, modText, ctx, good, cls) {
      var r = el('button', 'row' + (cls ? ' ' + cls : '')), l = el('span', 'row-l'), n = el('span', 'row-n'); r.type = 'button';
      if (good && d) { n.appendChild(el('i')); }
      n.appendChild(document.createTextNode(label)); l.appendChild(n); l.appendChild(el('span', 'row-h', hint));
      r.appendChild(l);
      if (d) { r.appendChild(el('span', 'row-m', modText)); } else if (good) { r.appendChild(el('span', 'row-g', tx('goodAt'))); }
      r.addEventListener('click', function () { openDice(ctx); });
      list.appendChild(r);
    };
    /* what a row rolls. title/label: its plain name; note: the rules line; plain: the line shown instead when details are off; why: the reason for the bonus */
    var check = function (title, what, mod, kind, extra) {
      var c = { title: title, label: title, note: what + ' · d20 ' + spaced(mod), plain: '', sides: 20, count: 1, mod: mod, kind: kind || 'check', why: '' };
      if (extra) { Object.keys(extra).forEach(function (k) { c[k] = extra[k]; }); }
      return c;
    };
    if (S.tab === 'do') {
      FR.ACTIONS.forEach(function (a) {
        var sk = sh.skills[a.skill];
        add(a.label, d ? a.skill + ' · ' + a.hint : a.hint, FR.fmt(sk.mod), check(a.label, a.skill, sk.mod, 'check', { plain: a.hint, why: whyOf(a.skill) }), sk.prof);
      });
      (TH.extras || []).forEach(function (x) {
        add(x.label, x.hint, 'd' + x.sides, { title: x.title, label: x.label, note: x.note, plain: x.hint, sides: x.sides, count: 1, mod: 0, kind: 'table', table: x.table }, false, 'extra');
      });
    } else if (S.tab === 'checks') {
      var hints = tx('checkHints');
      FR.ABILITIES.forEach(function (k) {
        add(FR.ABILITY_NAMES[k], hints[k], FR.fmt(sh.mods[k]), check(FR.ABILITY_NAMES[k], 'Ability check', sh.mods[k], 'check', { plain: hints[k], why: whyOf(k) }), !d && sh.mods[k] >= 2);
      });
    } else {
      var turnName = d ? tx('initLabel') : tx('initPlain');
      add(turnName, S.init === null ? tx('initHint') : tx('initDone', { n: S.init }), FR.fmt(sh.init), check(d ? 'Initiative' : turnName, 'Turn order', sh.init, 'init', { plain: tx('initHint'), why: tx('whyInit') }), false, 'first');
      sh.attacks.forEach(function (a) {
        var dmg = a.cnt + 'd' + a.die + (a.dmg ? ' ' + spaced(a.dmg) : '');
        add(a.n, d ? a.hint + ' · ' + dmg + ' ' + tx('damage') : a.hint, FR.fmt(a.hit),
          check(a.n, a.spell ? 'Magic attack' : 'Attack roll', a.hit, 'attack', { plain: a.hint, why: a.spell ? tx('whySpell') : tx('whyAttack'), dmg: { sides: a.die, count: a.cnt, mod: a.dmg } }));
      });
      add(tx('shove'), d ? 'Athletics · ' + tx('shoveHint') : cap(tx('shoveHint')), FR.fmt(sh.skills.Athletics.mod), check(tx('shove'), 'Athletics', sh.skills.Athletics.mod, 'check', { plain: cap(tx('shoveHint')), why: whyOf('Athletics') }), sh.skills.Athletics.prof);
      add(tx('hide'), d ? 'Stealth · ' + tx('hideHint') : cap(tx('hideHint')), FR.fmt(sh.skills.Stealth.mod), check(tx('hide'), 'Stealth', sh.skills.Stealth.mod, 'check', { plain: cap(tx('hideHint')), why: whyOf('Stealth') }), sh.skills.Stealth.prof);
      var say = el('p', 'say'); say.appendChild(el('b', '', tx('noRollB'))); say.appendChild(document.createTextNode(tx('noRoll')));
      list.appendChild(say);
    }
  }
  $('b-free').addEventListener('click', function () { openDice(free(20, 1)); });
  $('pl-medal').addEventListener('click', function () { sheetFrom = 'play'; go('sheet'); });
  /* the small menu on the play screen: the ways out of it */
  function openMenu() {
    var box = $('mn-list'), tb = FR.table;
    var item = function (label, fn) { var b = el('button', 'btn ink', label); b.type = 'button'; b.addEventListener('click', function () { $('menu').hidden = true; fn(); }); box.appendChild(b); };
    clear(box);
    item(tx('home'), function () { go('title'); });
    if (TH.story && TH.story.length) { item(tx('storySoFar'), function () { story.i = 0; story.then = 'play'; renderStory(); go('story'); }); }
    item(tx('newCharacter'), openWays);
    item(tx('settings'), openSettings);
    if (tb && tb.isPlayer()) {
      item(tx('leaveTable', { code: tb.code() }), function () {
        ask({ title: tx('leaveTitle', { code: tb.code() }), text: tx('leaveText'), yes: tx('leaveYes'), no: tx('stay'), onYes: function () { tb.leave(); } });
      });
    }
    $('menu').hidden = false;
  }
  $('pl-menu').addEventListener('click', openMenu);
  $('mn-x').addEventListener('click', function () { $('menu').hidden = true; });

  /* ---------- 8. dice tray ----------
     Opening the tray never rolls, and neither does changing what is in it. The dice wait until the
     player asks: the Roll button, a flick across the tray, or a shake of the phone. */
  function free(sides, count) {
    var n = Math.max(1, Math.min(6, count));
    return { title: n + 'd' + sides, label: play.diceWords(n, sides, diceW()), note: tx('freeNote'), plain: tx('freeNote'), sides: sides, count: n, mod: 0, kind: 'free' };
  }
  var usesAdv = play.usesAdv;
  var spec = function () { return play.spec(D.ctx, D.adv); };
  var result = function () { return play.result(D.ctx, D.adv, D.values); };
  var fightish = function () { var k = D.ctx.kind; return k === 'attack' || k === 'damage' || k === 'init'; };
  var dieColor = function () { return fightish() ? TH.dice.fight : FR.CLASSES[S.cls].color; };
  var css = function (c) { return typeof c === 'number' ? '#' + ('000000' + c.toString(16)).slice(-6) : c; };       // the pack's dice colours are numbers, for the 3D tray
  function trayBounds() {
    var c = $('tray').getBoundingClientRect(), t = $('tray-top').getBoundingClientRect(), b = $('tray-bot').getBoundingClientRect();
    FR.Dice.setBounds({ left: 6, top: t.bottom - c.top - 14, right: c.width - 6, bottom: b.top - c.top + 22 });
  }
  /* ----- flat dice: where there is no 3D (no WebGL, or it was lost), and for people who asked for less motion ----- */
  function flatHost() {
    var f = $('flat'), c = $('s-dice').getBoundingClientRect(), t = $('tray-top').getBoundingClientRect(), b = $('tray-bot').getBoundingClientRect();
    f.hidden = false;
    /* the dice get the stretch between the tray's header and its footer, however tall those are today */
    f.style.top = Math.max(0, Math.round(t.bottom - c.top - 10)) + 'px'; f.style.bottom = Math.max(0, Math.round(c.bottom - b.top - 16)) + 'px';
    return f;
  }
  var flatDice = function () { var col = dieColor(); return spec().map(function (s) { return { sides: s, color: col }; }); };
  var flatOpts = function (dropped) {
    return { reduced: reduced, floor: 'url(' + TH.art.floor + ') center / cover, ' + css(TH.dice.floorBase), rim: TH.dice.rim.color, ink: fightish() ? TH.dice.fightInk : '', dropped: dropped || [] };
  };
  var droppedOf = function (vals) { var r = play.result(D.ctx, D.adv, vals); return r.two ? [r.keptIx === 0 ? 1 : 0] : []; };
  /* the dice as they stand: waiting to be rolled, or lying where they landed */
  function flatRest() {
    $('tray').style.visibility = 'hidden'; clear($('badges'));
    FR.FlatDice.draw(flatHost(), flatDice(), D.shown ? D.values : [], flatOpts(D.shown ? droppedOf(D.values) : []));
  }
  /* The 3D tray stopped drawing while it was open (the browser took the graphics away): carry on flat. */
  function lostGL() {
    var was = D.rolling;
    D.booted = false; D.flat = true;
    if (S.screen !== 'dice') { return; }
    D.rolling = false; flatRest(); renderTray();
    if (was) { throwDice(null); }               // the throw that was in the air is thrown again
  }
  function openDice(ctx) {
    FR.FX.stop();
    D.ctx = ctx; D.adv = 'normal'; D.values = []; D.shown = false; D.rolling = false; D.lucky = false;
    go('dice'); renderTray(); tune();
    Shake.rest();
    setTimeout(setTray, 60);
  }
  /* Lay the tray out and leave the dice waiting. Nothing rolls here. */
  function setTray() {
    if (S.screen !== 'dice') { return; }
    if (!D.booted && !D.flat) {
      if (reduced) { D.flat = true; }           // less motion: the dice do not tumble, they are simply shown
      else {
        try { FR.Dice.init($('tray'), {}); D.booted = true; FR.Dice.onFrame(placeBadges); FR.Dice.onLost(lostGL); FR.Dice.setScene(TH.dice, TH.art.floor); }
        catch (e) { D.booted = false; D.flat = true; }       // no WebGL here: the dice are drawn flat instead
      }
      if (D.flat) { renderTray(); }             // flat dice cannot be flicked, so the words about how to roll change
    }
    if (D.flat) { flatRest(); return; }
    $('flat').hidden = true; $('tray').style.visibility = '';
    clear($('badges')); FR.Dice.clear(); FR.Dice.resize(); trayBounds(); FR.Dice.draw();
  }
  /* what was asked for has changed (more dice, another die, two dice instead of one): back to waiting */
  function resetTray() { D.values = []; D.shown = false; D.lucky = false; renderTray(); setTray(); }
  /* what is about to be rolled, before anything is */
  function willRoll() {
    var c = D.ctx, two = usesAdv(c) && D.adv !== 'normal', b;
    if (G.details) { return (c.count > 1 || c.kind === 'free' ? c.count : '') + 'd' + c.sides + (c.mod ? ' ' + spaced(c.mod) : '') + (two ? ' · ' + (D.adv === 'adv' ? tx('advBest') : tx('advWorst')) : ''); }
    if (c.kind === 'free') { return ''; }       // the title already says it
    b = play.bonus(c.mod, c.why, words());
    return (two ? (D.adv === 'adv' ? tx('willBest') : tx('willWorst')) : play.diceWords(c.count, c.sides, diceW())) + (b ? ', ' + b : '') + '.';
  }
  function renderTray() {
    var c = D.ctx, r = D.shown ? result() : null, d = G.details;
    $('d-title').textContent = c.kind === 'free' && !d ? play.diceWords(c.count, c.sides, diceW()) : c.title;
    $('d-note').textContent = d ? c.note : (c.plain || '');
    /* one die, or two and keep the best or the worst. The rules call the last two advantage and
       disadvantage; in plain words they are just what they do. */
    var seg = $('d-adv'); clear(seg); seg.hidden = !usesAdv(c); seg.classList.toggle('plain', !d); seg.setAttribute('aria-label', tx('advLabel'));
    [['dis', tx('disTerm'), tx('advWorst')], ['normal', tx('normalTerm'), tx('advOne')], ['adv', tx('advTerm'), tx('advBest')]].forEach(function (m) {
      var b = el('button', D.adv === m[0] ? 'on' : '', d ? m[1] : m[2]); b.type = 'button'; b.setAttribute('aria-pressed', D.adv === m[0] ? 'true' : 'false');
      b.setAttribute('aria-label', d && m[0] !== 'normal' ? m[1] + ': ' + m[2] : m[2]); b.title = m[2];
      b.addEventListener('click', function () { if (D.adv !== m[0] && !D.rolling) { D.adv = m[0]; resetTray(); } });
      seg.appendChild(b);
    });
    var tot = $('d-total');
    tot.className = 'result-num' + (r ? ' pop' : '') + (r && r.nat === 20 ? ' crit' : '') + (r && r.nat === 1 ? ' fumble' : '');
    tot.textContent = r ? String(r.total) : '';
    var math = '', say = '', attack = c.kind === 'attack';
    if (r) {
      if (c.table) { math = c.table[r.kept - 1]; }
      else if (d) { math = (r.two ? 'Kept ' + r.kept + ' of ' + D.values.join(' and ') : D.values.join(' + ')) + (c.mod ? ' ' + spaced(c.mod) : ''); }
      else { math = play.sentence(c, D.adv, D.values, words()); }
      /* whether an attack hits is the DM's call, so the damage roll is an offer, not a verdict */
      say = c.kind === 'damage' ? tx('tellDamage') : (attack && c.dmg ? tx('hitsSay') : tx('tell'));
      if (r.nat === 20) { say = attack ? tx('nat20Attack') : tx('nat20'); }
      if (r.nat === 1) { say = attack ? tx('nat1Attack') : tx('nat1'); }
    } else if (D.rolling) { say = tx('rolling'); }
    else { math = willRoll(); say = (D.flat ? tx('howRollFlat') : tx('howRoll')) + (Shake.on() ? ' ' + tx('howShake') : ''); }
    $('d-math').textContent = math; $('d-say').textContent = say;
    $('d-roll').textContent = D.shown ? tx('rollAgain') : tx('roll'); $('d-roll').disabled = D.rolling;
    var second = $('d-second'), label = '';
    if (r && attack && c.dmg && r.nat !== 1) { label = tx('hits'); }
    if (r && r.nat === 1 && S.sheet && S.sheet.lucky && !D.lucky) { label = tx('lucky'); }
    second.hidden = !label; second.textContent = label;
    /* any other dice: always there with rules details on; otherwise only once "Roll other dice" was asked for */
    var freeRoll = c.kind === 'free', rail = $('d-rail');
    $('d-rail-wrap').hidden = !d && !freeRoll; $('d-rail-hint').hidden = d || !freeRoll; $('d-rail-hint').textContent = tx('railHint');
    clear(rail);
    [4, 6, 8, 10, 12, 20].forEach(function (sd) {
      var on = sd === c.sides && freeRoll, b = el('button', on ? 'on' : '', (G.details ? 'd' : '') + sd); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', play.diceWords(1, sd, diceW()));
      b.addEventListener('click', function () { if (D.rolling) { return; } D.ctx = free(sd, freeRoll ? c.count : 1); D.adv = 'normal'; resetTray(); });
      rail.appendChild(b);
    });
    $('d-count').textContent = String(c.count);
    var sh = $('d-shake');
    sh.hidden = !Shake.can(); sh.setAttribute('aria-pressed', Shake.on() ? 'true' : 'false'); sh.classList.toggle('on', Shake.on());
    $('d-shake-t').textContent = Shake.on() ? tx('shakeOn') : tx('shakeOff');
  }
  function placeBadges() {
    var box = $('badges');
    if (D.flat || !D.shown || D.values.length < 2) { if (box.firstChild) { clear(box); } return; }
    if (box.childNodes.length === D.values.length) { return; }
    clear(box);
    var r = result(), top = $('tray').getBoundingClientRect();
    D.values.forEach(function (v, i) {
      var p = FR.Dice.screenPos(i); if (!p) { return; }
      var b = el('div', 'badge' + (r.two && i !== r.keptIx ? ' drop' : ''), String(v));
      b.style.left = p.x + 'px'; b.style.top = Math.max(top.height * 0.12, p.y - p.r - 20) + 'px'; box.appendChild(b);
    });
  }
  function throwDice(flick) {
    FR.FX.stop();
    if (D.rolling || S.screen !== 'dice' || !D.ctx) { return; }
    var sp = spec(), c = D.ctx, adv = D.adv;
    D.rolling = true; D.shown = false; D.values = []; clear($('badges')); renderTray();
    var land = function (vals) {
      if (S.screen !== 'dice' || D.ctx !== c) { return; }       // the tray was closed, or changed, while the dice were in the air
      D.values = vals; D.rolling = false; D.shown = true;
      var r = result();
      if (r.two && D.booted && !D.flat) { FR.Dice.dim(r.keptIx === 0 ? 1 : 0, true); }
      if (c.kind === 'init') { S.init = r.total; }
      renderTray();
      /* the big moments play their own sounds */
      if (r.nat === 20) { FR.FX.crit({ anchor: $('d-total'), host: app, fx: TH.fx, reduced: reduced }); }
      else if (r.nat === 1) { FR.FX.fumble({ anchor: $('d-total'), host: app, fx: TH.fx, reduced: reduced }); }
      Shake.rest();
      if (!rolledOnce()) { store.set('firstroll.rolled', '1'); }
      /* at a table, everyone sees what was rolled */
      if (FR.table && FR.table.active()) { FR.table.roll(play.entry(c, adv, vals, words())); }
    };
    if (D.flat || !D.booted) {
      var vals = sp.map(function (s) { return 1 + Math.floor(Math.random() * s); });
      FR.FlatDice.roll(flatHost(), flatDice(), vals, flatOpts(droppedOf(vals))).then(function (ok) {
        if (ok) { land(vals); } else if (D.ctx === c && D.rolling && S.screen === 'dice') { D.rolling = false; renderTray(); }
      });
      return;
    }
    FR.Dice.setTheme(dieColor(), fightish() ? TH.dice.fightInk : TH.dice.ink);
    FR.Dice.roll(sp, flick, land);
  }
  /* leaving the tray, by any door: nothing is left running */
  function leaveTray() {
    FR.FX.stop();
    if (D.booted) { FR.Dice.stop(); }
    FR.FlatDice.clear($('flat')); $('flat').hidden = true;
    D.rolling = false;
  }
  $('d-roll').addEventListener('click', function () { throwDice(null); });
  $('d-second').addEventListener('click', function () {
    if (D.rolling || !D.shown) { return; }
    var r = result(), c = D.ctx;
    if (r.nat === 1 && S.sheet && S.sheet.lucky && !D.lucky) { D.lucky = true; throwDice(null); return; }
    var crit = r.nat === 20, n = crit ? c.dmg.count * 2 : c.dmg.count, name = c.title + ' ' + tx('damage');
    D.ctx = { title: name, label: name, note: (crit ? tx('crit') + ' · ' : '') + n + 'd' + c.dmg.sides + (c.dmg.mod ? ' ' + spaced(c.dmg.mod) : ''), plain: crit ? tx('critPlain') : '',
      sides: c.dmg.sides, count: n, mod: c.dmg.mod, why: tx('whyDamage'), kind: 'damage' };
    D.adv = 'normal'; resetTray();
    setTimeout(function () { throwDice(null); }, 90);       // "Roll damage" is a roll button: the dice go once the tray has been laid out for them
  });
  var bump = function (dn) { var c = D.ctx; if (D.rolling) { return; } D.ctx = free(c.sides, (c.kind === 'free' ? c.count : 1) + dn); D.adv = 'normal'; resetTray(); };
  $('d-less').addEventListener('click', function () { if (D.ctx.kind === 'free' && D.ctx.count > 1) { bump(-1); } });
  $('d-more').addEventListener('click', function () { if (D.ctx.count < 6) { bump(1); } });
  $('d-close').addEventListener('click', function () { FR.FX.stop(); go('play'); });
  /* a flick across the tray throws the dice that way; a plain tap does nothing, so nobody rolls by accident */
  (function () {
    var cv = $('tray'), pts = [];
    cv.addEventListener('pointerdown', function (e) { pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }]; if (cv.setPointerCapture) { cv.setPointerCapture(e.pointerId); } });
    cv.addEventListener('pointermove', function (e) { if (pts.length) { pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (pts.length > 6) { pts.shift(); } } });
    cv.addEventListener('pointerup', function (e) {
      if (!pts.length) { return; }
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      var a = pts[0], b = pts[pts.length - 1], dt = Math.max(16, b.t - a.t) / 1000, dx = b.x - a.x, dy = b.y - a.y;
      pts = [];
      if (Math.sqrt(dx * dx + dy * dy) >= 24) { throwDice({ vx: dx / dt, vz: dy / dt }); }
    });
  })();
  window.addEventListener('resize', function () {
    if (S.screen !== 'dice') { return; }
    if (D.flat) { if (!D.rolling) { flatRest(); } } else if (D.booted) { FR.Dice.resize(); trayBounds(); }
  });

  /* ----- shake to roll -----
     The phone's motion sensor, read through FR.play.shaker. Android gives it freely; iOS wants to be
     asked from a tap, which is what the "Shake to roll" control in the tray is for. The choice is
     remembered. Where there is no sensor to speak of (a desktop), the control is not shown. */
  var Shake = (function () {
    var KEY = 'firstroll.shake', sh = play.shaker(), on = false, heard = false, asked = false, grav = null, stopT = 0;
    var DM = window.DeviceMotionEvent, has = !!DM && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window), mustAsk = !!DM && typeof DM.requestPermission === 'function';
    var now = function () { return performance.now(); };
    function motion(e) {
      var a = e.acceleration, g = e.accelerationIncludingGravity, mag, t = now(), out;
      if (!on || S.screen !== 'dice') { return; }
      if (a && typeof a.x === 'number') { mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
      else if (g && typeof g.x === 'number') {
        /* no gravity-free reading on this phone: follow gravity slowly and take what is left over as the movement */
        grav = grav ? [grav[0] * 0.9 + g.x * 0.1, grav[1] * 0.9 + g.y * 0.1, grav[2] * 0.9 + g.z * 0.1] : [g.x, g.y, g.z];
        mag = Math.sqrt(Math.pow(g.x - grav[0], 2) + Math.pow(g.y - grav[1], 2) + Math.pow(g.z - grav[2], 2));
      } else { return; }
      if (D.rolling) { sh.rest(t); return; }
      out = sh.feed(mag, t);
      if (out.rattle) { FR.Dice.Sound.rattle(out.rattle); }
      clearTimeout(stopT);
      if (out.throw) { throwDice(null); }
      else if (sh.waiting()) { stopT = setTimeout(function () { if (sh.tick(now()) && on && S.screen === 'dice' && !D.rolling) { throwDice(null); } }, sh.options.stop + 30); }   // shaken once, then still: that throws too
    }
    function listen() { if (!heard) { heard = true; window.addEventListener('devicemotion', motion); } }
    function set(v, remember) { on = !!v; if (remember) { store.set(KEY, on ? '1' : '0'); } if (on) { listen(); sh.rest(now()); } if (S.screen === 'dice' && D.ctx) { renderTray(); } }
    function permit(then, refused) {
      var p; try { p = DM.requestPermission(); } catch (e) { p = Promise.reject(e); }
      p.then(function (res) { if (res === 'granted') { then(); } else if (refused) { refused(); } }).catch(function () { if (refused) { refused(); } });
    }
    /* Unless it was switched off, shaking simply works wherever the browser lets it: at once where no
       permission is needed, and where one is, by asking without a tap. A browser that has already
       said yes (or never needs asking) answers yes; iOS, asked for the first time, says no without
       showing anything, and the control in the tray is there to ask properly. */
    if (has && store.get(KEY) !== '0') { if (mustAsk) { permit(function () { set(true, false); }); } else { on = true; listen(); } }
    return {
      can: function () { return has; }, on: function () { return on; },
      rest: function () { sh.rest(now()); clearTimeout(stopT); },
      /* the control in the tray, from a tap */
      toggle: function () {
        if (on) { set(false, true); }
        else if (mustAsk) { permit(function () { set(true, true); }, function () { toast(tx('shakeDenied')); }); }
        else { set(true, true); }
      },
      /* iOS remembers a yes, but wants to be asked from a tap on every visit: the first tap in the tray does it quietly */
      wake: function () { if (has && mustAsk && !on && !asked && store.get(KEY) === '1') { asked = true; permit(function () { set(true, false); }); } },
      /* for tests: switch it on whatever the device, then dispatch a 'devicemotion' event with an `acceleration` */
      enable: function () { has = true; set(true, false); }
    };
  })();
  $('d-shake').addEventListener('click', function () { Shake.toggle(); });
  $('s-dice').addEventListener('click', function () { Shake.wake(); });

  /* ---------- settings: sound, rules details, AI extras ---------- */
  var SPEAKER = { on: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11', off: 'M4 9v6h4l5 4V5L8 9zM16.5 9.5l5 5M21.5 9.5l-5 5' };
  function renderSettings() {
    var has = FR.Music.has(), said = store.get('firstroll.music'), tb = FR.table;
    $('au-music').setAttribute('aria-checked', G.music && has ? 'true' : 'false'); $('au-music').disabled = !has;
    $('au-music-note').textContent = !has ? tx('musicNone') : (said !== '1' && said !== '0' && !G.music ? tx('musicTable') : tx('musicNote'));
    $('au-sfx').setAttribute('aria-checked', G.muted ? 'false' : 'true');
    $('au-details').setAttribute('aria-checked', G.details ? 'true' : 'false');
    var cr = (TH.music && TH.music.credit) || ''; $('au-credit').textContent = cr; $('au-credit').hidden = !cr;
    /* AI extras, in one line: on, on at a table, or off (and complete without) */
    $('live-note').textContent = !serverKnown ? '' : (G.mode === 'direct' ? tx('aiDirect') : (G.live ? tx('aiOn') : (G.mode === 'server' ? tx('aiTable') : tx('aiOff'))));
    $('au-ai').hidden = !serverKnown;
    $('b-connect-title').hidden = !(serverKnown && canDirect && G.mode !== 'server');
    $('b-connect-title').textContent = G.mode === 'direct' ? tx('connectChange') : tx('connect');
    /* the speaker on every screen: a crossed-out one, and a label that says so, when nothing will be heard */
    var quiet = G.muted && !(G.music && has);
    document.querySelectorAll('.audio-open').forEach(function (b) {
      var p = b.querySelector('path');
      b.classList.toggle('off', quiet); b.setAttribute('aria-label', quiet ? tx('soundOff') : tx('soundOn')); b.title = quiet ? tx('soundOff') : tx('soundOn');
      if (p) { p.setAttribute('d', quiet ? SPEAKER.off : SPEAKER.on); }
    });
  }
  function openSettings() { renderSettings(); $('audio').hidden = false; $('au-x').focus(); }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.audio-open')) { openSettings(); } });
  $('au-music').addEventListener('click', function () { G.music = !G.music; store.set('firstroll.music', G.music ? '1' : '0'); FR.Music.enable(G.music); renderSettings(); });
  $('au-sfx').addEventListener('click', function () { G.muted = !G.muted; FR.Dice.Sound.muted = G.muted; store.set('firstroll.sfx', G.muted ? '0' : '1'); renderSettings(); if (!G.muted) { FR.Dice.Sound.tink(); } });
  $('au-details').addEventListener('click', function () {
    G.details = !G.details; store.set('firstroll.details', G.details ? '1' : '0'); renderSettings();
    if (S.screen === 'play') { renderPlay(); } else if (S.screen === 'sheet') { renderSheet(); } else if (S.screen === 'dice' && D.ctx) { renderTray(); if (!D.rolling) { setTray(); } }
  });
  $('au-x').addEventListener('click', function () { $('audio').hidden = true; });
  $('audio').addEventListener('click', function (e) { if (e.target === $('audio')) { $('audio').hidden = true; } });

  /* ---------- particles: whatever the scenario has drifting past (snow, embers, nothing) ---------- */
  (function () {
    var cv = $('embers'), g = cv.getContext('2d'), ps = [], W = 0, H = 0;
    if (reduced || !g) { return; }
    var fit = function () { var r = app.getBoundingClientRect(); W = cv.width = Math.round(r.width); H = cv.height = Math.round(r.height); };
    var spawn = function (y) { return { x: Math.random() * W, y: y, r: 0.6 + Math.random() * 1.6, v: 0.25 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 0.3, ph: Math.random() * 6.28, life: 0.5 + Math.random() * 0.5 }; };
    var rgb = function (c) { var n = parseInt(String(c).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    fit(); window.addEventListener('resize', fit);
    (function loop(t) {
      requestAnimationFrame(loop);
      var P = TH.particles;
      g.clearRect(0, 0, W, H);
      if (!P || P.screens.indexOf(S.screen) < 0) { return; }
      while (ps.length < P.count) { ps.push(spawn(Math.random() * H)); }
      if (ps.length > P.count) { ps.length = P.count; }
      var fall = P.motion === 'fall', c0 = rgb(Array.isArray(P.color) ? P.color[0] : P.color), c1 = Array.isArray(P.color) && P.color[1] ? rgb(P.color[1]) : c0;
      ps.forEach(function (p, ix) {
        p.x += p.vx + Math.sin(t * 0.001 + p.ph) * 0.25;
        p.y += (fall ? 1 : -1) * (p.v * P.speed + P.base);
        if (fall ? p.y > H + 10 : p.y < -10) { ps[ix] = spawn(fall ? -10 : H + 10); return; }
        /* each particle has its own strength k, 0 to 1: it sets how solid it is and which end of the colour pair it takes */
        var k = (p.life - 0.5) * 2, a = P.alpha[0] + (P.alpha[1] - P.alpha[0]) * k;
        if (P.flicker) { a *= 0.5 + 0.5 * Math.sin(t * 0.004 + p.ph); }      // glow and dim, like embers
        if (P.fade) { a *= Math.min(1, p.y / (H * 0.6)); }                   // die away toward the top of the screen
        g.fillStyle = 'rgba(' + Math.round(c0[0] + (c1[0] - c0[0]) * k) + ',' + Math.round(c0[1] + (c1[1] - c0[1]) * k) + ',' + Math.round(c0[2] + (c1[2] - c0[2]) * k) + ',' + a.toFixed(3) + ')';
        g.beginPath(); g.arc(p.x, p.y, p.r * P.size, 0, 6.2832); g.fill();
      });
    })(0);
  })();

  /* ---------- sitting down at a table ----------
     Called by table.js once the server has given this device a seat (j is what it said), and again
     if a table turns out to be playing another scenario. The table owns the scenario: the app
     switches to it before anyone builds a hero. A hero belongs to one scenario, so one made for
     another is never dragged along: the player starts on this table's quick game instead. */
  var seating = Promise.resolve();
  function seated(j) {
    /* one at a time: the table may notice the scenario while the join is still being dealt with */
    var run = function () { return sitAt(j); };
    seating = seating.then(run, run);
    return seating;
  }
  function sitAt(j) {
    var want = (j && j.scenario) || '', switched = false, step = Promise.resolve();
    if (FR.table && FR.table.isPlayer()) { store.set('firstroll.seated', '1'); }
    applyMusic();
    if (want && want !== TH.id && FR.pack(want)) { step = pickTheme(want, true).then(function () { switched = TH.id === want; }); }
    return step.then(function () {
      var k = load();
      var onward = function () {
        if (S.cls && !switched) { tableSync(); return; }                              // already playing this scenario: the table meets the hero in play
        if (k) { if (switched || S.screen === 'title') { resume(); } return; }       // a hero made for this scenario is waiting on this device
        if (switched) { toast(tx('tablePlays', { scenario: TH.name })); startGame('quick'); }
      };
      renderSettings(); renderThemes(); renderTitle();
      /* the seat was left with a hero in it (an earlier session, or another phone): offer it back first,
         unless it is the very hero already in play here (a seat taken back a moment after it was lost) */
      var left = null; try { left = j && j.back && j.save ? JSON.parse(j.save) : null; } catch (e) { left = null; }
      var same = !!left && !switched && !!S.cls && left.cls === S.cls && left.race === S.race && left.name === S.name;
      if (left && !same && FR.table.welcome(j, onward)) { return; }
      onward();
    });
  }

  // nothing may scroll the stage itself (focus and scroll-into-view can try)
  app.addEventListener('scroll', function () { app.scrollTop = 0; app.scrollLeft = 0; });
  applyTheme(TH.id, false);
  tune();                                  // the title screen has music too, from the first tap
  checkServer();
  window.FRState = function () { return S; }; window.FRGo = go; window.FRTheme = pickTheme;
  FR.app = { $: $, el: el, clear: clear, go: go, tx: tx, toast: toast, ask: ask, fetchJson: fetchJson, text: AI.text, image: AI.image, store: store, reduced: reduced, isLive: function () { return G.live; }, screen: function () { return S.screen; },
    saved: function () { var k = load(); return k && k.name ? k : null; }, saveBlob: saveBlob, restore: restore, useScenario: pickTheme, resume: resume, seated: seated, takePortrait: takePortrait,
    /* the name the person at this device goes by at a table (not their hero's) */
    player: function () { return store.get('firstroll.player') || ''; }, setPlayer: function (n) { if (n) { store.set('firstroll.player', n); } },
    /* the picture this device holds is the one the table keeps at `url`: there is no need to send it again */
    portraitAt: function (url) { if (S.cls && S.portrait && url && S.portraitFrom !== url) { S.portraitFrom = url; save(); } },
    details: function () { return G.details; }, shake: Shake, settings: openSettings,
    character: function () {
      return S.cls ? { name: S.name, race: S.race, cls: S.cls, line: S.sheet ? S.sheet.alignment : '', look: FR.portraitSubject(character()).slice(0, 380), portrait: S.portrait, portraitFrom: S.portraitFrom, noPicture: !S.portrait && S.noPic } : null;
    } };

  /* ---------- connect OpenAI (only when this copy runs on your own computer) ---------- */
  var connectFrom = 'title';
  function openConnect() {
    $('audio').hidden = true;
    connectFrom = S.screen === 'dice' ? 'play' : S.screen; $('okey').value = ''; $('okey-err').hidden = true;
    $('okey-ok').textContent = directKey() ? 'A key is saved on this computer.' : '';
    $('b-okey-clear').hidden = !directKey(); go('connect');
  }
  $('b-connect-title').addEventListener('click', openConnect);
  $('c-back').addEventListener('click', function () { go(connectFrom); });
  $('connect').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('okey').value.trim(), err = $('okey-err'), okMsg = $('okey-ok'), b = $('b-okey-save');
    err.hidden = true;
    if (v.length < 20) { err.textContent = 'That is too short to be an OpenAI key. Copy the whole key and paste it here.'; err.hidden = false; return; }
    b.disabled = true; b.textContent = 'Testing the key'; okMsg.textContent = '';
    fetchJson('https://api.openai.com/v1/models', null, 20000, { Authorization: 'Bearer ' + v }).then(function () {
      store.set('firstroll.openai', v); setMode(); renderSettings(); $('okey').value = '';
      okMsg.textContent = 'Connected. Pictures and story help now come from OpenAI.'; $('b-okey-clear').hidden = false;
      setTimeout(function () { go(connectFrom); }, 900);
    }).catch(function (x) {
      err.textContent = x.status === 401 ? 'OpenAI did not accept that key. Check that you copied all of it.' : 'Could not reach OpenAI to test the key. Check your connection and try again.'; err.hidden = false;
    }).then(function () { b.disabled = false; b.textContent = 'Save and test'; });
  });
  $('b-okey-clear').addEventListener('click', function () {
    try { localStorage.removeItem('firstroll.openai'); } catch (x) { /* nothing stored */ }
    setMode(); renderSettings(); $('b-okey-clear').hidden = true; $('okey-ok').textContent = 'Key removed from this computer.';
  });
  enter.connect = function () { setTimeout(function () { $('okey').focus(); }, 80); };
})();
