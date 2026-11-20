const { chromium } = require('playwright');
const out = __dirname + '/shots-preview/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } });
  const errs = [];
  const mk = async (vp) => { const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 }); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/404|GL Driver/.test(m.text())) errs.push(m.text().slice(0, 200)); }); return p; };
  // demo path + flick + lucky reroll logic + damage flow
  let p = await mk({ width: 390, height: 844 });
  await p.goto('http://127.0.0.1:8787/'); await p.waitForTimeout(1500);
  await p.click('#b-have'); await p.waitForTimeout(700);
  console.log('demo hero:', await p.textContent('#pl-name'), '|', await p.textContent('#pl-sub'));
  await p.click('.tab >> text=Fight'); await p.click('.row >> nth=1'); // first attack
  await p.waitForFunction(() => document.getElementById('d-total').textContent !== '', null, { timeout: 120000 });
  console.log('attack:', await p.textContent('#d-title'), await p.textContent('#d-total'), '|', await p.textContent('#d-math'), '| second:', await p.textContent('#d-second'), await p.isHidden('#d-second'));
  if (!(await p.isHidden('#d-second'))) {
    await p.click('#d-second'); await p.waitForTimeout(400);
    await p.waitForFunction(() => document.getElementById('d-total').textContent !== '', null, { timeout: 120000 });
    console.log('after second:', await p.textContent('#d-title'), await p.textContent('#d-note'), await p.textContent('#d-total'), '|', await p.textContent('#d-math'), '|', await p.textContent('#d-say'));
  }
  // flick
  await p.mouse.move(200, 520); await p.mouse.down(); await p.mouse.move(210, 470, { steps: 2 }); await p.mouse.move(240, 330, { steps: 3 }); await p.mouse.up();
  await p.waitForTimeout(300); console.log('after flick say:', await p.textContent('#d-say'));
  await p.waitForFunction(() => document.getElementById('d-total').textContent !== '', null, { timeout: 120000 });
  console.log('flick result:', await p.textContent('#d-total'));
  await p.click('#d-close'); await p.waitForTimeout(500); console.log('back on:', await p.getAttribute('#app', 'data-screen'));
  await p.close();
  // desktop + small phone
  p = await mk({ width: 1280, height: 800 }); await p.goto('http://127.0.0.1:8766/'); await p.waitForTimeout(2200); await p.screenshot({ path: out + 'desk-title.png' });
  await p.click('#b-have'); await p.waitForTimeout(900); await p.screenshot({ path: out + 'desk-play.png' }); await p.close();
  p = await mk({ width: 360, height: 640 }); await p.goto('http://127.0.0.1:8766/'); await p.waitForTimeout(1500); await p.screenshot({ path: out + 'small-title.png' });
  await p.click('#b-begin'); await p.waitForTimeout(500); await p.click((await p.isVisible('#b-skip-ledger')) ? '#b-skip-ledger' : '#b-join'); await p.waitForTimeout(700); await p.screenshot({ path: out + 'small-quiz.png' });
  const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, card: document.getElementById('q-card').getBoundingClientRect().bottom, lean: document.querySelector('.lean').getBoundingClientRect().top }));
  console.log('small overflow', JSON.stringify(ov));
  await p.close();
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.log('FAILED', e.message.slice(0, 400)); process.exit(1); });
