import { z } from "zod";
import { sameCollectorNumber } from "./imports";

const color = z.enum(["W", "U", "B", "R", "G"]);
const cardSchema = z.object({
  id: z.string().uuid(),
  tcgplayer_id: z.number().nullable().optional(),
  tcgplayer_etched_id: z.number().nullable().optional(),
  collector_number: z.string(),
  type_line: z.string().min(1).max(2000),
  colors: z.array(color).optional(),
  card_faces: z
    .array(z.object({ colors: z.array(color).optional() }))
    .optional(),
});
export type AttributePrinting = {
  id: string;
  game: string;
  kind?: string;
  tcgplayer_product_id?: string | null;
  collector_number: string;
  identity_verified: boolean;
};
export type CatalogAttributes = {
  provider: "scryfall";
  sourceCardId: string;
  sourceUrl: string;
  colors: string[];
  type_line: string;
};
export async function fetchCatalogAttributes(
  printings: AttributePrinting[],
  request: typeof fetch = fetch,
) {
  const eligible = printings.filter(
    (c) =>
      c.game === "magic" &&
      c.kind !== "sealed" &&
      c.identity_verified &&
      /^\d+$/.test(c.tcgplayer_product_id || ""),
  );
  const products = [
    ...new Set(eligible.map((c) => Number(c.tcgplayer_product_id))),
  ];
  const results: Array<{
    printingId: string;
    productId: string;
    attributes: CatalogAttributes;
  }> = [];
  for (const productId of products) {
    if (request === fetch)
      await new Promise((resolve) => setTimeout(resolve, 110));
    const response = await request(
      `https://api.scryfall.com/cards/tcgplayer/${productId}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "VegoSingles/1.0 (catalog attributes)",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`Catalog responded ${response.status}`);
    const document = { data: [await response.json()] };
    for (const raw of document.data) {
      const parsed = cardSchema.safeParse(raw);
      if (!parsed.success) continue;
      const c = parsed.data;
      const colors =
        c.colors ??
        (c.card_faces?.every((face) => Array.isArray(face.colors))
          ? [...new Set(c.card_faces.flatMap((face) => face.colors!))]
          : null);
      if (!colors) continue; // Missing colors must never become "colorless".
      for (const printing of eligible.filter(
        (p) =>
          [c.tcgplayer_id, c.tcgplayer_etched_id].includes(
            Number(p.tcgplayer_product_id),
          ) && sameCollectorNumber(p.collector_number, c.collector_number),
      ))
        results.push({
          printingId: printing.id,
          productId: printing.tcgplayer_product_id!,
          attributes: {
            provider: "scryfall",
            sourceCardId: c.id,
            sourceUrl: `https://api.scryfall.com/cards/${c.id}`,
            colors,
            type_line: c.type_line,
          },
        });
    }
  }
  return results;
}
