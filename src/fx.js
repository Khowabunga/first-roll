/* First Roll: the big moments.
   A natural 20 should feel like an event and a natural 1 like a small disaster, so each gets a
   staged two and a half seconds: FR.FX.crit() and FR.FX.fumble() for the person who rolled, and
   FR.FX.herald() as a short banner for everyone else at the table.

   How it is built, and why:
   - One clock. Every moving part is placed from the time since the effect began, so it can be
     paused (the tab is hidden), cut short (a tap) or stepped by hand (the test page) and still
     look right for that instant. Nothing waits for a CSS animation to finish.
   - Only transforms and opacity change from frame to frame. Sizes, colours and shadows are set
     once. Particles are drawn on one canvas, capped in number and in pixels.
   - The page underneath is left alone. Everything lives on a layer laid over the host, taps go
     straight through it (so "Roll again" still works mid-celebration), and the layer is removed
     when the moment ends.
   - The words and the dressing belong to the scenario (opts.fx). Defaults are built in, so a
     scenario that says nothing still gets a proper moment. */
(function () {
  'use strict';

  var HOLD = 420;                 // crit: the held breath before the slam, ms (the sound is told the same number)
  var CRACK = 420, LAND = 1520;   // fumble: when the number cracks, and when the sad thing hits the floor
  var LONG = 2500;                // a full moment
  var STILL = 1500;               // the still version, for people who asked for less motion
  var EXIT = 170;                 // how quickly a tapped-away moment fades
  var STALE = 4000;               // hidden for longer than this, a moment is dropped instead of resumed
  var HERALD = 1960, HERALD_BUSY = 1350, HERALD_QUEUE = 5;
  var MAX_BITS = 130;             // most particles alive at once
  var MAX_PIXELS = 2400000;       // most canvas pixels filled per frame (a phone column at 2x is well under)

  var WORDS = {
    crit: { title: 'Natural 20!', lines: [
      'The best possible number. You may gloat.',
      'Somewhere, someone is already writing this down.',
      'That is the sound of the whole table going quiet.',
      'Luck, skill, who cares. It worked.',
      'Remember this roll. You will be telling people about it.',
      'The dice have decided they like you.'] },
    fumble: { title: 'Natural 1', lines: [
      'Well. That happened.',
      'The dice have seen your plan and voted no.',
      'On the bright side, it cannot get lower.',
      'Let us never speak of this again.',
      'A bold strategy. It did not pay off.',
      'Gravity wins this round.'] }
  };

  /* ---------- small helpers ---------- */
  var clamp = function (k) { return k < 0 ? 0 : k > 1 ? 1 : k; };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a)); };          // how far t has got from a to b, 0 to 1
  var mix = function (a, b, k) { return a + (b - a) * k; };
  var outCubic = function (k) { return 1 - Math.pow(1 - k, 3); };
  var inCubic = function (k) { return k * k * k; };
  var inOut = function (k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  var outBack = function (k) { var c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  /* a spring let go at 0: it overshoots, rings that many times and settles on 1 */
  var spring = function (k, rings, damp) { return 1 - Math.cos(k * Math.PI * 2 * rings) * Math.exp(-k * damp); };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var el = function (cls, text) { var e = document.createElement('div'); e.className = cls; if (text !== undefined) { e.textContent = text; } return e; };
  var part = function (parent, cls, text) { var e = el(cls, text); parent.appendChild(e); return e; };
  var px = function (n) { return n.toFixed(1) + 'px'; };
  var at = function (x, y) { return 'translate3d(' + px(x) + ',' + px(y) + ',0)'; };

  function sound(name, arg) {
    var S = FR.Dice && FR.Dice.Sound;
    if (S && typeof S[name] === 'function') { try { S[name](arg); } catch (e) { /* no sound is no reason to stop the show */ } }
  }
  /* The phone buzzes only when sound effects are on, the same rule the dice follow, and only
     once the person has touched the page: browsers refuse (and complain) before that. */
  var touched = false, buzzing = false;
  function onTouch(e) {
    if (e && e.isTrusted === false) { return; }           // a tap made by a script does not count
    touched = true;
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (n) { document.removeEventListener(n, onTouch, true); });
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (n) { document.addEventListener(n, onTouch, true); });
  function buzz(pattern) {
    var S = FR.Dice && FR.Dice.Sound;
    if (touched && navigator.vibrate && !(S && S.muted)) { try { navigator.vibrate(pattern); buzzing = true; } catch (e) { /* not allowed here */ } }
  }
  function still() { if (buzzing) { buzzing = false; try { navigator.vibrate(0); } catch (e) { /* not allowed here */ } } }

  /* any CSS colour as "r, g, b", so the stylesheet can use it at any strength */
  var probe = null;
  function rgb(color) {
    try {
      probe = probe || document.createElement('canvas').getContext('2d');
      probe.fillStyle = '#000'; probe.fillStyle = color;
      var v = probe.fillStyle, m;
      if (v.charAt(0) === '#') { return [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)].join(', '); }
      m = v.match(/[\d.]+/g);
      if (m && m.length >= 3) { return [m[0], m[1], m[2]].join(', '); }
    } catch (e) { /* fall through to gold */ }
    return '243, 220, 156';
  }
  function themed(host, name, fallback) {
    var v = '';
    try { v = getComputedStyle(host).getPropertyValue(name); } catch (e) { /* not in the page yet */ }
    return (v || '').trim() || fallback;
  }
  /* The first two colours light the scene (beams, rings, the title); all of them colour the
     particles. A scenario that names none gets the theme's gold for a 20 and rubble for a 1. */
  function palette(kind, host, fx) {
    if (fx.colors && fx.colors.length) { return fx.colors.slice(0, 8); }
    if (kind === 'crit') { return [themed(host, '--gilt-hi', '#f3dc9c'), themed(host, '--gilt', '#c9a45c'), '#ffffff', themed(host, '--wax-hi', '#b23a2c')]; }
    return ['#8f8a84', '#5f5a55', '#3a3633', '#b9b2a8'];
  }
  /* opts.fx may be the scenario's whole fx entry ({ crit: {...}, fumble: {...} }) or just the
     half that applies; either way this returns the half for this kind of moment */
  function dressing(fx, kind) { return (fx && (fx[kind] || fx)) || {}; }
  var said = {};
  function pick(kind, lines) {
    var i;
    if (lines.length < 2) { return lines[0] || ''; }
    do { i = Math.floor(Math.random() * lines.length); } while (lines[i] === said[kind]);   // never the same line twice running
    said[kind] = lines[i];
    return lines[i];
  }

  /* ---------- drawn things ---------- */
  /* a d20 seen face-on, for banners and badges */
  function medal(n) {
    return '<svg viewBox="0 0 48 48" aria-hidden="true"><polygon class="fx-m-body" points="24,3 42.2,13.5 42.2,34.5 24,45 5.8,34.5 5.8,13.5"/>' +
      '<polygon class="fx-m-face" points="24,11 37,33.5 11,33.5"/><path class="fx-m-edge" d="M24 3v8M42.2 13.5L37 33.5M5.8 13.5L11 33.5M24 45l13-11.5M24 45L11 33.5M5.8 13.5L24 11l18.2 2.5M42.2 34.5L37 33.5M5.8 34.5L11 33.5"/>' +
      '<text class="fx-m-num" x="24" y="' + (n.length > 1 ? 30.5 : 31) + '" text-anchor="middle">' + n + '</text></svg>';
  }
  /* The one sad object that falls on a natural 1. tip: it topples that many degrees after it
     lands; splat: it stays flattened. All drawn in dull colours on purpose. */
  var PROPS = {
    die: { tip: 0, svg: '<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,4 56.2,18 56.2,46 32,60 7.8,46 7.8,18" fill="#6b6762" stroke="#24211f" stroke-width="2.5" stroke-linejoin="round"/><polygon points="32,15 49,44.5 15,44.5" fill="#8d8882"/><path d="M32 4v11M56.2 18L49 44.5M7.8 18L15 44.5M32 60l17-15.5M32 60L15 44.5M7.8 18L32 15l24.2 3" fill="none" stroke="#3b3835" stroke-width="1.6" stroke-linejoin="round"/><text x="32" y="41" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="20" fill="#1c1a18">1</text><path d="M44 9l-5 9 5 5-6 9 4 6" fill="none" stroke="#1c1a18" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    coal: { tip: 0, svg: '<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="8,42 15,23 30,11 47,15 57,31 53,49 36,58 17,55" fill="#1b1b1f" stroke="#08080a" stroke-width="2.5" stroke-linejoin="round"/><polygon points="15,23 30,11 34,27 22,35" fill="#3a3a42"/><polygon points="30,11 47,15 45,31 34,27" fill="#2a2a31"/><polygon points="34,27 45,31 53,49 37,45" fill="#33333b"/><polygon points="22,35 34,27 37,45 17,55 8,42" fill="#141417"/><path d="M19 25l10-10" stroke="#9a9aa8" stroke-width="2.2" stroke-linecap="round" opacity="0.75"/><circle cx="42" cy="21" r="1.7" fill="#c4c4d2" opacity="0.85"/></svg>' },
    tankard: { tip: 84, svg: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M44 25h5a8 8 0 0 1 8 8v5a8 8 0 0 1-8 8h-6" fill="none" stroke="#5e4128" stroke-width="5" stroke-linecap="round"/><path d="M11 13h36l-3 44H14z" fill="#8a5f38" stroke="#2f1d0e" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 15l1 41M29 15v42M38 15l-1 41" stroke="#5e3f22" stroke-width="1.5"/><path d="M11.6 22h34.8M13.4 48h31.2" stroke="#b9a37c" stroke-width="4.5"/><ellipse cx="29" cy="13" rx="18" ry="4.2" fill="#22150b" stroke="#2f1d0e" stroke-width="2"/></svg>' },
    candle: { tip: 0, svg: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="55" rx="23" ry="5.5" fill="#75664a" stroke="#2e261a" stroke-width="2"/><rect x="22" y="27" width="20" height="28" rx="3" fill="#ded2b6" stroke="#6f6448" stroke-width="2"/><path d="M22 34c4 4 5-3 9 1s6-2 11 1" fill="none" stroke="#b9ab88" stroke-width="2"/><path d="M32 27v-6" stroke="#1f1a16" stroke-width="2.6" stroke-linecap="round"/><path d="M32 18c-6-5 5-8 0-14" fill="none" stroke="#bdb7ad" stroke-width="2" stroke-linecap="round" opacity="0.7"/></svg>' },
    snowball: { tip: 0, splat: true, svg: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="38" rx="24" ry="19" fill="#e9f0f8" stroke="#8ea4bd" stroke-width="2.5"/><ellipse cx="25" cy="31" rx="10" ry="6" fill="#ffffff"/><path d="M40 46c5 2 9 0 11-4" fill="none" stroke="#b9c8da" stroke-width="2" stroke-linecap="round"/><circle cx="52" cy="56" r="3.5" fill="#e9f0f8" stroke="#8ea4bd" stroke-width="1.5"/><circle cx="9" cy="54" r="2.5" fill="#e9f0f8" stroke="#8ea4bd" stroke-width="1.5"/></svg>' },
    star: { tip: 22, svg: '<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,5 39.6,24 60,25.5 44.4,38.6 49.3,58.5 32,47.7 14.7,58.5 19.6,38.6 4,25.5 24.4,24" fill="#8c8672" stroke="#3d392c" stroke-width="2.5" stroke-linejoin="round"/><polygon points="32,5 39.6,24 32,34 24.4,24" fill="#a8a28b"/><polygon points="32,34 44.4,38.6 49.3,58.5 32,47.7" fill="#77725f"/><path d="M47 27l5 8" stroke="#3d392c" stroke-width="1.8" stroke-linecap="round"/></svg>' }
  };
  var PROP_FOR = { coal: 'coal', snow: 'snowball', stars: 'star', embers: 'candle' };
  function propOf(r) { return PROPS[r.fx.object] ? r.fx.object : (PROP_FOR[r.fx.particles] || 'die'); }

  /* ---------- particles ----------
     Each kind is a row of numbers, so a scenario picks its dressing by name:
     g: pull downwards (px/s2; negative floats up), drag: how fast it slows, spin: turn speed,
     lo/hi: size in px, life: seconds, push: how hard a burst throws it, glow: add light where
     bits overlap, float: appears anywhere in the air instead of raining from the top. */
  var KIND = {
    sprinkles: { g: 950, drag: 1.5, spin: 10, lo: 5, hi: 9, life: 1.6, push: 1 },
    snow: { g: 110, drag: 2.4, spin: 1.5, lo: 2.2, hi: 5.6, life: 2.1, push: 0.6, float: true },
    sparks: { g: 520, drag: 1.3, spin: 0, lo: 1.4, hi: 2.8, life: 0.95, push: 1.05, glow: true },
    confetti: { g: 680, drag: 2.0, spin: 8, lo: 6, hi: 10, life: 1.9, push: 1 },
    embers: { g: -150, drag: 1.7, spin: 0, lo: 1.6, hi: 3.4, life: 1.7, push: 0.6, glow: true, float: true },
    coal: { g: 1500, drag: 0.8, spin: 6, lo: 3, hi: 8, life: 1.2, push: 0.85 },
    stars: { g: 150, drag: 2.1, spin: 2.5, lo: 5, hi: 10, life: 1.7, push: 0.75, glow: true, float: true }
  };
  var turn = function (g, p, d) { var c = Math.cos(p.a) * d, s = Math.sin(p.a) * d; g.setTransform(c, s, -s, c, d * p.x, d * p.y); };
  var PAINT = {
    /* a short rounded rod */
    sprinkles: function (g, p, d) { turn(g, p, d); g.lineCap = 'round'; g.lineWidth = p.s * 0.44; g.strokeStyle = p.c; g.beginPath(); g.moveTo(-p.s * 0.8, 0); g.lineTo(p.s * 0.8, 0); g.stroke(); },
    /* a soft dot; the big ones get six short arms */
    snow: function (g, p, d) {
      var i, a;
      turn(g, p, d); g.fillStyle = p.c; g.beginPath(); g.arc(0, 0, p.s * 0.5, 0, 6.2832); g.fill();
      if (p.s > 4.2) { g.strokeStyle = p.c; g.lineWidth = 0.9; g.beginPath(); for (i = 0; i < 3; i++) { a = i * 1.0472; g.moveTo(-Math.cos(a) * p.s, -Math.sin(a) * p.s); g.lineTo(Math.cos(a) * p.s, Math.sin(a) * p.s); } g.stroke(); }
    },
    /* a streak along the way it is flying */
    sparks: function (g, p, d) { g.setTransform(d, 0, 0, d, 0, 0); g.lineCap = 'round'; g.lineWidth = p.s; g.strokeStyle = p.c; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); g.stroke(); },
    /* a paper rectangle that flips as it falls */
    confetti: function (g, p, d) { var f = Math.cos(p.age * 9 + p.ph); turn(g, p, d); g.fillStyle = p.c; g.fillRect(-p.s * 0.5, -p.s * 0.32 * f, p.s, p.s * 0.64 * f); },
    /* a hot dot with a faint halo, flickering */
    embers: function (g, p, d, al) {
      var f = 0.72 + 0.28 * Math.sin(p.age * 15 + p.ph);
      g.setTransform(d, 0, 0, d, d * p.x, d * p.y); g.fillStyle = p.c;
      g.globalAlpha = al * 0.22 * f; g.beginPath(); g.arc(0, 0, p.s * 2.6, 0, 6.2832); g.fill();
      g.globalAlpha = al * f; g.beginPath(); g.arc(0, 0, p.s * 0.6, 0, 6.2832); g.fill();
    },
    /* a rough lump with one paler facet */
    coal: function (g, p, d, al) {
      var i, a;
      turn(g, p, d); g.fillStyle = p.c; g.beginPath();
      for (i = 0; i < 5; i++) { a = i * 1.2566; g.lineTo(Math.cos(a) * p.s * p.sh[i], Math.sin(a) * p.s * p.sh[i]); }
      g.closePath(); g.fill();
      g.globalAlpha = al * 0.16; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 0); g.lineTo(p.s * p.sh[0], 0); g.lineTo(Math.cos(1.2566) * p.s * p.sh[1], Math.sin(1.2566) * p.s * p.sh[1]); g.closePath(); g.fill();
    },
    /* a four-point star that twinkles */
    stars: function (g, p, d) {
      var k = p.s * (0.7 + 0.3 * Math.sin(p.age * 9 + p.ph)), i, a, rr;
      turn(g, p, d); g.fillStyle = p.c; g.beginPath();
      for (i = 0; i < 8; i++) { a = i * 0.7854; rr = i % 2 ? k * 0.3 : k; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
  };
  function canvas(r) {
    var c = document.createElement('canvas'), d = Math.min(window.devicePixelRatio || 1, 2);
    if (r.W * r.H * d * d > MAX_PIXELS) { d = Math.max(1, Math.sqrt(MAX_PIXELS / (r.W * r.H))); }
    c.className = 'fx-canvas'; c.width = Math.round(r.W * d); c.height = Math.round(r.H * d);
    r.stage.appendChild(c);
    r.cv = c; r.g = c.getContext('2d'); r.d = d; r.inked = false;
  }
  function bit(r, x, y, vx, vy) {
    var K = KIND[r.bits], p;
    if (r.ps.length >= MAX_BITS) { return; }
    p = { x: x, y: y, vx: vx * K.push, vy: vy * K.push, a: rand(0, 6.28), va: rand(-1, 1) * K.spin, s: rand(K.lo, K.hi), c: r.colors[Math.floor(Math.random() * r.colors.length)], age: 0, life: K.life * rand(0.7, 1.15), ph: rand(0, 6.28) };
    if (r.bits === 'coal') { p.sh = [rand(0.6, 1), rand(0.6, 1), rand(0.6, 1), rand(0.6, 1), rand(0.6, 1)]; }
    r.ps.push(p);
  }
  /* throw n bits out from a point; up adds a lift, flat squashes the throw towards the ground */
  function burst(r, n, x, y, lo, hi, up, flat) {
    var i, a, v;
    for (i = 0; i < n; i++) { a = rand(0, 6.2832); v = rand(lo, hi); bit(r, x, y, Math.cos(a) * v, Math.sin(a) * v * (flat || 1) - up); }
  }
  /* move every bit on by dt seconds and repaint the canvas */
  function spray(r, dt) {
    var K = KIND[r.bits], g = r.g, ps = r.ps, rn = r.rain, i, p, n, q, f, al, due, keep;
    if (!g) { return; }
    if (rn && r.t >= rn.from) {
      due = Math.min(rn.n, Math.ceil(rn.n * seg(r.t, rn.from, rn.to)));
      while (rn.made < due) {
        rn.made++;
        if (K.g < 0) { bit(r, rand(0, r.W), rand(r.H * 0.45, r.H + 10), rand(-30, 30), rand(-260, -90)); }
        else if (K.float) { bit(r, rand(0, r.W), rand(-10, r.H * 0.72), rand(-40, 40), rand(20, 120)); }
        else { bit(r, rand(0, r.W), -12, rand(-50, 50), rand(60, 260)); }
      }
    }
    if (!ps.length) {
      if (r.inked) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, r.cv.width, r.cv.height); r.inked = false; }
      return;
    }
    n = Math.max(1, Math.ceil(dt / 0.034)); q = dt / n; f = Math.exp(-K.drag * q);      // a slow frame is walked in small steps so nothing tunnels
    while (n-- > 0) {
      for (i = 0; i < ps.length; i++) {
        p = ps[i]; p.age += q;
        p.vx *= f; p.vy = p.vy * f + K.g * q;
        p.x += (p.vx + (K.float ? Math.sin(p.age * 3 + p.ph) * 22 : 0)) * q; p.y += p.vy * q; p.a += p.va * q;
      }
    }
    keep = [];
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, r.cv.width, r.cv.height);
    g.globalCompositeOperation = K.glow ? 'lighter' : 'source-over';
    for (i = 0; i < ps.length; i++) {
      p = ps[i];
      if (p.age >= p.life || p.y > r.H + 40 || p.y < -60) { continue; }
      keep.push(p);
      al = Math.min(1, p.age / 0.07) * clamp((p.life - p.age) / (p.life * 0.35));
      g.globalAlpha = al;
      PAINT[r.bits](g, p, r.d, al);
    }
    r.ps = keep; r.inked = true;
  }

  /* ---------- the layer ---------- */
  var run = null;                 // the big moment on screen, if any
  var hrun = null, hq = [];       // the herald on screen, and the ones waiting their turn
  var raf = 0, last = 0, manual = false;

  function isPage(host) { return host === document.body || host === document.documentElement; }
  /* Lay a box over the host without touching its layout. Inside a positioned host it is an
     absolute child covering the part you can see (so a scrolled list still gets its banner at
     the top); otherwise it is fixed over the same patch of screen. tall: cover the full height. */
  function overlay(host, cls, tall) {
    var e = el(cls), s = e.style, page = isPage(host), b;
    if (page) { s.position = 'fixed'; s.width = '100%'; if (tall) { s.height = '100%'; } }
    else if (getComputedStyle(host).position === 'static') {
      b = host.getBoundingClientRect();
      s.position = 'fixed'; s.left = px(b.left); s.top = px(b.top); s.width = px(b.width); if (tall) { s.height = px(b.height); }
    } else { s.left = host.scrollLeft + 'px'; s.top = host.scrollTop + 'px'; s.width = host.clientWidth + 'px'; if (tall) { s.height = host.clientHeight + 'px'; } }
    (page ? document.body : host).appendChild(e);
    return e;
  }
  function gone(e) { if (e && e.parentNode) { e.parentNode.removeChild(e); } }
  function paint(e, colors) {
    e.style.setProperty('--fx-a', colors[0]); e.style.setProperty('--fx-a-rgb', rgb(colors[0]));
    e.style.setProperty('--fx-b', colors[1] || colors[0]); e.style.setProperty('--fx-b-rgb', rgb(colors[1] || colors[0]));
  }

  /* where the anchor sits on the stage. Its middle is read from the screen and its size from
     the layout, so it comes out right even while the app's own pop-in is still scaling it. */
  function spot(r) {
    var a = r.anchor, b, s, k;
    if (!a || !a.getBoundingClientRect || !a.textContent) { return null; }
    b = a.getBoundingClientRect(); s = r.stage.getBoundingClientRect(); k = (s.width / r.W) || 1;
    if (!b.width || !b.height) { return null; }
    return { x: (b.left + b.width / 2 - s.left) / k, y: (b.top + b.height / 2 - s.top) / k, w: a.offsetWidth || b.width / k, h: a.offsetHeight || b.height / k };
  }
  /* A stand-in for the result number that we are free to throw around. It is built at its
     biggest size and scaled down to start with, so it is sharp when it is large. */
  function standIn(r, big, cls) {
    var a = r.anchor, sp = r.spot, cs = getComputedStyle(a), n = part(r.stage, 'fx-num' + (cls ? ' ' + cls : ''), a.textContent), s = n.style;
    s.fontFamily = cs.fontFamily; s.fontWeight = cs.fontWeight; s.fontStyle = cs.fontStyle; s.color = cs.color;
    s.fontSize = px((parseFloat(cs.fontSize) || 64) * big);
    s.width = px(sp.w * big); s.height = px(sp.h * big); s.lineHeight = px(sp.h * big);
    s.left = px(sp.x - sp.w * big / 2); s.top = px(sp.y - sp.h * big / 2);
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text')) {
      s.backgroundImage = cs.backgroundImage; s.webkitBackgroundClip = 'text'; s.backgroundClip = 'text'; s.webkitTextFillColor = 'transparent';
    }
    return n;
  }
  /* The real number is tucked out of sight while its stand-in performs. Clipping (not hiding)
     keeps its place in the layout and in what a screen reader says. */
  function tuck(r) {
    var s = r.anchor.style;
    r.was = { clip: s.clipPath, wclip: s.webkitClipPath };
    s.webkitClipPath = 'inset(50%)'; s.clipPath = 'inset(50%)';
  }
  function untuck(r) {
    if (!r.was) { return; }
    r.anchor.style.clipPath = r.was.clip; r.anchor.style.webkitClipPath = r.was.wclip; r.was = null;
  }
  /* The host itself may lean or jolt. That is done with the separate rotate, translate and
     scale properties, which stack on top of whatever transform the app already gave it. */
  function grip(r) {
    var s = r.host.style;
    if (isPage(r.host) || r.fx.tilt === false || !('rotate' in s) || !('translate' in s)) { return; }
    r.held = { rotate: s.rotate, translate: s.translate, scale: s.scale, will: s.willChange };
    s.willChange = 'transform';
  }
  function lean(r, deg, dy, k) {
    var s;
    if (!r.held) { return; }
    s = r.host.style;
    s.rotate = Math.abs(deg) > 0.001 ? deg.toFixed(3) + 'deg' : r.held.rotate;
    s.translate = Math.abs(dy) > 0.01 ? '0px ' + dy.toFixed(2) + 'px' : r.held.translate;
    s.scale = Math.abs(k - 1) > 0.0001 ? k.toFixed(4) : r.held.scale;
  }
  function letGo(r) {
    var s;
    if (!r.held) { return; }
    s = r.host.style; s.rotate = r.held.rotate; s.translate = r.held.translate; s.scale = r.held.scale; s.willChange = r.held.will; r.held = null;
  }
  function letters(e, text) {
    var out = [], chars = Array.from ? Array.from(text) : text.split(''), i, s;
    for (i = 0; i < chars.length; i++) { s = document.createElement('span'); s.textContent = chars[i]; e.appendChild(s); out.push(s); }
    return out;
  }
  /* shrink a one-line title until it fits the column; one too long even for that may wrap */
  function fit(e, room) {
    var w = e.scrollWidth, size = parseFloat(getComputedStyle(e).fontSize);
    if (w <= room) { return; }
    e.style.fontSize = Math.max(17, Math.floor(size * room / w)) + 'px';
    if (size * room / w < 17) { e.style.whiteSpace = 'normal'; }
  }
  function leaving(r, t) { return r.cut === null ? 1 : 1 - seg(t, r.cut, r.cut + EXIT); }
  function fade(e, op) { e.style.opacity = op <= 0 ? '0' : op >= 1 ? '1' : op.toFixed(3); }
  function show(e, tf, op) { e.style.transform = tf; fade(e, op); }

  /* ---------- natural 20 ----------
     0.00  the held breath: the column dims, the number lifts off its place and swells, a ring
           closes in on it, and the sound draws breath with it
     0.42  the slam: a flash, two shockwave rings, beams of light turning behind the number, a
           burst of the scenario's particles, the edge of the column glowing, the column kicks
     0.50  the title lands a letter at a time, then the scenario's line under it
     1.95  afterglow: the light fades and the number flies home, landing with a small glint */
  function buildCrit(r) {
    var st = r.stage, W = r.W, H = r.H, sp = r.spot, cx = W / 2, cy = H * 0.38, big = 1, small = 1, settled = false;
    var veil = part(st, 'fx-veil'), beamA = part(st, 'fx-beams'), beamB = part(st, 'fx-beams fx-thin'), bloom = part(st, 'fx-bloom');
    var gasp = part(st, 'fx-ring'), ring1 = part(st, 'fx-ring'), ring2 = part(st, 'fx-ring fx-soft'), glint = part(st, 'fx-ring fx-soft');
    var edge, num = null, banner, title, spans, line, gap;
    canvas(r);
    edge = part(st, 'fx-edge');
    if (sp) {
      big = Math.max(1.3, Math.min(3.4, W * 0.52 / sp.w, 176 / sp.h)); small = 1 / big;
      num = standIn(r, big); tuck(r);
    }
    banner = part(st, 'fx-banner'); title = part(banner, 'fx-title'); spans = letters(title, r.title);
    part(banner, 'fx-rule'); line = part(banner, 'fx-line', r.line);
    banner.style.top = px(sp ? cy + sp.h * big / 2 + 2 : cy - 44);
    fit(title, W - 36);
    gap = Math.min(34, 300 / spans.length);
    grip(r);

    r.draw = function (t, dt) {
      var x = leaving(r, t), s = t - HOLD, away = inOut(seg(t, 0, HOLD - 30)) - inOut(seg(t, 1960, 2420)), k, b, i;
      if (x < 1) { st.style.opacity = x.toFixed(3); }
      fade(veil, outCubic(seg(t, 0, 320)) * (1 - inOut(seg(t, 1950, 2420))));
      if (num) {
        k = t < HOLD ? mix(small, 0.74, outCubic(seg(t, 0, HOLD))) : mix(0.74 + 0.26 * spring(seg(t, HOLD, HOLD + 640), 2, 5), small, inOut(seg(t, 1960, 2420)));
        b = t < HOLD ? Math.sin(t * 0.085) * 1.6 * seg(t, 120, HOLD) : 0;                // a tremble as the breath is held
        show(num, at((cx - sp.x) * away + Math.sin(Math.PI * away) * 16 + b, (cy - sp.y) * away) + ' scale(' + k.toFixed(4) + ')', 1 - seg(t, 2435, 2495));
      }
      show(gasp, at(cx, cy) + ' scale(' + mix(3.6, 0.5, inCubic(seg(t, 40, HOLD))).toFixed(3) + ')', t < HOLD ? 0.6 * seg(t, 40, 260) : 0);
      k = seg(t, HOLD, HOLD + 340);
      show(bloom, at(cx, cy) + ' scale(' + mix(0.5, 2.1, outCubic(k)).toFixed(3) + ')', s >= 0 ? 1 - outCubic(k) : 0);
      k = seg(t, HOLD, HOLD + 700);
      show(ring1, at(cx, cy) + ' scale(' + mix(0.3, 7.8, outCubic(k)).toFixed(3) + ')', s >= 0 ? 0.95 * (1 - k) : 0);
      k = seg(t, HOLD + 140, HOLD + 920);
      show(ring2, at(cx, cy) + ' scale(' + mix(0.3, 6.2, outCubic(k)).toFixed(3) + ')', k > 0 ? 0.6 * (1 - k) : 0);
      k = seg(t, 2400, LONG);
      show(glint, at(sp ? sp.x : cx, sp ? sp.y : cy) + ' scale(' + mix(0.2, 1.5, outCubic(k)).toFixed(3) + ')', k > 0 ? 0.8 * (1 - k) : 0);
      b = outCubic(seg(t, HOLD, HOLD + 220)) * (1 - inOut(seg(t, 1750, 2300)));
      k = mix(0.5, 1, outBack(seg(t, HOLD, HOLD + 460))) * 2.3;
      show(beamA, at(cx, cy) + ' rotate(' + (s * 0.03).toFixed(2) + 'deg) scale(' + k.toFixed(3) + ')', 0.92 * b);
      show(beamB, at(cx, cy) + ' rotate(' + (15 - s * 0.021).toFixed(2) + 'deg) scale(' + (k * 0.86).toFixed(3) + ')', 0.7 * b);
      fade(edge, outCubic(seg(t, HOLD, HOLD + 160)) * (0.72 + 0.28 * Math.cos(s / 170)) * (1 - inOut(seg(t, 1800, 2400))));
      show(banner, at(0, mix(22, 0, outBack(seg(t, HOLD + 60, HOLD + 420))) - 16 * inCubic(seg(t, 1900, 2200))), outCubic(seg(t, HOLD + 60, HOLD + 200)) * (1 - seg(t, 1900, 2200)));
      if (!settled) {
        for (i = 0; i < spans.length; i++) {
          k = seg(t, HOLD + 80 + i * gap, HOLD + 340 + i * gap);
          show(spans[i], at(0, mix(24, 0, outBack(k))) + ' scale(' + mix(1.7, 1, outCubic(k)).toFixed(3) + ')', outCubic(seg(k, 0, 0.5)));      // each letter comes up from below, so none of them crosses the number
        }
        settled = t > HOLD + 360 + spans.length * gap;
      }
      line.style.opacity = seg(t, HOLD + 430, HOLD + 720).toFixed(3);
      lean(r, 0, 0, 1 + (s >= 0 && s < 420 ? 0.018 * Math.exp(-s / 85) * Math.cos(s / 40) * x : 0));
      spray(r, dt);
    };
    r.cues.push({ at: 0, fn: function () { sound('epic', HOLD / 1000); } });
    r.cues.push({ at: HOLD, fn: function () {
      buzz([40, 50, 30, 70, 120]);
      burst(r, 76, cx, cy, 240, 780, 140);
      r.rain = { from: HOLD + 120, to: 1450, n: 46, made: 0 };
    } });
    r.cues.push({ at: 2430, fn: function () { untuck(r); } });
    r.end = LONG;
  }

  /* ---------- natural 1 ----------
     0.00  the music-stops moment: a spotlight of shame on the number, the colour drains out
           of the column, the number gulps and shivers
     0.42  it cracks in two, the halves sag, and the whole column slumps to one side
     0.60  a plaque drops in with the title and a dry line; a second later one of its nails
           gives and it hangs crooked
     0.94  the halves drop off the bottom of the screen
     1.52  one sad object lands where the number was, with a thud, a puff and a jolt
     2.18  the colour comes back, the column straightens and the number returns */
  function buildFumble(r) {
    var st = r.stage, W = r.W, H = r.H, sp = r.spot, ax = sp ? sp.x : W / 2, ay = sp ? sp.y : H * 0.62;
    var size = sp ? Math.max(54, Math.min(88, sp.h * 1.05)) : 72, floor = sp ? sp.y + sp.h / 2 : ay + size / 2, drop = H - ay + size * 2;
    var prop = PROPS[propOf(r)], veil = part(st, 'fx-veil'), a = null, b = null, crack = null, plaque, title, thing, shade, pw, high;
    /* a pool of light left on the number, dark everywhere else (the veil is drawn at a quarter
       size and stretched, hence the fours) */
    veil.style.background = 'radial-gradient(circle at ' + px(ax / 4) + ' ' + px(ay / 4) + ', rgba(6,8,12,0) 0, rgba(6,8,12,0.1) ' + px(size * 0.9 / 4) + ', rgba(6,8,12,0.66) ' + px(size * 3.2 / 4) + ')';
    canvas(r);
    shade = part(st, 'fx-shade'); shade.style.width = px(size * 1.1); shade.style.height = px(size * 0.26); shade.style.left = px(ax - size * 0.55); shade.style.top = px(floor - size * 0.15);
    if (sp) {
      a = standIn(r, 1, 'fx-half-a'); b = standIn(r, 1, 'fx-half-b'); tuck(r);
      crack = part(st, 'fx-crack'); crack.style.left = px(sp.x - sp.w / 2); crack.style.top = px(sp.y - sp.h / 2); crack.style.width = px(sp.w); crack.style.height = px(sp.h);
      crack.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="56,-4 47,22 58,40 44,61 53,80 46,104"/></svg>';
    }
    pw = Math.min(310, W * 0.84); high = ay < H * 0.5;         // the plaque goes wherever the number is not
    plaque = part(st, 'fx-plaque'); title = part(plaque, 'fx-title', r.title); part(plaque, 'fx-line', r.line);
    plaque.style.width = px(pw); plaque.style.left = px((W - pw) / 2); plaque.style.top = px(H * (high ? 0.6 : 0.3));
    fit(title, pw - 36);
    thing = part(st, 'fx-prop'); thing.innerHTML = prop.svg;
    thing.style.width = px(size); thing.style.height = px(size); thing.style.left = px(ax - size / 2); thing.style.top = px(floor - size);
    r.grey = overlay(r.host, 'fx-grey', true);
    grip(r);

    r.draw = function (t, dt) {
      var x = leaving(r, t), out = inOut(seg(t, 2180, 2460)), since = t - LAND, k, gulp, shiver, split, sag, fa, fb, slump, jolt, q;
      if (x < 1) { st.style.opacity = x.toFixed(3); }
      fade(veil, outCubic(seg(t, 0, 240)) * (1 - out));
      r.grey.style.opacity = (outCubic(seg(t, 0, 280)) * (1 - out) * x).toFixed(3);
      if (a) {
        if (t < 2220) {
          gulp = 1 + 0.14 * outCubic(seg(t, 0, 260));
          shiver = t < CRACK ? Math.sin(t * 0.17) * 2.4 * seg(t, 250, CRACK) : 0;
          split = outCubic(seg(t, CRACK, CRACK + 90)); sag = inOut(seg(t, CRACK + 60, 930));
          fa = Math.pow(seg(t, 1060, 1500), 2); fb = Math.pow(seg(t, 940, 1400), 2);        // falling: slow, then fast
          show(a, at(-3 * split - 2 * sag, 5 * sag + drop * fa) + ' rotate(' + (shiver - 3 * split - 9 * sag - 46 * fa).toFixed(2) + 'deg) scale(' + gulp.toFixed(3) + ')', 1);
          show(b, at(3 * split + 5 * sag, split + 12 * sag + drop * fb) + ' rotate(' + (shiver + 4 * split + 15 * sag + 72 * fb).toFixed(2) + 'deg) scale(' + gulp.toFixed(3) + ')', 1);
        } else {
          k = seg(t, 2220, 2440);                                                           // back in one piece, as if nothing happened
          show(a, 'none', k); show(b, 'none', k);
        }
        show(crack, 'none', t >= CRACK ? 1 - seg(t, CRACK + 140, CRACK + 560) : 0);
      }
      slump = outBack(seg(t, CRACK + 40, 900)) * (1 - out) * x;
      jolt = since >= 0 ? Math.exp(-since / 90) * Math.cos(since / 36) * x : 0;
      lean(r, -1.7 * slump, 7 * slump + 5 * jolt, 1);
      k = seg(t, 600, 880);
      show(plaque, at(0, mix(-46, 0, outBack(k))) + ' rotate(' + (-2.5 * k + 14 * spring(seg(t, 1180, 2050), 1.6, 4.2)).toFixed(2) + 'deg)', seg(t, 600, 700) * (1 - seg(t, 2150, 2400)));
      k = seg(t, 1040, LAND); q = since >= 0 ? Math.exp(-since / 70) * Math.cos(since / 28) : 0;
      show(thing, at(0, -(floor + 30) * (1 - k * k)) + ' rotate(' + (mix(-28, 0, k) + prop.tip * inOut(seg(t, LAND + 110, LAND + 480))).toFixed(2) + 'deg) scale(' + (1 + 0.16 * q + (prop.splat && since >= 0 ? 0.14 : 0)).toFixed(3) + ',' + (1 - 0.22 * q - (prop.splat && since >= 0 ? 0.24 : 0)).toFixed(3) + ')',
        t >= 1040 ? 1 - seg(t, 2150, 2400) : 0);
      show(shade, 'scale(' + mix(0.4, 1, k * k).toFixed(3) + ')', 0.55 * k * k * (1 - seg(t, 2150, 2400)));
      spray(r, dt);
    };
    r.cues.push({ at: 0, fn: function () { sound('doom'); } });
    r.cues.push({ at: CRACK, fn: function () { buzz(25); } });
    r.cues.push({ at: LAND, fn: function () { sound('thud', 0.9); buzz(80); burst(r, 24, ax, floor - 6, 70, 330, 150, 0.4); } });
    r.cues.push({ at: 2445, fn: function () { untuck(r); } });
    r.end = LONG;
  }

  /* ---------- the still version ----------
     For people who asked for less motion: no flash, shake, tilt or particles. A plain badge
     with the title and the line fades in, sits for a second and fades out. The sound plays. */
  function buildStill(r) {
    var st = r.stage, crit = r.kind === 'crit', badge, icon, title;
    part(st, 'fx-veil');
    badge = part(st, 'fx-badge'); icon = part(badge, 'fx-badge-icon');
    icon.innerHTML = crit ? medal('20') : PROPS[propOf(r)].svg;
    title = part(badge, 'fx-title', r.title); part(badge, 'fx-line', r.line);
    fit(title, badge.clientWidth - 40);
    r.draw = function (t) { st.style.opacity = (Math.min(seg(t, 0, 140), 1 - seg(t, STILL - 160, STILL)) * leaving(r, t)).toFixed(3); };
    r.cues.push({ at: 0, fn: function () { sound(crit ? 'epic' : 'doom', 0); } });
    r.end = STILL;
  }

  /* ---------- running a moment ---------- */
  function step(r, t) {
    var dt = Math.max(0, t - r.t) / 1000;
    r.t = t;
    while (r.cues.length && r.cues[0].at <= t) { r.cues.shift().fn(); }
    r.draw(t, dt);
    if (t >= r.end) { r.done(r, r.cut === null); }
  }
  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(100, now - last) : 16;      // after a long gap (a hidden tab, a locked phone) carry on from where it was
    last = now;
    if (!manual) {
      if (run) { step(run, run.t + dt); }
      if (hrun) { step(hrun, hrun.t + dt); }
    }
    if (run || hrun) { raf = requestAnimationFrame(frame); } else { last = 0; }
  }
  function wake() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
  /* A hidden tab gets no frames, so everything simply waits where it was. Back within a few
     seconds, it carries on; away for longer, the moment has passed and is cleared away. */
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    last = 0;
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > STALE && (run || hrun || hq.length)) { stop(); }
    hiddenAt = 0;
  });

  var TAPS = window.PointerEvent ? ['pointerdown'] : ['touchstart', 'mousedown'];
  function dismiss() {
    var r = run;
    if (!r || r.cut !== null) { return; }
    r.cut = r.t; r.end = Math.min(r.end, r.t + EXIT); r.cues = [];
    untuck(r); sound('cut'); still();
  }
  function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { dismiss(); } }
  /* Any tap ends the moment early. We only listen; the tap still reaches whatever was under it. */
  function listen(on) {
    var f = on ? 'addEventListener' : 'removeEventListener';
    TAPS.forEach(function (n) { document[f](n, dismiss, true); });
    document[f]('keydown', onKey, true);
  }
  function finish(r, whole) {
    if (run !== r) { return; }
    run = null; listen(false); untuck(r); letGo(r); gone(r.stage); gone(r.grey);
    r.resolve(!!whole);
    pump();
  }
  function moment(kind, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var host = opts.host || document.body, fx = dressing(opts.fx, kind), r;
      if (run) { finish(run, false); }                                   // called again while running: the old one makes way
      if (hrun) { hrun.end = Math.min(hrun.end, hrun.t + 200); }         // someone else's news steps aside for your own
      r = { kind: kind, host: host, fx: fx, reduced: !!opts.reduced, anchor: opts.anchor || null, resolve: resolve, done: finish, t: 0, cut: null, cues: [], ps: [], rain: null, grey: null, held: null, was: null };
      r.title = fx.title || WORDS[kind].title;
      r.line = pick(kind, fx.lines && fx.lines.length ? fx.lines : WORDS[kind].lines);
      r.colors = palette(kind, host, fx);
      r.bits = KIND[fx.particles] ? fx.particles : (kind === 'crit' ? 'sparks' : 'coal');
      r.stage = overlay(host, 'fx-stage fx-' + kind + (r.reduced ? ' fx-still' : ''), true);
      r.stage.setAttribute('aria-hidden', 'true');
      paint(r.stage, r.colors);
      r.W = r.stage.offsetWidth; r.H = r.stage.offsetHeight;
      r.spot = r.reduced ? null : spot(r);
      if (r.reduced) { buildStill(r); } else if (kind === 'crit') { buildCrit(r); } else { buildFumble(r); }
      r.cues.sort(function (p, q) { return p.at - q.at; });
      run = r; listen(true);
      step(r, 0);
      wake();
    });
  }

  /* ---------- the herald ----------
     Someone else rolled a natural 20 or a natural 1. A pill drops in at the top with their
     name, stays under two seconds and leaves. It covers almost nothing, a tap on it sends it
     away, and if several arrive they take turns (faster when there is a queue). */
  function endHerald(h, whole) {
    if (hrun !== h) { return; }
    hrun = null; gone(h.box);
    h.resolve(!!whole);
    pump();
  }
  function pump() {
    var item, o, h, kind, crit, fx, wrap, pill, med, text, sparks = [], shine, hgt, i, life;
    if (hrun || run || !hq.length) { return; }
    item = hq.shift(); o = item.opts; kind = o.kind === 'fumble' ? 'fumble' : 'crit'; crit = kind === 'crit'; fx = dressing(o.fx, kind);
    life = hq.length >= 2 ? HERALD_BUSY : HERALD;
    h = { kind: kind, resolve: item.resolve, done: endHerald, t: 0, cut: null, cues: [], end: life };
    h.box = overlay(o.host || document.body, 'fx-herald fx-' + kind, false);
    h.box.setAttribute('role', 'status');
    paint(h.box, palette(kind, o.host || document.body, fx));
    wrap = part(h.box, 'fx-h-wrap'); pill = part(wrap, 'fx-h-pill');
    med = part(pill, 'fx-h-medal'); med.innerHTML = medal(crit ? '20' : '1');
    text = part(pill, 'fx-h-text');
    if (o.name) { part(text, 'fx-h-name', o.name); }
    part(text, 'fx-h-what', (fx.title || WORDS[kind].title) + (o.label ? ' · ' + o.label : ''));
    if (crit && !o.reduced) {
      shine = part(pill, 'fx-h-shine');
      for (i = 0; i < 8; i++) { sparks.push(part(wrap, 'fx-h-spark')); }
    }
    hgt = wrap.offsetHeight + 60;
    wrap.addEventListener('click', function () { h.end = Math.min(h.end, h.t + 220); });

    h.draw = function (t) {
      var T = h.end, o1 = Math.min(seg(t, 0, 130), 1 - seg(t, T - 150, T)), k, a, d;
      if (o.reduced) { show(wrap, 'none', o1); return; }
      show(wrap, at(0, -hgt * (1 - outBack(seg(t, 0, 300))) - hgt * inCubic(seg(t, T - 260, T))) + (crit ? '' : ' rotate(' + (-2.6 * spring(seg(t, 420, 1100), 1.5, 4)).toFixed(2) + 'deg)'), o1);
      if (crit) {
        med.style.transform = 'scale(' + mix(0.5, 1, outBack(seg(t, 120, 480))).toFixed(3) + ')';
        shine.style.transform = 'translate3d(' + mix(-120, 420, seg(t, 320, 900)).toFixed(1) + 'px,0,0) skewX(-18deg)';
        for (i = 0; i < sparks.length; i++) {
          k = seg(t, 200 + i * 14, 820 + i * 14); a = i * 0.7854 + 0.3; d = mix(8, 44, outCubic(k));
          show(sparks[i], at(Math.cos(a) * d, Math.sin(a) * d) + ' scale(' + mix(1, 0.3, k).toFixed(3) + ')', k > 0 && k < 1 ? 1 - k : 0);
        }
      } else {
        med.style.transform = 'translate3d(0,' + (3 * seg(t, 420, 700)).toFixed(1) + 'px,0) rotate(' + (-16 * outBack(seg(t, 420, 760))).toFixed(1) + 'deg)';
      }
    };
    h.cues.push({ at: 40, fn: function () { sound(crit ? 'heraldUp' : 'heraldDown'); } });
    hrun = h;
    step(h, 0);
    wake();
  }
  function herald(opts) {
    return new Promise(function (resolve) {
      hq.push({ opts: opts || {}, resolve: resolve });
      while (hq.length > HERALD_QUEUE) { hq.shift().resolve(false); }      // a flood: the oldest news is dropped, never the newest
      pump();
    });
  }

  /* End everything now. The sounds are hushed only if something was actually playing, so a
     routine call before each new roll does not clip an unrelated sound. */
  function stop() {
    var waiting = hq, busy = !!(run || hrun);
    hq = [];
    waiting.forEach(function (i) { i.resolve(false); });
    if (hrun) { endHerald(hrun, false); }
    if (run) { finish(run, false); }
    if (busy) { sound('cut'); still(); }
  }

  FR.FX = {
    /* opts: { anchor, host, fx: { title, lines, particles, colors, object, tilt }, reduced }.
       Each returns a promise: true if the moment played to the end, false if it was cut short. */
    crit: function (opts) { return moment('crit', opts); },
    fumble: function (opts) { return moment('fumble', opts); },
    /* opts: { kind: 'crit' | 'fumble', name, label, host, fx, reduced } */
    herald: herald,
    stop: stop,
    particles: Object.keys(KIND), objects: Object.keys(PROPS),
    /* For the test page only: stop the clock and set the time by hand, to look at one instant. */
    test: {
      manual: function (on) { manual = !!on; if (!manual) { wake(); } },
      seek: function (ms, which) {
        var r = which === 'herald' ? hrun : run, same = function () { return r === (which === 'herald' ? hrun : run); };
        if (!r) { return -1; }
        while (same() && r.t + 16 < ms) { step(r, r.t + 16); }
        if (same() && ms > r.t) { step(r, ms); }
        return r.t;
      },
      state: function () { return { moment: run ? run.kind : '', t: run ? run.t : 0, bits: run ? run.ps.length : 0, herald: hrun ? hrun.kind : '', waiting: hq.length }; }
    }
  };
})();
