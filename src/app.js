/* First Roll: screens and flow. Everything a theme can change (cast, copy, art, dice
   dressing) is read from FR.theme, so adding a theme means adding one data file. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text !== undefined) { e.textContent = text; } return e; };
  var clear = function (node) { while (node.firstChild) { node.removeChild(node.firstChild); } };
  var app = $('app');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable: carry on without it */ } }
  };

  var TH = FR.useTheme(document.body.getAttribute('data-theme') || 'northpole');
  var tx = function (key, vars) {
    var s = TH.text[key];
    if (vars && typeof s === 'string') { Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); }); }
    return s;
  };

  var S;
  function blank() {
    return { screen: 'title', qi: 0, answers: [], u: FR.zero(), cls: null, race: null, clsRank: [], raceRank: [], look: {}, desc: '', portrait: '', portraitNote: '',
      name: '', origin: '', originKey: '', originName: '', sheet: null, tab: 'do', init: null, email: '', descAuto: false, stale: false };
  }
  S = blank();
  /* How pictures and writing get made: 'server' (server.js holds the key), 'direct' (this browser calls
     OpenAI with a key kept on this computer) or 'preview' (no AI: ready-made samples). */
  /* sound effects and music have a switch each; an old 'muted' choice still counts for effects */
  var G = { live: false, mode: 'preview', muted: (store.get('firstroll.sfx') || (store.get('firstroll.muted') === '1' ? '0' : '1')) === '0', music: store.get('firstroll.music') !== '0' };
  var OPENAI = { image: 'gpt-image-2', quality: 'medium', text: 'gpt-4.1-mini' };
  var hosted = !!window.claude;
  var canDirect = !hosted && (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
  var directKey = function () { return canDirect ? (store.get('firstroll.openai') || '') : ''; };
  FR.Dice.Sound.muted = G.muted; FR.Music.enable(G.music);
  var D = { ctx: null, adv: 'normal', values: [], rolling: false, shown: false, lucky: false, booted: false };

  var crestOf = function (cls) { return TH.art.crest(cls); };
  var sampleOf = function (cls) { return TH.art.sample(cls); };

  /* ---------- persistence (a convenience only), one character per theme ---------- */
  function save() {
    var keep = { answers: S.answers, cls: S.cls, race: S.race, look: S.look, desc: S.desc, name: S.name, origin: S.origin, originKey: S.originKey, originName: S.originName,
      portraitNote: S.portraitNote, portrait: S.portrait && S.portrait.length < 700000 ? S.portrait : '' };
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
    if (!k || !FR.CLASSES[k.cls] || !FR.RACES[k.race]) { return false; }
    if (k.theme && k.theme !== TH.id && FR.THEMES[k.theme]) { applyTheme(k.theme, true); }
    k.portrait = ''; adopt(k); save(); go('play');
    if (portrait && portrait.indexOf('data:') !== 0) {      // fetch the picture once and keep it on this device
      fetch(portrait).then(function (r) { if (!r.ok) { throw new Error('gone'); } return r.blob(); }).then(function (b) {
        return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); });
      }).then(function (data) { S.portrait = data; save(); if (S.screen === 'play') { renderPlay(); } tableSync(); }).catch(function () { /* no picture: the sheet still works */ });
    }
    return true;
  }
  function load() {
    try {
      var k = JSON.parse(store.get('firstroll.v3.' + TH.id) || 'null');
      if (k && k.cls && FR.CLASSES[k.cls] && FR.RACES[k.race]) { return k; }
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------- server ---------- */
  function fetchJson(url, body, timeout, headers) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, timeout), h = headers || {};
    if (body) { h['Content-Type'] = 'application/json'; }
    var opt = body ? { method: 'POST', headers: h, body: JSON.stringify(body), signal: ctl.signal } : { headers: h, signal: ctl.signal };
    return fetch(url, opt).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { var m = j && j.error && (j.error.message || j.error); var e = new Error(typeof m === 'string' ? m : 'The request failed.'); e.status = r.status; throw e; }
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
  function liveNote() {
    $('live-note').textContent = serverKnown ? (G.mode === 'server' ? (G.live ? tx('liveNote') : tx('tableNote')) : (G.mode === 'direct' ? tx('directNote') : tx('previewNote'))) : '';
    $('b-connect-title').hidden = !(serverKnown && canDirect && G.mode !== 'server');
    $('b-connect-title').textContent = G.mode === 'direct' ? 'Change the OpenAI key' : tx('connect');
  }
  function setMode() {
    if (G.mode !== 'server') { G.mode = directKey() ? 'direct' : 'preview'; }
    /* a public server only paints for people sitting at a DM's table */
    G.live = G.mode === 'direct' || (G.mode === 'server' && (!G.locked || !!(FR.table && FR.table.active())));
  }
  function checkServer() {
    var info = null;
    return fetchJson('api/health', null, 3000).then(function (j) { info = j; G.mode = j && j.live ? 'server' : 'preview'; G.locked = !!(j && j.passcode); }).catch(function () { G.mode = 'preview'; }).then(function () {
      setMode(); serverKnown = true; liveNote();
      if (FR.table) {
        FR.table.onChange(function () { var was = G.live; setMode(); liveNote(); if (was !== G.live && S.screen === 'portrait') { renderEasel(); } });
        FR.table.ready(info);
      }
      renderJoin();
    });
  }

  /* ---------- themes ---------- */
  function applyTheme(id, fresh) {
    TH = FR.useTheme(id);
    document.body.setAttribute('data-theme', TH.id);
    store.set('firstroll.theme', TH.id);
    if (fresh) { var scr = S.screen; S = blank(); S.screen = scr; }
    document.querySelectorAll('[data-t]').forEach(function (n) { n.textContent = tx(n.getAttribute('data-t')); });
    $('t-wordmark').src = TH.art.wordmark;
    FR.Music.use(TH.music || null); renderAudio();
    $('p-desc').setAttribute('placeholder', tx('descHint'));
    $('b-surprise-t').textContent = tx('surprise');
    var k = load();
    if (k && k.name) { $('b-have').textContent = 'Continue as ' + k.name.split(' ')[0]; }
    $('b-dm').hidden = !TH.adventure;
    liveNote(); renderThemes(); renderJoin();
    clear($('q-lean'));
    if (D.booted) { FR.Dice.clear(); FR.Dice.setScene(TH.dice, TH.art.floor); }
  }
  function renderThemes() {
    var box = $('themes'); clear(box);
    ['northpole', 'tavern'].forEach(function (id) {
      var t = FR.THEMES[id], b = el('button', 'theme-card' + (t.id === TH.id ? ' on' : '')), img = el('img'), s = el('span');
      b.type = 'button'; b.setAttribute('aria-pressed', t.id === TH.id ? 'true' : 'false');
      img.src = t.art.thumb; img.alt = ''; b.appendChild(img);
      s.appendChild(el('b', '', t.name)); s.appendChild(el('small', '', t.blurb)); b.appendChild(s);
      b.addEventListener('click', function () { if (t.id !== TH.id) { applyTheme(t.id, true); } });
      box.appendChild(b);
    });
  }

  /* ---------- navigation ---------- */
  var enter = {};
  function go(name) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('on', s.id === 's-' + name); });
    app.setAttribute('data-screen', name); S.screen = name;
    if (enter[name]) { enter[name](); }
    tune();
  }
  /* which music fits where the player is: the way in, the game itself, or a fight */
  function tune() {
    var s = S.screen, rolling = s === 'dice' && D && D.ctx, k = rolling ? D.ctx.kind : '';
    var fight = (s === 'play' && S.tab === 'fight') || (rolling && (k === 'attack' || k === 'damage' || k === 'init' || S.tab === 'fight'));
    FR.Music.scene(fight ? 'fight' : (s === 'title' || s === 'ledger' || s === 'story' || s === 'dmgate' || s === 'connect' ? 'intro' : 'game'));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-back]') : null;
    if (b) { go(b.getAttribute('data-back')); }
  });
  document.addEventListener('pointerdown', function (e) {
    FR.Dice.Sound.unlock(); FR.Music.unlock();
    if (e.target.closest && e.target.closest('.btn, .ans, .chip, .row, .tab, .icon, .theme-card, .seg button, .rail-dice button, .stepper button, .switch, .tablechip')) { if (TH.id === 'northpole') { FR.Dice.Sound.tink(); } else { FR.Dice.Sound.tick(); } }
  });

  /* ---------- 1. title ---------- */
  $('b-begin').addEventListener('click', function () { go('ledger'); });
  $('b-have').addEventListener('click', function () {
    var k = load();
    if (k) { adopt(k); } else { demo(); }
    go('play');
  });
  function adopt(k) {
    S.answers = k.answers || []; S.u = FR.tally(S.answers); S.cls = k.cls; S.race = k.race; S.look = k.look || {}; S.desc = k.desc || '';
    S.name = k.name || FR.rollName(S.race, S.look.body); S.origin = k.origin || ''; S.originKey = k.originKey || ''; S.originName = k.originName || S.name;
    S.portrait = k.portrait || ''; S.portraitNote = k.portraitNote || ''; rank(false); buildSheet();
  }
  function demo() {
    var d = TH.demo;
    S.answers = d.answers.slice(); S.u = FR.tally(S.answers); rank(true);
    S.cls = d.cls; S.race = d.race; S.look = JSON.parse(JSON.stringify(d.look)); S.name = d.name; S.portrait = sampleOf(d.cls); S.portraitNote = ''; buildSheet();
  }

  /* ---------- 2. sign in, then the story so far ---------- */
  /* Sign in: a name, and the DM's table code when there is one. */
  function renderJoin() {
    if (!$('j-name').value && store.get('firstroll.player')) { $('j-name').value = store.get('firstroll.player'); }
    var has = !!(FR.table && FR.table.can()), code = $('j-code').value.trim();
    $('j-lede').textContent = has ? tx('ledgerLedeTable') : tx('ledgerLede');
    $('b-join').textContent = has && code ? tx('ledgerJoin') : tx('ledgerSign');
    $('b-skip-ledger').hidden = !has;
  }
  $('j-code').addEventListener('input', function () { $('j-code').value = $('j-code').value.toUpperCase().replace(/[^A-Z]/g, ''); renderJoin(); });
  $('ledger').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('j-name').value.trim(), code = $('j-code').value.trim(), err = $('j-err'), b = $('b-join');
    err.hidden = true; S.player = name; if (name) { store.set('firstroll.player', name); }
    if (!(FR.table && FR.table.can() && code)) { afterLedger(); return; }
    if (!name) { err.textContent = 'Tell the table your name first.'; err.hidden = false; $('j-name').focus(); return; }
    if (code.length !== 4) { err.textContent = 'A table code is four letters. Ask your DM to read it out again.'; err.hidden = false; $('j-code').focus(); return; }
    b.disabled = true;
    FR.table.join(code, name).then(function (j) { if (!(j && j.back && j.save && FR.table.welcome(j, afterLedger))) { afterLedger(); } }).catch(function (x) { err.textContent = x.message || 'Could not join that table. Check the code and try again.'; err.hidden = false; }).then(function () { b.disabled = false; });
  });
  $('b-skip-ledger').addEventListener('click', function () { afterLedger(); });
  var story = { i: 0 };
  function afterLedger() { if (TH.story && TH.story.length) { story.i = 0; renderStory(); go('story'); } else { startQuiz(); } }
  function renderStory() {
    var beats = TH.story, b = beats[story.i], img = $('st-img'), dots = $('st-dots');
    img.classList.remove('swap'); void img.offsetWidth; img.src = b.img; img.alt = b.alt; img.classList.add('swap');
    $('st-text').textContent = b.text;
    $('st-next').textContent = story.i === beats.length - 1 ? tx('storyGo') : tx('storyNext');
    clear(dots);
    beats.forEach(function (x, i) { dots.appendChild(el('i', i <= story.i ? 'on' : '')); });
    if (story.i < beats.length - 1) { var pre = new Image(); pre.src = beats[story.i + 1].img; }
  }
  $('st-next').addEventListener('click', function () { if (story.i < TH.story.length - 1) { story.i++; renderStory(); } else { startQuiz(); } });
  $('st-back').addEventListener('click', function () { if (story.i > 0) { story.i--; renderStory(); } else { go('ledger'); } });
  $('st-skip').addEventListener('click', function () { startQuiz(); });

  /* ---------- 3. quiz ---------- */
  var busy = false;
  function startQuiz() { S.qi = 0; S.answers = []; S.u = FR.zero(); renderQ(); go('quiz'); }
  function renderQ() {
    var n = FR.QUESTIONS.length, q = FR.QUESTIONS[S.qi], pips = $('q-pips'), box = $('q-answers'), i;
    clear(pips);
    for (i = 0; i < n; i++) { pips.appendChild(el('i', i < S.qi ? 'done' : (i === S.qi ? 'now' : ''))); }
    $('q-count').textContent = TH.count(S.qi, n);
    $('q-text').textContent = q.q;
    clear(box);
    q.a.forEach(function (a, ai) {
      var b = el('button', 'ans' + (S.answers[S.qi] === ai ? ' on' : ''), a.t); b.type = 'button';
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
    busy = true; S.answers[S.qi] = ai; FR.Dice.Sound.step(S.qi);
    Array.prototype.forEach.call($('q-answers').children, function (c) { c.classList.toggle('on', c === btn); });
    renderLean();
    setTimeout(function () {
      busy = false;
      if (S.qi < FR.QUESTIONS.length - 1) { turn(function () { S.qi++; renderQ(); }); }
      else { S.u = FR.tally(S.answers); rank(true); showReveal(true); }
    }, 420);
  }
  $('q-back').addEventListener('click', function () {
    if (busy) { return; }
    if (S.qi === 0) { if (TH.story && TH.story.length) { story.i = TH.story.length - 1; renderStory(); go('story'); } else { go('ledger'); } }
    else { turn(function () { S.qi--; renderQ(); }); }
  });

  /* ---------- 4. reveal ---------- */
  function rank(pick) {
    S.clsRank = FR.rank(S.u, FR.CLASSES); S.raceRank = FR.rank(S.u, FR.RACES);
    if (pick) { S.cls = S.clsRank[0].name; S.race = S.raceRank[0].name; }
  }
  var cheer = function () { if (TH.id === 'northpole') { FR.Dice.Sound.jingle(); FR.Dice.Sound.fanfare(); } else { FR.Dice.Sound.chime(true); } };
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
    var cls = FR.CLASSES[S.cls], n = S.answers.filter(function (a) { return a !== undefined && a !== null; }).length || 1, keys = Object.keys(FR.TRAIT_LABELS);
    $('r-crest').src = crestOf(S.cls); $('r-crest').alt = S.cls + ' badge';
    $('r-title').textContent = S.race + ' ' + S.cls;
    $('r-sub').textContent = FR.alignment(S.u, n);
    $('r-blurb').textContent = cls.blurb;
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
    var chips = function (box, list, cur, set) {
      clear(box);
      var top = list.slice(0, 3);
      if (!top.some(function (r) { return r.name === cur; })) { top[2] = list.filter(function (r) { return r.name === cur; })[0]; }
      top.forEach(function (r) {
        var c = el('button', 'chip' + (r.name === cur ? ' on' : '')); c.type = 'button'; c.setAttribute('aria-pressed', r.name === cur ? 'true' : 'false');
        c.appendChild(document.createTextNode(r.name)); c.appendChild(el('small', '', r.pct + '%'));
        c.addEventListener('click', function () { set(r.name); S.portrait = ''; S.origin = ''; S.name = ''; renderReveal(); save(); });
        box.appendChild(c);
      });
    };
    chips($('r-classes'), S.clsRank, S.cls, function (v) { S.cls = v; });
    chips($('r-races'), S.raceRank, S.race, function (v) { S.race = v; });
    $('r-perk').textContent = tx('asA') + S.race + ': ' + FR.RACES[S.race].perk;
  }
  $('b-retake').addEventListener('click', startQuiz);
  $('b-to-portrait').addEventListener('click', function () { go('portrait'); });

  /* ---------- 5. portrait studio ---------- */
  var character = function () { return { cls: S.cls, race: S.race, look: S.look, desc: S.desc, name: S.name }; };
  var topTraits = function () { return Object.keys(FR.TRAIT_LABELS).sort(function (a, b) { return S.u[b] - S.u[a]; }); };
  var summary = function () {
    var l = S.look, bits = [l.body && l.body !== 'Neither' ? l.body.toLowerCase() : '', S.race, S.cls].filter(Boolean).join(' ');
    var extra = ['age', 'build', 'hair', 'mark', 'bearing'].map(function (k) { return l[k] ? FR.LOOK_LABELS[k].toLowerCase() + ': ' + l[k].toLowerCase() : ''; }).filter(Boolean).join(', ');
    var top = topTraits().slice(0, 2).map(function (k) { return FR.TRAIT_LABELS[k].toLowerCase(); }).join(' and ');
    return (S.name ? S.name + ', a ' : 'A ') + bits + (extra ? '; ' + extra : '') + '; ' + FR.alignment(S.u, 12).toLowerCase() + '; strongest in ' + top;
  };
  var painting = false, workTimer = 0;
  var fitDesc = function () { var t = $('p-desc'); t.style.height = 'auto'; t.style.height = Math.max(92, t.scrollHeight + 2) + 'px'; };
  enter.portrait = function () {
    $('p-title').textContent = S.race + ' ' + S.cls;
    $('p-crest').src = crestOf(S.cls);
    $('p-desc').value = S.desc;
    renderLook(); renderEasel(); setTimeout(fitDesc, 30);
  };
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
  /* A choice changed: an auto-written description no longer fits, and any picture is out of date. */
  function touched() {
    if (S.descAuto) { S.desc = ''; S.descAuto = false; $('p-desc').value = ''; fitDesc(); }
    if (S.portrait) { S.stale = true; }
    renderEasel();
  }
  function renderEasel() {
    var has = !!S.portrait;
    $('p-img').hidden = !has || painting; $('p-empty').hidden = has || painting; $('p-work').hidden = !painting;
    if (has) { $('p-img').src = S.portrait; $('p-img').alt = 'Picture of your ' + S.race + ' ' + S.cls; }
    var isSample = has && S.portrait.indexOf('data:') !== 0;
    $('p-src').textContent = painting ? '' : (has ? ((S.stale && G.live ? tx('stale') + ' ' : '') + (isSample && G.live ? '' : S.portraitNote)) : (G.live ? tx('hintLive') : tx('hintPreview')));
    $('p-tag').hidden = !isSample || painting; $('p-tag').textContent = tx('sampleTag');
    $('b-connect').hidden = G.live || !canDirect || painting; $('b-connect').textContent = tx('connect');
    $('b-paint').textContent = painting ? tx('painting') : (!G.live ? tx('sampleBtn') : (has && !isSample ? tx('paintAgain') : tx('paint')));
    $('b-paint').disabled = painting;
    $('b-keep').hidden = painting;
    $('b-keep').textContent = has ? tx('keep') : tx('skip');
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
    if (painting) { return; }
    var lines = tx('work'), li = 0;
    painting = true; $('p-err').hidden = true; $('p-work-text').textContent = lines[0]; renderEasel();
    workTimer = setInterval(function () { li = Math.min(lines.length - 1, li + 1); $('p-work-text').textContent = lines[li]; }, G.live ? 5200 : 520);
    var finish = function (src, note) { clearInterval(workTimer); painting = false; S.portrait = src; S.portraitNote = note; S.stale = false; renderEasel(); save(); tableSync(); FR.Dice.Sound.sparkle(); };
    var fail = function (msg) { clearInterval(workTimer); painting = false; renderEasel(); $('p-err').textContent = msg; $('p-err').hidden = false; };
    if (!G.live) {
      var cls = S.cls;
      setTimeout(function () { finish(sampleOf(cls), tx('sample', { race: TH.samples[cls], cls: cls })); }, reduced ? 50 : 2600);
      return;
    }
    S.lastPrompt = FR.portraitSubject(character()) + ' ' + TH.ai.style;
    AI.image(S.lastPrompt).then(function (j) {
      finish(j.image, tx('painted', { s: j.seconds }));
    }).catch(function (e) { fail(e.name === 'AbortError' ? tx('slow') : (e.status === 401 ? 'OpenAI did not accept the key. Check it under Connect OpenAI.' : tx('failed', { e: e.message }))); });
  });
  $('b-keep').addEventListener('click', function () { go('sheet'); tableSync(); });

  /* ---------- 6. sheet ---------- */
  function buildSheet() { S.sheet = FR.build(S.u, S.cls, S.race, 12); return S.sheet; }
  function localOrigin() { return TH.origin({ name: S.name, first: S.name.split(' ')[0], race: S.race, cls: S.cls, top: topTraits()[0] }); }
  var spaced = function (m) { return FR.fmt(m).replace(/^([+−])/, '$1 '); };
  enter.sheet = function () {
    if (!S.name) { S.name = FR.rollName(S.race, S.look.body); }
    buildSheet(); renderSheet(); writeOrigin(); save();
  };
  function row(dl, k, v) { var d = el('div'); d.appendChild(el('dt', '', k)); d.appendChild(el('dd', '', v)); dl.appendChild(d); }
  function renderSheet() {
    var sh = S.sheet, cls = FR.CLASSES[S.cls], art = $('s-img');
    art.src = S.portrait || crestOf(S.cls); art.alt = S.portrait ? 'Picture of ' + S.name : S.cls + ' badge';
    art.parentNode.classList.toggle('crest-only', !S.portrait);
    $('s-name').value = S.name;
    $('s-line').textContent = 'Level 1 ' + S.race + ' ' + S.cls + ' · ' + sh.alignment;
    var v = $('s-vitals'); clear(v);
    row(v, 'Armor Class', sh.ac + ' (' + sh.armor + ')');
    row(v, 'Hit Points', sh.hp + ' (1d' + cls.hd + ' ' + spaced(sh.mods.CON) + ')');
    row(v, 'Speed', sh.speed + ' feet');
    var ab = $('s-abil'); clear(ab);
    FR.ABILITIES.forEach(function (k) {
      var d = el('div'); d.appendChild(el('b', '', k)); d.appendChild(el('strong', '', String(sh.scores[k]))); d.appendChild(el('span', '', '(' + FR.fmt(sh.mods[k]) + ')')); ab.appendChild(d);
    });
    var s = $('s-skills'); clear(s);
    row(s, tx('skills'), cls.skills.map(function (k) { return k + ' ' + FR.fmt(sh.skills[k].mod); }).join(', '));
    row(s, tx('attacks'), sh.attacks.map(function (a) { return a.n + ' ' + FR.fmt(a.hit) + ' (' + a.cnt + 'd' + a.die + (a.dmg ? ' ' + spaced(a.dmg) : '') + ')'; }).join(', '));
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
  function renderPlay() {
    var sh = S.sheet, fight = S.tab === 'fight', tabs = tx('tabs');
    $('s-play').classList.toggle('fight', fight);
    $('pl-img').src = S.portrait || crestOf(S.cls); $('pl-img').alt = '';
    $('pl-medal').classList.toggle('crest-only', !S.portrait);
    $('pl-name').textContent = S.name; $('pl-sub').textContent = S.race + ' ' + S.cls + ', level 1';
    var st = $('pl-stats'); clear(st);
    [['HP', sh.hp], ['Armor', sh.ac]].concat(fight ? [['Init', S.init === null ? '–' : S.init]] : []).forEach(function (p) {
      var d = el('div'); d.appendChild(el('strong', '', String(p[1]))); d.appendChild(document.createTextNode(p[0])); st.appendChild(d);
    });
    var bar = $('pl-tabs'); clear(bar);
    ['do', 'checks', 'fight'].forEach(function (id, i) {
      var b = el('button', 'tab' + (id === 'fight' ? ' fight' : '') + (S.tab === id ? ' on' : ''), tabs[i]); b.type = 'button'; b.setAttribute('aria-pressed', S.tab === id ? 'true' : 'false');
      b.addEventListener('click', function () { S.tab = id; renderPlay(); $('pl-list').scrollTop = 0; tune(); });
      bar.appendChild(b);
    });
    var list = $('pl-list'); clear(list);
    var add = function (label, hint, modText, ctx, prof, cls) {
      var r = el('button', 'row' + (cls ? ' ' + cls : '')), l = el('span', 'row-l'), n = el('span', 'row-n'); r.type = 'button';
      if (prof) { n.appendChild(el('i')); }
      n.appendChild(document.createTextNode(label)); l.appendChild(n); l.appendChild(el('span', 'row-h', hint));
      r.appendChild(l); r.appendChild(el('span', 'row-m', modText));
      r.addEventListener('click', function () { openDice(ctx); });
      list.appendChild(r);
    };
    var check = function (title, what, mod, kind, extra) {
      var c = { title: title, note: what + ' · d20 ' + spaced(mod), sides: 20, count: 1, mod: mod, kind: kind || 'check' };
      if (extra) { Object.keys(extra).forEach(function (k) { c[k] = extra[k]; }); }
      return c;
    };
    if (S.tab === 'do') {
      FR.ACTIONS.forEach(function (a) { var sk = sh.skills[a.skill]; add(a.label, a.skill + ' · ' + a.hint, FR.fmt(sk.mod), check(a.label, a.skill, sk.mod), sk.prof); });
      (TH.extras || []).forEach(function (x) {
        add(x.label, x.hint, 'd' + x.sides, { title: x.title, note: x.note, sides: x.sides, count: 1, mod: 0, kind: 'table', table: x.table }, false, 'extra');
      });
    } else if (S.tab === 'checks') {
      var hints = tx('checkHints');
      FR.ABILITIES.forEach(function (k) { add(FR.ABILITY_NAMES[k], hints[k], FR.fmt(sh.mods[k]), check(FR.ABILITY_NAMES[k], 'Ability check', sh.mods[k])); });
    } else {
      add(tx('initLabel'), S.init === null ? tx('initHint') : tx('initDone', { n: S.init }), FR.fmt(sh.init), check('Initiative', 'Turn order', sh.init, 'init'), false, 'first');
      sh.attacks.forEach(function (a) {
        var dmg = a.cnt + 'd' + a.die + (a.dmg ? ' ' + spaced(a.dmg) : '');
        add(a.n, a.hint + ' · ' + dmg + ' ' + tx('damage'), FR.fmt(a.hit), check(a.n, a.spell ? 'Magic attack' : 'Attack roll', a.hit, 'attack', { dmg: { sides: a.die, count: a.cnt, mod: a.dmg } }));
      });
      add(tx('shove'), 'Athletics · ' + tx('shoveHint'), FR.fmt(sh.skills.Athletics.mod), check(tx('shove'), 'Athletics', sh.skills.Athletics.mod), sh.skills.Athletics.prof);
      add(tx('hide'), 'Stealth · ' + tx('hideHint'), FR.fmt(sh.skills.Stealth.mod), check(tx('hide'), 'Stealth', sh.skills.Stealth.mod), sh.skills.Stealth.prof);
      var say = el('p', 'say'); say.appendChild(el('b', '', tx('noRollB'))); say.appendChild(document.createTextNode(tx('noRoll')));
      list.appendChild(say);
    }
  }
  $('b-free').addEventListener('click', function () { openDice(free(20, 1)); });
  $('pl-medal').addEventListener('click', function () { go('sheet'); });

  /* ---------- 8. dice tray ---------- */
  function free(sides, count) {
    var n = Math.max(1, Math.min(6, count));
    return { title: n + 'd' + sides, note: tx('freeNote'), sides: sides, count: n, mod: 0, kind: 'free' };
  }
  var usesAdv = function (c) { return c.sides === 20 && c.kind !== 'free' && c.kind !== 'damage' && c.kind !== 'table'; };
  var spec = function () { var n = usesAdv(D.ctx) && D.adv !== 'normal' ? 2 : D.ctx.count, out = [], i; for (i = 0; i < n; i++) { out.push(D.ctx.sides); } return out; };
  function result() {
    var v = D.values, c = D.ctx, two = usesAdv(c) && D.adv !== 'normal';
    var kept = two ? (D.adv === 'adv' ? Math.max.apply(null, v) : Math.min.apply(null, v)) : v.reduce(function (a, b) { return a + b; }, 0);
    return { kept: kept, total: kept + c.mod, two: two, nat: usesAdv(c) && (two || v.length === 1) ? kept : 0, keptIx: two ? v.indexOf(kept) : -1 };
  }
  function trayBounds() {
    var c = $('tray').getBoundingClientRect(), t = $('tray-top').getBoundingClientRect(), b = $('tray-bot').getBoundingClientRect();
    FR.Dice.setBounds({ left: 6, top: t.bottom - c.top - 14, right: c.width - 6, bottom: b.top - c.top + 22 });
  }
  function openDice(ctx) {
    D.ctx = ctx; D.adv = 'normal'; D.values = []; D.shown = false; D.rolling = false; D.lucky = false;
    go('dice'); renderTray(); tune();
    setTimeout(function () {
      if (!D.booted) {
        try { FR.Dice.init($('tray'), {}); D.booted = true; FR.Dice.onFrame(placeBadges); FR.Dice.setScene(TH.dice, TH.art.floor); }
        catch (e) { D.booted = false; }
      }
      if (D.booted) { $('flat').hidden = true; }  // no WebGL here: the dice are drawn flat instead (see flatRoll)
      if (D.booted) { FR.Dice.resize(); trayBounds(); }
      throwDice(null);
    }, 60);
  }
  function renderTray() {
    var c = D.ctx, r = D.shown ? result() : null;
    $('d-title').textContent = c.title; $('d-note').textContent = c.note;
    var seg = $('d-adv'); clear(seg); seg.hidden = !usesAdv(c);
    [['dis', 'Disadvantage'], ['normal', 'Normal'], ['adv', 'Advantage']].forEach(function (m) {
      var b = el('button', D.adv === m[0] ? 'on' : '', m[1]); b.type = 'button'; b.setAttribute('aria-pressed', D.adv === m[0] ? 'true' : 'false');
      b.addEventListener('click', function () { if (D.adv !== m[0]) { D.adv = m[0]; renderTray(); if (D.booted) { trayBounds(); } throwDice(null); } });
      seg.appendChild(b);
    });
    var tot = $('d-total');
    tot.className = 'result-num' + (r ? ' pop' : '') + (r && r.nat === 20 ? ' crit' : '') + (r && r.nat === 1 ? ' fumble' : '');
    tot.textContent = r ? String(r.total) : '';
    var math = '', say = D.rolling ? tx('rolling') : tx('flick');
    if (r) {
      math = (r.two ? 'Kept ' + r.kept + ' of ' + D.values.join(' and ') : D.values.join(' + ')) + (c.mod ? ' ' + spaced(c.mod) : '');
      say = c.kind === 'damage' ? tx('tellDamage') : tx('tell');
      if (c.table) { math = c.table[r.kept - 1]; }
      if (r.nat === 20) { say = c.kind === 'attack' ? tx('nat20Attack') : tx('nat20'); }
      if (r.nat === 1) { say = tx('nat1'); }
    } else if (!D.rolling) { math = (c.count > 1 || c.kind === 'free' ? c.count : '') + 'd' + c.sides + (c.mod ? ' ' + spaced(c.mod) : ''); }
    $('d-math').textContent = math; $('d-say').textContent = say;
    $('d-roll').textContent = D.shown ? 'Roll again' : 'Roll';
    var second = $('d-second'), label = '';
    if (r && c.kind === 'attack' && c.dmg && r.nat !== 1) { label = tx('hits'); }
    if (r && r.nat === 1 && S.sheet && S.sheet.lucky && !D.lucky) { label = tx('lucky'); }
    second.hidden = !label; second.textContent = label;
    var rail = $('d-rail'); clear(rail);
    [4, 6, 8, 10, 12, 20].forEach(function (sd) {
      var on = sd === c.sides && c.kind === 'free', b = el('button', on ? 'on' : '', 'd' + sd); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', function () { D.ctx = free(sd, c.kind === 'free' ? c.count : 1); D.adv = 'normal'; D.shown = false; renderTray(); if (D.booted) { trayBounds(); } throwDice(null); });
      rail.appendChild(b);
    });
    $('d-count').textContent = String(c.count);
  }
  function placeBadges() {
    var box = $('badges');
    if (!D.shown || D.values.length < 2) { if (box.firstChild) { clear(box); } return; }
    if (box.childNodes.length === D.values.length) { return; }
    clear(box);
    var r = result(), top = $('tray').getBoundingClientRect();
    D.values.forEach(function (v, i) {
      var p = FR.Dice.screenPos(i); if (!p) { return; }
      var b = el('div', 'badge' + (r.two && i !== r.keptIx ? ' drop' : ''), String(v));
      b.style.left = p.x + 'px'; b.style.top = Math.max(top.height * 0.12, p.y - p.r - 20) + 'px'; box.appendChild(b);
    });
  }
  /* ---------- flat dice ----------
     Where the browser cannot draw the 3D tray (no WebGL), the same dice are drawn flat: they
     tumble, flicker through numbers and land, so nobody is left looking at an empty tray. */
  var FLAT = { 4: '<polygon class="body" points="50,10 93,86 7,86"/>',
    6: '<rect class="body" x="11" y="11" width="78" height="78" rx="14"/>',
    8: '<polygon class="body" points="50,4 93,50 50,96 7,50"/><polyline class="facet" points="7,50 50,36 93,50"/>',
    10: '<polygon class="body" points="50,4 92,44 50,96 8,44"/><polyline class="facet" points="8,44 50,60 92,44"/>',
    12: '<polygon class="body" points="50,4 95,37 78,93 22,93 5,37"/><polygon class="facet" points="50,24 75,43 66,73 34,73 25,43"/>',
    20: '<polygon class="body" points="50,3 91,26 91,74 50,97 9,74 9,26"/><polygon class="facet" points="50,22 78,68 22,68"/>' };
  var flatT = { tick: 0, done: 0 };
  function flatDraw(sp, vals) {
    var box = $('flat'), c = D.ctx, fightish = c.kind === 'attack' || c.kind === 'damage' || c.kind === 'init';
    var r = vals ? result() : null, n = sp.length, size = n === 1 ? 150 : n === 2 ? 124 : n <= 4 ? 100 : n <= 6 ? 84 : 66;
    clear(box); box.hidden = false;
    sp.forEach(function (sides, i) {
      var d = el('div', 'fd d' + sides + (reduced ? '' : (vals ? ' land' : ' roll')) + (r && r.two && i !== r.keptIx ? ' drop' : ''));
      d.style.setProperty('--s', size + 'px'); d.style.setProperty('--die', fightish ? TH.dice.fight : FR.CLASSES[S.cls].color); d.style.setProperty('--ink', fightish ? TH.dice.fightInk : TH.dice.ink);
      if (!vals) { d.style.animationDelay = (-i * 130) + 'ms'; }
      d.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true">' + (FLAT[sides] || FLAT[20]) + '</svg>';
      d.appendChild(el('b', '', vals ? String(vals[i]) : String(1 + Math.floor(Math.random() * sides))));
      box.appendChild(d);
    });
  }
  function flatRoll(sp, land) {
    clearInterval(flatT.tick); clearTimeout(flatT.done);
    var any = function (s) { return 1 + Math.floor(Math.random() * s); }, beat = 0;
    flatDraw(sp, null);
    flatT.tick = setInterval(function () {
      Array.prototype.forEach.call($('flat').querySelectorAll('b'), function (b, i) { b.textContent = String(any(sp[i])); });
      if (++beat % 2 === 0) { FR.Dice.Sound.hit(beat % 4 ? 'felt' : 'die', 0.5 + Math.random() * 0.4, Math.random() - 0.5); }
    }, 70);
    flatT.done = setTimeout(function () {
      clearInterval(flatT.tick);
      var vals = sp.map(any);
      FR.Dice.Sound.hit('wood', 0.9, 0);
      land(vals); flatDraw(sp, vals);
    }, reduced ? 120 : 950);
  }
  function throwDice(flick) {
    var sp = spec();
    D.rolling = true; D.shown = false; D.values = []; clear($('badges')); renderTray();
    var land = function (vals) {
      D.values = vals; D.rolling = false; D.shown = true;
      var r = result();
      if (r.two && D.booted) { FR.Dice.dim(r.keptIx === 0 ? 1 : 0, true); }
      if (r.nat === 20) { cheer(); } else if (r.nat === 1) { if (TH.id === 'northpole') { FR.Dice.Sound.womp(); } else { FR.Dice.Sound.chime(false); } }
      if (D.ctx.kind === 'init') { S.init = r.total; }
      renderTray();
    };
    if (!D.booted) { flatRoll(sp, land); return; }
    var c = D.ctx, fightish = c.kind === 'attack' || c.kind === 'damage' || c.kind === 'init';
    FR.Dice.setTheme(fightish ? TH.dice.fight : FR.CLASSES[S.cls].color, fightish ? TH.dice.fightInk : TH.dice.ink);
    FR.Dice.roll(sp, flick, land);
  }
  $('d-roll').addEventListener('click', function () { throwDice(null); });
  $('d-second').addEventListener('click', function () {
    var r = result(), c = D.ctx;
    if (r.nat === 1 && S.sheet && S.sheet.lucky && !D.lucky) { D.lucky = true; throwDice(null); return; }
    var crit = r.nat === 20, n = crit ? c.dmg.count * 2 : c.dmg.count;
    D.ctx = { title: c.title + ' ' + tx('damage'), note: (crit ? tx('crit') + ' · ' : '') + n + 'd' + c.dmg.sides + (c.dmg.mod ? ' ' + spaced(c.dmg.mod) : ''), sides: c.dmg.sides, count: n, mod: c.dmg.mod, kind: 'damage' };
    D.adv = 'normal'; renderTray(); if (D.booted) { trayBounds(); } throwDice(null);
  });
  var bump = function (d) { var c = D.ctx; D.ctx = free(c.sides, (c.kind === 'free' ? c.count : 1) + d); D.adv = 'normal'; renderTray(); if (D.booted) { trayBounds(); } throwDice(null); };
  $('d-less').addEventListener('click', function () { if (D.ctx.kind === 'free' && D.ctx.count > 1) { bump(-1); } });
  $('d-more').addEventListener('click', function () { if (D.ctx.count < 6) { bump(1); } });
  $('d-close').addEventListener('click', function () { if (D.booted) { FR.Dice.stop(); } clearInterval(flatT.tick); clearTimeout(flatT.done); D.rolling = false; go('play'); });
  /* ---------- music and sound: one sheet, two switches ---------- */
  function renderAudio() {
    var has = FR.Music.has();
    $('au-music').setAttribute('aria-checked', G.music && has ? 'true' : 'false'); $('au-music').disabled = !has;
    $('au-music-note').textContent = has ? tx('musicNote') : 'This theme has no music yet';
    $('au-sfx').setAttribute('aria-checked', G.muted ? 'false' : 'true');
    var cr = (TH.music && TH.music.credit) || ''; $('au-credit').textContent = cr; $('au-credit').hidden = !cr;
    var quiet = G.muted && !(G.music && has);
    document.querySelectorAll('.audio-open').forEach(function (b) { b.classList.toggle('off', quiet); });
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.audio-open')) { renderAudio(); $('audio').hidden = false; $('au-x').focus(); } });
  $('au-music').addEventListener('click', function () { G.music = !G.music; store.set('firstroll.music', G.music ? '1' : '0'); FR.Music.enable(G.music); renderAudio(); });
  $('au-sfx').addEventListener('click', function () { G.muted = !G.muted; FR.Dice.Sound.muted = G.muted; store.set('firstroll.sfx', G.muted ? '0' : '1'); renderAudio(); if (!G.muted) { FR.Dice.Sound.tink(); } });
  $('au-x').addEventListener('click', function () { $('audio').hidden = true; });
  $('audio').addEventListener('click', function (e) { if (e.target === $('audio')) { $('audio').hidden = true; } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('audio').hidden) { $('audio').hidden = true; } });
  (function () {
    var cv = $('tray'), pts = [];
    cv.addEventListener('pointerdown', function (e) { pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }]; if (cv.setPointerCapture) { cv.setPointerCapture(e.pointerId); } });
    cv.addEventListener('pointermove', function (e) { if (pts.length) { pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (pts.length > 6) { pts.shift(); } } });
    cv.addEventListener('pointerup', function (e) {
      if (!pts.length) { return; }
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      var a = pts[0], b = pts[pts.length - 1], dt = Math.max(16, b.t - a.t) / 1000, dx = b.x - a.x, dy = b.y - a.y;
      pts = [];
      if (Math.sqrt(dx * dx + dy * dy) < 24) { throwDice(null); } else { throwDice({ vx: dx / dt, vz: dy / dt }); }
    });
  })();
  window.addEventListener('resize', function () { if (D.booted && S.screen === 'dice') { FR.Dice.resize(); trayBounds(); } });

  /* ---------- drifting embers, or falling snow ---------- */
  (function () {
    var cv = $('embers'), g = cv.getContext('2d'), ps = [], W = 0, H = 0, i;
    if (reduced || !g) { return; }
    var fit = function () { var r = app.getBoundingClientRect(); W = cv.width = Math.round(r.width); H = cv.height = Math.round(r.height); };
    var spawn = function (y) { return { x: Math.random() * W, y: y, r: 0.6 + Math.random() * 1.6, v: 0.25 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 0.3, ph: Math.random() * 6.28, life: 0.5 + Math.random() * 0.5 }; };
    fit(); window.addEventListener('resize', fit);
    for (i = 0; i < 44; i++) { ps.push(spawn(Math.random() * H)); }
    (function loop(t) {
      requestAnimationFrame(loop);
      var snow = TH.particles === 'snow';
      var show = S.screen === 'title' || S.screen === 'reveal' || S.screen === 'ledger' || (snow && (S.screen === 'quiz' || S.screen === 'story'));
      g.clearRect(0, 0, W, H);
      if (!show) { return; }
      ps.forEach(function (p, ix) {
        p.x += p.vx + Math.sin(t * 0.001 + p.ph) * 0.25;
        if (snow) {
          p.y += p.v * 1.5 + 0.3;
          if (p.y > H + 10) { ps[ix] = spawn(-10); return; }
          g.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.5 * p.life).toFixed(3) + ')';
          g.beginPath(); g.arc(p.x, p.y, p.r * 1.25, 0, 6.2832); g.fill();
        } else {
          p.y -= p.v;
          if (p.y < -10) { ps[ix] = spawn(H + 10); return; }
          var a = p.life * (0.5 + 0.5 * Math.sin(t * 0.004 + p.ph)) * Math.min(1, p.y / (H * 0.6));
          g.fillStyle = 'rgba(255,' + Math.round(150 + 60 * p.life) + ',70,' + a.toFixed(3) + ')';
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.2832); g.fill();
        }
      });
    })(0);
  })();

  // nothing may scroll the stage itself (focus and scroll-into-view can try)
  app.addEventListener('scroll', function () { app.scrollTop = 0; app.scrollLeft = 0; });
  applyTheme(TH.id, false);
  tune();                                  // the title screen has music too, from the first tap
  checkServer();
  if (document.fonts && document.fonts.load) { document.fonts.load("800 40px 'Alegreya'"); }
  window.FRState = function () { return S; }; window.FRGo = go; window.FRTheme = applyTheme;
  FR.app = { $: $, el: el, clear: clear, go: go, fetchJson: fetchJson, text: AI.text, image: AI.image, store: store, reduced: reduced, isLive: function () { return G.live; }, screen: function () { return S.screen; },
    saved: function () { var k = load(); return k && k.name ? k : null; }, saveBlob: saveBlob, restore: restore, player: function () { return store.get('firstroll.player') || ''; }, resume: function () { var k = load(); if (k) { adopt(k); go('play'); } },
    character: function () { return S.cls ? { name: S.name, race: S.race, cls: S.cls, line: S.sheet ? S.sheet.alignment : '', look: FR.portraitSubject(character()).slice(0, 380), portrait: S.portrait } : null; } };

  /* ---------- connect OpenAI (only when this copy runs on your own computer) ---------- */
  var connectFrom = 'title';
  function openConnect() {
    connectFrom = S.screen; $('okey').value = ''; $('okey-err').hidden = true;
    $('okey-ok').textContent = directKey() ? 'A key is saved on this computer.' : '';
    $('b-okey-clear').hidden = !directKey(); go('connect');
  }
  $('b-connect-title').addEventListener('click', openConnect);
  $('b-connect').addEventListener('click', openConnect);
  $('c-back').addEventListener('click', function () { go(connectFrom); });
  $('connect').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('okey').value.trim(), err = $('okey-err'), okMsg = $('okey-ok'), b = $('b-okey-save');
    err.hidden = true;
    if (v.length < 20) { err.textContent = 'That is too short to be an OpenAI key. Copy the whole key and paste it here.'; err.hidden = false; return; }
    b.disabled = true; b.textContent = 'Testing the key'; okMsg.textContent = '';
    fetchJson('https://api.openai.com/v1/models', null, 20000, { Authorization: 'Bearer ' + v }).then(function () {
      store.set('firstroll.openai', v); setMode(); liveNote(); $('okey').value = '';
      okMsg.textContent = 'Connected. Pictures and story help now come from OpenAI.'; $('b-okey-clear').hidden = false;
      setTimeout(function () { go(connectFrom); }, 900);
    }).catch(function (x) {
      err.textContent = x.status === 401 ? 'OpenAI did not accept that key. Check that you copied all of it.' : 'Could not reach OpenAI to test the key. Check your connection and try again.'; err.hidden = false;
    }).then(function () { b.disabled = false; b.textContent = 'Save and test'; });
  });
  $('b-okey-clear').addEventListener('click', function () {
    try { localStorage.removeItem('firstroll.openai'); } catch (x) { /* nothing stored */ }
    setMode(); liveNote(); $('b-okey-clear').hidden = true; $('okey-ok').textContent = 'Key removed from this computer.';
  });
  enter.connect = function () { setTimeout(function () { $('okey').focus(); }, 80); };
})();
