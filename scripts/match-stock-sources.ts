import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  comparisonPrices,
  sourceKey,
  sourceSetKey,
  sourceProductCandidates,
  type SourceProduct,
  type SourceMatch,
  type SourceReview,
} from "../lib/operations/source-matching";
import {
  sameCollectorNumber,
  normalizeFinish,
} from "../lib/operations/imports";
import {
  assessPriceReferences,
  type PricePrinting,
} from "../lib/operations/price-verification";

type Document = {
  url: string;
  fetchedAt: string;
  lastModified: string | null;
  data: any;
};
const categoryIds: Record<string, number> = {
  magic: 1,
  pokemon: 3,
  "one-piece": 68,
  "star-wars": 79,
};
const envelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ results: z.array(item), lastUpdated: z.string().optional() });
const groupSchema = envelope(
  z.object({ groupId: z.number(), name: z.string() }),
);
const productSchema = envelope(
  z.object({
    productId: z.number(),
    categoryId: z.number().optional(),
    groupId: z.number().optional(),
    name: z.string(),
    extendedData: z
      .array(z.object({ name: z.string(), value: z.string() }))
      .optional(),
  }),
);
const priceSchema = envelope(
  z.object({
    productId: z.number(),
    subTypeName: z.string(),
    marketPrice: z.number().nullable(),
  }),
);

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) =>
    args
      .find((value) => value.startsWith(`--${name}=`))
      ?.slice(name.length + 3);
  const snapshotPath = arg("snapshot");
  const directory = resolve(arg("directory") || ".local/source-matches");
  if (!snapshotPath)
    throw new Error(
      "Usage: tsx scripts/match-stock-sources.ts --snapshot=PRIVATE_SNAPSHOT.json --directory=PRIVATE_OUTPUT",
    );
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  await mkdir(resolve(directory, "cache"), { recursive: true, mode: 0o700 });
  const pending = new Map<string, Promise<Document>>();
  let scryfallLastRequest = 0;
  async function load(url: string, body?: unknown): Promise<Document> {
    assert.ok(/^https:\/\/(tcgcsv\.com|api\.scryfall\.com)\//.test(url));
    const key = createHash("sha256")
      .update(url + (body ? JSON.stringify(body) : ""))
      .digest("hex");
    if (pending.has(key)) return pending.get(key)!;
    const promise = (async () => {
      const path = resolve(directory, "cache", `${key}.json`);
      try {
        const previous: Document = JSON.parse(await readFile(path, "utf8"));
        if (Date.now() - Date.parse(previous.fetchedAt) < 3 * 3600000)
          return previous;
      } catch {}
      for (let attempt = 0; attempt < 3; attempt++) {
        if (url.startsWith("https://api.scryfall.com")) {
          const wait = Math.max(0, scryfallLastRequest + 150 - Date.now());
          if (wait) await new Promise((done) => setTimeout(done, wait));
          scryfallLastRequest = Date.now();
        }
        try {
          const response = await fetch(url, {
            method: body ? "POST" : "GET",
            headers: {
              Accept: "application/json",
              "User-Agent": "VegoSingles/1.0 (catalog review; vego.singles)",
              ...(body ? { "Content-Type": "application/json" } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(20000),
          });
          if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
          const doc: Document = {
            url,
            fetchedAt: new Date().toISOString(),
            lastModified: response.headers.get("last-modified"),
            data: await response.json(),
          };
          await writeFile(path, JSON.stringify(doc), { mode: 0o600 });
          return doc;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((done) => setTimeout(done, (attempt + 1) * 1000));
        }
      }
      throw new Error("Provider unavailable");
    })();
    pending.set(key, promise);
    return promise;
  }
  const groups: Record<string, z.infer<typeof groupSchema>["results"]> = {};
  for (const [game, id] of Object.entries(categoryIds))
    groups[game] = groupSchema.parse(
      (await load(`https://tcgcsv.com/tcgplayer/${id}/groups`)).data,
    ).results;
  const sets: Array<{ code: string; name: string }> = z
    .object({ data: z.array(z.object({ code: z.string(), name: z.string() })) })
    .parse((await load("https://api.scryfall.com/sets")).data).data;
  const specialCodes: Record<string, string> = {
    "commander innistrad midnight hunt": "mic",
    "commander the lord of the rings tales of middle earth": "ltc",
    "march of the machine multiverse legends": "mul",
    "outlaws of thunder junction breaking news": "otp",
    "promo pack tarkir dragonstorm": "ptdm",
    "marvel eternal legal": "mar",
  };
  const magicRequests = new Map<
    string,
    { set: string; collector_number: string }
  >();
  const setForPrinting = new Map<string, string>();
  for (const printing of snapshot.printings) {
    if (printing.game !== "magic" || printing.kind === "sealed") continue;
    const code =
      specialCodes[sourceKey(printing.set_name)] ||
      sets
        .filter(
          (set) =>
            sourceSetKey("magic", set.name) ===
            sourceSetKey("magic", printing.set_name),
        )
        .map((set) => set.code)[0];
    const matchingSets = sets.filter(
      (set) =>
        sourceSetKey("magic", set.name) ===
        sourceSetKey("magic", printing.set_name),
    );
    if (
      !code ||
      (!specialCodes[sourceKey(printing.set_name)] && matchingSets.length !== 1)
    )
      continue;
    setForPrinting.set(printing.id, code);
    const number = printing.collector_number
      .split("/")[0]
      .replace(/^0+(?=\d)/, "");
    magicRequests.set(`${code}/${number}`, {
      set: code,
      collector_number: number,
    });
  }
  const scryfallCards: any[] = [];
  const identifiers = [...magicRequests.values()];
  for (let start = 0; start < identifiers.length; start += 75) {
    const document = await load("https://api.scryfall.com/cards/collection", {
      identifiers: identifiers.slice(start, start + 75),
    });
    if (!Array.isArray(document.data.data))
      throw new Error("Invalid Scryfall collection");
    scryfallCards.push(...document.data.data);
    console.log(
      JSON.stringify({
        phase: "catalog",
        checkedMagic: Math.min(start + 75, identifiers.length),
        totalMagic: identifiers.length,
      }),
    );
  }
  const checkedAt = new Date().toISOString();
  const date = (value: string | null | undefined) =>
    value && Number.isFinite(Date.parse(value))
      ? new Date(value).toISOString()
      : null;
  const results: any[] = [];
  for (const printing of snapshot.printings) {
    const listing = snapshot.listings.find(
      (row: any) => row.card_printing_id === printing.id,
    );
    assert.ok(listing);
    const sourceName =
      printing.metadata?.original_data?.["Product Name"] ||
      printing.canonical_name;
    const review: SourceReview = {
      catalogMatches: [],
      comparisonReferences: [],
      reviewReasons: [],
    };
    if (printing.language === "unknown")
      review.reviewReasons.push(
        "Idioma físico sin confirmar; no se deduce del idioma del catálogo.",
      );
    if (!printing.identity_verified)
      review.reviewReasons.push(
        "Falta confirmar identidad, condición y acabado de la carta física.",
      );
    const lots = snapshot.lots.filter(
      (lot: any) => lot.listing_id === listing.id,
    );
    if (lots.some((lot: any) => lot.quarantined))
      review.reviewReasons.push("Stock en cuarentena.");
    if (lots.some((lot: any) => lot.location_code === "UNASSIGNED"))
      review.reviewReasons.push("Ubicación física pendiente.");
    if (
      !snapshot.settings.fx_at ||
      Date.now() - Date.parse(snapshot.settings.fx_at) > 7 * 86400000
    )
      review.reviewReasons.push("Tipo de cambio USD/CRC vencido o sin fecha.");
    const matchingGroups =
      groups[printing.game]?.filter(
        (group) =>
          sourceSetKey(printing.game, group.name) ===
          sourceSetKey(printing.game, printing.set_name),
      ) || [];
    let exactProducts: ReturnType<typeof sourceProductCandidates> = [];
    if (matchingGroups.length === 1) {
      const group = matchingGroups[0];
      const category = categoryIds[printing.game];
      try {
        const products = productSchema.parse(
          (
            await load(
              `https://tcgcsv.com/tcgplayer/${category}/${group.groupId}/products`,
            )
          ).data,
        ).results as SourceProduct[];
        const candidates = sourceProductCandidates(
          { ...printing, sourceName },
          products,
          category,
          group.groupId,
        );
        exactProducts = candidates.filter((candidate) => candidate.exact);
        const selected =
          exactProducts.length === 1 ? exactProducts : candidates.slice(0, 8);
        review.catalogMatches.push(
          ...selected.map(({ product, number, exact }): SourceMatch => ({
            provider: "tcgcsv",
            externalId: String(product.productId),
            name: product.name,
            set: group.name,
            number,
            sourceUrl: `https://www.tcgplayer.com/product/${product.productId}`,
            sourceLanguage: "unknown",
            scope:
              exact && exactProducts.length === 1
                ? "exact_product"
                : "possible_product",
            matchedFields: [
              "game",
              "set",
              ...(printing.collector_number ? ["number"] : []),
              ...(exact ? ["name", "treatment"] : []),
            ],
          })),
        );
        if (exactProducts.length === 1) {
          const document = await load(
            `https://tcgcsv.com/tcgplayer/${category}/${group.groupId}/prices`,
          );
          const prices = priceSchema.parse(document.data);
          review.comparisonReferences.push(
            ...comparisonPrices(
              exactProducts[0].product.productId,
              listing.finish,
              prices.results,
              date(prices.lastUpdated || document.lastModified),
              checkedAt,
            ),
          );
          if (!review.comparisonReferences.length)
            review.reviewReasons.push(
              "El producto no ofrece un precio positivo único para el acabado del CSV.",
            );
        } else
          review.reviewReasons.push(
            exactProducts.length > 1
              ? "Varios productos coinciden; requiere escoger la impresión exacta."
              : "Nombre o tratamiento no acreditados por un producto único.",
          );
      } catch (error) {
        review.reviewReasons.push(
          `Consulta TCGCSV pendiente: ${error instanceof Error ? error.message : "respuesta inválida"}`,
        );
      }
    } else
      review.reviewReasons.push(
        "El set no coincide con un grupo único en TCGCSV.",
      );
    const code = setForPrinting.get(printing.id);
    const cards = scryfallCards.filter((card) => {
      if (
        card.set !== code ||
        !sameCollectorNumber(card.collector_number, printing.collector_number)
      )
        return false;
      const name = card.card_faces?.[0]?.name || card.name.split(" // ")[0];
      const sourceName = printing.canonical_name.replace(/ Art Card$/i, "");
      return (
        sourceKey(name) === sourceKey(sourceName) ||
        (!!card.flavor_name &&
          sourceKey(`${card.flavor_name} - ${name}`) === sourceKey(sourceName))
      );
    });
    if (cards.length === 1) {
      const card = cards[0];
      // Exact printed number identifies artwork; language and finish remain separate review dimensions.
      review.catalogMatches.push({
        provider: "scryfall",
        externalId: card.id,
        name: card.name,
        set: card.set_name,
        number: card.collector_number,
        sourceUrl: card.scryfall_uri || `https://scryfall.com/card/${card.id}`,
        sourceLanguage: card.lang,
        scope: "exact_product",
        matchedFields: ["game", "set", "name", "number"],
        imageUrl:
          card.image_uris?.normal ||
          card.card_faces?.[0]?.image_uris?.normal ||
          null,
      });
      const finish = normalizeFinish(listing.finish);
      const usdKey = (
        { "Non-foil": "usd", Foil: "usd_foil", Etched: "usd_etched" } as Record<
          string,
          string
        >
      )[finish];
      const eurKey = (
        { "Non-foil": "eur", Foil: "eur_foil" } as Record<string, string>
      )[finish];
      // Specialty treatments sharing a numbered artwork may have a separate price.
      if (printing.treatment === "standard" && printing.kind === "single") {
        for (const [currency, key, marketplace] of [
          ["USD", usdKey, "tcgplayer"],
          ["EUR", eurKey, "cardmarket"],
        ] as const) {
          const amount = key ? Number(card.prices?.[key]) : 0;
          if (
            !(amount > 0) ||
            !card.finishes?.includes(
              (
                {
                  "Non-foil": "nonfoil",
                  Foil: "foil",
                  Etched: "etched",
                } as Record<string, string>
              )[finish],
            )
          )
            continue;
          review.comparisonReferences.push({
            id: `scryfall:${card.id}:${finish}:${currency}`,
            amount,
            currency,
            marketplace,
            feed: "scryfall",
            productId: card.id,
            finish,
            sourceUrl: card.scryfall_uri,
            providerUpdatedAt: null,
            checkedAt,
            conditionCoverage: "market_aggregate",
            sourceLanguage: card.lang,
          });
        }
      }
    }
    if (!review.catalogMatches.length)
      review.reviewReasons.push(
        "No se acreditó una impresión en los catálogos consultados.",
      );
    if (review.comparisonReferences.length)
      review.reviewReasons.push(
        "Precios de productos candidatos; idioma/condición físicos pendientes. No son evidencia aprobada de tu variante.",
      );
    if (!listing.price_verified || listing.approved_price_crc <= 0)
      review.reviewReasons.push("Falta aprobar un precio de venta en CRC.");
    const pricePrinting: PricePrinting = {
      ...printing,
      ...listing,
      listing_id: listing.id,
      card_printing_id: printing.id,
    };
    const verification = {
      ...assessPriceReferences(
        pricePrinting,
        [],
        [],
        snapshot.settings.policy.maxAgeHours,
      ),
      ...review,
      checkedAt,
      status: "needs_review",
      warnings: review.reviewReasons,
    };
    results.push({
      printingId: printing.id,
      listingId: listing.id,
      expectedPrinting: printing,
      expectedListing: listing,
      verification,
    });
    if (results.length % 100 === 0)
      console.log(
        JSON.stringify({
          phase: "matched",
          checked: results.length,
          total: snapshot.printings.length,
        }),
      );
  }
  const summary = Object.fromEntries(
    Object.keys(categoryIds).map((game) => {
      const rows = results.filter((row) => row.expectedPrinting.game === game);
      return [
        game,
        {
          variants: rows.length,
          exactProduct: rows.filter((row) =>
            row.verification.catalogMatches.some(
              (match: SourceMatch) => match.scope === "exact_product",
            ),
          ).length,
          ambiguousOnly: rows.filter(
            (row) =>
              row.verification.catalogMatches.length &&
              !row.verification.catalogMatches.some(
                (match: SourceMatch) => match.scope === "exact_product",
              ),
          ).length,
          withComparisonPrices: rows.filter(
            (row) => row.verification.comparisonReferences.length,
          ).length,
          withoutMatch: rows.filter(
            (row) => !row.verification.catalogMatches.length,
          ).length,
        },
      ];
    }),
  );
  await writeFile(
    resolve(directory, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        key: crypto.randomUUID(),
        batchId: "493b833b-24c6-445a-8dba-555e1b401a61",
        checkedAt,
        summary,
        results,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      phase: "ready-for-review",
      summary,
      manifest: resolve(directory, "manifest.json"),
    }),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
