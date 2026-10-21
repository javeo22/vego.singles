import test from "node:test";
import assert from "node:assert/strict";
import { parseImport, matchCandidates } from "../lib/operations/imports";

const header =
  "Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,Card Condition,Average Cost Paid,Quantity,Market Price (As of 2026-10-21),Price Override,Watchlist,Date Added,Notes";

test("Collectr preserves exact finish, treatment and dated price without assigning currency or cost", () => {
  const { rows } = parseImport(
    [
      header,
      "Magic The Gathering,Magic: The Gathering,Aetherdrift,Forest (0511) (First-Place Foil),511,L,Foil,Ungraded,Near Mint,0,2,0.76,0,false,2026-10-19,Internal note",
    ].join("\n"),
  );
  const row = rows[0];
  assert.equal(row.name, "Forest");
  assert.equal(row.collectorNumber, "511");
  assert.equal(row.finish, "Foil");
  assert.equal(row.treatment, "first-place foil");
  assert.equal(row.game, "magic");
  assert.equal(row.language, "unknown");
  assert.equal(row.acquisitionCostCrc, null);
  assert.equal(row.raw.Notes, "Internal note");
  assert.deepEqual(row.sourceMarketPrice, {
    amount: 0.76,
    currency: "unknown",
    observedAt: "2026-10-21",
  });
  assert.equal(row.sourcePriceOverride, undefined);
  assert.deepEqual(row.errors, []);
});

test("Collectr language and currency defaults require selection and preserve language hints", () => {
  const rows = parseImport(
    [
      header,
      "Main,Pokemon,Test,Card (JP Alternate Art),123,R,Holofoil,Ungraded,Near Mint,10,1,6,8,false,2026-10-19,",
      "Main,Pokemon,Test,Card (Poke Ball Pattern),124,R,Reverse Holofoil,Ungraded,Near Mint,10,1,6,0,false,2026-10-19,",
    ].join("\n"),
    {},
    "pokemon",
    { defaultLanguage: "en", sourceCurrency: "USD" },
  ).rows;
  assert.equal(rows[0].language, "ja");
  assert.equal(rows[0].name, "Card");
  assert.equal(rows[1].language, "en");
  assert.equal(rows[1].finish, "Reverse Holofoil");
  assert.deepEqual(rows[0].sourcePriceOverride, { amount: 8, currency: "USD" });
  assert.equal(rows[0].acquisitionCostCrc, null);
});

test("unsupported games, watchlists and graded cards stay available for review without import eligibility", () => {
  const rows = parseImport(
    [
      header,
      "Main,One Piece,Test,Card,OP01-1,R,Normal,Ungraded,Near Mint,0,1,1,0,false,2026-10-19,",
      "Main,Pokemon,Test,Card,1,R,Normal,Ungraded,Near Mint,0,1,1,0,true,2026-10-19,",
      "Main,Pokemon,Test,Card,2,R,Normal,PSA 10,Near Mint,0,1,1,0,false,2026-10-19,",
      "Main,Pokemon,Test,Test Elite Trainer Box,,,Normal,Ungraded,Near Mint,0,1,50,0,false,2026-10-19,",
    ].join("\n"),
  ).rows;
  assert.equal(rows[0].game, "one piece");
  assert.match(rows[0].errors.join(), /Juego no compatible/);
  assert.match(rows[1].errors.join(), /Watchlist/);
  assert.match(rows[2].errors.join(), /graduada/);
  assert.equal(rows[3].kind, "sealed");
  assert.equal(rows[3].finish, "Sealed");
  assert.equal(rows[3].condition, "Sealed Product");
  assert.doesNotMatch(rows[3].errors.join(), /número/);
});

test("the supplied export size fits one batch and a mismatched name cannot auto-match", () => {
  const hyperspace = parseImport(
    [
      header,
      "Main,Star Wars: Unlimited,Test,Aurra Sing - Patient and Deadly (Hyperspace),123,R,Normal,Ungraded,Near Mint,0,1,2,0,false,2026-10-19,",
    ].join("\n"),
  ).rows[0];
  assert.equal(hyperspace.game, "star-wars");
  assert.equal(hyperspace.name, "Aurra Sing - Patient and Deadly");
  assert.equal(hyperspace.treatment, "hyperspace");
  const csv = [
    "Name,Set,Card Number,Condition,Variant,Language",
    ...Array.from({ length: 1035 }, (_, i) => `Card ${i},Test,${i},NM,Foil,en`),
  ].join("\n");
  const rows = parseImport(csv).rows;
  assert.equal(rows.length, 1035);
  assert.equal(
    matchCandidates(rows[0], [
      {
        id: "1",
        name: "Wrong Card",
        setName: "Test",
        collectorNumber: "0",
        game: "pokemon",
        language: "en",
        provider: "manual",
        externalId: "",
        imageUrl: null,
        verified: true,
        treatment: "standard",
        kind: "single",
      },
    ]).automatic,
    null,
  );
});
