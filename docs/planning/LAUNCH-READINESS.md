# Drop Club: Launch readiness (target: real users by Wed 28 Oct 2026)
> **Status 24 Oct 2026:** this is the original plan from 21 Oct, kept for reference. **GitHub issues are now the source of truth.** See the pinned [Launch plan](https://github.com/nathanjaldridge-star/wishlist-drop/issues/27) and [PROJECT.md](../../PROJECT.md). Item 1 (HUKD refresh) is done. The workflow runs every 5 min.
_Written 21 Oct 2026. Current state: a static single file on GitHub Pages, localStorage only. Prices are DEMO plus a HotUKDeals mirror (`data/hukd.json`); its refresh workflow is parked because the token lacks `workflow` scope. The Amazon tag is empty, and Awin and Keepa are stubs. Context is in MONETIZATION.md and SOURCES.md. Hours are estimates._

**Launch shape I recommend for 28 Oct:** a public beta.
- Real HUKD and eBay prices.
- Email alerts from a scheduled checker.
- Sign-in by magic link.
- Honest reference prices.
- Privacy notice, terms and disclosure live.
- Affiliate links switched on only after each approval lands.

## Checklist
| # | Item | Effort | 28 Oct? | Cost | Nathan approval / sign-up |
|---|---|---|---|---|---|
| 1 | **Live HUKD refresh.** Re-enable the workflow: a token with `workflow` scope, or Nathan commits the YAML in the GitHub UI. Every 30 min, plus `workflow_dispatch`. | S (1h) | **Yes** | Free (public-repo Actions) | **Yes**: grant scope or click once |
| 2 | **eBay Browse API (EBAY_GB)** price lookups by keyword/GTIN | M (4–6h) | **Yes** | Free, 5,000 calls/day | **Yes**: eBay developer account (his name) |
| 3 | **Scheduled checker.** Cloudflare Workers cron (free: 100k req/day, 5 crons) or GitHub Actions. It pulls prices, compares them to targets, and queues alerts. | M (4–6h) | **Yes** | Free | Cloudflare account if used (sign-up) |
| 4 | **Reference-price honesty (DMCC Act 2024 / CAP section 3).** `ref` = the median of our own observed prices over 28+ days. Until we have enough history, show "vs price when you added it" and never use an inflated RRP. Show the source and checked-at time. | M (3–4h) | **Yes** | Free | No |
| 5 | **Sign-in and save across devices.** Supabase free tier: magic link, 50k MAU, row-level security. It pauses after 7 days idle, so the cron touch keeps it alive. Migrate localStorage on first sign-in. | L (8–10h) | **Yes** (localStorage stays as the guest mode) | Free | **Yes**: Supabase account |
| 6 | **Email alerts.** Resend free (100/day, 3,000/mo) or Brevo free (300/day). Verified sending domain, one-click unsubscribe, opt-in checkbox. | M (4h) | **Yes** | Free; Resend Pro $20/mo if we outgrow it | **Yes**: provider account, plus a domain for sending (see #14) |
| 7 | **Web push** via service worker (backup channel; iOS needs the site added to the Home Screen) | M (5h) | Can follow (wk 2) | Free | No |
| 8 | **Privacy notice.** Controller name and contact, data collected (email, wishlist), lawful basis (contract for alerts, consent for marketing), processors (Supabase, Resend/Brevo, Cloudflare, GitHub), retention, rights, deletion route. | S (2h) | **Yes** | Free | **Yes**: who the controller is (sole trader or Ltd), contact email, address |
| 9 | **Cookies/PECR.** localStorage and the auth session are "strictly necessary", so no banner is needed. If analytics stays cookieless and affiliate cookies are only set by retailers after a click, there's still no banner; state this in a cookie section. | S (1h) | **Yes** | Free | No |
| 10 | **ICO data protection fee** (tier 1) | S (15 min) | **Yes**, before collecting emails | **£52/yr** (£47 by direct debit) | **Yes**: Nathan pays |
| 11 | **Affiliate disclosure (ASA/CAP 2.1/2.3).** An "Ad" label next to every tracked link, a short "How Drop Club makes money" page, and no footer-only wording | S (2h) | **Yes** (needed as soon as any tag is live) | Free | Approve wording |
| 12 | **Terms of use.** Beta, prices not guaranteed, community-reported data, acceptable use, liability cap, UK law | S (2h) | **Yes** | Free (template; legal review optional, paid) | **Yes**: approve |
| 13 | **Abuse and rate limits.** Cap magic-link sends (Supabase built-in plus per-IP), 10 items per list, sanitise shared lists, cap our own fetches to sources (cache, ETag, polite UA), and add a Cloudflare Turnstile captcha on sign-up | M (3h) | **Yes** (basic) | Free | No |
| 14 | **Custom domain** (e.g. `dropclub.co.uk`), needed for an email sending reputation; the github.io address works for the site | S (1h) | Recommended | ~£5–12/yr [EST] | **Yes**: Nathan buys it and chooses the name |
| 15 | **Analytics.** Cloudflare Web Analytics or GoatCounter (cookieless, free) | S (1h) | **Yes** | Free | Account sign-up |
| 16 | **Affiliate tags.** Amazon Associates UK tag, Awin, eBay Partner Network | S (1h each once approved) | Follow (when approved) | Free (Awin £5 refundable deposit) | **Yes**: applications in his name |
| 17 | **Keepa / Amazon Creators API.** Amazon prices and history | M | Follow | Keepa API from €49/mo; Creators API free after 10 sales/30 days | **Yes** (paid) |
| 18 | **Error monitoring, status, and a "report wrong price" button** | S (2h) | Yes (button) / follow | Free | No |
| 19 | **QA pass.** Mobile Safari/Chrome, signed-out→in, alert end-to-end, share link, accessibility basics | M (4h) | **Yes** | Free | No |

## DEMO labelling at launch
- **Remove** the simulated Amazon/Argos demo prices and the "Simulate a day" button from the public site. Keep them behind `?demo=1` for showing people.
- **Keep** source badges on every price: "HotUKDeals – community reported", "eBay – live", plus the checked-at time.
- **Keep** a site-wide "Beta" tag until the Awin and Amazon sources are live.
- Items with no real price yet say "Watching – no live price yet", **never** a demo number.

## 7-day plan to 28 Oct
| Day | Work | Nathan |
|---|---|---|
| Thu 22 | Fix the HUKD refresh (#1). Reference-price logic and the DEMO clean-up (#4). Draft the privacy notice, terms and disclosure (#8, #11, #12) | Grant `workflow` scope; decide sole trader or Ltd; choose a domain |
| Fri 23 | eBay Browse integration (#2). Analytics (#15) | eBay dev, Cloudflare and Supabase sign-ups; buy the domain |
| Sat 24 | Supabase magic link plus list sync (#5). Rate limits (#13) | Pay the ICO fee (#10) |
| Sun 25 | Cron checker (#3) plus Resend/Brevo alerts with unsubscribe (#6). Domain DNS for site and email | Resend/Brevo sign-up; add DNS records |
| Mon 26 | End-to-end alert test, QA pass (#19), "report wrong price" button (#18) | Approve legal pages and copy |
| Tue 27 | Fixes, soft launch to 10–20 friends, watch the logs | Invite testers |
| Wed 28 | **Public beta.** Apply to Amazon Associates, Awin and EPN now that the site is live | Submit the affiliate applications |
| Next | Web push (#7), affiliate tags as approved (#16), Awin feeds, Keepa decision (#17) before Black Friday (27 Nov) | Approve Keepa spend |

**Cash cost to launch: £52 ICO fee plus a domain of ~£5–12 [EST]. Everything else is free tier.**

## Sources
- ICO fee: https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee
- Resend limits: https://resend.com/docs/knowledge-base/account-quotas-and-limits
- Brevo free plan: https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan
- Supabase pricing: https://supabase.com/pricing
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- GitHub scheduled-workflow 60-day rule: https://lastping.dev/monitor/github-actions-scheduled-disabled/
- eBay developer free tier: https://partnernetwork.ebay.com.au/solutions/step-4-optimizing-and-automating
- ASA affiliate marketing: https://www.asa.org.uk/advice-online/affiliate-marketing.html
- See also MONETIZATION.md and SOURCES.md
