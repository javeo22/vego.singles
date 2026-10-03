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
import { formatPrice } from "@/lib/catalog";
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
      "Listing ID",
      "Card",
      "Set",
      "Number",
      "Condition",
      "Language",
      "Finish",
      "Quantity",
      "Price CRC",
      "Published",
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
            View storefront <ArrowUpRight size={15} />
          </a>
        </div>
        <nav className="wide admin-nav" aria-label="Admin workspace">
          <button
            aria-current={section === "overview" ? "page" : undefined}
            onClick={() => setSection("overview")}
          >
            <SquaresFour size={18} />
            Overview
          </button>
          <button
            aria-current={section === "inventory" ? "page" : undefined}
            onClick={() => setSection("inventory")}
          >
            <Stack size={18} />
            Inventory
          </button>
        </nav>
      </header>
      <div className="admin-breadcrumb">
        <div className="wide">
          <span>vego.singles / Admin</span>
          <span className="workspace-badge">Inventory workspace</span>
        </div>
      </div>
      <div className="wide admin-content">
        <div className="inventory-heading">
          <div>
            <span className="eyebrow">
              {section === "inventory" ? "Every copy counts" : "Overview"}
            </span>
            <h1>{section === "inventory" ? "Inventory." : "Overview."}</h1>
            <p className="muted">
              {section === "inventory"
                ? "Each condition, language, and finish is its own variant."
                : "Your inventory at a glance."}
            </p>
          </div>
          {section === "inventory" && (
            <button
              className="button secondary"
              disabled={!filtered.length}
              onClick={exportCSV}
            >
              <DownloadSimple size={19} />
              Export CSV
            </button>
          )}
        </div>
        {unavailable && (
          <div className="inventory-alert" role="alert">
            Inventory couldn't be loaded. Please try again before making
            changes.
          </div>
        )}
        {section === "overview" ? (
          <>
            <div className="stats">
              <div className="stat">
                <span>Total listings</span>
                <strong>{counts.listings}</strong>
              </div>
              <div className="stat">
                <span>Unpublished drafts</span>
                <strong>{counts.drafts}</strong>
              </div>
              <div className="stat">
                <span>Pending prices</span>
                <strong>{counts.proposals}</strong>
              </div>
            </div>
            <div className="overview-note">
              <button
                className="button"
                onClick={() => setSection("inventory")}
              >
                Review inventory <ArrowUpRight size={18} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="inventory-filters">
              <label className="inventory-search">
                <MagnifyingGlass size={23} weight="light" />
                <input
                  aria-label="Search inventory by product or listing ID"
                  placeholder="Search by product or listing ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="Clear inventory search"
                    onClick={() => setQuery("")}
                  >
                    <X size={17} />
                  </button>
                )}
              </label>
              <label className="filter-field">
                Status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">All listings</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                </select>
              </label>
              <label className="filter-field">
                Stock
                <select
                  value={stock}
                  onChange={(event) => setStock(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="in">In stock</option>
                  <option value="out">Out of stock</option>
                </select>
              </label>
            </div>
            <div className="table-caption">
              <span>
                {filtered.length}{" "}
                {filtered.length === 1 ? "variant" : "variants"}
              </span>
              <span>Showing up to 100 inventory records</span>
            </div>
            <div
              className="tablewrap"
              tabIndex={0}
              role="region"
              aria-label="Inventory table, scroll horizontally for more columns"
            >
              <table>
                <thead>
                  <tr>
                    <th>Product / Listing</th>
                    <th>Variant</th>
                    <th>Stock</th>
                    <th>Price</th>
                    <th>Status</th>
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
                          {row.condition}
                          <span>
                            {row.language} · {row.finish}
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
                          {row.published ? "Published" : "Draft"}
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
                      ? "No matching inventory."
                      : "No inventory to display."}
                  </h3>
                  <p>
                    {rows.length
                      ? "Try another search or filter."
                      : unavailable
                        ? "Check the database connection and retry."
                        : "Your inventory will appear here once added."}
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
                      Clear filters
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
