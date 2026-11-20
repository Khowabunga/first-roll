/* First Roll: the DM's side. Turns FR.STORY into a scrolling session the DM can read
   from, records what happened, and asks an AI co-storyteller to bend the plan when the
   players go off-script. It never tracks hit points or numbers: only the story. */
(function () {
  'use strict';
  var A = FR.app, $ = A.$, el = A.el, clear = A.clear, ST = FR.STORY;
  var KEY = 'firstroll.dm.' + ST.id + '.v1';
  var DM = fresh();
  var ui = { tab: 'run', lookup: 'all', q: '', busy: false, sayFor: null, painting: false };

  function fresh() { return { feed: [{ k: 'cover' }], flags: {}, order: [], party: [], signed: '' }; }
  function save() { try { A.store.set(KEY, JSON.stringify(DM)); } catch (e) { /* storage full: the session still runs */ } }
  function load() {
    try { var d = JSON.parse(A.store.get(KEY) || 'null'); if (d && d.feed && d.feed.length) { DM = d; DM.flags = DM.flags || {}; DM.order = DM.order || []; DM.party = DM.party || []; DM.feed = DM.feed.filter(function (e) { return !e.wait && !(e.k === 'pic' && !e.url && !e.err && !pics[e.id]); }); } } catch (e) { /* start fresh */ }
  }

  /* ---------- small lookups ---------- */
  var person = function (id) { return ST.people.filter(function (p) { return p.id === id; })[0]; };
  var chapter = function (id) { return ST.chapters[id]; };
  var ERR = ['laugh', 'snow', 'coal'];
  var flagOf = { laugh: 'laugh', snow: 'flake', coal: 'coal' };
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
  function sceneOf(e) { return e.k === 'bridge' ? ST.bridges[e.i] : chapter(e.ch).scenes[e.sc]; }
  function where() {              // chapter id and scene object for the AI and the header
    for (var i = DM.feed.length - 1; i >= 0; i--) {
      var e = DM.feed[i];
      if (e.k === 'scene') { return { ch: e.ch, title: chapter(e.ch).title, goal: chapter(e.ch).goal, scene: chapter(e.ch).scenes[e.sc], n: e.sc + 1, of: chapter(e.ch).scenes.length }; }
      if (e.k === 'bridge') { return { ch: 'bridge', title: ST.bridges[e.i].title, goal: 'A short interlude between ingredients.', scene: ST.bridges[e.i], n: 1, of: 1 }; }
      if (e.k === 'hub') { return { ch: 'hub', title: 'Where next?', goal: 'The party chooses which ingredient to fetch.', scene: null, n: 0, of: 0 }; }
    }
    return { ch: 'cover', title: ST.title, goal: '', scene: null, n: 0, of: 0 };
  }
  function bell() {
    var done = DM.order.filter(function (c) { return DM.feed.some(function (e) { return e.k === 'wrap' && e.ch === c; }); }).length, w = where();
    if (DM.feed.some(function (e) { return e.k === 'chapter' && e.ch === 'midnight'; })) { return ST.bells.midnight; }
    if (DM.feed.some(function (e) { return e.k === 'chapter' && e.ch === 'finale'; })) { return ST.bells.finale; }
    if (w.ch === 'cover') { return ''; }
    var bridges = DM.feed.filter(function (e) { return e.k === 'bridge'; }).length;
    return bridges >= 2 ? ST.bells.second : (bridges === 1 ? ST.bells.first : (done >= 0 ? ST.bells.arrival : ''));
  }

  /* ---------- the engine: what follows what ---------- */
  function push(e) { DM.feed.push(e); return DM.feed.length - 1; }
  function begin() { var i = push({ k: 'chapter', ch: 'arrival' }); push({ k: 'scene', ch: 'arrival', sc: 0 }); done(i); }
  function done(scrollTo) { save(); render(); if (scrollTo !== undefined) { scrollToEntry(scrollTo); } }
  function choose(entry, o) {
    var sets = o.sets || {};
    Object.keys(sets).forEach(function (k) { DM.flags[k] = sets[k]; });
    push({ k: 'out', label: o.label, log: o.log || o.label });
    var first;
    if (entry.k === 'bridge') { first = push({ k: 'hub' }); return done(first); }
    var ch = chapter(entry.ch), next = entry.sc + 1 + (o.skip || 0);
    if (next < ch.scenes.length) { first = push({ k: 'scene', ch: entry.ch, sc: next }); return done(first); }
    endChapter(entry.ch);
  }
  function endChapter(id) {
    var first;
    if (id === 'arrival') { first = push({ k: 'hub' }); return done(first); }
    if (ERR.indexOf(id) >= 0) {
      first = push({ k: 'wrap', ch: id });
      var n = DM.order.length;
      if (n === 1) { push({ k: 'bridge', i: 0 }); }
      else if (n === 2) { push({ k: 'bridge', i: 1 }); }
      else { push({ k: 'chapter', ch: 'finale' }); push({ k: 'scene', ch: 'finale', sc: 0 }); }
      return done(first);
    }
    if (id === 'finale') { first = push({ k: 'chapter', ch: 'midnight' }); push({ k: 'scene', ch: 'midnight', sc: 0 }); return done(first); }
    first = push({ k: 'end' }); done(first);
  }
  function pick(id) {
    DM.order.push(id);
    push({ k: 'pick', ch: id });
    var first = push({ k: 'chapter', ch: id }); push({ k: 'scene', ch: id, sc: 0 });
    done(first);
  }
  function jumpToFinale() {
    push({ k: 'out', label: 'Skipped ahead to the finale', log: 'Short on time, the DM moved the story on to the bakery.' });
    var first = push({ k: 'chapter', ch: 'finale' }); push({ k: 'scene', ch: 'finale', sc: 0 });
    ui.tab = 'run'; done(first);
  }

  /* ---------- everything the AI is told ---------- */
  function bible() {
    var t = [];
    t.push('ADVENTURE: ' + ST.title + '. ' + ST.pitch);
    t.push('WHAT IS REALLY GOING ON:\n- ' + ST.truth.join('\n- '));
    t.push('PEOPLE:\n' + ST.people.map(function (p) { return '- ' + p.full + ' (' + p.role + '). Found: ' + p.where + '. Voice: ' + p.voice + ' Wants: ' + p.wants + ' Secret: ' + p.secret; }).join('\n'));
    t.push('PLACES:\n' + ST.places.map(function (p) { return '- ' + p.name + ': ' + p.blurb; }).join('\n'));
    t.push('THINGS:\n' + ST.things.map(function (p) { return '- ' + p.name + ': ' + p.blurb; }).join('\n'));
    t.push('PLANNED CHAPTERS:\n' + ['arrival', 'laugh', 'snow', 'coal', 'finale', 'midnight'].map(function (id) { var c = chapter(id); return '- ' + c.title + ': ' + c.goal; }).join('\n') +
      '\nThe three ingredient chapters can come in any order. Between them: at nine bells the town starts sneezing and the party visits Santa; at ten bells the snowman fountain’s nose runs and Dot Dunkwell brings news.');
    return t.join('\n\n');
  }
  function happened() {
    var out = [];
    DM.feed.forEach(function (e) {
      if (e.k === 'out' && e.log) { out.push(e.log); }
      if (e.k === 'pick') { out.push('The party set off for ' + ST.errands[e.ch].title.toLowerCase() + ' at ' + ST.errands[e.ch].where + '.'); }
      if (e.k === 'ai' && e.mode === 'try' && e.res) { out.push('They tried: ' + e.q + '. ' + (e.res === 'yes' ? 'It worked: ' + e.a.yes : 'It did not work: ' + e.a.no)); }
      if (e.k === 'ai' && e.mode === 'twist' && e.a.read) { out.push('Twist: ' + e.a.read); }
    });
    return out.slice(-16);
  }
  function prompt(mode, input) {
    var w = where(), s = w.scene, f = DM.flags;
    var system = 'You are the co-storyteller for a Dungeon Master running a funny, warm, family-friendly Christmas one-shot at the table right now. ' +
      'Stay inside the story bible below and never contradict it or what has already happened. Nobody gets hurt: trouble means icing, tinsel, snow and embarrassment. ' +
      'The plot is already planned. Your job is to bend it a little so the players’ ideas matter, then point back toward the goal of the current scene. Do not resolve the chapter for them and do not skip ahead. ' +
      'Read-aloud text is spoken to the players as “you”, present tense, two or three short sentences, vivid, funny, easy to say out loud, no game terms. ' +
      'Rolls use a d20 plus a skill (Athletics, Acrobatics, Sleight of Hand, Stealth, Arcana, History, Investigation, Nature, Religion, Animal Handling, Insight, Medicine, Perception, Survival, Deception, Intimidation, Performance, Persuasion) at easy (10), medium (13) or hard (16).\n\n' + bible();
    var party = partyList().filter(function (p) { return p.who || p.name; }).map(function (p) { return (p.name || 'A baker') + (p.race || p.cls ? ', a ' + [p.race, p.cls].filter(Boolean).join(' ') : '') + (p.who ? ' (played by ' + p.who + ')' : ''); });
    var user = [];
    if (party.length) { user.push('THE PARTY: ' + party.join('; ') + '.'); }
    user.push('THE CLOCK: ' + (bell() || 'not started') + '. The sleigh leaves at midnight.');
    var hp = happened();
    user.push('WHAT HAS HAPPENED SO FAR:\n' + (hp.length ? '- ' + hp.join('\n- ') : '- Nothing yet.'));
    var st = [];
    if (f.laugh) { st.push('the laugh: ' + { pure: 'a whole belly laugh', partial: 'only a small one', none: 'none, just a Hmph' }[f.laugh]); }
    if (f.flake) { st.push('the snowflake: ' + { pure: 'perfect', partial: 'slightly used', none: 'only one from Pip’s antlers' }[f.flake]); }
    if (f.coal) { st.push('the coal: ' + { pure: 'truly forgiven, turned to sugar', partial: 'half forgiven', none: 'still unforgiven coal' }[f.coal]); }
    if (f.ally_grumble) { st.push('Grumbleknot is an ally'); }
    if (f.ally_thunder) { st.push('Dame Thunderhoof flies again and is an ally'); }
    if (f.gift) { st.push('Mrs. Claus gave them ' + { cocoa: 'a flask of cocoa', key: 'Santa’s spare key', scarf: 'a forty-foot scarf' }[f.gift]); }
    if (f.knows_fizz) { st.push('they know Fizzwick is the culprit'); }
    if (st.length) { user.push('INGREDIENTS AND ALLIES: ' + st.join('; ') + '.'); }
    user.push('NOW: chapter “' + w.title + '”. Goal: ' + w.goal + (s ? '\nScene “' + s.title + '”.' + (s.read && s.read.length ? ' The players were just told: ' + s.read.join(' ') : '') + (s.dm && s.dm.length ? '\nDM notes for this scene: ' + s.dm.join(' ') : '') : ''));
    var ask = {
      try: 'The players try this: “' + input + '”. Fill "ask" (the roll to call for, written exactly like "Acrobatics, medium (13)", or "No roll needed"), "yes" (read-aloud if it works), "no" (read-aloud if it does not: funny, failing forward, never a dead end) and "note" (for the DM, at most two short sentences: how this bends the plan or what to remember later). Leave "read" empty.',
      say: 'The DM needs words for ' + (ui.sayFor ? person(ui.sayFor).full : 'a character in the scene') + (input ? ', about: “' + input + '”' : ', reacting to what just happened') + '. Put two or three separate short lines in their exact voice in "read", one per line. Put one acting tip in "note". Leave the other fields empty.',
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
    var w = where(), s = w.scene, pk = FR.pick;
    if (mode === 'say') {
      var p = person(ui.sayFor) || person((s && s.cast && s.cast[0]) || 'crumb');
      var ls = p.lines.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 2);
      return { ask: '', yes: '', no: '', read: ls.join('\n'), note: 'Voice: ' + p.voice };
    }
    if (mode === 'twist') {
      return { ask: '', yes: '', no: '', note: 'Keep it to a minute or two, then return to the scene.', read: pk([
        'A cart of cookies trundles past with nobody pushing it. One cookie hops off and rolls, quite deliberately, towards the nearest pocket.',
        'Dot Dunkwell appears at exactly the wrong moment, autograph book held out, hiccuping like a sleigh bell.',
        'The clock tower clears its throat and strikes a quarter past. Somewhere, a very large sneeze answers it.',
        'A snowball the size of a pumpkin rolls down the lane, getting bigger. It has already collected two elves and a wreath.',
        'Every lantern on the street flickers at once. When they steady, a small trench-coated figure is narrating from a doorway: “They were running out of time. They knew it. The snow knew it.”',
        'A soot sprite has followed you. It has untied something. You are not yet sure what.']) };
    }
    if (mode === 'recap' || mode === 'bridge') {
      var hp = happened().slice(-5);
      return { ask: '', yes: '', no: '', read: hp.length ? 'So far: ' + hp.join(' ') : 'The bakers have only just arrived. Everything is still to come.', note: 'Built-in recap: your own words will be better.' };
    }
    return { ask: 'Whichever skill fits best, medium (13)',
      yes: pk(['It works, and for one shining moment everything goes exactly to plan. A passing elf drops his cocoa in admiration.', 'It works better than it had any right to. Something useful comes loose because of it.', 'It works. Not gracefully, but it works, and somebody nearby starts to clap.']),
      no: pk(['It does not work, but it makes a tremendous noise, and help turns up to see what the noise was.', 'It fails in the funniest way available. Then a second way in presents itself.', 'It does not work, and now you are covered in snow. From down here, though, you notice something you had missed.']),
      read: '', note: (s && s.else) ? s.else : 'Say yes if you can. Then steer back to the goal: ' + w.goal };
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
  var TB = FR.table || null, pass = '', pics = {}, toastT = 0, tableLive = null, wasAt = false;
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
  function playerRows(list) {
    clear(list);
    var ps = TB ? TB.players() : [];
    if (!ps.length) { list.appendChild(el('p', 'cover-p', 'Nobody yet. Players appear here as they join.')); }
    ps.forEach(function (p) {
      var r = el('div', 'tb-p'), t = el('span'), c = p.char;
      if (p.portrait) { var im = el('img'); im.src = p.portrait; im.alt = ''; r.appendChild(im); } else { r.appendChild(el('i', 'lk-dot')); }
      t.appendChild(el('b', '', p.name)); t.appendChild(el('small', '', c && c.cls ? (c.name ? c.name + ', ' : 'Not named yet: ') + [c.race, c.cls].filter(Boolean).join(' ') : 'Still answering the questions'));
      r.appendChild(t); list.appendChild(r);
    });
  }
  function qr(text) {
    if (typeof window.qrcode !== 'function') { return null; }
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); var d = el('div', 'tb-qr'); d.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); d.setAttribute('role', 'img'); d.setAttribute('aria-label', 'A code to scan. It opens the app with your table code filled in.'); return d; } catch (e) { return null; }
  }
  function drawChip() {
    var c = $('dm-table'), can = !!(TB && TB.can());
    c.hidden = !can; if (!can) { return; }
    clear(c);
    if (atTable()) { var n = TB.players().length; c.appendChild(el('b', '', TB.code())); c.appendChild(el('span', '', String(n))); c.setAttribute('aria-label', 'Table ' + TB.code().split('').join(' ') + ', ' + n + (n === 1 ? ' player' : ' players') + '. Open the table.'); }
    else { c.appendChild(el('em', '', 'Open a table')); c.removeAttribute('aria-label'); }
  }
  function openTable() {
    var sh = $('dm-sheet'), box = $('dm-sheet-b'), link = TB.link(); clear(box);
    box.appendChild(el('h3', 'sh-t', 'Your table'));
    var top = el('div', 'tb-top'), code = el('div', 'tb-code'), q = qr(link);
    code.appendChild(el('small', '', 'Table code')); code.appendChild(el('b', '', TB.code()));
    code.appendChild(el('p', '', 'Players open this web address on their own phones' + (q ? ', or scan the square' : '') + '. Then they tap Begin and type the code.'));
    top.appendChild(code); if (q) { top.appendChild(q); } box.appendChild(top);
    var row = el('div', 'tb-link'), inp = el('input', 'field'); inp.type = 'text'; inp.readOnly = true; inp.value = link; inp.setAttribute('aria-label', 'Link for players'); inp.addEventListener('focus', function () { inp.select(); });
    row.appendChild(inp);
    row.appendChild(btn('btn ghost slim', navigator.share ? 'Share' : 'Copy', function () {
      var copy = function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Link copied.'); }).catch(function () { inp.focus(); inp.select(); toast('Press and hold the link to copy it.'); }); };
      if (navigator.share) { navigator.share({ title: 'First Roll', text: 'Join my table. The code is ' + TB.code() + '.', url: link }).catch(function (e) { if (!e || e.name !== 'AbortError') { copy(); } }); } else { copy(); }
    }));
    box.appendChild(row);
    box.appendChild(el('div', 'dm-h', 'At the table'));
    var list = el('div', 'tb-list'); box.appendChild(list);
    box.appendChild(el('div', 'dm-h', 'A note for everyone'));
    var ta = el('textarea', 'field area'); ta.id = 'tb-note'; ta.rows = 3; ta.maxLength = 600; ta.placeholder = 'A clue, a letter, a secret message…'; ta.setAttribute('aria-label', 'A note for every player');
    box.appendChild(ta);
    var att = '', prev = el('img', 'tb-att'), pickF = el('input'); prev.hidden = true; prev.alt = 'The picture you are about to send'; pickF.type = 'file'; pickF.accept = 'image/*'; pickF.hidden = true; pickF.id = 'tb-file';
    var addB = btn('btn ghost slim', 'Add a picture from this phone', function () { pickF.click(); });
    pickF.addEventListener('change', function () {
      var f = pickF.files && pickF.files[0]; if (!f) { return; }
      shrink(f).then(function (d) { att = d; prev.src = d; prev.hidden = false; addB.textContent = 'Choose a different picture'; }).catch(function () { toast('That picture could not be read. Try another.'); });
    });
    box.appendChild(prev); box.appendChild(pickF); box.appendChild(addB);
    var sb = btn('btn wax slim', 'Send to the table', function () {
      var v = ta.value.trim(); if (!v && !att) { ta.focus(); return; }
      sb.disabled = true;
      showTable({ title: v ? 'A note from your DM' : '', text: v, image: att }).then(function (ok) { sb.disabled = false; if (ok) { ta.value = ''; att = ''; prev.hidden = true; pickF.value = ''; addB.textContent = 'Add a picture from this phone'; } });
    });
    box.appendChild(sb);
    box.appendChild(el('div', 'dm-h', 'Shown so far'));
    var sent = el('div', 'tb-list'); box.appendChild(sent);
    tableLive = function () {
      playerRows(list); clear(sent);
      var fd = TB.feed().slice().reverse();
      if (!fd.length) { sent.appendChild(el('p', 'cover-p', 'Nothing yet. Look for “Show the table” under pictures in the story and in the dictionary.')); }
      fd.forEach(function (f) {
        var r = el('div', 'tb-p'), t = el('span');
        if (f.img) { var im = el('img', 'sq'); im.src = f.img; im.alt = ''; r.appendChild(im); } else { r.appendChild(el('i', 'lk-dot note')); }
        t.appendChild(el('b', '', f.title || (f.img ? 'A picture' : 'A note'))); if (f.text) { t.appendChild(el('small', '', f.text)); }
        r.appendChild(t); sent.appendChild(r);
      });
    };
    tableLive();
    sh.hidden = false; box.scrollTop = 0; $('dm-sheet-x').focus();
  }
  /* make a phone photo small enough to send */
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
  function reopen() {
    if (TB.needsPasscode() && !pass) { doorSetup(); A.go('dmgate'); return; }
    TB.open(pass).then(function () { render(); openTable(); }).catch(function (e) { toast((e && e.message) || 'Could not open a table.'); });
  }
  $('dm-table').addEventListener('click', function () { if (atTable()) { openTable(); } else { reopen(); } });
  if (TB) {
    TB.onChange(function () {
      if (A.screen() !== 'dm') { wasAt = atTable(); return; }
      drawChip();
      if (wasAt && !atTable()) { toast('Your table has closed. Tap “Open a table” to start a new one.'); }
      wasAt = atTable();
      if (tableLive && !$('dm-sheet').hidden && atTable()) { tableLive(); }
      var pl = document.getElementById('party-live'); if (pl) { playerRows(pl); }
    });
  }

  /* ---------- painting: a picture of the scene, or of what just happened ---------- */
  function lastScene() { for (var i = DM.feed.length - 1; i >= 0; i--) { var e = DM.feed[i]; if (e.k === 'scene' || e.k === 'bridge') { return e; } if (e.k === 'hub') { return null; } } return null; }
  function sceneWords(e) { var s = sceneOf(e); if (e.k === 'scene' && e.ch === 'midnight') { return chapter('midnight').endings[DM.flags.batch || ST.ending(DM.flags)].join(' '); } return (s.read || []).join(' '); }
  function placeNow() {
    var id = '';
    for (var i = DM.feed.length - 1; i >= 0 && !id; i--) { var e = DM.feed[i]; if (e.k === 'scene') { id = chapter(e.ch).place; } else if (e.k === 'bridge') { id = ST.bridges[e.i].place; } }
    return ST.places.filter(function (p) { return p.id === id; })[0] || ST.places[0];
  }
  function paintBrief(what, moment) {
    var w = where(), s = w.scene, pl = placeNow(), ids = {};
    ((s && s.cast) || []).forEach(function (id) { ids[id] = 1; });
    ST.people.forEach(function (p) { if (moment.indexOf(p.name) >= 0 || moment.indexOf(p.full) >= 0) { ids[p.id] = 1; } });
    var folk = Object.keys(ids).map(person).filter(Boolean);
    var heroes = partyList().filter(function (p) { return p.name || p.race || p.cls; }).slice(0, 5).map(function (p) { return '- ' + (p.name || 'A baker') + ': ' + (p.look || ('a ' + [p.race, p.cls].filter(Boolean).join(' ') + ', once an ordinary home baker')); });
    var system = 'You write image prompts for the illustrator of a funny, warm, family Christmas adventure at the North Pole. From the notes, describe ONE frozen moment as a single wide picture. Start with the place, then who is in it and exactly what each one looks like, what they are doing, then the light and the mood. ' +
      'Describe everyone by their looks from the notes, not by name alone. If heroes are listed they are in the picture: show up to four of them, each matching their look. Nobody is hurt or frightened: trouble is icing, tinsel, snow and embarrassment. No writing, lettering or speech bubbles anywhere in the picture. ' +
      'Reply with one paragraph of 80 to 120 words of plain visual description and nothing else.';
    var user = 'WHERE THIS CHAPTER HAPPENS: ' + pl.name + '. ' + pl.blurb + (pl.senses ? ' ' + pl.senses : '') + '\n(If the moment below is plainly somewhere else, paint that place instead.)' +
      (folk.length ? '\n\nPEOPLE WHO MAY BE IN IT:\n' + folk.map(function (p) { return '- ' + p.full + ': ' + p.look; }).join('\n') : '') +
      (heroes.length ? '\n\nTHE HEROES:\n' + heroes.join('\n') : '\n\nTHE HEROES: a small team of home bakers, each turned into a different Christmas creature by a magic cookie.') +
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
      return A.image(e.brief + ' ' + ST.sceneStyle, { size: '1536x1024', keep: atTable() });
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
    send: 'M4 12l16-8-6 16-3-7z', run: 'M5 4h11l3 3v13H5zM9 10h6M9 14h6', map: 'M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14', book: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10', party: 'M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5'
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
      var b = btn('cast-chip', '', function () { openSheet('people', id); }), i = el('img'); i.src = p.img; i.alt = '';
      b.appendChild(i); b.appendChild(el('span', '', p.name)); r.appendChild(b);
    });
    return r;
  }
  function triesBox(s) {
    var wrap = el('div', 'tries');
    wrap.appendChild(el('div', 'dm-h', 'If they try…'));
    s.tries.forEach(function (t) {
      var d = el('details', 'try'), sm = el('summary', '', t.t); d.appendChild(sm);
      var b = el('div', 'try-b');
      b.appendChild(line('Ask for', t.ask));
      if (t.yes) { b.appendChild(line(t.no ? 'If it works' : 'What happens', t.yes, true)); }
      if (t.no) { b.appendChild(line('If it does not', t.no, true)); }
      d.appendChild(b); wrap.appendChild(d);
    });
    if (s.else) { wrap.appendChild(el('p', 'try-else', s.else)); }
    return wrap;
  }
  function line(k, v, say) { var p = el('p', say ? 'kv say' : 'kv'); p.appendChild(el('b', '', k + ' ')); p.appendChild(document.createTextNode(v)); return p; }

  function drawScene(entry, i, open) {
    var s = sceneOf(entry), box = el('section', 'scene'), f = DM.flags;
    box.id = 'fe-' + i;
    if (entry.k === 'bridge') { box.appendChild(banner(s.title, s.bell, s.img, s.time, 'An interlude')); if (atTable()) { box.appendChild(showBtn({ title: s.title, image: s.img }, 'Show the table this picture')); } }
    else { box.appendChild(el('h3', 'scene-t', s.title)); }
    var paras = (s.read || []).slice();
    if (entry.k === 'scene' && entry.ch === 'midnight') {
      var kind = f.batch || ST.ending(f), ch = chapter('midnight');
      paras = ch.endings[kind].slice();
      ch.extras.forEach(function (x) { if (x.when(f, DM.order)) { paras.push(x.read); } });
      if (open) {
        var pickEnd = el('div', 'endpick'); pickEnd.appendChild(el('div', 'dm-h', 'Which batch did they bake?'));
        var row = el('div', 'seg3');
        [['perfect', 'Perfect'], ['good', 'Good'], ['scrappy', 'Scrappy']].forEach(function (o) {
          var b = btn(kind === o[0] ? 'on' : '', o[1], function () { DM.flags.batch = o[0]; save(); render(); }); b.setAttribute('aria-pressed', kind === o[0] ? 'true' : 'false'); row.appendChild(b);
        });
        pickEnd.appendChild(row); box.appendChild(pickEnd);
      }
    }
    if (s.dm && s.dm.length && entry.ch === 'arrival' && entry.sc === 0) { box.appendChild(notes(s.dm)); }
    if (paras.length) { box.appendChild(readBox(paras)); }
    (s.also || []).forEach(function (x) { if (x.when(f, DM.order)) { box.appendChild(readBox([x.read], 'Read aloud, because of earlier')); } });
    if (s.dm && s.dm.length && !(entry.ch === 'arrival' && entry.sc === 0)) { box.appendChild(notes(s.dm)); }
    if (s.cast && s.cast.length) { box.appendChild(castRow(s.cast)); }
    if (open && s.tries && s.tries.length) { box.appendChild(triesBox(s)); }
    return box;
  }
  function banner(title, bellText, img, time, kicker) {
    var b = el('div', 'chap'), im = el('img'); im.src = img; im.alt = ''; b.appendChild(im);
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
    h.appendChild(el('b', '', titles[e.mode] + (e.mode === 'try' ? e.q : (e.mode === 'say' && e.who ? person(e.who).name : ''))));
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
    var cur = current(), f = DM.flags;
    DM.feed.forEach(function (e, i) {
      var open = !!cur && cur.i === i, node, ch;
      if (e.k === 'cover') {
        node = el('section', 'cover'); node.id = 'fe-' + i;
        node.appendChild(banner(ST.title, ST.length, ST.cover, ST.table, ST.kicker));
        node.appendChild(el('p', 'cover-p', ST.pitch));
        if (open) {
          node.appendChild(el('div', 'dm-h', 'How to run this'));
          node.appendChild(notes(ST.howto));
          var o = el('div', 'outs'); o.appendChild(btn('btn wax', 'Begin the story', begin)); node.appendChild(o);
        }
      } else if (e.k === 'chapter') {
        ch = chapter(e.ch); node = el('section', 'chap-wrap'); node.id = 'fe-' + i;
        node.appendChild(banner(ch.title, ch.bell || bellAt(i), ch.img, ch.time));
        if (atTable()) { node.appendChild(showBtn({ title: ch.title, image: ch.img }, 'Show the table this picture')); }
        node.appendChild(line('Goal', ch.goal));
        (ch.perks || []).forEach(function (p) { if (p.when(f, DM.order)) { var pk = el('div', 'perk'); pk.appendChild(el('b', '', 'Because of earlier ')); pk.appendChild(document.createTextNode(p.text)); node.appendChild(pk); } });
      } else if (e.k === 'scene' || e.k === 'bridge') {
        node = drawScene(e, i, open);
      } else if (e.k === 'out') {
        node = el('p', 'outdone'); node.id = 'fe-' + i; node.appendChild(el('b', '', 'What happened ')); node.appendChild(document.createTextNode(e.label));
        if (A.isLive() && e.log) { node.appendChild(paintBtn(e.label, e.log)); }
      } else if (e.k === 'wrap') {
        ch = chapter(e.ch); var v = f[flagOf[e.ch]] || 'none', ps = [ch.wrap[v]];
        if (e.ch === 'snow' && f.ally_thunder && ch.wrap.dame) { ps.push(ch.wrap.dame); }
        node = el('section', 'scene'); node.id = 'fe-' + i; node.appendChild(el('h3', 'scene-t', 'Leaving')); node.appendChild(readBox(ps));
      } else if (e.k === 'hub') {
        node = el('section', 'hub'); node.id = 'fe-' + i;
        node.appendChild(el('h3', 'scene-t', DM.order.length ? 'Where next?' : 'Where first?'));
        if (!hasAnswer(i)) {
          node.appendChild(el('p', 'cover-p', 'Let the players choose. The order changes what they bring to the later chapters.'));
          ERR.filter(function (id) { return DM.order.indexOf(id) < 0; }).forEach(function (id) {
            var x = ST.errands[id], b = btn('errand', '', function () { pick(id); }), im = el('img'), t = el('span'); im.src = x.img; im.alt = '';
            t.appendChild(el('b', '', x.title)); t.appendChild(el('small', '', x.where + ' · ' + x.who)); t.appendChild(el('small', 'feel', x.feel));
            b.appendChild(im); b.appendChild(t); node.appendChild(b);
          });
        }
      } else if (e.k === 'pick') {
        node = el('p', 'outdone'); node.id = 'fe-' + i; node.appendChild(el('b', '', 'They chose ')); node.appendChild(document.createTextNode(ST.errands[e.ch].title + ', at ' + ST.errands[e.ch].where));
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
  function bellAt(i) { var b = DM.feed.slice(0, i).filter(function (e) { return e.k === 'bridge'; }).length; return [ST.bells.arrival, ST.bells.first, ST.bells.second][Math.min(2, b)]; }

  function renderChapters(body) {
    var f = DM.flags, started = DM.feed.length > 1;
    var c = el('section', 'card'); c.appendChild(el('h3', 'scene-t', ST.title)); c.appendChild(el('p', 'cover-p', ST.pitch));
    var d = el('details', 'try'); d.appendChild(el('summary', '', 'The truth of it (spoilers)')); var db = el('div', 'try-b'); db.appendChild(notes(ST.truth)); d.appendChild(db); c.appendChild(d);
    var d2 = el('details', 'try'); d2.appendChild(el('summary', '', 'How to run this')); var d2b = el('div', 'try-b'); d2b.appendChild(notes(ST.howto)); d2.appendChild(d2b); c.appendChild(d2);
    body.appendChild(c);
    body.appendChild(el('div', 'dm-h pad-h', 'Chapters'));
    var words = { laugh: { pure: 'A whole belly laugh', partial: 'A small laugh', none: 'Only a Hmph' }, flake: { pure: 'A perfect snowflake', partial: 'A slightly used snowflake', none: 'One from Pip’s antlers' }, coal: { pure: 'Forgiven, turned to sugar', partial: 'Half forgiven', none: 'Still plain coal' } };
    var order = ['arrival'].concat(DM.order).concat(ERR.filter(function (x) { return DM.order.indexOf(x) < 0; })).concat(['finale', 'midnight']);
    order.forEach(function (id) {
      var ch = chapter(id), ix = -1; DM.feed.forEach(function (e, i) { if (e.k === 'chapter' && e.ch === id) { ix = i; } });
      var over = ix >= 0 && DM.feed.slice(ix).some(function (e) { return (e.k === 'chapter' && e.ch !== id) || e.k === 'wrap' || e.k === 'hub' || e.k === 'end'; });
      var b = btn('chrow' + (ix >= 0 ? (over ? ' done' : ' now') : ''), '', function () { if (ix >= 0) { ui.tab = 'run'; render(); scrollToEntry(ix); } }), im = el('img'), t = el('span'); im.src = ch.img; im.alt = '';
      var sub = ix < 0 ? ch.time : (over ? 'Done' : 'In play');
      if (flagOf[id] && f[flagOf[id]]) { sub = words[flagOf[id]][f[flagOf[id]]]; }
      t.appendChild(el('b', '', ch.title)); t.appendChild(el('small', '', sub)); b.appendChild(im); b.appendChild(t); b.disabled = ix < 0;
      body.appendChild(b);
    });
    var tools = el('div', 'tools pad-h');
    var cur = current(), inFinale = DM.feed.some(function (e) { return e.k === 'chapter' && e.ch === 'finale'; });
    if (started && !inFinale && cur && (cur.e.k === 'hub' || cur.e.k === 'bridge')) { tools.appendChild(btn('btn ghost slim', 'Short on time? Jump to the finale', jumpToFinale)); }
    if (started) {
      var again = btn('btn ghost slim', 'Start a new session', function () {
        if (again.getAttribute('data-sure')) { var party = DM.party; DM = fresh(); DM.party = party; ui.tab = 'run'; save(); render(); }
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
      var b = btn(ui.lookup === o[0] ? 'on' : '', o[1], function () { ui.lookup = o[0]; render(); }); b.setAttribute('aria-pressed', ui.lookup === o[0] ? 'true' : 'false'); seg.appendChild(b);
    });
    top.appendChild(seg); body.appendChild(top);
    var list = el('div', 'lk-list'); body.appendChild(list);
    function drawList() {
      clear(list);
      var q = ui.q.trim().toLowerCase(), n = 0;
      [['people', ST.people], ['places', ST.places], ['things', ST.things]].forEach(function (g) {
        if (ui.lookup !== 'all' && ui.lookup !== g[0]) { return; }
        g[1].forEach(function (x) {
          var hay = [x.name, x.full, x.role, x.blurb, x.where, x.look, x.secret, x.wants].join(' ').toLowerCase();
          if (q && hay.indexOf(q) < 0) { return; }
          var b = btn('lk', '', function () { openSheet(g[0], x.id); }), t = el('span');
          if (x.img) { var im = el('img'); im.src = x.img; im.alt = ''; b.appendChild(im); } else { b.appendChild(el('i', 'lk-dot')); }
          t.appendChild(el('b', '', x.name)); t.appendChild(el('small', '', x.role || x.blurb)); b.appendChild(t); list.appendChild(b); n++;
        });
      });
      if (!n) { list.appendChild(el('p', 'cover-p pad-h', 'Nothing by that name in this story. Try a shorter word.')); }
    }
    drawList();
  }

  function renderParty(body) {
    var c = el('section', 'card');
    c.appendChild(el('h3', 'scene-t', 'Who is at the table?'));
    if (atTable()) {
      c.appendChild(el('p', 'cover-p', 'Players who join table ' + TB.code() + ' on their phones appear here by themselves, with the characters they made. The story helper and the painter use them.'));
      var live = el('div', 'tb-list'); live.id = 'party-live'; playerRows(live); c.appendChild(live);
      c.appendChild(el('div', 'dm-h', 'Anyone playing without a phone'));
    } else { c.appendChild(el('p', 'cover-p', 'Optional. Add your players and what the cookie turned them into, and the story helper will use their names.')); }
    var th = FR.THEMES.northpole, races = Object.keys(th.races), classes = Object.keys(th.classes);
    DM.party.forEach(function (p, i) {
      var r = el('div', 'prow'), mk = function (key, ph, label) { var inp = el('input', 'field'); inp.type = 'text'; inp.value = p[key] || ''; inp.placeholder = ph; inp.setAttribute('aria-label', label + ' ' + (i + 1)); inp.id = 'pt-' + key + '-' + i; inp.addEventListener('change', function () { p[key] = inp.value.trim(); save(); }); return inp; };
      var sel = function (key, opts, label) { var s = el('select', 'field'); s.setAttribute('aria-label', label + ' ' + (i + 1)); s.id = 'pt-' + key + '-' + i; var o0 = el('option', '', label); o0.value = ''; s.appendChild(o0); opts.forEach(function (o) { var op = el('option', '', o); op.value = o; if (p[key] === o) { op.selected = true; } s.appendChild(op); }); s.addEventListener('change', function () { p[key] = s.value; save(); }); return s; };
      r.appendChild(mk('who', 'Player', 'Player')); r.appendChild(mk('name', 'Character name', 'Character name'));
      r.appendChild(sel('race', races, 'Form')); r.appendChild(sel('cls', classes, 'Calling'));
      var x = btn('icon small', '', function () { DM.party.splice(i, 1); save(); render(); }); x.setAttribute('aria-label', 'Remove player ' + (i + 1)); x.appendChild(svg('M6 6l12 12M18 6L6 18')); r.appendChild(x);
      c.appendChild(r);
    });
    if (DM.party.length < 6) { c.appendChild(btn('btn ghost slim', 'Add a player', function () { DM.party.push({ who: '', name: '', race: '', cls: '' }); save(); render(); })); }
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
    cast.forEach(function (id) { var p = person(id); chips.appendChild(btn('chipd' + (ui.sayFor === id ? ' on' : ''), p.name + ' says…', function () { ui.sayFor = ui.sayFor === id ? null : id; renderAsk(); var box = $('dm-input'); if (box) { box.focus(); } })); });
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

  /* dossier sheet */
  function openSheet(kind, id) {
    var x = ST[kind].filter(function (p) { return p.id === id; })[0], sh = $('dm-sheet'), box = $('dm-sheet-b');
    if (!x) { return; }
    clear(box);
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
    tableLive = null; sh.hidden = false; box.scrollTop = 0; $('dm-sheet-x').focus();
  }
  $('dm-sheet-x').addEventListener('click', function () { $('dm-sheet').hidden = true; });
  $('dm-sheet').addEventListener('click', function (e) { if (e.target === $('dm-sheet')) { $('dm-sheet').hidden = true; } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('dm-sheet').hidden) { $('dm-sheet').hidden = true; e.preventDefault(); } });

  function render() {
    var body = $('dm-body'), w = where(), keep = body.scrollTop;
    clear(body);
    body.className = 'scroll dm-body tab-' + ui.tab;
    $('dm-title').textContent = ui.tab === 'run' ? w.title : { chapters: 'The story', lookup: 'Dictionary', party: 'The party' }[ui.tab];
    $('dm-sub').textContent = ui.tab === 'run' ? [bell(), w.of > 1 ? 'Scene ' + w.n + ' of ' + w.of : ''].filter(Boolean).join(' · ') : ST.title;
    if (ui.tab === 'run') { renderRun(body); } else if (ui.tab === 'chapters') { renderChapters(body); } else if (ui.tab === 'lookup') { renderLookup(body); } else { renderParty(body); }
    body.scrollTop = keep;
    drawChip(); wasAt = atTable();
    var tabs = $('dm-tabs'); clear(tabs);
    [['run', 'Run', ICON.run], ['chapters', 'Story', ICON.map], ['lookup', 'Dictionary', ICON.book], ['party', 'Party', ICON.party]].forEach(function (t) {
      var b = btn('dmtab' + (ui.tab === t[0] ? ' on' : ''), '', function () { if (ui.tab !== t[0]) { ui.tab = t[0]; render(); $('dm-body').scrollTop = t[0] === 'run' ? $('dm-body').scrollHeight : 0; } });
      b.setAttribute('aria-pressed', ui.tab === t[0] ? 'true' : 'false'); b.appendChild(svg(t[2])); b.appendChild(el('span', '', t[1])); tabs.appendChild(b);
    });
    renderAsk();
  }
  function scrollToEntry(i) {
    setTimeout(function () {
      var n = document.getElementById('fe-' + i), body = $('dm-body');
      if (n && body) { body.scrollTo({ top: Math.max(0, n.offsetTop - 8), behavior: A.reduced ? 'auto' : 'smooth' }); }
    }, 40);
  }

  /* ---------- the door ---------- */
  function enterDM() { load(); ui.tab = 'run'; A.go('dm'); render(); setTimeout(function () { var b = $('dm-body'); b.scrollTop = DM.feed.length > 1 ? b.scrollHeight : 0; }, 60); }
  function doorSetup() {
    var can = !!(TB && TB.can()), mine = atTable();
    $('dm-pass-wrap').hidden = !(can && TB.needsPasscode() && !mine);
    $('b-dm-skip').hidden = !(can && !TB.needsPasscode() && !mine);
    $('dm-door-note').hidden = !can || mine;
    $('b-dm-in').textContent = !can ? 'I am the DM. Let me in' : (mine ? 'Back to table ' + TB.code() : 'Open a table and let me in');
    $('dm-err').hidden = true;
  }
  $('b-dm').addEventListener('click', function () { doorSetup(); A.go('dmgate'); });
  $('dmgate').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!(TB && TB.can()) || atTable()) { enterDM(); return; }
    var b = $('b-dm-in'), err = $('dm-err'); err.hidden = true; b.disabled = true;
    pass = $('dm-pass').value;
    TB.open(pass).then(function () { $('dm-pass').value = ''; enterDM(); openTable(); })
      .catch(function (x) { err.textContent = (x && x.message) || 'Could not open a table. Try again.'; err.hidden = false; })
      .then(function () { b.disabled = false; });
  });
  $('b-dm-skip').addEventListener('click', enterDM);
  $('dm-exit').addEventListener('click', function () { if (Voice.tts && Voice.tts.active()) { Voice.tts.stop().catch(function () { /* quiet */ }); } A.go('title'); });
  FR.dm = { state: function () { return DM; }, prompt: prompt, render: render };
})();
