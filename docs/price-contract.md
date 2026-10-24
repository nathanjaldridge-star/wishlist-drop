# Wishlist Drop price contract
Files: `price-contract.schema.json` (JSON Schema 2020-12) and `price-contract-examples.json` (4 records, all labelled EXAMPLE, all values fake, and they validate against the schema).

Conventions:
- All prices are integers in **minor units (pence)**.
- Times are ISO 8601 in UTC.
- `promo_code` is only ever copied from a source feed. It is never generated.

Legend: ✅ verified this session (17 Oct 2026, source cited) | ⚠️ UNVERIFIED (from memory or docs I could not fetch)

## Keepa product object ✅
Source: https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Product.java and `.../helper/KeepaTime.java`

| Contract field | Keepa field |
|---|---|
| product_id | `keepa:{domainId}:{asin}` ✅ (UK domainId = 2 ⚠️) |
| title | `title` ✅ |
| fetched_at | `lastUpdate` (Keepa minutes) ✅ |
| current_price | last value of `csv[0]` (AMAZON) or `csv[1]` (NEW) ✅ |
| was_price | last value of `csv[4]` (LISTPRICE) ✅ |
| delivery_cost | `csv[18]` BUY_BOX_SHIPPING already includes shipping ✅. Index 7 is NEW_FBM_SHIPPING ✅ |
| price_history | `csv[i]` pairs: `[keepaTime, price, keepaTime, price, …]` ✅ |
| in_stock | `availabilityAmazon` ✅ (value meanings ⚠️), or the last csv value being -1 = no offer ⚠️ |
| canonical_url | build as `https://www.amazon.co.uk/dp/{asin}` (convention) |

Other csv indices ✅: 2 USED, 6 REFURBISHED, 8 LIGHTNING_DEAL, 9 WAREHOUSE.

Conversions:
- **Keepa time:** `unix_ms = (keepaMinute + 21564000) * 60000` (constant `keepaStartMinute = 21564000` in KeepaTime.java ✅).
- **Prices:** already in the smallest currency unit, i.e. pence for amazon.co.uk ⚠️ (widely documented; the comment wasn't grepped this session). -1 means no data ✅ (common usage ⚠️).

## Awin product feed ⚠️ UNVERIFIED
The Awin wiki pages returned no parseable content and the API needs auth (401, see `curl_tests.txt`). The names below are from memory of the standard Awin feed columns. Confirm them at https://wiki.awin.com/index.php/Product_Feed_Advanced_User_Guide once you have publisher access.

| Contract | Awin column (⚠️) |
|---|---|
| product_id | `aw_product_id` (or `merchant_product_id`) |
| canonical_url | `merchant_deep_link` (affiliate link: `aw_deep_link`) |
| retailer | `merchant_name` |
| title | `product_name` |
| current_price | `search_price` ×100 (feed gives decimal pounds ⚠️) |
| currency | `currency` |
| in_stock | `in_stock` / `stock_status` |
| was_price | `rrp_price` (or `product_price_old`) |
| is_promo | `saving` > 0, or `is_for_sale` |
| delivery_cost | `delivery_cost` |
| price_history | none in the feed. Build it from daily snapshots |
| fetched_at | your download time (feed `last_updated` ⚠️) |

## Awin promotions/vouchers ⚠️ UNVERIFIED
help.awin.com mentions "promotions" and "vouchers" ✅, but I could not see the field schema. Likely fields ⚠️: `promotionId`, `type` (voucher/promotion), `title`, `description`, `terms`, `startDate`, `endDate`, `voucher.code`, `urlTracking`, `advertiser.id/name`.

Mapping:
- `voucher.code` → `promo_code`
- `is_promo` = true
- `confidence` is high only while today is between startDate and endDate

## HotUKDeals RSS item ✅
Verified from https://www.hotukdeals.com/rss/hot fetched 17 Oct 2026 (`hukd_sample.xml`). Item elements: `title, link, guid, pubDate, category, description, pepper:merchant@name, pepper:merchant@price, media:content, media:thumbnail`.

| Contract | RSS field |
|---|---|
| product_id | `hukd:` + numeric suffix of `guid` (the URL ends in `-{id}`) ✅ |
| canonical_url | `link` (this is the HUKD thread, not the retailer page) |
| retailer | `pepper:merchant@name` ✅ |
| title | `title`, with the leading temperature e.g. "101° - " stripped ✅ |
| current_price | `pepper:merchant@price` (a string like "£2"; parse to pence) ✅. It can be missing |
| currency | GBP (inferred from the "£" sign) |
| fetched_at / history date | `pubDate` (RFC 822) ✅ |
| is_promo | true |
| confidence | derive from the temperature in `title` |
| in_stock, was_price, delivery_cost | not provided, so null |
| promo_code | not seen in the structured fields. It may appear in `description` HTML ⚠️, so treat it as community-reported only |

## First UK retailers
| Retailer | HUKD RSS (free today) | Awin | Keepa |
|---|---|---|---|
| Amazon UK | ✅ seen in feed | n/a (Amazon Associates instead) | ✅ amazon.co.uk (needs paid key) |
| Currys | ✅ seen in feed | verify | n/a |
| eBay | ✅ seen in feed | verify (eBay has its own Partner Network) | n/a |
| Screwfix | ✅ seen in feed | verify | n/a |
| Argos | not seen in this snapshot | verify | n/a |
| John Lewis | not seen in this snapshot | verify | n/a |
| Overclockers UK | ✅ seen in feed | verify | n/a |
| Uniqlo | ✅ seen in feed | verify | n/a |

"Seen in feed" only means the merchant appeared in a single `/rss/hot` snapshot. Coverage of a specific wishlist item is not guaranteed. I made no claim that any of these retailers is on Awin, because I didn't check a public Awin page that shows it.

## eBay Browse API (`source: "ebay_browse"`) ✅ (adapter built 24 Oct 2026; live once the keys are added, see `docs/ebay-setup.md`)
Fetched server-side only by `scripts/fetch-ebay.mjs` (GitHub Actions, every 30 min) from `GET /buy/browse/v1/item_summary/search` with `X-EBAY-C-MARKETPLACE-ID: EBAY_GB`, filter `buyingOptions:{FIXED_PRICE},conditionIds:{1000},deliveryCountry:GB`, GBP listings only. Snapshot on the `data` branch: `ebay.json`; changes are appended to `price-log.jsonl`.

| Contract | Browse `itemSummaries[]` field |
|---|---|
| product_id | `ebay:` + `legacyItemId` (or the middle part of `itemId` `v1\|<id>\|0`) of the cheapest matching listing |
| canonical_url | `itemWebUrl` with the query string removed. No affiliate params (eBay Partner Network hook is disabled) |
| retailer | `eBay` |
| current_price | lowest `price.value` (GBP) after trimming outliers, in pence (string-parsed, no float maths) |
| delivery_cost | first GBP `shippingOptions[].shippingCost.value`, pence |
| was_price | always null (we never use RRP/"was") |
| in_stock | true for an ok record (an active Buy It Now listing) |
| confidence | 0.5 + 0.1 per matching listing, capped at 0.9 |
| watch_id | the `data/watchlist.json` item the record answers (optional field, eBay only) |
| sku | Drop Club catalogue id (`DC` + 9 characters + check character). Minted from a GTIN, or from the watch-list id when there is no barcode. A title never mints one. Optional; present on eBay records. Shop SKUs are not this field |
| market_stats | `{lowest, median, mean, count, trimmed, basis}` over the matching listings after a Tukey 1.5×IQR trim. **median = "typical price on eBay"**, not an RRP (optional field, eBay only) |

error_state: `not_found` = no new Buy It Now GBP listing matched; `blocked` = HTTP 429 (we stop the run), 401/403, or a failed request with no previous record; `changed` = the response lost its `itemSummaries` list.
