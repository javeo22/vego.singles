import Catalog from "@/components/catalog";
import HomeShowcase from "@/components/home-showcase";
import { createClient } from "@/lib/supabase/server";
import { readStorefront } from "@/lib/operations/storefront";
import { type Listing } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export default async function Home() {
  let listings: Listing[] = [],
    unavailable = false;
  try {
    ({ listings, unavailable } = await readStorefront(await createClient()));
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
