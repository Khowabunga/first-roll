/* First Roll: scenario packs.
   A pack is one call, FR.scenario({ ...data only... }), in scenarios/<id>/scenario.js. This file
   takes that data, lays it over the pack it extends (src/base.js unless it says otherwise) and
   builds the theme object the rest of the app reads: FR.theme, FR.THEMES[id], FR.useTheme(id).
   It also fetches packs on demand (FR.loadScenario) and chooses the one to open with (FR.begin).
   The contract, field by field, is in README.md under "Make a new scenario". */
var FR = (typeof FR !== 'undefined') ? FR : {};
if (typeof module !== 'undefined' && typeof require === 'function' && !FR.rank) { FR = require('./rules.js'); }

(function () {
  'use strict';
  FR.SCHEMA = 1;
  FR.THEMES = FR.THEMES || {};                       // packs that are loaded and ready, by id
  FR.MANIFEST = FR.MANIFEST || { schema: 1, default: '', packs: [] };   // every pack the build knows of; written into the page
  FR.ASSETS = FR.ASSETS || {};                       // file path -> short content hash, so a new deploy is never served stale
  FR.ADVENTURES = FR.ADVENTURES || {};
  /* the sounds a pack may name in `sfx`: voices on FR.Dice.Sound (src/dice.js, src/audio.js) */
  FR.SFX = ['tink', 'tick', 'jingle', 'fanfare', 'chime', 'lowchime', 'womp', 'dingdong', 'sparkle'];
  /* screens a pack may show its particles on */
  FR.SCREENS = ['title', 'heroes', 'story', 'quiz', 'reveal', 'portrait', 'sheet', 'play', 'dice'];

  var DEFS = {}, hasDoc = typeof document !== 'undefined';
  var clone = function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
  var plain = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  var get = function (o, path) { return String(path).split('.').reduce(function (v, k) { return v === undefined || v === null ? undefined : v[k]; }, o); };

  /* ---------- files ---------- */
  /* A pack names its own files from its own folder ("img/keyart.webp"). "base:img/seal.webp" borrows one
     of the engine's. FR.url adds the content hash the build worked out. */
  FR.url = function (path) { var h = FR.ASSETS[path]; return h ? path + '?v=' + h : path; };
  FR.locate = function (id, path) {
    if (typeof path !== 'string' || !path) { return path; }
    if (path.indexOf('base:') === 0) { return path.slice(5); }
    return id === 'base' ? path : 'packs/' + id + '/' + path;
  };
  FR.asset = function (id, path) { return FR.url(FR.locate(id, path)); };
  /* every place in a pack that names a file; `*` is "each item" */
  FR.ASSET_FIELDS = ['art.wordmark', 'art.divider', 'art.thumb', 'art.floor', 'art.crest', 'art.sample', 'tokens.images.*',
    'story.*.img', 'music.intro.*', 'music.game.*', 'music.fight.*', 'roster.premades.*.portrait'];
  /* fn(value, path) for each file a pack names; return a string to replace it */
  FR.eachAsset = function (def, fn) {
    FR.ASSET_FIELDS.forEach(function (field) {
      (function walk(node, parts, at) {
        if (!node || typeof node !== 'object') { return; }
        var k = parts[0], rest = parts.slice(1), keys = k === '*' ? Object.keys(node) : [k];
        keys.forEach(function (key) {
          var v = node[key], here = at ? at + '.' + key : key;
          if (!rest.length) { if (typeof v === 'string') { var r = fn(v, here); if (typeof r === 'string') { node[key] = r; } } }
          else { walk(v, rest, here); }
        });
      })(def, field.split('.'), '');
    });
  };

  /* ---------- one pack laid over another ---------- */
  /* Small settings merge key by key, so a pack only writes what differs. Content that only makes
     sense whole (a cast, a quiz, a wording template) replaces the parent's outright. Lists always replace. */
  var WHOLE = ['quiz.questions', 'quiz.quick', 'quiz.alignment', 'cast.classes', 'cast.races', 'cast.names', 'cast.samples', 'cast.armorNotes',
    'look.options', 'look.labels', 'roster.demo', 'prose.describe', 'prose.origin', 'ai.subject', 'music', 'particles'];
  var OWN = ['schema', 'id', 'version', 'extends', 'meta', 'adventure'];        // never inherited
  function merge(under, over, at) {
    var out = {};
    Object.keys(under).forEach(function (k) { if (at || OWN.indexOf(k) < 0) { out[k] = under[k]; } });
    Object.keys(over).forEach(function (k) {
      var here = at ? at + '.' + k : k, a = out[k], b = over[k];
      out[k] = plain(a) && plain(b) && WHOLE.indexOf(here) < 0 ? merge(a, b, here) : b;
    });
    return out;
  }
  function parentOf(def) { return def.id === 'base' ? null : (def.extends === undefined ? 'base' : def.extends); }
  /* the pack with everything it inherits, files already pointed at whichever pack owns them */
  function resolved(id, seen) {
    var def = DEFS[id];
    seen = seen || [];
    if (!def) { throw new Error('Scenario "' + id + '" is not loaded' + (seen.length ? ' (needed by "' + seen[seen.length - 1] + '")' : '') + '.'); }
    if (seen.indexOf(id) >= 0) { throw new Error('Scenario "' + id + '" extends itself: ' + seen.concat(id).join(' > ') + '.'); }
    var mine = clone(def), up = parentOf(def);
    FR.eachAsset(mine, function (v) { return FR.locate(id, v); });
    return up ? merge(resolved(up, seen.concat(id)), mine, '') : mine;
  }
  FR.resolved = resolved;

  /* ---------- wording templates ---------- */
  /* Packs are data, so the sentences a theme used to build in code are templates:
       { text: 'A {body}{race} ({looks}).{details}', parts: { body: {...}, details: {...} } }
     {key} is a part when one has that name, otherwise a value from the character (name, first, cls, race,
     desc, top, look.age, classInfo.gear, raceInfo.look, flourishA, flourishB).
     A part reads one value (`from`), may swap it through a table (`map`), lower-case it (`lower`) and wrap
     it (`wrap`, with {value}); `or` is what to say when there is nothing. A part with `list` gathers
     several parts and joins the ones that had something to say. */
  function part(rule, ctx) {
    var v, said;
    if (rule.list) {
      said = rule.list.map(function (r) { return part(r, ctx); }).filter(function (s) { return s !== ''; });
      if (!said.length) { return rule.or === undefined ? '' : rule.or; }
      v = said.join(rule.join === undefined ? ', ' : rule.join);
    } else {
      v = get(ctx, rule.from);
      if (v !== undefined && v !== null && v !== '' && rule.map) { v = rule.map[v]; }
      if (v === undefined || v === null || v === '') { return rule.or === undefined ? '' : rule.or; }
      v = String(v);
      if (rule.lower) { v = v.toLowerCase(); }
    }
    return rule.wrap ? rule.wrap.split('{value}').join(v) : v;
  }
  FR.fill = function (tpl, ctx) {
    if (!tpl || typeof tpl.text !== 'string') { return ''; }
    return tpl.text.replace(/\{([A-Za-z0-9_.]+)\}/g, function (m, key) {
      if (tpl.parts && tpl.parts[key]) { return part(tpl.parts[key], ctx); }
      var v = get(ctx, key);
      return v === undefined || v === null ? '' : String(v);
    });
  };
  /* what a template may read */
  FR.TEMPLATE_KEYS = ['name', 'first', 'cls', 'race', 'desc', 'top', 'look.body', 'look.age', 'look.build', 'look.hair', 'look.mark', 'look.bearing',
    'classInfo.gear', 'classInfo.blurb', 'raceInfo.look', 'raceInfo.perk', 'flourishA', 'flourishB'];
  function about(t, ch) {
    var name = ch.name ? String(ch.name) : '';
    return { name: name, first: ch.first || name.split(' ')[0], cls: ch.cls, race: ch.race, top: ch.top, look: ch.look || {},
      desc: ch.desc ? String(ch.desc).trim() : '', classInfo: t.classes[ch.cls] || {}, raceInfo: t.races[ch.race] || {} };
  }

  var ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  function roman(n) { var s = ''; ROMAN.forEach(function (r) { while (n >= r[0]) { s += r[1]; n -= r[0]; } }); return s; }
  function band(rules, v) {               // the first rule the value satisfies; a rule with no limits always does
    for (var i = 0; i < (rules || []).length; i++) {
      var r = rules[i];
      if ((r.over === undefined || v > r.over) && (r.under === undefined || v < r.under)) { return r.say; }
    }
    return '';
  }
  var hex = function (c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? parseInt(c.slice(1), 16) : c; };

  /* ---------- data in, theme out ---------- */
  function hydrate(id) {
    var d = resolved(id), meta = d.meta || {}, quiz = d.quiz || {}, cast = d.cast || {}, look = d.look || {}, art = d.art || {};
    var roster = d.roster || {}, prose = d.prose || {}, ai = d.ai || {}, al = quiz.alignment || {}, count = quiz.count || {};
    var t = {
      id: d.id, name: meta.name, blurb: meta.blurb, version: d.version, meta: meta,
      questions: quiz.questions || [], classes: cast.classes || {}, races: cast.races || {}, names: cast.names || {},
      look: look.options || {}, lookLabels: look.labels || {}, flourish: look.flourish || [], actions: d.actions || [],
      traitLabels: quiz.traits || {}, axes: quiz.axes || [['', ''], ['', '']], armorNotes: cast.armorNotes || null, samples: cast.samples || {},
      demo: roster.demo || null, story: d.story && d.story.length ? d.story : null, extras: d.extras || [],
      ai: ai, text: d.text || {}, particles: d.particles || null, adventure: d.adventure || null,
      sfx: d.sfx || {}, fx: d.fx || {}, tokens: d.tokens || {}, quiz: quiz, roster: roster
    };
    /* each table remembers its own questions, so its yardstick (FR.baseline) can never be taken with another pack's */
    [t.classes, t.races].forEach(function (table) { Object.defineProperty(table, '_quiz', { value: t.questions, enumerable: false }); });

    t.alignment = function (u, answered) {
      var n = Math.max(1, answered), said = { order: band(al.order, u.order / n), light: band(al.light, u.light / n) };
      var s = (al.parts || ['order', 'light']).map(function (k) { return said[k]; }).filter(Boolean).join(al.join === undefined ? ' ' : al.join);
      return (al.rename && al.rename[s]) || s;
    };
    t.count = function (i, n) {
      var num = count.numerals === 'roman' ? roman : String;
      return String(count.text || '{i} of {n}').split('{i}').join(num(i + 1)).split('{n}').join(num(n));
    };
    /* the stand-in for the AI's description: two different flourishes, drawn the same way every time */
    t.describe = function (ch) {
      var c = about(t, ch), a = FR.pick(t.flourish), b = FR.pick(t.flourish);
      while (b === a && t.flourish.length > 1) { b = FR.pick(t.flourish); }
      c.flourishA = a; c.flourishB = b;
      return FR.fill(prose.describe, c);
    };
    t.origin = function (c) { return FR.fill(prose.origin, about(t, c)); };
    t.subject = function (ch) { return FR.fill(ai.subject, about(t, ch)); };          // the words handed to the painter; the style is added by the caller

    var byClass = function (pattern) { return function (cls) { return FR.url(String(pattern || '').split('{slug}').join(FR.slug(cls))); }; };
    t.art = { wordmark: FR.url(art.wordmark || ''), divider: FR.url(art.divider || ''), thumb: FR.url(art.thumb || ''), floor: FR.url(art.floor || ''),
      crest: byClass(art.crest), sample: byClass(art.sample) };
    if (t.story) { t.story = t.story.map(function (b) { return { img: FR.url(b.img), alt: b.alt, text: b.text }; }); }

    var dice = clone(d.dice || {});
    dice.floorTint = hex(dice.floorTint); dice.floorBase = hex(dice.floorBase);
    if (dice.rim) { dice.rim.color = hex(dice.rim.color); }
    t.dice = dice;

    var m = d.music, tracks = function (l) { return (l || []).map(FR.url); };
    t.music = m && ((m.intro || []).length || (m.game || []).length || (m.fight || []).length) ? {
      intro: tracks(m.intro), game: tracks(m.game), fight: tracks(m.fight),
      credit: (meta.credits || []).filter(function (c) { return c && c.type === 'music'; }).map(function (c) { return c.text; }).join(' ')
    } : null;

    /* ready-made heroes: each ends up with everything a finished character needs */
    t.premades = (roster.premades || []).map(function (p) {
      return { name: p.name, cls: p.cls, race: p.race, look: clone(p.look || {}), desc: p.desc || '', answers: p.answers ? p.answers.slice() : FR.answersFor(p.cls, p.race, t),
        portrait: p.portrait ? FR.url(p.portrait) : t.art.sample(p.cls) };
    });
    t.roster = { demo: t.demo, premades: t.premades };
    t.quick = (quiz.quick || []).slice();
    t.fonts = fontsOf(d);
    return t;
  }
  /* the engine's own typefaces (the dice numerals are drawn in one) plus the pack's */
  function fontsOf(d) {
    var list = [], add = function (u) { if (u && list.indexOf(u) < 0) { list.push(u); } };
    add(get(DEFS.base || {}, 'tokens.fonts.stylesheet')); add(get(d, 'tokens.fonts.stylesheet'));
    return list;
  }

  /* ---------- tokens to CSS ---------- */
  /* A pack's palette, type, corners and backdrop pictures become custom properties on
     body[data-theme="<id>"]. The build writes them into the page for the default pack; for a pack
     fetched later the same text is added here. They sit in the page itself, never in pack.css, because
     browsers disagree about where a url() inside a custom property is relative to. */
  /* colours the styles also need as "r, g, b": palette key -> the name of its channel property */
  var CHANNELS = FR.TOKEN_CHANNELS = { night: 'night', soot: 'soot', bone: 'bone', parch: 'parch', ink: 'ink', oxblood: 'ox', wax: 'wax', gilt: 'gilt' };
  var GENERIC = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded'];
  var FONTS = FR.TOKEN_FONTS = ['display', 'body', 'ui', 'sc', 'cap'];
  var kebab = function (s) { return String(s).replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); };

  /* Every token a pack may set, by group: key -> the kind of value it takes. A token becomes the custom
     property --<prefix><key in kebab-case> (inkSoft -> --ink-soft, type['2xl'] -> --t-2xl) unless a name
     is given beside its kind. src/styles.css declares each property with the default look's value, and
     `npm run validate` fails if one is missing there. What each token controls is in README.md.
     Kinds: hex '#rrggbb' | px, ms: a number | num, alpha (0 to 1), weight (100 to 900): a number |
            em: a number of ems | color: '#rrggbb', rgba(8, 20, 40, 0.5), rgba(var(--night-rgb), 0.5) or var(--name) | css: any one CSS value
            (a gradient, a shadow, a transform) | ease: cubic-bezier(...) or a keyword | pos: a position like 'center 46%' */
  FR.TOKENS = {
    palette: { prefix: '', keys: { night: 'hex', soot: 'hex', bone: 'hex', mute: 'hex', parch: 'hex', ink: 'hex', inkSoft: 'hex', oxblood: 'hex', wax: 'hex', waxHi: 'hex', waxDeep: 'hex',
      gilt: 'hex', giltHi: 'hex', giltDeep: 'hex', sage: 'hex', pine: 'hex', edge: 'hex', edgeDeep: 'hex', onGilt: 'hex', onWax: 'hex', danger: 'hex', dangerHi: 'hex' } },
    type: { prefix: 't-', keys: { xs: 'px', sm: 'px', md: 'px', lg: 'px', xl: 'px', '2xl': 'px', '3xl': 'px', num: 'px',
      lineHeight: ['num', '--lh'], tracking: ['em', '--track'], trackingDisplay: ['em', '--track-display'] } },
    weight: { prefix: 'w-', keys: { body: 'weight', medium: 'weight', strong: 'weight', label: 'weight', display: 'weight', head: 'weight', lead: 'weight' } },
    space: { prefix: 's-', keys: { 1: 'px', 2: 'px', 3: 'px', 4: 'px', 5: 'px', 6: 'px', 7: 'px', gutter: ['px', '--gutter'], page: ['px', '--page-pad'], pageGap: ['px', '--page-gap'] } },
    radii: { prefix: 'r-', keys: { btn: 'px', page: 'px', chip: 'px', pill: 'px', dialog: 'px', media: 'px', frame: 'px' } },
    line: { prefix: '', keys: { border: ['px', '--bw'], icon: ['num', '--icon-stroke'], bar: ['px', '--bar-h'], hairline: 'color', rim: 'color', rule: 'color' } },
    shadow: { prefix: 'sh-', keys: { cardEdge: 'css', card: 'css', btn: 'css', btnPress: 'css', ghost: 'css', pop: 'css', row: 'css', display: 'css', text: 'css', art: 'css', press: ['css', '--press'] } },
    motion: { prefix: 'd-', keys: { fast: 'ms', base: 'ms', slow: 'ms', scene: 'ms', loop: 'ms', drift: 'ms', ease: ['ease', '--ease'], bounce: ['ease', '--ease-bounce'] } },
    button: { prefix: '', keys: { top: ['hex', '--btn-1'], mid: ['hex', '--btn-2'], bottom: ['hex', '--btn-3'], edge: ['color', '--btn-edge'], ghost: ['color', '--ghost-bg'],
      selected: ['color', '--sel-bg'], onSelected: ['color', '--sel-ink'] } },
    gold: { prefix: 'gold-', keys: { top: ['hex', '--gold-1'], mid: ['hex', '--gold-2'], bottom: ['hex', '--gold-3'], titleTop: ['color', '--title-1'], titleMid: ['color', '--title-2'], titleBottom: ['color', '--title-3'] } },
    surface: { prefix: '', keys: { accent: 'color', accent2: ['color', '--accent-2'], scrim: ['alpha', '--scrim-a'], fieldBg: 'color', fieldEdge: 'color', placeholder: 'color',
      decor: 'css', decorRule: 'css', pageTop: ['px', '--page-top-h'], headRule: ['px', '--head-rule-h'], tabRule: ['px', '--tab-rule-h'],
      veilTop: ['alpha', '--veil-1'], veilBottom: ['alpha', '--veil-2'], rowBg: 'css', rowEdge: 'color', modBg: 'css', modInk: 'color', modEdge: 'color',
      modFightBg: 'css', modFightInk: 'color', modFightEdge: 'color', titleVeil: 'css', taglineScrim: ['alpha', '--tag-scrim'],
      sceneFocus: ['pos', '--scene-pos'], sceneTitleFocus: ['pos', '--scene-title-pos'], sceneTitleFilter: 'css', sceneDim: ['alpha', '--scene-dim'] } }
  };
  /* Choices that set several properties at once: group.key -> { the choice: { property: value } }.
     The first choice of each is the default look's, and matches what src/styles.css declares. */
  FR.TOKEN_SWITCHES = {
    'type.caps': {                       // how labels and buttons are capitalised
      normal: { '--caps-variant': 'normal', '--caps-transform': 'none' },
      small: { '--caps-variant': 'small-caps', '--caps-transform': 'none' },
      upper: { '--caps-variant': 'normal', '--caps-transform': 'uppercase' } },
    'type.dropCap': {                    // the big first letter of a question and of the origin story
      on: { '--cap-size': '3em', '--cap-lh': '0.78', '--cap-float': 'left', '--cap-pad': '0.076em 0.12em 0 0', '--cap-weight': '700', '--cap-font': 'var(--f-cap)', '--cap-color': 'var(--oxblood)' },
      off: { '--cap-size': '1em', '--cap-lh': 'inherit', '--cap-float': 'none', '--cap-pad': '0', '--cap-weight': 'inherit', '--cap-font': 'inherit', '--cap-color': 'inherit' } },
    'type.emphasis': {                   // taglines and asides: slanted, or upright and heavier
      italic: { '--em-style': 'italic', '--em-weight': 'var(--w-body)' },
      bold: { '--em-style': 'normal', '--em-weight': 'var(--w-medium)' } },
    'type.lead': {                       // the face of the quiz question
      body: { '--f-lead': 'var(--f-body)' },
      display: { '--f-lead': 'var(--f-display)' } },
    'line.divider': {                    // the rule between sections of a page
      taper: { '--taper-h': '5px', '--taper-clip': 'polygon(0 0, 100% 50%, 0 100%)', '--taper-bg': 'var(--oxblood)' },
      line: { '--taper-h': 'var(--bw)', '--taper-clip': 'none', '--taper-bg': 'var(--rule)' } },
    'line.marker': {                     // bullets, the answer markers and the slider thumbs
      diamond: { '--mark-size': '10px', '--mark-r': '0px', '--mark-turn': 'rotate(45deg)' },
      dot: { '--mark-size': '14px', '--mark-r': '50%', '--mark-turn': 'none' } },
    'line.note': {                       // the helpful note on a page: ruled above and below, or boxed
      rules: { '--note-bw': '2px 0', '--note-r': '0px' },
      box: { '--note-bw': 'var(--bw)', '--note-r': 'var(--r-chip)' } },
    'surface.portrait': {                // how a portrait sits on the page: painted into it, or a photo laid on it
      vignette: { '--frame-pad': '0px', '--frame-r': '0px', '--frame-bg': 'rgba(255, 248, 228, 0.25)', '--photo-bg': 'transparent', '--frame-border': '1px solid rgba(var(--ink-rgb), 0.35)',
        '--frame-outline': '1px solid rgba(var(--gilt-rgb), 0.9)', '--frame-sh': 'none', '--portrait-blend': 'multiply',
        '--portrait-mask': 'radial-gradient(ellipse 72% 70% at 50% 48%, #000 70%, transparent 100%)', '--empty-filter': 'grayscale(1) sepia(0.6)', '--empty-opacity': '0.28' },
      photo: { '--frame-pad': '8px', '--frame-r': 'var(--r-page)', '--frame-bg': '#fff', '--photo-bg': '#fff', '--frame-border': '0 solid transparent',
        '--frame-outline': '0 solid transparent', '--frame-sh': 'var(--sh-pop)', '--portrait-blend': 'normal', '--portrait-mask': 'none', '--empty-filter': 'none', '--empty-opacity': '0.55' } },
    'surface.chrome': {                  // the bars above and below the dice: fading into the tray, or solid panels
      fade: { '--chrome-top': 'linear-gradient(rgba(var(--night-rgb), 0.96) 0%, rgba(var(--night-rgb), 0.82) 70%, rgba(var(--night-rgb), 0))',
        '--chrome-bot': 'linear-gradient(rgba(var(--night-rgb), 0) 0%, rgba(var(--night-rgb), 0.86) 24%, rgba(var(--night-rgb), 0.97) 100%)',
        '--chrome-bw': '0px', '--chrome-r': '0px', '--chrome-sh': 'none', '--chrome-lip-top': '0px', '--chrome-lip-bot': '0px', '--chrome-pad-top': '22px', '--chrome-pad-bot': '30px' },
      panel: { '--chrome-top': 'rgba(var(--soot-rgb), 0.97)', '--chrome-bot': 'rgba(var(--soot-rgb), 0.97)',
        '--chrome-bw': '3px', '--chrome-r': 'var(--r-dialog)', '--chrome-sh': 'var(--sh-pop)', '--chrome-lip-top': '14px', '--chrome-lip-bot': '22px', '--chrome-pad-top': '26px', '--chrome-pad-bot': '38px' } }
  };
  /* Is this value the right kind? Shared by the generator below and by the pack checks (scripts/lib/packs.js). */
  var SAFE = /^[^;{}<>\\]*$/, HEX = /^#[0-9a-f]{6}$/i;
  var KIND = {
    hex: function (v) { return typeof v === 'string' && HEX.test(v); },
    px: function (v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 2000; },
    ms: function (v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 120000; },
    num: function (v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 100; },
    em: function (v) { return typeof v === 'number' && isFinite(v) && v >= -0.2 && v <= 1; },
    alpha: function (v) { return typeof v === 'number' && v >= 0 && v <= 1; },
    weight: function (v) { return typeof v === 'number' && v >= 100 && v <= 900; },
    color: function (v) { return typeof v === 'string' && (HEX.test(v) || /^(rgba?\(\s*(var\(--[a-z0-9-]+\)|[\d.]+)[\d\s.,%\/]*\)|var\(--[a-z0-9-]+\)|transparent)$/i.test(v)); },
    css: function (v) { return typeof v === 'string' && v.trim() !== '' && v.length <= 600 && SAFE.test(v) && !/url\(|expression|@import/i.test(v); },
    ease: function (v) { return typeof v === 'string' && /^(cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)|linear|ease|ease-in|ease-out|ease-in-out)$/.test(v); },
    pos: function (v) { return typeof v === 'string' && /^[a-z0-9%.\s-]{1,40}$/i.test(v); }
  };
  var UNIT = { px: 'px', ms: 'ms', em: 'em' };
  FR.tokenOk = function (kind, v) { return !!KIND[kind] && KIND[kind](v); };
  /* [property, kind] for one token, or null when there is no such token */
  FR.tokenOf = function (group, key) {
    var g = FR.TOKENS[group], spec = g && Object.prototype.hasOwnProperty.call(g.keys, key) ? g.keys[key] : null;
    if (!spec) { return null; }
    return Array.isArray(spec) ? [spec[1], spec[0]] : ['--' + g.prefix + kebab(key), spec];
  };
  /* every custom property a pack can set, for the check that src/styles.css declares them all */
  FR.tokenProperties = function () {
    var out = [];
    Object.keys(FR.TOKENS).forEach(function (g) { Object.keys(FR.TOKENS[g].keys).forEach(function (k) { out.push(FR.tokenOf(g, k)[0]); }); });
    Object.keys(FR.TOKEN_SWITCHES).forEach(function (sw) { var first = FR.TOKEN_SWITCHES[sw][Object.keys(FR.TOKEN_SWITCHES[sw])[0]]; Object.keys(first).forEach(function (p) { out.push(p); }); });
    Object.keys(CHANNELS).forEach(function (k) { out.push('--' + CHANNELS[k] + '-rgb'); });
    FONTS.forEach(function (k) { out.push('--f-' + k); });
    ['key', 'page', 'table'].forEach(function (k) { out.push('--' + k + '-img'); });
    return out;
  };
  /* a switch is written true/false or by name: dropCap: false is the same as dropCap: 'off' */
  FR.switchChoice = function (path, v) { var sw = FR.TOKEN_SWITCHES[path]; v = v === true ? 'on' : (v === false ? 'off' : v); return sw && typeof v === 'string' && sw[v] ? v : null; };
  FR.tokensCss = function (id) {
    var tk = resolved(id).tokens || {}, lines = [], p = tk.palette || {}, f = tk.fonts || {}, im = tk.images || {}, ch = tk.channels || {};
    Object.keys(FR.TOKENS).forEach(function (g) {
      var mine = tk[g] || {};
      Object.keys(mine).forEach(function (k) {
        var t = FR.tokenOf(g, k), v = mine[k], choice = FR.switchChoice(g + '.' + k, v);
        if (choice) { var set = FR.TOKEN_SWITCHES[g + '.' + k][choice]; Object.keys(set).forEach(function (prop) { lines.push(prop + ': ' + set[prop]); }); return; }
        if (!t || !FR.tokenOk(t[1], v)) { return; }                       // not a token, or not a value it can take: the pack checks say so
        lines.push(t[0] + ': ' + v + (UNIT[t[1]] || ''));
      });
      if (g !== 'palette') { return; }
      Object.keys(CHANNELS).forEach(function (k) {
        var c = ch[k];
        if (!c && p[k] && HEX.test(p[k])) { var n = parseInt(p[k].slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', '); }
        if (c) { lines.push('--' + CHANNELS[k] + '-rgb: ' + c); }
      });
    });
    FONTS.forEach(function (k) {
      if (Array.isArray(f[k]) && f[k].length) { lines.push('--f-' + k + ': ' + f[k].map(function (n) { return GENERIC.indexOf(n) >= 0 ? n : "'" + String(n).replace(/['\\]/g, '') + "'"; }).join(', ')); }
    });
    /* a picture, or null for none: page: null is a flat page in the parch colour */
    Object.keys(im).forEach(function (k) { lines.push('--' + kebab(k) + '-img: ' + (im[k] === null ? 'none' : 'url(' + FR.url(im[k]) + ')')); });
    return lines.length ? 'body[data-theme="' + id + '"] {\n  ' + lines.join(';\n  ') + ';\n}\n' : '';
  };
  /* The colour a phone paints its own bars in: the pack's night colour, or the default look's, which
     the page carries in its <meta name="theme-color"> from the start. */
  var defaultNight = '';
  FR.themeColor = function (id) {
    var meta = hasDoc ? document.querySelector('meta[name="theme-color"]') : null, t = FR.THEMES[id], night = t && t.tokens && t.tokens.palette ? t.tokens.palette.night : '';
    if (meta && !defaultNight) { defaultNight = meta.getAttribute('content') || ''; }
    night = HEX.test(night || '') ? night : defaultNight;
    if (meta && night) { meta.setAttribute('content', night); }
    return night;
  };

  /* ---------- registering ---------- */
  /* What every pack file calls. `built` is added by the build: the hashes of the pack's files. */
  FR.scenario = function (def, built) {
    if (!def || typeof def.id !== 'string') { throw new Error('FR.scenario needs a pack with an id.'); }
    DEFS[def.id] = def;
    if (built && built.assets) { Object.keys(built.assets).forEach(function (k) { FR.ASSETS[k] = built.assets[k]; }); }
    if (def.id === 'base') { return def; }                       // the base is only ever worn under another pack
    delete FR.THEMES[def.id];
    /* a pack that cannot be put together (the build's checks should have caught it) is left unloaded, not allowed to stop the page */
    if (DEFS[parentOf(def) || def.id]) { try { FR.THEMES[def.id] = hydrate(def.id); } catch (e) { if (typeof console !== 'undefined') { console.error('First Roll: scenario "' + def.id + '" could not be loaded.', e); } } }
    if (hasDoc && FR.THEMES[def.id] && !document.querySelector('style[data-pack="' + def.id + '"]')) {
      var css = FR.tokensCss(def.id), st;
      if (css) { st = document.createElement('style'); st.setAttribute('data-pack', def.id); st.textContent = css; document.head.appendChild(st); }
    }
    return def;
  };
  FR.scenarioDef = function (id) { return DEFS[id] || null; };
  FR.manifest = function (m, assets) { FR.MANIFEST = m; Object.keys(assets || {}).forEach(function (k) { FR.ASSETS[k] = assets[k]; }); };
  FR.pack = function (id) { return FR.MANIFEST.packs.filter(function (p) { return p.id === id; })[0] || null; };

  /* Point the rules at a pack. Everything the app reads afterwards comes from it. */
  FR.useTheme = function (id) {
    var t = FR.THEMES[id] || (DEFS[id] && id !== 'base' ? (FR.THEMES[id] = hydrate(id)) : null) || FR.theme || FR.THEMES[FR.MANIFEST.default] || FR.THEMES[Object.keys(FR.THEMES)[0]];
    if (!t) { throw new Error('No scenario is loaded.'); }
    FR.theme = t; FR.QUESTIONS = t.questions; FR.CLASSES = t.classes; FR.RACES = t.races; FR.NAMES = t.names; FR.LOOK = t.look; FR.LOOK_LABELS = t.lookLabels;
    FR.FLOURISH = t.flourish; FR.ACTIONS = t.actions; FR.TRAIT_LABELS = t.traitLabels; FR.alignment = t.alignment; FR.localDescription = t.describe; FR.portraitSubject = t.subject;
    if (hasDoc) { FR.themeColor(t.id); }                         // the phone's own bars take the pack's night colour
    return t;
  };

  /* Play the pack's sound for a moment: 'tap', 'cheer', 'fumble' or 'arrive'. */
  FR.sfx = function (slot) {
    var S = FR.Dice && FR.Dice.Sound, names = FR.theme && FR.theme.sfx ? FR.theme.sfx[slot] : null;
    if (!S || !names) { return; }
    [].concat(names).forEach(function (n) {
      if (n === 'chime') { S.chime(true); } else if (n === 'lowchime') { S.chime(false); } else if (typeof S[n] === 'function') { S[n](); }
    });
  };

  /* ---------- fetching ---------- */
  var loading = {}, advLoading = {};
  function tag(name, attrs) {
    return new Promise(function (ok, fail) {
      var el = document.createElement(name);
      Object.keys(attrs).forEach(function (k) { el[k] = attrs[k]; });
      el.onload = function () { ok(el); };
      el.onerror = function () { el.remove(); fail(new Error('Could not load ' + (attrs.src || attrs.href) + '.')); };
      document.head.appendChild(el);
    });
  }
  var script = function (src) { return tag('script', { src: src, async: true }); };
  var sheet = function (href) { return document.querySelector('link[href="' + href + '"]') ? Promise.resolve() : tag('link', { rel: 'stylesheet', href: href }); };
  /* typefaces: asked for, waited on briefly, never allowed to hold the app up */
  function fonts(urls) {
    var all = Promise.all((urls || []).map(function (u) { return sheet(u).catch(function () { /* text falls back to a system face */ }); }));
    return Promise.race([all, new Promise(function (ok) { setTimeout(ok, 1500); })]).then(warm);
  }
  /* faces that are drawn on a canvas (the dice numerals) are asked for early, so the first roll is not set in a stand-in */
  function warm() {
    var list = get(FR.theme || {}, 'tokens.fonts.warm') || get(DEFS.base || {}, 'tokens.fonts.warm') || [];
    if (document.fonts && document.fonts.load) { list.forEach(function (f) { try { document.fonts.load(f); } catch (e) { /* older browsers */ } }); }
  }
  /* Fetch a pack (its script, its styles, its typefaces) and resolve with its theme. Loaded packs resolve at once. */
  FR.loadScenario = function (id) {
    if (FR.THEMES[id]) { return Promise.resolve(FR.THEMES[id]); }
    if (loading[id]) { return loading[id]; }
    var e = FR.pack(id);
    if (!e || !hasDoc) { return Promise.reject(new Error('There is no scenario called "' + id + '".')); }
    var parent = e.extends && e.extends !== 'base' ? FR.loadScenario(e.extends) : Promise.resolve();
    loading[id] = parent.then(function () {
      return Promise.all([script(e.js), e.css ? sheet(e.css).catch(function () { /* unstyled beats unusable */ }) : null, fonts(e.fonts)]);
    }).then(function () {
      if (!FR.THEMES[id]) { throw new Error('The scenario "' + id + '" did not load properly.'); }
      return FR.THEMES[id];
    });
    loading[id].catch(function () { delete loading[id]; });      // a later tap may try again
    return loading[id];
  };

  /* A DM adventure is data too: scenarios/<id>/adventure.js calls FR.adventure('<id>', {...}).
     Any "img/..." or "audio/..." it names is one of the pack's own files. */
  var FILE = /^(base:)?(img|audio)\/[\w.\/-]+\.[A-Za-z0-9]+$/;
  function relocate(node, fn) {
    if (!node || typeof node !== 'object') { return; }
    Object.keys(node).forEach(function (k) {
      if (typeof node[k] === 'string') { if (FILE.test(node[k])) { node[k] = fn(node[k]); } }
      else { relocate(node[k], fn); }
    });
  }
  FR.adventure = function (id, def) {
    var a = clone(def);
    relocate(a, function (p) { return FR.asset(id, p); });
    FR.ADVENTURES[id] = a;
    return a;
  };
  FR.loadAdventure = function (id) {
    if (FR.ADVENTURES[id]) { return Promise.resolve(FR.ADVENTURES[id]); }
    var e = FR.pack(id);
    if (!e || !e.adventure || !hasDoc) { return Promise.reject(new Error('The scenario "' + id + '" has no adventure.')); }
    if (!advLoading[id]) {
      advLoading[id] = script(e.adventure).then(function () {
        if (!FR.ADVENTURES[id]) { throw new Error('The adventure for "' + id + '" did not load properly.'); }
        return FR.ADVENTURES[id];
      });
      advLoading[id].catch(function () { delete advLoading[id]; });
    }
    return advLoading[id];
  };
  /* ---------- starting up ---------- */
  /* Which pack to open with: ?s=<id> in the address, else the one used last time, else the default. */
  FR.pickScenario = function (search, stored) {
    var q = /[?&]s=([A-Za-z0-9_-]+)/.exec(search || '');
    if (q && FR.pack(q[1])) { return q[1]; }
    if (stored && FR.pack(stored)) { return stored; }
    return FR.MANIFEST.default;
  };
  /* Runs before the page is drawn: names the pack on <body> so the right styles apply from the first paint,
     and starts fetching it if it is not the one written into the page. */
  FR.begin = function () {
    var stored = '', id;
    try { stored = localStorage.getItem('firstroll.theme') || ''; } catch (e) { /* no storage */ }
    id = FR.pickScenario(location.search, stored);
    document.body.setAttribute('data-theme', id);
    if (FR.THEMES[id]) { FR.useTheme(id); FR.ready = null; return; }
    FR.useTheme(FR.MANIFEST.default);                            // something to stand on while the chosen pack arrives
    document.body.setAttribute('data-loading', '');
    FR.ready = FR.loadScenario(id).then(function () { return id; }, function () { return FR.MANIFEST.default; });
  };
  /* Runs last: waits for the chosen pack, then starts the app (FR.main is the screens: app.js, table.js, dm.js). */
  FR.boot = function () {
    var start = function (id) {
      document.body.setAttribute('data-theme', id); document.body.removeAttribute('data-loading');
      FR.useTheme(id); warm(); FR.main();
    };
    if (FR.ready) { FR.ready.then(start); } else { start(FR.theme.id); }
  };
})();

if (typeof module !== 'undefined') { module.exports = FR; }
