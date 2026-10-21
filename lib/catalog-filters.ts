import { variantLabel, type Listing } from "./catalog";
import type { CatalogFilters } from "./shop-state";

export type Facet =
  "set" | "language" | "finish" | "color" | "cardType" | "rarity";
const unknown = "unconfirmed";
export const magicColors: Record<string, string> = {
  W: "Blanco",
  U: "Azul",
  B: "Negro",
  R: "Rojo",
  G: "Verde",
  C: "Incoloro",
  multicolor: "Multicolor",
};
const magicTypes: Record<string, string> = {
  artifact: "Artefacto",
  battle: "Batalla",
  conspiracy: "Conspiración",
  creature: "Criatura",
  dungeon: "Mazmorra",
  enchantment: "Encantamiento",
  instant: "Instantáneo",
  kindred: "Estirpe",
  land: "Tierra",
  phenomenon: "Fenómeno",
  plane: "Plano",
  planeswalker: "Planeswalker",
  scheme: "Plan",
  sorcery: "Conjuro",
  tribal: "Tribal",
  vanguard: "Vanguard",
};
export function specificFacets(
  game: string,
  kind: string,
): Array<[Facet, string, string]> {
  if (kind === "sealed") return [];
  if (game === "magic")
    return [
      ["color", "Color", "Todos los colores"],
      ["cardType", "Tipo de carta", "Todos los tipos"],
    ];
  if (["pokemon", "one-piece"].includes(game))
    return [["rarity", "Rareza", "Todas las rarezas"]];
  return [];
}
export function facetValues(item: Listing, field: Facet): string[] {
  const c = item.card_printings;
  if (!c) return [];
  if (field === "set") return [c.set_name];
  if (field === "language") return [variantLabel(c.language)];
  if (field === "finish")
    return item.kind === "sealed"
      ? []
      : [variantLabel(item.finish)].filter(Boolean);
  if (item.kind === "sealed") return [];
  if (field === "rarity")
    return c.rarity?.trim()
      ? [c.rarity.trim().toLowerCase().replace(/\s+/g, " ")]
      : [unknown];
  if (c.game !== "magic") return [];
  if (field === "color") {
    if (!Array.isArray(c.colors)) return [unknown];
    if (!c.colors.length) return ["C"];
    return [...c.colors, ...(c.colors.length > 1 ? ["multicolor"] : [])];
  }
  if (!c.type_line) return [unknown];
  const types = c.type_line
    .split(" // ")
    .flatMap((face) => face.split(/[—–]/)[0].toLowerCase().split(/\s+/));
  const found = Object.keys(magicTypes).filter((type) => types.includes(type));
  return found.length ? found : [unknown];
}
export function facetLabel(field: Facet, value: string, game: string) {
  if (value === unknown) return "Por confirmar";
  if (field === "color") return magicColors[value] || value;
  if (field === "cardType") return magicTypes[value] || value;
  if (field === "rarity" && game === "one-piece") {
    const labels: Record<string, string> = {
      c: "C · Común",
      uc: "UC · Poco común",
      r: "R · Rara",
      sr: "SR · Super rara",
      sec: "SEC · Secreta",
      l: "L · Líder",
      pr: "PR · Promo",
      "don!!": "DON!!",
    };
    return labels[value] || value.toUpperCase();
  }
  return field === "rarity"
    ? value.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : value;
}
const common: Facet[] = ["set", "language", "finish"];
export function matchesFacets(
  item: Listing,
  filters: CatalogFilters,
  except?: Facet,
) {
  return [
    ...common,
    ...specificFacets(filters.game, filters.kind).map(([field]) => field),
  ].every(
    (field) =>
      field === except ||
      !filters[field] ||
      facetValues(item, field).includes(filters[field]),
  );
}
export function facetOptions(
  items: Listing[],
  filters: CatalogFilters,
  field: Facet,
) {
  return [
    ...new Set(
      items
        .filter((item) => matchesFacets(item, filters, field))
        .flatMap((item) => facetValues(item, field)),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) =>
      facetLabel(field, a, filters.game).localeCompare(
        facetLabel(field, b, filters.game),
        "es",
      ),
    );
}
