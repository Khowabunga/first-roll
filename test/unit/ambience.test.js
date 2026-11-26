/* Ambience: FR.Ambience at the end of src/audio.js, the soundscape a DM puts behind a scene.
   Node has no Web Audio, so these tests run the real file against a stand-in that records what is
   built: which sources are started and stopped, what is wired to what, and what each volume is told
   to do. That proves the wiring and the rules (the sound switch, a hidden page, fades, one bed at a
   time). What the seven voices sound like cannot be checked here: that is measured in a browser by
   rendering each with an OfflineAudioContext, and judged by ear. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const P = require('../../scripts/lib/packs.js');
const SRC = fs.readFileSync(path.join(P.ROOT, 'src', 'audio.js'), 'utf8');

/* One page's worth of world for src/audio.js: the dice's sound set-up, a document, <audio>, timers and a clock moved by hand. */
function world(opts) {
  const o = opts || {}, log = { nodes: [], started: [], stopped: [], timers: [], listeners: {}, audios: [] };
  let now = 1000;
  const param = (v) => ({ value: v, events: [], setValueAtTime(x, t) { this.events.push(['set', x, t]); this.value = x; }, linearRampToValueAtTime(x, t) { this.events.push(['ramp', x, t]); this.value = x; },
    setTargetAtTime(x, t) { this.events.push(['target', x, t]); this.value = x; }, cancelScheduledValues(t) { this.events.push(['cancel', t]); } });
  const ctx = { currentTime: 10, sampleRate: 48000, state: 'running', resumed: 0 };
  const node = (kind, more) => { const n = Object.assign({ kind: kind, context: ctx, to: [], connect(x) { this.to.push(x); return x; }, disconnect() { this.cut = true; } }, more); log.nodes.push(n); return n; };
  const source = (kind, more) => node(kind, Object.assign({ start(t, offset) { this.at = t; this.offset = offset; log.started.push(this); }, stop(t) { this.until = t; log.stopped.push(this); } }, more));
  Object.assign(ctx, {
    createGain: () => node('gain', { gain: param(1) }),
    createBiquadFilter: () => node('filter', { type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
    createStereoPanner: () => node('pan', { pan: param(0) }),
    createDelay: (max) => node('delay', { delayTime: param(0), max: max }),
    createWaveShaper: () => node('shaper', { curve: null }),
    createOscillator: () => source('osc', { type: 'sine', frequency: param(440), setPeriodicWave(w) { this.wave = w; } }),
    createBufferSource: () => source('buffer', { buffer: null, loop: false, playbackRate: param(1) }),
    createBuffer: (channels, length, rate) => { const data = new Float32Array(length); return { length: length, sampleRate: rate, duration: length / rate, getChannelData: () => data }; },
    createPeriodicWave: (re, im, opt) => ({ re: re, im: im, opt: opt }),
    resume() { this.resumed++; this.state = 'running'; }
  });
  const Sound = { ctx: o.noContext ? null : ctx, out: node('out', {}), rev: node('rev', {}), muted: false, unlocked: 0, unlock() { this.unlocked++; if (o.unlockGives) { this.ctx = ctx; } } };
  const document = { hidden: false, addEventListener(type, fn) { (log.listeners[type] = log.listeners[type] || []).push(fn); } };
  function Audio() { this.volume = 1; this.paused = true; log.audios.push(this); }
  Audio.prototype.play = function () { this.paused = false; return o.blocked ? Promise.reject(new Error('not allowed yet')) : Promise.resolve(); };
  Audio.prototype.pause = function () { this.paused = true; };
  Audio.prototype.removeAttribute = function (k) { delete this[k]; this.removed = k; };
  const setInterval = (fn) => { const t = { fn: fn, on: true }; log.timers.push(t); return t; }, clearInterval = (t) => { if (t) { t.on = false; } };
  const setTimeout = (fn) => { const t = { fn: fn, on: true, once: true }; log.timers.push(t); return t; };
  const FR = { Dice: { Sound: Sound }, theme: { beds: { wind: { label: 'Wind', synth: 'wind' }, song: { label: 'A song', file: 'packs/x/audio/song.mp3?v=1' } } } };
  new Function('FR', 'document', 'Audio', 'setInterval', 'clearInterval', 'setTimeout', 'Date', SRC)(FR, document, Audio, setInterval, clearInterval, setTimeout, { now: () => now });
  return { FR: FR, A: FR.Ambience, Sound: Sound, ctx: ctx, log: log, document: document, node: node,
    fire: (type) => (log.listeners[type] || []).forEach((fn) => fn()),
    tick: (ms) => { now += ms; log.timers.filter((t) => t.on).forEach((t) => { if (t.once) { t.on = false; } t.fn(); }); } };
}
/* can sound from this node get to that one, following the wires? */
function reaches(from, to) {
  const seen = new Set(), todo = [from];
  while (todo.length) { const n = todo.pop(); if (n === to) { return true; } if (!n || seen.has(n) || !n.to) { continue; } seen.add(n); n.to.forEach((x) => todo.push(x)); }
  return false;
}
const VOICES = P.engine().AMBIENCE;

test('FR.Ambience is play, stop, level and playing, and its voices are the seven the registry lists', () => {
  const w = world();
  assert.deepStrictEqual(Object.keys(w.A).sort(), ['build', 'level', 'play', 'playing', 'stop', 'voices']);
  assert.deepStrictEqual(w.A.voices, VOICES);
  assert.deepStrictEqual(VOICES, ['wind', 'fire', 'storm', 'crowd', 'cave', 'night', 'sea']);
  assert.strictEqual(w.A.playing(), '');
  assert.strictEqual(w.A.level(), 1);
  assert.strictEqual(w.log.started.length, 0, 'nothing sounds until it is asked for');
  /* the rest of the file is as it was: the music and the small sounds are still there */
  assert.deepStrictEqual(Object.keys(w.FR.Music).sort(), ['enable', 'has', 'playing', 'scene', 'unlock', 'use']);
  ['tink', 'step', 'fanfare', 'sparkle', 'dingdong', 'womp', 'cut', 'epic', 'doom', 'heraldUp', 'heraldDown', 'rattle', 'thud'].forEach((v) => assert.strictEqual(typeof w.Sound[v], 'function', v));
});

test('each voice is filtered noise and slow movement, wired to the one output it is given, and stops when told', () => {
  VOICES.forEach((name) => {
    const w = world(), out = w.node('here', {}), rev = w.node('room', {}), before = w.log.nodes.length;
    const voice = w.A.build(w.ctx, out, name, rev), made = w.log.nodes.slice(before), sources = w.log.started.slice();
    const noise = sources.filter((s) => s.kind === 'buffer' && s.buffer.sampleRate === 48000), drawn = sources.filter((s) => s.kind === 'buffer' && s.buffer.sampleRate !== 48000), slow = sources.filter((s) => s.kind === 'osc');
    assert.ok(noise.length >= 3, name + ' is layers of noise (' + noise.length + ')');
    assert.ok(slow.length >= 2 && slow.every((o) => o.frequency.value < 20), name + ' is moved slowly: nothing in it is a note');
    assert.ok(made.filter((n) => n.kind === 'filter').length >= 3, name + ' is filtered');
    sources.forEach((s) => { assert.strictEqual(s.at, 10, name + ' starts now'); if (s.kind === 'buffer') { assert.strictEqual(s.loop, true, name + ': every reader goes round'); } });
    noise.concat(drawn).forEach((s) => assert.ok(reaches(s, out), name + ': every layer reaches the output'));
    noise.forEach((s) => assert.ok(s.offset >= 0 && s.offset < s.buffer.duration && s.buffer === noise[0].buffer, name + ': one noise, each reader at its own place in it'));
    assert.ok(new Set(noise.map((s) => s.offset)).size > 1);
    /* everything leaves through one trim, set by measurement; nothing is wired past it to the output or to anything else */
    const into = made.filter((n) => n.to.indexOf(out) >= 0);
    assert.strictEqual(into.length, 1, name + ' has one way out');
    assert.ok(into[0].kind === 'gain' && into[0].gain.value > 0.3 && into[0].gain.value <= 2);
    made.forEach((n) => n.to.forEach((x) => assert.ok(x !== w.Sound.out && x !== w.Sound.rev, name + ' only uses what it was handed')));
    /* a loudness is never left where slow movement could push it below nothing for long: every steady layer starts at or above zero */
    made.filter((n) => n.kind === 'gain').forEach((g) => assert.ok(g.gain.value >= 0, name));
    voice.stop(12.5);
    assert.strictEqual(w.log.stopped.length, sources.length, name + ': everything that was started is stopped');
    w.log.stopped.forEach((s) => assert.strictEqual(s.until, 12.5));
    /* and with no reverb to send to, it is built just the same */
    const dry = world(), plain = dry.node('here', {});
    dry.A.build(dry.ctx, plain, name);
    assert.strictEqual(dry.log.started.length, sources.length, name + ' without a room');
  });
  const w = world(), n = w.log.nodes.length;
  assert.doesNotThrow(() => w.A.build(w.ctx, w.node('here', {}), 'kazoo').stop(0));
  assert.strictEqual(w.log.started.length, 0, 'a voice nobody knows is silence, not an error');
  assert.strictEqual(w.log.nodes.length, n + 1);
});

test('what goes round has no join to hear: the noise is white, and the drawn loops begin and end in silence', () => {
  const peak = (d, from, to) => { let m = 0; for (let i = from; i < to; i++) { m = Math.max(m, Math.abs(d[i])); } return m; };
  const drawnBy = (name) => { const w = world(), out = w.node('here', {}); w.A.build(w.ctx, out, name); return w.log.started.filter((s) => s.kind === 'buffer' && s.buffer.sampleRate !== 48000).map((s) => s.buffer); };
  [['cave', 'water dripping'], ['night', 'a cricket']].forEach(([name, what]) => {
    const bufs = drawnBy(name), d = bufs[0].getChannelData(0), rate = bufs[0].sampleRate;
    assert.ok(bufs.length === 2 && bufs[0] === bufs[1], name + ': ' + what + ' is drawn once and read twice, at two speeds');
    assert.ok(bufs[0].duration > 5 && bufs[0].duration < 12);
    assert.strictEqual(peak(d, 0, Math.floor(0.15 * rate)), 0, name + ' begins in silence');
    assert.strictEqual(peak(d, d.length - Math.floor(0.2 * rate), d.length), 0, name + ' ends in silence');
    assert.ok(peak(d, 0, d.length) > 0.3 && peak(d, 0, d.length) <= 1.5, name + ' has something in it');
    assert.deepStrictEqual(Array.from(drawnBy(name)[0].getChannelData(0).slice(0, 40000)), Array.from(d.slice(0, 40000)), name + ' is the same pattern every time it is made');
  });
  const w = world(), out = w.node('here', {});
  w.A.build(w.ctx, out, 'wind'); w.A.build(w.ctx, out, 'sea');
  const noises = w.log.started.filter((s) => s.kind === 'buffer').map((s) => s.buffer), white = noises[0].getChannelData(0);
  assert.ok(noises.every((b) => b === noises[0]), 'one context makes its noise once, whatever plays');
  assert.ok(white.length >= 5 * 48000 && peak(white, 0, white.length) <= 1 && peak(white, 0, 1000) > 0.5);
  let sum = 0; for (let i = 0; i < white.length; i++) { sum += white[i]; }
  assert.ok(Math.abs(sum / white.length) < 0.01, 'and it is centred, so nothing in it thumps');
});

test('play fades a bed in over about a second, stop fades it out, and only one plays at a time', () => {
  const w = world(), A = w.A, fadeOf = () => w.log.nodes.filter((n) => n.kind === 'gain' && n.gain.events.length && n.gain.events[0][0] === 'set' && n.gain.events[0][1] === 0);
  A.play({ synth: 'wind' });
  assert.strictEqual(A.playing(), 'wind');
  const first = w.log.started.slice(), fade = fadeOf()[0], master = fade.to[0];
  assert.ok(first.length > 5);
  assert.deepStrictEqual(fade.gain.events, [['set', 0, 10], ['ramp', 1, 11.2]], 'from nothing to full over 1.2 seconds');
  assert.ok(master.kind === 'gain' && master.to.length === 1 && master.to[0] === w.Sound.out, 'through its own volume into the same output as every other sound');
  first.filter((s) => s.kind === 'buffer').forEach((s) => assert.ok(reaches(s, w.Sound.out)));
  /* asking again for what is playing changes nothing, so a screen can call it on every poll */
  A.play({ synth: 'wind' }); A.play('wind'); A.play({ synth: 'wind', label: 'Wind' });
  assert.strictEqual(w.log.started.length, first.length);
  /* how loud: the DM's setting, 0 to 1 */
  assert.strictEqual(A.level(0.4), 0.4);
  assert.deepStrictEqual(master.gain.events[master.gain.events.length - 1].slice(0, 2), ['target', 0.4]);
  assert.strictEqual(A.level(7), 1); assert.strictEqual(A.level(-3), 0); assert.strictEqual(A.level('loud'), 0, 'not a number: left as it was'); assert.strictEqual(A.level(0.5), 0.5);
  assert.strictEqual(A.level(), 0.5);
  /* another bed: the first fades out and is stopped just after, the second fades in */
  w.ctx.currentTime = 20;
  A.play({ synth: 'fire' });
  assert.strictEqual(A.playing(), 'fire');
  assert.deepStrictEqual(fade.gain.events.slice(-3).map((e) => e[0]), ['cancel', 'set', 'ramp']);
  assert.deepStrictEqual(fade.gain.events[fade.gain.events.length - 1], ['ramp', 0, 21], 'to nothing over a second');
  assert.strictEqual(w.log.stopped.length, first.length);
  w.log.stopped.forEach((s) => assert.strictEqual(s.until, 21.1, 'stopped once it can no longer be heard'));
  const second = w.log.started.slice(first.length);
  assert.ok(second.length > 3 && second.every((s) => s.at === 20));
  assert.deepStrictEqual(fadeOf()[1].gain.events, [['set', 0, 20], ['ramp', 1, 21.2]]);
  assert.strictEqual(fadeOf()[1].to[0], master, 'the same volume serves every bed, so the level carries over');
  /* stop: fade out, forget what was asked for */
  w.ctx.currentTime = 30;
  A.stop();
  assert.strictEqual(A.playing(), '');
  assert.strictEqual(w.log.stopped.length, w.log.started.length);
  assert.ok(second.every((s) => s.until === 31.1));
  w.tick(2000);
  assert.ok(fade.cut && fadeOf()[1].cut, 'and what has faded out is unhooked');
  w.fire('visibilitychange'); w.fire('pointerdown');
  assert.strictEqual(A.playing(), '', 'stopped is stopped: nothing brings it back but play');
  /* a bed by the id the cartridge gives it; anything the engine cannot play is the same as stop */
  A.play('wind'); assert.strictEqual(A.playing(), 'wind');
  [null, undefined, 'nope', {}, { synth: 'kazoo' }, { file: '' }, 42].forEach((bed) => { A.play('wind'); A.play(bed); assert.strictEqual(A.playing(), '', JSON.stringify(bed)); });
});

test('ambience follows the sound switch and goes quiet while the page is hidden', () => {
  const w = world(), A = w.A;
  A.play('wind');
  const n = w.log.started.length;
  /* the switch every other sound obeys: off is silence at once, on brings the bed back */
  w.Sound.muted = true;
  assert.strictEqual(w.Sound.muted, true, 'the switch still reads as it was set');
  assert.strictEqual(A.playing(), '');
  assert.strictEqual(w.log.stopped.length, n);
  w.Sound.muted = true;
  assert.strictEqual(w.log.started.length, n, 'setting it again does nothing');
  w.Sound.muted = false;
  assert.strictEqual(w.Sound.muted, false);
  assert.strictEqual(A.playing(), 'wind');
  assert.strictEqual(w.log.started.length, 2 * n);
  /* a hidden page is silent; back in view, it picks up */
  w.document.hidden = true; w.fire('visibilitychange');
  assert.strictEqual(A.playing(), '');
  assert.strictEqual(w.log.stopped.length, 2 * n);
  A.play('wind');
  assert.strictEqual(A.playing(), '', 'asked for while hidden: remembered, not played');
  w.document.hidden = false; w.fire('visibilitychange');
  assert.strictEqual(A.playing(), 'wind');
  /* asked for while the switch is off: it waits for the switch */
  const q = world();
  q.Sound.muted = true;
  q.A.play({ synth: 'sea' });
  assert.strictEqual(q.A.playing(), ''); assert.strictEqual(q.log.started.length, 0);
  q.Sound.muted = false;
  assert.strictEqual(q.A.playing(), 'sea');
  /* the small sounds still obey the same switch */
  const before = q.log.started.length;
  q.Sound.muted = true; q.Sound.tink();
  assert.strictEqual(q.log.started.length, before);
});

test('a bed that is one of the cartridge\'s audio files loops quietly, with the same fades and the same rules', async () => {
  const w = world(), A = w.A;
  A.play('song');
  const el = w.log.audios[0];
  assert.strictEqual(w.log.audios.length, 1);
  assert.deepStrictEqual([el.src, el.loop, el.paused, el.volume], ['packs/x/audio/song.mp3?v=1', true, false, 0]);
  assert.strictEqual(A.playing(), 'packs/x/audio/song.mp3?v=1');
  assert.strictEqual(w.log.started.length, 0, 'a file needs none of the voices');
  w.tick(600); assert.ok(Math.abs(el.volume - 0.1) < 1e-9, 'halfway up after 0.6 seconds');
  w.tick(600); assert.ok(Math.abs(el.volume - 0.2) < 1e-9, 'and there after 1.2: a fifth of full, under the talking');
  w.tick(5000); assert.ok(Math.abs(el.volume - 0.2) < 1e-9);
  A.level(0.5); w.tick(250);
  assert.ok(Math.abs(el.volume - 0.1) < 1e-9, 'the DM\'s level scales it');
  A.play('song');
  assert.strictEqual(w.log.audios.length, 1, 'asking again changes nothing');
  /* the switch, and stop */
  w.Sound.muted = true;
  w.tick(500); assert.ok(Math.abs(el.volume - 0.05) < 1e-9, 'fading out');
  w.tick(500);
  assert.deepStrictEqual([el.volume, el.paused, el.removed], [0, true, 'src'], 'and let go once silent');
  w.Sound.muted = false;
  assert.strictEqual(w.log.audios.length, 2);
  A.stop(); w.tick(1000);
  assert.ok(w.log.audios[1].paused);
  /* from a file to a voice and back: one at a time */
  A.play('song'); A.play('wind');
  assert.strictEqual(A.playing(), 'wind');
  w.tick(1000);
  assert.ok(w.log.audios[2].paused);
  /* a browser that will not play yet (no tap so far): nothing is claimed, and the next tap tries again */
  const b = world({ blocked: true });
  b.A.play('song');
  await new Promise((done) => setImmediate(done));
  assert.strictEqual(b.A.playing(), '');
  b.fire('pointerdown');
  assert.strictEqual(b.log.audios.length, 2, 'the tap tries again');
  /* a file that is not there is silence, not an error */
  const m = world();
  m.A.play({ file: 'packs/x/audio/missing.mp3' });
  m.log.audios[0].onerror();
  assert.strictEqual(m.A.playing(), '');
});

test('ambience waits for sound to be allowed: no audio set-up yet, a set-up that is asleep, or no Web Audio at all', () => {
  /* the dice have not made their set-up yet: ambience asks for it, as any sound would */
  const w = world({ noContext: true, unlockGives: true });
  w.A.play('wind');
  assert.strictEqual(w.Sound.unlocked, 1);
  assert.strictEqual(w.A.playing(), 'wind');
  /* a set-up the browser has put to sleep is woken */
  const s = world(); s.ctx.state = 'suspended';
  s.A.play('wind');
  assert.strictEqual(s.ctx.resumed, 1);
  assert.strictEqual(s.A.playing(), 'wind');
  /* a browser with no Web Audio: silence, no error, and a later tap may yet find one */
  const n = world({ noContext: true });
  assert.doesNotThrow(() => { n.A.play('wind'); n.A.level(0.3); });
  assert.strictEqual(n.A.playing(), '');
  n.Sound.ctx = n.ctx;
  n.fire('pointerdown');
  assert.strictEqual(n.A.playing(), 'wind', 'the first tap that allows sound starts what was asked for');
  assert.strictEqual(n.A.level(), 0.3);
});
