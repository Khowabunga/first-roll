/* First Roll: physically simulated dice. three.js draws them, cannon.js throws them,
   the Web Audio API makes them clink. The number that counts is whichever face
   ends up flat on top once every die has come to rest. */
var FR = (typeof FR !== 'undefined') ? FR : {};

FR.Dice = (function () {
  var T = null, C = null;                       // THREE, CANNON (set in init)
  var renderer, scene, camera, world, canvas, env;
  var mats = {}, floorMesh, rim = [], walls = [], lightKey, lightCandle;
  var dice = [], running = false, raf = 0, lastT = 0, acc = 0;
  var state = 'idle', rollStart = 0, nudges = 0, onSettle = null, onFrame = null;
  var view = { w: 1, h: 1, visW: 10.5, visH: 20, camH: 24, tray: { x0: -4, x1: 4, z0: -5, z1: 5 } };
  var theme = { color: '#7a0d18', ink: '#f3d68a' };
  var look = { inkMetal: 0.7, fleck: '#f6dd9a', rim: { color: 0xb09a8c, wood: true, metal: 0.05, rough: 0.6 }, floorTint: 0xd8d0cc, floorBase: 0x4a1a14, exposure: 0.92 }, floorImg = '', floorCache = {}, woodTex = null;
  var texCache = {}, numCache = {};
  var G = 70, FONT = "800 196px 'Alegreya', Georgia, serif";

  /* ---------- geometry ---------- */
  var R = { 4: 1.25, 6: 1.2, 8: 1.2, 10: 1.2, 12: 1.25, 20: 1.35 };

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function signs(v) {
    var out = [[]];
    v.forEach(function (x) { var n = []; out.forEach(function (o) { n.push(o.concat([x])); if (x !== 0) { n.push(o.concat([-x])); } }); out = n; });
    return out;
  }
  function cyc(a, b, c) { var o = []; [[a, b, c], [c, a, b], [b, c, a]].forEach(function (p) { o = o.concat(signs(p)); }); return o; }

  var shapeCache = {};
  function shape(sides) {
    if (shapeCache[sides]) { return shapeCache[sides]; }
    var PHI = (1 + Math.sqrt(5)) / 2, V, N = null, F = [], k;
    if (sides === 4) { V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]; N = V.map(function (v) { return [-v[0], -v[1], -v[2]]; }); }
    else if (sides === 6) { V = signs([1, 1, 1]); N = cyc(1, 0, 0); }
    else if (sides === 8) { V = cyc(1, 0, 0); N = signs([1, 1, 1]); }
    else if (sides === 12) { V = signs([1, 1, 1]).concat(cyc(0, 1 / PHI, PHI)); N = cyc(0, PHI, 1); }
    else if (sides === 20) { V = cyc(0, 1, PHI); N = signs([1, 1, 1]).concat(cyc(0, PHI, 1 / PHI)); }
    else {
      var H = 1.2, cs = Math.cos(Math.PI / 5), c0 = H * (1 - cs) / (1 + cs);
      V = [[0, H, 0], [0, -H, 0]];
      for (k = 0; k < 5; k++) { V.push([Math.cos(k * 2 * Math.PI / 5), c0, Math.sin(k * 2 * Math.PI / 5)]); }
      for (k = 0; k < 5; k++) { V.push([Math.cos((k + 0.5) * 2 * Math.PI / 5), -c0, Math.sin((k + 0.5) * 2 * Math.PI / 5)]); }
      for (k = 0; k < 5; k++) { F.push([0, 2 + k, 7 + k, 2 + (k + 1) % 5]); F.push([1, 7 + k, 2 + (k + 1) % 5, 7 + (k + 1) % 5]); }
    }
    if (N) {
      N.forEach(function (n) {
        var m = -1e9, idx = [];
        V.forEach(function (v) { m = Math.max(m, dot(n, v)); });
        V.forEach(function (v, i) { if (dot(n, v) > m - 1e-6) { idx.push(i); } });
        F.push(idx);
      });
    }
    var maxLen = 0;
    V.forEach(function (v) { maxLen = Math.max(maxLen, Math.sqrt(dot(v, v))); });
    var sc = R[sides] / maxLen;
    var P = V.map(function (v) { return [v[0] * sc, v[1] * sc, v[2] * sc]; });
    var faces = F.map(function (idx) {
      var pts = idx.map(function (i) { return P[i]; }), c = [0, 0, 0];
      pts.forEach(function (p) { c = [c[0] + p[0] / pts.length, c[1] + p[1] / pts.length, c[2] + p[2] / pts.length]; });
      var n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
      if (dot(n, c) < 0) { n = [-n[0], -n[1], -n[2]]; }
      // sort the corners counter-clockwise as seen from outside
      var up0 = norm(sub(pts[0], c)), right0 = cross(up0, n);
      var order = pts.map(function (p, i) { var d = sub(p, c); return { i: idx[i], a: Math.atan2(dot(d, up0), dot(d, right0)) }; })
        .sort(function (x, y) { return x.a - y.a; }).map(function (o) { return o.i; });
      var sp = order.map(function (i) { return P[i]; });
      // which way is "up" for the numeral
      var upPt = sp[0];
      if (sides === 6) { upPt = [(sp[0][0] + sp[1][0]) / 2, (sp[0][1] + sp[1][1]) / 2, (sp[0][2] + sp[1][2]) / 2]; }
      if (sides === 10) { var far = -1; sp.forEach(function (p) { var d = sub(p, c), l = dot(d, d); if (l > far) { far = l; upPt = p; } }); }
      var up = norm(sub(upPt, c)), right = cross(up, n);
      var inr = 1e9;
      sp.forEach(function (p, i) {
        var q = sp[(i + 1) % sp.length], e = norm(sub(q, p)), d = sub(c, p);
        var perp = sub(d, [e[0] * dot(d, e), e[1] * dot(d, e), e[2] * dot(d, e)]);
        inr = Math.min(inr, Math.sqrt(dot(perp, perp)));
      });
      return { idx: order, c: c, n: n, up: up, right: right, inr: inr, value: 0 };
    });
    // number the faces so opposite faces add up to sides + 1, like real dice
    if (sides !== 4) {
      var next = 1, visit = faces.map(function (f, i) { return (i * 7) % faces.length; });
      visit.forEach(function (i) {
        var f = faces[i];
        if (f.value) { return; }
        f.value = next;
        faces.forEach(function (g) { if (!g.value && dot(g.n, f.n) < -0.999) { g.value = sides + 1 - next; } });
        next++;
        while (faces.some(function (g) { return g.value === next; })) { next++; }
      });
    }
    shapeCache[sides] = { sides: sides, P: P, faces: faces };
    return shapeCache[sides];
  }

  /* ---------- textures ---------- */
  function shade(hex, f) {
    var c = new T.Color(hex);
    return 'rgb(' + [c.r, c.g, c.b].map(function (v) { return Math.round(Math.max(0, Math.min(1, v * f)) * 255); }).join(',') + ')';
  }
  function marble(hex) {
    var key = hex + look.fleck;
    if (texCache[key]) { return texCache[key]; }
    var cv = document.createElement('canvas'); cv.width = cv.height = 256;
    var g = cv.getContext('2d'), i;
    var gr = g.createLinearGradient(0, 0, 256, 256);
    gr.addColorStop(0, shade(hex, 1.25)); gr.addColorStop(0.5, shade(hex, 0.85)); gr.addColorStop(1, shade(hex, 1.1));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (i = 0; i < 26; i++) {
      g.beginPath();
      g.moveTo(Math.random() * 256, Math.random() * 256);
      g.bezierCurveTo(Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256);
      g.strokeStyle = i % 3 ? shade(hex, 1.5 + Math.random() * 0.7) : shade(hex, 0.45);
      g.globalAlpha = 0.10 + Math.random() * 0.16; g.lineWidth = 3 + Math.random() * 16; g.stroke();
    }
    g.globalAlpha = 0.7; g.fillStyle = look.fleck;
    for (i = 0; i < 70; i++) { g.fillRect(Math.random() * 256, Math.random() * 256, 1.2, 1.2); }
    var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping;
    texCache[key] = t; return t;
  }
  function numeral(label, mark) {
    var key = label + (mark ? '_' : '');
    if (numCache[key]) { return numCache[key]; }
    var cv = document.createElement('canvas'); cv.width = cv.height = 256;
    var g = cv.getContext('2d');
    g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    var s = String(label), wide = s.length > 1;
    g.save(); g.translate(128, 128); if (wide) { g.scale(0.74, 1); } g.fillText(s, 0, 8); g.restore();
    if (mark && (s === '6' || s === '9')) { g.fillRect(84, 222, 88, 13); }
    var t = new T.CanvasTexture(cv); t.anisotropy = 4;
    numCache[key] = t; return t;
  }
  function envTexture() {
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    var g = cv.getContext('2d');
    g.fillStyle = '#0b0705'; g.fillRect(0, 0, 512, 256);
    var blob = function (x, y, r, col) { var gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256); };
    blob(330, 78, 120, 'rgba(255,214,150,0.95)');    // candle, high and to one side
    blob(256, 0, 150, 'rgba(90,58,36,0.5)');          // dim rafters overhead
    blob(60, 90, 120, 'rgba(255,150,70,0.75)');      // hearth
    blob(430, 80, 90, 'rgba(120,150,220,0.45)');     // cool window
    blob(256, 250, 220, 'rgba(70,30,18,0.9)');       // table bounce
    var t = new T.CanvasTexture(cv); t.mapping = T.EquirectangularReflectionMapping; t.encoding = T.sRGBEncoding;
    return t;
  }
  function woodTexture() {
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    var g = cv.getContext('2d'), i;
    g.fillStyle = '#3b2313'; g.fillRect(0, 0, 256, 64);
    for (i = 0; i < 90; i++) {
      g.strokeStyle = i % 2 ? 'rgba(20,10,4,0.35)' : 'rgba(120,78,40,0.22)'; g.lineWidth = 0.6 + Math.random() * 1.6;
      var y = Math.random() * 64; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + Math.random() * 6 - 3, 170, y + Math.random() * 6 - 3, 256, y + Math.random() * 4 - 2); g.stroke();
    }
    var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  }

  /* ---------- sound ---------- */
  var Sound = { ctx: null, out: null, muted: false, last: 0 };
  Sound.unlock = function () {
    if (Sound.ctx) { if (Sound.ctx.state === 'suspended') { Sound.ctx.resume(); } return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return; }
    try {
      var ctx = new AC(), out = ctx.createGain(); out.gain.value = 0.9;
      var comp = ctx.createDynamicsCompressor(); out.connect(comp); comp.connect(ctx.destination);
      // a short wooden-room reverb from decaying noise
      var len = Math.floor(ctx.sampleRate * 0.28), ir = ctx.createBuffer(2, len, ctx.sampleRate), ch, i;
      for (ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); } }
      var conv = ctx.createConvolver(); conv.buffer = ir;
      var wet = ctx.createGain(); wet.gain.value = 0.22; conv.connect(wet); wet.connect(comp);
      var nlen = Math.floor(ctx.sampleRate * 0.25), nb = ctx.createBuffer(1, nlen, ctx.sampleRate), nd = nb.getChannelData(0);
      for (i = 0; i < nlen; i++) { nd[i] = Math.random() * 2 - 1; }
      Sound.ctx = ctx; Sound.out = out; Sound.rev = conv; Sound.noise = nb;
    } catch (e) { Sound.ctx = null; }
  };
  /* kind: 'die' (resin on resin), 'felt' (leather floor), 'wood' (tray rim) */
  Sound.hit = function (kind, strength, pan) {
    var ctx = Sound.ctx;
    if (!ctx || Sound.muted || strength < 0.04) { return; }
    var now = ctx.currentTime;
    if (now - Sound.last < 0.012) { return; }
    Sound.last = now;
    var v = Math.min(1, strength), jit = 0.85 + Math.random() * 0.3;
    var bus = ctx.createGain(); bus.gain.value = 1;
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-0.8, Math.min(0.8, pan || 0)); bus.connect(p); p.connect(Sound.out); p.connect(Sound.rev); }
    else { bus.connect(Sound.out); bus.connect(Sound.rev); }
    var burst = function (type, freq, q, dur, gain) {
      var src = ctx.createBufferSource(); src.buffer = Sound.noise; src.playbackRate.value = jit;
      var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq * jit; f.Q.value = q;
      var g = ctx.createGain(); g.gain.setValueAtTime(gain * v, now); g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
      src.connect(f); f.connect(g); g.connect(bus); src.start(now, Math.random() * 0.1); src.stop(now + dur + 0.02);
    };
    var tone = function (freq, dur, gain, type) {
      var o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq * jit, now);
      o.frequency.exponentialRampToValueAtTime(freq * jit * 0.72, now + dur);
      var g = ctx.createGain(); g.gain.setValueAtTime(gain * v, now); g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
      o.connect(g); g.connect(bus); o.start(now); o.stop(now + dur + 0.02);
    };
    if (kind === 'die') { burst('highpass', 2600, 0.7, 0.035, 0.9); tone(3100, 0.05, 0.22); tone(4700, 0.035, 0.12); }
    else if (kind === 'wood') { burst('bandpass', 950, 1.4, 0.07, 1.0); tone(210, 0.09, 0.5); }
    else { burst('bandpass', 1500, 0.9, 0.05, 0.75); burst('lowpass', 380, 0.7, 0.08, 0.6); tone(120, 0.07, 0.35); }
  };
  Sound.chime = function (good) {
    var ctx = Sound.ctx; if (!ctx || Sound.muted) { return; }
    var now = ctx.currentTime, notes = good ? [659.3, 987.8, 1318.5] : [174.6, 164.8];
    notes.forEach(function (f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain(), t0 = now + i * (good ? 0.09 : 0.16);
      o.type = good ? 'triangle' : 'sawtooth'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(good ? 0.16 : 0.08, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, t0 + (good ? 0.9 : 0.5));
      o.connect(g); g.connect(Sound.out); g.connect(Sound.rev); o.start(t0); o.stop(t0 + 1);
    });
  };
  /* sleigh bells: three quick shakes of bright partials */
  Sound.jingle = function () {
    var ctx = Sound.ctx; if (!ctx || Sound.muted) { return; }
    var now = ctx.currentTime;
    [0, 0.13, 0.26, 0.5].forEach(function (off, k) {
      [2637, 3520, 4186, 5274, 6272].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain(), t0 = now + off + i * 0.004;
        o.type = 'sine'; o.frequency.value = f * (0.985 + Math.random() * 0.03);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(k === 3 ? 0.05 : 0.035, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0004, t0 + (k === 3 ? 0.7 : 0.16));
        o.connect(g); g.connect(Sound.out); g.connect(Sound.rev); o.start(t0); o.stop(t0 + 0.8);
      });
    });
  };
  Sound.tick = function () {
    var ctx = Sound.ctx; if (!ctx || Sound.muted) { return; }
    var now = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(900, now); o.frequency.exponentialRampToValueAtTime(420, now + 0.04);
    g.gain.setValueAtTime(0.05, now); g.gain.exponentialRampToValueAtTime(0.0005, now + 0.05);
    o.connect(g); g.connect(Sound.out); o.start(now); o.stop(now + 0.06);
  };

  /* ---------- scene ---------- */
  function init(cv, opts) {
    T = window.THREE; C = window.CANNON; canvas = cv; opts = opts || {};
    renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene(); scene.background = new T.Color(0x0b0705);
    camera = new T.PerspectiveCamera(50, 1, 0.5, 200); camera.up.set(0, 0, -1);

    var pm = new T.PMREMGenerator(renderer);
    env = pm.fromEquirectangular(envTexture()).texture; scene.environment = env; pm.dispose();

    scene.add(new T.HemisphereLight(0xffe2b8, 0x1a0d08, 0.16));
    lightKey = new T.DirectionalLight(0xffdcae, 0.95);
    lightKey.position.set(-15, 17, 10); lightKey.castShadow = true;
    lightKey.shadow.mapSize.set(1024, 1024); lightKey.shadow.radius = 5; lightKey.shadow.bias = -0.0006;
    var sc = lightKey.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 16; sc.bottom = -16; sc.near = 2; sc.far = 70;
    scene.add(lightKey);
    lightCandle = new T.PointLight(0xff9a3c, 0.8, 50, 1.4); lightCandle.position.set(7.5, 4.5, -10); scene.add(lightCandle);

    woodTex = woodTexture();
    mats.wood = new T.MeshStandardMaterial({ map: woodTex, color: 0xb09a8c, roughness: 0.6, metalness: 0.05, envMapIntensity: 0.22 });
    mats.brass = new T.MeshStandardMaterial({ color: 0xb8893a, roughness: 0.35, metalness: 0.9 });
    mats.floor = new T.MeshStandardMaterial({ color: 0x4a1a14, roughness: 0.92, metalness: 0, envMapIntensity: 0.12 });
    mats.table = new T.MeshStandardMaterial({ color: 0x0c0705, roughness: 0.9, envMapIntensity: 0.04 });
    var table = new T.Mesh(new T.PlaneGeometry(120, 120), mats.table); table.rotation.x = -Math.PI / 2; table.position.y = -0.02; table.receiveShadow = true; scene.add(table);
    floorMesh = new T.Mesh(new T.PlaneGeometry(1, 1), mats.floor); floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true; scene.add(floorMesh);
    if (opts.floorImage && !floorImg) { floorImg = opts.floorImage; }

    world = new C.World(); world.gravity.set(0, -G, 0); world.broadphase = new C.NaiveBroadphase();
    world.solver.iterations = 16; world.allowSleep = true;
    mats.pDice = new C.Material('dice'); mats.pFloor = new C.Material('floor'); mats.pWall = new C.Material('wall');
    world.addContactMaterial(new C.ContactMaterial(mats.pDice, mats.pFloor, { friction: 0.42, restitution: 0.34 }));
    world.addContactMaterial(new C.ContactMaterial(mats.pDice, mats.pWall, { friction: 0.08, restitution: 0.55 }));
    world.addContactMaterial(new C.ContactMaterial(mats.pDice, mats.pDice, { friction: 0.18, restitution: 0.42 }));
    var floor = new C.Body({ mass: 0, shape: new C.Plane(), material: mats.pFloor });
    floor.quaternion.setFromAxisAngle(new C.Vec3(1, 0, 0), -Math.PI / 2); floor.kind = 'felt'; world.addBody(floor);
    applyScene();
    resize();
  }

  /* Dress the tray for a theme: floor picture, rim material, exposure. */
  function applyScene() {
    if (!renderer) { return; }
    renderer.toneMappingExposure = look.exposure;
    mats.wood.map = look.rim.wood ? woodTex : null; mats.wood.color.setHex(look.rim.color); mats.wood.metalness = look.rim.metal; mats.wood.roughness = look.rim.rough;
    mats.wood.envMapIntensity = look.rim.wood ? 0.22 : 0.9; mats.wood.needsUpdate = true;
    var want = floorImg, done = function (tx) { if (floorImg !== want) { return; } mats.floor.map = tx; mats.floor.color.setHex(look.floorTint); mats.floor.needsUpdate = true; draw(); };
    mats.floor.map = null; mats.floor.color.setHex(look.floorBase); mats.floor.needsUpdate = true;
    if (!want) { return; }
    if (floorCache[want]) { done(floorCache[want]); return; }
    var src = (window.FR_INLINE && window.FR_INLINE[want]) || want;
    new T.TextureLoader().load(src, function (tx) { tx.encoding = T.sRGBEncoding; tx.anisotropy = 4; floorCache[want] = tx; done(tx); });
  }
  function setScene(l, img) { if (l) { look = l; } floorImg = img || ''; applyScene(); draw(); }

  function clearGroup(list) { list.forEach(function (m) { scene.remove(m); if (m.geometry) { m.geometry.dispose(); } }); list.length = 0; }

  /* Lay the tray out under the part of the screen the HUD leaves free. */
  function layout() {
    var w = view.w, h = view.h, b = view.bounds || { left: 0, top: 0, right: w, bottom: h };
    view.visW = 9.2 * Math.max(1, Math.min(1.5, w / 430));
    view.visH = view.visW * h / w;
    view.camH = view.visH / (2 * Math.tan(25 * Math.PI / 180));
    camera.aspect = w / h; camera.position.set(0, view.camH, 0); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    var px = view.visW / w, t = view.tray;
    t.x0 = (b.left - w / 2) * px + 0.55; t.x1 = (b.right - w / 2) * px - 0.55;
    t.z0 = (b.top - h / 2) * px + 0.55; t.z1 = (b.bottom - h / 2) * px - 0.55;
    var cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2, tw = t.x1 - t.x0, td = t.z1 - t.z0;
    floorMesh.scale.set(tw + 0.1, td + 0.1, 1); floorMesh.position.set(cx, 0, cz);
    clearGroup(rim);
    var th = 0.7, hh = 1.15, bar = function (sx, sz, x, z, repeat) {
      var m = new T.Mesh(new T.BoxGeometry(sx, hh, sz), mats.wood); m.position.set(x, hh / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); rim.push(m);
      var inlay = new T.Mesh(new T.BoxGeometry(sx > sz ? sx - 0.5 : 0.09, 0.04, sx > sz ? 0.09 : sz - 0.5), mats.brass); inlay.position.set(x, hh + 0.02, z); scene.add(inlay); rim.push(inlay);
    };
    bar(tw + th * 2, th, cx, t.z0 - th / 2); bar(tw + th * 2, th, cx, t.z1 + th / 2);
    bar(th, td, t.x0 - th / 2, cz); bar(th, td, t.x1 + th / 2, cz);
    walls.forEach(function (wb) { world.remove(wb); }); walls.length = 0;
    var wall = function (x, y, z, axis, ang) {
      var bd = new C.Body({ mass: 0, shape: new C.Plane(), material: mats.pWall });
      bd.position.set(x, y, z); if (axis) { bd.quaternion.setFromAxisAngle(axis, ang); } bd.kind = 'wood'; world.addBody(bd); walls.push(bd);
    };
    var Y = new C.Vec3(0, 1, 0), X = new C.Vec3(1, 0, 0);
    wall(t.x0, 0, 0, Y, Math.PI / 2); wall(t.x1, 0, 0, Y, -Math.PI / 2);
    wall(0, 0, t.z0, null, 0); wall(0, 0, t.z1, Y, Math.PI);
    wall(0, Math.min(11, view.camH * 0.5), 0, X, Math.PI / 2);
    lightKey.target.position.set(cx, 0, cz); scene.add(lightKey.target);
  }

  function resize() {
    if (!renderer) { return; }
    var r = canvas.getBoundingClientRect();
    view.w = Math.max(50, r.width); view.h = Math.max(50, r.height);
    renderer.setSize(view.w, view.h, false);
    layout(); draw();
  }
  function setBounds(b) { view.bounds = b; if (renderer) { layout(); draw(); } }

  /* ---------- dice ---------- */
  function makeDie(sides) {
    var sh = shape(sides), pos = [], nor = [], uv = [], rs = R[sides];
    sh.faces.forEach(function (f) {
      var pts = f.idx.map(function (i) { return sh.P[i]; }), ou = Math.random(), ov = Math.random(), i;
      for (i = 1; i < pts.length - 1; i++) {
        [pts[0], pts[i], pts[i + 1]].forEach(function (p) {
          pos.push(p[0], p[1], p[2]); nor.push(f.n[0], f.n[1], f.n[2]);
          var d = sub(p, f.c); uv.push(ou + dot(d, f.right) / (rs * 2.4), ov + dot(d, f.up) / (rs * 2.4));
        });
      }
    });
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    var body = new T.MeshPhysicalMaterial({ map: marble(theme.color), roughness: 0.28, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.16, envMapIntensity: 1.25 });
    var mesh = new T.Mesh(geo, body); mesh.castShadow = true;
    var edges = new T.LineSegments(new T.EdgesGeometry(geo, 20), new T.LineBasicMaterial({ color: new T.Color(theme.color).lerp(new T.Color(0xffffff), 0.35), transparent: true, opacity: 0.4 }));
    mesh.add(edges);
    var ink = new T.MeshStandardMaterial({ color: new T.Color(theme.ink), emissive: new T.Color(theme.ink).multiplyScalar(look.inkMetal > 0.4 ? 0.35 : 0.5), metalness: look.inkMetal, roughness: look.inkMetal > 0.4 ? 0.32 : 0.55, transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, envMapIntensity: 1.4 });
    var decal = function (label, c, n, up, size) {
      var m = ink.clone(); m.map = numeral(label, sides >= 6); m.needsUpdate = true;
      var pl = new T.Mesh(new T.PlaneGeometry(size, size), m), right = cross(up, n);
      var mx = new T.Matrix4().makeBasis(new T.Vector3(right[0], right[1], right[2]), new T.Vector3(up[0], up[1], up[2]), new T.Vector3(n[0], n[1], n[2]));
      pl.quaternion.setFromRotationMatrix(mx); pl.position.set(c[0] + n[0] * 0.006, c[1] + n[1] * 0.006, c[2] + n[2] * 0.006);
      mesh.add(pl); return m;
    };
    var inks = [];
    if (sides === 4) {
      // a d4 reads from the point on top: each face shows the three corner numbers
      sh.faces.forEach(function (f) {
        f.idx.forEach(function (vi) {
          var vp = sh.P[vi], dir = norm(sub(vp, f.c)), cpos = [f.c[0] + dir[0] * f.inr * 0.95, f.c[1] + dir[1] * f.inr * 0.95, f.c[2] + dir[2] * f.inr * 0.95];
          inks.push(decal(vi + 1, cpos, f.n, dir, f.inr * 1.15));
        });
      });
    } else {
      sh.faces.forEach(function (f) { inks.push(decal(f.value, f.c, f.n, f.up, f.inr * ({ 6: 1.75, 8: 1.75, 10: 1.7, 12: 1.6, 20: 1.85 })[sides])); });
    }
    scene.add(mesh);

    var pshape;
    if (sides === 6) { var he = rs / Math.sqrt(3); pshape = new C.Box(new C.Vec3(he, he, he)); }
    else { pshape = new C.ConvexPolyhedron(sh.P.map(function (p) { return new C.Vec3(p[0], p[1], p[2]); }), sh.faces.map(function (f) { return f.idx.slice(); })); }
    var bd = new C.Body({ mass: sides === 4 ? 0.8 : 1, shape: pshape, material: mats.pDice });
    bd.linearDamping = 0.08; bd.angularDamping = 0.1; bd.allowSleep = true; bd.sleepSpeedLimit = 0.35; bd.sleepTimeLimit = 0.3; bd.kind = 'die';
    var die = { sides: sides, shape: sh, mesh: mesh, body: bd, inks: inks, mat: body, value: 0, lastSound: 0 };
    bd.addEventListener('collide', function (e) {
      var v = Math.abs(e.contact.getImpactVelocityAlongNormal()), now = performance.now();
      if (now - die.lastSound < 28) { return; }
      die.lastSound = now;
      Sound.hit(e.body.kind || 'felt', v / 26, bd.position.x / (view.visW / 2));
      if (v > 9 && navigator.vibrate && !Sound.muted) { try { navigator.vibrate(6); } catch (err) { /* not allowed here */ } }
    });
    world.addBody(bd);
    return die;
  }

  function clear() {
    dice.forEach(function (d) {
      world.remove(d.body); scene.remove(d.mesh);
      d.mesh.traverse(function (o) { if (o.geometry) { o.geometry.dispose(); } if (o.material && o.material.dispose) { o.material.dispose(); } });
    });
    dice = []; state = 'idle';
  }

  /* spec: array of die sizes, e.g. [20] or [6, 6, 6, 6]. flick: optional {vx, vz} in px/s. */
  function roll(spec, flick, done) {
    Sound.unlock(); clear();
    var t = view.tray, n = spec.length, px = view.visW / view.w;
    var vx = 0, vz = -(9 + Math.random() * 5);
    if (flick) {
      vx = flick.vx * px; vz = flick.vz * px;
      var sp = Math.sqrt(vx * vx + vz * vz) || 1, want = Math.max(9, Math.min(30, sp));
      vx = vx / sp * want; vz = vz / sp * want;
      if (vz > -6) { vz = -Math.abs(vz) - 6; }
    }
    spec.forEach(function (sides, i) {
      var d = makeDie(sides), b = d.body, span = Math.min(t.x1 - t.x0 - 2.6, n * 2.4);
      var x = (t.x0 + t.x1) / 2 + (n === 1 ? (Math.random() - 0.5) * 2 : (i / (n - 1) - 0.5) * span);
      b.position.set(x, 2.2 + Math.random() * 1.5 + (i % 2) * 1.6, t.z1 - 1.7 - (i % 3) * 0.5);
      b.quaternion.setFromEuler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      b.velocity.set(vx + (Math.random() - 0.5) * 9, 5 + Math.random() * 5, vz * (0.7 + Math.random() * 0.6));
      b.angularVelocity.set((Math.random() - 0.5) * 44, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 44);
      dice.push(d);
    });
    state = 'rolling'; rollStart = performance.now(); nudges = 0; onSettle = done || null;
    start();
  }

  /* Which number is up, and how flat is the die sitting? */
  function read(d) {
    var q = d.body.quaternion, best = -2, val = 0, v = new C.Vec3(), out = new C.Vec3();
    if (d.sides === 4) {
      d.shape.P.forEach(function (p, i) { v.set(p[0], p[1], p[2]); q.vmult(v, out); if (out.y > best) { best = out.y; val = i + 1; } });
      var flat = -2;
      d.shape.faces.forEach(function (f) { v.set(f.n[0], f.n[1], f.n[2]); q.vmult(v, out); flat = Math.max(flat, -out.y); });
      return { value: val, flat: flat };
    }
    d.shape.faces.forEach(function (f) { v.set(f.n[0], f.n[1], f.n[2]); q.vmult(v, out); if (out.y > best) { best = out.y; val = f.value; } });
    return { value: val, flat: best };
  }

  function layFlat(d) {
    var q = d.body.quaternion, v = new C.Vec3(), out = new C.Vec3(), best = -2, bn = null, bf = null, down = d.sides === 4;
    d.shape.faces.forEach(function (f) {
      v.set(f.n[0], f.n[1], f.n[2]); q.vmult(v, out);
      var s = down ? -out.y : out.y;
      if (s > best) { best = s; bn = out.clone(); bf = f; }
    });
    var fix = new C.Quaternion(); fix.setFromVectors(bn, new C.Vec3(0, down ? -1 : 1, 0));
    d.body.quaternion = fix.mult(q); d.body.quaternion.normalize();
    var rest = Math.sqrt(dot(bf.c, bf.c)), t = view.tray, p = d.body.position, tries = 0, clash = true;
    while (clash && tries++ < 40) {
      clash = false;
      dice.forEach(function (o) {
        if (o === d) { return; }
        var ex = p.x - o.body.position.x, ez = p.z - o.body.position.z, l = Math.sqrt(ex * ex + ez * ez), need = R[d.sides] + R[o.sides] + 0.15;
        if (l < need) { clash = true; var a = l > 0.01 ? Math.atan2(ez, ex) : Math.random() * 6.28; p.x += Math.cos(a) * (need - l + 0.05); p.z += Math.sin(a) * (need - l + 0.05); }
      });
      p.x = Math.max(t.x0 + R[d.sides], Math.min(t.x1 - R[d.sides], p.x)); p.z = Math.max(t.z0 + R[d.sides], Math.min(t.z1 - R[d.sides], p.z));
    }
    p.y = rest; d.body.velocity.set(0, 0, 0); d.body.angularVelocity.set(0, 0, 0); d.body.sleep();
  }

  function settleCheck(now) {
    var asleep = dice.every(function (d) { return d.body.sleepState === C.Body.SLEEPING; });
    var age = now - rollStart;
    if (!asleep && age > 6500) { dice.forEach(function (d) { d.body.velocity.scale(0.85, d.body.velocity); d.body.angularVelocity.scale(0.85, d.body.angularVelocity); }); }
    if (!asleep && age < 9000) { return; }
    // every die must sit flat on a face: a die leaning on a wall or a neighbour gets a nudge
    var cocked = dice.filter(function (d) { return read(d).flat < 0.985; });
    if (cocked.length && nudges < 6) {
      nudges++; rollStart = now - 3000;
      cocked.forEach(function (d) {
        // push it clear of whatever it is leaning on: away from the nearest die, or toward the middle
        var t = view.tray, p = d.body.position, dx = (t.x0 + t.x1) / 2 - p.x, dz = (t.z0 + t.z1) / 2 - p.z, near = 1e9;
        dice.forEach(function (o) {
          if (o === d) { return; }
          var ex = p.x - o.body.position.x, ez = p.z - o.body.position.z, l = ex * ex + ez * ez;
          if (l < near && l < 9) { near = l; dx = ex + (Math.random() - 0.5); dz = ez + (Math.random() - 0.5); }
        });
        var dl = Math.sqrt(dx * dx + dz * dz) || 1, push = 6 + nudges * 1.5;
        d.body.wakeUp();
        d.body.velocity.set(dx / dl * push, 7 + Math.random() * 3, dz / dl * push);
        d.body.angularVelocity.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      });
      return;
    }
    // last resort, after the nudges: set a still-leaning die down flat on its nearest face
    dice.forEach(function (d) { if (read(d).flat < 0.985) { layFlat(d); } });
    state = 'rest';
    dice.forEach(function (d) { d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion); d.value = read(d).value; });
    var cb = onSettle; onSettle = null;
    if (cb) { cb(dice.map(function (d) { return d.value; })); }
  }

  function draw() { if (renderer) { renderer.render(scene, camera); } }
  function frame(now) {
    if (!running) { return; }
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
    if (state === 'rolling') {
      world.step(1 / 120, dt, 8);
      dice.forEach(function (d) { d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion); });
      settleCheck(now);
    }
    lightCandle.intensity = 0.8 + Math.sin(now * 0.011) * 0.05 + Math.sin(now * 0.027) * 0.04;
    draw();
    if (onFrame) { onFrame(); }
  }
  function start() { if (running || !renderer) { return; } running = true; lastT = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* Run the physics without drawing: used by tests and for instant results. */
  function simulate(maxSeconds) {
    var t = 0, step = 1 / 120;
    while (state === 'rolling' && t < (maxSeconds || 14)) { world.step(step); t += step; settleCheck(rollStart + t * 1000); }
    dice.forEach(function (d) { d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion); });
    draw(); return t;
  }

  function screenPos(i) {
    var d = dice[i]; if (!d) { return null; }
    var v = d.mesh.position.clone(); v.y += R[d.sides] * 0.2; v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * view.w, y: (-v.y * 0.5 + 0.5) * view.h, r: R[d.sides] * view.w / view.visW };
  }
  function dim(i, on) {
    var d = dice[i]; if (!d) { return; }
    d.mat.color.setScalar(on ? 0.3 : 1); d.inks.forEach(function (m) { m.opacity = on ? 0.35 : 1; m.alphaTest = on ? 0.2 : 0.4; }); draw();
  }
  function setTheme(color, ink) { theme = { color: color || theme.color, ink: ink || theme.ink }; }

  return {
    init: init, resize: resize, setBounds: setBounds, roll: roll, clear: clear, start: start, stop: stop, draw: draw, simulate: simulate,
    screenPos: screenPos, dim: dim, setTheme: setTheme, setScene: setScene, Sound: Sound, shape: shape,
    count: function () { return dice.length; }, state: function () { return state; },
    onFrame: function (fn) { onFrame = fn; }, ready: function () { return !!renderer; },
    values: function () { return dice.map(function (d) { return read(d); }); }
  };
})();
