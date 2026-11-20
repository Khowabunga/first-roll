// node walk2.js <theme> <live|nolive> <url>
const { chromium } = require('playwright');
const theme = process.argv[2] || 'northpole', live = process.argv[3] !== 'nolive', url = process.argv[4] || 'http://127.0.0.1:8787/';
const out = __dirname + '/shots-' + theme + (live ? '' : '-preview') + '/'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver|GPU stall|404/.test(m.text())) console.log('console', m.type(), m.text().slice(0, 240)); });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
  const shot = async (n) => { await p.screenshot({ path: out + n + '.png' }); };
  const landed = () => p.waitForFunction(() => document.getElementById('d-total').textContent !== '', null, { timeout: 150000 });
  await p.goto(url); await p.waitForTimeout(2500);
  console.log('default theme:', await p.getAttribute('body', 'data-theme'));
  if (theme === 'tavern') { await p.click('.theme-card >> text=Tavern Night'); await p.waitForTimeout(900); }
  console.log('theme now:', await p.getAttribute('body', 'data-theme'), '| note:', await p.textContent('#live-note'));
  await shot('01-title');
  await p.click('#b-begin'); await p.waitForTimeout(700); await shot('02-ledger');
  await p.fill('#j-name', 'Robin'); await p.click((await p.isVisible('#b-skip-ledger')) ? '#b-skip-ledger' : '#b-join'); await p.waitForTimeout(1200);
  if (await p.getAttribute('#app', 'data-screen') === 'story') {
    for (let i = 0; i < 3; i++) { await p.waitForTimeout(900); await shot('02s-story' + (i + 1)); await p.click('#st-next'); }
    await p.waitForTimeout(800);
  }
  await shot('03-quiz');
  const picks = theme === 'northpole' ? [3, 3, 3, 0, 2, 2, 1, 2, 2, 2, 2, 2] : [1, 0, 1, 1, 3, 2, 1, 1, 1, 1, 0, 2];
  for (let i = 0; i < 12; i++) { await p.click('#q-answers .ans >> nth=' + picks[i]); await p.waitForTimeout(900); }
  await p.waitForTimeout(4200); await shot('04-reveal');
  console.log('result:', await p.textContent('#r-title'), '|', await p.textContent('#r-sub'));
  await p.evaluate(() => { document.getElementById('reveal-scroll').scrollTop = 600; }); await p.waitForTimeout(900); await shot('04b-reveal-scroll');
  await p.click('#b-to-portrait'); await p.waitForTimeout(700);
  await p.click('#p-groups .chip >> text=Female'); await p.click('#b-surprise'); await p.waitForTimeout(live ? 6000 : 400);
  console.log('desc:', await p.inputValue('#p-desc'));
  await p.click('#b-paint'); await p.waitForTimeout(1500); await shot('05b-working');
  await p.waitForFunction(() => !document.getElementById('p-img').hidden, null, { timeout: 150000 });
  await p.waitForTimeout(2200); await p.evaluate(() => { document.querySelector('#s-portrait .scroll').scrollTop = 0; });
  console.log('src note:', await p.textContent('#p-src')); await shot('05c-portrait');
  await p.evaluate(() => { document.querySelector('#s-portrait .scroll').scrollTop = 520; }); await p.waitForTimeout(400); await shot('05d-portrait-controls');
  await p.click('#b-keep'); await p.waitForTimeout(live ? 6500 : 900); await shot('06-sheet');
  await p.evaluate(() => { document.querySelector('#s-sheet .scroll').scrollTop = 560; }); await p.waitForTimeout(500); await shot('06b-sheet-scroll');
  console.log('origin:', await p.textContent('#s-origin'));
  await p.click('#b-name'); await p.waitForTimeout(300); console.log('name:', await p.inputValue('#s-name'));
  await p.click('#b-play'); await p.waitForTimeout(800); await shot('07-play');
  await p.click('.tab >> nth=2'); await p.waitForTimeout(500); await shot('07b-fight');
  await p.click('.row >> nth=1'); await landed(); await p.waitForTimeout(700); await shot('08-attack');
  console.log('attack:', await p.textContent('#d-title'), await p.textContent('#d-total'), '|', await p.textContent('#d-math'), '|', await p.textContent('#d-say'));
  await p.click('#d-close'); await p.waitForTimeout(500); await p.click('.tab >> nth=0'); await p.waitForTimeout(300);
  await p.click('.row >> nth=2'); await landed(); await p.waitForTimeout(700); await shot('08b-check');
  await p.click('#d-rail button >> text=d6'); await p.waitForTimeout(200); await p.click('#d-more'); await p.click('#d-more'); await p.click('#d-more');
  await p.waitForFunction(() => document.getElementById('d-total').textContent !== '' && document.getElementById('d-count').textContent === '4', null, { timeout: 150000 }); await p.waitForTimeout(900); await shot('08c-4d6');
  await p.click('#d-close'); await p.waitForTimeout(400);
  if (await p.$('.row.extra')) {
    await p.evaluate(() => { const l = document.getElementById('pl-list'); l.scrollTop = l.scrollHeight; }); await p.waitForTimeout(300); await shot('07c-extra-row');
    await p.click('.row.extra'); await landed(); await p.waitForTimeout(700); await shot('09-cookie');
    console.log('cookie:', await p.textContent('#d-title'), await p.textContent('#d-total'), '|', await p.textContent('#d-math'));
  }
  await b.close();
})().catch((e) => { console.log('FAILED', e.message.slice(0, 400)); process.exit(1); });
