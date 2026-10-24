# Wishlist Drop: Free UK deal, price and voucher sources
_Research done 21 Oct 2026. Every RSS URL was fetched from the Wishlist Drop box that day; the Status column shows the result. The machine-readable version is in `docs/sources.json`. **[VERIFY]** marks anything not yet confirmed._

## Key findings
- **Free sources that work today:**
  - HotUKDeals hot, new and vouchers RSS. Each has 30 items and every item carries a `pepper:merchant` tag.
  - Future plc deal feeds: TechRadar, T3, Tom's Guide UK, What Hi-Fi, PC Gamer and Creative Bloq.
  - RSS from Trusted Reviews, Which?, Expert Reviews, Stuff, Pocket-lint, Mirror and Express.
- **Blocked or no feed:**

  | Source | Result |
  |---|---|
  | MoneySavingExpert | HTTP 403 |
  | Latest Deals | HTTP 202 bot challenge |
  | NetVoucherCodes | HTTP 429 |
  | Reddit | HTTP 403 |
  | VoucherCodes | /rss returns 404, and robots.txt disallows /feeds/ |

  - MyVoucherCodes' RSS works, but it carries press releases, not codes.
  - None of these blocks should be worked around.
- **No free price-comparison API:** PriceSpy, PriceRunner, idealo and Google Shopping all lack one. idealo's and Google's APIs are for merchants only, and PriceSpy sells data commercially. Real retailer prices therefore come from **affiliate product feeds** (Awin/CJ), the **eBay Browse API** (free) and the **Amazon Creators API** (free after 10 sales in the last 30 days).
- **Where legitimate voucher codes come from:** affiliate network offer APIs (Awin, CJ, Rakuten, impact, Webgains, Skimlinks, Sovrn), plus HotUKDeals vouchers labelled as community reported.
- **Treat editorial feeds as signals only:** use them to spot a possible drop, then confirm the price from a retailer or affiliate feed. Never reuse a publisher's affiliate link as our own.

## Top 10 free sources to integrate first
1. **HotUKDeals hot and new RSS.** Live now. Real UK prices from the community, with the retailer named.
2. **HotUKDeals vouchers RSS.** Live now. Community-reported codes for the voucher layer.
3. **Awin Offers API.** Retailer-published codes and sales with dates. Free after approval.
4. **Awin product feeds.** Actual SKU prices, often with RRP, for Currys, John Lewis and others. This is the backbone of the 10% check.
5. **eBay Browse API.** Free, 5,000 calls a day, real UK prices.
6. **TechRadar UK deals RSS.**
7. **Trusted Reviews deals RSS.**
8. **T3 and Tom's Guide UK deals RSS.**
9. **Skimlinks Offers API.** One approval gives codes across many merchants, at the cost of a revenue share.
10. **What Hi-Fi, PC Gamer UK and Creative Bloq deals RSS.**

**Next, once eligible:**
- Amazon Creators API, after 10 sales in the last 30 days.
- CJ, for Argos.
- Rakuten, impact and Webgains, as retailers require.

## All sources
| Rank | Source | Type | Access (URL) | Cost | Terms / robots notes | Usefulness for 10%+ check | Status (21 Oct 2026) |
|---|---|---|---|---|---|---|---|
| 1 | HotUKDeals – Hot deals RSS | community_deals | rss: `https://www.hotukdeals.com/rss/hot` | free | robots.txt: User-agent * Allow: / (blocks /rest-api/, /graphql, voucher clickouts). T&Cs prohibit unauthorised reproduction; HUKD publicly offers RSS for aggregators. Use RSS only, cache, attribute, link back; no scraping of pages/API. | high – Real UK deal prices with pepper:merchant tag and price string; community-reported. Match to wishlist items by title/retailer; signal, then confirm. | verified 21 Oct 2026 (HTTP 200, items present); 30 items, pepper:merchant on all |
| 1 | HotUKDeals – New deals RSS | community_deals | rss: `https://www.hotukdeals.com/rss/new` | free | As hukd_hot. | high – Earliest signal (before deals get hot); poll every 15–30 min. | verified 21 Oct 2026 (HTTP 200, items present); 30 items |
| 2 | HotUKDeals – Vouchers RSS | community_vouchers | rss: `https://www.hotukdeals.com/rss/vouchers` | free | As hukd_hot. Codes are user-submitted: label community_reported; many are 'selected accounts' only. | high – Voucher layer: per-retailer codes with min-spend text in titles. | verified 21 Oct 2026 (HTTP 200, items present); 30 items |
| 3 | Awin Offers (Promotions) API | affiliate_network_vouchers | affiliate_api: `POST https://api.awin.com/publisher/{publisherId}/promotions` | free with approval (£5 refundable deposit) | Publisher API token. Voucher codes only returned for advertisers you have joined; obey each advertiser's voucher/promo-type rules. | high – Retailer-published codes + sale promotions with start/end dates and tracking links (Currys, John Lewis, etc.). | docs verified; needs Awin account |
| 4 | Awin product data feeds | affiliate_network_prices | affiliate_feed: `Create-a-Feed in Awin UI (per joined advertiser)` | free with approval | Per advertiser approval; feed content licensed for promoting that advertiser. | very high – Actual current price (and often RRP/was-price) per SKU: the backbone for the 10% check outside Amazon. | not testable without account [VERIFY field names] |
| 5 | eBay Browse API (Buy APIs) | marketplace_api | public_api: `https://api.ebay.com/buy/browse/v1/item_summary/search (EBAY_GB)` | free (developer account; 5,000 calls/day default) | eBay API License Agreement; pair with eBay Partner Network for links. | high – Real new-item prices from UK sellers by keyword/GTIN. | docs verified via eBay Partner Network page |
| 6 | TechRadar – deals RSS | editorial_deals | rss: `https://www.techradar.com/uk/feeds/articletype/deals` | free | Public RSS (Future plc). Use headlines as signals with link-back; do not republish articles or reuse their affiliate links as ours. robots blocks AI crawlers only. | medium – Headline deals with '£X off'/'% off' in titles (tech); mixed US/UK — filter. | verified 21 Oct 2026 (HTTP 200, items present); 50 items |
| 7 | Trusted Reviews – deals RSS | editorial_deals | rss: `https://www.trustedreviews.com/deals/feed` | free | Public RSS; signal + link-back only. | medium – UK-focused tech deals with £ savings in titles. | verified 21 Oct 2026 (HTTP 200, items present); 10 items |
| 8 | T3 – deals RSS | editorial_deals | rss: `https://www.t3.com/feeds/tag/deals` | free | Public RSS (Future plc); signal only. | medium – UK lifestyle/tech deals. | verified 21 Oct 2026 (HTTP 200, items present); 50 items |
| 8 | Tom's Guide UK – deals RSS | editorial_deals | rss: `https://www.tomsguide.com/uk/feeds/tag/deals` | free | Public RSS (Future plc); signal only. | medium – Tech deals; some US content — filter on £. | verified 21 Oct 2026 (HTTP 200, items present); 50 items |
| 9 | Skimlinks Merchant API – Offers | affiliate_network_vouchers | affiliate_api: `GET https://merchants.skimapis.com/v4/publisher/{publisher_id}/offers` | free with approval (Skimlinks takes a revenue share) | 40 req/min, 1,000/hr. Offers include coupon_code, dates, terms. | high – One API for codes across thousands of merchants incl. UK; filter country=GB. | docs verified; needs publisher account |
| 10 | What Hi-Fi / PC Gamer UK / Creative Bloq – deals RSS | editorial_deals | rss: `https://www.whathifi.com/feeds/tag/deals ; https://www.pcgamer.com/uk/feeds/tag/deals ; https://www.creativebloq.com/feeds/tag/deals` | free | Public RSS (Future plc); signal only. | medium – Category-specific (AV, PC, creative tech) deal headlines. | verified 21 Oct 2026 (HTTP 200, items present); 50/50/25 items |
| – | Which? – news RSS | editorial_consumer | rss: `https://www.which.co.uk/news/feed` | free | Public RSS; Which? content is copyright, headlines + link only. | low – Occasional 'deal or no deal' and fake-discount investigations; trust signal, not prices. | verified 21 Oct 2026 (HTTP 200, items present); 30 items |
| – | Expert Reviews – RSS | editorial_deals | rss: `https://www.expertreviews.co.uk/feed` | free | Public RSS; signal only. | low – Mostly reviews; few deals. | verified 21 Oct 2026 (HTTP 200, items present); 10 items |
| – | Stuff – RSS | editorial_deals | rss: `https://www.stuff.tv/feed/` | free | Public RSS; signal only. | low – Some deal posts; filter on 'deal'. | verified 21 Oct 2026 (HTTP 200, items present); 71 items |
| – | Pocket-lint – RSS | editorial_deals | rss: `https://www.pocket-lint.com/feed/` | free | Public RSS; signal only. | low – Some deal posts. | verified 21 Oct 2026 (HTTP 200, items present); 10 items |
| – | Mirror – shopping deals RSS | editorial_deals | rss: `https://www.mirror.co.uk/money/shopping-deals/?service=rss` | free | Public RSS; signal only. | low – Mass-market UK deals (Argos, Amazon, supermarkets). | verified 21 Oct 2026 (HTTP 200, items present); 25 items |
| – | Express – deals RSS | editorial_deals | rss: `https://www.express.co.uk/posts/rss/77/deals` | free | Public RSS; signal only. | low – Mass-market UK deals. | verified 21 Oct 2026 (HTTP 200, items present); 10 items |
| – | MoneySavingExpert | editorial_deals | none_verified: `https://www.moneysavingexpert.com/news/feed/ (403 from our server)` | free (if accessible) | Returned 403 to automated fetch; do not work around. Weekly email could be read manually. | medium – High-trust UK deals but not machine-accessible. | FAILED 21 Oct 2026: HTTP 403 |
| – | Latest Deals | community_deals | none_verified: `/rss and /feed returned 202 bot challenge` | unknown | Bot protection; ask them for a feed/partnership. | medium – UK community deals, similar to HUKD. | FAILED: HTTP 202 challenge |
| – | VoucherCodes.co.uk | voucher_site | none: `none (/rss 404; robots.txt disallows /feeds/)` | n/a | No public feed; robots disallows /feeds/. Do not scrape; get the same codes from networks. | low – Competitor, not a source. | checked: 404 |
| – | MyVoucherCodes | voucher_site | rss: `https://www.myvouchercodes.co.uk/rss` | free | RSS works but is press releases/survey news, not codes. | none – Not useful for codes. | verified 21 Oct 2026 (HTTP 200, items present); 50 items (press releases) |
| – | NetVoucherCodes | voucher_site | none_verified: `/rss returned 429` | n/a | Rate-limited/blocked; no documented feed. | low – Not a source. | FAILED: HTTP 429 |
| – | Groupon UK | voucher_site | affiliate_network: `via affiliate programme [VERIFY network]` | free with approval | Not checked. | low – Local/experience deals; rarely matches wishlist products. | not verified |
| – | PriceSpy UK | price_comparison | none: `none public` | n/a | No public API; sells aggregated data reports to industry (commercial). Do not scrape. | high if licensed – Best UK price-history source in principle; licence only. | no public API found |
| – | PriceRunner UK | price_comparison | none: `none public (paid third parties e.g. PricePirate)` | paid via third parties | robots disallows /deals? ; no public API. | high if licensed – Licence/paid only. | no public API found |
| – | idealo UK | price_comparison | merchant_api_only: `https://businessapi.idealo.com (merchant price reports, 5/day)` | n/a for us | Business API is for listed shops only. | none for us – Not usable. | docs verified |
| – | Google Shopping | price_comparison | merchant_api_only: `Merchant API (seller-facing only)` | n/a; third-party SERP APIs paid | No public cross-retailer price API; scraping against Google ToS. | none free – Not usable free. | docs verified |
| – | Amazon Associates UK / Creators API | retailer_api | affiliate_api: `Creators API (replaced PA-API 30 Apr 2026)` | free; needs 10 qualified sales in trailing 30 days | Associates Operating Agreement; display rules for prices. | very high once eligible – Live Amazon UK prices; history needs Keepa (paid). | docs verified |
| – | Retailer deal pages (Amazon, Argos, Currys, John Lewis) | retailer_deals | none: `no RSS; use affiliate feeds instead` | n/a | Site terms generally prohibit scraping; get same data via Awin/CJ/eBay/Amazon APIs. | high via feeds – Use network feeds. | not fetched |
| – | Retailer newsletters | retailer_newsletter | email: `subscribe a dedicated Wishlist Drop inbox` | free | Personal subscription; codes may be single-use/personal — only publish codes marked public. | medium – Sale start dates and public codes; parse emails. | design only |
| – | Student Beans | student_discount | affiliate_network: `Awin / Rakuten programmes` | free with approval | Codes gated behind student verification — show 'student discount available', never the code. | low – Flag only. | via search |
| – | UNiDAYS | student_discount | affiliate_network: `partner programme [VERIFY]` | free with approval | Verification-gated; flag only. | low – Flag only. | not verified |
| – | Quidco / TopCashback | cashback | affiliate_network: `Awin programmes 15819 (Quidco) & 2459 (TopCashback) — member acquisition only` | free with approval | No public rate API. Do not show cashback rates we can't source; cashback sits outside 'effective discount'. | low – Optional 'cashback may be available' hint. | via search |
| – | Reddit UK deal subreddits | community_deals | api_with_approval: `.rss returned 403` | Data API terms restrict commercial use | Needs approved API access for commercial use. | low – Skip. | FAILED: HTTP 403 |

## Affiliate networks with free voucher/promo feeds
All of these are free to join, subject to approval. Codes usually come back only for advertisers we have joined, and each advertiser sets its own rules on voucher use.

| Network | Feed / API | What it needs | Docs |
|---|---|---|---|
| Awin | Offers/Promotions API + product feeds | Publisher account, website URL, ID check, £5 refundable deposit; join each advertiser; API token | https://help.awin.com/apidocs/promotions |
| CJ Affiliate | Link Search API (promotion-type=coupon) + Product Search API | Publisher account + website PID, personal access token; 25 calls/min; join advertisers (e.g. Argos) | https://developers.cj.com/docs/rest-apis/link-search |
| Rakuten Advertising | Coupon Feed API (XML, max 500 results, 100 calls/min) | Publisher account, API token, joined advertisers | https://pubhelp.rakutenadvertising.com/hc/en-us/articles/5949828511757-Coupon-Feed-API |
| impact.com | Partner API Ads endpoint (Type=COUPON, DealDefaultPromoCode) | Partner account + AccountSID/token; brand approval | https://integrations.impact.com/partner-api-reference/partner-v15/reference/ads/ads |
| Webgains | Platform API offers & vouchers + product feeds | Publisher account, joined programmes | https://knowledgehub.webgains.com/home/what-api-connections-do-webgains-offer-for-publish |
| Skimlinks | Merchant API /offers (coupon_code, dates, terms) | Publisher approval; client id/secret; revenue share to Skimlinks; 40/min, 1,000/hr | https://developers.skimlinks.com/merchant.html |
| Sovrn Commerce | Coupons API (export coupons; product-URL coupon lookup) | Sovrn Commerce publisher account + API key; revenue share | https://developer.sovrn.com/reference/coupons |

## Voucher layer design
### Principles: what we do instead of Honey's practices
In 2024, MegaLag's investigation, confirmed in Snopes' own tests, showed Honey **replacing creators' affiliate cookies** at checkout even when it found no code. It also let **partner merchants hide better codes**. This led to a US class action, and Google's Chrome Web Store now allows affiliate codes only when a real discount, cashback or donation is given [Verge][Snopes][9to5Google][Complaint]. Wishlist Drop will:
1. **Never auto-inject.** No browser extension, no checkout pop-up, no writing to cookies or storage on retailer sites. The user copies the code themselves.
2. **Never overwrite attribution.** Our affiliate tag is used only when the user taps our own "Go to retailer" button, which is a fresh click they chose. We never redirect or re-tag a link that came from someone else. We never put a tracked link behind a "no code found" message.
3. **Show the best legitimate code, not the best-paying one.** Codes are ranked by value to the user. Retailers cannot pay to hide codes.
4. **Use only published sources.** Codes come only from network offer APIs (labelled **Retailer-published**) or HotUKDeals vouchers (labelled **Community-reported**). We never generate or guess codes, and never test codes by brute force.
5. **Respect access limits.** Codes marked student-only, NHS-only, selected accounts, or single-use from a newsletter appear as a flag ("Student discount may be available"), never as the code itself.
6. **Label clearly.** An "Ad" label goes next to every tracked link (ASA/CAP). Each code shows its source, expiry, the time it was last checked and its conditions.

### Data model, extending the price contract
```json
{
  "retailer": "Currys",
  "code": "SAVE10",
  "kind": "percent|fixed|free_delivery|bundle",
  "value": 10,
  "min_spend_pence": 5000,
  "max_discount_pence": null,
  "exclusions": "Apple, consoles",
  "scope": "sitewide|category|sku",
  "audience": "public|new_customer|student|selected_accounts|app_only",
  "source": "awin_promotions|cj_link_search|rakuten_coupons|skimlinks_offers|hukd_rss",
  "trust": "retailer_published|community_reported",
  "starts_utc": "2026-10-21T00:00:00Z",
  "expires_utc": "2026-10-31T23:59:59Z",
  "last_seen_utc": "...",
  "community_score": 245,
  "terms_url": "...",
  "label": "EXAMPLE"
}
```

### Effective discount: how a code stacks with a price drop
- **Inputs:**
  - `ref` = the user's reference "normal" price (recent median, not inflated RRP)
  - `now` = current price
  - an applicable code
- **Order of application:** sale price first, then the code. Delivery is added afterwards if known.
  - Percent code: `after_code = now × (1 − pct)`, capped by `max_discount`
  - Fixed code: `after_code = now − fixed`, only if `now ≥ min_spend`
- **Formulas:** `drop% = (ref − now)/ref`, and `effective% = (ref − after_code)/ref`.
- **What the card shows:**
  - Price drop: **−12%**, from £199 to £175
  - With code SAVE10 (Retailer-published, expires 31 Oct): **−21% effective, £157.50**
- **Code eligibility:** a code counts towards the **10% alert** only if it is retailer-published, public, in date, and passes the min-spend and exclusion checks. Otherwise it appears as "may also apply" and is left out of the alert maths. Cashback and student discounts are never included in the effective figure.
- **Labelling (CAP rule 3 / DMCC Act 2024 [VERIFY]):** effective discounts are labelled "if code applies at checkout". The reference price is a genuine recent price.
- **Multiple codes:** pick the single best eligible code. Retailers rarely allow stacking, so we never assume it.

### Pipeline
1. Every 15–30 minutes, pull HUKD RSS and network offer APIs. Cache them with ETag/If-Modified-Since and a polite user agent.
2. Normalise the data and de-duplicate by retailer, code and expiry.
3. Expire codes past their end date, and mark them stale if a feed hasn't confirmed them for 7 days.
4. Match codes to wishlist items by retailer and category, then compute the effective discount and alert.
5. Never log users' checkout data. No extension is needed at all.

## Sources
- HotUKDeals RSS info: https://www.hotukdeals.com/magazine/rss-feeds
- HotUKDeals T&Cs: https://www.hotukdeals.com/page/terms-and-conditions
- HotUKDeals robots.txt: https://www.hotukdeals.com/robots.txt
- Awin Offers API: https://help.awin.com/apidocs/promotions
- Awin offers and vouchers article: https://success.awin.com/articles/en_US/Knowledge/How-do-I-find-an-advertiser-offers-vouchers
- Awin joining fee: https://www.awin.com/gb/compliance-and-regulations/application-process-and-joining-fee
- CJ Link Search API: https://developers.cj.com/docs/rest-apis/link-search
- Rakuten Coupon Feed API: https://pubhelp.rakutenadvertising.com/hc/en-us/articles/5949828511757-Coupon-Feed-API
- impact.com Ads API: https://integrations.impact.com/partner-api-reference/partner-v15/reference/ads/ads
- Webgains API: https://knowledgehub.webgains.com/home/what-api-connections-do-webgains-offer-for-publish
- Skimlinks Merchant API: https://developers.skimlinks.com/merchant.html
- Sovrn Coupons API: https://developer.sovrn.com/reference/coupons
- eBay developer free tier (via eBay Partner Network): https://partnernetwork.ebay.com.au/solutions/step-4-optimizing-and-automating
- idealo Business API: https://business.idealo.com/de/assets/api/price-report.html
- PriceRunner via PricePirate: https://pricepirate.com/docs/en/solutions/price-data-api
- PriceSpy, How we make money: https://pricespy.co.uk/information/how-we-make-money
- Google Merchant API: https://developers.google.com/merchant/api/guides/compatibility/overview
- Student Beans on Awin: https://www.awin.com/gb/publishers/case-studies/publisher-spotlight-student-beans
- Quidco on Awin: https://ui.awin.com/merchant-profile/15819
- TopCashback on Awin: https://ui.awin.com/merchant-profile/2459
- [Verge] Honey: https://www.theverge.com/2024/12/23/24328268/honey-coupon-code-browser-extension-scam-influencers-affiliate-marketing
- [Snopes] Honey: https://www.snopes.com/news/2024/12/30/honey-browser-extension-scam/
- [9to5Google] Honey update: https://9to5google.com/2025/03/13/honey-affiliate-update/
- [Complaint] Honey class action complaint: https://ppc.land/content/files/2024/12/gov.uscourts.cand.441974.1.0.pdf
- ASA, Affiliate marketing: https://www.asa.org.uk/advice-online/affiliate-marketing.html
