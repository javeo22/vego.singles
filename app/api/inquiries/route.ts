import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  body,
  databaseError,
  OperationError,
  serviceClient,
} from "@/lib/operations/server";
import { inquirySchema } from "@/lib/operations/validation";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = inquirySchema.parse(await body(request));
    const db = serviceClient();
    const ip = (request.headers.get("x-forwarded-for") || "unknown")
      .split(",")[0]
      .trim();
    const fingerprint = createHash("sha256")
      .update(`${ip}|${request.headers.get("user-agent") || "unknown"}`)
      .digest("hex");
    const { data, error } = await db.rpc("create_purchase_inquiry", {
      p_items: input.items,
      p_fulfillment: input.fulfillment,
      p_note: input.note,
      p_key: input.key,
      p_fingerprint: fingerprint,
    });
    if (error) databaseError(error);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof OperationError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "Revisa las cartas y cantidades" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "No se pudo registrar la solicitud" },
      { status: 502 },
    );
  }
}
