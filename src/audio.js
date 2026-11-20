/* First Roll: music, and the cheerful little sounds.
   The sounds are made on the spot with the same Web Audio set-up the dice use (FR.Dice.Sound),
   so they need no files. Music is ordinary audio files named by the theme (theme.music); a
   theme without music is simply quiet. Sound effects and music have separate switches. */
(function () {
  'use strict';
  var Sound = FR.Dice.Sound;

  /* ---------- voices ---------- */
  var ready = function () { return Sound.ctx && !Sound.muted ? Sound.ctx : null; };
  /* a celesta-like bell: a clear note with two quiet overtones that die away faster */
  function bell(f, at, dur, gain) {
    var ctx = Sound.ctx, t0 = ctx.currentTime + (at || 0);
    [[1, 1, 1], [2, 0.32, 0.6], [4.16, 0.1, 0.25]].forEach(function (p) {
      var o = ctx.createOscillator(), g = ctx.createGain(), d = dur * p[2];
      o.type = 'sine'; o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain * p[1], t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0004, t0 + d);
      o.connect(g); g.connect(Sound.out); g.connect(Sound.rev); o.start(t0); o.stop(t0 + d + 0.05);
    });
  }
  var C = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5, 1174.66, 1318.51, 1396.91, 1567.98, 1760, 2093];   // C major from C5

  /* a festive tap for buttons: one soft high bell, never the same twice in a row */
  var lastTink = -1;
  Sound.tink = function () {
    if (!ready()) { return; }
    var pick = [7, 9, 11, 12, 13], i; do { i = Math.floor(Math.random() * pick.length); } while (i === lastTink); lastTink = i;
    bell(C[pick[i]], 0, 0.22, 0.045);
  };
  /* one step up the scale for each quiz answer */
  Sound.step = function (i) { if (!ready()) { return; } bell(C[Math.max(0, Math.min(C.length - 1, i))], 0, 0.6, 0.11); };
  /* ta-da: a rising chord, held */
  Sound.fanfare = function () {
    if (!ready()) { return; }
    [0, 2, 4, 7].forEach(function (n, k) { bell(C[n], k * 0.085, 0.9, 0.12); });
    [7, 9, 11].forEach(function (n) { bell(C[n], 0.42, 1.6, 0.1); });
  };
  /* a run of high bells, like glitter falling */
  Sound.sparkle = function () {
    if (!ready()) { return; }
    for (var k = 0; k < 9; k++) { bell(C[5 + Math.floor(Math.random() * 9)] * 2, k * 0.055 + Math.random() * 0.02, 0.35, 0.035); }
  };
  /* a doorbell: someone has arrived */
  Sound.dingdong = function () { if (!ready()) { return; } bell(C[9], 0, 1.1, 0.13); bell(C[7], 0.36, 1.5, 0.13); };
  /* oh no: two sagging brassy notes */
  Sound.womp = function () {
    var ctx = ready(); if (!ctx) { return; }
    [[233.1, 0], [196, 0.3]].forEach(function (n, k) {
      var t0 = ctx.currentTime + n[1], dur = k ? 0.75 : 0.26, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(n[0], t0); o.frequency.exponentialRampToValueAtTime(n[0] * (k ? 0.8 : 0.97), t0 + dur);
      f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
      o.connect(f); f.connect(g); g.connect(Sound.out); g.connect(Sound.rev); o.start(t0); o.stop(t0 + dur + 0.05);
    });
  };

  /* ---------- music ---------- */
  /* One piece plays at a time. Each part of the app asks for a scene ('intro', 'game', 'fight');
     a scene with several pieces plays them in turn, a scene with one loops it. Browsers only
     allow sound after a tap, so nothing starts until unlock() has been called from one. */
  var VOL = 0.34, FADE = 900;
  var M = { on: true, tracks: null, scene: '', el: null, src: '', at: {}, bad: {}, unlocked: false, fades: [] };
  function fade(el, to, then) {
    var from = el.volume, t0 = Date.now(), id = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / FADE);
      try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) { /* some phones fix the volume */ }
      if (k >= 1) { clearInterval(id); M.fades = M.fades.filter(function (x) { return x !== id; }); if (then) { then(); } }
    }, 40);
    M.fades.push(id);
  }
  function hush() {
    var old = M.el; M.el = null; M.src = '';
    if (old) { old.onended = null; old.onerror = null; fade(old, 0, function () { old.pause(); old.removeAttribute('src'); }); }
  }
  function list() { var l = (M.tracks && M.tracks[M.scene]) || []; return l.filter(function (s) { return !M.bad[s]; }); }
  function play(src, loop) {
    hush();
    var el = new Audio(); el.preload = 'auto'; el.loop = loop; el.volume = 0; el.src = src;
    el.onended = function () { next(); };
    el.onerror = function () { M.bad[src] = true; if (M.el === el) { M.el = null; M.src = ''; next(); } };   // a missing file is skipped, not fatal
    M.el = el; M.src = src;
    var p = el.play(); if (p && p.catch) { p.catch(function () { /* not allowed yet: the next tap tries again */ if (M.el === el) { M.el = null; M.src = ''; } }); }
    fade(el, VOL);
  }
  function next() {
    var l = list(); if (!l.length) { hush(); return; }
    var i = ((M.at[M.scene] === undefined ? -1 : M.at[M.scene]) + 1) % l.length; M.at[M.scene] = i;
    play(l[i], l.length === 1);
  }
  function tune() {
    if (!M.on || !M.unlocked || document.hidden) { if (M.el) { hush(); } return; }
    var l = list();
    if (!l.length) { if (M.el) { hush(); } return; }
    if (M.el && l.indexOf(M.src) >= 0) { return; }          // already playing something for this scene
    var i = M.at[M.scene] === undefined ? 0 : M.at[M.scene] % l.length; M.at[M.scene] = i;
    play(l[i], l.length === 1);
  }
  document.addEventListener('visibilitychange', tune);

  FR.Music = {
    /* tracks: { intro: [...], game: [...], fight: [...] } or null for none */
    use: function (tracks) { if (tracks !== M.tracks) { M.tracks = tracks || null; M.at = {}; tune(); } },
    scene: function (name) { if (name !== M.scene) { M.scene = name; tune(); } },
    enable: function (on) { M.on = !!on; tune(); },
    unlock: function () { if (!M.unlocked) { M.unlocked = true; } if (!M.el) { tune(); } },
    has: function () { return !!M.tracks; },
    playing: function () { return M.el ? M.src : ''; }
  };
})();
