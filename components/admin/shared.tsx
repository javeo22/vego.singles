"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatPrice, variantLabel } from "@/lib/catalog";
import type { InventoryRecord } from "@/lib/operations/types";
export const money = (value: number | null | undefined) =>
  value == null ? "Por confirmar" : formatPrice(Number(value));
export const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("es-CR") : "—";
export const statusLabel = (s: string) =>
  (
    ({
      pending: "Pendiente",
      running: "Procesando",
      needs_review: "Por revisar",
      ready: "Lista",
      invalid: "Datos inválidos",
      committed: "Incorporada",
      skipped: "Omitida",
      succeeded: "Completado",
      failed: "Error",
      inquiry: "Consulta",
      reserved: "Reservada",
      sold: "Vendida",
      fulfilled: "Entregada",
      cancelled: "Cancelada",
      approved: "Aprobada",
      rejected: "Rechazada",
      superseded: "Reemplazada",
    }) as Record<string, string>
  )[s] || s;
export type List<T = any> = { rows: T[]; total: number; page: number };
export async function post(
  action: string,
  payload: unknown,
  key = crypto.randomUUID(),
) {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload, key }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "No se pudo guardar");
  return data;
}
export function useData<T>(query: string, revision: number) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      fetch(`/api/admin?${query}`, { signal: controller.signal })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "No se pudo cargar");
          setData(d);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, revision]);
  return { data, error, loading };
}
export function Feedback({
  error,
  loading,
}: {
  error: string;
  loading: boolean;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="muted">
          Cargando…
        </p>
      )}
    </>
  );
}
export function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (n: number) => void;
}) {
  return (
    <div className="ops-pager">
      <span>
        {total} registros · página {page + 1}
      </span>
      <button
        className="button secondary"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        Anterior
      </button>
      <button
        className="button secondary"
        disabled={(page + 1) * 50 >= total}
        onClick={() => onPage(page + 1)}
      >
        Siguiente
      </button>
    </div>
  );
}
export function Field({
  label,
  name,
  type = "text",
  value,
  required = false,
  disabled = false,
  children,
  step,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label className="ops-field">
      {label}
      {children ? (
        <select
          name={name}
          defaultValue={value}
          required={required}
          disabled={disabled}
        >
          {children}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value}
          required={required}
          disabled={disabled}
          step={step}
          min={min}
          max={max}
        />
      )}
    </label>
  );
}
export function ActionForm({
  action,
  payload,
  onDone,
  children,
  label = "Guardar",
  disabled = false,
}: {
  action: string;
  payload: (d: FormData) => unknown;
  onDone: (message: string) => void;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(false);
  const intent = useRef<{ key: string; json: string } | null>(null);
  return (
    <form
      className="ops-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (active.current) return;
        active.current = true;
        setBusy(true);
        setError("");
        try {
          const p = payload(new FormData(e.currentTarget));
          const json = JSON.stringify(p);
          if (intent.current?.json !== json)
            intent.current = { json, key: crypto.randomUUID() };
          const d = await post(action, p, intent.current!.key);
          intent.current = null;
          onDone(d.message || "Guardado");
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo guardar");
        } finally {
          active.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy || disabled}>{children}</fieldset>
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
      <button className="button" disabled={busy || disabled}>
        {busy ? "Guardando…" : label}
      </button>
    </form>
  );
}
export function ListingPicker({
  onSelect,
  revision,
  label = "Buscar carta o ID",
}: {
  onSelect: (r: InventoryRecord) => void;
  revision: number;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const r = useData<List<InventoryRecord>>(
    `type=inventory&q=${encodeURIComponent(query)}`,
    revision,
  );
  return (
    <div className="ops-picker">
      <label className="ops-field">
        {label}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre, set o número"
        />
      </label>
      <Feedback {...r} />
      <div className="ops-picker-results">
        {r.data?.rows.slice(0, 20).map((l) => (
          <button
            key={l.listing_id}
            className="ops-pick"
            onClick={() => onSelect(l)}
          >
            {l.stock_image_url && <img src={l.stock_image_url} alt="" />}
            <span>
              <strong>{l.canonical_name}</strong>
              <small>
                {l.set_name} · {l.collector_number} · {variantLabel(l.language)}{" "}
                · {variantLabel(l.condition)} · {l.finish}
              </small>
            </span>
            <b>{money(l.approved_price_crc)}</b>
          </button>
        ))}
      </div>
      {!r.loading && !r.error && r.data?.rows.length === 0 && (
        <p className="ops-empty">
          No hay cartas que coincidan con esta búsqueda.
        </p>
      )}
    </div>
  );
}
export function CsvExport({
  query,
  disabled = false,
}: {
  query: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className="button secondary"
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            let page = 0,
              total = 1;
            const rows: InventoryRecord[] = [];
            while (rows.length < total) {
              const r = await fetch(
                `/api/admin?type=inventory&${query}&page=${page++}`,
              );
              const d = await r.json();
              if (!r.ok) throw new Error(d.error);
              total = d.total;
              rows.push(...d.rows);
              if (!d.rows.length) break;
            }
            const escape = (v: unknown) => {
              const s = String(v ?? "");
              return `"${(/^[=+\-@\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`;
            };
            const headers = [
              "ID",
              "Carta",
              "Set",
              "Número",
              "Idioma",
              "Condición",
              "Acabado",
              "Stock físico",
              "Disponible",
              "Precio CRC",
              "Publicado",
            ];
            const csv =
              "\uFEFF" +
              [
                headers.join(","),
                ...rows.map((l) =>
                  [
                    l.listing_id,
                    l.canonical_name,
                    l.set_name,
                    l.collector_number,
                    l.language,
                    l.condition,
                    l.finish,
                    l.quantity,
                    l.available_quantity,
                    l.approved_price_crc,
                    l.published,
                  ]
                    .map(escape)
                    .join(","),
                ),
              ].join("\n");
            const url = URL.createObjectURL(
              new Blob([csv], { type: "text/csv;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "vego-inventario.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo exportar");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Exportando…" : "Exportar resultados CSV"}
      </button>
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
    </>
  );
}
