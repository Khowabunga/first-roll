/* First Roll: the DM's side. Plays an adventure: turns its data into a scrolling session the
   DM can read from, records what happened, and asks an AI co-storyteller to bend the plan
   when the players go off-script. It never tracks hit points: only the story and, beside it,
   the table the DM opened: who is sitting at it, what they roll, and whose turn it is.

   Nothing here belongs to any one story. Chapters, people, flags, wording and the AI's
   brief all come from the adventure. Its format is written up at the top of the first
   adventure file and checked by scripts/validate-adventure.js. The players' races and
   classes come from FR.theme.

   On a phone it is one column with tabs. On a wide screen the story has the main pane and the
   table sits beside it (see "the layout" below, and src/css/dm.css).

   The first part, FR.run, has no screen in it: whether a condition holds, what follows what, and
   what the players' phones may be told about the story. It runs anywhere, so test/unit/dm.test.js
   plays whole adventures through it without a browser. */
(function () {
  'use strict';

  /* ================= the part with no screen in it =================
     Everything here is asked about an adventure `st` and a session `dm` (its feed, flags and order
     of hub picks, laid out as fresh() further down documents). It touches neither the page nor the
     table. */
  var run = FR.run = {};
  var byId = function (list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; };
  /* The table's own limits for a scene and for what goes with a roll (docs/PHASE1.md, section 1). Text
     is cut here exactly as the table cuts it, so what the DM is shown is what a phone will get. */
  var CAP = run.CAP = { id: 40, chapter: 80, title: 80, summary: 400, label: 60, hint: 120, cards: 8, quest: 160, quests: 12, clue: 200, clues: 20,
    name: 60, line: 160, people: 40, log: 240, story: 30, bytes: 24 * 1024, why: 160, say: 300, note: 200 };
  var cut = run.cut = function (s, max) { return (typeof s === 'string' || typeof s === 'number' ? String(s) : '').replace(/[\u0000-\u0009\u000b-\u001f]+/g, ' ').trim().slice(0, max); };

  /* ---------- small lookups ---------- */
  run.chapter = function (st, id) { return byId(st.flow.chapters, id); };
  run.interlude = function (st, i) { return (st.flow.interludes || [])[i]; };
  run.hubs = function (st) { return st.flow.hubs || []; };
  run.hubOf = function (st, e) { return e.id ? byId(run.hubs(st), e.id) : run.hubs(st)[0]; };
  run.choices = function (st, dm, hub) { return hub.options.filter(function (o) { return dm.order.indexOf(o.to) < 0; }); };   // what is still on offer
  run.optionFor = function (st, ch) { var hit = null; run.hubs(st).forEach(function (h) { h.options.forEach(function (o) { if (o.to === ch && !hit) { hit = o; } }); }); return hit; };

  /* ---------- conditions: the questions an adventure asks about the session (its `when`) ---------- */
  run.seen = function (st, id, feed) {       // has that chapter, interlude or hub come up?
    return feed.some(function (e) { return (e.k === 'chapter' && e.ch === id) || (e.k === 'bridge' && (run.interlude(st, e.i) || {}).id === id) || (e.k === 'hub' && (run.hubOf(st, e) || {}).id === id); });
  };
  function tally(dm, what, feed) {
    if (what === 'picks') { return dm.order.length; }
    var k = { interludes: 'bridge', chapters: 'chapter' }[what];
    return feed.filter(function (e) { return e.k === k; }).length;
  }
  function score(st, dm, name) {  // points added up across flags, as the adventure's `scores` lays out
    var rows = (st.scores && st.scores[name]) || {}, n = 0;
    Object.keys(rows).forEach(function (flag) { n += rows[flag][String(dm.flags[flag])] || 0; });
    return n;
  }
  /* Does this condition hold? No condition means yes. `feed` lets the clock ask about an earlier moment. */
  run.holds = function (st, dm, c, feed) {
    if (!c) { return true; }
    feed = feed || dm.feed;
    var f = dm.flags, o = dm.order, n, sub = function (x) { return run.holds(st, dm, x, feed); };
    if (c.all) { return c.all.every(sub); }
    if (c.any) { return c.any.some(sub); }
    if (c.not) { return !sub(c.not); }
    if (c.flag) {
      if ('is' in c) { return f[c.flag] === c.is; }
      if ('isNot' in c) { return f[c.flag] !== c.isNot; }
      if (c.in) { return c.in.indexOf(f[c.flag]) >= 0; }
      return !!f[c.flag];
    }
    if (c.picked) { return o.indexOf(c.picked) >= 0; }
    if (c.before) { return o.indexOf(c.before[0]) >= 0 && o.indexOf(c.before[1]) >= 0 && o.indexOf(c.before[0]) < o.indexOf(c.before[1]); }
    if (c.seen) { return run.seen(st, c.seen, feed); }
    if (c.count) { n = tally(dm, c.count, feed); } else if (c.score) { n = score(st, dm, c.score); } else { return false; }
    return (!('is' in c) || n === c.is) && (!('atLeast' in c) || n >= c.atLeast) && (!('atMost' in c) || n <= c.atMost);
  };

  /* ---------- the engine: what follows what ----------
     Each step adds to the session and gives back the place in the feed of the first entry it added:
     that is where the DM's screen scrolls to. */
  function add(dm, e) { dm.feed.push(e); return dm.feed.length - 1; }
  /* Bring up a chapter, an interlude or a hub by its id. */
  function goTo(st, dm, id, deep) {
    var ins = st.flow.interludes || [], hs = run.hubs(st), i;
    if (run.chapter(st, id)) { i = add(dm, { k: 'chapter', ch: id }); add(dm, { k: 'scene', ch: id, sc: 0 }); return i; }
    for (i = 0; i < ins.length; i++) { if (ins[i].id === id) { return add(dm, { k: 'bridge', i: i }); } }
    for (i = 0; i < hs.length; i++) {
      if (hs[i].id === id) { return run.choices(st, dm, hs[i]).length ? add(dm, i ? { k: 'hub', id: id } : { k: 'hub' }) : follow(st, dm, hs[i].next, (deep || 0) + 1); }   // nothing left to choose: move on
    }
    return add(dm, { k: 'end' });   // a name nothing answers to: end the story rather than strand the DM
  }
  /* The first rule that holds says where the story goes next: { to: id } or { end: true }. */
  function follow(st, dm, rules, deep) {
    var hit = (deep || 0) > 8 ? null : (rules || []).filter(function (r) { return run.holds(st, dm, r.when); })[0];
    return hit && hit.to && !hit.end ? goTo(st, dm, hit.to, deep) : add(dm, { k: 'end' });
  }
  run.begin = function (st, dm) { return goTo(st, dm, st.flow.start); };
  /* The DM says what happened: outcome `o` of the scene or interlude at feed entry `entry`. */
  run.choose = function (st, dm, entry, o) {
    var sets = o.sets || {}, ch, next, first, then;
    Object.keys(sets).forEach(function (k) { dm.flags[k] = sets[k]; });
    add(dm, { k: 'out', label: o.label, log: o.log || o.label });
    if (o.end) { return add(dm, { k: 'end' }); }
    if (o.to) { return goTo(st, dm, o.to); }
    if (entry.k === 'bridge') { return follow(st, dm, run.interlude(st, entry.i).next); }
    ch = run.chapter(st, entry.ch); next = entry.sc + 1 + (o.skip || 0);
    if (o.scene) { ch.scenes.forEach(function (s, i) { if (s.id === o.scene) { next = i; } }); }
    if (next < ch.scenes.length) { return add(dm, { k: 'scene', ch: entry.ch, sc: next }); }
    /* the chapter is over: what is read on the way out, if anything, then whatever follows */
    first = ch.leaving && ch.leaving.length ? add(dm, { k: 'wrap', ch: entry.ch }) : -1; then = follow(st, dm, ch.next);
    return first < 0 ? then : first;
  };
  run.pick = function (st, dm, id) { dm.order.push(id); add(dm, { k: 'pick', ch: id }); return goTo(st, dm, id); };
  /* a shortcut the adventure offers a DM who is short on time */
  run.jump = function (st, dm, sc) { add(dm, { k: 'out', label: sc.label, log: sc.log || sc.label }); return goTo(st, dm, sc.to); };

  /* ---------- where the story stands ---------- */
  /* The last scene, interlude or hub to come up; the cover before any has; the end once it is reached.
     `key` names the place: 'chapter/scene' for a scene of a chapter (the way a handout's `at` writes
     it), the id of an interlude or a hub, and two names no id can have for the cover and the end. */
  run.place = function (st, dm) {
    var feed = dm.feed || [], i, e, ch, s, h;
    for (i = feed.length - 1; i >= 0; i--) {
      e = feed[i];
      if (e.k === 'end') { return { kind: 'end', key: '/end', i: i }; }
      if (e.k === 'scene') { ch = run.chapter(st, e.ch); s = ch.scenes[e.sc]; return { kind: 'scene', key: e.ch + '/' + (s.id || e.sc), i: i, chapter: ch, scene: s }; }
      if (e.k === 'bridge') { s = run.interlude(st, e.i); return { kind: 'bridge', key: s.id, i: i, scene: s }; }
      if (e.k === 'hub') { h = run.hubOf(st, e); return { kind: 'hub', key: h.id, i: i, hub: h }; }
    }
    return { kind: 'cover', key: '/cover', i: 0 };
  };
  /* every scene a try can belong to, under the same keys */
  function places(st) {
    var out = [];
    st.flow.chapters.forEach(function (ch) { ch.scenes.forEach(function (s, i) { out.push({ key: ch.id + '/' + (s.id || i), scene: s, chapter: ch }); }); });
    (st.flow.interludes || []).forEach(function (s) { out.push({ key: s.id, scene: s, chapter: null }); });
    return out;
  }

  /* ---------- tries: what a player might attempt, and the roll that goes with it ----------
     A try's `check` says how it is settled. { skill, target } is a roll the DM can ask for with one
     tap ('roll'). false says there is nothing to roll ('none'). Left out, the DM asks by hand, guided
     by the free words in `roll` ('hand'). */
  run.kind = function (t) { return t && t.check && typeof t.check === 'object' ? 'roll' : (t && t.check === false ? 'none' : 'hand'); };
  /* how hard, in plain words: the three numbers every adventure is written against */
  run.LEVELS = [{ id: 'easy', word: 'Easy', target: 10 }, { id: 'medium', word: 'Medium', target: 13 }, { id: 'hard', word: 'Hard', target: 16 }];
  run.level = function (target) {
    if (typeof target !== 'number') { return ''; }
    var l = run.LEVELS[target <= 11 ? 0 : (target <= 14 ? 1 : 2)];
    return l.word + ' (' + target + ')';
  };
  /* A roll written in free words ("Persuasion or Performance, easy (10)"): the first skill it names and
     the number it gives, as far as either can be read. Only ever a suggestion put in front of the DM. */
  run.guess = function (text) {
    var s = String(text || ''), skill = '', at = -1, target = null, m = /\((\d{1,2})\)/.exec(s);
    Object.keys(FR.SKILLS || {}).forEach(function (k) {
      var hit = new RegExp('\\b' + k + '\\b', 'i').exec(s);
      if (hit && (at < 0 || hit.index < at)) { at = hit.index; skill = k; }
    });
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 40) { target = Number(m[1]); }
    else { run.LEVELS.forEach(function (l) { if (target === null && new RegExp('\\b' + l.id + '\\b', 'i').test(s)) { target = l.target; } }); }
    return { skill: skill, target: target };
  };
  /* The roll request a try makes: what a phone is asked, and the two lines only the table keeps until
     the dice have landed. A try with no `check` gives what can be read from its free words. */
  run.ask = function (t) {
    var c = run.kind(t) === 'roll' ? t.check : run.guess(t.roll);
    return { label: cut(t.try, CAP.label), why: cut(t.hint, CAP.why), skill: c.skill || '', target: typeof c.target === 'number' ? c.target : null, yes: cut(t.yes, CAP.say), no: cut(t.no, CAP.say) };
  };
  /* A card's id says which try it is and where: 't2@arrival/square' is the third try of that scene,
     counting the ones kept off the phones. A proposal that arrives after the story has moved on is
     so still matched to the try it meant, never to whatever comes third in the scene now on screen. */
  run.cardId = function (key, i) { return ('t' + i + '@' + key).slice(0, CAP.id); };
  run.tryOf = function (st, id) {
    var m = /^t(\d+)@(.+)$/.exec(String(id || '')), all = m ? places(st) : [], hit;
    if (!m) { return null; }
    hit = all.filter(function (p) { return p.key === m[2]; });
    if (!hit.length && String(id).length >= CAP.id) { hit = all.filter(function (p) { return p.key.indexOf(m[2]) === 0; }); }     // a long name was cut to fit: one scene must still answer to it
    if (hit.length !== 1 || !(hit[0].scene.tries || [])[Number(m[1])]) { return null; }
    return { t: hit[0].scene.tries[Number(m[1])], i: Number(m[1]), key: hit[0].key, scene: hit[0].scene, chapter: hit[0].chapter };
  };
  /* The action cards of the place the story stands at: its tries, except those the author kept for
     the DM (card: false). An adventure in the first format was never written with phones in mind, so
     none of its tries are shown. */
  run.cards = function (st, at) {
    var out = [];
    if ((st.schema || 1) < 2 || !at.scene) { return out; }
    (at.scene.tries || []).forEach(function (t, i) {
      var label = cut(t.try, CAP.label);
      if (t.card !== false && label) { out.push({ id: run.cardId(at.key, i), label: label, hint: cut(t.hint, CAP.hint) }); }
    });
    return out.slice(0, CAP.cards);
  };

  /* ---------- what the players' phones may be told ---------- */
  /* "The story so far": the line each outcome and each hub choice carries, oldest first. An outcome
     with no line of its own is left out (its button's words were written for the DM). */
  run.story = function (st, dm) {
    var out = [];
    (dm.feed || []).forEach(function (e) {
      var o = e.k === 'pick' ? run.optionFor(st, e.ch) : null;
      if (e.k === 'out' && e.log && e.log !== e.label) { out.push(cut(e.log, CAP.log)); }
      if (o && o.log) { out.push(cut(o.log, CAP.log)); }
    });
    return out.filter(Boolean).slice(-CAP.story);
  };
  var size = function (v) { var j = JSON.stringify(v); return typeof TextEncoder === 'function' ? Math.max(j.length, new TextEncoder().encode(j).length) : unescape(encodeURIComponent(j)).length; };
  /* The table refuses a scene over its size whole, so one that long sheds what matters least first:
     the oldest lines of the story so far, then the last clues, then the last people. */
  function fit(s) {
    var room = CAP.bytes - 256, list;
    while (size(s) > room) {
      list = s.story.length ? s.story : (s.clues.length ? s.clues : (s.people.length ? s.people : null));
      if (!list) { break; }
      if (list === s.story) { list.shift(); } else { list.pop(); }
    }
    return s;
  }
  /* The scene state: everything a phone is told about where the story is. One function of the
     adventure and the session, and the only place that decides what players may know:
       - the summary is the scene's, else its chapter's; an interlude's or a hub's own
       - cards are the tries not marked card: false; nothing else of a try ever leaves this screen
       - a quest shows once `from` holds and is ticked once `done` holds; a clue once `when` holds
       - a person shows only with a `public` line, once its `when` holds, and only that line
       - DM notes, read-aloud text, secrets and the roll behind a try are never part of it
     On the cover nothing has been read out yet, so nothing but the adventure's name is told. */
  run.scene = function (st, dm) {
    var at = run.place(st, dm), two = (st.schema || 1) >= 2, holds = function (c) { return run.holds(st, dm, c); };
    var s = { id: cut(at.key, CAP.id), chapter: '', title: '', summary: '', img: '', cards: [], quests: [], clues: [], people: [], story: [] }, last = '';
    if (at.kind === 'cover') { s.title = cut(st.title, CAP.title); s.img = st.cover || ''; return s; }
    if (at.kind === 'scene') { s.chapter = at.chapter.title; s.title = at.scene.title; s.summary = at.scene.summary || at.chapter.summary; s.img = at.chapter.img; }
    else if (at.kind === 'bridge') { s.title = at.scene.title; s.summary = at.scene.summary; s.img = at.scene.img; }
    else if (at.kind === 'hub') { s.title = run.choices(st, dm, at.hub).length < at.hub.options.length || !at.hub.first ? at.hub.title : at.hub.first; s.summary = at.hub.summary; }
    else {                          // the end: the name of the story, over the last picture it showed
      (dm.feed || []).forEach(function (e) { var p = e.k === 'chapter' ? run.chapter(st, e.ch) : (e.k === 'bridge' ? run.interlude(st, e.i) : null); if (p && p.img) { last = p.img; } });
      s.chapter = st.title; s.title = 'The end'; s.img = last || st.cover;
    }
    s.chapter = cut(s.chapter, CAP.chapter); s.title = cut(s.title, CAP.title); s.summary = two ? cut(s.summary, CAP.summary) : ''; s.img = typeof s.img === 'string' ? s.img : '';
    s.cards = run.cards(st, at);
    if (!two) { return s; }
    (st.quests || []).forEach(function (q) { var text = cut(q.text, CAP.quest); if (text && holds(q.from)) { s.quests.push({ id: cut(q.id, CAP.id), text: text, done: !!q.done && holds(q.done) }); } });
    (st.clues || []).forEach(function (c) { var text = cut(c.text, CAP.clue); if (text && holds(c.when)) { s.clues.push({ id: cut(c.id, CAP.id), text: text }); } });
    ((st.bible && st.bible.people) || []).forEach(function (p) {
      var name = cut(p.name, CAP.name);
      if (name && p.public && typeof p.public === 'object' && holds(p.public.when)) { s.people.push({ id: cut(p.id, CAP.id), name: name, line: cut(p.public.line, CAP.line), img: typeof p.img === 'string' ? p.img : '' }); }
    });
    s.quests = s.quests.slice(0, CAP.quests); s.clues = s.clues.slice(0, CAP.clues); s.people = s.people.slice(0, CAP.people);
    s.story = run.story(st, dm);
    return fit(s);
  };
  /* The handouts that belong where the story stands: those with no `at`, and those whose `at` names
     this chapter, interlude or hub, or this very scene as 'chapter/scene'. */
  run.handouts = function (st, dm) {
    var at = run.place(st, dm), here = [at.key];
    if (at.kind === 'scene') { here.push(at.chapter.id); }
    return (st.handouts || []).filter(function (h) { return h && (h.at === undefined || here.indexOf(h.at) >= 0) && (h.text || h.img || h.title); });
  };
  /* The DM's brief, with each person it names looked up; null when the adventure has none to show. */
  run.brief = function (st) {
    var b = st.brief, list = function (v) { return (Array.isArray(v) ? v : []).filter(function (x) { return typeof x === 'string' && x.trim(); }); }, out;
    if (!b || typeof b !== 'object') { return null; }
    out = { about: typeof b.about === 'string' ? b.about.trim() : '', endings: list(b.endings), tips: list(b.tips),
      people: list(b.people).map(function (id) { return byId((st.bible && st.bible.people) || [], id); }).filter(Boolean) };
    return out.about || out.people.length || out.endings.length || out.tips.length ? out : null;
  };
  /* A cartridge's label as a row of chips: how long, how many, the mood, how much the DM needs to know,
     who it suits, and anything a table may want to know first. */
  run.chips = function (label) {
    var l = label || {}, suits = { everyone: 'Fine for everyone', teen: 'Best for teens and up', mature: 'Mature themes' }[l.rating] || '';
    return [l.length, l.players, l.tone, l.dm, suits].concat(Array.isArray(l.flags) ? l.flags : []).filter(function (x) { return typeof x === 'string' && x.trim(); });
  };

  /* ================= the shared table: what the whole room is shown, and what helps the DM pace it =================
     Still no screen in it. The stage is the one small object every phone and the big screen receive
     (docs/PHASE2.md, section 1.1): a map and which of its regions are uncovered, a picture held face
     down and then turned over, the soundscape, a one-off beat, whose moment it is and the turn order.
     Everything below builds parts of it from the adventure and the session, and nothing kept for the
     DM (a beat's button label, a foe's moves, the easier and harder lines) is ever in what it builds. */
  var SCAP = run.SCAP = { id: 40, title: 80, region: 40, regions: 24, who: 60, state: 20, order: 16, q: 120, option: 40, options: 4, session: 60000 };
  var pct = function (v) { return typeof v === 'number' && isFinite(v) ? Math.round(Math.min(100, Math.max(0, v)) * 100) / 100 : 0; };      // as the table keeps it: 0 to 100, to two places
  var text = function (v) { return typeof v === 'string' ? v : ''; };

  /* ---------- where the story has been ---------- */
  /* every scene, interlude and hub that has come up, oldest first */
  function reached(st, dm) {
    var out = [];
    ((dm && dm.feed) || []).forEach(function (e) {
      var ch = e.k === 'scene' ? run.chapter(st, e.ch) : null, p = ch ? ch.scenes[e.sc] : (e.k === 'bridge' ? run.interlude(st, e.i) : (e.k === 'hub' ? run.hubOf(st, e) : null));
      if (p) { out.push(p); }
    });
    return out;
  }
  /* The chapter, interlude or hub the story stands in, by its id: '' on the cover, '/end' at the end. */
  run.partNow = function (st, dm) {
    var at = run.place(st, dm);
    return at.kind === 'scene' ? at.chapter.id : (at.kind === 'bridge' ? at.scene.id : (at.kind === 'hub' ? at.hub.id : (at.kind === 'end' ? '/end' : '')));
  };

  /* ---------- the map ---------- */
  run.map = function (st, id) { return byId(st.maps, id) || null; };
  /* Which regions of a map are uncovered, in the map's own order: every region whose own `when` holds,
     every region a place the story has reached opens, and whatever the DM uncovered by hand; less
     what the DM covered again. `hand` is { regionId: true | false }, the DM's own say on a region. */
  run.mapOpen = function (st, dm, id, hand) {
    var m = run.map(st, id), open = {}, h = hand || {};
    if (!m) { return []; }
    (m.regions || []).forEach(function (r) { if (r.when && run.holds(st, dm, r.when)) { open[r.id] = true; } });
    reached(st, dm).forEach(function (p) { if (p.map && p.map.id === id) { (p.map.open || []).forEach(function (r) { open[r] = true; }); } });
    Object.keys(h).forEach(function (r) { open[r] = h[r] === true; });
    return (m.regions || []).map(function (r) { return r.id; }).filter(function (r) { return open[r] === true; });
  };
  /* The map as the stage carries it: every region as a name and a rectangle (never its `when`), and the ones uncovered. */
  run.stageMap = function (st, dm, id, hand) {
    var m = run.map(st, id);
    if (!m) { return null; }
    return { id: cut(m.id, SCAP.id), title: cut(m.title, SCAP.title), img: text(m.img),
      regions: (m.regions || []).slice(0, SCAP.regions).map(function (r) { return { id: cut(r.id, SCAP.id), name: cut(r.name, SCAP.region), x: pct(r.x), y: pct(r.y), w: pct(r.w), h: pct(r.h) }; }),
      open: run.mapOpen(st, dm, id, hand) };
  };

  /* ---------- what a place offers ---------- */
  /* Everything the place the story stands at offers the DM for the table: the map to put up, the
     soundscape (the place's own, else its chapter's), a picture to hold, its beats, a vote, its foes
     and the two lines of the difficulty dial. A place that offers nothing gives empty parts, which
     is every place of an adventure written before format 3. */
  run.offers = function (st, dm) {
    var at = run.place(st, dm), p = at.kind === 'hub' ? at.hub : at.scene, o = { key: at.key, kind: at.kind, map: null, sound: '', reveal: null, beats: [], vote: null, foes: [], easier: '', harder: '' };
    if (!p) { return o; }
    if (p.map && run.map(st, p.map.id)) { o.map = { id: p.map.id, open: (p.map.open || []).slice() }; }
    o.sound = text(p.sound) || (at.kind === 'scene' ? text(at.chapter.sound) : '');
    if (p.reveal && (p.reveal.title || p.reveal.img)) { o.reveal = { id: cut(p.reveal.id, SCAP.id), title: cut(p.reveal.title, SCAP.title), img: text(p.reveal.img) }; }
    o.beats = (Array.isArray(p.beats) ? p.beats : []).filter(function (b) { return b && b.kind; }).map(function (b) { return { id: text(b.id), label: text(b.label) || text(b.kind), kind: text(b.kind) }; });
    if (p.vote && p.vote.q && Array.isArray(p.vote.options)) { o.vote = { q: cut(p.vote.q, SCAP.q), options: p.vote.options.map(function (x) { return cut(x, SCAP.option); }).filter(Boolean).slice(0, SCAP.options) }; }
    o.foes = run.foes(st, p);
    o.easier = text(p.easier); o.harder = text(p.harder);
    return o;
  };
  /* What arriving at the place puts in front of the table, as parts of the stage: the place's map with
     everything uncovered so far, its soundscape at the level the DM keeps, and its picture face down.
     A part the place does not have is left out. o: { hand: { mapId: { regionId: true | false } }, level }. */
  run.stage = function (st, dm, o) {
    var f = run.offers(st, dm), out = {}, hand = (o && o.hand) || {}, level = o && typeof o.level === 'number' ? o.level : 1;
    if (f.map) { out.map = run.stageMap(st, dm, f.map.id, hand[f.map.id]); }
    if (f.sound) { out.sound = { bed: cut(f.sound, SCAP.id), level: Math.round(Math.min(1, Math.max(0, level)) * 100) / 100 }; }
    if (f.reveal) { out.reveal = run.held(f.reveal); }
    return out;
  };
  /* a picture held face down, and the same picture turned over; a beat as it is sent (its label is the DM's button and stays here) */
  run.held = function (pic) { return { id: cut(pic.id, SCAP.id), title: cut(pic.held || pic.title, SCAP.title), img: text(pic.img), shown: false }; };
  run.flipped = function (pic) { return { id: cut(pic.id, SCAP.id), title: cut(pic.title, SCAP.title), img: text(pic.img), shown: true }; };
  run.beat = function (b) { return { kind: cut(b && b.kind, 20) }; };
  /* The pictures a place has to show: its own reveal first, then its chapter's or its own picture, the
     people and things in it and its foes. `held` is the title while it is face down: a reveal brings
     its own (written to give nothing away); anything else waits under plain words. */
  run.pictures = function (st, dm) {
    var at = run.place(st, dm), p = at.scene, out = [], seen = {}, B = st.bible || {};
    var put = function (id, title, img, held) { if (typeof img === 'string' && img && !seen[img]) { seen[img] = 1; out.push({ id: cut(id, SCAP.id), title: cut(title, SCAP.title), img: img, held: cut(held || 'A picture, face down', SCAP.title) }); } };
    if (!p) { return out; }
    if (p.reveal) { put(p.reveal.id, p.reveal.title, p.reveal.img, p.reveal.title); }
    if (at.kind === 'scene') { put(at.chapter.id, at.chapter.title, at.chapter.img); } else { put(p.id, p.title, p.img); }
    (p.cast || []).forEach(function (id) { var x = byId(B.people, id); if (x) { put(x.id, x.full || x.name, x.img); } });
    (p.things || []).forEach(function (id) { var x = byId(B.things, id); if (x) { put(x.id, x.name, x.img); } });
    run.foes(st, p).forEach(function (f) { put(f.foe, f.name, f.img); });
    return out;
  };

  /* ---------- foes, and the turn order the table is shown ---------- */
  /* A foe's health is a word, never a number: fine until it is hit, out once it has taken all its hits,
     nearly done when one more will do it, hurt in between. */
  run.FOE = [{ id: 'fine', word: 'Fine' }, { id: 'hurt', word: 'Hurt' }, { id: 'nearly', word: 'Nearly done' }, { id: 'out', word: 'Out' }];
  run.foeState = function (hits, taken) {
    var h = Math.max(1, Math.min(6, Math.round(Number(hits)) || 1)), t = Math.max(0, Math.round(Number(taken)) || 0);
    return run.FOE[t <= 0 ? 0 : (t >= h ? 3 : (h - t === 1 ? 2 : 1))];
  };
  /* The foes of a place, each one its own entry: the same foe listed twice is two of them, told apart by number. */
  run.foes = function (st, p) {
    var ids = Array.isArray(p && p.foes) ? p.foes : [], many = {}, nth = {}, out = [];
    ids.forEach(function (id) { many[id] = (many[id] || 0) + 1; });
    ids.forEach(function (id) {
      var f = byId(st.foes, id);
      if (!f || !f.name) { return; }
      nth[id] = (nth[id] || 0) + 1;
      out.push({ foe: f.id, name: cut(f.name + (many[id] > 1 ? ' ' + nth[id] : ''), SCAP.who), img: text(f.img), hits: Math.max(1, Math.min(6, Math.round(Number(f.hits)) || 1)), moves: (Array.isArray(f.moves) ? f.moves : []).filter(function (m) { return typeof m === 'string' && m; }) });
    });
    return out;
  };
  /* The turn order, as the DM keeps it: highest number first, a tie keeps the order of arrival, and
     the adventure's foes (which roll nothing) take their turns after everyone who rolled. */
  run.turnSort = function (rows) {
    return (rows || []).slice().sort(function (a, b) { return (a.foe ? 1 : 0) - (b.foe ? 1 : 0) || b.total - a.total || a.ord - b.ord; });
  };
  /* The turn order as the stage carries it: a hero under their seat's id (the table lets go of the
     entry when the seat leaves), with their hero's name and portrait; everything else under an id of
     its own, as a foe. A foe from the adventure says how it is doing in a word. Sixteen at most. */
  run.order = function (turns, players) {
    var T = turns || {}, out = [], now = '', seat = {};
    (players || []).forEach(function (p) { seat[p.id] = p; });
    run.turnSort(T.rows).forEach(function (r) {
      var p = r.id ? seat[r.id] : null, e;
      if (r.id && !p) { return; }                 // their seat has gone
      e = p ? { id: p.id, name: cut((p.char && p.char.name) || p.name, SCAP.who), kind: 'hero', state: '', img: text(p.portrait) }
        : { id: cut(r.key, SCAP.id), name: cut(r.name, SCAP.who), kind: 'foe', state: r.foe ? run.foeState(r.hits, r.taken).word : '', img: text(r.img) };
      if (!e.id || !e.name || out.length >= SCAP.order) { return; }
      out.push(e);
      if (r.key === T.at) { now = e.id; }
    });
    return { order: out, now: now };
  };

  /* ---------- the spotlight: who has had a moment lately ---------- */
  /* For each player, when they last did something the table saw: a roll, a proposal, a roll the DM
     asked for, or a moment the DM gave them (`marks.spot`). Someone who has done nothing yet counts
     from when this screen first saw them (`marks.seen`). Quietest first. */
  run.quiet = function (players, acts, marks, now) {
    var last = {}, m = marks || {}, note = function (id, at) { if (id && typeof at === 'number' && at > (last[id] || 0)) { last[id] = at; } };
    var a = acts || {};
    (a.rolls || []).forEach(function (r) { if (r && r.role !== 'dm') { note(r.id, r.at); } });
    (a.asks || []).forEach(function (x) { if (x) { note(x.id, x.at); } });
    (a.requests || []).forEach(function (q) { Object.keys((q && q.results) || {}).forEach(function (id) { note(id, q.results[id].at || q.at); }); });
    Object.keys(m.spot || {}).forEach(function (id) { note(id, m.spot[id]); });
    return (players || []).map(function (p, i) {
      var acted = last[p.id] || 0, since = Math.max(acted, (m.seen && m.seen[p.id]) || 0);
      return { id: p.id, name: p.name, hero: (p.char && p.char.name) || '', acted: acted > 0, since: since, ms: since ? Math.max(0, now - since) : 0, i: i };
    }).sort(function (x, y) { return y.ms - x.ms || x.i - y.i; });
  };
  /* how long, in the fewest words: "just now", "4 min", "1 h 10 min" */
  run.span = function (ms) {
    var m = Math.round(Math.max(0, ms) / 60000);
    return m < 1 ? 'just now' : (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''));
  };

  /* ---------- the chapter map: the adventure's flow as a graph ----------
     Nodes are the chapters, interludes and hubs, and one ending for every part the story can end
     from. Edges are what leads where: a part's `next`, a hub's options, an outcome that names
     somewhere to go, and the shortcuts. It is laid out in layers from the start (`layer`), each
     node with a place across its layer (`slot` of `of`); an edge that leads back up is marked
     `back`. Then the session colours it:
       a node is  here (the party's place), seen, ahead, or closed (it cannot come up any more)
       an edge is taken, open, or closed: out of the party's place that is every `next` the flags do
                  not point to as things stand, and a shortcut whose target has come up; anywhere
                  the story can no longer reach, every way not taken. */
  run.graph = function (st, dm) {
    var F = st.flow, nodes = [], at = {}, edges = [], key = {}, feed = (dm && dm.feed) || [], session = dm || { feed: [], flags: {}, order: [] };
    var node = function (id, kind, title) { if (!at[id]) { at[id] = { id: id, kind: kind, title: text(title), layer: 0, slot: 0, of: 1, state: 'ahead', start: false }; nodes.push(at[id]); } return at[id]; };
    var endOf = function (from) { return node('/end:' + from, 'end', 'The end').id; };
    /* one edge for each pair, however many things lead that way; `via` remembers which */
    var edge = function (from, to, via, rule) {
      var k = from + '>' + to, e = key[k];
      if (!at[to]) { to = endOf(from); k = from + '>' + to; e = key[k]; }           // a name nothing answers to ends the story (see goTo)
      if (!e) { e = key[k] = { from: from, to: to, kind: via, shortcut: false, back: false, state: 'open', via: {} }; edges.push(e); }
      if (via === 'next') { (e.via.next = e.via.next || []).push(rule); } else { e.via[via] = true; }
      if (via === 'shortcut') { e.shortcut = true; }
    };
    var rules = function (from, list) { (list || []).forEach(function (r, i) { edge(from, r.end || !r.to ? endOf(from) : r.to, 'next', i); }); };
    var outs = function (from, s) { ((s && s.outcomes) || []).forEach(function (o) { if (o.end) { edge(from, endOf(from), 'outcome'); } else if (o.to) { edge(from, o.to, 'outcome'); } }); };
    F.chapters.forEach(function (c) { node(c.id, 'chapter', c.title); });
    (F.interludes || []).forEach(function (s) { node(s.id, 'interlude', s.title); });
    run.hubs(st).forEach(function (h) { node(h.id, 'hub', h.title); });
    F.chapters.forEach(function (c) { rules(c.id, c.next); c.scenes.forEach(function (s) { outs(c.id, s); }); });
    (F.interludes || []).forEach(function (s) { rules(s.id, s.next); outs(s.id, s); });
    run.hubs(st).forEach(function (h) { h.options.forEach(function (o) { edge(h.id, o.to, 'option'); }); rules(h.id, h.next); });
    (F.shortcuts || []).forEach(function (sc) { (sc.at || []).forEach(function (a) { if (at[a] && at[sc.to]) { edge(a, sc.to, 'shortcut'); } }); });
    if (at[F.start]) { at[F.start].start = true; }
    var from = function (id) { return edges.filter(function (e) { return e.from === id; }); };

    /* layers: first find the edges that lead back up (to a node still being walked), then give every
       node the length of the longest way to it that uses none of them */
    var mark = {}, order = [];
    (function walk(id) {
      if (!at[id]) { return; }
      mark[id] = 1; order.push(id);
      from(id).forEach(function (e) { if (mark[e.to] === 1) { e.back = true; } else if (!mark[e.to]) { walk(e.to); } });
      mark[id] = 2;
    })(at[F.start] ? F.start : (nodes[0] || {}).id);
    nodes.forEach(function (n) { if (!mark[n.id]) { order.push(n.id); } });         // nothing leads to it: it still gets a place
    var into = {}, todo = [], deep = 0;
    nodes.forEach(function (n) { into[n.id] = 0; });
    edges.forEach(function (e) { if (!e.back) { into[e.to]++; } });
    order.forEach(function (id) { if (!into[id]) { todo.push(id); } });
    while (todo.length) {
      var id = todo.shift();
      from(id).forEach(function (e) {
        if (e.back) { return; }
        at[e.to].layer = Math.max(at[e.to].layer, at[id].layer + 1);
        if (--into[e.to] === 0) { todo.push(e.to); }
      });
    }
    nodes.forEach(function (n) { deep = Math.max(deep, n.layer); });

    /* the session: where the party is, where it has been, and the ways it went */
    var here = run.partNow(st, session), seen = {}, cur = '';
    var took = function (a, b) {
      var direct = key[a + '>' + b], via;
      if (direct) { direct.state = 'taken'; return true; }
      via = run.hubs(st).filter(function (h) { return key[a + '>' + h.id] && key[h.id + '>' + b]; })[0];      // through a hub with nothing left to choose: it is passed, never stopped at
      if (via) { key[a + '>' + via.id].state = 'taken'; key[via.id + '>' + b].state = 'taken'; seen[via.id] = true; }
      return !!via;
    };
    feed.forEach(function (e) {
      var id = e.k === 'chapter' ? e.ch : (e.k === 'bridge' ? (run.interlude(st, e.i) || {}).id : (e.k === 'hub' ? (run.hubOf(st, e) || {}).id : ''));
      if (e.k === 'end' && cur) {
        /* the ending this part leads to: its own, or the one beyond a hub it passed; if the adventure draws none, one is drawn now */
        var hub = run.hubs(st).filter(function (h) { return key[cur + '>' + h.id] && at['/end:' + h.id]; })[0];
        if (!at['/end:' + cur] && !hub) { edge(cur, endOf(cur), 'outcome'); order.push('/end:' + cur); }
        took(cur, at['/end:' + cur] ? '/end:' + cur : '/end:' + hub.id);
        here = at['/end:' + cur] ? '/end:' + cur : '/end:' + hub.id;
        return;
      }
      if (!id || !at[id]) { return; }
      if (cur && cur !== id) { took(cur, id); }
      seen[id] = true; cur = id;
    });
    if (here === '/end') { here = ''; }                  // an ending nothing led to: nowhere on the map to stand
    nodes.forEach(function (n) { if (n.kind === 'end') { n.layer = deep; } });       // every ending sits on the last line
    var rows = [];
    order.forEach(function (id) { var n = at[id]; (rows[n.layer] = rows[n.layer] || []).push(n); });
    rows.forEach(function (row) { row.forEach(function (n, i) { n.slot = i; n.of = row.length; }); });

    /* out of the party's place: which ways stand open as things are now */
    var nextOf = function (n) {
      var part = n.kind === 'chapter' ? run.chapter(st, n.id) : (n.kind === 'hub' ? byId(run.hubs(st), n.id) : byId(F.interludes, n.id));
      return (part && part.next) || [];
    };
    var live = function (e) {
      var hit = -1;
      if (e.state === 'taken' || e.via.outcome) { return true; }
      if (e.via.shortcut && !seen[e.to]) { return true; }
      if (e.via.option && (session.order || []).indexOf(e.to) < 0) { return true; }
      if (!e.via.next) { return false; }
      nextOf(at[e.from]).forEach(function (r, i) { if (hit < 0 && run.holds(st, session, r.when)) { hit = i; } });       // the first rule that holds is the one the story will follow
      return e.via.next.indexOf(hit) >= 0;
    };
    var can = {}, walkOn = function (id) { if (can[id]) { return; } can[id] = true; from(id).forEach(function (e) { if (id !== here || live(e)) { walkOn(e.to); } }); };
    if (here) { walkOn(here); } else { nodes.forEach(function (n) { can[n.id] = true; }); }      // on the cover everything is still ahead
    nodes.forEach(function (n) { n.state = n.id === here ? 'here' : (seen[n.id] ? 'seen' : (can[n.id] ? 'ahead' : 'closed')); });
    edges.forEach(function (e) {
      if (e.state === 'taken') { return; }
      e.state = e.from === here ? (live(e) ? 'open' : 'closed') : (can[e.from] ? 'open' : 'closed');
    });
    edges.forEach(function (e) { delete e.via; });
    return { nodes: nodes, edges: edges, layers: rows.length };
  };

  /* ---------- the pacing clock ----------
     How the time spent compares with what the adventure planned. Every chapter and interlude may
     say about how many `minutes` it takes. The story so far was planned to take somewhere between
     `lo` (the scene the party is in has only just begun) and `hi` (it is just ending): inside that,
     give or take a few minutes, the table is on time. `left` is what is still planned, leaving out
     whatever can no longer come up. `cuts` are the adventure's shortcuts on offer right here, and
     `later` the ones that open further on. With no minutes anywhere there is no clock: null. */
  run.SLACK = 3;
  run.pace = function (st, dm, spentMs) {
    var F = st.flow, parts = {}, total = 0, any = false, done = 0, lo, hi, at = run.place(st, dm), here = run.partNow(st, dm), seen = {}, g, left = 0, spent = Math.max(0, (Number(spentMs) || 0) / 60000), m, n, cuts = [], later = [], state;
    F.chapters.concat(F.interludes || []).forEach(function (p) { var v = Number(p.minutes); if (v > 0) { any = true; parts[p.id] = v; total += v; } else { parts[p.id] = 0; } });
    if (!any) { return null; }
    (dm.feed || []).forEach(function (e) { var id = e.k === 'chapter' ? e.ch : (e.k === 'bridge' ? (run.interlude(st, e.i) || {}).id : ''); if (id) { seen[id] = true; } });
    Object.keys(seen).forEach(function (id) { if (id !== here) { done += parts[id] || 0; } });
    m = parts[here] || 0;
    if (at.kind === 'scene') { n = at.chapter.scenes.length; lo = done + m * at.chapter.scenes.indexOf(at.scene) / n; hi = done + m * (at.chapter.scenes.indexOf(at.scene) + 1) / n; }
    else if (at.kind === 'bridge') { lo = done; hi = done + m; }
    else { lo = hi = done; }
    g = run.graph(st, dm);
    g.nodes.forEach(function (x) { if (x.state === 'ahead') { left += parts[x.id] || 0; } });
    if (at.kind === 'scene' || at.kind === 'bridge') { left += done + m - lo; }
    (F.shortcuts || []).forEach(function (sc) {
      if (run.seen(st, sc.to, dm.feed || [])) { return; }
      if (at.kind !== 'cover' && at.kind !== 'end' && (sc.at || []).indexOf(here) >= 0) { cuts.push(sc); }
      else if ((sc.at || []).some(function (a) { var x = byId(g.nodes, a); return x && (x.state === 'ahead' || x.state === 'seen'); }) && at.kind !== 'end') { later.push(sc); }
    });
    state = at.kind === 'cover' ? 'on' : (spent < lo - run.SLACK ? 'ahead' : (spent > hi + run.SLACK ? 'behind' : 'on'));
    return { total: total, lo: lo, hi: hi, spent: spent, left: left, state: state, by: Math.round(state === 'ahead' ? lo - spent : (state === 'behind' ? spent - hi : 0)), cuts: cuts, later: later };
  };

  /* ---------- the session on the table ----------
     The DM's session is saved to the table, so another DM device (or this one tomorrow) carries on
     from the same place. Three times decide what a device does when it looks at the table:
       local   when this device's own session last changed (0: it has no story of its own)
       base    the table's save this device last took up or made itself (0: none at this table)
       table   the table's newest save (0: nothing saved there)
     'adopt' takes up the table's without asking: the table has a save this device has not seen and
     this device has nothing newer. 'save' sends this device's. 'ask' is the one true conflict: the
     table has a save this device has not seen, and this device has moved on since that save was
     made. `same` says both already hold the same story, so there is nothing to ask about. */
  run.sync = function (o) {
    var L = Number(o.local) || 0, B = Number(o.base) || 0, T = Number(o.table) || 0;
    if (!T) { return L ? 'save' : 'none'; }
    if (T === B) { return L > B ? 'save' : 'none'; }
    if (L <= B || o.same || T > L) { return 'adopt'; }
    return 'ask';
  };
  /* the story itself, as one string: do two sessions stand at the same place by the same road? */
  run.storySig = function (dm) {
    var d = dm || {};
    return JSON.stringify([(d.feed || []).filter(function (e) { return e.k !== 'ai' && e.k !== 'pic'; }), d.flags || {}, d.order || []]);
  };
  /* The session as the table keeps it: one string of at most `max` characters. One too long sheds what
     matters least: what the painter was told, then the helper's answers and the pictures, oldest
     first. The story itself (where it has been, the flags, the turn order) is never cut. */
  run.pack = function (dm, max) {
    var d = JSON.parse(JSON.stringify(dm || {})), room = max || SCAP.session, i, s;
    delete d.base; delete d.table;                       // which save a device last saw is that device's own business
    s = JSON.stringify(d);
    if (s.length <= room) { return s; }
    (d.feed || []).forEach(function (e) { if (e.k === 'pic') { delete e.brief; } });
    for (i = 0; i < (d.feed || []).length && JSON.stringify(d).length > room; i++) {
      if (d.feed[i].k === 'ai' || d.feed[i].k === 'pic') { d.feed.splice(i, 1); i--; }
    }
    s = JSON.stringify(d);
    if (s.length > room) { d.party = []; if (d.turns) { d.turns.rows = []; d.turns.at = ''; } s = JSON.stringify(d); }
    return s.length <= room ? s : '';
  };
  /* a session read back from the table: an object with a feed, or nothing */
  run.unpack = function (save) {
    var d = null;
    try { d = JSON.parse(save || 'null'); } catch (e) { d = null; }
    return d && typeof d === 'object' && Array.isArray(d.feed) && d.feed.length ? d : null;
  };

  if (typeof document === 'undefined') { return; }           // no screen here (the unit tests): the rest is the DM's screens

  /* ================= the screens ================= */
  var A = FR.app, $ = A.$, el = A.el, clear = A.clear;

  /* The one place this file gets its adventure from: the scenario pack being played. A pack's
     adventure.js is only fetched when somebody opens the DM door (see the b-dm handler), so until
     then there is none. */
  function adventure() { return (FR.ADVENTURES && FR.theme && FR.ADVENTURES[FR.theme.id]) || null; }

  var ST = null, KEY = '';
  var DM = fresh();
  /* tab: what a phone's single column shows (run, chapters, brief, asks, rolls, lookup, party). side: what the
     pane beside the story shows on a wide screen (table, asks, rolls, dict). entry: the dictionary entry open in a pane. */
  var ui = { tab: 'run', side: 'table', entry: null, lookup: 'all', q: '', busy: false, sayFor: null, painting: false, seenRoll: 0,
    rollTo: 'all', ak: {}, form: null, see: false,         // who the next roll is asked of, answers half given, the roll being written, whether the phones' view is open
    stg: null, dial: '', key: '', keyFor: '', keyFail: '', moves: {} };      // is "For the whole table" open (null: the place decides), which line of the difficulty dial shows, the big screen's key and the table it is for, and which foes have their moves open

  /* Take up whatever the accessor gives. Asked again at the door, in case it changed after the page loaded. */
  function take() {
    var st = adventure();
    if (st && st !== ST) { ST = st; KEY = 'firstroll.dm.' + ST.id + '.v1'; DM = fresh(); }
    return !!ST;
  }
  take();

  /* The session is a feed of entries, saved exactly as it is: cover, chapter {ch}, scene {ch, sc},
     bridge {i} (an interlude, by its place in the adventure's list), hub (plus {id} unless it is the
     first hub), pick {ch}, out {label, log}, wrap {ch} (the leaving text), end, and the helper's
     ai {mode, q, a, src, res} and pic entries (an ai entry's mode is try, say, twist, recap, bridge or
     steer). flags and order (the chapters picked at hubs) sit beside it, and so do party
     (players typed in by hand) and turns (the turn order, which has its own section below). A session
     saved before turns existed simply starts with an empty order.
     Added with the shared table (docs/PHASE2.md), each with a default, so a session saved before
     them loads as it always did:
       stage   what this session has done with the stage: at (the place whose map and sound were last
               put up by themselves), map (the id of the map that is up, '' for none), hand ({ mapId:
               { regionId: true | false } }: regions the DM uncovered or covered by hand), auto (the
               soundscape follows the story), level (how loud, 0 to 1) and here (this device plays the
               soundscape too: true, false, or null to play it only while no big screen is linked)
       clock   { spent }: milliseconds of play so far, for the pacing clock
       at      when the session last changed, by the table's clock (0: never)
       base    the save on the table this device last took up or made, and  table  the code of that
               table: together they say whether the table holds a newer session (see FR.run.sync).
               These two are a device's own and are not part of what the table keeps. */
  function noTurns() { return { code: '', rows: [], at: '', round: 1, after: 0, seen: 0, ord: 0 }; }
  function noStage() { return { at: '', map: '', hand: {}, auto: true, level: 1, here: null }; }
  function fresh() { return { feed: [{ k: 'cover' }], flags: {}, order: [], party: [], signed: '', turns: noTurns(), stage: noStage(), clock: { spent: 0 }, at: 0, base: 0, table: '' }; }
  /* the time, by the table's clock where there is one, so two DM devices agree on which save is newer */
  function stamp() { return Math.round(atTable() && TB.serverNow ? TB.serverNow() : Date.now()); }
  /* Every change to the session goes through here: kept on this device at once and, a moment later, on
     the table. `quiet` is for bookkeeping that is no change to the story (the clock ticking, which
     save was last seen): it is kept here and neither marks the session as newer nor sends it. */
  function save(quiet) {
    if (!quiet) { DM.at = Math.max(stamp(), (DM.at || 0) + 1); }
    try { A.store.set(KEY, JSON.stringify(DM)); } catch (e) { /* storage full: the session still runs */ }
    if (!quiet) { keepOnTable(); }
  }
  /* a session from an earlier version, or from the table: every part it lacks gets its default */
  function whole(d) {
    var S = d.stage && typeof d.stage === 'object' ? d.stage : {}, n = noStage();
    d.flags = d.flags || {}; d.order = d.order || []; d.party = d.party || [];
    d.turns = d.turns && Array.isArray(d.turns.rows) ? d.turns : noTurns();
    d.stage = { at: typeof S.at === 'string' ? S.at : n.at, map: typeof S.map === 'string' ? S.map : n.map, hand: S.hand && typeof S.hand === 'object' ? S.hand : {}, auto: S.auto !== false, level: typeof S.level === 'number' ? S.level : n.level, here: S.here === true || S.here === false ? S.here : null };
    d.clock = { spent: Math.max(0, Number(d.clock && d.clock.spent) || 0) };
    d.at = Number(d.at) || 0; d.base = Number(d.base) || 0; d.table = typeof d.table === 'string' ? d.table : '';
    d.feed = d.feed.filter(function (e) { return !e.wait && !(e.k === 'pic' && !e.url && !e.err && !pics[e.id]); });
    return d;
  }
  function load() {
    try { var d = JSON.parse(A.store.get(KEY) || 'null'); if (d && d.feed && d.feed.length && fits(d)) { DM = whole(d); } } catch (e) { /* start fresh */ }
  }
  /* a saved session only counts if everything it points at is still in the adventure */
  function fits(d) {
    return d.feed.every(function (e) {
      if (e.k === 'chapter' || e.k === 'scene' || e.k === 'wrap') { var c = chapter(e.ch); return !!c && (e.k !== 'scene' || !!c.scenes[e.sc]); }
      if (e.k === 'pick') { return !!chapter(e.ch) && !!optionFor(e.ch); }
      if (e.k === 'bridge') { return !!interlude(e.i); }
      if (e.k === 'hub') { return !!hubOf(e); }
      return true;
    });
  }

  /* ---------- small lookups: FR.run's, asked about the adventure and the session on screen ---------- */
  var bib = function (kind) { return (ST.bible && ST.bible[kind]) || []; };            // people, places or things
  var person = function (id) { return byId(bib('people'), id); };
  var fullName = function (p) { return p.full || p.name; };
  var chapter = function (id) { return run.chapter(ST, id); };
  var interlude = function (i) { return run.interlude(ST, i); };
  var hubs = function () { return run.hubs(ST); };
  var hubOf = function (e) { return run.hubOf(ST, e); };
  var choices = function (hub) { return run.choices(ST, DM, hub); };   // what is still on offer
  var optionFor = function (ch) { return run.optionFor(ST, ch); };
  var wordFor = function (key, plain) { return (ST.labels && ST.labels[key]) || plain; };   // the story's own word for something, or a plain one
  var fill = function (text, vars) { return String(text).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] === undefined ? m : vars[k]; }); };
  var last = function () { return DM.feed[DM.feed.length - 1]; };
  function resolved(i) { var n = DM.feed[i + 1]; return !!n && (n.k === 'out' || n.k === 'pick'); }
  function current() {            // the entry still waiting for the DM, if any
    for (var i = DM.feed.length - 1; i >= 0; i--) {
      var e = DM.feed[i];
      if (e.k === 'scene' || e.k === 'bridge' || e.k === 'hub' || e.k === 'cover') { return hasAnswer(i) ? null : { e: e, i: i }; }
    }
    return null;
  }
  function hasAnswer(i) {
    for (var j = i + 1; j < DM.feed.length; j++) { var k = DM.feed[j].k; if (k === 'out' || k === 'pick' || k === 'chapter') { return true; } if (k === 'scene' || k === 'bridge' || k === 'hub') { return false; } }
    return false;
  }
  function sceneOf(e) { return e.k === 'bridge' ? interlude(e.i) : chapter(e.ch).scenes[e.sc]; }
  function where() {              // chapter id and scene object for the AI and the header
    for (var i = DM.feed.length - 1; i >= 0; i--) {
      var e = DM.feed[i];
      if (e.k === 'scene') { return { ch: e.ch, title: chapter(e.ch).title, goal: chapter(e.ch).goal, scene: chapter(e.ch).scenes[e.sc], n: e.sc + 1, of: chapter(e.ch).scenes.length }; }
      if (e.k === 'bridge') { return { ch: 'bridge', title: interlude(e.i).title, goal: interlude(e.i).goal || '', scene: interlude(e.i), n: 1, of: 1 }; }
      if (e.k === 'hub') { return { ch: 'hub', title: hubOf(e).title, goal: hubOf(e).goal || '', scene: null, n: 0, of: 0 }; }
    }
    return { ch: 'cover', title: ST.title, goal: '', scene: null, n: 0, of: 0 };
  }

  /* ---------- conditions: the adventure's `when`, as FR.run reads them ---------- */
  function seen(id, feed) { return run.seen(ST, id, feed); }
  function holds(c, feed) { return run.holds(ST, DM, c, feed); }
  /* story time, by the adventure's clock: for the whole session, or as it stood when a given entry came up */
  function clockAt(feed) {
    var rows = (ST.clock && ST.clock.times) || [];
    for (var i = 0; i < rows.length; i++) { if (holds(rows[i].when, feed)) { return rows[i].say || ''; } }
    return '';
  }
  function bell() { return where().ch === 'cover' ? '' : clockAt(DM.feed); }
  /* which version of a scene's read-aloud to use: the DM's own choice, else the first suggestion that holds */
  function version(s) {
    var v = s.versions, got = v.flag ? byId(v.options, DM.flags[v.flag]) : null;
    (v.suggest || []).forEach(function (r) { if (!got && holds(r.when)) { got = byId(v.options, r.use); } });
    return got || v.options[0];
  }

  /* ---------- the engine: FR.run moves the story on; here it is saved and drawn ---------- */
  function push(e) { DM.feed.push(e); return DM.feed.length - 1; }
  function done(scrollTo) { clockTick(); save(); render(); if (scrollTo !== undefined) { scrollToEntry(scrollTo); } }
  function begin() { done(run.begin(ST, DM)); }
  function choose(entry, o) { done(run.choose(ST, DM, entry, o)); }
  function pick(id) { done(run.pick(ST, DM, id)); }
  function jump(sc) { var first = run.jump(ST, DM, sc); ui.tab = 'run'; done(first); }

  /* ---------- everything the AI is told ---------- */
  function bible() {
    var t = [], B = ST.bible || {}, part = function (head, list, row) { if (list && list.length) { t.push(head + ':\n' + list.map(row).join('\n')); } };
    var entry = function (p) { return '- ' + p.name + ': ' + p.blurb; };
    t.push('ADVENTURE: ' + ST.title + '. ' + ST.pitch);
    if (B.truths && B.truths.length) { t.push('WHAT IS REALLY GOING ON:\n- ' + B.truths.join('\n- ')); }
    part('PEOPLE', B.people, function (p) { return '- ' + fullName(p) + (p.role ? ' (' + p.role + ')' : '') + '.' + (p.where ? ' Found: ' + p.where + '.' : '') + (p.voice ? ' Voice: ' + p.voice : '') + (p.wants ? ' Wants: ' + p.wants : '') + (p.secret ? ' Secret: ' + p.secret : ''); });
    part('PLACES', B.places, entry);
    part('THINGS', B.things, entry);
    t.push('PLANNED CHAPTERS:\n' + ST.flow.chapters.map(function (c) { return '- ' + c.title + ': ' + c.goal; }).join('\n') + (B.outline ? '\n' + B.outline : ''));
    return t.join('\n\n');
  }
  function happened() {
    var out = [];
    DM.feed.forEach(function (e) {
      if (e.k === 'out' && e.log) { out.push(e.log); }
      if (e.k === 'pick') { out.push(optionFor(e.ch).log || 'The party chose ' + optionFor(e.ch).title + '.'); }
      if (e.k === 'ai' && e.mode === 'try' && e.res) { out.push('They tried: ' + e.q + '. ' + (e.res === 'yes' ? 'It worked: ' + e.a.yes : 'It did not work: ' + e.a.no)); }
      if (e.k === 'ai' && e.mode === 'twist' && e.a.read) { out.push('Twist: ' + e.a.read); }
    });
    return out.slice(-16);
  }
  function prompt(mode, input) {
    var w = where(), s = w.scene, f = DM.flags, H = ST.helper || {}, defs = ST.flags || {};
    /* who the helper is, and the mood, are the adventure's; how a co-storyteller works is the same for every story */
    var system = (H.role || 'You are helping a Dungeon Master run a tabletop adventure, live, with the players listening.') + ' ' +
      'Stay inside the story bible below and never contradict it or what has already happened. ' + (H.tone ? H.tone + ' ' : '') +
      'The plot is already planned. Your job is to bend it a little so the players’ ideas matter, then point back toward the goal of the current scene. Do not resolve the chapter for them and do not skip ahead. ' +
      'Read-aloud text is spoken to the players as “you”, present tense, two or three short sentences, ' + (H.voice || 'vivid and simple to speak') + ', no game terms. ' +
      'Rolls use a d20 plus a skill (Athletics, Acrobatics, Sleight of Hand, Stealth, Arcana, History, Investigation, Nature, Religion, Animal Handling, Insight, Medicine, Perception, Survival, Deception, Intimidation, Performance, Persuasion) at easy (10), medium (13) or hard (16).\n\n' + bible();
    var party = partyList().filter(function (p) { return p.who || p.name; }).map(function (p) { return (p.name || wordFor('hero', 'A hero')) + (p.race || p.cls ? ', a ' + [p.race, p.cls].filter(Boolean).join(' ') : '') + (p.who ? ' (played by ' + p.who + ')' : ''); });
    var user = [];
    if (party.length) { user.push('THE PARTY: ' + party.join('; ') + '.'); }
    if (ST.clock) { user.push('THE CLOCK: ' + (bell() || 'not started') + '.' + (ST.clock.deadline ? ' ' + ST.clock.deadline : '')); }
    var hp = happened();
    user.push('WHAT HAS HAPPENED SO FAR:\n' + (hp.length ? '- ' + hp.join('\n- ') : '- Nothing yet.'));
    /* every flag that is set and has something to tell, in the adventure's own words and order */
    var st = [];
    Object.keys(defs).forEach(function (k) { if (f[k] && defs[k].tell) { st.push(fill(defs[k].tell, { word: defs[k].words && defs[k].words[f[k]] !== undefined ? defs[k].words[f[k]] : f[k] })); } });
    if (st.length) { user.push((H.flagsHeading || 'WHAT THE PARTY HAS AND KNOWS') + ': ' + st.join('; ') + '.'); }
    user.push('NOW: chapter “' + w.title + '”. Goal: ' + w.goal + (s ? '\nScene “' + s.title + '”.' + (s.read && s.read.length ? ' The players were just told: ' + s.read.join(' ') : '') + (s.notes && s.notes.length ? '\nDM notes for this scene: ' + s.notes.join(' ') : '') : ''));
    var ask = {
      try: 'The players try this: “' + input + '”. Fill "ask" (the roll to call for, written exactly like "Acrobatics, medium (13)", or "No roll needed"), "yes" (read-aloud if it works), "no" (read-aloud if it does not: ' + (H.fail || 'something still happens, and the story keeps moving') + ') and "note" (for the DM, at most two short sentences: how this bends the plan or what to remember later). Leave "read" empty.',
      say: 'The DM needs words for ' + (ui.sayFor ? fullName(person(ui.sayFor)) : 'a character in the scene') + (input ? ', about: “' + input + '”' : ', reacting to what just happened') + '. Put two or three separate short lines in their exact voice in "read", one per line. Put one acting tip in "note". Leave the other fields empty.',
      twist: 'Give one small surprise or complication that fits this exact moment' + (input ? ' (the DM suggests: “' + input + '”)' : '') + '. Put it in "read" as read-aloud. In "note" say, in at most two short sentences, how the DM should use it and how it ends within a couple of minutes. Leave the other fields empty.',
      recap: 'Write a “previously” for the table in "read": three or four sentences covering what has happened so far, ending on where the party stands right now. Leave the other fields empty.',
      bridge: 'The party is moving on. Write the read-aloud that carries them from what just happened into what comes next, reflecting how things actually went, in "read" (three or four sentences). In "note" give the DM one thing from earlier to call back to. Leave the other fields empty.',
      steer: 'The players did this: “' + input + '”. It pulls away from the scene. Help the DM bring the story back without saying no. In "read" give two or three sentences of read-aloud in which the world answers what they did and points back toward the goal of this scene. In "note" tell the DM, in at most two short sentences, what to do next. Leave the other fields empty.'
    }[mode];
    user.push('REQUEST: ' + ask + '\n\nReply with ONLY one JSON object with exactly these string fields: {"ask": "", "yes": "", "no": "", "read": "", "note": ""}');
    return { system: system, user: user.join('\n\n') };
  }

  /* ---------- three ways to answer: the app's server, Claude in the hosted page, or built-in ---------- */
  var claudeSample = null;
  if (window.claude && window.claude.use) { window.claude.use('sample').then(function (s) { claudeSample = s; if (A.screen() === 'dm') { renderAsk(); } }).catch(function () { claudeSample = null; }); }
  var tidy = function (j) { var o = {}; ['ask', 'yes', 'no', 'read', 'note'].forEach(function (k) { o[k] = j && typeof j[k] === 'string' ? j[k].trim() : ''; }); return o; };
  var aiSource = function () { return A.isLive() ? 'openai' : (claudeSample ? 'claude' : 'local'); };
  function askAI(mode, input) {
    var p = prompt(mode, input);
    if (A.isLive()) {
      return A.text(p.system, p.user, { json: true, max: 500 }).then(function (j) { return { a: tidy(j.json), src: 'openai' }; }).catch(function () { return { a: builtin(mode, input), src: 'local' }; });
    }
    if (claudeSample) {
      return claudeSample.json(p.system + '\n\n' + p.user, { modelTier: 'quick', cache: false }).then(function (j) { return { a: tidy(j), src: 'claude' }; }).catch(function (e) {
        if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled' || e.code === 'not_declared' || e.code === 'capability_disabled')) { claudeSample = null; }
        return { a: builtin(mode, input), src: 'local', why: e && e.code };
      });
    }
    return Promise.resolve({ a: builtin(mode, input), src: 'local' });
  }
  function builtin(mode, input) {
    var w = where(), s = w.scene, pk = FR.pick, B = (ST.helper && ST.helper.builtin) || {};
    var some = function (list, plain) { return list && list.length ? list : [plain]; };      // the adventure's own lines, or one plain line
    if (mode === 'say') {
      var p = person(ui.sayFor) || person(s && s.cast && s.cast[0]) || bib('people')[0];
      if (!p) { return { ask: '', yes: '', no: '', read: '', note: 'This adventure lists nobody to speak for.' }; }
      var ls = (p.lines || []).slice().sort(function () { return Math.random() - 0.5; }).slice(0, 2);
      return { ask: '', yes: '', no: '', read: ls.join('\n'), note: 'Voice: ' + p.voice };
    }
    if (mode === 'twist') {
      return { ask: '', yes: '', no: '', note: 'Keep it to a minute or two, then return to the scene.', read: pk(some(B.twists, 'Something nobody planned for interrupts the scene. Decide what it is, and keep it small.')) };
    }
    if (mode === 'steer') {          // back to the plot: the scene's own advice, what the scene is for, and a few things that do lead somewhere
      var leads = ((s && s.tries) || []).filter(function (t) { return t.card !== false; }).slice(0, 3).map(function (t) { return t.try; });
      return { ask: '', yes: '', no: '', read: '', note: [(s && s.otherwise) || 'Let it happen, briefly, and let the world carry on around it.',
        w.goal ? 'Then point back at what this moment is for: ' + w.goal : '', leads.length ? 'If they are stuck, offer one of these: ' + leads.join('; ') + '.' : ''].filter(Boolean).join(' ') };
    }
    if (mode === 'recap' || mode === 'bridge') {
      var hp = happened().slice(-5);
      return { ask: '', yes: '', no: '', read: hp.length ? 'So far: ' + hp.join(' ') : (B.nothingYet || 'The story has only just begun.'), note: 'Built-in recap: your own words will be better.' };
    }
    return { ask: 'Whichever skill fits best, medium (13)',
      yes: pk(some(B.yes, 'It works.')),
      no: pk(some(B.no, 'That fails, yet a different way forward shows itself.')),
      read: '', note: (s && s.otherwise) ? s.otherwise : 'Say yes if you can. Then steer back to the goal: ' + w.goal };
  }

  /* ---------- voice: narrate a read-aloud box, dictate what the players try ---------- */
  var Voice = { tts: null, dict: null, native: false };
  if (window.claude && window.claude.use) {
    window.claude.use('tts').then(function (t) { Voice.tts = t; if (t && A.screen() === 'dm') { render(); } }).catch(function () { /* no voice here */ });
    window.claude.use('dictation').then(function (d) {
      Voice.dict = d; if (!d) { return; }
      d.onFinal(function (e) { var box = $('dm-input'); if (box) { box.value = (box.value + e.text).replace(/^\s+/, ''); } });
      d.onState(function (e) { var m = $('dm-mic'); if (m) { m.classList.toggle('on', e.state !== 'idle'); m.setAttribute('aria-pressed', e.state !== 'idle' ? 'true' : 'false'); } });
      if (A.screen() === 'dm') { renderAsk(); }
    }).catch(function () { /* typing only */ });
  } else if ('speechSynthesis' in window) { Voice.native = true; }
  function narrate(text) {
    if (Voice.tts) {
      if (Voice.tts.active()) { Voice.tts.stop().catch(function () { /* already quiet */ }); return; }
      Voice.tts.speak(text.slice(0, 1900)).catch(function (e) { if (e && (e.code === 'not_granted' || e.code === 'unavailable')) { Voice.tts = null; render(); } });
    } else if (Voice.native) {
      var sy = window.speechSynthesis;
      if (sy.speaking) { sy.cancel(); return; }
      var u = new SpeechSynthesisUtterance(text); u.rate = 0.95; sy.speak(u);
    }
  }
  var canNarrate = function () { return !!Voice.tts || Voice.native; };

  /* ---------- the shared table: what the DM shows every player ---------- */
  var TB = FR.table || null, pass = '', pics = {}, toastT = 0, wasAt = false, quiet = false;     // quiet: the DM is leaving or ending the table on purpose, so there is no news to break
  var atTable = function () { return !!(TB && TB.isDM()); };
  function toast(msg) { var t = $('dm-toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3400); }
  /* Whatever the DM shows goes through the composer (further down), which draws it as a phone will first. */
  function showBtn(item, label) { return btn('btn ghost slim show', label || 'Show the table', function () { compose(item); }); }
  /* everyone playing: people who joined the table on their phones, then anyone the DM typed in */
  function partyList() {
    var out = [];
    if (TB) { TB.players().forEach(function (p) { var c = p.char || {}; out.push({ who: p.name, name: c.name || '', race: c.race || '', cls: c.cls || '', look: c.look || '', portrait: p.portrait || '', joined: true }); }); }
    DM.party.forEach(function (p) { if (p.who || p.name) { out.push({ who: p.who, name: p.name, race: p.race, cls: p.cls, look: '' }); } });
    return out;
  }
  var seat = function (id) { return (TB ? TB.players() : []).filter(function (p) { return p.id === id; })[0] || null; };
  function face(p) {              // a player's portrait, or a plain disc until they have one
    if (p && p.portrait) { var im = el('img'); im.src = p.portrait; im.alt = ''; return im; }
    return el('i', 'lk-dot');
  }
  /* Who is here. Each row opens that player's character; a row that had the keyboard keeps it when the list is redrawn. */
  function playerRows(list) {
    var held = list.contains(document.activeElement) ? document.activeElement.getAttribute('data-id') : '';
    var ps = TB ? TB.players() : [], quiet = {}, sig;
    quietRows().forEach(function (q) { quiet[q.id] = q; });
    /* the clock's own redraw only moves the "quiet for" words on: the rows, and a finger on one of them, are left alone */
    sig = JSON.stringify(ps.map(function (p) { return [p.id, p.name, p.portrait, p.char, p.tokens || 0]; }));
    if (ticking && list.getAttribute('data-sig') === sig) {
      Array.prototype.forEach.call(list.querySelectorAll('.sp-q'), function (n) { n.textContent = quietWords(quiet[n.getAttribute('data-for')]); });
      return;
    }
    list.setAttribute('data-sig', sig);
    clear(list);
    if (!ps.length) { list.appendChild(el('p', 'cover-p', 'Nobody yet. Players appear here as they join.')); }
    ps.forEach(function (p) {
      var wrap = el('div', 'tb-seat'), row = el('div', 'tb-row'), r = btn('tb-p', '', function () { openPlayer(p.id); }), t = el('span'), c = p.char, o = null, q, tok, x;
      r.setAttribute('data-id', p.id);
      r.appendChild(face(p));
      t.appendChild(el('b', '', p.name)); t.appendChild(el('small', '', c && c.cls ? (c.name ? c.name + ', ' : 'Not named yet: ') + [c.race, c.cls].filter(Boolean).join(' ') : 'Still answering the questions'));
      /* how long since this player last rolled or asked for something: the spotlight's own line */
      if (atTable()) { q = el('small', 'sp-q', quietWords(quiet[p.id])); q.setAttribute('data-for', p.id); t.appendChild(q); }
      r.appendChild(t); row.appendChild(r);
      /* no character yet: a ready-made one is two taps away, for a latecomer or anyone stuck on the questions */
      if (!(c && c.cls) && atTable() && premades().length) { o = btn('mini', 'Offer a hero', function () { offerHero(p.id); }); o.setAttribute('data-id', 'o:' + p.id); row.appendChild(o); }
      wrap.appendChild(row);
      /* hero tokens: how many they hold, and giving one or taking one back */
      if (atTable() && TB.award) { tok = tokenTools(p); wrap.appendChild(tok); }
      list.appendChild(wrap);
      if (held === p.id) { r.focus(); } else if (o && held === 'o:' + p.id) { o.focus(); }
      else if (tok && held && (held === 'g:' + p.id || held === 't:' + p.id)) { x = Array.prototype.filter.call(tok.querySelectorAll('button'), function (b) { return b.getAttribute('data-id') === held && !b.disabled && !b.hidden; })[0] || tok.querySelector('button:not([disabled])'); if (x) { x.focus(); } }
    });
  }
  var premades = function () { return (FR.theme && FR.theme.roster && FR.theme.roster.premades) || []; };
  var premade = function (name) { return premades().filter(function (h) { return h.name === name; })[0] || null; };
  /* The link and the square seat a player at this table, in this table's own scenario: ?t=CODE&s=<scenario id>. */
  function tableScenario() { return (TB && TB.scenario && TB.scenario()) || (FR.theme && FR.theme.id) || ''; }
  function shareLink() {
    var link = TB.link(), s = tableScenario();
    return !s || /[?&]s=/.test(link) ? link : link + '&s=' + encodeURIComponent(s);
  }
  function qr(text) {
    if (typeof window.qrcode !== 'function') { return null; }
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); var d = el('div', 'tb-qr'); d.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); d.setAttribute('role', 'img'); d.setAttribute('aria-label', 'A square to scan. It opens the app and seats the player at your table.'); return d; } catch (e) { return null; }
  }
  /* The QR code maker is fetched the first time a table is shown, where the page can do that
     (FR.app.need). Until it is here, and if it never comes, the link does the job alone. */
  function qrInto(slot, text, then) {
    var draw = function () { var q = qr(text); clear(slot); if (q) { slot.appendChild(q); } then(!!q); };
    draw();
    if (typeof window.qrcode !== 'function' && A.need) {
      try { Promise.resolve(A.need('qr')).then(function () { if (document.body.contains(slot)) { draw(); } }, function () { /* no square: the link still works */ }); } catch (e) { /* the same */ }
    }
  }
  function drawChip() {
    var c = $('dm-table'), can = !!(TB && TB.can());
    c.hidden = !can; if (!can) { return; }
    clear(c);
    if (atTable()) { var n = TB.players().length; c.appendChild(el('b', '', TB.code())); c.appendChild(el('span', '', String(n))); c.setAttribute('aria-label', 'Table ' + TB.code().split('').join(' ') + ', ' + n + (n === 1 ? ' player' : ' players') + '. Show your table.'); }
    else { c.appendChild(el('em', '', 'Open a table')); c.removeAttribute('aria-label'); }
  }

  /* ---------- the layout ----------
     A phone shows one column with tabs along the bottom. From 900px the story takes the window: it
     keeps the main pane, and the table (who is here, the rolls, the turn order) sits beside it. The
     dictionary is a tab of that side pane until, at 1400px, there is room to give it a pane of its
     own. src/css/dm.css places the panes at the same two widths. */
  var media = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var mqWide = media('(min-width: 900px)'), mqThree = media('(min-width: 1400px)');
  var wide = function () { return mqWide.matches; }, three = function () { return mqWide.matches && mqThree.matches; };
  /* On a wide screen the dictionary, the party, the asks and the rolls live beside the story, so a tab
     that was showing one of them hands over to the side pane and the story comes back to the main one. */
  function fitTabs() {
    if (!wide()) { return; }
    if (ui.tab === 'lookup') { ui.side = 'dict'; } else if (ui.tab === 'party') { ui.side = 'table'; } else if (ui.tab === 'rolls') { ui.side = 'rolls'; } else if (ui.tab === 'asks') { ui.side = 'asks'; }
    if (ui.tab !== 'chapters' && ui.tab !== 'brief') { ui.tab = 'run'; }
    if (three() && ui.side === 'dict') { ui.side = 'rolls'; }
  }

  /* Parts of the screen that follow the table (who is here, the rolls, the turn order) say how to
     redraw themselves. When the table changes, each one still on the page does so, and nothing else
     is touched: a note half typed and the DM's place in the story stay as they were. */
  var watching = [];
  function watch(node, draw) { watching.push({ node: node, draw: draw }); draw(); }
  function refresh() {
    watching = watching.filter(function (w) { return document.body.contains(w.node); });
    watching.forEach(function (w) { w.draw(); });
    counts();
    stageTurns(); soundHere();
  }

  /* ---------- sheets and dialogs: the keyboard goes in, stays in, and goes back where it came from ---------- */
  var modals = [];                // the ones open now, the newest last: { box, from }
  function canFocus(n) { return !n.disabled && n.offsetParent !== null; }
  function focusable(box) { return Array.prototype.filter.call(box.querySelectorAll('button, a[href], input, select, textarea, summary'), canFocus); }
  function modalOpen(box, first) {
    if (!modals.some(function (m) { return m.box === box; })) { modals.push({ box: box, from: document.activeElement }); }
    box.hidden = false;
    var to = first || focusable(box)[0]; if (to) { to.focus(); }
  }
  function modalClose(box) {
    var from = null;
    modals = modals.filter(function (m) { if (m.box === box) { from = m.from; } return m.box !== box; });
    box.hidden = true;
    if (A.screen() !== 'dm') { return; }
    /* back to whatever opened it; if that has been redrawn since, to the table button, which is always there */
    if (from && from !== document.body && document.body.contains(from) && canFocus(from)) { from.focus(); } else if (!$('dm-table').hidden) { $('dm-table').focus(); } else { $('dm-exit').focus(); }
  }
  function modalsShut() { modals.forEach(function (m) { m.box.hidden = true; }); modals = []; sheetBack = null; sheetIs = ''; dialogShutFn = null; confirmNo = null; }
  document.addEventListener('keydown', function (e) {
    var m = modals[modals.length - 1], f, a;
    if (!m || m.box.hidden || A.screen() !== 'dm') { return; }
    if (e.key === 'Escape') { e.preventDefault(); if (m.box === $('dm-sheet')) { sheetShut(); } else if (m.box === $('dm-dialog')) { dialogShut(); } else if (m.box === $('dm-confirm')) { confirmShut(false); } else { modalClose(m.box); } return; }
    if (e.key !== 'Tab') { return; }
    f = focusable(m.box); a = document.activeElement;
    if (!f.length) { e.preventDefault(); return; }
    if (!m.box.contains(a)) { e.preventDefault(); f[0].focus(); }
    else if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  /* The DM's one sheet shows a dictionary entry or the table (both on a phone only) or a player. `label`
     says which to a screen reader; `back` is where closing returns to, when it was opened from the table. */
  var sheetBack = null, sheetIs = '';
  function sheetOpen(is, label, back) {
    sheetIs = is; sheetBack = back || null;
    $('dm-sheet-card').setAttribute('aria-label', label);
    $('dm-sheet-x').setAttribute('aria-label', back ? 'Back to your table' : 'Close');
    modalOpen($('dm-sheet'), $('dm-sheet-x')); $('dm-sheet-b').scrollTop = 0;
  }
  function sheetShut() {
    var back = sheetBack; sheetBack = null;
    if (back && atTable()) { back(); return; }
    sheetIs = ''; modalClose($('dm-sheet')); clear($('dm-sheet-b'));
  }
  /* One small dialog for every "are you sure?" on the DM's side. The safe answer has the keyboard first. */
  var confirmNo = null;           // what putting the question away means, when it means something (o.onNo)
  function confirmShut(yes) { var fn = confirmNo; confirmNo = null; modalClose($('dm-confirm')); if (!yes && fn) { fn(); } }
  function ask(o, yes) {
    var box = $('dm-confirm'), row = $('dm-confirm-b'), no = btn('btn ghost slim', o.no, function () { confirmShut(false); });
    if (!box.hidden) { confirmShut(false); }
    $('dm-confirm-t').textContent = o.title; $('dm-confirm-p').textContent = o.text;
    clear(row);
    row.appendChild(btn('btn wax slim', o.yes, function () { confirmShut(true); yes(); }));
    /* a second, stronger way to say yes, with one line saying what more it does */
    if (o.also) { row.appendChild(btn('btn ghost slim danger', o.also.label, function () { confirmShut(true); o.also.go(); })); row.appendChild(el('small', 'confirm-note', o.also.note)); }
    row.appendChild(no);
    confirmNo = o.onNo || null;
    modalOpen(box, no);
  }
  /* One small dialog for the DM's short jobs: sending something, offering a hero, "They did what?".
     `fill(body)` draws it and gives back where the keyboard should start; `shut` runs when it closes. */
  var dialogShutFn = null;
  function dialogOpen(title, fill, shut) {
    var box = $('dm-dialog'), body = $('dm-dialog-b'), first;
    if (!box.hidden) { dialogShut(); }
    $('dm-dialog-t').textContent = title; clear(body);
    first = fill(body); dialogShutFn = shut || null;
    modalOpen(box, first || null); body.scrollTop = 0;
  }
  function dialogShut() {
    var fn = dialogShutFn, box = $('dm-dialog'); dialogShutFn = null;
    if (box.hidden) { return; }
    if (fn) { fn(); }
    modalClose(box); clear($('dm-dialog-b'));
  }

  /* ---------- the table: its code and link, who is here, a note for everyone, and the two ways out ---------- */
  var draft = { note: '', att: '' };          // a note being written is kept while the panel is redrawn or put away
  function tablePanel(box) {
    var link = shareLink(), top = el('div', 'tb-top'), code = el('div', 'tb-code'), slot = el('div', 'tb-qr-slot'), how = el('p', 'tb-how');
    box.appendChild(el('h3', 'sh-t', 'Your table'));
    code.appendChild(el('small', '', 'Table code')); code.appendChild(el('b', '', TB.code()));
    top.appendChild(code); top.appendChild(slot); box.appendChild(top); box.appendChild(how);
    qrInto(slot, link, function (q) { how.textContent = 'Players ' + (q ? 'scan the square or open the link' : 'open the link') + ' on their own phones, and it seats them at this table straight away. Anyone already in the app can type the code instead.'; });
    var row = el('div', 'tb-link'), inp = el('input', 'field'); inp.type = 'text'; inp.readOnly = true; inp.value = link; inp.setAttribute('aria-label', 'Link for players'); inp.addEventListener('focus', function () { inp.select(); });
    row.appendChild(inp);
    row.appendChild(btn('btn ghost slim', navigator.share ? 'Share' : 'Copy', function () {
      var copy = function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Link copied.'); }).catch(function () { inp.focus(); inp.select(); toast('Select the link and copy it.'); }); };
      if (navigator.share) { navigator.share({ title: 'First Roll', text: 'Join my table. The code is ' + TB.code() + '.', url: link }).catch(function (e) { if (!e || e.name !== 'AbortError') { copy(); } }); } else { copy(); }
    }));
    box.appendChild(row);
    if (TB.screenKey) { tvBox(box); }
    box.appendChild(el('div', 'dm-h', 'At the table'));
    var list = el('div', 'tb-list'), tip = el('p', 'tb-tip', 'Tap a player to see their character, or to remove them from the table.');
    box.appendChild(list); box.appendChild(tip);
    watch(list, function () { playerRows(list); tip.hidden = !TB || !TB.players().length; });
    spotBox(box);
    if (wide()) { paceBox(box); }                // a phone has it on the Story tab, beside the map and the shortcuts
    if (wide()) { box.appendChild(el('div', 'dm-h', 'Anyone playing without a phone')); handParty(box); }      // a phone has the Party tab for this
    box.appendChild(el('div', 'dm-h', 'Send something'));
    box.appendChild(btn('btn ghost slim', draft.note || draft.att ? 'Carry on with your note' : 'Write a note or send a picture', function () { compose({ text: draft.note, image: draft.att }, { own: true }); }));
    box.appendChild(el('p', 'tb-tip', 'You see it just as a phone will show it, and choose who gets it, before anything is sent.'));
    box.appendChild(el('div', 'dm-h', 'Sent so far'));
    var sent = el('div', 'tb-list'); box.appendChild(sent);
    watch(sent, function () {
      var fd = TB ? TB.feed().slice(-20).reverse() : [], h = held(sent);
      clear(sent);
      if (!fd.length) { sent.appendChild(el('p', 'cover-p', 'Nothing yet. Look for “Show the table” under pictures in the story and in the dictionary.')); }
      fd.forEach(function (f) {
        var r = el('div', 'tb-p sent'), t = el('span'), to = f.to ? seat(f.to) : null, x;
        if (f.img) { var im = el('img', 'sq'); im.src = f.img; im.alt = ''; r.appendChild(im); } else { r.appendChild(el('i', 'lk-dot note')); }
        t.appendChild(el('b', '', f.hero ? 'A hero: ' + f.hero : (f.title || (f.img ? 'A picture' : 'A note'))));
        t.appendChild(el('small', '', (f.to ? 'Only ' + (to ? to.name : 'one player') : 'Everyone') + (f.text ? ' · ' + f.text : '')));
        r.appendChild(t);
        if (TB.unsend) {
          x = btn('mini', 'Take back', function () {
            x.disabled = true;
            TB.unsend(f.n).then(function (j) { toast(j && j.removed === false ? 'That had already gone.' : 'Taken back. It has gone from every phone.'); })
              .catch(function (e) { x.disabled = false; toast((e && e.message) || 'That could not be taken back. Try again.'); });
          });
          x.setAttribute('data-k', 'un' + f.n); x.setAttribute('aria-label', 'Take back: ' + (f.hero || f.title || (f.img ? 'a picture' : 'a note'))); r.appendChild(x);
        }
        sent.appendChild(r);
      });
      back(sent, h);
    });
    /* two ways out, and they are not the same: leaving is only the DM stepping away; ending closes the table for everyone */
    var bye = el('div', 'tb-bye'), lv = el('div', 'tb-way'), en = el('div', 'tb-way');
    bye.appendChild(el('div', 'dm-h', 'When you are done'));
    lv.appendChild(btn('btn ghost slim', 'Leave this table', leaveTable));
    lv.appendChild(el('small', '', 'Only you step away. The table stays open, your players keep their seats, and the code lets you back in.'));
    en.appendChild(btn('btn ghost slim danger', 'End this table for everyone', endTable));
    en.appendChild(el('small', '', 'The table closes for good. Every player is sent home and the code stops working.'));
    bye.appendChild(lv); bye.appendChild(en); box.appendChild(bye);
  }
  function openTable() {          // on a phone the table is a sheet over the story; on a wide screen it has the side pane
    var box = $('dm-sheet-b'); clear(box); tablePanel(box);
    sheetOpen('table', 'Your table');
  }
  function leaveTable() {
    var code = TB.code();
    ask({ title: 'Leave table ' + code + '?', text: 'Only you step away. The table stays open with its players and pictures, and you can come back to it with this code. It clears itself after thirty quiet days.', yes: 'Leave table ' + code, no: 'Stay at the table' }, function () {
      quiet = true; TB.leave(); quiet = false;
      modalsShut(); renderAll(); $('dm-table').focus();
      toast('You left table ' + code + '. It is still open: tap “Open a table” to go back to it or start a new one.');
    });
  }
  /* Ending takes two deliberate answers, because it cannot be taken back. Afterwards the DM is back at the door. */
  function endTable() {
    var code = TB.code(), n = TB.players().length;
    ask({ title: 'End table ' + code + ' for everyone?', text: (n ? 'This sends ' + (n === 1 ? 'your one player' : 'all ' + n + ' players') + ' home' : 'Nobody has joined yet, but this still closes the table') + ' and deletes everything shown here. To stop for now and carry on another day, leave the table instead: it keeps.', yes: 'Go on', no: 'Keep the table' }, function () {
      ask({ title: 'Last check: end table ' + code + '?', text: 'This cannot be undone. The code stops working at once, on every phone.', yes: 'End table ' + code + ' for everyone', no: 'Keep the table' }, function () {
        quiet = true;
        TB.close().then(function () {
          if (atTable()) { TB.leave(); }             // the table has gone: make sure this browser has forgotten it too
          quiet = false; wasAt = false; DM.turns = noTurns(); save();
          modalsShut(); doorSetup(); doorSay('Table ' + code + ' has ended. Its code no longer works, and its players are being told.');
          A.go('dmgate'); $('b-dm-new').focus();
        }).catch(function (e) { quiet = false; if (A.screen() === 'dm') { toast((e && e.message) || 'The table could not be ended just now. Try again.'); } });
      });
    });
  }
  /* Players without a phone: typed in by the DM, so the story helper and the painter know them too. */
  function handParty(box) {
    var c = el('div', 'hand'), th = FR.theme || {}, races = Object.keys(th.races || {}), classes = Object.keys(th.classes || {});      // the players' choices are the theme's, not the story's
    box.appendChild(c);
    (function draw(focus) {
      var add = null;
      clear(c);
      DM.party.forEach(function (p, i) {
        var r = el('div', 'prow'), mk = function (key, ph, label) { var inp = el('input', 'field'); inp.type = 'text'; inp.value = p[key] || ''; inp.placeholder = ph; inp.setAttribute('aria-label', label + ' ' + (i + 1)); inp.id = 'pt-' + key + '-' + i; inp.addEventListener('change', function () { p[key] = inp.value.trim(); save(); }); return inp; };
        var sel = function (key, opts, label) { var s = el('select', 'field'); s.setAttribute('aria-label', label + ' ' + (i + 1)); s.id = 'pt-' + key + '-' + i; var o0 = el('option', '', label); o0.value = ''; s.appendChild(o0); opts.forEach(function (o) { var op = el('option', '', o); op.value = o; if (p[key] === o) { op.selected = true; } s.appendChild(op); }); s.addEventListener('change', function () { p[key] = s.value; save(); }); return s; };
        r.appendChild(mk('who', 'Player', 'Player')); r.appendChild(mk('name', 'Character name', 'Character name'));
        r.appendChild(sel('race', races, wordFor('race', 'Race'))); r.appendChild(sel('cls', classes, wordFor('cls', 'Class')));
        var x = btn('icon small', '', function () { DM.party.splice(i, 1); save(); draw('add'); }); x.setAttribute('aria-label', 'Remove player ' + (i + 1)); x.appendChild(svg('M6 6l12 12M18 6L6 18')); r.appendChild(x);
        c.appendChild(r);
      });
      if (DM.party.length < 6) { add = btn('btn ghost slim', 'Add a player', function () { DM.party.push({ who: '', name: '', race: '', cls: '' }); save(); draw('new'); }); c.appendChild(add); }
      if (focus === 'new') { $('pt-who-' + (DM.party.length - 1)).focus(); } else if (focus === 'add' && add) { add.focus(); }
    })();
  }

  /* ---------- a player at a glance ---------- */
  /* What the player's own screen marks as their strong suits: the plain-words actions their class is
     trained in (the scenario's "I want to..." list), then any trained skill that has no action of its own. */
  function goodAt(clsName) {
    var th = FR.theme || {}, c = (th.classes || {})[clsName], out = [], used = {};
    if (!c) { return out; }
    (th.actions || []).forEach(function (a) { if ((c.skills || []).indexOf(a.skill) >= 0) { out.push(a.label); used[a.skill] = 1; } });
    (c.skills || []).forEach(function (s) { if (!used[s]) { out.push(s); } });
    return out;
  }
  function openPlayer(id) {
    var p = seat(id), box = $('dm-sheet-b');
    if (!p) { return; }
    var c = p.char || {}, th = FR.theme || {}, cls = (th.classes || {})[c.cls], race = (th.races || {})[c.race], good = goodAt(c.cls);
    var back = sheetIs === 'table' && !$('dm-sheet').hidden ? openTable : null, out = el('div', 'tb-way');
    clear(box);
    if (p.portrait) { var im = el('img', 'sh-img'); im.src = p.portrait; im.alt = 'Portrait of ' + (c.name || p.name); box.appendChild(im); }
    box.appendChild(el('h3', 'sh-t', c.name || p.name));
    box.appendChild(el('p', 'sh-role', c.cls ? [c.race, c.cls].filter(Boolean).join(' ') + (c.line ? ' · ' + c.line : '') : 'Still answering the questions'));
    box.appendChild(line('Played by', p.name));
    /* what the table knows of this hero beyond the sheet: their part in the party, their tokens, what ties
       them to another hero, and the stake that is theirs alone */
    var role = cls && cls.role ? (th.roles || {})[cls.role] : null, tok, other, hookText, known = ['id', 'name', 'char', 'portrait', 'tokens', 'bond', 'hook'], names = { voice: 'How they talk' };
    if (role) { box.appendChild(line('In the party', cls.role + (role.blurb ? ': ' + role.blurb : ''))); }
    if (cls && cls.blurb) { box.appendChild(el('p', 'cover-p', cls.blurb)); }
    if (atTable() && TB.award) {
      box.appendChild(el('div', 'dm-h', tokenWord().plural));
      tok = el('div', 'tb-seat'); box.appendChild(tok);
      watch(tok, function () { var now = seat(id), h = tok.contains(document.activeElement) ? document.activeElement.getAttribute('data-id') : '', x; if (!now) { return; } clear(tok); tok.appendChild(tokenTools(now)); if (h) { x = Array.prototype.filter.call(tok.querySelectorAll('button'), function (b) { return b.getAttribute('data-id') === h && !b.disabled && !b.hidden; })[0] || tok.querySelector('button:not([disabled])'); if (x) { x.focus(); } } });
      if (tokenWord().text) { box.appendChild(el('p', 'tb-tip', tokenWord().text)); }
    }
    if (p.bond && (p.bond.prompt || p.bond.text)) {
      other = seat(p.bond.to);
      box.appendChild(el('div', 'dm-h', 'A bond with ' + (other ? (other.char && other.char.name) || other.name : 'another hero')));
      if (p.bond.prompt) { box.appendChild(el('p', 'cover-p', p.bond.prompt)); }
      if (p.bond.text) { box.appendChild(line('Their answer', p.bond.text, true)); }
    }
    if (p.hook && (p.hook.text || p.hook.id)) {
      hookText = p.hook.text || (byId((th.ties && th.ties.hooks) || [], p.hook.id) || {}).text || '';
      if (hookText) { box.appendChild(el('div', 'dm-h', 'What is at stake for them')); box.appendChild(el('p', 'cover-p', hookText)); box.appendChild(el('p', 'tb-tip', 'Only you and ' + p.name + ' know this. A good moment to bring it in is worth a ' + tokenWord().name + '.')); }
    }
    /* anything else the table carries for this seat is shown as it comes, under its own name */
    Object.keys(p).forEach(function (k) {
      var v = p[k], words = typeof v === 'string' ? v.trim() : (v && typeof v === 'object' && !Array.isArray(v) ? [v.label, v.text || v.tip].filter(function (x) { return typeof x === 'string' && x; }).join(': ') : '');
      if (known.indexOf(k) < 0 && words) { box.appendChild(line(names[k] || k.charAt(0).toUpperCase() + k.slice(1), words)); }
    });
    if (good.length) { box.appendChild(el('div', 'dm-h', 'Good at')); var ul = el('ul', 'good'); good.forEach(function (g) { ul.appendChild(el('li', '', g)); }); box.appendChild(ul); }
    if (race && race.perk) { var pk = el('div', 'perk'); pk.appendChild(el('b', '', ((th.text && th.text.asA) || 'As a ') + c.race + ' ')); pk.appendChild(document.createTextNode(race.perk)); box.appendChild(pk); }
    if (atTable()) {
      var only = el('div', 'tb-way');
      if (!c.cls && premades().length) { only.appendChild(btn('btn ghost slim', 'Offer a ready-made hero', function () { offerHero(p.id); })); }
      only.appendChild(btn('btn ghost slim', 'Send something only to ' + p.name, function () { compose({}, { to: p.id }); }));
      box.appendChild(only);
    }
    out.appendChild(btn('btn ghost slim danger', 'Remove from table', function () { removePlayer(p); }));
    out.appendChild(el('small', '', 'Frees their seat and tells their phone. They can join again with the code, unless you choose to keep them out for an hour.'));
    box.appendChild(out);
    sheetOpen('player', 'Character: ' + (c.name || p.name), back);
  }
  /* Two ways to remove someone: the seat is simply freed, or the name is also kept out for an hour. */
  function removePlayer(p) {
    var go = function (bar) {
      TB.kick(p.id, bar).then(function (j) {
        if (sheetIs === 'player') { sheetShut(); }
        turnDrop('p:' + p.id);
        toast(j && j.removed === false ? p.name + ' had already left the table.' : (j && j.barred ? p.name + ' has been removed, and that name cannot sit down here for an hour.' : p.name + ' has been removed from the table.'));
        drawChip(); refresh();
      }).catch(function (e) { if (A.screen() === 'dm') { toast((e && e.message) || 'That did not go through. Try again.'); } });
    };
    ask({ title: 'Remove ' + p.name + ' from the table?', text: 'Their seat is freed, their character leaves with it, and their phone is told the DM removed them. They can join again with the code.', yes: 'Remove ' + p.name, no: 'Keep ' + p.name,
      also: { label: 'Remove ' + p.name + ' and keep them out for an hour', note: 'Keeping them out: for the next hour nobody can join this table under the name ' + p.name + '.', go: function () { go(true); } } }, function () { go(false); });
  }

  /* ---------- the rolls: every roll at the table, as it happens ---------- */
  var KINDS = { check: 'Check', save: 'Save', attack: 'Attack', damage: 'Damage', init: 'Initiative', free: 'Free roll', extra: 'Special roll' };
  var rollsNow = function () { return TB && TB.rolls ? TB.rolls() : []; };
  var newest = function () { var r = rollsNow(); return r.length ? r[r.length - 1].n : 0; };
  function ago(at) {
    var s = Math.max(0, (Date.now() - at) / 1000), m = Math.round(s / 60), h = Math.round(s / 3600), d = Math.round(s / 86400);
    if (s < 45) { return 'just now'; }
    if (m < 60) { return m + ' min ago'; }
    if (h < 24) { return h === 1 ? '1 hour ago' : h + ' hours ago'; }
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
  /* Shown on the way to them: how many rolls have landed since the DM last had the rolls in view, and
     how many players are waiting for an answer. Each count says which it is in data-of. */
  function counts() {
    var rolls = rollsNow().filter(function (r) { return !r.old && !r.mine && r.n > ui.seenRoll; }).length, asks = waiting().length;
    Array.prototype.forEach.call(document.querySelectorAll('#s-dm .dm-count'), function (c) {
      var mine = c.getAttribute('data-of') === 'asks', n = mine ? asks : rolls;
      c.textContent = String(n); c.hidden = !n; c.setAttribute('aria-label', n + (mine ? ' waiting' : ' new'));
    });
  }
  function rollRow(r) {
    var p = r.role === 'dm' ? null : seat(r.id), row = el('div', 'rl' + (r.nat === 20 ? ' nat20' : (r.nat === 1 ? ' nat1' : '')) + (r.old ? ' old' : ''));
    var who = el('div', 'rl-who'), name = el('b', '', r.name || 'Someone'), foot = el('span', 'rl-foot'), num = el('div', 'rl-num'), when = el('time', '', ago(r.at)), f;
    var kind = KINDS[r.kind] || '', what = r.label || kind || 'A roll', sum = r.detail || '', wordy = sum.length > 12;       // "14 + 3" sits under the total; a sentence gets a line of its own
    if (p) { f = btn('rl-face', '', function () { openPlayer(p.id); }); f.setAttribute('aria-label', 'See the character ' + p.name + ' is playing'); } else { f = el('span', 'rl-face'); }
    f.appendChild(face(p)); row.appendChild(f);
    if (p && p.char && p.char.name) { name.appendChild(el('i', '', ' · ' + p.char.name)); }
    who.appendChild(name);
    who.appendChild(el('span', 'rl-what', what + (kind && r.label && r.label.toLowerCase().indexOf(kind.toLowerCase()) < 0 ? ' · ' + kind : '')));
    if (sum && wordy) { who.appendChild(el('span', 'rl-sum', sum)); }
    if (r.nat === 20 || r.nat === 1) { foot.appendChild(el('em', 'rl-nat', 'Natural ' + r.nat)); }
    when.setAttribute('data-at', String(r.at)); foot.appendChild(when);
    who.appendChild(foot); row.appendChild(who);
    num.appendChild(el('b', '', String(r.total)));
    if (sum && !wordy) { num.appendChild(el('small', '', sum)); }
    row.appendChild(num);
    return row;
  }
  /* The turn order, then the rolls, newest first. What was rolled before this screen connected is kept, under its own heading. */
  function rollsPanel(box) {
    var feed = el('section', 'rl-wrap'), list = el('div', 'rl-list'), said = el('p', 'dm-sr'), told = newest();
    said.setAttribute('role', 'status');
    turnsPanel(box);
    feed.appendChild(el('h3', 'dm-h', 'Rolls')); feed.appendChild(said); feed.appendChild(list); box.appendChild(feed);
    watch(list, function () {
      var all = rollsNow().slice(-40).reverse(), last = all[0], sep = false;
      clear(list);
      if (!all.length) { list.appendChild(el('p', 'cover-p', atTable() ? 'No rolls yet. Every roll your players make shows up here as it happens.' : 'Rolls show up here once you open a table and your players join it.')); }
      all.forEach(function (r) {
        if (r.old && !sep) { sep = true; list.appendChild(el('div', 'rl-sep', 'Earlier, before you connected')); }
        list.appendChild(rollRow(r));
      });
      /* a new roll is read out once, for anyone who cannot see it land */
      if (last && !last.old && last.n > told) { told = last.n; said.textContent = (last.name || 'Someone') + ' rolled ' + last.total + (last.label ? ' for ' + String(last.label).replace(/[.?!]+$/, '') : '') + (last.nat ? '. Natural ' + last.nat : '') + '.'; }
      ui.seenRoll = Math.max(ui.seenRoll, newest());
    });
  }

  /* ---------- the turn order ----------
     Built from the latest initiative roll of each player, highest first; anyone tied keeps the place
     they arrived in. The DM can add an entry by hand (a monster and a number). It is saved with the
     session as DM.turns:
       rows    { key, id, name, total, ord, hand }: one for each player ('p:' + their seat), each roll
               the DM made, and each entry typed in by hand
       at      the key of whose turn it is ('' before the first turn);  round  counts up as the order wraps
       seen    the last initiative roll counted, and  after  the roll at which "new round of initiative"
               last cleared the order: both in the table's own roll numbering, so nothing is counted
               twice and nothing cleared comes back
       code    the table all of this belongs to: another table starts with a clean order.
     A foe from the adventure is a row too ('f:' and a number of its own, so three of a kind are three
     rows): it also carries  foe  (its id in the adventure),  hits  (how many it takes),  taken  (how many
     it has had) and  img. It rolls nothing, so it takes its turn after everyone who rolled; its health
     is shown as a word (FR.run.foeState) and its suggested moves are read from the adventure, never saved.
     The order and whose turn it is are also put on the stage, for the big screen (stageTurns). */
  var STALE = 3 * 3600 * 1000;    // initiative rolled hours before this session first saw the table belongs to an earlier evening
  function turnRows() { return run.turnSort(DM.turns.rows); }
  function turnNow() { return DM.turns.rows.filter(function (r) { return r.key === DM.turns.at; })[0] || null; }
  var foeOut = function (r) { return !!r.foe && run.foeState(r.hits, r.taken).id === 'out'; };
  /* Count the initiative rolls not counted yet. Says whether anything changed. */
  function takeTurns() {
    var T = DM.turns, code = atTable() ? TB.code() : '', rolls = rollsNow(), changed = false, kept, untouched;
    if (code && !syn.ready) { return false; }  // the table may hold a newer session, turn order and all: wait to hear
    if (code && T.code !== code) {             // another table: only entries typed in before any table was open carry over
      kept = T.code ? [] : T.rows.filter(function (r) { return r.hand; });
      T = DM.turns = noTurns(); T.code = code; T.rows = kept; kept.forEach(function (r) { r.ord = ++T.ord; });
      changed = true;
    }
    if (rolls.length && rolls[rolls.length - 1].n < Math.max(T.seen, T.after)) { T.seen = 0; T.after = 0; }      // the numbering started again: a new table under an old code
    untouched = !T.seen;
    rolls.forEach(function (r) {
      if (r.kind !== 'init' || r.n <= T.seen) { return; }
      T.seen = r.n; changed = true;
      if (r.n <= T.after || (untouched && r.old && Date.now() - r.at > STALE)) { return; }
      var mine = r.role === 'dm', key = mine ? 'r:' + r.n : 'p:' + r.id, row = T.rows.filter(function (x) { return x.key === key; })[0];
      if (!row) { row = { key: key, id: mine ? '' : r.id, ord: ++T.ord, hand: false }; T.rows.push(row); }
      row.name = mine ? (r.label && r.label.toLowerCase() !== 'initiative' ? r.label : 'DM') : r.name;
      row.total = r.total;
    });
    if (changed) { save(); }
    return changed;
  }
  function turnStep(d) {
    var T = DM.turns, rows = turnRows(), i = rows.indexOf(turnNow()), tries = rows.length;
    if (!rows.length || (i < 0 && d < 0)) { return; }
    do {
      i = i < 0 ? 0 : i + d;
      if (i >= rows.length) { i = 0; T.round++; }                                // past the last: the next round begins
      if (i < 0 && T.round > 1) { i = rows.length - 1; T.round--; }
    } while (i >= 0 && foeOut(rows[i]) && --tries > 0);                          // a foe that is out of the fight has no turn to take
    T.at = i < 0 ? '' : rows[i].key;                                             // back before the very first turn: nobody's turn yet
    save(); refresh();
  }
  /* The foes of a scene join the turn order, each as a row of its own. One already there (the button was
     tapped twice) is not added again. */
  function turnFoes(list) {
    var T = DM.turns, n = 0;
    list.forEach(function (f) {
      if (T.rows.some(function (r) { return r.foe === f.foe && r.name === f.name; })) { return; }
      T.rows.push({ key: 'f:' + (++T.ord), id: '', name: f.name, total: 0, ord: T.ord, hand: false, foe: f.foe, hits: f.hits, taken: 0, img: f.img || '' }); n++;
    });
    if (n) { save(); refresh(); }
    return n;
  }
  var foesIn = function (list) { return list.length > 0 && list.every(function (f) { return DM.turns.rows.some(function (r) { return r.foe === f.foe && r.name === f.name; }); }); };
  /* a hit moves a foe one step towards out; taking one back moves it the other way */
  function foeHit(key, d) {
    var r = DM.turns.rows.filter(function (x) { return x.key === key; })[0];
    if (!r || !r.foe) { return; }
    r.taken = Math.max(0, Math.min(r.hits, (r.taken || 0) + d));
    save(); refresh();
  }
  function turnDrop(key) {
    var T = DM.turns, rows = turnRows(), i = rows.map(function (r) { return r.key; }).indexOf(key);
    if (i < 0) { return; }
    if (T.at === key) { T.at = rows.length > 1 ? rows[(i + 1) % rows.length].key : ''; }      // their turn passes to whoever is next
    T.rows = T.rows.filter(function (r) { return r.key !== key; });
    if (!T.rows.length) { T.at = ''; T.round = 1; }
    save(); refresh();
  }
  function turnsClear() { var T = DM.turns; T.rows = []; T.at = ''; T.round = 1; T.after = Math.max(T.after, T.seen, newest()); save(); refresh(); }
  function turnsPanel(box) {
    var sec = el('section', 'to'), head = el('h3', 'dm-h'), none = el('p', 'cover-p'), list = el('ol', 'to-list'), ctl = el('div', 'to-ctl'), form = el('form', 'to-add'), foot = el('div', 'to-foot'), said = el('p', 'dm-sr');
    var who = el('input', 'field'), num = el('input', 'field'), add = btn('btn ghost slim', 'Add', null), sure = 0;
    var tell = function () { var r = turnNow(); said.textContent = r ? 'Round ' + DM.turns.round + '. ' + r.name + ', it is your turn.' : 'Nobody’s turn yet.'; };
    var prev = btn('btn ghost slim', 'Previous', function () { turnStep(-1); tell(); }), next = btn('btn wax slim', 'Next turn', function () { turnStep(1); tell(); });
    var calm = function () { clearTimeout(sure); sure = 0; again.textContent = 'New round of initiative'; };
    var again = btn('chipd', 'New round of initiative', function () {
      if (!sure) { again.textContent = 'Tap again to clear the order'; sure = setTimeout(calm, 4000); return; }
      calm(); turnsClear(); said.textContent = 'The turn order is cleared.'; who.focus();
    });
    said.setAttribute('role', 'status');
    who.type = 'text'; who.maxLength = 30; who.autocomplete = 'off'; who.placeholder = 'A monster, a guard…'; who.setAttribute('aria-label', 'Who to add to the turn order');
    num.type = 'number'; num.min = '-20'; num.max = '99'; num.step = '1'; num.inputMode = 'numeric'; num.placeholder = '0'; num.setAttribute('aria-label', 'The number they rolled');
    add.type = 'submit'; form.setAttribute('novalidate', '');
    form.appendChild(who); form.appendChild(num); form.appendChild(add);
    form.addEventListener('submit', function (ev) {
      var name = who.value.trim(), n = Math.round(Number(num.value)), T = DM.turns;
      ev.preventDefault();
      if (!name) { who.focus(); return; }
      if (num.value.trim() === '' || !isFinite(n)) { num.focus(); return; }
      T.rows.push({ key: 'h:' + (++T.ord), id: '', name: name, total: Math.max(-20, Math.min(99, n)), ord: T.ord, hand: true });
      who.value = ''; num.value = ''; save(); refresh(); who.focus();
    });
    ctl.appendChild(prev); ctl.appendChild(next);
    foot.appendChild(again); foot.appendChild(el('small', '', 'For the next fight: clears the order so everyone rolls again.'));
    [head, said, none, list, ctl, el('div', 'dm-h', 'Add someone by hand'), form, foot].forEach(function (n) { sec.appendChild(n); });
    box.appendChild(sec);
    watch(list, function () {
      takeTurns();
      var T = DM.turns, rows = turnRows(), now = turnNow(), held = list.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : '', here = !!(TB && TB.players().length);
      head.textContent = now ? 'Turn order · Round ' + T.round : 'Turn order';
      none.hidden = !!rows.length; none.textContent = atTable() ? 'Nobody has rolled initiative yet. When your players roll it, the order builds itself here.' : 'Add everyone in the fight by hand, with the number each one rolled.';
      clear(list); list.hidden = !rows.length;
      rows.forEach(function (r) {
        var p = r.id ? seat(r.id) : null, row = el('li', 'to-row' + (r === now ? ' now' : '') + (r.foe ? ' foe' : '') + (foeOut(r) ? ' out' : '')), t = el('span', 'to-who'), x = btn('icon', '', function () { turnDrop(r.key); });
        var st = r.foe ? run.foeState(r.hits, r.taken) : null, def = r.foe ? byId(ST.foes, r.foe) : null, pic, tools, hit, undo, mv, mb, bar, fill;
        if (r === now) { row.setAttribute('aria-current', 'true'); }
        if (r.foe && r.img) { pic = el('img'); pic.src = r.img; pic.alt = ''; row.appendChild(pic); } else { row.appendChild(face(p)); }
        t.appendChild(el('b', '', p ? p.name : r.name));
        t.appendChild(el('small', '', [r === now ? 'Their turn' : '', r.foe ? 'After everyone who rolled' : (r.hand ? 'Added by hand' : (p ? (p.char && p.char.name) || '' : (r.id && here ? 'No longer at the table' : '')))].filter(Boolean).join(' · ')));
        row.appendChild(t); row.appendChild(st ? el('strong', 'to-st ' + st.id, st.word) : el('strong', 'to-n', String(r.total)));
        x.setAttribute('data-key', r.key); x.setAttribute('aria-label', 'Take ' + r.name + ' out of the turn order'); x.appendChild(svg('M6 6l12 12M18 6L6 18')); row.appendChild(x);
        if (r.foe) {
          /* its health as a word and a bar (never a number), a hit and a way to take one back, and what it might do on its turn */
          tools = el('div', 'to-foe'); bar = el('i', 'to-bar'); fill = el('i'); fill.style.width = Math.round(100 * (1 - Math.min(r.hits, r.taken || 0) / r.hits)) + '%'; bar.appendChild(fill); tools.appendChild(bar);
          hit = btn('btn ghost slim', 'It takes a hit', function () { foeHit(r.key, 1); said.textContent = r.name + ': ' + run.foeState(r.hits, (r.taken || 0)).word + '.'; });
          hit.setAttribute('data-key', r.key + ':hit'); hit.disabled = foeOut(r); tools.appendChild(hit);
          undo = btn('btn ghost slim', 'Take one back', function () { foeHit(r.key, -1); });
          undo.setAttribute('data-key', r.key + ':undo'); undo.hidden = !(r.taken > 0); tools.appendChild(undo);
          if (def && Array.isArray(def.moves) && def.moves.length) {
            mv = el('details', 'try to-moves'); mv.appendChild(el('summary', '', 'What it might do')); mb = el('div', 'try-b');
            def.moves.forEach(function (m) { mb.appendChild(el('p', 'kv', m)); });
            mv.open = !!ui.moves[r.key]; mv.addEventListener('toggle', function () { ui.moves[r.key] = mv.open; });
            mv.appendChild(mb); tools.appendChild(mv);
          }
          row.appendChild(tools);
        }
        list.appendChild(row);
        if (held === r.key) { x.focus(); } else if (held === r.key + ':hit') { (hit.disabled ? undo : hit).focus(); } else if (held === r.key + ':undo') { (undo.hidden ? hit : undo).focus(); }
      });
      if (held && !list.contains(document.activeElement)) { (list.querySelector('button') || who).focus(); }       // the row that had the keyboard is gone
      if (!now && document.activeElement === prev) { next.focus(); }
      prev.hidden = !now; next.disabled = !rows.length;       // before the first turn there is nothing to go back to
      next.textContent = now ? 'Next turn' : 'Start the first turn';
      ctl.hidden = !rows.length; foot.hidden = !rows.length;
    });
  }

  /* ---------- small things the panels below share ---------- */
  /* A list that is drawn again whenever the table changes keeps the keyboard where it was: every
     control in it says which one it is in data-k. */
  function held(list) { var a = document.activeElement; return a && list.contains(a) && a.getAttribute('data-k') ? { k: a.getAttribute('data-k'), s: a.selectionStart, e: a.selectionEnd } : null; }
  function back(list, h) {
    if (!h) { return; }
    var n = Array.prototype.filter.call(list.querySelectorAll('[data-k]'), function (x) { return x.getAttribute('data-k') === h.k; })[0];
    if (!n || !canFocus(n)) { return; }
    n.focus();
    if (typeof h.s === 'number' && n.setSelectionRange) { try { n.setSelectionRange(h.s, h.e); } catch (e) { /* not a field with a caret */ } }
  }
  var word = function (key, plain) { return (FR.theme && FR.theme.text && FR.theme.text[key]) || plain; };     // the cartridge's own words for something a phone says
  var firstName = function (p) { return p ? String(p.name).split(' ')[0] : 'them'; };
  /* something too long for the table's note is ended at a word, not in the middle of one */
  function shorten(text, max) { var t = String(text || '').trim(); return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'; }
  function say(msg) { var s = $('dm-said'); if (s) { s.textContent = msg; } }
  /* The rules' skills in plain words: the cartridge's own "I want to…" line for each, where it has one. */
  function skillOptions() {
    var out = [], used = {};
    ((FR.theme && FR.theme.actions) || []).forEach(function (a) { if (FR.SKILLS[a.skill] && !used[a.skill]) { used[a.skill] = 1; out.push({ skill: a.skill, text: a.label + ' (' + a.skill + ')' }); } });
    Object.keys(FR.SKILLS).forEach(function (k) { if (!used[k]) { out.push({ skill: k, text: k }); } });
    return out;
  }
  var skillWord = function (skill) { var hit = skillOptions().filter(function (o) { return o.skill === skill; })[0]; return hit ? hit.text : skill; };
  function skillSelect(value, on) {
    var s = el('select', 'field'), none = el('option', '', 'No skill: a plain roll'); none.value = ''; s.appendChild(none);
    s.setAttribute('aria-label', 'Which skill');
    skillOptions().forEach(function (o) { var op = el('option', '', o.text); op.value = o.skill; if (o.skill === value) { op.selected = true; } s.appendChild(op); });
    s.addEventListener('change', function () { on(s.value); });
    return s;
  }
  /* how hard: three plain words, and for a roll made by hand a fourth, "I will judge" (no number: the DM says how it went) */
  function levelSeg(target, judge, on) {
    var seg = el('div', judge ? 'seg3 four' : 'seg3'), rows = run.LEVELS.map(function (l) { return [l.word, l.target]; }).concat(judge ? [['I will judge', null]] : []);
    var near = typeof target === 'number' ? run.LEVELS[target <= 11 ? 0 : (target <= 14 ? 1 : 2)].target : null;
    seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'How hard');
    rows.forEach(function (r) {
      var b = btn(r[1] === near ? 'on' : '', r[0], function () { Array.prototype.forEach.call(seg.children, function (x) { x.className = x === b ? 'on' : ''; x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); on(r[1]); });
      b.setAttribute('aria-pressed', r[1] === near ? 'true' : 'false'); seg.appendChild(b);
    });
    return seg;
  }
  /* Who something is for: everyone at the table, or one player by name. It keeps up as players come and go. */
  function whoSelect(value, label, on) {
    var s = el('select', 'field'), want = value || 'all';
    s.setAttribute('aria-label', label);
    s.addEventListener('change', function () { want = s.value; on(want); });
    watch(s, function () {
      var ps = TB ? TB.players() : [], all = el('option', '', ps.length ? 'Everyone at the table' : 'Everyone'); all.value = 'all';
      clear(s); s.appendChild(all);
      ps.forEach(function (p) { var op = el('option', '', p.name); op.value = p.id; s.appendChild(op); });
      if (want !== 'all' && !seat(want)) { want = 'all'; on(want); }           // they have left the table
      s.value = want;
    });
    return s;
  }
  var whoWords = function (to) { var p = to && to !== 'all' ? seat(to) : null; return p ? p.name : 'everyone'; };

  /* ---------- what this screen has done at its table ----------
     Not part of the session: which scene each roll was asked in (so the scene's outcomes are offered
     under the right one) and the newest proposal already announced (so coming back to the page does
     not ring for it again). Kept under a key of its own, and begun afresh at another table. */
  /* Also here, for the spotlight: when this screen first saw each player (seen) and when the DM last
     gave each one the next moment (spot), both by the table's clock. */
  var LIVE = 'firstroll.dm.live', live = { code: '', reqs: {}, heard: 0, seen: {}, spot: {} };
  function liveLoad() {
    var code = atTable() ? TB.code() : '', k = null, part = function (v) { return v && typeof v === 'object' ? v : {}; };
    if (live.code === code) { return; }
    try { k = JSON.parse(A.store.get(LIVE) || 'null'); } catch (e) { k = null; }
    live = k && k.code === code && k.reqs && typeof k.reqs === 'object' ? { code: code, reqs: k.reqs, heard: Number(k.heard) || 0, seen: part(k.seen), spot: part(k.spot) } : { code: code, reqs: {}, heard: 0, seen: {}, spot: {} };
  }
  function liveKeep() {
    var keep = {};
    Object.keys(live.reqs).map(Number).sort(function (a, b) { return b - a; }).slice(0, 30).forEach(function (n) { keep[n] = live.reqs[n]; });      // the table itself keeps twenty
    live.reqs = keep;
    try { A.store.set(LIVE, JSON.stringify(live)); } catch (e) { /* it still holds for this visit */ }
  }

  /* ---------- the scene state: what every phone is told about where the story is ----------
     FR.run.scene builds it from the adventure and the session. It is sent whenever it differs from
     what this table was last sent: after every step through the story, when a flag changes what the
     players may know, on coming back to a session, on sitting down at a table. One at a time, in
     order, so the last one sent is always the newest. */
  var pub = { scene: null, sig: '', code: '', sent: '', busy: false, state: 'none', again: 0, hard: false };
  function tell() {
    if (!ST) { return; }
    liveLoad(); sessionLook();
    var s = run.scene(ST, DM), sig = JSON.stringify(s), code = atTable() && TB.publish ? TB.code() : '', news = sig !== pub.sig || code !== pub.code;
    pub.scene = s; pub.sig = sig; pub.code = code;
    if (news) { pub.hard = false; }
    if (!code) { pub.state = 'none'; pub.sent = ''; }
    /* nothing is told to a table until this device knows whether the table already holds the story (see sessionLook) */
    else if (!syn.ready) { pub.state = syn.asking ? 'held' : 'sending'; }
    else if (pub.sent !== code + sig && !pub.busy && !pub.hard) { publish(); }
    if (code && syn.ready) { stageFollow(); }
    if (news) { refresh(); }
  }

  /* ---------- the session on the table ----------
     The session is kept on the table as well as on this device, so a second DM device, or this one
     tomorrow, carries on from the same place. On sitting down at a table this screen asks for the
     table's save and FR.run.sync decides: take it up (no question asked), send this device's own, or,
     only when both hold a place the other has not seen, ask which is the table's. After that every
     change is sent a moment later, and a newer save from another device is taken up as it appears. */
  var syn = { code: '', ready: false, busy: false, asking: false, timer: 0, sent: '', stale: 0 };
  var canKeep = function () { return atTable() && !!TB.saveSession && !!TB.loadSession; };
  var localAt = function () { return DM.at || (DM.feed.length > 1 ? 1 : 0); };       // a session from before saves were timed still counts as a story
  function sessionLook() {
    var code = atTable() ? TB.code() : '';
    if (!ST || !code) { if (!code) { clearTimeout(syn.timer); syn = { code: '', ready: false, busy: false, asking: false, timer: 0, sent: '' }; } return; }
    if (syn.code !== code) {
      clearTimeout(syn.timer); syn = { code: code, ready: !canKeep(), busy: false, asking: false, timer: 0, sent: '' };
      if (canKeep()) { sessionFetch(); }
      return;
    }
    if (syn.ready && !syn.busy && !syn.asking && canKeep() && TB.sessionAt() && TB.sessionAt() !== (DM.table === code ? DM.base : 0)) { sessionFetch(); }
  }
  function sessionFetch() {
    var code = syn.code;
    syn.busy = true;
    TB.loadSession().then(function (j) {
      if (syn.code !== code || !atTable()) { return; }
      syn.busy = false; sessionDecide(j || {});
    }, function (e) {
      if (syn.code !== code) { return; }
      syn.busy = false;
      if (syn.ready) { return; }
      /* refused outright: this table cannot say, so carry on with this device's place. No answer: ask again shortly. */
      if (e && e.status >= 400 && e.status < 500 && e.status !== 429) { syn.ready = true; synced(); }
      else { setTimeout(function () { if (syn.code === code && atTable() && !syn.ready && !syn.busy) { sessionFetch(); } }, 4000); }
    });
  }
  function sessionDecide(j) {
    var code = syn.code, at = Number(j.at) || 0, theirs = at ? run.unpack(j.save) : null, mine = DM.table === code, foreign = !!DM.table && !mine, act;
    if (theirs && !fits(theirs)) { theirs = null; }           // it points at something this adventure no longer has: it cannot be taken up
    /* This device's place was made at another table. It is that table's story, not this one's: a table
       with no story yet starts at the cover, and one with a story is taken up without a question. */
    if (foreign && !theirs) { DM = fresh(); syn.sent = ''; if (A.screen() === 'dm') { modalsShut(); ui.tab = 'run'; renderAll(); } }
    act = run.sync({ local: foreign ? 0 : localAt(), base: mine ? DM.base : 0, table: theirs ? at : 0, same: !!theirs && run.storySig(theirs) === run.storySig(DM) });
    if (act === 'ask') { sessionAsk(theirs, at); return; }
    if (act === 'adopt') { sessionTake(theirs, at); }
    else { DM.base = mine && theirs ? DM.base : at; DM.table = code; save(true); }      // a save that cannot be used is still one this device has now seen
    syn.ready = true;
    if (act === 'save') { keepOnTable(true); }
    synced();
  }
  /* take up the table's session: this device now stands where the table does */
  function sessionTake(theirs, at) {
    var was = run.storySig(DM), first = !syn.ready, where;
    DM = whole(theirs); DM.at = at; DM.base = at; DM.table = syn.code;
    save(true); syn.sent = '';
    if (A.screen() !== 'dm') { return; }
    modalsShut(); ui.tab = ui.tab === 'chapters' || ui.tab === 'brief' ? ui.tab : 'run'; renderAll();
    if (was !== run.storySig(DM)) {
      where = run.scene(ST, DM).title;
      toast(first ? 'Picked up this table’s story where it stands: “' + where + '”.' : 'The story moved on another device. You are now at “' + where + '”.');
      setTimeout(function () { var b = $('dm-body'); if (ui.tab === 'run') { b.scrollTop = b.scrollHeight; } }, 60);
    }
  }
  /* The one true conflict: the table holds a place this device has not seen, and this device has moved
     on since. Putting the question away is the gentle answer: the phones stay where they are. */
  function sessionAsk(theirs, at) {
    var code = syn.code, there = run.scene(ST, theirs), mine = run.scene(ST, DM), first = !syn.ready, alike = !!there.title && there.title === mine.title;
    var done = function () { syn.asking = false; syn.ready = true; synced(); };
    syn.asking = true; tell(); refresh();
    ask({ title: 'This table is already in the story', yes: 'Use this device’s place', no: 'Carry on from the table’s place',
      text: alike ? 'Another device has been running this table, and this one has moved on by itself since. Both stand at “' + there.title + '”, but they reached it by different choices. A table has one story, so pick one.'
        : 'Another device has been running this table, and left the story at “' + (there.title || 'another scene') + '”. This device has moved on by itself since, to “' + (mine.title || 'the start') + '”. A table has one place in the story, so pick one.',
      onNo: function () { if (syn.code !== code || !atTable()) { return; } if (first) { syn.ready = false; } sessionTake(theirs, at); done(); } },
      function () { if (syn.code !== code || !atTable()) { return; } DM.base = at; DM.table = code; save(true); done(); keepOnTable(true); });
  }
  /* this device and the table agree on the story: tell the phones, set the stage, count the turns */
  function synced() { if (A.screen() === 'dm') { takeTurns(); tell(); refresh(); } }
  /* send the session to the table: a moment after the last change, so a burst of changes is one save */
  function keepOnTable(now) {
    if (!canKeep() || syn.code !== TB.code() || !syn.ready) { return; }
    clearTimeout(syn.timer);
    syn.timer = setTimeout(sessionSend, now ? 0 : 1200);
  }
  function sessionSend() {
    var code = atTable() ? TB.code() : '', blob, at;
    if (!code || syn.code !== code || !syn.ready || syn.asking) { return; }
    if (syn.busy) { syn.timer = setTimeout(sessionSend, 600); return; }
    blob = run.pack(DM); at = DM.at || stamp();
    if (!blob || (blob === syn.sent && DM.base === at && DM.table === code)) { return; }
    syn.busy = true;
    /* The save names the one it was made on top of. If another device has saved since, the table
       refuses it (so the story never goes backwards behind anyone's back) and this device looks at the
       table again: FR.run.sync then takes up the newer place, or asks. Refused three times running, it
       is sent without a base, so a table that cannot agree is never stuck. */
    TB.saveSession(blob, at, syn.stale >= 3 ? undefined : (DM.table === code ? DM.base : 0)).then(function (j) {
      if (syn.code !== code) { return; }
      syn.stale = 0; syn.sent = blob; DM.base = (j && j.at) || at; DM.table = code; save(true);
    }, function (e) {
      if (syn.code !== code || !e || e.status !== 409 || e.reason !== 'stale') { return; }      // anything else: the next change sends it again
      syn.stale = (syn.stale || 0) + 1; return 'stale';
    }).then(function (how) {
      if (syn.code !== code) { return; }
      syn.busy = false;
      if (how === 'stale' && atTable()) { clearTimeout(syn.timer); sessionFetch(); return; }
      if (DM.at > DM.base && atTable()) { clearTimeout(syn.timer); syn.timer = setTimeout(sessionSend, 4000); }       // the story moved on while that was in the air, or it did not arrive
    });
  }
  /* "Start a new session": back to the cover, here and on the table. The table's own run is cleared
     first (what was sent, the rolls, the scene, the stage, any vote), so a phone never shows the old
     story under the new one; seats and heroes stay. */
  function newSession() {
    var code = atTable() ? TB.code() : '', party = DM.party, old = DM;
    var go = function () {
      DM = fresh(); DM.party = party;
      DM.turns.code = old.turns.code; DM.turns.after = Math.max(old.turns.after, old.turns.seen, newest());        // what was rolled before is never counted again
      DM.base = old.base; DM.table = old.table;
      stq.over = {}; stq.turns = ''; ui.tab = 'run'; ui.ak = {}; ui.form = null; clockMark = 0;
      save(); keepOnTable(true); renderAll();
      toast(code ? 'A new session. Every phone is back at the cover.' : 'A new session.');
    };
    if (!code || !TB.reset) { go(); return; }
    TB.reset().then(go, function (e) { if (A.screen() === 'dm') { toast((e && e.message) || 'The table could not be cleared just now, so nothing was changed. Try again.'); } });
  }

  /* ---------- the stage: what the whole table is shown ----------
     One small object every phone and the big screen receive (FR.run builds its parts). Changes go to
     the table one at a time and in order; a part changed here shows on this screen at once, and the
     table's own copy takes over as soon as it has caught up. */
  var stq = { busy: false, next: null, loud: false, over: {}, was: undefined, turns: '' };
  var BARE = { reveal: null, map: null, sound: null, beat: null, spot: '', order: [], now: '' };
  function stageView() {
    var s = atTable() && TB.stage ? TB.stage() : null;
    if (stq.was !== undefined && s !== stq.was && !stq.busy && !stq.next) { stq.over = {}; stq.was = undefined; }
    return Object.assign({}, BARE, s || {}, atTable() ? stq.over : {});
  }
  /* quiet: something the story did by itself, so a failure is not worth a word */
  function stage(patch, quiet) {
    if (!atTable() || !TB.setStage) { return; }
    stq.next = Object.assign(stq.next || {}, patch);
    Object.keys(patch).forEach(function (k) { if (k !== 'beat') { stq.over[k] = patch[k] === null ? BARE[k] : patch[k]; } });
    stq.loud = stq.loud || !quiet;
    stagePump(); refresh();
  }
  function stagePump() {
    var p = stq.next, loud = stq.loud;
    if (stq.busy || !p) { return; }
    stq.next = null; stq.loud = false; stq.busy = true;
    TB.setStage(p).then(function () { stq.was = TB.stage(); }, function (e) { stq.over = {}; stq.turns = ''; if (loud && A.screen() === 'dm') { oops(e); } })
      .then(function () { stq.busy = false; if (stq.next) { stagePump(); } else if (A.screen() === 'dm') { refresh(); } });
  }
  var mapSig = function (m) { return m ? m.id + '|' + (m.open || []).join(',') : ''; };
  /* The stage follows the story. Arriving somewhere new puts up that place's map and its soundscape
     (unless the DM has switched that off) and takes away a picture that was turned over; and whenever
     the flags uncover a region of the map that is up, the map is sent again. */
  function stageFollow() {
    var S = DM.stage, o = run.offers(ST, DM), v = stageView(), patch = {}, m, T = DM.turns;
    if (S.at !== o.key) {
      /* The story has moved on. A fight that every foe is out of is over, so its turn order comes down by
         itself: otherwise the big screen goes on saying whose turn it is for the rest of the night. One
         with a foe still standing (or with no foes at all) is the DM's to clear. */
      if (S.at && T.rows.some(function (r) { return !!r.foe; }) && T.rows.every(function (r) { return !r.foe || foeOut(r); })) {
        T.rows = []; T.at = ''; T.round = 1; T.after = Math.max(T.after, T.seen, newest());
        if (A.screen() === 'dm') { toast('That fight is over, so the turn order has come down from every screen.'); }
      }
      S.at = o.key;
      if (o.map) { S.map = o.map.id; unhand(o.map); }
      if (o.sound && S.auto) { patch.sound = { bed: o.sound, level: S.level }; }
      if (v.reveal && v.reveal.shown) { patch.reveal = null; }
      ui.dial = ''; save();
    }
    m = S.map ? run.stageMap(ST, DM, S.map, S.hand[S.map]) : null;
    if (S.map && !m) { S.map = ''; if (v.map) { patch.map = null; } }       // the adventure no longer has that map: it comes down
    if (m && mapSig(m) !== mapSig(v.map)) { patch.map = m; }
    if (Object.keys(patch).length) { stage(patch, true); }
  }
  /* a place's own regions are shown when the story arrives there, whatever the DM covered by hand before */
  function unhand(map) { var h = DM.stage.hand[map.id]; if (h) { (map.open || []).forEach(function (r) { if (h[r] === false) { delete h[r]; } }); } }
  /* the turn order and whose turn it is, for the big screen: sent whenever either changes */
  function stageTurns() {
    var o, sig;
    if (!atTable() || !syn.ready || !TB.setStage) { return; }
    o = run.order(DM.turns, TB.players()); sig = TB.code() + JSON.stringify(o);
    if (sig === stq.turns) { return; }
    stq.turns = sig;
    if (JSON.stringify({ order: stageView().order, now: stageView().now }) !== JSON.stringify(o)) { stage({ order: o.order, now: o.now }, true); }
  }
  /* The soundscape and the beats, on this device as well: for a room with no big screen, where the DM's
     laptop is the only loudspeaker. With a big screen linked it stays quiet here unless the DM says
     otherwise. A soundscape that is a music file takes the place of the cartridge's own music. */
  var snd = { on: false, hushed: false };
  var hearHere = function () { var h = DM.stage.here; return h === true || (h !== false && !(TB && TB.hasScreen && TB.hasScreen())); };
  function soundHere() {
    var Amb = FR.Ambience, s = stageView().sound, bed = s && s.bed && FR.theme && FR.theme.beds ? FR.theme.beds[s.bed] : null, on = atTable() && A.screen() === 'dm' && hearHere() && !!bed;
    if (!Amb) { return; }
    if (on) {
      if (bed.file && FR.Music && !snd.hushed) { FR.Music.scene(''); snd.hushed = true; }
      else if (!bed.file && snd.hushed) { FR.Music.scene('game'); snd.hushed = false; }
      Amb.play(bed); Amb.level(typeof s.level === 'number' ? s.level : 1);
    } else if (snd.on) {
      Amb.stop();
      if (snd.hushed && A.screen() === 'dm') { FR.Music.scene('game'); }
      snd.hushed = false;
    }
    snd.on = on;
  }

  /* ---------- the pacing clock ----------
     Time counts while the story is under way and this screen is open: a tick that comes long after
     the last one (the laptop slept, the page was shut) adds nothing, so a session picked up the next
     day carries on from the minutes actually played. */
  var clockMark = 0;
  function clockTick() {
    var now = Date.now(), gap = clockMark ? now - clockMark : 0, kind = ST ? run.place(ST, DM).kind : 'cover';
    if (!ST || A.screen() !== 'dm' || kind === 'cover' || kind === 'end') { clockMark = 0; return; }
    clockMark = now;
    if (gap > 0 && gap < 90000) { DM.clock.spent += gap; save(true); }
  }
  var paceNow = function () { return ST ? run.pace(ST, DM, DM.clock.spent) : null; };
  function publish() {
    var want = pub.code + pub.sig;
    clearTimeout(pub.again); pub.busy = true; pub.state = 'sending';
    TB.publish(pub.scene).then(function () { pub.sent = want; pub.state = 'sent'; }, function (e) {
      pub.state = 'failed'; pub.hard = !!(e && e.status >= 400 && e.status < 500 && e.status !== 429);       // refused, not lost on the way: sending it again would change nothing
    }).then(function () {
      var here = !!pub.code && atTable() && TB.code() === pub.code, stale = here && pub.code + pub.sig !== pub.sent;
      pub.busy = false;
      if (!here) { pub.state = 'none'; }
      else if (stale && pub.state === 'sent') { publish(); }                 // the story moved on while that one was in the air
      else if (stale && !pub.hard) { pub.again = setTimeout(function () { if (!pub.busy && atTable() && A.screen() === 'dm') { tell(); refresh(); } }, 6000); }     // no signal for a moment: try again shortly
      refresh();
    });
  }
  /* What the players' phones show now, drawn small, so nothing reaches them unseen. */
  function seePanel(box) {
    var d = el('details', 'see'), sm = el('summary'), b = el('div', 'see-b');
    d.open = !!ui.see; d.addEventListener('toggle', function () { ui.see = d.open; });
    d.appendChild(sm); d.appendChild(b); box.appendChild(d);
    watch(d, function () {
      var s = pub.scene || run.scene(ST, DM), ph = el('div', 'ph'), state = atTable() ? pub.state : 'none', sec;
      var part = function (head, rows, draw) {
        if (!rows.length) { return; }
        sec = el('div', 'ph-sec'); sec.appendChild(el('div', 'ph-h', head));
        rows.forEach(function (r) { sec.appendChild(draw(r)); });
        ph.appendChild(sec);
      };
      clear(sm); clear(b);
      sm.appendChild(el('span', 'see-dot ' + state));
      sm.appendChild(el('b', '', 'What your players see'));
      sm.appendChild(el('small', '', { none: atTable() ? 'Not sent yet' : 'No table open', sending: 'Sending…', sent: 'On their phones now', failed: 'Not sent yet', held: 'Waiting for your answer' }[state]));
      if (s.img) { var im = el('img', 'ph-img'); im.src = s.img; im.alt = ''; ph.appendChild(im); }
      if (s.chapter) { ph.appendChild(el('small', 'ph-c', s.chapter)); }
      ph.appendChild(el('h4', 'ph-t', s.title));
      if (s.summary) { ph.appendChild(el('p', 'ph-p', s.summary)); }
      part('They can tap', s.cards, function (c) { var r = el('div', 'ph-card'); r.appendChild(el('b', '', c.label)); if (c.hint) { r.appendChild(el('small', '', c.hint)); } return r; });
      part('Quests', s.quests, function (q) { return el('p', 'ph-li' + (q.done ? ' done' : ''), (q.done ? 'Done: ' : '') + q.text); });
      part('Clues', s.clues, function (c) { return el('p', 'ph-li', c.text); });
      part('Who’s who', s.people, function (p) { var r = el('div', 'ph-who'), t = el('span'); if (p.img) { var i = el('img'); i.src = p.img; i.alt = ''; r.appendChild(i); } t.appendChild(el('b', '', p.name)); t.appendChild(el('small', '', p.line)); r.appendChild(t); return r; });
      part('The story so far', s.story, function (l) { return el('p', 'ph-li', l); });
      b.appendChild(ph);
      b.appendChild(el('p', 'tb-tip', !atTable() ? 'Open a table and this is what your players’ phones will show.'
        : (state === 'failed' ? (pub.hard ? 'The table would not take this. Move the story on and it is sent again.' : 'This has not reached the table yet. Trying again every few seconds.')
          : (s.id === '/cover' ? 'Until you begin, phones show only the name of the story.' : 'Only this goes to phones. Your notes, the rolls behind each card and every secret stay on this screen.'))));
    });
  }

  /* ---------- sending: everything the DM shows goes through one composer ----------
     It draws the note, picture, handout or hero as a phone will, says who gets it, and only then
     sends. item: { title, text, image, hero }. o.to: a seat it is meant for; o.heroes: choosing a
     ready-made hero for that seat; o.own: the DM's own note, kept if the composer is put away. */
  /* The card as a phone draws it. The phone's story screen (src/table.js) builds each thing the DM sends
     as an .tl-item, styled by src/css/play.css; this builds the very same elements with the very same
     class names, inside a frame the width of a phone, so the preview is that card and not a likeness
     of it: the same type, the same picture fitted the same way. If the table ever offers its own
     builder (FR.table.entry), that is used instead, so the two cannot drift apart. */
  function phoneCard(it, to) {
    var own = !!to && to !== 'all', kind = it.hero ? 'hero' : (it.image ? 'image' : 'note'), frame = el('div', 'dm-phone'), p = it.hero ? premade(it.hero) : null, c = null, im, b;
    var pic = function (src) { im = el('img', 'tl-img'); im.src = src; im.alt = ''; return im; };
    if (TB && typeof TB.entry === 'function') {
      try { c = TB.entry({ kind: kind, key: 'preview', at: 0, item: { n: 0, title: it.title, text: it.text, img: it.image, hero: it.hero, kind: it.hero ? 'hero' : '', to: own ? to : '' } }, false); } catch (e) { c = null; }
    }
    if (!c) {
      c = el('article', 'tl-item tl-' + kind + (own ? ' tl-own' : ''));
      c.appendChild(el('div', 'tl-k', it.hero ? word('heroOffer', 'Your DM offers you a ready-made hero') : (own ? word('onlyYou', 'Only for you') : word('fromDM', 'From your DM'))));
      if (it.hero) {
        if (p) { if (p.portrait) { c.appendChild(pic(p.portrait)); } c.appendChild(el('h3', 'tl-t', p.name)); c.appendChild(el('small', 'tl-c', [p.race, p.cls].filter(Boolean).join(' '))); }
        else { c.appendChild(el('h3', 'tl-t', it.hero)); }
        if (it.text) { c.appendChild(el('p', 'tl-p', it.text)); }
        b = el('span', 'btn wax', word('heroTake', 'Take this hero')); c.appendChild(b);
      } else {
        if (it.image) { c.appendChild(pic(it.image)); }
        if (it.title || !it.image) { c.appendChild(el('h3', 'tl-t', it.title || word('handoutNote', 'A note from your DM'))); }
        if (it.text) { c.appendChild(el('p', 'tl-p', it.text)); }
      }
    }
    /* it is a picture of a card: nothing in it can be pressed or reached with the keyboard */
    c.setAttribute('inert', ''); Array.prototype.forEach.call(c.querySelectorAll('button, a'), function (x) { x.tabIndex = -1; });
    frame.appendChild(c);
    return frame;
  }
  function compose(item, o) {
    o = o || {};
    var it = { title: (item && item.title) || '', text: (item && item.text) || '', image: (item && item.image) || '', hero: (item && item.hero) || '' };
    var to = o.to || 'all', who = o.to ? seat(o.to) : null, at = atTable(), sent = false;
    if (o.to && !who) { toast('That player is no longer at the table.'); return; }
    dialogOpen(o.heroes ? 'A ready-made hero for ' + who.name : (at ? 'Send to your players' : (it.title || 'To show your players')), function (body) {
      var card = el('div', 'dm-phone-wrap'), go = btn('btn wax slim', '', null), first = null, lbl = function (text, field) { var l = el('label', 'cf-l'); l.appendChild(el('span', '', text)); l.appendChild(field); return l; };
      var draw = function () {
        clear(card); card.appendChild(phoneCard(it, to));
        go.textContent = o.heroes ? (it.hero ? 'Offer ' + it.hero + ' to ' + who.name : 'Choose a hero first') : (to === 'all' ? 'Send to everyone' : 'Send only to ' + whoWords(to));
        go.disabled = !!o.heroes && !it.hero;
      };
      if (o.heroes) {
        var taken = {}, grid = el('div', 'hero-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Ready-made heroes');
        (TB ? TB.players() : []).forEach(function (p) { if (p.char && p.char.name) { taken[p.char.name] = p.name; } });
        premades().forEach(function (h) {
          var b = btn('hero-opt', '', function () { it.hero = h.name; Array.prototype.forEach.call(grid.children, function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); draw(); }), t = el('span');
          if (h.portrait) { var hi = el('img'); hi.src = h.portrait; hi.alt = ''; b.appendChild(hi); }
          t.appendChild(el('b', '', h.name)); t.appendChild(el('small', '', taken[h.name] ? 'Played by ' + taken[h.name] : [h.race, h.cls].filter(Boolean).join(' ')));
          b.appendChild(t); b.setAttribute('aria-pressed', 'false'); b.disabled = !!taken[h.name]; grid.appendChild(b);
          if (!first && !b.disabled) { first = b; }
        });
        body.appendChild(el('p', 'cover-p', who.name + ' gets the offer on their phone and can take it with one tap. Nothing changes for them unless they do.'));
        body.appendChild(grid);
      } else if (at) {
        if (o.to) { body.appendChild(el('p', 'cover-p', 'Only ' + who.name + ' will get this.')); }
        else { body.appendChild(lbl('Who gets it', whoSelect(to, 'Who gets it', function (v) { to = v; draw(); }))); }
      } else { body.appendChild(el('p', 'cover-p', 'No table is open, so there are no phones to send this to. Read it out, or turn your screen round.')); }
      if (at && !o.heroes) {
        var ti = el('input', 'field'); ti.type = 'text'; ti.maxLength = 80; ti.value = it.title; ti.placeholder = word('handoutNote', 'A note from your DM');
        ti.addEventListener('input', function () { it.title = ti.value; draw(); });
        body.appendChild(lbl('Title (optional)', ti));
      }
      if (at) {
        var ta = el('textarea', 'field area'); ta.rows = 3; ta.maxLength = o.heroes ? 300 : 1200; ta.value = it.text; ta.placeholder = o.heroes ? 'A few words to go with it' : 'A clue, a letter, a secret message…';
        ta.addEventListener('input', function () { it.text = ta.value; draw(); });
        body.appendChild(lbl(o.heroes ? 'A few words to go with it (optional)' : 'What it says', ta));
        if (!first) { first = ta; }
      }
      if (at && !o.heroes) {
        var pickF = el('input'), tools = el('div', 'cf-pic'), addB = btn('btn ghost slim', '', function () { pickF.click(); }), dropB = btn('btn ghost slim', 'No picture', function () { it.image = ''; pickF.value = ''; pics2(); draw(); });
        var pics2 = function () { addB.textContent = it.image ? 'Choose a different picture' : 'Add a picture of your own'; dropB.hidden = !it.image; };
        pickF.type = 'file'; pickF.accept = 'image/*'; pickF.hidden = true;
        pickF.addEventListener('change', function () {
          var f = pickF.files && pickF.files[0]; if (!f) { return; }
          shrink(f).then(function (d) { it.image = d; pics2(); draw(); }).catch(function () { toast('That picture could not be read. Try another.'); });
        });
        pics2(); tools.appendChild(pickF); tools.appendChild(addB); tools.appendChild(dropB); body.appendChild(tools);
      }
      body.appendChild(el('div', 'dm-h', at ? 'On their phone' : 'What it is'));
      body.appendChild(card);
      var row = el('div', 'confirm-b');
      if (at) {
        go.addEventListener('click', function () {
          var title = it.title.trim(), text = it.text.trim(), msg = { title: title, text: text };
          if (o.heroes) { msg = { hero: it.hero, title: shorten('A ready-made hero for you: ' + it.hero, 80), text: text }; }
          else if (!title && !text && !it.image) { ta.focus(); return; }
          else if (it.image) { msg.image = it.image; }
          else if (!title) { msg.title = word('handoutNote', 'A note from your DM'); }
          if (to !== 'all') { msg.to = to; }
          go.disabled = true;
          TB.send(msg).then(function (j) {
            sent = true; dialogShut();
            toast(o.heroes ? 'Offered to ' + who.name + '. It is on their phone now.' : (j.players ? 'Sent to ' + (msg.to ? whoWords(to) : j.players + (j.players === 1 ? ' player' : ' players')) + '.' : 'Sent. Nobody has joined the table yet.'));
          }).catch(function (e) { go.disabled = false; toast((e && e.message) || 'That could not be sent. Try again.'); });
        });
        row.appendChild(go);
      } else if (TB && TB.can()) { row.appendChild(btn('btn wax slim', 'Open a table', function () { dialogShut(); reopen(); })); }
      row.appendChild(btn('btn ghost slim', at ? 'Not now' : 'Close', dialogShut));
      body.appendChild(row);
      draw();
      return first;
    }, function () {
      /* the DM's own note is kept while it is unsent, and cleared once it has gone */
      if (o.own) { draft.note = sent ? '' : it.text; draft.att = sent ? '' : it.image; if (A.screen() === 'dm') { renderSide(); if (sheetIs === 'table' && !$('dm-sheet').hidden) { openTable(); } } }
    });
  }
  function offerHero(id) { compose({}, { to: id, heroes: true }); }
  /* The handouts the adventure has for this moment, as buttons. Each opens in the composer; one already sent says so. */
  function handoutsRow() {
    var list = run.handouts(ST, DM), wrap = el('div', 'gives'), row = el('div', 'cast');
    if (!list.length) { return null; }
    wrap.appendChild(el('div', 'dm-h', atTable() ? 'To hand out' : 'To read out or show'));
    wrap.appendChild(row);
    watch(row, function () {
      var feed = atTable() ? TB.feed() : [], h = held(row);
      clear(row);
      list.forEach(function (x, i) {
        var title = x.title || 'A note', gone = feed.some(function (f) { return f.title === run.cut(title, 80); });
        var b = btn('chipd give' + (gone ? ' gone' : ''), title + (gone ? ' · sent' : ''), function () { compose({ title: title, text: x.text || '', image: x.img || '' }); });
        b.setAttribute('data-k', 'give' + i); row.appendChild(b);
      });
      back(row, h);
    });
    return wrap;
  }

  /* ---------- asks: what the players want to do, and the rolls the DM has asked for ---------- */
  function asksNow() { return atTable() && TB.asks ? TB.asks() : []; }
  function reqsNow() { return atTable() && TB.requests ? TB.requests() : []; }
  var waiting = function () { return asksNow().filter(function (a) { return !a.verdict; }); };
  var asksInView = function () { return wide() ? ui.side === 'asks' : ui.tab === 'asks'; };
  /* bring the asks into view: beside the story on a wide screen, as the tab on a phone */
  function showAsks() {
    if (wide()) { if (ui.side !== 'asks') { ui.side = 'asks'; A.store.set(SIDE, 'asks'); } renderSide(); }
    else { ui.tab = 'asks'; render(); $('dm-body').scrollTop = 0; }
  }
  /* a proposal in a few words: the card's own title, or what the player typed */
  function askWords(a) { var hit = a.kind === 'card' ? run.tryOf(ST, a.card) : null; return a.kind === 'card' ? (hit ? hit.t.try : 'try something from an earlier scene') : '“' + a.text + '”'; }
  /* A new proposal is announced once: the cartridge's "something has arrived" sound, a line for a
     screen reader, a count on the way to the list and, when the list is not in view, a word at the top. */
  function hearAsks() {
    if (!atTable() || !ST) { return; }
    liveLoad();
    var top = 0, fresh, a, msg;
    asksNow().forEach(function (x) { top = Math.max(top, x.n); });
    if (top < live.heard) { live.heard = 0; }          // the numbering began again: another table under an old code
    fresh = waiting().filter(function (x) { return x.n > live.heard; });
    if (top > live.heard) { live.heard = top; liveKeep(); }
    if (!fresh.length) { return; }
    a = fresh[fresh.length - 1];
    msg = fresh.length > 1 ? fresh.length + ' players are waiting for your answer.' : (a.name || 'A player') + (a.kind === 'card' ? ' wants to: ' : ' says: ') + askWords(a);
    say(msg);
    if (FR.sfx) { FR.sfx('arrive'); }
    if (!asksInView()) { toast(msg + (wide() ? '' : ' Tap Asks to answer.')); }
  }
  /* The DM asks for a roll: `r` is { label, why, skill, target, yes, no }, `to` is 'all' or one seat,
     `key` the scene it belongs to. Gives a promise of the request's number. */
  function askFor(r, to, key) {
    var body = { to: to === 'all' || !to ? 'all' : [to], label: r.label, why: r.why || '', skill: r.skill || '', yes: r.yes || '', no: r.no || '' };
    if (typeof r.target === 'number') { body.target = r.target; }
    return TB.request(body).then(function (j) {
      liveLoad(); if (j && j.n) { live.reqs[j.n] = key || run.place(ST, DM).key; liveKeep(); }
      return j;
    });
  }
  /* the server's own words when it answered; when nothing came back at all (no signal), a plain line and not the browser's */
  var oops = function (e) { toast((e && e.status && e.message) || (navigator.onLine === false ? 'This device is offline, so that did not reach the table. Try again when it is back.' : 'That did not go through. Try again.')); };

  /* One proposal, with everything the DM needs to answer it in one tap. For a card that is the try it
     stands for, with the roll, and what to read either way; for something typed, the check the
     words sound like. `again` draws the list afresh. */
  function askCard(a, again) {
    var p = seat(a.id), hit = a.kind === 'card' ? run.tryOf(ST, a.card) : null, t = hit && hit.t, kind = t ? run.kind(t) : 'hand', here = run.place(ST, DM).key;
    var hint = !t && a.kind !== 'card' && FR.checkFor ? FR.checkFor(a.text) : null;
    var r = t ? run.ask(t) : { label: run.cut(a.text, run.CAP.label), why: '', skill: (hint && hint.skill) || '', target: null, yes: '', no: '' };
    var d = ui.ak[a.n] || (ui.ak[a.n] = { note: '', open: false, skill: r.skill, target: r.target === null ? 13 : r.target, shown: false });
    var yesLine = shorten((t && t.yes) || '', run.CAP.note), tip = null;
    var c = el('article', 'ak'), who = el('header', 'ak-who'), name = el('b', '', a.name || 'A player'), when = el('time', '', ago(a.at)), go = el('div', 'ak-go'), note = el('textarea', 'field ak-note'), k = 'a' + a.n + ':';
    /* the few words back are shown whole, however long: the box grows to hold them */
    var roomy = function () { note.rows = Math.max(1, Math.min(7, Math.ceil(note.value.length / 34) + (note.value.split('\n').length - 1))); };
    var busy = function (on) { Array.prototype.forEach.call(c.querySelectorAll('button, input, select, textarea'), function (x) { x.disabled = on; }); };
    var answer = function (verdict, words) {
      busy(true);
      return TB.answer(a.n, verdict, shorten(words, run.CAP.note)).then(function () { delete ui.ak[a.n]; say('Answered ' + (a.name || 'the player') + '.'); }).catch(function (e) { oops(e); again(); });
    };
    var roll = function () {
      busy(true);
      /* already asked for this very roll (say, from everyone a moment ago) and still waiting on this player: one roll is enough */
      var open = (TB.requests ? TB.requests() : []).some(function (q) { return !q.closed && q.label === r.label && (q.to || []).indexOf(a.id) >= 0 && !(q.results && q.results[a.id]); });
      if (open) { answer('roll', d.note); return; }
      askFor({ label: r.label, why: r.why, skill: kind === 'roll' ? r.skill : d.skill, target: kind === 'roll' ? r.target : d.target, yes: r.yes, no: r.no }, a.id, hit ? hit.key : here)
        .then(function () { return answer('roll', d.note); }, function (e) { oops(e); again(); });
    };
    who.appendChild(face(p));
    if (p && p.char && p.char.name) { name.appendChild(el('i', '', ' · ' + p.char.name)); }
    who.appendChild(name); when.setAttribute('data-at', String(a.at)); who.appendChild(when); c.appendChild(who);
    c.appendChild(el('p', 'ak-what', a.kind === 'card' ? (t ? t.try : 'A card from a scene that is no longer in this story') : '“' + a.text + '”'));
    if (t) {
      if (hit.key !== here) { c.appendChild(el('p', 'ak-late', 'Tapped in an earlier scene: ' + hit.scene.title)); }
      if (t.roll) { c.appendChild(line(t.check === false ? 'Roll' : 'Ask for', t.roll)); }
      if (t.yes) { c.appendChild(line(t.no ? 'If it works' : 'What happens', t.yes, true)); }
      if (t.no) { c.appendChild(line('If it does not', t.no, true)); }
    } else if (hint) { c.appendChild(line('Sounds like', skillWord(hint.skill))); }
    note.maxLength = run.CAP.note; note.value = d.note; note.placeholder = 'A few words back (optional)'; note.setAttribute('aria-label', 'A few words back to ' + (a.name || 'the player') + ', optional'); note.setAttribute('data-k', k + 'note');
    roomy();
    note.addEventListener('input', function () { d.note = note.value; roomy(); });
    c.appendChild(note);
    if (d.shown) { tip = el('p', 'tb-tip', 'This line goes to ' + (a.name || 'the player') + ' with your yes. Change it if you like, then send it.'); c.appendChild(tip); }
    /* the same three answers every time; the one the adventure points to stands out. A plain yes to a card
       sends the card's own "if it works" line: the first tap puts that line in the box above, where it can
       be read and changed, and the second sends it. */
    [['yes', kind === 'none' || d.shown ? 'wax' : 'ghost', d.shown ? 'Send yes' : 'Yes', function () {
      if (!d.shown && !d.note.trim() && yesLine) { d.note = yesLine; d.shown = true; again(k + 'note'); return; }
      answer('yes', d.note);
    }],
      ['roll', kind === 'roll' ? 'wax' : 'ghost', 'Roll for it', function () { if (kind === 'roll') { roll(); } else { d.open = !d.open; again(k + (d.open ? 'skill' : 'roll')); } }],
      ['no', 'ghost', 'No', function () { answer('no', d.note); }]].forEach(function (x) {
      var b = btn('btn ' + x[1] + ' slim', x[2], x[3]); b.setAttribute('data-k', k + x[0]);
      if (x[0] === 'roll' && kind !== 'roll') { b.setAttribute('aria-expanded', d.open ? 'true' : 'false'); }
      go.appendChild(b);
    });
    c.appendChild(go);
    if (d.open && kind !== 'roll') {
      var pick = el('div', 'ak-pick'), sk = skillSelect(d.skill, function (v) { d.skill = v; }), send = btn('btn wax slim', 'Ask ' + firstName(p || a) + ' to roll', roll);
      sk.setAttribute('data-k', k + 'skill'); send.setAttribute('data-k', k + 'send');
      pick.appendChild(sk); pick.appendChild(levelSeg(d.target, false, function (v) { d.target = v; })); pick.appendChild(send);
      c.appendChild(pick);
    }
    return c;
  }
  function proposalsPanel(box) {
    var sec = el('section', 'aks'), none = el('p', 'cover-p'), list = el('div', 'ak-list'), old = el('div', 'ak-old'), sig = null;
    var draw = function (force, focus) {
      var all = asksNow(), open = all.filter(function (a) { return !a.verdict; }), done = all.filter(function (a) { return a.verdict; }).slice(-4).reverse();
      var now = JSON.stringify([open, done.map(function (a) { return [a.n, a.verdict]; }), (TB ? TB.players() : []).map(function (p) { return [p.id, p.name, p.portrait, p.char && p.char.name]; }), run.place(ST, DM).key]), h;
      if (now === sig && !force) { return; }
      sig = now; h = held(list);
      clear(list); clear(old);
      none.hidden = !!open.length;
      none.textContent = atTable() ? 'Nobody is waiting. When a player taps a card or types what they do, it lands here for you to answer.' : 'With a table open, what your players tap or type on their phones lands here for you to answer.';
      open.forEach(function (a) { list.appendChild(askCard(a, function (to) { draw(true, to); })); });
      if (done.length) { old.appendChild(el('div', 'dm-h', 'Answered')); }
      done.forEach(function (a) { var r = el('p', 'ak-done'); r.appendChild(el('b', '', { yes: 'Yes', no: 'No', roll: 'Roll for it' }[a.verdict] + ' ')); r.appendChild(document.createTextNode((a.name || 'A player') + ': ' + askWords(a))); old.appendChild(r); });
      Object.keys(ui.ak).forEach(function (n) { if (!open.some(function (a) { return String(a.n) === n; })) { delete ui.ak[n]; } });
      back(list, focus ? { k: focus } : h);           // a tap that opened something puts the keyboard in it; otherwise it stays where it was
    };
    sec.appendChild(el('h3', 'dm-h', 'Your players want to…')); sec.appendChild(none); sec.appendChild(list); sec.appendChild(old); box.appendChild(sec);
    watch(list, function () { draw(false); });
  }

  /* One roll the DM asked for: who was asked, and each result as it arrives, with pass or fail and the
     line that player was shown. With no number to beat the DM says how each one went. */
  function reqCard(q, offer) {
    var res = q.results || {}, rolled = q.to.filter(function (id) { return !!res[id]; }), all = rolled.length === q.to.length;
    var c = el('article', 'rq' + (q.closed ? ' off' : (all ? ' done' : ''))), head = el('header', 'rq-h'), k = 'q' + q.n + ':', foot = el('div', 'rq-foot'), when = el('time', '', ago(q.at));
    head.appendChild(el('b', '', q.label));
    head.appendChild(el('small', '', [q.skill ? skillWord(q.skill) : 'A plain roll', typeof q.target === 'number' ? run.level(q.target) : 'you say how it went'].join(' · ')));
    c.appendChild(head);
    q.to.forEach(function (id) {
      var p = seat(id), r = res[id], row = el('div', 'rq-row' + (r ? (r.pass === true ? ' pass' : (r.pass === false ? ' fail' : ' open')) : ' wait')), t = el('span', 'rq-who');
      row.appendChild(face(p));
      t.appendChild(el('b', '', p ? p.name : 'A player'));
      if (!r) { t.appendChild(el('small', '', q.closed ? 'Did not roll' : 'Rolling…')); row.appendChild(t); c.appendChild(row); return; }
      t.appendChild(el('small', 'rq-how', (r.pass === true ? 'Passed' : (r.pass === false ? 'Did not pass' : 'Your call')) + (r.nat === 20 || r.nat === 1 ? ' · Natural ' + r.nat : '')));
      if (r.pass !== null && (r.pass ? q.yes : q.no)) { t.appendChild(el('small', 'rq-said', 'They read: ' + (r.pass ? q.yes : q.no))); }
      row.appendChild(t); row.appendChild(el('strong', 'to-n', String(r.total)));
      c.appendChild(row);
      if (q.target === null || q.target === undefined) {       // no number to beat: the DM says how it went, and may change their mind
        var call = el('div', 'rq-call');
        [[true, 'They pass'], [false, 'They fail']].forEach(function (x) {
          var b = btn('btn slim ' + (r.pass === x[0] ? 'wax' : 'ghost'), x[1], function () { TB.judge(q.n, id, x[0]).catch(oops); });
          b.setAttribute('aria-pressed', r.pass === x[0] ? 'true' : 'false'); b.setAttribute('aria-label', (p ? p.name : 'This player') + ': ' + x[1].toLowerCase()); b.setAttribute('data-k', k + id + (x[0] ? ':y' : ':n'));
          call.appendChild(b);
        });
        c.appendChild(call);
      }
    });
    when.setAttribute('data-at', String(q.at));
    foot.appendChild(el('small', '', q.closed ? 'Called off · ' : (all ? 'Everyone has rolled · ' : rolled.length + ' of ' + q.to.length + ' rolled · '))); foot.lastChild.appendChild(when);
    if (!q.closed && !all) { var off = btn('mini', 'Call it off', function () { off.disabled = true; TB.cancel(q.n).catch(function (e) { off.disabled = false; oops(e); }); }); off.setAttribute('data-k', k + 'off'); foot.appendChild(off); }
    c.appendChild(foot);
    if (offer) {                    // everyone asked has rolled: the scene's own outcomes, right here
      var outs = el('div', 'outs'), s = sceneOf(offer.e);
      outs.appendChild(el('div', 'dm-h', s.outcomes.length > 1 ? 'What happened?' : 'When you are ready'));
      s.outcomes.forEach(function (o, i) { var b = btn('btn ghost slim out', o.label, function () { choose(offer.e, o); }); b.setAttribute('data-k', k + 'o' + i); outs.appendChild(b); });
      c.appendChild(outs);
    }
    return c;
  }
  function requestsPanel(box) {
    var sec = el('section', 'rqs'), none = el('p', 'cover-p'), list = el('div', 'rq-list'), sig = null;
    sec.appendChild(el('h3', 'dm-h', 'Rolls you asked for')); sec.appendChild(none); sec.appendChild(list); box.appendChild(sec);
    watch(list, function () {
      liveLoad();
      var all = reqsNow().slice(-6).reverse(), here = run.place(ST, DM).key, cur = current(), open = cur && (cur.e.k === 'scene' || cur.e.k === 'bridge') ? cur : null, top = 0, h;
      var now = JSON.stringify([all, (TB ? TB.players() : []).map(function (p) { return [p.id, p.name, p.portrait]; }), here, !!open, live.reqs]);
      if (now === sig) { return; }
      sig = now; h = held(list);
      /* the outcomes are offered once, under the newest finished roll that was asked in the scene still open */
      all.forEach(function (q) { if (open && !q.closed && live.reqs[q.n] === here && q.to.every(function (id) { return q.results && q.results[id]; })) { top = Math.max(top, q.n); } });
      clear(list);
      none.hidden = !!all.length;
      none.textContent = atTable() ? 'None yet. Tap “Ask for this roll” beside anything the players try, or ask for any roll below.' : 'With a table open you can ask one player, or everyone, to roll, and watch the results arrive here.';
      all.forEach(function (q) { list.appendChild(reqCard(q, q.n === top ? open : null)); });
      back(list, h);
    });
  }
  /* "Ask for a roll", for anything the adventure did not plan: what, why, which skill, how hard, and
     who. It is also where a try with no ready-made check sends the DM, filled in as far as its free
     words can be read. What is typed is kept in ui.form while the panels are drawn again. */
  function rollForm(prefill, key) {
    var r = prefill || {};
    ui.form = { label: r.label || '', why: r.why || '', skill: r.skill || '', target: typeof r.target === 'number' ? r.target : (prefill ? null : 13), yes: r.yes || '', no: r.no || '', to: ui.rollTo, key: key || '' };
    if (ui.form.target === null && !prefill) { ui.form.target = 13; }
    showAsks();
    var f = $('rf-label'); if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); }
  }
  function rollFormPanel(box) {
    var sec = el('section', 'rf'), f = ui.form;
    box.appendChild(sec);
    if (!atTable() || !TB.request) { return; }
    if (!f) { sec.appendChild(btn('btn ghost slim', 'Ask for a roll', function () { rollForm(null, ''); })); return; }
    var form = el('form', 'rf-form'), what = el('input', 'field'), why = el('input', 'field'), yes = el('input', 'field'), no = el('input', 'field'), more = el('details', 'try'), mb = el('div', 'try-b'), go = btn('btn wax slim', 'Ask for the roll', null);
    var lbl = function (text, field) { var l = el('label', 'cf-l'); l.appendChild(el('span', '', text)); l.appendChild(field); return l; };
    var text = function (inp, key, max, ph) { inp.type = 'text'; inp.maxLength = max; inp.value = f[key]; inp.placeholder = ph; inp.autocomplete = 'off'; inp.addEventListener('input', function () { f[key] = inp.value; }); return inp; };
    form.setAttribute('novalidate', ''); go.type = 'submit';
    sec.appendChild(el('h3', 'dm-h', 'Ask for a roll'));
    what.id = 'rf-label';
    form.appendChild(lbl('What is the roll for?', text(what, 'label', run.CAP.label, 'What they are trying to do')));
    form.appendChild(lbl('Why (optional, your players read this)', text(why, 'why', run.CAP.why, 'A line to go with it')));
    form.appendChild(lbl('Which skill?', skillSelect(f.skill, function (v) { f.skill = v; })));
    var hard = el('div', 'cf-l'); hard.appendChild(el('span', '', 'How hard?')); hard.appendChild(levelSeg(f.target, true, function (v) { f.target = v; })); form.appendChild(hard);
    form.appendChild(lbl('Who rolls?', whoSelect(f.to, 'Who rolls', function (v) { f.to = v; })));
    more.open = !!(f.yes || f.no); more.appendChild(el('summary', '', 'What their phone says afterwards (optional)'));
    mb.appendChild(lbl('If it works', text(yes, 'yes', run.CAP.say, 'What happens if the roll is good')));
    mb.appendChild(lbl('If it does not', text(no, 'no', run.CAP.say, 'What happens if it is not')));
    more.appendChild(mb); form.appendChild(more);
    form.appendChild(go);
    form.appendChild(btn('btn ghost slim', 'Never mind', function () { ui.form = null; showAsks(); }));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!f.label.trim()) { what.focus(); return; }
      go.disabled = true;
      askFor({ label: f.label.trim(), why: f.why.trim(), skill: f.skill, target: f.target, yes: f.yes.trim(), no: f.no.trim() }, f.to, f.key).then(function () {
        toast('Asked ' + whoWords(f.to) + ' to roll.'); ui.form = null; showAsks();
      }).catch(function (e) { go.disabled = false; oops(e); });
    });
    sec.appendChild(form);
  }
  function asksPanel(box) {
    seePanel(box);
    proposalsPanel(box);
    requestsPanel(box);
    rollFormPanel(box);
    if (!atTable() && TB && TB.can()) { box.appendChild(btn('btn wax slim', 'Open a table', reopen)); }
  }

  /* ================= the shared table, on the DM's screens ================= */

  /* ---------- "For the whole table": the stage, one tap at a time, beside the scene it belongs to ---------- */
  var tokenWord = function () { return (FR.theme && FR.theme.kit && FR.theme.kit.token) || { name: 'Hero token', plural: 'Hero tokens', text: '' }; };
  var regionName = function (map, id) { var r = byId((run.map(ST, map) || {}).regions, id); return r && r.name ? r.name : id; };
  var listWords = function (list) { return list.length < 2 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; };
  var mins = function (m) { return run.span(Math.max(1, Math.round(m)) * 60000); };
  var serverNow = function () { return Math.round(TB && TB.serverNow ? TB.serverNow() : Date.now()); };
  /* One row of the box: what it is, and beside it whatever `draw` puts there. A row that follows the
     table is drawn again when what it shows (`sig`) has changed, and only then, so a tap is never lost
     to a redraw and the keyboard stays where it was. */
  function stageRow(box, label, sig, draw) {
    var row = el('div', 'stg-row'), body = el('div', 'stg-c'), last = null;
    row.appendChild(el('div', 'stg-l', label)); row.appendChild(body); box.appendChild(row);
    if (!sig) { draw(body); return row; }
    watch(body, function () {
      var now = JSON.stringify(sig()), h;
      if (now === last) { return; }
      last = now; h = held(body); clear(body); draw(body); back(body, h);
    });
    return row;
  }
  /* a setting that is on or off: a switch that says which */
  function flip(label, on, k, fn) {
    var b = btn('stg-f' + (on ? ' on' : ''), '', fn);
    b.appendChild(el('i')); b.appendChild(el('span', '', label));
    b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.setAttribute('data-k', k);
    return b;
  }
  /* Everything the place offers the table, and the DM. With no table open only the parts that need none
     are there (a fight, the difficulty dial); a place that offers nothing at all gets no box. */
  function stageBox() {
    var o = run.offers(ST, DM), at = atTable() && !!TB.setStage, dial = !!(o.easier || o.harder), d, sm, b;
    if (!at && !o.foes.length && !dial) { return null; }
    d = el('details', 'stg'); sm = el('summary'); b = el('div', 'stg-b');
    /* open where the place has something to offer, until the DM opens or shuts it by hand: after that it stays as they left it */
    var was = d.open = ui.stg === null ? !!(o.map || o.reveal || o.beats.length || o.vote || o.foes.length || dial) : ui.stg;
    d.addEventListener('toggle', function () { if (d.open !== was) { was = d.open; ui.stg = d.open; } });
    sm.appendChild(el('b', '', at ? 'For the whole table' : 'For this scene'));
    sm.appendChild(el('small', '', at ? 'The map, a picture, a moment, sound, a vote: one tap each, on every phone and the big screen' : 'A fight, and making it easier or harder'));
    d.appendChild(sm); d.appendChild(b);
    if (at && (ST.maps || []).length) { mapRow(b, o); }
    if (at && run.pictures(ST, DM).length) { pictureRow(b, o); }
    if (at && o.beats.length) { beatsRow(b, o); }
    if (at) { soundRow(b, o); voteRow(b, o); }
    if (o.foes.length) { foesRow(b, o); }
    if (dial) { dialRow(b, o); }
    return d;
  }

  /* the map: the place's own suggestion in one tap, and a panel to uncover or cover any region by hand */
  function mapRow(box, o) {
    stageRow(box, 'Map', function () { return [mapSig(stageView().map), DM.stage.map]; }, function (c) {
      var m = stageView().map, names = o.map ? o.map.open.map(function (r) { return regionName(o.map.id, r); }) : [], b;
      var shown = !!m && !!o.map && m.id === o.map.id && o.map.open.every(function (r) { return m.open.indexOf(r) >= 0; });
      c.appendChild(el('p', 'stg-s', m ? '“' + m.title + '” is up, with ' + m.open.length + ' of its ' + m.regions.length + ' places uncovered.' : 'No map is up.'));
      if (o.map) {
        b = btn('btn slim ' + (shown ? 'ghost' : 'wax'), (shown ? 'On the map' : 'Show on the map') + (names.length ? ': ' + listWords(names) : ''), function () { mapShow(o.map); });
        b.setAttribute('data-k', 'map-show'); b.disabled = shown; c.appendChild(b);
      }
      b = btn('btn ghost slim', 'Uncover or cover places…', function () { mapPanel(o.map ? o.map.id : ''); });
      b.setAttribute('data-k', 'map-panel'); c.appendChild(b);
    });
  }
  function mapShow(map) {
    DM.stage.map = map.id; unhand(map); save();
    stage({ map: run.stageMap(ST, DM, map.id, DM.stage.hand[map.id]) });
    toast('The map is up, on every phone and the big screen.');
  }
  function mapPanel(first) {
    var id = first || DM.stage.map || ((ST.maps || [])[0] || {}).id;
    dialogOpen('The map', function (body) {
      var pick = el('select', 'field'), view = el('div', 'mp'), list = el('div', 'mp-l'), row = el('div', 'confirm-b'), up = btn('btn wax slim', '', null), note = el('p', 'tb-tip'), lbl;
      var draw = function (focus) {
        var m = run.stageMap(ST, DM, id, DM.stage.hand[id]), on = DM.stage.map === id, im;
        clear(view); clear(list);
        if (!m) { return; }
        if (m.img) { im = el('img'); im.src = m.img; im.alt = ''; view.appendChild(im); }
        m.regions.forEach(function (r) {
          var open = m.open.indexOf(r.id) >= 0, g = el('i', 'mp-r' + (open ? ' open' : '')), b = btn('mp-b' + (open ? ' on' : ''), '', function () { toggle(r.id, !open); });
          g.style.left = r.x + '%'; g.style.top = r.y + '%'; g.style.width = r.w + '%'; g.style.height = r.h + '%'; view.appendChild(g);
          b.appendChild(el('b', '', r.name || r.id)); b.appendChild(el('small', '', open ? 'Uncovered' : 'Under fog'));
          b.setAttribute('aria-pressed', open ? 'true' : 'false'); b.setAttribute('data-k', 'mp:' + r.id); list.appendChild(b);
        });
        up.textContent = on ? 'Take the map down' : 'Put this map up'; up.className = 'btn slim ' + (on ? 'ghost' : 'wax');
        note.textContent = on ? 'Tap a place to uncover it or cover it again. Every tap shows on the phones and the big screen at once.' : 'This map is not up. Set it as you want it, then put it up.';
        if (focus) { back(list, { k: focus }); }
      };
      /* the DM's own say on a region is kept only where it differs from what the story has uncovered by itself */
      var toggle = function (rid, open) {
        var h = DM.stage.hand[id] = DM.stage.hand[id] || {};
        delete h[rid];
        if ((run.mapOpen(ST, DM, id, h).indexOf(rid) >= 0) !== open) { h[rid] = open; }
        save();
        if (DM.stage.map === id) { stage({ map: run.stageMap(ST, DM, id, h) }); }
        draw('mp:' + rid);
      };
      up.addEventListener('click', function () {
        if (DM.stage.map === id) { DM.stage.map = ''; save(); stage({ map: null }); }
        else { DM.stage.map = id; save(); stage({ map: run.stageMap(ST, DM, id, DM.stage.hand[id]) }); }
        draw();
      });
      if ((ST.maps || []).length > 1) {
        ST.maps.forEach(function (m) { var op = el('option', '', m.title || m.id); op.value = m.id; pick.appendChild(op); });
        pick.value = id; pick.addEventListener('change', function () { id = pick.value; draw(); });
        lbl = el('label', 'cf-l'); lbl.appendChild(el('span', '', 'Which map')); lbl.appendChild(pick); body.appendChild(lbl);
      }
      body.appendChild(note); body.appendChild(view); body.appendChild(list);
      row.appendChild(up); row.appendChild(btn('btn ghost slim', 'Done', dialogShut)); body.appendChild(row);
      draw();
      return list.querySelector('button') || up;
    });
  }

  /* a picture held face down on every screen, then turned over for everyone at once */
  function pictureRow(box, o) {
    stageRow(box, 'Picture', function () { return stageView().reveal; }, function (c) {
      var r = stageView().reveal, pics = run.pictures(ST, DM), own = o.reveal ? pics.filter(function (p) { return p.img === o.reveal.img; })[0] : null, b;
      if (r) {
        c.appendChild(el('p', 'stg-s', r.shown ? 'Turned over for everyone: “' + r.title + '”.' : 'Held face down on every phone and the big screen: “' + r.title + '”.'));
        if (!r.shown) { b = btn('btn wax slim', 'Flip it', pictureFlip); b.setAttribute('data-k', 'pic-flip'); c.appendChild(b); }
        b = btn('btn ghost slim', 'Put it away', function () { stage({ reveal: null }); }); b.setAttribute('data-k', 'pic-away'); c.appendChild(b);
        return;
      }
      if (own) { b = btn('btn wax slim', 'Hold a picture: “' + own.title + '”', function () { pictureHold(own); }); b.setAttribute('data-k', 'pic-flip'); c.appendChild(b); }
      if (pics.length > (own ? 1 : 0)) { b = btn('btn ghost slim', own ? 'Hold another picture…' : 'Hold a picture…', picturePick); b.setAttribute('data-k', 'pic-away'); c.appendChild(b); }
    });
  }
  function pictureHold(p) { stage({ reveal: run.held(p) }); toast('Held face down on every screen. Tap “Flip it” when the moment comes.'); }
  /* turned over under its real name, which a picture chosen by hand was not showing while it waited */
  function pictureFlip() {
    var r = stageView().reveal, p;
    if (!r) { return; }
    p = run.pictures(ST, DM).filter(function (x) { return x.img === r.img; })[0];
    stage({ reveal: run.flipped(p || r) });
  }
  function picturePick() {
    dialogOpen('Hold a picture', function (body) {
      var grid = el('div', 'hero-grid'), first = null;
      body.appendChild(el('p', 'cover-p', 'It goes to every phone and the big screen face down. Nobody sees it until you flip it.'));
      run.pictures(ST, DM).forEach(function (p) {
        var b = btn('hero-opt', '', function () { dialogShut(); pictureHold(p); }), t = el('span'), im = el('img');
        im.src = p.img; im.alt = ''; b.appendChild(im); t.appendChild(el('b', '', p.title)); b.appendChild(t); grid.appendChild(b);
        first = first || b;
      });
      body.appendChild(grid);
      body.appendChild(btn('btn ghost slim', 'Not now', dialogShut));
      return first;
    });
  }

  /* the scene's beats: one tap, and every phone and the big screen feel it */
  function beatsRow(box, o) {
    stageRow(box, 'A moment', null, function (c) {
      o.beats.forEach(function (b) {
        var x = btn('chipd', b.label, function () {
          x.disabled = true; setTimeout(function () { x.disabled = false; }, 1500);          // one tap is one moment
          if (navigator.onLine === false) { toast('This device is offline, so that did not reach the table. Try again when it is back.'); return; }
          stage({ beat: run.beat(b) });
          if (hearHere() && FR.tv && FR.tv.beat) { FR.tv.beat(b.kind); }
          say('Sent to the table: ' + b.label);
        });
        c.appendChild(x);
      });
      c.appendChild(el('small', 'stg-n', 'One tap, and every phone and the big screen feel it together.'));
    });
  }

  /* the soundscape: the place's own unless the DM picks another, how loud, and two settings */
  function soundRow(box, o) {
    stageRow(box, 'Sound', function () { return [stageView().sound, DM.stage.level, DM.stage.auto, hearHere(), o.sound]; }, function (c) {
      var s = stageView().sound, S = DM.stage, beds = (FR.theme && FR.theme.beds) || {}, sel = el('select', 'field'), off = el('option', '', 'Off: no soundscape'), seg = el('div', 'seg3'), opts = el('div', 'stg-o');
      off.value = ''; sel.appendChild(off); sel.setAttribute('aria-label', 'Soundscape'); sel.setAttribute('data-k', 'snd-bed');
      Object.keys(beds).forEach(function (id) { var op = el('option', '', beds[id].label + (id === o.sound ? ' (this scene’s)' : '')); op.value = id; sel.appendChild(op); });
      sel.value = s && s.bed && beds[s.bed] ? s.bed : '';
      sel.addEventListener('change', function () { stage({ sound: sel.value ? { bed: sel.value, level: S.level } : null }); });
      c.appendChild(sel);
      seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'How loud');
      [['Soft', 0.4], ['Medium', 0.7], ['Full', 1]].forEach(function (l) {
        var on = Math.abs(S.level - l[1]) < 0.16, b = btn(on ? 'on' : '', l[0], function () {
          var now = stageView().sound;
          S.level = l[1]; save();
          if (now) { stage({ sound: { bed: now.bed, level: l[1] } }); } else { refresh(); }
        });
        b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('data-k', 'snd-' + l[0]); seg.appendChild(b);
      });
      c.appendChild(seg);
      opts.appendChild(flip('Change it with the story', S.auto, 'snd-auto', function () { S.auto = !S.auto; save(); refresh(); }));
      opts.appendChild(flip('Play it on this device too', hearHere(), 'snd-here', function () { S.here = !hearHere(); save(); refresh(); }));
      c.appendChild(opts);
    });
  }

  /* a vote: the scene's own question ready to send, or one the DM writes; the count as it comes in; and closing it */
  function voteRow(box, o) {
    stageRow(box, 'Vote', function () { return TB.votes ? TB.votes() : []; }, function (c) {
      var v = (TB.votes ? TB.votes() : [])[0], total = 0, top = 0, list, b;
      if (!v) {
        b = btn('btn slim ' + (o.vote ? 'wax' : 'ghost'), o.vote ? 'Put it to a vote: “' + o.vote.q + '”' : 'Put something to a vote…', function () { voteForm(o.vote); });
        b.setAttribute('data-k', 'vote-go'); c.appendChild(b);
        return;
      }
      (v.counts || []).forEach(function (n) { total += n; top = Math.max(top, n); });
      c.appendChild(el('p', 'stg-s', (v.open ? 'On every phone now: ' : 'Closed: ') + '“' + v.q + '”'));
      list = el('div', 'vt');
      v.options.forEach(function (text, i) {
        var n = (v.counts || [])[i] || 0, r = el('div', 'vt-r' + (!v.open && top > 0 && n === top ? ' win' : '')), bar = el('i');
        bar.style.width = (total ? Math.round(100 * n / total) : 0) + '%';
        r.appendChild(bar); r.appendChild(el('span', '', text)); r.appendChild(el('b', '', String(n))); list.appendChild(r);
      });
      c.appendChild(list);
      if (v.open) {
        b = btn('btn wax slim', 'Close the vote', function () { b.disabled = true; TB.closeVote(v.n).catch(function (e) { b.disabled = false; oops(e); }); });
        b.setAttribute('data-k', 'vote-go'); c.appendChild(b);
        c.appendChild(el('small', 'stg-n', total + (total === 1 ? ' vote' : ' votes') + ' so far. Your players see the count once you close it.'));
      } else {
        b = btn('btn ghost slim', 'Ask something else…', function () { voteForm(o.vote && o.vote.q !== v.q ? o.vote : null); });
        b.setAttribute('data-k', 'vote-go'); c.appendChild(b);
      }
    });
  }
  function voteForm(pre) {
    dialogOpen('Put it to a vote', function (body) {
      var form = el('form', 'rf-form'), q = el('input', 'field'), opts = [], set = el('div', 'cf-l'), go = btn('btn wax slim', 'Put it to the table', null), err = el('p', 'err-line'), lbl = el('label', 'cf-l'), i, inp;
      form.setAttribute('novalidate', ''); go.type = 'submit'; err.hidden = true; err.setAttribute('role', 'alert');
      q.type = 'text'; q.maxLength = SCAP.q; q.value = pre ? pre.q : ''; q.placeholder = 'What should the party decide?'; q.autocomplete = 'off';
      lbl.appendChild(el('span', '', 'The question')); lbl.appendChild(q); form.appendChild(lbl);
      set.appendChild(el('span', '', 'Two to four choices'));
      for (i = 0; i < SCAP.options; i++) {
        inp = el('input', 'field'); inp.type = 'text'; inp.maxLength = SCAP.option; inp.autocomplete = 'off'; inp.value = (pre && pre.options[i]) || '';
        inp.placeholder = i < 2 ? 'A choice' : 'Another choice (optional)'; inp.setAttribute('aria-label', 'Choice ' + (i + 1));
        opts.push(inp); set.appendChild(inp);
      }
      form.appendChild(set); form.appendChild(err); form.appendChild(go); form.appendChild(btn('btn ghost slim', 'Not now', dialogShut));
      form.addEventListener('submit', function (ev) {
        var list = opts.map(function (x) { return x.value.trim(); }).filter(Boolean);
        ev.preventDefault(); err.hidden = true;
        if (!q.value.trim()) { q.focus(); return; }
        if (list.length < 2) { err.textContent = 'A vote needs at least two choices.'; err.hidden = false; opts[list.length ? 1 : 0].focus(); return; }
        go.disabled = true;
        TB.vote({ q: q.value.trim(), options: list }).then(function () { dialogShut(); toast('The vote is on every phone. Close it when everyone has picked.'); })
          .catch(function (e) { go.disabled = false; err.textContent = (e && e.message) || 'That did not go through. Try again.'; err.hidden = false; });
      });
      body.appendChild(el('p', 'cover-p', 'Every player gets the question on their phone and picks with one tap. You and the big screen see the count as it comes in.'));
      body.appendChild(form);
      return q;
    });
  }

  /* a fight: the scene's foes join the turn order, and the turn order comes into view */
  function showTurns() {
    if (wide()) { if (ui.side !== 'rolls') { ui.side = 'rolls'; A.store.set(SIDE, 'rolls'); } renderSide(); }
    else { ui.tab = 'rolls'; render(); $('dm-body').scrollTop = 0; }
  }
  function foesRow(box, o) {
    stageRow(box, 'A fight', function () { return DM.turns.rows.map(function (r) { return [r.key, r.foe, r.name]; }); }, function (c) {
      var inIt = foesIn(o.foes), b;
      c.appendChild(el('p', 'stg-s', 'Here: ' + listWords(o.foes.map(function (f) { return f.name; })) + '.'));
      b = btn('btn slim ' + (inIt ? 'ghost' : 'wax'), inIt ? 'See the turn order' : (o.foes.length > 1 ? 'Add them to the turn order' : 'Add it to the turn order'), function () {
        if (!inIt) { turnFoes(o.foes); toast('Added to the turn order, to take a turn after everyone who rolls initiative.'); }
        showTurns();
      });
      b.setAttribute('data-k', 'foes-add'); c.appendChild(b);
      c.appendChild(el('small', 'stg-n', 'In the turn order each one shows how it is doing in a word, with what it might do on its turn one tap away.'));
    });
  }
  /* the difficulty dial: the scene's two lines, each behind a small button, for the DM alone */
  function dialRow(box, o) {
    stageRow(box, 'How hard', null, function (c) {
      var out = el('p', 'perk'), bs = {};
      var draw = function () {
        ['easier', 'harder'].forEach(function (k) { if (bs[k]) { bs[k].classList.toggle('on', ui.dial === k); bs[k].setAttribute('aria-expanded', ui.dial === k ? 'true' : 'false'); } });
        clear(out); out.hidden = !(ui.dial && o[ui.dial]);
        if (!out.hidden) { out.appendChild(el('b', '', ui.dial === 'easier' ? 'To make it easier ' : 'To make it harder ')); out.appendChild(document.createTextNode(o[ui.dial])); }
      };
      [['easier', 'Make it easier'], ['harder', 'Make it harder']].forEach(function (x) {
        if (!o[x[0]]) { return; }
        bs[x[0]] = btn('mini', x[1], function () { ui.dial = ui.dial === x[0] ? '' : x[0]; draw(); });
        c.appendChild(bs[x[0]]);
      });
      out.setAttribute('role', 'status'); c.appendChild(out);
      draw();
    });
  }

  /* ---------- hero tokens: given and taken back from a player's row and their glance ---------- */
  function tokenTools(p) {
    var w = tokenWord(), n = Math.max(0, Math.min(5, p.tokens || 0)), box = el('div', 'tb-tok'), stars = el('span', 'tb-stars', new Array(n + 1).join('★') + new Array(6 - n).join('☆'));
    var go = function (give, b) {
      b.disabled = true;
      TB.award(p.id, give).then(function (j) { var t = j && typeof j.tokens === 'number' ? j.tokens : 0; toast(p.name + ' now has ' + (t === 1 ? 'one ' + w.name : (t ? t + ' ' + w.plural : 'no ' + w.plural)) + '.'); })
        .catch(function (e) { b.disabled = false; oops(e); });
    };
    var give = btn('mini', 'Give a ' + w.name, function () { go(1, give); }), take = btn('mini', 'Take one back', function () { go(-1, take); });
    stars.setAttribute('role', 'img'); stars.setAttribute('aria-label', n + ' ' + (n === 1 ? w.name : w.plural));
    give.setAttribute('data-id', 'g:' + p.id); give.setAttribute('aria-label', 'Give ' + p.name + ' a ' + w.name); give.disabled = n >= 5;
    take.setAttribute('data-id', 't:' + p.id); take.setAttribute('aria-label', 'Take a ' + w.name + ' back from ' + p.name); take.hidden = !n;
    box.appendChild(stars); box.appendChild(give); box.appendChild(take);
    return box;
  }

  /* ---------- the spotlight: who has had a moment lately, and a nudge towards whoever has not ---------- */
  var ticking = false;            // true while the clock's own redraw runs
  /* each player and how long they have been quiet, quietest first; someone new counts from when this screen first saw them */
  function quietRows() {
    var now, ps, changed = false;
    if (!atTable()) { return []; }
    liveLoad(); now = serverNow(); ps = TB.players();
    ps.forEach(function (p) { if (!live.seen[p.id]) { live.seen[p.id] = now; changed = true; } });
    Object.keys(live.seen).forEach(function (id) { if (!seat(id)) { delete live.seen[id]; delete live.spot[id]; changed = true; } });
    if (changed) { liveKeep(); }
    return run.quiet(ps, { rolls: rollsNow(), asks: asksNow(), requests: reqsNow() }, live, now);
  }
  function quietWords(q) { return !q ? '' : (q.acted ? (q.ms < 90000 ? 'Had a moment just now' : 'Quiet for ' + run.span(q.ms)) : (q.ms < 90000 ? 'Has not rolled or asked yet' : 'Nothing yet, after ' + run.span(q.ms))); }
  function spotBox(box) {
    var sec = el('section', 'sp'), last = null;
    box.appendChild(sec);
    watch(sec, function () {
      var rows = quietRows(), v = stageView(), who = v.spot ? seat(v.spot) : null, q = rows[0], due = !!q && rows.length > 1 && q.ms >= 120000, sig, h, b;
      sig = JSON.stringify([!!atTable(), who && [who.id, who.name], due ? [q.id, q.name, Math.floor(q.ms / 60000), q.acted] : rows.length]);
      if (sig === last) { return; }
      last = sig; h = held(sec); clear(sec);
      sec.hidden = !atTable() || (rows.length < 2 && !who);
      if (sec.hidden) { return; }
      sec.appendChild(el('div', 'dm-h', 'Spotlight'));
      if (who) {
        sec.appendChild(el('p', 'stg-s', 'It is ' + who.name + '’s moment. Every phone and the big screen say so.'));
        b = btn('btn ghost slim', 'Their moment is over', function () { stage({ spot: '' }); }); b.setAttribute('data-k', 'spot'); sec.appendChild(b);
      } else if (due) {
        sec.appendChild(el('p', 'stg-s', q.name + ' has been quiet longest: ' + run.span(q.ms) + (q.acted ? '.' : ', with no roll or ask yet.')));
        b = btn('btn wax slim', 'Give ' + firstName(q) + ' the next moment', function () { giveSpot(q.id); }); b.setAttribute('data-k', 'spot'); sec.appendChild(b);
      } else { sec.appendChild(el('p', 'tb-tip', 'Everyone has had a moment in the last couple of minutes.')); }
      back(sec, h);
    });
  }
  function giveSpot(id) {
    var p = seat(id);
    if (!p) { return; }
    liveLoad(); live.spot[id] = serverNow(); liveKeep();
    stage({ spot: id });
    toast('The next moment is ' + p.name + '’s. Their name is on every screen.');
  }

  /* ---------- the pacing clock: time spent against the adventure's plan, and what can be cut ---------- */
  function partTitle(id) { var p = chapter(id) || byId(ST.flow.interludes, id) || byId(hubs(), id); return p ? p.title : id; }
  function paceBox(box) {
    var sec = el('section', 'pc'), last = null;
    box.appendChild(sec);
    watch(sec, function () {
      var p = paceNow(), kind = ST ? run.place(ST, DM).kind : 'cover', sig, h, top;
      sec.hidden = !p;
      if (!p) { return; }
      sig = JSON.stringify([kind, Math.floor(p.spent), p.state, p.by, Math.round(p.lo), Math.round(p.hi), Math.round(p.left), p.cuts.map(function (c) { return c.button; }), p.later.length]);
      if (sig === last) { return; }
      last = sig; h = held(sec); clear(sec);
      sec.appendChild(el('div', 'dm-h', 'Pacing'));
      if (kind === 'cover') { sec.appendChild(el('p', 'tb-tip', 'Time starts counting when you begin the story, which is planned to take about ' + mins(p.total) + '.')); return; }
      if (kind === 'end') { sec.appendChild(el('p', 'stg-s', 'The story took ' + mins(p.spent) + ' of play. It was planned to take about ' + mins(p.total) + '.')); return; }
      top = el('p', 'pc-top'); top.appendChild(el('b', '', p.spent < 1 ? 'Just begun' : mins(p.spent) + ' in'));
      top.appendChild(el('span', 'pc-chip ' + p.state, p.state === 'on' ? 'On time' : 'About ' + mins(p.by) + (p.state === 'ahead' ? ' ahead' : ' behind')));
      sec.appendChild(top);
      sec.appendChild(el('p', 'tb-tip', 'The plan has the story here ' + (p.lo < 1 ? 'in the first ' + mins(p.hi) : (Math.round(p.lo) === Math.round(p.hi) ? 'at about ' + mins(p.hi) : 'between ' + mins(p.lo) + ' and ' + mins(p.hi))) + (p.left >= 1 ? ', with about ' + mins(p.left) + ' still to come.' : '.')));
      if (p.state === 'behind') {
        if (p.cuts.length) {
          sec.appendChild(el('p', 'stg-s', 'To catch up, the story can skip ahead from here:'));
          p.cuts.forEach(function (sc, i) {
            var b = btn('btn ghost slim', sc.button, function () {
              ask({ title: 'Skip ahead?', text: 'The story moves straight on to “' + partTitle(sc.to) + '”. Whatever is skipped is not played tonight.', yes: 'Skip ahead', no: 'Stay here' }, function () { jump(sc); });
            });
            b.setAttribute('data-k', 'cut' + i); sec.appendChild(b);
          });
        } else if (p.later.length) {
          sec.appendChild(el('p', 'stg-s', 'A shortcut is coming: “' + p.later[0].button + '”. It is offered at ' + listWords(p.later[0].at.slice(0, 3).map(partTitle).map(function (t) { return '“' + t + '”'; })) + '.'));
        } else { sec.appendChild(el('p', 'tb-tip', 'Nothing is left to skip. Shorter scenes will do it: tap an outcome as soon as the table has had its fun.')); }
      }
      back(sec, h);
    });
  }

  /* ---------- "Put this on a TV": the big screen's link, a square to scan, and the two ways to stop it ---------- */
  var keyBusy = false;
  function copyText(text, inp) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Link copied.'); })
      .catch(function () { if (inp) { inp.focus(); inp.select(); } toast('Select the link and copy it.'); });
  }
  function tvKey(again) {
    var code = TB.code();
    if (keyBusy) { return; }
    keyBusy = true; ui.keyFail = '';
    TB.screenKey(again).then(function (key) {
      if (!atTable() || TB.code() !== code) { return; }
      ui.key = key; ui.keyFor = code;
      if (again) { toast('A new link. The old one has stopped working.'); }
    }, function (e) { ui.keyFail = code; if (A.screen() === 'dm') { oops(e); } }).then(function () { keyBusy = false; if (A.screen() === 'dm') { refresh(); } });
  }
  function tvBox(box) {
    var sec = el('section', 'tvb'), last = null;
    box.appendChild(sec);
    watch(sec, function () {
      var on = !!(TB.hasScreen && TB.hasScreen()), code = TB.code(), key = ui.keyFor === code ? ui.key : '', failed = ui.keyFail === code;
      var sig = JSON.stringify([on, key, code, failed, typeof window.qrcode]), h, top, how, slot, row, inp, link, tools, b, a;
      if (sig === last) { return; }
      last = sig; h = held(sec); clear(sec);
      sec.appendChild(el('div', 'dm-h', 'Put this on a TV'));
      if (!on || (!key && failed)) {
        sec.appendChild(el('p', 'tb-tip', on ? 'The link could not be fetched just now.' : 'A TV, or a laptop plugged into one, can show the whole room the scene, the map, every roll and whose turn it is. It has no controls and never shows anything private.'));
        b = btn('btn ghost slim', on ? 'Try again' : 'Make a link for the big screen', function () { b.disabled = true; tvKey(false); });
        b.setAttribute('data-k', 'tv-make'); sec.appendChild(b);
        back(sec, h); return;
      }
      if (!key) { sec.appendChild(el('p', 'tb-tip', 'Fetching the link…')); tvKey(false); return; }
      link = TB.screenLink(key);
      top = el('div', 'tb-top'); how = el('p', 'tb-how'); slot = el('div', 'tb-qr-slot'); top.appendChild(how); top.appendChild(slot); sec.appendChild(top);
      qrInto(slot, link, function (q) { how.textContent = 'Open this link in a browser on the TV' + (q ? ', or scan the square with whatever is plugged into it' : '') + '. Then tap that screen once, to turn its sound on. It shows the scene, the map, the rolls and whose turn it is, and nothing private.'; });
      row = el('div', 'tb-link'); inp = el('input', 'field'); inp.type = 'text'; inp.readOnly = true; inp.value = link; inp.setAttribute('aria-label', 'Link for the big screen'); inp.setAttribute('data-k', 'tv-link');
      inp.addEventListener('focus', function () { inp.select(); });
      row.appendChild(inp);
      b = btn('btn ghost slim', 'Copy', function () { copyText(link, inp); }); b.setAttribute('data-k', 'tv-copy'); row.appendChild(b);
      sec.appendChild(row);
      tools = el('div', 'tvb-b');
      a = el('a', 'btn ghost slim', 'Open it in a new window'); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-k', 'tv-open'); tools.appendChild(a);
      b = btn('btn ghost slim', 'Make a new link', function () {
        ask({ title: 'Make a new link for the big screen?', text: 'The link you have now stops working at once, and a TV showing it says so. Do this if the link has gone somewhere it should not.', yes: 'Make a new link', no: 'Keep this link' }, function () { tvKey(true); });
      });
      b.setAttribute('data-k', 'tv-new'); tools.appendChild(b);
      b = btn('btn ghost slim', 'Turn the screen off', function () {
        ask({ title: 'Turn the big screen off?', text: 'Any TV showing this table stops at once and says the screen has been turned off. You can make a new link whenever you like.', yes: 'Turn it off', no: 'Leave it on' }, function () {
          TB.screenOff().then(function () { ui.key = ''; ui.keyFor = ''; toast('The big screen is off.'); }).catch(oops);
        });
      });
      b.setAttribute('data-k', 'tv-off'); tools.appendChild(b);
      sec.appendChild(tools);
      back(sec, h);
    });
  }

  /* ---------- the chapter map: the adventure's flow, drawn ----------
     FR.run.graph says what leads where and how the session colours it; this lays it out top to
     bottom at whatever width the pane has. A way to the layer just below is a curve between the two
     boxes. Any other way (further down, or back up) leaves through the gap under its box, runs
     down or up the side of the map, and comes in through the gap above where it is going, so no line
     ever hides behind a box. */
  function graphBox(body) {
    var g = run.graph(ST, DM), wrap = el('section', 'gm-wrap'), box = el('div', 'gm'), NS = 'http://www.w3.org/2000/svg', svgEl = document.createElementNS(NS, 'svg'), at = {}, maxOf = 1, lanes = { l: 0, r: 0 }, ins = {}, outs = {};
    var W, G = 30, NH = 66, GAP = 46, TOP = 26, NW, H, legend = el('ul', 'gm-key'), hereNode = null;
    wrap.appendChild(el('div', 'dm-h', 'The story as a map')); wrap.appendChild(box); body.appendChild(wrap);
    W = Math.max(280, box.clientWidth || 340);
    g.nodes.forEach(function (n) { at[n.id] = n; maxOf = Math.max(maxOf, n.of); if (n.state === 'here') { hereNode = n; } });
    NW = Math.min(210, Math.floor((W - 2 * G - (maxOf - 1) * 10) / maxOf));
    H = TOP + g.layers * (NH + GAP) - GAP + 10;
    var cx = function (n) { return G + (W - 2 * G) * (n.slot + 0.5) / n.of; }, top = function (n) { return TOP + n.layer * (NH + GAP); };
    var mk = function (tag, attrs) { var x = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { x.setAttribute(k, attrs[k]); }); return x; };
    var defs = mk('defs', {});
    ['taken', 'open', 'closed'].forEach(function (s) {
      var m = mk('marker', { id: 'gm-a-' + s, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      m.appendChild(mk('path', { d: 'M0 0L10 5L0 10z', 'class': 'gm-arrow ' + s })); defs.appendChild(m);
    });
    svgEl.appendChild(defs);
    svgEl.setAttribute('width', String(W)); svgEl.setAttribute('height', String(H)); svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svgEl.setAttribute('aria-hidden', 'true');
    box.style.height = H + 'px';
    /* the ways drawn in order of how much they matter, so the way the party came lies on top */
    g.edges.slice().sort(function (a, b) { var rank = { closed: 0, open: 1, taken: 2 }; return rank[a.state] - rank[b.state]; }).forEach(function (e) {
      var a = at[e.from], b = at[e.to], near = b.layer === a.layer + 1 && !e.back, x1, y1, x2, y2, lane, ya, yb, r = 7, side, d, k;
      if (near) {
        x1 = cx(a); y1 = top(a) + NH; x2 = cx(b); y2 = top(b) - 2;
        d = 'M' + x1 + ' ' + y1 + 'C' + x1 + ' ' + (y1 + GAP * 0.55) + ' ' + x2 + ' ' + (y2 - GAP * 0.55) + ' ' + x2 + ' ' + y2;
      } else {
        side = e.back || b.layer <= a.layer ? 'l' : 'r'; k = lanes[side]++ % 3;
        outs[a.id] = (outs[a.id] || 0) + 1; ins[b.id] = (ins[b.id] || 0) + 1;
        x1 = cx(a) + (side === 'r' ? 1 : -1) * Math.min(NW / 2 - 12, 10 + outs[a.id] * 9); y1 = top(a) + NH;
        x2 = cx(b) + (side === 'r' ? 1 : -1) * Math.min(NW / 2 - 12, 10 + ins[b.id] * 9); y2 = top(b) - 2;
        lane = side === 'r' ? W - G + 9 + k * 7 : G - 9 - k * 7;
        ya = y1 + 12 + k * 5; yb = y2 - 14 - k * 5;
        d = 'M' + x1 + ' ' + y1 + 'V' + (ya - r) + 'Q' + x1 + ' ' + ya + ' ' + (x1 + (lane > x1 ? r : -r)) + ' ' + ya + 'H' + (lane + (lane > x1 ? -r : r)) + 'Q' + lane + ' ' + ya + ' ' + lane + ' ' + (ya + (yb > ya ? r : -r)) +
          'V' + (yb + (yb > ya ? -r : r)) + 'Q' + lane + ' ' + yb + ' ' + (lane + (x2 > lane ? r : -r)) + ' ' + yb + 'H' + (x2 + (x2 > lane ? -r : r)) + 'Q' + x2 + ' ' + yb + ' ' + x2 + ' ' + (yb + r) + 'V' + y2;
      }
      svgEl.appendChild(mk('path', { d: d, 'class': 'gm-e ' + e.state + (e.shortcut && e.state !== 'taken' ? ' short' : ''), 'marker-end': 'url(#gm-a-' + e.state + ')' }));
    });
    box.appendChild(svgEl);
    g.nodes.forEach(function (n) {
      var ix = -1, can, node, sub, part = n.kind === 'chapter' ? chapter(n.id) : null;
      DM.feed.forEach(function (e, i) { if ((e.k === 'chapter' && e.ch === n.id) || (e.k === 'bridge' && (interlude(e.i) || {}).id === n.id) || (e.k === 'hub' && (hubOf(e) || {}).id === n.id)) { ix = i; } });
      can = ix >= 0 && (n.state === 'seen' || n.state === 'here');
      node = can ? btn('gm-n', '', function () { ui.tab = 'run'; render(); scrollToEntry(ix); }) : el('div', 'gm-n');
      node.className = 'gm-n ' + n.kind + ' ' + n.state;
      sub = n.state === 'here' ? 'You are here' : (n.state === 'seen' ? 'Done' : (n.state === 'closed' ? (n.kind === 'end' ? 'Not this way' : 'Not tonight') :
        (n.kind === 'hub' ? 'A choice' : (n.kind === 'interlude' ? 'An interlude' : (n.kind === 'end' ? 'An ending' : (part && part.minutes ? 'About ' + mins(part.minutes) : (n.start ? 'The start' : '')))))));
      node.appendChild(el('b', '', n.title)); if (sub) { node.appendChild(el('small', '', sub)); }
      node.style.left = Math.round(cx(n) - NW / 2) + 'px'; node.style.top = top(n) + 'px'; node.style.width = NW + 'px'; node.style.height = NH + 'px';
      if (can) { node.setAttribute('aria-label', n.title + ', ' + sub.toLowerCase() + '. Go to it in the story.'); }
      box.appendChild(node);
    });
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'The story as a map, from the start at the top to the endings at the bottom.' + (hereNode ? ' The party is at ' + hereNode.title + '.' : ''));
    [['taken', 'The way the party came'], ['open', 'Still open'], ['closed', 'Closed, as things stand'], ['open short', 'A shortcut']].forEach(function (k) {
      var li = el('li'), s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 34 10'); s.setAttribute('aria-hidden', 'true');
      s.appendChild(mk('path', { d: 'M1 5H33', 'class': 'gm-e ' + k[0] })); li.appendChild(s); li.appendChild(el('span', '', k[1])); legend.appendChild(li);
    });
    wrap.appendChild(legend);
  }
  /* the window changed size: the map is drawn for the width it had, so draw it again */
  var gmT = 0;
  window.addEventListener('resize', function () { clearTimeout(gmT); gmT = setTimeout(function () { if (A.screen() === 'dm' && ST && ui.tab === 'chapters' && modals.length === 0) { render(); } }, 250); });

  /* make a photo small enough to send */
  function shrink(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        try { res(c.toDataURL('image/jpeg', 0.84)); } catch (e) { rej(e); }
      };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('unreadable')); };
      im.src = u;
    });
  }
  function reopen() { doorSay(''); doorSetup(); A.go('dmgate'); }           // no table: the door asks whether to start one or join one
  $('dm-table').addEventListener('click', function () {
    if (!atTable()) { reopen(); } else if (wide()) { sideTab('table'); } else { openTable(); }
  });

  /* ---------- beside the story, on a wide screen: the table, the rolls, the dictionary ---------- */
  var SIDE = 'firstroll.dm.side';             // which of them was showing, so the next visit opens on it
  function sideTab(id) {
    ui.side = id; A.store.set(SIDE, id); renderSide();
    var on = $('dm-sidetabs').querySelector('.on'); if (on) { on.focus(); }
  }
  /* the dictionary in a pane of its own: the list, or one entry with a way back to the list */
  function dictPanel(box) {
    var open = ui.entry, x = open ? byId(bib(open.kind), open.id) : null;
    clear(box); box.scrollTop = 0;
    if (!x) { ui.entry = null; renderLookup(box); return; }
    box.appendChild(btn('btn ghost slim back', 'Back to the dictionary', function () {
      ui.entry = null; dictPanel(box);
      var row = Array.prototype.filter.call(box.querySelectorAll('.lk'), function (b) { return b.getAttribute('data-id') === open.kind + ':' + open.id; })[0]; if (row) { row.focus(); }
    }));
    entryInto(box, open.kind, open.id);
  }
  function noTable(box) {
    box.appendChild(el('h3', 'sh-t', 'Your table'));
    if (TB && TB.can()) {
      box.appendChild(el('p', 'cover-p', 'No table is open. With one, your players join from their own phones, every roll they make shows up here, and you can send everyone notes and pictures.'));
      box.appendChild(btn('btn wax slim', 'Open a table', reopen));
    } else { box.appendChild(el('p', 'cover-p', 'Tables are switched off on this site, so everyone rolls for themselves. You can still list who is playing and keep a turn order.')); }
    box.appendChild(el('div', 'dm-h', 'Who is playing'));
    box.appendChild(el('p', 'tb-tip', wordFor('partyHelp', 'Optional. List who is playing and which character each one has, so the helper can call them by name.')));
    handParty(box);
  }
  function renderSide() {
    var side = $('dm-side'), third = $('dm-third'), tabs = $('dm-sidetabs'), box = $('dm-side-b');
    side.hidden = !wide(); third.hidden = !three();
    clear(tabs); clear(box); clear($('dm-third-b'));
    if (!wide() || !ST) { return; }
    fitTabs();
    [['table', 'Table'], ['asks', 'Asks'], ['rolls', 'Rolls'], ['dict', 'Dictionary']].forEach(function (t) {
      if (t[0] === 'dict' && three()) { return; }           // it has its own pane
      var b = btn(ui.side === t[0] ? 'on' : '', t[1], function () { if (ui.side !== t[0]) { sideTab(t[0]); } }), n;
      b.setAttribute('aria-pressed', ui.side === t[0] ? 'true' : 'false');
      if (t[0] === 'rolls' || t[0] === 'asks') { n = el('i', 'dm-count'); n.setAttribute('data-of', t[0]); b.appendChild(n); }
      tabs.appendChild(b);
    });
    box.className = 'scroll dm-side-b' + (ui.side === 'dict' ? ' dict' : ''); box.scrollTop = 0;
    if (ui.side === 'rolls') { rollsPanel(box); } else if (ui.side === 'asks') { asksPanel(box); } else if (ui.side === 'dict') { dictPanel(box); } else if (atTable()) { tablePanel(box); } else { noTable(box); }
    if (three()) { dictPanel($('dm-third-b')); }
    counts();
  }
  function renderAll() { render(); renderSide(); }

  if (TB) {
    TB.onChange(function () {
      var was = wasAt; wasAt = atTable();
      if (A.screen() !== 'dm') { if (was !== wasAt && A.screen() === 'dmgate') { doorSetup(); } return; }
      drawChip(); sessionLook(); takeTurns();
      if (was && !wasAt) {                      // the table has gone from under this screen
        modalsShut();
        if (!quiet) { toast('Your table has closed. Tap “Open a table” to start a new one.'); }
      }
      if (was !== wasAt) { renderAll(); } else { refresh(); }
      hearAsks();
    });
    /* why it went, when the server says: ended by the DM on another device, or cleared away */
    if (TB.onEnd) {
      TB.onEnd(function (info) {
        if (!info || info.role !== 'dm' || A.screen() !== 'dm') { return; }
        toast('Table ' + info.code + (info.reason === 'closed' ? ' has ended.' : ' is no longer there: it may have been cleared away.') + ' Tap “Open a table” to start a new one.');
      });
    }
  }
  /* "2 min ago" has to keep up with the clock, and so do the pacing clock and how long each player has been quiet */
  setInterval(function () {
    if (A.screen() !== 'dm') { return; }
    Array.prototype.forEach.call(document.querySelectorAll('#s-dm time[data-at]'), function (t) { t.textContent = ago(Number(t.getAttribute('data-at'))); });
    clockTick(); ticking = true; refresh(); ticking = false; headSub();
  }, 20000);
  /* the window was resized or the tablet was turned: lay the panes out again */
  [mqWide, mqThree].forEach(function (m) {
    var again = function () { if (A.screen() === 'dm' && ST) { modalsShut(); renderAll(); } };
    if (m.addEventListener) { m.addEventListener('change', again); } else if (m.addListener) { m.addListener(again); }
  });

  /* ---------- painting: a picture of the scene, or of what just happened ---------- */
  function lastScene() { for (var i = DM.feed.length - 1; i >= 0; i--) { var e = DM.feed[i]; if (e.k === 'scene' || e.k === 'bridge') { return e; } if (e.k === 'hub') { return null; } } return null; }
  function sceneWords(e) { var s = sceneOf(e); return (s.versions ? version(s).read : (s.read || [])).join(' '); }
  function placeNow() {
    var id = '';
    for (var i = DM.feed.length - 1; i >= 0 && !id; i--) { var e = DM.feed[i]; if (e.k === 'scene') { id = chapter(e.ch).place; } else if (e.k === 'bridge') { id = interlude(e.i).place; } }
    return byId(bib('places'), id) || bib('places')[0] || { name: where().title, blurb: '' };
  }
  function paintBrief(what, moment) {
    var w = where(), s = w.scene, pl = placeNow(), ids = {}, P = ST.painter || {};
    ((s && s.cast) || []).forEach(function (id) { ids[id] = 1; });
    bib('people').forEach(function (p) { if (moment.indexOf(p.name) >= 0 || (p.full && moment.indexOf(p.full) >= 0)) { ids[p.id] = 1; } });
    var folk = Object.keys(ids).map(person).filter(Boolean);
    var props = ((s && s.things) || []).map(function (id) { return byId(bib('things'), id); }).filter(Boolean);
    var heroes = partyList().filter(function (p) { return p.name || p.race || p.cls; }).slice(0, 5).map(function (p) { return '- ' + (p.name || wordFor('hero', 'A hero')) + ': ' + (p.look || fill(P.heroLook || 'a {kind}', { kind: [p.race, p.cls].filter(Boolean).join(' ') })); });
    /* the world and what must stay out of the picture are the adventure's; how to describe a picture is the same for every story */
    var system = (P.role || 'You brief the artist who illustrates a tabletop adventure.') + ' From the notes, describe ONE frozen moment as a single wide picture. Start with the place, then who is in it and exactly what each one looks like, what they are doing, then the light and the mood. ' +
      'Describe everyone by their looks from the notes, not by name alone. If heroes are listed they are in the picture: show up to four of them, each matching their look. ' + (P.tone ? P.tone + ' ' : '') + 'No writing, lettering or speech bubbles anywhere in the picture. ' +
      'Reply with one paragraph of 80 to 120 words of plain visual description and nothing else.';
    var user = 'WHERE THIS CHAPTER HAPPENS: ' + pl.name + '. ' + pl.blurb + (pl.senses ? ' ' + pl.senses : '') + '\n(If the moment below is plainly somewhere else, paint that place instead.)' +
      (folk.length ? '\n\nPEOPLE WHO MAY BE IN IT:\n' + folk.map(function (p) { return '- ' + fullName(p) + ': ' + p.look; }).join('\n') : '') +
      (props.length ? '\n\nTHINGS THAT MAY BE IN IT:\n' + props.map(function (t) { return '- ' + t.name + ': ' + t.blurb; }).join('\n') : '') +
      (heroes.length ? '\n\nTHE HEROES:\n' + heroes.join('\n') : (P.heroes ? '\n\nTHE HEROES: ' + P.heroes : '')) +
      (what === 'scene' && s && s.paint ? '\n\nIMPORTANT: ' + s.paint : '') +
      '\n\n' + (what === 'scene' ? 'THE SCENE TO PAINT, as the players were told it: ' : 'THE MOMENT TO PAINT, which has just happened: ') + moment.slice(0, 1400);
    var plain = pl.name + '. ' + pl.blurb + ' ' + moment.slice(0, 600) + (folk.length ? ' In the picture: ' + folk.map(function (p) { return p.look; }).join(' ') : '');
    return { system: system, user: user, plain: plain };
  }
  function paint(what, title, moment, cap) {
    if (!A.isLive()) { toast('Painting needs the hosted app, where your OpenAI key lives.'); return; }
    if (ui.painting) { toast('One picture at a time. The last one is still drying.'); return; }
    ui.painting = true;
    var e = { k: 'pic', id: 'p' + Date.now().toString(36), title: title, cap: cap || '', wait: true }, i = push(e), b = paintBrief(what, moment);
    render(); scrollToEntry(i);
    A.text(b.system, b.user, { max: 260 }).then(function (j) { return j.text || ''; }).catch(function () { return ''; }).then(function (d) {
      e.brief = d.length > 120 ? d : b.plain;
      return A.image(e.brief + ' ' + ((ST.painter && ST.painter.style) || ''), { size: '1536x1024', keep: atTable() });
    }).then(function (j) { if (j.url) { e.url = j.url; } else { pics[e.id] = j.image; } })
      .catch(function (x) { e.err = (x && x.message) || 'The picture could not be painted. Try again in a moment.'; })
      .then(function () { delete e.wait; ui.painting = false; save(); render(); scrollToEntry(i); });
  }
  function paintScene() { var e = lastScene(); if (!e) { toast('Start a scene first.'); return; } var s = sceneOf(e); paint('scene', s.title, s.title + '. ' + sceneWords(e), ''); }
  function drawPic(e, i) {
    var c = el('figure', 'pic'); c.id = 'fe-' + i;
    if (e.wait) { c.className = 'pic wait'; c.appendChild(el('p', '', 'Painting “' + e.title + '”. About half a minute…')); return c; }
    var src = e.url || pics[e.id];
    if (e.err || !src) { c.className = 'pic none'; c.appendChild(el('p', '', e.err || 'This picture was not kept.')); return c; }
    var im = el('img'); im.src = src; im.alt = 'Painted picture: ' + e.title;
    im.addEventListener('error', function () { c.className = 'pic none'; clear(c); c.appendChild(el('p', '', 'This picture is no longer stored.')); });
    c.appendChild(im);
    var cap = el('figcaption'); cap.appendChild(el('b', '', e.title)); if (e.cap) { cap.appendChild(el('span', '', e.cap)); } c.appendChild(cap);
    if (atTable() && e.url) { c.appendChild(showBtn({ title: e.title, text: e.cap, image: e.url })); }
    return c;
  }

  /* ---------- drawing ---------- */
  var ICON = {
    speak: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11', mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4',
    send: 'M4 12l16-8-6 16-3-7z', run: 'M5 4h11l3 3v13H5zM9 10h6M9 14h6', map: 'M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14', book: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10', party: 'M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5',
    dice: 'M12 2l9 5v10l-9 5-9-5V7zM12 2v6m0 0l6 9H6zm0 0L3 7m9 1l9-1M6 17l6 5 6-5', asks: 'M4 5h16v11h-9l-5 4v-4H4zM8.5 9h7M8.5 12.5h4.5'
  };
  function svg(d) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); return s; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) { b.addEventListener('click', fn); } return b; }
  function readBox(paras, label) {
    var box = el('div', 'read'), head = el('div', 'read-h'), text = paras.join(' ');
    head.appendChild(el('span', '', label || 'Read aloud'));
    if (canNarrate()) { var s = btn('read-say', '', function () { narrate(text); }); s.setAttribute('aria-label', 'Narrate this'); s.appendChild(svg(ICON.speak)); head.appendChild(s); }
    box.appendChild(head);
    paras.forEach(function (p) { p.split('\n').forEach(function (line) { if (line.trim()) { box.appendChild(el('p', '', line)); } }); });
    return box;
  }
  function notes(list) { var u = el('ul', 'dmnotes'); list.forEach(function (n) { u.appendChild(el('li', '', n)); }); return u; }
  function castRow(ids) {
    var r = el('div', 'cast');
    ids.forEach(function (id) {
      var p = person(id); if (!p) { return; }
      var b = btn('cast-chip', '', function () { openSheet('people', id); });
      if (p.img) { var i = el('img'); i.src = p.img; i.alt = ''; b.appendChild(i); } else { b.style.paddingLeft = '14px'; }   // no picture: just the name
      b.appendChild(el('span', '', p.name)); r.appendChild(b);
    });
    return r;
  }
  /* What the players may try. At a table, a try with a ready-made check has "Ask for this roll" beside
     it: one tap sends it to whoever "Who rolls?" says. A try whose roll is only written in words opens
     the form instead, filled in as far as those words can be read. */
  function triesBox(s, key) {
    var wrap = el('div', 'tries'), head = el('div', 'tries-h'), can = atTable() && !!TB.request;
    head.appendChild(el('div', 'dm-h', 'If they try…'));
    if (can && s.tries.some(function (t) { return run.kind(t) === 'roll'; })) {
      var who = el('label', 'who'); who.appendChild(el('span', '', 'Who rolls?')); who.appendChild(whoSelect(ui.rollTo, 'Who rolls', function (v) { ui.rollTo = v; })); head.appendChild(who);
    }
    wrap.appendChild(head);
    s.tries.forEach(function (t) {
      var kind = run.kind(t), row = el('div', 'try-w'), d = el('details', 'try'), sm = el('summary', '', t.try), b = el('div', 'try-b'), a;
      d.appendChild(sm);
      if (t.roll) { b.appendChild(line('Ask for', t.roll)); }
      if (t.yes) { b.appendChild(line(t.no ? 'If it works' : 'What happens', t.yes, true)); }
      if (t.no) { b.appendChild(line('If it does not', t.no, true)); }
      d.appendChild(b); row.appendChild(d);
      if (can && kind !== 'none') {
        a = btn('try-ask' + (kind === 'roll' ? '' : ' hand'), '', function () {
          if (kind !== 'roll') { rollForm(run.ask(t), key); return; }
          a.disabled = true;
          askFor(run.ask(t), ui.rollTo, key).then(function () {
            toast('Asked ' + whoWords(ui.rollTo) + ' to roll. ' + (wide() ? 'The results arrive beside the story.' : 'The results arrive under Asks.'));
            if (wide()) { showAsks(); }
          }).catch(oops).then(function () { a.disabled = false; });
        });
        a.appendChild(svg(ICON.dice)); a.appendChild(el('span', '', kind === 'roll' ? 'Ask for this roll' : 'Ask for a roll…'));
        a.setAttribute('aria-label', (kind === 'roll' ? 'Ask for this roll: ' : 'Ask for a roll, by hand: ') + t.try);
        row.className = 'try-w asks'; row.appendChild(a);
      }
      wrap.appendChild(row);
    });
    if (s.otherwise) { wrap.appendChild(el('p', 'try-else', s.otherwise)); }
    return wrap;
  }
  /* "They did what?": on every scene, for anything the page did not plan for */
  function whatBtn() {
    var w = el('div', 'what');
    w.appendChild(btn('btn ghost slim', 'They did what?', function () { theyDid(''); }));
    w.appendChild(el('small', '', 'For anything this page did not plan for: three ways to carry on.'));
    return w;
  }
  function line(k, v, say) { var p = el('p', say ? 'kv say' : 'kv'); p.appendChild(el('b', '', k + ' ')); p.appendChild(document.createTextNode(v)); return p; }

  function drawScene(entry, i, open) {
    var s = sceneOf(entry), box = el('section', 'scene'), v = s.versions;
    box.id = 'fe-' + i;
    if (entry.k === 'bridge') { box.appendChild(banner(s.title, s.time || clockAt(DM.feed.slice(0, i + 1)), s.img, s.length, 'An interlude')); if (atTable() && s.img) { box.appendChild(showBtn({ title: s.title, image: s.img }, 'Show the table this picture')); } }
    else { box.appendChild(el('h3', 'scene-t', s.title)); }
    var paras = (s.read || []).slice();
    if (v) {                        // a read-aloud that comes in versions: show the one in force, and let the DM change it while the scene is open
      var kind = version(s), n = v.options.length;
      paras = kind.read.slice();
      if (open && v.flag) {
        var pickEnd = el('div', 'endpick'); pickEnd.appendChild(el('div', 'dm-h', v.ask || 'Which version?'));
        var row = el('div', n === 4 ? 'seg3 four' : 'seg3');
        if (n !== 3 && n !== 4) { row.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, 1fr))'; }
        v.options.forEach(function (o) {
          var b = btn(kind.id === o.id ? 'on' : '', o.label, function () { DM.flags[v.flag] = o.id; save(); render(); }); b.setAttribute('aria-pressed', kind.id === o.id ? 'true' : 'false'); row.appendChild(b);
        });
        pickEnd.appendChild(row); box.appendChild(pickEnd);
      }
    }
    (s.extras || []).forEach(function (x) { if (holds(x.when)) { paras.push(x.read); } });
    if (s.notes && s.notes.length && s.notesFirst) { box.appendChild(notes(s.notes)); }
    if (paras.length) { box.appendChild(readBox(paras)); }
    (s.also || []).forEach(function (x) { if (holds(x.when)) { box.appendChild(readBox([x.read], 'Read aloud, because of earlier')); } });
    if (s.notes && s.notes.length && !s.notesFirst) { box.appendChild(notes(s.notes)); }
    if (s.cast && s.cast.length) { box.appendChild(castRow(s.cast)); }
    if (open) { var give = handoutsRow(); if (give) { box.appendChild(give); } }
    if (open) { var sb = stageBox(); if (sb) { box.appendChild(sb); } }
    if (open && s.tries && s.tries.length) { box.appendChild(triesBox(s, run.place(ST, DM).key)); }
    if (open) { box.appendChild(whatBtn()); }
    return box;
  }
  function banner(title, bellText, img, time, kicker) {
    var b = el('div', 'chap');
    if (img) { var im = el('img'); im.src = img; im.alt = ''; b.appendChild(im); }
    var t = el('div', 'chap-t');
    t.appendChild(el('div', 'chap-k', [kicker, bellText, time].filter(Boolean).join(' · ')));
    t.appendChild(el('h2', '', title)); b.appendChild(t); return b;
  }
  function outcomes(entry) {
    var s = sceneOf(entry), box = el('div', 'outs');
    box.appendChild(el('div', 'dm-h', s.outcomes.length > 1 ? 'What happened?' : 'When you are ready'));
    s.outcomes.forEach(function (o) { box.appendChild(btn('btn ' + (s.outcomes.length > 1 ? 'ghost' : 'wax') + ' out', o.label, function () { choose(entry, o); })); });
    return box;
  }
  function drawAI(e, i) {
    var c = el('div', 'ai'), names = { openai: 'OpenAI', claude: 'Claude', local: 'built-in suggestion' }, titles = { try: 'They try: ', say: 'A line for ', twist: 'A twist', recap: 'Previously', bridge: 'Moving on', steer: 'Back to the plot after: ' };
    c.id = 'fe-' + i;
    var h = el('div', 'ai-h');
    h.appendChild(el('b', '', (titles[e.mode] || '') + (e.mode === 'try' || e.mode === 'steer' ? e.q : (e.mode === 'say' && person(e.who) ? person(e.who).name : ''))));
    h.appendChild(el('span', '', names[e.src])); c.appendChild(h);
    if (e.wait) { c.appendChild(el('p', 'ai-wait', 'The story is thinking…')); return c; }
    if (e.a.ask) { c.appendChild(line('Ask for', e.a.ask)); }
    if (e.mode === 'try') {
      if (!e.res || e.res === 'yes') { c.appendChild(readBox([e.a.yes], 'If it works')); }
      if (!e.res || e.res === 'no') { c.appendChild(readBox([e.a.no], 'If it does not')); }
    } else if (e.a.read) { c.appendChild(readBox([e.a.read], e.mode === 'say' ? 'Say this' : 'Read aloud')); }
    if (e.a.note) { c.appendChild(line('For you', e.a.note)); }
    if (e.mode === 'try' && !e.res) {
      var r = el('div', 'ai-res');
      r.appendChild(btn('btn ghost slim', 'It worked', function () { e.res = 'yes'; save(); render(); }));
      r.appendChild(btn('btn ghost slim', 'It did not', function () { e.res = 'no'; save(); render(); }));
      c.appendChild(r);
    } else if (e.mode === 'try') {
      var dn = el('p', 'ai-done', e.res === 'yes' ? 'It worked.' : 'It did not work.');
      if (A.isLive()) { var told = e.res === 'yes' ? e.a.yes : e.a.no; dn.appendChild(paintBtn(e.q, 'The heroes tried this: ' + e.q + '. ' + told, told)); }
      c.appendChild(dn);
    }
    if (e.mode === 'twist' && e.a.read && A.isLive()) { var tw = el('p', 'ai-done'); tw.appendChild(paintBtn('A twist', e.a.read)); c.appendChild(tw); }
    return c;
  }

  function renderRun(body) {
    var cur = current();
    DM.feed.forEach(function (e, i) {
      var open = !!cur && cur.i === i, node, ch;
      if (e.k === 'cover') {
        node = el('section', 'cover'); node.id = 'fe-' + i;
        node.appendChild(banner(ST.title, ST.length, ST.cover, ST.table, ST.kicker));
        var chips = labelChips(); if (chips) { node.appendChild(chips); }
        node.appendChild(el('p', 'cover-p', ST.pitch));
        if (open) {
          if (run.brief(ST)) { node.appendChild(briefBtn('New to this story? Read the brief first: one page, about ten minutes.')); }
          node.appendChild(el('div', 'dm-h', 'How to run this'));
          node.appendChild(notes(ST.howto || []));
          var o = el('div', 'outs'); o.appendChild(btn('btn wax', 'Begin the story', begin)); node.appendChild(o);
        }
      } else if (e.k === 'chapter') {
        ch = chapter(e.ch); node = el('section', 'chap-wrap'); node.id = 'fe-' + i;
        node.appendChild(banner(ch.title, ch.time || clockAt(DM.feed.slice(0, i + 1)), ch.img, ch.length));
        if (atTable() && ch.img) { node.appendChild(showBtn({ title: ch.title, image: ch.img }, 'Show the table this picture')); }
        node.appendChild(line('Goal', ch.goal));
        (ch.perks || []).forEach(function (p) { if (holds(p.when)) { var pk = el('div', 'perk'); pk.appendChild(el('b', '', 'Because of earlier ')); pk.appendChild(document.createTextNode(p.text)); node.appendChild(pk); } });
      } else if (e.k === 'scene' || e.k === 'bridge') {
        node = drawScene(e, i, open);
      } else if (e.k === 'out') {
        node = el('p', 'outdone'); node.id = 'fe-' + i; node.appendChild(el('b', '', 'What happened ')); node.appendChild(document.createTextNode(e.label));
        if (A.isLive() && e.log) { node.appendChild(paintBtn(e.label, e.log)); }
      } else if (e.k === 'wrap') {          // what is read as the party leaves a chapter: every line whose condition holds
        var ps = (chapter(e.ch).leaving || []).filter(function (x) { return holds(x.when); }).map(function (x) { return x.read; });
        node = el('section', 'scene'); node.id = 'fe-' + i; node.appendChild(el('h3', 'scene-t', 'Leaving')); if (ps.length) { node.appendChild(readBox(ps)); }
      } else if (e.k === 'hub') {
        var hub = hubOf(e), took = hub.options.length - choices(hub).length;
        node = el('section', 'hub'); node.id = 'fe-' + i;
        node.appendChild(el('h3', 'scene-t', took || !hub.first ? hub.title : hub.first));
        if (!hasAnswer(i)) {
          if (hub.help) { node.appendChild(el('p', 'cover-p', hub.help)); }
          if (open) { var hg = handoutsRow(); if (hg) { node.appendChild(hg); } }
          if (open) { var hs = stageBox(); if (hs) { node.appendChild(hs); } }
          choices(hub).forEach(function (x) {
            var b = btn('errand', '', function () { pick(x.to); }), t = el('span');
            if (x.img) { var im = el('img'); im.src = x.img; im.alt = ''; b.appendChild(im); }
            t.appendChild(el('b', '', x.title));
            if (x.where || x.who) { t.appendChild(el('small', '', [x.where, x.who].filter(Boolean).join(' · '))); }
            if (x.feel) { t.appendChild(el('small', 'feel', x.feel)); }
            b.appendChild(t); node.appendChild(b);
          });
          if (open) { node.appendChild(whatBtn()); }
        }
      } else if (e.k === 'pick') {
        var op = optionFor(e.ch);
        node = el('p', 'outdone'); node.id = 'fe-' + i; node.appendChild(el('b', '', 'They chose ')); node.appendChild(document.createTextNode(op.title + (op.where ? ', at ' + op.where : '')));
      } else if (e.k === 'ai') {
        node = drawAI(e, i);
      } else if (e.k === 'pic') {
        node = drawPic(e, i);
      } else if (e.k === 'end') {
        node = el('section', 'cover'); node.id = 'fe-' + i; node.appendChild(el('h3', 'scene-t', 'The end')); node.appendChild(el('p', 'cover-p', 'That is the whole story. Start a new session from the Story tab whenever you like.'));
      }
      if (node) { body.appendChild(node); }
    });
    if (cur && (cur.e.k === 'scene' || cur.e.k === 'bridge')) { body.appendChild(outcomes(cur.e)); }
  }
  function paintBtn(title, moment, cap) { return btn('mini', 'Paint this', function () { paint('moment', title, moment, cap === undefined ? moment : cap); }); }
  /* The chapters in the order to list them: as the adventure writes them, except that the chapters
     offered at a hub come in the order they were picked, with the ones still on offer after them. */
  function listed() {
    var out = [], put = function (id) { if (out.indexOf(id) < 0) { out.push(id); } };
    ST.flow.chapters.forEach(function (c) {
      var hub = hubs().filter(function (h) { return h.options.some(function (o) { return o.to === c.id; }); })[0];
      if (!hub) { put(c.id); return; }
      DM.order.forEach(function (id) { if (hub.options.some(function (o) { return o.to === id; })) { put(id); } });
      hub.options.forEach(function (o) { put(o.to); });
    });
    return out;
  }

  function renderChapters(body) {
    var f = DM.flags, started = DM.feed.length > 1, defs = ST.flags || {};
    var c = el('section', 'card'); c.appendChild(el('h3', 'scene-t', ST.title)); c.appendChild(el('p', 'cover-p', ST.pitch));
    var d = el('details', 'try'); d.appendChild(el('summary', '', 'The truth of it (spoilers)')); var db = el('div', 'try-b'); db.appendChild(notes(bib('truths'))); d.appendChild(db); c.appendChild(d);
    var d2 = el('details', 'try'); d2.appendChild(el('summary', '', 'How to run this')); var d2b = el('div', 'try-b'); d2b.appendChild(notes(ST.howto || [])); d2.appendChild(d2b); c.appendChild(d2);
    if (run.brief(ST)) { c.appendChild(briefBtn('The whole story on one page: who matters, how it can end, and tips for a first game.')); }
    body.appendChild(c);
    if (!wide()) { paceBox(body); }              // a wide screen keeps the clock beside the story, with the table
    graphBox(body);
    body.appendChild(el('div', 'dm-h pad-h', 'Chapters'));
    listed().forEach(function (id) {
      var ch = chapter(id), ix = -1; DM.feed.forEach(function (e, i) { if (e.k === 'chapter' && e.ch === id) { ix = i; } });
      var over = ix >= 0 && DM.feed.slice(ix).some(function (e) { return (e.k === 'chapter' && e.ch !== id) || e.k === 'wrap' || e.k === 'hub' || e.k === 'end'; });
      var b = btn('chrow' + (ix >= 0 ? (over ? ' done' : ' now') : ''), '', function () { if (ix >= 0) { ui.tab = 'run'; render(); scrollToEntry(ix); } }), t = el('span');
      var sub = ix < 0 ? ch.length : (over ? 'Done' : 'In play');
      /* a chapter can name the flag that sums up how it went; that flag's own words say it here */
      var how = ch.flag && f[ch.flag] && defs[ch.flag] && defs[ch.flag].short;
      if (how && how[f[ch.flag]]) { sub = how[f[ch.flag]]; }
      if (ch.img) { var im = el('img'); im.src = ch.img; im.alt = ''; b.appendChild(im); }
      t.appendChild(el('b', '', ch.title)); t.appendChild(el('small', '', sub)); b.appendChild(t); b.disabled = ix < 0;
      body.appendChild(b);
    });
    var tools = el('div', 'tools pad-h');
    /* a shortcut shows while the DM is waiting at one of the points the adventure lists for it, until its target has come up */
    var cur = current(), at = !cur ? '' : (cur.e.k === 'hub' ? hubOf(cur.e).id : (cur.e.k === 'bridge' ? interlude(cur.e.i).id : cur.e.ch));
    (ST.flow.shortcuts || []).forEach(function (sc) {
      if (started && at && sc.at.indexOf(at) >= 0 && !seen(sc.to, DM.feed)) { tools.appendChild(btn('btn ghost slim', sc.button, function () { jump(sc); })); }
    });
    if (started) {
      tools.appendChild(btn('btn ghost slim', 'Start a new session', function () {
        var n = atTable() ? TB.players().length : 0;
        ask({ title: 'Start a new session?', yes: 'Start a new session', no: 'Keep this session',
          text: atTable() ? 'The story goes back to the cover, here and on ' + (n ? (n === 1 ? 'your player’s phone' : 'all ' + n + ' phones') : 'every phone') + ' at table ' + TB.code() + '. Everything you have sent, every roll, the scene, the map and any vote are cleared from the phones and the big screen. Your players keep their seats and their heroes.'
            : 'The story goes back to the cover, and what happened in this session is forgotten on this device.' }, newSession);
      }));
    }
    body.appendChild(tools);
  }

  /* ---------- the brief: one page to read before the first game ---------- */
  function labelChips() {             // the cartridge's label: how long, how many, the mood, how much the DM needs to know
    var list = run.chips(FR.theme && FR.theme.label), ul = el('ul', 'good label');
    if (!list.length) { return null; }
    list.forEach(function (c) { ul.appendChild(el('li', '', c)); });
    return ul;
  }
  function briefBtn(note) {
    var w = el('div', 'what');
    w.appendChild(btn('btn ghost slim', 'Read the brief', function () { ui.tab = 'brief'; render(); $('dm-body').scrollTop = 0; var h = $('brief-t'); if (h) { h.focus(); } }));
    w.appendChild(el('small', '', note));
    return w;
  }
  /* What it is about, the people who matter, how it can end, and the tips. Laid out to print cleanly
     on its own (src/css/dm.css hides everything else on paper). */
  function renderBrief(body) {
    var b = run.brief(ST), page = el('article', 'brief'), tools = el('div', 'brief-tools'), chips = labelChips(), h = el('h2', 'brief-t', ST.title);
    var part = function (head, node) { var s = el('section', 'brief-s'); s.appendChild(el('h3', 'scene-t', head)); s.appendChild(node); page.appendChild(s); };
    var list = function (rows) { var u = el('ul', 'dmnotes'); rows.forEach(function (r) { u.appendChild(el('li', '', r)); }); return u; };
    if (!b) { ui.tab = 'chapters'; renderChapters(body); return; }
    page.appendChild(el('div', 'chap-k', 'The brief' + (ST.length ? ' · ' + ST.length : '') + (ST.table ? ' · ' + ST.table : '')));
    h.id = 'brief-t'; h.tabIndex = -1; page.appendChild(h);
    if (chips) { page.appendChild(chips); }
    tools.appendChild(btn('btn wax slim', DM.feed.length > 1 ? 'Back to the story' : 'Back to the cover', function () { ui.tab = 'run'; render(); }));
    if (window.print) { tools.appendChild(btn('btn ghost slim', 'Print this page', function () { window.print(); })); }
    page.appendChild(tools);
    if (b.about) { part('What it is about', el('p', 'cover-p', b.about)); }
    if (b.people.length) {
      var ppl = el('div', 'brief-ppl');
      b.people.forEach(function (p) {
        var c = btn('brief-p', '', function () { openSheet('people', p.id); }), t = el('span');
        if (p.img) { var im = el('img'); im.src = p.img; im.alt = ''; c.appendChild(im); }
        t.appendChild(el('b', '', fullName(p)));
        if (p.role) { t.appendChild(el('small', 'role', p.role)); }
        if (p.wants) { t.appendChild(el('small', '', 'Wants: ' + p.wants)); }
        if (p.voice) { t.appendChild(el('small', '', 'Voice: ' + p.voice)); }
        c.appendChild(t); c.setAttribute('aria-label', fullName(p) + '. Open in the dictionary.'); ppl.appendChild(c);
      });
      part('The people who matter', ppl);
    }
    if (b.endings.length) { part('How it can end', list(b.endings)); }
    if (b.tips.length) { part('Tips for your first game', list(b.tips)); }
    body.appendChild(page);
  }

  function renderLookup(body) {
    var top = el('div', 'lk-top'), inp = el('input', 'field lk-in'); inp.type = 'search'; inp.id = 'lk-q'; inp.placeholder = 'Search people, places and things'; inp.value = ui.q; inp.setAttribute('aria-label', 'Search the dictionary');
    inp.addEventListener('input', function () { ui.q = inp.value; drawList(); });
    top.appendChild(inp);
    var seg = el('div', 'seg3 four');
    [['all', 'All'], ['people', 'People'], ['places', 'Places'], ['things', 'Things']].forEach(function (o) {
      var b = btn(ui.lookup === o[0] ? 'on' : '', o[1], function () { ui.lookup = o[0]; Array.prototype.forEach.call(seg.children, function (x) { x.className = x === b ? 'on' : ''; x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); drawList(); }); b.setAttribute('aria-pressed', ui.lookup === o[0] ? 'true' : 'false'); seg.appendChild(b);
    });
    top.appendChild(seg); body.appendChild(top);
    var list = el('div', 'lk-list'); body.appendChild(list);
    function drawList() {
      clear(list);
      var q = ui.q.trim().toLowerCase(), n = 0;
      [['people', bib('people')], ['places', bib('places')], ['things', bib('things')]].forEach(function (g) {
        if (ui.lookup !== 'all' && ui.lookup !== g[0]) { return; }
        g[1].forEach(function (x) {
          var hay = [x.name, x.full, x.role, x.blurb, x.where, x.look, x.secret, x.wants].join(' ').toLowerCase();
          if (q && hay.indexOf(q) < 0) { return; }
          var b = btn('lk', '', function () { openSheet(g[0], x.id); }), t = el('span'); b.setAttribute('data-id', g[0] + ':' + x.id);
          if (x.img) { var im = el('img'); im.src = x.img; im.alt = ''; b.appendChild(im); } else { b.appendChild(el('i', 'lk-dot')); }
          t.appendChild(el('b', '', x.name)); t.appendChild(el('small', '', x.role || x.blurb)); b.appendChild(t); list.appendChild(b); n++;
        });
      });
      if (!n) { list.appendChild(el('p', 'cover-p pad-h', 'Nothing by that name in this story. Try a shorter word.')); }
    }
    drawList();
  }

  function renderParty(body) {
    var c = el('section', 'card'), live;
    c.appendChild(el('h3', 'scene-t', 'Who is at the table?'));
    if (atTable()) {
      c.appendChild(el('p', 'cover-p', 'Players who join table ' + TB.code() + ' on their phones appear here by themselves, with the characters they made. Tap one to see their character. The story helper and the painter use them.'));
      live = el('div', 'tb-list'); c.appendChild(live); watch(live, function () { playerRows(live); });
      spotBox(c);
      c.appendChild(el('div', 'dm-h', 'Anyone playing without a phone'));
    } else { c.appendChild(el('p', 'cover-p', wordFor('partyHelp', 'Optional. List who is playing and which character each one has, so the helper can call them by name.'))); }
    handParty(c);
    body.appendChild(c);
  }

  /* the ask bar: what do they try, plus quick requests */
  function renderAsk() {
    var bar = $('dm-ask'), w = where();
    clear(bar);
    bar.hidden = ui.tab !== 'run' || w.ch === 'cover' || !!DM.feed.filter(function (e) { return e.k === 'end'; }).length;
    if (bar.hidden) { return; }
    var chips = el('div', 'ask-chips'), cast = (w.scene && w.scene.cast) || [];
    chips.appendChild(btn('chipd', 'A twist', function () { send('twist', ''); }));
    chips.appendChild(btn('chipd', 'Recap so far', function () { send('recap', ''); }));
    if (A.isLive() && w.scene) { chips.appendChild(btn('chipd', 'Paint the scene', paintScene)); }
    var hp = happened(); if (A.isLive() && hp.length) { chips.appendChild(btn('chipd', 'Paint what just happened', function () { var m = happened().slice(-1)[0]; paint('moment', 'What just happened', m, m); })); }
    cast.forEach(function (id) { var p = person(id); if (!p) { return; } chips.appendChild(btn('chipd' + (ui.sayFor === id ? ' on' : ''), p.name + ' says…', function () { ui.sayFor = ui.sayFor === id ? null : id; renderAsk(); var box = $('dm-input'); if (box) { box.focus(); } })); });
    bar.appendChild(chips);
    var row = el('form', 'ask-row'); row.setAttribute('novalidate', '');
    if (Voice.dict) {
      var mic = btn('icon', '', function () { if (Voice.dict.active()) { Voice.dict.stop().catch(function () { /* fine */ }); } else { Voice.dict.start().catch(function (e) { if (e && (e.code === 'not_granted' || e.code === 'unavailable')) { Voice.dict = null; renderAsk(); } }); } });
      mic.id = 'dm-mic'; mic.setAttribute('aria-label', 'Dictate'); mic.setAttribute('aria-pressed', 'false'); mic.appendChild(svg(ICON.mic)); row.appendChild(mic);
    }
    var inp = el('input', 'field'); inp.type = 'text'; inp.id = 'dm-input'; inp.autocomplete = 'off';
    inp.placeholder = ui.sayFor ? 'About what? (or leave empty)' : 'What do they try?'; inp.setAttribute('aria-label', ui.sayFor ? 'What should ' + person(ui.sayFor).name + ' talk about' : 'What do the players try');
    row.appendChild(inp);
    var go = btn('icon solid', '', null); go.type = 'submit'; go.setAttribute('aria-label', 'Ask the story'); go.appendChild(svg(ICON.send)); row.appendChild(go);
    row.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = inp.value.trim();
      if (ui.sayFor) { send('say', v); } else if (v) { theyDid(v); }
    });
    bar.appendChild(row);
    bar.appendChild(el('p', 'ask-src', { openai: 'Story help by OpenAI, with the whole adventure in mind.', claude: 'Story help by Claude, with the whole adventure in mind. The first use asks your permission.', local: 'No AI connected here, so suggestions come from the adventure’s own notes.' }[aiSource()]));
  }
  /* "They did what?" One question, then three ways forward: go with it (a roll to ask for and what
     happens either way), add a complication (a small surprise that fits), or steer back to the plot.
     Each is answered by the helper, which without an AI answers from the adventure's own notes. */
  function theyDid(text) {
    if (ui.busy) { toast('One thing at a time: the story is still thinking.'); return; }
    dialogOpen('They did what?', function (body) {
      var inp = el('textarea', 'field area'), ways = el('div', 'ways'), need = el('p', 'err-line', 'Say what they did first, in a few words.');
      inp.rows = 2; inp.maxLength = 300; inp.value = text || ''; inp.placeholder = 'In a few words'; inp.setAttribute('aria-label', 'What did they do?');
      inp.addEventListener('input', function () { need.hidden = true; });
      need.hidden = true; need.setAttribute('role', 'alert');
      body.appendChild(el('p', 'cover-p', 'What did they do? Say it in a few words, then pick a way forward. Nothing here goes to your players.'));
      body.appendChild(inp); body.appendChild(need);
      [['try', 'Go with it', 'Let them try. You get a roll to ask for, and what happens if it works or not.'],
        ['twist', 'Add a complication', 'A small surprise that fits the moment, and how to wrap it up.'],
        ['steer', 'Steer back to the plot', 'A gentle way back to what this scene is for.']].forEach(function (w) {
        var b = btn('way', '', function () {
          var v = inp.value.trim();
          if (!v && w[0] !== 'twist') { need.hidden = false; inp.focus(); return; }
          dialogShut(); send(w[0], v);
        });
        b.appendChild(el('b', '', w[1])); b.appendChild(el('small', '', w[2])); ways.appendChild(b);
      });
      body.appendChild(ways);
      body.appendChild(el('p', 'ask-src', { openai: 'Story help by OpenAI, with the whole adventure in mind.', claude: 'Story help by Claude, with the whole adventure in mind.', local: 'No AI connected here, so the answers come from the adventure’s own notes.' }[aiSource()]));
      return inp;
    });
  }
  function send(mode, text) {
    if (ui.busy) { return; }
    ui.busy = true;
    if (A.event && (mode === 'try' || mode === 'twist' || mode === 'steer')) { A.event('helper', { way: mode }); }      // a number for the site's owner: which way forward DMs reach for
    var e = { k: 'ai', mode: mode, q: text, who: mode === 'say' ? ui.sayFor : null, a: {}, src: aiSource(), wait: true };
    var i = push(e); render(); scrollToEntry(i);
    askAI(mode, text).then(function (r) { e.a = r.a; e.src = r.src; }).catch(function () { e.a = builtin(mode, text); e.src = 'local'; }).then(function () {
      delete e.wait; ui.busy = false; if (mode === 'say') { ui.sayFor = null; }
      save(); render(); scrollToEntry(i);
    });
  }

  /* a dictionary entry: on a phone it opens as a sheet; on a wide screen it opens in the dictionary's own place, and the story stays put */
  function entryInto(box, kind, id) {
    var x = byId(bib(kind), id);
    if (x.img) { var im = el('img', kind === 'people' ? 'sh-img' : 'sh-img wide'); im.src = x.img; im.alt = kind === 'people' ? 'Picture of ' + x.name : ''; box.appendChild(im); }
    box.appendChild(el('h3', 'sh-t', x.full || x.name));
    if (x.role) { box.appendChild(el('p', 'sh-role', x.role)); }
    if (kind === 'people') {
      [['Where', x.where], ['Looks', x.look], ['Voice', x.voice], ['Wants', x.wants]].forEach(function (r) { box.appendChild(line(r[0], r[1])); });
      var sec = el('div', 'perk'); sec.appendChild(el('b', '', 'Secret ')); sec.appendChild(document.createTextNode(x.secret)); box.appendChild(sec);
      box.appendChild(readBox(x.lines, 'Say this'));
    } else {
      box.appendChild(readBox([x.blurb], kind === 'places' ? 'Describe it' : 'What it is'));
      if (x.senses) { box.appendChild(line('Senses', x.senses)); }
    }
    if (atTable()) { box.appendChild(showBtn(kind === 'people' ? { title: x.full || x.name, image: x.img } : { title: x.name, text: x.blurb, image: x.img || '' }, x.img ? 'Show the table this picture' : 'Send this to the table')); }
  }
  function openSheet(kind, id) {
    var x = byId(bib(kind), id), box = $('dm-sheet-b'), pane, back;
    if (!x) { return; }
    if (wide()) {
      ui.entry = { kind: kind, id: id };
      if (three()) { pane = $('dm-third-b'); dictPanel(pane); } else { pane = $('dm-side-b'); ui.side = 'dict'; renderSide(); }
      back = pane.querySelector('.back'); if (back) { back.focus(); }
      return;
    }
    clear(box); entryInto(box, kind, id);
    sheetOpen('entry', 'Dictionary: ' + (x.full || x.name));
  }
  $('dm-sheet-x').addEventListener('click', sheetShut);
  $('dm-sheet').addEventListener('click', function (e) { if (e.target === $('dm-sheet')) { sheetShut(); } });
  $('dm-confirm').addEventListener('click', function (e) { if (e.target === $('dm-confirm')) { confirmShut(false); } });
  $('dm-dialog-x').addEventListener('click', dialogShut);
  $('dm-dialog').addEventListener('click', function (e) { if (e.target === $('dm-dialog')) { dialogShut(); } });

  var TITLES = { chapters: 'The story', brief: 'The brief', lookup: 'Dictionary', party: 'The party', rolls: 'Rolls', asks: 'Asks' };
  function render() {
    var body = $('dm-body'), w = where(), keep = body.scrollTop;
    fitTabs();
    clear(body);
    body.className = 'scroll dm-body tab-' + ui.tab;
    $('dm-title').textContent = ui.tab === 'run' ? w.title : TITLES[ui.tab];
    headSub();
    $('s-dm').setAttribute('data-view', ui.tab);          // the stylesheet prints the brief on its own
    if (ui.tab === 'run') { renderRun(body); } else if (ui.tab === 'chapters') { renderChapters(body); } else if (ui.tab === 'brief') { renderBrief(body); } else if (ui.tab === 'lookup') { renderLookup(body); }
    else if (ui.tab === 'rolls') { rollsPanel(body); } else if (ui.tab === 'asks') { asksPanel(body); } else { renderParty(body); }
    body.scrollTop = keep;
    drawChip(); wasAt = atTable();
    drawNav();
    renderAsk();
    tell();                 // whatever has just changed, the phones are told where the story stands now
  }
  /* under the title: the story's own time, which scene of how many, and a word when the table is running behind the plan */
  function headSub() {
    var w, p;
    if (!ST) { return; }
    w = where(); p = ui.tab === 'run' ? paceNow() : null;
    $('dm-sub').textContent = ui.tab === 'run' ? [bell(), w.of > 1 ? 'Scene ' + w.n + ' of ' + w.of : '', p && p.state === 'behind' && run.place(ST, DM).kind !== 'end' ? 'about ' + mins(p.by) + ' behind' : ''].filter(Boolean).join(' · ') : ST.title;
  }
  /* The same choices are drawn twice: as tabs along the bottom of a phone and, for the story's two views,
     in the header of a wide screen, where everything else has a pane. The stylesheet shows one or the other. */
  function drawNav() {
    var tabs = $('dm-tabs'), views = $('dm-views');
    clear(tabs); clear(views);
    [['run', 'Run', ICON.run], ['chapters', 'Story', ICON.map], ['asks', 'Asks', ICON.asks], ['rolls', 'Rolls', ICON.dice], ['lookup', 'Dictionary', ICON.book], ['party', 'Party', ICON.party]].forEach(function (t, i) {
      [tabs, i < 2 ? views : null].forEach(function (nav) {
        if (!nav) { return; }
        var on = ui.tab === t[0] || (t[0] === 'chapters' && ui.tab === 'brief'), n;        // the brief is a page of the Story
        var b = btn((nav === tabs ? 'dmtab' : '') + (on ? ' on' : ''), '', function () { goTab(t[0], nav); });
        b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.appendChild(svg(t[2])); b.appendChild(el('span', '', t[1]));
        if (t[0] === 'rolls' || t[0] === 'asks') { n = el('i', 'dm-count'); n.setAttribute('data-of', t[0]); b.appendChild(n); }
        nav.appendChild(b);
      });
    });
    counts();
  }
  function goTab(id, nav) {
    if (ui.tab === id) { return; }
    ui.tab = id; render();
    $('dm-body').scrollTop = id === 'run' ? $('dm-body').scrollHeight : 0;
    var on = nav.querySelector('.on'); if (on) { on.focus(); }          // the tabs were redrawn: keep the keyboard on the one just chosen
  }
  function scrollToEntry(i) {
    setTimeout(function () {
      var n = document.getElementById('fe-' + i), body = $('dm-body');
      if (n && body) { body.scrollTo({ top: Math.max(0, n.offsetTop - 8), behavior: A.reduced ? 'auto' : 'smooth' }); }
    }, 40);
  }

  /* ---------- the door ---------- */
  /* showTable: the DM has just opened or joined a table, so the first thing in view is its code and who is there */
  function enterDM(showTable) {
    var side = A.store.get(SIDE);
    load(); ui.tab = 'run'; ui.entry = null; clockMark = 0;
    /* Coming through the door, the session is read afresh from this device, so the table is asked afresh
       too: nothing is told to the phones until it is known whose place is the table's (see sessionLook). */
    clearTimeout(syn.timer); syn = { code: '', ready: false, busy: false, asking: false, timer: 0, sent: '' };
    stq.over = {}; stq.turns = '';
    if (showTable) { draft.note = ''; draft.att = ''; }             // a note written for another table stays there
    ui.side = showTable || !(side === 'rolls' || side === 'dict' || side === 'asks') ? 'table' : side;
    A.go('dm'); renderAll(); hearAsks();
    if (showTable && !wide() && atTable()) { openTable(); }
    setTimeout(function () { var b = $('dm-body'); b.scrollTop = DM.feed.length > 1 ? b.scrollHeight : 0; }, 60);
  }
  /* The door. With tables on, the DM starts a new table (the main button, unless this browser already
     remembers one: then going back to it is) or joins one that is already open, by its code. */
  function doorSay(msg) { var s = $('dm-door-said'); s.textContent = msg || ''; s.hidden = !msg; }
  function doorSetup() {
    var can = !!(TB && TB.can()), mine = atTable(), code = $('dm-code').value.trim();
    $('b-dm-back').hidden = !(can && mine); $('b-dm-back').textContent = mine ? 'Back to table ' + TB.code() : '';
    $('dm-pass-wrap').hidden = !(can && TB.needsPasscode());
    if (pass && !$('dm-pass').value) { $('dm-pass').value = pass; }          // typed once already this visit
    $('dm-code-wrap').hidden = !can;
    $('b-dm-skip').hidden = !(can && !TB.needsPasscode() && !mine);
    $('dm-door-note').hidden = !can;
    $('b-dm-new').hidden = !can; $('b-dm-new').className = 'btn ' + (mine ? 'ink' : 'wax');
    $('b-dm-in').textContent = !can ? 'I am the DM. Let me in' : (code ? 'Join table ' + code : 'Join a table');
    $('b-dm-in').className = 'btn ' + (can ? 'ink' : 'wax');
    $('dm-err').hidden = true;
  }
  /* A table plays the scenario it was opened with. Before the DM goes in, make sure that scenario and
     its adventure are the ones loaded here; if it has no adventure, say so and stay at the door. */
  function suit(id, code) {
    var pack = id ? FR.pack(id) : null, no = function (m) { return Promise.reject(new Error(m)); };
    if (!id || (id === FR.theme.id && take())) { return Promise.resolve(); }
    if (!pack) { return no('Table ' + code + ' is playing a cartridge this site does not have, so it cannot be run from here.'); }
    if (!pack.adventure) { return no('Table ' + code + ' is playing “' + pack.name + '”, and that cartridge has no adventure for a DM to run. There is nothing to open here.'); }
    return Promise.resolve(A.useScenario(id)).then(function () {
      if (FR.theme.id !== id) { throw new Error('gone'); }
      return FR.loadAdventure(id);
    }).then(function () { if (!take()) { throw new Error('gone'); } }).catch(function () {
      return no('“' + pack.name + '”, the cartridge table ' + code + ' is playing, could not be loaded. Check your connection and try again.');
    });
  }
  function doorErr(m, field) {
    var err = $('dm-err'), f = field ? $(field) : null;
    if (f) { f.parentNode.parentNode.insertBefore(err, f.parentNode.nextSibling); }      // under the field it is about
    err.textContent = m; err.hidden = false;
    if (f) { f.focus(); f.select(); }           // ready to be typed over
  }
  var doorBusy = function (on) { [$('b-dm-in'), $('b-dm-new'), $('b-dm-back')].forEach(function (b) { b.disabled = on; }); };
  function doorGo(code) {
    $('dm-err').hidden = true; doorSay(''); pass = $('dm-pass').value;
    if (TB.needsPasscode() && !pass) { doorErr('Type the DM passcode first.', 'dm-pass'); return; }
    if (code !== null && code.length !== 4) { doorErr('Type the four-letter code of the table you want to join, or start a new table.', 'dm-code'); return; }
    if (code && atTable() && code === TB.code()) { backIn(); return; }
    var before = atTable() ? TB.code() : '';
    doorBusy(true);
    /* a new table is opened for the scenario in play; one that is already open says which scenario it is playing */
    TB.open(pass, code || '', FR.theme.id).then(function (j) {
      $('dm-code').value = '';
      /* A table that was just made has no story yet. Whatever this browser last ran (a rehearsal, last week's
         game) must not become its first scene: begin at the cover. Coming back to a table by its code keeps the place. */
      if (!code && ST) { DM = fresh(); save(true); }
      return suit((j && j.scenario) || tableScenario(), (j && j.code) || code).then(function () { enterDM(true); }, function (x) {
        /* Nothing to run it with: this browser lets go of that table again (the table itself is untouched)
           and goes back to the one it remembered before, if there was one. */
        var back = before && before !== TB.code() ? TB.open(pass, before).catch(function () { TB.leave(); }) : Promise.resolve(TB.leave());
        return back.then(function () { doorSetup(); doorErr(x.message); });
      });
    }, function (x) {
      if (x && x.status === 403) { pass = ''; doorErr(x.message || 'That is not the DM passcode.', 'dm-pass'); return; }
      doorErr((x && x.message) || 'Could not open a table. Try again.', code ? 'dm-code' : '');
    }).then(function () { doorBusy(false); });
  }
  /* back to the table this browser remembers: no passcode needed, but its scenario may not be the one on screen */
  function backIn() {
    $('dm-err').hidden = true; doorSay(''); doorBusy(true);
    suit(tableScenario(), TB.code()).then(function () { enterDM(); }, function (x) { doorErr(x.message); }).then(function () { doorBusy(false); });
  }
  /* the door: fetch this pack's adventure first (players never download it), then ask about the table */
  $('b-dm').addEventListener('click', function () {
    var b = $('b-dm'); if (b.disabled) { return; }
    b.disabled = true;
    FR.loadAdventure(FR.theme.id).then(function () { if (take()) { doorSay(''); doorSetup(); A.go('dmgate'); } })
      .catch(function () { (A.toast || toast)('The adventure could not be loaded. Check your connection and try again.'); })
      .then(function () { b.disabled = false; });
  });
  $('dm-code').addEventListener('input', function () { $('dm-code').value = $('dm-code').value.toUpperCase().replace(/[^A-Z]/g, ''); var c = $('dm-code').value; $('b-dm-in').textContent = c ? 'Join table ' + c : 'Join a table'; });
  /* Enter in a field does what the button below it would: a code joins that table; the passcode alone
     goes back to the table remembered here, or starts a new one. */
  $('dm-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doorGo($('dm-code').value.trim()); } });
  $('dm-pass').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') { return; }
    e.preventDefault();
    if ($('dm-code').value.trim()) { doorGo($('dm-code').value.trim()); } else if (atTable()) { backIn(); } else { doorGo(null); }
  });
  $('dmgate').addEventListener('submit', function (e) { e.preventDefault(); });
  $('b-dm-in').addEventListener('click', function () { if (TB && TB.can()) { doorGo($('dm-code').value.trim()); } else { enterDM(); } });
  $('b-dm-new').addEventListener('click', function () { doorGo(null); });
  $('b-dm-back').addEventListener('click', backIn);
  $('b-dm-skip').addEventListener('click', function () { enterDM(); });
  $('dm-exit').addEventListener('click', function () {
    if (Voice.tts && Voice.tts.active()) { Voice.tts.stop().catch(function () { /* quiet */ }); }
    clockTick(); clockMark = 0;
    if (snd.on && FR.Ambience) { FR.Ambience.stop(); } snd.on = false; snd.hushed = false;          // the soundscape is the table's, not the title screen's
    modalsShut(); A.go('title');
  });
  FR.dm = { state: function () { return DM; }, prompt: prompt, render: render,
    /* the scene state as the phones are told it now, and whether the table has it: 'none' | 'sending' | 'sent' | 'failed' */
    scene: function () { return pub.scene; }, told: function () { return pub.state; },
    /* the stage as this screen holds it (the table's copy, with anything just changed here laid over it), and whether this device and the table agree on the session */
    stage: stageView, synced: function () { return syn.ready; } };
})();
