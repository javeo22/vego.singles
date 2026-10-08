import type { InventoryRecord } from "./types";
import type { MarketReference } from "./price-verification";

export function pricingCardSnapshot(card: InventoryRecord) {
  return {
    listingId: card.listing_id,
    printingId: card.card_printing_id,
    game: card.game,
    name: card.canonical_name,
    set: card.set_name,
    number: card.collector_number,
    language: card.language,
    condition: card.condition,
    finish: card.finish,
    kind: card.kind || "single",
    treatment: card.treatment || "standard",
  };
}
export function missingPricingCardFields(card: InventoryRecord) {
  return [
    !card.canonical_name?.trim() && "nombre",
    !card.set_name?.trim() && "set",
    card.kind !== "sealed" && !card.collector_number?.trim() && "número",
    (!card.language || card.language === "unknown") && "idioma",
    (!card.condition || card.condition === "unknown") && "condición",
    (!card.finish?.trim() || card.finish.toLowerCase() === "unknown") &&
      "acabado",
  ].filter((value): value is string => typeof value === "string");
}
export type PriceReadiness = {
  code: string;
  canApprove: boolean;
  message: string;
  action: "none" | "edit" | "refresh" | "confirm" | "inventory" | "exchange";
  expiresAt: string | null;
  minimumPriceCrc: number | null;
  currentPriceCrc: number;
  checkedAt: string;
};
export type PriceUpdate = {
  id: string;
  listing_id: string;
  status: string;
  current_price_crc: number;
  suggested_price_crc: number;
  created_at: string;
  reviewed_at?: string;
  review_reason?: string;
  readiness: PriceReadiness;
  calculation: {
    marketTargetCrc?: number;
    floorCrc?: number;
    fx?: number;
    fxAt?: string;
    sourceUrl?: string;
    warnings?: string[];
    priceCheck?: { reference?: MarketReference; warnings?: string[] };
    priceDecision?: { calculatedPriceCrc: number; finalPriceCrc: number };
  };
  listings: {
    condition: string;
    finish: string;
    card_printings: {
      canonical_name: string;
      set_name: string;
      collector_number: string;
      language: string;
      stock_image_url?: string;
    };
  };
};
export function pricingExchangeReady(
  settings: { fx?: number | null; fx_at?: string | null } | undefined,
  now = Date.now(),
) {
  const age = (now - Date.parse(settings?.fx_at || "")) / 3600000;
  return (
    !!settings?.fx &&
    settings.fx > 0 &&
    Number.isFinite(age) &&
    age >= -1 &&
    age <= 168
  );
}
