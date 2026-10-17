// Mirrors the public HotUKDeals RSS into data/hukd.json so the static site can read it same-origin (no CORS).
// Node 20+, no dependencies. Community-reported data; respect HotUKDeals terms and keep polling polite (30 min).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const URL = 'https://www.hotukdeals.com/rss/hot';
const res = await fetch(URL, { headers: { 'User-Agent': 'WishlistDrop/0.1 (+https://github.com/nathanjaldridge-star/wishlist-drop)' }, redirect: 'follow' });
if (!res.ok) { console.error('HTTP', res.status); process.exit(0); }
const xml = await res.text();
if (!/<item>/.test(xml)) { console.error('No <item> elements, feed format may have changed; keeping previous mirror'); process.exit(0); }
const prev = existsSync('data/hukd.json') ? JSON.parse(readFileSync('data/hukd.json', 'utf8')) : null;
if (prev && prev.xml === xml) { console.log('unchanged'); process.exit(0); }
writeFileSync('data/hukd.json', JSON.stringify({ source_url: URL, final_url: res.url, fetched_at: new Date().toISOString(), label: 'Community reported (HotUKDeals RSS)', xml }) + '\n');
console.log('updated', (xml.match(/<item>/g) || []).length, 'items');
