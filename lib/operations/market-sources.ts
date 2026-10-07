import { z } from "zod";
import {
  normalize,
  normalizeFinish,
  normalizeLanguage,
  sameCollectorNumber,
} from "./imports";
import {
  CoverageError,
  get,
  getDocument,
  pokemonCard,
  scryfallCard,
  type Quote,
} from "./provider-http";
import {
  assessPriceReferences,
  type MarketReference,
  type PricePrinting,
  type SourceFailure,
  type PriceCheck,
} from "./price-verification";
type Fetcher = typeof fetch;
const safeDate = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
function identity(
  p: PricePrinting,
  actual: { name: string; set: string; number: string; language: string },
) {
  if (
    normalizeLanguage(actual.language) !== normalizeLanguage(p.language) ||
    (p.canonical_name &&
      normalize(actual.name) !== normalize(p.canonical_name)) ||
    (p.set_name && normalize(actual.set) !== normalize(p.set_name)) ||
    (p.collector_number &&
      !sameCollectorNumber(actual.number, p.collector_number))
  )
    throw new CoverageError(
      "El identificador no coincide con nombre, set, número e idioma de la impresión.",
    );
}
function reference(
  feed: string,
  marketplace: MarketReference["marketplace"],
  productId: string,
  amount: unknown,
  currency: MarketReference["currency"],
  finish: string,
  sourceUrl: string,
  updated: string | null,
): MarketReference | null {
  const value =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? Number(amount)
        : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    id: `${feed}:${productId}:${finish}:${currency}`,
    amount: value,
    currency,
    marketplace,
    feed,
    productId,
    finish,
    sourceUrl,
    providerUpdatedAt: updated,
    checkedAt: new Date().toISOString(),
    conditionCoverage: "market_aggregate",
  };
}
async function scryfall(p: PricePrinting, finish: string, request: Fetcher) {
  if (
    p.game !== "magic" ||
    p.catalog_source !== "scryfall" ||
    !p.external_card_id
  )
    throw new CoverageError(
      "Falta el identificador Scryfall de esta impresión Magic.",
    );
  const c = scryfallCard.parse(
    await get(
      `https://api.scryfall.com/cards/${encodeURIComponent(p.external_card_id)}`,
      request,
    ),
  );
  if (c.id !== p.external_card_id)
    throw new CoverageError("Scryfall devolvió otro identificador.");
  identity(p, {
    name: c.name,
    set: c.set_name,
    number: c.collector_number,
    language: c.lang,
  });
  const f = normalizeFinish(finish);
  const usd =
    f === "Non-foil"
      ? "usd"
      : f === "Foil"
        ? "usd_foil"
        : f === "Etched"
          ? "usd_etched"
          : null;
  if (!usd)
    throw new CoverageError("Scryfall no tiene cobertura para ese acabado.");
  const refs = [
    reference(
      "scryfall",
      "tcgplayer",
      c.id,
      c.prices?.[usd],
      "USD",
      f,
      c.scryfall_uri || `https://scryfall.com/card/${c.id}`,
      null,
    ),
  ];
  const eur = f === "Non-foil" ? "eur" : f === "Foil" ? "eur_foil" : null;
  if (eur)
    refs.push(
      reference(
        "scryfall",
        "cardmarket",
        c.id,
        c.prices?.[eur],
        "EUR",
        f,
        c.scryfall_uri || `https://scryfall.com/card/${c.id}`,
        null,
      ),
    );
  return refs.filter((r): r is MarketReference => !!r);
}
async function pokemon(p: PricePrinting, finish: string, request: Fetcher) {
  if (
    p.game !== "pokemon" ||
    !["pokemontcg", "pokemontcg.io", "pokemon_tcg_api"].includes(
      p.catalog_source || "",
    ) ||
    !p.external_card_id
  )
    throw new CoverageError(
      "Esta impresión no tiene identificador de Pokémon TCG API.",
    );
  const raw = z
    .object({ data: z.unknown() })
    .parse(
      await get(
        `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(p.external_card_id)}`,
        request,
        process.env.POKEMON_TCG_API_KEY
          ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
          : {},
      ),
    );
  const c = pokemonCard.parse(raw.data);
  if (c.id !== p.external_card_id)
    throw new CoverageError("Pokémon TCG API devolvió otra impresión.");
  identity(p, {
    name: c.name,
    set: c.set.name,
    number: c.number,
    language: "en",
  });
  const f = normalizeFinish(finish);
  const key =
    f === "Holofoil"
      ? "holofoil"
      : f === "Reverse Holofoil"
        ? "reverseHolofoil"
        : f === "Non-foil"
          ? "normal"
          : null;
  const r =
    key && c.tcgplayer
      ? reference(
          "pokemontcg",
          "tcgplayer",
          c.id,
          c.tcgplayer.prices?.[key]?.market,
          "USD",
          f,
          c.tcgplayer.url,
          safeDate(c.tcgplayer.updatedAt),
        )
      : null;
  return r ? [r] : [];
}
const dexCard = z.object({
  id: z.string(),
  name: z.string(),
  localId: z.string(),
  set: z.object({ id: z.string(), name: z.string() }),
  variants: z
    .object({ normal: z.boolean().optional(), holo: z.boolean().optional() })
    .optional(),
  pricing: z
    .object({
      tcgplayer: z
        .object({ unit: z.literal("USD"), updated: z.string().optional() })
        .catchall(z.unknown())
        .optional(),
      cardmarket: z
        .object({
          unit: z.literal("EUR"),
          updated: z.string().optional(),
          idProduct: z.number().optional(),
        })
        .catchall(z.unknown())
        .optional(),
    })
    .optional(),
});
const priceValue = z.object({
  productId: z.number(),
  marketPrice: z.number().nullable(),
});
async function tcgdex(p: PricePrinting, finish: string, request: Fetcher) {
  let id = p.catalog_source === "tcgdex" ? p.external_card_id : null;
  if (!id && p.set_name && p.collector_number) {
    const sets = z
      .array(z.object({ id: z.string(), name: z.string() }))
      .parse(await get("https://api.tcgdex.net/v2/en/sets", request));
    const matches = sets.filter(
      (s) => normalize(s.name) === normalize(p.set_name!),
    );
    if (matches.length !== 1)
      throw new CoverageError(
        "TCGdex no reconoce un set único: confirma un identificador exacto.",
      );
    const set = z
      .object({
        cards: z.array(
          z.object({ id: z.string(), localId: z.string(), name: z.string() }),
        ),
      })
      .parse(
        await get(
          `https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(matches[0].id)}`,
          request,
        ),
      );
    const cards = set.cards.filter(
      (c) =>
        sameCollectorNumber(c.localId, p.collector_number!) &&
        (!p.canonical_name ||
          normalize(c.name) === normalize(p.canonical_name)),
    );
    if (cards.length !== 1)
      throw new CoverageError(
        "TCGdex no reconoce una impresión única: no se asignó un precio.",
      );
    id = cards[0].id;
  }
  if (!id)
    throw new CoverageError(
      "Falta un identificador TCGdex o set/número exactos.",
    );
  const c = dexCard.parse(
    await get(
      `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`,
      request,
    ),
  );
  if (c.id !== id)
    throw new CoverageError("TCGdex devolvió otro identificador.");
  identity(p, {
    name: c.name,
    set: c.set.name,
    number: c.localId,
    language: "en",
  });
  const f = normalizeFinish(finish);
  const key =
    f === "Non-foil"
      ? "normal"
      : f === "Holofoil"
        ? "holofoil"
        : f === "Reverse Holofoil"
          ? "reverse-holofoil"
          : null;
  if (!key)
    throw new CoverageError(
      "TCGdex no distingue este acabado para la cotización.",
    );
  const refs: MarketReference[] = [];
  const tcg = key ? priceValue.safeParse(c.pricing?.tcgplayer?.[key]) : null;
  if (tcg?.success) {
    const r = reference(
      "tcgdex",
      "tcgplayer",
      String(tcg.data.productId),
      tcg.data.marketPrice,
      "USD",
      f,
      `https://www.tcgplayer.com/product/${tcg.data.productId}`,
      safeDate(c.pricing?.tcgplayer?.updated),
    );
    if (r) refs.push(r);
  }
  // Cardmarket's “holo” bucket does not distinguish reverse holo from holofoil.
  // Only the unambiguous regular/non-foil trend is admitted automatically.
  const cm = c.pricing?.cardmarket;
  if (
    f === "Non-foil" &&
    c.variants?.normal === true &&
    c.variants.holo !== true &&
    cm?.idProduct
  ) {
    const r = reference(
      "tcgdex",
      "cardmarket",
      String(cm.idProduct),
      cm.trend,
      "EUR",
      f,
      `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${cm.idProduct}`,
      safeDate(cm.updated),
    );
    if (r) refs.push(r);
  }
  return refs;
}
const csvEnvelope = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    results: z.array(schema),
    lastUpdated: z.string().optional(),
  });
const csvProduct = z.object({
  productId: z.number(),
  name: z.string(),
  categoryId: z.number().optional(),
  groupId: z.number().optional(),
  url: z.string().optional(),
  extendedData: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional(),
});
function tcgSetName(game: string, name: string) {
  if (game !== "pokemon") return normalize(name);
  const value = name.replace(
    /^(?:SWSH\d+(?:\.\d+)?|SV\d*(?:\.\d+)?|SM\d+(?:\.\d+)?|XY\d+|BW\d+):\s*/i,
    "",
  );
  return normalize(value) === "scarlet & violet 151" ? "151" : normalize(value);
}
function productNameMatches(p: PricePrinting, name: string) {
  if (!p.canonical_name) return false;
  const clean = (v: string) => normalize(v.replace(/[—–]/g, "-"));
  if (clean(name) === clean(p.canonical_name)) return true;
  // TCGplayer appends the printed collector number to some Pokémon names.
  const suffix = name.match(
    /^(.*?)\s+-\s+(\d+[a-z]?(?:\/\d+)?)(?:\s*\(\d+[a-z]?\/\d+\))?$/i,
  );
  return (
    !!suffix &&
    !!p.collector_number &&
    sameCollectorNumber(suffix[2], p.collector_number) &&
    clean(suffix[1]) === clean(p.canonical_name)
  );
}
async function tcgcsv(p: PricePrinting, finish: string, request: Fetcher) {
  const nameForGame: Record<string, RegExp> = {
    magic: /^magic(?: the gathering)?$/i,
    pokemon: /^pok[eé]mon$/i,
    lorcana: /^(?:disney )?lorcana(?: tcg)?$/i,
    "star-wars": /^star wars unlimited$/i,
  };
  const categories = csvEnvelope(
    z.object({ categoryId: z.number(), name: z.string() }),
  ).parse(await get("https://tcgcsv.com/tcgplayer/categories", request));
  const cats = categories.results.filter((c) =>
    nameForGame[p.game]?.test(c.name.replaceAll(":", "").trim()),
  );
  if (cats.length !== 1)
    throw new CoverageError(
      "TCGCSV no identifica una categoría única para este TCG.",
    );
  const category = cats[0].categoryId;
  if (!p.set_name)
    throw new CoverageError(
      "Falta el set para identificar el grupo del producto.",
    );
  const groups = csvEnvelope(
    z.object({ groupId: z.number(), name: z.string() }),
  ).parse(
    await get(`https://tcgcsv.com/tcgplayer/${category}/groups`, request),
  );
  const matching = groups.results.filter(
    (g) => tcgSetName(p.game, g.name) === tcgSetName(p.game, p.set_name!),
  );
  if (matching.length !== 1)
    throw new CoverageError(
      "TCGCSV necesita un set exacto; no se escoge un grupo aproximado.",
    );
  const group = matching[0].groupId;
  const products = csvEnvelope(csvProduct).parse(
    await get(
      `https://tcgcsv.com/tcgplayer/${category}/${group}/products`,
      request,
    ),
  );
  const candidates = products.results.filter((c) => {
    if (
      (c.categoryId !== undefined && c.categoryId !== category) ||
      (c.groupId !== undefined && c.groupId !== group)
    )
      return false;
    if (p.tcgplayer_product_id)
      return String(c.productId) === p.tcgplayer_product_id;
    if (p.kind === "sealed")
      return (
        p.canonical_name && normalize(c.name) === normalize(p.canonical_name)
      );
    const number = c.extendedData?.find((e) =>
      /^(number|card number|cardnumber)$/i.test(e.name),
    )?.value;
    return (
      !!number &&
      !!p.collector_number &&
      sameCollectorNumber(number, p.collector_number)
    );
  });
  if (candidates.length !== 1)
    throw new CoverageError(
      "TCGCSV no reconoce un producto único para este set/número. Confirma el ID de TCGplayer.",
    );
  const product = candidates[0];
  if (!productNameMatches(p, product.name))
    throw new CoverageError(
      "El nombre del producto no coincide con la impresión y su tratamiento. Revisa el ID de TCGplayer.",
    );
  const number = product.extendedData?.find((e) =>
    /^(number|card number|cardnumber)$/i.test(e.name),
  )?.value;
  if (p.kind !== "sealed" && p.collector_number && !number)
    throw new CoverageError(
      "El producto no publica un número de carta para contrastar la impresión.",
    );
  if (
    p.kind !== "sealed" &&
    number &&
    p.collector_number &&
    !sameCollectorNumber(number, p.collector_number)
  )
    throw new CoverageError(
      "El ID de TCGplayer corresponde a otro número de carta.",
    );
  if (
    p.kind === "sealed" &&
    p.canonical_name &&
    normalize(product.name) !== normalize(p.canonical_name)
  )
    throw new CoverageError(
      "El ID no coincide con el nombre exacto del producto sellado.",
    );
  const priceDocument = await getDocument(
    `https://tcgcsv.com/tcgplayer/${category}/${group}/prices`,
    request,
  );
  const prices = csvEnvelope(
    z.object({
      productId: z.number(),
      subTypeName: z.string(),
      marketPrice: z.number().nullable(),
    }),
  ).parse(priceDocument.data);
  const f = normalizeFinish(finish);
  const offers = prices.results.filter(
    (r) =>
      r.productId === product.productId &&
      (p.kind === "sealed"
        ? normalizeFinish(r.subTypeName) === "Non-foil"
        : normalizeFinish(r.subTypeName) === f),
  );
  if (offers.length !== 1)
    throw new CoverageError(
      "TCGCSV no ofrece un precio único para este acabado.",
    );
  const r = reference(
    "tcgcsv",
    "tcgplayer",
    String(product.productId),
    offers[0].marketPrice,
    "USD",
    f,
    `https://www.tcgplayer.com/product/${product.productId}`,
    safeDate(prices.lastUpdated || priceDocument.lastModified),
  );
  if (r) r.timestampBasis = "feed_published";
  return r ? [r] : [];
}
async function tcgplayer(p: PricePrinting, finish: string, request: Fetcher) {
  if (!p.tcgplayer_product_id || !process.env.TCGPLAYER_ACCESS_TOKEN)
    throw new CoverageError(
      "Falta el acceso autorizado a TCGplayer o el ID del producto.",
    );
  const headers = {
    Authorization: `Bearer ${process.env.TCGPLAYER_ACCESS_TOKEN}`,
  };
  const id = encodeURIComponent(p.tcgplayer_product_id);
  const products = z
    .object({ results: z.array(csvProduct) })
    .parse(
      await get(
        `https://api.tcgplayer.com/catalog/products/${id}?getExtendedFields=true`,
        request,
        headers,
      ),
    );
  const expectedCategory: Record<string, number> = {
    magic: 1,
    pokemon: 3,
    lorcana: 71,
    "star-wars": 79,
  };
  const product = products.results.find(
    (c) => String(c.productId) === p.tcgplayer_product_id,
  );
  const number = product?.extendedData?.find((e) =>
    /^(number|card number|cardnumber)$/i.test(e.name),
  )?.value;
  if (
    !product ||
    !productNameMatches(p, product.name) ||
    product.categoryId !== expectedCategory[p.game] ||
    (p.kind !== "sealed" &&
      (!number ||
        !p.collector_number ||
        !sameCollectorNumber(number, p.collector_number))) ||
    (p.kind === "sealed" &&
      (!p.canonical_name ||
        normalize(product.name) !== normalize(p.canonical_name)))
  )
    throw new CoverageError(
      "El producto de TCGplayer no acredita el TCG y número/contenido esperados.",
    );
  const prices = z
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
        `https://api.tcgplayer.com/pricing/product/${id}`,
        request,
        headers,
      ),
    );
  const found = prices.results.filter(
    (r) =>
      String(r.productId) === p.tcgplayer_product_id &&
      normalizeFinish(r.subTypeName) ===
        (p.kind === "sealed" ? "Non-foil" : normalizeFinish(finish)),
  );
  if (found.length !== 1)
    throw new CoverageError(
      "No hay precio único del producto y acabado en TCGplayer.",
    );
  const r = reference(
    "tcgplayer-direct",
    "tcgplayer",
    p.tcgplayer_product_id,
    found[0].marketPrice,
    "USD",
    normalizeFinish(finish),
    `https://www.tcgplayer.com/product/${p.tcgplayer_product_id}`,
    null,
  );
  return r ? [r] : [];
}
export async function checkMarketPrice(
  printing: PricePrinting,
  condition: string,
  finish: string,
  request: Fetcher = fetch,
  maxAgeHours = 72,
): Promise<PriceCheck> {
  const p = { ...printing, condition, finish };
  const failures: SourceFailure[] = [];
  const sources: Array<[string, () => Promise<MarketReference[]>]> = [];
  if (
    normalizeLanguage(p.language) !== "en" ||
    (p.treatment && p.treatment !== "standard") ||
    (p.kind === "sealed"
      ? condition !== "Sealed Product"
      : condition !== "Near Mint")
  ) {
    return assessPriceReferences(
      p,
      [],
      [
        {
          feed: "coverage",
          message:
            "La cobertura automática es una referencia agregada en inglés para Near Mint/producto sellado y tratamiento estándar. Este idioma, condición o tratamiento requiere evidencia comparable exacta; no se aplica un descuento supuesto.",
        },
      ],
      maxAgeHours,
    );
  }
  if (
    p.kind !== "sealed" &&
    p.game === "magic" &&
    p.catalog_source === "scryfall"
  )
    sources.push(["scryfall", () => scryfall(p, finish, request)]);
  if (p.kind !== "sealed" && p.game === "pokemon") {
    if (
      ["pokemontcg", "pokemontcg.io", "pokemon_tcg_api"].includes(
        p.catalog_source || "",
      )
    )
      sources.push(["pokemontcg", () => pokemon(p, finish, request)]);
    sources.push(["tcgdex", () => tcgdex(p, finish, request)]);
  }
  sources.push(["tcgcsv", () => tcgcsv(p, finish, request)]);
  if (p.tcgplayer_product_id && process.env.TCGPLAYER_ACCESS_TOKEN)
    sources.push(["tcgplayer-direct", () => tcgplayer(p, finish, request)]);
  const settled = await Promise.allSettled(sources.map(([, load]) => load()));
  const references: MarketReference[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      references.push(...r.value);
      if (!r.value.length)
        failures.push({
          feed: sources[i][0],
          message: "No hay precio de mercado positivo para esa variante.",
        });
    } else
      failures.push({
        feed: sources[i][0],
        message:
          r.reason instanceof CoverageError
            ? r.reason.message
            : "El feed no respondió o su formato no pudo validarse; no se usó un precio alternativo supuesto.",
      });
  });
  return assessPriceReferences(p, references, failures, maxAgeHours);
}
export function referenceToQuote(r: MarketReference): Quote {
  if (r.currency !== "USD")
    throw new CoverageError(
      "Esta referencia necesita conversión EUR/USD verificada.",
    );
  return {
    amount: r.amount,
    currency: "USD",
    provider: `${r.marketplace}-via-${r.feed}`,
    sourceUrl: r.sourceUrl,
    observedAt: r.providerUpdatedAt,
    priceType: "market_reference",
    exactVariant: false,
    note: "Referencia agregada. Confirma impresión, idioma, condición y acabado antes de proponer.",
  };
}
export async function marketQuote(
  printing: PricePrinting,
  condition: string,
  finish: string,
  request: Fetcher = fetch,
): Promise<Quote> {
  const report = await checkMarketPrice(printing, condition, finish, request);
  const r =
    report.references.find((r) => r.id === report.recommendedId) ||
    report.references.find(
      (r) => r.currency === "USD" && r.freshness === "fresh",
    ) ||
    report.references.find(
      (r) => r.currency === "USD" && r.freshness === "unknown",
    );
  if (!r)
    throw new CoverageError(
      report.failures[0]?.message ||
        "Sin referencia comparable para esta variante.",
    );
  return referenceToQuote(r);
}
