import { z } from "zod";
import { normalizeLanguage, type CatalogCard, type ImportRow } from "./imports";
import { get, scryfallCard, pokemonCard, CoverageError } from "./provider-http";
export { CoverageError } from "./provider-http";
export { marketQuote } from "./market-sources";
export type { Quote } from "./provider-http";
type Fetcher = typeof fetch;
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
