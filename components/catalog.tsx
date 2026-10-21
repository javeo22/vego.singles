"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  MagnifyingGlass,
  ShoppingCart,
  X,
} from "@phosphor-icons/react";
import {
  displayExamples,
  formatPrice,
  stockQuantity,
  comparePrice,
  variantLabel,
  gameNames,
  type Listing,
} from "@/lib/catalog";
import ProductArt from "./product-art";
import { useShop } from "./shop-provider";
import { defaultFilters } from "@/lib/shop-state";

export default function Catalog({
  initial,
  unavailable = false,
}: {
  initial: Listing[];
  unavailable?: boolean;
}) {
  const {
    query,
    game,
    kind,
    filters,
    updateFilters,
    registerInventory,
    add,
    setCartOpen,
  } = useShop();
  const tab = kind === "sealed" ? "sealed" : "featured";
  const setTab = (value: string) =>
    updateFilters({ kind: value === "sealed" ? "sealed" : "all" });
  const [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<Listing | null>(null);
  const detail = useRef<HTMLDialogElement>(null);
  const pushedDetail = useRef(false);
  const isDisplay = initial.length === 0;
  const source = isDisplay ? displayExamples : initial;
  const active = Boolean(
    query ||
    game !== "all" ||
    kind !== "all" ||
    filters.set ||
    filters.language ||
    filters.finish,
  );
  useEffect(
    () => registerInventory(initial, unavailable),
    [initial, unavailable, registerInventory],
  );
  useEffect(() => setLimit(24), [filters]);
  useEffect(() => {
    const read = () => {
      const id = new URL(window.location.href).searchParams.get("card");
      setSelected(source.find((item) => item.id === id) || null);
      pushedDetail.current = false;
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [source]);
  const openDetail = (item: Listing) => {
    const url = new URL(window.location.href);
    url.searchParams.set("card", item.id);
    window.history.pushState(window.history.state, "", url);
    pushedDetail.current = true;
    setSelected(item);
  };
  const closeDetail = () => {
    if (!new URL(window.location.href).searchParams.has("card")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("card");
    if (pushedDetail.current) window.history.back();
    else window.history.replaceState(window.history.state, "", url);
    pushedDetail.current = false;
    setSelected(null);
  };
  const scope = source.filter(
    (item) =>
      item.card_printings &&
      (game === "all" || item.card_printings.game === game) &&
      (kind === "all" || (item.kind || "single") === kind),
  );
  const options = (field: "set" | "language" | "finish") =>
    [
      ...new Set(
        scope
          .map((item) =>
            field === "finish"
              ? variantLabel(item.finish)
              : field === "set"
                ? item.card_printings!.set_name
                : variantLabel(item.card_printings!.language),
          )
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "es"));
  const items = useMemo(
    () =>
      source
        .filter((item) => {
          const printing = item.card_printings;
          return (
            printing &&
            (game === "all" || printing.game === game) &&
            (kind === "all" || (item.kind || "single") === kind) &&
            (!filters.set || printing.set_name === filters.set) &&
            (!filters.language ||
              variantLabel(printing.language) === filters.language) &&
            (!filters.finish || variantLabel(item.finish) === filters.finish) &&
            `${printing.canonical_name} ${printing.set_name} ${printing.collector_number}`
              .toLowerCase()
              .includes(query.toLowerCase().trim())
          );
        })
        .sort((a, b) => comparePrice(a, b, filters.order === "asc")),
    [source, game, query, kind, filters],
  );
  const shown =
    filters.all || active ? items.slice(0, limit) : items.slice(0, 4);
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
        <h2 id="catalog-title">Catálogo</h2>
        <div
          className="display-tabs"
          role="tablist"
          aria-label="Colección del catálogo"
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
            Destacadas
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
            Productos sellados
          </button>
        </div>
        <label className="catalog-order">
          Precio
          <select
            value={filters.order}
            onChange={(event) => updateFilters({ order: event.target.value })}
            aria-label="Ordenar por precio"
          >
            <option value="asc">Menor a mayor</option>
            <option value="desc">Mayor a menor</option>
          </select>
        </label>
        <button
          className="view-all"
          onClick={() =>
            updateFilters({
              ...defaultFilters,
              order: filters.order,
              all: !filters.all,
            })
          }
        >
          {filters.all ? "Ver destacadas" : "Ver todo"}
          <ArrowRight size={21} />
        </button>
      </div>
      <div className="catalog-filters" aria-label="Filtros del catálogo">
        {(
          [
            ["set", "Set"],
            ["language", "Idioma"],
            ["finish", "Acabado"],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label}
            <select
              value={filters[field]}
              onChange={(event) =>
                updateFilters({ [field]: event.target.value })
              }
            >
              <option value="">
                {field === "set"
                  ? "Todos los sets"
                  : field === "language"
                    ? "Todos los idiomas"
                    : "Todos los acabados"}
              </option>
              {filters[field] && !options(field).includes(filters[field]) && (
                <option value={filters[field]}>{filters[field]}</option>
              )}
              {options(field).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {(active || filters.all) && (
        <div className="filter-summary">
          <span role="status">
            {items.length} {items.length === 1 ? "resultado" : "resultados"}
            {query && ` para “${query}”`}
            {game !== "all" && ` · ${gameNames[game]}`}
            {kind !== "all" &&
              ` · ${kind === "single" ? "Singles" : "Sellados"}`}
          </span>
          <button
            onClick={() => {
              updateFilters({ ...defaultFilters });
            }}
          >
            Limpiar filtros <X size={14} />
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
              aria-label={`Ver ${item.card_printings?.canonical_name}`}
              onClick={() => openDetail(item)}
            >
              <ProductArt item={item} />
            </button>
            <div className="product-body">
              <button className="product-name" onClick={() => openDetail(item)}>
                {item.card_printings?.canonical_name}
              </button>
              <div className="product-meta">
                <span>
                  {gameNames[item.card_printings?.game || ""] ||
                    item.card_printings?.game}
                </span>
                <span>{item.card_printings?.set_name}</span>
                <span className="product-condition">
                  {item.kind === "sealed"
                    ? "Producto sellado"
                    : variantLabel(item.condition)}
                </span>
              </div>
              {stockQuantity(item) === null && (
                <span className="stock-unconfirmed">
                  Disponibilidad por confirmar
                </span>
              )}
              <strong className="price">
                {formatPrice(item.approved_price_crc)}
              </strong>
              <button
                className="button add-button"
                disabled={stockQuantity(item) === 0}
                onClick={() => {
                  add(item);
                  if (stockQuantity(item) === null) setCartOpen(true);
                }}
              >
                <ShoppingCart size={19} weight="light" />
                {stockQuantity(item) === 0
                  ? "Agotado"
                  : stockQuantity(item) === null
                    ? "Consultar"
                    : "Agregar"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {shown.length < items.length && (filters.all || active) && (
        <div className="catalog-more">
          <p className="muted">
            Mostrando {shown.length} de {items.length}
          </p>
          <button
            className="button secondary"
            onClick={() => setLimit((value) => value + 24)}
          >
            Cargar más cartas
          </button>
        </div>
      )}
      {shown.length === 0 && (
        <div className="empty">
          <MagnifyingGlass size={35} weight="light" />
          <h3>No se encontraron cartas.</h3>
          <p>Prueba otra carta o set.</p>
          <button
            className="button secondary"
            onClick={() => {
              updateFilters({ ...defaultFilters });
            }}
          >
            Limpiar filtros
          </button>
        </div>
      )}
      {isDisplay && (
        <p className="display-disclaimer">
          {unavailable && "Inventario no disponible. "}Productos y precios de
          referencia.
        </p>
      )}
      <dialog
        ref={detail}
        className="product-dialog"
        aria-labelledby="product-detail-title"
        onCancel={closeDetail}
        onClose={() => {
          if (selected) closeDetail();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDetail();
        }}
      >
        {selected && (
          <div className="product-detail">
            <button
              className="icon-button detail-close"
              aria-label="Cerrar detalles de la carta"
              onClick={closeDetail}
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
                {selected.card_printings?.collector_number && (
                  <div>
                    <dt>Número de colección</dt>
                    <dd>{selected.card_printings.collector_number}</dd>
                  </div>
                )}
                <div>
                  <dt>Condición</dt>
                  <dd>{variantLabel(selected.condition)}</dd>
                </div>
                <div>
                  <dt>Idioma</dt>
                  <dd>{variantLabel(selected.card_printings?.language)}</dd>
                </div>
                {selected.finish && (
                  <div>
                    <dt>Acabado</dt>
                    <dd>{variantLabel(selected.finish)}</dd>
                  </div>
                )}
                {selected.treatment && selected.treatment !== "standard" && (
                  <div>
                    <dt>Edición</dt>
                    <dd>{variantLabel(selected.treatment)}</dd>
                  </div>
                )}
              </dl>
              <strong className="detail-price">
                {formatPrice(selected.approved_price_crc)}
              </strong>
              <button
                className="button"
                disabled={stockQuantity(selected) === 0}
                onClick={() => {
                  add(selected);
                  if (stockQuantity(selected) === null) setCartOpen(true);
                  closeDetail();
                }}
              >
                <ShoppingCart size={20} />
                {stockQuantity(selected) === 0
                  ? "Agotado"
                  : stockQuantity(selected) === null
                    ? "Consultar"
                    : "Agregar"}
              </button>
              <p className="small-note">
                {selected.sample
                  ? "Precio de referencia. Confirma disponibilidad."
                  : "Agregar al carrito no reserva esta carta."}
              </p>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
