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
  languageLabel,
  gameNames,
  type Listing,
} from "@/lib/catalog";
import ProductArt from "./product-art";
import { useShop } from "./shop-provider";
import { defaultFilters } from "@/lib/shop-state";
const productTypes = [
  ["all", "Todos"],
  ["single", "Singles"],
  ["sealed", "Sellados"],
] as const;

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
    selectedProductId,
    openProduct,
    closeProduct: closeDetail,
    registerInventory,
    add,
    setCartOpen,
  } = useShop();
  const [limit, setLimit] = useState(24);
  const detail = useRef<HTMLDialogElement>(null);
  const isDisplay = initial.length === 0;
  const source = isDisplay ? displayExamples : initial;
  const selected = source.find((item) => item.id === selectedProductId) || null;
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
  const searchScope = source.filter(
    (item) =>
      item.card_printings &&
      (kind === "all" || (item.kind || "single") === kind) &&
      `${item.card_printings.canonical_name} ${item.card_printings.set_name} ${item.card_printings.collector_number}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const scope = searchScope.filter(
    (item) => game === "all" || item.card_printings?.game === game,
  );
  const options = (field: "set" | "language" | "finish") =>
    [
      ...new Set(
        scope
          .filter(
            (item) =>
              (field === "set" ||
                !filters.set ||
                item.card_printings!.set_name === filters.set) &&
              (field === "language" ||
                !filters.language ||
                variantLabel(item.card_printings!.language) ===
                  filters.language) &&
              (field === "finish" ||
                !filters.finish ||
                variantLabel(item.finish) === filters.finish),
          )
          .map((item) =>
            field === "finish"
              ? item.kind === "sealed"
                ? ""
                : variantLabel(item.finish)
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
          aria-label="Tipo de producto"
        >
          {productTypes.map(([value, label], index) => (
            <button
              key={value}
              id={`${value}-tab`}
              role="tab"
              aria-selected={kind === value}
              aria-controls="display-products"
              tabIndex={kind === value ? 0 : -1}
              onClick={() => updateFilters({ kind: value })}
              onKeyDown={(event) => {
                if (["ArrowRight", "ArrowLeft"].includes(event.key)) {
                  event.preventDefault();
                  const next =
                    productTypes[
                      (index +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        productTypes.length) %
                        productTypes.length
                    ][0];
                  updateFilters({ kind: next });
                  document.getElementById(`${next}-tab`)?.focus();
                }
              }}
            >
              {label}
            </button>
          ))}
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
        {!active && !filters.all && (
          <button
            className="view-all"
            onClick={() => updateFilters({ all: true })}
          >
            Ver todo
            <ArrowRight size={21} />
          </button>
        )}
      </div>
      <div
        className="catalog-filters"
        data-kind={kind}
        aria-label="Filtros del catálogo"
      >
        <label>
          TCG
          <select
            value={game}
            onChange={(event) =>
              updateFilters({ game: event.target.value, all: true })
            }
          >
            <option value="all">Todos los TCG</option>
            {Object.entries(gameNames).map(([value, label]) => {
              const count = searchScope.filter(
                (item) => item.card_printings?.game === value,
              ).length;
              return (
                <option value={value} key={value} disabled={!count}>
                  {label} ({count})
                </option>
              );
            })}
          </select>
        </label>
        {(
          [
            ["set", "Set"],
            ["language", "Idioma"],
            ["finish", "Acabado"],
          ] as const
        )
          .filter(([field]) => kind !== "sealed" || field !== "finish")
          .map(([field, label]) => (
            <label key={field}>
              {label}
              <select
                value={filters[field]}
                disabled={field === "set" && game === "all" && !filters.set}
                onChange={(event) =>
                  updateFilters({ [field]: event.target.value })
                }
              >
                <option value="">
                  {field === "set"
                    ? game === "all"
                      ? "Selecciona un TCG"
                      : "Todos los sets"
                    : field === "language"
                      ? "Todos los idiomas"
                      : "Todos los acabados"}
                </option>
                {filters[field] && !options(field).includes(filters[field]) && (
                  <option value={filters[field]}>{filters[field]}</option>
                )}
                {(field === "set" && game === "all" && !filters.set
                  ? []
                  : options(field)
                ).map((value) => (
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
        aria-labelledby={`${kind}-tab`}
      >
        {shown.map((item) => (
          <article
            className="product"
            data-kind={item.kind || "single"}
            key={item.id}
          >
            <button
              className="product-art-button"
              aria-label={`Ver ${item.card_printings?.canonical_name}`}
              onClick={() => openProduct(item.id)}
            >
              <ProductArt item={item} />
            </button>
            <div className="product-body">
              <button
                className="product-name"
                onClick={() => openProduct(item.id)}
              >
                {item.card_printings?.canonical_name}
              </button>
              <div className="product-meta">
                <span>
                  {gameNames[item.card_printings?.game || ""] ||
                    item.card_printings?.game}
                </span>
                <span>{item.card_printings?.set_name}</span>
                {item.card_printings?.collector_number && (
                  <span>#{item.card_printings.collector_number}</span>
                )}
                <span className="product-condition">
                  {item.kind === "sealed"
                    ? "Producto sellado"
                    : `${variantLabel(item.condition)}${item.finish ? ` · ${variantLabel(item.finish)}` : ""}`}
                </span>
              </div>
              {languageLabel(item.card_printings?.language) !== "Inglés" && (
                <span className="product-language-pending">
                  {languageLabel(item.card_printings?.language)}
                </span>
              )}
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
              <ProductArt item={selected} detail />
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
                  <dd>{languageLabel(selected.card_printings?.language)}</dd>
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
