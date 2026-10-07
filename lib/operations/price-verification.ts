import { createHash } from "node:crypto";
import { normalizeLanguage } from "./imports";

export type PricePrinting = {
  listing_id?: string;
  card_printing_id?: string;
  game: string;
  language: string;
  canonical_name?: string;
  set_name?: string;
  collector_number?: string;
  catalog_source: string | null;
  external_card_id: string | null;
  tcgplayer_product_id: string | null;
  identity_verified?: boolean;
  treatment?: string;
  kind?: string;
  condition?: string;
  finish?: string;
  approved_price_crc?: number;
};
export type MarketReference = {
  id: string;
  amount: number;
  currency: "USD" | "EUR";
  marketplace: "tcgplayer" | "cardmarket";
  feed: string;
  sourceUrl: string;
  providerUpdatedAt: string | null;
  timestampBasis?: "market_updated" | "feed_published";
  checkedAt: string;
  productId: string;
  finish: string;
  conditionCoverage: "market_aggregate";
  freshness?: "fresh" | "stale" | "unknown" | "invalid";
};
export type SourceFailure = { feed: string; message: string };
export type PriceCheck = {
  version: 1;
  checkedAt: string;
  fingerprint: string;
  jobId?: string;
  variantSnapshot: ReturnType<typeof priceVariantSnapshot>;
  status: "reference_available" | "needs_review" | "unavailable";
  references: MarketReference[];
  failures: SourceFailure[];
  warnings: string[];
  independentMarkets: number;
  recommendedId: string | null;
  maxAgeHours: number;
  manualReviewRequired: true;
};
export function priceVariantSnapshot(p: PricePrinting) {
  return {
    listingId: p.listing_id || null,
    printingId: p.card_printing_id || null,
    game: p.game,
    name: p.canonical_name || null,
    set: p.set_name || null,
    number: p.collector_number || null,
    language: normalizeLanguage(p.language),
    condition: p.condition || null,
    finish: p.finish || null,
    treatment: p.treatment || "standard",
    kind: p.kind || "single",
    provider: p.catalog_source || null,
    externalId: p.external_card_id || null,
    tcgplayerId: p.tcgplayer_product_id || null,
    identityVerified: p.identity_verified === true,
  };
}
export function priceFingerprint(p: PricePrinting) {
  return createHash("sha256")
    .update(JSON.stringify(priceVariantSnapshot(p)))
    .digest("hex");
}
export function assessPriceReferences(
  printing: PricePrinting,
  input: MarketReference[],
  failures: SourceFailure[] = [],
  maxAgeHours = 72,
  now = new Date(),
): PriceCheck {
  maxAgeHours = Number.isFinite(maxAgeHours)
    ? Math.max(1, Math.min(720, maxAgeHours))
    : 72;
  const checkedAt = now.toISOString();
  const warnings: string[] = [];
  const seen = new Set<string>();
  const references = input
    .filter((r) => {
      const valid =
        Number.isFinite(r.amount) &&
        r.amount > 0 &&
        ["USD", "EUR"].includes(r.currency) &&
        /^https:\/\//.test(r.sourceUrl) &&
        !seen.has(r.id);
      if (valid) seen.add(r.id);
      return valid;
    })
    .map((r): MarketReference => {
      const time = r.providerUpdatedAt ? Date.parse(r.providerUpdatedAt) : NaN;
      const age = (now.getTime() - time) / 3600000;
      const freshness = !r.providerUpdatedAt
        ? "unknown"
        : !Number.isFinite(age) || age < -1
          ? "invalid"
          : age > maxAgeHours
            ? "stale"
            : "fresh";
      return { ...r, freshness };
    });
  const eligible = references.filter((r) => r.freshness === "fresh");
  const usd = eligible
    .filter((r) => r.currency === "USD")
    .sort(
      (a, b) =>
        Date.parse(b.providerUpdatedAt!) - Date.parse(a.providerUpdatedAt!),
    );
  const independentMarkets = new Set(eligible.map((r) => r.marketplace)).size;
  if (!printing.identity_verified)
    warnings.push(
      "La identidad física todavía necesita confirmación en Inventario.",
    );
  if (references.some((r) => r.freshness === "unknown"))
    warnings.push(
      "Hay feeds sin fecha de actualización: la fecha de consulta no acredita la vigencia del precio.",
    );
  if (references.some((r) => r.timestampBasis === "feed_published"))
    warnings.push(
      "TCGCSV acredita cuándo publicó el archivo de precios; no publica la fecha de cada venta ni datos por condición.",
    );
  if (references.some((r) => ["stale", "invalid"].includes(r.freshness!)))
    warnings.push("Se excluyeron referencias vencidas o con fecha inválida.");
  if (
    ["tcgplayer", "cardmarket"].some(
      (market) =>
        new Set(
          eligible.filter((r) => r.marketplace === market).map((r) => r.feed),
        ).size > 1,
    )
  )
    warnings.push(
      "Varios feeds repiten el mismo mercado; no cuentan como confirmaciones independientes.",
    );
  let disagreement = false;
  for (const currency of ["USD", "EUR"] as const) {
    const amounts = eligible
      .filter((r) => r.currency === currency)
      .map((r) => r.amount);
    if (
      amounts.length > 1 &&
      Math.max(...amounts) / Math.min(...amounts) > 1.15
    )
      disagreement = true;
  }
  if (disagreement)
    warnings.push(
      "Las referencias en la misma moneda difieren más de 15%. Revisa la impresión, la fecha y el mercado antes de elegir.",
    );
  if (eligible.some((r) => r.currency === "EUR"))
    warnings.push(
      "Cardmarket se muestra en EUR. No se promedian ni convierten monedas sin un tipo de cambio EUR/USD verificado.",
    );
  if (references.length)
    warnings.push(
      "Son referencias agregadas de mercado, no una cotización de tu condición ni una garantía de venta. Confirma acabado y condición; el volumen de ventas no está disponible.",
    );
  if ((printing.approved_price_crc || 0) >= 50000)
    warnings.push(
      "Carta de alto valor: contrasta también ventas comparables de la misma variante antes de aprobar.",
    );
  const metadataComplete =
    !!printing.canonical_name &&
    !!printing.set_name &&
    (!!printing.collector_number || printing.kind === "sealed");
  if (!metadataComplete)
    warnings.push(
      "Faltan datos de impresión para contrastar el identificador del proveedor.",
    );
  const usable =
    printing.identity_verified &&
    metadataComplete &&
    usd.length > 0 &&
    !disagreement;
  return {
    version: 1,
    checkedAt,
    fingerprint: priceFingerprint(printing),
    variantSnapshot: priceVariantSnapshot(printing),
    status: usable
      ? "reference_available"
      : references.length
        ? "needs_review"
        : "unavailable",
    references,
    failures,
    warnings,
    independentMarkets,
    recommendedId: usable ? usd[0].id : null,
    maxAgeHours,
    manualReviewRequired: true,
  };
}
