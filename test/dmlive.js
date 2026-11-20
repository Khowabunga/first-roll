const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForTimeout(2000);
  await p.click('#b-dm'); await p.click((await p.isVisible('#b-dm-skip')) ? '#b-dm-skip' : '#b-dm-in'); await p.waitForTimeout(300);
  await p.click('.dmtab >> text=Party'); await p.click('text=Add a player'); await p.fill('#pt-who-0', 'Sam'); await p.fill('#pt-name-0', 'Bolt Starhoof'); await p.selectOption('#pt-race-0', 'Reindeer'); await p.selectOption('#pt-cls-0', 'Sleigh Pilot');
  await p.click('text=Add a player'); await p.fill('#pt-who-1', 'Ana'); await p.fill('#pt-name-1', 'Ginger McCrumble'); await p.selectOption('#pt-race-1', 'Gingerbread'); await p.selectOption('#pt-cls-1', 'Chimney Sneak'); await p.press('#pt-name-1', 'Tab');
  await p.click('.dmtab >> text=Run'); await p.click('.outs .btn'); await p.waitForTimeout(300);
  for (let i = 0; i < 4; i++) { await p.click('.outs .btn >> nth=0'); await p.waitForTimeout(250); }   // through arrival
  await p.click('.errand >> text=The Coal'); await p.waitForTimeout(300); await p.click('.outs .btn >> nth=0'); await p.waitForTimeout(300);
  await p.fill('#dm-input', 'Ginger pretends to be a lump of coal to hide on the shelf while Bolt distracts the soot sprites by juggling'); await p.press('#dm-input', 'Enter');
  await p.waitForFunction(() => !document.querySelector('.ai-wait'), null, { timeout: 60000 });
  console.log((await p.textContent('.ai >> nth=-1')).slice(0, 900));
  await p.waitForTimeout(600); await p.screenshot({ path: __dirname + '/shots-dm/ai-context.png' });
  await p.click('.dmtab >> text=Dictionary'); await p.click('.seg3 button >> text=Places'); await p.click('.lk >> text=The List Office'); await p.waitForTimeout(700); await p.screenshot({ path: __dirname + '/shots-dm/sheet-place.png' });
  console.log('errs', errs); await b.close();
})().catch((e) => { console.log('FAILED', e.message.slice(0, 400)); process.exit(1); });
