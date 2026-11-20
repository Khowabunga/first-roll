const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 await p.goto('http://127.0.0.1:8765/test/dice.html'); await p.waitForTimeout(900);
 let worst=0; for (let i=0;i<3;i++){ await p.evaluate((s)=>window.go(s), i===0?[6,6,6,6,6,6]:(i===1?[20,20,12,10]:[4,8,6,20,12,10])); await p.waitForTimeout(300); await p.screenshot({path:__dirname+'/lit'+i+'.png'}); }
 await b.close(); })();
