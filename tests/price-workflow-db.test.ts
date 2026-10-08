import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { actor, command, database, listing, reviewer, stock } from "./database";
import { pricingCardSnapshot } from "../lib/operations/price-workflow";
import {
  assessPriceReferences,
  type MarketReference,
} from "../lib/operations/price-verification";
let db: PGlite;
before(async () => {
  db = await database();
  await db.exec(
    "reset role; update operation_settings set fx=510,fx_at=now(),fx_source='https://www.bccr.fi.cr/'",
  );
  await actor(db);
});
after(async () => {
  await db.close();
});
async function prepare(currency = "USD") {
  const id = await listing(db);
  const proposal = await command(db, "evidence", {
    id,
    amount: 20,
    currency,
    provider: "market",
    sourceUrl: "https://www.tcgplayer.com/product/1",
    observedAt: new Date().toISOString(),
    priceType: "market_reference",
    exactVariant: true,
  });
  const p = (
    await db.query<any>("select * from price_proposals where id=$1", [
      proposal.id,
    ])
  ).rows[0];
  return { id, proposalId: proposal.id, expected: p.suggested_price_crc };
}
async function readiness(id: string) {
  return (await db.query<any>("select price_update_readiness($1) result", [id]))
    .rows[0].result;
}
async function approve(
  p: Awaited<ReturnType<typeof prepare>>,
  price = 9000,
  key = crypto.randomUUID(),
) {
  return (
    await db.query<any>("select approve_price_update($1,$2,$3,$4,$5) result", [
      p.proposalId,
      price,
      p.expected,
      "Mercado revisado y precio final ajustado",
      key,
    ])
  ).rows[0].result;
}

test("legacy proposals are explained and excluded from ready-to-save results", async () => {
  const id = await listing(db);
  await db.exec("reset role");
  const p = (
    await db.query<any>(
      "insert into price_proposals(listing_id,current_price_crc,suggested_price_crc) values($1,10000,9000) returning id",
      [id],
    )
  ).rows[0].id;
  await actor(db);
  const r = await readiness(p);
  assert.equal(r.code, "legacy");
  assert.equal(r.canApprove, false);
  assert.equal(r.action, "refresh");
  const data = (
    await db.query<any>(
      "select list_price_updates('pending','ready',0,null) result",
    )
  ).rows[0].result;
  assert.ok(!data.rows.some((row: any) => row.id === p));
  assert.ok(data.blockedCount >= 1);
});

test("final price editing is audited, retry-safe and changes the store only when saved", async () => {
  const p = await prepare();
  const key = crypto.randomUUID();
  assert.equal((await readiness(p.proposalId)).canApprove, true);
  const a = await approve(p, 9000, key),
    b = await approve(p, 9000, key);
  assert.deepEqual(a, b);
  const row = (
    await db.query<any>(
      "select l.approved_price_crc,p.status,p.calculation from listings l join price_proposals p on p.listing_id=l.id where p.id=$1",
      [p.proposalId],
    )
  ).rows[0];
  assert.equal(row.approved_price_crc, 9000);
  assert.equal(row.status, "approved");
  assert.equal(row.calculation.priceDecision.calculatedPriceCrc, p.expected);
  assert.equal(row.calculation.priceDecision.finalPriceCrc, 9000);
  assert.equal(
    (
      await db.query(
        "select id from activity_log where action='approve_price_update' and entity_id=$1",
        [p.id],
      )
    ).rows.length,
    1,
  );
  await assert.rejects(approve(p, 9500, key), /Clave reutilizada/);
});

test("below-floor and stale draft edits cannot partially change a proposal or store price", async () => {
  const p = await prepare();
  const r = await readiness(p.proposalId);
  assert.ok(r.minimumPriceCrc > 0);
  await assert.rejects(approve(p, r.minimumPriceCrc - 1), /mínimo según costo/);
  await assert.rejects(
    approve({ ...p, expected: p.expected + 1 }),
    /propuesta cambió/,
  );
  const row = (
    await db.query<any>(
      "select l.approved_price_crc,p.suggested_price_crc,p.status,p.calculation from listings l join price_proposals p on p.listing_id=l.id where p.id=$1",
      [p.proposalId],
    )
  ).rows[0];
  assert.equal(row.approved_price_crc, 10000);
  assert.equal(row.suggested_price_crc, p.expected);
  assert.equal(row.status, "pending");
  assert.equal(row.calculation.priceDecision, undefined);
});

test("expired quotes expose a recovery action and refuse a final-price save", async () => {
  const p = await prepare();
  await db.exec("reset role");
  await db.query(
    "update market_prices set provider_updated_at=now()-interval '4 days' where listing_id=$1",
    [p.id],
  );
  await actor(db);
  const r = await readiness(p.proposalId);
  assert.equal(r.code, "expired");
  assert.equal(r.action, "refresh");
  assert.equal(r.canApprove, false);
  await assert.rejects(approve(p), /venció/);
});

test("provider remapping invalidates checked evidence even with a custom final price", async () => {
  const id = await listing(db);
  const printing = (
    await db.query<any>(
      "select * from operations_inventory where listing_id=$1",
      [id],
    )
  ).rows[0];
  const ref: MarketReference = {
    id: "tcgcsv:1:Holofoil:USD",
    amount: 20,
    currency: "USD",
    marketplace: "tcgplayer",
    feed: "tcgcsv",
    sourceUrl: "https://www.tcgplayer.com/product/1",
    providerUpdatedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    productId: "1",
    finish: "Holofoil",
    conditionCoverage: "market_aggregate",
  };
  const report = assessPriceReferences(printing, [ref]);
  const job = crypto.randomUUID();
  await db.exec("reset role");
  await db.query(
    "insert into operation_jobs(id,kind,entity_id,status,result) values($1,'refresh_price',$2,'needs_review',$3::jsonb)",
    [job, id, JSON.stringify({ verification: report })],
  );
  await actor(db);
  const proposal = (
    await db.query<any>(
      "select create_price_proposal_from_check($1,$2,$3,$4,true) result",
      [id, job, ref.id, crypto.randomUUID()],
    )
  ).rows[0].result;
  const expected = (
    await db.query<any>(
      "select suggested_price_crc from price_proposals where id=$1",
      [proposal.id],
    )
  ).rows[0].suggested_price_crc;
  await db.exec("reset role");
  await db.query(
    "update card_printings set external_card_id='another-printing' where id=$1",
    [printing.card_printing_id],
  );
  await actor(db);
  assert.equal((await readiness(proposal.id)).code, "reference_changed");
  await assert.rejects(
    approve({ id, proposalId: proposal.id, expected }),
    /referencia ya no es válida/,
  );
  assert.equal(
    (
      await db.query<any>(
        "select approved_price_crc from listings where id=$1",
        [id],
      )
    ).rows[0].approved_price_crc,
    10000,
  );
});

test("inline physical confirmation preserves price, stock and cost and rejects changed card data", async () => {
  const id = await listing(db);
  await db.exec("reset role");
  await db.query(
    "update card_printings set identity_verified=false where id=(select card_printing_id from listings where id=$1)",
    [id],
  );
  await actor(db);
  const before = (
    await db.query<any>(
      "select * from operations_inventory where listing_id=$1",
      [id],
    )
  ).rows[0];
  const snapshot = pricingCardSnapshot(before);
  const key = crypto.randomUUID();
  await assert.rejects(
    db.query("select confirm_pricing_card($1,$2::jsonb,$3,false)", [
      id,
      JSON.stringify(snapshot),
      key,
    ]),
    /Compara la ficha/,
  );
  const confirm = () =>
    db.query<any>("select confirm_pricing_card($1,$2::jsonb,$3,true) result", [
      id,
      JSON.stringify(snapshot),
      key,
    ]);
  assert.deepEqual((await confirm()).rows, (await confirm()).rows);
  const after = (
    await db.query<any>(
      "select * from operations_inventory where listing_id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(after.identity_verified, true);
  for (const field of [
    "approved_price_crc",
    "quantity",
    "acquisition_cost",
    "cost_confirmed",
  ])
    assert.equal(after[field], before[field]);
  await db.exec("reset role");
  await db.query(
    "update card_printings set set_name='A different set',identity_verified=false where id=$1",
    [before.card_printing_id],
  );
  await actor(db);
  await assert.rejects(
    db.query("select confirm_pricing_card($1,$2::jsonb,$3,true)", [
      id,
      JSON.stringify(snapshot),
      crypto.randomUUID(),
    ]),
    /ficha cambió/,
  );
});

test("focused exchange updates preserve policy and fees, invalidate drafts and retain retry safety", async () => {
  const p = await prepare();
  const prior = (await db.query<any>("select * from operation_settings"))
    .rows[0];
  const key = crypto.randomUUID(),
    at = new Date().toISOString();
  const save = () =>
    db.query<any>("select set_pricing_exchange(520,$1,$2,$3) result", [
      at,
      "https://www.bccr.fi.cr/",
      key,
    ]);
  assert.deepEqual((await save()).rows, (await save()).rows);
  const after = (await db.query<any>("select * from operation_settings"))
    .rows[0];
  assert.equal(Number(after.fx), 520);
  assert.equal(after.revision, prior.revision + 1);
  assert.deepEqual(after.policy, prior.policy);
  assert.equal(after.daily_job_limit, prior.daily_job_limit);
  assert.equal(after.delivery_fee_crc, prior.delivery_fee_crc);
  assert.equal((await readiness(p.proposalId)).code, "policy_changed");
  await assert.rejects(approve(p), /reglas de precios cambiaron/);
});

test("manual exchange rates accept empty sources, audit the entry and retry without changing inventory", async () => {
  const p = await prepare();
  const prior = (await db.query<any>("select * from operation_settings"))
    .rows[0];
  const before = (
    await db.query<any>(
      "select approved_price_crc,price_revision from listings where id=$1",
      [p.id],
    )
  ).rows[0];
  const key = crypto.randomUUID(),
    at = new Date().toISOString();
  let result: unknown;
  for (const source of [null, "", "   "]) {
    const current = await db.query<any>(
      "select set_pricing_exchange(511.25,$1,$2,$3) result",
      [at, source, key],
    );
    if (result) assert.deepEqual(current.rows, result);
    result = current.rows;
  }
  const after = (await db.query<any>("select * from operation_settings"))
    .rows[0];
  assert.equal(Number(after.fx), 511.25);
  assert.equal(after.fx_source, null);
  assert.equal(after.revision, prior.revision + 1);
  assert.deepEqual(after.policy, prior.policy);
  assert.equal(after.delivery_fee_crc, prior.delivery_fee_crc);
  assert.deepEqual(
    (
      await db.query<any>(
        "select approved_price_crc,price_revision from listings where id=$1",
        [p.id],
      )
    ).rows[0],
    before,
  );
  const receipt = (
    await db.query<any>("select payload from operation_receipts where key=$1", [
      key,
    ])
  ).rows[0];
  assert.equal(receipt.payload.source, null);
  assert.equal((await readiness(p.proposalId)).code, "policy_changed");
});

test("optional exchange sources retain validation of dates, values and supplied links", async () => {
  const prior = (await db.query<any>("select * from operation_settings"))
    .rows[0];
  for (const [fx, at, source] of [
    [510, new Date().toISOString(), "http://example.com/"],
    [0, new Date().toISOString(), null],
    [510, null, null],
    [510, new Date(Date.now() - 8 * 86400000).toISOString(), null],
    [510, new Date(Date.now() + 2 * 3600000).toISOString(), null],
  ]) {
    await assert.rejects(
      db.query("select set_pricing_exchange($1,$2,$3,$4)", [
        fx,
        at,
        source,
        crypto.randomUUID(),
      ]),
      /HTTPS|tipo de cambio válido/,
    );
  }
  assert.deepEqual(
    (await db.query<any>("select * from operation_settings")).rows[0],
    prior,
  );
});

test("the full settings form also accepts a manual rate with no source link", async () => {
  const prior = (await db.query<any>("select * from operation_settings"))
    .rows[0];
  await command(db, "settings", {
    policy: prior.policy,
    fx: 525,
    fxAt: new Date().toISOString(),
    fxSource: null,
    dailyJobLimit: prior.daily_job_limit,
    deliveryFeeCrc: prior.delivery_fee_crc,
  });
  const after = (await db.query<any>("select * from operation_settings"))
    .rows[0];
  assert.equal(Number(after.fx), 525);
  assert.equal(after.fx_source, null);
  assert.deepEqual(after.policy, prior.policy);
  assert.equal(after.daily_job_limit, prior.daily_job_limit);
  assert.equal(after.delivery_fee_crc, prior.delivery_fee_crc);
});

test("roles cannot bypass final-price, card-confirmation or exchange permissions", async () => {
  const p = await prepare();
  await actor(db, stock);
  await assert.rejects(approve(p), /permiso/);
  await assert.rejects(
    db.query("select confirm_pricing_card($1,'{}', $2,true)", [
      p.id,
      crypto.randomUUID(),
    ]),
    /permiso/,
  );
  await actor(db, reviewer);
  await assert.rejects(
    db.query(
      "select set_pricing_exchange(510,now(),'https://www.bccr.fi.cr/',$1)",
      [crypto.randomUUID()],
    ),
    /permiso/,
  );
  await actor(db);
});
