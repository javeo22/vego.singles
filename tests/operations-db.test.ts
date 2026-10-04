import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { database, command, listing, actor, reviewer } from "./database";
import { parseImport } from "../lib/operations/imports";
import { calculatePrice, defaultPolicy } from "../lib/operations/pricing";
let db: PGlite;
before(async () => {
  db = await database();
});
after(async () => {
  await db.close();
});
const reason = "Revisión física y evidencia comparable";
async function stage(
  mode: string,
  quantity = 1,
  reference = "",
  cost: number | null = null,
) {
  const id = await listing(db, 3);
  const cp = (
    await db.query<any>(
      "select * from operations_inventory where listing_id=$1",
      [id],
    )
  ).rows[0];
  const parsed = parseImport(
    `Name,Set,Card Number,Language,Condition,Variant,Quantity,Cost CRC\nTest Card,Test Set,${cp.collector_number},en,NM,Holofoil,${quantity},${cost ?? ""}`,
  );
  const b = await command(db, "stage_import", {
    name: "Prueba",
    hash: parsed.hash,
    rows: parsed.rows,
    mode,
    reference,
  });
  const row = (
    await db.query<any>("select * from import_rows where batch_id=$1", [b.id])
  ).rows[0];
  await command(db, "resolve_import", {
    id: row.id,
    card_printing_id: cp.card_printing_id,
    language: "en",
    condition: "Near Mint",
    finish: "Holofoil",
    reason,
  });
  return { id, batch: b.id, row: row.id, parsed };
}
async function inquiry(id: string, quantity = 1, key = crypto.randomUUID()) {
  await actor(db, "", "service_role");
  const r = await db.query<any>(
    "select create_purchase_inquiry($1::jsonb,$2,$3,$4,$5) result",
    [
      JSON.stringify([{ id, quantity }]),
      "pickup",
      "",
      key,
      "test-fingerprint-for-db",
    ],
  );
  await actor(db);
  return r.rows[0].result;
}
async function requestId(number: string) {
  return (
    await db.query<any>(
      "select id from purchase_requests where request_number=$1",
      [number],
    )
  ).rows[0].id;
}
async function evidence(id: string, amount = 20, currency = "USD") {
  return command(db, "evidence", {
    id,
    amount,
    currency,
    provider: "manual",
    sourceUrl: "https://example.com/verified-card",
    observedAt: new Date().toISOString(),
    priceType: "condition_quote",
    exactVariant: true,
  });
}
async function settings() {
  return command(db, "settings", {
    policy: defaultPolicy,
    fx: 510,
    fxAt: new Date().toISOString(),
    fxSource: "https://www.bccr.fi.cr/",
    deliveryFeeCrc: 500,
  });
}

test("public view exposes stock without private table permissions", async () => {
  const id = await listing(db);
  await actor(db, "", "anon");
  const r = await db.query<any>(
    "select * from storefront_inventory where id=$1",
    [id],
  );
  assert.equal(r.rows[0].quantity, 3);
  assert.equal(r.rows[0].acquisition_cost, undefined);
  await assert.rejects(db.query("select * from listings"), /permission denied/);
  await assert.rejects(
    db.query("select * from stock_lots"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select free_stock($1)", [id]),
    /permission denied/,
  );
  await actor(db);
  await assert.rejects(
    db.query("update stock_lots set quantity=100"),
    /permission denied/,
  );
});
test("receipt commits and file retries do not duplicate stock; distinct receipt references are allowed", async () => {
  const s = await stage("receipt", 2);
  await command(db, "commit_import", { id: s.batch, location: "SHELF1" });
  await command(db, "commit_import", { id: s.batch, location: "SHELF1" });
  assert.equal(
    (
      await db.query<any>(
        "select quantity from operations_inventory where listing_id=$1",
        [s.id],
      )
    ).rows[0].quantity,
    5,
  );
  const again = await command(db, "stage_import", {
    name: "Retry",
    hash: s.parsed.hash,
    rows: s.parsed.rows,
    mode: "receipt",
    reference: "",
  });
  assert.equal(again.id, s.batch);
  const other = await command(db, "stage_import", {
    name: "New shipment",
    hash: s.parsed.hash,
    rows: s.parsed.rows,
    mode: "receipt",
    reference: "ORDER-2",
  });
  assert.notEqual(other.id, s.batch);
});
test("snapshots set totals instead of adding quantities", async () => {
  const s = await stage("snapshot", 1);
  await command(db, "commit_import", { id: s.batch, location: "SHELF1" });
  assert.equal(
    (
      await db.query<any>(
        "select quantity from operations_inventory where listing_id=$1",
        [s.id],
      )
    ).rows[0].quantity,
    1,
  );
});
test("stale snapshot rolls back after another stock movement", async () => {
  const s = await stage("snapshot", 1);
  await command(db, "stock_adjust", {
    id: s.id,
    delta: 1,
    location: "SHELF1",
    reason: "Compra adicional",
  });
  await assert.rejects(
    command(db, "commit_import", { id: s.batch, location: "SHELF1" }),
    /stock cambió/,
  );
  assert.equal(
    (
      await db.query<any>(
        "select quantity from operations_inventory where listing_id=$1",
        [s.id],
      )
    ).rows[0].quantity,
    4,
  );
  assert.equal(
    (await db.query<any>("select status from import_rows where id=$1", [s.row]))
      .rows[0].status,
    "ready",
  );
});
test("database pricing agrees with TypeScript and stale approval is rejected", async () => {
  await settings();
  const id = await listing(db);
  const e = await evidence(id);
  const proposal = (
    await db.query<any>("select * from price_proposals where id=$1", [e.id])
  ).rows[0];
  const expected = calculatePrice({
    amount: 20,
    currency: "USD",
    fx: 510,
    fxAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    acquisitionCostCrc: 6000,
    currentPriceCrc: 10000,
    identityVerified: true,
    exactVariant: true,
  });
  assert.equal(proposal.suggested_price_crc, expected.suggestedPriceCrc);
  assert.deepEqual(proposal.calculation.warnings, expected.warnings);
  await command(db, "verify_listing", {
    id,
    language: "en",
    acquisitionCostCrc: 6500,
    reason,
  });
  await assert.rejects(
    command(db, "review_price", { id: e.id, approve: true, reason }),
    /Propuesta vencida/,
  );
});
test("policy changes invalidate pending proposals and evidence freshness is enforced", async () => {
  await settings();
  const id = await listing(db);
  const e = await evidence(id);
  await settings();
  await assert.rejects(
    command(db, "review_price", { id: e.id, approve: true, reason }),
    /política cambió/,
  );
  await assert.rejects(
    command(db, "evidence", {
      id,
      amount: 20,
      currency: "USD",
      provider: "manual",
      sourceUrl: "https://example.com",
      observedAt: new Date(Date.now() - 100 * 3600000).toISOString(),
      priceType: "condition_quote",
      exactVariant: true,
    }),
    /Referencia vencida/,
  );
  await command(db, "price_lock", {
    id,
    until: new Date(Date.now() + 86400000).toISOString(),
    reason,
  });
  await assert.rejects(evidence(id), /bloqueado/);
});
test("bulk approvals are atomic if any selected proposal is stale", async () => {
  await settings();
  const first = await listing(db),
    second = await listing(db);
  const a = await evidence(first, 22),
    b = await evidence(second, 24);
  await command(db, "verify_listing", {
    id: second,
    language: "en",
    acquisitionCostCrc: 6500,
    reason,
  });
  await assert.rejects(
    command(db, "bulk_price", { ids: [a.id, b.id], approve: true, reason }),
    /vencida/,
  );
  assert.equal(
    (
      await db.query<any>(
        "select approved_price_crc from operations_inventory where listing_id=$1",
        [first],
      )
    ).rows[0].approved_price_crc,
    10000,
  );
  assert.equal(
    (
      await db.query<any>("select status from price_proposals where id=$1", [
        a.id,
      ])
    ).rows[0].status,
    "pending",
  );
});
test("saved inquiry snapshots server prices and duplicate retries create one request", async () => {
  const id = await listing(db);
  const key = crypto.randomUUID();
  const a = await inquiry(id, 2, key),
    b = await inquiry(id, 2, key);
  assert.equal(a.number, b.number);
  assert.equal(a.subtotal, 20000);
  assert.equal(a.items[0].variant.language, "en");
  const req = await requestId(a.number);
  assert.equal(
    (
      await db.query<any>(
        "select count(*)::int n from purchase_request_items where purchase_request_id=$1",
        [req],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(inquiry(id, 1, key), /Clave reutilizada/);
  await actor(db);
});
test("competing requests cannot reserve the last copy twice; cancellation releases it", async () => {
  const id = await listing(db, 1);
  const a = await inquiry(id),
    b = await inquiry(id);
  const ai = await requestId(a.number),
    bi = await requestId(b.number);
  const outcomes = await Promise.allSettled([
    command(db, "reserve_request", { id: ai, hours: 24 }),
    command(db, "reserve_request", { id: bi, hours: 24 }),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  const reserved = (
    await db.query<any>(
      "select id from purchase_requests where id in ($1,$2) and status='reserved'",
      [ai, bi],
    )
  ).rows[0].id;
  assert.equal(
    (
      await db.query<any>(
        "select available_quantity from operations_inventory where listing_id=$1",
        [id],
      )
    ).rows[0].available_quantity,
    0,
  );
  await assert.rejects(
    command(db, "stock_adjust", { id, delta: -1, location: "SHELF1", reason }),
    /reservadas/,
  );
  await command(db, "cancel_request", { id: reserved, reason });
  assert.equal(
    (
      await db.query<any>(
        "select available_quantity from operations_inventory where listing_id=$1",
        [id],
      )
    ).rows[0].available_quantity,
    1,
  );
});
test("sale converts the reservation and deducts split lots only once", async () => {
  const id = await listing(db, 1);
  await command(db, "stock_adjust", {
    id,
    delta: 2,
    location: "SHELF1",
    reason,
  });
  const q = await inquiry(id, 3),
    req = await requestId(q.number);
  await command(db, "reserve_request", { id: req, hours: 24 });
  const key = crypto.randomUUID();
  await command(db, "sell_request", { id: req }, key);
  await command(db, "sell_request", { id: req }, key);
  assert.equal(
    (
      await db.query<any>(
        "select quantity from operations_inventory where listing_id=$1",
        [id],
      )
    ).rows[0].quantity,
    0,
  );
  await command(db, "fulfill_request", { id: req });
  assert.equal(
    (
      await db.query<any>("select status from purchase_requests where id=$1", [
        req,
      ])
    ).rows[0].status,
    "fulfilled",
  );
});
test("job lease expiration allows recovery and rejects stale workers", async () => {
  await db.exec("reset role;delete from operation_jobs");
  await actor(db);
  const id = await listing(db);
  await command(db, "enqueue", { id, kind: "refresh_price" });
  const a = await command(db, "claim_job", {});
  await db.exec("reset role");
  await db.query(
    "update operation_jobs set lease_until=now()-interval '1 second' where id=$1",
    [a.id],
  );
  await actor(db);
  const b = await command(db, "claim_job", {});
  assert.equal(a.id, b.id);
  assert.notEqual(a.lease_token, b.lease_token);
  await assert.rejects(
    command(db, "finish_job", {
      id: a.id,
      token: a.lease_token,
      status: "succeeded",
    }),
    /turno/,
  );
  await command(db, "finish_job", {
    id: b.id,
    token: b.lease_token,
    status: "needs_review",
    result: { message: "Exact variant required" },
  });
});
test("server search pages beyond the first hundred records and treats search text literally", async () => {
  await db.exec("reset role");
  await db.exec(
    "insert into card_printings(game,canonical_name,set_name,collector_number,language) select 'magic','Pagination '||n,'Paging Set',n::text,'en' from generate_series(1,120) n;insert into listings(card_printing_id,condition,finish) select id,'Near Mint','Non-foil' from card_printings where set_name='Paging Set';",
  );
  await actor(db);
  const r = (
    await db.query<any>(
      "select search_operations_inventory('Pagination','all','all',2) result",
    )
  ).rows[0].result;
  assert.equal(r.total, 120);
  assert.equal(r.rows.length, 20);
  const weird = (
    await db.query<any>(
      "select search_operations_inventory('%),injection','all','all',0) result",
    )
  ).rows[0].result;
  assert.equal(weird.total, 0);
});
test("role checks apply at the RPC boundary and unlocated stock cannot publish", async () => {
  const id = await listing(db);
  await actor(db, reviewer);
  await assert.rejects(
    command(db, "membership", { email: "review@example.com", role: "owner" }),
    /permiso/,
  );
  await actor(db);
  await db.exec("reset role");
  await db.query(
    "update stock_lots set location_code='UNASSIGNED' where listing_id=$1",
    [id],
  );
  await actor(db);
  await assert.rejects(
    command(db, "publish", { id, published: true }),
    /ubicación/,
  );
});

test("receipts preserve individual lot costs and transfers preserve their weighted basis", async () => {
  await actor(db);
  const s = await stage("receipt", 2, "COST-TEST", 3000);
  await command(db, "verify_listing", {
    id: s.id,
    language: "en",
    acquisitionCostCrc: 6000,
    reason,
  });
  await command(db, "commit_import", { id: s.batch, location: "SHELF1" });
  let r = (
    await db.query<any>(
      "select * from operations_inventory where listing_id=$1",
      [s.id],
    )
  ).rows[0];
  assert.equal(Number(r.acquisition_cost), 4800);
  assert.equal(r.cost_confirmed, true);
  await command(db, "location", { code: "SHELF2", label: "Otro estante" });
  await command(db, "stock_transfer", {
    id: s.id,
    from: "SHELF1",
    to: "SHELF2",
    quantity: 4,
    reason,
  });
  r = (
    await db.query<any>(
      "select * from operations_inventory where listing_id=$1",
      [s.id],
    )
  ).rows[0];
  assert.equal(r.quantity, 5);
  assert.equal(Number(r.acquisition_cost), 4800);
  const costs = (
    await db.query<any>(
      "select * from stock_lots where listing_id=$1 and quantity>0",
      [s.id],
    )
  ).rows;
  assert.ok(
    costs.every((x: any) => x.cost_verified && x.unit_cost_crc !== null),
  );
});
test("job fencing cannot alter import rows after a lease expires", async () => {
  await db.exec("reset role;delete from operation_jobs");
  await actor(db);
  const s = await stage("receipt", 1);
  await db.exec("reset role");
  await db.query("update import_rows set status='needs_review' where id=$1", [
    s.row,
  ]);
  await actor(db);
  const job = await command(db, "claim_job", {});
  await db.exec("reset role");
  await db.query(
    "update operation_jobs set lease_until=now()-interval '1 second' where id=$1",
    [job.id],
  );
  await actor(db);
  const cp = (
    await db.query<any>(
      "select card_printing_id from operations_inventory where listing_id=$1",
      [s.id],
    )
  ).rows[0].card_printing_id;
  await assert.rejects(
    command(db, "finish_job", {
      id: job.id,
      token: job.lease_token,
      status: "succeeded",
      automatic: cp,
    }),
    /turno/,
  );
  assert.equal(
    (await db.query<any>("select status from import_rows where id=$1", [s.row]))
      .rows[0].status,
    "needs_review",
  );
});
test("catalog lookup reconciles fraction formats and anonymous users cannot invoke it", async () => {
  await actor(db);
  await db.exec("reset role");
  await db.exec(
    "insert into card_printings(game,canonical_name,set_name,collector_number,language,identity_verified) values('pokemon','Gallery Card','Known Gallery','GG16','en',true);",
  );
  await actor(db);
  const result = (
    await db.query<any>(
      "select catalog_candidates('pokemon','Known Gallery','GG16/GG70','','') result",
    )
  ).rows[0].result;
  assert.equal(result.length, 1);
  await actor(db, "", "anon");
  await assert.rejects(
    db.query(
      "select catalog_candidates('pokemon','Known Gallery','GG16/GG70','','')",
    ),
    /permission denied/,
  );
  await actor(db);
});

test("stock reductions consume split lots and snapshots recalculate remaining cost", async () => {
  const s = await stage("snapshot", 1, "COST-SNAPSHOT");
  await command(db, "verify_listing", {
    id: s.id,
    language: "en",
    acquisitionCostCrc: 6000,
    reason,
  });
  await command(db, "stock_adjust", {
    id: s.id,
    delta: 2,
    location: "SHELF1",
    reason,
  });
  const pendingCost = (
    await db.query<any>(
      "select cost_confirmed,acquisition_cost from operations_inventory where listing_id=$1",
      [s.id],
    )
  ).rows[0];
  assert.equal(pendingCost.cost_confirmed, false);
  assert.equal(pendingCost.acquisition_cost, null);
  const lots = (
    await db.query<any>(
      "select * from stock_lots where listing_id=$1 and quantity>0 order by created_at,id",
      [s.id],
    )
  ).rows;
  await command(db, "lot_cost", { id: lots[1].id, cost: 3000, reason });
  await command(db, "stock_adjust", {
    id: s.id,
    delta: -4,
    location: "SHELF1",
    reason,
  });
  let row = (
    await db.query<any>(
      "select * from operations_inventory where listing_id=$1",
      [s.id],
    )
  ).rows[0];
  assert.equal(row.quantity, 1);
  assert.equal(Number(row.acquisition_cost), 3000);
  await command(db, "stock_adjust", {
    id: s.id,
    delta: 2,
    location: "SHELF1",
    reason,
  });
  const remaining = (
    await db.query<any>(
      "select * from stock_lots where listing_id=$1 and quantity>0 order by created_at,id",
      [s.id],
    )
  ).rows;
  await command(db, "lot_cost", { id: remaining[1].id, cost: 9000, reason });
  const cp = row.card_printing_id;
  await command(db, "resolve_import", {
    id: s.row,
    card_printing_id: cp,
    language: "en",
    condition: "Near Mint",
    finish: "Holofoil",
    reason,
  });
  await command(db, "commit_import", { id: s.batch, location: "SHELF1" });
  row = (
    await db.query<any>(
      "select * from operations_inventory where listing_id=$1",
      [s.id],
    )
  ).rows[0];
  assert.equal(row.quantity, 1);
  assert.equal(Number(row.acquisition_cost), 9000);
});

test("upgrade preserves a legacy boolean-availability view and existing merchandising", async () => {
  const upgraded = await database(`
  alter table listings add column archived_at timestamptz,add column featured boolean not null default false,add column featured_rank integer;
  insert into card_printings(id,game,canonical_name,set_name,collector_number,language) values('00000000-0000-4000-8000-000000000099','pokemon','Legacy Card','Legacy Set','25','english');
  insert into listings(card_printing_id,condition,finish,published,approved_price_crc,featured,featured_rank) values('00000000-0000-4000-8000-000000000099','Near Mint','Holofoil',true,25000,true,1);
  drop view public_listings;
  create view public_listings as select l.id,l.approved_price_crc,l.condition,l.finish,l.public_notes,l.featured,l.featured_rank,true as available,jsonb_build_object('canonical_name',c.canonical_name,'language',c.language) card_printings from listings l join card_printings c on c.id=l.card_printing_id where l.published;
  grant select on public_listings to anon;
 `);
  try {
    await actor(upgraded, "", "anon");
    const legacy = (await upgraded.query<any>("select * from public_listings"))
      .rows[0];
    assert.equal(legacy.available, true);
    assert.equal(legacy.featured, true);
    assert.equal(legacy.approved_price_crc, 25000);
    assert.equal(
      (await upgraded.query("select * from storefront_inventory")).rows.length,
      0,
    );
    await assert.rejects(
      upgraded.query("select acquisition_cost from listings"),
      /permission denied/,
    );
    await actor(upgraded);
    const preserved = (
      await upgraded.query<any>(
        "select price_verified,approved_price_crc from listings",
      )
    ).rows[0];
    assert.equal(preserved.price_verified, true);
    assert.equal(preserved.approved_price_crc, 25000);
  } finally {
    await upgraded.close();
  }
});
