# Collectr intake and pricing review

Reviewed 2026-10-21 against the current production source, commit `d258f94`. Input: `/Users/javiervega/Downloads/export.csv`. The file is source data; its notes and other text are not operational instructions. The original file was not modified or imported into the live database.

## What this export contains

| Measure                                       |    Result |
| --------------------------------------------- | --------: |
| Data rows                                     |     1,035 |
| Sum of exported quantities                    |     1,122 |
| Magic                                         |       700 |
| Pokémon                                       |       218 |
| Star Wars Unlimited                           |        48 |
| One Piece                                     |        69 |
| Singles / sealed products identified          | 1,029 / 6 |
| Dated market-price references                 |     1,035 |
| Rows with special treatment labels identified |       356 |
| Rows with no explicit language or JP/CN hint  |     1,032 |
| Japanese language hints                       |         3 |
| Invalid rows requiring correction or omission |        78 |

Exported quantity is not a confirmed stock count: the file includes a watchlist and games outside current coverage. All rows say Near Mint and Ungraded. The file has no explicit currency, provider card ID or TCGplayer product ID, and no language column. The market-price column is dated 2026-10-21.

The 78 invalid rows comprise 69 unsupported One Piece rows, eight Magic rows without collector numbers and one watchlist row (CSV row 992, Kit Fisto). One Piece rows can have additional missing-number errors; these counts classify each row once. The eight Magic rows include six Art Series products plus Muraganda Eldrazi and Suq'Ata Firewalker. The six sealed products retain a separate product kind and require manual identification.

The complete row-level issue list is in [import-audit.json](review-2026-10-21/import-audit.json). Re-run it locally with:

```sh
npm run review:import -- /Users/javiervega/Downloads/export.csv
```

## Format compatibility and changes

The deployed parser recognizes names, sets, category, collector number, condition and quantity, but rejects more than 1,000 rows and misses the `Variance` column. The updated importer accepts up to 5,000 rows within the existing 2 MB file limit; a PostgreSQL regression test stages 1,035 rows in one batch.

| Source field           | Updated handling                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portfolio Name         | Preserve in raw source data; it is not the game identifier.                                                                                                    |
| Category               | Maps Magic, Pokémon and Star Wars Unlimited correctly. One Piece remains explicitly unsupported.                                                               |
| Product Name           | Separate recognized suffixes from canonical name. Preserve the complete original name.                                                                         |
| Set + Card Number      | Keep the exact printing identity and collector prefixes/denominators; do not match by name alone.                                                              |
| Variance               | Recognize and normalize Foil, Non-foil, Holofoil and Reverse Holofoil. Confirm special foil subtypes physically.                                               |
| Parenthesized labels   | Preserve Borderless, First-Place Foil, Hyperspace, Poke Ball Pattern, etc. as treatment data. Different treatments must not collapse into a standard printing. |
| Card Condition / Grade | Normalize condition. Non-Ungraded products are flagged for separate review.                                                                                    |
| Quantity               | Preserve count and reject invalid numeric quantities. Receipt and Snapshot retain their distinct stock behavior.                                               |
| Average Cost Paid      | Preserve raw data. It does not become a confirmed CRC acquisition cost. Use explicit `Cost CRC` for that purpose.                                              |
| Market Price (As of …) | Preserve amount and date as an informational source snapshot. Currency stays unconfirmed until explicitly selected.                                            |
| Price Override         | Preserve positive values with the selected/unconfirmed source currency. Zero means no override. No automatic CRC sale-price assignment.                        |
| Watchlist              | Flag the row for correction/omission so wishlist data is not received as owned stock.                                                                          |
| Notes / Date Added     | Preserve privately in raw source data; do not publish as product copy.                                                                                         |

The batch UI now asks for the language to use when the file omits it and the currency of its prices. Neither English nor USD is selected by inference. Explicit row languages and JP/CN name hints take priority over the batch default, and a hint still requires confirmation of the physical card.

## Catalog identity before pricing

1. Parse and preview the complete export. Correct or omit invalid rows.
2. Match against verified local catalog entries by game, product kind, canonical name, set, collector number, language and treatment. Automatic local selection now also requires the name to agree.
3. Use provider candidates or manual review for unresolved cards. New provider candidates remain unverified. Reviewed set aliases are stored for later imports.
4. Confirm the physical condition, language, finish and treatment before receiving stock.
5. Fetch pricing references for that exact printing, then calculate and review the CRC proposal. Import never publishes or overwrites an approved price automatically.

Canonical names now remove recognized supplier labels such as `Forest (0511) (First-Place Foil)` while retaining collector number 511 and treatment `first-place foil`. This improves name-based provider searches without pretending the card is a standard Forest. Unknown or ambiguous identities still need review.

## How the current pricing sources match

| Source                     | Matching and scope                                                                                                                             | Implication for this export                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scryfall                   | Magic provider ID; verify name, set, number and language; select the exact USD finish field.                                                   | The export has no Scryfall IDs. Identify the printing first. Scryfall prices have no source update timestamp in this implementation, so they remain informational until supported by dated evidence. |
| Pokémon TCG API            | Exact provider ID and printing identity; select the matching normal/holo/reverse subtype.                                                      | No IDs are supplied. Local catalog matches or candidate review must establish them.                                                                                                                  |
| TCGdex                     | Exact ID, or a unique set + number + name association; keep TCGplayer USD and Cardmarket EUR separate.                                         | Supports a second Pokémon feed, subject to exact identity and language coverage.                                                                                                                     |
| TCGCSV                     | Supported game category, exact set/group, unique collector-number/product match and finish; verify product name and any existing TCGplayer ID. | Covers Magic, Pokémon, Lorcana and Star Wars Unlimited. It can help obtain dated references after identity confirmation, including for Star Wars rows lacking an automatic image catalog.            |
| Authorized TCGplayer API   | Existing validated product ID, game and collector number; exact subtype. Requires an authorized access token.                                  | No product IDs exist in this export; this route is not available directly from the CSV.                                                                                                              |
| Manual comparable evidence | Exact language, condition, finish/treatment and dated source evidence, reviewed by an administrator.                                           | Required for special treatments and gaps in current provider coverage. CSV prices can inform comparison but do not prove the exact provider match.                                                   |

The current automatic pricing policy is deliberately limited to standard treatments, English and Near Mint (or explicitly identified sealed products). The 356 treatment-labelled rows are therefore review work, not an automatic price-coverage claim. If automation for these variants is desired, add exact treatment-specific provider evidence and tests before expanding that policy.

TCGCSV, Scryfall and Pokémon feeds can all repeat the same underlying TCGplayer market. They do not count as independent markets. Cardmarket stays in EUR. Feed publication dates, per-provider price dates and the export's “as of” date are distinct. Existing price verification keeps these distinctions and rejects stale or mismatched evidence.

The [Pokémon TCG API documentation](https://docs.pokemontcg.io/api-reference/cards/card-object/) currently announces deprecation and continued existing-key support through March 1, 2027. Retain the TCGdex path and plan provider continuity; this change does not introduce a new paid service.

## Recommended intake procedure

For a full portfolio export, use **Snapshot** so a recurring export does not repeatedly add copies. Reconcile only physically counted variants; omitted variants are not zeroed. For a file containing only newly received cards, use **Receipt** and a stable, unique receiving reference. Reuse that reference when retrying the same event.

Confirm the missing language and source currency, then preview finishes/treatments before saving. Process existing catalog matches first, resolve exceptional treatments and sealed products separately, and omit unsupported One Piece/watchlist rows until their handling is explicitly agreed. After receiving, obtain fresh price evidence, approve CRC prices and publish reviewed listings.

Do not rename or manually convert the supplier CSV just to upload it. Preserve the original export and add explicit internal language, cost, provider and receiving-reference data through review. The new intake flow supports that separation.

## Release requirements

Apply `supabase/migrations/202610210001_delivery_and_collectr.sql` before releasing the updated importer and checkout. It expands the server-side batch limit, supports coordinated/express delivery, records pending quotes and prevents a sale with an unconfirmed delivery fee. Update the deployment's `NEXT_PUBLIC_WHATSAPP_NUMBER` to `50670180855`, then build and deploy the current-source checkout. These production changes have not been applied during this review.
