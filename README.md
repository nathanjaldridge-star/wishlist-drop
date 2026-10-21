# Drop Club data branch (machine-written)
- `hukd.json`: mirror of public HotUKDeals RSS feeds (`/rss/new`, `/rss/hot`, `/rss/vouchers`, `/rss/tag/{lego,headphones,apple,gaming}`), filtered by `pepper:merchant`. Community reported; codes are community-posted and unverified. Every deal links back to its HUKD thread. Description HTML is not stored.
- `price-log.jsonl`: **append-only** price observations from day one (21 Oct 2026). One line per first sighting of a thread or a price change: `observed_at, source, feed, guid, link, merchant, title, price (pence), discount, pub_date`.
- Written by `scripts/fetch-hukd.mjs` on `main`. Kept off `main` so 5-minute updates don't trigger GitHub Pages builds (soft limit about 10 per hour). The app reads it via raw.githubusercontent.com (CORS `*`, ~5 min cache).
- No retailer pages are fetched.
