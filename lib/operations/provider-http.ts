import { z } from "zod";
export class CoverageError extends Error {}
export type Quote = {
  amount: number;
  currency: "USD";
  provider: string;
  sourceUrl: string;
  observedAt: string | null;
  priceType: string;
  exactVariant: false;
  note: string;
};
type Fetcher = typeof fetch;
export async function get(
  url: string,
  request: Fetcher,
  headers: Record<string, string> = {},
) {
  return (await getDocument(url, request, headers)).data;
}
export async function getDocument(
  url: string,
  request: Fetcher,
  headers: Record<string, string> = {},
) {
  const response = await request(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "VegoSingles/1.0 (catalog and pricing)",
      ...headers,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404)
    throw new CoverageError("El catálogo no reconoce este identificador");
  if (!response.ok)
    throw new Error(`El proveedor respondió ${response.status}`);
  return {
    data: await response.json(),
    lastModified: response.headers.get("last-modified"),
  };
}
export const scryfallCard = z.object({
  id: z.string(),
  name: z.string(),
  set_name: z.string(),
  collector_number: z.string(),
  lang: z.string(),
  scryfall_uri: z.string().optional(),
  image_uris: z.object({ normal: z.string() }).optional(),
  card_faces: z
    .array(
      z.object({ image_uris: z.object({ normal: z.string() }).optional() }),
    )
    .optional(),
  tcgplayer_id: z.number().nullable().optional(),
  prices: z.record(z.string().nullable()).optional(),
});
export const pokemonCard = z.object({
  id: z.string(),
  name: z.string(),
  number: z.string(),
  set: z.object({ name: z.string() }),
  images: z.object({ large: z.string() }).optional(),
  tcgplayer: z
    .object({
      url: z.string(),
      updatedAt: z.string().optional(),
      prices: z
        .record(z.object({ market: z.number().nullable().optional() }))
        .optional(),
    })
    .optional(),
});
