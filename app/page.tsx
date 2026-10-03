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
          <h1 id="hero-title" aria-label="Tu próxima carta está aquí.">
            Tu próxima
            <br />
            <span>carta está</span>
            <br />
            aquí.
          </h1>
          <p>
            Pokémon y Magic en inglés, español, japonés y chino. Consulta
            disponibilidad y completa tu compra por WhatsApp.
          </p>
          <a className="button hero-button" href="#catalogo">
            Ver catálogo <ArrowRight size={24} weight="light" />
          </a>
        </div>
        <div className="hero-art">
          <img
            src="/images/reference-display.jpg"
            alt="Cartas de Charizard, Sol Ring y Stitch junto a cajas de Pokémon, Lorcana y Star Wars"
            className="hero-reference-image"
          />
        </div>
      </section>
      <Catalog initial={listings} unavailable={unavailable} />
    </main>
  );
}
