import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { parseImport, normalizeFinish, normalize } from "./imports";
import { planMissingStock } from "./stock-intake";
import {
  collectrPriceProof,
  officialExchange,
  type ClaimedStoreItem,
} from "./collectr-automation";
import { pricingExchangeReady } from "./price-workflow";

export async function storeRpc(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
async function all(db: SupabaseClient, table: string) {
  const rows: any[] = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order("id")
      .range(page * 500, page * 500 + 499);
    if (error) throw new Error("No se pudo cargar el inventario.");
    rows.push(...(data || []));
    if ((data?.length || 0) < 500) return rows;
  }
  throw new Error("El inventario supera el límite de esta importación.");
}
export async function importCollectr(
  db: SupabaseClient,
  text: string,
  name: string,
  actor: string,
) {
  const parsed = parseImport(text, {}, "pokemon", {
    defaultLanguage: "unknown",
    sourceCurrency: "unknown",
  });
  if (
    !["portfolio name", "product name", "category", "variance"].every(
      (header) => parsed.headers.some((h) => normalize(h) === header),
    )
  )
    throw new Error("Sube el archivo CSV exportado desde Collectr.");
  const [printings, listings] = await Promise.all([
    all(db, "card_printings"),
    all(db, "listings"),
  ]);
  const plan = planMissingStock(parsed.rows, printings, listings);
  // An unnumbered source row already in stock must not re-enter merely because
  // a later export reordered rows or refreshed its market-price column.
  for (const decision of plan.decisions) {
    if (
      decision.decision !== "review" ||
      decision.row.errors.some((error) => error !== "Falta número de carta")
    )
      continue;
    const matches = listings.filter((l) => {
      const c = printings.find((c) => c.id === l.card_printing_id);
      return (
        c &&
        c.game === decision.row.game &&
        c.metadata?.original_data?.["Product Name"] ===
          decision.row.raw["Product Name"] &&
        normalize(c.metadata?.original_data?.Set || c.set_name) ===
          normalize(decision.row.setName) &&
        normalizeFinish(l.finish) === decision.row.finish &&
        normalize(l.condition).replaceAll("_", " ") ===
          normalize(decision.row.condition)
      );
    });
    if (matches.length) {
      decision.decision = "existing";
      decision.existingIds = matches.map((l) => l.id);
      decision.reason =
        "La carta ya está en el inventario; cantidad conservada.";
    }
  }
  const hash = createHash("sha256").update(text).digest("hex");
  const batch = await storeRpc(db, "begin_collectr_import", {
    p_name: name.slice(0, 120),
    p_hash: hash,
    p_actor: actor,
  });
  for (let start = 0; start < plan.decisions.length; start += 100)
    await storeRpc(db, "save_collectr_rows", {
      p_batch: batch,
      p_rows: plan.decisions.slice(start, start + 100),
    });
  let received = 0;
  for (let start = 0; start < plan.groups.length; start += 100)
    received += await storeRpc(db, "receive_collectr_groups", {
      p_batch: batch,
      p_groups: plan.groups.slice(start, start + 100),
      p_actor: actor,
    });
  return {
    batch,
    received,
    existing: plan.decisions.filter((r) => r.decision === "existing").length,
    excluded: plan.decisions.filter((r) => r.decision === "excluded").length,
    review: plan.decisions.filter((r) => r.decision === "review").length,
  };
}
export async function processStoreUpdate(db: SupabaseClient, run: string) {
  try {
    const rate = await officialExchange();
    await storeRpc(db, "refresh_store_exchange", {
      p_run: run,
      p_fx: rate.fx,
      p_at: rate.observedAt,
      p_source: rate.sourceUrl,
    });
  } catch (error) {
    const { data } = await db
      .from("operation_settings")
      .select("fx,fx_at")
      .single();
    if (!pricingExchangeReady(data || undefined))
      throw new Error(
        error instanceof Error
          ? `No se pudo actualizar el tipo de cambio: ${error.message}`
          : "No se pudo actualizar el tipo de cambio oficial.",
      );
  }
  const items = (await storeRpc(db, "claim_store_updates", {
    p_run: run,
    p_limit: 10,
  })) as ClaimedStoreItem[];
  const proofs = await Promise.all(
    items.map(async (item) => {
      try {
        return {
          id: item.id,
          token: item.lease_token,
          proof: await collectrPriceProof(item),
        };
      } catch {
        return {
          id: item.id,
          token: item.lease_token,
          proof: {
            expected: item.expected,
            reason:
              "La fuente no respondió. Reintenta esta carta; el precio actual se conserva.",
          },
        };
      }
    }),
  );
  if (proofs.length)
    await storeRpc(db, "finish_store_updates", { p_items: proofs });
  const [summary, exchange] = await Promise.all([
    storeRpc(db, "store_update_summary", { p_run: run }),
    db.from("operation_settings").select("fx,fx_at,fx_source").single(),
  ]);
  return { ...summary, exchange: exchange.data };
}
