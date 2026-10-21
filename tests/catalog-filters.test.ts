import assert from "node:assert/strict";
import { test } from "node:test";
import { displayExamples } from "../lib/catalog";
import { facetValues, matchesFacets } from "../lib/catalog-filters";
import {
  defaultFilters,
  readFilters,
  writeFilters,
  changeFilters,
} from "../lib/shop-state";
import { fetchCatalogAttributes } from "../lib/operations/catalog-attributes";
import { database, listing, actor, owner } from "./database";

test("Magic distinguishes unknown colors, colorless cards, multicolor and both-face types", () => {
  const card = {
    ...displayExamples[1],
    card_printings: {
      ...displayExamples[1].card_printings!,
      colors: ["U", "R"],
      type_line: "Legendary Creature — Human // Enchantment — Saga",
    },
  };
  assert.deepEqual(facetValues(card, "color"), ["U", "R", "multicolor"]);
  assert.deepEqual(facetValues(card, "cardType"), ["creature", "enchantment"]);
  assert.ok(
    matchesFacets(card, {
      ...defaultFilters,
      game: "magic",
      color: "U",
      cardType: "enchantment",
    }),
  );
  assert.equal(
    matchesFacets(card, { ...defaultFilters, game: "magic", color: "B" }),
    false,
  );
  assert.deepEqual(
    facetValues(
      { ...card, card_printings: { ...card.card_printings, colors: [] } },
      "color",
    ),
    ["C"],
  );
  assert.deepEqual(
    facetValues(
      { ...card, card_printings: { ...card.card_printings, colors: null } },
      "color",
    ),
    ["unconfirmed"],
  );
});
test("game attributes round-trip in URLs and incompatible attributes are removed", () => {
  const filters = {
    ...defaultFilters,
    game: "magic",
    color: "B",
    cardType: "instant",
    all: true,
  };
  assert.deepEqual(
    readFilters(writeFilters(new URL("https://vego.test/"), filters)),
    filters,
  );
  const changed = changeFilters(filters, { game: "pokemon" });
  assert.equal(changed.color, "");
  assert.equal(changed.cardType, "");
  const sealed = readFilters(
    new URL(
      "https://vego.test/?game=magic&kind=sealed&color=B&type=instant&rarity=rare",
    ),
  );
  assert.equal(sealed.color, "");
  assert.equal(sealed.cardType, "");
  assert.equal(sealed.rarity, "");
  const rarity = readFilters(
    new URL("https://vego.test/?game=one-piece&rarity=sr&color=B"),
  );
  assert.equal(rarity.rarity, "sr");
  assert.equal(rarity.color, "");
});
test("attribute enrichment accepts only the exact product and number, preserving unknown colors", async () => {
  const source = {
    id: crypto.randomUUID(),
    tcgplayer_id: 123,
    collector_number: "1",
    type_line: "Artifact",
    colors: [],
  };
  const printings = [
    {
      id: "correct",
      game: "magic",
      kind: "single",
      identity_verified: true,
      tcgplayer_product_id: "123",
      collector_number: "001",
    },
    {
      id: "wrong-number",
      game: "magic",
      identity_verified: true,
      tcgplayer_product_id: "123",
      collector_number: "2",
    },
  ];
  let calls = 0;
  const request = (async (url) => {
    assert.equal(String(url), "https://api.scryfall.com/cards/tcgplayer/123");
    calls++;
    return new Response(JSON.stringify(source));
  }) as typeof fetch;
  const result = await fetchCatalogAttributes(printings, request);
  assert.equal(calls, 1);
  assert.deepEqual(
    result.map((r) => r.printingId),
    ["correct"],
  );
  assert.deepEqual(result[0].attributes.colors, []);
  assert.deepEqual(
    await fetchCatalogAttributes(
      printings,
      (async () =>
        new Response(
          JSON.stringify({ ...source, colors: undefined }),
        )) as typeof fetch,
    ),
    [],
  );
  assert.deepEqual(
    await fetchCatalogAttributes(
      printings,
      (async () =>
        new Response(
          JSON.stringify({ ...source, tcgplayer_id: 124 }),
        )) as typeof fetch,
    ),
    [],
  );
});
test("catalog projection exposes attributes and Collectr rarity without private metadata; enrichment is service-only", async () => {
  const db = await database();
  try {
    const id = await listing(db);
    await db.exec("reset role");
    await db.query(
      `update card_printings set game='magic',tcgplayer_product_id='123',metadata=$1::jsonb where id=(select card_printing_id from listings where id=$2)`,
      [
        JSON.stringify({
          original_data: { Rarity: "SR", secret: "private" },
          colors: ["B"],
          type_line: "Instant",
        }),
        id,
      ],
    );
    const row = (
      await db.query<any>("select * from storefront_inventory where id=$1", [
        id,
      ])
    ).rows[0];
    assert.equal(row.card_printings.rarity, "SR");
    assert.deepEqual(row.card_printings.colors, ["B"]);
    assert.equal(row.card_printings.type_line, "Instant");
    assert.equal("metadata" in row.card_printings, false);
    const pid = (
      await db.query<any>("select card_printing_id from listings where id=$1", [
        id,
      ])
    ).rows[0].card_printing_id;
    const attributes = {
      provider: "scryfall",
      colors: [],
      type_line: "Artifact",
    };
    await actor(db, owner);
    await assert.rejects(
      db.query("select save_catalog_attributes($1,$2,$3)", [
        pid,
        "123",
        JSON.stringify(attributes),
      ]),
      /permission denied/,
    );
    await actor(db, owner, "service_role");
    assert.equal(
      (
        await db.query<any>("select save_catalog_attributes($1,$2,$3) saved", [
          pid,
          "999",
          JSON.stringify(attributes),
        ])
      ).rows[0].saved,
      false,
    );
    assert.equal(
      (
        await db.query<any>("select save_catalog_attributes($1,$2,$3) saved", [
          pid,
          "123",
          JSON.stringify(attributes),
        ])
      ).rows[0].saved,
      true,
    );
    await db.exec("reset role");
    const after = (
      await db.query<any>("select * from storefront_inventory where id=$1", [
        id,
      ])
    ).rows[0];
    assert.deepEqual(after.card_printings.colors, []);
    assert.equal(after.card_printings.type_line, "Artifact");
    assert.equal(after.quantity, row.quantity);
    assert.equal(after.approved_price_crc, row.approved_price_crc);
  } finally {
    await db.close();
  }
});

test("List reprint prefixes and previously verified Scryfall identities retain exact attribute coverage", async () => {
  const id = crypto.randomUUID();
  const printing = {
    id: "list-card",
    game: "magic",
    kind: "single",
    identity_verified: true,
    tcgplayer_product_id: "123",
    collector_number: "77",
  };
  const source = {
    id,
    tcgplayer_id: 123,
    collector_number: "LGN-77",
    set_name: "The List",
    type_line: "Creature — Zombie",
    colors: ["B"],
  };
  assert.equal(
    (
      await fetchCatalogAttributes(
        [printing],
        (async () => new Response(JSON.stringify(source))) as typeof fetch,
      )
    ).length,
    1,
  );
  const linked = {
    ...printing,
    catalog_source: "scryfall",
    external_card_id: id,
  };
  const calls: string[] = [];
  const result = await fetchCatalogAttributes([linked], (async (url) => {
    calls.push(String(url));
    return calls.length === 1
      ? new Response("{}", { status: 404 })
      : new Response(
          JSON.stringify({
            ...source,
            tcgplayer_id: null,
            collector_number: "77",
          }),
        );
  }) as typeof fetch);
  assert.equal(result.length, 1);
  assert.equal(calls[1], `https://api.scryfall.com/cards/${id}`);
});
