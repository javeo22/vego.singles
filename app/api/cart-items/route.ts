import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { readCartInventory } from "@/lib/operations/storefront";

export async function GET(request: Request) {
  const parsed = z
    .array(z.string().uuid())
    .min(1)
    .max(30)
    .safeParse(new URL(request.url).searchParams.get("ids")?.split(","));
  if (!parsed.success)
    return NextResponse.json({ error: "Selección inválida" }, { status: 400 });
  try {
    const listings = await readCartInventory(await createClient(), [
      ...new Set(parsed.data),
    ]);
    return NextResponse.json(
      { listings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo actualizar el carrito" },
      { status: 503 },
    );
  }
}
