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

  /* ---------- the big moments ----------
     Voices for a natural 20 and a natural 1 (src/fx.js plays them), their short versions for
     everyone else at the table, and two props: dice shaken in a hand, and a dull thud.
     Each call plays through its own volume knob, so Sound.cut() can hush them the moment
     the player taps the effect away without touching the dice clicks or the music. */
  var live = [];
  function knob(lasts) {
    var ctx = Sound.ctx, g = ctx.createGain(), now = ctx.currentTime;
    g.gain.value = 1; g.connect(Sound.out); g.connect(Sound.rev);
    live = live.filter(function (b) { return b.until > now; });
    live.push({ g: g, until: now + lasts });
    return g;
  }
  Sound.cut = function () {
    var ctx = Sound.ctx; if (!ctx) { return; }
    var now = ctx.currentTime;
    live.forEach(function (b) {
      /* a quick fade, not a hard stop, so there is no click */
      try { b.g.gain.cancelScheduledValues(now); b.g.gain.setValueAtTime(b.g.gain.value, now); b.g.gain.linearRampToValueAtTime(0, now + 0.12); } catch (e) { /* already gone */ }
    });
    live = [];
  };
  /* the same bell as above, but through a knob */
  function ping(to, f, t0, dur, gain) {
    var ctx = Sound.ctx;
    [[1, 1, 1], [2, 0.32, 0.6], [4.16, 0.1, 0.25]].forEach(function (p) {
      var o = ctx.createOscillator(), g = ctx.createGain(), d = dur * p[2];
      o.type = 'sine'; o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain * p[1], t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0004, t0 + d);
      o.connect(g); g.connect(to); o.start(t0); o.stop(t0 + d + 0.05);
    });
  }
  /* hiss: noise through a filter that slides from f0 to f1. It is the air in a swell, the
     splash of a cymbal and the scrape of a needle, depending on where the filter sits.
     swell is how far through the sound it is loudest (near 0: a hit, near 1: a build-up);
     from is the level it starts at (silence unless given, so a build-up can be heard at once). */
  function hiss(to, type, f0, f1, q, t0, dur, peak, swell, from) {
    var ctx = Sound.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    var top = t0 + Math.max(0.003, dur * swell);
    src.buffer = Sound.noise; src.loop = true;            // the noise is short, so it goes round
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(from || 0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, top); g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    src.connect(f); f.connect(g); g.connect(to); src.start(t0, Math.random() * 0.1); src.stop(t0 + dur + 0.05);
  }
  /* brass: two saws a hair apart, behind a filter that opens as the note speaks.
     sag below 1 lets the pitch droop to that fraction by the end (a trombone giving up);
     mute keeps the filter half shut (a hand in the bell); wobble adds a slow, sorry vibrato. */
  function brass(to, f, t0, dur, gain, o) {
    var ctx = Sound.ctx, lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = null, depth = null;
    o = o || {};
    lp.type = 'lowpass'; lp.Q.value = o.mute ? 3.2 : 1.1;
    lp.frequency.setValueAtTime(f * 1.4, t0); lp.frequency.exponentialRampToValueAtTime(f * (o.mute ? 3.4 : 5.5), t0 + (o.mute ? 0.09 : 0.06)); lp.frequency.exponentialRampToValueAtTime(f * (o.mute ? 1.5 : 2.4), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03); g.gain.exponentialRampToValueAtTime(gain * 0.72, t0 + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    if (o.wobble) {
      lfo = ctx.createOscillator(); depth = ctx.createGain(); lfo.frequency.value = 5.2;
      depth.gain.setValueAtTime(0.0001, t0); depth.gain.linearRampToValueAtTime(f * 0.022, t0 + dur * 0.5);
      lfo.connect(depth); lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    }
    [-7, 7].forEach(function (cents) {
      var osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.detune.value = cents; osc.frequency.setValueAtTime(f, t0);
      if (o.sag) { osc.frequency.exponentialRampToValueAtTime(f * o.sag, t0 + dur); }
      if (depth) { depth.connect(osc.frequency); }
      osc.connect(lp); osc.start(t0); osc.stop(t0 + dur + 0.05);
    });
    lp.connect(g); g.connect(to);
  }
  /* a drum you feel more than hear: a low note that drops as it dies, two quieter notes
     above it so small phone speakers have something to play, and a soft slap of air on top */
  function drum(to, f, t0, dur, gain) {
    var ctx = Sound.ctx;
    [[1, 1, 'sine'], [2, 0.34, 'triangle'], [3.2, 0.16, 'triangle']].forEach(function (p) {
      var o = ctx.createOscillator(), g = ctx.createGain(), d = dur / p[0];
      o.type = p[2]; o.frequency.setValueAtTime(f * p[0] * 2.2, t0); o.frequency.exponentialRampToValueAtTime(f * p[0], t0 + 0.08); o.frequency.exponentialRampToValueAtTime(f * p[0] * 0.7, t0 + d);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain * p[1], t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t0 + d);
      o.connect(g); g.connect(to); o.start(t0); o.stop(t0 + d + 0.05);
    });
    hiss(to, 'lowpass', 520, 130, 0.7, t0, 0.14, gain * 0.6, 0.04);
  }

  /* natural 20. A held breath (air rushing in, a note climbing under it), then the slam: a
     low drum and a cymbal, three quick brass steps up, and the chord everyone was waiting
     for with bells glittering over the top. hold is the length of the breath in seconds
     (0.42 unless told otherwise; 0 skips straight to the slam). About 2.4 seconds in all. */
  Sound.epic = function (hold) {
    var ctx = ready(); if (!ctx) { return; }
    var h = hold === undefined ? 0.42 : Math.max(0, hold), to = knob(h + 2.4), t = ctx.currentTime + 0.01, s = t + h, k;
    if (h > 0.1) {
      hiss(to, 'bandpass', 420, 5200, 1.1, t, h, 0.26, 0.94, 0.02);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(98, t); o.frequency.exponentialRampToValueAtTime(196, s);
      g.gain.setValueAtTime(0.012, t); g.gain.exponentialRampToValueAtTime(0.16, s - 0.02); g.gain.exponentialRampToValueAtTime(0.0005, s + 0.03);
      o.connect(g); g.connect(to); o.start(t); o.stop(s + 0.08);
    }
    drum(to, 58, s, 1.1, 0.55);
    hiss(to, 'highpass', 5600, 3600, 0.5, s, 0.95, 0.1, 0.01);
    [[392, 0], [523.25, 0.11], [659.25, 0.22]].forEach(function (n) { brass(to, n[0], s + n[1], 0.14, 0.1); });       // G4, C5, E5
    [[130.81, 0.085], [261.63, 0.07], [392, 0.06], [523.25, 0.07], [659.25, 0.06], [783.99, 0.07]].forEach(function (n) { brass(to, n[0], s + 0.33, 1.45, n[1]); });   // C major, C3 to G5
    [1046.5, 1318.51, 1567.98, 2093].forEach(function (f, i) { ping(to, f, s + 0.33 + i * 0.07, 0.9, 0.05); });         // C6 E6 G6 C7
    for (k = 0; k < 7; k++) { ping(to, C[7 + Math.floor(Math.random() * 7)] * 2, s + 0.75 + k * 0.1 + Math.random() * 0.04, 0.4, 0.022); }
  };

  /* natural 1. The music-stops moment (a record dragged to a halt), a beat of nothing, one
     small dry crack, and then the saddest trombone: four steps down, each one sagging, the
     last one giving up altogether. About 2.3 seconds. The thud that goes with it is separate
     (Sound.thud) so it can land exactly when the falling thing does. */
  Sound.doom = function () {
    var ctx = ready(); if (!ctx) { return; }
    var to = knob(2.6), t = ctx.currentTime + 0.01, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.34);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(220, t + 0.34);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.24, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.36);
    o.connect(lp); lp.connect(g); g.connect(to); o.start(t); o.stop(t + 0.4);
    hiss(to, 'bandpass', 2600, 320, 2.2, t, 0.3, 0.12, 0.05);
    hiss(to, 'highpass', 3400, 2200, 0.7, t + 0.42, 0.05, 0.2, 0.05);                          // the crack
    [[233.08, 0.56, 0.25, 0.965], [220, 0.84, 0.25, 0.965], [207.65, 1.12, 0.25, 0.965]].forEach(function (n) { brass(to, n[0], t + n[1], n[2], 0.12, { mute: true, sag: n[3] }); });   // Bb3, A3, Ab3
    brass(to, 196, t + 1.4, 0.9, 0.13, { mute: true, sag: 0.76, wobble: true });               // G3, and down it goes
  };

  /* someone else at the table rolled a natural 20: two quick brass notes up and a glint */
  Sound.heraldUp = function () {
    var ctx = ready(); if (!ctx) { return; }
    var to = knob(0.9), t = ctx.currentTime + 0.01;
    brass(to, 523.25, t, 0.11, 0.07); brass(to, 783.99, t + 0.1, 0.36, 0.08);                  // C5, G5
    ping(to, 1567.98, t + 0.1, 0.5, 0.04); ping(to, 2093, t + 0.19, 0.45, 0.03);
  };
  /* someone else rolled a natural 1: a short two-note sigh from a muted trombone */
  Sound.heraldDown = function () {
    var ctx = ready(); if (!ctx) { return; }
    var to = knob(0.9), t = ctx.currentTime + 0.01;
    brass(to, 233.08, t, 0.16, 0.08, { mute: true, sag: 0.97 }); brass(to, 196, t + 0.17, 0.42, 0.085, { mute: true, sag: 0.84 });
  };

  /* dice shaken in a cupped hand: two quick shakes, there and back, each a short uneven
     run of clicks. Everything sits behind a low filter with a hollow note of its own, which
     is what makes it sound held rather than thrown. strength is 0 to 1; about half a second. */
  Sound.rattle = function (strength) {
    var ctx = ready(); if (!ctx) { return; }
    var v = Math.max(0.2, Math.min(1, strength === undefined ? 0.7 : strength)), to = knob(0.9), at = ctx.currentTime + 0.005, shake, i, n;
    var cup = ctx.createBiquadFilter(), hollow = ctx.createBiquadFilter();
    cup.type = 'lowpass'; cup.frequency.value = 3400; cup.Q.value = 0.8;
    hollow.type = 'peaking'; hollow.frequency.value = 760; hollow.Q.value = 1.5; hollow.gain.value = 8;
    cup.connect(hollow); hollow.connect(to);
    var click = function (t0, gain) {
      var o = ctx.createOscillator(), g = ctx.createGain(), f = 2100 + Math.random() * 1500;
      o.type = 'sine'; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + 0.03);
      g.gain.setValueAtTime(gain * 0.5, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.035);
      o.connect(g); g.connect(cup); o.start(t0); o.stop(t0 + 0.05);
      hiss(cup, 'highpass', 1700, 1500, 0.7, t0, 0.028, gain, 0.05);
    };
    for (shake = 0; shake < 2; shake++) {
      n = 4 + Math.floor(Math.random() * 3);
      for (i = 0; i < n; i++) { click(at, v * (i ? 0.25 + Math.random() * 0.3 : 0.6)); at += 0.024 + Math.random() * 0.034; }   // the first click of each shake is the dice hitting the palm
      at += 0.06;                                                                               // the turn of the wrist
    }
  };

  /* something heavy and soft landing: a low knock with no ring to it. strength is 0 to 1 */
  Sound.thud = function (strength) {
    var ctx = ready(); if (!ctx) { return; }
    var v = Math.max(0.1, Math.min(1, strength === undefined ? 0.8 : strength));
    drum(knob(0.5), 66, ctx.currentTime, 0.24, 0.95 * v);
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
