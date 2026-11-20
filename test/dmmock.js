// Exercise the hosted-page paths with a stand-in for the viewer's window.claude.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } });
  for (const mode of ['claude', 'none', 'denied']) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
    if (mode !== 'none') {
      await p.addInitScript((mode) => {
        const sample = () => Promise.resolve({ text: 'x', truncated: false });
        sample.json = (input) => mode === 'denied' ? Promise.reject({ code: 'not_granted', message: 'no' }) : new Promise((r) => setTimeout(() => r({ ask: 'Stealth, medium (13)', yes: 'MOCK yes. Prompt length ' + input.length, no: 'MOCK no', read: 'MOCK read', note: 'MOCK note' }), 200));
        let speaking = false;
        const tts = { speak: () => { speaking = true; window.__spoke = (window.__spoke || 0) + 1; return Promise.resolve({ playedMs: 1 }); }, stop: () => { speaking = false; return Promise.resolve(); }, active: () => speaking, onState: () => () => {} };
        const dictation = { start: () => { window.__mic = 'on'; return Promise.resolve(); }, stop: () => Promise.resolve(), active: () => false, onFinal: (h) => { window.__final = h; return () => {}; }, onPartial: () => () => {}, onState: () => () => {} };
        window.claude = { use: (n) => Promise.resolve({ sample, tts, dictation }[n] || null) };
      }, mode);
    }
    await p.goto('http://127.0.0.1:8766/'); await p.waitForTimeout(1800);
    await p.click('#b-dm'); await p.click((await p.isVisible('#b-dm-skip')) ? '#b-dm-skip' : '#b-dm-in'); await p.waitForTimeout(300); await p.click('.outs .btn'); await p.waitForTimeout(400);
    await p.click('.outs .btn >> nth=0'); await p.click('.outs .btn >> nth=0'); await p.waitForTimeout(400);
    const src0 = await p.textContent('.ask-src');
    await p.fill('#dm-input', 'they build a ramp out of snow'); await p.press('#dm-input', 'Enter');
    await p.waitForFunction(() => !document.querySelector('.ai-wait'), null, { timeout: 20000 });
    const card = (await p.textContent('.ai >> nth=-1')).slice(0, 230);
    const say = await p.$('.read-say'); if (say) { await say.click(); }
    const mic = await p.$('#dm-mic'); if (mic) { await mic.click(); await p.evaluate(() => window.__final && window.__final({ text: ' and slide down it' })); }
    console.log(mode, '|', src0.slice(0, 44), '|', card, '| narrate btn:', !!say, 'spoke:', await p.evaluate(() => window.__spoke || 0), '| mic:', !!mic, await p.inputValue('#dm-input'), '| src after:', (await p.textContent('.ask-src')).slice(0, 30), '| errs', errs);
    await p.close();
  }
  await b.close();
})().catch((e) => { console.log('FAILED', e.message.slice(0, 400)); process.exit(1); });
