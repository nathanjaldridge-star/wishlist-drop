# Drop Club price database

Postgres, written only by a scheduled GitHub Actions job. The site stays static: it reads `prices.json` from the `data` branch and never talks to the database.

**Status:** built and tested, not switched on. It needs a `DATABASE_URL` secret, and creating that database means signing up for a host. Nathan has not approved a sign-up yet.

## What it stores

| Table | One row per | Notes |
|---|---|---|
| `markets` | GB/GBP, US/USD | UK and US only. A listing's currency must match its market. |
| `sources` | price source | Licence switches: `enabled`, `may_use_for_baseline`, `may_alert`, `max_display_age`, `retain_for`, `may_resell`, and `notes` explaining each setting. |
| `retailers` | shop per market (`argos-uk`) | `price_alerts_enabled` is false for `amazon-uk` and `amazon-us` until Amazon consents. Shops outside the UK and US are refused. |
| `products` | catalogue product | `catalogue_id` such as `DC7HS6T39KTP`: random, issued once and never changed. The 12th character is a check character (Luhn mod 32). It catches every single typo and every swap of neighbouring characters except 0↔Z. Duplicates are merged with `merge_products()`; the old id keeps pointing at the product it was merged into. |
| `product_identifiers` | GTIN / ASIN / eBay ePID / MPN / shop SKU / watch-list id | GTINs are check-digit validated. ASINs are scoped to a market and SKUs to a shop. |
| `listings` | product at a shop from a source | `product_id` stays empty unless a watch-list id, catalogue id or barcode identifies the product. A title alone never creates a product. |
| `price_observations` | one price check | Prices are whole pence or cents. Times are `timestamptz`. Rows are append-only, and a unique `ingest_key` makes re-runs harmless. |

Catalogue ids for the watch list live in `data/watchlist.json`. `scripts/fetch-ebay.mjs` copies them into every eBay record, and ingest stores products under those ids. If a record and the watch list disagree on an id, ingest stops rather than splitting the product.

## Source rules (seeded in `db/migrations/0001_core.sql`)

| Source | On? | History / 30-day low | Alerts | Kept |
|---|---|---|---|---|
| `ebay_browse` | yes | no | yes | 24 h |
| `hukd_rss` | no (needs HotUKDeals' written consent) | no | no | 48 h |
| `awin_feed`, `awin_promotions` | no (Awin approval pending) | feed: yes | feed: yes | — |
| `keepa`, `amazon_creators_api` | no | — | Amazon: no | — |
| `user_capture`, `manual` | no (not built yet) | capture: yes | yes | — |

- **eBay licence:** displayed listing data must be no more than 6 hours older than eBay's. The export marks older rows `fresh: false` with `age_minutes`, and the app hides eBay records more than 6 hours old.
- **eBay licence:** eBay content may not be used to model or suggest prices without written consent, and may not be resold or used for AI training.
- **Our choices for eBay:** the 24-hour retention and no 30-day-low maths are our own conservative settings, not licence text. See "Decisions" below.
- **Changing a rule:** each rule is one row. Switching a source on is `update sources set enabled = true where id = '…'`, done only once the approval exists in writing.

## Flow

```
fetch-ebay.mjs ─► data:price-log.jsonl ─► scripts/db/ingest.mjs ─► Postgres ─► scripts/db/export.mjs ─► data:prices.json ─► app
```

- `price_baseline(as_of)` returns, for each listing:
  - the current price
  - `low_30d`: the lowest price at the same listing (same shop and currency) in the 30 days before the current one. This is only set for sources where `may_use_for_baseline` is on, and `drop_pct` only after 30 days of history.
  - `fresh`
  - `may_alert`
- `prices.json` contains only listings tied to a catalogue product: `catalogue_id`, `title`, `retailer_name`, `current_price`, `checked_at`, `fresh`, `age_minutes`, `low_30d`, `building_history` and `may_alert`.
- **App matching:** the app links an item to a catalogue id, which is never shown on cards. It tries, in order:
  1. the item's catalogue id
  2. a pasted eBay item id
  3. the typed name (fuzzy match 0.6 or better) against eBay watch-list titles, then against `prices.json` titles
- **App display:** when a source allows price history, the card shows "Drop Club 30-day low at <shop>". Until 30 days of history exist, it shows "still building".

## Security

- **TLS:** always on and verified for a remote host. Plain text is allowed only to `localhost` with `sslmode=disable`. Supabase signs with its own CA: put its PEM in the `DATABASE_CA` Actions variable.
- **Time zone:** every pooled connection runs in UTC (`options=-c TimeZone=UTC`).
- **No public access:** row level security is on for every table, including `schema_migrations`, with no policies, so Supabase's public `anon` key reads nothing. Execute on the functions is revoked from `public`, `anon` and `authenticated`.
- **Secret handling in the workflow:**
  - `DATABASE_URL` is given only to the step that runs migrate, ingest and export.
  - The driver installs in the step before, with `npm ci --omit=dev --ignore-scripts`.
  - The tests delete `DATABASE_URL` before they start.

## Switching it on (needs Nathan's OK: sign-up)

1. Create a free Supabase project.
2. Copy the **Session pooler** connection string (Dashboard → Connect). GitHub Actions runners are IPv4-only, and the direct `db.<ref>.supabase.co` host is IPv6-only on the free plan.
3. Add the connection string as the repo secret `DATABASE_URL`.
4. Add Supabase's CA certificate as the repo variable `DATABASE_CA`.
5. The next eBay run migrates the database, ingests the log, and commits `prices.json`.

## Commands

```
npm run test:db            # schema, ingest, identity, licence rules, permissions (PGlite: real Postgres in WebAssembly)
npm run test:db-pipeline   # real fetcher → ingest → export → built app finds the price from a typed name
DATABASE_URL=… npm run db:migrate
DATABASE_URL=… npm run db:ingest -- price-log.jsonl data/watchlist.json
DATABASE_URL=… npm run db:export -- prices.json
```

`db/seed/example.sql` is EXAMPLE data for local databases only. Every row is flagged and titled `[EXAMPLE]`.

## Decisions for Nathan

1. **Sign-up:** a Supabase free project (or another Postgres host). Nothing has been created.
2. **eBay history:** today eBay prices are kept 24 hours and never feed a 30-day low. With only eBay switched on, the database therefore builds no price history: `low_30d` stays empty until Awin or user capture exists. Keeping eBay history, or using it for "lowest in 30 days", risks the licence's "model or suggest prices" clause. The safe route is to ask eBay in writing.
3. **US:** the schema handles US/USD, but the eBay job checks eBay UK only (`EBAY_GB`). US prices need a US source.
