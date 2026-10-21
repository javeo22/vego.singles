export const fulfillmentMethods = ["delivery", "express", "pickup"] as const;
export type FulfillmentMethod = (typeof fulfillmentMethods)[number];

export function fulfillmentLabel(value: string) {
  if (value === "pickup") return "Retiro coordinado";
  if (value === "express") return "Envío express";
  if (value === "duelist") return "Duelist Kingdom (solicitud anterior)";
  return "Envío por coordinar";
}

export function deliveryMessage(
  value: string,
  quote?: { pending: boolean; amountCrc: number },
) {
  if (value !== "pickup" && quote && !quote.pending) {
    return `${fulfillmentLabel(value)}: ₡${quote.amountCrc.toLocaleString("en-US")} de envío confirmado, incluido en el total.`;
  }
  return value === "pickup"
    ? "Retiro coordinado: sin costo de envío. Confirmar lugar y horario por WhatsApp."
    : `${fulfillmentLabel(value)}: costo por cotizar en WhatsApp, no incluido en el subtotal. Confirmar opciones, cobertura y plazo antes de pagar.${value === "express" ? " Solicito express con costo adicional por confirmar." : ""}`;
}

export function whatsappUrl(message?: string) {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "50670180855";
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
