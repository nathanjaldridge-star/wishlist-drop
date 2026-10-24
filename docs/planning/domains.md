# Drop Club: domain availability and naming risk
Checked 21 Oct 2026, around 20:40–21:00 UK time (BST). Nothing was registered, bought or signed up for.

**Method:** RDAP via rdap.org (and Verisign's own RDAP for .com). An answer of 200 means the domain is registered. A 404 means there's no record. For TLDs where RDAP isn't available (.co, .io, .eu, .me), I used a DNS NS lookup through Cloudflare DNS over HTTPS. NXDOMAIN at the registry means it's probably available. The whois port (43) is blocked from the box. "Available" here means no registration record exists. It does **not** rule out registry premium pricing, which only shows at a registrar's checkout.

**Prices:** Porkbun's public pricing API (`POST https://api.porkbun.com/api/json/v3/pricing/get`, which feeds https://porkbun.com/products/domains). Prices are in USD, first year / renewal, and exclude VAT. Raw file: `.porkbun-pricing-2026-10-21.json`.

## Available (no registration record)
| Domain | Evidence | Porkbun 1st yr / renewal (USD) | Notes |
|---|---|---|---|
| mydropclub.com | Verisign RDAP 404 + NXDOMAIN | 11.08 / 11.08 | Fits "my Top 10 list", .com |
| dropclubapp.com | Verisign 404 + NXDOMAIN | 11.08 / 11.08 | Clear, works in every market |
| trydropclub.com | Verisign 404 + NXDOMAIN | 11.08 / 11.08 | Common startup pattern |
| usedropclub.com | Verisign 404 + NXDOMAIN | 11.08 / 11.08 | |
| dropclubdeals.com | Verisign 404 + NXDOMAIN | 11.08 / 11.08 | Says what it does; a bit long |
| dropclubalerts.com | Verisign 404 + NXDOMAIN | 11.08 / 11.08 | Long |
| getdropclub.app | RDAP "not found" + NXDOMAIN | 8.75 / 14.93 | .app forces HTTPS (HSTS preload) |
| dropclub.deals | RDAP "Object not found" + NXDOMAIN | 3.60 / 34.50 | Short names could be premium; expensive renewal |
| dropclub.gift | Registry RDAP says "available for registration" | 16.58 / 16.58 | Christmas campaign redirect |
| dropclub.store | Registry RDAP says "available for registration" | 2.57 / 43.77 | Expensive renewal |
| dropclub.club | RDAP "No data found" + NXDOMAIN | 4.12 / 15.96 | "club.club" is clunky; could be premium |
| dropclub.me | NXDOMAIN (no RDAP) | 17.27 / 17.27 | Confirm at checkout |
| dropclub.eu | NXDOMAIN (no RDAP) | 5.88 / 5.88 | **Requires an EU/EEA resident or company**. UK residents haven't been eligible since Brexit |

## Taken
| Domain | Registered (UTC) / registrar | What's there |
|---|---|---|
| **dropclub.com** | 14 Dec 2003, GoDaddy; expires 14 Dec 2026 | NS = ParkingCrew (a parking/monetisation service). The homepage returns HTTP 410 to scripts. **Parked, not an active brand.** It's probably buyable from the owner, but no price is listed and a 2-word .com aged 22 years usually means 4–5 figures (estimate, not a quote) |
| dropclub.co | Spaceship ("launch" NS) | No A record. Parked/held |
| dropclub.io | Spaceship | **Active:** "Drop Club – A Token-Powered Members Rewards Club for Fans & Creators" |
| dropclub.app | 3 Jun 2025, GoDaddy | GoDaddy holding/builder page, no real content |
| dropclub.co.uk | 6 Nov 2025, Spaceship; expires 6 Nov 2026 | NS = Afternic: **listed for sale on the aftermarket** (price not shown) |
| dropclub.uk | 6 Sep 2026, Spaceship | **Active:** "Dropclub — Pokémon live drops on Whatnot" (UK) |
| dropclub.shop | 23 Jul 2025, Namecheap | Shopify "Store unavailable" (closed shop) |
| dropclub.net / .org / .ai / .com.au | GoDaddy (.ai registered 26 Sep 2026) | GoDaddy default/parking, no brand content found |
| dropclub.xyz | Jun 2026 | NS = Afternic: for sale |
| getdropclub.com | **8 Oct 2026** (13 days ago), GoDaddy | Blank lander |
| joindropclub.com | Oct 2025 | "Squarespace – Website Expired" |
| dropclubhq.com | Jun 2026, GoDaddy | Nothing served |
| thedropclub.com | 2017 | **Active:** "Drop Club Shop", Puerto Rico padel store/club |
| thedropclub.co.uk | 31 Aug 2026, 123-reg | Lander (possibly linked to the UK company below; unverified) |

## Brand / trademark clash check (quick, not legal advice)
- **US trademark:** DROP CLUB, reg. 7886663 (Cupey Social Club LLC, Puerto Rico), **Class 41** (padel/fitness information and events), stylised green logo. Different class and field from price alerts (Classes 35/42/9), so it's a low direct-conflict risk, but it shows the name is in use. Sources: trademarkelite.com/trademark/trademark-detail/98640429/DROP-CLUB, markinton.com/trademark/drop-club-98640429
- **UK company:** THE DROP CLUB LTD (16747851), Bolton, incorporated 29 Sep 2025, SIC 46499 wholesale household goods (opengovuk.com/company/16747851). It's close to retail, which is worth noting.
- **Active "Drop Club" names in deals/retail/drops:** dropclub.uk (Pokémon live drops, UK); dropclub.io (token rewards members club); "The Drop Club" UK sneaker Discord/cook group; dropclub.info (sneaker resell group, uses ®); "INSERT Drop Club" streetwear membership; DROP Streetwear (Malaysia) "DROP CLUB" loyalty scheme; **Price Drop Club** (pricedropclub.com), a US Amazon promo-code deals site, which is the closest concept.
- **UK IPO search** (trademarks.ipo.gov.uk) returned 403 to the box, and **EUIPO eSearch** needs a JavaScript browser. Neither was checked directly. Web searches didn't turn up any UK/EU "DROP CLUB" mark in Class 35/42, but that is **not** a clearance. Run a manual UK IPO + EUIPO/TMview search before spending on marketing.

## Verdict
- No blocking trademark was found in our field, so the name is usable for the beta. But it's **crowded and weakly distinctive**. In e-commerce, "drop" mainly means limited sneaker/streetwear/collectible releases, and several small "Drop Club" brands exist, including one UK collectibles seller on dropclub.uk. It would be hard to own in search and hard to trademark strongly.
- dropclub.com is parked (ParkingCrew) and is probably for sale at a premium. dropclub.co.uk is listed on Afternic.
- Recommendation: if the name stays, register one .com variant now (mydropclub.com or dropclubapp.com) with /uk, /us, /au paths, and optionally dropclub.gift for Christmas. If Nathan wants a name he can own and trademark long term, rename **before** the Christmas marketing push, not after.

## Top 5 picks (available, ranked)
1. **mydropclub.com**: .com, so it travels to every market; matches the personal Top 10; $11.08/yr flat
2. **dropclubapp.com**: .com, unambiguous, $11.08/yr
3. **trydropclub.com**: .com, the standard pattern for a product launch, $11.08/yr
4. **getdropclub.app**: short, modern, cheap first year ($8.75, then $14.93); note getdropclub.com was just taken by someone else
5. **dropclub.gift**: seasonal Christmas redirect/landing ($16.58/yr), not the main domain

(dropclubdeals.com is the runner-up. dropclub.deals and dropclub.store are cheap the first year but renew at $34–44.)
