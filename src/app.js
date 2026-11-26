/* First Roll: screens and flow. Everything a scenario can change (cast, copy, art, sounds, dice
   dressing) is read from FR.theme, which a scenario pack fills in (src/registry.js, cartridges/).
   Nothing here knows any pack by name. This file runs once the opening pack is loaded (FR.boot).

   The first part, FR.play, has no screen in it: which questions a game asks, what a set of answers
   makes, what a roll adds up to and how to say so in plain words, and how a shaken phone is told
   from a nudged one. It runs anywhere, so test/unit/play.test.js can check it without a browser. */
(function () {
  'use strict';

  /* ================= the parts with no screen in them ================= */
  var play = FR.play = {};
  var fill = play.fill = function (s, vars) {
    s = String(s === undefined || s === null ? '' : s);
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  };
  var given = function (a) { return a !== null && a !== undefined; };

  /* ---------- the questions and what they make ---------- */
  /* The questions a game asks, in order: the pack's five for a quick game, otherwise all of them. */
  play.questions = function (mode) {
    var all = FR.QUESTIONS.map(function (q, i) { return i; });
    var quick = ((FR.theme.quiz && FR.theme.quiz.quick) || []).filter(function (i) { return !!FR.QUESTIONS[i]; });
    return mode === 'quick' && quick.length ? quick.slice() : all;
  };
  /* One slot per question, null where none was asked or the answer no longer exists. */
  play.answers = function (list) {
    return FR.QUESTIONS.map(function (q, i) { var a = list ? list[i] : null; return given(a) && q.a[a] ? a : null; });
  };
  play.answered = function (answers) { return (answers || []).filter(given).length; };
  /* Which game a set of answers came from: exactly the pack's quick five, or the full quiz. */
  play.modeOf = function (answers) {
    var quick = play.questions('quick'), got = [];
    (answers || []).forEach(function (a, i) { if (given(a)) { got.push(i); } });
    return got.length < FR.QUESTIONS.length && got.length === quick.length && got.every(function (i) { return quick.indexOf(i) >= 0; }) ? 'quick' : 'full';
  };
  /* What a set of answers makes. A quick game is ranked against its own yardstick (five answers
     swing much further than twelve), and the line under the hero's name is worked out from the
     number of questions that were actually answered. How the cast is ranked, and which people a
     hero starts as, is for the cartridge's rules to say (FR.profile, src/rules.js). */
  play.outcome = function (answers, mode) {
    var a = play.answers(answers), only = mode === 'quick' ? play.questions('quick') : undefined, u = FR.tally(a), n = Math.max(1, play.answered(a));
    var rules = FR.profile(FR.theme), r = rules.rank(u, FR.theme, only), clsRank = r.classes, raceRank = r.races;
    return { answers: a, mode: mode === 'quick' ? 'quick' : 'full', u: u, answered: n, clsRank: clsRank, raceRank: raceRank, cls: clsRank[0].name, race: rules.raceFor(clsRank[0].name, raceRank, FR.theme), alignment: FR.alignment(u, n) };
  };
  /* A ready-made hero, as a finished character in the shape the app saves and takes up again. */
  play.premade = function (p) {
    return { answers: (p.answers || FR.answersFor(p.cls, p.race)).slice(), cls: p.cls, race: p.race, look: JSON.parse(JSON.stringify(p.look || {})), desc: p.desc || '',
      name: p.name, portrait: p.portrait || FR.theme.art.sample(p.cls), portraitNote: '', origin: '', originKey: '', originName: p.name };
  };

  /* ---------- a roll, as arithmetic ---------- */
  /* c is what is being rolled: { sides, count, mod, kind, why }. adv is 'normal', 'adv' or 'dis'. */
  play.usesAdv = function (c) { return c.sides === 20 && c.kind !== 'free' && c.kind !== 'damage' && c.kind !== 'table'; };
  play.spec = function (c, adv) { var n = play.usesAdv(c) && adv !== 'normal' ? 2 : c.count, out = [], i; for (i = 0; i < n; i++) { out.push(c.sides); } return out; };
  play.result = function (c, adv, v) {
    var two = play.usesAdv(c) && adv !== 'normal';
    var kept = two ? (adv === 'adv' ? Math.max.apply(null, v) : Math.min.apply(null, v)) : v.reduce(function (a, b) { return a + b; }, 0);
    return { kept: kept, total: kept + c.mod, two: two, nat: play.usesAdv(c) && (two || v.length === 1) ? kept : 0, keptIx: two ? v.indexOf(kept) : -1 };
  };
  var list = function (v, and) { return v.length < 2 ? String(v[0]) : v.slice(0, -1).join(', ') + ' ' + and + ' ' + v[v.length - 1]; };
  /* the bonus in words: "plus 4 for being sneaky", "minus 1, as this is not your strong suit", or nothing */
  play.bonus = function (mod, why, w) {
    if (!mod) { return ''; }
    if (mod < 0) { return fill(w.minus, { n: -mod }); }
    return why ? fill(w.plusFor, { n: mod, why: why }) : fill(w.plus, { n: mod });
  };
  /* The result as a sentence, for people who have never read a rulebook:
     "You rolled 19, plus 4 for being sneaky: 23." or "Rolled 9 and 17, keeping the lower: 9, plus 4 for being sneaky: 13." */
  play.sentence = function (c, adv, v, w) {
    var r = play.result(c, adv, v), b = play.bonus(c.mod, c.why, w);
    var head = r.two ? fill(w.keep, { a: v[0], b: v[1], which: adv === 'adv' ? w.higher : w.lower, kept: r.kept }) : fill(w.rolled, { dice: list(v, w.and) });
    if (b) { return head + ', ' + b + ': ' + r.total + '.'; }
    return head + (!r.two && v.length > 1 ? ': ' + r.total : '') + '.';
  };
  /* the short sum the rest of the table sees: "19 + 4", "3 + 5 + 2", "17 + 4 (best of 9 and 17)" */
  play.detail = function (c, adv, v, w) {
    var r = play.result(c, adv, v), mod = c.mod ? (c.mod > 0 ? ' + ' : ' − ') + Math.abs(c.mod) : '';
    if (c.table) { return String(c.table[r.kept - 1] || ''); }
    if (r.two) { return r.kept + mod + ' (' + (adv === 'adv' ? w.bestOf : w.worstOf) + ' ' + list(v, w.and) + ')'; }
    return v.join(' + ') + mod;
  };
  /* what FR.table.roll is handed */
  play.entry = function (c, adv, v, w) {
    var r = play.result(c, adv, v);
    return { label: c.label || c.title || '', kind: c.kind === 'table' ? 'extra' : c.kind, total: r.total, nat: r.nat === 20 || r.nat === 1 ? r.nat : 0,
      detail: play.detail(c, adv, v, w), dice: v.map(function (x) { return { sides: c.sides, value: x }; }) };
  };
  /* dice in words: "One 20-sided die", "Three 6-sided dice" */
  play.diceWords = function (n, sides, w) {
    var names = String(w.numbers || '').split(' ');
    return n === 1 ? fill(w.one, { s: sides }) : fill(w.many, { n: names[n - 1] || n, s: sides });
  };

  /* ---------- at a DM's table: the parts with no screen in them ---------- */
  /* What the DM has sent, kept in step. `held` is what this device has (oldest first), `fresh` what
     the table just sent, `pulled` the numbers the DM has taken back. Gives the list to keep, the
     items that are news, and how many went: nothing is shown twice, nothing unsent is left behind. */
  play.feed = function (held, fresh, pulled) {
    var gone = {}, last = 0, kept, news = [];
    (pulled || []).forEach(function (n) { gone[n] = true; });
    (held || []).forEach(function (f) { if (f && f.n > last) { last = f.n; } });
    kept = (held || []).filter(function (f) { return f && !gone[f.n]; });
    (fresh || []).filter(function (f) { return f && typeof f.n === 'number'; }).sort(function (a, b) { return a.n - b.n; }).forEach(function (f) {
      if (f.n > last && !gone[f.n]) { news.push(f); last = f.n; }
    });
    return { feed: kept.concat(news), fresh: news, dropped: (held || []).length - kept.length };
  };
  /* The story as one list, oldest first: each scene as the story reached it, everything the DM sent
     this seat, and this seat's own rolls for the DM once they are made.
     `rolls` is the table's roll feed: of those only the big moments are story, a natural 20 and a natural 1,
     whoever rolled them.
     Gives [{ kind: 'scene' | 'note' | 'image' | 'hero' | 'roll' | 'nat', key, at, scene | item | request | roll }]. */
  play.timeline = function (feed, requests, scenes, rolls) {
    var out = [];
    (scenes || []).forEach(function (s) { if (s) { out.push({ kind: 'scene', key: 's' + s.n, at: s.at || 0, scene: s }); } });
    (feed || []).forEach(function (f) { if (f) { out.push({ kind: f.kind === 'hero' && f.hero ? 'hero' : (f.img ? 'image' : 'note'), key: 'f' + f.n, at: f.at || 0, item: f }); } });
    (requests || []).forEach(function (q) { if (q && q.mine) { out.push({ kind: 'roll', key: 'r' + q.n, at: q.at || 0, request: q }); } });
    (rolls || []).forEach(function (r) { if (r && (r.nat === 20 || r.nat === 1)) { out.push({ kind: 'nat', key: 'n' + r.n, at: r.at || 0, roll: r }); } });
    return out.map(function (e, i) { return [e, i]; }).sort(function (a, b) { return a[0].at - b[0].at || a[1] - b[1]; }).map(function (p) { return p[0]; });
  };
  /* The roll the DM is waiting for from this seat: the oldest one still open that it has not made. */
  play.asked = function (requests) {
    return (requests || []).filter(function (q) { return q && !q.closed && !q.mine; })[0] || null;
  };
  /* What the tray rolls when the DM asks for a roll: one twenty-sided die. The skill decides the bonus
     exactly as the rows on the play screen do; with no skill, or one this hero's sheet does not
     know, it is a plain twenty-sided roll. `why(skill)` gives the reason for the bonus in the
     cartridge's words. What the bonus is belongs to the cartridge's rules (FR.profile, src/rules.js). */
  play.requestRoll = function (q, sheet, why) { return FR.profile(FR.theme).request(q, sheet, why); };
  /* "I rolled real dice": what was typed for one die, as a whole number that die can show, or null. */
  play.typed = function (text, sides) {
    var s = String(text === undefined || text === null ? '' : text).trim(), n;
    if (!/^\d{1,4}$/.test(s)) { return null; }
    n = parseInt(s, 10);
    return n >= 1 && n <= sides ? n : null;
  };
  /* Every die of a roll at once: the values in order, or null if any one of them cannot be right. */
  play.typedAll = function (texts, sides) {
    var out = (sides || []).map(function (sd, i) { return play.typed((texts || [])[i], sd); });
    return out.length && out.every(given) ? out : null;
  };
  /* Health in three plain states. Fine: more than half is left. In trouble: a quarter or less.
     `healthAt` is where marking a state puts the number, so the two always agree. */
  play.health = function (now, max) {
    if (!(max > 0) || !given(now)) { return 'fine'; }
    return now * 2 > max ? 'fine' : (now * 4 > max ? 'hurt' : 'trouble');
  };
  play.healthAt = function (state, max) {
    return state === 'trouble' ? Math.floor(max / 4) : (state === 'hurt' ? Math.floor(max / 2) : max);
  };
  /* Armor in three plain bands, by the number an attack has to reach to hit: 'light' up to 12,
     'well' up to 15, 'heavy' above that. The screens put the cartridge's words to them. (The bands
     are the rules': FR.armorBand in src/rules.js.) */
  play.armor = function (ac) { return FR.armorBand(ac); };
  /* The tabs of the play screen, as the cartridge's rules have them, each with its label. `labels` is the
     cartridge's three (I want to…, Checks, Fight); `other` is the plain word for the middle one, used
     unless rules details are on. Gives [{ id, label }]. */
  play.tabs = function (ids, labels, other, details) {
    var all = ['do', 'checks', 'fight'];
    return (ids || all).filter(function (id) { return all.indexOf(id) >= 0; }).map(function (id) { return { id: id, label: id === 'checks' && !details ? other : labels[all.indexOf(id)] }; });
  };

  /* ---------- the shared table (docs/PHASE2.md, section 4): the parts with no screen in them ---------- */
  /* The heroes a bond can be made with: every seat but this one that has a hero.
     Gives [{ id, name (the hero's), player (who plays them), cls, portrait }]. */
  play.bondChoices = function (players, me) {
    return (players || []).filter(function (p) { return !!p && p.id !== me && !!p.char && !!p.char.name; })
      .map(function (p) { return { id: p.id, name: p.char.name, player: p.name || '', cls: p.char.cls || '', portrait: p.portrait || '' }; });
  };
  /* the cartridge's questions about another hero, with that hero's name in them */
  play.bondPrompts = function (bonds, name) {
    return (bonds || []).filter(function (b) { return typeof b === 'string' && b !== ''; }).map(function (b) { return b.split('{name}').join(name); });
  };
  /* The personal stakes to offer a hero: the ones written for their role first, then the ones for anyone,
     three at most (`max`). `turn` starts the for-anyone ones at a different place for each hero, so a
     table of six is not all offered the same pair. A hook for other roles is never offered. */
  play.hookChoices = function (hooks, role, turn, max) {
    var fits = (hooks || []).filter(function (h) { return !!h && !!h.id && !!h.text && (!(h.roles || []).length || (!!role && h.roles.indexOf(role) >= 0)); });
    var own = fits.filter(function (h) { return (h.roles || []).length > 0; }), any = fits.filter(function (h) { return !(h.roles || []).length; });
    var at = any.length ? Math.abs(Math.floor(turn || 0)) % any.length : 0;
    return own.concat(any.slice(at), any.slice(0, at)).slice(0, max || 3);
  };
  /* The roles nobody at the table plays yet, in the cartridge's order. `classes` says which role each class has. */
  play.rolesMissing = function (roles, classes, players) {
    var have = {};
    (players || []).forEach(function (p) { var c = p && p.char && classes ? classes[p.char.cls] : null; if (c && c.role) { have[c.role] = true; } });
    return Object.keys(roles || {}).filter(function (r) { return !have[r]; });
  };
  /* ...said in one line: "Nobody is the Healer yet." or "Nobody is the Healer, the Scout or the Talker yet."
     Nothing is said until somebody has a hero (everything is missing then, and it is no news), or when
     every role is filled. w: { one: 'Nobody is the {role} yet.', and: ', the ', or: ' or the ' } */
  play.partyLine = function (roles, classes, players, w) {
    var m = play.rolesMissing(roles, classes, players), all = Object.keys(roles || {}).length;
    if (!m.length || m.length >= all) { return ''; }
    return fill(w.one, { role: m.length < 2 ? m[0] : m.slice(0, -1).join(w.and) + w.or + m[m.length - 1] });
  };
  /* A beat (a thunderclap, a hit) is played once: when its number is new to this device, and when the
     table fired it no more than `within` milliseconds ago by the server's own clock (five seconds unless
     told otherwise), so a phone that sits down late does not play one from ten minutes back. */
  play.beatFresh = function (beat, last, now, within) {
    if (!beat || typeof beat.n !== 'number' || !beat.kind) { return false; }
    return beat.n > (last || 0) && now - beat.at < (within || 5000);
  };
  /* how each kind of beat buzzes: milliseconds on, off, on... A kind nobody has heard of gets one plain buzz. */
  play.BUZZ = { thunder: [70, 50, 380], hit: [110], reveal: [30, 70, 30, 70, 160], bell: [50, 130, 50], crash: [220, 60, 140], hush: [25] };
  play.beatBuzz = function (kind) { return (Object.prototype.hasOwnProperty.call(play.BUZZ, kind) ? play.BUZZ[kind] : [90]).slice(); };
  /* A closed vote as bars, one for each choice in the order it was put: { label, count, share (0 to 1 of the
     votes cast), width (0 to 100: the most-picked is 100), mine (this seat's pick), top (the most-picked, or
     one of them) }. With no votes cast, every bar is empty and none is top. */
  play.voteBars = function (v) {
    var opts = (v && v.options) || [], counts = (v && v.counts) || [], total = 0, most = 0;
    var num = function (i) { var c = Math.floor(Number(counts[i])); return c > 0 ? c : 0; };
    opts.forEach(function (o, i) { total += num(i); most = Math.max(most, num(i)); });
    return opts.map(function (o, i) {
      var c = num(i);
      return { label: o, count: c, share: total ? c / total : 0, width: most ? Math.round(100 * c / most) : 0, mine: v.mine === i, top: most > 0 && c === most };
    });
  };
  /* The marks people have left on one thing in the story. A place in the story may have been published
     more than once (the DM ticks a quest, and the scene is sent again under a new number), so one thing
     can go by several names: `keys`, oldest first. Gives the counts added up, this device's own mark,
     and `on`: the name a tap should be sent under (the one this device has already marked, so the same
     mark again takes it off; otherwise the newest). */
  play.MARKS = ['cheer', 'laugh', 'gasp', 'heart', 'clap', 'wow'];
  play.marks = function (keys, reacts, reacted) {
    var out = { counts: {}, mine: '', on: (keys || [])[(keys || []).length - 1] || '' };
    (keys || []).forEach(function (k) {
      var c = (reacts && reacts[k]) || {};
      play.MARKS.forEach(function (m) { if (c[m] > 0) { out.counts[m] = (out.counts[m] || 0) + c[m]; } });
      if (reacted && reacted[k] && !out.mine) { out.mine = reacted[k]; out.on = k; }
    });
    return out;
  };
  /* Notes kept on the phone, newest first: { id, at, text, title, img, from }. `from` names the thing in
     the story a note was pinned from ('' for one the player wrote), so nothing is pinned twice. Every
     function here gives back a new list and leaves the one it was handed alone. */
  play.notes = {
    MAX: 100, LONG: 600,
    /* what was stored for a table, as a list: anything that is not a note is left out */
    read: function (json, code) {
      var k = null; try { k = JSON.parse(json || 'null'); } catch (e) { k = null; }
      if (!k || k.code !== code || !Array.isArray(k.list)) { return []; }
      return k.list.filter(function (n) { return !!n && typeof n.id === 'number' && (typeof n.text === 'string' || typeof n.title === 'string' || typeof n.img === 'string'); })
        .map(function (n) { return { id: n.id, at: Number(n.at) || 0, text: String(n.text || ''), title: String(n.title || ''), img: String(n.img || ''), from: String(n.from || '') }; }).slice(0, play.notes.MAX);
    },
    write: function (list, code) { return JSON.stringify({ code: code, list: (list || []).slice(0, play.notes.MAX) }); },
    next: function (list) { var top = 0; (list || []).forEach(function (n) { top = Math.max(top, n.id); }); return top + 1; },
    /* a note the player wrote; nothing but spaces is no note */
    add: function (list, text, now) {
      var t = String(text === undefined || text === null ? '' : text).trim().slice(0, play.notes.LONG);
      if (!t) { return (list || []).slice(); }
      return [{ id: play.notes.next(list), at: now || 0, text: t, title: '', img: '', from: '' }].concat(list || []).slice(0, play.notes.MAX);
    },
    pinned: function (list, from) { return !!from && (list || []).some(function (n) { return n.from === from; }); },
    /* a copy of something in the story: item is { from, title, text, img } */
    pin: function (list, item, now) {
      var it = item || {}, from = String(it.from || '');
      if (!from || play.notes.pinned(list, from) || !(it.title || it.text || it.img)) { return (list || []).slice(); }
      return [{ id: play.notes.next(list), at: now || 0, text: String(it.text || '').slice(0, 1200), title: String(it.title || '').slice(0, 120), img: String(it.img || ''), from: from }].concat(list || []).slice(0, play.notes.MAX);
    },
    drop: function (list, id) { return (list || []).filter(function (n) { return n.id !== id; }); },
    /* the table's run was started afresh: what was copied from the old story goes, what the player wrote stays */
    own: function (list) { return (list || []).filter(function (n) { return !n.from; }); }
  };

  /* ---------- the browser's Back button ----------
     Back takes one step back inside the app, and only leaves it from the title with nothing open.
     `backStep` says what that step is: close the dialog on top, press the screen's own way back, or
     go to a screen; null when Back should leave. st: { screen, dialogs: [{ id, close }], sheets: [ids] }. */
  var BACK = { heroes: { go: 'title' }, story: { click: 'st-back' }, quiz: { click: 'q-back' }, reveal: { go: 'title' }, portrait: { click: 'p-back' }, sheet: { click: 'sh-back' },
    play: { go: 'title' }, dice: { click: 'd-close' }, tale: { click: 'tl-back' }, connect: { click: 'c-back' }, dmgate: { go: 'title' }, dm: { click: 'dm-exit' } };
  play.backStep = function (st) {
    var d = st && st.dialogs && st.dialogs.length ? st.dialogs[st.dialogs.length - 1] : null;
    if (d) { return d.close ? { click: d.close } : { stay: d.id }; }       // a dialog with no gentle way out wants an answer: Back leaves it be
    if (st && st.sheets && st.sheets.length) { return { click: st.sheets[st.sheets.length - 1] }; }
    return (st && BACK[st.screen]) || null;
  };
  /* The history itself. The page's own entry (with its ?t= and ?s= untouched) is the bottom; while
     there is somewhere to go back to inside the app, one more entry sits on top of it, so Back comes
     to the app first. `sync(deep)` says what to do after any change: 'push' that entry, 'pop' it
     (the app got back to the title by its own buttons), or nothing. */
  play.trail = function () {
    var guard = false;
    return {
      sync: function (deep) {
        if (deep && !guard) { guard = true; return 'push'; }
        if (!deep && guard) { guard = false; return 'pop'; }
        return '';
      },
      back: function () { guard = false; },            // the browser went back to the page's own entry
      forward: function () { guard = true; },          // the browser went forward again, onto ours
      held: function () { return guard; }
    };
  };

  /* ---------- a shaken phone ----------
     Fed how hard the phone is moving (metres per second squared, gravity taken out) and when.
     A shake is a reading over the threshold, counted at most once every `gap` milliseconds, so one
     swing of the arm is one shake however many readings it gives. The first shake rattles the
     dice; the second throws them, and so does stopping after one (see `tick`). After a throw the
     phone is ignored for `cooldown` milliseconds, so the same shaking cannot throw twice. */
  play.shaker = function (opts) {
    var o = { threshold: 14, gap: 250, stop: 600, cooldown: 1400 }, s = { shakes: 0, last: -1e9, thrown: -1e9 };
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    return {
      /* one reading. Returns { rattle: 0 or how hard (0.2 to 1), throw: true when the dice should go } */
      feed: function (mag, t) {
        var out = { rattle: 0, throw: false };
        if (!(mag > o.threshold) || t - s.thrown < o.cooldown || t - s.last < o.gap) { return out; }
        s.shakes++; s.last = t;
        out.rattle = Math.max(0.2, Math.min(1, 0.35 + (mag - o.threshold) / 30));
        if (s.shakes >= 2) { s.shakes = 0; s.thrown = t; out.throw = true; }
        return out;
      },
      /* asked a little later: true if the phone was shaken once and has been still since */
      tick: function (t) {
        if (s.shakes > 0 && t - s.last >= o.stop) { s.shakes = 0; s.thrown = t; return true; }
        return false;
      },
      /* the dice have just landed (or the tray has just opened): start the quiet spell from now */
      rest: function (t) { s.shakes = 0; s.thrown = t; },
      waiting: function () { return s.shakes; },
      options: o
    };
  };

  if (typeof document === 'undefined') { return; }           // no screen here (the unit tests): the rest is the app itself

  /* ================= the app ================= */
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text !== undefined) { e.textContent = text; } return e; };
  var clear = function (node) { while (node.firstChild) { node.removeChild(node.firstChild); } };
  var app = $('app');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable: carry on without it */ } }
  };

  var TH = FR.theme;                       // the scenario the page opened with (FR.begin chose it, FR.boot loaded it)
  var tx = function (key, vars) {
    var s = TH.text[key];
    return vars && typeof s === 'string' ? fill(s, vars) : s;
  };
  var first = function (name) { return String(name || '').split(' ')[0]; };
  var cap = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  /* The rules the cartridge in play uses (FR.PROFILES in src/rules.js). The screens ask them what a bonus is,
     what the sheet shows, what a row rolls and what health is, and never assume one set of rules. */
  var rules = function () { return FR.profile(TH); };

  var S;
  function blank() {
    return { screen: 'title', mode: 'full', order: [], qi: 0, answers: [], answered: 12, u: FR.zero(), cls: null, race: null, clsRank: [], raceRank: [], look: {}, desc: '', portrait: '', portraitNote: '', portraitFrom: '', noPic: false,
      name: '', origin: '', originKey: '', originName: '', sheet: null, tab: 'do', init: null, email: '', descAuto: false, stale: false,
      hp: null,              // how much health is left, once any has been lost; null is "all of it"
      /* ties (docs/PHASE2.md): the personal stake picked from the cartridge's ({ id, text }), the voice to try (its label),
         whether the three optional steps have been offered to this hero yet, and which one-use things have been used */
      hook: null, voice: '', tied: false, used: {} };
  }
  S = blank();
  /* a new hero is about to be made: put the one in play away (the saved copy stays until the new one is ready) */
  function fresh() { var scr = S.screen; S = blank(); S.screen = scr; }
  /* How pictures and writing get made: 'server' (the Worker holds the key), 'direct' (this browser calls
     OpenAI with a key kept on this computer) or 'preview' (no AI: the pack's ready-made pictures and words). */
  /* sound effects and music have a switch each; an old 'muted' choice still counts for effects.
     `details` is "Show rules details": off unless someone asked for it. */
  var G = { live: false, mode: 'preview', muted: (store.get('firstroll.sfx') || (store.get('firstroll.muted') === '1' ? '0' : '1')) === '0', music: true, details: store.get('firstroll.details') === '1' };
  var OPENAI = { image: 'gpt-image-2', quality: 'medium', text: 'gpt-4.1-mini' };
  var hosted = !!window.claude;
  var canDirect = !hosted && (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
  var directKey = function () { return canDirect ? (store.get('firstroll.openai') || '') : ''; };
  /* Music: on for the DM and for anyone playing alone; off on a phone that has sat down at a table
     as a player, because five phones playing five tracks out of step is a mess. Once someone has
     chosen in Settings, that choice is the answer everywhere. */
  function musicWanted() {
    var said = store.get('firstroll.music'), tb = FR.table;
    if (said === '1' || said === '0') { return said === '1'; }
    if (tb && tb.isDM()) { return true; }
    return !((tb && tb.isPlayer()) || store.get('firstroll.seated') === '1');
  }
  function applyMusic() { var on = musicWanted(); if (on !== G.music) { G.music = on; FR.Music.enable(on); } }
  G.music = musicWanted();
  FR.Dice.Sound.muted = G.muted; FR.Music.enable(G.music);
  /* told: how a roll the DM asked for is going ({ state: 'hold' | 'sending' | 'wait' | 'done' | 'lost' | 'off', pass, say }).
     typed: the result on show was rolled on the real table and typed in. */
  var D = { ctx: null, adv: 'normal', values: [], rolling: false, shown: false, lucky: false, booted: false, flat: false, told: null, typed: false };

  /* "Show rules details" opens the rule book (dice names, skill names, levels, the full sheet) only where the
     cartridge's rules have one to open. Under the light rules the switch adds each bonus as a number and
     nothing else, so everything that is rule-book wording asks this, not the switch itself. */
  var jargon = function () { return G.details && rules().jargon; };
  /* A pack may mark its line under the hero's name as rule-book wording (the base pack's "Lawful Good" is):
     then it is only shown with "Show rules details" on. */
  var alignShown = function () { var q = TH.quiz && TH.quiz.alignment; return !(q && q.detailOnly && !jargon()); };
  var crestOf = function (cls) { return TH.art.crest(cls); };
  var sampleOf = function (cls) { return TH.art.sample(cls); };

  /* ---------- persistence (a convenience only), one character per scenario ---------- */
  function save() {
    if (!S.cls) { return; }
    var keep = { answers: S.answers, cls: S.cls, race: S.race, look: S.look, desc: S.desc, name: S.name, origin: S.origin, originKey: S.originKey, originName: S.originName,
      portraitNote: S.portraitNote, portrait: S.portrait && S.portrait.length < 700000 ? S.portrait : '', portraitFrom: S.portraitFrom, noPic: S.noPic, hp: S.hp,
      hook: S.hook, voice: S.voice, tied: S.tied, used: S.used };
    store.set('firstroll.v3.' + TH.id, JSON.stringify(keep));
  }
  /* the character without its picture: small enough to leave with the table (see table.js) */
  function saveBlob() {
    if (!S.cls) { return ''; }
    return JSON.stringify({ theme: TH.id, answers: S.answers, cls: S.cls, race: S.race, look: S.look, desc: S.desc, name: S.name, origin: S.origin, originKey: S.originKey, originName: S.originName, portraitNote: S.portraitNote, hp: S.hp,
      hook: S.hook, voice: S.voice, tied: S.tied, used: S.used });
  }
  /* take up a character that was left at a table: on a new phone, or in a new session */
  function restore(blob, portrait) {
    var k; try { k = JSON.parse(blob); } catch (e) { return false; }
    if (!k) { return false; }
    if (k.theme && k.theme !== TH.id && FR.pack(k.theme)) {      // made in another scenario: fetch that pack, then take the seat
      FR.loadScenario(k.theme).then(function () { applyTheme(k.theme, true); if (!sit(k, portrait)) { go('title'); } }).catch(function () { go('title'); });
      return true;
    }
    return sit(k, portrait);
  }
  function sit(k, portrait) {
    if (!FR.CLASSES[k.cls] || !FR.RACES[k.race]) { return false; }
    k.portrait = ''; k.noPic = false; fresh(); adopt(k); madeBy = 'returning'; save(); go('play');
    if (portrait) { takePortrait(portrait).then(function (got) { if (got && FR.table && FR.table.tookPortrait) { FR.table.tookPortrait(portrait); } }); }
    return true;
  }
  function load() {
    try {
      var k = JSON.parse(store.get('firstroll.v3.' + TH.id) || 'null');
      if (k && k.cls && FR.CLASSES[k.cls] && FR.RACES[k.race]) { return k; }
    } catch (e) { /* ignore */ }
    return null;
  }
  /* Every change of picture goes through here, so nothing is left believing in the old one. */
  function setPortrait(src, note) { S.portrait = src || ''; S.portraitNote = note || ''; S.portraitFrom = ''; S.stale = false; if (src) { S.noPic = false; } }
  function redraw() { if (S.screen === 'play') { renderPlay(); } else if (S.screen === 'sheet') { renderSheet(); } else if (S.screen === 'portrait') { renderEasel(); } }
  /* The seat at the table has a picture and this device has none: take the seat's. One of the pack's
     own pictures is simply pointed at; one the table stores is fetched once and kept on this device.
     Resolves with the picture taken, or '' if there was nothing to do. */
  var taking = '', badPics = {};
  function takePortrait(url) {
    if (!url || !S.cls || S.portrait || S.noPic || taking === url || badPics[url]) { return Promise.resolve(''); }
    var done = function (src) { setPortrait(src, ''); S.portraitFrom = url; save(); redraw(); return src; };
    if (url.indexOf('api/table/img') !== 0) { return Promise.resolve(done(url)); }
    taking = url;
    return fetch(url).then(function (r) { if (!r.ok) { throw new Error('gone'); } return r.blob(); }).then(function (b) {
      return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); });
    }).then(function (data) {
      taking = '';
      return !S.cls || S.portrait || S.noPic ? '' : done(data);
    }).catch(function () { taking = ''; badPics[url] = true; return ''; });      // no picture: the sheet still works
  }

  /* ---------- server ---------- */
  function fetchJson(url, body, timeout, headers) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, timeout), h = headers || {};
    if (body) { h['Content-Type'] = 'application/json'; }
    var opt = body ? { method: 'POST', headers: h, body: JSON.stringify(body), signal: ctl.signal } : { headers: h, signal: ctl.signal };
    return fetch(url, opt).then(function (r) {
      return r.json().then(function (j) {
        /* the server's own words go to the player as they are; `reason` (and anything else it sent, such as a name) is for the app to act on */
        if (!r.ok) { var m = j && j.error && (j.error.message || j.error); var e = new Error(typeof m === 'string' ? m : 'The request failed.'); e.status = r.status; e.reason = (j && j.reason) || ''; e.data = j || {}; throw e; }
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
  function setMode() {
    if (G.mode !== 'server') { G.mode = directKey() ? 'direct' : 'preview'; }
    /* a public server only paints for people sitting at a DM's table */
    G.live = G.mode === 'direct' || (G.mode === 'server' && (!G.locked || !!(FR.table && FR.table.active())));
  }
  function checkServer() {
    var info = null;
    /* One missed answer on weak wifi must not switch tables off for the evening: ask three times before
       starting without them, and after that keep asking quietly until the site answers. */
    var ask = function (left) {
      return fetchJson('api/health', null, 4000).catch(function (e) {
        if (left <= 0) { throw e; }
        return new Promise(function (ok) { setTimeout(ok, 1200); }).then(function () { return ask(left - 1); });
      });
    };
    var took = function (j) { info = j; G.mode = j && j.live ? 'server' : 'preview'; G.locked = !!(j && j.passcode); };
    var later = function () {
      var again = function () {
        if (info || document.hidden) { return; }
        fetchJson('api/health', null, 4000).then(function (j) {
          if (info) { return; }
          took(j); clearInterval(timer); setMode(); renderSettings(); if (FR.table) { FR.table.ready(info); } renderTitle();
        }).catch(function () { /* still out of reach: try again shortly */ });
      };
      var timer = setInterval(again, 15000);
      window.addEventListener('online', again); document.addEventListener('visibilitychange', again);
    };
    return ask(2).then(took).catch(function () { G.mode = 'preview'; later(); }).then(function () {
      setMode(); serverKnown = true; renderSettings();
      if (FR.table) {
        FR.table.onChange(function () {
          var was = G.live;
          setMode(); applyMusic(); renderSettings(); renderThemes(); renderTitle();
          if (was !== G.live && S.screen === 'portrait') { renderEasel(); }
          /* seated at a table: the screen stays awake, and the play screen keeps in step with the story and with what the DM asks for */
          Awake.set(FR.table.active());
          requestsChanged();
          if (S.screen === 'play') { renderGuide(); renderKit(); renderTokens(); if (Date.now() < tieUntil) { offerTies(); } }
          if (S.screen === 'sheet') { renderTies(); }
          renderAsked(); renderSpend();
          playBeat(); applyBed();
          if (seat()) { tellAnswers(seat(), seat().scene()); }
        });
        FR.table.onReset(cleanSlate);
        FR.table.ready(info);
        /* A phone that reloads mid-game (the browser dropped the tab, or the screen was locked a while) goes
           straight back to its hero at the table, so a roll the DM is waiting for is on screen at once. */
        if (FR.table.isPlayer() && S.screen === 'title' && load()) { resume(); }
      }
      renderTitle();
    });
  }

  /* ---------- numbers for the site's owner ----------
     How long a first roll took, which way people came in, where a roll started. One small post each,
     with no name, no table and no words in it (the server keeps only what docs/PHASE1.md lists), and
     never in the way: nothing waits for it and nothing is said if it does not arrive.
     data: { ms, way, n }; the cartridge in play is added here. */
  function event(name, data) {
    var d = data || {}, b = { name: String(name), cartridge: TH.id };
    if (typeof d.ms === 'number' && isFinite(d.ms)) { b.ms = Math.max(0, Math.round(d.ms)); }
    if (d.way) { b.way = String(d.way); }
    if (typeof d.n === 'number' && isFinite(d.n)) { b.n = Math.max(0, Math.round(d.n)); }
    if (location.protocol === 'file:') { return; }          // opened straight from a folder: there is no site to tell
    try { fetch('api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), keepalive: true }).catch(function () { /* not worth a word */ }); }
    catch (e) { /* not worth a word */ }
  }
  /* Parts of the app that most visits never use are fetched the first time they are wanted, not with
     the page. need('qr') resolves once the QR code maker is ready (window.qrcode); src/registry.js
     knows the files. A second call is answered by the first. */
  function need(what) { return FR.lib ? FR.lib(what) : Promise.reject(new Error('Nothing here can load "' + what + '".')); }

  /* ---------- scenarios ---------- */
  /* Switch to a pack that is already loaded. To switch to any pack in the manifest, use pickTheme. */
  function applyTheme(id, isFresh) {
    TH = FR.useTheme(id);
    document.body.setAttribute('data-theme', TH.id);
    store.set('firstroll.theme', TH.id);
    if (isFresh) { fresh(); }
    document.querySelectorAll('[data-t]').forEach(function (n) { n.textContent = tx(n.getAttribute('data-t')); });
    $('t-wordmark').src = TH.art.wordmark;
    FR.Music.use(TH.music || null);
    $('p-desc').setAttribute('placeholder', tx('descHint'));
    $('sw-name').setAttribute('placeholder', tx('nameHint'));
    $('b-surprise-t').textContent = tx('surprise');
    $('pl-menu').setAttribute('aria-label', tx('menu'));
    $('tl-back').setAttribute('aria-label', tx('back'));
    $('pl-say').setAttribute('placeholder', tx('intentHint'));
    $('b-dm').hidden = !TH.adventure;
    renderSettings(); renderThemes(); renderTitle();
    clear($('q-lean'));
    if (D.booted) { FR.Dice.clear(); FR.Dice.setScene(TH.dice, TH.art.floor); }
  }
  /* Fetch a pack if it is not here yet, then switch to it. Resolves with the pack in play afterwards. */
  var switching = '', switchP = null;
  function pickTheme(id, isFresh) {
    /* one switch at a time: whoever asks while one is under way waits for it, then asks again if it still matters */
    if (switching) { return switchP.then(function () { return pickTheme(id, isFresh); }); }
    if (id === TH.id) { return Promise.resolve(TH); }
    switching = id;
    switchP = FR.loadScenario(id).then(function () { switching = ''; applyTheme(id, isFresh !== false); return TH; }, function () { switching = ''; renderThemes(); return TH; });
    return switchP;
  }
  /* The picker lists every public pack in the manifest the build wrote into the page. A device that is
     seated at a table does not get one: the table owns the scenario. */
  function renderThemes() {
    var box = $('themes'), list = FR.MANIFEST.packs.filter(function (p) { return p.visibility === 'public'; });
    clear(box); box.hidden = list.length < 2 || !!(FR.table && FR.table.active());
    list.forEach(function (p) {
      var b = el('button', 'theme-card' + (p.id === TH.id ? ' on' : '')), img = el('img'), s = el('span');
      b.type = 'button'; b.setAttribute('aria-pressed', p.id === TH.id ? 'true' : 'false');
      img.src = p.thumb; img.alt = ''; b.appendChild(img);
      s.appendChild(el('b', '', p.name)); s.appendChild(el('small', '', p.blurb)); b.appendChild(s);
      b.addEventListener('click', function () { if (p.id !== TH.id && !switching) { b.setAttribute('aria-busy', 'true'); pickTheme(p.id, true); } });
      box.appendChild(b);
    });
  }

  /* ---------- one toast for the whole app: it sits above every screen and every dialog ---------- */
  var toastT = 0;
  function toast(msg) {
    var t = $('toast');
    t.hidden = true; void t.offsetWidth;          // so a second message drops in afresh
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3600);
  }

  /* ---------- dialogs: one small helper ----------
     Every pop-up is a .handout that is opened by clearing `hidden` and closed by setting it. This
     watches for exactly that, so no dialog has to remember the rules: while one is open, Tab stays
     inside it and Escape presses its way out (the button marked data-close); when it opens, focus
     moves into it; when the last one closes, focus goes back to whatever opened it. */
  var Dlg = (function () {
    var opener = null;
    var CAN = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';
    var top = function () { var all = app.querySelectorAll('.handout:not([hidden])'); return all.length ? all[all.length - 1] : null; };
    var seen = function (n) { return !n.disabled && !n.hidden && n.getClientRects().length > 0; };
    var stops = function (box) { return Array.prototype.filter.call(box.querySelectorAll(CAN), seen); };
    document.addEventListener('focusin', function (e) {
      var t = top();
      if (!t) { opener = e.target; } else if (!t.contains(e.target)) { var f = stops(t); if (f.length) { f[0].focus(); } }
    });
    /* some browsers do not focus a button when it is tapped, so the tap itself is remembered too */
    document.addEventListener('pointerdown', function (e) { var b = !top() && e.target.closest ? e.target.closest('button, a, input, textarea') : null; if (b) { opener = b; } }, true);
    document.addEventListener('keydown', function (e) {
      var t = top(), f, i, x;
      if (!t) { return; }
      if (e.key === 'Escape') { x = t.querySelector('[data-close]'); if (x && seen(x)) { e.preventDefault(); x.click(); } return; }
      if (e.key !== 'Tab') { return; }
      f = stops(t); i = f.indexOf(document.activeElement);
      if (!f.length) { e.preventDefault(); return; }
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    });
    if (window.MutationObserver) {
      new MutationObserver(function (changes) {
        changes.forEach(function (m) {
          var n = m.target, f;
          if (!n.classList || !n.classList.contains('handout')) { return; }
          if (!n.hidden) { if (n === top() && !n.contains(document.activeElement)) { f = stops(n); if (f.length) { f[0].focus(); } } }
          else if (!top() && opener && document.contains(opener) && seen(opener)) { opener.focus(); }
        });
      }).observe(app, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    }
    return {
      open: top,
      /* a new screen: move focus to its heading, so a keyboard or a screen reader starts where the eye does */
      land: function (name) {
        var s = $('s-' + name), h = s && s.querySelector('[data-h], h1, h2, .bar-title, .tray-title, .dm-title');
        if (!h || top()) { return; }
        if (!h.hasAttribute('tabindex')) { h.setAttribute('tabindex', '-1'); }
        try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
      }
    };
  })();
  /* "Are you sure?" and "this just happened": one dialog for both.
     o: { kicker, img, title, text, yes, no, onYes, onNo }. With no `no`, it is a notice with one button. */
  function ask(o) {
    var y = $('ask-yes'), n = $('ask-no'), shut = function (fn) { return function () { $('ask').hidden = true; if (fn) { fn(); } }; };
    $('ask-k').textContent = o.kicker || ''; $('ask-k').hidden = !o.kicker;
    $('ask-img').hidden = !o.img; if (o.img) { $('ask-img').src = o.img; } else { $('ask-img').removeAttribute('src'); }
    $('ask-title').textContent = o.title || '';
    $('ask-text').textContent = o.text || ''; $('ask-text').hidden = !o.text;
    y.textContent = o.yes || tx('ok'); y.onclick = shut(o.onYes);
    n.textContent = o.no || ''; n.hidden = !o.no; n.onclick = shut(o.onNo);
    /* Escape takes the gentle way out: "no" when there is one */
    if (o.no) { n.setAttribute('data-close', ''); y.removeAttribute('data-close'); } else { y.setAttribute('data-close', ''); n.removeAttribute('data-close'); }
    $('ask').hidden = false; y.focus();
  }

  /* ---------- navigation ---------- */
  var enter = {};
  function go(name) {
    if (S.screen === 'dice' && name !== 'dice') { leaveTray(); }
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('on', s.id === 's-' + name); });
    app.setAttribute('data-screen', name); S.screen = name;
    /* The table art is only fetched once there is a hero to sit at the table (src/css/play.css holds it back
       until then), and the QR code maker only when somebody opens the DM's door: the title asks for neither. */
    if (WITH_ART.indexOf(name) >= 0) { app.setAttribute('data-art', ''); }
    if (name === 'dmgate' || name === 'dm') { need('qr').then(function () { if (FR.table) { FR.table.nudge(); } }, function () { /* no QR code: the link and the code still work */ }); }
    visited(name);
    if (enter[name]) { enter[name](); }
    if (S.screen !== name) { return; }           // entering it led straight on to another screen, which has done the rest
    tune();
    Dlg.land(name);
    renderAsked(); Trail.sync();
  }
  var WITH_ART = ['heroes', 'reveal', 'portrait', 'sheet', 'play', 'dice', 'tale'];
  /* a number for the site's owner: each screen, the first time it is opened on this visit */
  var beenTo = {};
  function visited(name) { if (!beenTo[name]) { beenTo[name] = true; event('screen', { way: name }); } }
  /* ---------- the browser's Back button ----------
     Back takes one step back inside the app (the tray closes, a dialog closes, the play screen goes to
     the title) and only leaves from the title with nothing open. What a step is and how the history
     is kept are FR.play.backStep and FR.play.trail; this is the part that touches the browser. The
     address never changes, so a table link (?t=) or a scenario link (?s=) stays exactly as it came. */
  var Trail = (function () {
    var trail = play.trail(), ours = false, timer = 0;
    var dialogs = function () {
      return Array.prototype.map.call(app.querySelectorAll('.handout:not([hidden])'), function (d) { var x = d.querySelector('[data-close]'); return { id: d.id, close: x && x.id && !x.hidden && !x.disabled ? x.id : '' }; });
    };
    /* the DM's own sheets (src/dm.js): each is closed by pressing its own way out */
    var sheets = function () { var out = []; if ($('dm-sheet') && !$('dm-sheet').hidden) { out.push('dm-sheet-x'); } if ($('dm-confirm') && !$('dm-confirm').hidden) { out.push('dm-confirm'); } if ($('dm-dialog') && !$('dm-dialog').hidden) { out.push('dm-dialog-x'); } return out; };
    var deep = function () { return S.screen !== 'title' || dialogs().length > 0 || sheets().length > 0; };
    function sync() {
      var act = trail.sync(deep());
      try {
        if (act === 'push') { history.pushState({ fr: 1 }, ''); }
        else if (act === 'pop') { ours = true; history.back(); }
      } catch (e) { ours = false; }                // a page with no history to keep (some embedded views): Back is simply the browser's
    }
    function step() {
      var st = play.backStep({ screen: S.screen, dialogs: dialogs(), sheets: sheets() }), b;
      if (!st) { return; }
      if (st.click) { b = $(st.click); if (b) { b.click(); } }
      else if (st.go) { go(st.go); }
    }
    window.addEventListener('popstate', function (e) {
      if (ours) { ours = false; return; }                                            // our own tidying-up, not a press of Back
      if (e.state && e.state.fr === 1) { trail.forward(); sync(); return; }          // Forward, onto our entry again
      trail.back(); step(); sync();
    });
    try { if (history.state && history.state.fr === 1) { trail.forward(); } } catch (e) { /* no history */ }      // reloaded while our entry was on top
    /* a dialog opening or closing changes whether there is anywhere to go back to */
    if (window.MutationObserver) {
      new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(sync, 0); }).observe(app, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    }
    return { sync: sync, held: function () { return trail.held(); } };
  })();

  /* ---------- keeping the screen awake at a table ----------
     A phone that dims and locks between turns is a phone that misses the DM's next roll. While this
     device is seated at a table the screen is asked to stay on; the browser lets go of that whenever
     the page is hidden, so it is asked for again when the page comes back. Where the browser has no
     such thing, or says no, nothing happens and nothing is said. */
  var Awake = (function () {
    var lock = null, want = false, asking = false;
    function take() {
      if (!want || lock || asking || document.hidden || !navigator.wakeLock || !navigator.wakeLock.request) { return; }
      asking = true;
      try {
        navigator.wakeLock.request('screen').then(function (l) {
          asking = false; lock = l;
          l.addEventListener('release', function () { if (lock === l) { lock = null; } });
          if (!want) { drop(); }
        }, function () { asking = false; });
      } catch (e) { asking = false; }
    }
    function drop() { var l = lock; lock = null; if (l) { try { l.release().catch(function () { /* already gone */ }); } catch (e) { /* already gone */ } } }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { take(); } });
    return { set: function (on) { want = !!on; if (want) { take(); } else { drop(); } }, take: take, wanted: function () { return want; }, held: function () { return !!lock; } };
  })();

  /* which music fits where the player is: the way in, the game itself, or a fight */
  function tune() {
    if (bed && bed.music) { FR.Music.scene(''); return; }      // the DM's soundscape for this scene is a piece of music: it plays alone
    var s = S.screen, rolling = s === 'dice' && D && D.ctx, k = rolling ? D.ctx.kind : '';
    var fight = (s === 'play' && S.tab === 'fight') || (rolling && (k === 'attack' || k === 'damage' || k === 'init' || S.tab === 'fight'));
    FR.Music.scene(fight ? 'fight' : (s === 'title' || s === 'heroes' || s === 'story' || s === 'dmgate' || s === 'connect' ? 'intro' : 'game'));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-back]') : null;
    if (b) { go(b.getAttribute('data-back')); }
  });
  document.addEventListener('pointerdown', function (e) {
    FR.Dice.Sound.unlock(); FR.Music.unlock(); Awake.take();
    if (e.target.closest && e.target.closest('.btn, .ans, .chip, .row, .tab, .icon, .theme-card, .seg button, .rail-dice button, .stepper button, .switch, .tablechip, .pre-card, .tile, .shake')) { FR.sfx('tap'); }
  });

  /* ---------- 1. title: three ways in, or straight back to where you were ---------- */
  var mainDo = null, wayDo = [null, null];
  /* how the hero in play came to be: 'quick', 'full' (the questions), 'premade' (a ready-made one) or 'returning' (one made on an earlier visit) */
  var madeBy = 'returning';
  function resume() { var k = load(); if (k) { fresh(); adopt(k); madeBy = 'returning'; go('play'); } }
  function renderTitle() {
    var k = load(), tb = FR.table, can = !!(tb && tb.can()), dmSeat = !!(tb && tb.isDM()), mine = !!(tb && tb.isPlayer()), inv = tb && tb.invite ? tb.invite() : '';
    /* the table, in one chip: an invitation waiting, the table this device is at, or the way to join one */
    var chip = $('t-table');
    chip.hidden = !can || dmSeat;
    chip.textContent = mine ? tx('atTable', { code: tb.code() }) : (inv ? tx('invited', { code: inv }) : tx('joinTable'));
    chip.classList.toggle('quiet', !mine && !inv);
    /* The first button is the way straight back in when there is one: the DM's table, or the hero
       already made. Someone new gets the three ways to start. */
    var acts = [];
    if (dmSeat) { acts.push([tx('dmBack', { code: tb.code() }), function () { $('b-dm').click(); }]); }
    if (k) { acts.push([tx('continueAs', { name: first(k.name) }), resume]); acts.push([tx('newHero'), openWays]); }
    else { acts.push([tx('quickStart'), function () { startGame('quick'); }]); acts.push([tx('fullQuiz'), function () { startGame('full'); }]); acts.push([tx('premade'), function () { go('heroes'); }]); }
    if (acts.length > 3) { acts = [acts[0], acts[1], [tx('newHero'), openWays]]; }
    $('t-begin').hidden = !!k || dmSeat;                          // the invitation belongs with the ways to start
    $('b-main').textContent = acts[0][0]; mainDo = acts[0][1];
    [$('b-way-a'), $('b-way-b')].forEach(function (b, i) { var a = acts[i + 1]; b.hidden = !a; b.textContent = a ? a[0] : ''; wayDo[i] = a ? a[1] : null; });
    $('b-dm').hidden = !TH.adventure || dmSeat;
  }
  enter.title = renderTitle;
  $('b-main').addEventListener('click', function () { if (mainDo) { mainDo(); } });
  $('b-way-a').addEventListener('click', function () { if (wayDo[0]) { wayDo[0](); } });
  $('b-way-b').addEventListener('click', function () { if (wayDo[1]) { wayDo[1](); } });
  $('t-table').addEventListener('click', function () { if (FR.table) { FR.table.switcher(); } });
  /* Starting over when there is already a hero: the same three ways, with a plain word about what happens to the old one. */
  function openWays() {
    var k = load() || (S.cls ? S : null);
    $('ways-note').hidden = !k; $('ways-note').textContent = k ? tx('waysReplace', { name: first(k.name) }) : '';
    $('w-x').textContent = k ? tx('keepHero', { name: first(k.name) }) : tx('close');
    $('ways').hidden = false; $('w-quick').focus();
  }
  $('w-quick').addEventListener('click', function () { $('ways').hidden = true; startGame('quick'); });
  $('w-full').addEventListener('click', function () { $('ways').hidden = true; startGame('full'); });
  $('w-premade').addEventListener('click', function () { $('ways').hidden = true; go('heroes'); });
  $('w-x').addEventListener('click', function () { $('ways').hidden = true; });
  function adopt(k) {
    var o = play.outcome(k.answers, play.modeOf(play.answers(k.answers)));
    S.answers = o.answers; S.mode = o.mode; S.answered = o.answered; S.u = o.u; S.clsRank = o.clsRank; S.raceRank = o.raceRank;
    S.cls = k.cls; S.race = k.race; S.look = k.look || {}; S.desc = k.desc || '';
    S.name = k.name || FR.rollName(S.race, S.look.body); S.origin = k.origin || ''; S.originKey = k.originKey || ''; S.originName = k.originName || S.name;
    S.portrait = k.portrait || ''; S.portraitNote = k.portraitNote || ''; S.portraitFrom = k.portraitFrom || ''; S.noPic = !!k.noPic; buildSheet();
    S.hp = typeof k.hp === 'number' && k.hp >= 0 && k.hp < healthMax() ? Math.floor(k.hp) : null;
    S.hook = k.hook && typeof k.hook.id === 'string' && typeof k.hook.text === 'string' ? { id: k.hook.id, text: k.hook.text } : null;
    S.voice = typeof k.voice === 'string' ? k.voice : ''; S.tied = !!k.tied;
    S.used = {}; Object.keys(k.used && typeof k.used === 'object' ? k.used : {}).forEach(function (id) { if (k.used[id] === true) { S.used[id] = true; } });
  }
  /* One of the cartridge's ready-made heroes, by name, becomes this player's hero and they are playing:
     what "Take this hero" does when the DM offers one. False when the cartridge has no hero of that name. */
  function takeHero(name) {
    var want = String(name || '').trim().toLowerCase(), p = TH.roster.premades.filter(function (x) { return x.name.toLowerCase() === want; })[0];
    if (!p) { return false; }
    document.querySelectorAll('#app .handout:not([hidden])').forEach(function (d) { d.hidden = true; });      // whatever was open belongs to the hero being put away
    fresh(); adopt(play.premade(p)); madeBy = 'premade'; save(); go('play');
    return true;
  }
  /* The job a class does at the table, in the cartridge's plain words (its role), or '' when it has none. */
  var roleOf = function (cls) { var c = FR.CLASSES[cls]; return c && c.role && TH.roles && TH.roles[c.role] ? c.role : ''; };
  /* Ready-made heroes: tap one and you are playing. They are gathered under the job each one does (the
     cartridge's roles, in its order), so someone choosing reads "Protector: you stand in front" before
     any class name. At a table, a job nobody has taken yet says so. */
  enter.heroes = function () {
    var box = $('heroes'), roles = TH.roles || {}, t = seat(), groups = [];
    var lacking = t && t.players().some(function (p) { return p.char && p.char.cls; }) ? play.rolesMissing(roles, FR.CLASSES, t.players()) : [];
    clear(box);
    Object.keys(roles).forEach(function (r) { var l = TH.roster.premades.filter(function (p) { return roleOf(p.cls) === r; }); if (l.length) { groups.push([r, l]); } });
    var rest = TH.roster.premades.filter(function (p) { return !roleOf(p.cls); });
    if (rest.length) { groups.push(['', rest]); }
    groups.forEach(function (g) {
      if (g[0]) {
        var head = el('div', 'ply-role-h');
        head.appendChild(el('h3', '', g[0])); head.appendChild(el('p', '', roles[g[0]].blurb || ''));
        if (lacking.indexOf(g[0]) >= 0) { head.appendChild(el('small', '', tx('roleNeeded'))); }
        box.appendChild(head);
      }
      g[1].forEach(function (p) {
        var b = el('button', 'pre-card'), img = el('img'), txt = el('span', 'pre-t');
        b.type = 'button'; img.src = p.portrait; img.alt = ''; img.loading = 'lazy';
        txt.appendChild(el('b', '', p.name)); txt.appendChild(el('small', '', p.race + ' ' + p.cls)); txt.appendChild(el('span', '', FR.CLASSES[p.cls].blurb));
        b.appendChild(img); b.appendChild(txt);
        b.addEventListener('click', function () { fresh(); adopt(play.premade(p)); madeBy = 'premade'; save(); go('play'); });
        box.appendChild(b);
      });
    });
  };

  /* ---------- 2. the story so far (before the full quiz, or later from the menu) ---------- */
  var story = { i: 0, then: 'quiz' };
  /* A new hero by the questions. The quick game goes straight to them; the full one tells the story first. */
  function startGame(mode) {
    fresh(); S.mode = mode === 'quick' ? 'quick' : 'full'; madeBy = S.mode;
    if (S.mode === 'full' && TH.story && TH.story.length) { story.i = 0; story.then = 'quiz'; renderStory(); go('story'); } else { startQuiz(); }
  }
  function renderStory() {
    var beats = TH.story, b = beats[story.i], img = $('st-img'), dots = $('st-dots'), last = story.i === beats.length - 1;
    img.classList.remove('swap'); void img.offsetWidth; img.src = b.img; img.alt = b.alt; img.classList.add('swap');
    $('st-text').textContent = b.text;
    $('st-next').textContent = !last ? tx('storyNext') : (story.then === 'quiz' ? tx('storyGo') : tx('storyBack'));
    $('st-skip').textContent = story.then === 'quiz' ? tx('storySkip') : tx('storyBack');
    clear(dots);
    beats.forEach(function (x, i) { dots.appendChild(el('i', i <= story.i ? 'on' : '')); });
    if (!last) { var pre = new Image(); pre.src = beats[story.i + 1].img; }
  }
  var storyDone = function () { if (story.then === 'quiz') { startQuiz(); } else { go(S.cls ? 'play' : 'title'); } };
  $('st-next').addEventListener('click', function () { if (story.i < TH.story.length - 1) { story.i++; renderStory(); } else { storyDone(); } });
  $('st-back').addEventListener('click', function () { if (story.i > 0) { story.i--; renderStory(); } else if (story.then === 'quiz') { go('title'); } else { storyDone(); } });
  $('st-skip').addEventListener('click', storyDone);

  /* ---------- 3. quiz ---------- */
  var busy = false;
  function startQuiz() { S.order = play.questions(S.mode); S.qi = 0; S.answers = play.answers([]); S.u = FR.zero(); renderQ(); go('quiz'); }
  function renderQ() {
    var n = S.order.length, at = S.order[S.qi], q = FR.QUESTIONS[at], pips = $('q-pips'), box = $('q-answers'), i;
    clear(pips);
    for (i = 0; i < n; i++) { pips.appendChild(el('i', i < S.qi ? 'done' : (i === S.qi ? 'now' : ''))); }
    /* the pack's own counter (some count in roman numerals) with rules details on; plain numbers otherwise */
    $('q-count').textContent = jargon() ? TH.count(S.qi, n) : fill((TH.quiz.count && TH.quiz.count.text) || '{i} of {n}', { i: S.qi + 1, n: n });
    $('q-text').textContent = q.q;
    clear(box);
    q.a.forEach(function (a, ai) {
      var b = el('button', 'ans' + (S.answers[at] === ai ? ' on' : ''), a.t); b.type = 'button';
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
    busy = true; S.answers[S.order[S.qi]] = ai; FR.Dice.Sound.step(S.qi);
    Array.prototype.forEach.call($('q-answers').children, function (c) { c.classList.toggle('on', c === btn); });
    renderLean();
    setTimeout(function () {
      busy = false;
      if (S.screen !== 'quiz') { return; }
      if (S.qi < S.order.length - 1) { turn(function () { S.qi++; renderQ(); }); }
      else { score(); showReveal(true); }
    }, 420);
  }
  $('q-back').addEventListener('click', function () {
    if (busy) { return; }
    if (S.qi > 0) { turn(function () { S.qi--; renderQ(); }); }
    else if (S.mode === 'full' && TH.story && TH.story.length) { story.i = TH.story.length - 1; story.then = 'quiz'; renderStory(); go('story'); }
    else { go('title'); }
  });

  /* ---------- 4. reveal ---------- */
  /* the answers so far, turned into a hero: the closest class and race, and how close the others came */
  function score() {
    var o = play.outcome(S.answers, S.mode);
    S.u = o.u; S.answered = o.answered; S.clsRank = o.clsRank; S.raceRank = o.raceRank; S.cls = o.cls; S.race = o.race;
  }
  var cheer = function () { FR.sfx('cheer'); };
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
    var cls = FR.CLASSES[S.cls], n = S.answered || 1, keys = Object.keys(FR.TRAIT_LABELS);
    if (!S.name) { S.name = FR.rollName(S.race, S.look.body); }       // a name to go by, so "Looks good" is all it takes
    $('r-crest').src = crestOf(S.cls); $('r-crest').alt = S.cls + ' badge';
    $('r-title').textContent = S.race + ' ' + S.cls;
    /* the job this hero does, in plain words, ahead of the class */
    var role = roleOf(S.cls);
    $('r-role').hidden = !role; $('r-role-n').textContent = role; $('r-role-b').textContent = role ? TH.roles[role].blurb || '' : '';
    $('r-sub').textContent = alignShown() ? FR.alignment(S.u, n) : ''; $('r-sub').hidden = !alignShown();
    $('r-name').textContent = tx('goesBy', { name: S.name });
    $('r-blurb').textContent = cls.blurb;
    $('b-to-portrait').textContent = G.live ? tx('paintMine') : tx('makeMine');
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
    /* `sub` gives the small line above a chip's name: for a class, the job it does. The closest three are
       offered, with how closely each fits; `all` offers every one instead, for a choice the answers have no
       say in (a people under the light rules), and those carry no number. */
    var chips = function (box, ranks, cur, set, sub, all) {
      clear(box);
      var top = all ? ranks.slice() : ranks.slice(0, 3);
      if (!top.some(function (r) { return r.name === cur; })) { top[2] = ranks.filter(function (r) { return r.name === cur; })[0]; }
      top.forEach(function (r) {
        var c = el('button', 'chip' + (sub ? ' ply-chip' : '') + (r.name === cur ? ' on' : '')), line = sub ? el('span') : c; c.type = 'button'; c.setAttribute('aria-pressed', r.name === cur ? 'true' : 'false');
        if (sub) { if (sub(r.name)) { c.appendChild(el('i', '', sub(r.name))); } c.appendChild(line); }
        line.appendChild(document.createTextNode(r.name)); if (typeof r.pct === 'number') { line.appendChild(el('small', '', r.pct + '%')); }
        c.addEventListener('click', function () { set(r.name); setPortrait('', ''); S.noPic = false; S.origin = ''; S.name = ''; renderReveal(); save(); });
        box.appendChild(c);
      });
    };
    /* where a hero's people goes with their class (the light rules), another class brings its own people along */
    var byClass = rules().people === 'class', perk = FR.RACES[S.race].perk;
    chips($('r-classes'), S.clsRank, S.cls, function (v) { S.cls = v; if (byClass) { S.race = rules().raceFor(v, S.raceRank, TH); } }, Object.keys(TH.roles || {}).length ? roleOf : null);
    chips($('r-races'), S.raceRank, S.race, function (v) { S.race = v; }, null, byClass);
    $('r-note').textContent = rules().say(TH, 'matchNote') || tx('matchNote');         // where a people carries no number, the line says so
    $('r-perk').hidden = !perk; $('r-perk').textContent = perk ? tx('asA') + S.race + ': ' + perk : '';
  }
  /* "Looks good": a fitting ready-made picture and the suggested name, and straight to the game.
     Both can be changed later from the sheet. */
  $('b-looks').addEventListener('click', function () {
    if (!S.portrait && !S.noPic) { setPortrait(sampleOf(S.cls), ''); }
    buildSheet(); save(); go('play');
  });
  $('b-retake').addEventListener('click', function () {
    ask({ title: tx('retakeTitle'), text: tx('retakeText'), yes: tx('retake'), no: tx('keepThis'), onYes: function () { var m = S.mode; fresh(); S.mode = m; startQuiz(); } });
  });
  var portraitFrom = 'reveal', sheetFrom = 'portrait';
  $('b-to-portrait').addEventListener('click', function () { portraitFrom = 'reveal'; go('portrait'); });

  /* ---------- 5. the picture ----------
     With AI pictures on, this is a studio: pick features, describe, paint. Without, it is a wall of
     the pack's ready-made pictures to choose from, and nothing on it pretends to be more. */
  var character = function () { return { cls: S.cls, race: S.race, look: S.look, desc: S.desc, name: S.name }; };
  var topTraits = function () { return Object.keys(FR.TRAIT_LABELS).sort(function (a, b) { return S.u[b] - S.u[a]; }); };
  var summary = function () {
    var l = S.look, bits = [l.body && l.body !== 'Neither' ? l.body.toLowerCase() : '', S.race, S.cls].filter(Boolean).join(' ');
    var extra = ['age', 'build', 'hair', 'mark', 'bearing'].map(function (k) { return l[k] ? FR.LOOK_LABELS[k].toLowerCase() + ': ' + l[k].toLowerCase() : ''; }).filter(Boolean).join(', ');
    var top = topTraits().slice(0, 2).map(function (k) { return FR.TRAIT_LABELS[k].toLowerCase(); }).join(' and ');
    return (S.name ? S.name + ', a ' : 'A ') + bits + (extra ? '; ' + extra : '') + '; ' + FR.alignment(S.u, S.answered || 12).toLowerCase() + '; strongest in ' + top;
  };
  var painting = false, workTimer = 0;
  var fitDesc = function () { var t = $('p-desc'); t.style.height = 'auto'; t.style.height = Math.max(92, t.scrollHeight + 2) + 'px'; };
  enter.portrait = function () {
    $('p-title').textContent = S.race + ' ' + S.cls;
    $('p-crest').src = crestOf(S.cls);
    $('p-desc').value = S.desc;
    renderLook(); renderGallery(); renderEasel(); setTimeout(fitDesc, 30);
  };
  $('p-back').addEventListener('click', function () { go(portraitFrom); });
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
  /* the pack's ready-made pictures, the one for this hero's class first, and "no picture" last */
  function renderGallery() {
    var box = $('p-gallery'), names = Object.keys(FR.CLASSES).filter(function (c) { return c !== S.cls; });
    clear(box);
    [S.cls].concat(names).forEach(function (c) {
      var src = sampleOf(c), b = el('button', 'tile' + (S.portrait === src ? ' on' : '')), img = el('img');
      b.type = 'button'; b.setAttribute('aria-pressed', S.portrait === src ? 'true' : 'false'); b.setAttribute('aria-label', tx('pictureOf', { race: TH.samples[c] || '', cls: c }));
      img.src = src; img.alt = ''; img.loading = 'lazy'; b.appendChild(img);
      b.addEventListener('click', function () { setPortrait(src, ''); save(); renderGallery(); renderEasel(); tableSync(); });
      box.appendChild(b);
    });
    var none = el('button', 'tile none' + (!S.portrait && S.noPic ? ' on' : '')), badge = el('img');
    none.type = 'button'; none.setAttribute('aria-pressed', !S.portrait && S.noPic ? 'true' : 'false');
    badge.src = crestOf(S.cls); badge.alt = ''; none.appendChild(badge); none.appendChild(el('span', '', tx('noPicture')));
    /* the one deliberate way to have no picture: the table is told to take its copy down too */
    none.addEventListener('click', function () { setPortrait('', ''); S.noPic = true; save(); renderGallery(); renderEasel(); tableSync(); });
    box.appendChild(none);
  }
  /* A choice changed: an auto-written description no longer fits, and any picture is out of date. */
  function touched() {
    if (S.descAuto) { S.desc = ''; S.descAuto = false; $('p-desc').value = ''; fitDesc(); }
    if (S.portrait) { S.stale = true; }
    renderEasel();
  }
  function renderEasel() {
    var has = !!S.portrait, live = G.live, ready = has && S.portrait.indexOf('data:') !== 0;      // ready: one of the pack's own pictures, not one painted for this hero
    $('p-img').hidden = !has || painting; $('p-empty').hidden = has || painting; $('p-work').hidden = !painting;
    if (has) { $('p-img').src = S.portrait; $('p-img').alt = 'Picture of your ' + S.race + ' ' + S.cls; }
    $('p-src').textContent = painting ? '' : (!live ? tx('pickHint') : (has && !ready ? (S.stale ? tx('stale') + ' ' : '') + S.portraitNote : tx('hintLive')));
    /* the features and the description only steer the painter, so they are only here when there is one */
    ['p-groups', 'p-desc-lbl', 'p-desc', 'b-surprise'].forEach(function (id) { $(id).hidden = !live; });
    $('p-gallery').hidden = live || painting;
    var paint = $('b-paint'), keep = $('b-keep'), keepFirst = !live || (has && !ready);          // once there is a picture of your own, keeping it is the main thing to do
    paint.hidden = !live; paint.disabled = painting;
    paint.textContent = painting ? tx('painting') : (has && !ready ? tx('paintAgain') : tx('paint'));
    keep.hidden = painting; keep.textContent = has ? tx('keep') : (S.noPic ? tx('keepNone') : tx('skip'));
    keep.className = keepFirst ? 'btn wax' : 'btn ghost slim'; paint.className = keepFirst ? 'btn ghost slim' : 'btn wax';
    keep.style.order = keepFirst ? '-1' : '';
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
    if (painting || !G.live) { return; }
    var lines = tx('work'), li = 0;
    painting = true; $('p-err').hidden = true; $('p-work-text').textContent = lines[0]; renderEasel();
    workTimer = setInterval(function () { li = Math.min(lines.length - 1, li + 1); $('p-work-text').textContent = lines[li]; }, 5200);
    var finish = function (src, note) { clearInterval(workTimer); painting = false; setPortrait(src, note); renderEasel(); save(); tableSync(); FR.Dice.Sound.sparkle(); };
    var fail = function (msg) { clearInterval(workTimer); painting = false; renderEasel(); $('p-err').textContent = msg; $('p-err').hidden = false; };
    S.lastPrompt = FR.portraitSubject(character()) + ' ' + TH.ai.style;
    AI.image(S.lastPrompt).then(function (j) {
      finish(j.image, tx('painted', { s: j.seconds }));
    }).catch(function (e) { fail(e.name === 'AbortError' ? tx('slow') : (e.status === 401 ? 'OpenAI did not accept the key. Check it under Connect OpenAI.' : tx('failed', { e: e.message }))); });
  });
  $('b-keep').addEventListener('click', function () { sheetFrom = 'portrait'; go('sheet'); tableSync(); });

  /* ---------- 6. sheet ---------- */
  function buildSheet() { S.sheet = FR.build(S.u, S.cls, S.race, S.answered || 12); return S.sheet; }
  function localOrigin() { return TH.origin({ name: S.name, first: S.name.split(' ')[0], race: S.race, cls: S.cls, top: topTraits()[0] }); }
  var spaced = function (m) { return FR.fmt(m).replace(/^([+−])/, '$1 '); };
  enter.sheet = function () {
    if (!S.name) { S.name = FR.rollName(S.race, S.look.body); }
    buildSheet(); renderSheet(); writeOrigin(); save();
  };
  $('sh-back').addEventListener('click', function () { go(sheetFrom); });
  $('b-repaint').addEventListener('click', function () { portraitFrom = 'sheet'; go('portrait'); });
  function row(dl, k, v) { var d = el('div'); d.appendChild(el('dt', '', k)); d.appendChild(el('dd', '', v)); dl.appendChild(d); }
  /* The sheet. What is on it is for the cartridge's rules to say (their `sheet`, src/rules.js): in plain
     words, and with "Show rules details" on whatever those rules have to add. This only draws it. */
  function renderSheet() {
    var art = $('s-img'), view = rules().sheet(S.sheet, { theme: TH, details: G.details, tx: tx, health: healthNow(), align: alignShown() });
    art.src = S.portrait || crestOf(S.cls); art.alt = S.portrait ? 'Picture of ' + S.name : S.cls + ' badge';
    art.parentNode.classList.toggle('crest-only', !S.portrait);
    $('s-name').value = S.name;
    $('s-line').textContent = view.line;
    var v = $('s-vitals'); clear(v);
    view.vitals.forEach(function (r) { row(v, r[0], r[1]); });
    var ab = $('s-abil'); clear(ab); $('s-abil-wrap').hidden = !view.showAbilities;
    (view.abilities || []).forEach(function (a) {
      var x = el('div'); x.appendChild(el('b', '', a[0])); x.appendChild(el('strong', '', a[1])); x.appendChild(el('span', '', a[2])); ab.appendChild(x);
    });
    var s = $('s-skills'); clear(s);
    view.rows.forEach(function (r) { row(s, r[0], r[1]); });
    renderTies();
  }
  /* armor as a phrase, for everyone who has not asked for the numbers: lightly, well or heavily protected */
  function armorWord(ac) { return { light: tx('armorLight'), well: tx('armorWell'), heavy: tx('armorHeavy') }[play.armor(ac)]; }
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
  enter.play = function () {
    if (!S.sheet) { buildSheet(); }
    renderPlay(); tableSync();
    tieUntil = Date.now() + 4000;
    setTimeout(function () { if (FR.table && FR.table.landed) { FR.table.landed(); } offerTies(); }, 0);
  };
  /* the words a roll is told in: handed to FR.play, which builds the sentences */
  var words = function () { return { rolled: tx('saidRolled'), keep: tx('saidKeep'), higher: tx('higher'), lower: tx('lower'), and: tx('and'), plus: tx('plus'), plusFor: tx('plusFor'), minus: tx('minus'), bestOf: tx('bestOf'), worstOf: tx('worstOf') }; };
  var diceW = function () { return { numbers: tx('numberWords'), one: tx('diceOne'), many: tx('diceMany') }; };
  /* why a roll gets its bonus, by skill or by ability: "being sneaky", "a way with words" */
  var whyOf = function (k) {
    var why = { Athletics: tx('whyAthletics'), Acrobatics: tx('whyAcrobatics'), 'Sleight of Hand': tx('whySleight'), Stealth: tx('whyStealth'), Arcana: tx('whyArcana'), History: tx('whyHistory'),
      Investigation: tx('whyInvestigation'), Nature: tx('whyNature'), Religion: tx('whyReligion'), 'Animal Handling': tx('whyAnimal'), Insight: tx('whyInsight'), Medicine: tx('whyMedicine'),
      Perception: tx('whyPerception'), Survival: tx('whySurvival'), Deception: tx('whyDeception'), Intimidation: tx('whyIntimidation'), Performance: tx('whyPerformance'), Persuasion: tx('whyPersuasion'),
      STR: tx('whySTR'), DEX: tx('whyDEX'), CON: tx('whyCON'), INT: tx('whyINT'), WIS: tx('whyWIS'), CHA: tx('whyCHA') };
    return why[k] || '';
  };
  var rolledOnce = function () { return store.get('firstroll.rolled') === '1'; };
  function renderPlay() {
    /* d: the rule book is open (see `jargon`). nums: bonuses are shown as numbers, which is all the switch does under the light rules */
    var sh = S.sheet, R = rules(), d = jargon(), nums = G.details, tabs = play.tabs(R.tabs, tx('tabs'), tx('tabOther'), d), arm = R.armor(sh);
    if (!tabs.some(function (t) { return t.id === S.tab; })) { S.tab = 'do'; }       // a tab these rules do not have (the cartridge changed under the hero)
    var fight = S.tab === 'fight';
    $('s-play').classList.toggle('fight', fight);
    $('pl-img').src = S.portrait || crestOf(S.cls); $('pl-img').alt = '';
    $('pl-medal').classList.toggle('crest-only', !S.portrait);
    $('pl-name').textContent = S.name; $('pl-sub').textContent = S.race + ' ' + S.cls + (d ? ', level 1' : '');
    /* Health is a word (fine, hurt, in trouble: the cartridge's own) unless rules details are on, when it is
       the number. Either way it is a button: tap it to mark how the hero is doing. */
    var st = $('pl-stats'), hw = healthNow(); clear(st);
    /* Armor is a number only with rules details on. In plain words it is a phrase ("Well protected"), and a phrase
       beside the health word would squeeze the hero's name off the screen: it goes under the name instead. */
    $('pl-armor').hidden = d || !arm; $('pl-armor').textContent = d || !arm ? '' : armorWord(arm.ac);      // rules with no armor say nothing about it
    (d ? [['HP', hw.now, hw]].concat(arm ? [['Armor', arm.ac]] : []) : [[tx('statHealth'), hw.word, hw]]).concat(fight ? [[d ? 'Init' : tx('statTurn'), S.init === null ? '–' : S.init]] : []).forEach(function (p) {
      var x = el(p[2] ? 'button' : 'div', p[2] ? 'stat-btn is-' + p[2].state + (d ? '' : ' word') : '');
      x.appendChild(el('strong', '', String(p[1]))); x.appendChild(document.createTextNode(p[0]));
      if (p[2]) { x.type = 'button'; x.setAttribute('aria-label', tx('healthSet', { state: d ? tx('healthOf', { now: hw.now, max: healthMax() }) : hw.word })); x.addEventListener('click', openHealth); }
      st.appendChild(x);
    });
    /* until the first roll has been made on this device: one line that says what to do here */
    $('pl-nudge').hidden = rolledOnce(); $('pl-nudge').textContent = tx('nudge');
    renderGuide(); renderKit(); renderTokens();
    var bar = $('pl-tabs'); clear(bar);
    tabs.forEach(function (t) {
      var id = t.id, b = el('button', 'tab' + (id === 'fight' ? ' fight' : '') + (S.tab === id ? ' on' : ''), t.label); b.type = 'button'; b.setAttribute('aria-pressed', S.tab === id ? 'true' : 'false');
      b.addEventListener('click', function () { S.tab = id; renderPlay(); $('pl-list').scrollTop = 0; tune(); });
      bar.appendChild(b);
    });
    var list = $('pl-rows'); clear(list);
    /* What each tab lists, and what each row rolls, is for the cartridge's rules to say (their `rows`, src/rules.js).
       With rules details on, a row carries its bonus and a gold dot for a strong suit. Without, a number with no
       reason given would only puzzle, so the row just says when the hero is good (or fair) at it. */
    var view = R.rows(S.tab, sh, { theme: TH, details: d, tx: tx, why: whyOf, init: S.init });
    view.rows.forEach(function (w) {
      var r = el('button', 'row' + (w.cls ? ' ' + w.cls : '')), l = el('span', 'row-l'), n = el('span', 'row-n'); r.type = 'button';
      if (w.dot && nums) { n.appendChild(el('i')); }
      n.appendChild(document.createTextNode(w.label)); l.appendChild(n); l.appendChild(el('span', 'row-h', w.hint));
      r.appendChild(l);
      /* a badge on a row that is not a strong suit is the quieter one: "Fair at this", under the light rules */
      if (nums) { if (w.mod) { r.appendChild(el('span', 'row-m', w.mod)); } } else if (w.mark) { r.appendChild(el('span', 'row-g' + (w.dot ? '' : ' fair'), w.mark)); }
      r.addEventListener('click', function () { openDice(w.ctx); });
      list.appendChild(r);
    });
    if (view.say) {
      var say = el('p', 'say'); say.appendChild(el('b', '', view.say[0])); say.appendChild(document.createTextNode(view.say[1]));
      list.appendChild(say);
    }
  }
  $('b-free').addEventListener('click', function () { openDice(free(20, 1)); });
  $('pl-medal').addEventListener('click', function () { sheetFrom = 'play'; go('sheet'); });
  /* the small menu on the play screen: the ways out of it */
  function openMenu() {
    var box = $('mn-list'), tb = FR.table;
    var item = function (label, fn) { var b = el('button', 'btn ink', label); b.type = 'button'; b.addEventListener('click', function () { $('menu').hidden = true; fn(); }); box.appendChild(b); };
    clear(box);
    item(tx('home'), function () { go('title'); });
    if (TH.story && TH.story.length) { item(tx('storySoFar'), function () { story.i = 0; story.then = 'play'; renderStory(); go('story'); }); }
    item(tx('newCharacter'), openWays);
    if (S.cls && tieSteps().length) { item(tx('tiesMenu'), function () { openTies(); }); }
    item(tx('settings'), openSettings);
    if (tb && tb.isPlayer()) {
      item(tx('notesMenu'), function () { tb.tale('notes', 'top'); });
      item(tx('whoHere'), function () { tb.switcher(); });
      item(tx('leaveTable', { code: tb.code() }), function () { tb.leaveAsk(); });
    }
    $('menu').hidden = false;
  }
  $('pl-menu').addEventListener('click', openMenu);
  $('mn-x').addEventListener('click', function () { $('menu').hidden = true; });

  /* ---------- 7b. health: fine, hurt or in trouble ----------
     The hero's health is a number on the sheet, but nobody new to this wants to keep a number. So it
     is marked as one of three plain states (the cartridge's own words), and the number moves with
     it; with rules details on, the number itself is shown and can be stepped. Kept with the hero. */
  /* the number that means "all of it": hit points under open-5e, the two steps below fine under the light rules */
  function healthMax() { return rules().healthMax(S.sheet); }
  function healthNow() {
    var max = healthMax(), now = S.hp === null ? max : Math.max(0, Math.min(max, S.hp)), state = play.health(now, max);
    return { now: now, state: state, word: { fine: tx('healthFine'), hurt: tx('healthHurt'), trouble: tx('healthTrouble') }[state] };
  }
  function setHealth(n) {
    var max = healthMax();
    S.hp = n >= max ? null : Math.max(0, Math.floor(n));
    save(); tableSync(); redraw(); renderHealth();
  }
  function renderHealth() {
    var h = healthNow(), max = healthMax(), box = $('hl-list'), d = jargon() && rules().healthSteps;      // the number is only stepped by hand where the rules have one
    clear(box);
    [['fine', tx('healthFine')], ['hurt', tx('healthHurt')], ['trouble', tx('healthTrouble')]].forEach(function (o) {
      var b = el('button', 'btn ink' + (h.state === o[0] ? ' on' : ''), o[1]); b.type = 'button'; b.setAttribute('aria-pressed', h.state === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () { setHealth(play.healthAt(o[0], max)); if (!d) { $('health').hidden = true; } });
      box.appendChild(b);
    });
    $('hl-step').hidden = !d; $('hl-now').textContent = tx('healthOf', { now: h.now, max: max });
    $('hl-less').disabled = h.now <= 0; $('hl-more').disabled = h.now >= max;
    $('hl-less').setAttribute('aria-label', tx('healthLess')); $('hl-more').setAttribute('aria-label', tx('healthMore'));
  }
  function openHealth() { if (!S.sheet) { return; } renderHealth(); $('health').hidden = false; }
  $('hl-less').addEventListener('click', function () { setHealth(healthNow().now - 1); });
  $('hl-more').addEventListener('click', function () { setHealth(healthNow().now + 1); });
  $('hl-x').addEventListener('click', function () { $('health').hidden = true; });
  $('health').addEventListener('click', function (e) { if (e.target === $('health')) { $('health').hidden = true; } });

  /* ---------- 7c. at a DM's table: the story, what you could do here, and saying it yourself ----------
     Everything in this part comes from the scene the DM publishes (FR.table.scene()) and from what the
     table holds for this seat; nothing is known about any one story. Each piece is only shown when
     there is something for it, so a table whose DM publishes no scene looks as it always did. */
  var seat = function () { return FR.table && FR.table.isPlayer() ? FR.table : null; };
  var proposing = {}, lastTold = null;
  /* the DM's answer to something this player proposed, in a line */
  function answered(a) {
    var head = !a.verdict ? tx('cardWaiting') : (a.verdict === 'yes' ? tx('cardYes') : (a.verdict === 'no' ? tx('cardNo') : tx('cardRoll')));
    return head + (a.verdict && a.note ? ' ' + a.note : '');
  }
  /* The DM's answer always reaches the player. Normally it shows on the card or under the say-box; when the
     story has moved on and that card is gone (or another screen is open), it is said in a toast instead. */
  var heard = null;
  function tellAnswers(t, sc) {
    var all = t.asks(), first = !heard, shown = S.screen === 'play' && S.tab === 'do';
    if (first) { heard = {}; }
    all.forEach(function (a) {
      if (!a.verdict || heard[a.n]) { return; }
      heard[a.n] = true;
      if (first) { return; }                                  // what was answered before this page opened is old news
      var onCard = a.kind === 'card' && !!sc && sc.cards.some(function (c) { return (c.id || c.label.slice(0, 40)) === a.card; });
      var here = t.asksNow().some(function (x) { return x.n === a.n; });
      if (!(shown && here && (onCard || a.kind !== 'card'))) { toast(tx('youSaid', { text: a.text }) + ' ' + answered(a)); }
    });
  }
  function propose(what, key) {
    var t = seat();
    if (!t || proposing[key]) { return Promise.resolve(false); }
    proposing[key] = true; renderGuide(); renderKit();
    return t.propose(what).then(function () { delete proposing[key]; renderGuide(); renderKit(); return true; }, function (e) {
      delete proposing[key]; renderGuide(); renderKit();
      if (seat()) { toast(e && e.status && e.message ? e.message : tx('askFailed')); }       // the server's own sentence when it has one ("give them a moment")
      return false;
    });
  }
  function renderGuide() {
    var t = seat(), box = $('pl-guide');
    if (!t || !S.cls) { box.hidden = true; return; }
    var sc = t.scene(), news = t.unread(), latest = news[news.length - 1], onDo = S.tab === 'do';
    /* what the DM has sent that has not been looked at yet: the newest, and how many */
    $('pl-news').hidden = !latest;
    if (latest) {
      $('pl-news-k').textContent = news.length > 1 ? tx('fromDMNew', { n: news.length }) : (latest.to ? tx('onlyYou') : tx('fromDM'));
      $('pl-news-t').textContent = latest.kind === 'hero' && latest.hero ? tx('heroOffer') : (latest.title || latest.text || tx('handoutPic'));
    }
    /* where the story is now */
    var ended = !!sc && /\/end$/.test(sc.id || '');
    var place = !!sc && (!!sc.summary || ended);  // a scene with no summary (an adventure written before there were any) has nothing to say here; the ending always does
    $('pl-scene').hidden = !place;
    if (place) {
      $('pl-scene-img').hidden = !sc.img; if (sc.img) { $('pl-scene-img').src = sc.img; }
      $('pl-scene-t').textContent = sc.title || sc.chapter || ''; $('pl-scene-t').hidden = !$('pl-scene-t').textContent;
      $('pl-scene-s').textContent = sc.summary || ''; $('pl-scene-s').hidden = !sc.summary;
    }
    /* the quests, the clues and the people met: one tap each, and only the ones there is anything in */
    var rail = $('pl-rail'), chips = !sc ? [] : [['quests', tx('tabQuests'), sc.quests.length ? sc.quests.filter(function (q) { return q.done; }).length + '/' + sc.quests.length : ''],
      ['clues', tx('tabClues'), sc.clues.length || ''], ['people', tx('tabPeople'), sc.people.length || '']].filter(function (c) { return c[2] !== ''; });
    var stage = t.stage();
    if (stage && stage.map) { chips.push(['map', tx('tabMap'), stage.map.open.length + '/' + stage.map.regions.length]); }       // how much of it is uncovered
    clear(rail); rail.hidden = !chips.length;
    chips.forEach(function (c) {
      var b = el('button', 'rail-chip', c[1]); b.type = 'button'; b.appendChild(el('small', '', String(c[2])));
      b.addEventListener('click', function () { t.tale(c[0], 'top'); });
      rail.appendChild(b);
    });
    /* what a player might try here. Tapping one asks the DM; the card then says it is waiting, and then what the DM said. */
    var asks = t.asksNow(), waiting = asks.filter(function (a) { return !a.verdict; }).length, full = waiting >= 3, cards = sc && onDo ? sc.cards : [], list = $('pl-cards');
    $('pl-try').hidden = !cards.length; clear(list);
    cards.forEach(function (c) {
      var key = c.id || c.label.slice(0, 40), mine = asks.filter(function (a) { return a.kind === 'card' && a.card === key; }).pop();
      var b = el('button', 'row could-card' + (mine ? ' is-' + (mine.verdict || 'asked') : '')), l = el('span', 'row-l'); b.type = 'button';
      l.appendChild(el('span', 'row-n', c.label)); if (c.hint) { l.appendChild(el('span', 'row-h', c.hint)); }
      var rolled = mine && mine.verdict === 'roll' ? t.requests().filter(function (r) { return r.label === c.label && r.mine; }).pop() : null;
      if (mine) { l.appendChild(el('span', 'row-s', rolled ? (rolled.mine.say || tx('reqDecide')) : answered(mine))); }
      b.appendChild(l);
      b.disabled = !!(mine && !mine.verdict) || !!proposing['card:' + key] || (full && !(mine && !mine.verdict));
      b.addEventListener('click', function () { propose({ kind: 'card', card: key, text: c.label }, 'card:' + key); });
      list.appendChild(b);
    });
    /* "Or say what you do": there whenever the DM is running the story this way */
    var say = !!sc && onDo && !!(sc.cards.length || sc.summary), said = $('pl-said');
    $('pl-intent').hidden = !say; clear(said);
    if (say) {
      asks.filter(function (a) { return a.kind !== 'card'; }).slice(-3).reverse().forEach(function (a) {
        var line = el('p', 'said-p' + (a.verdict ? ' is-' + a.verdict : '')); line.appendChild(el('span', '', tx('youSaid', { text: a.text }))); line.appendChild(el('b', '', answered(a)));
        said.appendChild(line);
      });
      $('pl-tell').disabled = full || !!proposing.intent;
    }
    $('pl-wait').hidden = !(full && (cards.length || say)); $('pl-wait').textContent = tx('askWait');
    /* a roll made for the DM that the DM has still to judge; then, until it is tapped away, how it went */
    var pend = t.requests().filter(function (q) { return q.mine && (q.mine.pass === null || q.mine.pass === undefined); }).pop(), toldNow = pend ? null : lastTold;
    $('pl-told').hidden = !(pend || toldNow);
    if (pend) { $('pl-told-k').textContent = tx('reqWaiting', { label: pend.label }); $('pl-told-t').textContent = tx('reqDecide'); }
    else if (toldNow) { $('pl-told-k').textContent = tx('rollYours', { label: toldNow.label }); $('pl-told-t').textContent = toldNow.text; }
    box.hidden = ['pl-news', 'pl-scene', 'pl-rail', 'pl-try', 'pl-intent', 'pl-wait', 'pl-told'].every(function (id) { return $(id).hidden; });
  }
  $('pl-news').addEventListener('click', function () { var t = seat(); if (t) { t.tale('story', 'new'); } });
  $('pl-scene').addEventListener('click', function () { var t = seat(); if (t) { t.tale('story', 'top'); } });
  $('pl-told').addEventListener('click', function () { var t = seat(); lastTold = null; if (t) { t.tale('story', 'new'); } });
  /* as the player types, the check it most likely comes down to is named in plain words (the words are the cartridge's: FR.checkFor) */
  $('pl-say').addEventListener('input', function () {
    var c = FR.checkFor($('pl-say').value), why = $('pl-why');
    why.textContent = c && c.why ? c.why + (jargon() ? ' (' + c.skill + ')' : '') : ''; why.hidden = !why.textContent;
  });
  $('pl-intent').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = $('pl-say').value.trim();
    if (!text) { $('pl-say').focus(); return; }
    propose({ kind: 'intent', text: text.slice(0, 200) }, 'intent').then(function (ok) { if (ok) { $('pl-say').value = ''; $('pl-why').hidden = true; } });
  });

  /* ---------- 7d. a roll the DM asks for ----------
     When the DM asks this seat for a roll, the phone buzzes and a card sits over whatever player
     screen is open: what to roll, why, and one button that opens the tray set up for it (see
     FR.play.requestRoll). The roll is posted against the request, and the answer is told in the
     story's words (see renderTray). A request the DM calls off simply goes away. */
  var buzzed = {}, resultOf = {}, NO_CARD = ['quiz', 'story', 'heroes', 'dmgate', 'dm', 'connect'];
  /* a browser only lets a page buzz or make a sound once the person has touched it; asking before that just fills the log with refusals */
  var touched = function () { return !navigator.userActivation || navigator.userActivation.hasBeenActive; };
  function buzz() {
    if (!touched()) { return; }                 // a page opened again with a card already waiting: the card says it
    try { if (navigator.vibrate) { navigator.vibrate([160, 80, 160]); } } catch (e) { /* not allowed here: the card and the sound still say it */ }
    FR.Dice.Sound.unlock(); FR.sfx('arrive');
  }
  /* everything that sits over the player's screens is drawn together: the roll the DM asks for, the vote and the held picture */
  function renderAsked() { drawAsked(); renderVote(); renderHeld(); }
  function drawAsked() {
    var t = seat(), q = t && S.cls && S.sheet ? play.asked(t.requests()) : null, box = $('req'), tray = S.screen === 'dice';
    if (!q || NO_CARD.indexOf(S.screen) >= 0 || (tray && D.ctx && D.ctx.request === q.n)) { box.hidden = true; return; }
    $('req-k').textContent = tx('reqKicker'); $('req-t').textContent = q.label;
    $('req-w').textContent = q.why || ''; $('req-w').hidden = !q.why || tray;
    $('req-go').textContent = tx('reqGo');
    $('req-go').onclick = function () {
      var c = play.requestRoll(q, S.sheet, whyOf);
      /* for the site's numbers: did this roll start from a card the player tapped (the DM said "roll for it" and then asked), or from the DM alone? */
      c.fromCard = t.asks().some(function (a) { return a.kind === 'card' && a.verdict === 'roll' && q.at >= a.at && q.at - a.at < 300000; });
      openDice(c);
    };
    /* on the tray (another roll is open) it is one slim line under the tray's header, so it never covers the dice or the Roll button */
    box.classList.toggle('slim', tray);
    box.style.top = tray ? Math.round($('tray-top').getBoundingClientRect().bottom - app.getBoundingClientRect().top - 8) + 'px' : '';
    box.hidden = false;
    if (!buzzed[q.n]) { buzzed[q.n] = Date.now(); buzz(); makeWay(); }
  }
  /* What changed at the table, as far as the rolls the DM asked for go: a request called off while its
     tray is open, and a roll the DM has now judged. */
  function requestsChanged() {
    var t = seat(), list = t ? t.requests() : [];
    if (S.screen === 'dice' && D.ctx && D.ctx.request && !(D.told && D.told.state !== 'hold') && !D.rolling) {
      var open = list.filter(function (q) { return q.n === D.ctx.request; })[0];
      if (t && (!open || open.closed)) { toast(tx('reqOff')); go('play'); }
    }
    list.forEach(function (q) {
      if (!q.mine) { return; }
      var key = String(q.mine.pass), was = resultOf[q.n], inTray = S.screen === 'dice' && D.ctx && D.ctx.request === q.n && D.told;
      resultOf[q.n] = key;
      if (was === key || key === 'null' || key === 'undefined') { return; }
      if (inTray) { D.told = { state: 'done', pass: q.mine.pass, say: q.mine.say }; renderTray(); }
      else if (was !== undefined) { lastTold = { n: q.n, label: q.label, text: toldWords(q.mine.pass, q.mine.say) }; toast(q.label + ': ' + lastTold.text); }       // judged after the tray was closed: say so wherever the player is
    });
  }
  /* how a roll for the DM went, in the story's words: the DM's own line when there is one */
  function toldWords(pass, say) { return pass === null || pass === undefined ? tx('reqDecide') : (say || (pass ? tx('reqPassed') : tx('reqFailed'))); }

  /* ---------- 7e. ties: a bond with another hero, a stake in the story, a voice to try ----------
     Three short steps, every one of them optional, offered once when a hero first reaches the play
     screen at a table, and open from the menu, the sheet and "Who's here" after that. The choices are
     the cartridge's (FR.theme.ties). The stake and the voice stay with the hero on this phone (the
     table is told the stake, for the DM alone); the bond is kept by the table, and everyone there sees
     it. None of it ever stands in the way of the game: each step is skipped in one tap, and the dialog
     gets out of the way by itself when the DM asks for a roll. */
  var tie = { steps: [], i: 0, to: '', q: -1, text: '', busy: false }, tieUntil = 0;
  /* a number that differs from hero to hero, so two heroes are not offered the same stakes and the same first question */
  var heroTurn = function () { var n = 0, s = S.name || '', i; for (i = 0; i < s.length; i++) { n += s.charCodeAt(i); } return n; };
  function hooksFor() { return S.cls ? play.hookChoices(TH.ties.hooks, roleOf(S.cls), heroTurn()) : []; }
  function voiceNow() { return TH.ties.voices.filter(function (v) { return v.label === S.voice; })[0] || null; }
  /* this seat as the table lists it (its hero tokens and its bond are there), or null */
  function myEntry() { var t = seat(), id = t ? t.id() : ''; return t ? t.players().filter(function (p) { return p.id === id; })[0] || null : null; }
  function myBond() { var me = myEntry(); return me && me.bond ? me.bond : null; }
  function others() { var t = seat(); return t ? play.bondChoices(t.players(), t.id()) : []; }
  /* the steps there is anything to offer for: a bond needs another hero at the table */
  function tieSteps() {
    var out = [];
    if (others().length && TH.ties.bonds.length) { out.push('bond'); }
    if (hooksFor().length) { out.push('hook'); }
    if (TH.ties.voices.length) { out.push('voice'); }
    return out;
  }
  /* Open the steps named (all there are, when none is named). False when there was nothing to offer. */
  function openTies(steps) {
    var can = tieSteps(), list = (steps || can).filter(function (s) { return can.indexOf(s) >= 0; });
    if (!S.cls || !list.length) { return false; }
    tie.steps = list; tie.i = 0; tie.to = ''; tie.q = -1; tie.text = ''; tie.busy = false;
    $('ti-title').setAttribute('tabindex', '-1');
    $('ties').hidden = false; renderTie();
    return true;
  }
  function closeTies() { $('ties').hidden = true; if (S.screen === 'sheet') { renderTies(); } }
  function nextTie() {
    tie.to = ''; tie.q = -1; tie.text = '';
    if (tie.i >= tie.steps.length - 1) { closeTies(); return; }
    tie.i++; renderTie();
    $('ties').querySelector('.handout-card').scrollTop = 0;
    var h = $('ti-title'); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
  }
  function setHook(h) {
    var t = seat();
    S.hook = h; save();
    if (t) { t.setHook(h).catch(function () { /* the table hears it with the hero's next news (src/table.js, sync) */ }); }
  }
  function setVoice(label) { S.voice = label; save(); tableSync(); }
  function renderTie() {
    var step = tie.steps[tie.i], n = tie.steps.length, body = $('ti-body'), name = first(S.name), t = seat();
    clear(body); $('ti-err').hidden = true;
    $('ti-k').textContent = n > 1 ? tx('tiesKicker', { i: tie.i + 1, n: n }) : tx('tiesKickerOne');
    $('ti-skip').hidden = n < 2; $('ti-x').textContent = n > 1 ? tx('tiesLater') : tx('close');
    var pick = function (on, fn) { var b = el('button', 'ply-pick'); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.addEventListener('click', fn); body.appendChild(b); return b; };
    var undo = function (label, fn) { var b = el('button', 'btn ink', label); b.type = 'button'; b.addEventListener('click', fn); body.appendChild(b); };
    if (step === 'hook') {
      var hooks = hooksFor();
      if (S.hook && !hooks.some(function (h) { return h.id === S.hook.id; })) { hooks = [S.hook].concat(hooks); }       // the one already chosen is always among them
      $('ti-title').textContent = tx('hookTitle'); $('ti-text').textContent = tx('hookText', { name: name });
      hooks.forEach(function (h) { pick(!!S.hook && S.hook.id === h.id, function () { setHook({ id: h.id, text: h.text }); nextTie(); }).appendChild(document.createTextNode(h.text)); });
      if (S.hook) { undo(tx('hookClear'), function () { setHook(null); nextTie(); }); }
      return;
    }
    if (step === 'voice') {
      $('ti-title').textContent = tx('voiceTitle'); $('ti-text').textContent = tx('voiceText', { name: name });
      TH.ties.voices.forEach(function (v) {
        var b = pick(S.voice === v.label, function () { setVoice(v.label); nextTie(); });
        b.appendChild(el('b', '', v.label)); b.appendChild(el('small', '', v.tip));
      });
      if (S.voice) { undo(tx('voiceClear'), function () { setVoice(''); nextTie(); }); }
      return;
    }
    /* a bond: which hero, one of the cartridge's questions about them, and a line in answer */
    var list = others(), cur = myBond();
    if (!t || !list.length || !TH.ties.bonds.length) { nextTie(); return; }       // everyone else has got up: there is nobody to ask about
    if (!list.some(function (o) { return o.id === tie.to; })) { tie.to = cur && list.some(function (o) { return o.id === cur.to; }) ? cur.to : list[0].id; tie.q = -1; }
    var who = list.filter(function (o) { return o.id === tie.to; })[0], prompts = play.bondPrompts(TH.ties.bonds, first(who.name));
    if (tie.q < 0 || tie.q >= prompts.length) {
      var had = cur && cur.to === who.id ? prompts.indexOf(cur.prompt) : -1;         // the bond already made is where changing it starts
      tie.q = had >= 0 ? had : (heroTurn() + list.indexOf(who)) % prompts.length;
      if (had >= 0 && !tie.text) { tie.text = cur.text; }
    }
    $('ti-title').textContent = tx('bondTitle'); $('ti-text').textContent = tx('bondText');
    var lab = el('label', 'ply-prompt', prompts[tie.q]), inp = el('input', 'field'), other = el('button', 'btn ink', tx('bondOther')), keep = el('button', 'btn wax', tx('bondSave'));
    if (list.length > 1) {
      var grp = el('div', 'chips'); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', tx('bondPick'));
      list.forEach(function (o) {
        var c = el('button', 'chip' + (o.id === who.id ? ' on' : ''), o.name); c.type = 'button'; c.setAttribute('aria-pressed', o.id === who.id ? 'true' : 'false');
        c.addEventListener('click', function () { tie.text = inp.value; tie.to = o.id; tie.q = -1; renderTie(); });
        grp.appendChild(c);
      });
      body.appendChild(grp);
    }
    lab.setAttribute('for', 'ti-answer'); inp.id = 'ti-answer'; inp.type = 'text'; inp.maxLength = 200; inp.autocomplete = 'off'; inp.value = tie.text || '';
    inp.setAttribute('placeholder', tx('bondHint')); inp.setAttribute('enterkeyhint', 'done');
    other.type = 'button'; other.hidden = prompts.length < 2; keep.type = 'button';
    other.addEventListener('click', function () { tie.text = inp.value; tie.q = (tie.q + 1) % prompts.length; renderTie(); var again = $('ti-answer'); if (again) { again.focus(); } });
    var saveBond = function () {
      var text = inp.value.trim();
      if (!text) { $('ti-err').textContent = tx('bondNeed'); $('ti-err').hidden = false; inp.focus(); return; }
      if (tie.busy) { return; }
      tie.busy = true; keep.disabled = true;
      t.setBond({ to: who.id, prompt: prompts[tie.q].slice(0, 160), text: text.slice(0, 200) }).then(function () {
        tie.busy = false; toast(tx('bondSaved'));
        if (!$('ties').hidden) { nextTie(); }
      }, function (e) {
        tie.busy = false; keep.disabled = false;
        $('ti-err').textContent = e && e.status && e.message ? e.message : tx('askFailed'); $('ti-err').hidden = false;
      });
    };
    keep.addEventListener('click', saveBond);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveBond(); } });
    body.appendChild(lab); body.appendChild(other); body.appendChild(inp); body.appendChild(keep);
    if (cur) { undo(tx('bondClear'), function () { t.setBond(null).catch(function () { /* said again by the next change */ }); nextTie(); }); }
  }
  $('ti-skip').addEventListener('click', nextTie);
  $('ti-x').addEventListener('click', closeTies);
  $('ties').addEventListener('click', function (e) { if (e.target === $('ties')) { closeTies(); } });
  /* Offered once for each hero, when it first reaches the play screen at a table and nothing more
     pressing is going on. The table's list of players has to be here first: a bond needs to know who
     else is seated, so for a moment after the screen opens this is tried again as the table answers. */
  function offerTies() {
    var t = seat();
    if (!t || !S.cls || S.tied || S.screen !== 'play' || Dlg.open() || !myEntry() || play.asked(t.requests())) { return; }
    if (openTies()) { S.tied = true; save(); tableSync(); }
  }
  /* The ties on the sheet: the stake, the voice and (at a table) the bond, each with the way to choose or change it. */
  function renderTies() {
    var box = $('s-ties'), bond = myBond(), v = voiceNow();
    clear(box);
    var part = function (head, text, small, step) {
      var d = el('div', 'ply-tie'), b = el('button', 'btn ink', text ? tx('change') : tx('choose'));
      d.appendChild(el('h3', 'h-ox', head)); d.appendChild(el('p', text ? '' : 'is-none', text || tx('hookNone')));
      if (small) { d.appendChild(el('small', '', small)); }
      b.type = 'button'; b.setAttribute('aria-label', (text ? tx('change') : tx('choose')) + ': ' + head); b.addEventListener('click', function () { openTies([step]); });
      d.appendChild(b); box.appendChild(d);
    };
    if (S.hook || hooksFor().length) { part(tx('hookTitle'), S.hook ? S.hook.text : '', '', 'hook'); }
    if (S.voice || TH.ties.voices.length) { part(tx('voiceTitle'), S.voice, v ? v.tip : '', 'voice'); }
    if (bond || tieSteps().indexOf('bond') >= 0) { part(tx('bondHead'), bond ? [bond.prompt, bond.text].filter(Boolean).join(' ') : '', '', 'bond'); }
    box.hidden = !box.firstChild;
  }

  /* ---------- 7f. things you carry, and hero tokens ----------
     The kit is the cartridge's: each class lists the items a hero of it starts with (FR.theme.kit).
     "Use" tells the DM, as something the hero says they do; a thing that can be used once is then
     marked used on this phone, and can be un-marked, because the DM may say no. Hero tokens are the
     table's: the DM hands them out, and one buys a second go at a roll (see the tray, below). */
  function kitNow() {
    var c = FR.CLASSES[S.cls], items = (TH.kit && TH.kit.items) || {};
    return ((c && c.kit) || []).filter(function (id) { return !!items[id]; }).map(function (id) { var it = items[id]; return { id: id, name: it.name, text: it.text, img: it.img, once: it.uses === 'once' }; });
  }
  /* what the DM is told, in the cartridge's wording */
  var kitSaid = function (it) { return String(tx('kitSay', { item: it.name })).slice(0, 200); };
  function markUsed(it, on) {
    if (!it.once) { return; }
    if (on) { S.used[it.id] = true; } else { delete S.used[it.id]; }
    save(); tableSync();
  }
  function useItem(it) {
    markUsed(it, true);
    if (!seat()) { toast(tx('kitTell', { item: it.name })); renderKit(); return; }
    propose({ kind: 'intent', text: kitSaid(it) }, 'kit:' + it.id).then(function (ok) { if (!ok) { markUsed(it, false); } renderKit(); });
  }
  function renderKit() {
    var box = $('pl-kit'), list = $('pl-kit-list'), t = seat(), asks = t ? t.asksNow() : [];
    var items = S.cls && (S.tab === 'do' || S.tab === 'fight') ? kitNow() : [];
    clear(list); box.hidden = !items.length;
    items.forEach(function (it) {
      var used = it.once && S.used[it.id] === true, said = kitSaid(it), mine = asks.filter(function (a) { return a.kind !== 'card' && a.text === said; }).pop();
      var card = el('div', 'ply-item' + (used ? ' is-used' : '')), l = el('span', 'row-l'), b = el('button', 'btn ghost', used ? tx('kitUndo') : tx('kitUse'));
      if (it.img) { var im = el('img'); im.src = it.img; im.alt = ''; im.loading = 'lazy'; card.appendChild(im); }
      l.appendChild(el('span', 'row-n', it.name)); l.appendChild(el('span', 'row-h', it.text));
      if (it.once) { l.appendChild(el('span', 'ply-once', used ? tx('kitUsed') : tx('kitOnce'))); }
      if (mine) { l.appendChild(el('span', 'row-s', answered(mine))); }           // asked, and then what the DM said
      b.type = 'button'; b.setAttribute('aria-label', (used ? tx('kitUndo') : tx('kitUse')) + ': ' + it.name);
      b.disabled = !!proposing['kit:' + it.id] || (!used && !!mine && !mine.verdict);
      b.addEventListener('click', function () { if (used) { markUsed(it, false); renderKit(); } else { useItem(it); } });
      card.appendChild(l); card.appendChild(b); list.appendChild(card);
    });
  }
  function tokensNow() { var me = myEntry(); return me ? me.tokens || 0 : 0; }
  /* how many this seat holds, in the cartridge's own word for them; not there at all with none */
  function renderTokens() {
    var n = tokensNow(), tk = (TH.kit && TH.kit.token) || {};
    $('pl-tokens').hidden = !n;
    if (n) { $('pl-tokens-n').textContent = n + ' ' + (n === 1 ? tk.name : tk.plural); $('pl-tokens-t').textContent = tk.text || ''; }
  }

  /* ---------- 7g. the party vote ----------
     When the DM puts a question to the party, a card sits over the play and story screens: the
     question and a button for each choice. This phone's pick is marked and can be changed for as
     long as the vote is open; the card can be folded down to one line so it is never in the way.
     When the DM closes the vote the card shows how it went, as bars, until it is tapped away. */
  var voteSeen = {}, voteFolded = {}, voting = false;
  var voteDone = function (t, n) { return store.get('firstroll.vote') === t.code() + ':' + n; };
  function castVote(n, i) {
    var t = seat();
    if (!t || voting) { return; }
    voting = true; renderVote();
    t.ballot(n, i).then(function () { voting = false; renderVote(); }, function (e) {
      voting = false; renderVote();
      if (seat()) { toast(e && e.status && e.message ? e.message : tx('askFailed')); }
    });
  }
  function renderVote() {
    var t = seat(), v = t ? t.votes()[0] : null, box = $('ply-vote'), opts = $('ply-vote-opts'), note = $('ply-vote-note'), fold = $('ply-vote-fold'), req = $('req');
    if (!v || !(S.screen === 'play' || S.screen === 'tale') || (!v.open && (!v.counts || voteDone(t, v.n)))) { box.hidden = true; return; }
    var folded = v.open && voteFolded[v.n] === true, at = opts.contains(document.activeElement) ? Array.prototype.indexOf.call(opts.children, document.activeElement) : -1;
    clear(opts); box.classList.toggle('is-folded', folded);
    $('ply-vote-k').textContent = folded ? v.q : (v.open ? tx('voteKicker') : tx('voteClosed'));
    $('ply-vote-q').textContent = v.q; $('ply-vote-q').hidden = folded;
    fold.hidden = !v.open; fold.textContent = folded ? tx('voteShow') : tx('voteHide');
    opts.hidden = folded; $('ply-vote-x').hidden = v.open;
    if (v.open) {
      v.options.forEach(function (o, i) {
        var b = el('button', 'ply-opt'); b.type = 'button'; b.setAttribute('aria-pressed', v.mine === i ? 'true' : 'false');
        b.appendChild(el('span', '', o)); if (v.mine === i) { b.appendChild(el('small', '', tx('voteYours'))); }
        b.addEventListener('click', function () { castVote(v.n, i); });
        opts.appendChild(b);
      });
      note.textContent = v.mine === null || v.mine === undefined ? tx('voteNote') : tx('voteMine'); note.hidden = folded;
      if (at >= 0 && opts.children[at]) { opts.children[at].focus(); }         // drawn again while a choice had the focus: it keeps it
    } else {
      var bars = play.voteBars(v), any = bars.some(function (r) { return r.count > 0; });
      bars.forEach(function (r) {
        var row = el('div', 'ply-bar' + (r.top ? ' is-top' : '')), name = el('span', '', r.label), track = el('i'), bar = el('u');
        if (r.mine) { name.appendChild(el('small', '', tx('voteYours'))); }
        track.setAttribute('aria-hidden', 'true'); bar.style.width = r.width + '%'; track.appendChild(bar);
        row.appendChild(name); row.appendChild(el('strong', '', String(r.count))); row.appendChild(track); opts.appendChild(row);
      });
      note.textContent = any ? '' : tx('voteNone'); note.hidden = any;
    }
    /* a roll the DM is asking for keeps the bottom of the screen: the vote sits above it. Folded down, it sits above the play screen's own button, never on it */
    var dock = S.screen === 'play' ? document.querySelector('#s-play .play-dock') : null;
    box.style.bottom = !req.hidden && !req.classList.contains('slim') ? (req.offsetHeight + 24) + 'px' : (folded && dock ? dock.offsetHeight + 'px' : '');
    box.hidden = false;
    if (v.open && !voteSeen[v.n]) { voteSeen[v.n] = true; buzz(); }
  }
  $('ply-vote-fold').addEventListener('click', function () { var t = seat(), v = t ? t.votes()[0] : null; if (v) { voteFolded[v.n] = !voteFolded[v.n]; renderVote(); } });
  $('ply-vote-x').addEventListener('click', function () { var t = seat(), v = t ? t.votes()[0] : null; if (v) { store.set('firstroll.vote', t.code() + ':' + v.n); } renderVote(); });

  /* ---------- 7h. table moments: a picture held and flipped, a beat, the sound behind a scene ----------
     All three come from the stage the DM sets (FR.table.stage()), which every device at the table is
     sent. A table that sets none shows and plays nothing here.
     The reveal: while the DM holds a picture, every phone shows a card face down with "Wait for it…"
     and the picture's title (which is written to give nothing away); when the DM flips it the card
     turns over, on every phone at once. For people who asked for less motion nothing turns: the
     picture simply takes the card's place. A player may put the card away; the flip brings it back. */
  var held = { key: '', shown: false, hid: false, closed: false };
  function renderHeld() {
    var t = seat(), st = t ? t.stage() : null, r = st ? st.reveal : null, box = $('ply-reveal'), flip = $('ply-flip'), img = $('ply-reveal-img');
    if (!r) { held = { key: '', shown: false, hid: false, closed: false }; box.hidden = true; return; }
    var key = [r.id, r.title, r.img].join('|'), fresh = key !== held.key;
    /* a picture this phone has already seen face up and closed stays closed when the page is opened again */
    if (fresh) { held = { key: key, shown: !!r.shown, hid: false, closed: !!r.shown && store.get('firstroll.revealed') === t.code() + '|' + key }; }
    var turned = !fresh && !!r.shown && !held.shown;                  // the DM has just flipped it
    if (turned) { held.shown = true; held.hid = false; held.closed = false; }
    if (!r.shown && held.shown) { held.shown = false; held.hid = false; held.closed = false; }       // held face down again
    if (NO_CARD.indexOf(S.screen) >= 0 || S.screen === 'title' || (r.shown ? held.closed : held.hid)) { box.hidden = true; return; }
    var was = box.hidden;
    $('ply-reveal-t').textContent = r.title || ''; $('ply-reveal-c').textContent = r.title || ''; $('ply-reveal-c').hidden = !r.title;
    if (!r.img) { img.removeAttribute('src'); } else if (img.getAttribute('src') !== r.img) { img.src = r.img; }
    img.alt = r.title || ''; img.hidden = !r.img;
    box.classList.toggle('is-still', reduced);
    $('ply-reveal-x').textContent = r.shown ? tx('close') : tx('revealHide');
    $('ply-reveal-pin').hidden = !r.shown || !t.pin; $('ply-reveal-pin').disabled = !!t.pinned && t.pinned('reveal:' + r.id);
    $('ply-reveal-pin').textContent = $('ply-reveal-pin').disabled ? tx('pinned') : tx('pin');
    if (turned) {
      /* the moment itself: if the card had been put away it comes back face down, and then turns */
      flip.classList.remove('is-set');
      if (was) { flip.classList.remove('is-up'); box.hidden = false; void flip.offsetWidth; }
      flip.classList.add('is-up');
    } else if (!r.shown) { flip.classList.add('is-set'); flip.classList.remove('is-up'); void flip.offsetWidth; flip.classList.remove('is-set'); }
    else if (fresh || was) { flip.classList.add('is-set'); flip.classList.add('is-up'); }       // already face up when this phone came to it: there is no flip to play
    box.hidden = false;
  }
  $('ply-reveal-x').addEventListener('click', function () {
    var t = seat(), st = t ? t.stage() : null, r = st ? st.reveal : null;
    if (r && r.shown) { held.closed = true; store.set('firstroll.revealed', t.code() + '|' + held.key); } else { held.hid = true; }
    $('ply-reveal').hidden = true;
  });
  $('ply-reveal-pin').addEventListener('click', function () {
    var t = seat(), st = t ? t.stage() : null, r = st ? st.reveal : null;
    if (r && r.shown && t.pin && t.pin({ from: 'reveal:' + r.id, title: r.title, text: '', img: r.img })) { toast(tx('pinDone')); }
    renderHeld();
  });
  /* the DM wants a roll now: whatever optional thing is open gets out of its way */
  function makeWay() {
    if (!$('ties').hidden) { closeTies(); }
    if (!$('ply-reveal').hidden && !held.shown) { held.hid = true; $('ply-reveal').hidden = true; }
  }
  /* A beat: a thunderclap, a hit, a bell. The phone buzzes in a pattern of its own for each kind
     (FR.play.BUZZ), one of the engine's sounds plays where one fits (they follow the sound effects
     switch), and a wash of light crosses the screen, unless less motion was asked for. Each beat is
     played once, and only while it is fresh (FR.play.beatFresh). */
  var beat = { code: '', n: 0, timer: 0 };
  var BEAT_SOUND = {
    thunder: function (s) { s.thud(1); setTimeout(function () { s.thud(0.45); }, 240); },      // the clap, and its echo
    hit: function (s) { s.hit('wood', 1, 0); s.thud(0.7); },
    reveal: function (s) { s.sparkle(); },
    bell: function (s) { s.dingdong(); },
    crash: function (s) { s.hit('wood', 1, 0); s.thud(1); setTimeout(function () { s.hit('wood', 0.6, 0.3); }, 90); },
    hush: function (s) { s.cut(); }                                                         // nothing new to hear: whatever was ringing stops
  };
  function playBeat() {
    var t = seat(), st = t ? t.stage() : null, b = st ? st.beat : null, fx = $('ply-beat');
    if (!t || !b || typeof b.n !== 'number') { return; }
    /* the last beat this phone played is remembered with its seat, so opening the page again within a few seconds does not play it twice */
    var mark = t.code() + '|' + (t.id ? t.id() : '') + '|', kept;
    if (beat.code !== t.code()) { beat.code = t.code(); kept = String(store.get('firstroll.beat') || ''); beat.n = kept.indexOf(mark) === 0 ? Math.max(0, Number(kept.slice(mark.length)) || 0) : 0; }
    if (b.n <= beat.n) { return; }
    var fresh = play.beatFresh(b, beat.n, t.serverNow()), kind = String(b.kind).replace(/[^a-z]/g, ''), sound = Object.prototype.hasOwnProperty.call(BEAT_SOUND, kind) ? BEAT_SOUND[kind] : null;
    beat.n = b.n; store.set('firstroll.beat', mark + b.n);
    if (!fresh) { return; }                       // fired before this phone was listening: it is not played late
    if (touched()) {
      try { if (navigator.vibrate) { navigator.vibrate(play.beatBuzz(kind)); } } catch (e) { /* not allowed here */ }
      FR.Dice.Sound.unlock();
      if (sound) { try { sound(FR.Dice.Sound); } catch (e) { /* no sound here: the buzz and the light still say it */ } }
    }
    if (!reduced) {
      fx.className = 'ply-beat is-' + kind; fx.hidden = false; void fx.offsetWidth; fx.classList.add('is-on');
      clearTimeout(beat.timer); beat.timer = setTimeout(function () { fx.hidden = true; }, 800);
    }
  }
  /* The sound behind a scene. It plays on this phone only when its player has switched "Table sounds on
     this phone" on in Settings (off unless they do, like music, so six phones do not play over each
     other), and only while this phone is seated as a player: the DM's screens and the big screen
     look after their own. A soundscape that is a music file takes the place of the scene's music. */
  var bed = { on: '', music: false };
  var bedWanted = function () { return store.get('firstroll.bed') === '1'; };
  function applyBed() {
    var t = seat(), st = t ? t.stage() : null, s = st ? st.sound : null, b = s && bedWanted() ? TH.beds[s.bed] : null;
    if (!FR.Ambience) { return; }
    if (!b) {
      if (bed.on) { FR.Ambience.stop(); bed.on = ''; }
      if (bed.music) { bed.music = false; tune(); }
      return;
    }
    if (!!b.file !== bed.music) { bed.music = !!b.file; tune(); }
    FR.Ambience.play(b); FR.Ambience.level(typeof s.level === 'number' ? s.level : 1);
    bed.on = s.bed;
  }
  /* The DM started the table's run afresh (FR.table.floor() rose): nothing of the old run is left on
     this phone. The story, the rolls and the scene are dropped by src/table.js; here go the words still
     standing on the play screen, what was heard and buzzed for, and the marks on things used once. */
  function cleanSlate() {
    lastTold = null; proposing = {}; buzzed = {}; resultOf = {}; voteSeen = {}; voteFolded = {};
    held = { key: '', shown: false, hid: false, closed: false }; $('ply-reveal').hidden = true;
    if (Object.keys(S.used).length) { S.used = {}; if (S.cls) { save(); tableSync(); } }
    if (S.screen === 'play') { renderPlay(); }
    renderAsked();
  }

  /* ---------- 8. dice tray ----------
     Opening the tray never rolls, and neither does changing what is in it. The dice wait until the
     player asks: the Roll button, a flick across the tray, or a shake of the phone. */
  function free(sides, count) {
    var n = Math.max(1, Math.min(6, count));
    return { title: n + 'd' + sides, label: play.diceWords(n, sides, diceW()), note: tx('freeNote'), plain: tx('freeNote'), sides: sides, count: n, mod: 0, kind: 'free' };
  }
  var usesAdv = play.usesAdv;
  /* may this hero roll a 1 again? (a people's gift under open-5e; never under the light rules) */
  var luckyHero = function () { return !!S.sheet && rules().lucky(S.sheet); };
  var spec = function () { return play.spec(D.ctx, D.adv); };
  var result = function () { return play.result(D.ctx, D.adv, D.values); };
  var fightish = function () { var k = D.ctx.kind; return k === 'attack' || k === 'damage' || k === 'init'; };
  var dieColor = function () { return fightish() ? TH.dice.fight : FR.CLASSES[S.cls].color; };
  var css = function (c) { return typeof c === 'number' ? '#' + ('000000' + c.toString(16)).slice(-6) : c; };       // the pack's dice colours are numbers, for the 3D tray
  function trayBounds() {
    var c = $('tray').getBoundingClientRect(), t = $('tray-top').getBoundingClientRect(), b = $('tray-bot').getBoundingClientRect();
    FR.Dice.setBounds({ left: 6, top: t.bottom - c.top - 14, right: c.width - 6, bottom: b.top - c.top + 22 });
  }
  /* ----- flat dice: where there is no 3D (no WebGL, or it was lost), and for people who asked for less motion ----- */
  function flatHost() {
    var f = $('flat'), c = $('s-dice').getBoundingClientRect(), t = $('tray-top').getBoundingClientRect(), b = $('tray-bot').getBoundingClientRect();
    f.hidden = false;
    /* the dice get the stretch between the tray's header and its footer, however tall those are today */
    f.style.top = Math.max(0, Math.round(t.bottom - c.top - 10)) + 'px'; f.style.bottom = Math.max(0, Math.round(c.bottom - b.top - 16)) + 'px';
    return f;
  }
  var flatDice = function () { var col = dieColor(); return spec().map(function (s) { return { sides: s, color: col }; }); };
  var flatOpts = function (dropped) {
    return { reduced: reduced, floor: 'url(' + TH.art.floor + ') center / cover, ' + css(TH.dice.floorBase), rim: TH.dice.rim.color, ink: fightish() ? TH.dice.fightInk : '', dropped: dropped || [] };
  };
  var droppedOf = function (vals) { var r = play.result(D.ctx, D.adv, vals); return r.two ? [r.keptIx === 0 ? 1 : 0] : []; };
  /* the dice as they stand: waiting to be rolled, or lying where they landed */
  function flatRest() {
    $('tray').style.visibility = 'hidden'; clear($('badges'));
    FR.FlatDice.draw(flatHost(), flatDice(), D.shown ? D.values : [], flatOpts(D.shown ? droppedOf(D.values) : []));
  }
  /* The 3D tray stopped drawing while it was open (the browser took the graphics away): carry on flat. */
  function lostGL() {
    var was = D.rolling;
    D.booted = false; D.flat = true;
    if (S.screen !== 'dice') { return; }
    D.rolling = false; flatRest(); renderTray();
    if (was) { throwDice(null); }               // the throw that was in the air is thrown again
  }
  /* The 3D dice need two libraries (three.js and cannon.js) that most of the app never uses, so they are
     not in the page: they are fetched the first time the tray opens (FR.lib('dice'), src/registry.js).
     Until they arrive the dice are drawn flat, and can be rolled that way at once; the moment they land
     the tray takes over, unless a roll is on show. If they cannot be fetched the flat dice simply stay,
     and the next time the tray opens it asks again. dice3d: '' not asked for, 'wait', 'ok' or 'no'. */
  var dice3d = '';
  function wantDice() {
    if (window.THREE && window.CANNON) { dice3d = 'ok'; return; }
    if (dice3d === 'wait' || dice3d === 'no') { return; }
    dice3d = 'wait';
    need('dice').then(function () {
      dice3d = 'ok';
      if (S.screen === 'dice' && !D.rolling && !D.shown && !D.flat && !D.booted) { setTray(); renderTray(); }
    }, function () { dice3d = 'no'; });
  }
  /* the dice are drawn flat: for good on this page (no WebGL, less motion), or for now (the tray is on its way) */
  var flatNow = function () { return D.flat || !D.booted; };
  function openDice(ctx) {
    FR.FX.stop();
    if (dice3d === 'no') { dice3d = ''; }
    D.ctx = ctx; D.adv = 'normal'; D.values = []; D.shown = false; D.rolling = false; D.lucky = false; D.told = null; D.typed = false;
    go('dice'); renderTray(); tune(); renderAsked();
    Shake.rest();
    setTimeout(setTray, 60);
  }
  /* Lay the tray out and leave the dice waiting. Nothing rolls here. */
  function setTray() {
    if (S.screen !== 'dice') { return; }
    if (!D.booted && !D.flat) {
      if (reduced) { D.flat = true; }           // less motion: the dice do not tumble, they are simply shown
      else {
        wantDice();
        if (dice3d === 'ok') {
          try { FR.Dice.init($('tray'), {}); D.booted = true; FR.Dice.onFrame(placeBadges); FR.Dice.onLost(lostGL); FR.Dice.setScene(TH.dice, TH.art.floor); }
          catch (e) { D.booted = false; D.flat = true; }       // no WebGL here: the dice are drawn flat instead
        }
      }
      if (D.flat) { renderTray(); }             // flat dice cannot be flicked, so the words about how to roll change
    }
    if (flatNow()) { flatRest(); return; }
    $('flat').hidden = true; $('tray').style.visibility = '';
    clear($('badges')); FR.Dice.clear(); FR.Dice.resize(); trayBounds(); FR.Dice.draw();
  }
  /* what was asked for has changed (more dice, another die, two dice instead of one): back to waiting */
  function resetTray() { D.values = []; D.shown = false; D.lucky = false; D.typed = false; renderTray(); setTray(); renderAsked(); }
  /* what is about to be rolled, before anything is */
  function willRoll() {
    var c = D.ctx, two = usesAdv(c) && D.adv !== 'normal', b;
    if (jargon()) { return (c.count > 1 || c.kind === 'free' ? c.count : '') + 'd' + c.sides + (c.mod ? ' ' + spaced(c.mod) : '') + (two ? ' · ' + (D.adv === 'adv' ? tx('advBest') : tx('advWorst')) : ''); }
    if (c.kind === 'free') { return ''; }       // the title already says it
    b = play.bonus(c.mod, c.why, words());
    return (two ? (D.adv === 'adv' ? tx('willBest') : tx('willWorst')) : play.diceWords(c.count, c.sides, diceW())) + (b ? ', ' + b : '') + '.';
  }
  function renderTray() {
    var c = D.ctx, r = D.shown ? result() : null, d = jargon();
    $('d-title').textContent = c.kind === 'free' && !d ? play.diceWords(c.count, c.sides, diceW()) : c.title;
    $('d-note').textContent = d ? c.note : (c.plain || '');
    /* one die, or two and keep the best or the worst. The rules call the last two advantage and
       disadvantage; in plain words they are just what they do. */
    var seg = $('d-adv'); clear(seg); seg.hidden = !usesAdv(c) || !rules().two; seg.classList.toggle('plain', !d);       // rules of one die and a bonus have no second die to offer seg.setAttribute('aria-label', tx('advLabel'));
    [['dis', tx('disTerm'), tx('advWorst')], ['normal', tx('normalTerm'), tx('advOne')], ['adv', tx('advTerm'), tx('advBest')]].forEach(function (m) {
      var b = el('button', D.adv === m[0] ? 'on' : '', d ? m[1] : m[2]); b.type = 'button'; b.setAttribute('aria-pressed', D.adv === m[0] ? 'true' : 'false');
      b.setAttribute('aria-label', d && m[0] !== 'normal' ? m[1] + ': ' + m[2] : m[2]); b.title = m[2];
      b.addEventListener('click', function () { if (D.adv !== m[0] && !D.rolling) { D.adv = m[0]; resetTray(); } });
      seg.appendChild(b);
    });
    var tot = $('d-total'), told = r && c.request ? D.told : null;
    tot.className = 'result-num' + (r ? ' pop' : '') + (r && r.nat === 20 ? ' crit' : '') + (r && r.nat === 1 ? ' fumble' : '');
    tot.textContent = r ? String(r.total) : '';
    /* A roll the DM asked for is answered in the story's words (the DM's own line for this result), with the
       number small beside it; while the DM has still to judge it, it says so, and changes when they have. */
    tot.parentNode.classList.toggle('told', !!told && told.state !== 'hold');
    var math = '', say = '', attack = c.kind === 'attack';
    if (r) {
      if (c.table) { math = c.table[r.kept - 1]; }
      else if (d) { math = (r.two ? 'Kept ' + r.kept + ' of ' + D.values.join(' and ') : D.values.join(' + ')) + (c.mod ? ' ' + spaced(c.mod) : ''); }
      else { math = play.sentence(c, D.adv, D.values, words()); }
      /* whether an attack hits is the DM's call, so the damage roll is an offer, not a verdict */
      /* a roll may bring its own lines for these moments (c.says: the light rules' fight rolls do, having no damage to offer) */
      say = c.kind === 'damage' ? tx('tellDamage') : (attack && c.dmg ? tx('hitsSay') : ((c.says && c.says.done) || tx('tell')));
      if (r.nat === 20) { say = (c.says && c.says.nat20) || (attack ? tx('nat20Attack') : tx('nat20')); }
      if (r.nat === 1) { say = (c.says && c.says.nat1) || (attack ? tx('nat1Attack') : tx('nat1')); }
    } else if (D.rolling) { say = tx('rolling'); }
    else { math = willRoll(); say = (flatNow() ? tx('howRollFlat') : tx('howRoll')) + (Shake.on() ? ' ' + tx('howShake') : ''); }
    if (told && told.state !== 'hold') {
      say = math;                                // the sum, small
      math = told.state === 'sending' ? tx('reqSending') : (told.state === 'lost' ? tx('reqLost') : (told.state === 'off' ? told.say || tx('reqOff') : toldWords(told.state === 'wait' ? null : told.pass, told.say)));
    }
    $('d-math').textContent = math; $('d-say').textContent = say;
    /* a roll for the DM is made once: after it the button is the way back to the table (or, with a lucky 1 in hand, the way to keep it) */
    var held = !!told && told.state === 'hold', once = !!told && !held;
    $('d-roll').textContent = once ? tx('done') : (held ? tx('reqKeep') : (D.shown ? tx('rollAgain') : tx('roll'))); $('d-roll').disabled = D.rolling || (!!told && told.state === 'sending');
    var second = $('d-second'), label = '';
    if (r && attack && c.dmg && r.nat !== 1) { label = tx('hits'); }
    if (r && r.nat === 1 && luckyHero() && !D.lucky && !once) { label = tx('lucky'); }
    second.hidden = !label; second.textContent = label;
    /* "I rolled real dice": beside Roll until there is a second thing to do with the result */
    $('d-real').hidden = !!label || once || held; $('d-real').disabled = D.rolling;
    /* any other dice: always there with rules details on; otherwise only once "Roll other dice" was asked for */
    var freeRoll = c.kind === 'free', rail = $('d-rail');
    $('d-rail-wrap').hidden = !d && !freeRoll; $('d-rail-hint').hidden = d || !freeRoll; $('d-rail-hint').textContent = tx('railHint');
    clear(rail);
    [4, 6, 8, 10, 12, 20].forEach(function (sd) {
      var on = sd === c.sides && freeRoll, b = el('button', on ? 'on' : '', (d ? 'd' : '') + sd); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', play.diceWords(1, sd, diceW()));
      b.addEventListener('click', function () { if (D.rolling) { return; } D.ctx = free(sd, freeRoll ? c.count : 1); D.adv = 'normal'; resetTray(); });
      rail.appendChild(b);
    });
    $('d-count').textContent = String(c.count);
    var sh = $('d-shake');
    sh.hidden = !Shake.can(); sh.setAttribute('aria-pressed', Shake.on() ? 'true' : 'false'); sh.classList.toggle('on', Shake.on());
    $('d-shake-t').textContent = Shake.on() ? tx('shakeOn') : tx('shakeOff');
    renderSpend();
  }
  /* A hero token in hand: after a roll it buys a second go at the same roll. The button is there from
     the moment the tray opens (so the tray is laid out around it once, not after the dice have
     landed) and can be pressed once there is a roll to make again. A roll the DM asked for can be
     made again once the table has it, for as long as the DM still wants it. */
  var spending = false;
  function canSpend() {
    var c = D.ctx, t = seat();
    if (!t || !c || S.screen !== 'dice' || !D.shown || D.rolling || spending || tokensNow() < 1) { return false; }
    if (!c.request) { return true; }
    return !!D.told && (D.told.state === 'done' || D.told.state === 'wait') && t.requests().some(function (q) { return q.n === c.request && !q.closed; });
  }
  function renderSpend() {
    var b = $('d-token'), show = S.screen === 'dice' && !!D.ctx && !!seat() && tokensNow() > 0, was = b.hidden;
    b.hidden = !show; b.disabled = !canSpend();
    if (show) { b.textContent = tx('tokenSpend', { token: TH.kit.token.name }); }
    /* a token handed over (or taken back) while the tray is open changes how tall its footer is: the dice get the room that is left */
    if (was !== b.hidden && S.screen === 'dice' && !D.rolling) { if (flatNow()) { flatRest(); } else { trayBounds(); } }
  }
  $('d-token').addEventListener('click', function () {
    var c = D.ctx, t = seat(), req = c && c.request ? c.request : undefined;
    if (!canSpend()) { return; }
    spending = true; renderSpend();
    t.spend({ label: c.label || c.title || '', request: req }).then(function () {
      spending = false;
      if (S.screen !== 'dice' || D.ctx !== c) { return; }
      if (req) { delete resultOf[req]; }
      toast(tx('tokenSpent', { token: TH.kit.token.name }));
      D.told = null; resetTray();                 // the same roll, waiting to be made again
    }, function (e) {
      spending = false; renderSpend();
      if (seat()) { toast(e && e.status && e.message ? e.message : tx('askFailed')); }
    });
  });
  function placeBadges() {
    var box = $('badges');
    if (D.flat || !D.shown || D.values.length < 2) { if (box.firstChild) { clear(box); } return; }
    if (box.childNodes.length === D.values.length) { return; }
    clear(box);
    var r = result(), top = $('tray').getBoundingClientRect();
    D.values.forEach(function (v, i) {
      var p = FR.Dice.screenPos(i); if (!p) { return; }
      var b = el('div', 'badge' + (r.two && i !== r.keptIx ? ' drop' : ''), String(v));
      b.style.left = p.x + 'px'; b.style.top = Math.max(top.height * 0.12, p.y - p.r - 20) + 'px'; box.appendChild(b);
    });
  }
  function throwDice(flick) {
    FR.FX.stop();
    if (D.rolling || S.screen !== 'dice' || !D.ctx) { return; }
    var sp = spec(), c = D.ctx, adv = D.adv;
    D.rolling = true; D.shown = false; D.values = []; clear($('badges')); renderTray();
    D.typed = false;
    var land = function (vals) {
      if (S.screen !== 'dice' || D.ctx !== c) { return; }       // the tray was closed, or changed, while the dice were in the air
      D.values = vals;
      var r = result();
      if (r.two && D.booted && !D.flat) { FR.Dice.dim(r.keptIx === 0 ? 1 : 0, true); }
      landed(c, adv, vals, false);
    };
    if (!D.flat && !D.booted && dice3d === 'ok') { setTray(); }      // the 3D tray arrived while flat dice were on show: this throw is its first
    if (!D.flat && D.booted) { FR.FlatDice.clear($('flat')); $('flat').hidden = true; $('tray').style.visibility = ''; }      // typed-in dice were on show: the tray comes back for the throw
    if (D.flat || !D.booted) {
      var vals = sp.map(function (s) { return 1 + Math.floor(Math.random() * s); });
      FR.FlatDice.roll(flatHost(), flatDice(), vals, flatOpts(droppedOf(vals))).then(function (ok) {
        if (ok) { land(vals); } else if (D.ctx === c && D.rolling && S.screen === 'dice') { D.rolling = false; renderTray(); }
      });
      return;
    }
    FR.Dice.setTheme(dieColor(), fightish() ? TH.dice.fightInk : TH.dice.ink);
    FR.Dice.roll(sp, flick, land);
  }
  /* The dice have come to rest on `vals`, however they got there: thrown in the tray, drawn flat, or
     rolled on the real table and typed in. From here on a roll is a roll: the same words, the same
     natural 20 and natural 1 moments, and the same news for the table. */
  var firstRoll = false;
  function landed(c, adv, vals, typed) {
    D.values = vals; D.rolling = false; D.shown = true; D.typed = !!typed;
    var r = result(), atTable = !!(FR.table && FR.table.active()), entry = play.entry(c, adv, vals, words());
    if (c.kind === 'init') { S.init = r.total; }
    /* a roll the DM asked for, come up 1 for a hero who may roll a 1 again: it is not sent until they have chosen */
    var hold = !!c.request && atTable && r.nat === 1 && luckyHero() && !D.lucky;
    if (c.request && atTable) { D.told = { state: hold ? 'hold' : 'sending' }; }
    renderTray();
    /* the big moments play their own sounds */
    if (r.nat === 20) { FR.FX.crit({ anchor: $('d-total'), host: app, fx: TH.fx, reduced: reduced }); }
    else if (r.nat === 1) { FR.FX.fumble({ anchor: $('d-total'), host: app, fx: TH.fx, reduced: reduced }); }
    Shake.rest();
    if (!rolledOnce()) { store.set('firstroll.rolled', '1'); }
    /* numbers for the site's owner: how long the very first roll of this visit took and how the hero was made, and where each roll started */
    if (!firstRoll) {
      firstRoll = true;
      var paint = (window.performance && performance.getEntriesByType ? performance.getEntriesByType('paint') : []).filter(function (p) { return p.name === 'first-paint'; })[0];
      event('first_roll', { ms: performance.now() - (paint ? paint.startTime : 0), way: madeBy });
    }
    event('roll_source', { way: typed ? 'typed' : (c.request ? (c.fromCard ? 'card' : 'request') : (c.kind === 'free' ? 'free' : 'list')) });
    /* at a table, everyone sees what was rolled */
    if (!atTable) { return; }
    if (!c.request) { FR.table.roll(entry); return; }
    if (!hold) { sendAsked(c, entry); }
  }
  /* Post a roll the DM asked for, and tell its answer in the tray (if the tray is still open on it; the
     story screen has it either way). */
  function sendAsked(c, entry) {
    var since = buzzed[c.request] || Date.now(), here = function () { return S.screen === 'dice' && D.ctx === c; };
    entry.request = c.request;
    D.told = { state: 'sending' }; renderTray();
    FR.table.roll(entry).then(function (j) {
      if (j) { resultOf[c.request] = String(j.pass); event('request_answered', { ms: Date.now() - since, way: j.pass === null || j.pass === undefined ? 'open' : (j.pass ? 'pass' : 'fail') }); }
      if (!here()) { return; }
      D.told = !j ? { state: 'lost' } : { state: j.pass === null || j.pass === undefined ? 'wait' : 'done', pass: j.pass, say: j.say };
      renderTray();
    }, function (e) {
      if (!here()) { return; }
      D.told = { state: 'off', say: (e && e.message) || '' }; renderTray();
    });
  }
  /* ----- "I rolled real dice": type what the dice on the table show -----
     One box for each die the roll needs. Each number has to be one that die can show; then it counts
     exactly like a roll made in the tray. */
  function openTyped() {
    if (D.rolling || !D.ctx || S.screen !== 'dice') { return; }
    var sides = spec(), list = $('ty-list');
    clear(list);
    sides.forEach(function (sd, i) {
      var id = 'ty-' + i, lab = el('label', 'lbl', sides.length === 1 ? tx('realOne', { s: sd }) : tx('realEach', { i: i + 1, s: sd })), inp = el('input', 'field code');
      lab.setAttribute('for', id); inp.id = id; inp.type = 'text'; inp.setAttribute('inputmode', 'numeric'); inp.setAttribute('pattern', '[0-9]*'); inp.maxLength = String(sd).length; inp.autocomplete = 'off';
      list.appendChild(lab); list.appendChild(inp);
    });
    $('ty-err').hidden = true; $('typed').hidden = false; $('ty-0').focus();
  }
  $('d-real').addEventListener('click', openTyped);
  $('ty-x').addEventListener('click', function () { $('typed').hidden = true; });
  $('ty-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!D.ctx || D.rolling || S.screen !== 'dice') { $('typed').hidden = true; return; }
    var sides = spec(), boxes = sides.map(function (sd, i) { return $('ty-' + i); }), vals = play.typedAll(boxes.map(function (b) { return b ? b.value : ''; }), sides), bad = -1;
    if (!vals) {
      sides.forEach(function (sd, i) { if (bad < 0 && play.typed(boxes[i] ? boxes[i].value : '', sd) === null) { bad = i; } });
      $('ty-err').textContent = tx('realBad', { s: sides[Math.max(0, bad)] }); $('ty-err').hidden = false;
      if (boxes[bad]) { boxes[bad].focus(); boxes[bad].select(); }
      return;
    }
    $('typed').hidden = true;
    FR.FX.stop();
    D.values = vals; D.shown = true; D.typed = true;
    flatRest();                                 // the dice are drawn showing the numbers typed, whichever kind of tray this is
    landed(D.ctx, D.adv, vals, true);
  });

  /* leaving the tray, by any door: nothing is left running */
  function leaveTray() {
    FR.FX.stop();
    if (D.booted) { FR.Dice.stop(); }
    FR.FlatDice.clear($('flat')); $('flat').hidden = true;
    D.rolling = false;
  }
  /* dice typed in once are typed in again: "Roll again", the lucky second go and the damage all ask for the numbers */
  var rollOrType = function () { if (D.typed) { D.values = []; D.shown = false; renderTray(); setTray(); openTyped(); } else { throwDice(null); } };
  $('d-roll').addEventListener('click', function () {
    var c = D.ctx, told = c && c.request && D.shown ? D.told : null;
    if (told && told.state === 'hold') { sendAsked(c, play.entry(c, D.adv, D.values, words())); return; }      // "Keep the 1"
    if (told) { go('play'); return; }                                                                         // a roll for the DM is made once
    if (D.typed && D.shown) { rollOrType(); return; }
    throwDice(null);
  });
  $('d-second').addEventListener('click', function () {
    if (D.rolling || !D.shown) { return; }
    var r = result(), c = D.ctx, typed = D.typed;
    if (r.nat === 1 && luckyHero() && !D.lucky) { D.lucky = true; D.told = null; rollOrType(); return; }
    if (!c.dmg) { return; }                     // nothing further to roll (rules with no damage dice)
    var crit = r.nat === 20, n = crit ? c.dmg.count * 2 : c.dmg.count, name = c.title + ' ' + tx('damage');
    D.ctx = { title: name, label: name, note: (crit ? tx('crit') + ' · ' : '') + n + 'd' + c.dmg.sides + (c.dmg.mod ? ' ' + spaced(c.dmg.mod) : ''), plain: crit ? tx('critPlain') : '',
      sides: c.dmg.sides, count: n, mod: c.dmg.mod, why: tx('whyDamage'), kind: 'damage' };
    D.adv = 'normal'; resetTray();
    setTimeout(function () { if (typed) { openTyped(); } else { throwDice(null); } }, 90);       // "Roll damage" is a roll button: the dice go once the tray has been laid out for them
  });
  var bump = function (dn) { var c = D.ctx; if (D.rolling) { return; } D.ctx = free(c.sides, (c.kind === 'free' ? c.count : 1) + dn); D.adv = 'normal'; resetTray(); };
  $('d-less').addEventListener('click', function () { if (D.ctx.kind === 'free' && D.ctx.count > 1) { bump(-1); } });
  $('d-more').addEventListener('click', function () { if (D.ctx.count < 6) { bump(1); } });
  $('d-close').addEventListener('click', function () { FR.FX.stop(); go('play'); });
  /* a flick across the tray throws the dice that way; a plain tap does nothing, so nobody rolls by accident */
  (function () {
    var cv = $('tray'), pts = [];
    cv.addEventListener('pointerdown', function (e) { pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }]; if (cv.setPointerCapture) { cv.setPointerCapture(e.pointerId); } });
    cv.addEventListener('pointermove', function (e) { if (pts.length) { pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (pts.length > 6) { pts.shift(); } } });
    cv.addEventListener('pointerup', function (e) {
      if (!pts.length) { return; }
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      var a = pts[0], b = pts[pts.length - 1], dt = Math.max(16, b.t - a.t) / 1000, dx = b.x - a.x, dy = b.y - a.y;
      pts = [];
      if (Math.sqrt(dx * dx + dy * dy) >= 24) { throwDice({ vx: dx / dt, vz: dy / dt }); }
    });
  })();
  window.addEventListener('resize', function () {
    if (S.screen !== 'dice') { return; }
    if (flatNow()) { if (!D.rolling) { flatRest(); } } else { FR.Dice.resize(); trayBounds(); }
  });

  /* ----- shake to roll -----
     The phone's motion sensor, read through FR.play.shaker. Android gives it freely; iOS wants to be
     asked from a tap, which is what the "Shake to roll" control in the tray is for. The choice is
     remembered. Where there is no sensor to speak of (a desktop), the control is not shown. */
  var Shake = (function () {
    var KEY = 'firstroll.shake', sh = play.shaker(), on = false, heard = false, asked = false, grav = null, stopT = 0;
    var DM = window.DeviceMotionEvent, has = !!DM && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window), mustAsk = !!DM && typeof DM.requestPermission === 'function';
    var now = function () { return performance.now(); };
    function motion(e) {
      var a = e.acceleration, g = e.accelerationIncludingGravity, mag, t = now(), out;
      if (!on || S.screen !== 'dice') { return; }
      if (a && typeof a.x === 'number') { mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
      else if (g && typeof g.x === 'number') {
        /* no gravity-free reading on this phone: follow gravity slowly and take what is left over as the movement */
        grav = grav ? [grav[0] * 0.9 + g.x * 0.1, grav[1] * 0.9 + g.y * 0.1, grav[2] * 0.9 + g.z * 0.1] : [g.x, g.y, g.z];
        mag = Math.sqrt(Math.pow(g.x - grav[0], 2) + Math.pow(g.y - grav[1], 2) + Math.pow(g.z - grav[2], 2));
      } else { return; }
      if (D.rolling) { sh.rest(t); return; }
      out = sh.feed(mag, t);
      if (out.rattle) { FR.Dice.Sound.rattle(out.rattle); }
      clearTimeout(stopT);
      if (out.throw) { throwDice(null); }
      else if (sh.waiting()) { stopT = setTimeout(function () { if (sh.tick(now()) && on && S.screen === 'dice' && !D.rolling) { throwDice(null); } }, sh.options.stop + 30); }   // shaken once, then still: that throws too
    }
    function listen() { if (!heard) { heard = true; window.addEventListener('devicemotion', motion); } }
    function set(v, remember) { on = !!v; if (remember) { store.set(KEY, on ? '1' : '0'); } if (on) { listen(); sh.rest(now()); } if (S.screen === 'dice' && D.ctx) { renderTray(); } }
    function permit(then, refused) {
      var p; try { p = DM.requestPermission(); } catch (e) { p = Promise.reject(e); }
      p.then(function (res) { if (res === 'granted') { then(); } else if (refused) { refused(); } }).catch(function () { if (refused) { refused(); } });
    }
    /* Unless it was switched off, shaking simply works wherever the browser lets it: at once where no
       permission is needed, and where one is, by asking without a tap. A browser that has already
       said yes (or never needs asking) answers yes; iOS, asked for the first time, says no without
       showing anything, and the control in the tray is there to ask properly. */
    if (has && store.get(KEY) !== '0') { if (mustAsk) { permit(function () { set(true, false); }); } else { on = true; listen(); } }
    return {
      can: function () { return has; }, on: function () { return on; },
      rest: function () { sh.rest(now()); clearTimeout(stopT); },
      /* the control in the tray, from a tap */
      toggle: function () {
        if (on) { set(false, true); }
        else if (mustAsk) { permit(function () { set(true, true); }, function () { toast(tx('shakeDenied')); }); }
        else { set(true, true); }
      },
      /* iOS remembers a yes, but wants to be asked from a tap on every visit: the first tap in the tray does it quietly */
      wake: function () { if (has && mustAsk && !on && !asked && store.get(KEY) === '1') { asked = true; permit(function () { set(true, false); }); } },
      /* for tests: switch it on whatever the device, then dispatch a 'devicemotion' event with an `acceleration` */
      enable: function () { has = true; set(true, false); }
    };
  })();
  $('d-shake').addEventListener('click', function () { Shake.toggle(); });
  $('s-dice').addEventListener('click', function () { Shake.wake(); });

  /* ---------- settings: sound, rules details, AI extras ---------- */
  var SPEAKER = { on: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11', off: 'M4 9v6h4l5 4V5L8 9zM16.5 9.5l5 5M21.5 9.5l-5 5' };
  function renderSettings() {
    var has = FR.Music.has(), said = store.get('firstroll.music'), tb = FR.table;
    $('au-music').setAttribute('aria-checked', G.music && has ? 'true' : 'false'); $('au-music').disabled = !has;
    $('au-music-note').textContent = !has ? tx('musicNone') : (said !== '1' && said !== '0' && !G.music ? tx('musicTable') : tx('musicNote'));
    $('au-sfx').setAttribute('aria-checked', G.muted ? 'false' : 'true');
    /* the sound the DM sets behind a scene: offered to a seated player, and off until they say otherwise */
    $('au-table').hidden = !(tb && tb.isPlayer()); $('au-table').setAttribute('aria-checked', bedWanted() ? 'true' : 'false');
    $('au-table-note').textContent = bedWanted() && G.muted ? tx('tableSoundMuted') : tx('tableSoundNote');
    $('au-details').setAttribute('aria-checked', G.details ? 'true' : 'false');
    /* what the switch does depends on the cartridge's rules: the light rules have only bonuses to show, and say so */
    $('au-details').querySelector('small').textContent = rules().say(TH, 'detailsNote') || tx('detailsNote');
    var cr = (TH.music && TH.music.credit) || ''; $('au-credit').textContent = cr; $('au-credit').hidden = !cr;
    /* every other credit the cartridge carries: the rules it plays by first (every cartridge has that one), then any of its own */
    var more = (TH.credits || []).filter(function (c) { return c && c.text && c.type !== 'music'; }).map(function (c) { return c.text; }).join(' ');
    $('au-rules').textContent = more ? tx('creditsHead') + ': ' + more : ''; $('au-rules').hidden = !more;
    /* AI extras, in one line: on, on at a table, or off (and complete without) */
    $('live-note').textContent = !serverKnown ? '' : (G.mode === 'direct' ? tx('aiDirect') : (G.live ? tx('aiOn') : (G.mode === 'server' ? tx('aiTable') : tx('aiOff'))));
    $('au-ai').hidden = !serverKnown;
    $('b-connect-title').hidden = !(serverKnown && canDirect && G.mode !== 'server');
    $('b-connect-title').textContent = G.mode === 'direct' ? tx('connectChange') : tx('connect');
    /* the speaker on every screen: a crossed-out one, and a label that says so, when nothing will be heard */
    var quiet = G.muted && !(G.music && has);
    document.querySelectorAll('.audio-open').forEach(function (b) {
      var p = b.querySelector('path');
      b.classList.toggle('off', quiet); b.setAttribute('aria-label', quiet ? tx('soundOff') : tx('soundOn')); b.title = quiet ? tx('soundOff') : tx('soundOn');
      if (p) { p.setAttribute('d', quiet ? SPEAKER.off : SPEAKER.on); }
    });
  }
  function openSettings() { renderSettings(); $('audio').hidden = false; $('au-x').focus(); }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.audio-open')) { openSettings(); } });
  $('au-music').addEventListener('click', function () { G.music = !G.music; store.set('firstroll.music', G.music ? '1' : '0'); FR.Music.enable(G.music); renderSettings(); });
  $('au-sfx').addEventListener('click', function () { G.muted = !G.muted; FR.Dice.Sound.muted = G.muted; store.set('firstroll.sfx', G.muted ? '0' : '1'); renderSettings(); if (!G.muted) { FR.Dice.Sound.tink(); } });
  $('au-details').addEventListener('click', function () {
    G.details = !G.details; store.set('firstroll.details', G.details ? '1' : '0'); renderSettings();
    if (S.screen === 'play') { renderPlay(); } else if (S.screen === 'sheet') { renderSheet(); } else if (S.screen === 'dice' && D.ctx) { renderTray(); if (!D.rolling) { setTray(); } }
  });
  $('au-table').addEventListener('click', function () { store.set('firstroll.bed', bedWanted() ? '0' : '1'); renderSettings(); applyBed(); });
  $('au-x').addEventListener('click', function () { $('audio').hidden = true; });
  $('audio').addEventListener('click', function (e) { if (e.target === $('audio')) { $('audio').hidden = true; } });

  /* ---------- particles: whatever the scenario has drifting past (snow, embers, nothing) ---------- */
  (function () {
    var cv = $('embers'), g = cv.getContext('2d'), ps = [], W = 0, H = 0;
    if (reduced || !g) { return; }
    var fit = function () { var r = app.getBoundingClientRect(); W = cv.width = Math.round(r.width); H = cv.height = Math.round(r.height); };
    var spawn = function (y) { return { x: Math.random() * W, y: y, r: 0.6 + Math.random() * 1.6, v: 0.25 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 0.3, ph: Math.random() * 6.28, life: 0.5 + Math.random() * 0.5 }; };
    var rgb = function (c) { var n = parseInt(String(c).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    fit(); window.addEventListener('resize', fit);
    (function loop(t) {
      requestAnimationFrame(loop);
      var P = TH.particles;
      g.clearRect(0, 0, W, H);
      if (!P || P.screens.indexOf(S.screen) < 0) { return; }
      while (ps.length < P.count) { ps.push(spawn(Math.random() * H)); }
      if (ps.length > P.count) { ps.length = P.count; }
      var fall = P.motion === 'fall', c0 = rgb(Array.isArray(P.color) ? P.color[0] : P.color), c1 = Array.isArray(P.color) && P.color[1] ? rgb(P.color[1]) : c0;
      ps.forEach(function (p, ix) {
        p.x += p.vx + Math.sin(t * 0.001 + p.ph) * 0.25;
        p.y += (fall ? 1 : -1) * (p.v * P.speed + P.base);
        if (fall ? p.y > H + 10 : p.y < -10) { ps[ix] = spawn(fall ? -10 : H + 10); return; }
        /* each particle has its own strength k, 0 to 1: it sets how solid it is and which end of the colour pair it takes */
        var k = (p.life - 0.5) * 2, a = P.alpha[0] + (P.alpha[1] - P.alpha[0]) * k;
        if (P.flicker) { a *= 0.5 + 0.5 * Math.sin(t * 0.004 + p.ph); }      // glow and dim, like embers
        if (P.fade) { a *= Math.min(1, p.y / (H * 0.6)); }                   // die away toward the top of the screen
        g.fillStyle = 'rgba(' + Math.round(c0[0] + (c1[0] - c0[0]) * k) + ',' + Math.round(c0[1] + (c1[1] - c0[1]) * k) + ',' + Math.round(c0[2] + (c1[2] - c0[2]) * k) + ',' + a.toFixed(3) + ')';
        g.beginPath(); g.arc(p.x, p.y, p.r * P.size, 0, 6.2832); g.fill();
      });
    })(0);
  })();

  /* ---------- sitting down at a table ----------
     Called by table.js once the server has given this device a seat (j is what it said), and again
     if a table turns out to be playing another scenario. The table owns the scenario: the app
     switches to it before anyone builds a hero. A hero belongs to one scenario, so one made for
     another is never dragged along: the player starts on this table's quick game instead. */
  var seating = Promise.resolve();
  function seated(j) {
    /* one at a time: the table may notice the scenario while the join is still being dealt with */
    var run = function () { return sitAt(j); };
    seating = seating.then(run, run);
    return seating;
  }
  function sitAt(j) {
    var want = (j && j.scenario) || '', switched = false, step = Promise.resolve();
    if (FR.table && FR.table.isPlayer()) { store.set('firstroll.seated', '1'); }
    applyMusic();
    if (want && want !== TH.id && FR.pack(want)) { step = pickTheme(want, true).then(function () { switched = TH.id === want; }); }
    return step.then(function () {
      var k = load();
      var onward = function () {
        if (S.cls && !switched) { tableSync(); return; }                              // already playing this scenario: the table meets the hero in play
        if (k) { if (switched || S.screen === 'title') { resume(); } return; }       // a hero made for this scenario is waiting on this device
        if (switched) { toast(tx('tablePlays', { scenario: TH.name })); startGame('quick'); }
      };
      renderSettings(); renderThemes(); renderTitle();
      /* the seat was left with a hero in it (an earlier session, or another phone): offer it back first,
         unless it is the very hero already in play here (a seat taken back a moment after it was lost) */
      var left = null; try { left = j && j.back && j.save ? JSON.parse(j.save) : null; } catch (e) { left = null; }
      var same = !!left && !switched && !!S.cls && left.cls === S.cls && left.race === S.race && left.name === S.name;
      if (left && !same && FR.table.welcome(j, onward)) { return; }
      onward();
    });
  }

  // nothing may scroll the stage itself (focus and scroll-into-view can try)
  app.addEventListener('scroll', function () { app.scrollTop = 0; app.scrollLeft = 0; });
  applyTheme(TH.id, false);
  tune();                                  // the title screen has music too, from the first tap
  visited(S.screen);                       // the title counts as a screen opened, like any other
  checkServer();
  window.FRState = function () { return S; }; window.FRGo = go; window.FRTheme = pickTheme;
  FR.app = { $: $, el: el, clear: clear, go: go, tx: tx, toast: toast, ask: ask, fetchJson: fetchJson, text: AI.text, image: AI.image, store: store, reduced: reduced, isLive: function () { return G.live; }, screen: function () { return S.screen; },
    saved: function () { var k = load(); return k && k.name ? k : null; }, saveBlob: saveBlob, restore: restore, useScenario: pickTheme, resume: resume, seated: seated, takePortrait: takePortrait,
    /* the name the person at this device goes by at a table (not their hero's) */
    player: function () { return store.get('firstroll.player') || ''; }, setPlayer: function (n) { if (n) { store.set('firstroll.player', n); } },
    /* the picture this device holds is the one the table keeps at `url`: there is no need to send it again */
    portraitAt: function (url) { if (S.cls && S.portrait && url && S.portraitFrom !== url) { S.portraitFrom = url; save(); } },
    details: function () { return G.details; }, shake: Shake, settings: openSettings,
    /* a number for the site's owner (see `event` above), and a part of the app that is only fetched when first wanted: need('qr') */
    event: event, need: need, takeHero: takeHero, awake: Awake, trail: Trail,
    /* open the hero's ties (all the steps, or those named: 'bond', 'hook', 'voice'); false when there is nothing to offer */
    ties: openTies, tieSteps: tieSteps,
    character: function () {
      /* `line` is what the rest of the table reads beside this hero: one plain thing they are good at (the cartridge's first strength for the class) */
      return S.cls ? { name: S.name, race: S.race, cls: S.cls, line: ((FR.CLASSES[S.cls] && FR.CLASSES[S.cls].strengths) || [])[0] || '', look: FR.portraitSubject(character()).slice(0, 380), portrait: S.portrait, portraitFrom: S.portraitFrom, noPicture: !S.portrait && S.noPic, hook: S.hook, voice: S.voice } : null;
    } };

  /* ---------- connect OpenAI (only when this copy runs on your own computer) ---------- */
  var connectFrom = 'title';
  function openConnect() {
    $('audio').hidden = true;
    connectFrom = S.screen === 'dice' ? 'play' : S.screen; $('okey').value = ''; $('okey-err').hidden = true;
    $('okey-ok').textContent = directKey() ? 'A key is saved on this computer.' : '';
    $('b-okey-clear').hidden = !directKey(); go('connect');
  }
  $('b-connect-title').addEventListener('click', openConnect);
  $('c-back').addEventListener('click', function () { go(connectFrom); });
  $('connect').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('okey').value.trim(), err = $('okey-err'), okMsg = $('okey-ok'), b = $('b-okey-save');
    err.hidden = true;
    if (v.length < 20) { err.textContent = 'That is too short to be an OpenAI key. Copy the whole key and paste it here.'; err.hidden = false; return; }
    b.disabled = true; b.textContent = 'Testing the key'; okMsg.textContent = '';
    fetchJson('https://api.openai.com/v1/models', null, 20000, { Authorization: 'Bearer ' + v }).then(function () {
      store.set('firstroll.openai', v); setMode(); renderSettings(); $('okey').value = '';
      okMsg.textContent = 'Connected. Pictures and story help now come from OpenAI.'; $('b-okey-clear').hidden = false;
      setTimeout(function () { go(connectFrom); }, 900);
    }).catch(function (x) {
      err.textContent = x.status === 401 ? 'OpenAI did not accept that key. Check that you copied all of it.' : 'Could not reach OpenAI to test the key. Check your connection and try again.'; err.hidden = false;
    }).then(function () { b.disabled = false; b.textContent = 'Save and test'; });
  });
  $('b-okey-clear').addEventListener('click', function () {
    try { localStorage.removeItem('firstroll.openai'); } catch (x) { /* nothing stored */ }
    setMode(); renderSettings(); $('b-okey-clear').hidden = true; $('okey-ok').textContent = 'Key removed from this computer.';
  });
  enter.connect = function () { setTimeout(function () { $('okey').focus(); }, 80); };
})();
