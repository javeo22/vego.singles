import test from "node:test";
import assert from "node:assert/strict";
import { actor, database, listing, owner } from "./database";
import {
  officialExchange,
  collectrPriceProof,
  type ClaimedStoreItem,
} from "../lib/operations/collectr-automation";

async function setup() {
  const db = await database();
  const id = await listing(db, 2);
  await db.exec("reset role");
  const batch = crypto.randomUUID();
  await db.query(
    "update card_printings set language='unknown',identity_verified=false,collector_number='12',metadata=jsonb_build_object('provisional_receipt',true,'source_import_batch_id',$1::text,'original_data',jsonb_build_object('Portfolio Name','Main','Product Name','Test Card','Category','Pokemon','Variance','Holofoil')) where id=(select card_printing_id from listings where id=$2)",
    [batch, id],
  );
  await db.query(
    "update listings set published=false,approved_price_crc=0,price_verified=false,cost_confirmed=false,acquisition_cost=null where id=$1",
    [id],
  );
  await db.query(
    "update stock_lots set quarantined=true,location_code='UNASSIGNED',source_reference=$1 where listing_id=$2",
    [batch, id],
  );
  await actor(db, owner, "service_role");
  const run = crypto.randomUUID();
  await db.query("select start_store_update('prices',null,$1,$2)", [
    owner,
    run,
  ]);
  await db.query(
    "select refresh_store_exchange($1,500,now(),'https://api.hacienda.go.cr/indicadores/tc/dolar')",
    [run],
  );
  const claims = (
    await db.query<any>("select claim_store_updates($1) data", [run])
  ).rows[0].data;
  return { db, id, run, item: claims[0], batch };
}
function proof(item: any, amount = 2) {
  return {
    expected: item.expected,
    matched: true,
    product: { productId: 123, name: "Test Card" },
    reference: {
      productId: "123",
      feed: "tcgcsv",
      currency: "USD",
      amount,
      finish: "Holofoil",
      sourceUrl: "https://www.tcgplayer.com/product/123",
      providerUpdatedAt: new Date().toISOString(),
    },
  };
}
async function finish(db: any, item: any, p: any, force = false) {
  const result = (
    await db.query("select finish_store_update($1,$2,$3,$4,$5) result", [
      item.id,
      item.lease_token,
      JSON.stringify(p),
      force,
      owner,
    ])
  ).rows[0].result;
  await db.exec("reset role");
  return result;
}

test("trusted Collectr publishes unknown-language inventory without a location or a repeated identity check, keeps quantity, and is repeatable", async () => {
  const { db, id, item, run } = await setup();
  try {
    const result = await finish(db, item, proof(item));
    assert.equal(result.published, true);
    assert.equal(result.language, "unknown");
    assert.equal(result.after, 1000);
    assert.deepEqual(await finish(db, item, proof(item)), result);
    const current = (
      await db.query<any>(
        "select l.published,c.language,c.identity_verified,(select sum(quantity) from stock_lots where listing_id=l.id) qty,(select bool_and(not quarantined) from stock_lots where listing_id=l.id) released from listings l join card_printings c on c.id=l.card_printing_id where l.id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(current.qty, 2);
    assert.equal(current.language, "unknown");
    assert.equal(current.released, true);
    assert.equal(current.identity_verified, true);
    const summary = (
      await db.query<any>("select store_update_summary($1) data", [run])
    ).rows[0].data;
    assert.equal(summary.updated, 1);
    assert.equal(summary.run.status, "completed");
    assert.equal(
      (
        await db.query<any>(
          "select count(*) n from price_proposals where listing_id=$1",
          [id],
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("material price changes wait for one explicit acceptance, and changed policies or stale worker tokens cannot approve", async () => {
  const { db, id, item } = await setup();
  try {
    const result = await finish(db, item, proof(item, 120));
    assert.equal(result.canAccept, true);
    assert.equal(result.after, 60000);
    assert.equal(
      (
        await db.query<any>(
          "select approved_price_crc from listings where id=$1",
          [id],
        )
      ).rows[0].approved_price_crc,
      0,
    );
    const accepted = await finish(db, item, null, true);
    assert.equal(accepted.published, true);
    // The next unchanged quote must not ask for the same acceptance again.
    const repeatedRun = crypto.randomUUID();
    await actor(db, owner, "service_role");
    await db.query("select start_store_update('prices',null,$1,$2)", [
      owner,
      repeatedRun,
    ]);
    const repeatedItem = (
      await db.query<any>("select claim_store_updates($1) data", [repeatedRun])
    ).rows[0].data[0];
    const repeated = await finish(db, repeatedItem, proof(repeatedItem, 120));
    assert.equal(repeated.published, true);
    assert.equal(
      (
        await db.query<any>("select store_update_summary($1) data", [
          repeatedRun,
        ])
      ).rows[0].data.unchanged,
      1,
    );
  } finally {
    await db.close();
  }
  const next = await setup();
  try {
    await next.db.exec("reset role");
    await next.db.query(
      "update store_update_items set lease_until=now()-interval '1 minute' where id=$1",
      [next.item.id],
    );
    await actor(next.db, owner, "service_role");
    await assert.rejects(
      finish(next.db, next.item, proof(next.item)),
      /Turno vencido/,
    );
    await next.db.exec("rollback");
  } finally {
    await next.db.close();
  }
});
test("manual quarantine and price locks survive automation, and non-service callers cannot supply price proofs", async () => {
  const { db, id, item } = await setup();
  try {
    await db.exec("reset role");
    await db.query(
      "update listings set price_locked_until=now()+interval '1 day' where id=$1",
      [id],
    );
    await actor(db, owner, "service_role");
    const held = await finish(db, item, proof(item));
    assert.equal(held.canAccept, false);
    assert.match(held.reason, /cambiaron|bloqueado/);
    assert.equal(
      (await db.query<any>("select published from listings where id=$1", [id]))
        .rows[0].published,
      false,
    );
    await actor(db);
    await assert.rejects(
      db.query("select claim_store_updates($1)", [item.run_id]),
      /permission denied|Solo el servidor/,
    );
  } finally {
    await db.close();
  }
});

test("official FX uses the published Costa Rica date and rejects stale data instead of relabeling it", async () => {
  const now = Date.parse("2026-10-21T18:00:00Z");
  const request = (async () =>
    new Response(
      JSON.stringify({ venta: { fecha: "2026-10-21", valor: 457.54 } }),
    )) as typeof fetch;
  const rate = await officialExchange(request, now);
  assert.equal(rate.observedAt, "2026-10-21T06:00:00.000Z");
  assert.equal(rate.fx, 457.54);
  await assert.rejects(
    officialExchange(request, now + 8 * 86400000),
    /vigente/,
  );
});
test("automation matches exact products/finishes and retains known Japanese language as a price exception", async () => {
  const item = {
    printing: {
      game: "pokemon",
      canonical_name: "Pikachu",
      set_name: "Black Bolt",
      collector_number: "1",
      language: "unknown",
      kind: "single",
      treatment: "standard",
      metadata: { original_data: { "Product Name": "Pikachu" } },
    },
    listing: { condition: "Near Mint", finish: "Holofoil" },
    expected: { language: "unknown" },
    trustedCollectr: true,
  } as unknown as ClaimedStoreItem;
  const response = (url: string) =>
    url.endsWith("/groups")
      ? { results: [{ groupId: 1, name: "SV: Black Bolt" }] }
      : url.endsWith("/products")
        ? {
            results: [
              {
                productId: 2,
                name: "Pikachu",
                categoryId: 3,
                groupId: 1,
                extendedData: [{ name: "Number", value: "1" }],
              },
            ],
          }
        : {
            lastUpdated: new Date().toISOString(),
            results: [
              { productId: 2, subTypeName: "Holofoil", marketPrice: 3 },
            ],
          };
  const request = (async (url: any) =>
    new Response(JSON.stringify(response(String(url))))) as typeof fetch;
  const result = await collectrPriceProof(item, request);
  assert.equal("matched" in result && result.matched, true);
  const ja = await collectrPriceProof(
    { ...item, printing: { ...item.printing, language: "ja" } },
    request,
  );
  assert.match("reason" in ja ? ja.reason : "", /mismo idioma/);
});

test("Collectr intake is missing-only and idempotent across repeated files and later exports", async () => {
  const { parseImport } = await import("../lib/operations/imports");
  const { planMissingStock } = await import("../lib/operations/stock-intake");
  const db = await database();
  try {
    await actor(db, owner, "service_role");
    await db.exec("reset role");
    const rows = parseImport(
      "Portfolio Name,Category,Set,Product Name,Card Number,Variance,Card Condition,Quantity,Watchlist\nMain,One Piece,A Fist of Divine Speed,Hibari,OP11-010,Foil,Near Mint,2,false\nMain,One Piece,A Fist of Divine Speed,Watchlist,OP11-011,Foil,Near Mint,1,true",
    ).rows;
    const plan = planMissingStock(rows, [], []);
    async function receive(hash: string) {
      const batch = (
        await db.query<any>("select begin_collectr_import($1,$2,$3) id", [
          "export.csv",
          hash,
          owner,
        ])
      ).rows[0].id;
      await db.query("select save_collectr_rows($1,$2)", [
        batch,
        JSON.stringify(plan.decisions),
      ]);
      return (
        await db.query<any>("select receive_collectr_groups($1,$2,$3) n", [
          batch,
          JSON.stringify(plan.groups),
          owner,
        ])
      ).rows[0].n;
    }
    assert.equal(await receive("a".repeat(64)), 1);
    assert.equal(await receive("a".repeat(64)), 0);
    assert.equal(await receive("b".repeat(64)), 0);
    const totals = (
      await db.query<any>(
        "select (select count(*) from listings) listings,(select sum(quantity) from stock_lots) copies",
      )
    ).rows[0];
    assert.equal(totals.listings, 1);
    assert.equal(totals.copies, 2);
  } finally {
    await db.close();
  }
});

test("different finishes consolidate their printing without merging stock, and can update in the same claimed batch", async () => {
  const db = await database();
  try {
    const a = await listing(db, 2),
      b = await listing(db, 3);
    await db.exec("reset role");
    const batch = crypto.randomUUID();
    await db.query(
      "update listings set published=false,price_verified=false,approved_price_crc=0,cost_confirmed=false,finish=case when id=$1 then 'Holofoil' else 'Non-foil' end where id in($1,$2)",
      [a, b],
    );
    await db.query(
      "update card_printings set collector_number='12',language='unknown',identity_verified=false,metadata=jsonb_build_object('original_data',jsonb_build_object('Portfolio Name','Main','Product Name','Test Card','Category','Pokemon','Variance','Holofoil'),'source_import_batch_id',$1::text) where id in(select card_printing_id from listings where id in($2,$3))",
      [batch, a, b],
    );
    await db.query(
      "update stock_lots set quarantined=true,location_code='UNASSIGNED',source_reference=$1 where listing_id in($2,$3)",
      [batch, a, b],
    );
    await actor(db, owner, "service_role");
    await db.exec("reset role");
    const run = crypto.randomUUID();
    await db.query("select start_store_update('prices',null,$1,$2)", [
      owner,
      run,
    ]);
    await db.query(
      "select refresh_store_exchange($1,500,now(),'https://api.hacienda.go.cr/indicadores/tc/dolar')",
      [run],
    );
    const claims = (
      await db.query<any>("select claim_store_updates($1) data", [run])
    ).rows[0].data;
    assert.equal(claims.length, 2);
    assert.equal(claims[0].printing.id, claims[1].printing.id);
    for (const item of claims) {
      const p = proof(item);
      p.reference.finish = item.listing.finish;
      const result = await finish(db, item, p);
      assert.equal(result.published, true);
    }
    const total = (
      await db.query<any>(
        "select sum(quantity) n,bool_and(not quarantined) released from stock_lots where listing_id in($1,$2)",
        [a, b],
      )
    ).rows[0];
    assert.equal(total.n, 5);
    assert.equal(total.released, true);
  } finally {
    await db.close();
  }
});

test("batch automation keeps manually quarantined stock held and records a review without partial price writes", async () => {
  const { db, id, item } = await setup();
  try {
    await db.exec("reset role");
    await db.query(
      "insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,details) values($1,0,2,2,'Retención manual',jsonb_build_object('quarantined',true))",
      [id],
    );
    const results = (
      await db.query<any>("select finish_store_updates($1) data", [
        JSON.stringify([
          { id: item.id, token: item.lease_token, proof: proof(item) },
        ]),
      ])
    ).rows[0].data;
    assert.equal(results[0].canAccept, false);
    assert.equal(
      (
        await db.query<any>(
          "select published,approved_price_crc from listings where id=$1",
          [id],
        )
      ).rows[0].approved_price_crc,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          "select bool_and(quarantined) held,sum(quantity) n from stock_lots where listing_id=$1",
          [id],
        )
      ).rows[0].held,
      true,
    );
    assert.equal(
      (await db.query<any>("select count(*) n from market_prices")).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("the earlier CSV intake quarantine event is released while subsequent manual holds remain protected", async () => {
  const { db, id, item, batch } = await setup();
  try {
    await db.exec("reset role");
    const hash = "a".repeat(64);
    await db.query(
      "update card_printings set metadata=metadata||jsonb_build_object('source_file_sha256',$1::text) where id=(select card_printing_id from listings where id=$2)",
      [hash, id],
    );
    await db.query(
      "insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,created_at,details) select $1,2,0,2,'Recepción CSV provisional: solo variantes ausentes',$2,created_at,jsonb_build_object('quarantined',true,'source_file_sha256',$3::text) from stock_lots where listing_id=$1",
      [id, batch, hash],
    );
    await actor(db, owner, "service_role");
    const result = await finish(db, item, proof(item));
    assert.equal(result.published, true);
    assert.deepEqual(
      (
        await db.query(
          "select quantity,quarantined from stock_lots where listing_id=$1",
          [id],
        )
      ).rows,
      [{ quantity: 2, quarantined: false }],
    );
  } finally {
    await db.close();
  }
  const held = await setup();
  try {
    await held.db.exec("reset role");
    await held.db.query(
      "insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,details) values($1,2,0,2,'Recepción CSV provisional: solo variantes ausentes',$2,jsonb_build_object('quarantined',true))",
      [held.id, held.batch],
    );
    await actor(held.db, owner, "service_role");
    const result = (
      await held.db.query<any>("select finish_store_updates($1) data", [
        JSON.stringify([
          {
            id: held.item.id,
            token: held.item.lease_token,
            proof: proof(held.item),
          },
        ]),
      ])
    ).rows[0].data;
    assert.equal(result[0].canAccept, false);
    await held.db.exec("reset role");
    assert.equal(
      (
        await held.db.query<any>(
          "select quarantined from stock_lots where listing_id=$1",
          [held.id],
        )
      ).rows[0].quarantined,
      true,
    );
  } finally {
    await held.db.close();
  }
});
