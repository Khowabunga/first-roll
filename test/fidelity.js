// Same character, opposite selections: do the pictures follow the choices?
// node fidelity.js <server|file>
const { chromium } = require('playwright');
const how = process.argv[2] || 'server';
const out = __dirname + '/shots-fid/'; require('fs').mkdirSync(out, { recursive: true });
const sets = [
  { tag: 'A', pick: ['Male', 'Grandparent', 'Huge', 'Top hat', 'Round glasses', 'Grumpy'] },
  { tag: 'B', pick: ['Female', 'Little', 'Tiny', 'Earmuffs', 'Candy cane', 'Shy'] }
];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error' && !/404|ERR_FILE_NOT_FOUND|GL Driver/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  const url = how === 'file' ? 'file://' + require('path').resolve(__dirname, '../Open First Roll.html') : 'http://127.0.0.1:8787/';
  await p.goto(url); await p.waitForTimeout(2500);
  console.log('at', p.url().slice(0, 60), '| note:', await p.textContent('#live-note'), '| connect btn hidden:', await p.isHidden('#b-connect-title'));
  if (how === 'file') {
    await p.screenshot({ path: out + 'file-title.png' });
    await p.click('#b-connect-title'); await p.waitForTimeout(500); await p.screenshot({ path: out + 'file-connect.png' });
    await p.fill('#okey', 'sk-test-this-is-a-placeholder-key-0000'); await p.click('#b-okey-save'); await p.waitForTimeout(3500);
    console.log('after connect:', await p.textContent('#live-note'), '| screen', await p.getAttribute('#app', 'data-screen'));
  }
  await p.click('#b-begin'); await p.waitForTimeout(400); await p.click((await p.isVisible('#b-skip-ledger')) ? '#b-skip-ledger' : '#b-join'); await p.waitForTimeout(600);
  if (await p.getAttribute('#app', 'data-screen') === 'story') { await p.click('#st-skip'); await p.waitForTimeout(500); }
  const picks = [3, 3, 3, 0, 2, 2, 1, 2, 2, 2, 2, 2];
  for (const k of picks) { await p.click('#q-answers .ans >> nth=' + k); await p.waitForTimeout(820); }
  await p.waitForTimeout(4000); console.log('character:', await p.textContent('#r-title'));
  await p.click('#b-to-portrait'); await p.waitForTimeout(600);
  for (const s of sets) {
    for (const c of s.pick) { await p.click('#p-groups .chip >> text="' + c + '"'); await p.waitForTimeout(80); }
    if (s.tag === 'A') {
      // Surprise me must keep every choice already made
      const before = await p.$$eval('#p-groups .chip.on', (x) => x.map((c) => c.textContent).join(','));
      await p.click('#b-surprise'); await p.waitForTimeout(7000);
      const after = await p.$$eval('#p-groups .chip.on', (x) => x.map((c) => c.textContent).join(','));
      console.log('surprise kept choices:', before === after, '|', after, '| desc:', await p.inputValue('#p-desc'));
    }
    await p.click('#b-paint');
    await p.waitForFunction(() => !document.getElementById('p-img').hidden && document.getElementById('p-img').src.startsWith('data:') && !document.getElementById('b-paint').disabled, null, { timeout: 180000 });
    await p.waitForTimeout(2000); await p.evaluate(() => { document.querySelector('#s-portrait .scroll').scrollTop = 0; });
    console.log(s.tag, 'note:', await p.textContent('#p-src'), '| tag hidden:', await p.isHidden('#p-tag'));
    console.log(s.tag, 'prompt:', (await p.evaluate(() => FRState().lastPrompt)).slice(0, 520));
    await p.screenshot({ path: out + how + '-' + s.tag + '.png' });
    if (s.tag === 'A') {
      // changing a choice afterwards: the auto description goes, and the picture is marked out of date
      await p.click('#p-groups .chip >> text="Grumpy"'); await p.waitForTimeout(200);
      console.log('after a change -> desc empty:', (await p.inputValue('#p-desc')) === '', '| note:', (await p.textContent('#p-src')).slice(0, 60));
      for (const c of ['Male', 'Grandparent', 'Huge', 'Top hat', 'Round glasses']) { await p.click('#p-groups .chip >> text="' + c + '"'); await p.waitForTimeout(60); }   // clear set A
    }
  }
  console.log('errors:', errs); await b.close();
})().catch((e) => { console.log('FAILED', e.message.slice(0, 500)); process.exit(1); });
