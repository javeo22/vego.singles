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
const { render, screen, cleanup, within } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: ShopProvider, useShop } =
  await import("../components/shop-provider");
const { default: Catalog } = await import("../components/catalog");
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
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
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

test("sealed collection isolates sealed products and keyboard returns to featured", async () => {
  const user = shop();
  await user.click(screen.getByRole("tab", { name: "Productos sellados" }));
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
    screen
      .getByRole("tab", { name: "Destacadas" })
      .getAttribute("aria-selected"),
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
  assert.match(checkout.searchParams.get("text") || "", /Subtotal: ₡24,600/);
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
