"use client";
import { useRef, useState } from "react";
import type { InventoryRecord } from "@/lib/operations/types";
import type {
  MarketReference,
  PriceCheck,
} from "@/lib/operations/price-verification";
import { date } from "./shared";
export function PriceCheckResults({
  report,
  onUse,
}: {
  report: PriceCheck;
  onUse?: (r: MarketReference, report: PriceCheck) => void;
}) {
  return (
    <div className="ops-panel">
      <h3>
        {report.status === "reference_available"
          ? "Referencia disponible para revisar"
          : report.status === "needs_review"
            ? "Necesita revisión"
            : "Sin cobertura comparable"}
      </h3>
      <p>
        {report.independentMarkets} mercados con datos fechados vigentes ·
        Consultado {date(report.checkedAt)}
      </p>
      {report.references.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Mercado / feed</th>
                <th>Referencia</th>
                <th>Actualización</th>
                <th>Revisión</th>
              </tr>
            </thead>
            <tbody>
              {report.references.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.marketplace}
                    <small>
                      {r.feed} · {r.finish}
                    </small>
                  </td>
                  <td>
                    {r.currency} {r.amount.toFixed(2)}
                    <small>Agregado de mercado</small>
                  </td>
                  <td>
                    {r.providerUpdatedAt
                      ? date(r.providerUpdatedAt)
                      : "Fecha no publicada"}
                    <small>
                      {r.timestampBasis === "feed_published" &&
                        "Publicación del feed · "}
                      {
                        {
                          fresh: "Vigente",
                          stale: "Vencida",
                          invalid: "Fecha inválida",
                          unknown: "Vigencia sin acreditar",
                        }[r.freshness || "unknown"]
                      }
                    </small>
                  </td>
                  <td>
                    <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                      Abrir fuente
                    </a>
                    {onUse && r.id === report.recommendedId && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => onUse(r, report)}
                      >
                        Usar referencia
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!report.warnings.length && (
        <ul>
          {report.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {!!report.failures.length && (
        <details>
          <summary>Cobertura de fuentes</summary>
          {report.failures.map((f) => (
            <p key={f.feed}>
              {f.feed}: {f.message}
            </p>
          ))}
        </details>
      )}
      <p className="small-note">
        La consulta no cambia precios. El revisor confirma la variante y aprueba
        la propuesta.
      </p>
    </div>
  );
}
export function PriceCheckPanel({
  listing,
  disabled,
  onUse,
}: {
  listing: InventoryRecord;
  disabled?: boolean;
  onUse: (r: MarketReference, report: PriceCheck) => void;
}) {
  const [report, setReport] = useState<PriceCheck | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const key = useRef<string | null>(null);
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      key.current ||= crypto.randomUUID();
      const response = await fetch("/api/admin/price-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: listing.listing_id, key: key.current }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo verificar el precio");
      setReport(data.report);
      key.current = null;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo verificar el precio",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section aria-label="Verificar precio">
      <button
        type="button"
        className="button secondary"
        disabled={disabled || pending}
        onClick={check}
      >
        {pending ? "Consultando fuentes…" : "Verificar precio con fuentes"}
      </button>
      {error && <p role="alert">{error}</p>}
      {report && <PriceCheckResults report={report} onUse={onUse} />}
    </section>
  );
}
