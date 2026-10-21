# New-stock catalog and price-source review — 2026-10-21

All 737 variants from the missing-stock receipt were checked against live TCGCSV product/price files. Magic cards were also checked against exact Scryfall set/collector-number records. Matching preserves the original source descriptions and distinguishes named treatments, promo numbers, languages and finishes. Provider mirrors are not independent marketplaces.

| Game                | New variants | Catalog product identified | Comparison price found | Ambiguous / unmatched |
| ------------------- | -----------: | -------------------------: | ---------------------: | --------------------: |
| Magic               |          570 |                        567 |                    557 |                     3 |
| Pokémon             |           51 |                         51 |                     49 |                     0 |
| One Piece           |           69 |                         69 |                     69 |                     0 |
| Star Wars Unlimited |           47 |                         47 |                     47 |                     0 |
| **Total**           |      **737** |                    **734** |                **722** |                 **3** |

A product match identifies a catalog record, not the language, condition or authenticity of a physical card. All 737 new variants remain in review, with **zero newly published listings**:

- 734 variants still have unconfirmed language, as requested. Three retain Japanese labels from the original file; those labels do not confirm physical identity or price coverage.
- All new stock remains quarantined at `UNASSIGNED`, pending physical identity and location checks.
- The stored USD/CRC exchange-rate date is 2026-10-08, outside the store's seven-day limit. The global rate and its date were preserved.
- No approved CRC selling price or acquisition cost was invented.

## Evidence saved in the admin

Open **Precios → Consultas anteriores**. Each new variant has a saved review with catalog links, comparison prices where available, and specific reasons preventing publication. The card's private metadata retains the same source-review record. Inventory / Revisiones continues to show the physical identity checks.

Comparison prices are kept separately from approved market evidence: they cannot be selected for a price calculation, and no proposal was approved. TCGCSV supplies product-level market aggregates without language/condition SKUs; its timestamp describes feed publication. Scryfall does not publish an individual price-update timestamp. Missing source dates were left missing. USD and EUR were retained separately, without averaging or guessing an exchange rate.

Sources: [TCGCSV documentation](https://tcgcsv.com/docs), [TCGCSV data limitations](https://tcgcsv.com/), [Scryfall API](https://scryfall.com/docs/api).

## Catalog exceptions

1. **Luka Stadium – Strixhaven Stadium, #63, showcase:** the catalog distinguishes [Luka / Misprint](https://www.tcgplayer.com/product/632707) from [Luca / corrected title](https://www.tcgplayer.com/product/680961). The source does not settle which copy is present.
2. **FINAL FANTASY – Play Booster Display:** no exact full product-description match was accepted. Box/display naming and contents need confirmation.
3. **Sword of Vengeance – Secret Lair Commander: Heads I Win, Tales You Lose, #216:** no exact set/product mapping was accepted. Verify its printed set/number and source product.

Fifteen variants have no comparable positive price for the recorded finish, even where a catalog record was found. Specialty treatments, sealed products and Japanese cards still require evidence appropriate to their actual variants.

## Saving and verification

The review receipt uses small transactions with exact before-state checks. Each transaction is rehearsed with rollback first. Repeating the receipt does not add duplicate jobs. The operation preserves all quantities, stock lots, languages, physical identity flags, approved prices, costs and publication state. Existing inventory outside the intake is not enriched or repriced.

Private before/after snapshots, cached public source responses, the full review manifest and a row-by-row review CSV are under `.local/price-match-2026-10-21/`, excluded from Git. The original stock receipt is [documented separately](STOCK_INTAKE_2026_10_21.md).

## Maintenance tools

- `scripts/match-stock-sources.ts --snapshot=PRIVATE_SNAPSHOT.json --directory=PRIVATE_OUTPUT` fetches and caches source documents, matches conservatively, and writes the review manifest. It does not modify production.
- `scripts/save-stock-source-review.ts --manifest=PRIVATE_MANIFEST.json --project-ref=PROJECT [--apply]` checks the explicit linked project and before-state, rehearses the receipt, and optionally saves review evidence. It never confirms physical identity, approves prices or publishes cards.

A subsequent human review should confirm language, physical identity and location, record a current exchange rate, obtain a fresh comparable quote, approve a CRC price, release quarantine and publish through the existing guarded commands.
