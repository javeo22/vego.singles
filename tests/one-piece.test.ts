import test from "node:test";
import assert from "node:assert/strict";
import { parseImport } from "../lib/operations/imports";
import {
  inventorySnapshotQuery,
  missingStockSql,
  planMissingStock,
} from "../lib/operations/stock-intake";
import { checkMarketPrice } from "../lib/operations/market-sources";
import { searchCatalog } from "../lib/operations/providers";
import { database } from "./database";

const header =
  "Portfolio Name,Category,Set,Product Name,Card Number,Variance,Card Condition,Quantity,Watchlist";
const csv = [
  header,
  "Main,One Piece,A Fist of Divine Speed,Hibari,OP11-010,Foil,Near Mint,1,false",
  "Main,One Piece,A Fist of Divine Speed,Hibari (Alternate Art),OP11-010,Foil,Near Mint,1,false",
  "Main,One Piece,A Fist of Divine Speed,DON!! Card (Katakuri) (Double Pack Set Vol. 7),,Foil,Near Mint,1,false",
  "Main,One Piece,A Fist of Divine Speed,DON!! Card (Koby) (Double Pack Set Vol. 7),,Foil,Near Mint,1,false",
  "Main,One Piece,One Piece Promotion Cards,Monkey.D.Luffy (Sealed Battle 2024 Vol. 2),,Normal,Near Mint,2,false",
  "Main,One Piece,Legacy of the Master,Perona (JP),OP12-034,Foil,Near Mint,2,false",
].join("\n");

test("One Piece aliases and special printings retain their exact source variants and missing-language state", () => {
  for (const game of [
    "One Piece",
    "onepiece",
    "One Piece Card Game",
    "One Piece TCG",
  ]) {
    const row = parseImport(
      `${header}\nMain,${game},Legacy of the Master,Kuzan (SP),OP10-082,Foil,Near Mint,1,false`,
    ).rows[0];
    assert.equal(row.game, "one-piece");
    assert.equal(row.language, "unknown");
    assert.equal(row.treatment, "sp");
    assert.equal(row.name, "Kuzan");
    assert.deepEqual(row.errors, []);
  }
});

test("One Piece stock receives all described variants privately without inventing numbers or language and cannot be received twice", async () => {
  const db = await database();
  try {
    await db.exec("reset role");
    const before = (await db.query<any>(inventorySnapshotQuery)).rows[0];
    const rows = parseImport(csv).rows;
    const plan = planMissingStock(
      rows,
      before.inventory.printings,
      before.inventory.listings,
    );
    assert.equal(plan.groups.length, 6);
    assert.equal(
      plan.groups.reduce((sum, group) => sum + group.quantity, 0),
      8,
    );
    const unnumbered = plan.groups.filter(
      (group) => !group.row.collectorNumber,
    );
    assert.equal(
      new Set(unnumbered.map((group) => group.row.treatment)).size,
      3,
    );
    assert.ok(
      unnumbered.every((group) =>
        group.row.pendingChecks?.includes("collectorNumber"),
      ),
    );
    await db.exec(
      missingStockSql({
        fileHash: "a".repeat(64),
        fingerprint: before.fingerprint,
        plan,
      }),
    );
    const after = (await db.query<any>(inventorySnapshotQuery)).rows[0];
    assert.equal(
      after.inventory.printings.filter((c: any) => c.language === "unknown")
        .length,
      5,
    );
    assert.equal(
      after.inventory.printings.filter((c: any) => c.language === "ja").length,
      1,
    );
    assert.ok(
      after.inventory.printings.every((c: any) => !c.identity_verified),
    );
    assert.ok(
      after.inventory.listings.every(
        (l: any) => !l.published && l.approved_price_crc === 0,
      ),
    );
    assert.ok(
      after.inventory.lots.every(
        (l: any) => l.quarantined && l.location_code === "UNASSIGNED",
      ),
    );
    const repeat = planMissingStock(
      rows,
      after.inventory.printings,
      after.inventory.listings,
    );
    assert.equal(repeat.groups.length, 0);
    const don = after.inventory.printings.filter((c: any) =>
      c.canonical_name.startsWith("DON!!"),
    );
    await assert.rejects(
      db.query(
        "update card_printings set identity_verified=true,language='en' where id=$1",
        [don[0].id],
      ),
      /one_piece_verified_identity_reference/,
    );
    for (const card of don)
      await db.query(
        "update card_printings set identity_verified=true,language='en',catalog_source='manual',external_card_id=$1 where id=$2",
        [crypto.randomUUID(), card.id],
      );
    assert.equal(
      (
        await db.query<any>(
          "select count(*) n from card_printings where identity_verified",
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});

test("One Piece pricing and catalog lookup explicitly require manual evidence without querying another game's feed", async () => {
  let calls = 0;
  const request = (async () => {
    calls++;
    throw new Error("Unexpected network request");
  }) as typeof fetch;
  const row = parseImport(csv).rows[0];
  await assert.rejects(searchCatalog(row, request), /One Piece/);
  const report = await checkMarketPrice(
    {
      game: "one-piece",
      language: "en",
      canonical_name: "Hibari",
      set_name: row.setName,
      collector_number: row.collectorNumber,
      catalog_source: "manual",
      external_card_id: null,
      tcgplayer_product_id: null,
      identity_verified: true,
    },
    "Near Mint",
    "Foil",
    request,
  );
  assert.deepEqual(report.references, []);
  assert.equal(report.recommendedId, null);
  assert.match(report.failures[0].message, /One Piece.*manual/);
  assert.equal(calls, 0);
});
