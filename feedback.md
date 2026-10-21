# App Review: Vego Singles

**Tested on**: 2026-10-21 (Costa Rica)
**URL**: https://vego-singles.vercel.app/ (also served at https://www.vego.singles/)
**Review mode**: Browser (interactive testing with screenshots), supported by source and PostgreSQL integration tests
**Viewports tested**: Desktop, compact tablet/panel, Mobile (375×812). Saved desktop/tablet captures are 1265×712 and 464×1004; the desktop app resized the hidden panel. A later attempt to recapture exact 1440×900 and 768×1024 screenshots timed out, so exact tablet-breakpoint certification is incomplete.
**Source baseline**: GitHub `javeo22/vego.singles`, deployed commit `d258f94f7cc52464ac6732c8f69ec115ca335d19` (2026-10-08).

## Summary

The live storefront is polished and its public browsing, search, card dialog and cart flows work. Delivery information and persistence are the main friction points. Changes in this checkout address the WhatsApp destination, delivery choices, pending shipping totals and Collectr intake; the remaining UX recommendations are now implemented and awaiting production verification.

The original parent directory was an August version, substantially different from production. It was restored after identifying the mismatch and preserved at `/Users/javiervega/projects/vego-singles-legacy-20261021`. The project root now contains the current source and the proposed changes; the delivery/import migration has now been applied to production and this release is being staged for live verification.

## Findings

### Critical

No critical failure was observed in the public journeys exercised. Authenticated production administration and a real purchase lifecycle were not executed in the browser.

### Major

#### Checkout: delivery is inconsistent and the WhatsApp destination is outdated — implemented locally

- **What happens**: Production offers Duelist Kingdom and pickup, shows ₡500 delivery, and repeats the card subtotal as the final summary amount. Footer links and checkout use the previous WhatsApp number. Express is mentioned only in the footer.
- **Expected**: Use +506 7018 0855, offer coordinated shipping, express and pickup, and make unquoted costs explicit.
- **Why it matters**: Customers reach the wrong destination or misunderstand the delivery charge and available choices.
- **Suggested fix**: Implemented in `lib/fulfillment.ts`, `components/cart-panel.tsx`, `components/site-footer.tsx` and the delivery migration. Pending shipping is excluded from the displayed total. Admins record the agreed fee and reason before selling. Historical DK requests retain their labels.
- **Viewport**: All
- **Evidence**: [Production cart](docs/review-2026-10-21/live-mobile-cart.jpg), [updated express cart](docs/review-2026-10-21/updated-mobile-express.jpg).

---

#### Cart: reload or a full navigation loses the selection — implemented locally

- **What happens**: After adding a card, a production reload changes `Carrito (1)` to `Carrito (0)`. `components/shop-provider.tsx` stores the selection only in React state.
- **Expected**: Returning shoppers recover their selection and fulfillment preference.
- **Why it matters**: A shopper comparing cards or visiting the account screen can lose their work.
- **Suggested fix**: Persist a versioned list of listing IDs and quantities in local storage. Reconcile with live catalog data on restore, disclose unavailable cards and use server prices at checkout. Do not persist an authoritative price or reservation claim.
- **Viewport**: All

---

#### Product details: collector number is missing — implemented locally

- **What happens**: The Pikachu & Zekrom GX dialog shows Team Up, language, condition and finish, but omits collector number 33.
- **Expected**: Show set, collector number, language, finish and any special treatment together.
- **Why it matters**: Collectors need to distinguish printings with the same name before adding to cart.
- **Suggested fix**: Add collector number to the definition list in the product dialog. Include treatment when exposed in public inventory. Add a stable product URL so a shopper can share the exact printing and use browser Back predictably.
- **Viewport**: All; observed on Mobile
- **Evidence**: [Product dialog](docs/review-2026-10-21/live-mobile-product.jpg).

---

#### Import: the supplied file exceeds the batch limit and `Variance` is unmapped — implemented locally

- **What happens**: The deployed parser rejects the complete 1,035-row file because of its 1,000-row maximum. Collectr's `Variance` is absent from the finish aliases, and treatment suffixes remain in provider search names.
- **Expected**: Stage the full export, preserve finishes and exact treatment distinctions, and show invalid rows separately.
- **Why it matters**: The expected intake file cannot be used directly; missing finishes prevent reliable inventory and market matching.
- **Suggested fix**: Implemented a 5,000-row maximum in parser and SQL, `Variance` mapping, canonical-name/treatment separation, explicit missing-language and currency controls, dated source-price snapshots, watchlist/graded review flags and a stricter name requirement for automatic local matches. No CSV price becomes an approved sale price automatically.
- **Viewport**: Admin; validated through parser, UI tests and PostgreSQL tests
- **Details**: [CSV and pricing review](docs/COLLECTR_REVIEW.md).

### Minor

#### Mobile header: account link lacks an accessible name — implemented locally

- **What happens**: At mobile width the account link appears in the accessibility tree as an unnamed link. The visible `Cuenta` text is hidden while the icon supplies no accessible label.
- **Expected**: Screen readers announce “Cuenta” at every width.
- **Why it matters**: An icon-only account action is difficult to identify without vision.
- **Suggested fix**: Add `aria-label="Cuenta"` to the `/login` anchor in `components/site-header.tsx`.
- **Viewport**: Mobile

---

#### Product finish: technical values reach the customer — implemented locally

- **What happens**: The product dialog displays `holofoil` directly.
- **Expected**: Consistent customer labels, such as Holo and Reverse holo.
- **Why it matters**: The catalog and cart already use friendlier translated labels; inconsistent naming adds uncertainty.
- **Suggested fix**: Route all finish labels through the shared `variantLabel` mapping and include snake-case legacy aliases.
- **Viewport**: All

---

#### Large catalog: finding an exact printing takes unnecessary scrolling — implemented locally

- **What happens**: The Pokémon category renders 166 results. Navigation provides game/type choices and price sorting, but no customer controls for set, language or finish.
- **Expected**: Narrow a large category to the desired printing quickly.
- **Why it matters**: A 1,035-row intake will make category browsing much longer.
- **Suggested fix**: Add set, language and finish filters, collector-number search and incremental result loading. Put filter state in the URL so searches are shareable and survive navigation.
- **Viewport**: All, especially Mobile

## What Works Well

- Clear visual hierarchy, readable prices and consistent card imagery.
- Search gives an explicit empty state and a working clear-filters recovery action.
- Product and cart dialogs keep the primary action easy to find.
- Quantity controls honor known available stock; adding a card does not claim to reserve it.
- Unauthenticated `/admin` navigation reaches the login screen without exposing administration data.

## Console Errors

No browser console errors or warnings were observed in the captured production browsing session. This is not a complete network or authenticated-admin audit.

## Verification and limitations

- Production browser journeys: home/category browsing, search/no-results recovery, product details, cart add/open, stock limits, cart reset on reload, responsive views and unauthenticated admin access.
- Updated source browser journeys at `http://localhost:3001`: express selection and pending-fee total, pickup selection, footer destination and real WhatsApp handoff showing +506 7018 0855 with the card variant and express request. The WhatsApp message was not sent.
- Baseline current-source tests: 108 passed. Updated suite: 114 passed. Lint, TypeScript and the production build passed.
- PostgreSQL/PGlite: migrations, service-only inquiry creation, retry idempotency, unquoted express state, role restrictions, delivery fee confirmation, prevention/rollback of selling before the quote, correct stock deduction after confirmation, and staging all 1,035 synthetic rows.
- The saved-inquiry browser branch uses component tests with controlled HTTP responses plus real PostgreSQL integration tests. A live authenticated browser-to-production inquiry/quote/sale flow was not run; no production stock, inquiries or prices were changed.
- Apply `supabase/migrations/202610210001_delivery_and_collectr.sql` and set `NEXT_PUBLIC_WHATSAPP_NUMBER=50670180855` in the deployment environment before releasing this code. Database and deployment changes remain pending.
