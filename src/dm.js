/* First Roll: the DM's side. Plays an adventure: turns its data into a scrolling session the
   DM can read from, records what happened, and asks an AI co-storyteller to bend the plan
   when the players go off-script. It never tracks hit points: only the story and, beside it,
   the table the DM opened: who is sitting at it, what they roll, and whose turn it is.

   Nothing here belongs to any one story. Chapters, people, flags, wording and the AI's
   brief all come from the adventure. Its format is written up at the top of the first
   adventure file and checked by scripts/validate-adventure.js. The players' races and
   classes come from FR.theme.

   On a phone it is one column with tabs. On a wide screen the story has the main pane and the
   table sits beside it (see "the layout" below, and src/css/dm.css). */
(function () {
  'use strict';
  var A = FR.app, $ = A.$, el = A.el, clear = A.clear;

  /* The one place this file gets its adventure from: the scenario pack being played. A pack's
     adventure.js is only fetched when somebody opens the DM door (see the b-dm handler), so until
     then there is none. */
  function adventure() { return (FR.ADVENTURES && FR.theme && FR.ADVENTURES[FR.theme.id]) || null; }

  var ST = null, KEY = '';
  var DM = fresh();
  /* tab: what a phone's single column shows (run, chapters, lookup, party, rolls). side: what the pane
     beside the story shows on a wide screen (table, rolls, dict). entry: the dictionary entry open in a pane. */
  var ui = { tab: 'run', side: 'table', entry: null, lookup: 'all', q: '', busy: false, sayFor: null, painting: false, seenRoll: 0 };

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
     ai and pic entries. flags and order (the chapters picked at hubs) sit beside it, and so do party
     (players typed in by hand) and turns (the turn order, which has its own section below). A session
     saved before turns existed simply starts with an empty order. */
  function noTurns() { return { code: '', rows: [], at: '', round: 1, after: 0, seen: 0, ord: 0 }; }
  function fresh() { return { feed: [{ k: 'cover' }], flags: {}, order: [], party: [], signed: '', turns: noTurns() }; }
  function save() { try { A.store.set(KEY, JSON.stringify(DM)); } catch (e) { /* storage full: the session still runs */ } }
  function load() {
    try { var d = JSON.parse(A.store.get(KEY) || 'null'); if (d && d.feed && d.feed.length && fits(d)) { DM = d; DM.flags = DM.flags || {}; DM.order = DM.order || []; DM.party = DM.party || []; DM.turns = DM.turns && Array.isArray(DM.turns.rows) ? DM.turns : noTurns(); DM.feed = DM.feed.filter(function (e) { return !e.wait && !(e.k === 'pic' && !e.url && !e.err && !pics[e.id]); }); } } catch (e) { /* start fresh */ }
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

  /* ---------- small lookups ---------- */
  var byId = function (list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; };
  var bib = function (kind) { return (ST.bible && ST.bible[kind]) || []; };            // people, places or things
  var person = function (id) { return byId(bib('people'), id); };
  var fullName = function (p) { return p.full || p.name; };
  var chapter = function (id) { return byId(ST.flow.chapters, id); };
  var interlude = function (i) { return (ST.flow.interludes || [])[i]; };
  var hubs = function () { return ST.flow.hubs || []; };
  var hubOf = function (e) { return e.id ? byId(hubs(), e.id) : hubs()[0]; };
  var choices = function (hub) { return hub.options.filter(function (o) { return DM.order.indexOf(o.to) < 0; }); };   // what is still on offer
  var optionFor = function (ch) { var hit = null; hubs().forEach(function (h) { h.options.forEach(function (o) { if (o.to === ch && !hit) { hit = o; } }); }); return hit; };
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

  /* ---------- conditions: the questions an adventure asks about the session (its `when`) ---------- */
  function seen(id, feed) {       // has that chapter, interlude or hub come up?
    return feed.some(function (e) { return (e.k === 'chapter' && e.ch === id) || (e.k === 'bridge' && (interlude(e.i) || {}).id === id) || (e.k === 'hub' && (hubOf(e) || {}).id === id); });
  }
  function tally(what, feed) {
    if (what === 'picks') { return DM.order.length; }
    var k = { interludes: 'bridge', chapters: 'chapter' }[what];
    return feed.filter(function (e) { return e.k === k; }).length;
  }
  function score(name) {          // points added up across flags, as the adventure's `scores` lays out
    var rows = (ST.scores && ST.scores[name]) || {}, n = 0;
    Object.keys(rows).forEach(function (flag) { n += rows[flag][String(DM.flags[flag])] || 0; });
    return n;
  }
  /* Does this condition hold? No condition means yes. `feed` lets the clock ask about an earlier moment. */
  function holds(c, feed) {
    if (!c) { return true; }
    feed = feed || DM.feed;
    var f = DM.flags, o = DM.order, n;
    if (c.all) { return c.all.every(function (x) { return holds(x, feed); }); }
    if (c.any) { return c.any.some(function (x) { return holds(x, feed); }); }
    if (c.not) { return !holds(c.not, feed); }
    if (c.flag) {
      if ('is' in c) { return f[c.flag] === c.is; }
      if ('isNot' in c) { return f[c.flag] !== c.isNot; }
      if (c.in) { return c.in.indexOf(f[c.flag]) >= 0; }
      return !!f[c.flag];
    }
    if (c.picked) { return o.indexOf(c.picked) >= 0; }
    if (c.before) { return o.indexOf(c.before[0]) >= 0 && o.indexOf(c.before[1]) >= 0 && o.indexOf(c.before[0]) < o.indexOf(c.before[1]); }
    if (c.seen) { return seen(c.seen, feed); }
    if (c.count) { n = tally(c.count, feed); } else if (c.score) { n = score(c.score); } else { return false; }
    return (!('is' in c) || n === c.is) && (!('atLeast' in c) || n >= c.atLeast) && (!('atMost' in c) || n <= c.atMost);
  }
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

  /* ---------- the engine: what follows what ---------- */
  function push(e) { DM.feed.push(e); return DM.feed.length - 1; }
  function begin() { done(goTo(ST.flow.start)); }
  function done(scrollTo) { save(); render(); if (scrollTo !== undefined) { scrollToEntry(scrollTo); } }
  /* Bring up a chapter, an interlude or a hub by its id. Gives back the first entry it added. */
  function goTo(id, deep) {
    var ins = ST.flow.interludes || [], hs = hubs(), i;
    if (chapter(id)) { i = push({ k: 'chapter', ch: id }); push({ k: 'scene', ch: id, sc: 0 }); return i; }
    for (i = 0; i < ins.length; i++) { if (ins[i].id === id) { return push({ k: 'bridge', i: i }); } }
    for (i = 0; i < hs.length; i++) {
      if (hs[i].id === id) { return choices(hs[i]).length ? push(i ? { k: 'hub', id: id } : { k: 'hub' }) : follow(hs[i].next, (deep || 0) + 1); }   // nothing left to choose: move on
    }
    return push({ k: 'end' });       // a name nothing answers to: end the story rather than strand the DM
  }
  /* The first rule that holds says where the story goes next: { to: id } or { end: true }. */
  function follow(rules, deep) {
    var hit = (deep || 0) > 8 ? null : (rules || []).filter(function (r) { return holds(r.when); })[0];
    return hit && hit.to && !hit.end ? goTo(hit.to, deep) : push({ k: 'end' });
  }
  function choose(entry, o) {
    var sets = o.sets || {};
    Object.keys(sets).forEach(function (k) { DM.flags[k] = sets[k]; });
    push({ k: 'out', label: o.label, log: o.log || o.label });
    if (o.end) { return done(push({ k: 'end' })); }
    if (o.to) { return done(goTo(o.to)); }
    if (entry.k === 'bridge') { return done(follow(interlude(entry.i).next)); }
    var ch = chapter(entry.ch), next = entry.sc + 1 + (o.skip || 0);
    if (o.scene) { ch.scenes.forEach(function (s, i) { if (s.id === o.scene) { next = i; } }); }
    if (next < ch.scenes.length) { return done(push({ k: 'scene', ch: entry.ch, sc: next })); }
    endChapter(entry.ch);
  }
  function endChapter(id) {
    var ch = chapter(id), first = ch.leaving && ch.leaving.length ? push({ k: 'wrap', ch: id }) : -1, then = follow(ch.next);
    done(first < 0 ? then : first);
  }
  function pick(id) {
    DM.order.push(id);
    push({ k: 'pick', ch: id });
    done(goTo(id));
  }
  function jump(sc) {             // a shortcut the adventure offers a DM who is short on time
    push({ k: 'out', label: sc.label, log: sc.log || sc.label });
    var first = goTo(sc.to);
    ui.tab = 'run'; done(first);
  }

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
      bridge: 'The party is moving on. Write the read-aloud that carries them from what just happened into what comes next, reflecting how things actually went, in "read" (three or four sentences). In "note" give the DM one thing from earlier to call back to. Leave the other fields empty.'
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
  function showTable(item, b) {
    if (!atTable()) { toast('Open a table first: tap the table button at the top.'); return Promise.resolve(false); }
    if (b) { b.disabled = true; }
    return TB.send(item).then(function (j) {
      toast(j.players ? 'Sent to ' + j.players + (j.players === 1 ? ' player.' : ' players.') : 'Sent. Nobody has joined the table yet.');
      if (b) { b.textContent = 'Shown to the table'; setTimeout(function () { b.disabled = false; b.textContent = b.getAttribute('data-l'); }, 4000); }
      return true;
    }).catch(function (e) { toast((e && e.message) || 'That could not be sent.'); if (b) { b.disabled = false; } return false; });
  }
  function showBtn(item, label) { var b = btn('btn ghost slim show', label || 'Show the table', function () { showTable(item, b); }); b.setAttribute('data-l', label || 'Show the table'); return b; }
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
    clear(list);
    var ps = TB ? TB.players() : [];
    if (!ps.length) { list.appendChild(el('p', 'cover-p', 'Nobody yet. Players appear here as they join.')); }
    ps.forEach(function (p) {
      var r = btn('tb-p', '', function () { openPlayer(p.id); }), t = el('span'), c = p.char;
      r.setAttribute('data-id', p.id);
      r.appendChild(face(p));
      t.appendChild(el('b', '', p.name)); t.appendChild(el('small', '', c && c.cls ? (c.name ? c.name + ', ' : 'Not named yet: ') + [c.race, c.cls].filter(Boolean).join(' ') : 'Still answering the questions'));
      r.appendChild(t); list.appendChild(r);
      if (held === p.id) { r.focus(); }
    });
  }
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
  /* On a wide screen the dictionary, the party and the rolls live beside the story, so a tab that was
     showing one of them hands over to the side pane and the story comes back to the main one. */
  function fitTabs() {
    if (!wide()) { return; }
    if (ui.tab === 'lookup') { ui.side = 'dict'; } else if (ui.tab === 'party') { ui.side = 'table'; } else if (ui.tab === 'rolls') { ui.side = 'rolls'; }
    if (ui.tab !== 'chapters') { ui.tab = 'run'; }
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
  function modalsShut() { modals.forEach(function (m) { m.box.hidden = true; }); modals = []; sheetBack = null; sheetIs = ''; }
  document.addEventListener('keydown', function (e) {
    var m = modals[modals.length - 1], f, a;
    if (!m || m.box.hidden || A.screen() !== 'dm') { return; }
    if (e.key === 'Escape') { e.preventDefault(); if (m.box === $('dm-sheet')) { sheetShut(); } else { modalClose(m.box); } return; }
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
  function ask(o, yes) {
    var box = $('dm-confirm'), row = $('dm-confirm-b'), no = btn('btn ghost slim', o.no, function () { modalClose(box); });
    $('dm-confirm-t').textContent = o.title; $('dm-confirm-p').textContent = o.text;
    clear(row);
    row.appendChild(btn('btn wax slim', o.yes, function () { modalClose(box); yes(); }));
    row.appendChild(no);
    modalOpen(box, no);
  }

  /* ---------- the table: its code and link, who is here, a note for everyone, and the two ways out ---------- */
  var draft = { note: '', att: '' };          // a note being written is kept while the panel is redrawn or put away
  function tablePanel(box) {
    var link = shareLink(), top = el('div', 'tb-top'), code = el('div', 'tb-code'), q = qr(link), ADD = 'Add a picture of your own';
    box.appendChild(el('h3', 'sh-t', 'Your table'));
    code.appendChild(el('small', '', 'Table code')); code.appendChild(el('b', '', TB.code()));
    top.appendChild(code); if (q) { top.appendChild(q); } box.appendChild(top);
    box.appendChild(el('p', 'tb-how', 'Players ' + (q ? 'scan the square or open the link' : 'open the link') + ' on their own phones, and it seats them at this table straight away. Anyone already in the app can type the code instead.'));
    var row = el('div', 'tb-link'), inp = el('input', 'field'); inp.type = 'text'; inp.readOnly = true; inp.value = link; inp.setAttribute('aria-label', 'Link for players'); inp.addEventListener('focus', function () { inp.select(); });
    row.appendChild(inp);
    row.appendChild(btn('btn ghost slim', navigator.share ? 'Share' : 'Copy', function () {
      var copy = function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Link copied.'); }).catch(function () { inp.focus(); inp.select(); toast('Select the link and copy it.'); }); };
      if (navigator.share) { navigator.share({ title: 'First Roll', text: 'Join my table. The code is ' + TB.code() + '.', url: link }).catch(function (e) { if (!e || e.name !== 'AbortError') { copy(); } }); } else { copy(); }
    }));
    box.appendChild(row);
    box.appendChild(el('div', 'dm-h', 'At the table'));
    var list = el('div', 'tb-list'), tip = el('p', 'tb-tip', 'Tap a player to see their character, or to remove them from the table.');
    box.appendChild(list); box.appendChild(tip);
    watch(list, function () { playerRows(list); tip.hidden = !TB || !TB.players().length; });
    if (wide()) { box.appendChild(el('div', 'dm-h', 'Anyone playing without a phone')); handParty(box); }      // a phone has the Party tab for this
    box.appendChild(el('div', 'dm-h', 'A note for everyone'));
    var ta = el('textarea', 'field area'); ta.id = 'tb-note'; ta.rows = 3; ta.maxLength = 600; ta.placeholder = 'A clue, a letter, a secret message…'; ta.setAttribute('aria-label', 'A note for every player'); ta.value = draft.note;
    ta.addEventListener('input', function () { draft.note = ta.value; });
    box.appendChild(ta);
    var prev = el('img', 'tb-att'), pickF = el('input'); prev.hidden = !draft.att; if (draft.att) { prev.src = draft.att; } prev.alt = 'The picture you are about to send'; pickF.type = 'file'; pickF.accept = 'image/*'; pickF.hidden = true; pickF.id = 'tb-file';
    var addB = btn('btn ghost slim', draft.att ? 'Choose a different picture' : ADD, function () { pickF.click(); });
    pickF.addEventListener('change', function () {
      var f = pickF.files && pickF.files[0]; if (!f) { return; }
      shrink(f).then(function (d) { draft.att = d; prev.src = d; prev.hidden = false; addB.textContent = 'Choose a different picture'; }).catch(function () { toast('That picture could not be read. Try another.'); });
    });
    box.appendChild(prev); box.appendChild(pickF); box.appendChild(addB);
    var sb = btn('btn wax slim', 'Send to the table', function () {
      var v = ta.value.trim(); if (!v && !draft.att) { ta.focus(); return; }
      sb.disabled = true;
      showTable({ title: v ? 'A note from your DM' : '', text: v, image: draft.att }).then(function (ok) { sb.disabled = false; if (ok) { ta.value = ''; draft.note = ''; draft.att = ''; prev.hidden = true; pickF.value = ''; addB.textContent = ADD; } });
    });
    box.appendChild(sb);
    box.appendChild(el('div', 'dm-h', 'Shown so far'));
    var sent = el('div', 'tb-list'); box.appendChild(sent);
    watch(sent, function () {
      var fd = TB ? TB.feed().slice().reverse() : [];
      clear(sent);
      if (!fd.length) { sent.appendChild(el('p', 'cover-p', 'Nothing yet. Look for “Show the table” under pictures in the story and in the dictionary.')); }
      fd.forEach(function (f) {
        var r = el('div', 'tb-p'), t = el('span');
        if (f.img) { var im = el('img', 'sq'); im.src = f.img; im.alt = ''; r.appendChild(im); } else { r.appendChild(el('i', 'lk-dot note')); }
        t.appendChild(el('b', '', f.title || (f.img ? 'A picture' : 'A note'))); if (f.text) { t.appendChild(el('small', '', f.text)); }
        r.appendChild(t); sent.appendChild(r);
      });
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
    if (cls && cls.blurb) { box.appendChild(el('p', 'cover-p', cls.blurb)); }
    if (good.length) { box.appendChild(el('div', 'dm-h', 'Good at')); var ul = el('ul', 'good'); good.forEach(function (g) { ul.appendChild(el('li', '', g)); }); box.appendChild(ul); }
    if (race && race.perk) { var pk = el('div', 'perk'); pk.appendChild(el('b', '', ((th.text && th.text.asA) || 'As a ') + c.race + ' ')); pk.appendChild(document.createTextNode(race.perk)); box.appendChild(pk); }
    out.appendChild(btn('btn ghost slim danger', 'Remove from table', function () { removePlayer(p); }));
    out.appendChild(el('small', '', 'Frees their seat and tells their phone. They can join again with the code.'));
    box.appendChild(out);
    sheetOpen('player', 'Character: ' + (c.name || p.name), back);
  }
  function removePlayer(p) {
    ask({ title: 'Remove ' + p.name + ' from the table?', text: 'Their seat is freed, their character leaves with it, and their phone is told the DM removed them. They can join again with the code.', yes: 'Remove ' + p.name, no: 'Keep ' + p.name }, function () {
      TB.kick(p.id).then(function (j) {
        if (sheetIs === 'player') { sheetShut(); }
        turnDrop('p:' + p.id);
        toast(j && j.removed === false ? p.name + ' had already left the table.' : p.name + ' has been removed from the table.');
        drawChip(); refresh();
      }).catch(function (e) { if (A.screen() === 'dm') { toast((e && e.message) || 'That did not go through. Try again.'); } });
    });
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
  /* how many rolls have landed since the DM last had the rolls in view: shown on the way to them */
  function counts() {
    var n = rollsNow().filter(function (r) { return !r.old && !r.mine && r.n > ui.seenRoll; }).length;
    Array.prototype.forEach.call(document.querySelectorAll('#s-dm .dm-count'), function (c) { c.textContent = String(n); c.hidden = !n; c.setAttribute('aria-label', n + ' new'); });
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
       code    the table all of this belongs to: another table starts with a clean order. */
  var STALE = 3 * 3600 * 1000;    // initiative rolled hours before this session first saw the table belongs to an earlier evening
  function turnRows() { return DM.turns.rows.slice().sort(function (a, b) { return b.total - a.total || a.ord - b.ord; }); }
  function turnNow() { return DM.turns.rows.filter(function (r) { return r.key === DM.turns.at; })[0] || null; }
  /* Count the initiative rolls not counted yet. Says whether anything changed. */
  function takeTurns() {
    var T = DM.turns, code = atTable() ? TB.code() : '', rolls = rollsNow(), changed = false, kept, untouched;
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
    var T = DM.turns, rows = turnRows(), i = rows.indexOf(turnNow());
    if (!rows.length || (i < 0 && d < 0)) { return; }
    i = i < 0 ? 0 : i + d;
    if (i >= rows.length) { i = 0; T.round++; }                                  // past the last: the next round begins
    if (i < 0 && T.round > 1) { i = rows.length - 1; T.round--; }
    T.at = i < 0 ? '' : rows[i].key;                                             // back before the very first turn: nobody's turn yet
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
        var p = r.id ? seat(r.id) : null, row = el('li', 'to-row' + (r === now ? ' now' : '')), t = el('span', 'to-who'), x = btn('icon', '', function () { turnDrop(r.key); });
        if (r === now) { row.setAttribute('aria-current', 'true'); }
        row.appendChild(face(p));
        t.appendChild(el('b', '', p ? p.name : r.name));
        t.appendChild(el('small', '', [r === now ? 'Their turn' : '', r.hand ? 'Added by hand' : (p ? (p.char && p.char.name) || '' : (r.id && here ? 'No longer at the table' : ''))].filter(Boolean).join(' · ')));
        row.appendChild(t); row.appendChild(el('strong', 'to-n', String(r.total)));
        x.setAttribute('data-key', r.key); x.setAttribute('aria-label', 'Take ' + r.name + ' out of the turn order'); x.appendChild(svg('M6 6l12 12M18 6L6 18')); row.appendChild(x);
        list.appendChild(row);
        if (held === r.key) { x.focus(); }
      });
      if (held && !list.contains(document.activeElement)) { (list.querySelector('button') || who).focus(); }       // the row that had the keyboard is gone
      if (!now && document.activeElement === prev) { next.focus(); }
      prev.hidden = !now; next.disabled = !rows.length;       // before the first turn there is nothing to go back to
      next.textContent = now ? 'Next turn' : 'Start the first turn';
      ctl.hidden = !rows.length; foot.hidden = !rows.length;
    });
  }

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
    [['table', 'Table'], ['rolls', 'Rolls'], ['dict', 'Dictionary']].forEach(function (t) {
      if (t[0] === 'dict' && three()) { return; }           // it has its own pane
      var b = btn(ui.side === t[0] ? 'on' : '', t[1], function () { if (ui.side !== t[0]) { sideTab(t[0]); } });
      b.setAttribute('aria-pressed', ui.side === t[0] ? 'true' : 'false');
      if (t[0] === 'rolls') { b.appendChild(el('i', 'dm-count')); }
      tabs.appendChild(b);
    });
    box.className = 'scroll dm-side-b' + (ui.side === 'dict' ? ' dict' : ''); box.scrollTop = 0;
    if (ui.side === 'rolls') { rollsPanel(box); } else if (ui.side === 'dict') { dictPanel(box); } else if (atTable()) { tablePanel(box); } else { noTable(box); }
    if (three()) { dictPanel($('dm-third-b')); }
    counts();
  }
  function renderAll() { render(); renderSide(); }

  if (TB) {
    TB.onChange(function () {
      var was = wasAt; wasAt = atTable();
      if (A.screen() !== 'dm') { if (was !== wasAt && A.screen() === 'dmgate') { doorSetup(); } return; }
      drawChip(); takeTurns();
      if (was && !wasAt) {                      // the table has gone from under this screen
        modalsShut();
        if (!quiet) { toast('Your table has closed. Tap “Open a table” to start a new one.'); }
      }
      if (was !== wasAt) { renderAll(); } else { refresh(); }
    });
    /* why it went, when the server says: ended by the DM on another device, or cleared away */
    if (TB.onEnd) {
      TB.onEnd(function (info) {
        if (!info || info.role !== 'dm' || A.screen() !== 'dm') { return; }
        toast('Table ' + info.code + (info.reason === 'closed' ? ' has ended.' : ' is no longer there: it may have been cleared away.') + ' Tap “Open a table” to start a new one.');
      });
    }
  }
  /* "2 min ago" has to keep up with the clock */
  setInterval(function () {
    if (A.screen() !== 'dm') { return; }
    Array.prototype.forEach.call(document.querySelectorAll('#s-dm time[data-at]'), function (t) { t.textContent = ago(Number(t.getAttribute('data-at'))); });
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
    dice: 'M12 2l9 5v10l-9 5-9-5V7zM12 2v6m0 0l6 9H6zm0 0L3 7m9 1l9-1M6 17l6 5 6-5'
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
  function triesBox(s) {
    var wrap = el('div', 'tries');
    wrap.appendChild(el('div', 'dm-h', 'If they try…'));
    s.tries.forEach(function (t) {
      var d = el('details', 'try'), sm = el('summary', '', t.try); d.appendChild(sm);
      var b = el('div', 'try-b');
      b.appendChild(line('Ask for', t.roll));
      if (t.yes) { b.appendChild(line(t.no ? 'If it works' : 'What happens', t.yes, true)); }
      if (t.no) { b.appendChild(line('If it does not', t.no, true)); }
      d.appendChild(b); wrap.appendChild(d);
    });
    if (s.otherwise) { wrap.appendChild(el('p', 'try-else', s.otherwise)); }
    return wrap;
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
    if (open && s.tries && s.tries.length) { box.appendChild(triesBox(s)); }
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
    var c = el('div', 'ai'), names = { openai: 'OpenAI', claude: 'Claude', local: 'built-in suggestion' }, titles = { try: 'They try: ', say: 'A line for ', twist: 'A twist', recap: 'Previously', bridge: 'Moving on' };
    c.id = 'fe-' + i;
    var h = el('div', 'ai-h');
    h.appendChild(el('b', '', titles[e.mode] + (e.mode === 'try' ? e.q : (e.mode === 'say' && person(e.who) ? person(e.who).name : ''))));
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
        node.appendChild(el('p', 'cover-p', ST.pitch));
        if (open) {
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
          choices(hub).forEach(function (x) {
            var b = btn('errand', '', function () { pick(x.to); }), t = el('span');
            if (x.img) { var im = el('img'); im.src = x.img; im.alt = ''; b.appendChild(im); }
            t.appendChild(el('b', '', x.title));
            if (x.where || x.who) { t.appendChild(el('small', '', [x.where, x.who].filter(Boolean).join(' · '))); }
            if (x.feel) { t.appendChild(el('small', 'feel', x.feel)); }
            b.appendChild(t); node.appendChild(b);
          });
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
    body.appendChild(c);
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
      var again = btn('btn ghost slim', 'Start a new session', function () {
        if (again.getAttribute('data-sure')) { var party = DM.party, turns = DM.turns; DM = fresh(); DM.party = party; DM.turns = turns; ui.tab = 'run'; save(); render(); }
        else { again.setAttribute('data-sure', '1'); again.textContent = 'Tap again to wipe this session'; }
      });
      tools.appendChild(again);
    }
    body.appendChild(tools);
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
      if (ui.sayFor) { send('say', v); } else if (v) { send('try', v); }
    });
    bar.appendChild(row);
    bar.appendChild(el('p', 'ask-src', { openai: 'Story help by OpenAI, with the whole adventure in mind.', claude: 'Story help by Claude, with the whole adventure in mind. The first use asks your permission.', local: 'No AI connected here, so suggestions come from the adventure’s own notes.' }[aiSource()]));
  }
  function send(mode, text) {
    if (ui.busy) { return; }
    ui.busy = true;
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
  $('dm-confirm').addEventListener('click', function (e) { if (e.target === $('dm-confirm')) { modalClose($('dm-confirm')); } });

  var TITLES = { chapters: 'The story', lookup: 'Dictionary', party: 'The party', rolls: 'Rolls' };
  function render() {
    var body = $('dm-body'), w = where(), keep = body.scrollTop;
    fitTabs();
    clear(body);
    body.className = 'scroll dm-body tab-' + ui.tab;
    $('dm-title').textContent = ui.tab === 'run' ? w.title : TITLES[ui.tab];
    $('dm-sub').textContent = ui.tab === 'run' ? [bell(), w.of > 1 ? 'Scene ' + w.n + ' of ' + w.of : ''].filter(Boolean).join(' · ') : ST.title;
    if (ui.tab === 'run') { renderRun(body); } else if (ui.tab === 'chapters') { renderChapters(body); } else if (ui.tab === 'lookup') { renderLookup(body); } else if (ui.tab === 'rolls') { rollsPanel(body); } else { renderParty(body); }
    body.scrollTop = keep;
    drawChip(); wasAt = atTable();
    drawNav();
    renderAsk();
  }
  /* The same choices are drawn twice: as tabs along the bottom of a phone and, for the story's two views,
     in the header of a wide screen, where everything else has a pane. The stylesheet shows one or the other. */
  function drawNav() {
    var tabs = $('dm-tabs'), views = $('dm-views');
    clear(tabs); clear(views);
    [['run', 'Run', ICON.run], ['chapters', 'Story', ICON.map], ['lookup', 'Dictionary', ICON.book], ['party', 'Party', ICON.party], ['rolls', 'Rolls', ICON.dice]].forEach(function (t, i) {
      [tabs, i < 2 ? views : null].forEach(function (nav) {
        if (!nav) { return; }
        var b = btn((nav === tabs ? 'dmtab' : '') + (ui.tab === t[0] ? ' on' : ''), '', function () { goTab(t[0], nav); });
        b.setAttribute('aria-pressed', ui.tab === t[0] ? 'true' : 'false'); b.appendChild(svg(t[2])); b.appendChild(el('span', '', t[1]));
        if (t[0] === 'rolls') { b.appendChild(el('i', 'dm-count')); }
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
    load(); ui.tab = 'run'; ui.entry = null;
    if (showTable) { draft.note = ''; draft.att = ''; }             // a note written for another table stays there
    ui.side = showTable || !(side === 'rolls' || side === 'dict') ? 'table' : side;
    A.go('dm'); renderAll();
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
    if (!pack) { return no('Table ' + code + ' is playing a scenario this site does not have, so it cannot be run from here.'); }
    if (!pack.adventure) { return no('Table ' + code + ' is playing “' + pack.name + '”, and that scenario has no adventure for a DM to run. There is nothing to open here.'); }
    return Promise.resolve(A.useScenario(id)).then(function () {
      if (FR.theme.id !== id) { throw new Error('gone'); }
      return FR.loadAdventure(id);
    }).then(function () { if (!take()) { throw new Error('gone'); } }).catch(function () {
      return no('“' + pack.name + '”, the scenario table ' + code + ' is playing, could not be loaded. Check your connection and try again.');
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
  $('dm-exit').addEventListener('click', function () { if (Voice.tts && Voice.tts.active()) { Voice.tts.stop().catch(function () { /* quiet */ }); } modalsShut(); A.go('title'); });
  FR.dm = { state: function () { return DM; }, prompt: prompt, render: render };
})();
