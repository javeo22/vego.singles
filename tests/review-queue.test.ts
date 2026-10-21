import test from "node:test";
import assert from "node:assert/strict";
import { database, actor, listing, owner, stock } from "./database";

async function setup() {
  const db = await database(),
    id = await listing(db, 2),
    batch = crypto.randomUUID();
  await db.exec("reset role");
  await db.query(
    "update card_printings set language='unknown',identity_verified=false,metadata=jsonb_build_object('source_import_batch_id',$1::text,'original_data',jsonb_build_object('Portfolio Name','Main','Product Name','Card','Category','Pokemon','Variance','Holofoil')) where id=(select card_printing_id from listings where id=$2)",
    [batch, id],
  );
  await db.query(
    "update listings set published=false,approved_price_crc=0,price_verified=false,cost_confirmed=false,acquisition_cost=null where id=$1",
    [id],
  );
  await db.query(
    "update stock_lots set source_reference=$1,quarantined=true,location_code='UNASSIGNED' where listing_id=$2",
    [batch, id],
  );
  await actor(db, owner, "service_role");
  const run = crypto.randomUUID();
  await db.query("select start_store_update('prices',null,$1,$2)", [
    owner,
    run,
  ]);
  const claims = (
    await db.query<any>("select claim_store_updates($1) data", [run])
  ).rows[0].data;
  await db.query("select finish_store_updates($1)", [
    JSON.stringify(
      claims.map((i: any) => ({
        id: i.id,
        token: i.lease_token,
        proof: {
          expected: i.expected,
          reason: "No hay una coincidencia única.",
        },
      })),
    ),
  ]);
  const card = (await db.query<any>("select store_review_queue($1) data", [id]))
    .rows[0].data.selected;
  return { db, id, batch, run, card };
}
async function resolve(
  db: any,
  card: any,
  price: number | null = 1500,
  who = owner,
) {
  return (
    await db.query("select resolve_store_review($1,$2,$3,$4,$5,$6) data", [
      card.id,
      JSON.stringify(card.expected),
      price,
      "https://example.com/card",
      "Decisión de precio del propietario",
      who,
    ])
  ).rows[0].data;
}
async function selected(db: any, id: string) {
  return (await db.query("select store_review_queue($1) data", [id])).rows[0]
    .data.selected;
}

test("guided manual resolution publishes trusted Collectr without language or location checks, preserves lots and never creates a verified market quote", async () => {
  const { db, id, card } = await setup();
  try {
    const result = await resolve(db, card);
    assert.equal(result.published, true);
    assert.equal(result.manualDecision, true);
    assert.deepEqual(await resolve(db, card), result);
    await db.exec("reset role");
    const actual = (
      await db.query<any>(
        "select l.approved_price_crc,l.published,c.language,c.metadata->>'identity_source' source,(select sum(quantity) from stock_lots where listing_id=l.id) qty,(select bool_and(not quarantined) from stock_lots where listing_id=l.id) released from listings l join card_printings c on c.id=l.card_printing_id where l.id=$1",
        [id],
      )
    ).rows[0];
    assert.deepEqual(actual, {
      approved_price_crc: 1500,
      published: true,
      language: "unknown",
      source: "collectr",
      qty: 2,
      released: true,
    });
    assert.equal(
      (await db.query<any>("select count(*) n from market_prices")).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query<any>("select count(*) n from price_proposals")).rows[0].n,
      1,
    );
    const q = (await db.query<any>("select store_review_queue() data")).rows[0]
      .data;
    assert.equal(q.items.length, 0);
  } finally {
    await db.close();
  }
});

test("the queue retains reviews from earlier imports and returns only the latest result for each listing", async () => {
  const { db, id, card } = await setup();
  try {
    const second = await listing(db, 1);
    await actor(db, owner, "service_role");
    await db.exec("reset role");
    const batch = crypto.randomUUID();
    await db.query(
      "insert into operation_import_batches(id,name,file_hash,mode,receipt_reference) values($1,'second',repeat('b',64),'receipt','second')",
      [batch],
    );
    await db.query(
      "update stock_lots set source_reference=$1 where listing_id=$2",
      [batch, second],
    );
    const run = crypto.randomUUID();
    await db.query("select start_store_update('import',$1,$2,$3)", [
      batch,
      owner,
      run,
    ]);
    const claim = (
      await db.query<any>("select claim_store_updates($1) data", [run])
    ).rows[0].data[0];
    await db.query("select finish_store_updates($1)", [
      JSON.stringify([
        {
          id: claim.id,
          token: claim.lease_token,
          proof: {
            expected: claim.expected,
            reason: "Revisión del segundo archivo",
          },
        },
      ]),
    ]);
    let q = (await db.query<any>("select store_review_queue() data")).rows[0]
      .data;
    assert.equal(q.items.length, 2);
    assert.ok(q.items.some((i: any) => i.id === card.id));
    await resolve(db, await selected(db, second), 10000);
    q = (await db.query<any>("select store_review_queue() data")).rows[0].data;
    assert.deepEqual(
      q.items.map((i: any) => i.listingId),
      [id],
    );
  } finally {
    await db.close();
  }
});

test("guided resolution rejects stale data, locked prices, cost-floor violations and manual stock holds without partial writes", async () => {
  const { db, id, card } = await setup();
  try {
    await db.exec("reset role");
    await db.query("update listings set approved_price_crc=100 where id=$1", [
      id,
    ]);
    await assert.rejects(resolve(db, card), /cambiaron/);
    await db.query(
      "update listings set price_locked_until=now()+interval '1 day' where id=$1",
      [id],
    );
    await assert.rejects(resolve(db, await selected(db, id)), /bloqueo manual/);
    await db.query(
      "update listings set price_locked_until=null,acquisition_cost=6000,cost_confirmed=true where id=$1",
      [id],
    );
    await assert.rejects(resolve(db, await selected(db, id), 1000), /mínimo/);
    await db.query("update listings set cost_confirmed=false where id=$1", [
      id,
    ]);
    await db.query(
      "insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,details) values($1,0,2,2,'Retención manual',jsonb_build_object('quarantined',true))",
      [id],
    );
    await assert.rejects(
      resolve(db, await selected(db, id), 2000),
      /retenciones manuales/,
    );
    assert.equal(
      (
        await db.query<any>(
          "select approved_price_crc from listings where id=$1",
          [id],
        )
      ).rows[0].approved_price_crc,
      100,
    );
    assert.equal(
      (
        await db.query<any>(
          "select quarantined from stock_lots where listing_id=$1",
          [id],
        )
      ).rows[0].quarantined,
      true,
    );
    assert.equal(
      (await db.query<any>("select count(*) n from price_proposals")).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("queue mutations require a server-backed reviewer and cannot resolve a superseded review", async () => {
  const { db, id, card } = await setup();
  try {
    await assert.rejects(resolve(db, card, 1500, stock), /Sin permiso/);
    await actor(db, owner);
    await assert.rejects(resolve(db, card), /permission denied/);
    await actor(db, owner, "service_role");
    const run = crypto.randomUUID();
    await db.query("select start_store_update('prices',null,$1,$2)", [
      owner,
      run,
    ]);
    await assert.rejects(resolve(db, card), /termine la actualización/);
    const claim = (
      await db.query<any>("select claim_store_updates($1) data", [run])
    ).rows[0].data[0];
    await db.query("select finish_store_updates($1)", [
      JSON.stringify([
        {
          id: claim.id,
          token: claim.lease_token,
          proof: { expected: claim.expected, reason: "Nueva consulta" },
        },
      ]),
    ]);
    await assert.rejects(resolve(db, card), /revisión cambió/);
    const q = (await db.query<any>("select store_review_queue() data")).rows[0]
      .data;
    assert.equal(q.items.length, 1);
    assert.equal(q.items[0].listingId, id);
    assert.equal(q.items[0].id, claim.id);
  } finally {
    await db.close();
  }
});
