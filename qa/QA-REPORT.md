# Wishlist Drop — QA report
Date: 2026-10-17 (Europe/London). Build: `index.html` generated from `build/src.html` by `node build/build.js` (inlines /workspace/deal-sources/hukd_sample.xml).
Automation: `NODE_PATH=/tmp/wdt/node_modules node qa/qa.js` (52 cases, Playwright + Chrome, axe-core). The existing `build/test.js` also passes.

**Result after fixes: 52/52 automated cases pass. Before fixes: 35/52 (several failures cascaded from bug B3).**

## Test plan / results
F = form & dashboard, S = share/read-only/card, L = storage, N = data loading, V = viewports, K = keyboard, A = accessibility.

| ID | Case | Result | Notes |
|---|---|---|---|
| F1 | First run: examples seeded + labelled, add box focused, welcome shown, no signup | ✅ PASS |  |
| F2 | Add by name with price (default 15%) | ✅ PASS |  |
| F3 | Add by link → readable name, URL kept | ✅ PASS | Sony Wireless Headphones Black 10240179 |
| F4 | Odd URLs: www., no scheme, amazon /dp/, query only, IDN, emoji path | ✅ PASS | Amazon item / Apple AirPods Pro 2nd Generation / Shop item / Café CrèMe / Wishlist item / 🎧 Headphones |
| F5 | Blank price → prompt; cancel/invalid prompt → friendly warning, nothing added | ✅ PASS |  |
| F6 | Zero / negative price rejected | ✅ PASS |  |
| F7 | Sub-penny price (0.001) rejected (would give £0.00 reference / NaN%) | ✅ PASS |  |
| F8 | Huge price (99999999) renders without overflow/NaN | ✅ PASS |  |
| F9 | % slider bounds 10 and 20 respected | ✅ PASS |  |
| F10 | £ target: 95 of 100 → clamped 10%, 50 of 100 → clamped 20%, 120 of 100 → 10%, 85 → 15% | ✅ PASS |  |
| F11 | £ target hint explains clamping | ✅ PASS |  |
| F12 | 10-item cap: 11th blocked with message; seed button blocked | ✅ PASS |  |
| F13 | Edit item: name/price/pct saved, count unchanged at cap | ✅ PASS |  |
| F14 | Cancel edit resets form | ✅ PASS |  |
| F15 | Delete item while it is being edited → submit does not crash | ✅ PASS |  |
| F16 | Empty submit → warning + focus | ✅ PASS |  |
| F17 | Error states not_found/blocked/changed render + alerts paused; back to OK | ✅ PASS |  |
| F18 | Simulate a day ×30 → ≥10% drop alert fires with retailer, all DEMO-labelled | ✅ PASS |  |
| F19 | Auto-simulate toggles on/off | ✅ PASS |  |
| F20 | Alerts tab: badge count, clear | ✅ PASS |  |
| F21 | Persistence: reload keeps items | ✅ PASS |  |
| F22 | Clear all → empty state, examples button returns | ✅ PASS |  |
| S1 | Share link round-trip: 10 items with unicode, emoji, quotes, long names | ✅ PASS | URL length 1318 |
| S2 | Corrupted hash (#list=garbage) → falls back to own list, no error | ✅ PASS |  |
| S3 | Valid base64 but wrong JSON shape (#list={"v":2,"i":"x"}) handled | ✅ PASS |  |
| S4 | XSS via crafted share hash (p field / javascript: URL / bad numbers) blocked | ✅ PASS |  |
| S5 | XSS via item name / link typed in form | ✅ PASS |  |
| S6 | Read-only view: Save a copy imports (respects 10 cap) and returns to app | ✅ PASS |  |
| S7 | "Open my own wishlist" exits read-only and clears hash | ✅ PASS |  |
| S8 | v1 share link (pounds) decodes | ✅ PASS |  |
| S9 | Copy share link button (clipboard) + message; empty list warns | ✅ PASS |  |
| S10 | Share card PNG: 10 long/emoji names drawn, download fires | ✅ PASS |  |
| S11 | Share card empty list → warning, no canvas | ✅ PASS |  |
| L1 | Corrupted localStorage {not json → app still usable | ✅ PASS |  |
| L2 | Corrupted localStorage {"items":"oops"} → app still usable | ✅ PASS |  |
| L3 | Corrupted localStorage {"items":[{"id":"a","name":"No price"}]} → app still usable | ✅ PASS |  |
| L4 | Corrupted localStorage {"items":[null,42,{"id":"b","name":"ok","orig":500,"cur":500,"pct":15,"src":"demo","hist":[]}]} → app still usable | ✅ PASS |  |
| L5 | v1 migration (incl. item with no cur) | ✅ PASS |  |
| L6 | localStorage full/disabled (setItem throws) → no crash | ✅ PASS |  |
| N1 | Offline (file://, live fetch fails) → snapshot fallback labelled | ✅ PASS |  |
| N2 | Slow/failed mirror (https path simulated via WD_MIRROR 500) → snapshot | ✅ PASS |  |
| N3 | Mirror returns changed/garbage XML → snapshot + "format changed" | ✅ PASS |  |
| N4 | Mirror OK → Live mode | ✅ PASS |  |
| N5 | HUKD feed javascript: link not rendered as href | ✅ PASS |  |
| V360 | Layout at 360px: no horizontal scroll, tabs visible, screenshot | ✅ PASS |  |
| V390 | Layout at 390px: no horizontal scroll, tabs visible, screenshot | ✅ PASS |  |
| V430 | Layout at 430px: no horizontal scroll, tabs visible, screenshot | ✅ PASS |  |
| V1280 | Layout at 1280px: no horizontal scroll, tabs visible, screenshot | ✅ PASS |  |
| K1 | Keyboard-only: add item with Tab/Enter, Space on % toggle, tabs reachable | ✅ PASS |  |
| A1 | axe-core WCAG 2.1 AA scan (watch, alerts, share, read-only) | ✅ PASS | 3 minor/moderate: watch: region (moderate) ×2 e.g. div[role="note"]; alerts: region (moderate) ×2 e.g. div[role="note"]; share: region (moderate) ×2 e.g. div[ro |
| A2 | Form controls all have accessible names | ✅ PASS |  |
| E1 | No JS errors in main session | ✅ PASS |  |

Artifacts: `qa/layout-{360,390,430,1280}.png`, `qa/ok-shared-unicode.png`, `qa/s4-shared-evil.png` / `qa/s4-imported-evil.png` (hostile share link, after the fix), `qa/ok-share-card.png`, `qa/ok-error-changed.png`, `qa/ok-alerts.png`, `qa/axe.txt`, `qa/results.json`, `qa/run.log`.

## Bugs found and fixed (in build/src.html, index.html rebuilt)
| # | Severity | Bug | Fix |
|---|---|---|---|
| B1 | **Critical (security)** | XSS through a crafted share link: the pct field went into the read-only Top 10 HTML without escaping, so code ran as soon as someone opened the link. A javascript: URL in a share link also became a clickable href after "Save a copy". | Shared lists are now cleaned in dec(): must be an array, 10-item cap, pct clamped to 10–20, prices ≥1p, source and error state on an allow-list, only http(s) URLs kept. |
| B2 | High (security) | A javascript: link in the HotUKDeals feed or mirror was rendered as the matched-deal href. | New safeUrl() lets only http(s) through on every href. |
| B3 | High | Deleting an item while it was open for editing, then pressing Save, threw a TypeError. The form stayed stuck in edit mode. | Deleting the item being edited resets the form, and saving an edit for an item that no longer exists falls back to adding it (cap still checked). |
| B4 | High | "Save a copy to my wishlist" threw a TypeError (shared was nulled before use), so the import / 10-item-limit message never showed. | The total is captured before leaving the view, and every import now shows a confirmation. |
| B5 | High | Corrupted localStorage (items not an array, null entries, missing price or alerts) crashed the app on boot. You could not add anything. | load() validates each item (cleanItem) and defaults alerts. |
| B6 | Medium | A share hash with the wrong JSON shape crashed instead of falling back. | Covered by the B1 cleaning, and an empty list shows your own wishlist. |
| B7 | Medium | A price of 0.001 was accepted as £0.00, which gave NaN% and Infinity in the comparison. No upper limit existed. | Prices must be £0.01–£1,000,000, with a friendly message. |
| B8 | Medium | v1 migration: an item without cur became NaN. | It falls back to the original price. |
| B9 | Low | Large prices overflowed the stats grid at 390px. | min-width:0 and overflow-wrap on stats. |
| B10 | Medium (a11y) | axe found 6 serious color-contrast failures on the "Awaiting approval" source rows (opacity .75). | Removed the opacity. |
| T1 | Test | The v1-migration step in build/test.js was flaky because of a race with the first-run seed save. It also fails on the original build. | The test now waits for data-ready first. |

## Open issues (not fixed)
**High (product)**
- The core goal (≥10% below reference at Amazon or top UK retailers) is still simulated. Amazon and Argos offers are DEMO only, and the only real source is HotUKDeals (community reported, fuzzy name match). Real prices need Awin, Amazon PA-API or Keepa approval.

**Medium**
- Reference price = the price the user typed, not a market price. If a user enters a wrong price, the alerts are wrong.
- ~~window.prompt/confirm~~: fixed, see U1 below.
- Share links are about 1.3 KB for 10 unicode items and can reach roughly 4–6 KB with long URLs. Some chat apps may truncate them, and a short-link service would need a backend.

**Low**
- ~~Tabs arrow keys / landmarks~~: fixed (U2, U3).
- ~~Auto-simulate not remembered~~ (fixed, U6). Price history is capped at 30 points.
- Accented casing fixed (U4); nameFromUrl still gives "Amazon item" for bare /dp/ links. The name can be edited.
- ~~Silent storage loss~~: fixed (U5).

## Not covered by automation
Real iOS Safari / Android devices, VoiceOver/TalkBack (only labels and axe were checked), the native share sheet (not available in headless), and the live GitHub Pages mirror (data/hukd.json, simulated with route mocks in N2–N5).

## Follow-up fixes (2026-10-17, 03:xx BST): previously open items now closed
| # | Item | Fix | Test |
|---|---|---|---|
| U1 | prompt()/confirm()/alert() blocked in in-app browsers | In-app modal dialog (role=dialog, aria-modal, focus trap, Esc/backdrop cancel, focus restored). Used for the missing price, manual price, delete, clear all and the copy-link fallback. No native dialogs remain. | D1 |
| U2 | Banner and nav outside landmarks (axe "region") | `<header role=banner>`, DEMO notice is a labelled region, and `<nav aria-label>` wraps the tablist. axe moderate findings went from 6 to 0. | A1, A3 |
| U3 | No arrow-key tab navigation | Roving tabindex: Left/Right/Home/End, wraps, aria-controls/labelledby. | K1 (updated), K2 |
| U4 | "Café CrèMe" title-casing | Unicode-safe word capitalisation, giving "Café Crème" and "Éléphant Rose". | T2 |
| U5 | Silent data loss without localStorage | Storage probe on boot plus a warning on save failure (visible alert banner). | L7 |
| U6 | Auto-simulate not remembered | Stored in state and restored on load. | P1 |
Tests: qa/qa.js now has 58 cases, and build/test.js uses a dialog hook (`window.WD_DIALOG_HOOK`, test-only) in place of native dialog handlers.

## Themes (2026-10-21)
`?theme=default|drop|clean|hybrid` plus a header switcher. The choice is saved in localStorage (`wishlistDrop.theme`), and a URL param wins over the stored value. Everything runs off CSS variables. Fonts (Archivo/Inter) come from Google Fonts, loaded non-blocking only for the non-default themes, with a system-font fallback offline.
New tests: TH1 (each param applies, invalid → default, DEMO banner visible), TH2 (switcher, persistence, URL precedence), TH3 (share card follows the theme), TH4 (axe WCAG AA + colour-contrast per theme on watch/alerts/top 10 + card/dialog/read-only). Results are in `qa/themes-contrast.txt`: 0 contrast failures in all 4 themes.
Orange on white: #FF6600 is used only as a background, with black text (7.2:1). Small orange text uses #B34700 (5.5:1). #E55A00 (3.6:1) is used only for large headings and UI fills (≥3:1). Note that the brief's #E55A00 alone is **not** AA for small text.
Screenshots: `themes/{default,drop,clean,hybrid}-{watch,alerts,top10,sharecard}.png`.

## Purple-clean default (2026-10-21)
The default theme was reworked to match clean's restraint, with purple #5b3df5 as the only accent (6.1:1 on white). Small purple text uses #4a2fd6.
- Off-white #fafafa background, 1px borders and no shadows, 10px radius.
- Purple fills only on the primary buttons, the active tab, and the "At target" and "below reference" badges. The Simulate button is outlined.
- Calmer weights (500/600/700) and a muted yellow DEMO banner.
- The text wordmark "Wishlist **Drop**" is in the header and on the share card.
- **Theme picker:** hidden on the plain default URL. It shows only when `?theme=` is present or a non-default theme is stored.

TH2 was updated to cover this. Tests: qa.js 62/62, build/test.js 23/23. axe contrast: 0 failures in all 4 themes (`qa/themes-contrast.txt`). Screenshots: `themes/purple-clean-{watch,alerts,top10,sharecard}.png` (since removed; superseded by `themes/dropclub-*.png`).

## Affiliate links (2026-10-21)
The config is in `build/src.html` → `var AFFILIATE = { amazonUK: { tag: '' }, ... }`. Only the "Buy on Amazon" button is ever tagged: on item cards, alerts, the Top 10 and the shared read-only view. The item's own link is never changed.
- **Canonicalisation:** links become `https://www.amazon.co.uk/dp/ASIN`. The ASIN is recognised in dp/, gp/product/, gp/aw/d/, gp/offer-listing/, exec/obidos/ASIN/ and o/ASIN/, on the www., m. and smile. hosts.
- **Tracking params:** stripped.
- **Existing tags:** an existing `tag=` is kept and ours is not added. That button gets no "Ad" label and no `sponsored`.
- **Short links:** amzn.to / amzn.eu are left untagged, with a note.
- **Tagged links:** get `rel="sponsored noopener"` and a visible "Ad" label.
- **Footer disclosure:** "As an Amazon Associate we earn from qualifying purchases."
- **Empty tag:** links are untagged, and a console message says "affiliate tag not set" (the visible dev note shows only with `?debug=1`).
- **Non-Amazon hooks:** Skimlinks, Sovrn and Awin are in `RETAILER_HOOKS`, all disabled.

Tests: AF1 (15 URL cases), AF2 (tag set: cards/alerts/shared view, existing tag kept, item link untouched, non-Amazon gets no button), AF3 (empty tag + short link), AF4 (hooks only when enabled). TH4 now includes a tagged Buy button and Ad label in every theme, with 0 contrast failures.

## Rebrand: Drop Club (2026-10-21)
- **New default:** black and orange on off-white #FAF9F6, with the orange "D" mark, the DROP CLUB wordmark and the tagline "EXCLUSIVE DROPS. REAL VALUE.".
- **Copy:** "Add new drop", "Your Drops", and drop cards showing Price (large), RRP, % off and Target.
- **Pills:** At Target is orange with black text, Dropped is black with orange text, and Watching is white with black text.
- **Monochrome UI:** the UI emoji were replaced with monochrome SVG icons, and the multi-colour accents (blue community tag, blue deal box, red/yellow error states, purple sparkline) were moved into the palette.
- **Old looks:** only via `?theme=purple|drop|clean|hybrid`.
- **Storage:** localStorage key `wishlistDrop.v2` is unchanged, so existing data is kept. The theme preference key changed to `dropClub.theme` so every returning visitor sees the new default.
- **New tests:** DC1 (brand, meta/OG, copy) and DC2 (palette audit of all screens, the share card pixels and the sparkline). TH1–TH4 were updated for 5 themes. Results: qa.js 68/68, build/test.js 23/23, axe contrast 0 failures on 25 screens (5 themes × 5).


## Top 10 compact rows + screenshot cleanup (2026-10-17)
Top 10 rows at 390px: the name is on one line (ellipsis, full name in `title`), then the status pill and price inline, then one short meta line (RRP · target · source), then the Buy button. Seed rows went from 166/124/147px to 118/100/100px tall (measured at 390px). Stale old-branded `screenshots/` and legacy `themes/*-{watch,alerts,top10,sharecard}.png` were removed. `affiliate-buy.png` and `dropclub-*.png` were regenerated. Tests: qa.js 68/68, build/test.js 23/23, axe contrast: fail 0 on all 25 screens.
