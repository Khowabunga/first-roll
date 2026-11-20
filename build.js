/* Builds the single-page app from src/ into:
   public/index.html    - the app itself. public/ is the whole website: server.js and Cloudflare
                          both serve it as it is, and its img/ and vendor/ folders live there.
   public/offline.html  - the same, for opening straight from disk (not deployed)
   dist/first-roll.html - the same page for a static preview (libraries from a CDN)
   Run this after editing anything in src/, and commit public/index.html with your change. */
const fs = require('fs'), path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const css = read('src/styles.css');
const js = ['src/data.js', 'src/theme-northpole.js', 'src/story-cookie.js', 'src/dice.js', 'src/app.js', 'src/table.js', 'src/dm.js'].map(read).join('\n');
const page = (libs) => read('src/index.html').replace('/*CSS*/', () => css).replace('<!--LIBS-->', () => libs).replace('/*JS*/', () => js);
const local = '<script src="vendor/three.min.js"></script>\n<script src="vendor/cannon.min.js"></script>\n<script src="vendor/qrcode.js" defer></script>';
const cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js"></script>';
const shell = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const inline = {};
for (const f of ['img/table.webp', 'img/np_table.webp']) { inline[f] = 'data:image/webp;base64,' + fs.readFileSync(path.join(__dirname, 'public', f)).toString('base64'); }
const offline = page(local + '\n<script>window.FR_INLINE = ' + JSON.stringify(inline) + ';</script>');
fs.writeFileSync(path.join(__dirname, 'public/index.html'), shell + page(local) + '</body></html>');      // what the server serves
fs.writeFileSync(path.join(__dirname, 'public/offline.html'), shell + offline + '</body></html>');        // for opening straight from disk
fs.writeFileSync(path.join(__dirname, 'Open First Roll.html'), '<!doctype html><meta charset="utf-8"><title>First Roll</title><meta http-equiv="refresh" content="0; url=public/offline.html"><p><a href="public/offline.html">Open First Roll</a></p>');
fs.writeFileSync(path.join(__dirname, 'dist/first-roll.html'), page(cdn));
fs.writeFileSync(path.join(__dirname, 'public/_headers'), '/img/*\n  Cache-Control: public, max-age=604800\n/vendor/*\n  Cache-Control: public, max-age=604800\n');   // read by Cloudflare
fs.writeFileSync(path.join(__dirname, 'public/.assetsignore'), 'offline.html\n');
console.log('built', (fs.statSync(path.join(__dirname, 'dist/first-roll.html')).size / 1024).toFixed(0) + ' KB page,', fs.readdirSync(path.join(__dirname, 'public/img')).length, 'images');
