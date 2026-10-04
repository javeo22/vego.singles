import { test } from "node:test";
import assert from "node:assert/strict";
import {
  marketQuote,
  searchCatalog,
  CoverageError,
} from "../lib/operations/providers";
import { parseImport } from "../lib/operations/imports";
import { normalizePublicListing } from "../lib/operations/storefront";
const response = (body: unknown) => async () =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
test("Scryfall quote selects finish and keeps manual confirmation explicit", async () => {
  const p = {
    game: "magic",
    language: "english",
    catalog_source: "scryfall",
    external_card_id: "id",
    tcgplayer_product_id: null,
  };
  const data = {
    id: "id",
    name: "Ring",
    set_name: "Commander",
    collector_number: "1",
    lang: "en",
    prices: { usd: "2.50", usd_foil: "10.00", usd_etched: null },
  };
  const q = await marketQuote(p, "Near Mint", "Foil", response(data));
  assert.equal(q.amount, 10);
  assert.equal(q.exactVariant, false);
  await assert.rejects(
    marketQuote({ ...p, language: "ja" }, "Near Mint", "Foil", response(data)),
    CoverageError,
  );
  await assert.rejects(
    marketQuote(p, "Moderately Played", "Foil", response(data)),
    CoverageError,
  );
});
test("catalog results preserve language and provider identities", async () => {
  const row = parseImport(
    "Name,Set,Number,Language,Condition,Variant,Game\nSol Ring,Commander Masters,396,en,NM,Non-foil,magic",
  ).rows[0];
  const cards = await searchCatalog(
    row,
    response({
      data: [
        {
          id: "uuid",
          name: "Sol Ring",
          set_name: "Commander Masters",
          collector_number: "396",
          lang: "en",
          image_uris: { normal: "https://example.com/card.jpg" },
        },
      ],
    }),
  );
  assert.equal(cards[0].externalId, "uuid");
  assert.equal(cards[0].verified, false);
});
test("legacy availability booleans are never interpreted as quantity", () => {
  assert.equal(
    normalizePublicListing({ id: "1", available: true }).quantity,
    null,
  );
  assert.equal(
    normalizePublicListing({ id: "1", available: false }).quantity,
    0,
  );
  assert.equal(normalizePublicListing({ id: "1", quantity: "4" }).quantity, 4);
});
