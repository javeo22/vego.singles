import test from "node:test";
import assert from "node:assert/strict";
import { database, actor, command, listing, reviewer } from "./database";
import { deliveryMessage, whatsappUrl } from "../lib/fulfillment";
import { inquirySchema } from "../lib/operations/validation";
import { parseImport } from "../lib/operations/imports";

test("express requests preserve idempotency, quote cost, and block selling until delivery is confirmed", async () => {
  const db = await database();
  try {
    const id = await listing(db, 3);
    const key = crypto.randomUUID();
    await actor(db, "", "service_role");
    const create = () =>
      db.query<{ result: any }>(
        "select create_purchase_inquiry($1::jsonb,'express','',$2,'test-delivery-fingerprint') result",
        [JSON.stringify([{ id, quantity: 1 }]), key],
      );
    const first = (await create()).rows[0].result;
    assert.deepEqual((await create()).rows[0].result, first);
    assert.equal(first.delivery, 0);
    assert.equal(first.deliveryPending, true);
    assert.equal(first.total, 10000);
    await actor(db);
    const request = (
      await db.query<{ id: string }>(
        "select id from purchase_requests where request_number=$1",
        [first.number],
      )
    ).rows[0].id;
    await command(db, "reserve_request", { id: request, hours: 1 });
    await assert.rejects(
      command(db, "sell_request", { id: request }),
      /costo de envío/,
    );
    assert.equal(
      (
        await db.query<any>(
          "select quantity from operations_inventory where listing_id=$1",
          [id],
        )
      ).rows[0].quantity,
      3,
    );
    await actor(db, reviewer);
    await assert.rejects(
      command(db, "quote_delivery", {
        id: request,
        amountCrc: 2500,
        reason: "Acordado en WhatsApp",
      }),
      /permiso/,
    );
    await actor(db);
    await assert.rejects(
      command(db, "quote_delivery", {
        id: request,
        amountCrc: -1,
        reason: "Acordado en WhatsApp",
      }),
      /válidos/,
    );
    const quoteKey = crypto.randomUUID();
    const quote = {
      id: request,
      amountCrc: 2500,
      reason: "Acordado en WhatsApp",
    };
    await command(db, "quote_delivery", quote, quoteKey);
    await command(db, "quote_delivery", quote, quoteKey);
    const updated = (
      await db.query<any>("select * from purchase_requests where id=$1", [
        request,
      ])
    ).rows[0];
    assert.equal(updated.delivery_fee_pending, false);
    assert.equal(updated.total_crc, 12500);
    await command(db, "sell_request", { id: request });
    assert.equal(
      (
        await db.query<any>(
          "select quantity from operations_inventory where listing_id=$1",
          [id],
        )
      ).rows[0].quantity,
      2,
    );
    const parsed = parseImport(
      [
        "Name,Set,Card Number,Condition,Variant,Language",
        ...Array.from(
          { length: 1035 },
          (_, i) => `Card ${i},Test,${i},NM,Foil,en`,
        ),
      ].join("\n"),
    );
    const batch = await command(db, "stage_import", {
      name: "Export size regression",
      hash: parsed.hash,
      mode: "receipt",
      reference: "2026-10-21",
      rows: parsed.rows,
    });
    assert.equal(
      Number(
        (
          await db.query<any>(
            "select count(*) as count from operation_import_rows where batch_id=$1",
            [batch.id],
          )
        ).rows[0].count,
      ),
      1035,
    );
  } finally {
    await db.close();
  }
});

test("all delivery choices are valid and WhatsApp never describes unquoted delivery as free", () => {
  for (const fulfillment of ["delivery", "express", "pickup"])
    assert.ok(
      inquirySchema.safeParse({
        key: crypto.randomUUID(),
        items: [{ id: crypto.randomUUID(), quantity: 1 }],
        fulfillment,
      }).success,
    );
  assert.equal(
    inquirySchema.safeParse({
      key: crypto.randomUUID(),
      items: [{ id: crypto.randomUUID(), quantity: 1 }],
      fulfillment: "duelist",
    }).success,
    false,
  );
  assert.match(deliveryMessage("express"), /costo adicional por confirmar/);
  assert.match(
    deliveryMessage("express", { pending: false, amountCrc: 2500 }),
    /₡2,500 de envío confirmado, incluido en el total/,
  );
  assert.match(deliveryMessage("delivery"), /no incluido/);
  assert.equal(
    new URL(whatsappUrl("texto & #")).searchParams.get("text"),
    "texto & #",
  );
  assert.match(whatsappUrl(), /50670180855/);
});
