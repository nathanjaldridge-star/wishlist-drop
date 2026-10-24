# Drop Club: how we work

Drop Club (formerly Wishlist Drop) lets people list up to 10 things they want and alerts them when the price drops 10% or more below what we've actually seen. It's a static site on GitHub Pages. Live: https://nathanjaldridge-star.github.io/wishlist-drop/

**People:** Nathan Aldridge (@nathanjaldridge-star) and Simon Peters (@simonjpeters-arch).
**Dates:** soft launch **Tue 27 Oct 2026**, public beta **Wed 28 Oct 2026**, Black Friday week **20 Nov–1 Dec**, then the Christmas push.

## 1. Where the plan lives
- **GitHub issues are the source of truth.** If it isn't in an issue, it isn't planned. The pinned **[Launch plan](https://github.com/nathanjaldridge-star/wishlist-drop/issues/27)** lists every issue in priority order.
- Milestones: [Public beta - 28 Oct 2026](https://github.com/nathanjaldridge-star/wishlist-drop/milestone/1) and [Christmas push](https://github.com/nathanjaldridge-star/wishlist-drop/milestone/2).
- Labels:
  - `priority:P0` must ship for the beta, `P1` is important, `P2` is later.
  - `area:*` says which part of the app.
  - `needs-nathan-decision` means it's blocked on an account, payment, approval or wording only Nathan can give.
  - `good-first-task` is small and self-contained.
- Before you start an issue, **assign yourself** so we don't both pick it up. Comment when you're blocked, and say what you need from whom.
- Older planning notes are in `docs/planning/` (LAUNCH-READINESS, SOURCES, domains). They're background only. Issues override them.

## 2. Suggested split (a suggestion, change it freely)
| Who | Owns |
|---|---|
| **Nathan** | Decisions, accounts, money and legal: sole trader or Ltd, contact details, ICO fee, domain, free accounts (eBay Developer, Supabase, Cloudflare, Resend/Brevo, analytics), legal wording, affiliate applications (Amazon Associates, Awin, EPN), Keepa spend, inviting testers |
| **Simon** | Engineering: eBay Browse adapter, Supabase sign-in and sync, scheduled price checker, email alerts, rate limits |
| **Either** | Auto-fetch price phase 1, legal page drafting, "report wrong price", mirror monitoring, QA. Each person reviews the other's work |

## 3. Branch + PR workflow
1. `git switch -c <issue-number>-short-name` (e.g. `1-auto-fetch-price`).
2. Make the change in **`build/src.html`** (not `index.html`) and run **`node build/build.js`**. It regenerates `index.html` with the HotUKDeals snapshot inlined. Commit both files.
3. Run the tests (section 5). Add a test for any new behaviour.
4. Open a PR with `Closes #N` in the description. **The other person reviews and merges.** Small fixes to docs can go straight to `main`.
5. `main` deploys to GitHub Pages automatically within about 1 minute. Treat `main` as live.

## 4. House rules (non-negotiable)
- **Never commit secrets.** No API keys, tokens or passwords in files, issues, PRs or chat. Put them in GitHub → Settings → Secrets and variables → Actions (or the Worker's secrets). The browser may only ever hold public keys (for example the Supabase anon key).
- **Data is always labelled.** Every price shows its source and checked-at time. DEMO prices exist only behind `?demo=1`. Visitors never see an unlabelled or fake price. Where there's no price, show "Watching – no live price yet".
- **Honest pricing:** a drop is measured against the lowest price at the same retailer in the last 30 days. RRP and "was" prices are ignored. Prices are labelled "community reported" until there are 30 days of history. The rules are in `docs/price-contract.md`.
- Never call a voucher code "working". Never overwrite another affiliate's tag. Tagged links carry an "Ad" label and `rel="sponsored noopener"`.
- No server-side scraping of retailer pages. Use public RSS and APIs only.
- **No spending and no sign-ups or applications without Nathan's OK.**
- Don't edit `.github/workflows/*` without telling the other person. The HUKD mirror runs every 5 minutes and writes to the `data` branch. Never push to `data` by hand.

## 5. Setup and tests
Requirements: Node 20+, git, and the GitHub CLI (`gh`).
```bash
git clone https://github.com/nathanjaldridge-star/wishlist-drop.git && cd wishlist-drop
npm install                 # dev-only deps: playwright-core, axe-core, ajv
npm run browser             # one-off: downloads Chromium for the tests
npm run build               # = node build/build.js  (regenerates index.html)
npm run test:mirror         # HUKD fetcher, offline (~2s)
npm run test:unit           # build/test.js: price contract + app behaviour (~10s)
npm run qa                  # qa/qa.js: full UI/QA suite, 77 checks, ~5 min; writes screenshots to qa/
npm test                    # all of the above
```
To use an installed Chrome instead of the downloaded one, set `CHROME_PATH=/path/to/chrome`. To preview locally, open `index.html` in a browser, or run `npx serve .`. Add `?demo=1` for demo data and `?season=xmas` for Christmas mode.

## 6. Map of the repo
| Path | What |
|---|---|
| `build/src.html` | **The app** (single file: HTML+CSS+JS). Edit this |
| `index.html` | Built output served by Pages. Don't hand-edit |
| `build/build.js`, `build/hukd_sample.xml` | Build step and the embedded HUKD snapshot |
| `scripts/fetch-hukd.mjs`, `scripts/hukd-config.json` | HotUKDeals RSS mirror (run by the workflow) |
| `.github/workflows/hukd-mirror.yml` | Every-5-minute mirror → `data` branch (`hukd.json`, `price-log.jsonl`) |
| `docs/price-contract*.{md,json}` | Price record format every adapter must return |
| `docs/cloudflare-worker-cron.md` | 2-minute polling plan for BF week |
| `MONETIZATION.md`, `docs/planning/` | Business, sources and launch background |
| `qa/` | QA suite, report and screenshots |

## 7. Weekly rhythm (suggested)
- A short daily check-in until 28 Oct. Look at the Launch plan, move items along and clear any `needs-nathan-decision` items.
- After the beta, a weekly triage. New bugs get a priority label within 24h.
