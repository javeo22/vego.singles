import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessPriceReferences,
  priceFingerprint,
  type MarketReference,
  type PricePrinting,
} from "../lib/operations/price-verification";
import { checkMarketPrice } from "../lib/operations/market-sources";
import { commandSchema } from "../lib/operations/validation";
const now = new Date("2026-10-07T18:00:00Z");
const printing: PricePrinting = {
  game: "pokemon",
  language: "en",
  canonical_name: "Furret",
  set_name: "Darkness Ablaze",
  collector_number: "136/189",
  catalog_source: "tcgdex",
  external_card_id: "swsh3-136",
  tcgplayer_product_id: null,
  identity_verified: true,
  condition: "Near Mint",
  finish: "Non-foil",
};
function ref(overrides: Partial<MarketReference> = {}): MarketReference {
  return {
    id: "one",
    amount: 2,
    currency: "USD",
    marketplace: "tcgplayer",
    feed: "tcgdex",
    sourceUrl: "https://www.tcgplayer.com/product/1",
    providerUpdatedAt: "2026-10-07T12:00:00Z",
    checkedAt: now.toISOString(),
    productId: "1",
    finish: "Non-foil",
    conditionCoverage: "market_aggregate",
    ...overrides,
  };
}
test("mirrors of TCGplayer count as one market and mixed currencies never produce an average", () => {
  const report = assessPriceReferences(
    printing,
    [
      ref(),
      ref({ id: "two", feed: "pokemontcg", amount: 2.1 }),
      ref({
        id: "eur",
        marketplace: "cardmarket",
        currency: "EUR",
        amount: 100,
      }),
    ],
    [],
    72,
    now,
  );
  assert.equal(report.independentMarkets, 2);
  assert.equal(report.recommendedId, "one");
  assert.equal(report.status, "reference_available");
  assert.ok(report.warnings.some((w) => w.includes("mismo mercado")));
  assert.ok(report.warnings.some((w) => w.includes("EUR/USD")));
  assert.equal(report.manualReviewRequired, true);
});
test("stale, missing, future and invalid provider dates are excluded instead of being refreshed by fetch time", () => {
  const report = assessPriceReferences(
    printing,
    [
      ref({ providerUpdatedAt: "2026-10-01T00:00:00Z" }),
      ref({ id: "unknown", providerUpdatedAt: null }),
      ref({ id: "invalid", providerUpdatedAt: "bad" }),
      ref({ id: "future", providerUpdatedAt: "2026-11-01T00:00:00Z" }),
    ],
    [],
    72,
    now,
  );
  assert.equal(report.status, "needs_review");
  assert.equal(report.recommendedId, null);
  assert.deepEqual(
    report.references.map((r) => r.freshness),
    ["stale", "unknown", "invalid", "invalid"],
  );
});
test("large feed disagreements and unverified physical identities cannot recommend a price", () => {
  const report = assessPriceReferences(
    printing,
    [ref(), ref({ id: "two", amount: 4 })],
    [],
    72,
    now,
  );
  assert.equal(report.recommendedId, null);
  assert.ok(report.warnings.some((w) => w.includes("15%")));
  assert.equal(
    assessPriceReferences(
      { ...printing, identity_verified: false },
      [ref()],
      [],
      72,
      now,
    ).recommendedId,
    null,
  );
  assert.notEqual(
    priceFingerprint(printing),
    priceFingerprint({ ...printing, finish: "Foil" }),
  );
});
function fetcher(routes: Record<string, unknown>): typeof fetch {
  return (async (url) => {
    const body = routes[String(url)];
    return new Response(JSON.stringify(body || {}), {
      status: body ? 200 : 503,
    });
  }) as typeof fetch;
}
function dex(updated = new Date().toISOString()) {
  return {
    id: "swsh3-136",
    name: "Furret",
    localId: "136",
    set: { id: "swsh3", name: "Darkness Ablaze" },
    variants: { normal: true, holo: false },
    pricing: {
      tcgplayer: {
        unit: "USD",
        updated,
        normal: { productId: 1, marketPrice: 2 },
        "reverse-holofoil": { productId: 1, marketPrice: 5 },
      },
      cardmarket: {
        unit: "EUR",
        updated,
        idProduct: 2,
        trend: 1.8,
        "trend-holo": 99,
      },
    },
  };
}
test("TCGdex supplies dated Pokémon prices and does not mix reverse/holo Cardmarket buckets", async () => {
  const f = fetcher({ "https://api.tcgdex.net/v2/en/cards/swsh3-136": dex() });
  const report = await checkMarketPrice(printing, "Near Mint", "Non-foil", f);
  assert.equal(report.status, "reference_available");
  assert.equal(report.references.find((r) => r.currency === "USD")?.amount, 2);
  const reverse = await checkMarketPrice(
    printing,
    "Near Mint",
    "Reverse Holofoil",
    f,
  );
  assert.equal(reverse.references.length, 1);
  assert.equal(reverse.references[0].amount, 5);
});
test("another printing, incorrect units and zero market prices are never accepted", async () => {
  for (const body of [
    { ...dex(), localId: "137" },
    { ...dex(), name: "Other" },
    {
      ...dex(),
      pricing: {
        tcgplayer: { unit: "EUR", normal: { productId: 1, marketPrice: 2 } },
      },
    },
    {
      ...dex(),
      pricing: {
        tcgplayer: { unit: "USD", normal: { productId: 1, marketPrice: 0 } },
      },
    },
  ]) {
    const report = await checkMarketPrice(
      printing,
      "Near Mint",
      "Non-foil",
      fetcher({ "https://api.tcgdex.net/v2/en/cards/swsh3-136": body }),
    );
    assert.equal(report.references.length, 0);
    assert.equal(report.recommendedId, null);
  }
});
test("TCGdex fallback resolves set plus number instead of copying another provider's card ID", async () => {
  const report = await checkMarketPrice(
    {
      ...printing,
      catalog_source: "pokemon_tcg_api",
      external_card_id: "different-id",
    },
    "Near Mint",
    "Non-foil",
    fetcher({
      "https://api.tcgdex.net/v2/en/sets": [
        { id: "swsh3", name: "Darkness Ablaze" },
      ],
      "https://api.tcgdex.net/v2/en/sets/swsh3": {
        cards: [{ id: "swsh3-136", name: "Furret", localId: "136" }],
      },
      "https://api.tcgdex.net/v2/en/cards/swsh3-136": dex(),
    }),
  );
  assert.ok(report.references.some((r) => r.feed === "tcgdex"));
});
test("the production pokemon_tcg_api alias is supported and provider timestamps are retained", async () => {
  const updated = new Date().toISOString();
  const report = await checkMarketPrice(
    {
      ...printing,
      catalog_source: "pokemon_tcg_api",
      external_card_id: "swsh3-136",
    },
    "Near Mint",
    "Non-foil",
    fetcher({
      "https://api.pokemontcg.io/v2/cards/swsh3-136": {
        data: {
          id: "swsh3-136",
          name: "Furret",
          number: "136",
          set: { name: "Darkness Ablaze" },
          tcgplayer: {
            url: "https://www.tcgplayer.com/product/1",
            updatedAt: updated,
            prices: { normal: { market: 2 } },
          },
        },
      },
    }),
  );
  assert.equal(report.references[0].providerUpdatedAt, updated);
});
function csvRoutes(
  gameName: string,
  categoryId: number,
  productNumber = "21/204",
  subTypeName = "Normal",
) {
  return {
    "https://tcgcsv.com/tcgplayer/categories": {
      results: [{ categoryId, name: gameName }],
    },
    [`https://tcgcsv.com/tcgplayer/${categoryId}/groups`]: {
      results: [{ groupId: 1, name: "Set" }],
    },
    [`https://tcgcsv.com/tcgplayer/${categoryId}/1/products`]: {
      results: [
        {
          productId: 10,
          categoryId,
          groupId: 1,
          name: "Card",
          extendedData: [{ name: "Number", value: productNumber }],
        },
      ],
    },
    [`https://tcgcsv.com/tcgplayer/${categoryId}/1/prices`]: {
      lastUpdated: new Date().toISOString(),
      results: [{ productId: 10, subTypeName, marketPrice: 20, lowPrice: 1 }],
    },
  };
}
test("a common TCGCSV protocol selects market price and exact finish for all four TCGs", async () => {
  for (const [game, name, category] of [
    ["magic", "Magic: The Gathering", 1],
    ["pokemon", "Pokemon", 3],
    ["lorcana", "Lorcana TCG", 71],
    ["star-wars", "Star Wars: Unlimited", 79],
  ] as const) {
    const report = await checkMarketPrice(
      {
        ...printing,
        game,
        catalog_source: "manual",
        external_card_id: null,
        set_name: "Set",
        canonical_name: "Card",
        collector_number: "21/204",
      },
      "Near Mint",
      "Non-foil",
      fetcher(csvRoutes(name, category)),
    );
    assert.equal(report.references[0].amount, 20);
    assert.equal(report.references[0].marketplace, "tcgplayer");
    assert.equal(report.status, "reference_available");
  }
});
test("TCGCSV rejects ambiguous products, wrong card IDs and the wrong finish", async () => {
  const p = {
    ...printing,
    game: "lorcana",
    catalog_source: "manual",
    external_card_id: null,
    set_name: "Set",
    collector_number: "21/204",
    tcgplayer_product_id: "10",
  };
  const wrong = await checkMarketPrice(
    p,
    "Near Mint",
    "Non-foil",
    fetcher(csvRoutes("Disney Lorcana", 71, "22/204")),
  );
  assert.equal(wrong.references.length, 0);
  const foil = await checkMarketPrice(
    p,
    "Near Mint",
    "Foil",
    fetcher(csvRoutes("Disney Lorcana", 71)),
  );
  assert.equal(foil.references.length, 0);
  const routes = csvRoutes("Disney Lorcana", 71);
  const product =
    routes["https://tcgcsv.com/tcgplayer/71/1/products"].results[0];
  (
    routes["https://tcgcsv.com/tcgplayer/71/1/products"].results as unknown[]
  ).push({
    ...product,
    productId: 11,
  });
  const ambiguous = await checkMarketPrice(
    { ...p, tcgplayer_product_id: null },
    "Near Mint",
    "Non-foil",
    fetcher(routes),
  );
  assert.equal(ambiguous.references.length, 0);
});
test("real TCGCSV envelopes use the artifact publication date and exact Pokémon series prefixes", async () => {
  const published = new Date().toUTCString();
  const routes = csvRoutes("Pokemon", 3, "136/189") as Record<
    string,
    { results: Record<string, unknown>[]; lastUpdated?: string }
  >;
  routes["https://tcgcsv.com/tcgplayer/3/groups"].results[0].name =
    "SWSH03: Darkness Ablaze";
  routes["https://tcgcsv.com/tcgplayer/3/1/products"].results[0].name =
    "Furret";
  delete routes["https://tcgcsv.com/tcgplayer/3/1/prices"].lastUpdated;
  const request = (async (url: string) =>
    new Response(JSON.stringify(routes[url] || {}), {
      status: routes[url] ? 200 : 404,
      headers: { "last-modified": published },
    })) as typeof fetch;
  const report = await checkMarketPrice(
    { ...printing, catalog_source: null, external_card_id: null },
    "Near Mint",
    "Non-foil",
    request,
  );
  const r = report.references.find((r) => r.feed === "tcgcsv")!;
  assert.equal(r.providerUpdatedAt, new Date(published).toISOString());
  assert.equal(r.timestampBasis, "feed_published");
  routes["https://tcgcsv.com/tcgplayer/3/1/products"].results[0].name =
    "Furret (Alternate Art)";
  assert.equal(
    (
      await checkMarketPrice(
        { ...printing, catalog_source: null, external_card_id: null },
        "Near Mint",
        "Non-foil",
        request,
      )
    ).references.length,
    0,
  );
});
test("special treatments need exact manual evidence without reading standard-edition prices", async () => {
  let calls = 0;
  const report = await checkMarketPrice(
    { ...printing, treatment: "hyperspace" },
    "Near Mint",
    "Non-foil",
    (async () => {
      calls++;
      return new Response();
    }) as typeof fetch,
  );
  assert.equal(calls, 0);
  assert.equal(report.status, "unavailable");
});
test("known promo-set aliases and Magic face naming retain exact numbered-product checks", async () => {
  const routes = csvRoutes("Pokemon", 3, "136/189") as Record<
    string,
    { results: Record<string, unknown>[]; lastUpdated?: string }
  >;
  routes["https://tcgcsv.com/tcgplayer/3/groups"].results[0].name =
    "SV: Scarlet & Violet Promo Cards";
  routes["https://tcgcsv.com/tcgplayer/3/1/products"].results[0].name =
    "Furret";
  const p = {
    ...printing,
    catalog_source: null,
    external_card_id: null,
    set_name: "Scarlet & Violet Black Star Promos",
  };
  assert.ok(
    (
      await checkMarketPrice(p, "Near Mint", "Non-foil", fetcher(routes))
    ).references.some((r) => r.feed === "tcgcsv"),
  );
  routes["https://tcgcsv.com/tcgplayer/3/groups"].results[0].name =
    "SWSH: Sword & Shield Promo Cards";
  assert.ok(
    (
      await checkMarketPrice(
        { ...p, set_name: "SWSH Black Star Promos" },
        "Near Mint",
        "Non-foil",
        fetcher(routes),
      )
    ).references.some((r) => r.feed === "tcgcsv"),
  );
  const magic = csvRoutes("Magic", 1) as Record<
    string,
    { results: Record<string, unknown>[]; lastUpdated?: string }
  >;
  magic["https://tcgcsv.com/tcgplayer/1/1/products"].results[0].name =
    "Emet-Selch, Unsundered";
  const m = {
    ...printing,
    game: "magic",
    set_name: "Set",
    collector_number: "21/204",
    canonical_name: "Emet-Selch, Unsundered // Hades, Sorcerer of Eld",
    catalog_source: null,
    external_card_id: null,
  };
  assert.ok(
    (await checkMarketPrice(m, "Near Mint", "Non-foil", fetcher(magic)))
      .references.length,
  );
  magic["https://tcgcsv.com/tcgplayer/1/1/products"].results[0].name =
    "Emet-Selch, Unsundered (Borderless)";
  assert.equal(
    (await checkMarketPrice(m, "Near Mint", "Non-foil", fetcher(magic)))
      .references.length,
    0,
  );
});
test("price evidence requires both report and reference IDs or neither", () => {
  const input = {
    action: "evidence",
    key: crypto.randomUUID(),
    payload: {
      id: crypto.randomUUID(),
      amount: 20,
      currency: "USD",
      provider: "manual",
      sourceUrl: "https://example.com/card",
      observedAt: new Date().toISOString(),
      priceType: "market_reference",
      exactVariant: true,
    },
  };
  assert.equal(commandSchema.safeParse(input).success, true);
  assert.equal(
    commandSchema.safeParse({
      ...input,
      payload: { ...input.payload, priceCheckId: crypto.randomUUID() },
    }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({
      ...input,
      payload: {
        ...input.payload,
        priceCheckId: crypto.randomUUID(),
        priceReferenceId: "tcgcsv:1:Non-foil:USD",
      },
    }).success,
    true,
  );
});
test("Japanese and played cards request comparable evidence without borrowing English NM prices", async () => {
  let calls = 0;
  const request = (async () => {
    calls++;
    return new Response("{}");
  }) as typeof fetch;
  for (const [p, condition] of [
    [{ ...printing, language: "ja" }, "Near Mint"],
    [printing, "Lightly Played"],
  ] as const) {
    assert.equal(
      (await checkMarketPrice(p, condition, "Non-foil", request)).status,
      "unavailable",
    );
  }
  assert.equal(calls, 0);
});
