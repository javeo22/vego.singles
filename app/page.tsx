import Catalog from "@/components/catalog";
import HomeShowcase from "@/components/home-showcase";
import { createClient } from "@/lib/supabase/server";
import {
  stockQuantity,
  parseStockQuantity,
  comparePrice,
  type Listing,
} from "@/lib/catalog";
export const dynamic = "force-dynamic";
export default async function Home() {
  let listings: Listing[] = [];
  let unavailable = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("public_listings")
      .select("*")
      .abortSignal(AbortSignal.timeout(8000));
    unavailable = Boolean(error);
    listings = (data || []) as Listing[];
    const missingStock = listings.filter(
      (item) => stockQuantity(item) === null || stockQuantity(item) === 0,
    );
    if (missingStock.length) {
      const { data: lots, error: stockError } = await supabase
        .from("stock_lots")
        .select("listing_id,quantity")
        .in(
          "listing_id",
          missingStock.map((item) => item.id),
        )
        .abortSignal(AbortSignal.timeout(8000));
      if (!stockError && lots) {
        const totals = new Map<string, number>();
        for (const lot of lots) {
          const count = parseStockQuantity(lot.quantity);
          if (count !== null)
            totals.set(
              lot.listing_id,
              (totals.get(lot.listing_id) || 0) + count,
            );
        }
        listings = listings.map((item) =>
          totals.has(item.id)
            ? { ...item, quantity: totals.get(item.id)! }
            : item,
        );
      }
    }
    listings.sort((a, b) => comparePrice(a, b, false));
  } catch {
    unavailable = true;
  }
  return (
    <main id="main-content">
      <h1 className="sr-only">Vego Singles</h1>
      <HomeShowcase initial={listings} />
      <Catalog initial={listings} unavailable={unavailable} />
    </main>
  );
}
