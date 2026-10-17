# Wishlist Drop: Monetization Plan (UK)
_Draft, 17 Oct 2026. Figures marked **[EST]** are my own estimates. Rates marked **[VERIFY]** come from third-party sources or may have changed, so check them in the network dashboard before relying on them._

## 1. What comparable apps do
| Product | Model | Note |
|---|---|---|
| CamelCamelCamel | Entirely free. Paid by Amazon affiliate clickouts and ads | Small team, running since 2008 [1][2] |
| Keepa | Free charts and alerts. Pro €29/mo or €290/yr. Data API from €49/mo | Paid tier aimed at sellers and power users [1][3] |
| PriceSpy | Free to consumers. Retailers pay a fixed cost per click, plus display ads and aggregated data reports (no personal data) | [4] |
| PriceRunner | Free comparison site. Retailer CPC and affiliate clickouts **[VERIFY]** | Same model as PriceSpy |
| Honey (PayPal) | Affiliate commission on checkout | Class action in 2024 over cookie replacement, then a Chrome policy change in 2025. **Warning: never overwrite other affiliates' attribution** [5] |

**What this tells us:** casual consumer price trackers make their money from affiliate clickouts. Subscriptions only work for power users, as with Keepa. Wishlist Drop's advantage is purchase intent: every alert is about an item the user has already chosen and is waiting to buy.

## 2. Revenue streams, ranked
1. **Affiliate clickouts (core).** The "Buy at Currys/Amazon" button on alerts and cards.
   - Currys via Awin: 3% for editorial/community publishers, 2% for comparison/browsers, 1% for Apple, mobiles and consoles (since 1 Aug 2025) [6]. Paid on order value excluding VAT, delivery and warranties, and only after dispatch plus the 30-day returns window.
   - Argos: about 3%, mainly through CJ rather than Awin **[VERIFY]** [7]. John Lewis: up to 5% via Awin **[VERIFY]** [8].
   - Amazon UK Associates: rates vary by category and are set on the UK fee schedule [9]. Electronics are typically low single digits **[VERIFY]**.
2. **Shared Top 10 lists (growth plus affiliate).** Gift lists for birthdays and Christmas bring in new buyers. Each tagged link in a shared list must be labelled "Ad".
3. **Premium tier ("Drop+").** Suggested £2.99/mo or £24/yr **[EST]**, priced well below Keepa's €29/mo [3]. Includes:
   - more than 10 items, or several lists
   - checks every 15 minutes (free checks every few hours)
   - Amazon price history (needs Keepa, from €49/mo [3])
   - SMS or push alerts
   - multiple gift lists
4. **Retailer-sponsored placements, later.** "Featured deal" slots clearly marked Ad, following the PriceSpy model [4]. Only practical once we have meaningful traffic.
5. **Aggregated demand insights, much later.** Anonymised and aggregated wishlist demand only, which is what PriceSpy does [4]. Needs a GDPR legitimate-interest assessment first. Never sell personal data.
- **Ruled out:** cookie stuffing, Honey-style attribution overwriting [5], and invented promo codes. Deal Hunter's contract already says promo codes are only ever copied from a feed.

## 3. Rough unit economics (all [EST])
Assumptions per monthly active user (MAU):
- 10 items, with about 1.5 alerts per month that pass the 10% threshold
- 25% alert click-through, and 10% of clicks turn into a purchase
- average order value £120
- blended commission 2.5%, with 85% of commissions surviving returns and validation

That gives 1.5 × 0.25 × 0.10 × £120 × 2.5% × 0.85 ≈ **£0.10 per MAU per month**, or about £1.15 per year. Seasonal peaks (Black Friday, Christmas) could double that.

| MAU | Affiliate/mo | Premium (2% at £2.99) | Costs/mo | Net/mo |
|---|---|---|---|---|
| 1,000 | £100 | £60 | £0 (free tiers) | ~£160 |
| 10,000 | £1,000 | £600 | ~£80 (Keepa €49 + email) | ~£1.5k |
| 100,000 | £10,000 | £6,000 | ~£500–1,000 | ~£15k |

- Premium income is shown before Stripe fees (about 1.5% + 20p for UK cards **[VERIFY]**) and before VAT once over the threshold.
- The biggest factors are AOV and commission rate. Tech items have a high AOV but a low rate.

## 4. Phased plan
- **Phase 0, free launch (now).**
  - GitHub Pages site with HotUKDeals RSS, labelled community reported. No affiliate links yet.
  - Privacy notice live, and analytics only with consent.
  - Goal: 500–1,000 users and real wishlists.
- **Phase 1, affiliate (after approvals).**
  - Join Awin (refundable £5 deposit [10]) and apply to Currys, John Lewis and others. Join Amazon Associates UK.
  - Add "Ad" labels next to every tagged link.
  - Amazon rules to plan around:
    - PA-API 5.0 was deprecated on 30 Apr 2026 in favour of the Creators API [11].
    - The Creators API requires **10 qualified sales in the trailing 30 days** [12]. Expect to launch Amazon with plain tagged links first and add API price data later.
    - The old PA-API cut off access after 30 days without sales [11].
    - The Associates Operating Agreement restricts tagged links in emails **[VERIFY]**. Email alerts should link back to the Wishlist Drop site, with the Amazon link on the site.
- **Phase 2, premium (about 5k MAU or more).**
  - Stripe checkout for Drop+. Turn on Keepa (from €49/mo) only once premium revenue covers it.
  - Test pricing at £1.99, £2.99 and £3.99 **[EST]**.
- **Phase 3, B2B.** Sponsored slots and aggregated insights.

## 5. UK compliance checklist
- **ASA/CAP rules 2.1 and 2.3.** Affiliate links are advertising [13].
  - Put a clear "Ad" label at the start of affiliate content, or by each tagged link.
  - A footer disclaimer, or vague "may earn commission" wording, is **not enough**. Avoid "#aff" [13][14].
  - The same applies to shared Top 10 lists.
- **Pricing claims (CAP section 3 and the DMCC Act 2024 / CPRs) [VERIFY].**
  - "10% off" must be measured against a genuine recent price, not an inflated list price.
  - Show the source and time of each check, and keep the demo and community-reported labels.
- **UK GDPR, PECR and Data (Use and Access) Act 2025 [VERIFY].**
  - Lawful basis for alert emails is contract or consent. Marketing emails need opt-in.
  - Cookie consent for affiliate and analytics cookies, data minimisation, deletion on request, and a privacy policy.
  - Register with the ICO (data protection fee, about £40–60/yr) **[VERIFY]**.
- **Network terms.** Follow Awin's and each retailer's rules (for example, Currys forbids BNPL promotion [6]) and Amazon's rules on price display.

## 6. What Nathan needs to approve
1. **Applying to Awin**: £5 deposit, refunded at your first payout [10]. Uses your identity and card, and needs the live site URL.
2. **Applying to Amazon Associates UK**: free, but needs your tax and identity details.
3. **Applying to CJ** (for Argos), if wanted.
4. **Turning on monetised links**, with "Ad" labels on the live site.
5. **Keepa API from €49/mo**, deferred until premium revenue covers it.
6. **Stripe account and premium pricing**, in Phase 2.
7. **Who operates the service**: sole trader or a limited company, ICO registration, and a privacy policy and terms.

## Sources
1. RevenueGeeks, Keepa vs CamelCamelCamel 2026: https://revenuegeeks.com/compare/keepa-vs-camelcamelcamel
2. GoAura, CamelCamelCamel vs Keepa: https://goaura.com/blog/camelcamelcamel-vs-keepa
3. Keepa API plans and tokens: https://keepa.com/api-docs/plans-tokens.html
4. PriceSpy, How we make money: https://pricespy.co.uk/information/how-we-make-money
5. HLD Handbook, price tracking case study (Honey litigation): https://hld.handbook.academy/curriculum/case-studies/price-tracking/
6. Awin, Currys programme: https://ui.awin.com/merchant-profile/1599
7. UpPromote, Argos affiliate: https://uppromote.com/affiliate-directory/argos/
8. Creator-Hero, UK affiliate programmes: https://www.creator-hero.com/blog/best-affiliate-programs-in-the-uk
9. Amazon.co.uk Associates fee schedule: https://affiliate-program.amazon.co.uk/promotion/feestructure
10. Awin, joining fee: https://www.awin.com/gb/compliance-and-regulations/application-process-and-joining-fee
11. Amazon PA-API 5.0 rates and deprecation: https://webservices.amazon.eu/paapi5/documentation/troubleshooting/api-rates.html
12. Amazon Creators API eligibility: https://affiliate-program.amazon.com.au/creatorsapi/docs/en-us/troubleshooting/error-codes-and-messages
13. ASA, Online affiliate marketing: https://www.asa.org.uk/advice-online/affiliate-marketing.html
14. ASA, Influencers' guide (2023): https://asa.org.uk/static/790d2e01-e3f8-4fea-b3c99ef91a9f04dc/Influencerguidance2023v4-FINAL.pdf
