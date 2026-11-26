/* First Roll: checks an adventure before it reaches a table.

   An adventure is data that src/dm.js plays (the format is written up at the top of the first
   adventure file). A typo in it would otherwise show up as a blank screen in the middle of
   somebody's game night, so this reads the whole thing the way the runner will and reports
   everything that could go wrong, in plain words, with where it is.

   As a module:   const { check } = require('./scripts/validate-adventure.js');
                  const problems = check(adventure, { images: 'public' });   // [] when it is fine
                  problems.warnings                                          // things worth a look that stop nothing
                  check(adventure, { images: dir, beds: ['wind', 'fire'] })  // beds: the cartridge's soundscapes, so that a
                                                                             // `sound` can be checked (any id passes without them)
   From a shell:  node scripts/validate-adventure.js cartridges/northpole/adventure.js --images cartridges/northpole
                  node scripts/validate-adventure.js my-pack.js --images public
                  (--no-images skips the picture check; without either, a "public" folder beside
                  or above the file is used if there is one)

   The file may set FR.STORY = {...} or call FR.adventure('id', {...}); both are understood.

   Three formats are understood. Format 1 (schema: 1) is the story the DM runs. Format 2 (schema: 2) adds
   what the players' phones are shown: brief, summary, check, card, hint, quests, clues, a person's
   `public` line and handouts. Format 3 (schema: 3) adds what the whole table shares and what helps the
   DM pace a night: maps, and on a scene a map to uncover, a soundscape, beats, a reveal, foes, a vote
   and the easier and harder lines; a soundscape and minutes on a chapter. All of it is optional, and a
   format 1 or 2 file is still checked as before. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

/* ---------- what each part of an adventure may contain ---------- */
const KEYS = {
  top: ['schema', 'id', 'title', 'kicker', 'length', 'table', 'cover', 'pitch', 'howto', 'brief', 'bible', 'flags', 'scores', 'clock', 'flow', 'quests', 'clues', 'handouts', 'maps', 'foes', 'helper', 'painter', 'labels'],
  brief: ['about', 'people', 'endings', 'tips'],
  bible: ['truths', 'outline', 'people', 'places', 'things'],
  person: ['id', 'name', 'full', 'role', 'img', 'where', 'look', 'voice', 'wants', 'secret', 'lines', 'public'],
  public: ['line', 'when'],
  place: ['id', 'name', 'img', 'blurb', 'senses'],
  thing: ['id', 'name', 'blurb', 'img'],
  flag: ['values', 'tell', 'words', 'short'],
  clock: ['deadline', 'times'],
  flow: ['start', 'chapters', 'interludes', 'hubs', 'shortcuts'],
  chapter: ['id', 'title', 'summary', 'img', 'place', 'time', 'length', 'minutes', 'sound', 'goal', 'flag', 'perks', 'scenes', 'leaving', 'next'],
  scene: ['id', 'title', 'summary', 'read', 'notes', 'notesFirst', 'cast', 'things', 'paint', 'tries', 'otherwise', 'also', 'extras', 'versions', 'outcomes',
    'map', 'sound', 'beats', 'reveal', 'foes', 'vote', 'easier', 'harder'],
  interlude: ['img', 'place', 'time', 'length', 'minutes', 'goal', 'next'],      // on top of everything a scene may have
  attempt: ['try', 'roll', 'yes', 'no', 'check', 'card', 'hint'],
  check: ['skill', 'target'],
  outcome: ['id', 'label', 'log', 'sets', 'skip', 'scene', 'to', 'end'],
  versions: ['ask', 'flag', 'options', 'suggest'],
  hub: ['id', 'title', 'first', 'summary', 'goal', 'help', 'options', 'next', 'map', 'sound', 'vote'],
  option: ['to', 'title', 'where', 'who', 'feel', 'img', 'log'],
  shortcut: ['to', 'at', 'button', 'label', 'log'],
  quest: ['id', 'text', 'from', 'done'],
  clue: ['id', 'text', 'when'],
  handout: ['id', 'title', 'text', 'img', 'at'],
  map: ['id', 'title', 'img', 'regions'],
  region: ['id', 'name', 'x', 'y', 'w', 'h', 'when'],
  'a scene\'s map': ['id', 'open'],
  beat: ['id', 'label', 'kind'],
  reveal: ['id', 'title', 'img'],
  foe: ['id', 'name', 'img', 'hits', 'moves'],
  vote: ['q', 'options'],
  helper: ['role', 'tone', 'voice', 'fail', 'flagsHeading', 'builtin'],
  builtin: ['twists', 'yes', 'no', 'nothingYet'],
  painter: ['role', 'tone', 'style', 'heroLook', 'heroes'],
  labels: ['hero', 'race', 'cls', 'partyHelp']
};
const COUNTS = ['picks', 'interludes', 'chapters'];
/* what format 2 added: in a format 1 file these are refused with the way to switch them on */
const SINCE2 = { top: ['brief', 'quests', 'clues', 'handouts'], person: ['public'], chapter: ['summary'], scene: ['summary'], hub: ['summary'], attempt: ['check', 'card', 'hint'] };
/* what format 3 added. In an older file these are read and checked all the same (nothing about them changes
   how the rest is played), with one reminder to say which format the file is written in. */
const SINCE3 = { top: ['maps', 'foes'], chapter: ['sound', 'minutes'], scene: ['map', 'sound', 'beats', 'reveal', 'foes', 'vote', 'easier', 'harder', 'minutes'], hub: ['map', 'sound', 'vote'] };     // an interlude is checked as a scene, and may have minutes
/* How long things may be. Whatever reaches a phone goes through the table on the server, which cuts every
   string and list to size (docs/PHASE1.md, section 1.1): these are those sizes, so that a scene built from
   an adventure always arrives whole. The brief is only ever shown to the DM; its sizes keep it to a page. */
const LIMITS = {
  id: 40, title: 80, summary: 400,                       // a scene's id, a chapter's or scene's title, "what is happening"
  label: 60, hint: 120, cards: 8,                        // an action card: the try's own words, its small line, how many a scene may show
  say: 300,                                              // what a phone reads out when a roll the DM asked for works, or does not
  quest: 160, quests: 12, clue: 200, clues: 20,          // the quest board and the clues
  name: 60, line: 160, people: 40,                       // who's who
  log: 240,                                              // one line of "the story so far"
  handoutTitle: 80, handoutText: 1200, handouts: 24,     // a note the DM gives out (the same sizes as anything the DM sends)
  about: 800, briefLine: 300, briefList: 6,              // the DM's brief
  /* Format 3. What the whole table is shown goes through the table's "stage" (docs/PHASE2.md, section 1.1): a
     map of at most 24 regions, names of 40, titles of 80, a vote of two to four answers of 40, and 16 KB in all.
     With these sizes the largest stage one scene can ask for (every region of a map open, a reveal, a
     soundscape, a beat and a full turn order) is about 9 KB, or 13 KB if every letter in it is an accented
     one, so it always arrives whole. */
  maps: 8, mapTitle: 80, regions: 24, region: 40,        // maps, and the parts of one that are uncovered
  beats: 6, beat: 40,                                    // the moments a scene offers the DM as buttons, and the words on one
  revealTitle: 80,                                       // a picture held face down, then shown
  dial: 240,                                             // an "easier" or a "harder" line, for the DM
  minutes: 600,                                          // about how long a chapter takes
  foes: 12, foe: 40, hits: 6, moves: 4, move: 120, sceneFoes: 8,     // foes: how many, a name, health as hits, what one might do, how many in one scene
  voteQ: 120, voteOption: 40, voteMin: 2, voteMax: 4,    // a vote put to the table
  stage: 16 * 1024
};
/* the engine's own lists: its skills (src/rules.js) and the kinds of beat it knows (FR.BEATS, src/registry.js) */
const RULES = (() => { try { return require(path.join(__dirname, '..', 'src', 'registry.js')); } catch (e) { try { return require(path.join(__dirname, '..', 'src', 'rules.js')); } catch (e2) { return null; } } })();

/* Objects made in another script context (the command line loads a file that way) are still plain
   objects, so look at their shape rather than at whose Object made them. */
const isList = Array.isArray;
const isObj = (v) => { if (v === null || typeof v !== 'object' || isList(v)) { return false; } const p = Object.getPrototypeOf(v); return Object.prototype.toString.call(v) === '[object Object]' && (p === null || Object.getPrototypeOf(p) === null); };
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const show = (v) => (typeof v === 'string' ? '"' + v + '"' : String(v));

function check(def, opts) {
  opts = opts || {};
  const errs = [], warns = [], seenErr = {};
  const err = (where, msg) => { const line = where + ': ' + msg; if (!seenErr[line]) { seenErr[line] = 1; errs.push(line); } };
  const warn = (where, msg) => { const line = where + ': ' + msg; if (!seenErr[line]) { seenErr[line] = 1; warns.push(line); } };
  Object.defineProperty(errs, 'warnings', { value: warns, enumerable: false });      // worth a look, but nothing is stopped
  /* the skills a check may name: the engine's own (src/rules.js), unless the caller knows better */
  const skills = Array.isArray(opts.skills) ? opts.skills : (RULES && RULES.SKILLS ? Object.keys(RULES.SKILLS) : []);
  const fmt = isObj(def) && def.schema === 1 ? 1 : (isObj(def) && def.schema === 2 ? 2 : 3), L = LIMITS, newer = [];
  /* the cartridge's soundscapes, when the caller knows them (a `sound` must be one), and the kinds of beat */
  const bedList = isList(opts.beds) ? opts.beds : null, beatKinds = isList(opts.beats) ? opts.beats : (RULES && isList(RULES.BEATS) ? RULES.BEATS : []);

  /* ---- 1. it must be data: nothing JSON cannot carry ---- */
  const trail = [];
  (function data(v, where) {
    const t = typeof v;
    if (v === null || t === 'string' || t === 'boolean') { return; }
    if (t === 'number') { if (!isFinite(v)) { err(where, 'is ' + v + ', which is not a number an adventure can hold'); } return; }
    if (t === 'function') { err(where, 'is a function. An adventure is data only: use a condition ({ flag: ... }) or a {placeholder} instead'); return; }
    if (t === 'undefined') { err(where, 'is undefined. Leave the line out, or give it a value'); return; }
    if (t !== 'object') { err(where, 'is a ' + t + ', which an adventure cannot hold'); return; }
    if (trail.indexOf(v) >= 0) { err(where, 'contains itself. An adventure cannot loop back on itself'); return; }
    if (!isList(v) && !isObj(v)) { const made = Object.prototype.toString.call(v).slice(8, -1); err(where, (made === 'Object' ? 'is an object made by a class' : 'is a ' + made) + ', not plain data. Use text, numbers, true/false, lists and plain objects only'); return; }
    trail.push(v);
    if (isList(v)) { for (let i = 0; i < v.length; i++) { if (!(i in v)) { err(where + '[' + i + ']', 'is a gap in the list'); } else { data(v[i], where + '[' + i + ']'); } } }
    else { Object.keys(v).forEach((k) => data(v[k], where ? where + '.' + k : k)); }
    trail.pop();
  })(def, '');
  if (!isObj(def)) { err('adventure', 'must be one plain object'); return errs; }
  if (!errs.length) { try { if (JSON.stringify(JSON.parse(JSON.stringify(def))) !== JSON.stringify(def)) { err('adventure', 'does not come back the same from JSON.parse(JSON.stringify(...))'); } } catch (e) { err('adventure', 'cannot be turned into JSON: ' + e.message); } }

  /* ---- small helpers: each reports a problem and says whether the value is usable ---- */
  const known = (o, kind, where, extra) => { Object.keys(o).forEach((k) => {
    if (KEYS[kind].indexOf(k) < 0 && (extra || []).indexOf(k) < 0) { err(where, 'has "' + k + '", which is not part of an adventure (' + kind + ' may have: ' + KEYS[kind].concat(extra || []).join(', ') + ')'); }
    else if (fmt === 1 && (SINCE2[kind] || []).indexOf(k) >= 0) { err(where, 'has "' + k + '", which belongs to format 2. To use it, change schema: 1 to schema: 2 at the top of the adventure'); }
    else if (fmt < 3 && (SINCE3[kind] || []).indexOf(k) >= 0 && newer.indexOf(k) < 0) { newer.push(k); }
  }); };
  /* a line that players read on their phones: it must be there when asked for, say something, and fit */
  const said = (o, k, where, max, what, need) => {
    const v = o[k], at = typeof k === 'number' ? where + '[' + k + ']' : where + '.' + k;
    if (v === undefined) { if (need) { err(where, 'needs "' + k + '": ' + what); } return false; }
    if (typeof v !== 'string') { err(at, 'must be text (' + what + ')'); return false; }
    if (!v.trim()) { err(at, 'is empty. Write ' + what + ', or take the line out'); return false; }
    if (v.length > max) { err(at, 'is ' + v.length + ' characters long. This is ' + what + ', and ' + max + ' is all that fits: shorten it by ' + (v.length - max)); return false; }
    return true;
  };
  const short = (v, max, where, what) => { if (typeof v === 'string' && v.length > max) { err(where, 'is ' + v.length + ' characters long. ' + what + ' can be ' + max + ' at most, or phones would cut it short: shorten it by ' + (v.length - max)); } };
  const quote = (v) => (isText(v) ? ' ("' + (v.length > 48 ? v.slice(0, 45) + '...' : v) + '")' : '');
  const text = (o, k, where, need) => { if (o[k] === undefined) { if (need) { err(where, 'needs "' + k + '"'); } return false; } if (!isText(o[k])) { err(where + '.' + k, typeof o[k] === 'string' ? 'is empty' : 'must be text'); return false; } return true; };
  const texts = (o, k, where, need) => {                 // a list of non-empty strings
    if (o[k] === undefined) { if (need) { err(where, 'needs "' + k + '"'); } return false; }
    if (!isList(o[k])) { err(where + '.' + k, 'must be a list'); return false; }
    o[k].forEach((s, i) => { if (!isText(s)) { err(where + '.' + k + '[' + i + ']', typeof s === 'string' ? 'is empty' : 'must be text'); } });
    return true;
  };
  const listOf = (o, k, where, need) => { if (o[k] === undefined) { if (need) { err(where, 'needs "' + k + '"'); } return []; } if (!isList(o[k])) { err(where + '.' + k, 'must be a list'); return []; } return o[k].filter((x, i) => { if (!isObj(x)) { err(where + '.' + k + '[' + i + ']', 'must be an object'); return false; } return true; }); };
  const obj = (o, k, where, need) => { if (o[k] === undefined) { if (need) { err(where, 'needs "' + k + '"'); } return null; } if (!isObj(o[k])) { err(where + '.' + k, 'must be an object'); return null; } return o[k]; };
  const tag = (x, i) => (x && typeof x.id === 'string' && x.id ? x.id : i);       // name a list item by its id when it has one
  const ids = (list, where) => { const got = {}; list.forEach((x, i) => { if (!isText(x.id) || /\s/.test(x.id)) { err(where + '[' + i + ']', 'needs an "id": a short word with no spaces'); } else if (got[x.id]) { err(where + '[' + x.id + ']', 'this id is used twice'); } else { got[x.id] = x; } }); return got; };
  const pictures = [];
  const picture = (o, k, where) => { if (o[k] === undefined) { return; } if (!isText(o[k])) { err(where + '.' + k, 'must be the path of a picture'); return; } pictures.push([where + '.' + k, o[k]]); };

  /* ---- 2. what it is ---- */
  known(def, 'top', 'adventure');
  if (def.schema !== 1 && def.schema !== 2 && def.schema !== 3) { err('schema', 'must be 3, the current format (1 and 2 are still read, for an adventure written before maps, soundscapes, beats, reveals, foes and votes existed); found ' + show(def.schema)); }
  if (text(def, 'id', 'adventure', true) && !/^[a-z0-9][a-z0-9-]*$/.test(def.id)) { err('id', 'must be lower-case letters, digits and dashes only, because saved sessions are filed under it; found ' + show(def.id)); }
  text(def, 'title', 'adventure', true); text(def, 'pitch', 'adventure', true);
  ['kicker', 'length', 'table'].forEach((k) => text(def, k, 'adventure'));
  texts(def, 'howto', 'adventure'); picture(def, 'cover', 'adventure');

  /* ---- 3. the bible ---- */
  const bible = obj(def, 'bible', 'adventure', true) || {};
  known(bible, 'bible', 'bible'); texts(bible, 'truths', 'bible'); text(bible, 'outline', 'bible');
  const book = {};
  [['people', 'person'], ['places', 'place'], ['things', 'thing']].forEach(([k, kind]) => {
    const rows = listOf(bible, k, 'bible'); book[k] = ids(rows, 'bible.' + k);
    rows.forEach((x, i) => {
      const at = 'bible.' + k + '[' + tag(x, i) + ']';
      known(x, kind, at); text(x, 'name', at, true); picture(x, 'img', at);
      KEYS[kind].filter((f) => ['id', 'name', 'img', 'lines', 'public'].indexOf(f) < 0).forEach((f) => text(x, f, at, kind !== 'person' && f === 'blurb'));
      if (kind === 'person') { texts(x, 'lines', at); }
    });
  });
  /* the DM's brief: one page to read before the first game */
  const brief = obj(def, 'brief', 'adventure');
  if (brief) {
    known(brief, 'brief', 'brief');
    said(brief, 'about', 'brief', L.about, 'what the adventure is about, in a few sentences, for the DM', true);
    if (brief.people !== undefined) {
      if (!isList(brief.people)) { err('brief.people', 'must be a list of the ids of the people who matter most, like ["' + (Object.keys(book.people)[0] || 'someone') + '"]'); }
      else {
        if (brief.people.length > L.briefList) { err('brief.people', 'names ' + brief.people.length + ' people. A brief is one page: name the ' + L.briefList + ' who matter most, at most'); }
        brief.people.forEach((id, i) => {
          if (!isText(id) || !book.people[id]) { err('brief.people[' + i + ']', 'names ' + show(id) + ', who is not in bible.people. Use the id of one of: ' + (Object.keys(book.people).join(', ') || '(nobody is listed yet)')); }
          else if (brief.people.indexOf(id) !== i) { err('brief.people', 'names "' + id + '" twice'); }
        });
      }
    }
    [['endings', 'one way the story can end'], ['tips', 'one tip for a first-time DM']].forEach(([k, what]) => {
      if (brief[k] === undefined) { return; }
      if (!isList(brief[k])) { err('brief.' + k, 'must be a list of sentences'); return; }
      if (brief[k].length > L.briefList) { err('brief.' + k, 'has ' + brief[k].length + ' entries. A brief is one page: keep it to ' + L.briefList + ' at most'); }
      brief[k].forEach((line, i) => said(brief[k], i, 'brief.' + k, L.briefLine, what, true));
    });
  }

  /* ---- 4. flags and scores ---- */
  const flagDefs = obj(def, 'flags', 'adventure') || {}, flags = {}, setTo = {};       // flags: each listed flag's values, tidied for the checks below
  Object.keys(flagDefs).forEach((name) => {
    const f = flagDefs[name], at = 'flags.' + name; setTo[name] = []; flags[name] = { values: [], short: null };
    if (!isObj(f)) { err(at, 'must be an object with its "values"'); return; }
    known(f, 'flag', at);
    const values = flags[name].values = isList(f.values) ? f.values : []; flags[name].short = f.short;
    if (!values.length) { err(at, 'needs "values": the list of everything this flag can be set to ([true] for a plain yes)'); }
    values.forEach((v, i) => { if (!(v === true || isText(v) || (typeof v === 'number' && isFinite(v)))) { err(at + '.values[' + i + ']', 'must be text, a number or true; found ' + show(v)); } if (values.indexOf(v) !== i) { err(at + '.values', 'lists ' + show(v) + ' twice'); } });
    text(f, 'tell', at);
    ['words', 'short'].forEach((k) => { const m = obj(f, k, at); if (m) { Object.keys(m).forEach((v) => { if (values.map(String).indexOf(v) < 0) { err(at + '.' + k, 'has wording for ' + show(v) + ', which is not one of this flag\'s values (' + values.map(show).join(', ') + ')'); } if (!isText(m[v])) { err(at + '.' + k + '.' + v, 'must be text'); } }); } });
    if (isText(f.tell) && f.tell.indexOf('{word}') >= 0) { values.forEach((v) => { if (!isObj(f.words) || !isText(f.words[String(v)])) { err(at + '.words', 'has no wording for ' + show(v) + ', but "tell" uses {word}'); } }); }
  });
  /* every time a flag is named anywhere, it must be one that is listed, and given only values it lists */
  const flagUse = (name, where) => { if (!isText(name)) { err(where, 'must name a flag'); return null; } if (!Object.prototype.hasOwnProperty.call(flags, name)) { err(where, 'uses the flag "' + name + '", which is not listed in flags'); return null; } return flags[name]; };
  const flagValue = (name, v, where, doing) => { const f = flagUse(name, where); if (f && f.values.indexOf(v) < 0) { err(where, doing + ' the flag "' + name + '" ' + (doing === 'sets' ? 'to ' : 'with ') + show(v) + ', which is not one of its values (' + f.values.map(show).join(', ') + ')'); return false; } return !!f; };
  const scores = obj(def, 'scores', 'adventure') || {};
  Object.keys(scores).forEach((name) => {
    const rows = scores[name], at = 'scores.' + name;
    if (!isObj(rows)) { err(at, 'must be an object of { flag: { value: points } }'); return; }
    Object.keys(rows).forEach((fl) => { const f = flagUse(fl, at + '.' + fl); if (!isObj(rows[fl])) { err(at + '.' + fl, 'must be { value: points }'); return; } Object.keys(rows[fl]).forEach((v) => { if (f && f.values.map(String).indexOf(v) < 0) { err(at + '.' + fl, 'gives points for ' + show(v) + ', which is not one of that flag\'s values (' + f.values.map(show).join(', ') + ')'); } if (typeof rows[fl][v] !== 'number') { err(at + '.' + fl + '.' + v, 'must be a number of points'); } }); });
  });

  /* ---- 5. the flow: first gather every id, so that anything may point at anything ---- */
  const flow = obj(def, 'flow', 'adventure', true) || {};
  known(flow, 'flow', 'flow');
  const chapters = listOf(flow, 'chapters', 'flow', true), interludes = listOf(flow, 'interludes', 'flow'), hubs = listOf(flow, 'hubs', 'flow'), shortcuts = listOf(flow, 'shortcuts', 'flow');
  const chById = ids(chapters, 'flow.chapters'), inById = ids(interludes, 'flow.interludes'), hubById = ids(hubs, 'flow.hubs'), node = {};
  [['chapter', chById], ['interlude', inById], ['hub', hubById]].forEach(([kind, map]) => Object.keys(map).forEach((id) => { if (node[id]) { err('flow', 'the id "' + id + '" is used by both a ' + node[id] + ' and a ' + kind + '. Chapters, interludes and hubs share one set of ids'); } else { node[id] = kind; } }));
  if (!chapters.length) { err('flow.chapters', 'an adventure needs at least one chapter'); }
  const offered = {};                                     // chapters a hub offers: the only ones "picked" and "before" can ask about
  hubs.forEach((h) => (isList(h.options) ? h.options : []).forEach((o) => { if (isObj(o) && isText(o.to)) { offered[o.to] = (offered[o.to] || 0) + 1; } }));
  const target = (id, where, what) => { if (!isText(id)) { err(where, 'must name ' + what); return false; } if (!node[id]) { err(where, 'points at "' + id + '", but there is no chapter, interlude or hub with that id'); return false; } return true; };

  /* conditions: anything called `when` */
  const amount = (c, where) => { const ks = ['is', 'atLeast', 'atMost'].filter((k) => k in c); if (!ks.length) { err(where, 'needs is, atLeast or atMost'); } ks.forEach((k) => { if (typeof c[k] !== 'number') { err(where + '.' + k, 'must be a number'); } }); };
  const when = (c, where) => {
    if (c === undefined) { return; }
    if (!isObj(c)) { err(where, 'must be a condition such as { flag: "name", is: "value" }'); return; }
    const kinds = ['all', 'any', 'not', 'flag', 'picked', 'before', 'seen', 'count', 'score'].filter((k) => k in c);
    if (kinds.length !== 1) { err(where, kinds.length ? 'mixes ' + kinds.join(' and ') + '. Put them inside { all: [...] }' : 'is not a condition this format knows (flag, picked, before, seen, count, score, all, any, not)'); return; }
    const kind = kinds[0], allowed = { all: [], any: [], not: [], flag: ['is', 'isNot', 'in'], picked: [], before: [], seen: [], count: ['is', 'atLeast', 'atMost'], score: ['is', 'atLeast', 'atMost'] }[kind];
    Object.keys(c).forEach((k) => { if (k !== kind && allowed.indexOf(k) < 0) { err(where, 'has "' + k + '", which a "' + kind + '" condition does not take'); } });
    if (kind === 'all' || kind === 'any') { if (!isList(c[kind]) || !c[kind].length) { err(where + '.' + kind, 'must be a list of conditions'); } else { c[kind].forEach((x, i) => when(x === undefined ? null : x, where + '.' + kind + '[' + i + ']')); } }
    else if (kind === 'not') { when(c.not === undefined ? null : c.not, where + '.not'); }
    else if (kind === 'flag') {
      if (['is', 'isNot', 'in'].filter((k) => k in c).length > 1) { err(where, 'uses more than one of is, isNot and in'); }
      if ('is' in c) { flagValue(c.flag, c.is, where, 'compares'); } else if ('isNot' in c) { flagValue(c.flag, c.isNot, where, 'compares'); }
      else if ('in' in c) { if (!isList(c.in) || !c.in.length) { err(where + '.in', 'must be a list of values'); flagUse(c.flag, where); } else { c.in.forEach((v) => flagValue(c.flag, v, where, 'compares')); } }
      else { flagUse(c.flag, where); }
    }
    else if (kind === 'picked') { if (!offered[c.picked]) { err(where, 'asks whether "' + c.picked + '" was picked, but no hub offers a chapter with that id'); } }
    else if (kind === 'before') { if (!isList(c.before) || c.before.length !== 2) { err(where + '.before', 'must be a list of two chapter ids'); } else { c.before.forEach((id) => { if (!offered[id]) { err(where, 'asks about the order of "' + id + '", but no hub offers a chapter with that id'); } }); } }
    else if (kind === 'seen') { target(c.seen, where + '.seen', 'a chapter, interlude or hub'); }
    else if (kind === 'count') { if (COUNTS.indexOf(c.count) < 0) { err(where, 'counts "' + c.count + '"; it can count ' + COUNTS.join(', ')); } amount(c, where); }
    else if (kind === 'score') { if (!Object.prototype.hasOwnProperty.call(scores, c.score)) { err(where, 'uses the score "' + c.score + '", which is not listed in scores'); } amount(c, where); }
  };
  /* a list of { when, to } / { when, end: true }: where the story goes next */
  const rules = (o, where, need) => {
    const list = listOf(o, 'next', where, need); if (o.next !== undefined && !list.length) { err(where + '.next', 'is empty, so the story would have nowhere to go'); }
    list.forEach((r, i) => {
      const at = where + '.next[' + i + ']';
      Object.keys(r).forEach((k) => { if (['when', 'to', 'end'].indexOf(k) < 0) { err(at, 'has "' + k + '"; a rule may have when, to and end'); } });
      when(r.when, at + '.when');
      if (r.end !== undefined && r.end !== true) { err(at + '.end', 'must be true'); }
      if ((r.end === true) === (r.to !== undefined)) { err(at, 'needs either to: an id, or end: true'); } else if (r.to !== undefined) { target(r.to, at + '.to', 'where to go'); }
      if (r.when === undefined && i < list.length - 1) { err(at, 'has no "when", so the rules after it can never be used'); }
    });
    if (list.length && list[list.length - 1].when !== undefined) { err(where + '.next', 'the last rule must have no "when", so there is always a way on'); }
    return list;
  };
  const conditional = (o, k, where, field) => listOf(o, k, where).forEach((x, i) => { const at = where + '.' + k + '[' + i + ']'; Object.keys(x).forEach((key) => { if (key !== 'when' && key !== field) { err(at, 'has "' + key + '"; it may have when and ' + field); } }); when(x.when, at + '.when'); if (!isText(x[field])) { err(at + '.' + field, x[field] === undefined ? 'is missing' : 'is empty: there is nothing to read'); } });

  /* ---- 5a. format 3: maps and foes, checked first because scenes point at them ---- */
  const whole = (v) => typeof v === 'number' && isFinite(v);
  const maps = listOf(def, 'maps', 'adventure'), mapById = ids(maps, 'maps'), regionsOf = {};
  if (maps.length > L.maps) { err('maps', 'lists ' + maps.length + ' maps; ' + L.maps + ' is the most an adventure may have. Take ' + (maps.length - L.maps) + ' out'); }
  maps.forEach((mp, i) => {
    const at = 'maps[' + tag(mp, i) + ']';
    known(mp, 'map', at); short(mp.id, L.id, at + '.id', 'An id');
    said(mp, 'title', at, L.mapTitle, 'the name of the map, as the whole table reads it', true);
    if (mp.img === undefined) { err(at, 'needs "img": the picture the map is drawn on, like "img/map.svg". Any wide picture in the cartridge\'s img folder will do'); } else { picture(mp, 'img', at); }
    const regions = listOf(mp, 'regions', at, true), byId = ids(regions, at + '.regions');
    if (isText(mp.id)) { regionsOf[mp.id] = byId; }
    if (isList(mp.regions) && !mp.regions.length) { err(at + '.regions', 'is empty: a map needs at least one region to uncover'); }
    if (regions.length > L.regions) { err(at + '.regions', 'lists ' + regions.length + ' regions, and the table holds ' + L.regions + ' for one map. Take ' + (regions.length - L.regions) + ' out, or fold two into one'); }
    regions.forEach((r, ri) => {
      const ra = at + '.regions[' + tag(r, ri) + ']', off = ['x', 'y', 'w', 'h'].filter((k) => !whole(r[k]));
      known(r, 'region', ra); short(r.id, L.id, ra + '.id', 'An id');
      said(r, 'name', ra, L.region, 'what this part of the map is called once it is uncovered', true);
      if (off.length) { err(ra, 'needs x, y, w and h as numbers: where the region starts (x across, y down) and how wide and how tall it is, each a percentage of the picture from 0 to 100. Here ' + off.join(', ') + (off.length === 1 ? ' is' : ' are') + ' missing or not a number'); }
      else if (r.w <= 0 || r.h <= 0) { err(ra, 'is ' + r.w + ' wide and ' + r.h + ' tall, so there is nothing to uncover. Give w and h a size above 0 (they are percentages of the picture)'); }
      else if (r.x < 0 || r.y < 0 || r.x + r.w > 100.000001 || r.y + r.h > 100.000001) { err(ra, 'runs off the picture: it goes from ' + r.x + ' to ' + (r.x + r.w) + ' across and from ' + r.y + ' to ' + (r.y + r.h) + ' down, and both must stay between 0 and 100. x, y, w and h are percentages of the picture'); }
      when(r.when, ra + '.when');
    });
  });
  const foes = listOf(def, 'foes', 'adventure'), foeById = ids(foes, 'foes');
  if (foes.length > L.foes) { err('foes', 'lists ' + foes.length + ' foes; ' + L.foes + ' is the most an adventure may have. Take ' + (foes.length - L.foes) + ' out, or let two share an entry'); }
  foes.forEach((f, i) => {
    const at = 'foes[' + tag(f, i) + ']';
    known(f, 'foe', at); short(f.id, L.id, at + '.id', 'An id');
    said(f, 'name', at, L.foe, 'what the table calls this foe', true);
    picture(f, 'img', at);
    if (f.hits === undefined) { err(at, 'needs "hits": how many good hits it takes to deal with this foe, a whole number from 1 to ' + L.hits); }
    else if (!Number.isInteger(f.hits) || f.hits < 1 || f.hits > L.hits) { err(at + '.hits', 'must be a whole number from 1 to ' + L.hits + ' (how many good hits it takes to deal with this foe); found ' + show(f.hits)); }
    if (!isList(f.moves) || !f.moves.length) { err(at, 'needs "moves": two or three things this foe might do on its turn, in plain words, like ["Slams the door and holds it shut."]'); }
    else {
      if (f.moves.length > L.moves) { err(at + '.moves', 'lists ' + f.moves.length + ' moves; keep it to ' + L.moves + ' at most, so the DM can take them in at a glance'); }
      f.moves.forEach((mv, mi) => said(f.moves, mi, at + '.moves', L.move, 'one thing this foe might do on its turn, in plain words', true));
    }
  });
  /* a soundscape: the id of one of the cartridge's beds (its own, or one it inherits) */
  const soundAt = (o, at) => {
    if (o.sound === undefined) { return; }
    if (!isText(o.sound)) { err(at + '.sound', 'must be the id of one of the cartridge\'s soundscapes, like "' + ((bedList && bedList[0]) || 'wind') + '"'); return; }
    if (bedList && bedList.indexOf(o.sound) < 0) { err(at + '.sound', 'is ' + show(o.sound) + ', which is not one of this cartridge\'s soundscapes. Use one of: ' + (bedList.join(', ') || '(it has none)') + '. They are listed under sound.beds in cartridge.js, where you can add your own'); }
  };
  /* the map to put up on arriving here, and the regions to uncover */
  const mapAt = (o, at) => {
    const m = obj(o, 'map', at);
    if (!m) { return; }
    known(m, 'a scene\'s map', at + '.map');
    if (!isText(m.id) || !mapById[m.id]) { err(at + '.map', (m.id === undefined ? 'needs "id": which map to show' : 'names the map ' + show(m.id) + ', which is not in maps') + '. ' + (maps.length ? 'The maps are: ' + Object.keys(mapById).join(', ') : 'Add the map to "maps" at the top of the adventure first')); return; }
    if (m.open === undefined) { return; }
    const have = Object.keys(regionsOf[m.id] || {});
    if (!isList(m.open)) { err(at + '.map.open', 'must be a list of the regions to uncover here, like ["' + (have[0] || 'cellar') + '"]. Leave it out to show the map without uncovering anything new'); return; }
    m.open.forEach((rid, i) => {
      if (!isText(rid) || have.indexOf(rid) < 0) { err(at + '.map.open[' + i + ']', 'names the region ' + show(rid) + ', which the map "' + m.id + '" does not have. Its regions are: ' + have.join(', ')); }
      else if (m.open.indexOf(rid) !== i) { err(at + '.map.open', 'names "' + rid + '" twice'); }
    });
  };
  /* a choice worth putting to the whole table */
  const voteAt = (o, at) => {
    const v = obj(o, 'vote', at);
    if (!v) { return; }
    known(v, 'vote', at + '.vote');
    said(v, 'q', at + '.vote', L.voteQ, 'the question put to the table', true);
    if (!isList(v.options)) { err(at + '.vote', (v.options === undefined ? 'needs "options"' : 'has "options" that is not a list') + ': ' + L.voteMin + ' to ' + L.voteMax + ' answers to choose between, like ["Open the door", "Leave it shut"]'); return; }
    if (v.options.length < L.voteMin || v.options.length > L.voteMax) { err(at + '.vote.options', 'has ' + v.options.length + (v.options.length === 1 ? ' answer' : ' answers') + '. A vote needs ' + L.voteMin + ' to ' + L.voteMax + ' to choose between'); }
    v.options.forEach((opt, i) => { if (said(v.options, i, at + '.vote.options', L.voteOption, 'one answer the table can vote for', true) && v.options.indexOf(opt) !== i) { err(at + '.vote.options', 'offers ' + show(opt) + ' twice'); } });
  };
  /* about how long a chapter or an interlude takes, for the pacing clock */
  const timed = [], untimed = [];
  const minutesAt = (o, at, name) => {
    if (o.minutes === undefined) { untimed.push(name); return; }
    timed.push(name);
    if (!Number.isInteger(o.minutes) || o.minutes < 1 || o.minutes > L.minutes) { err(at + '.minutes', 'must be a whole number of minutes from 1 to ' + L.minutes + ' (about how long this part takes to play); found ' + show(o.minutes)); }
  };

  /* a scene, or an interlude (a scene with a banner). `siblings` are the scene ids it may jump to. */
  const scene = (s, at, siblings, extra) => {
    known(s, 'scene', at, extra); text(s, 'title', at, true); text(s, 'paint', at); text(s, 'otherwise', at);
    said(s, 'summary', at, L.summary, 'what players are told is happening in this scene (one or two lines, with nothing the DM has not yet revealed)');
    if (fmt > 1) { short(s.title, L.title, at + '.title', 'A scene\'s title'); short(s.id, L.id, at + '.id', 'An id'); }
    if (s.notesFirst !== undefined && typeof s.notesFirst !== 'boolean') { err(at + '.notesFirst', 'must be true or false'); }
    const v = obj(s, 'versions', at);
    if (!v) { if (!isList(s.read) || !s.read.length) { err(at + '.read', 'is empty: this scene has nothing to read aloud'); } }
    texts(s, 'read', at); texts(s, 'notes', at);
    [['cast', 'people', 'person'], ['things', 'things', 'thing']].forEach(([k, shelf, word]) => { if (s[k] === undefined) { return; } if (!isList(s[k])) { err(at + '.' + k, 'must be a list of ids'); return; } s[k].forEach((id) => { if (!book[shelf][id]) { err(at + '.' + k, 'names the ' + word + ' "' + id + '", ' + (word === 'person' ? 'who' : 'which') + ' is not in bible.' + shelf); } }); });
    let cards = 0, answered = 0; const tries = listOf(s, 'tries', at);
    tries.forEach((t, i) => {
      const ta = at + '.tries[' + i + ']', named = ta + quote(t.try);
      known(t, 'attempt', ta); text(t, 'try', ta, true); text(t, 'roll', ta, true); ['yes', 'no'].forEach((k) => { if (t[k] !== undefined && typeof t[k] !== 'string') { err(ta + '.' + k, 'must be text (it may be empty)'); } });
      /* format 2: the same try as players see it (an action card) and as a roll the DM can ask for with one tap */
      if (t.card !== undefined && typeof t.card !== 'boolean') { err(named + '.card', 'must be true or false. card: false keeps this try off the players\' phones; leave the line out to show it'); }
      if (t.card !== false) { cards++; }
      if (fmt > 1 && isText(t.try) && t.try.length > L.label) { warn(ta + '.try', 'is ' + t.try.length + ' characters long. On a phone it is the title of an action card and of a roll the DM asks for, which show ' + L.label + ': shorten it by ' + (t.try.length - L.label)); }
      said(t, 'hint', named, L.hint, 'the small line under this action card on a phone');
      if (t.check !== undefined) {
        answered++;
        if (t.check === false) { /* said out loud: nothing to roll here */ }
        else if (!isObj(t.check)) { err(named + '.check', 'must say which skill to roll and the number to reach, like { skill: "Athletics", target: 13 }, or be false when there is nothing to roll'); }
        else {
          known(t.check, 'check', named + '.check');
          if (!isText(t.check.skill)) { err(named + '.check', 'needs "skill": the skill to roll. One of: ' + skills.join(', ')); }
          else if (skills.length && skills.indexOf(t.check.skill) < 0) { err(named + '.check.skill', 'is ' + show(t.check.skill) + ', which is not a skill the rules know. Use one of: ' + skills.join(', ')); }
          if (t.check.target === undefined) { err(named + '.check', 'needs "target": the number the roll has to reach (about 10 is easy, 13 medium, 16 hard)'); }
          else if (!Number.isInteger(t.check.target) || t.check.target < 1 || t.check.target > 40) { err(named + '.check.target', 'must be a whole number from 1 to 40 (about 10 is easy, 13 medium, 16 hard); found ' + show(t.check.target)); }
          ['yes', 'no'].forEach((k) => { if (fmt > 1 && typeof t[k] === 'string' && t[k].length > L.say) { warn(ta + '.' + k, 'is ' + t[k].length + ' characters long. When the DM asks for this roll, a phone reads it out as the result and shows ' + L.say + ': shorten it by ' + (t[k].length - L.say)); } });
        }
      }
    });
    if (fmt > 1 && cards > L.cards) { err(at + '.tries', 'would put ' + cards + ' action cards on a phone, and a scene can show ' + L.cards + '. Give ' + (cards - L.cards) + ' of the tries card: false (the DM still sees them)'); }
    if (fmt > 1 && tries.length && !answered) { warn(at + '.tries', 'none of the things to try here has a "check", so the DM cannot ask for any of these rolls with one tap. Give each try that needs a roll a check, like check: { skill: "Athletics", target: 13 }, and check: false to the ones that need none'); }
    conditional(s, 'also', at, 'read'); conditional(s, 'extras', at, 'read');
    /* format 3: what the scene offers the whole table (a map, a soundscape, a reveal, a vote) and the DM (beats, foes, the dial) */
    mapAt(s, at); soundAt(s, at); voteAt(s, at);
    const beats = listOf(s, 'beats', at); ids(beats, at + '.beats');
    if (beats.length > L.beats) { err(at + '.beats', 'lists ' + beats.length + ' beats, and a scene shows ' + L.beats + ' at most. Keep the ones the moment needs and take ' + (beats.length - L.beats) + ' out'); }
    beats.forEach((b, i) => {
      const ba = at + '.beats[' + tag(b, i) + ']';
      known(b, 'beat', ba); short(b.id, L.id, ba + '.id', 'An id');
      said(b, 'label', ba, L.beat, 'the words on the DM\'s button for this moment', true);
      if (b.kind === undefined) { err(ba, 'needs "kind": the sort of moment it is. One of: ' + beatKinds.join(', ')); }
      else if (beatKinds.indexOf(b.kind) < 0) { err(ba + '.kind', 'is ' + show(b.kind) + ', which is not a kind of beat the app knows. Use one of: ' + beatKinds.join(', ')); }
    });
    const rv = obj(s, 'reveal', at);
    if (rv) {
      const ra = at + '.reveal';
      known(rv, 'reveal', ra);
      if (!isText(rv.id) || /\s/.test(rv.id)) { err(ra, 'needs an "id": a short word with no spaces'); } else { short(rv.id, L.id, ra + '.id', 'An id'); }
      said(rv, 'title', ra, L.revealTitle, 'what the picture is called, in words that give nothing away before it is turned over', true);
      if (rv.img === undefined) { err(ra, 'needs "img": the picture to hold face down and then show, like "img/stranger.webp"'); } else { picture(rv, 'img', ra); }
    }
    said(s, 'easier', at, L.dial, 'what the DM can change here if the table is struggling');
    said(s, 'harder', at, L.dial, 'what the DM can change here if the table is finding it too easy');
    if (s.foes !== undefined) {
      if (!isList(s.foes)) { err(at + '.foes', 'must be a list of foe ids, like ["' + (Object.keys(foeById)[0] || 'troll') + '"]. The foes themselves are listed under "foes" at the top of the adventure'); }
      else {
        if (s.foes.length > L.sceneFoes) { err(at + '.foes', 'lists ' + s.foes.length + ' foes, and the turn order has room for ' + L.sceneFoes + ' beside the heroes. Take ' + (s.foes.length - L.sceneFoes) + ' out'); }
        s.foes.forEach((id, i) => { if (!isText(id) || !foeById[id]) { err(at + '.foes[' + i + ']', 'names the foe ' + show(id) + ', which is not in foes. ' + (foes.length ? 'The foes are: ' + Object.keys(foeById).join(', ') : 'Add it to "foes" at the top of the adventure first')); } });
      }
    }
    if (v) {
      const va = at + '.versions'; known(v, 'versions', va); text(v, 'ask', va);
      const options = listOf(v, 'options', va, true), byId = ids(options, va + '.options');
      if (options.length < 2) { err(va + '.options', 'needs at least two versions to choose between'); }
      options.forEach((o, i) => { const oa = va + '.options[' + tag(o, i) + ']'; Object.keys(o).forEach((k) => { if (['id', 'label', 'read'].indexOf(k) < 0) { err(oa, 'has "' + k + '"; a version may have id, label and read'); } }); text(o, 'label', oa, true); if (!isList(o.read) || !o.read.length) { err(oa + '.read', 'is empty: this version has nothing to read aloud'); } texts(o, 'read', oa); });
      if (v.flag === undefined) { err(va, 'needs "flag": the flag that remembers which version the DM chose'); }
      else { const f = flagUse(v.flag, va + '.flag'); if (f) { options.forEach((o) => { if (isText(o.id)) { if (f.values.indexOf(o.id) < 0) { err(va + '.flag', 'the flag "' + v.flag + '" must list every version id as a value; it is missing ' + show(o.id)); } else { setTo[v.flag].push(o.id); } } }); } }
      const sug = listOf(v, 'suggest', va, true);
      sug.forEach((r, i) => { const ra = va + '.suggest[' + i + ']'; when(r.when, ra + '.when'); if (!byId[r.use]) { err(ra + '.use', 'names the version ' + show(r.use) + ', which is not one of the options'); } });
      if (sug.length && sug[sug.length - 1].when !== undefined) { err(va + '.suggest', 'the last suggestion must have no "when", so there is always one to show'); }
    }
    const outs = listOf(s, 'outcomes', at, true), outIds = ids(outs, at + '.outcomes');
    if (!outs.length) { err(at + '.outcomes', 'needs at least one outcome, or the DM can never move on'); }
    outs.forEach((o, i) => {
      const oa = at + '.outcomes[' + tag(o, i) + ']'; known(o, 'outcome', oa); text(o, 'label', oa, true); text(o, 'log', oa);
      if (fmt > 1 && isText(o.log) && o.log.length > L.log) { warn(oa + '.log', 'is ' + o.log.length + ' characters long. It becomes a line of "the story so far" on the phones, which shows ' + L.log + ': shorten it by ' + (o.log.length - L.log)); }
      const sets = obj(o, 'sets', oa); if (sets) { Object.keys(sets).forEach((name) => { if (flagValue(name, sets[name], oa + '.sets', 'sets')) { setTo[name].push(sets[name]); } }); }
      const ways = ['skip', 'scene', 'to', 'end'].filter((k) => o[k] !== undefined);
      if (ways.length > 1) { err(oa, 'has ' + ways.join(' and ') + '. An outcome can do only one of skip, scene, to and end'); }
      if (o.skip !== undefined && !(Number.isInteger(o.skip) && o.skip > 0)) { err(oa + '.skip', 'must be a whole number of scenes to leave out, 1 or more'); }
      if (o.scene !== undefined) { if (!siblings) { err(oa + '.scene', 'an interlude has only one scene, so there is no scene to jump to'); } else if (!siblings[o.scene]) { err(oa + '.scene', 'jumps to the scene "' + o.scene + '", but this chapter has no scene with that id'); } }
      if (o.to !== undefined) { target(o.to, oa + '.to', 'where to go'); }
      if (o.end !== undefined && o.end !== true) { err(oa + '.end', 'must be true'); }
    });
    return outIds;
  };

  chapters.forEach((c, ci) => {
    const at = 'flow.chapters[' + tag(c, ci) + ']';
    known(c, 'chapter', at); text(c, 'title', at, true); text(c, 'goal', at, true); text(c, 'time', at); text(c, 'length', at); picture(c, 'img', at);
    said(c, 'summary', at, L.summary, 'what players are told is happening in this chapter (one or two lines, with nothing the DM has not yet revealed)');
    soundAt(c, at); minutesAt(c, at, 'the chapter "' + tag(c, ci) + '"');
    if (fmt > 1) { short(c.title, L.title, at + '.title', 'A chapter\'s title'); }
    if (c.place !== undefined && !book.places[c.place]) { err(at + '.place', 'names the place "' + c.place + '", which is not in bible.places'); }
    if (c.flag !== undefined) { const f = flagUse(c.flag, at + '.flag'); if (f && !isObj(f.short)) { err(at + '.flag', 'names the flag "' + c.flag + '", which has no "short" words to show under the chapter'); } }
    listOf(c, 'perks', at).forEach((p, i) => { const pa = at + '.perks[' + i + ']'; Object.keys(p).forEach((k) => { if (k !== 'when' && k !== 'text') { err(pa, 'has "' + k + '"; a perk may have when and text'); } }); when(p.when, pa + '.when'); text(p, 'text', pa, true); });
    conditional(c, 'leaving', at, 'read');
    const scenes = listOf(c, 'scenes', at, true), sib = ids(scenes, at + '.scenes');
    if (!scenes.length) { err(at + '.scenes', 'a chapter needs at least one scene'); }
    scenes.forEach((s, si) => scene(s, at + '.scenes[' + tag(s, si) + ']', sib));
    rules(c, at, true);
  });
  interludes.forEach((s, i) => {
    const at = 'flow.interludes[' + tag(s, i) + ']';
    scene(s, at, null, KEYS.interlude); text(s, 'goal', at); text(s, 'time', at); text(s, 'length', at); picture(s, 'img', at);
    minutesAt(s, at, 'the interlude "' + tag(s, i) + '"');
    if (s.place !== undefined && !book.places[s.place]) { err(at + '.place', 'names the place "' + s.place + '", which is not in bible.places'); }
    rules(s, at, true);
  });
  hubs.forEach((h, i) => {
    const at = 'flow.hubs[' + tag(h, i) + ']';
    known(h, 'hub', at); text(h, 'title', at, true); ['first', 'goal', 'help'].forEach((k) => text(h, k, at));
    said(h, 'summary', at, L.summary, 'what players are told while they choose (one or two lines)');
    mapAt(h, at); soundAt(h, at); voteAt(h, at);
    if (fmt > 1) { short(h.title, L.title, at + '.title', 'A title'); short(h.first, L.title, at + '.first', 'A title'); }
    const options = listOf(h, 'options', at, true);
    if (!options.length) { err(at + '.options', 'a hub needs at least one thing to choose'); }
    options.forEach((o, oi) => {
      const oa = at + '.options[' + (isText(o.to) ? o.to : oi) + ']'; known(o, 'option', oa); text(o, 'title', oa, true); ['where', 'who', 'feel', 'log'].forEach((k) => text(o, k, oa)); picture(o, 'img', oa);
      if (fmt > 1 && isText(o.log) && o.log.length > L.log) { warn(oa + '.log', 'is ' + o.log.length + ' characters long. It becomes a line of "the story so far" on the phones, which shows ' + L.log + ': shorten it by ' + (o.log.length - L.log)); }
      if (!isText(o.to)) { err(oa, 'needs "to": the chapter this choice leads to'); } else if (!chById[o.to]) { err(oa + '.to', 'points at "' + o.to + '", but there is no chapter with that id (a hub can only offer chapters)'); } else if (offered[o.to] > 1) { err(oa + '.to', 'the chapter "' + o.to + '" is offered more than once. A chapter can be on offer in one place only'); }
    });
    rules(h, at, true);
  });
  shortcuts.forEach((s, i) => {
    const at = 'flow.shortcuts[' + i + ']';
    known(s, 'shortcut', at); text(s, 'button', at, true); text(s, 'label', at, true); text(s, 'log', at); target(s.to, at + '.to', 'where the shortcut leads');
    if (!isList(s.at) || !s.at.length) { err(at + '.at', 'must list the hubs, interludes or chapters where the shortcut is offered'); } else { s.at.forEach((id) => target(id, at + '.at', 'a hub, interlude or chapter')); }
  });
  if (flow.start === undefined) { err('flow', 'needs "start": the id of where the story begins'); } else { target(flow.start, 'flow.start', 'where the story begins'); }
  if (timed.length && untimed.length) { warn('flow', 'the pacing clock adds up each part\'s "minutes", but ' + untimed.join(', ') + (untimed.length === 1 ? ' has' : ' have') + ' none. Give every chapter and interlude its minutes, or none of them'); }
  if (newer.length) { warn('adventure', 'uses ' + newer.map((k) => '"' + k + '"').join(', ') + ', which ' + (newer.length === 1 ? 'belongs' : 'belong') + ' to format 3. ' + (newer.length === 1 ? 'It is' : 'They are') + ' read all the same, but say which format this file is written in: change schema: ' + fmt + ' to schema: 3 at the top of the adventure'); }

  /* ---- 5b. what the players' phones are shown (format 2): quests, clues, who's who, handouts ---- */
  const quests = listOf(def, 'quests', 'adventure'); ids(quests, 'quests');
  if (quests.length > L.quests) { err('quests', 'lists ' + quests.length + ' quests, and the quest board on a phone holds ' + L.quests + '. Take ' + (quests.length - L.quests) + ' out, or fold two into one'); }
  quests.forEach((q, i) => {
    const at = 'quests[' + tag(q, i) + ']';
    known(q, 'quest', at); short(q.id, L.id, at + '.id', 'An id');
    said(q, 'text', at, L.quest, 'the quest as players read it on the quest board', true);
    when(q.from, at + '.from'); when(q.done, at + '.done');
  });
  const clues = listOf(def, 'clues', 'adventure'); ids(clues, 'clues');
  if (clues.length > L.clues) { err('clues', 'lists ' + clues.length + ' clues, and a phone holds ' + L.clues + '. Take ' + (clues.length - L.clues) + ' out, or fold two into one'); }
  clues.forEach((c, i) => {
    const at = 'clues[' + tag(c, i) + ']';
    known(c, 'clue', at); short(c.id, L.id, at + '.id', 'An id');
    said(c, 'text', at, L.clue, 'the clue as players read it', true);
    when(c.when, at + '.when');
  });
  let shown = 0;
  (isList(bible.people) ? bible.people.filter(isObj) : []).forEach((p, i) => {
    if (p.public === undefined) { return; }
    const at = 'bible.people[' + tag(p, i) + ']', pub = obj(p, 'public', at);
    if (!pub) { return; }
    shown++; known(pub, 'public', at + '.public');
    said(pub, 'line', at + '.public', L.line, 'the one line players may read about ' + (isText(p.name) ? p.name : 'this person') + ' (never their secret)', true);
    when(pub.when, at + '.public.when');
    short(p.name, L.name, at + '.name', 'A name shown to players'); short(p.id, L.id, at + '.id', 'An id');
  });
  if (shown > L.people) { err('bible.people', shown + ' people have a "public" line, and who\'s who on a phone holds ' + L.people + '. Take "public" off ' + (shown - L.people) + ' of them'); }
  /* where a handout belongs: a chapter, an interlude or a hub by its id, or one scene of a chapter as "chapter/scene" */
  const place = (v, where) => {
    if (!isText(v)) { err(where, 'must name where this handout belongs: the id of a chapter, interlude or hub, or "chapter/scene" for one scene. Leave "at" out for a handout that is always to hand'); return; }
    const parts = v.split('/');
    if (parts.length === 1) { if (!node[v]) { const inside = chapters.filter((c) => isList(c.scenes) && c.scenes.some((x) => isObj(x) && x.id === v)).map((c) => c.id); err(where, 'names "' + v + '", but there is no chapter, interlude or hub with that id.' + (inside.length ? ' For the scene of that name, write "' + inside[0] + '/' + v + '"' : ' The ids are: ' + Object.keys(node).join(', '))); } return; }
    const ch = chById[parts[0]], sc = ch && isList(ch.scenes) ? ch.scenes.filter(isObj).map((x) => x.id) : [];
    if (parts.length !== 2 || !ch) { err(where, 'names "' + v + '", but there is no chapter called "' + parts[0] + '". The chapters are: ' + Object.keys(chById).join(', ')); }
    else if (sc.indexOf(parts[1]) < 0) { err(where, 'names "' + v + '", but the chapter "' + parts[0] + '" has no scene called "' + parts[1] + '". Its scenes are: ' + sc.join(', ')); }
  };
  const handouts = listOf(def, 'handouts', 'adventure'); ids(handouts, 'handouts');
  if (handouts.length > L.handouts) { err('handouts', 'lists ' + handouts.length + ' handouts; ' + L.handouts + ' is the most the DM\'s screen offers. Take ' + (handouts.length - L.handouts) + ' out'); }
  handouts.forEach((h, i) => {
    const at = 'handouts[' + tag(h, i) + ']';
    known(h, 'handout', at); short(h.id, L.id, at + '.id', 'An id');
    said(h, 'title', at, L.handoutTitle, 'the title of the note, as a player sees it', true);
    said(h, 'text', at, L.handoutText, 'the words of the note');
    picture(h, 'img', at);
    if (h.text === undefined && h.img === undefined) { err(at, 'has nothing to give: add "text" (the words of the note), "img" (a picture), or both'); }
    if (h.at !== undefined) { place(h.at, at + '.at'); }
  });

  /* ---- 6. the clock, the helper, the painter, labels ---- */
  const clock = obj(def, 'clock', 'adventure');
  if (clock) {
    known(clock, 'clock', 'clock'); text(clock, 'deadline', 'clock');
    const times = listOf(clock, 'times', 'clock', true);
    times.forEach((t, i) => { const at = 'clock.times[' + i + ']'; Object.keys(t).forEach((k) => { if (k !== 'when' && k !== 'say') { err(at, 'has "' + k + '"; a time may have when and say'); } }); when(t.when, at + '.when'); text(t, 'say', at, true); });
    if (times.length && times[times.length - 1].when !== undefined) { err('clock.times', 'the last time must have no "when", so the clock always says something'); }
  }
  const helper = obj(def, 'helper', 'adventure');
  if (helper) { known(helper, 'helper', 'helper'); ['role', 'tone', 'voice', 'fail', 'flagsHeading'].forEach((k) => text(helper, k, 'helper')); const b = obj(helper, 'builtin', 'helper'); if (b) { known(b, 'builtin', 'helper.builtin'); ['twists', 'yes', 'no'].forEach((k) => texts(b, k, 'helper.builtin')); text(b, 'nothingYet', 'helper.builtin'); } }
  const painter = obj(def, 'painter', 'adventure');
  if (painter) { known(painter, 'painter', 'painter'); KEYS.painter.forEach((k) => text(painter, k, 'painter')); }
  const labels = obj(def, 'labels', 'adventure');
  if (labels) { known(labels, 'labels', 'labels'); KEYS.labels.forEach((k) => text(labels, k, 'labels')); }

  /* ---- 7. flags: listed but never set, and values nothing ever gives ---- */
  Object.keys(flags).forEach((name) => {
    const f = flags[name];
    if (!setTo[name].length) { err('flags.' + name, 'is listed but nothing ever sets it. Give an outcome sets: { ' + name + ': ... }, or take the flag out'); return; }
    f.values.forEach((v) => { if (setTo[name].indexOf(v) < 0) { err('flags.' + name, 'lists the value ' + show(v) + ', but nothing ever sets it to that'); } });
  });

  /* ---- 8. can the DM get everywhere, and can the story end? ---- */
  const reach = {}, sceneReach = {}; let canEnd = false, grew = true;
  /* which scenes of a chapter can be reached from its first, and can the chapter run out of scenes (so that its `next` is used)? */
  const through = (c) => {
    const scenes = isList(c.scenes) ? c.scenes.filter(isObj) : [], got = {}, todo = scenes.length ? [0] : []; let runsOut = false; const leaves = [];
    while (todo.length) {
      const i = todo.pop(); if (got[i]) { continue; } got[i] = 1;
      (isList(scenes[i].outcomes) ? scenes[i].outcomes.filter(isObj) : []).forEach((o) => {
        if (o.end === true) { canEnd = true; return; }
        if (o.to !== undefined) { leaves.push(o.to); return; }
        let n = i + 1 + (Number.isInteger(o.skip) && o.skip > 0 ? o.skip : 0);
        if (o.scene !== undefined) { const j = scenes.findIndex((s) => s.id === o.scene); if (j >= 0) { n = j; } }
        if (n < scenes.length) { todo.push(n); } else { runsOut = true; }
      });
    }
    return { got, runsOut, leaves, scenes };
  };
  const next = (o) => (isList(o.next) ? o.next.filter(isObj) : []).forEach((r) => { if (r.end === true) { canEnd = true; } else if (node[r.to] && !reach[r.to]) { reach[r.to] = 1; grew = true; } });
  const visit = (id) => { if (node[id] && !reach[id]) { reach[id] = 1; grew = true; } };
  if (node[flow.start]) { reach[flow.start] = 1; }
  while (grew) {
    grew = false;
    Object.keys(reach).forEach((id) => {
      if (node[id] === 'chapter') { const t = through(chById[id]); sceneReach[id] = t; t.leaves.forEach(visit); if (t.runsOut) { next(chById[id]); } }
      else if (node[id] === 'interlude') { const s = inById[id]; let on = false; (isList(s.outcomes) ? s.outcomes.filter(isObj) : []).forEach((o) => { if (o.end === true) { canEnd = true; } else if (o.to !== undefined) { visit(o.to); } else { on = true; } }); if (on) { next(s); } }
      else { const h = hubById[id]; (isList(h.options) ? h.options.filter(isObj) : []).forEach((o) => visit(o.to)); next(h); }
    });
    shortcuts.forEach((s) => { if (isList(s.at) && s.at.some((id) => reach[id])) { visit(s.to); } });
  }
  if (node[flow.start]) {
    Object.keys(node).forEach((id) => { if (!reach[id]) { err('flow', 'the ' + node[id] + ' "' + id + '" can never be reached: nothing leads to it'); } });
    Object.keys(sceneReach).forEach((id) => { const t = sceneReach[id]; t.scenes.forEach((s, i) => { if (!t.got[i]) { err('flow.chapters[' + id + '].scenes[' + tag(s, i) + ']', 'can never be reached: every way through the chapter skips it'); } }); });
    if (!canEnd) { err('flow', 'the story can never end: nothing that can be reached says end: true'); }
  }

  /* ---- 9. pictures ---- */
  /* "img/x.webp" is one of the cartridge's own files; "base:img/x.webp" borrows one of the engine's (src/img/) */
  if (opts.images) {
    const engine = opts.engine || path.join(__dirname, '..', 'src');
    pictures.forEach(([where, p]) => {
      if (/^(https?:|data:)/.test(p)) { return; }
      if (p.indexOf('base:') === 0) { if (!fs.existsSync(path.join(engine, p.slice(5)))) { err(where, 'the picture "' + p + '" is not one of the engine\'s (there is no ' + p.slice(5) + ' in src/). Check the spelling, or put your own picture in the cartridge\'s img/ folder and name it "img/..."'); } return; }
      if (!fs.existsSync(path.join(opts.images, p))) { err(where, 'the picture "' + p + '" is not in ' + opts.images + '. Put the file there, or correct the name'); }
    });
  }
  return errs;
}

/* Load an adventure file the way the page does, with a stand-in FR, and give back every adventure it defines. */
function load(file) {
  const found = [], FR = { THEMES: {}, theme: {}, adventure: function (id, def) { const d = def === undefined ? id : def; found.push({ id: typeof id === 'string' ? id : (d && d.id), def: d }); return d; } };
  const box = { FR: FR, module: { exports: {} }, console: console };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), box, { filename: file });
  const after = box.FR || FR;                             // the file may have made its own FR
  if (after.STORY !== undefined) { found.push({ id: after.STORY && after.STORY.id, def: after.STORY }); }
  return found;
}

/* The soundscapes of the cartridge an adventure file sits in (its own and the ones every cartridge is given),
   so that a `sound` can be checked from the command line too. null when there is no cartridge.js beside it. */
function bedsBeside(file) {
  try {
    const P = require('./lib/packs.js'), got = P.load(path.join(path.dirname(path.resolve(file)), 'cartridge.js'));
    if (!got.def) { return null; }
    const FR = P.engine(); FR.cartridge(got.def);
    const beds = (FR.resolved(got.def.id).sound || {}).beds || {};
    return Object.keys(beds).filter((k) => beds[k] && typeof beds[k] === 'object');
  } catch (e) { return null; }
}

function main(argv) {
  const args = argv.slice(2), file = args.filter((a, i) => a.indexOf('--') !== 0 && args[i - 1] !== '--images')[0];
  if (!file) { console.error('usage: node scripts/validate-adventure.js <adventure file> [--images <folder> | --no-images]'); return 2; }
  let images = args.indexOf('--images') >= 0 ? args[args.indexOf('--images') + 1] : null;
  if (!images && args.indexOf('--no-images') < 0) { images = [path.join(path.dirname(file), 'public'), path.join(path.dirname(file), '..', 'public')].filter((d) => fs.existsSync(d))[0] || null; }
  let found;
  try { found = load(file); } catch (e) { console.error(file + ' could not be loaded: ' + e.message); return 2; }
  if (!found.length) { console.error(file + ' defines no adventure. It should set FR.STORY = {...} or call FR.adventure(id, {...}).'); return 2; }
  let bad = 0; const beds = bedsBeside(file);
  found.forEach((a) => {
    const errs = check(a.def, beds ? { images: images, beds: beds } : { images: images }), name = (a.def && a.def.title) || a.id || 'adventure';
    if (!errs.length) { const c = (a.def.flow.chapters || []); console.log('OK  ' + name + ': format ' + a.def.schema + ', ' + c.length + ' chapters, ' + c.reduce((n, x) => n + x.scenes.length, 0) + ' scenes, ' + Object.keys(a.def.flags || {}).length + ' flags' + (images ? ', pictures checked in ' + images : ', pictures not checked') + (beds ? ', soundscapes checked against cartridge.js' : '')); }
    else { bad += errs.length; console.log(name + ': ' + errs.length + (errs.length === 1 ? ' problem' : ' problems')); errs.forEach((e) => console.log('  - ' + e)); }
    errs.warnings.forEach((w) => console.log('  ! ' + w));
  });
  return bad ? 1 : 0;
}

module.exports = { check: check, load: load, LIMITS: LIMITS };
if (require.main === module) { process.exit(main(process.argv)); }
