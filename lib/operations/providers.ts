import { z } from "zod";
import {
  normalizeFinish,
  normalizeLanguage,
  type CatalogCard,
  type ImportRow,
} from "./imports";
export class CoverageError extends Error {}
export type Quote = {
  amount: number;
  currency: "USD";
  provider: string;
  sourceUrl: string;
  observedAt: string;
  priceType: string;
  exactVariant: false;
  note: string;
};
type Fetcher = typeof fetch;
async function get(
  url: string,
  request: Fetcher,
  headers: Record<string, string> = {},
) {
  const response = await request(url, {
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
  return response.json();
}
const scryfallCard = z.object({
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
  prices: z.record(z.string().nullable()).optional(),
});
const pokemonCard = z.object({
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
function magicCard(raw: unknown): CatalogCard {
  const c = scryfallCard.parse(raw);
  return {
    id: `scryfall:${c.id}`,
    name: c.name,
    setName: c.set_name,
    collectorNumber: c.collector_number,
    game: "magic",
    language: normalizeLanguage(c.lang),
    provider: "scryfall",
    externalId: c.id,
    imageUrl:
      c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || null,
    verified: false,
    treatment: "standard",
    kind: "single",
  };
}
function pokeCard(raw: unknown): CatalogCard {
  const c = pokemonCard.parse(raw);
  return {
    id: `pokemontcg:${c.id}`,
    name: c.name,
    setName: c.set.name,
    collectorNumber: c.number,
    game: "pokemon",
    language: "en",
    provider: "pokemontcg",
    externalId: c.id,
    imageUrl: c.images?.large || null,
    verified: false,
    treatment: "standard",
    kind: "single",
  };
}
export async function searchCatalog(
  row: ImportRow,
  request: Fetcher = fetch,
): Promise<CatalogCard[]> {
  if (row.kind === "sealed")
    throw new CoverageError(
      "Producto sellado: verifica referencia, idioma y contenido manualmente",
    );
  if (
    row.provider === "tcgdex" &&
    row.externalId &&
    row.language !== "unknown"
  ) {
    const c = z
      .object({
        id: z.string(),
        name: z.string(),
        localId: z.string(),
        set: z.object({ name: z.string() }),
        image: z.string().optional(),
      })
      .parse(
        await get(
          `https://api.tcgdex.net/v2/${encodeURIComponent(row.language)}/cards/${encodeURIComponent(row.externalId)}`,
          request,
        ),
      );
    return [
      {
        id: `tcgdex:${c.id}`,
        name: c.name,
        setName: c.set.name,
        collectorNumber: c.localId,
        game: "pokemon",
        language: row.language,
        provider: "tcgdex",
        externalId: c.id,
        imageUrl: c.image ? `${c.image}/high.webp` : null,
        verified: false,
        treatment: row.treatment,
        kind: "single",
      },
    ];
  }
  if (row.game === "magic") {
    const number = row.collectorNumber.split("/")[0];
    const q = `!"${row.name.replaceAll('"', "")}" cn:${number} lang:${row.language === "unknown" ? "en" : row.language}`;
    const data = z
      .object({ data: z.array(z.unknown()) })
      .parse(
        await get(
          `https://api.scryfall.com/cards/search?unique=prints&q=${encodeURIComponent(q)}`,
          request,
        ),
      );
    return data.data.slice(0, 20).map(magicCard);
  }
  if (row.game === "pokemon" && row.language === "en") {
    const name = row.name
      .replace(/\s*\((JP|CN|Secret|Full Art)\)/gi, "")
      .replaceAll('"', "");
    const number = row.collectorNumber.split("/")[0];
    const q = `name:"${name}" number:"${number}"`;
    const data = z
      .object({ data: z.array(z.unknown()) })
      .parse(
        await get(
          `https://api.pokemontcg.io/v2/cards?pageSize=20&q=${encodeURIComponent(q)}`,
          request,
          process.env.POKEMON_TCG_API_KEY
            ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
            : {},
        ),
      );
    return data.data.map(pokeCard);
  }
  throw new CoverageError(
    "Sin cobertura automática para este juego/idioma. Selecciona catálogo local o verifica manualmente.",
  );
}
export async function marketQuote(
  printing: {
    game: string;
    language: string;
    catalog_source: string | null;
    external_card_id: string | null;
    tcgplayer_product_id: string | null;
  },
  condition: string,
  finish: string,
  request: Fetcher = fetch,
): Promise<Quote> {
  if (normalizeLanguage(printing.language) !== "en")
    throw new CoverageError(
      "Precio internacional de otro idioma: aporta evidencia para la impresión exacta",
    );
  if (condition !== "Near Mint")
    throw new CoverageError(
      "La referencia automática no acredita esta condición. Aporta una cotización comparable.",
    );
  const base = {
    currency: "USD" as const,
    exactVariant: false as const,
    priceType: "market_reference",
    note: "Referencia de mercado. Confirma impresión, acabado y condición antes de aprobar.",
  };
  if (printing.catalog_source === "scryfall" && printing.external_card_id) {
    const c = scryfallCard.parse(
      await get(
        `https://api.scryfall.com/cards/${encodeURIComponent(printing.external_card_id)}`,
        request,
      ),
    );
    const f = normalizeFinish(finish);
    const key =
      f === "Etched"
        ? "usd_etched"
        : f === "Foil"
          ? "usd_foil"
          : f === "Non-foil"
            ? "usd"
            : null;
    const amount = key ? Number(c.prices?.[key]) : 0;
    if (!amount || amount <= 0)
      throw new CoverageError("Scryfall no ofrece precio para ese acabado");
    return {
      ...base,
      amount,
      provider: "scryfall",
      sourceUrl: c.scryfall_uri || `https://scryfall.com/card/${c.id}`,
      observedAt: new Date().toISOString(),
    };
  }
  if (
    ["pokemontcg", "pokemontcg.io"].includes(printing.catalog_source || "") &&
    printing.external_card_id
  ) {
    const data = z
      .object({ data: z.unknown() })
      .parse(
        await get(
          `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(printing.external_card_id)}`,
          request,
          process.env.POKEMON_TCG_API_KEY
            ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
            : {},
        ),
      );
    const c = pokemonCard.parse(data.data);
    const f = normalizeFinish(finish);
    const key =
      f === "Holofoil"
        ? "holofoil"
        : f === "Reverse Holofoil"
          ? "reverseHolofoil"
          : f === "Non-foil"
            ? "normal"
            : null;
    const amount = key ? c.tcgplayer?.prices?.[key]?.market : 0;
    if (!amount || !c.tcgplayer)
      throw new CoverageError("No hay precio de mercado para ese acabado");
    return {
      ...base,
      amount,
      provider: "tcgplayer-via-pokemontcg",
      sourceUrl: c.tcgplayer.url,
      observedAt: c.tcgplayer.updatedAt
        ? new Date(c.tcgplayer.updatedAt).toISOString()
        : new Date().toISOString(),
    };
  }
  if (printing.tcgplayer_product_id) {
    if (!process.env.TCGPLAYER_ACCESS_TOKEN)
      throw new CoverageError(
        "Configura el acceso autorizado de TCGplayer o registra evidencia manual",
      );
    const data = z
      .object({
        results: z.array(
          z.object({
            productId: z.number(),
            subTypeName: z.string(),
            marketPrice: z.number().nullable(),
          }),
        ),
      })
      .parse(
        await get(
          `https://api.tcgplayer.com/pricing/product/${encodeURIComponent(printing.tcgplayer_product_id)}`,
          request,
          { Authorization: `Bearer ${process.env.TCGPLAYER_ACCESS_TOKEN}` },
        ),
      );
    const p = data.results.find(
      (p) =>
        String(p.productId) === printing.tcgplayer_product_id &&
        normalizeFinish(p.subTypeName) === normalizeFinish(finish),
    );
    if (!p?.marketPrice)
      throw new CoverageError("Sin referencia para el producto y acabado");
    return {
      ...base,
      amount: p.marketPrice,
      provider: "tcgplayer",
      sourceUrl: `https://www.tcgplayer.com/product/${p.productId}`,
      observedAt: new Date().toISOString(),
    };
  }
  throw new CoverageError(
    "Falta identificador de proveedor. Verifica la impresión o agrega evidencia manual.",
  );
}
