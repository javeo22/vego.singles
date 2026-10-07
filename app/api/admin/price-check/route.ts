import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminClient,
  assertSameOrigin,
  body,
  databaseError,
  OperationError,
  serviceClient,
} from "@/lib/operations/server";
import { checkMarketPrice } from "@/lib/operations/market-sources";
import {
  priceFingerprint,
  assessPriceReferences,
  type PriceCheck,
} from "@/lib/operations/price-verification";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const inputSchema = z
  .object({ id: z.string().uuid(), key: z.string().uuid() })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, user, role } = await adminClient();
    if (role === "stock")
      throw new OperationError(
        "Un propietario o revisor debe consultar precios",
        403,
      );
    const input = inputSchema.parse(await body(request));
    const [inventory, settings] = await Promise.all([
      db
        .from("operations_inventory")
        .select("*")
        .eq("listing_id", input.id)
        .single(),
      db.from("operation_settings").select("policy,daily_job_limit").single(),
    ]);
    if (inventory.error) databaseError(inventory.error);
    if (settings.error) databaseError(settings.error);
    const p = inventory.data;
    if (p.archived_at)
      throw new OperationError("El listado está archivado", 409);
    const fingerprint = priceFingerprint(p);
    // Cached reports remain evidence snapshots: reassess dates under the current policy.
    const cached = await db
      .from("operation_jobs")
      .select("id,result,created_at")
      .eq("kind", "refresh_price")
      .eq("entity_id", input.id)
      .in("status", ["needs_review", "succeeded"])
      .gte("created_at", new Date(Date.now() - 15 * 60000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached.error) databaseError(cached.error);
    const prior = cached.data?.result?.verification as PriceCheck | undefined;
    if (
      prior?.version === 1 &&
      prior.fingerprint === fingerprint &&
      prior.references.length
    ) {
      return NextResponse.json({
        report: {
          ...assessPriceReferences(
            p,
            prior.references,
            prior.failures,
            settings.data.policy.maxAgeHours,
          ),
          checkedAt: prior.checkedAt,
          jobId: cached.data!.id,
        },
        cached: true,
      });
    }
    const service = serviceClient(
      "Falta la clave de servidor para guardar la verificación de precios",
    );
    const previous = await service
      .from("operation_jobs")
      .select("entity_id,result")
      .eq("id", input.key)
      .maybeSingle();
    if (previous.error) databaseError(previous.error);
    if (previous.data) {
      const previousReport = previous.data.result?.verification as
        PriceCheck | undefined;
      if (
        previous.data.entity_id !== input.id ||
        previous.data.result?.actor !== user.id ||
        previousReport?.fingerprint !== fingerprint
      )
        throw new OperationError(
          "La consulta cambió. Vuelve a seleccionar la carta.",
          409,
        );
      return NextResponse.json({
        report: {
          ...assessPriceReferences(
            p,
            previousReport.references,
            previousReport.failures,
            settings.data.policy.maxAgeHours,
          ),
          checkedAt: previousReport.checkedAt,
          jobId: input.key,
        },
        cached: true,
      });
    }
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const daily = await service
      .from("operation_jobs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfDay.toISOString());
    if (daily.error) databaseError(daily.error);
    if ((daily.count || 0) >= settings.data.daily_job_limit)
      throw new OperationError(
        "Se alcanzó el límite diario de consultas. Ajusta el límite en Ajustes o vuelve mañana.",
        429,
      );
    const report = {
      ...(await checkMarketPrice(
        p,
        p.condition,
        p.finish,
        fetch,
        settings.data.policy.maxAgeHours,
      )),
      jobId: input.key,
    };
    const latest = await db
      .from("operations_inventory")
      .select("*")
      .eq("listing_id", input.id)
      .single();
    if (latest.error) databaseError(latest.error);
    if (priceFingerprint(latest.data) !== fingerprint)
      throw new OperationError(
        "La impresión cambió durante la consulta. Revisa y consulta de nuevo.",
        409,
      );
    const { error } = await service.from("operation_jobs").insert({
      id: input.key,
      kind: "refresh_price",
      entity_id: input.id,
      status: "needs_review",
      result: {
        verification: report,
        actor: user.id,
        message: "Verificación de precio guardada; requiere revisión.",
      },
    });
    if (error) databaseError(error);
    return NextResponse.json({ report, cached: false });
  } catch (error) {
    if (error instanceof OperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Revisa la carta seleccionada" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "No se pudo consultar el precio; no se cambió ningún listado" },
      { status: 502 },
    );
  }
}
