import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  adminClient,
  assertSameOrigin,
  body,
  databaseError,
  OperationError,
} from "@/lib/operations/server";
import {
  commandSchema,
  importSchema,
  runJobSchema,
} from "@/lib/operations/validation";
import { parseImport } from "@/lib/operations/imports";
import { runNextJob } from "@/lib/operations/jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const tables: Record<string, string> = {
  imports: "operation_import_rows",
  batches: "operation_import_batches",
  proposals: "price_proposals",
  evidence: "market_prices",
  requests: "purchase_requests",
  items: "purchase_request_items",
  lots: "stock_lots",
  events: "inventory_events",
  jobs: "operations_jobs",
  settings: "operation_settings",
  locations: "locations",
  activity: "activity_log",
};
function fail(e: unknown) {
  if (e instanceof OperationError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError)
    return NextResponse.json(
      { error: e.issues[0]?.message || "Revisa los datos" },
      { status: 400 },
    );
  return NextResponse.json(
    { error: "No se pudo completar la operación" },
    { status: 502 },
  );
}
export async function GET(request: Request) {
  try {
    const { db, role, user } = await adminClient();
    const p = new URL(request.url).searchParams;
    const page = Math.max(0, Math.min(100000, Number(p.get("page")) || 0));
    const type = p.get("type") || "inventory";
    if (type === "inventory") {
      const { data, error } = await db.rpc("search_operations_inventory", {
        p_search: (p.get("q") || "").slice(0, 200),
        p_status: p.get("status") || "all",
        p_stock: p.get("stock") || "all",
        p_page: page,
      });
      if (error) databaseError(error);
      return NextResponse.json({ ...data, role });
    }
    if (type === "team") {
      const { data, error } = await db.rpc("admin_team");
      if (error) databaseError(error);
      return NextResponse.json({ ...data, currentEmail: user.email });
    }
    if (type === "counts") {
      const { data, error } = await db.rpc("operation_counts");
      if (error) databaseError(error);
      return NextResponse.json(data);
    }
    const table = tables[type];
    if (!table) throw new OperationError("Consulta inválida");
    let query = db
      .from(table)
      .select(
        type === "proposals"
          ? "*,listings(condition,finish,card_printings(canonical_name,set_name))"
          : "*",
        { count: "exact" },
      );
    if (p.get("id")) {
      const key =
        type === "imports"
          ? "batch_id"
          : type === "items"
            ? "purchase_request_id"
            : ["lots", "events", "evidence", "proposals"].includes(type)
              ? "listing_id"
              : "id";
      query = query.eq(key, p.get("id"));
    }
    if (
      p.get("status") &&
      ![
        "settings",
        "locations",
        "events",
        "evidence",
        "lots",
        "activity",
      ].includes(type)
    )
      query = query.eq("status", p.get("status"));
    if (type === "proposals")
      query = query.order("suggested_price_crc", { ascending: false });
    query = query
      .order(
        type === "locations"
          ? "code"
          : type === "settings"
            ? "id"
            : "created_at",
        { ascending: type === "locations" },
      )
      .range(page * 50, page * 50 + 49);
    // operation_import_rows has no created_at: sort by source row number instead.
    if (type === "imports")
      query = db
        .from(table)
        .select("*", { count: "exact" })
        .eq("batch_id", p.get("id") || "00000000-0000-0000-0000-000000000000")
        .order("row_number")
        .range(page * 50, page * 50 + 49);
    const { data, error, count } = await query;
    if (error) databaseError(error);
    return NextResponse.json({ rows: data, total: count, page, role });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, role } = await adminClient();
    const raw = await body(request);
    if (raw.action === "run_job") {
      runJobSchema.parse(raw);
      if (role === "stock")
        throw new OperationError(
          "Un revisor debe procesar las coincidencias",
          403,
        );
      return NextResponse.json(await runNextJob(db));
    }
    let action: string, payload: unknown, key: string;
    if (raw.action === "stage_import" || raw.action === "preview_import") {
      const input = importSchema.parse({ ...raw, action: "stage_import" });
      const parsed = parseImport(input.text, input.mapping, input.defaultGame);
      if (raw.action === "preview_import")
        return NextResponse.json({
          headers: parsed.headers,
          rows: parsed.rows,
          total: parsed.rows.length,
        });
      action = input.action;
      payload = {
        name: input.name,
        hash: parsed.hash,
        mode: input.mode,
        reference: input.reference,
        rows: parsed.rows,
      };
      key = input.key;
    } else {
      const input = commandSchema.parse(raw);
      action = input.action;
      payload = input.payload;
      key = input.key;
    }
    const { data, error } = await db.rpc("admin_command", {
      p_action: action,
      p_payload: payload,
      p_key: key,
    });
    if (error) databaseError(error);
    revalidatePath("/");
    return NextResponse.json(data);
  } catch (e) {
    return fail(e);
  }
}
