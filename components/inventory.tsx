"use client";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  DownloadSimple,
  ImageSquare,
  MagnifyingGlass,
  SquaresFour,
  Stack,
  Storefront,
  X,
} from "@phosphor-icons/react";
import { formatPrice, variantLabel } from "@/lib/catalog";
import { Brand } from "./site-header";

export type InventoryRow = {
  listing_id: string;
  canonical_name: string;
  set_name: string;
  collector_number: string;
  language: string;
  condition: string;
  finish: string;
  published: boolean;
  approved_price_crc: number;
  quantity: number;
  market_price_usd: number | null;
};
export default function Inventory({
  rows,
  counts,
  unavailable,
}: {
  rows: InventoryRow[];
  counts: { listings: number; drafts: number; proposals: number };
  unavailable: boolean;
}) {
  const [section, setSection] = useState("inventory");
  const [query, setQuery] = useState("");
  const [stock, setStock] = useState("all");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          `${row.canonical_name} ${row.set_name} ${row.collector_number} ${row.listing_id}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()) &&
          (stock === "all" ||
            (stock === "in" ? row.quantity > 0 : row.quantity <= 0)) &&
          (status === "all" || row.published === (status === "published")),
      ),
    [rows, query, stock, status],
  );
  const exportCSV = () => {
    const escape = (value: unknown) => {
      const text = String(value ?? "");
      // Prevent spreadsheet formulas in externally supplied inventory names.
      return `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
    };
    const headers = [
      "ID del listado",
      "Carta",
      "Set",
      "Número",
      "Condición",
      "Idioma",
      "Acabado",
      "Cantidad",
      "Precio CRC",
      "Publicado",
    ];
    const lines = filtered.map((row) =>
      [
        row.listing_id,
        row.canonical_name,
        row.set_name,
        row.collector_number,
        row.condition,
        row.language,
        row.finish,
        row.quantity,
        row.approved_price_crc,
        row.published,
      ]
        .map(escape)
        .join(","),
    );
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + headers.join(",") + "\n" + lines.join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "vego-inventory.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main id="main-content" className="admin-workspace">
      <header className="admin-header">
        <div className="wide admin-header-main">
          <Brand />
          <a href="/" className="storefront-link">
            <Storefront size={19} />
            Ver tienda <ArrowUpRight size={15} />
          </a>
        </div>
        <nav className="wide admin-nav" aria-label="Administración">
          <button
            aria-current={section === "overview" ? "page" : undefined}
            onClick={() => setSection("overview")}
          >
            <SquaresFour size={18} />
            Resumen
          </button>
          <button
            aria-current={section === "inventory" ? "page" : undefined}
            onClick={() => setSection("inventory")}
          >
            <Stack size={18} />
            Inventario
          </button>
        </nav>
      </header>
      <div className="admin-breadcrumb">
        <div className="wide">
          <span>vego.singles / Admin</span>
          <span className="workspace-badge">Administración</span>
        </div>
      </div>
      <div className="wide admin-content">
        <div className="inventory-heading">
          <div>
            <span className="eyebrow">
              {section === "inventory" ? "Cada copia cuenta" : "Resumen"}
            </span>
            <h1>{section === "inventory" ? "Inventario." : "Resumen."}</h1>
            <p className="muted">
              {section === "inventory"
                ? "Cada condición, idioma y acabado es una variante."
                : "Resumen del inventario."}
            </p>
          </div>
          {section === "inventory" && (
            <button
              className="button secondary"
              disabled={!filtered.length}
              onClick={exportCSV}
            >
              <DownloadSimple size={19} />
              Exportar CSV
            </button>
          )}
        </div>
        {unavailable && (
          <div className="inventory-alert" role="alert">
            No se pudo cargar el inventario. Intenta de nuevo.
          </div>
        )}
        {section === "overview" ? (
          <>
            <div className="stats">
              <div className="stat">
                <span>Listados</span>
                <strong>{counts.listings}</strong>
              </div>
              <div className="stat">
                <span>Borradores</span>
                <strong>{counts.drafts}</strong>
              </div>
              <div className="stat">
                <span>Precios pendientes</span>
                <strong>{counts.proposals}</strong>
              </div>
            </div>
            <div className="overview-note">
              <button
                className="button"
                onClick={() => setSection("inventory")}
              >
                Revisar inventario <ArrowUpRight size={18} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="inventory-filters">
              <label className="inventory-search">
                <MagnifyingGlass size={23} weight="light" />
                <input
                  aria-label="Buscar en el inventario por carta o ID"
                  placeholder="Buscar por carta o ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="Limpiar búsqueda"
                    onClick={() => setQuery("")}
                  >
                    <X size={17} />
                  </button>
                )}
              </label>
              <label className="filter-field">
                Estado
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">Todos los listados</option>
                  <option value="published">Publicado</option>
                  <option value="draft">Borradores</option>
                </select>
              </label>
              <label className="filter-field">
                Existencias
                <select
                  value={stock}
                  onChange={(event) => setStock(event.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="in">Disponible</option>
                  <option value="out">Agotado</option>
                </select>
              </label>
            </div>
            <div className="table-caption">
              <span>
                {filtered.length}{" "}
                {filtered.length === 1 ? "variante" : "variantes"}
              </span>
              <span>Hasta 100 registros de inventario</span>
            </div>
            <div
              className="tablewrap"
              tabIndex={0}
              role="region"
              aria-label="Inventario; desplaza horizontalmente para ver más columnas"
            >
              <table>
                <thead>
                  <tr>
                    <th>Carta / Listado</th>
                    <th>Variante</th>
                    <th>Existencias</th>
                    <th>Precio</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.listing_id}>
                      <td>
                        <div className="inventory-product">
                          <div className="inventory-thumbnail">
                            <ImageSquare size={22} weight="light" />
                          </div>
                          <div>
                            <strong>{row.canonical_name}</strong>
                            <span>{row.set_name}</span>
                            <small>
                              {row.collector_number ||
                                row.listing_id.slice(0, 8)}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="variant-cell">
                          {variantLabel(row.condition)}
                          <span>
                            {variantLabel(row.language)} ·{" "}
                            {variantLabel(row.finish)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`stock-badge ${row.quantity <= 0 ? "stock-empty" : ""}`}
                        >
                          {row.quantity}
                        </span>
                      </td>
                      <td>
                        <strong>{formatPrice(row.approved_price_crc)}</strong>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${row.published ? "published" : "draft"}`}
                        >
                          {row.published ? "Publicado" : "Borrador"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="empty">
                  <Stack size={36} weight="light" />
                  <h3>
                    {rows.length
                      ? "No se encontraron cartas."
                      : "No hay inventario para mostrar."}
                  </h3>
                  <p>
                    {rows.length
                      ? "Prueba otra búsqueda o filtro."
                      : unavailable
                        ? "Revisa la conexión e intenta de nuevo."
                        : "El inventario aparecerá aquí al agregarlo."}
                  </p>
                  {rows.length > 0 && (
                    <button
                      className="button secondary"
                      onClick={() => {
                        setQuery("");
                        setStock("all");
                        setStatus("all");
                      }}
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
