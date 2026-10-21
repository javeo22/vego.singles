import test from "node:test";
import assert from "node:assert/strict";
import { parseImport } from "../lib/operations/imports";
import {
  applyIntakeResolutions,
  inventorySnapshotQuery,
  missingStockSql,
  planMissingStock,
  type IntakePrinting,
  type IntakeListing,
} from "../lib/operations/stock-intake";
import { database, listing as makeListing } from "./database";

const parse = (lines: string[]) =>
  parseImport(
    [
      "Portfolio Name,Category,Set,Product Name,Card Number,Variance,Card Condition,Quantity,Watchlist",
      ...lines,
    ].join("\n"),
  ).rows;
const printing: IntakePrinting = {
  id: crypto.randomUUID(),
  game: "magic",
  canonical_name: "Sol Ring",
  set_name: "Commander Masters",
  collector_number: "396",
  language: "english",
  treatment: "standard",
  kind: "single",
  identity_verified: false,
  metadata: {
    original_data: {
      "Product Name": "Sol Ring (Borderless)",
      Set: "Commander Masters",
      "Card Number": "0396",
    },
  },
};
const listing: IntakeListing = {
  id: crypto.randomUUID(),
  card_printing_id: printing.id,
  condition: "near_mint",
  finish: "nonfoil",
  archived_at: null,
};

test("missing-stock comparison recognizes source treatments and skips unverified existing cards without assuming incoming language", () => {
  const rows = parse([
    "Main,Magic: The Gathering,Commander Masters,Sol Ring (Borderless),396,Normal,Near Mint,2,false",
  ]);
  const plan = planMissingStock(rows, [printing], [listing]);
  assert.equal(rows[0].language, "unknown");
  assert.equal(plan.decisions[0].decision, "existing");
  assert.deepEqual(plan.decisions[0].existingIds, [listing.id]);
  assert.equal(plan.groups.length, 0);
});

test("new stock keeps finish and explicit language variants separate and aggregates repeated source quantities", () => {
  const rows = parse([
    "Main,Magic: The Gathering,Commander Masters,Sol Ring (Borderless),396,Foil,Near Mint,2,false",
    "Main,Magic: The Gathering,Commander Masters,Sol Ring (Borderless),396,Foil,Near Mint,1,false",
    "Main,Magic: The Gathering,Commander Masters,Sol Ring (Borderless) (JP),396,Normal,Near Mint,1,false",
  ]);
  const plan = planMissingStock(rows, [printing], [listing]);
  assert.equal(plan.groups.length, 2);
  assert.equal(plan.groups[0].quantity, 3);
  assert.equal(plan.groups[0].row.language, "unknown");
  assert.equal(plan.groups[1].row.language, "ja");
});

test("watchlists are excluded and incomplete/unsupported identities remain review rows", () => {
  const plan = planMissingStock(
    parse([
      "Main,Magic: The Gathering,Commander Masters,Sol Ring,396,Normal,Near Mint,1,true",
      "Main,Magic: The Gathering,Commander Masters,Sol Ring,,Normal,Near Mint,1,false",
      "Main,One Piece,Romance Dawn,Zoro,OP01-001,Normal,Near Mint,1,false",
    ]),
    [],
    [],
  );
  assert.deepEqual(
    plan.decisions.map((d) => d.decision),
    ["excluded", "review", "review"],
  );
  assert.equal(plan.groups.length, 0);
});

test("provisional receiving preserves existing inventory, quarantines unknown cards, rolls back safely and is repeatable", async () => {
  const db = await database();
  try {
    await makeListing(db, 3);
    await db.exec("reset role");
    const before = (await db.query<any>(inventorySnapshotQuery)).rows[0];
    const existing = before.inventory.printings[0];
    const rows = parse([
      `Main,Pokemon,Test Set,Test Card,${existing.collector_number},Holofoil,Near Mint,9,false`,
      "Main,Magic: The Gathering,Test Set,Mage's Familiar,12,Foil,Near Mint,2,false",
      "Main,Magic: The Gathering,Test Set,Mage's Familiar,12,Foil,Near Mint,1,false",
      "Main,Magic: The Gathering,Test Set,Wishlist Card,13,Normal,Near Mint,1,true",
      "Main,Magic: The Gathering,Test Set,Test Art Card,,Normal,Near Mint,1,false",
    ]);
    const plan = planMissingStock(
      rows,
      before.inventory.printings,
      before.inventory.listings,
    );
    const input = {
      fileHash: "f".repeat(64),
      fingerprint: before.fingerprint,
      plan,
    };
    await db.exec(missingStockSql({ ...input, rollback: true }));
    assert.equal(
      (await db.query<any>(inventorySnapshotQuery)).rows[0].fingerprint,
      before.fingerprint,
    );
    await db.exec(missingStockSql(input));
    const after = (await db.query<any>(inventorySnapshotQuery)).rows[0];
    for (const key of ["printings", "listings", "lots"]) {
      const oldIds = new Set(before.inventory[key].map((r: any) => r.id));
      assert.deepEqual(
        after.inventory[key].filter((r: any) => oldIds.has(r.id)),
        before.inventory[key],
      );
    }
    const added = after.inventory.printings.find(
      (c: any) => c.canonical_name === "Mage's Familiar",
    );
    assert.equal(added.language, "unknown");
    assert.equal(added.identity_verified, false);
    const addedListing = after.inventory.listings.find(
      (l: any) => l.card_printing_id === added.id,
    );
    assert.equal(addedListing.published, false);
    assert.equal(addedListing.approved_price_crc, 0);
    const lot = after.inventory.lots.find(
      (l: any) => l.listing_id === addedListing.id,
    );
    assert.equal(lot.quantity, 3);
    assert.equal(lot.quarantined, true);
    assert.equal(lot.location_code, "UNASSIGNED");
    const receiptRows = (
      await db.query<any>(
        "select status,normalized from operation_import_rows order by row_number",
      )
    ).rows;
    assert.deepEqual(
      receiptRows.map((r: any) => r.status),
      ["skipped", "committed", "committed", "skipped", "needs_review"],
    );
    const repeatPlan = planMissingStock(
      rows,
      after.inventory.printings,
      after.inventory.listings,
    );
    assert.equal(repeatPlan.groups.length, 0);
    await db.exec(
      missingStockSql({
        ...input,
        fingerprint: after.fingerprint,
        plan: repeatPlan,
      }),
    );
    assert.equal(
      (await db.query<any>(inventorySnapshotQuery)).rows[0].fingerprint,
      after.fingerprint,
    );
    const incomplete = rows[4];
    const evidence = {
      rowNumber: incomplete.rowNumber,
      sourceName: incomplete.name,
      sourceSet: incomplete.setName,
      sourceFinish: incomplete.finish,
      collectorNumber: "123",
      setName: "Exact Art Set",
      treatment: "art card",
      provider: "scryfall" as const,
      externalId: crypto.randomUUID(),
      setCode: "atest",
      sourceUrl: "https://scryfall.com/card/atest/123/test-art-card",
      observedAt: new Date().toISOString(),
    };
    const resolved = applyIntakeResolutions(rows, [evidence]);
    assert.equal(resolved[4].language, "unknown");
    assert.equal(resolved[4].raw.Set, "Test Set");
    const resumePlan = planMissingStock(
      resolved,
      after.inventory.printings,
      after.inventory.listings,
    );
    assert.equal(resumePlan.groups.length, 1);
    await db.exec(
      missingStockSql({
        ...input,
        fingerprint: after.fingerprint,
        plan: resumePlan,
      }),
    );
    const received = (
      await db.query<any>(
        "select c.language,c.identity_verified,c.metadata,r.normalized,r.errors,r.status from card_printings c join operation_import_rows r on r.card_printing_id=c.id where c.external_card_id=$1",
        [evidence.externalId],
      )
    ).rows[0];
    assert.equal(received.language, "unknown");
    assert.equal(received.identity_verified, false);
    assert.equal(received.status, "committed");
    assert.deepEqual(received.errors, []);
    assert.equal(received.normalized.collectorNumber, "123");
    assert.equal(received.normalized.raw.Set, "Test Set");
    assert.equal(
      received.metadata.source_catalog_evidence.sourceUrl,
      evidence.sourceUrl,
    );
    const resumed = (await db.query<any>(inventorySnapshotQuery)).rows[0];
    const uncorrectedRetry = planMissingStock(
      rows,
      resumed.inventory.printings,
      resumed.inventory.listings,
    );
    assert.equal(uncorrectedRetry.groups.length, 0);
    assert.equal(uncorrectedRetry.decisions[4].decision, "existing");
    assert.throws(
      () =>
        applyIntakeResolutions(rows, [
          { ...evidence, sourceName: "Different card" },
        ]),
      /original source row/,
    );
  } finally {
    await db.close();
  }
});
