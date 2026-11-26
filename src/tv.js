/* First Roll: the big screen. A TV in the room shows what the whole table shares: the scene's picture
   and title, the map as it is uncovered, a picture held face down and turned over, everyone's rolls,
   whose moment it is, the turn order, a vote, a roll the DM has asked for, and the party along the
   bottom. It plays the soundscape and the beats. It has no controls at all.

   The DM's "Put this on a TV" link opens the page as ?tv=CODE&k=KEY. src/table.js then polls the
   table with that key as a screen: it holds no seat and is only ever sent what the whole room may
   see (docs/PHASE2.md, section 1.2). When the key is replaced or thrown away, or the table ends, the
   polling stops and this page says so plainly.

   Nothing here belongs to any one story: the words, pictures and sounds all come from the table and
   the cartridge. The first part, FR.tv.view, has no screen in it: it turns what the table sent into
   exactly what is drawn, so test/unit/tv.test.js can read every word that could reach the TV. */
(function () {
  'use strict';
  var tv = FR.tv = {};

  /* ================= the part with no screen in it ================= */
  /* was this page opened as a big screen? (the same two parts of the address src/table.js looks for) */
  tv.wanted = function (search) {
    return /[?&]tv=([A-Za-z]{4})(?![A-Za-z])/.test(search || '') && /[?&]k=([0-9a-f]{16,64})(?![0-9a-f])/.test(search || '');
  };
  var str = function (v) { return typeof v === 'string' ? v : ''; };
  /* What the screen draws, from what the table sent a screen. s: { scene, stage, players, rolls,
     requests, votes, recent (the number of a roll request that has only just finished) }.
     Only the parts named here are ever drawn: a hero's public name, portrait and tokens; a request's
     label and how each roll went (never a target: a screen is not sent one); a vote and its count. */
  tv.view = function (s) {
    var scene = s.scene || null, stage = s.stage || {}, players = Array.isArray(s.players) ? s.players : [], seat = {}, v = {};
    var who = function (p) {
      var c = p.char || {};
      return { id: p.id, name: str(p.name), hero: str(c.name), kind: [c.race, c.cls].filter(Boolean).join(' '), portrait: str(p.portrait), tokens: Math.max(0, Math.min(5, Math.round(Number(p.tokens)) || 0)), spot: !!stage.spot && p.id === stage.spot };
    };
    players.forEach(function (p) { seat[p.id] = p; });
    /* before the story begins the screen is the way in: the code and the square to scan, large */
    v.lobby = !scene || scene.id === '/cover';
    v.title = scene ? str(scene.title) : ''; v.chapter = scene && scene.chapter !== scene.title ? str(scene.chapter) : ''; v.img = scene ? str(scene.img) : '';
    v.map = null;
    if (stage.map && (stage.map.img || (stage.map.regions || []).length)) {
      v.map = { id: str(stage.map.id), title: str(stage.map.title), img: str(stage.map.img), regions: (stage.map.regions || []).map(function (r) {
        return { id: r.id, name: str(r.name), x: Number(r.x) || 0, y: Number(r.y) || 0, w: Number(r.w) || 0, h: Number(r.h) || 0, open: (stage.map.open || []).indexOf(r.id) >= 0 };
      }) };
    }
    v.reveal = stage.reveal && (stage.reveal.img || stage.reveal.title) ? { id: str(stage.reveal.id), title: str(stage.reveal.title), img: str(stage.reveal.img), shown: stage.reveal.shown === true } : null;
    v.party = players.map(who);
    v.spot = seat[stage.spot] ? who(seat[stage.spot]) : null;
    /* the turn order: a hero is drawn from their seat (portrait, hero's name, who plays them), anything else from its own entry */
    v.order = (Array.isArray(stage.order) ? stage.order : []).map(function (e) {
      var p = e.kind === 'hero' ? seat[e.id] : null, c = (p && p.char) || {};
      return { id: e.id, name: p ? (str(c.name) || str(p.name)) : str(e.name), sub: p && c.name ? str(p.name) : '', kind: e.kind === 'foe' ? 'foe' : 'hero', state: str(e.state), img: (p && str(p.portrait)) || str(e.img), now: !!stage.now && e.id === stage.now };
    });
    /* The list starts at whoever is acting and runs on from there, so the top of it is always "now, then
       next": a long order never leaves the acting hero below the bottom of the screen. A foe that is out
       of the fight is not announced as whose turn it is. */
    var at = -1;
    v.order.forEach(function (e, i) { if (e.now) { at = i; } });
    if (at > 0) { v.order = v.order.slice(at).concat(v.order.slice(0, at)); }
    v.turn = at >= 0 && v.order[0].state !== 'Out' ? v.order[0] : null;
    /* the vote on the table: the count as it stands, and once it is closed, what the table chose */
    v.vote = null;
    var vt = (Array.isArray(s.votes) ? s.votes : [])[0], counts, total = 0, top = 0, wins;
    if (vt && vt.q && Array.isArray(vt.options)) {
      counts = vt.options.map(function (o, i) { return Math.max(0, Number((vt.counts || [])[i]) || 0); });
      counts.forEach(function (n) { total += n; top = Math.max(top, n); });
      wins = counts.map(function (n, i) { return n === top && top > 0 ? i : -1; }).filter(function (i) { return i >= 0; });
      v.vote = { n: vt.n, q: str(vt.q), open: !!vt.open, total: total,
        rows: vt.options.map(function (o, i) { return { text: str(o), n: counts[i], share: total ? counts[i] / total : 0, win: !vt.open && wins.indexOf(i) >= 0 }; }),
        result: vt.open ? '' : (!total ? 'Nobody voted' : (wins.length > 1 ? 'It is a tie' : str(vt.options[wins[0]]))) };
    }
    /* a roll the DM asked for: the newest one still waiting on somebody, else one that has only just finished */
    v.request = null;
    var reqs = Array.isArray(s.requests) ? s.requests : [];
    var waits = function (q) { return !q.closed && (q.to || []).some(function (id) { return seat[id] && !(q.results && q.results[id]); }); };
    var q = reqs.filter(waits).pop() || reqs.filter(function (x) { return x.n === s.recent; })[0] || null, asked;
    if (q) {
      asked = (q.to || []).filter(function (id) { return seat[id]; });
      v.request = { n: q.n, label: str(q.label), closed: !!q.closed, waiting: waits(q),
        who: players.length > 1 && players.every(function (p) { return asked.indexOf(p.id) >= 0; }) ? 'Everyone' : asked.map(function (id) { return str(seat[id].name); }).join(', '),
        rows: asked.map(function (id) {
          var p = who(seat[id]), r = (q.results && q.results[id]) || null;
          return { id: id, name: p.name, hero: p.hero, portrait: p.portrait, rolled: !!r, total: r ? r.total : null, nat: r && (r.nat === 20 || r.nat === 1) ? r.nat : 0, pass: r && typeof r.pass === 'boolean' ? r.pass : null };
        }) };
    }
    /* the last few rolls, newest first; a spent token is a line in the same list */
    v.rolls = (Array.isArray(s.rolls) ? s.rolls : []).slice(-5).reverse().map(function (r) {
      var p = r.role === 'dm' ? null : seat[r.id], c = (p && p.char) || {};
      return { n: r.n, name: r.role === 'dm' ? 'The DM' : str((p && p.name) || r.name) || 'Someone', hero: str(c.name), portrait: p ? str(p.portrait) : '', label: str(r.label), total: r.total, nat: r.nat === 20 || r.nat === 1 ? r.nat : 0, token: r.kind === 'token', old: !!r.old };
    });
    return v;
  };
  /* The beats the engine knows (FR.BEATS), each as what the screen does and for how long: a class on
     the screen (src/css/tv.css moves it) and a sound made on the spot. */
  tv.BEATS = { thunder: 1500, hit: 500, reveal: 1600, bell: 2200, crash: 900, hush: 3600 };

  if (typeof document === 'undefined') { return; }           // no screen here (the unit tests)

  /* ================= sound: the beats ================= */
  var A = FR.app, $ = A.$, el = A.el, clear = A.clear, TB = FR.table || null;
  var Snd = function () { return FR.Dice && FR.Dice.Sound; };
  /* One beat's sound, made from noise and a few plain waves through the dice's own audio set-up, so
     it obeys the same switch and needs no file. Before the first tap on the page there is no sound
     to make, and nothing happens. */
  function beatSound(kind) {
    var S = Snd(), ctx = S && !S.muted ? S.ctx : null, t, out;
    if (!ctx || !S.out) { return; }
    t = ctx.currentTime + 0.02; out = ctx.createGain(); out.gain.value = 1; out.connect(S.out); if (S.rev) { out.connect(S.rev); }
    var noise = function (type, f0, f1, at, dur, peak, q) {
      var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = S.noise; src.loop = true;
      f.type = type; f.Q.value = q || 0.7; f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + dur);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0004, at + dur);
      src.connect(f); f.connect(g); g.connect(out); src.start(at, Math.random() * 0.1); src.stop(at + dur + 0.05);
    };
    var tone = function (type, f0, f1, at, dur, peak) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0004, at + dur);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + 0.05);
    };
    if (!S.noise) { return; }
    if (kind === 'thunder') {                    // a crack, then a long roll that dies away
      noise('highpass', 1800, 900, t, 0.22, 0.5); noise('lowpass', 900, 70, t + 0.04, 2.4, 0.9); noise('lowpass', 220, 60, t + 0.5, 2.6, 0.6); tone('sine', 70, 38, t + 0.03, 1.6, 0.6);
    } else if (kind === 'hit') {                 // one blow: a knock with weight behind it
      tone('sine', 150, 48, t, 0.26, 0.9); noise('bandpass', 1100, 500, t, 0.09, 0.6, 1.2);
    } else if (kind === 'crash') {               // something heavy going over, and the bits that follow it down
      noise('bandpass', 2600, 300, t, 0.7, 0.8, 0.6); tone('sine', 110, 40, t, 0.4, 0.8);
      [0.12, 0.21, 0.33, 0.47].forEach(function (d, i) { noise('highpass', 2400 + i * 300, 1800, t + d, 0.1, 0.25 - i * 0.04); });
    } else if (kind === 'bell') {                // one stroke of a big bell: a low note and the overtones a bell has
      [[1, 0.5, 2.6], [2, 0.32, 2.0], [2.4, 0.22, 1.6], [3, 0.16, 1.2], [4.2, 0.1, 0.9], [5.43, 0.06, 0.6]].forEach(function (p) { tone('sine', 196 * p[0], 196 * p[0] * 0.997, t, p[2], p[1]); });
      noise('bandpass', 1400, 900, t, 0.05, 0.25, 2);
    } else if (kind === 'reveal') {              // a shimmer going up
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach(function (f, i) { tone('sine', f, f, t + i * 0.07, 1.1, 0.12); tone('sine', f * 2, f * 2, t + i * 0.07, 0.5, 0.04); });
      noise('highpass', 5000, 9000, t, 0.9, 0.05);
    }
    /* a hush has no sound of its own: the soundscape sinks for a moment instead (see beat) */
  }
  /* Play one beat here: its sound, the soundscape sinking under a hush, and with `host` the screen's own
     flash, shake or dimming. The DM's screen uses it too, without a host, so a room with no TV still
     hears the moment. */
  var hushT = 0, beatT = 0;
  tv.beat = function (kind, host) {
    var ms = tv.BEATS[kind], Amb = FR.Ambience, was;
    if (!ms) { return; }
    beatSound(kind);
    if (kind === 'hush' && Amb) {
      was = Amb.level(); clearTimeout(hushT);
      Amb.level(Math.min(was, 0.12)); hushT = setTimeout(function () { Amb.level(tv.level === undefined ? was : tv.level); }, ms);
    }
    if (!host) { return; }
    host.removeAttribute('data-beat'); void host.offsetWidth;                // the same beat twice starts afresh
    host.setAttribute('data-beat', kind);
    clearTimeout(beatT); beatT = setTimeout(function () { host.removeAttribute('data-beat'); }, ms + 80);
  };

  /* ================= the screen ================= */
  var root = $('s-tv');
  if (!root || !TB || !tv.wanted(location.search)) { return; }           // an ordinary visit: there is no big screen to draw

  var N = { recent: 0, recentT: 0, wasWaiting: 0, beat: -1, rollSeen: 0, first: true, gone: false, sound: false, sig: {}, moments: [], playing: false, mapAr: 16 / 9, pics: {}, shut: { n: 0, at: 0 }, shutT: 0 };
  var words = function (key, plain) { return (FR.theme && FR.theme.text && FR.theme.text[key]) || plain; };
  var node = el;
  function put(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) { parent.appendChild(arguments[i]); } } return parent; }
  /* a picture that hides itself if it will not load, so a broken address never shows as a broken box */
  function pic(cls, src, alt) {
    var im = node('img', cls); im.alt = alt || ''; im.decoding = 'async';
    im.addEventListener('error', function () { im.hidden = true; });
    if (src) { im.src = src; } else { im.hidden = true; }
    return im;
  }
  /* a hero's face: their portrait, or their initial on a plain disc until they have one */
  function face(p, cls) {
    var f = node('span', 'tv-face' + (cls ? ' ' + cls : '')), letter = ((p.hero || p.name || '?').replace(/^(the|an?)\s+/i, '') || '?').charAt(0).toUpperCase();
    if (p.portrait || p.img) { put(f, pic('', p.portrait || p.img, '')); } else { f.appendChild(node('i', '', letter)); }
    return f;
  }
  /* a part of the screen is only drawn again when what it shows has changed, so nothing flickers and no animation starts twice */
  function part(name, value, draw) { var sig = JSON.stringify(value === undefined ? null : value); if (N.sig[name] !== sig) { N.sig[name] = sig; N.refit = true; draw(); } }

  /* ---------- the skeleton: built once ---------- */
  var back = pic('tv-back', '', ''), shade = node('div', 'tv-shade'), head = node('header', 'tv-head'), titles = node('div', 'tv-titles'), kicker = node('div', 'tv-chapter'), title = node('h1', 'tv-title');
  var join = node('div', 'tv-join'), main = node('div', 'tv-main'), show = node('div', 'tv-show'), figure = node('figure', 'tv-pic'), mapCell = node('div', 'tv-mapcell'), reveal = node('div', 'tv-reveal');
  var side = node('aside', 'tv-side'), party = node('footer', 'tv-party'), fxHost = node('div', 'tv-fx'), fxNum = node('b', 'tv-fx-n'), cap = node('div', 'tv-cap'), flash = node('div', 'tv-flash');
  var veil = node('button', 'tv-veil'), gone = node('div', 'tv-gone'), wait = node('p', 'tv-wait', 'Finding the table…');
  var sec = {};
  ['big', 'spot', 'ask', 'vote', 'order', 'rolls'].forEach(function (k) { sec[k] = node('section', 'tv-sec tv-' + k); sec[k].hidden = true; side.appendChild(sec[k]); });
  veil.type = 'button'; put(veil, node('b', '', 'Tap to turn on sound'), node('small', '', 'One tap anywhere on this screen. After that it plays by itself.'));
  put(titles, kicker, title); put(head, titles, join);
  put(show, figure, mapCell, reveal); put(main, show, side);
  put(fxHost, fxNum);
  put(root, back, shade, head, main, party, wait, flash, fxHost, cap, veil, gone);
  [back, shade, flash, fxHost].forEach(function (n) { n.setAttribute('aria-hidden', 'true'); });
  gone.hidden = true; cap.hidden = true; reveal.hidden = true; mapCell.hidden = true; main.hidden = true; party.hidden = true; head.hidden = true;
  gone.setAttribute('role', 'alert');

  /* ---------- the way in: the table's code and a square to scan ---------- */
  function qrInto(slot, text) {
    var draw = function () {
      var q;
      if (typeof window.qrcode !== 'function') { return false; }
      try { q = window.qrcode(0, 'M'); q.addData(text); q.make(); slot.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); slot.hidden = false; return true; } catch (e) { return false; }
    };
    slot.hidden = true;
    if (!draw() && A.need) { try { Promise.resolve(A.need('qr')).then(function () { if (root.contains(slot)) { draw(); } }, function () { /* no square: the code does the job alone */ }); } catch (e) { /* the same */ } }
  }
  function joinCard(big) {
    var box = node('div', big ? 'tv-way big' : 'tv-way'), slot = node('div', 'tv-qr'), t = node('div', 'tv-code'), link = TB.link('qr');
    slot.setAttribute('role', 'img'); slot.setAttribute('aria-label', 'A square to scan with a phone. It seats you at this table.');
    put(t, node('small', '', big ? 'Join on your phone' : 'Join the table'), node('b', '', TB.code()), node('span', '', big ? 'Scan the square, or open ' + location.host + ' and type this code.' : location.host));
    put(box, slot, t);
    qrInto(slot, link);
    return box;
  }

  /* ---------- the picture and the map ---------- */
  /* The map is drawn at its picture's own shape, as large as its part of the screen allows, so the
     regions (percentages of the picture) sit exactly where the author put them. */
  function fitMap() {
    var box = mapCell.firstChild, W = mapCell.clientWidth, H = mapCell.clientHeight, w;
    if (!box || !W || !H) { return; }
    w = Math.min(W, H * N.mapAr);
    box.style.width = Math.floor(w) + 'px'; box.style.height = Math.floor(w / N.mapAr) + 'px';
  }
  function drawMap(m) {
    var box = node('div', 'tv-map'), im = pic('', m.img, m.title);
    clear(mapCell);
    im.addEventListener('load', function () { if (im.naturalWidth && im.naturalHeight) { N.mapAr = im.naturalWidth / im.naturalHeight; fitMap(); } });
    box.appendChild(im);
    m.regions.forEach(function (r) {
      var g = node('div', 'tv-reg' + (r.open ? ' open' : ''));
      g.style.left = r.x + '%'; g.style.top = r.y + '%'; g.style.width = r.w + '%'; g.style.height = r.h + '%';
      g.setAttribute('data-id', r.id);
      if (r.name && r.open) { g.appendChild(node('span', '', r.name)); }
      box.appendChild(g);
    });
    if (m.title) { box.appendChild(node('div', 'tv-map-t', m.title)); }
    mapCell.appendChild(box); fitMap();
  }
  /* The same map with other regions open: only the fog changes, so each region clears in its own time.
     A place has its name on the page only once it is uncovered: under the fog there is nothing to read. */
  function openMap(m) {
    var box = mapCell.firstChild;
    if (!box) { return; }
    m.regions.forEach(function (r) {
      var g = Array.prototype.filter.call(box.querySelectorAll('.tv-reg'), function (x) { return x.getAttribute('data-id') === r.id; })[0];
      if (!g) { return; }
      if (r.open && r.name && !g.firstChild) { g.appendChild(node('span', '', r.name)); void g.offsetWidth; }
      if (!r.open) { clear(g); }
      g.classList.toggle('open', r.open);
    });
  }
  /* A picture held face down, then turned over for everyone at once. Its card is its picture's own shape. */
  function drawReveal(r) {
    var card = node('div', 'tv-card'), inner = node('div', 'tv-card-in'), backFace = node('div', 'tv-card-back'), front = node('div', 'tv-card-front'), im = pic('', r.img, r.shown ? r.title : '');
    clear(reveal);
    im.addEventListener('load', function () { if (im.naturalWidth && im.naturalHeight) { card.style.setProperty('--ar', String(Math.max(0.6, Math.min(1.9, im.naturalWidth / im.naturalHeight)))); } });
    put(backFace, node('i', '', '?')); put(front, im); put(inner, backFace, front); put(card, inner);
    put(reveal, card, node('div', 'tv-card-t'));
    reveal.hidden = false;
  }

  /* ---------- beside the picture ---------- */
  function heading(text) { return node('div', 'tv-k', text); }
  function drawSpot(p, turn) {
    var s = sec.spot, t = node('div', 'tv-spot-t');
    clear(s); s.hidden = !p;
    if (!p) { return; }
    put(t, node('b', '', p.hero || p.name), node('small', '', turn ? (p.sub || p.state || '') : (p.hero ? p.name : p.kind)));
    put(s, heading(turn ? 'Whose turn' : 'In the spotlight'), put(node('div', 'tv-spot-b'), face(p, 'big'), t));
  }
  function drawAsk(q) {
    var s = sec.ask, list = node('div', 'tv-ask-l');
    clear(s); s.hidden = !q;
    if (!q) { return; }
    put(s, heading(q.closed ? 'Called off' : (q.waiting ? 'Roll for it' : 'How it went')), node('div', 'tv-ask-t', (q.who ? q.who + ': ' : '') + q.label));
    q.rows.forEach(function (r) {
      var row = node('div', 'tv-ask-r' + (r.rolled ? (r.pass === true ? ' pass' : (r.pass === false ? ' fail' : ' open')) : ' wait')), t = node('span', 'tv-ask-n');
      put(t, node('b', '', r.name), node('small', '', !r.rolled ? (q.closed ? 'Did not roll' : 'Rolling…') : ((r.pass === true ? 'Passed' : (r.pass === false ? 'Did not pass' : 'Rolled')) + (r.nat ? ' · Natural ' + r.nat : ''))));
      put(row, face(r), t, r.rolled ? node('strong', '', String(r.total)) : null);
      list.appendChild(row);
    });
    s.appendChild(list);
  }
  function drawVote(v) {
    var s = sec.vote, list = node('div', 'tv-vote-l');
    clear(s); s.hidden = !v;
    if (!v) { return; }
    put(s, heading(v.open ? 'A vote: pick on your phone' : 'The table has chosen'), node('div', 'tv-vote-q', v.q));
    v.rows.forEach(function (r) {
      var row = node('div', 'tv-vote-r' + (r.win ? ' win' : '')), bar = node('i');
      bar.style.width = Math.round(r.share * 100) + '%';
      put(row, bar, node('span', '', r.text), node('b', '', String(r.n)));
      list.appendChild(row);
    });
    s.appendChild(list);
    if (!v.open) { s.appendChild(node('div', 'tv-vote-w', v.result)); }
    s.classList.toggle('shut', !v.open);
  }
  /* `next`: whose turn it is is already said above the list, so the list is who comes after them */
  function drawOrder(all, next) {
    var s = sec.order, ol = node('ol', 'tv-order-l'), list = next ? all.slice(1) : all;
    clear(s); s.hidden = !list.length;
    if (!list.length) { return; }
    list.forEach(function (e) {
      var li = node('li', 'tv-order-r ' + e.kind + (e.now ? ' now' : '') + (e.state === 'Out' ? ' out' : '')), t = node('span', 'tv-order-n');
      put(t, node('b', '', e.name), e.sub || e.state ? node('small', '', e.state || e.sub) : null);
      put(li, face(e), t);
      if (e.now) { li.setAttribute('aria-current', 'true'); }
      ol.appendChild(li);
    });
    put(s, heading(next ? 'Up next' : 'Turn order'), ol);
  }
  function drawRolls(list) {
    var s = sec.rolls, box = node('div', 'tv-rolls-l'), token = (FR.theme && FR.theme.kit && FR.theme.kit.token) || { name: 'Hero token' };
    clear(s); s.hidden = !list.length;
    if (!list.length) { return; }
    list.forEach(function (r) {
      var row = node('div', 'tv-roll' + (r.nat === 20 ? ' nat20' : (r.nat === 1 ? ' nat1' : '')) + (r.old ? ' old' : '') + (r.n > N.rollSeen && !N.first ? ' new' : '')), t = node('span', 'tv-roll-n');
      put(t, node('b', '', r.name), node('small', '', r.token ? 'Used a ' + token.name + (r.label ? ': ' + r.label : '') : ((r.label || 'A roll') + (r.nat ? ' · Natural ' + r.nat : ''))));
      put(row, face(r), t, r.token ? node('strong', 'tok', '★') : node('strong', '', String(r.total)));
      box.appendChild(row);
    });
    put(s, heading('Rolls'), box);
  }
  /* the party along the bottom: every hero, who plays them, and the tokens they hold */
  function drawParty(list) {
    var token = (FR.theme && FR.theme.kit && FR.theme.kit.token) || { name: 'Hero token', plural: 'Hero tokens' };
    clear(party); party.hidden = !list.length;
    party.setAttribute('data-n', String(Math.min(8, list.length)));
    list.forEach(function (p) {
      var c = node('div', 'tv-hero' + (p.spot ? ' spot' : '')), t = node('span', 'tv-hero-n'), stars;
      put(t, node('b', '', p.hero || p.name), node('small', '', p.hero ? p.name : 'Making a hero'));
      if (p.tokens) {
        stars = node('em', 'tv-stars', p.tokens > 3 ? '★ × ' + p.tokens : new Array(p.tokens + 1).join('★'));
        stars.setAttribute('aria-label', p.tokens + ' ' + (p.tokens === 1 ? token.name : token.plural)); t.appendChild(stars);
      }
      put(c, face(p), t); party.appendChild(c);
    });
  }

  /* ---------- a natural 20 or a natural 1 fills the screen ---------- */
  /* The moment is the same one a phone plays (src/fx.js), drawn at a phone's size on a layer that is
     then scaled up to fill the TV, with who rolled it written underneath. One at a time, in order. */
  function fitFx() {
    var W = root.clientWidth, H = root.clientHeight, k = Math.max(1, Math.min(W / 460, H / 400));
    fxHost.style.width = Math.ceil(W / k) + 'px'; fxHost.style.height = Math.ceil(H / k) + 'px'; fxHost.style.transform = 'scale(' + k.toFixed(4) + ')';
  }
  function nextMoment() {
    var r = N.moments.shift(), t = node('span'), done;
    if (N.playing || !r || !FR.FX || N.gone) { return; }
    N.playing = true; fitFx();
    fxNum.textContent = String(r.nat); fxHost.classList.add('on');
    clear(cap); put(t, node('b', '', r.name + (r.hero ? ' · ' + r.hero : '')), node('small', '', r.label || 'A roll'));
    put(cap, face(r), t); cap.className = 'tv-cap ' + (r.nat === 20 ? 'crit' : 'fumble'); cap.hidden = false;
    done = function () { N.playing = false; fxHost.classList.remove('on'); cap.hidden = true; fxNum.textContent = ''; nextMoment(); };
    try { FR.FX[r.nat === 20 ? 'crit' : 'fumble']({ host: fxHost, anchor: fxNum, fx: FR.theme && FR.theme.fx, reduced: A.reduced }).then(done, done); } catch (e) { done(); }
  }

  /* ---------- sound ---------- */
  /* The soundscape the DM has set, at the DM's level. This screen never plays the cartridge's own
     music under it: the DM's device may be playing that already, and two copies out of step is a mess. */
  function soundscape(s) {
    var Amb = FR.Ambience, bed = s && s.bed && FR.theme && FR.theme.beds ? FR.theme.beds[s.bed] : null;
    if (FR.Music) { FR.Music.scene(''); }
    if (!Amb) { return; }
    if (bed) { tv.level = typeof s.level === 'number' ? s.level : 1; Amb.play(bed); Amb.level(tv.level); } else { tv.level = undefined; Amb.stop(); }
  }
  /* Browsers allow no sound until the page has been touched once. Until then one veil says so; the tap
     (or a key on a remote) is the only thing this screen ever asks of anyone. */
  function soundOn() {
    var S = Snd();
    if (N.sound) { return; }
    N.sound = true; veil.hidden = true;
    if (S) { S.muted = false; S.unlock(); }            // a screen has no settings to turn sound back on with, so it is simply on
    if (FR.Music) { FR.Music.scene(''); FR.Music.enable(false); }       // never the cartridge's own music here, not even the start of a track
    if (TB.isScreen()) { soundscape((TB.stage() || {}).sound); }
  }
  ['pointerdown', 'keydown'].forEach(function (name) { document.addEventListener(name, function (e) { if (e.isTrusted !== false) { soundOn(); } }, true); });

  /* ---------- drawing ---------- */
  /* How a closed vote went stays up for a minute, then makes room. (The table goes on saying how it went
     for longer, for a phone that was asleep; a TV has been watching all along.) */
  var SHUT = 60000;
  function votesNow() {
    var list = TB.votes(), vt = list[0];
    if (!vt || vt.open) { return list; }
    if (N.shut.n !== vt.n) { N.shut = { n: vt.n, at: Date.now() }; clearTimeout(N.shutT); N.shutT = setTimeout(function () { draw(); }, SHUT + 200); }
    return Date.now() - N.shut.at >= SHUT ? [] : list;
  }
  /* ---------- making it fit ----------
     Beside the picture there is room for only so much, and a busy moment has more than that: whose turn,
     a roll asked of three, a vote with four choices, the turn order, the dice. Nothing is ever cut off
     mid-line. Everything is drawn in full, and if that is too tall the least important thing gives way,
     a step at a time, until it fits. If the dice and the turn order giving way is not enough, the side
     takes more of the screen and runs in two columns (the picture gets smaller for that moment), and
     the steps start again. The roll the DM asked for and an open vote are always whole: with a full
     table, a roll asked of everyone and a vote all at once, they are drawn a size down sooner than cut. */
  function fitSide() {
    var each = function (list, fn) { Array.prototype.forEach.call(list, fn); }, wide = false;
    var gap = parseFloat(getComputedStyle(side).rowGap) || 0;
    /* one column: each part's own height, which something sliding into place does not change. Two: has a third column been started? */
    var over = function () {
      var h = 0, n = 0;
      if (wide) { return side.scrollWidth > side.clientWidth + 1; }
      Object.keys(sec).forEach(function (k) { if (!sec[k].hidden && !sec[k].hasAttribute('data-squeezed')) { h += sec[k].offsetHeight; n++; } });
      return h + gap * Math.max(0, n - 1) > side.clientHeight + 1;
    };
    /* hide rows from the end of a list until it fits or only `keep` are left; `more` says how many went */
    var trim = function (k, sel, keep, more) {
      return function () {
        var rows = Array.prototype.filter.call(sec[k].querySelectorAll(sel), function (n) { return !n.hidden; }), note = sec[k].querySelector('.tv-more'), row;
        while (over() && rows.length > keep) {
          row = rows.pop(); row.hidden = true; row.setAttribute('data-cut', '1');
          if (more) { if (!note) { note = node('div', 'tv-more'); sec[k].appendChild(note); } note.textContent = 'and ' + sec[k].querySelectorAll('[data-cut]').length + ' more'; }
        }
      };
    };
    var slim = function (k) { return function () { sec[k].classList.add('slim'); }; };
    var gone = function (k) { return function () { sec[k].setAttribute('data-squeezed', '1'); }; };
    var dense = function () { if (sec.ask.querySelectorAll('.tv-ask-r').length > 4) { sec.ask.classList.add('dense'); } };      // a roll asked of a full table: two names to a line
    var small = function (k) { return function () { side.style.zoom = String(k); }; };                                          // the last resort: all of it a size down, and still none of it cut
    var shut = function (fn) { return function () { if (sec.vote.classList.contains('shut')) { fn(); } }; };          // only a vote that has closed ever gives way
    var whole = function () {
      each(side.querySelectorAll('[data-cut]'), function (n) { n.hidden = false; n.removeAttribute('data-cut'); });
      each(side.querySelectorAll('.tv-more'), function (n) { n.parentNode.removeChild(n); });
      Object.keys(sec).forEach(function (k) { sec[k].classList.remove('slim', 'dense'); sec[k].removeAttribute('data-squeezed'); });
      side.style.zoom = '';
    };
    var fits = function (steps) { for (var i = 0; i < steps.length && over(); i++) { steps[i](); } return !over(); };
    whole(); root.classList.remove('crowded');
    if (root.classList.contains('lobby') || root.classList.contains('no-side')) { return; }
    /* one column: the dice give way, and the turn order down to who is next and the two after */
    if (fits([trim('rolls', '.tv-roll', 2), trim('order', '.tv-order-r', 3, true), shut(slim('vote')), gone('rolls')])) { return; }
    /* two columns, everything back in full, and the same again; then whose moment and the roll's rows get smaller */
    whole(); wide = true; root.classList.add('crowded');
    fits([trim('rolls', '.tv-roll', 2), trim('order', '.tv-order-r', 4, true), shut(slim('vote')), gone('rolls'), trim('order', '.tv-order-r', 1, true), slim('spot'), slim('ask'), gone('order'), dense, shut(gone('vote')),
      small(0.9), gone('spot'), small(0.8), small(0.7), small(0.6)]);
  }

  function draw() {
    var st = TB.stage() || {}, votes = votesNow(), v, token, mapSig;
    if (N.gone || !TB.isScreen()) { return; }
    /* a roll request that everyone has now rolled for (or that was called off) stays up a little while, so the room sees how it went */
    v = tv.view({ scene: TB.scene(), stage: st, players: TB.players(), rolls: TB.rolls(), requests: TB.requests(), votes: votes, recent: N.recent });
    if (v.request && v.request.waiting) { N.wasWaiting = v.request.n; }
    else if (N.wasWaiting && N.recent !== N.wasWaiting) {
      N.recent = N.wasWaiting; N.wasWaiting = 0; clearTimeout(N.recentT);
      N.recentT = setTimeout(function () { N.recent = 0; draw(); }, 30000);
      v = tv.view({ scene: TB.scene(), stage: st, players: TB.players(), rolls: TB.rolls(), requests: TB.requests(), votes: votes, recent: N.recent });
    }
    wait.hidden = true; head.hidden = false; main.hidden = false;
    root.classList.toggle('lobby', v.lobby); root.classList.toggle('with-map', !!v.map && !v.lobby);

    part('title', [v.title, v.chapter, v.lobby], function () {
      title.textContent = v.title || (FR.theme && FR.theme.name) || 'First Roll';
      kicker.textContent = v.lobby ? 'Tonight’s story' : v.chapter; kicker.hidden = !kicker.textContent;
    });
    part('img', v.img, function () {
      var src = v.img || (FR.theme && FR.theme.art && FR.theme.art.thumb) || '';
      clear(figure); figure.hidden = !src;
      if (src) { figure.appendChild(pic('', src, '')); back.hidden = false; back.src = src; } else { back.hidden = true; }
    });
    part('join', [TB.code(), v.lobby, location.host], function () {
      clear(join); clear(sec.big); sec.big.hidden = !v.lobby; join.hidden = v.lobby;
      if (v.lobby) { put(sec.big, joinCard(true)); } else { join.appendChild(joinCard(false)); }
    });
    /* the map: put up, changed for another, or only its fog moved */
    mapSig = v.map && !v.lobby ? [v.map.id, v.map.img, v.map.title, v.map.regions.map(function (r) { return [r.id, r.name, r.x, r.y, r.w, r.h]; })] : null;
    part('map', mapSig, function () { mapCell.hidden = !mapSig; if (mapSig) { drawMap(v.map); } else { clear(mapCell); } });
    part('fog', v.map && !v.lobby ? v.map.regions.map(function (r) { return r.open; }) : null, function () { if (v.map && !v.lobby) { openMap(v.map); } });
    /* a held picture: its card is built once, so that turning it over (and a title that changes as it turns) moves the card that is already there */
    part('reveal', v.reveal ? [v.reveal.id, v.reveal.img] : null, function () { if (v.reveal) { drawReveal(v.reveal); } else { reveal.hidden = true; clear(reveal); } });
    part('reveal-t', v.reveal ? v.reveal.title : null, function () { if (v.reveal && reveal.lastChild) { reveal.lastChild.textContent = v.reveal.title; } });
    part('flip', v.reveal ? v.reveal.shown : null, function () { reveal.classList.toggle('shown', !!(v.reveal && v.reveal.shown)); });

    part('spot', v.lobby ? null : [v.spot || v.turn, !v.spot], function () { drawSpot(v.lobby ? null : (v.spot || v.turn), !v.spot && !!v.turn); });
    part('ask', v.lobby ? null : v.request, function () { drawAsk(v.lobby ? null : v.request); });
    part('vote', v.vote, function () { drawVote(v.vote); });
    part('order', v.lobby ? [] : [v.order, !v.spot && !!v.turn], function () { drawOrder(v.lobby ? [] : v.order, !v.spot && !!v.turn); });
    part('rolls', v.lobby ? [] : v.rolls, function () { drawRolls(v.lobby ? [] : v.rolls); });
    token = FR.theme && FR.theme.kit && FR.theme.kit.token;
    part('party', [v.party, token && token.name], function () { drawParty(v.party); });
    /* with nothing to say beside the picture, the picture and the map have the whole width */
    root.classList.toggle('no-side', !Object.keys(sec).some(function (k) { return !sec[k].hidden; }));
    /* more beside the picture than there is room for: the least important gives way, and nothing stops mid-line */
    if (N.refit) { N.refit = false; fitSide(); }
    fitMap();

    /* news since the last look: a natural 20 or 1 gets its moment (never one from before this screen connected) */
    TB.rolls().forEach(function (r) {
      var p;
      if (r.n <= N.rollSeen) { return; }
      N.rollSeen = r.n;
      if (r.old || N.first || !(r.nat === 20 || r.nat === 1)) { return; }
      p = v.party.filter(function (x) { return x.id === r.id; })[0] || { name: r.role === 'dm' ? 'The DM' : (r.name || 'Someone'), hero: '', portrait: '' };
      N.moments.push({ nat: r.nat, name: p.name, hero: p.hero, portrait: p.portrait, label: r.label || '' });
    });
    if (N.moments.length > 3) { N.moments = N.moments.slice(-3); }       // a flood of them: the newest three are enough
    nextMoment();
    /* a beat is played once, and only while it is still fresh by the table's own clock */
    if (st.beat && st.beat.n !== N.beat) { N.beat = st.beat.n; if (TB.serverNow() - st.beat.at < 6000) { tv.beat(st.beat.kind, root); } }
    soundscape(st.sound);
    N.first = false;
  }

  /* ---------- when there is nothing more to show ---------- */
  function over(titleText, body) {
    N.gone = true;
    if (FR.Ambience) { FR.Ambience.stop(); }
    if (FR.FX) { FR.FX.stop(); }
    [head, main, party, wait, veil, cap].forEach(function (n) { n.hidden = true; });
    clear(gone); put(gone, node('h1', '', titleText), node('p', '', body)); gone.hidden = false;
  }

  /* ---------- starting up ---------- */
  A.go('tv');
  if (FR.Music) { FR.Music.scene(''); }
  setTimeout(function () { veil.classList.add('small'); }, 14000);           // nobody has tapped: lift the veil so the room can see, and keep asking from a corner
  if (Snd()) { Snd().muted = false; }
  /* The table tells its listeners once as this page takes up the key, before anything has been asked,
     and again when the first answer lands. Nothing is drawn until there is an answer: a link that no
     longer works should say so, not show a way in for a moment first. */
  var told = 0;
  TB.onChange(function () {
    if (N.gone) { return; }
    if (TB.isScreen()) { told++; if (told > 1 || TB.scene() || TB.stage() || TB.players().length) { draw(); } }
    else if (TB.can && !TB.can()) { over('Nothing to show here', 'Tables are switched off on this site, so there is no table for this screen to follow.'); }
  });
  TB.onEnd(function (info) {
    if (!info || info.role !== 'screen') { return; }
    if (info.reason === 'closed') { over('This table has ended', 'Thank you for playing. Your DM can open a new table whenever you like.'); }
    else { over('This screen has been turned off', 'Its link no longer works: the DM turned the screen off, made a new link, or the table has gone. Ask your DM for the new link.'); }
  });
  window.addEventListener('resize', function () { if (!N.gone && !main.hidden) { N.refit = false; fitSide(); } fitMap(); if (N.playing) { fitFx(); } });
})();
