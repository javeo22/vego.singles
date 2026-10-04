import { test } from "node:test";
import assert from "node:assert/strict";
import { database, command, listing, actor, reviewer, stock } from "./database";
import {
  parseImport,
  matchCandidates,
  sameCollectorNumber,
  type CatalogCard,
} from "../lib/operations/imports";
import { calculatePrice } from "../lib/operations/pricing";

test("CSV preserves language hints, collector prefixes, multiline cells, zero counts, and unknown costs", () => {
  const p = parseImport(
    'Name,Set,Card Number,Condition,Variant,Quantity\n"Swinub (JP)",Battle Partners,106/100,NM,Holofoil,1\n"Absol\nSpecial",Gallery,GG16/GG70,MP,Holofoil,0',
  );
  assert.equal(p.rows[0].language, "ja");
  assert.equal(p.rows[0].acquisitionCostCrc, null);
  assert.equal(p.rows[1].collectorNumber, "GG16/GG70");
  assert.equal(p.rows[1].quantity, 0);
  assert.deepEqual(p.rows[1].errors, []);
  assert.throws(() => parseImport('Name,Set\n"broken,x'));
});
test("matching never auto-selects the wrong language or ambiguous treatment", () => {
  const row = parseImport(
    "Name,Set,Card Number,Condition,Variant,Language\nSame,Test,GG16/GG70,NM,Holofoil,ja",
  ).rows[0];
  const c: CatalogCard = {
    id: "1",
    name: "Same",
    setName: "Test",
    collectorNumber: "GG16/GG70",
    game: "pokemon",
    language: "en",
    provider: "test",
    externalId: "1",
    imageUrl: null,
    verified: true,
    treatment: "standard",
    kind: "single",
  };
  assert.equal(matchCandidates(row, [c]).automatic, null);
  assert.equal(
    matchCandidates(row, [{ ...c, language: "ja" }]).automatic?.id,
    "1",
  );
  assert.equal(
    matchCandidates(row, [
      { ...c, language: "ja" },
      { ...c, id: "2", language: "ja" },
    ]).automatic,
    null,
  );
});
test("pricing checks freshness, requires exact variants, and respects margin floors", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const input = {
    amount: 20,
    currency: "USD" as const,
    fx: 510,
    fxAt: now.toISOString(),
    observedAt: now.toISOString(),
    acquisitionCostCrc: 6200,
    currentPriceCrc: 10000,
    identityVerified: true,
    exactVariant: true,
  };
  assert.equal(calculatePrice(input, now).suggestedPriceCrc, 10000);
  assert.ok(
    calculatePrice({ ...input, acquisitionCostCrc: 10000 }, now).warnings.some(
      (w) => w.includes("Margen"),
    ),
  );
  assert.throws(() => calculatePrice({ ...input, exactVariant: false }, now));
  assert.throws(() => calculatePrice({ ...input, fxAt: "2026-09-01" }, now));
  assert.ok(
    calculatePrice(
      { ...input, acquisitionCostCrc: null },
      now,
    ).warnings.includes("Costo por confirmar"),
  );
});
test("migrations load and stock commands are idempotent, audited, and role restricted", async () => {
  const db = await database();
  try {
    const id = await listing(db);
    const key = crypto.randomUUID();
    const p = { id, delta: 2, location: "SHELF1", reason: "Recepción física" };
    await command(db, "stock_adjust", p, key);
    await command(db, "stock_adjust", p, key);
    assert.equal(
      (
        await db.query<{ quantity: number }>(
          "select quantity from operations_inventory where listing_id=$1",
          [id],
        )
      ).rows[0].quantity,
      5,
    );
    assert.equal(
      (await db.query("select * from inventory_events")).rows.length,
      1,
    );
    await assert.rejects(
      command(db, "stock_adjust", { ...p, delta: 3 }, key),
      /Clave reutilizada/,
    );
    await actor(db, reviewer);
    await assert.rejects(command(db, "stock_adjust", p), /permiso/);
    await actor(db, stock);
    await assert.rejects(
      command(db, "publish", { id, published: false }),
      /permiso/,
    );
  } finally {
    await db.close();
  }
});

test("collector normalization keeps prefixes and rejects conflicting denominators", () => {
  assert.ok(sameCollectorNumber("GG16/GG70", "GG16"));
  assert.ok(sameCollectorNumber("087/081", "87/81"));
  assert.equal(sameCollectorNumber("GG16/GG70", "TG16/TG30"), false);
  assert.equal(sameCollectorNumber("87/81", "87/100"), false);
  const row = parseImport(
    "Name,Set,Number,Language,Condition,Variant,Provider,External ID\nX,A,7/100,en,NM,Holofoil,test,x",
  ).rows[0];
  const card: CatalogCard = {
    id: "x",
    name: "X",
    setName: "A",
    collectorNumber: "8/100",
    game: "pokemon",
    language: "en",
    provider: "test",
    externalId: "x",
    verified: true,
    imageUrl: null,
    treatment: "standard",
    kind: "single",
  };
  assert.equal(matchCandidates(row, [card]).automatic, null);
});

test("same-origin validation uses browser authority and rejects cross-site forwarded-host spoofing", async () => {
  const { isSameOrigin } = await import("../lib/operations/origin");
  const request = (headers: Record<string, string>) =>
    new Request("http://localhost:4195/api/admin", { headers });
  assert.equal(
    isSameOrigin(
      request({ origin: "http://127.0.0.1:4195", host: "127.0.0.1:4195" }),
    ),
    true,
  );
  assert.equal(
    isSameOrigin(
      request({
        origin: "https://vego-singles.vercel.app",
        host: "vego-singles.vercel.app",
        "x-forwarded-proto": "https",
      }),
    ),
    true,
  );
  assert.equal(
    isSameOrigin(
      request({
        origin: "https://attacker.example",
        host: "vego-singles.vercel.app",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      }),
    ),
    false,
  );
  assert.equal(
    isSameOrigin(request({ host: "vego-singles.vercel.app" })),
    false,
  );
  assert.equal(
    isSameOrigin(request({ origin: "null", host: "vego-singles.vercel.app" })),
    false,
  );
  assert.equal(
    isSameOrigin(
      request({
        origin: "https://vego-singles.vercel.app",
        host: "attacker@vego-singles.vercel.app",
      }),
    ),
    false,
  );
});
