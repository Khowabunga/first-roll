/* First Roll: music, and the cheerful little sounds.
   The sounds are made on the spot with the same Web Audio set-up the dice use (FR.Dice.Sound),
   so they need no files. Music is ordinary audio files named by the theme (theme.music); a
   theme without music is simply quiet. Sound effects and music have separate switches.
   Last comes ambience (FR.Ambience): a quiet soundscape behind a scene, made on the spot too
   unless the cartridge brings a file for it. It follows the sound effects switch. */
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

  /* ---------- ambience ----------
     A soundscape ("bed") behind a scene: wind, a fire, rain, a busy room. The DM picks one for the table
     (a cartridge lists its beds under sound.beds; FR.theme.beds is that list as the page holds it) and
     every device with sound on plays it quietly, under the talking. A bed is either one of the cartridge's
     audio files ({ file }) or one of the voices below ({ synth }). The voices are made on the spot from
     filtered noise and slow movement: no recordings, nothing to download, and no loop point to hear,
     because nothing in them comes round on a beat. They play through the same set-up as every other
     sound here (Sound.ctx, Sound.out, Sound.rev), obey the same switch (Sound.muted) and go quiet while
     the page is hidden, to pick up again when it is back.

       FR.Ambience.play(bed)     bed is { synth: 'wind' }, { file: 'packs/x/audio/rain.mp3' } or the id of one
                                 of FR.theme.beds; nothing (or an id nobody knows) stops it. Asking for the bed
                                 that is already playing changes nothing, so it is safe to call on every poll.
       FR.Ambience.stop()        fade out, and forget what was asked for
       FR.Ambience.level(0..1)   how loud, as the DM set it; with no number it says what it is
       FR.Ambience.playing()     the voice or the file sounding now, or ''
       FR.Ambience.voices        the names play understands as `synth` (FR.AMBIENCE in src/registry.js)
       FR.Ambience.build(ctx, out, name, rev)
                                 one voice wired into any audio graph, sounding from ctx.currentTime; it gives
                                 back { stop(at) }. play() uses it, and so do the tests and the measurements
                                 (an OfflineAudioContext renders a voice without a speaker).

     Browsers only allow sound after a tap, so a bed asked for before the first one starts with it.
     A bed that is a file is music: whoever asks for one should hush the scene music first (FR.Music.scene). */
  var IN = 1.2, OUT = 1.0, FILE_VOL = 0.2;                 // seconds to fade in and out; how loud a file bed is, out of 1
  var kept = typeof WeakMap === 'function' ? new WeakMap() : null;
  function keep(ctx) { var k = kept && kept.get(ctx); if (!k) { k = {}; if (kept) { kept.set(ctx, k); } } return k; }
  /* Five and a half seconds of white noise for a context, made once. Every voice reads this one buffer,
     each reader from its own place and at its own speed, so no two of them ever line up. */
  function whiteOf(ctx) {
    var k = keep(ctx), d, i, n = 262144;
    if (!k.white) { k.white = ctx.createBuffer(1, n, ctx.sampleRate); d = k.white.getChannelData(0); for (i = 0; i < n; i++) { d[i] = Math.random() * 2 - 1; } }
    return k.white;
  }
  /* the same run of numbers every time, so a pattern of drips or chirps is the one that was listened to */
  function steady(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  /* A few seconds of something drawn by hand (water dripping, a cricket), made once for a context and looped.
     It starts and ends in silence, so the join cannot be heard. */
  function drawn(ctx, name, seconds, draw) {
    var k = keep(ctx), rate = 22050;
    if (!k[name]) { k[name] = ctx.createBuffer(1, Math.floor(rate * seconds), rate); draw(k[name].getChannelData(0), rate); }
    return k[name];
  }
  /* drops of water: each a short note that rises as it rings, none the same pitch or the same wait apart */
  function drips(d, rate) {
    var rnd = steady(7), t = 0.35, end = d.length / rate - 0.5, f, a, up, n, k, i, x, ph;
    while (t < end) {
      f = 950 + rnd() * 1500; a = 0.35 + rnd() * 0.65; up = 0.35 + rnd() * 0.5; n = Math.floor((0.07 + rnd() * 0.05) * rate); k = Math.floor(t * rate); ph = 0;
      for (i = 0; i < n; i++) { x = i / n; ph += 2 * Math.PI * f * (1 + up * x) / rate; d[k + i] += Math.sin(ph) * Math.min(1, i / 12) * Math.exp(-x * 5.5) * a; }
      t += 1.1 + rnd() * 2.4;
    }
  }
  /* a cricket: three quick pulses of one high note, again and again, stopping now and then to listen */
  function chirps(d, rate) {
    var rnd = steady(11), t = 0.2, end = d.length / rate - 0.3, f, a, p, n, k, i;
    while (t < end) {
      f = 4250 + rnd() * 120; a = 0.7 + rnd() * 0.3; n = Math.floor(0.017 * rate);
      for (p = 0; p < 3; p++) {
        k = Math.floor((t + p * 0.031) * rate);
        for (i = 0; i < n; i++) { d[k + i] += Math.sin(2 * Math.PI * f * i / rate) * Math.pow(Math.sin(Math.PI * i / n), 2) * a * (p ? 1 : 0.7); }
      }
      t += rnd() < 0.12 ? 1.2 + rnd() * 1.4 : 0.46 + rnd() * 0.1;
    }
  }

  /* The parts every voice is built from, wired into one audio graph. Whatever makes sound or movement
     (a noise reader, a slow wave) is remembered, so the whole voice can be stopped at once. */
  function rig(ctx, out, rev) {
    var t0 = ctx.currentTime, live = [], white = whiteOf(ctx), R;
    var begun = function (node, offset) { node.start(t0, offset || 0); live.push(node); return node; };
    R = {
      ctx: ctx, out: out, rev: rev || null,
      gain: function (v) { var g = ctx.createGain(); g.gain.value = v; return g; },
      filter: function (type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q === undefined ? 0.7 : q; return b; },
      pan: function (v) { var p; if (!ctx.createStereoPanner) { return R.gain(1); } p = ctx.createStereoPanner(); p.pan.value = v; return p; },
      delay: function (seconds) { var d = ctx.createDelay(Math.max(1, seconds * 2)); d.delayTime.value = seconds; return d; },
      /* white noise without end, read at `rate` times its own speed (slower is darker) */
      noise: function (rate) { var s = ctx.createBufferSource(); s.buffer = white; s.loop = true; s.playbackRate.value = rate || 1; return begun(s, Math.random() * white.duration); },
      /* Two readers of the noise added together, the second going round a shorter stretch of it, so the pair
         never comes back to where it began: for dust (below), whose clicks would otherwise fall into a pattern
         that came round every few seconds. */
      grit: function () {
        var sum = ctx.createGain(), b = ctx.createBufferSource(), from = 0.37 + Math.random() * 0.2, to = white.duration - 0.55 - Math.random() * 0.2;
        sum.gain.value = 0.5; R.noise(1).connect(sum);
        b.buffer = white; b.loop = true; b.loopStart = from; b.loopEnd = to;
        begun(b, from + Math.random() * (to - from)).connect(sum);
        return sum;
      },
      /* something drawn (see drawn, above), going round */
      loop: function (buffer, rate, offset) { var s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.playbackRate.value = rate || 1; return begun(s, offset || 0); },
      /* A slow, wandering signal between about -1 and 1: sines at speeds that never line up, so it does
         not repeat for hours. Each part is [cycles a second, weight, where in its cycle it starts (0 to 1)]. */
      wave: function (parts) {
        var sum = ctx.createGain(), total = 0;
        parts.forEach(function (p) { total += p[1] === undefined ? 1 : p[1]; });
        parts.forEach(function (p) {
          var o = ctx.createOscillator(), g = ctx.createGain(), ph = (p[2] || 0) * 2 * Math.PI;
          o.frequency.value = p[0];
          if (ph && ctx.createPeriodicWave) { o.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, Math.sin(ph)]), new Float32Array([0, Math.cos(ph)]), { disableNormalization: true })); }
          g.gain.value = (p[1] === undefined ? 1 : p[1]) / total;
          o.connect(g); g.connect(sum); begun(o);
        });
        return sum;
      },
      /* One shape, drawn over a single cycle by fn(0..1), played again and again at `hz`: a wave of the sea.
         It comes out centred on nothing, with its average height given beside it for whoever needs it. */
      cycle: function (hz, fn) {
        var N = 1024, H = 40, re = new Float32Array(H + 1), im = new Float32Array(H + 1), mean = 0, o = ctx.createOscillator(), i, h, v;
        for (i = 0; i < N; i++) { v = fn(i / N); mean += v / N; for (h = 1; h <= H; h++) { re[h] += 2 * v * Math.cos(2 * Math.PI * h * i / N) / N; im[h] += 2 * v * Math.sin(2 * Math.PI * h * i / N) / N; } }
        o.frequency.value = hz; o.setPeriodicWave(ctx.createPeriodicWave(re, im, { disableNormalization: true }));
        return { node: begun(o), mean: mean };
      },
      /* bend a signal: every value x (-1 to 1) becomes fn(x) */
      shape: function (fn, points) { var w = ctx.createWaveShaper(), n = points || 1024, c = new Float32Array(n), i; for (i = 0; i < n; i++) { c[i] = fn(i / (n - 1) * 2 - 1); } w.curve = c; return w; },
      /* "Dust": lets through only the rare sample of noise that lands above `floor` (just under 1), as a
         click of its own size. Noise in, scattered clicks out: a fire spitting, single drops of rain. The
         higher the floor, the fewer. `under` takes them from the other side of the noise, so two lots of
         dust fed from the one noise never click together. Fed from grit (above), a floor of 0.972 gives
         about twenty clicks a second, 0.98 ten and 0.993 one. */
      dust: function (floor, under) { return R.shape(function (x) { var v = under ? -x : x; return v > floor ? (v - floor) / (1 - floor) : 0; }, 65536); },
      /* let a signal move a setting (a filter's pitch, a loudness) by up to `depth` either way */
      to: function (signal, param, depth) { var g = ctx.createGain(); g.gain.value = depth; signal.connect(g); g.connect(param); },
      /* join parts end to end; gives back the last */
      chain: function () { var a = arguments, i; for (i = 0; i < a.length - 1; i++) { a[i].connect(a[i + 1]); } return a[a.length - 1]; },
      stop: function (at) { live.forEach(function (n) { try { n.stop(at); } catch (e) { /* stopped already */ } }); live = []; }
    };
    return R;
  }

  /* How loud each voice is let out. Set by measurement, so that every bed sits at about the same quiet
     level whichever is chosen: well under a speaking voice, with nothing in it that jumps out. */
  var TRIM = { wind: 0.58, fire: 1, storm: 0.9, crowd: 1.15, cave: 1.25, night: 1.5, sea: 0.9 };

  /* The voices. Each is a few layers of filtered noise, moved slowly. */
  var VOICES = {
    /* Wind: a low moan that swells and sinks in gusts, a thin whistle that comes only with the gusts,
       and a hiss of fine snow or grit in the air. */
    wind: function (R) {
      var gust = R.wave([[0.11, 1, 0.1], [0.067, 0.7, 0.55], [0.031, 0.6, 0.8], [0.29, 0.25, 0.3]]), drift = R.wave([[0.083, 1, 0.4], [0.047, 0.7, 0.05]]);
      var rise = R.chain(gust, R.shape(function (x) { var v = Math.max(0, x + 0.1); return v * v; }));              // 0 in a lull, 1 at the top of a gust
      [[-0.45, 0.97, 400], [0.45, 1.09, 520]].forEach(function (s) {                 // the body of it, a little different in each ear
        var bp = R.filter('bandpass', s[2], 0.9), g = R.gain(0.42);
        R.chain(R.noise(s[1]), R.filter('lowpass', 1100, 0.5), bp, g, R.pan(s[0]), R.out);
        R.to(gust, bp.frequency, s[2] * 0.5); R.to(drift, bp.frequency, s[2] * 0.2); R.to(gust, g.gain, 0.2);
      });
      [[1180, 16, 0.09, -0.2], [760, 11, 0.07, 0.3]].forEach(function (s, i) {      // the whistle round a corner
        var bp = R.filter('bandpass', s[0], s[1]), g = R.gain(0);
        R.chain(R.noise(0.9 + i * 0.3), bp, g, R.pan(s[3]), R.out);
        R.to(i ? gust : drift, bp.frequency, s[0] * 0.18); R.to(rise, g.gain, s[2]);
      });
      var air = R.gain(0.02);
      R.chain(R.noise(1.3), R.filter('highpass', 2600, 0.5), R.filter('lowpass', 7500, 0.5), air, R.out); R.to(rise, air.gain, 0.05);
      R.chain(R.noise(0.55), R.filter('lowpass', 180, 0.6), R.gain(0.12), R.out);                                    // its weight against a wall
    },
    /* Fire: a low, restless roar; a little hiss; small snaps that come in runs; now and then a log pops. */
    fire: function (R) {
      var breathe = R.wave([[0.13, 1, 0.2], [0.31, 0.6, 0.7], [0.071, 0.8, 0.5]]), flutter = R.wave([[1.7, 1, 0], [2.9, 0.8, 0.3], [4.3, 0.6, 0.6], [7.1, 0.3, 0.1]]);
      var roar = R.gain(0.16), body = R.gain(0.12), hiss = R.gain(0.018), room = R.rev ? R.gain(0.35) : null;
      R.chain(R.noise(0.5), R.filter('lowpass', 240, 0.7), R.filter('lowpass', 380, 0.5), roar, R.out); R.to(flutter, roar.gain, 0.07); R.to(breathe, roar.gain, 0.05);
      R.chain(R.noise(0.8), R.filter('bandpass', 480, 0.7), body, R.out); R.to(flutter, body.gain, 0.03);
      R.chain(R.noise(1.2), R.filter('bandpass', 3400, 0.6), hiss, R.out); R.to(breathe, hiss.gain, 0.006);
      var runs = R.chain(breathe, R.shape(function (x) { return 0.35 + 0.65 * Math.max(0, x); }));
      var spit = R.grit();
      [[0.972, false, 'highpass', 1400, 0.7, 0.21, -0.3], [0.98, true, 'bandpass', 2300, 1.4, 0.4, 0.35]].forEach(function (s) {
        var g = R.gain(0), last = R.chain(spit, R.dust(s[0], s[1]), R.filter(s[2], s[3], s[4]), R.filter('lowpass', 7000, 0.5), g, R.pan(s[6]));
        last.connect(R.out); if (room) { last.connect(room); } R.to(runs, g.gain, s[5]);
      });
      R.chain(R.grit(), R.dust(0.993, false), R.filter('bandpass', 700, 1.1), R.gain(0.6), R.out);
      if (room) { room.connect(R.rev); }
    },
    /* Storm: steady rain, single drops too many to count, the weight of the downpour, and thunder a long
       way off. The thunder is a low rumble let through only when three slow waves happen to rise together:
       once a few seconds after the storm begins, then every half minute or so, never the same size twice. */
    storm: function (R) {
      var sheets = R.wave([[0.09, 1, 0.3], [0.041, 0.8, 0.7], [0.23, 0.3, 0.1]]), rain = R.gain(0.075), wash = R.gain(0.07), rumble = R.gain(0), wobble = R.gain(1);
      R.chain(R.noise(1), R.filter('highpass', 700, 0.5), R.filter('lowpass', 5200, 0.5), rain, R.out); R.to(sheets, rain.gain, 0.025);
      R.chain(R.noise(0.8), R.filter('bandpass', 560, 0.5), R.gain(0.035), R.out);                                         // the roar of it on the ground
      [[false, -0.5], [true, 0.5]].forEach(function (s) { R.chain(R.noise(1), R.dust(0.994, s[0]), R.filter('highpass', 1500, 0.6), R.filter('lowpass', 6500, 0.5), R.gain(0.07), R.pan(s[1]), R.out); });
      R.chain(R.grit(), R.dust(0.976, false), R.filter('bandpass', 1000, 2.2), R.gain(0.26), R.pan(0.2), R.out);          // fat drops on a sill
      R.chain(R.noise(0.5), R.filter('lowpass', 320, 0.6), wash, R.out); R.to(sheets, wash.gain, 0.025);
      var roll = R.chain(R.wave([[0.047, 1, 0.13], [0.071, 0.85, 0.02], [0.019, 0.6, 0.2]]), R.shape(function (x) { var v = Math.max(0, x - 0.42) / 0.58; return v * v; }));
      R.chain(R.noise(0.3), R.filter('lowpass', 130, 0.8), R.filter('lowpass', 240, 0.5), wobble, rumble, R.out);
      R.to(R.wave([[2.3, 1, 0], [3.7, 0.8, 0.4], [6.1, 0.5, 0.7]]), wobble.gain, 0.45); R.to(roll, rumble.gain, 0.5);
    },
    /* Crowd: a room full of people talking, none of them close enough to follow. Six "talkers", each a
       band of noise at a pitch a voice has, let through in syllables, in turns, and never quite still;
       under them everyone further off, and the rumble of a full room. */
    crowd: function (R) {
      var room = R.rev ? R.gain(0.5) : null;
      [[330, 3.2, 0.95, -0.6, 0.8], [470, 3.8, 1.07, 0.5, 0.72], [640, 4.2, 0.88, -0.2, 0.6], [900, 4.6, 1.13, 0.3, 0.44], [1350, 5, 0.93, -0.4, 0.29], [2050, 5.5, 1.21, 0.6, 0.18]].forEach(function (s, i) {
        var bp = R.filter('bandpass', s[0], s[1]), g = R.gain(0), who = R.gain(0);
        var syllables = R.chain(R.wave([[2.3 + i * 0.47, 1, i * 0.17], [3.9 + i * 0.31, 0.8, i * 0.29], [5.7 - i * 0.23, 0.5, i * 0.41]]), R.shape(function (x) { return Math.pow(Math.max(0, x + 0.6) / 1.6, 1.3); }));
        var turns = R.chain(R.wave([[0.07 + i * 0.023, 1, i * 0.31], [0.19 - i * 0.011, 0.7, i * 0.13]]), R.shape(function (x) { return 0.25 + 0.75 * Math.max(0, Math.min(1, x * 1.2 + 0.5)); }));
        R.chain(R.noise(s[2]), bp, g, who, R.pan(s[3]), R.out);
        R.to(syllables, g.gain, s[4]); R.to(turns, who.gain, 1);
        R.to(R.wave([[0.37 + i * 0.09, 1, i * 0.2], [0.83 + i * 0.07, 0.6, i * 0.5]]), bp.frequency, s[0] * 0.14);
        if (room) { who.connect(room); }
      });
      R.chain(R.noise(1), R.filter('bandpass', 620, 0.45), R.gain(0.045), R.out);
      R.chain(R.noise(0.45), R.filter('lowpass', 240, 0.6), R.gain(0.045), R.out);
      if (room) { room.connect(R.rev); }
    },
    /* Cave: cold air moving very slowly, the hollow note a draught makes across an opening, and water
       dripping somewhere, each drop answered by its echo off the far wall. */
    cave: function (R) {
      var breath = R.wave([[0.05, 1, 0.3], [0.083, 0.6, 0.6], [0.021, 0.5, 0.1]]), air = R.gain(0.1);
      R.chain(R.noise(0.4), R.filter('lowpass', 160, 0.7), R.filter('lowpass', 260, 0.5), air, R.out); R.to(breath, air.gain, 0.035);
      [[196, 7, 0.16, -0.4, 0.7], [311, 9, 0.08, 0.4, 0.9]].forEach(function (s) {
        var g = R.gain(s[2]); R.chain(R.noise(s[4]), R.filter('bandpass', s[0], s[1]), g, R.pan(s[3]), R.out); R.to(breath, g.gain, s[2] * 0.6);
      });
      var water = drawn(R.ctx, 'drips', 9.3, drips), wet = R.gain(1), echo = R.delay(0.37), far = R.filter('lowpass', 2200, 0.5), back = R.gain(0.42);
      R.chain(R.loop(water, 1, 0), R.gain(0.13), R.pan(-0.3), wet); R.chain(R.loop(water, 0.81, 4.1), R.gain(0.09), R.pan(0.45), wet);
      wet.connect(R.out); R.chain(wet, echo, far, back, echo); R.chain(far, R.gain(0.55), R.out);
      if (R.rev) { R.chain(wet, R.gain(0.6), R.rev); }
    },
    /* Night: open air, leaves that stir when the air does, two crickets (one nearer) and a field of them far off. */
    night: function (R) {
      var stir = R.wave([[0.06, 1, 0.6], [0.11, 0.6, 0.2], [0.027, 0.5, 0.9]]), air = R.gain(0.07), leaves = R.gain(0), field = R.gain(0.008);
      var song = drawn(R.ctx, 'chirps', 7.3, chirps);
      R.chain(R.noise(0.5), R.filter('lowpass', 300, 0.6), air, R.out); R.to(stir, air.gain, 0.025);
      R.chain(R.noise(1.1), R.filter('bandpass', 4300, 0.8), leaves, R.pan(0.25), R.out);
      R.to(R.chain(stir, R.shape(function (x) { var v = Math.max(0, x - 0.1); return v * v; })), leaves.gain, 0.06);
      R.chain(R.loop(song, 1, 0), R.gain(0.09), R.pan(-0.55), R.out); R.chain(R.loop(song, 1.07, 3.3), R.gain(0.05), R.pan(0.6), R.out);
      R.chain(R.noise(1), R.filter('bandpass', 6100, 12), field, R.out); R.to(R.wave([[13, 1, 0], [0.09, 0.5, 0.3]]), field.gain, 0.005);
    },
    /* Sea: one wave, over and over: it gathers, breaks and draws back with a hiss. Two sets of waves at
       different paces, so no two arrive alike, over the sea further out, which never stops. */
    sea: function (R) {
      var swell = function (p) { p = p - Math.floor(p); return p < 0.32 ? Math.pow(p / 0.32, 2.2) : Math.max(0, (Math.exp(-(p - 0.32) / 0.2) - 0.033) / 0.967); };
      [[0.103, 0.1, 0.3, 1], [0.074, 0.8, -0.35, 0.75]].forEach(function (s, i) {      // [waves a second, how far into one it starts, which side, how big]
        var w = R.cycle(s[0], function (p) { return swell(p + s[1]); }), lp = R.filter('lowpass', 420, 0.6), surf = R.gain(0.03), foam = R.gain(0), deep = R.gain(0.03), late = R.delay(1.1);
        var move = function (param, depth) { param.value += w.mean * depth; R.to(w.node, param, depth); };
        R.chain(R.noise(1 - i * 0.14), lp, surf, R.pan(s[2]), R.out); move(lp.frequency, 2400); move(surf.gain, 0.2 * s[3]);
        R.chain(R.noise(0.4 + i * 0.07), R.filter('lowpass', 115, 0.7), deep, R.out); move(deep.gain, 0.14 * s[3]);
        R.chain(R.noise(1.25 + i * 0.1), R.filter('highpass', 3000, 0.5), foam, R.pan(-s[2]), R.out);
        foam.gain.value = w.mean * 0.04 * s[3]; w.node.connect(late); R.to(late, foam.gain, 0.04 * s[3]);                   // the hiss comes a moment after the break
      });
      R.chain(R.noise(0.7), R.filter('bandpass', 900, 0.4), R.gain(0.035), R.out);
    }
  };

  function build(ctx, out, name, rev) {
    var make = VOICES[name], trim, R;
    if (!make) { return { stop: function () {} }; }
    trim = ctx.createGain(); trim.gain.value = TRIM[name] || 1; trim.connect(out);
    R = rig(ctx, trim, rev);
    make(R);
    return { stop: function (at) { R.stop(at); } };
  }

  /* what is asked for, and what is sounding */
  var AMB = { want: null, cur: null, level: 1, master: null };
  var nameOf = function (bed) { return bed ? (bed.file || bed.synth || '') : ''; };
  function ramp(el, to, seconds, then) {             // a file bed is an <audio>, so its fades are done by hand
    var from = el.volume, t0 = Date.now(), id = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / (seconds * 1000));
      try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) { /* some phones fix the volume */ }
      if (k >= 1) { clearInterval(id); if (then) { then(); } }
    }, 40);
    return id;
  }
  function synthBed(bed) {
    var ctx, g, voice, t;
    if (!Sound.ctx) { Sound.unlock(); }
    ctx = Sound.ctx;
    if (!ctx) { return null; }
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { /* the next tap will */ } }
    if (!AMB.master || AMB.master.context !== ctx) { AMB.master = ctx.createGain(); AMB.master.gain.value = AMB.level; AMB.master.connect(Sound.out); }
    t = ctx.currentTime; g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + IN); g.connect(AMB.master);
    voice = build(ctx, g, bed.synth, Sound.rev);
    return { name: bed.synth, end: function () {
      var now = ctx.currentTime;
      try { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + OUT); } catch (e) { /* already gone */ }
      voice.stop(now + OUT + 0.1);
      setTimeout(function () { try { g.disconnect(); } catch (e) { /* already gone */ } }, (OUT + 0.4) * 1000);
    }, level: function () { try { AMB.master.gain.setTargetAtTime(AMB.level, ctx.currentTime, 0.08); } catch (e) { AMB.master.gain.value = AMB.level; } } };
  }
  function fileBed(bed) {
    var el = new Audio(), fading = 0, me, p;
    el.preload = 'auto'; el.loop = true; el.volume = 0; el.src = bed.file;
    var gone = function () { clearInterval(fading); if (AMB.cur === me) { AMB.cur = null; } };       // a missing file, or not allowed yet: the next tap tries again
    me = { name: bed.file, end: function () { clearInterval(fading); el.onerror = null; ramp(el, 0, OUT, function () { el.pause(); el.removeAttribute('src'); }); },
      level: function () { clearInterval(fading); fading = ramp(el, FILE_VOL * AMB.level, 0.25); } };
    el.onerror = gone;
    p = el.play(); if (p && p.catch) { p.catch(gone); }
    fading = ramp(el, FILE_VOL * AMB.level, IN);
    return me;
  }
  /* make what is sounding match what is asked for, given the sound switch and whether the page can be seen */
  function settle() {
    var want = AMB.want && !Sound.muted && !document.hidden ? AMB.want : null;
    if (AMB.cur && nameOf(want) === AMB.cur.name) { return; }
    if (AMB.cur) { AMB.cur.end(); AMB.cur = null; }
    if (want) { AMB.cur = want.file ? fileBed(want) : synthBed(want); }
  }
  /* The sound switch is a plain setting (Sound.muted) that anything may flip. Ambience has to hear it
     flip, to fall silent at once and to come back, so the setting tells it when it changes. */
  (function () {
    var muted = !!Sound.muted;
    try { Object.defineProperty(Sound, 'muted', { configurable: true, enumerable: true, get: function () { return muted; }, set: function (v) { v = !!v; if (v !== muted) { muted = v; settle(); } } }); } catch (e) { /* then play() and the next tap notice instead */ }
  })();
  document.addEventListener('visibilitychange', settle);
  document.addEventListener('pointerdown', function () { if (AMB.want && !AMB.cur) { settle(); } }, true);      // the tap that lets sound begin

  FR.Ambience = {
    voices: Object.keys(VOICES),
    build: build,
    play: function (bed) {
      if (typeof bed === 'string') { bed = (FR.theme && FR.theme.beds && FR.theme.beds[bed]) || null; }
      AMB.want = bed && typeof bed === 'object' && ((typeof bed.file === 'string' && bed.file) || VOICES[bed.synth]) ? (bed.file ? { file: bed.file } : { synth: bed.synth }) : null;
      settle();
    },
    stop: function () { AMB.want = null; settle(); },
    level: function (v) {
      if (typeof v === 'number' && isFinite(v)) { AMB.level = Math.max(0, Math.min(1, v)); if (AMB.cur) { AMB.cur.level(); } else if (AMB.master) { AMB.master.gain.value = AMB.level; } }
      return AMB.level;
    },
    playing: function () { return AMB.cur ? AMB.cur.name : ''; }
  };
})();
