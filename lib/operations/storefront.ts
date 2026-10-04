import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStockQuantity, type Listing } from "@/lib/catalog";
export function normalizePublicListing(row: Record<string, unknown>): Listing {
  // Legacy production exposes a boolean `available`. It is never a copy count.
  const quantity = parseStockQuantity(row.quantity);
  return {
    ...row,
    quantity: quantity !== null ? quantity : row.available === false ? 0 : null,
  } as Listing;
}
export async function readStorefront(db: SupabaseClient) {
  let source = "storefront_inventory";
  const rows: Listing[] = [];
  let page = 0;
  while (true) {
    const result = await db
      .from(source)
      .select("*")
      .order("approved_price_crc", { ascending: false })
      .order("id")
      .range(page * 500, page * 500 + 499)
      .abortSignal(AbortSignal.timeout(8000));
    if (result.error) {
      if (
        page === 0 &&
        source === "storefront_inventory" &&
        ["42P01", "PGRST205", "PGRST204"].includes(result.error.code)
      ) {
        source = "public_listings";
        continue;
      }
      return { listings: rows, unavailable: true };
    }
    rows.push(...(result.data || []).map(normalizePublicListing));
    if ((result.data?.length || 0) < 500) break;
    page++;
  }
  return { listings: rows, unavailable: false };
}
