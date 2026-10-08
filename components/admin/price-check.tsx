"use client";
import { useRef, useState } from "react";
import { variantLabel } from "@/lib/catalog";
import type { InventoryRecord } from "@/lib/operations/types";
import type {
  MarketReference,
  PriceCheck,
} from "@/lib/operations/price-verification";

export const marketName = (value: string) =>
  (
    ({ tcgplayer: "TCGplayer", cardmarket: "Cardmarket" }) as Record<
      string,
      string
    >
  )[value] || value;
export const serviceName = (value: string) =>
  (
    ({
      tcgcsv: "TCGCSV",
      tcgdex: "TCGdex",
      scryfall: "Scryfall",
      pokemontcg: "Pokémon TCG API",
      "tcgplayer-direct": "TCGplayer",
    }) as Record<string, string>
  )[value] || value;
export const referencePrice = (
  r: Pick<MarketReference, "amount" | "currency">,
) =>
  `${r.currency} ${new Intl.NumberFormat("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.amount)}`;
export const priceDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("es-CR", {
        timeZone: "America/Costa_Rica",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Fecha no publicada";

function guidance(report: PriceCheck) {
  const p = report.variantSnapshot;
  if (p?.identityVerified === false)
    return {
      title: "Primero confirma la carta",
      text: "Puedes ver los precios encontrados. Para calcular, confirma set, número, idioma y acabado en Inventario.",
      inventory: true,
    };
  if (p && (!p.name || !p.set || (!p.number && p.kind !== "sealed")))
    return {
      title: "Completa los datos de la carta",
      text: "Faltan datos para comprobar que el precio corresponde a esta impresión.",
      inventory: true,
    };
  if (report.recommendedId && report.status === "reference_available")
    return {
      title: "Precio listo para calcular",
      text: "Usa este precio de mercado para calcular una propuesta en colones. La tienda cambia de precio solo cuando la apruebas.",
    };
  if (
    p &&
    (p.language !== "en" ||
      p.treatment !== "standard" ||
      (p.kind === "sealed"
        ? p.condition !== "Sealed Product"
        : p.condition !== "Near Mint"))
  )
    return {
      title: "Esta variante necesita un precio manual",
      text: "Busca una venta o cotización con el mismo idioma, condición y tratamiento. No usamos el precio de otra variante.",
    };
  const fresh = report.references.filter((r) => r.freshness === "fresh");
  if (
    ["USD", "EUR"].some((currency) => {
      const amounts = fresh
        .filter((r) => r.currency === currency)
        .map((r) => r.amount);
      return (
        amounts.length > 1 && Math.max(...amounts) / Math.min(...amounts) > 1.15
      );
    })
  )
    return {
      title: "Los precios no coinciden",
      text: "Hay una diferencia mayor al 15%. Revisa las fuentes o registra un precio manual antes de continuar.",
    };
  if (fresh.length && !fresh.some((r) => r.currency === "USD"))
    return {
      title: "Encontramos un precio solo en euros",
      text: "Se muestra como comparación. Para calcular en colones, registra una referencia en USD o CRC; no convertimos EUR sin un cambio verificado.",
    };
  return report.references.length
    ? {
        title: "No hay un precio vigente para usar",
        text: "Las fuentes no publican una fecha válida o sus precios vencieron. Consulta de nuevo o registra una referencia manual con fecha comprobada.",
      }
    : {
        title: "No encontramos un precio comparable",
        text: "Consulta de nuevo o ingresa una venta o cotización de la misma variante.",
      };
}

export function PriceCheckResults({
  report,
  onUse,
  onManual,
}: {
  report: PriceCheck;
  onUse?: (r: MarketReference, report: PriceCheck) => void;
  onManual?: () => void;
}) {
  const next = guidance(report);
  const recommended = report.references.find(
    (r) => r.id === report.recommendedId,
  );
  const canUse =
    report.status === "reference_available" &&
    recommended?.freshness === "fresh" &&
    report.variantSnapshot?.identityVerified !== false;
  const main =
    recommended ||
    report.references.find(
      (r) => r.currency === "USD" && r.freshness === "fresh",
    ) ||
    report.references.find((r) => r.currency === "USD") ||
    report.references.find((r) => r.freshness === "fresh") ||
    report.references[0];
  return (
    <div className="price-results" aria-label="Resultado de la consulta">
      <div
        className="price-result-summary"
        data-ready={canUse}
        role="status"
        aria-live="polite"
      >
        <div>
          <span className="price-eyebrow">
            {canUse
              ? "Siguiente paso: calcular en colones"
              : "Siguiente paso: revisar"}
          </span>
          <h3>{next.title}</h3>
          <p>{next.text}</p>
        </div>
        {main && (
          <div className="price-market-value">
            <span>{canUse ? "Precio de referencia" : "Precio encontrado"}</span>
            <strong>{referencePrice(main)}</strong>
            <span>
              {marketName(main.marketplace)} · {variantLabel(main.finish)}
            </span>
            <small>Precio de mercado; no es tu precio de venta.</small>
          </div>
        )}
      </div>
      <div className="price-next-action">
        {next.inventory && report.variantSnapshot?.listingId && (
          <a
            className="button"
            href={`/admin/inventario?listing=${encodeURIComponent(report.variantSnapshot.listingId)}`}
          >
            Confirmar carta en Inventario
          </a>
        )}
        {onUse && canUse && recommended && (
          <button
            type="button"
            className="button"
            onClick={() => onUse(recommended, report)}
          >
            Continuar con este precio
          </button>
        )}
        {onManual && !next.inventory && (
          <button type="button" className="button secondary" onClick={onManual}>
            Ingresar un precio manual
          </button>
        )}
      </div>
      <details className="price-source-details">
        <summary>Ver precios y fuentes ({report.references.length})</summary>
        <p>
          <strong>TCGplayer</strong> es el mercado de referencia. TCGCSV, TCGdex
          y Scryfall son servicios que obtienen precios de ese mercado, no
          mercados distintos. <strong>Cardmarket</strong> es otro mercado, en
          euros.
        </p>
        {!!report.references.length && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Mercado</th>
                  <th>Precio encontrado</th>
                  <th>Fecha y vigencia</th>
                  <th>Enlace</th>
                </tr>
              </thead>
              <tbody>
                {report.references.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {marketName(r.marketplace)}
                      <small>Consultado mediante {serviceName(r.feed)}</small>
                      <small>{variantLabel(r.finish)}</small>
                    </td>
                    <td>{referencePrice(r)}</td>
                    <td>
                      {priceDate(r.providerUpdatedAt)}
                      <small>
                        {!r.providerUpdatedAt
                          ? "La fuente no informa cuándo actualizó este precio"
                          : r.timestampBasis === "feed_published"
                            ? "Fecha de publicación del archivo"
                            : "Fecha del precio publicada por la fuente"}
                      </small>
                      <span className="price-state" data-state={r.freshness}>
                        {
                          (
                            {
                              fresh: "Vigente",
                              stale: "Precio vencido",
                              invalid: "Fecha inválida",
                              unknown:
                                "No podemos confirmar si está actualizado",
                            } as Record<string, string>
                          )[r.freshness || "unknown"]
                        }
                      </span>
                    </td>
                    <td>
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                        Abrir fuente
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!report.references.length && (
          <p>No se obtuvo una referencia comparable.</p>
        )}
        <p>
          {report.independentMarkets}{" "}
          {report.independentMarkets === 1
            ? "mercado con fecha vigente"
            : "mercados con fecha vigente"}{" "}
          · Consulta: {priceDate(report.checkedAt)}.
        </p>
        {!!report.warnings.length && (
          <ul>
            {report.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {!!report.failures.length && (
          <div className="price-source-failures">
            <h4>Fuentes que necesitan revisión</h4>
            {report.failures.map((f) => (
              <p key={f.feed}>
                <strong>{serviceName(f.feed)}:</strong> {f.message}
              </p>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}

export function PriceCheckPanel({
  listing,
  disabled,
  onUse,
  onManual,
  allowUse = true,
}: {
  listing: InventoryRecord;
  disabled?: boolean;
  onUse: (r: MarketReference, report: PriceCheck) => void;
  onManual?: () => void;
  allowUse?: boolean;
}) {
  const [report, setReport] = useState<PriceCheck | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const busy = useRef(false),
    key = useRef<string | null>(null);
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setReport(null);
    try {
      key.current ||= crypto.randomUUID();
      const response = await fetch("/api/admin/price-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: listing.listing_id, key: key.current }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo consultar el precio");
      setReport(data.report);
      key.current = null;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo consultar el precio",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section aria-label="Consultar precio de mercado" aria-busy={pending}>
      <button
        type="button"
        className={report ? "button secondary" : "button"}
        disabled={disabled || pending}
        onClick={check}
      >
        {pending
          ? "Buscando precios…"
          : report
            ? "Consultar de nuevo"
            : "Consultar precio de mercado"}
      </button>
      {pending && (
        <p role="status">
          Comprobando la carta, el acabado y las fechas de los precios.
        </p>
      )}
      {error && (
        <p role="alert" className="ops-error">
          {error} Puedes volver a intentar la consulta.
        </p>
      )}
      {report && (
        <PriceCheckResults
          report={report}
          onUse={allowUse ? onUse : undefined}
          onManual={onManual}
        />
      )}
    </section>
  );
}
