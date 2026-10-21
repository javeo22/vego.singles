# CSV stock intake — 2026-10-21

The supported cards absent from inventory have been received in production. Existing quantities, prices and catalog records were preserved exactly.

| Result | Variants / source rows | Copies |
| --- | ---: | ---: |
| Added: Magic | 570 | 600 |
| Added: Pokémon | 51 | 52 |
| Added: Star Wars Unlimited | 47 | 51 |
| **Total added** | **668** | **703** |
| Existing CSV rows skipped | 297 | 331 |
| One Piece queued pending support choice | 69 | 87 |
| Watchlist excluded | 1 | 1 |

Physical inventory increased from **332 to 1,035 copies**. Public listings remain **289**. A copy absent from this portfolio export was retained; this was an add-missing-only operation, not a quantity reconciliation.

## Review status

All 703 new copies are quarantined at `UNASSIGNED`, with unpublished listings, zero approved selling price, unverified identity and unconfirmed acquisition cost. Unlabeled languages remain `unknown`: 666 new variants are unconfirmed and two preserve explicit Japanese hints. Those hints do not mark physical identity verified.

The normal verified-receiving command requires a known language and confirmed identity. This maintenance intake records provisional physical stock separately, without asserting either. Staff can find the cards under Inventario / Revisión. Confirm physical identity, language and condition before releasing quarantine, assigning an actual location, approving a CRC price and publishing.

CSV market values and costs were preserved as private source information. No currency was inferred and no CSV price became an approved store price. The six art cards and playtest card retain separate treatments for later pricing review.

## Receipt and verification

- Batch: `493b833b-24c6-445a-8dba-555e1b401a61`
- Source: `/Users/javiervega/Downloads/export.csv` (unchanged)
- SHA-256: `da6d912038c385ce56ff33b59fc2c1692f73b4622fbacfed95573a637463987f`
- Import statuses: 668 received, 69 needing review, 298 skipped (297 existing + one watchlist).
- The production rollback rehearsal passed before each receipt.
- Every original printing, listing and stock lot was compared with the pre-import snapshot and remained unchanged.
- Repeating the complete import added **zero variants and zero copies**.
- 123 automated tests, TypeScript and ESLint passed. The storefront and checkout remained available.
- Private snapshots, row decisions, catalog evidence and receipts are under `.local/stock-intake/da6d912038c3/`, which is excluded from Git.

## Missing collector numbers resolved

Eight rows initially lacked collector numbers. Unique Scryfall records supplied the catalog data while language and physical identity remained unconfirmed. The six Art Card products match `art_series` records in Tales of Middle-earth Scene Box; the original source set wording remains in the raw record. Muraganda Eldrazi retains its playtest treatment. These corrections did not edit the CSV.

| CSV row | Product | Collector number | Evidence |
| --- | --- | --- | --- |
| 30 | Courageous Resolve Art Card | 16 | [Scryfall](https://scryfall.com/card/altc/16/courageous-resolve-courageous-resolve) |
| 32 | Fell Beast’s Shriek Art Card | 18 | [Scryfall](https://scryfall.com/card/altc/18/fell-beasts-shriek-fell-beasts-shriek) |
| 34 | Gandalf of the Secret Fire Art Card | 17 | [Scryfall](https://scryfall.com/card/altc/17/gandalf-of-the-secret-fire-gandalf-of-the-secret-fire) |
| 35 | Olorin’s Searing Light Art Card | 13 | [Scryfall](https://scryfall.com/card/altc/13/ol%C3%B3rins-searing-light-ol%C3%B3rins-searing-light) |
| 36 | Rammas Echor, Ancient Shield Art Card | 15 | [Scryfall](https://scryfall.com/card/altc/15/rammas-echor-ancient-shield-rammas-echor-ancient-shield) |
| 37 | Sorcerous Squall Art Card | 14 | [Scryfall](https://scryfall.com/card/altc/14/sorcerous-squall-sorcerous-squall) |
| 200 | Muraganda Eldrazi | 519 | [Scryfall](https://scryfall.com/card/mb2/519/muraganda-eldrazi) |
| 374 | Suq'Ata Firewalker | MIR-94 | [Scryfall](https://scryfall.com/card/plst/MIR-94/suqata-firewalker) |
