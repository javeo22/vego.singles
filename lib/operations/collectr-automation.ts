import { z } from "zod";
import { getDocument } from "./provider-http";
import {
  sourceProductCandidates,
  sourceSetKey,
  comparisonPrices,
  type SourceProduct,
} from "./source-matching";

export const exchangeSource = "https://api.hacienda.go.cr/indicadores/tc/dolar";
const cache = new Map<
  string,
  { until: number; value: Promise<{ data: any; lastModified: string | null }> }
>();
async function document(url: string, request: typeof fetch) {
  if (request !== fetch) return getDocument(url, request);
  const prior = cache.get(url);
  if (prior && prior.until > Date.now()) return prior.value;
  const value = getDocument(url, request).catch((error) => {
    cache.delete(url);
    throw error;
  });
  if (cache.size > 300) cache.clear();
  cache.set(url, { until: Date.now() + 5 * 60000, value });
  return value;
}
export async function officialExchange(
  request: typeof fetch = fetch,
  now = Date.now(),
) {
  const data = z
    .object({
      venta: z.object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        valor: z.number().min(1).max(10000),
      }),
    })
    .parse((await document(exchangeSource, request)).data);
  // Hacienda publishes a Costa Rica calendar date, not a retrieval timestamp.
  const observedAt = new Date(
    `${data.venta.fecha}T00:00:00-06:00`,
  ).toISOString();
  if (
    Date.parse(observedAt) > now + 3600000 ||
    now - Date.parse(observedAt) > 7 * 86400000
  )
    throw new Error("El cambio oficial no tiene una fecha vigente.");
  return { fx: data.venta.valor, observedAt, sourceUrl: exchangeSource };
}
const groupsSchema = z.object({
  results: z.array(z.object({ groupId: z.number(), name: z.string() })),
});
const productsSchema = z.object({
  results: z.array(
    z.object({
      productId: z.number(),
      name: z.string(),
      categoryId: z.number().optional(),
      groupId: z.number().optional(),
      imageUrl: z.string().optional(),
      extendedData: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .optional(),
    }),
  ),
});
const pricesSchema = z.object({
  lastUpdated: z.string().optional(),
  results: z.array(
    z.object({
      productId: z.number(),
      subTypeName: z.string(),
      marketPrice: z.number().nullable(),
    }),
  ),
});
const categories: Record<string, number> = {
  magic: 1,
  pokemon: 3,
  lorcana: 71,
  "one-piece": 68,
  "star-wars": 79,
};
export type ClaimedStoreItem = {
  id: string;
  lease_token: string;
  expected: Record<string, unknown>;
  trustedCollectr: boolean;
  printing: Record<string, any>;
  listing: Record<string, any>;
};
export async function collectrPriceProof(
  item: ClaimedStoreItem,
  request: typeof fetch = fetch,
  now = Date.now(),
) {
  const { printing: c, listing: l } = item;
  const base = { expected: item.expected };
  if (!item.trustedCollectr && !c.identity_verified)
    return {
      ...base,
      reason: "Esta carta no viene de Collectr y necesita completar su ficha.",
    };
  if (!["unknown", "en", "english"].includes(c.language.toLowerCase()))
    return {
      ...base,
      reason:
        "Necesita un precio del mismo idioma; conservamos el idioma indicado en Collectr.",
    };
  if (
    !["Near Mint", "near_mint", "Sealed Product", "sealed_product"].includes(
      l.condition,
    )
  )
    return { ...base, reason: "Necesita un precio de esta condición." };
  const category = categories[c.game];
  if (!category)
    return { ...base, reason: "No hay una fuente automática para este juego." };
  const groups = groupsSchema.parse(
    (await document(`https://tcgcsv.com/tcgplayer/${category}/groups`, request))
      .data,
  ).results;
  const matches = groups.filter(
    (group) =>
      sourceSetKey(c.game, group.name) === sourceSetKey(c.game, c.set_name),
  );
  if (matches.length !== 1)
    return {
      ...base,
      reason: "No encontramos un set único. El precio actual se conserva.",
    };
  const group = matches[0];
  const products = productsSchema.parse(
    (
      await document(
        `https://tcgcsv.com/tcgplayer/${category}/${group.groupId}/products`,
        request,
      )
    ).data,
  ).results;
  const candidates = sourceProductCandidates(
    {
      ...c,
      game: c.game,
      canonical_name: c.canonical_name,
      collector_number: c.collector_number,
      treatment: c.treatment,
      kind: c.kind,
      sourceName:
        c.metadata?.original_data?.["Product Name"] || c.canonical_name,
    },
    products as SourceProduct[],
    category,
    group.groupId,
  ).filter((candidate) => candidate.exact);
  if (candidates.length !== 1)
    return {
      ...base,
      reason:
        candidates.length > 1
          ? "Hay varias impresiones posibles; elige la variante exacta."
          : "El nombre, número o edición no coincide con un producto único.",
    };
  const product = candidates[0].product as SourceProduct & {
    imageUrl?: string;
  };
  const doc = await document(
    `https://tcgcsv.com/tcgplayer/${category}/${group.groupId}/prices`,
    request,
  );
  const prices = pricesSchema.parse(doc.data);
  const rawDate = prices.lastUpdated || doc.lastModified;
  const updated =
    rawDate && Number.isFinite(Date.parse(rawDate))
      ? new Date(rawDate).toISOString()
      : null;
  if (
    !updated ||
    now - Date.parse(updated) > 72 * 3600000 ||
    Date.parse(updated) > now + 3600000
  )
    return {
      ...base,
      reason:
        "La fuente no ofrece un precio vigente. Conservamos el precio actual.",
    };
  const references = comparisonPrices(
    product.productId,
    l.finish,
    prices.results,
    updated,
    new Date(now).toISOString(),
  );
  if (references.length !== 1)
    return {
      ...base,
      reason: "No hay un precio positivo único para este acabado.",
    };
  const image =
    product.imageUrl &&
    /^https:\/\/(?:[a-z0-9-]+\.)*tcgplayer\.com\//.test(product.imageUrl)
      ? product.imageUrl
      : null;
  return {
    ...base,
    matched: true,
    product: {
      productId: product.productId,
      name: product.name,
      categoryId: category,
      groupId: group.groupId,
      number: candidates[0].number,
      imageUrl: image,
    },
    reference: references[0],
  };
}
