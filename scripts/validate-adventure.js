/* First Roll: checks an adventure before it reaches a table.

   An adventure is data that src/dm.js plays (the format is written up at the top of the first
   adventure file). A typo in it would otherwise show up as a blank screen in the middle of
   somebody's game night, so this reads the whole thing the way the runner will and reports
   everything that could go wrong, in plain words, with where it is.

   As a module:   const { check } = require('./scripts/validate-adventure.js');
                  const problems = check(adventure, { images: 'public' });   // [] when it is fine
   From a shell:  node scripts/validate-adventure.js scenarios/northpole/adventure.js --images scenarios/northpole
                  node scripts/validate-adventure.js my-pack.js --images public
                  (--no-images skips the picture check; without either, a "public" folder beside
                  or above the file is used if there is one)

   The file may set FR.STORY = {...} or call FR.adventure('id', {...}); both are understood. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

/* ---------- what each part of an adventure may contain ---------- */
const KEYS = {
  top: ['schema', 'id', 'title', 'kicker', 'length', 'table', 'cover', 'pitch', 'howto', 'bible', 'flags', 'scores', 'clock', 'flow', 'helper', 'painter', 'labels'],
  bible: ['truths', 'outline', 'people', 'places', 'things'],
  person: ['id', 'name', 'full', 'role', 'img', 'where', 'look', 'voice', 'wants', 'secret', 'lines'],
  place: ['id', 'name', 'img', 'blurb', 'senses'],
  thing: ['id', 'name', 'blurb', 'img'],
  flag: ['values', 'tell', 'words', 'short'],
  clock: ['deadline', 'times'],
  flow: ['start', 'chapters', 'interludes', 'hubs', 'shortcuts'],
  chapter: ['id', 'title', 'img', 'place', 'time', 'length', 'goal', 'flag', 'perks', 'scenes', 'leaving', 'next'],
  scene: ['id', 'title', 'read', 'notes', 'notesFirst', 'cast', 'things', 'paint', 'tries', 'otherwise', 'also', 'extras', 'versions', 'outcomes'],
  interlude: ['img', 'place', 'time', 'length', 'goal', 'next'],                 // on top of everything a scene may have
  attempt: ['try', 'roll', 'yes', 'no'],
  outcome: ['id', 'label', 'log', 'sets', 'skip', 'scene', 'to', 'end'],
  versions: ['ask', 'flag', 'options', 'suggest'],
  hub: ['id', 'title', 'first', 'goal', 'help', 'options', 'next'],
  option: ['to', 'title', 'where', 'who', 'feel', 'img', 'log'],
  shortcut: ['to', 'at', 'button', 'label', 'log'],
  helper: ['role', 'tone', 'voice', 'fail', 'flagsHeading', 'builtin'],
  builtin: ['twists', 'yes', 'no', 'nothingYet'],
  painter: ['role', 'tone', 'style', 'heroLook', 'heroes'],
  labels: ['hero', 'race', 'cls', 'partyHelp']
};
const COUNTS = ['picks', 'interludes', 'chapters'];

/* Objects made in another script context (the command line loads a file that way) are still plain
   objects, so look at their shape rather than at whose Object made them. */
const isList = Array.isArray;
const isObj = (v) => { if (v === null || typeof v !== 'object' || isList(v)) { return false; } const p = Object.getPrototypeOf(v); return Object.prototype.toString.call(v) === '[object Object]' && (p === null || Object.getPrototypeOf(p) === null); };
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const show = (v) => (typeof v === 'string' ? '"' + v + '"' : String(v));

function check(def, opts) {
  opts = opts || {};
  const errs = [], seenErr = {};
  const err = (where, msg) => { const line = where + ': ' + msg; if (!seenErr[line]) { seenErr[line] = 1; errs.push(line); } };

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
  const known = (o, kind, where, extra) => { Object.keys(o).forEach((k) => { if (KEYS[kind].indexOf(k) < 0 && (extra || []).indexOf(k) < 0) { err(where, 'has "' + k + '", which is not part of an adventure (' + kind + ' may have: ' + KEYS[kind].concat(extra || []).join(', ') + ')'); } }); };
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
  if (def.schema !== 1) { err('schema', 'must be 1 (the format this checker knows); found ' + show(def.schema)); }
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
      KEYS[kind].filter((f) => ['id', 'name', 'img', 'lines'].indexOf(f) < 0).forEach((f) => text(x, f, at, kind !== 'person' && f === 'blurb'));
      if (kind === 'person') { texts(x, 'lines', at); }
    });
  });

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

  /* a scene, or an interlude (a scene with a banner). `siblings` are the scene ids it may jump to. */
  const scene = (s, at, siblings, extra) => {
    known(s, 'scene', at, extra); text(s, 'title', at, true); text(s, 'paint', at); text(s, 'otherwise', at);
    if (s.notesFirst !== undefined && typeof s.notesFirst !== 'boolean') { err(at + '.notesFirst', 'must be true or false'); }
    const v = obj(s, 'versions', at);
    if (!v) { if (!isList(s.read) || !s.read.length) { err(at + '.read', 'is empty: this scene has nothing to read aloud'); } }
    texts(s, 'read', at); texts(s, 'notes', at);
    [['cast', 'people', 'person'], ['things', 'things', 'thing']].forEach(([k, shelf, word]) => { if (s[k] === undefined) { return; } if (!isList(s[k])) { err(at + '.' + k, 'must be a list of ids'); return; } s[k].forEach((id) => { if (!book[shelf][id]) { err(at + '.' + k, 'names the ' + word + ' "' + id + '", ' + (word === 'person' ? 'who' : 'which') + ' is not in bible.' + shelf); } }); });
    listOf(s, 'tries', at).forEach((t, i) => { const ta = at + '.tries[' + i + ']'; known(t, 'attempt', ta); text(t, 'try', ta, true); text(t, 'roll', ta, true); ['yes', 'no'].forEach((k) => { if (t[k] !== undefined && typeof t[k] !== 'string') { err(ta + '.' + k, 'must be text (it may be empty)'); } }); });
    conditional(s, 'also', at, 'read'); conditional(s, 'extras', at, 'read');
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
    if (s.place !== undefined && !book.places[s.place]) { err(at + '.place', 'names the place "' + s.place + '", which is not in bible.places'); }
    rules(s, at, true);
  });
  hubs.forEach((h, i) => {
    const at = 'flow.hubs[' + tag(h, i) + ']';
    known(h, 'hub', at); text(h, 'title', at, true); ['first', 'goal', 'help'].forEach((k) => text(h, k, at));
    const options = listOf(h, 'options', at, true);
    if (!options.length) { err(at + '.options', 'a hub needs at least one thing to choose'); }
    options.forEach((o, oi) => {
      const oa = at + '.options[' + (isText(o.to) ? o.to : oi) + ']'; known(o, 'option', oa); text(o, 'title', oa, true); ['where', 'who', 'feel', 'log'].forEach((k) => text(o, k, oa)); picture(o, 'img', oa);
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
  if (opts.images) {
    pictures.forEach(([where, p]) => { if (/^(https?:|data:)/.test(p)) { return; } if (!fs.existsSync(path.join(opts.images, p))) { err(where, 'the picture "' + p + '" is not in ' + opts.images); } });
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

function main(argv) {
  const args = argv.slice(2), file = args.filter((a, i) => a.indexOf('--') !== 0 && args[i - 1] !== '--images')[0];
  if (!file) { console.error('usage: node scripts/validate-adventure.js <adventure file> [--images <folder> | --no-images]'); return 2; }
  let images = args.indexOf('--images') >= 0 ? args[args.indexOf('--images') + 1] : null;
  if (!images && args.indexOf('--no-images') < 0) { images = [path.join(path.dirname(file), 'public'), path.join(path.dirname(file), '..', 'public')].filter((d) => fs.existsSync(d))[0] || null; }
  let found;
  try { found = load(file); } catch (e) { console.error(file + ' could not be loaded: ' + e.message); return 2; }
  if (!found.length) { console.error(file + ' defines no adventure. It should set FR.STORY = {...} or call FR.adventure(id, {...}).'); return 2; }
  let bad = 0;
  found.forEach((a) => {
    const errs = check(a.def, { images: images }), name = (a.def && a.def.title) || a.id || 'adventure';
    if (!errs.length) { const c = (a.def.flow.chapters || []); console.log('OK  ' + name + ': ' + c.length + ' chapters, ' + c.reduce((n, x) => n + x.scenes.length, 0) + ' scenes, ' + Object.keys(a.def.flags || {}).length + ' flags' + (images ? ', pictures checked in ' + images : ', pictures not checked')); return; }
    bad += errs.length; console.log(name + ': ' + errs.length + (errs.length === 1 ? ' problem' : ' problems')); errs.forEach((e) => console.log('  - ' + e));
  });
  return bad ? 1 : 0;
}

module.exports = { check: check, load: load };
if (require.main === module) { process.exit(main(process.argv)); }
