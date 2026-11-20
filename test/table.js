// node test/table.js [url] [passcode] [paint|nopaint]
// One DM and two players, each on their own "phone", at one table.
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8787/', passcode = process.argv[3] || '', doPaint = process.argv[4] !== 'nopaint';
const out = __dirname + '/shots-table/'; require('fs').mkdirSync(out, { recursive: true });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
  const mk = async (who) => {
    const ctx = await b.newContext(phone), p = await ctx.newPage();
    p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver|GPU stall|404|403/.test(m.text())) console.log(who, 'console', m.type(), m.text().slice(0, 240)); });
    p.on('pageerror', (e) => console.log(who, 'PAGEERROR', e.message.slice(0, 300)));
    return p;
  };
  const dm = await mk('dm'), a = await mk('maya'), c = await mk('sam');
  const shot = (p, n) => p.screenshot({ path: out + n + '.png' });

  /* the DM opens a table */
  await dm.goto(url); await dm.waitForTimeout(2200);
  await dm.click('#b-dm'); await dm.waitForTimeout(600);
  if (passcode) {
    await dm.fill('#dm-pass', 'wrong'); await dm.click('#b-dm-in'); await dm.waitForTimeout(700);
    console.log('wrong passcode ->', await dm.textContent('#dm-err'));
    await shot(dm, '01-door');
    await dm.fill('#dm-pass', passcode);
  }
  await dm.click('#b-dm-in'); await dm.waitForSelector('.tb-code b', { timeout: 15000 }); await dm.waitForTimeout(700);
  const code = await dm.textContent('.tb-code b');
  console.log('table code:', code, '| link:', await dm.inputValue('.tb-link input'), '| qr:', !!(await dm.$('.tb-qr svg')));
  await shot(dm, '02-dm-table-empty');

  /* players join on their own phones */
  const join = async (p, name, viaLink, picks) => {
    await p.goto(viaLink ? url + '?t=' + code : url); await p.waitForTimeout(2200);
    await p.click('#b-begin'); await p.waitForTimeout(600);
    await p.fill('#j-name', name);
    if (!viaLink) { await p.fill('#j-code', 'zzzz'); await p.click('#b-join'); await p.waitForTimeout(800); console.log(name, 'bad code ->', await p.textContent('#j-err')); await p.fill('#j-code', code.toLowerCase()); }
    if (name === 'Maya') { await shot(p, '03-player-join'); }
    await p.click('#b-join'); await p.waitForTimeout(1500);
    if (await p.getAttribute('#app', 'data-screen') === 'story') { for (let i = 0; i < 3; i++) { await p.waitForTimeout(500); await p.click('#st-next'); } await p.waitForTimeout(700); }
    for (let i = 0; i < 12; i++) { await p.click('#q-answers .ans >> nth=' + picks[i]); await p.waitForTimeout(800); }
    await p.waitForTimeout(4200);
    console.log(name, 'became:', await p.textContent('#r-title'), '|', await p.textContent('#r-sub'));
  };
  await Promise.all([join(a, 'Maya', true, [3, 3, 3, 0, 2, 2, 1, 2, 2, 2, 2, 2]), join(c, 'Sam', false, [0, 1, 0, 2, 0, 3, 0, 0, 3, 0, 1, 0])]);

  /* Maya paints a portrait and goes to play; Sam stays on the reveal screen */
  await a.click('#b-to-portrait'); await a.waitForTimeout(700);
  await a.click('#p-groups .chip >> text=Female'); await a.click('#b-paint');
  await a.waitForFunction(() => !document.getElementById('p-img').hidden, null, { timeout: 150000 }); await a.waitForTimeout(1500);
  console.log('maya portrait note:', await a.textContent('#p-src'));
  await a.click('#b-keep'); await a.waitForTimeout(5000); await a.click('#b-play'); await a.waitForTimeout(3500);
  await shot(a, '04-player-play');
  console.log('maya chip:', await a.textContent('#pl-table'), '| inbox hidden:', await a.getAttribute('#pl-inbox', 'hidden') !== null);

  await dm.waitForTimeout(3000); await shot(dm, '05-dm-table-players');
  console.log('dm sees:', await dm.$$eval('.tb-list >> nth=0 >> .tb-p', (r) => r.map((x) => x.textContent)));
  console.log('dm chip:', await dm.textContent('#dm-table'));

  /* a note to everyone */
  await dm.fill('#tb-note', 'Psst. Whatever you do, do not eat the green ones.'); await dm.click('.dmsheet .btn.wax'); await dm.waitForTimeout(600);
  console.log('toast:', await dm.textContent('#dm-toast'));
  await a.waitForSelector('#handout:not([hidden])', { timeout: 8000 }); await a.waitForTimeout(500); await shot(a, '06-player-note');
  console.log('maya got:', await a.textContent('#ho-title'), '|', await a.textContent('#ho-text'));
  await c.waitForSelector('#handout:not([hidden])', { timeout: 8000 }); console.log('sam got:', await c.textContent('#ho-text'));
  await a.click('#ho-ok'); await c.click('#ho-ok');

  /* the DM starts the story and shows the chapter picture */
  await dm.click('#dm-sheet-x'); await dm.waitForTimeout(300);
  await dm.click('text=Begin the story'); await dm.waitForTimeout(900);
  await shot(dm, '07-dm-chapter');
  await dm.click('.chap-wrap .btn.show'); await dm.waitForTimeout(500);
  await a.waitForSelector('#handout:not([hidden])', { timeout: 8000 }); await a.waitForTimeout(900); await shot(a, '08-player-picture');
  console.log('maya picture:', await a.textContent('#ho-title'), '|', await a.getAttribute('#ho-img', 'src'), '|', await a.textContent('#ho-count'));
  await a.click('#ho-prev'); await a.waitForTimeout(300); console.log('maya older:', await a.textContent('#ho-title'), await a.textContent('#ho-count'));
  await a.click('#ho-ok'); await a.waitForTimeout(300);
  console.log('maya inbox:', await a.textContent('#pl-inbox'));

  /* a dictionary entry */
  await dm.click('.dmtab >> nth=2'); await dm.waitForTimeout(400); await dm.click('.lk >> nth=0'); await dm.waitForTimeout(500);
  await dm.evaluate(() => { const s = document.getElementById('dm-sheet-b'); s.scrollTop = s.scrollHeight; }); await dm.waitForTimeout(300); await shot(dm, '09-dm-dictionary-send');
  await dm.click('#dm-sheet-b .btn.show'); await dm.waitForTimeout(3200);
  console.log('sam now has:', await c.textContent('#ho-title'), '|', await c.textContent('#ho-count'));
  await c.click('#ho-ok'); await a.click('#ho-ok').catch(() => {});
  await dm.click('#dm-sheet-x'); await dm.click('.dmtab >> nth=3'); await dm.waitForTimeout(500); await shot(dm, '10-dm-party');
  await dm.click('.dmtab >> nth=0'); await dm.waitForTimeout(400);

  if (doPaint) {
    /* paint the scene, then show it */
    console.log('chips:', await dm.$$eval('.ask-chips .chipd', (x) => x.map((y) => y.textContent)));
    let t = Date.now();
    await dm.click('.chipd >> text=Paint the scene'); await dm.waitForTimeout(1500); await shot(dm, '11-dm-painting');
    await dm.waitForSelector('.pic img', { timeout: 200000 }); await dm.waitForTimeout(2500);
    console.log('scene painted in', Math.round((Date.now() - t) / 1000), 's |', await dm.getAttribute('.pic img', 'src'));
    console.log('brief:', await dm.evaluate(() => FR.dm.state().feed.filter((e) => e.k === 'pic')[0].brief));
    await dm.evaluate(() => { const n = document.querySelector('.pic'); document.getElementById('dm-body').scrollTop = n.offsetTop - 8; }); await dm.waitForTimeout(600); await shot(dm, '12-dm-painted');
    await dm.click('.pic .btn.show'); await a.waitForSelector('#handout:not([hidden])', { timeout: 8000 }); await a.waitForTimeout(1800); await shot(a, '13-player-scene');
    await a.click('#ho-ok'); await c.click('#ho-ok').catch(() => {});

    /* something happens, and the DM paints that */
    await dm.fill('#dm-input', 'Maya rides a runaway cookie cart down the hill like a sled'); await dm.press('#dm-input', 'Enter');
    await dm.waitForSelector('.ai .ai-res', { timeout: 60000 }); await dm.click('.ai-res .btn >> nth=0'); await dm.waitForTimeout(600);
    t = Date.now();
    await dm.click('.ai .mini'); await dm.waitForFunction(() => document.querySelectorAll('.pic img').length === 2, null, { timeout: 200000 }); await dm.waitForTimeout(2500);
    console.log('moment painted in', Math.round((Date.now() - t) / 1000), 's');
    console.log('brief:', await dm.evaluate(() => FR.dm.state().feed.filter((e) => e.k === 'pic')[1].brief));
    await dm.evaluate(() => { const n = document.querySelectorAll('.pic')[1]; document.getElementById('dm-body').scrollTop = n.offsetTop - 8; }); await dm.waitForTimeout(600); await shot(dm, '14-dm-moment');
    await dm.click('.pic >> nth=1 >> .btn.show'); await a.waitForSelector('#handout:not([hidden])', { timeout: 8000 }); await a.waitForTimeout(1800); await shot(a, '15-player-moment');
    for (const n of ['.pic img >> nth=0', '.pic img >> nth=1']) { const src = await dm.getAttribute(n, 'src'); const buf = await dm.evaluate(async (s) => { const r = await fetch(s); const bl = await r.blob(); return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(bl); }); }, src); require('fs').writeFileSync(out + 'painted-' + n.slice(-1) + '.webp', Buffer.from(buf, 'base64')); }
  }

  /* reloading a phone keeps the seat */
  await a.reload(); await a.waitForTimeout(3000);
  console.log('after reload, maya at table:', await a.evaluate(() => FR.table.isPlayer() + ' ' + FR.table.code() + ' feed ' + FR.table.feed().length));
  await dm.reload(); await dm.waitForTimeout(2500); await dm.click('#b-dm'); await dm.waitForTimeout(500);
  console.log('dm door after reload:', await dm.textContent('#b-dm-in'), '| passcode hidden:', await dm.getAttribute('#dm-pass-wrap', 'hidden') !== null);
  await dm.click('#b-dm-in'); await dm.waitForTimeout(1500); await shot(dm, '16-dm-back');
  console.log('dm pics after reload:', await dm.$$eval('.pic img', (x) => x.length), '| chip:', await dm.textContent('#dm-table'));
  await b.close();
})().catch((e) => { console.log('FAILED', e.message.slice(0, 600)); process.exit(1); });
