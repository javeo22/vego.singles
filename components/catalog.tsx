"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  MagnifyingGlass,
  ShoppingCart,
  X,
} from "@phosphor-icons/react";
import {
  displayExamples,
  formatPrice,
  gameNames,
  type Listing,
} from "@/lib/catalog";
import ProductArt from "./product-art";
import { useShop } from "./shop-provider";

export default function Catalog({
  initial,
  unavailable = false,
}: {
  initial: Listing[];
  unavailable?: boolean;
}) {
  const { query, setQuery, game, setGame, kind, setKind, add } = useShop();
  const [tab, setTab] = useState("featured");
  const [viewAll, setViewAll] = useState(false);
  const [selected, setSelected] = useState<Listing | null>(null);
  const detail = useRef<HTMLDialogElement>(null);
  const isDisplay = initial.length === 0;
  const source = isDisplay ? displayExamples : initial;
  const items = useMemo(
    () =>
      source.filter((item) => {
        const printing = item.card_printings;
        return (
          printing &&
          (game === "all" || printing.game === game) &&
          (kind === "all" || (item.kind || "single") === kind) &&
          (tab !== "sealed" || item.kind === "sealed") &&
          `${printing.canonical_name} ${printing.set_name} ${printing.collector_number}`
            .toLowerCase()
            .includes(query.toLowerCase().trim())
        );
      }),
    [source, game, query, kind, tab],
  );
  const shown =
    viewAll || query || game !== "all" || kind !== "all"
      ? items
      : items.slice(0, 4);
  useEffect(() => {
    if (selected && !detail.current?.open) detail.current?.showModal();
    if (!selected && detail.current?.open) detail.current?.close();
  }, [selected]);
  return (
    <section
      className="catalog-section wide"
      id="catalogo"
      aria-labelledby="catalog-title"
    >
      <div className="section-heading">
        <h2 id="catalog-title">In the display</h2>
        <div
          className="display-tabs"
          role="tablist"
          aria-label="Display collection"
        >
          <button
            id="featured-tab"
            role="tab"
            aria-selected={tab === "featured"}
            aria-controls="display-products"
            tabIndex={tab === "featured" ? 0 : -1}
            onClick={() => setTab("featured")}
            onKeyDown={(event) => {
              if (["ArrowRight", "ArrowLeft"].includes(event.key)) {
                setTab("sealed");
                document.getElementById("sealed-tab")?.focus();
              }
            }}
          >
            Featured picks
          </button>
          <button
            id="sealed-tab"
            role="tab"
            aria-selected={tab === "sealed"}
            aria-controls="display-products"
            tabIndex={tab === "sealed" ? 0 : -1}
            onClick={() => setTab("sealed")}
            onKeyDown={(event) => {
              if (["ArrowRight", "ArrowLeft"].includes(event.key)) {
                setTab("featured");
                document.getElementById("featured-tab")?.focus();
              }
            }}
          >
            Sealed favorites
          </button>
        </div>
        <button
          className="view-all"
          onClick={() => setViewAll((value) => !value)}
        >
          {viewAll ? "Show featured" : "View all"}
          <ArrowRight size={21} />
        </button>
      </div>
      {(query || game !== "all" || kind !== "all") && (
        <div className="filter-summary">
          <span>
            {items.length} {items.length === 1 ? "result" : "results"}
            {query && ` for “${query}”`}
            {game !== "all" && ` · ${gameNames[game]}`}
            {kind !== "all" && ` · ${kind === "single" ? "Singles" : "Sealed"}`}
          </span>
          <button
            onClick={() => {
              setQuery("");
              setGame("all");
              setKind("all");
              setTab("featured");
            }}
          >
            Clear filters <X size={14} />
          </button>
        </div>
      )}
      <div
        className="product-grid"
        id="display-products"
        role="tabpanel"
        aria-labelledby={tab === "featured" ? "featured-tab" : "sealed-tab"}
      >
        {shown.map((item) => (
          <article className="product" key={item.id}>
            <button
              className="product-art-button"
              aria-label={`View ${item.card_printings?.canonical_name}`}
              onClick={() => setSelected(item)}
            >
              <ProductArt item={item} />
            </button>
            <div className="product-body">
              <button
                className="product-name"
                onClick={() => setSelected(item)}
              >
                {item.card_printings?.canonical_name}
              </button>
              <div className="product-meta">
                <span>
                  {gameNames[item.card_printings?.game || ""] ||
                    item.card_printings?.game}
                </span>
                <span>{item.card_printings?.set_name}</span>
                <span className="product-condition">
                  {item.kind === "sealed" ? "Sealed Product" : item.condition}
                </span>
              </div>
              <strong className="price">
                {formatPrice(item.approved_price_crc)}
              </strong>
              <button
                className="button add-button"
                disabled={item.quantity <= 0}
                onClick={() => add(item)}
              >
                <ShoppingCart size={19} weight="light" />
                {item.quantity > 0 ? "Add to cart" : "Out of stock"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {shown.length === 0 && (
        <div className="empty">
          <MagnifyingGlass size={35} weight="light" />
          <h3>No cards found.</h3>
          <p>Try another card, set, or game.</p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setGame("all");
              setKind("all");
              setTab("featured");
            }}
          >
            Reset filters
          </button>
        </div>
      )}
      {isDisplay && (
        <p className="display-disclaimer">
          {unavailable
            ? "Live inventory is temporarily unavailable."
            : "New inventory is on the way."}{" "}
          These are display examples with reference prices. Ask us about
          availability.
        </p>
      )}
      <div className="shop-note">
        <span>Every card has a story. Find your next one.</span>
        <a href="https://wa.me/50671141906" target="_blank" rel="noreferrer">
          Looking for something specific? <ArrowUpRight size={17} />
        </a>
      </div>
      <dialog
        ref={detail}
        className="product-dialog"
        aria-labelledby="product-detail-title"
        onCancel={() => setSelected(null)}
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}
      >
        {selected && (
          <div className="product-detail">
            <button
              className="icon-button detail-close"
              aria-label="Close product details"
              onClick={() => setSelected(null)}
            >
              <X size={23} />
            </button>
            <div className="detail-art">
              <ProductArt item={selected} />
            </div>
            <div>
              <span className="eyebrow">
                {gameNames[selected.card_printings?.game || ""]}
              </span>
              <h2 id="product-detail-title">
                {selected.card_printings?.canonical_name}
              </h2>
              <p className="muted">{selected.card_printings?.set_name}</p>
              <dl className="variant-details">
                <div>
                  <dt>Condition</dt>
                  <dd>{selected.condition}</dd>
                </div>
                <div>
                  <dt>Language</dt>
                  <dd>{selected.card_printings?.language}</dd>
                </div>
                {selected.finish && (
                  <div>
                    <dt>Finish</dt>
                    <dd>{selected.finish}</dd>
                  </div>
                )}
              </dl>
              <strong className="detail-price">
                {formatPrice(selected.approved_price_crc)}
              </strong>
              <button
                className="button"
                disabled={selected.quantity <= 0}
                onClick={() => {
                  add(selected);
                  setSelected(null);
                }}
              >
                <ShoppingCart size={20} />
                Add to cart
              </button>
              <p className="small-note">
                {selected.sample
                  ? "Display example. Please confirm availability and price."
                  : "Availability is confirmed on WhatsApp. Adding to your cart doesn't reserve this card."}
              </p>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
