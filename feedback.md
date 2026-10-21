# Vego Singles: production review and release

**Date:** 2026-10-21, Costa Rica  
**Live site:** https://www.vego.singles/  
**Review mode:** Browser interaction and screenshots, component tests, HTTP checks, and PostgreSQL integration checks  
**Source:** `javeo22/vego.singles`, production branch `main`, application commit `678baca43d01d64152e4959cf6ebf730bd2c7689`  
**Final deployment:** `dpl_62ZjWpBGnKGhzbsWg9cU6pCf6mKN`  
**Viewports:** 1440×900 desktop, 768×1024 tablet, 375×812 mobile; dimensions checked in the rendered page. No horizontal document overflow at those widths.

## Outcome

The requested delivery, WhatsApp and Collectr changes are deployed. All recommendations from the first review are implemented. A further live test found that the account page initially displayed an empty cart; the follow-up release restores it from current public inventory on account pages too.

The original workspace was an obsolete August version. Production's actual source was recovered from GitHub at `d258f94`; the previous folder is preserved at `/Users/javiervega/projects/vego-singles-legacy-20261021`.

## Findings addressed

### Major: checkout destination and delivery terms

Production previously offered Duelist Kingdom and used the old WhatsApp destination. The storefront now uses **+506 7018 0855** and offers coordinated shipping, express and pickup. Express has an additional fee quoted through WhatsApp. An unquoted shipping fee is excluded from the displayed total and explicitly marked pending. Pickup shows no shipping charge.

The administrator records the agreed fee and reason before completing a shipping sale. The database rejects a sale with a pending delivery quote. Historical orders retain their delivery data, and the RPC supports checkout pages opened before the release during deployment transitions.

**Evidence:** [live mobile express checkout](docs/review-2026-10-21/deployed-mobile-express.jpg). The live checkout reached WhatsApp's confirmation page headed “Chat on WhatsApp with +506 7018 0855”, with collector number, language, condition, finish, server subtotal and the express quotation notice. No WhatsApp message was sent.

### Major: cart loss and account navigation

The original cart disappeared on reload. The updated version persists a versioned list of listing IDs and quantities plus delivery preference. Restoration uses current public inventory, refreshes prices, caps quantities and removes unavailable listings with a notice. Prices and reservations remain server controlled.

Account pages restore saved cards through a bounded public-inventory endpoint, including after a full reload. A failed refresh preserves the saved selection and offers recovery through the catalog. The cart shows a loading state while recovering. New orders are limited to the server's maximum of 30 distinct listings.

### Major: exact printing details and navigation

Product dialogs now include collector number, translated condition/language/finish and special treatment when present. Opening a product creates a shareable `card` URL; opening that URL restores the same product, and browser Back closes the dialog.

**Evidence:** [live tablet product detail](docs/review-2026-10-21/deployed-tablet-product.jpg).

### Major: Collectr export intake

The expected 1,035-row export exceeded the previous 1,000-row limit and its `Variance` field was not mapped. The parser and database now accept up to 5,000 rows. Intake maps finishes, separates recognized treatment suffixes from provider search names, preserves source values and dated price snapshots, and provides explicit language/currency controls.

Unsupported games, missing identifiers, watchlist entries and graded cards require review. Source CSV prices never become approved store prices automatically. Local matching requires a unique exact printing, including name and physical variant; provider/manual resolution retains treatment information.

The supplied export was reviewed, **not imported into production inventory**. See [CSV and pricing-source review](docs/COLLECTR_REVIEW.md) and the [audit results](docs/review-2026-10-21/import-audit.json).

### Minor: mobile accessibility and finish labels

The account link has an accessible name at mobile widths. Shared labels normalize `holofoil`, `reverse_holofoil` and other legacy finish spellings throughout product details, cart and WhatsApp messages.

### Minor: catalog filtering and excessive rendering

Customers can filter by set, language and finish alongside game/type/search and price order. Search includes collector numbers. Filters are reflected in the URL and recover on reload. Expanded results load in batches of 24; the live test verified the progression from 24 to 48 cards and exact filtering to the Team Up printing.

**Evidence:** [live desktop storefront](docs/review-2026-10-21/deployed-desktop.jpg).

## Verification

- **119 automated tests passed**, including real PostgreSQL tests through PGlite, delivery quotation permissions/idempotency, rollback on rejected sales, 1,035-row staging, exact pricing-source matching, cart reconciliation and account-page recovery.
- ESLint, TypeScript and the production build passed.
- Migration `202610210001_delivery_and_collectr` passed a rollback rehearsal against the production schema, then was applied atomically and recorded in `supabase_migrations.schema_migrations`.
- Production database checks exercised coordinated delivery, express, pickup, legacy-client compatibility, duplicate retries, quoting, reservation, cancellation, sale and fulfillment inside a transaction that was rolled back. A temporary location transfer inside that transaction allowed testing the existing physical-location requirement without changing live stock.
- Staged HTTP checkout returned server prices and pending express delivery; retrying returned the same request number.
- Live browser checkout saved a real test inquiry and opened the correct WhatsApp draft. Both release test inquiries were cancelled through the normal command; stock remained **332 copies**, with **289 public listings**.
- Public settings enabled checkout. Unauthenticated administration returned 401; invalid inquiries returned 400, foreign origins 403, and new Duelist Kingdom requests 400.
- Storefront browsing, filtering, pagination, sorting, empty-state recovery, product details/deep links, Back, cart controls, reload recovery, account navigation, express and pickup were exercised in the browser.
- Vercel's runtime error/fatal scan returned no matching records for the tested release. Browser console results are recorded in the release verification notes below.

## Remaining operational issue

All **332 copies remain in `UNASSIGNED`**, an inactive stock location. This predates the release. The existing sales flow requires physically located stock before a sale can complete. Staff should confirm each card's actual location and use the inventory transfer action. No physical locations were guessed or permanently changed during verification.

Authenticated admin screens were covered by component and database tests, rather than a signed-in production browser session. No real payment, sale, shipment or WhatsApp message was completed.

## Final release record

- **URL:** https://www.vego.singles/
- **Target / status:** production / READY
- **Application commit:** `678baca`
- **Framework:** Next.js 15.5.27, Node.js 24
- **Build duration:** 57 seconds
- **Error scan:** zero runtime error/fatal records in the checked release window; zero browser warnings/errors in the final storefront session.
- **Monitoring scope:** point-in-time Vercel logs and browser checks. Log drains and ongoing alerting were not assessed or changed.
- **Final account regression:** reloaded `/login`, recovered the saved card with the current price and pickup preference, opened its cart, and returned to the catalog with the selection intact.
- **Final quantity regression:** the live card had two available copies; the increment control disabled at two and the subtotal became ₡55,000.
- **Keyboard regression:** Escape closed the card dialog and restored focus to its “Ver…” button.
- **Cleanup:** both test inquiries are cancelled, the test cart is empty, the responsive viewport override was reset, and no WhatsApp message was sent.

## Subsequent stock intake

After the release checks above, 703 copies across 668 missing variants were received as unpublished, quarantined inventory with language pending review. Physical stock is now 1,035 copies; public listings remain 289. See [stock intake receipt](docs/STOCK_INTAKE_2026_10_21.md).
