import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Catalog from "@/components/catalog";
import { createClient } from "@/lib/supabase/server";
import type { Listing } from "@/lib/catalog";
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
    listings = ((data || []) as Listing[]).sort((a, b) =>
      (a.card_printings?.canonical_name || "").localeCompare(
        b.card_printings?.canonical_name || "",
      ),
    );
  } catch {
    unavailable = true;
  }
  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">
            Your next
            <br />
            <span>great pull</span>
            <br />
            starts here.
          </h1>
          <p>Singles worth chasing. Sealed ready to crack.</p>
          <a className="button hero-button" href="#catalogo">
            Browse the shop <ArrowRight size={24} weight="light" />
          </a>
        </div>
        <div className="hero-art">
          <img
            src="/images/reference-display.jpg"
            alt="Charizard, Sol Ring, and Stitch cards displayed alongside Pokémon, Lorcana, and Star Wars booster boxes"
            className="hero-reference-image"
          />
        </div>
      </section>
      <Catalog initial={listings} unavailable={unavailable} />
    </main>
  );
}
