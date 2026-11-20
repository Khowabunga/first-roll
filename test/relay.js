// node test/relay.js [port]
// For testing the Cloudflare Worker on a machine whose only way out is an HTTPS proxy:
// the local Worker calls this, and this calls OpenAI. Run with NODE_USE_ENV_PROXY=1.
const http = require('http');
const port = Number(process.argv[2]) || 8799;
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) { chunks.push(c); }
  try {
    const r = await fetch('https://api.openai.com' + req.url, { method: req.method, headers: { Authorization: req.headers.authorization || '', 'Content-Type': 'application/json' }, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' }); res.end(buf);
  } catch (e) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'relay: ' + e.message } })); }
}).listen(port, '127.0.0.1', () => console.log('relay on ' + port));
