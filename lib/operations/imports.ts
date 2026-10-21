import { createHash } from "node:crypto";
import { z } from "zod";
import { games, conditions, languages } from "./types";
import { collectrCardName, maxImportRows } from "./collectr";
export { games, conditions, languages } from "./types";
export type ImportRow = {
  rowNumber: number;
  name: string;
  setName: string;
  collectorNumber: string;
  game: string;
  language: string;
  condition: string;
  finish: string;
  quantity: number;
  acquisitionCostCrc: number | null;
  provider: string;
  externalId: string;
  treatment: string;
  kind: string;
  errors: string[];
  raw: Record<string, string>;
  sourceMarketPrice?: {
    amount: number;
    currency: "USD" | "CRC" | "unknown";
    observedAt: string | null;
  };
  sourcePriceOverride?: { amount: number; currency: "USD" | "CRC" | "unknown" };
};
export function normalize(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
export function normalizeLanguage(value: string) {
  const aliases: Record<string, string> = {
    english: "en",
    inglés: "en",
    ingles: "en",
    spanish: "es",
    español: "es",
    japanese: "ja",
    japonés: "ja",
    jp: "ja",
    chinese: "zh",
    chino: "zh",
    cn: "zh",
    french: "fr",
    german: "de",
    italian: "it",
    portuguese: "pt",
    korean: "ko",
  };
  const n = normalize(value);
  return (
    aliases[n] ||
    (languages.includes(n as (typeof languages)[number]) ? n : "unknown")
  );
}
export function normalizeFinish(value: string) {
  const n = normalize(value).replace(/[ _-]/g, "");
  return (
    (
      {
        holo: "Holofoil",
        holofoil: "Holofoil",
        foil: "Foil",
        normal: "Non-foil",
        regular: "Non-foil",
        nonfoil: "Non-foil",
        reverseholo: "Reverse Holofoil",
        reverseholofoil: "Reverse Holofoil",
        etched: "Etched",
      } as Record<string, string>
    )[n] || value.trim()
  );
}
// RFC 4180 quoting, including escaped quotes and multiline cells; TSV paste uses the same parser.
export function parseDelimited(text: string): string[][] {
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Hay una celda con comillas sin cerrar");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
const columns: Record<string, string[]> = {
  name: ["name", "product name", "card name", "carta", "nombre", "product"],
  setName: ["set", "set name", "set_name", "expansión"],
  collectorNumber: [
    "card number",
    "collector number",
    "collector_number",
    "number",
    "número",
  ],
  game: ["game", "category", "juego"],
  language: ["language", "card language", "idioma"],
  condition: ["condition", "card condition", "condición"],
  finish: ["finish", "variance", "variant", "card variant", "acabado"],
  quantity: ["quantity", "qty", "cantidad", "count"],
  acquisitionCostCrc: ["cost crc", "costo crc", "acquisition_cost_crc"],
  provider: ["provider", "catalog source", "catalog_source"],
  externalId: ["external id", "external_id", "external_card_id"],
  treatment: ["treatment", "tratamiento"],
  kind: ["kind", "tipo"],
};
export function parseImport(
  text: string,
  mapping: Record<string, string> = {},
  defaultGame = "pokemon",
  options: {
    defaultLanguage?: string;
    sourceCurrency?: "USD" | "CRC" | "unknown";
  } = {},
) {
  if (Buffer.byteLength(text, "utf8") > 2_000_000)
    throw new Error("El archivo supera 2 MB");
  const parsed = parseDelimited(text);
  if (parsed.length < 2)
    throw new Error("Incluye encabezados y al menos una carta");
  if (parsed.length > maxImportRows + 1)
    throw new Error(`Importa un máximo de ${maxImportRows} filas por lote`);
  const headers = parsed[0].map(normalize);
  if (new Set(headers).size !== headers.length)
    throw new Error("Los encabezados deben ser únicos");
  const collectr =
    headers.includes("portfolio name") ||
    (headers.includes("variance") && headers.includes("watchlist"));
  const marketIndex = headers.findIndex((h) =>
    /^market price(?:\s*\(as of \d{4}-\d{2}-\d{2}\))?$/.test(h),
  );
  const marketDate =
    marketIndex >= 0
      ? (headers[marketIndex].match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null)
      : null;
  const indexes = Object.fromEntries(
    Object.entries(columns).map(([key, aliases]) => [
      key,
      mapping[key]
        ? headers.indexOf(normalize(mapping[key]))
        : headers.findIndex((h) => aliases.includes(h)),
    ]),
  );
  const rows: ImportRow[] = parsed.slice(1).map((cells, i) => {
    const get = (key: string) => cells[indexes[key]] || "";
    const raw = Object.fromEntries(
      parsed[0].map((h, index) => [h, cells[index] || ""]),
    );
    const sourceName = get("name");
    const normalizedName = collectr
      ? collectrCardName(sourceName)
      : { name: sourceName, treatment: "standard" };
    const name = normalizedName.name;
    const errors: string[] = [];
    let game = normalize(get("game") || defaultGame);
    game =
      (
        {
          pokémon: "pokemon",
          "pokemon tcg": "pokemon",
          "pokémon tcg": "pokemon",
          mtg: "magic",
          "disney lorcana": "lorcana",
          "star wars: unlimited": "star-wars",
          "magic: the gathering": "magic",
          "magic the gathering": "magic",
          "star wars unlimited": "star-wars",
          "one piece": "one-piece",
          onepiece: "one-piece",
          "one piece card game": "one-piece",
          "one piece tcg": "one-piece",
        } as Record<string, string>
      )[game] || game;
    const language = normalizeLanguage(
      get("language") ||
        (/\((?:JP|JPN)(?: alternate art)?\)/i.test(sourceName)
          ? "ja"
          : /\(CN\)/i.test(sourceName)
            ? "zh"
            : options.defaultLanguage || ""),
    );
    const conditionText = get("condition");
    const condition =
      conditions.find((c) => normalize(c) === normalize(conditionText)) ||
      (
        {
          nm: "Near Mint",
          lp: "Lightly Played",
          mp: "Moderately Played",
          hp: "Heavily Played",
          dmg: "Damaged",
          "casi nueva": "Near Mint",
          "poco uso": "Lightly Played",
          "uso moderado": "Moderately Played",
          "mucho uso": "Heavily Played",
          dañada: "Damaged",
          "producto sellado": "Sealed Product",
        } as Record<string, string>
      )[normalize(conditionText)] ||
      "unknown";
    const quantity = get("quantity") === "" ? 1 : Number(get("quantity"));
    const costText = get("acquisitionCostCrc");
    const acquisitionCostCrc =
      costText === "" ? null : Number(costText.replace(/,/g, ""));
    const inferredSealed =
      collectr &&
      !get("collectorNumber") &&
      /\b(elite trainer box|gift bundle|booster (?:display|box|bundle|pack)|etb)\b/i.test(
        sourceName,
      );
    const kind =
      normalize(get("kind")) === "sealed" ||
      normalize(get("kind")) === "sellado" ||
      inferredSealed
        ? "sealed"
        : "single";
    const finish =
      kind === "sealed" ? "Sealed" : normalizeFinish(get("finish"));
    if (!name) errors.push("Falta nombre");
    if (!get("setName")) errors.push("Falta set");
    if (kind === "single" && !get("collectorNumber"))
      errors.push("Falta número de carta");
    if (!games.includes(game as (typeof games)[number]))
      errors.push("Juego no compatible");
    const watchlistIndex = headers.indexOf("watchlist");
    if (
      watchlistIndex >= 0 &&
      /^(true|1|yes)$/i.test(cells[watchlistIndex] || "")
    )
      errors.push("Watchlist: confirma stock propio antes de importar");
    const grade = cells[headers.indexOf("grade")] || "";
    if (grade && !/^(ungraded|raw)$/i.test(grade))
      errors.push("Carta graduada: requiere revisión separada");
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 100000)
      errors.push("Cantidad inválida");
    if (
      acquisitionCostCrc !== null &&
      (!Number.isSafeInteger(acquisitionCostCrc) || acquisitionCostCrc < 0)
    )
      errors.push("Costo CRC inválido");
    if (cells.length !== headers.length)
      errors.push("La cantidad de columnas no coincide");
    const marketAmount =
      marketIndex >= 0 && cells[marketIndex] !== ""
        ? Number(cells[marketIndex])
        : NaN;
    const overrideText = cells[headers.indexOf("price override")] || "";
    const override = overrideText === "" ? NaN : Number(overrideText);
    return {
      rowNumber: i + 2,
      name,
      setName: get("setName"),
      collectorNumber: get("collectorNumber"),
      game,
      language,
      condition: kind === "sealed" ? "Sealed Product" : condition,
      finish,
      quantity,
      acquisitionCostCrc,
      provider: normalize(get("provider")),
      externalId: get("externalId"),
      treatment: get("treatment") || normalizedName.treatment,
      kind,
      errors,
      raw,
      ...(Number.isFinite(marketAmount) && marketAmount > 0
        ? {
            sourceMarketPrice: {
              amount: marketAmount,
              currency: options.sourceCurrency || "unknown",
              observedAt: marketDate,
            },
          }
        : {}),
      ...(Number.isFinite(override) && override > 0
        ? {
            sourcePriceOverride: {
              amount: override,
              currency: options.sourceCurrency || "unknown",
            },
          }
        : {}),
    };
  });
  return {
    rows,
    headers: parsed[0],
    hash: createHash("sha256")
      .update(
        JSON.stringify({
          rows: rows.map(({ raw: _raw, ...r }) => r),
          defaultGame,
        }),
      )
      .digest("hex"),
  };
}
export const catalogCardSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  setName: z.string().min(1),
  collectorNumber: z.string(),
  game: z.enum(games),
  language: z.string(),
  provider: z.string(),
  externalId: z.string(),
  imageUrl: z.string().url().nullable(),
  verified: z.boolean().default(false),
  treatment: z.string().default("standard"),
  kind: z.enum(["single", "sealed"]).default("single"),
});
export type CatalogCard = z.infer<typeof catalogCardSchema>;
export function sameCollectorNumber(a: string, b: string) {
  const parts = (v: string) =>
    v.split("/").map((p) => {
      const n = normalize(p).toUpperCase();
      return /^\d+$/.test(n) ? n.replace(/^0+(?=\d)/, "") : n;
    });
  const x = parts(a),
    y = parts(b);
  return x[0] === y[0] && (x.length < 2 || y.length < 2 || x[1] === y[1]);
}
export function matchCandidates(row: ImportRow, cards: CatalogCard[]) {
  const candidates = cards.filter(
    (c) =>
      c.game === row.game &&
      c.kind === row.kind &&
      ((row.externalId &&
        row.provider &&
        c.provider === row.provider &&
        c.externalId === row.externalId) ||
        (normalize(c.setName) === normalize(row.setName) &&
          sameCollectorNumber(c.collectorNumber, row.collectorNumber))),
  );
  const exact = candidates.filter(
    (c) =>
      c.verified &&
      normalize(c.name) === normalize(row.name) &&
      normalize(c.setName) === normalize(row.setName) &&
      sameCollectorNumber(c.collectorNumber, row.collectorNumber) &&
      row.language !== "unknown" &&
      normalizeLanguage(c.language) === row.language &&
      normalize(c.treatment) === normalize(row.treatment),
  );
  return {
    candidates,
    automatic:
      exact.length === 1 && row.condition !== "unknown" && Boolean(row.finish)
        ? exact[0]
        : null,
  };
}
