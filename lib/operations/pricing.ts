import { z } from "zod";

export const policySchema = z
  .object({
    marketFactor: z.number().min(0.5).max(2).default(1),
    targetMargin: z.number().min(0).max(0.8).default(0.2),
    variableFee: z.number().min(0).max(0.3).default(0),
    handlingCrc: z.number().int().min(0).max(10000).default(0),
    fixedFeeCrc: z.number().int().min(0).max(10000).default(0),
    maxAgeHours: z.number().int().min(1).max(720).default(72),
  })
  .refine(
    (p) => p.targetMargin + p.variableFee < 1,
    "Margen y comisión inválidos",
  );
export type PricingPolicy = z.infer<typeof policySchema>;
export const defaultPolicy: PricingPolicy = policySchema.parse({});
export type PriceInput = {
  amount: number;
  currency: "USD" | "CRC";
  fx?: number | null;
  fxAt?: string | null;
  observedAt: string;
  acquisitionCostCrc: number | null;
  currentPriceCrc: number;
  identityVerified: boolean;
  exactVariant: boolean;
  policy?: PricingPolicy;
};
export function calculatePrice(input: PriceInput, now = new Date()) {
  const policy = policySchema.parse(input.policy || defaultPolicy);
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    throw new Error("Precio de referencia inválido");
  if (!input.identityVerified || !input.exactVariant)
    throw new Error("Confirma la identidad y variante antes de calcular");
  const age = (now.getTime() - Date.parse(input.observedAt)) / 3600000;
  if (!Number.isFinite(age) || age < -1 || age > policy.maxAgeHours)
    throw new Error("Referencia vencida o fecha inválida");
  if (input.currency === "USD") {
    const fxAge = (now.getTime() - Date.parse(input.fxAt || "")) / 3600000;
    if (
      !input.fx ||
      !Number.isFinite(input.fx) ||
      input.fx <= 0 ||
      !Number.isFinite(fxAge) ||
      fxAge < -1 ||
      fxAge > 168
    )
      throw new Error("Actualiza el tipo de cambio (máximo 7 días)");
  }
  const converted = input.amount * (input.currency === "USD" ? input.fx! : 1);
  const marketTarget = converted * policy.marketFactor;
  const cost = input.acquisitionCostCrc;
  if (cost !== null && (!Number.isFinite(cost) || cost < 0))
    throw new Error("Costo inválido");
  const floor =
    cost === null
      ? null
      : (cost + policy.handlingCrc + policy.fixedFeeCrc) /
        (1 - policy.variableFee - policy.targetMargin);
  const step = marketTarget < 10000 ? 100 : 500;
  const roundedMarket = Math.max(step, Math.round(marketTarget / step) * step);
  const roundedFloor = floor === null ? null : Math.ceil(floor / step) * step;
  const suggestedPriceCrc = Math.max(roundedMarket, roundedFloor || 0);
  if (
    !Number.isSafeInteger(suggestedPriceCrc) ||
    suggestedPriceCrc > 2147483647
  )
    throw new Error("Precio fuera de rango");
  const warnings: string[] = [];
  if (cost === null) warnings.push("Costo por confirmar");
  if (floor !== null && floor > marketTarget)
    warnings.push("Margen mínimo supera referencia de mercado");
  if (suggestedPriceCrc >= 50000) warnings.push("Carta de alto valor");
  if (
    input.currentPriceCrc > 0 &&
    Math.abs(suggestedPriceCrc / input.currentPriceCrc - 1) > 0.1
  )
    warnings.push("Cambio mayor al 10%");
  return {
    marketTargetCrc: Math.round(marketTarget),
    floorCrc: floor === null ? null : Math.ceil(floor),
    suggestedPriceCrc,
    step,
    warnings,
    policy,
  };
}
