/* First Roll on Cloudflare. This file is only the wiring; the rules live in server/core.js,
   which the tests run as well.

   - The Worker (the default export) serves the app from ./public and hands every /api call to
     the front door in core.js, which finds the right table.
   - Table (a Durable Object, one per table code) is where one table lives. It gives core.js its
     saved storage, so a table survives being put to sleep between requests. It deletes itself
     after thirty idle days, or an hour after its DM closes it.

   Secrets (Worker > Settings > Variables and Secrets): OPENAI_API_KEY and DM_PASSCODE.
   Without both, the site still runs but shows sample pictures only.
   To run it on your own computer:  npx wrangler dev */
import { DurableObject } from 'cloudflare:workers';
import { createApi, TableCore } from './server/core.js';

/* Who is asking, for the guess counters. One home or phone gets a whole block of IPv6 addresses (a /64),
   so those are counted together; otherwise a guesser could take a fresh address for every try. */
function network(ip) {
  if (ip.indexOf(':') < 0) { return ip; }
  const halves = ip.toLowerCase().split('::'), head = halves[0] ? halves[0].split(':') : [], tail = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const all = halves.length > 1 ? head.concat(Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), tail) : head;
  return all.slice(0, 4).map((h) => h.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

const api = createApi();        // made once per running copy of the Worker: it remembers who has been guessing

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      const r = await env.ASSETS.fetch(request);
      // any other address (a mistyped link, say) is sent to the app itself, keeping ?t= and ?s=; the page's own addresses are all relative, so it has to live at /
      if (r.status === 404 && request.method === 'GET' && !/\.[a-z0-9]+$/i.test(url.pathname)) { return Response.redirect(new URL('/' + url.search, url).toString(), 302); }
      return r;
    }
    return api.handle(request, {
      env,
      ip: network(request.headers.get('cf-connecting-ip') || 'unknown'),
      table: (code) => env.TABLES.get(env.TABLES.idFromName(code)),
      // Cloudflare's own counter, shared between copies of the Worker, when wrangler.jsonc gives us one
      limit: env.GUESSES && env.GUESSES.limit ? (key) => env.GUESSES.limit({ key }).then((r) => r.success) : null
    });
  }
};

export class Table extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.core = new TableCore({ store: ctx.storage, env }); }
  ask(route, body) { return this.core.ask(route, body); }       // called by the front door, straight from the Worker
  alarm() { return this.core.alarm(); }
}
