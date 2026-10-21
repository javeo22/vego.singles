import { collectrCardName } from "./collectr";
import { normalizeFinish, sameCollectorNumber } from "./imports";
import type { MarketReference } from "./price-verification";

export type SourceProduct = {
  productId: number;
  categoryId?: number;
  groupId?: number;
  name: string;
  url?: string;
  extendedData?: Array<{ name: string; value: string }>;
};
export type SourceMatch = {
  provider: "tcgcsv" | "scryfall";
  externalId: string;
  name: string;
  set: string;
  number: string;
  sourceUrl: string;
  sourceLanguage: string;
  scope: "exact_product" | "possible_product";
  matchedFields: string[];
  imageUrl?: string | null;
};
export type SourceReview = {
  catalogMatches: SourceMatch[];
  comparisonReferences: Array<MarketReference & { sourceLanguage: string }>;
  reviewReasons: string[];
};
export const sourceKey = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Explicit equivalent catalog labels; no nearest-name or cross-set selection.
export function sourceSetKey(game: string, value: string) {
  let name = value;
  if (game === "pokemon") {
    name = name.replace(
      /^(?:SWSH\d*(?:\.\d+)?|SV\d*(?:\.\d+)?|SM\d*|XY\d*|BW\d*|ME\d*)\s*(?::| -)\s*/i,
      "",
    );
    name = name.replace(/\bPromos? Cards?\b/gi, "Promos");
  }
  if (game === "magic") {
    name = name.replace(/^Universes Beyond:\s*/i, "");
    name = name.replace(/^Commander:\s*(.*)$/i, "$1 Commander");
    name = name.replace(/:\s*Eternal-Legal$/i, " Eternal");
  }
  const key = sourceKey(name);
  const aliases: Record<string, Record<string, string>> = {
    magic: {
      "strixhaven mystical archives": "strixhaven mystical archive",
      "secret lair drop series": "secret lair drop",
      "the list": "the list reprints",
      "list reprints": "the list reprints",
      "stellar sights": "edge of eternities stellar sights",
      "marvel eternal legal": "marvel universe eternal legal",
      "tales of middle earth commander":
        "the lord of the rings tales of middle earth commander",
      "tales of middle earth scene box":
        "art series universes beyond the lord of the rings tales of middle earth",
      "forgotten realms commander":
        "adventures in the forgotten realms commander",
      "breaking news": "outlaws of thunder junction breaking news",
    },
    pokemon: {
      "scarlet violet promo": "scarlet violet promos",
      "scarlet violet black star promos": "scarlet violet promos",
      "sword shield promo": "sword shield promos",
      "mega evolution promo": "mega evolution promos",
      "scarlet violet 151": "151",
      "sword shield": "sword shield base set",
      "swsh black star promos": "sword shield promos",
      "svp black star promos": "scarlet violet promos",
    },
    "one-piece": {
      "starter deck 10 ultimate deck the three captains":
        "st 10 ultra deck the three captains",
      "starter deck 8 monkey d luffy": "st 08 starter deck 8 monkey d luffy",
    },
  };
  return aliases[game]?.[key] || key;
}

const treatmentKey = (value: string) =>
  value.split(" / ").map(sourceKey).sort().join(" / ");

export function sourceProductCandidates(
  printing: {
    game: string;
    canonical_name: string;
    collector_number: string;
    treatment: string;
    kind: string;
    sourceName: string;
  },
  products: SourceProduct[],
  categoryId: number,
  groupId: number,
) {
  return products.flatMap((product) => {
    if (
      (product.categoryId !== undefined && product.categoryId !== categoryId) ||
      (product.groupId !== undefined && product.groupId !== groupId)
    )
      return [];
    const number =
      product.extendedData?.find((field) =>
        /^(number|card number|cardnumber)$/i.test(field.name),
      )?.value || "";
    const productNameKey = (name: string) =>
      sourceKey(
        printing.game === "magic" && printing.kind === "sealed"
          ? name.replace(/^Universes Beyond:\s*/i, "")
          : name,
      );
    const fullName = productNameKey(printing.sourceName);
    const providerFullName = productNameKey(product.name);
    const exactName = fullName === providerFullName;
    const numbered = printing.kind === "single" && !!printing.collector_number;
    if (
      numbered &&
      (!number || !sameCollectorNumber(number, printing.collector_number))
    )
      return [];
    // Unnumbered DON!!/promos and sealed products require their full description.
    if (!numbered && !exactName) return [];
    const parsed = collectrCardName(
      product.name.replace(/\(Pok[eé]mon League\)/gi, "(League Promo)"),
    );
    let baseName = parsed.name;
    const numberedSuffix = baseName.match(
      /^(.*?)\s+-\s+([a-z]*\d+[a-z]?(?:\/[a-z]*\d+)?)(?:\s*\([a-z]*\d+[a-z]?\/[a-z]*\d+\))?$/i,
    );
    if (
      numberedSuffix &&
      sameCollectorNumber(numberedSuffix[2], printing.collector_number)
    )
      baseName = numberedSuffix[1];
    const canonical =
      printing.game === "magic"
        ? printing.canonical_name.split(" // ")[0]
        : printing.canonical_name;
    const sameName = sourceKey(baseName) === sourceKey(canonical);
    const sameTreatment =
      treatmentKey(parsed.treatment) === treatmentKey(printing.treatment);
    const exact = exactName || (sameName && sameTreatment);
    return [{ product, number, exact, exactName }];
  });
}

export function comparisonPrices(
  productId: number,
  finish: string,
  prices: Array<{
    productId: number;
    subTypeName: string;
    marketPrice: number | null;
  }>,
  updatedAt: string | null,
  checkedAt: string,
): SourceReview["comparisonReferences"] {
  const found = prices.filter(
    (price) =>
      price.productId === productId &&
      normalizeFinish(price.subTypeName) === normalizeFinish(finish),
  );
  if (found.length !== 1 || !found[0].marketPrice || found[0].marketPrice <= 0)
    return [];
  return [
    {
      id: `tcgcsv:${productId}:${normalizeFinish(finish)}:USD`,
      amount: found[0].marketPrice,
      currency: "USD",
      marketplace: "tcgplayer",
      feed: "tcgcsv",
      productId: String(productId),
      finish: normalizeFinish(finish),
      sourceUrl: `https://www.tcgplayer.com/product/${productId}`,
      providerUpdatedAt: updatedAt,
      timestampBasis: "feed_published",
      checkedAt,
      conditionCoverage: "market_aggregate",
      sourceLanguage: "unknown",
    },
  ];
}
