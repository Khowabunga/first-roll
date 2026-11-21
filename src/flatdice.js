/* First Roll: flat dice.
   Where the browser cannot draw the 3D tray (no WebGL), the dice are drawn flat instead. Flat
   should not mean lifeless, so:
   - Each die is a real picture of its solid. The corners of the tetrahedron, cube, octahedron
     and the rest are worked out once, turned to face you, and every face you can see is
     shaded by how squarely it meets the light. All the shades come from the die's one colour.
   - The numeral can always be read. It is dark on a light die and light on a dark one, and
     every face of the die is kept far enough from it in brightness for at least 4.5 to 1,
     the usual rule for readable text. An outline round the numeral is a second safety.
   - They sit in a tray with a floor and a rim, like the 3D ones, each on its own soft shadow.
   - A throw tumbles them in from the near edge, lands them with two small bounces and has
     them at rest in about a second. They are dealt into separate patches of floor, so they
     never overlap, however many there are.
   This file needs no stylesheet; everything it draws carries its own styles. */
(function () {
  'use strict';

  /* ---------- the solids ---------- */
  var PHI = (1 + Math.sqrt(5)) / 2;
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
  function corners(sides) {
    var V, k, cs, c0, H = 1.2;
    if (sides === 4) { return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]; }
    if (sides === 6) { return signs([1, 1, 1]); }
    if (sides === 8) { return cyc(1, 0, 0); }
    if (sides === 12) { return signs([1, 1, 1]).concat(cyc(0, 1 / PHI, PHI)); }
    if (sides === 20) { return cyc(0, 1, PHI); }
    /* the d10: two points, and a ring of ten corners that zigzags just enough for every face to be flat */
    cs = Math.cos(Math.PI / 5); c0 = H * (1 - cs) / (1 + cs); V = [[0, H, 0], [0, -H, 0]];
    for (k = 0; k < 5; k++) { V.push([Math.cos(k * 2 * Math.PI / 5), c0, Math.sin(k * 2 * Math.PI / 5)]); }
    for (k = 0; k < 5; k++) { V.push([Math.cos((k + 0.5) * 2 * Math.PI / 5), -c0, Math.sin((k + 0.5) * 2 * Math.PI / 5)]); }
    return V;
  }
  /* Find the faces from the corners alone: three corners make a face if no other corner lies
     beyond their plane. Slow in general, instant for twenty corners, and it cannot disagree
     with the corners the way a hand-typed list of faces can. */
  function facesOf(V) {
    var F = [], seen = {}, i, j, k, n, d, key;
    var beyond = function (v) { return dot(n, v) > d + 1e-6; };
    for (i = 0; i < V.length; i++) {
      for (j = i + 1; j < V.length; j++) {
        for (k = j + 1; k < V.length; k++) {
          n = cross(sub(V[j], V[i]), sub(V[k], V[i]));
          if (dot(n, n) < 1e-9) { continue; }
          n = norm(n); d = dot(n, V[i]);
          if (d < 0) { n = [-n[0], -n[1], -n[2]]; d = -d; }
          if (d < 1e-6 || V.some(beyond)) { continue; }
          key = Math.round(n[0] * 500) + ',' + Math.round(n[1] * 500) + ',' + Math.round(n[2] * 500);
          if (!seen[key]) { seen[key] = true; F.push({ n: n, d: d }); }
        }
      }
    }
    F.forEach(function (f) { f.idx = []; V.forEach(function (v, m) { if (dot(f.n, v) > f.d - 1e-6) { f.idx.push(m); } }); });
    return F;
  }

  /* How each solid is turned towards you. Its number face starts square on; tilt tips the
     top of that face away (degrees), yaw swings its right side away, so that some of the
     other faces show and it reads as a solid thing, not a badge. top: what points up, a
     corner of the number face or the middle of one of its edges. num: numeral height. */
  var VIEW = {
    4: { tilt: -47, yaw: 0, top: 'corner', num: 30 },
    6: { tilt: 20, yaw: -28, top: 'edge', num: 44 },
    8: { tilt: 14, yaw: -13, top: 'corner', num: 33 },
    10: { tilt: 6, yaw: -9, top: 'corner', num: 31 },
    12: { tilt: 5, yaw: -7, top: 'corner', num: 34 },
    20: { tilt: 4, yaw: -6, top: 'corner', num: 30 }
  };
  var LIGHT = norm([-0.42, 0.5, 0.76]);       // from the upper left, mostly overhead (towards you)

  /* the outline of a set of points, anticlockwise (the usual wrapping method) */
  function wrap(P) {
    var pts = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), lo = [], hi = [], i;
    var turn = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && turn(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 1e-9) { lo.pop(); } lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (hi.length >= 2 && turn(hi[hi.length - 2], hi[hi.length - 1], pts[i]) <= 1e-9) { hi.pop(); } hi.push(pts[i]); }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }
  var shapes = {};
  /* The picture of one solid: the faces you can see as flat outlines in a 100 by 100 box
     centred on 0,0, each with a shade from -1 (deepest shadow) through 0 (the number face)
     to 1 (catching the light), plus the outline of the whole die and where the numeral goes. */
  function shape(sides) {
    var key = sides === 100 ? 10 : (VIEW[sides] ? sides : 20), view = VIEW[key], V, F, f0, c, far, top, x, y, z, i, tl, yw, P, N, vis = [], hull, minX, maxX, minY, maxY, mx, my, k, base, lo, hi, best, corner;
    if (shapes[key]) { return shapes[key]; }
    V = corners(key); F = facesOf(V); f0 = F[0];
    c = [0, 0, 0]; f0.idx.forEach(function (m) { c = [c[0] + V[m][0] / f0.idx.length, c[1] + V[m][1] / f0.idx.length, c[2] + V[m][2] / f0.idx.length]; });
    /* put the face's corners in order round its middle, so an edge is two neighbours */
    z = f0.n; x = norm(sub(V[f0.idx[0]], c)); y = cross(z, x);
    f0.idx.sort(function (p, q) { var a = sub(V[p], c), b = sub(V[q], c); return Math.atan2(dot(a, y), dot(a, x)) - Math.atan2(dot(b, y), dot(b, x)); });
    far = f0.idx[0]; f0.idx.forEach(function (m) { if (dot(sub(V[m], c), sub(V[m], c)) > dot(sub(V[far], c), sub(V[far], c)) + 1e-6) { far = m; } });
    top = view.top === 'edge' ? [(V[f0.idx[0]][0] + V[f0.idx[1]][0]) / 2, (V[f0.idx[0]][1] + V[f0.idx[1]][1]) / 2, (V[f0.idx[0]][2] + V[f0.idx[1]][2]) / 2] : V[far];
    y = norm(sub(top, c)); x = cross(y, z);
    tl = view.tilt * Math.PI / 180; yw = view.yaw * Math.PI / 180;
    var turned = function (v) {
      var a = [dot(x, v), dot(y, v), dot(z, v)], b = [a[0], a[1] * Math.cos(tl) + a[2] * Math.sin(tl), -a[1] * Math.sin(tl) + a[2] * Math.cos(tl)];
      return [b[0] * Math.cos(yw) + b[2] * Math.sin(yw), b[1], -b[0] * Math.sin(yw) + b[2] * Math.cos(yw)];
    };
    P = V.map(turned); N = F.map(function (f) { return turned(f.n); });
    hull = wrap(P.map(function (p) { return [p[0], -p[1]]; }));
    minX = maxX = hull[0][0]; minY = maxY = hull[0][1];
    hull.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    mx = (minX + maxX) / 2; my = (minY + maxY) / 2; k = 0;
    hull.forEach(function (p) { k = Math.max(k, Math.sqrt((p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my))); });
    k = 46 / k;                                              // the die fills a circle of radius 46, leaving room for its rim
    var flat = function (p) { return [(p[0] - mx) * k, (-p[1] - my) * k]; };
    base = dot(N[0], LIGHT);
    F.forEach(function (f, m) {
      var n = N[m], mid = [0, 0, 0], pts, ux, uy;
      if (n[2] <= 0.02) { return; }                           // facing away
      f.idx.forEach(function (q) { mid = [mid[0] + P[q][0] / f.idx.length, mid[1] + P[q][1] / f.idx.length, mid[2] + P[q][2] / f.idx.length]; });
      ux = norm(sub(P[f.idx[0]], mid)); uy = cross(n, ux);
      pts = f.idx.slice().sort(function (p, q) { var a = sub(P[p], mid), e = sub(P[q], mid); return Math.atan2(dot(a, uy), dot(a, ux)) - Math.atan2(dot(e, uy), dot(e, ux)); }).map(function (q) { return flat(P[q]); });
      vis.push({ pts: pts, shade: dot(n, LIGHT) - base, main: m === 0, at: flat(mid) });
    });
    /* spread the shades over the full range for this solid: its darkest face is -1, and a
       face has to catch clearly more light than the number face to count as lit */
    lo = 0; hi = 0.16;
    vis.forEach(function (f) { lo = Math.min(lo, f.shade); hi = Math.max(hi, f.shade); });
    vis.forEach(function (f) { f.shade = f.shade > 0 ? f.shade / hi : (lo < 0 ? -f.shade / lo : 0); });
    /* one glint, on whichever face catches the most light, towards its upper left corner
       (well clear of the numeral when that face is the number face) */
    best = vis[0]; vis.forEach(function (f) { if (f.shade > best.shade + 1e-6) { best = f; } });
    corner = best.pts[0]; best.pts.forEach(function (p) { if (p[0] + p[1] < corner[0] + corner[1]) { corner = p; } });
    shapes[key] = { faces: vis, hull: hull.map(function (p) { return [(p[0] - mx) * k, (p[1] - my) * k]; }), at: vis.filter(function (f) { return f.main; })[0].at, num: view.num,
      glint: [best.at[0] + (corner[0] - best.at[0]) * (best.main ? 0.74 : 0.5), best.at[1] + (corner[1] - best.at[1]) * (best.main ? 0.74 : 0.5)] };
    return shapes[key];
  }

  /* ---------- colour ---------- */
  var probe = null;
  /* any colour the caller might hand us ('#b0457a', '#fff', 0xb5121f, 'crimson') as [r, g, b] */
  function parse(c, fallback) {
    var m, v;
    if (typeof c === 'number') { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
    if (typeof c === 'string') {
      m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
      if (m) { return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; }
      try {
        probe = probe || document.createElement('canvas').getContext('2d');
        probe.fillStyle = '#010203'; probe.fillStyle = c; v = probe.fillStyle;
        m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
        if (m && v !== '#010203') { return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; }
      } catch (e) { /* no canvas: use the fallback */ }
    }
    return fallback ? parse(fallback) : [122, 13, 24];
  }
  function hex(c) { return '#' + c.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join(''); }
  function blend(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  /* how bright a colour looks, 0 (black) to 1 (white), and the contrast between two such
     numbers: both exactly as the accessibility guidelines (WCAG) define them */
  function lum(c) {
    var f = function (v) { v = Math.max(0, Math.min(255, Math.round(v))) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function ratio(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
  /* the same colour made darker or paler until it is exactly this bright */
  function atLum(c, want) {
    var to = lum(c) > want ? [0, 0, 0] : [255, 255, 255], lo = 0, hi = 1, i, mid;
    for (i = 0; i < 22; i++) { mid = (lo + hi) / 2; if ((lum(blend(c, to, mid)) > want) === (to[0] === 0)) { lo = mid; } else { hi = mid; } }
    return blend(c, to, to[0] === 0 ? hi : lo);
  }
  var WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  var NEED = 4.6;            // the rule is 4.5 to 1; aiming a touch higher means rounding never takes us under
  var dressed = {};
  /* Everything a die wears, from its one colour: the three shades its faces are mixed from
     (lit, mid for the number face, dark), its rim, and the numeral's ink and outline.
     The ink is picked first; then the shades are held on the far side of it in brightness,
     all of them, so the numeral reads wherever it sits. If a colour is too middling for
     that, the die is drawn a little darker or paler than asked. The hue is never changed. */
  function dress(color, forced) {
    var key = String(color) + '|' + String(forced || ''), base, L, ink, Li, cap, floor, lit, mid, dark, lightInk, out;
    if (dressed[key]) { return dressed[key]; }
    base = parse(color); L = lum(base);
    if (forced) { ink = parse(forced, '#ffffff'); }
    else { ink = ratio(lum(blend(base, WHITE, 0.93)), L) >= ratio(L, lum(blend(base, [16, 11, 8], 0.9))) ? blend(base, WHITE, 0.93) : blend(base, [16, 11, 8], 0.9); }
    Li = lum(ink);
    /* An ink of middling brightness cannot reach 4.5 to 1 against anything, not even black or
       white. If we are handed one, it is nudged to the nearest brightness that can. */
    if (Li > 0.155 && Li < 0.21) { ink = atLum(ink, Li < 0.18 ? 0.15 : 0.215); Li = lum(ink); }
    lightInk = Li >= 0.18;
    if (lightInk) {
      cap = (Li + 0.05) / NEED - 0.05;                       // no face may be brighter than this
      mid = L <= cap * 0.78 ? base : atLum(base, cap * 0.78);
      lit = atLum(mid, Math.min(cap, Math.max(lum(mid) * 1.7, lum(mid) + 0.03)));
      dark = blend(mid, BLACK, 0.52);
    } else {
      floor = NEED * (Li + 0.05) - 0.05;                     // no face may be darker than this
      dark = lum(blend(base, BLACK, 0.34)) >= floor ? blend(base, BLACK, 0.34) : atLum(base, floor * 1.02);
      mid = L >= lum(dark) * 1.5 ? base : atLum(base, Math.min(0.9, lum(dark) * 1.5));
      lit = blend(mid, WHITE, 0.34);
    }
    out = {
      ink: hex(ink), lit: lit, mid: mid, dark: dark, lightInk: lightInk,
      line: hex(lightInk ? blend(dark, BLACK, 0.55) : blend(lit, WHITE, 0.7)),          // the outline round the numeral
      rim: hex(blend(dark, BLACK, lightInk ? 0.5 : 0.62)),
      /* the two numbers worth reporting: the numeral against its own face, and against the worst face on the die */
      face: ratio(Li, lum(mid)), worst: Math.min(ratio(Li, lum(lit)), ratio(Li, lum(mid)), ratio(Li, lum(dark)))
    };
    dressed[key] = out;
    return out;
  }
  /* a die set aside (the lower roll on advantage) is drawn as a dark shade of its own colour
     with a quiet, greyed numeral: plainly out of play, still readable */
  function dim(color) { var c = parse(color); return { color: hex(blend(c, [20, 16, 14], 0.5)), ink: hex(blend(c, [208, 201, 190], 0.86)) }; }

  /* ---------- one die, as a picture ---------- */
  var pt = function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); };
  function tone(D, s) { return hex(s >= 0 ? blend(D.mid, D.lit, s) : blend(D.mid, D.dark, -s)); }
  function numeral(sides, v) { var t = String(v); return { text: t, mark: (t === '6' || t === '9') && sides > 8 }; }
  function picture(sides, color, value, ink) {
    var S = shape(sides), D = dress(color, ink), n = numeral(sides, value), len = n.text.length, fs = S.num * (len > 2 ? 0.6 : len > 1 ? 0.8 : 1), out, edges = '';
    out = '<svg viewBox="-50 -50 100 100" width="100%" height="100%" aria-hidden="true" style="display:block;overflow:visible">' +
      '<polygon points="' + S.hull.map(pt).join(' ') + '" fill="' + D.rim + '" stroke="' + D.rim + '" stroke-width="5" stroke-linejoin="round"/>';
    S.faces.forEach(function (f) {
      var c = tone(D, f.shade), p = f.pts.map(pt).join(' ');
      out += '<polygon points="' + p + '" fill="' + c + '" stroke="' + c + '" stroke-width="0.7" stroke-linejoin="round"/>';
      edges += 'M' + f.pts.map(pt).join('L') + 'Z';
    });
    /* a light line along every edge, a brighter one round the number face, and one glint */
    out += '<path d="' + edges + '" fill="none" stroke="#fff" stroke-opacity="' + (D.lightInk ? 0.26 : 0.5) + '" stroke-width="0.9" stroke-linejoin="round"/>';
    S.faces.forEach(function (f) { if (f.main) { out += '<polygon points="' + f.pts.map(pt).join(' ') + '" fill="none" stroke="#fff" stroke-opacity="' + (D.lightInk ? 0.42 : 0.7) + '" stroke-width="1.2" stroke-linejoin="round"/>'; } });
    out += '<ellipse cx="' + S.glint[0].toFixed(1) + '" cy="' + S.glint[1].toFixed(1) + '" rx="6" ry="1.9" transform="rotate(-38 ' + S.glint[0].toFixed(1) + ' ' + S.glint[1].toFixed(1) + ')" fill="#fff" opacity="' + (D.lightInk ? 0.34 : 0.55) + '"/>';
    out += '<text x="' + S.at[0].toFixed(2) + '" y="' + S.at[1].toFixed(2) + '" dy="0.35em" text-anchor="middle" font-size="' + fs.toFixed(1) + '" fill="' + D.ink + '" stroke="' + D.line + '" stroke-width="' + (fs * 0.085).toFixed(2) + '" stroke-linejoin="round" paint-order="stroke" ' +
      'style="font-family:var(--f-display, Georgia, \'Times New Roman\', serif);font-weight:800;font-variant-numeric:lining-nums;paint-order:stroke">' + n.text.replace(/[<&]/g, '') + '</text>';
    /* 6 and 9 get a bar underneath, as on real dice, so a die at an angle cannot be misread */
    out += '<rect x="' + (S.at[0] - fs * 0.24).toFixed(2) + '" y="' + (S.at[1] + fs * 0.43).toFixed(2) + '" width="' + (fs * 0.48).toFixed(2) + '" height="' + (fs * 0.085).toFixed(2) + '" rx="1" fill="' + D.ink + '" visibility="' + (n.mark ? 'visible' : 'hidden') + '"/>';
    if (sides === 100) { out += '<text x="' + S.at[0].toFixed(2) + '" y="' + (S.at[1] + fs * 0.92).toFixed(2) + '" text-anchor="middle" font-size="9" fill="' + D.ink + '" style="font-family:var(--f-ui, Helvetica, Arial, sans-serif);font-weight:700">%</text>'; }
    return out + '</svg>';
  }

  /* ---------- the tray ---------- */
  var RIM = 10, EDGE = 5;      // the rim's width, and the clear strip between it and the dice
  function box(css) { var e = document.createElement('div'); e.style.cssText = css; return e; }
  function tray(host, o) {
    var st = host.__fd, rim = parse(o.rim, '#7a5636'), floor = o.floor || 'radial-gradient(120% 90% at 50% 36%, #5c241b 0%, #3f1711 55%, #270d09 100%)', root, look;
    if (!st || st.root.parentNode !== host) {
      root = box((getComputedStyle(host).position === 'static' ? 'position:relative;width:100%;height:100%;' : 'position:absolute;left:0;top:0;right:0;bottom:0;') + 'pointer-events:none;border-radius:22px;');
      root.setAttribute('aria-hidden', 'true'); root.setAttribute('data-fd', 'tray');
      st = { root: root, dice: [], anim: null, look: '', W: 0, H: 0 };
      st.floor = box('position:absolute;left:' + RIM + 'px;top:' + RIM + 'px;right:' + RIM + 'px;bottom:' + RIM + 'px;border-radius:13px;overflow:hidden;box-shadow:inset 0 0 0 1.5px rgba(0,0,0,0.6),inset 0 9px 18px rgba(0,0,0,0.62),inset 0 -3px 10px rgba(0,0,0,0.35);');
      /* a pool of light in the middle of the floor and shade towards the rim */
      st.floor.appendChild(box('position:absolute;left:0;top:0;right:0;bottom:0;background:radial-gradient(ellipse 78% 62% at 50% 42%, rgba(255,238,205,0.14), rgba(255,238,205,0) 62%), radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.46) 100%);box-shadow:inherit;border-radius:inherit;'));
      st.shadows = box('position:absolute;left:' + RIM + 'px;top:' + RIM + 'px;right:' + RIM + 'px;bottom:' + RIM + 'px;');
      st.layer = box('position:absolute;left:' + RIM + 'px;top:' + RIM + 'px;right:' + RIM + 'px;bottom:' + RIM + 'px;');
      root.appendChild(st.floor); root.appendChild(st.shadows); root.appendChild(st.layer);
      host.appendChild(root); host.__fd = st;
    }
    look = hex(rim) + '|' + floor;
    if (look !== st.look) {
      st.look = look;
      st.root.style.background = 'linear-gradient(180deg, ' + hex(blend(rim, WHITE, 0.3)) + ' 0%, ' + hex(rim) + ' 16%, ' + hex(blend(rim, BLACK, 0.22)) + ' 82%, ' + hex(blend(rim, BLACK, 0.48)) + ' 100%)';
      st.root.style.boxShadow = '0 12px 28px rgba(0,0,0,0.55), inset 0 1.5px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(0,0,0,0.4)';
      st.floor.style.background = floor;
    }
    return st;
  }

  /* Deal n dice onto a floor of W by H: cut the floor into equal patches, as large as they
     can be, put one die somewhere inside each. A die never leaves its patch, and patches do
     not overlap, so neither can the dice. Returns the die size and a centre for each. */
  function scatter(n, W, H) {
    var cap = n === 1 ? 132 : n === 2 ? 112 : 100, best = null, cols, rows, cw, ch, s, i, row, inRow, col, jx, jy, out = [];
    if (n < 1) { return { size: 0, at: [] }; }
    for (cols = 1; cols <= n; cols++) {
      rows = Math.ceil(n / cols); cw = (W - EDGE * 2) / cols; ch = (H - EDGE * 2) / rows; s = Math.max(12, Math.min(cap, Math.min(cw, ch) * 0.82));
      if (!best || s >= best.s - 0.5) { best = { s: s, cols: cols, rows: rows, cw: cw, ch: ch }; }      // when two arrangements are as good, the wider one wins
    }
    s = best.s; cw = best.cw; ch = best.ch;
    jx = Math.max(0, Math.min((cw - s) / 2 - 2, s * 0.4)); jy = Math.max(0, Math.min((ch - s) / 2 - 2, s * 0.4));
    for (i = 0; i < n; i++) {
      row = Math.floor(i / best.cols); inRow = row === best.rows - 1 ? n - best.cols * (best.rows - 1) : best.cols; col = i % best.cols;
      out.push({ x: W / 2 + (col - (inRow - 1) / 2) * cw + (Math.random() * 2 - 1) * jx, y: H / 2 + (row - (best.rows - 1) / 2) * ch + (Math.random() * 2 - 1) * jy });
    }
    return { size: s, at: out };
  }

  /* ---------- putting dice on the floor ---------- */
  var SMALL = 0.72;            // how much smaller a set-aside die is
  function place(d, x, y, rot, k, ky, op) {
    d.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + rot.toFixed(1) + 'deg) scale(' + k.toFixed(3) + ',' + (ky === undefined ? k : ky).toFixed(3) + ')';
    d.el.style.opacity = op === undefined ? '1' : op.toFixed(3);
  }
  /* the shadow slides out from under the die and softens as the die leaves the floor (z: 0 on it, 1 high) */
  function shadow(d, x, y, z, op) {
    d.sh.style.transform = 'translate3d(' + (x + d.size * (0.04 + 0.2 * z)).toFixed(1) + 'px,' + (y + d.size * (0.08 + 0.3 * z)).toFixed(1) + 'px,0) scale(' + (1 + 0.3 * z).toFixed(3) + ')';
    d.sh.style.opacity = (op * (0.9 - 0.5 * z)).toFixed(3);
  }
  function skin(d, value, aside) {
    var q = aside ? dim(d.color) : null;
    d.value = value; d.aside = aside; d.shown = String(value);
    d.el.innerHTML = picture(d.sides, q ? q.color : d.color, value, q ? q.ink : d.ink);
    d.text = d.el.querySelector('text'); d.bar = d.el.querySelector('rect');
  }
  /* while it tumbles only the numeral changes, which is far cheaper than redrawing the die */
  function flash(d, value) {
    var n = numeral(d.sides, value);
    if (d.shown === n.text) { return; }
    d.shown = n.text; d.text.textContent = n.text; d.bar.setAttribute('visibility', n.mark ? 'visible' : 'hidden');
  }
  function settle(d, ease) {
    var k = d.aside ? SMALL : 1;
    d.el.style.transition = ease ? 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)' : '';
    d.sh.style.transition = ease ? 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms linear' : '';
    place(d, d.x, d.y, d.rot, k);
    d.sh.style.transform = 'translate3d(' + (d.x + d.size * 0.04 * k).toFixed(1) + 'px,' + (d.y + d.size * 0.08 * k).toFixed(1) + 'px,0) scale(' + k.toFixed(3) + ')';
    d.sh.style.opacity = '0.9';
  }
  function has(list, i) { return !!list && list.indexOf(i) >= 0; }
  /* Make the floor hold exactly these dice. If the same dice are already there they keep
     their places (so redrawing after a roll does not reshuffle them); otherwise, or when
     asked to shuffle, they are dealt afresh. Returns true if they were dealt. */
  function seat(st, dice, o, shuffle) {
    var W = st.layer.clientWidth, H = st.layer.clientHeight, n = dice.length, same = !shuffle && st.dice.length === n && st.W === W && st.H === H, deal, i, d, s;
    for (i = 0; same && i < n; i++) { same = st.dice[i].sides === dice[i].sides && st.dice[i].color === dice[i].color && st.dice[i].ink === (o.ink || ''); }
    if (same) { return false; }
    st.shadows.innerHTML = ''; st.layer.innerHTML = ''; st.dice = []; st.W = W; st.H = H;
    deal = scatter(n, W, H); s = deal.size;
    for (i = 0; i < n; i++) {
      d = { sides: dice[i].sides, color: dice[i].color, ink: o.ink || '', size: s, x: deal.at[i].x, y: deal.at[i].y, rot: (Math.random() * 2 - 1) * (n === 1 ? 8 : 14), value: null, aside: false, shown: '' };
      d.sh = box('position:absolute;left:0;top:0;width:' + s.toFixed(1) + 'px;height:' + s.toFixed(1) + 'px;margin:' + (-s / 2).toFixed(1) + 'px 0 0 ' + (-s / 2).toFixed(1) + 'px;border-radius:50%;background:radial-gradient(closest-side, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.52) 55%, rgba(0,0,0,0) 100%);will-change:transform,opacity;');
      d.el = box('position:absolute;left:0;top:0;width:' + s.toFixed(1) + 'px;height:' + s.toFixed(1) + 'px;margin:' + (-s / 2).toFixed(1) + 'px 0 0 ' + (-s / 2).toFixed(1) + 'px;will-change:transform,opacity;');
      d.el.setAttribute('data-fd', 'die');
      st.shadows.appendChild(d.sh); st.layer.appendChild(d.el); st.dice.push(d);
    }
    return true;
  }

  /* ---------- the throw ---------- */
  var live = [], raf = 0, last = 0, manual = false;
  var SPAN = 780;
  function hit(kind, strength, pan) {
    var S = FR.Dice && FR.Dice.Sound;
    if (S && S.hit) { try { S.hit(kind, strength, pan); } catch (e) { /* silence is fine */ } }
  }
  /* how high the die is at u (0 thrown, 1 at rest): a fall, a bounce, a smaller bounce */
  function height(u) {
    var v;
    if (u < 0.52) { v = u / 0.52; return 1 - v * v; }
    if (u < 0.8) { v = (u - 0.52) / 0.28; return 0.3 * 4 * v * (1 - v); }
    v = (u - 0.8) / 0.2; return 0.09 * 4 * v * (1 - v);
  }
  function advance(st, t) {
    var a = st.anim, W = st.W, all = true, i, d, u, e, z, f, face, k;
    a.t = t;
    for (i = 0; i < st.dice.length; i++) {
      d = st.dice[i]; u = Math.max(0, Math.min(1, (t - d.wait) / d.span));
      if (u < 1) { all = false; }
      if (t < d.wait) { d.el.style.opacity = '0'; d.sh.style.opacity = '0'; continue; }
      e = 1 - Math.pow(1 - u, 2.4);                                    // fast out of the hand, slowing as it rolls
      z = height(u);
      /* it turns over a few times on the way, done by the second bounce; each time it comes
         edge-on a new face rolls up, until the last one, which is the result */
      f = d.flips * Math.PI * (1 - Math.min(1, e / 0.93)); face = Math.floor(f / Math.PI + 0.5);
      if (face !== d.face) { d.face = face; flash(d, face === 0 ? d.value : 1 + Math.floor(Math.random() * d.sides)); }
      k = 1 + 0.3 * z;
      place(d, d.fx + (d.x - d.fx) * e, d.fy + (d.y - d.fy) * e, d.rot + d.turns * (1 - e), k, k * (0.5 + 0.5 * Math.abs(Math.cos(f))), Math.min(1, (t - d.wait) / 60));
      shadow(d, d.fx + (d.x - d.fx) * e, d.fy + (d.y - d.fy) * e, z, Math.min(1, (t - d.wait) / 60));
      if (u >= 0.52 && d.heard < 1) { d.heard = 1; if (!a.quiet) { hit(i % 3 === 1 ? 'die' : 'felt', 0.8, (d.x / W) * 1.4 - 0.7); } }
      if (u >= 0.8 && d.heard < 2) { d.heard = 2; if (!a.quiet) { hit('felt', 0.3, (d.x / W) * 1.4 - 0.7); } }
    }
    if (all) {
      /* landed. A die that does not count (the lower roll on advantage) now shrinks and dims
         where it lies; that last touch runs by itself, so the result is not kept waiting */
      st.dice.forEach(function (q, m) { if (has(a.dropped, m)) { skin(q, q.value, true); } settle(q, true); });
      halt(st, true);
    }
  }
  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(100, now - last) : 16;        // after a long gap (a hidden tab) carry on from where it was
    last = now;
    if (!manual) { live.slice().forEach(function (st) { if (st.anim) { advance(st, st.anim.t + dt); } }); }
    if (live.length) { raf = requestAnimationFrame(frame); } else { last = 0; }
  }
  /* stop a throw that is still in the air: its promise resolves (true only if it had landed) */
  function halt(st, landed) {
    var a = st.anim, i;
    if (!a) { return; }
    st.anim = null; i = live.indexOf(st); if (i >= 0) { live.splice(i, 1); }
    clearTimeout(a.timer);
    a.resolve(!!landed);
  }

  function draw(host, dice, values, opts) {
    var o = opts || {}, st = tray(host, o), midAir = !!st.anim, fresh;
    halt(st, false);
    values = values || [];
    fresh = seat(st, dice, o, false);
    st.layer.style.transition = ''; st.layer.style.opacity = '1'; st.shadows.style.opacity = '1';
    st.dice.forEach(function (d, i) {
      var aside = has(o.dropped, i), v = values[i] === undefined ? '?' : values[i], moved = aside !== d.aside;
      if (fresh || moved || d.value !== v || d.shown !== String(v)) { skin(d, v, aside); }
      /* A die being set aside shrinks into place; one caught in the air is put down; a die
         that is already where it belongs is left alone, so drawing twice changes nothing. */
      if (fresh || moved || midAir) { settle(d, moved && !fresh && !midAir && !o.reduced); }
    });
  }
  function roll(host, dice, values, opts) {
    var o = opts || {}, st = tray(host, o);
    halt(st, false);
    values = values || [];
    return new Promise(function (resolve) {
      var n = dice.length, gap = n > 1 ? Math.min(46, 260 / (n - 1)) : 0, a;
      seat(st, dice, o, true);
      a = st.anim = { t: 0, resolve: resolve, dropped: o.dropped || [], quiet: o.sound === false, timer: 0 };
      if (o.reduced || !n) {
        /* less motion: the dice are simply there, after a short fade */
        st.dice.forEach(function (d, i) { skin(d, values[i] === undefined ? '?' : values[i], has(o.dropped, i)); settle(d, false); });
        st.layer.style.transition = 'none'; st.layer.style.opacity = '0'; st.shadows.style.opacity = '0';
        void st.layer.offsetWidth;                          // let the browser see the start of the fade
        st.layer.style.transition = st.shadows.style.transition = 'opacity 180ms linear'; st.layer.style.opacity = '1'; st.shadows.style.opacity = '1';
        a.timer = setTimeout(function () { halt(st, true); }, 200);
        return;
      }
      st.layer.style.transition = ''; st.layer.style.opacity = '1'; st.shadows.style.transition = ''; st.shadows.style.opacity = '1';
      st.dice.forEach(function (d, i) {
        d.el.style.transition = ''; d.sh.style.transition = '';
        skin(d, values[i] === undefined ? '?' : values[i], false);
        d.wait = i * gap; d.span = SPAN + (Math.random() * 100 - 40);
        d.fx = d.x + (Math.random() - 0.5) * st.W * 0.6; d.fy = st.H + d.size;        // thrown in over the near rim
        d.turns = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 260); d.flips = 3 + Math.floor(Math.random() * 2);
        d.face = -1; d.heard = 0;
      });
      advance(st, 0);
      live.push(st);
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    });
  }
  function clear(host) {
    var st = host && host.__fd;
    if (!st) { return; }
    halt(st, false);
    if (st.root.parentNode) { st.root.parentNode.removeChild(st.root); }
    host.__fd = null;
  }
  document.addEventListener('visibilitychange', function () { last = 0; });

  FR.FlatDice = {
    /* dice: [{ sides: 4|6|8|10|12|20|100, color: '#hex' }], values: [n, ...],
       opts: { reduced, floor, rim, ink, dropped: [indexes], sound: false to stay silent } */
    draw: draw,
    roll: roll,                // returns a promise: true once the dice have landed, false if the throw was called off
    clear: clear,
    /* what a die of this colour wears: { ink, face, worst } where face and worst are contrast
       ratios (numeral against its own face, and against the least helpful face on the die) */
    ink: function (color, forced) { var D = dress(color, forced); return { ink: D.ink, light: D.lightInk, face: D.face, worst: D.worst, mid: hex(D.mid), lit: hex(D.lit), dark: hex(D.dark) }; },
    aside: dim,
    /* For the test page only: stop the clock and set the time by hand; deal without drawing. */
    test: {
      manual: function (on) { manual = !!on; if (!manual && live.length && !raf) { last = 0; raf = requestAnimationFrame(frame); } },
      seek: function (host, ms) { var st = host.__fd; if (!st || !st.anim) { return -1; } while (st.anim && st.anim.t + 16 < ms) { advance(st, st.anim.t + 16); } if (st.anim && ms > st.anim.t) { advance(st, ms); } return st.anim ? st.anim.t : -1; },
      scatter: scatter,
      seated: function (host) { var st = host.__fd; return st ? st.dice.map(function (d) { return { x: d.x, y: d.y, size: d.size, rot: d.rot, aside: d.aside, value: d.value }; }) : []; },
      shape: shape, contrast: ratio, lum: function (c) { return lum(parse(c)); }
    }
  };
})();
