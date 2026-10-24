# eBay live prices – setup (issue #11)

Drop Club reads eBay UK prices with the **eBay Browse API**. Everything runs server-side in GitHub Actions. The browser never sees a key and never calls eBay directly.

| Piece | File |
|---|---|
| Fetcher (token, search, matching, stats, records) | `scripts/fetch-ebay.mjs` |
| Fetcher tests (mocked eBay, no network) | `scripts/test-fetch-ebay.mjs` (`npm run test:ebay`) |
| App tests (adapter, URL parsing, preview, queue) | `build/test-ebay-app.js` (`npm run test:ebay-app`) |
| Seed watch list | `data/watchlist.json` |
| Workflow (every 30 min + manual) | `.github/workflows/ebay-prices.yml` |
| Output | `data` branch: `ebay.json` (snapshot) and `price-log.jsonl` (append-only log) |

Until the keys exist, the workflow succeeds and logs `eBay keys not set yet – skipping`. Nothing is written, and the app shows eBay as **Awaiting approval**. Once `ebay.json` contains at least one `ok` record, the app switches eBay to **Live** on its own. No code change is needed.

## 1. Create a Production keyset (after eBay approves the account)

1. Sign in at <https://developer.ebay.com/my/keys> as **dropclubuk**.
2. Under **Production**, create a keyset (application name e.g. `Drop Club`).
   - eBay will ask you to deal with **Marketplace Account Deletion** before the Production keyset is enabled. See step 4.
3. Copy the **App ID (Client ID)** and **Cert ID (Client Secret)**. You don't need the Dev ID or a user token. We only use the *application* token (client credentials, scope `https://api.ebay.com/oauth/api_scope`).

## 2. Add the two repo secrets

GitHub → `nathanjaldridge-star/wishlist-drop` → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `EBAY_CLIENT_ID` | App ID (Client ID) |
| `EBAY_CLIENT_SECRET` | Cert ID (Client Secret) |

Never put these in a file, an issue, a PR or a chat.

## 3. Run the workflow

**Actions → eBay prices → Run workflow** (branch `main`). After about a minute:

- The log should say `eBay: N ok, …, M API calls`. Expect roughly 1 token call plus 1 search per watch-list item.
- The `data` branch should have a fresh `ebay.json` and new lines in `price-log.jsonl`.
- After that, open the site. **Sources** should show eBay as *Live*, and **Top 10 → Popular on eBay right now** should list items.

After this it runs at :07 and :37 every hour. Each run makes 11 calls with today's 10-item watch list, so about 530 calls/day against eBay's 5,000/day Browse limit. `EBAY_MAX_CALLS` (default 60) caps each run, and a 1.5 s gap between searches keeps the job polite.

Errors:

| eBay says | We record | Run |
|---|---|---|
| 429 (rate limit) | `blocked` "rate limited" | stops; other items keep their last record |
| 401/403 on the token or a search | `blocked` | stops; check the secrets / keyset status |
| 5xx | retried once, then the item keeps its last record | continues |
| no matching listings | `not_found` | continues |
| unexpected response shape | `changed` | continues |

## 4. Marketplace Account Deletion: claim the exemption

eBay requires every Production keyset either to receive account-deletion notifications or to declare it is exempt. **Drop Club stores no eBay user data.** We keep listing price, title, item URL and our own match stats. We store no buyer or seller usernames, IDs or contact details, and we never use user tokens. So the exemption applies:

1. developer.ebay.com → **Application Keys** → **Notifications** next to the Production App ID (the *Alerts & Notifications* page).
2. **Marketplace Account Deletion** → switch **Not persisting eBay data** to **On** → **Confirm**.
3. Tick the exemption reason and add a note, e.g. *"Price-tracking app. We use only the Browse API with an application token. We store item prices and listing URLs, never eBay user or seller data."* → **Submit**.

eBay may have changed the exact wording on these pages. If that data ever changes (for example, storing seller names), drop the exemption and add a notification endpoint instead: an HTTPS URL that answers eBay's challenge and deletes the user's data. We'd need a backend for that (#5).

## 5. Affiliate links (later, off by default)

Records carry the plain eBay item URL with every query parameter stripped. `EPN` in `scripts/fetch-ebay.mjs` is `{enabled:false}`. Turning it on needs an eBay Partner Network sign-up, which only happens with Nathan's OK, and a visible "affiliate link" label in the app.

## 6. Watch list: today and later

- **Today:** `data/watchlist.json` is a hand-made seed list of popular UK items. It powers *Popular on eBay right now* and the demo. Each item has a search `query`, words that `must` all appear in the title, optional `any`-of words, `exclude` words (cases, refurbished, boxes only…) and a `min_price_pence` floor that drops accessories.
- **Pasted items not on the list** are queued only on the visitor's device (`S.pending`, max 20). The app says *"We'll start checking this item on eBay when synced lists launch; until then we check HotUKDeals."* No backend exists, so nothing leaves the device.
- **Later (#5 Supabase wishlists, #6 alerts):** a scheduled job exports the distinct, de-duplicated items from synced wishlists (plus the queued ones) into the watch list, with a cap sized to the call budget (e.g. ≤ 200 items every 2 h ≈ 2,400 calls/day). The fetcher already reads any watch-list file (`EBAY_WATCHLIST`), so only the export step is new.

## 7. What the app shows (honest labelling)

- **Live price from eBay – checked <time>**: the lowest **new, Buy It Now, GBP** listing price, plus its delivery cost. The time is eBay's check time, not when the page loaded.
- **Typical price on eBay: £X (median of N listings, checked <time>)**: the median after trimming outliers (Tukey 1.5×IQR, when there are 4+ listings). It is **eBay's typical asking price, not an RRP**, and the app says so.
- **Suggested target**: 10% below the typical price. It pre-fills only when you haven't typed a price yourself.
- Records older than 24 h aren't shown. Every price carries its source label.
