# Proposal: 2-minute polling in Black Friday week with Cloudflare Workers Cron (not set up)

**Why:** the plan polls `/rss/new` every 2 min from 20 Nov to 1 Dec, because about 30 deals arrive per 34 min normally and volume rises in BF week, so 5 min risks missing items. GitHub Actions' shortest schedule is 5 min, and scheduled runs can start late or be skipped under load.

**What:** a Cloudflare Worker with a Cron Trigger `*/2 * * * *` that does the same thing as `scripts/fetch-hukd.mjs`:
- Fetches only the public HUKD RSS feeds, with the same UA, conditional GET and 15s timeout.
- Filters by `pepper:merchant`.
- Writes `hukd.json` to Workers KV or R2.
- Appends observations to the price log.
- Serves `GET /hukd.json` with `Access-Control-Allow-Origin: *` and `Cache-Control: max-age=60`.

The app would add that URL in front of the current list. Today's order is `MIRROR_DATA_BRANCH`, then `./data/hukd.json`, then the embedded snapshot.

**Cost and limits:** the Workers Free plan includes Cron Triggers and KV, and 720 runs/day at 2 min is far below the free request allowance.
- ⚠️ Free-plan quotas change, so check the current Cloudflare limits before relying on them.
- KV has a daily write cap on the free plan. Batch the price log into a few writes per run, or use R2 (which has a free tier).

**Needs approval:** a Cloudflare account is a sign-up, which breaks the no-sign-ups rule, so Nathan must approve it. Nothing has been created.

**Sketch** (wrangler.toml: `[triggers] crons = ["*/2 * * * *"]`, KV binding `MIRROR`):
```js
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(poll(env)); },         // reuse parse/validate/merchant filter from fetch-hukd.mjs
  async fetch(req, env) {
    const body = await env.MIRROR.get('hukd.json');
    return new Response(body || '{}', { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'max-age=60' } });
  },
};
```
