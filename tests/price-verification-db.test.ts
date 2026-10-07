import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { database, listing, actor, command, stock } from "./database";
import {
  assessPriceReferences,
  priceVariantSnapshot,
  type MarketReference,
} from "../lib/operations/price-verification";
let db: PGlite;
before(async () => {
  db = await database();
  await db.exec("reset role");
  await db.exec(
    "update operation_settings set fx=510,fx_at=now(),fx_source='https://www.bccr.fi.cr/'",
  );
  await actor(db);
});
after(async () => {
  await db.close();
});
async function check(
  overrides: Partial<MarketReference> = {},
  extra: MarketReference[] = [],
) {
  const id = await listing(db),
    job = crypto.randomUUID();
  const p = (
    await db.query<any>(
      "select * from operations_inventory where listing_id=$1",
      [id],
    )
  ).rows[0];
  const ref: MarketReference = {
    id: "tcgdex:1:Holofoil:USD",
    amount: 20,
    currency: "USD",
    marketplace: "tcgplayer",
    feed: "tcgdex",
    sourceUrl: "https://www.tcgplayer.com/product/1",
    providerUpdatedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    productId: "1",
    finish: "Holofoil",
    conditionCoverage: "market_aggregate",
    ...overrides,
  };
  const report = assessPriceReferences(p, [ref, ...extra]);
  await db.exec("reset role");
  const snapshot = (
    await db.query<any>("select price_variant_snapshot($1) snapshot", [id])
  ).rows[0].snapshot;
  assert.deepEqual(
    snapshot,
    priceVariantSnapshot(p),
    "JS and SQL bind exactly the same variant",
  );
  await db.query(
    "insert into operation_jobs(id,kind,entity_id,status,result) values($1,'refresh_price',$2,'needs_review',$3::jsonb)",
    [job, id, JSON.stringify({ verification: report })],
  );
  await actor(db);
  return { id, job, ref };
}
async function propose(
  c: Awaited<ReturnType<typeof check>>,
  key = crypto.randomUUID(),
  confirmed = true,
) {
  const r = await db.query<any>(
    "select create_price_proposal_from_check($1,$2,$3,$4,$5) result",
    [c.id, c.job, c.ref.id, key, confirmed],
  );
  return r.rows[0].result;
}
test("checked evidence is immutable, retry-safe and changes no approved price before approval", async () => {
  const c = await check(),
    key = crypto.randomUUID();
  const a = await propose(c, key),
    b = await propose(c, key);
  assert.deepEqual(a, b);
  const e = (
    await db.query<any>("select * from market_prices where listing_id=$1", [
      c.id,
    ])
  ).rows;
  assert.equal(e.length, 1);
  assert.equal(Number(e[0].amount), 20);
  const p = (
    await db.query<any>("select * from price_proposals where id=$1", [a.id])
  ).rows[0];
  assert.equal(p.calculation.priceCheck.jobId, c.job);
  assert.equal(
    (
      await db.query<any>(
        "select approved_price_crc from listings where id=$1",
        [c.id],
      )
    ).rows[0].approved_price_crc,
    10000,
  );
  await command(db, "review_price", {
    id: a.id,
    approve: true,
    reason: "Variante y evidencia revisadas",
  });
  assert.equal(
    (
      await db.query<any>("select status from price_proposals where id=$1", [
        a.id,
      ])
    ).rows[0].status,
    "approved",
  );
  await assert.rejects(
    propose({ ...c, ref: { ...c.ref, id: "other" } }, key),
    /Clave reutilizada/,
  );
});
test("remapping the provider invalidates a checked reference before it can create evidence", async () => {
  const c = await check();
  await command(db, "verify_listing", {
    id: c.id,
    language: "en",
    provider: "tcgdex",
    externalId: "different-printing",
    reason: "Corregir impresión",
  });
  await assert.rejects(propose(c), /proveedor cambió/);
  assert.equal(
    (
      await db.query<any>(
        "select count(*)::int n from market_prices where listing_id=$1",
        [c.id],
      )
    ).rows[0].n,
    0,
  );
});
test("provider remapping after proposal creation blocks approval and rolls back the listing price", async () => {
  const c = await check(),
    p = await propose(c);
  await command(db, "verify_listing", {
    id: c.id,
    language: "en",
    provider: "tcgdex",
    externalId: "changed",
    reason: "Corregir vínculo",
  });
  await assert.rejects(
    command(db, "review_price", {
      id: p.id,
      approve: true,
      reason: "Intento con evidencia antigua",
    }),
    /proveedor cambió/,
  );
  assert.equal(
    (
      await db.query<any>(
        "select approved_price_crc from listings where id=$1",
        [c.id],
      )
    ).rows[0].approved_price_crc,
    10000,
  );
});
test("undated, expired, conflicting and mismatched-finish references cannot become proposals", async () => {
  for (const overrides of [
    { providerUpdatedAt: null },
    { providerUpdatedAt: new Date(Date.now() - 100 * 3600000).toISOString() },
    { finish: "Non-foil" },
  ])
    await assert.rejects(
      propose(await check(overrides)),
      /Referencia no vigente/,
    );
  const c = await check();
  const other = {
    ...c.ref,
    id: "tcgcsv:1:Holofoil:USD",
    feed: "tcgcsv",
    amount: 40,
  };
  const conflict = await check({}, [other]);
  await assert.rejects(propose(conflict), /difieren más de 15%/);
});
test("a stock role cannot price cards and reviewers must confirm the physical variant", async () => {
  const c = await check();
  await actor(db, stock);
  await assert.rejects(propose(c), /permiso/);
  await actor(db);
  await assert.rejects(
    propose(c, crypto.randomUUID(), false),
    /Confirma la variante/,
  );
  await assert.rejects(
    db.query("select checked_price_reference($1,$2,$3)", [
      c.id,
      c.job,
      c.ref.id,
    ]),
    /permission denied/,
  );
});
