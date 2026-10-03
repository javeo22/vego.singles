"use client";
import { ArrowRight } from "@phosphor-icons/react";
import {
  comparePrice,
  displayExamples,
  formatPrice,
  stockQuantity,
  type Listing,
} from "@/lib/catalog";
import ProductArt from "./product-art";
import { useShop } from "./shop-provider";

export default function HomeShowcase({ initial }: { initial: Listing[] }) {
  const { query, setQuery, game, kind } = useShop();
  const isDisplay = initial.length === 0;
  const source = (isDisplay ? displayExamples : initial).filter(
    (item) => item.card_printings,
  );
  const singles = source.filter((item) => item.kind !== "sealed");
  const collection = singles.length ? singles : source;
  const available = collection.filter((item) => stockQuantity(item) !== 0);
  const cards = (available.length ? available : collection)
    .slice()
    .sort((a, b) => comparePrice(a, b, false))
    .slice(0, 3);
  if (query.trim() || game !== "all" || kind !== "all" || !cards.length)
    return null;
  return (
    <section className="home-display" aria-labelledby="home-display-title">
      <div className="wide">
        <header className="home-display-heading">
          <h2 id="home-display-title">En vitrina</h2>
          <a href="#catalogo">
            Ver catálogo <ArrowRight size={20} />
          </a>
        </header>
        <div className="showcase-grid">
          {cards.map((item, index) => (
            <article
              className={`showcase-card ${index === 0 ? "showcase-featured" : ""}`}
              key={item.id}
            >
              <button
                className="showcase-art"
                aria-label={`Ver ${item.card_printings?.canonical_name} en el catálogo`}
                onClick={() => setQuery(item.card_printings!.canonical_name)}
              >
                <ProductArt item={item} />
              </button>
              <div className="showcase-card-info">
                <div>
                  <button
                    className="showcase-name"
                    onClick={() =>
                      setQuery(item.card_printings!.canonical_name)
                    }
                  >
                    {item.card_printings?.canonical_name}
                  </button>
                  <span>{item.card_printings?.set_name}</span>
                  {stockQuantity(item) === 0 && (
                    <span className="showcase-stock">Agotado</span>
                  )}
                </div>
                <strong>{formatPrice(item.approved_price_crc)}</strong>
              </div>
            </article>
          ))}
        </div>
        {isDisplay && (
          <p className="showcase-disclaimer">
            Productos y precios de referencia.
          </p>
        )}
      </div>
    </section>
  );
}
