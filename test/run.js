const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') console.log('console',m.type(),m.text().slice(0,300)); });
  p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,300)));
  await p.goto('http://127.0.0.1:8765/test/dice.html'); await p.waitForTimeout(800);
  const specs={d20:[20], six:[4,6,8,10,12,20], fireball:[6,6,6,6], adv:[20,20]};
  for (const [k,s] of Object.entries(specs)) {
    const r=await p.evaluate((s)=>window.go(s), s);
    console.log(k, JSON.stringify(r), 'simT', await p.evaluate(()=>window.simT.toFixed(2)));
    await p.waitForTimeout(300); await p.screenshot({path:__dirname+'/shot_'+k+'.png'});
  }
  // distribution sanity: 200 d20 rolls + 200 d6
  const dist=await p.evaluate(async()=>{ const c={},c6={}; let cocked=0, tmax=0; for(let i=0;i<60;i++){ const r=await window.go([4,6,8,10,12,20]); r.flat.forEach(f=>{if(f<0.985)cocked++}); tmax=Math.max(tmax,window.simT); }
 for(let i=0;i<5;i++){ const r=await window.go([20]); c[r.v[0]]=(c[r.v[0]]||0)+1; if(r.flat[0]<0.985) cocked++; tmax=Math.max(tmax,window.simT); const r6=await window.go([6,6]); r6.v.forEach(v=>c6[v]=(c6[v]||0)+1); r6.flat.forEach(f=>{if(f<0.985)cocked++}); } return {c,c6,cocked,tmax,z:window.zs.reduce((a,b)=>a+b,0)/window.zs.length}; });
  console.log(JSON.stringify(dist));
  console.log('errs', await p.evaluate(()=>window.errs));
  await b.close();
})();
