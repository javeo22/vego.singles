import { cartLimit, gameNames, type Listing } from "./catalog";

export const cartStorageKey = "vego.cart.v1";
export const defaultFilters = {
  query: "",
  game: "all",
  kind: "all",
  set: "",
  language: "",
  finish: "",
  order: "desc",
  all: false,
};
export type CatalogFilters = typeof defaultFilters;
export function changeFilters(
  current: CatalogFilters,
  value: Partial<CatalogFilters>,
): CatalogFilters {
  const scopeChanged =
    (value.game !== undefined && value.game !== current.game) ||
    (value.kind !== undefined && value.kind !== current.kind);
  return {
    ...current,
    ...(scopeChanged ? { set: "", language: "", finish: "" } : {}),
    ...value,
  };
}
const parameters = {
  query: "q",
  game: "game",
  kind: "kind",
  set: "set",
  language: "lang",
  finish: "finish",
  order: "order",
} as const;

export function readFilters(url: URL): CatalogFilters {
  const result = { ...defaultFilters };
  for (const [key, param] of Object.entries(parameters)) {
    const value = url.searchParams.get(param);
    if (value !== null)
      result[key as keyof typeof parameters] = value.slice(0, 200);
  }
  if (!(result.game in gameNames)) result.game = "all";
  if (!["single", "sealed"].includes(result.kind)) result.kind = "all";
  if (result.kind === "sealed") result.finish = "";
  if (result.order !== "asc") result.order = "desc";
  result.all = url.searchParams.get("all") === "1";
  return result;
}

export function writeFilters(url: URL, filters: CatalogFilters) {
  for (const [key, param] of Object.entries(parameters)) {
    const value = filters[key as keyof typeof parameters];
    if (value === defaultFilters[key as keyof typeof parameters])
      url.searchParams.delete(param);
    else url.searchParams.set(param, value);
  }
  if (filters.all) url.searchParams.set("all", "1");
  else url.searchParams.delete("all");
  return url;
}

export function restoreCart(raw: string | null, inventory: Listing[]) {
  const source = new Map(
    inventory.filter((item) => !item.sample).map((item) => [item.id, item]),
  );
  const lines: { item: Listing; count: number }[] = [];
  let adjusted = false;
  try {
    const saved: unknown = JSON.parse(raw || "null");
    if (
      !saved ||
      typeof saved !== "object" ||
      !("version" in saved) ||
      saved.version !== 1 ||
      !("items" in saved) ||
      !Array.isArray(saved.items)
    )
      return { lines, adjusted };
    for (const row of saved.items.slice(0, 30)) {
      if (
        !row ||
        typeof row !== "object" ||
        typeof row.id !== "string" ||
        !Number.isSafeInteger(row.count) ||
        row.count <= 0 ||
        lines.some((line) => line.item.id === row.id)
      )
        continue;
      const item = source.get(row.id);
      if (!item || cartLimit(item) === 0) {
        adjusted = true;
        continue;
      }
      const count = Math.min(row.count, cartLimit(item), 100);
      if (count !== row.count) adjusted = true;
      lines.push({ item, count });
    }
  } catch {
    /* A malformed or old saved selection must not prevent shopping. */
  }
  return { lines, adjusted };
}
