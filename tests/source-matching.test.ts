import test from "node:test";
import assert from "node:assert/strict";
import {
  comparisonPrices,
  sourceProductCandidates,
  sourceSetKey,
} from "../lib/operations/source-matching";
import {
  sourceReviewSql,
  type SourceReviewReceipt,
} from "../lib/operations/source-review-receipt";
import { assessPriceReferences } from "../lib/operations/price-verification";
import { database, listing } from "./database";

const printing = {
  game: "pokemon",
  canonical_name: "Zacian V",
  collector_number: "SWSH018",
  treatment: "standard",
  kind: "single",
  sourceName: "Zacian V",
};
const product = {
  productId: 123,
  categoryId: 3,
  groupId: 2545,
  name: "Zacian V - SWSH018",
  extendedData: [{ name: "Number", value: "SWSH018" }],
};

test("source matching requires the exact game, set, collector number and treatment without collapsing promos or different scripts", () => {
  assert.equal(
    sourceSetKey("magic", "Commander: Edge of Eternities"),
    sourceSetKey("magic", "Edge of Eternities Commander"),
  );
  assert.notEqual(
    sourceSetKey("magic", "Commander: Edge of Eternities"),
    sourceSetKey("magic", "Edge of Eternities"),
  );
  assert.equal(
    sourceSetKey("pokemon", "SV: Scarlet & Violet Promo Cards"),
    sourceSetKey("pokemon", "Scarlet & Violet Promo"),
  );
  assert.equal(
    sourceProductCandidates(printing, [product], 3, 2545)[0].exact,
    true,
  );
  assert.deepEqual(
    sourceProductCandidates(
      printing,
      [{ ...product, categoryId: 68 }],
      3,
      2545,
    ),
    [],
  );
  assert.deepEqual(
    sourceProductCandidates(
      printing,
      [{ ...product, extendedData: [{ name: "Number", value: "SWSH019" }] }],
      3,
      2545,
    ),
    [],
  );
  assert.equal(
    sourceProductCandidates(
      {
        ...printing,
        treatment: "alternate art",
        sourceName: "Zacian V (Alternate Art)",
      },
      [product],
      3,
      2545,
    )[0].exact,
    false,
  );
  assert.equal(
    sourceProductCandidates(
      { ...printing, canonical_name: "ピカチュウ", sourceName: "ピカチュウ" },
      [{ ...product, name: "ゼクロム" }],
      3,
      2545,
    )[0].exact,
    false,
  );
  const don = {
    ...printing,
    game: "one-piece",
    collector_number: "",
    canonical_name: "DON!! Card (Koby)",
    sourceName: "DON!! Card (Koby)",
    treatment: "unnumbered: don koby",
  };
  assert.equal(
    sourceProductCandidates(
      don,
      [{ ...product, categoryId: 68, name: "DON!! Card (Koby)" }],
      68,
      2545,
    )[0].exact,
    true,
  );
  assert.deepEqual(
    sourceProductCandidates(
      don,
      [{ ...product, categoryId: 68, name: "DON!! Card (Katakuri)" }],
      68,
      2545,
    ),
    [],
  );
});

test("comparison prices reject a different finish, duplicate quotes and nonpositive values, and keep absent source dates absent", () => {
  const prices = [
    { productId: 123, subTypeName: "Holofoil", marketPrice: 9.5 },
  ];
  const checkedAt = new Date().toISOString();
  const found = comparisonPrices(123, "Holofoil", prices, null, checkedAt);
  assert.equal(found[0].providerUpdatedAt, null);
  assert.equal(found[0].sourceLanguage, "unknown");
  assert.deepEqual(
    comparisonPrices(123, "Reverse Holofoil", prices, null, checkedAt),
    [],
  );
  assert.deepEqual(
    comparisonPrices(123, "Holofoil", [...prices, ...prices], null, checkedAt),
    [],
  );
  assert.deepEqual(
    comparisonPrices(
      123,
      "Holofoil",
      [{ ...prices[0], marketPrice: 0 }],
      null,
      checkedAt,
    ),
    [],
  );
});

test("saving source review rehearses safely, is idempotent, preserves physical facts and cannot make comparisons into approved evidence", async () => {
  const db = await database();
  try {
    const id = await listing(db, 2);
    await db.exec("reset role");
    const batchId = crypto.randomUUID();
    await db.query(
      "update card_printings set language='unknown',identity_verified=false,metadata=jsonb_build_object('provisional_receipt',true,'source_import_batch_id',$1::text) where id=(select card_printing_id from listings where id=$2)",
      [batchId, id],
    );
    await db.query(
      "update listings set published=false,approved_price_crc=0,price_verified=false where id=$1",
      [id],
    );
    await db.query(
      "update stock_lots set source_reference=$1,quarantined=true where listing_id=$2",
      [batchId, id],
    );
    const c = (
      await db.query<any>(
        "select to_jsonb(c) data from card_printings c where id=(select card_printing_id from listings where id=$1)",
        [id],
      )
    ).rows[0].data;
    const l = (
      await db.query<any>(
        "select to_jsonb(l) data from listings l where id=$1",
        [id],
      )
    ).rows[0].data;
    const lots = (await db.query("select * from stock_lots order by id")).rows;
    const verification = assessPriceReferences(
      { ...c, ...l, listing_id: l.id, card_printing_id: c.id },
      [],
    );
    const input: SourceReviewReceipt = {
      key: crypto.randomUUID(),
      batchId,
      checkedAt: new Date().toISOString(),
      results: [
        {
          printingId: c.id,
          listingId: l.id,
          expectedPrinting: JSON.parse(JSON.stringify(c)),
          expectedListing: JSON.parse(JSON.stringify(l)),
          verification: {
            ...verification,
            catalogMatches: [],
            comparisonReferences: [],
            reviewReasons: ["Idioma pendiente"],
          },
        },
      ],
    };
    await db.exec(sourceReviewSql(input, true));
    assert.equal(
      (await db.query<any>("select count(*) n from operation_jobs")).rows[0].n,
      0,
    );
    await db.exec(sourceReviewSql(input));
    await db.exec(sourceReviewSql(input));
    assert.equal(
      (await db.query<any>("select count(*) n from operation_jobs")).rows[0].n,
      1,
    );
    assert.deepEqual(
      (await db.query("select * from stock_lots order by id")).rows,
      lots,
    );
    assert.deepEqual(
      (
        await db.query<any>(
          "select to_jsonb(l) data from listings l where id=$1",
          [id],
        )
      ).rows[0].data,
      l,
    );
    const changed = (
      await db.query<any>("select * from card_printings where id=$1", [c.id])
    ).rows[0];
    assert.equal(changed.identity_verified, false);
    assert.equal(changed.language, "unknown");
    assert.equal(
      (await db.query<any>("select count(*) n from market_prices")).rows[0].n,
      0,
    );
    const bad = structuredClone(input);
    bad.results[0].verification.references = [{ id: "invented" } as any];
    assert.throws(() => sourceReviewSql(bad));
    await assert.rejects(
      db.exec(sourceReviewSql({ ...input, key: crypto.randomUUID() })),
      /Inventory changed/,
    );
    await db.exec("rollback");
  } finally {
    await db.close();
  }
});
