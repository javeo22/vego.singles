import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  adminClient,
  assertSameOrigin,
  body,
  OperationError,
  serviceClient,
} from "@/lib/operations/server";
import {
  importCollectr,
  processStoreUpdate,
  storeRpc,
} from "@/lib/operations/store-update";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const id = z.string().uuid();
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("prices"),
      key: id,
      reviewOnly: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("import"),
      key: id,
      name: z.string().min(1).max(120),
      text: z.string().min(1),
    })
    .strict(),
  z.object({ action: z.literal("process"), id }).strict(),
  z.object({ action: z.literal("accept"), id }).strict(),
  z
    .object({
      action: z.literal("review"),
      id,
      expected: z.record(z.unknown()),
      price: z.number().int().min(1).max(100000000).nullable(),
      source: z
        .string()
        .max(1000)
        .url()
        .refine((v) => v.startsWith("https://"))
        .or(z.literal("")),
      note: z.string().max(500),
    })
    .strict(),
]);
function fail(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof z.ZodError
          ? "Revisa el archivo o la selección."
          : error instanceof Error
            ? error.message
            : "No se pudo actualizar la tienda.",
    },
    { status: error instanceof OperationError ? error.status : 400 },
  );
}
export async function GET(request: Request) {
  try {
    const { db } = await adminClient();
    const params = new URL(request.url).searchParams;
    if (params.get("queue") === "1") {
      const listing = params.get("listing");
      if (listing) id.parse(listing);
      return NextResponse.json(
        await storeRpc(db, "store_review_queue", { p_listing: listing }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const run = params.get("run");
    if (run) id.parse(run);
    const summary = await storeRpc(db, "store_update_summary", { p_run: run });
    const { data: settings } = await db
      .from("operation_settings")
      .select("fx,fx_at,fx_source")
      .single();
    return NextResponse.json(
      { ...summary, exchange: settings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { role, user } = await adminClient();
    if (role === "stock")
      throw new OperationError(
        "Un propietario o revisor puede actualizar precios.",
        403,
      );
    const input = schema.parse(await body(request));
    const db = serviceClient(
      "La actualización automática necesita la clave de servidor.",
    );
    if (input.action === "process") {
      const summary = await processStoreUpdate(db, input.id);
      revalidatePath("/");
      return NextResponse.json(summary);
    }
    if (input.action === "review") {
      const outcome = await storeRpc(db, "resolve_store_review", {
        p_item: input.id,
        p_expected: input.expected,
        p_price: input.price,
        p_source: input.source,
        p_note: input.note,
        p_actor: user.id,
      });
      revalidatePath("/");
      return NextResponse.json(outcome);
    }
    if (input.action === "accept") {
      const outcome = await storeRpc(db, "finish_store_update", {
        p_item: input.id,
        p_token: null,
        p_proof: null,
        p_force: true,
        p_actor: user.id,
      });
      revalidatePath("/");
      return NextResponse.json({
        ...outcome,
        message: outcome.published
          ? "Precio aceptado y publicado."
          : outcome.reason,
      });
    }
    let receipt;
    if (input.action === "import") {
      if (role !== "owner")
        throw new OperationError(
          "Un propietario puede importar stock y publicarlo.",
          403,
        );
      receipt = await importCollectr(db, input.text, input.name, user.id);
    }
    const run = await storeRpc(db, "start_store_update", {
      p_mode:
        input.action === "import"
          ? "import"
          : input.reviewOnly
            ? "review"
            : "prices",
      p_batch: receipt?.batch || null,
      p_actor: user.id,
      p_key: input.key,
    });
    return NextResponse.json({
      ...(await storeRpc(db, "store_update_summary", { p_run: run })),
      receipt,
    });
  } catch (error) {
    return fail(error);
  }
}
