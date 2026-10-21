import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://vego.test",
});
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  HTMLDialogElement: {
    value: dom.window.HTMLDialogElement,
    configurable: true,
  },
  IS_REACT_ACT_ENVIRONMENT: { value: true, writable: true, configurable: true },
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new dom.window.Event("close"));
};
const { render, screen, cleanup, within, waitFor } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: ShopProvider, useShop } =
  await import("../components/shop-provider");
const { default: Catalog } = await import("../components/catalog");
const { default: HomeShowcase } = await import("../components/home-showcase");
const { default: CartPanel } = await import("../components/cart-panel");
const { default: Inventory } = await import("../components/inventory");
const { displayExamples } = await import("../lib/catalog");

function Controls() {
  const { query, setQuery, setCartOpen } = useShop();
  return (
    <>
      <input
        aria-label="Test search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button onClick={() => setCartOpen(true)}>Open cart</button>
    </>
  );
}
function shop(initial = displayExamples) {
  const user = userEvent.setup({ document: dom.window.document });
  render(
    <ShopProvider>
      <Controls />
      <Catalog initial={initial} />
      <CartPanel />
    </ShopProvider>,
  );
  return user;
}
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  dom.window.localStorage.clear();
  dom.window.history.replaceState(null, "", "/");
  globalThis.fetch = originalFetch;
  document.body.style.overflow = "";
});

test("account-page cart recovery fetches current public inventory without a catalog component", async () => {
  const id = crypto.randomUUID();
  dom.window.localStorage.setItem(
    "vego.cart.v1",
    JSON.stringify({ version: 1, items: [{ id, count: 1 }] }),
  );
  globalThis.fetch = (async (input) => {
    const url = String(input);
    return new Response(
      JSON.stringify(
        url.startsWith("/api/cart-items")
          ? {
              listings: [
                {
                  ...displayExamples[0],
                  id,
                  sample: false,
                  approved_price_crc: 9000,
                },
              ],
            }
          : { requestsEnabled: false },
      ),
    );
  }) as typeof fetch;
  const user = userEvent.setup({ document: dom.window.document });
  render(
    <ShopProvider>
      <Controls />
      <CartPanel />
    </ShopProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Open cart" }));
  await waitFor(() =>
    assert.ok(within(screen.getByRole("dialog")).getByText("Charizard ex")),
  );
  assert.equal(
    within(screen.getByRole("dialog")).getAllByText("₡9,000").length,
    3,
  );
});

test("a failed cart refresh keeps the saved selection for recovery", async () => {
  const saved = JSON.stringify({
    version: 1,
    items: [{ id: crypto.randomUUID(), count: 1 }],
  });
  dom.window.localStorage.setItem("vego.cart.v1", saved);
  globalThis.fetch = (async () =>
    new Response("{}", { status: 503 })) as typeof fetch;
  render(
    <ShopProvider>
      <Controls />
      <CartPanel />
    </ShopProvider>,
  );
  await waitFor(() =>
    assert.match(
      screen.getByRole("status").textContent || "",
      /selección sigue guardada/,
    ),
  );
  assert.equal(dom.window.localStorage.getItem("vego.cart.v1"), saved);
});

test("saved cart uses current prices, clamps stock, drops unavailable cards and restores delivery choice", async () => {
  const fixture = {
    ...displayExamples[0],
    id: "current-card",
    sample: false,
    quantity: 2,
    approved_price_crc: 7000,
  };
  dom.window.localStorage.setItem(
    "vego.cart.v1",
    JSON.stringify({
      version: 1,
      items: [
        { id: fixture.id, count: 9 },
        { id: "removed-card", count: 1 },
      ],
    }),
  );
  dom.window.localStorage.setItem("vego.fulfillment.v1", "express");
  const user = shop([fixture]);
  await user.click(screen.getByRole("button", { name: "Open cart" }));
  const cart = screen.getByRole("dialog", { name: "Tu carrito." });
  assert.equal(within(cart).getAllByText("₡14,000").length, 3);
  assert.equal(
    (within(cart).getByLabelText("Entrega") as HTMLSelectElement).value,
    "express",
  );
  assert.match(
    screen.getByRole("status").textContent || "",
    /cambiaron de disponibilidad/,
  );
  const saved = JSON.parse(dom.window.localStorage.getItem("vego.cart.v1")!);
  assert.deepEqual(saved, {
    version: 1,
    items: [{ id: fixture.id, count: 2 }],
  });
});

test("shared catalog URL restores exact printing filters and product details", async () => {
  dom.window.history.replaceState(
    null,
    "",
    "/?game=magic&set=Commander+Masters&lang=Ingl%C3%A9s&finish=Sin+foil&card=display-sol-ring",
  );
  const user = shop();
  assert.equal(
    within(screen.getByRole("tabpanel")).getAllByRole("article").length,
    1,
  );
  const detail = screen.getByRole("dialog", { name: "Sol Ring" });
  assert.ok(within(detail).getByText("396"));
  await user.click(
    within(detail).getByRole("button", { name: "Cerrar detalles de la carta" }),
  );
  assert.equal(
    new URL(dom.window.location.href).searchParams.has("card"),
    false,
  );
  assert.equal(
    new URL(dom.window.location.href).searchParams.get("game"),
    "magic",
  );
});

test("catalog loads results in batches and filters exact set, language and finish", async () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({
    ...displayExamples[0],
    id: `card-${i}`,
    sample: false,
    finish: i === 49 ? "reverse_holofoil" : "holofoil",
    card_printings: {
      ...displayExamples[0].card_printings!,
      collector_number: String(i),
    },
  }));
  const user = shop(rows);
  await user.click(screen.getByRole("button", { name: "Ver todo" }));
  assert.equal(
    within(screen.getByRole("tabpanel")).getAllByRole("article").length,
    24,
  );
  await user.click(screen.getByRole("button", { name: "Cargar más cartas" }));
  assert.equal(
    within(screen.getByRole("tabpanel")).getAllByRole("article").length,
    48,
  );
  await user.selectOptions(screen.getByLabelText("Acabado"), "Reverse holo");
  assert.equal(
    within(screen.getByRole("tabpanel")).getAllByRole("article").length,
    1,
  );
  assert.equal(
    new URL(dom.window.location.href).searchParams.get("finish"),
    "Reverse holo",
  );
});

test("catalog search filters by card and reset restores the display", async () => {
  const user = shop();
  await user.type(screen.getByLabelText("Test search"), "Sol Ring");
  const products = screen.getByRole("tabpanel");
  assert.match(products.textContent || "", /Sol Ring/);
  assert.doesNotMatch(products.textContent || "", /Charizard ex/);
  await user.clear(screen.getByLabelText("Test search"));
  await user.type(screen.getByLabelText("Test search"), "missing card");
  assert.ok(screen.getByText("No se encontraron cartas."));
  const emptyState = screen.getByRole("heading", {
    name: "No se encontraron cartas.",
  }).parentElement!;
  await user.click(
    within(emptyState).getByRole("button", { name: "Limpiar filtros" }),
  );
  assert.equal(
    within(screen.getByRole("tabpanel")).getAllByRole("article").length,
    4,
  );
});

test("product-type tabs separate singles and sealed products with keyboard navigation", async () => {
  const user = shop();
  await user.click(screen.getByRole("tab", { name: "Sellados" }));
  assert.equal(
    within(screen.getByRole("tabpanel")).getAllByRole("article").length,
    1,
  );
  assert.match(
    screen.getByRole("tabpanel").textContent || "",
    /Spark of Rebellion/,
  );
  await user.keyboard("{ArrowLeft}");
  assert.equal(
    screen.getByRole("tab", { name: "Singles" }).getAttribute("aria-selected"),
    "true",
  );
  assert.doesNotMatch(
    screen.getByRole("tabpanel").textContent || "",
    /Spark of Rebellion/,
  );
  await user.keyboard("{ArrowLeft}");
  assert.equal(
    screen.getByRole("tab", { name: "Todos" }).getAttribute("aria-selected"),
    "true",
  );
});

test("cart enforces available stock, updates totals, removes items, and unlocks scrolling", async () => {
  const fixture = {
    ...displayExamples[0],
    id: "live-charizard",
    sample: false,
    quantity: 3,
  };
  const user = shop([fixture]);
  await user.click(screen.getByRole("button", { name: "Agregar" }));
  await user.click(screen.getByRole("button", { name: "Open cart" }));
  const cart = screen.getByRole("dialog", { name: "Tu carrito." });
  assert.equal(document.body.style.overflow, "hidden");
  await user.click(
    within(cart).getByRole("button", {
      name: "Aumentar cantidad de Charizard ex",
    }),
  );
  await user.click(
    within(cart).getByRole("button", {
      name: "Aumentar cantidad de Charizard ex",
    }),
  );
  assert.equal(
    (
      within(cart).getByRole("button", {
        name: "Aumentar cantidad de Charizard ex",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(within(cart).getAllByText("₡36,900").length, 3);
  await user.click(
    within(cart).getByRole("button", {
      name: "Reducir cantidad de Charizard ex",
    }),
  );
  assert.equal(within(cart).getAllByText("₡24,600").length, 3);
  let opened = "";
  dom.window.open = ((url: string) => {
    opened = url;
    return null;
  }) as typeof dom.window.open;
  await user.click(
    within(cart).getByRole("button", { name: "Comprar por WhatsApp" }),
  );
  const checkout = new URL(opened);
  assert.equal(checkout.hostname, "wa.me");
  assert.match(checkout.searchParams.get("text") || "", /2x Charizard ex/);
  assert.match(
    checkout.searchParams.get("text") || "",
    /Subtotal de cartas: ₡24,600/,
  );
  await user.click(within(cart).getByRole("button", { name: "Quitar" }));
  assert.ok(within(cart).getByText("Tu carrito está vacío."));
  await user.click(
    within(cart).getByRole("button", { name: "Cerrar carrito" }),
  );
  assert.equal(document.body.style.overflow, "");
});

test("display examples remain labeled and generate an availability inquiry", async () => {
  const user = shop([]);
  assert.ok(screen.getByText(/Productos y precios de referencia/));
  await user.click(screen.getAllByRole("button", { name: "Agregar" })[0]);
  await user.click(screen.getByRole("button", { name: "Open cart" }));
  let opened = "";
  dom.window.open = ((url: string) => {
    opened = url;
    return null;
  }) as typeof dom.window.open;
  await user.click(
    screen.getByRole("button", { name: "Consultar disponibilidad" }),
  );
  assert.match(
    new URL(opened).searchParams.get("text") || "",
    /referencia; confirmar precio y disponibilidad/,
  );
});

test("product details expose the variant and add the selected card", async () => {
  const user = shop();
  await user.click(screen.getByRole("button", { name: "Ver Sol Ring" }));
  const detail = screen.getByRole("dialog", { name: "Sol Ring" });
  assert.ok(within(detail).getByText("Sin foil"));
  await user.click(within(detail).getByRole("button", { name: "Agregar" }));
  assert.ok(
    screen.getByRole("status").textContent?.includes("Sol Ring agregado"),
  );
  assert.equal(screen.queryByRole("dialog", { name: "Sol Ring" }), null);
});

test("inventory stock/status filters and overview use supplied live records", async () => {
  const user = userEvent.setup({ document: dom.window.document });
  const base = {
    listing_id: "one",
    canonical_name: "Charizard ex",
    set_name: "151",
    collector_number: "006",
    language: "English",
    condition: "Near Mint",
    finish: "Holo",
    published: true,
    approved_price_crc: 12300,
    quantity: 4,
    market_price_usd: null,
  };
  render(
    <Inventory
      rows={[
        base,
        {
          ...base,
          listing_id: "two",
          canonical_name: "Sol Ring",
          published: false,
          quantity: 0,
        },
      ]}
      counts={{ listings: 2, drafts: 1, proposals: 0 }}
      unavailable={false}
    />,
  );
  await user.selectOptions(screen.getByLabelText("Existencias"), "in");
  assert.ok(screen.getByText("Charizard ex"));
  assert.equal(screen.queryByText("Sol Ring"), null);
  await user.selectOptions(screen.getByLabelText("Estado"), "draft");
  assert.ok(screen.getByText("No se encontraron cartas."));
  await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  assert.ok(screen.getByText("Sol Ring"));
  await user.type(
    screen.getByLabelText("Buscar en el inventario por carta o ID"),
    "151",
  );
  assert.equal(screen.getAllByText("151").length, 2);
  await user.click(screen.getByRole("button", { name: "Resumen" }));
  assert.ok(screen.getByText("Borradores"));
});

test("catalog leads with high prices and can reverse price order", async () => {
  const user = shop();
  const names = () =>
    within(screen.getByRole("tabpanel"))
      .getAllByRole("article")
      .map((article) =>
        within(article)
          .getByRole("button", { name: /^Ver / })
          .getAttribute("aria-label"),
      );
  assert.deepEqual(names(), [
    "Ver Spark of Rebellion Booster Box",
    "Ver Charizard ex",
    "Ver Stitch — Carefree Surfer",
    "Ver Sol Ring",
  ]);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Ordenar por precio" }),
    "asc",
  );
  assert.deepEqual(names(), [
    "Ver Sol Ring",
    "Ver Stitch — Carefree Surfer",
    "Ver Charizard ex",
    "Ver Spark of Rebellion Booster Box",
  ]);
});

test("missing stock enables an availability inquiry without claiming available copies", async () => {
  const user = shop([
    { ...displayExamples[0], sample: false, quantity: undefined },
  ]);
  assert.equal(screen.queryByRole("button", { name: "Agotado" }), null);
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  const cart = screen.getByRole("dialog", { name: "Tu carrito." });
  assert.ok(within(cart).getByText("Disponibilidad por confirmar"));
  assert.equal(
    (
      within(cart).getByRole("button", {
        name: "Aumentar cantidad de Charizard ex",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  let opened = "";
  dom.window.open = ((url: string) => {
    opened = url;
    return null;
  }) as typeof dom.window.open;
  await user.click(
    within(cart).getByRole("button", { name: "Consultar disponibilidad" }),
  );
  assert.match(
    new URL(opened).searchParams.get("text") || "",
    /1x Charizard ex.*disponibilidad por confirmar/,
  );
});

test("confirmed zero stock stays disabled while numeric API stock enables adding", async () => {
  const user = shop([
    { ...displayExamples[0], sample: false, quantity: 0 },
    {
      ...displayExamples[1],
      sample: false,
      quantity: "2" as unknown as number,
    },
  ]);
  assert.equal(
    (screen.getByRole("button", { name: "Agotado" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  await user.click(screen.getByRole("button", { name: "Agregar" }));
  await user.click(screen.getByRole("button", { name: "Open cart" }));
  const cart = screen.getByRole("dialog", { name: "Tu carrito." });
  await user.click(
    within(cart).getByRole("button", { name: "Aumentar cantidad de Sol Ring" }),
  );
  assert.equal(
    (
      within(cart).getByRole("button", {
        name: "Aumentar cantidad de Sol Ring",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(within(cart).getAllByText("₡5,000").length, 3);
});

test("home showcase opens the exact product without changing search or catalog filters", async () => {
  const user = userEvent.setup({ document: dom.window.document });
  const cards = [
    ...displayExamples,
    {
      ...displayExamples[0],
      id: "sold-out-premium",
      sample: false,
      quantity: 0,
      approved_price_crc: 999999,
      card_printings: {
        ...displayExamples[0].card_printings!,
        canonical_name: "Carta agotada",
      },
    },
  ];
  render(
    <ShopProvider>
      <HomeShowcase initial={cards} />
      <Catalog initial={cards} />
    </ShopProvider>,
  );
  const showcase = screen.getByRole("region", { name: "En vitrina" });
  const names = within(showcase)
    .getAllByRole("article")
    .map((article) =>
      within(article)
        .getByRole("button", { name: /^Ver / })
        .getAttribute("aria-label"),
    );
  assert.deepEqual(names, [
    "Ver detalles de Charizard ex",
    "Ver detalles de Stitch — Carefree Surfer",
    "Ver detalles de Sol Ring",
  ]);
  assert.equal(within(showcase).queryByText("Carta agotada"), null);
  assert.equal(
    within(showcase).queryByText("Spark of Rebellion Booster Box"),
    null,
  );
  await user.click(
    within(showcase).getByRole("button", {
      name: "Ver detalles de Charizard ex",
    }),
  );
  assert.ok(screen.getByRole("dialog", { name: "Charizard ex" }));
  const url = new URL(dom.window.location.href);
  assert.equal(url.searchParams.get("card"), displayExamples[0].id);
  assert.equal(url.searchParams.has("q"), false);
  assert.equal(url.searchParams.has("game"), false);
  assert.equal(
    within(screen.getByRole("tabpanel")).getAllByRole("article").length,
    4,
  );
});

test("home display remains distinct when every listed card is out of stock", () => {
  render(
    <ShopProvider>
      <HomeShowcase
        initial={[{ ...displayExamples[0], sample: false, quantity: 0 }]}
      />
    </ShopProvider>,
  );
  const showcase = screen.getByRole("region", { name: "En vitrina" });
  assert.ok(within(showcase).getByRole("button", { name: "Charizard ex" }));
  assert.ok(within(showcase).getByText("Agotado"));
});

test("saved WhatsApp inquiry uses server totals and retains its key after a failed response", async () => {
  const sent: any[] = [],
    navigated: string[] = [];
  let enabled = false,
    closed = 0;
  globalThis.fetch = (async (url, options) => {
    if (String(url) === "/api/store-settings") {
      enabled = true;
      return new Response(
        JSON.stringify({ requestsEnabled: true, deliveryFeeCrc: 500 }),
      );
    }
    const payload = JSON.parse(String(options?.body));
    sent.push(payload);
    if (sent.length === 1)
      return new Response(JSON.stringify({ error: "Intenta de nuevo" }), {
        status: 502,
      });
    return new Response(
      JSON.stringify({
        number: "VS-123",
        subtotal: 15000,
        delivery: 0,
        deliveryPending: true,
        total: 15000,
        items: [
          {
            quantity: 1,
            price: 15000,
            variant: {
              name: "Charizard ex",
              set: "Scarlet & Violet 151",
              number: "199",
              language: "en",
              condition: "Near Mint",
              finish: "Holofoil",
            },
          },
        ],
      }),
    );
  }) as typeof fetch;
  dom.window.open = (() => ({
    opener: null,
    location: { replace: (url: string) => navigated.push(url) },
    close: () => closed++,
  })) as unknown as typeof dom.window.open;
  const user = shop([
    {
      ...displayExamples[0],
      id: "00000000-0000-4000-8000-000000000021",
      sample: false,
      quantity: 3,
    },
  ]);
  await waitFor(() => assert.equal(enabled, true));
  await user.click(screen.getByRole("button", { name: "Agregar" }));
  await user.click(screen.getByRole("button", { name: "Open cart" }));
  const dialog = within(screen.getByRole("dialog", { name: "Tu carrito." }));
  await user.selectOptions(
    dialog.getByRole("combobox", { name: "Entrega" }),
    "express",
  );
  await user.click(
    dialog.getByRole("button", { name: "Comprar por WhatsApp" }),
  );
  assert.equal(
    (await dialog.findByRole("alert")).textContent,
    "Intenta de nuevo",
  );
  assert.ok(dialog.getByRole("button", { name: "Continuar por WhatsApp" }));
  assert.equal(closed, 1);
  await user.click(
    dialog.getByRole("button", { name: "Comprar por WhatsApp" }),
  );
  await waitFor(() => assert.equal(navigated.length, 1));
  assert.equal(sent[0].key, sent[1].key);
  const message = new URL(navigated[0]).searchParams.get("text")!;
  assert.match(message, /VS-123/);
  assert.match(message, /Total sin envío: ₡15,000/);
  assert.equal(sent[0].fulfillment, "express");
  assert.match(message, /Envío express/);
  assert.match(message, /costo adicional por confirmar/);
  assert.doesNotMatch(message, /Duelist Kingdom|Entrega: ₡0/);
  assert.match(message, /199/);
  assert.match(message, /no reserva/);
});

test("TCG filters keep the search and offer only that game's matching sets and finishes", async () => {
  const rows = displayExamples.slice(0, 2).map((item, index) => ({
    ...item,
    card_printings: {
      ...item.card_printings!,
      canonical_name: "Shared name",
      set_name: index ? "Magic Set" : "Pokemon Set",
    },
  }));
  const user = shop(rows);
  assert.equal(
    (screen.getByLabelText("Set") as HTMLSelectElement).disabled,
    true,
  );
  await user.type(screen.getByLabelText("Test search"), "Shared");
  await user.selectOptions(screen.getByLabelText("TCG"), "pokemon");
  assert.equal(
    (screen.getByLabelText("Set") as HTMLSelectElement).disabled,
    false,
  );
  assert.deepEqual(
    Array.from((screen.getByLabelText("Set") as HTMLSelectElement).options).map(
      (option) => option.value,
    ),
    ["", "Pokemon Set"],
  );
  await user.selectOptions(screen.getByLabelText("Set"), "Pokemon Set");
  await user.selectOptions(screen.getByLabelText("Acabado"), "Holo");
  await user.selectOptions(screen.getByLabelText("TCG"), "magic");
  assert.equal((screen.getByLabelText("Set") as HTMLSelectElement).value, "");
  assert.equal(
    (screen.getByLabelText("Acabado") as HTMLSelectElement).value,
    "",
  );
  assert.deepEqual(
    Array.from((screen.getByLabelText("Set") as HTMLSelectElement).options).map(
      (option) => option.value,
    ),
    ["", "Magic Set"],
  );
  assert.deepEqual(
    Array.from(
      (screen.getByLabelText("Acabado") as HTMLSelectElement).options,
    ).map((option) => option.value),
    ["", "Sin foil"],
  );
  assert.equal(
    (screen.getByLabelText("Test search") as HTMLInputElement).value,
    "Shared",
  );
  assert.equal(
    within(screen.getByRole("tabpanel")).getAllByRole("article").length,
    1,
  );
  assert.equal(new URL(window.location.href).searchParams.get("game"), "magic");
});

test("switching to sealed clears incompatible printing filters and hides card finishes", async () => {
  const box = {
    ...displayExamples[3],
    id: "magic-box",
    card_printings: {
      ...displayExamples[3].card_printings!,
      game: "magic",
      canonical_name: "Magic Booster Box",
      set_name: "Box Set",
    },
  };
  const user = shop([...displayExamples, box]);
  await user.selectOptions(screen.getByLabelText("TCG"), "magic");
  await user.selectOptions(screen.getByLabelText("Set"), "Commander Masters");
  await user.selectOptions(screen.getByLabelText("Acabado"), "Sin foil");
  await user.click(screen.getByRole("tab", { name: "Sellados" }));
  assert.equal(screen.queryByLabelText("Acabado") === null, true);
  assert.equal((screen.getByLabelText("Set") as HTMLSelectElement).value, "");
  assert.match(
    screen.getByRole("tabpanel").textContent || "",
    /Magic Booster Box/,
  );
  assert.doesNotMatch(
    screen.getByRole("tabpanel").textContent || "",
    /Sol Ring|Charizard/,
  );
  assert.equal(new URL(window.location.href).searchParams.has("finish"), false);
});

test("showcase selection distinguishes two printings with the same name", async () => {
  const cards = displayExamples.slice(0, 2).map((item, index) => ({
    ...item,
    card_printings: {
      ...item.card_printings!,
      canonical_name: "Same name",
      set_name: index ? "Second printing" : "First printing",
    },
  }));
  const user = userEvent.setup({ document: dom.window.document });
  render(
    <ShopProvider>
      <HomeShowcase initial={cards} />
      <Catalog initial={cards} />
    </ShopProvider>,
  );
  const article = within(screen.getByRole("region", { name: "En vitrina" }))
    .getAllByRole("article")
    .find((element) => element.textContent?.includes("Second printing"))!;
  await user.click(
    within(article).getByRole("button", { name: "Ver detalles de Same name" }),
  );
  assert.ok(
    within(screen.getByRole("dialog", { name: "Same name" })).getByText(
      "Second printing",
    ),
  );
  assert.equal(
    new URL(window.location.href).searchParams.get("card"),
    cards[1].id,
  );
  assert.equal(new URL(window.location.href).searchParams.has("q"), false);
});

test("closing and browser Back/Forward restore the catalog filters and selected product", async () => {
  dom.window.history.replaceState(
    null,
    "",
    "/?all=1&game=magic&set=Commander+Masters",
  );
  const user = shop();
  await user.click(screen.getByRole("button", { name: "Ver Sol Ring" }));
  await user.click(
    within(screen.getByRole("dialog", { name: "Sol Ring" })).getByRole(
      "button",
      { name: "Cerrar detalles de la carta" },
    ),
  );
  await waitFor(() =>
    assert.equal(new URL(window.location.href).searchParams.has("card"), false),
  );
  assert.equal(new URL(window.location.href).searchParams.get("game"), "magic");
  assert.equal(
    new URL(window.location.href).searchParams.get("set"),
    "Commander Masters",
  );
  dom.window.history.forward();
  await screen.findByRole("dialog", { name: "Sol Ring" });
  assert.equal(
    new URL(window.location.href).searchParams.get("card"),
    "display-sol-ring",
  );
  dom.window.history.back();
  await waitFor(() =>
    assert.equal(
      screen.queryByRole("dialog", { name: "Sol Ring" }) === null,
      true,
    ),
  );
  assert.equal(
    (screen.getByLabelText("Set") as HTMLSelectElement).value,
    "Commander Masters",
  );
});

test("language and finish choices follow the selected TCG set", async () => {
  const cards = [
    displayExamples[0],
    {
      ...displayExamples[0],
      id: "other-set",
      finish: "reverse_holofoil",
      card_printings: {
        ...displayExamples[0].card_printings!,
        set_name: "Other set",
        language: "ja",
      },
    },
  ];
  const user = shop(cards);
  await user.selectOptions(screen.getByLabelText("TCG"), "pokemon");
  await user.selectOptions(
    screen.getByLabelText("Set"),
    "Scarlet & Violet 151",
  );
  assert.deepEqual(
    Array.from(
      (screen.getByLabelText("Idioma") as HTMLSelectElement).options,
    ).map((option) => option.value),
    ["", "Inglés"],
  );
  assert.deepEqual(
    Array.from(
      (screen.getByLabelText("Acabado") as HTMLSelectElement).options,
    ).map((option) => option.value),
    ["", "Holo"],
  );
});
