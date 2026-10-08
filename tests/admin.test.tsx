import { JSDOM } from "jsdom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type {
  MarketReference,
  PriceCheck,
} from "../lib/operations/price-verification";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://example.com/admin",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLDialogElement: dom.window.HTMLDialogElement,
  FormData: dom.window.FormData,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = await import("react");
const { render, screen, within, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { InventoryPanel } = await import("../components/admin/inventory");
const { ImportsPanel } = await import("../components/admin/imports");
const { PricesPanel } = await import("../components/admin/prices");
const { AccountSettings } =
  await import("../components/admin/account-settings");
const { UsersPanel } = await import("../components/admin/users");
const { PriceCheckPanel, PriceCheckResults } =
  await import("../components/admin/price-check");
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  dom.window.history.replaceState({}, "", "/admin");
});
const id = "00000000-0000-4000-8000-000000000021";
const row = {
  listing_id: id,
  card_printing_id: "00000000-0000-4000-8000-000000000022",
  canonical_name: "Swinub",
  set_name: "Battle Partners",
  collector_number: "106/100",
  language: "ja",
  game: "pokemon",
  condition: "Near Mint",
  finish: "Holofoil",
  quantity: 3,
  available_quantity: 3,
  approved_price_crc: 1500,
  identity_verified: true,
  price_verified: true,
  published: false,
  cost_confirmed: false,
  stock_revision: 0,
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const datedReference: MarketReference = {
  id: "tcgcsv:123:Holofoil:USD",
  amount: 20.19,
  currency: "USD",
  marketplace: "tcgplayer",
  feed: "tcgcsv",
  sourceUrl: "https://www.tcgplayer.com/product/123",
  providerUpdatedAt: "2026-10-07T12:34:56.789Z",
  timestampBasis: "feed_published",
  checkedAt: "2026-10-07T13:00:00Z",
  productId: "123",
  finish: "Holofoil",
  conditionCoverage: "market_aggregate",
  freshness: "fresh",
};
function priceReport(overrides: Partial<PriceCheck> = {}): PriceCheck {
  return {
    version: 1,
    jobId: "00000000-0000-4000-8000-000000000041",
    checkedAt: "2026-10-07T13:00:00Z",
    fingerprint: "fixture",
    variantSnapshot: {
      listingId: id,
      printingId: row.card_printing_id,
      game: row.game,
      name: row.canonical_name,
      set: row.set_name,
      number: row.collector_number,
      language: "en",
      condition: row.condition,
      finish: row.finish,
      treatment: "standard",
      kind: "single",
      provider: "pokemontcg",
      externalId: "fixture",
      tcgplayerId: "123",
      identityVerified: true,
    },
    status: "reference_available",
    references: [datedReference],
    failures: [],
    warnings: [],
    independentMarkets: 1,
    recommendedId: datedReference.id,
    maxAgeHours: 72,
    manualReviewRequired: true,
    ...overrides,
  };
}
function mock(handle: (url: URL, body: any) => Response) {
  globalThis.fetch = (async (url, options) =>
    handle(
      new URL(String(url), "https://example.com"),
      options?.body ? JSON.parse(String(options.body)) : null,
    )) as typeof fetch;
}

test("admin inventory requests server pages beyond the first hundred", async () => {
  const pages: number[] = [];
  mock((u) => {
    if (u.searchParams.get("type") === "inventory") {
      pages.push(Number(u.searchParams.get("page")));
      return json({ rows: [row], total: 120 });
    }
    return json({ rows: [], total: 0 });
  });
  render(<InventoryPanel role="owner" revision={0} onDone={() => {}} />);
  await screen.findByRole("button", { name: "Swinub" });
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  await waitFor(() => assert.ok(pages.includes(1)));
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  await waitFor(() => assert.ok(pages.includes(2)));
  assert.ok(screen.getByText(/página 3/));
});
test("stock form retains the operation key after a failed response", async () => {
  const sent: any[] = [];
  mock((u, b) => {
    if (b) {
      sent.push(b);
      return sent.length === 1
        ? json({ error: "Intenta de nuevo" }, 502)
        : json({ message: "Registrado" });
    }
    if (u.searchParams.get("type") === "inventory")
      return json({ rows: [row], total: 1 });
    if (u.searchParams.get("type") === "locations")
      return json({
        rows: [{ code: "SHELF1", label: "Estante", active: true }],
        total: 1,
      });
    return json({ rows: [], total: 0 });
  });
  render(<InventoryPanel role="stock" revision={0} onDone={() => {}} />);
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(await screen.findByRole("button", { name: "Swinub" }));
  const delta = await screen.findByLabelText("Cambio (+ ingreso / − salida)");
  const form = delta.closest("form")!;
  await user.type(delta, "2");
  await user.type(
    within(form).getByLabelText("Motivo"),
    "Recepción verificada",
  );
  await waitFor(() =>
    assert.equal(
      (within(form).getByLabelText("Ubicación") as HTMLSelectElement).value,
      "SHELF1",
    ),
  );
  await user.click(within(form).getByRole("button", { name: "Guardar" }));
  await screen.findByText("Intenta de nuevo");
  await user.click(within(form).getByRole("button", { name: "Guardar" }));
  await waitFor(() => assert.equal(sent.length, 2));
  assert.equal(sent[0].key, sent[1].key);
  assert.equal(sent[0].payload.delta, 2);
});
test("import review preserves Japanese language and full collector number", async () => {
  const batch = "00000000-0000-4000-8000-000000000030",
    rowId = "00000000-0000-4000-8000-000000000031";
  const sent: any[] = [];
  const normalized = {
    rowNumber: 2,
    name: "Swinub (JP)",
    setName: "Battle Partners",
    collectorNumber: "106/100",
    game: "pokemon",
    language: "ja",
    condition: "Near Mint",
    finish: "Holofoil",
    quantity: 1,
    acquisitionCostCrc: null,
    provider: "",
    externalId: "",
    treatment: "standard",
    kind: "single",
    errors: [],
    raw: {},
  };
  mock((u, b) => {
    if (b) {
      sent.push(b);
      if (b.action === "preview_import")
        return json({
          rows: [normalized],
          headers: ["Name", "Set", "Number"],
          total: 1,
        });
      if (b.action === "stage_import")
        return json({ id: batch, message: "Lote guardado" });
      return json({ message: "Verificada" });
    }
    const t = u.searchParams.get("type");
    if (t === "batches")
      return json({
        rows: [
          {
            id: batch,
            name: "Prueba",
            mode: "receipt",
            created_at: new Date().toISOString(),
          },
        ],
        total: 1,
      });
    if (t === "imports")
      return json({
        rows: [
          {
            id: rowId,
            row_number: 2,
            normalized,
            status: "needs_review",
            candidates: [],
            errors: [],
          },
        ],
        total: 1,
      });
    if (t === "locations")
      return json({
        rows: [{ code: "SHELF1", label: "Estante", active: true }],
        total: 1,
      });
    return json({ rows: [], total: 0 });
  });
  render(<ImportsPanel role="owner" revision={0} onDone={() => {}} />);
  const user = userEvent.setup({ document: dom.window.document });
  await user.type(
    screen.getByLabelText("Pegar lista con encabezados"),
    "Name,Set,Number\nSwinub (JP),Battle Partners,106/100",
  );
  await user.click(
    screen.getByRole("button", { name: "Validar y previsualizar" }),
  );
  await screen.findByText("1 filas detectadas. Las primeras 10 aparecen aquí.");
  await user.click(
    screen.getByRole("button", { name: "Guardar lote para revisión" }),
  );
  await user.click(await screen.findByRole("button", { name: "Revisar" }));
  await user.type(
    screen.getByLabelText("Evidencia / motivo"),
    "Verificada con la carta física",
  );
  await user.click(
    screen.getByRole("button", { name: "Confirmar coincidencia" }),
  );
  await waitFor(() =>
    assert.ok(sent.some((b) => b.action === "resolve_import")),
  );
  const p = sent.find((b) => b.action === "resolve_import").payload;
  assert.equal(p.language, "ja");
  assert.equal(p.candidate.collectorNumber, "106/100");
  assert.equal(p.candidate.name, "Swinub");
});
test("price review submits selected proposals and exposes stale-review errors", async () => {
  const proposal = "00000000-0000-4000-8000-000000000040";
  const sent: any[] = [];
  mock((u, b) => {
    if (b) {
      sent.push(b);
      return json({ error: "Propuesta vencida: precio cambió" }, 409);
    }
    if (u.searchParams.get("type") === "proposals")
      return json({
        rows: [
          {
            id: proposal,
            listing_id: id,
            status: "pending",
            current_price_crc: 1500,
            suggested_price_crc: 2000,
            calculation: {
              warnings: ["Costo por confirmar"],
              priceCheck: {
                reference: {
                  marketplace: "tcgplayer",
                  feed: "tcgcsv",
                  amount: 20,
                  timestampBasis: "feed_published",
                  providerUpdatedAt: "2026-10-07T12:00:00Z",
                },
                warnings: ["El feed no ofrece precios por condición"],
              },
            },
            listings: {
              condition: "Near Mint",
              finish: "Holofoil",
              card_printings: {
                canonical_name: "Swinub",
                set_name: "Battle Partners",
              },
            },
          },
        ],
        total: 1,
      });
    return json({ rows: [], total: 0 });
  });
  render(<PricesPanel role="owner" revision={0} onDone={() => {}} />);
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(screen.getByRole("button", { name: "Aprobar precios" }));
  await user.click(
    await screen.findByRole("checkbox", {
      name: "Seleccionar propuesta Swinub",
    }),
  );
  assert.ok(screen.getByText("El feed no ofrece precios por condición"));
  assert.ok(screen.getByText(/Archivo de precios publicado:/));
  await user.type(
    screen.getByLabelText("Motivo de revisión"),
    "Cotización revisada",
  );
  await user.click(screen.getByRole("button", { name: "Guardar decisión" }));
  await screen.findByText("Propuesta vencida: precio cambió");
  assert.equal(sent[0].action, "bulk_price");
  assert.deepEqual(sent[0].payload.ids, [proposal]);
});

test("account settings require confirmation and clear password fields after changing them", async () => {
  const sent: any[] = [];
  const done: string[] = [];
  mock((u, b) => {
    if (b) {
      sent.push({ path: u.pathname, ...b });
      return json({ message: "Contraseña cambiada" });
    }
    return json({ rows: [] });
  });
  render(<AccountSettings onDone={(message) => done.push(message)} />);
  const user = userEvent.setup({ document: dom.window.document });
  await user.type(
    screen.getByLabelText("Contraseña actual"),
    "CurrentFixture!",
  );
  await user.type(screen.getByLabelText("Nueva contraseña"), "Eight456");
  await user.type(
    screen.getByLabelText("Confirmar nueva contraseña"),
    "Wrong456",
  );
  await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  assert.equal(
    (await screen.findByRole("alert")).textContent,
    "Las contraseñas no coinciden.",
  );
  assert.equal(sent.length, 0);
  await user.clear(screen.getByLabelText("Confirmar nueva contraseña"));
  await user.type(
    screen.getByLabelText("Confirmar nueva contraseña"),
    "Eight456",
  );
  await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  await waitFor(() => assert.equal(done.length, 1));
  assert.equal(sent[0].path, "/api/admin/account");
  assert.equal(
    (screen.getByLabelText("Nueva contraseña") as HTMLInputElement).value,
    "",
  );
});

test("users tab protects the owner's own row and creates password accounts through a separate endpoint", async () => {
  const sent: any[] = [];
  mock((u, b) => {
    if (b) {
      sent.push({ path: u.pathname, ...b });
      return json({ message: "Usuario creado" });
    }
    return json({
      rows: [
        {
          email: "owner@example.com",
          role: "owner",
          created_at: new Date().toISOString(),
        },
      ],
      currentEmail: "owner@example.com",
      total: 1,
    });
  });
  render(<UsersPanel role="owner" revision={0} onDone={() => {}} />);
  const own = await screen.findByRole("button", {
    name: "Administrar owner@example.com",
  });
  assert.equal((own as HTMLButtonElement).disabled, true);
  const user = userEvent.setup({ document: dom.window.document });
  await user.type(
    screen.getByLabelText("Correo del nuevo usuario"),
    "new@example.com",
  );
  await user.type(screen.getByLabelText("Contraseña inicial"), "Eight456");
  await user.type(
    screen.getByLabelText("Confirmar contraseña del usuario"),
    "Eight456",
  );
  await user.click(screen.getByRole("button", { name: "Crear usuario" }));
  await waitFor(() => assert.equal(sent.length, 1));
  assert.equal(sent[0].path, "/api/admin/users");
  assert.equal(sent[0].action, "create_user");
  assert.equal(sent[0].role, "stock");
});

test("price checks keep retry keys and only fill evidence after the reviewer chooses a dated reference", async () => {
  const sent: any[] = [];
  const reference = {
    id: "tcgdex:1:Non-foil:USD",
    amount: 2,
    currency: "USD",
    marketplace: "tcgplayer",
    feed: "tcgdex",
    sourceUrl: "https://www.tcgplayer.com/product/1",
    providerUpdatedAt: "2026-10-07T12:00:00Z",
    checkedAt: "2026-10-07T13:00:00Z",
    productId: "1",
    finish: "Non-foil",
    conditionCoverage: "market_aggregate",
    freshness: "fresh",
  };
  mock((url, body) => {
    assert.equal(url.pathname, "/api/admin/price-check");
    sent.push(body);
    return sent.length === 1
      ? json({ error: "Proveedor no disponible" }, 503)
      : json({
          report: {
            version: 1,
            checkedAt: "2026-10-07T13:00:00Z",
            fingerprint: "fixture",
            status: "reference_available",
            references: [reference],
            failures: [],
            warnings: [],
            independentMarkets: 1,
            recommendedId: reference.id,
            maxAgeHours: 72,
            manualReviewRequired: true,
          },
        });
  });
  const used: any[] = [];
  render(
    <PriceCheckPanel
      listing={{ ...row, language: "en" } as any}
      onUse={(r) => used.push(r)}
    />,
  );
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(
    screen.getByRole("button", { name: "Consultar precio de mercado" }),
  );
  assert.equal(
    (await screen.findByRole("alert")).textContent,
    "Proveedor no disponible Puedes volver a intentar la consulta.",
  );
  await user.click(
    screen.getByRole("button", { name: "Consultar precio de mercado" }),
  );
  await screen.findByText("Precio listo para calcular");
  assert.equal(sent[0].key, sent[1].key);
  assert.equal(used.length, 0);
  await user.click(
    screen.getByRole("button", { name: "Continuar con este precio" }),
  );
  assert.equal(used[0].amount, 2);
  assert.equal(used[0].providerUpdatedAt, "2026-10-07T12:00:00Z");
});

test("price-check results expose an undated feed without offering it as verified evidence", () => {
  render(
    <PriceCheckResults
      report={{
        version: 1,
        checkedAt: "2026-10-07T13:00:00Z",
        fingerprint: "fixture",
        variantSnapshot: {
          listingId: row.listing_id,
          printingId: null,
          game: "pokemon",
          name: "Test Card",
          set: "Test Set",
          number: "1",
          language: "en",
          condition: "Near Mint",
          finish: "Non-foil",
          treatment: "standard",
          kind: "single",
          provider: "scryfall",
          externalId: "id",
          tcgplayerId: null,
          identityVerified: true,
        },
        status: "needs_review",
        references: [
          {
            id: "undated",
            amount: 2,
            currency: "USD",
            marketplace: "tcgplayer",
            feed: "scryfall",
            sourceUrl: "https://scryfall.com/card/id",
            providerUpdatedAt: null,
            checkedAt: "2026-10-07T13:00:00Z",
            productId: "id",
            finish: "Non-foil",
            conditionCoverage: "market_aggregate",
            freshness: "unknown",
          },
        ],
        failures: [],
        warnings: [],
        independentMarkets: 0,
        recommendedId: null,
        maxAgeHours: 72,
        manualReviewRequired: true,
      }}
      onUse={() =>
        assert.fail("Undated reference cannot be used automatically")
      }
    />,
  );
  assert.ok(screen.getByText("Fecha no publicada"));
  assert.ok(screen.getByText("No podemos confirmar si está actualizado"));
  assert.ok(
    screen.getByRole("heading", { name: "No hay un precio vigente para usar" }),
  );
  assert.equal(
    screen.queryByRole("button", { name: "Continuar con este precio" }),
    null,
  );
});

test("guided pricing preserves the saved reference and opens review without approving", async () => {
  const report = priceReport();
  const sent: any[] = [];
  const done: string[] = [];
  mock((url, body) => {
    if (url.pathname === "/api/admin/price-check") return json({ report });
    if (body) {
      sent.push(body);
      return json({ message: "Calculado" });
    }
    return url.searchParams.get("type") === "inventory"
      ? json({ rows: [{ ...row, language: "en" }], total: 1 })
      : json({ rows: [], total: 0 });
  });
  render(
    <PricesPanel role="owner" revision={0} onDone={(m) => done.push(m)} />,
  );
  const user = userEvent.setup({ document: dom.window.document });
  assert.ok(screen.getByRole("heading", { name: "1. Elige una carta" }));
  assert.equal(
    screen.queryByRole("button", { name: "Calcular precio en colones" }),
    null,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Preparar consultas en lote" }),
    null,
  );
  await user.click(await screen.findByRole("button", { name: /^Swinub/ }));
  await user.click(
    screen.getByRole("button", { name: "Consultar precio de mercado" }),
  );
  const next = await screen.findByRole("button", {
    name: "Continuar con este precio",
  });
  assert.equal(sent.length, 0);
  const sources = screen
    .getByText("Ver precios y fuentes (1)")
    .closest("details");
  assert.equal(sources?.open, false);
  await user.click(next);
  const calculate = screen.getByRole("button", {
    name: "Calcular precio en colones",
  });
  await user.click(calculate);
  assert.equal(
    sent.length,
    0,
    "Physical confirmation is required before calculating",
  );
  await user.click(screen.getByRole("checkbox", { name: /Confirmé set/ }));
  await user.click(calculate);
  await screen.findByRole("heading", { name: "Precios por aprobar" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, "evidence");
  assert.deepEqual(sent[0].payload, {
    id,
    amount: datedReference.amount,
    currency: datedReference.currency,
    provider: "tcgplayer-via-tcgcsv",
    sourceUrl: datedReference.sourceUrl,
    observedAt: "2026-10-07T12:34:56.789Z",
    priceType: "market_reference",
    priceCheckId: report.jobId,
    priceReferenceId: datedReference.id,
    exactVariant: true,
  });
  assert.match(done[0], /apruébala para actualizar/);
  assert.equal(
    screen
      .getByRole("button", { name: "Aprobar precios" })
      .getAttribute("aria-pressed"),
    "true",
  );
});

test("unconfirmed cards link directly to inventory and cannot use a market reference", () => {
  const report = priceReport();
  report.variantSnapshot.identityVerified = false;
  render(
    <PriceCheckResults
      report={report}
      onUse={() => assert.fail("Identity is pending")}
    />,
  );
  assert.ok(screen.getByRole("heading", { name: "Primero confirma la carta" }));
  assert.equal(
    screen
      .getByRole("link", { name: "Confirmar carta en Inventario" })
      .getAttribute("href"),
    `/admin/inventario?listing=${id}`,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Continuar con este precio" }),
    null,
  );
});

for (const scenario of [
  {
    name: "EUR-only",
    title: "Encontramos un precio solo en euros",
    references: [
      {
        ...datedReference,
        id: "eur",
        currency: "EUR" as const,
        marketplace: "cardmarket" as const,
      },
    ],
  },
  {
    name: "stale",
    title: "No hay un precio vigente para usar",
    references: [{ ...datedReference, freshness: "stale" as const }],
  },
  {
    name: "conflicting",
    title: "Los precios no coinciden",
    references: [
      datedReference,
      { ...datedReference, id: "other", amount: 40 },
    ],
  },
]) {
  test(`${scenario.name} results explain the next step and require manual evidence`, () => {
    render(
      <PriceCheckResults
        report={priceReport({
          status: "needs_review",
          recommendedId: null,
          references: scenario.references,
        })}
        onUse={() => assert.fail("Cannot continue with this result")}
        onManual={() => {}}
      />,
    );
    assert.ok(screen.getByRole("heading", { name: scenario.title }));
    assert.equal(
      screen.queryByRole("button", { name: "Continuar con este precio" }),
      null,
    );
    assert.ok(
      screen.getByRole("button", { name: "Ingresar un precio manual" }),
    );
  });
}

test("inventory links open the requested card rather than the first search result", async () => {
  dom.window.history.replaceState({}, "", `/admin/inventario?listing=${id}`);
  const unrelated = {
    ...row,
    listing_id: "00000000-0000-4000-8000-000000000050",
    canonical_name: "Unrelated Card",
  };
  mock(() => json({ rows: [unrelated, row], total: 2 }));
  render(<InventoryPanel role="owner" revision={0} onDone={() => {}} />);
  const detail = await screen.findByRole("region", {
    name: "Detalle de inventario",
  });
  assert.ok(within(detail).getByRole("heading", { name: "Swinub" }));
  assert.equal(
    within(detail).queryByRole("heading", { name: "Unrelated Card" }),
    null,
  );
});

test("history filters price jobs and requires a fresh consultation before calculating", async () => {
  const requests: URL[] = [];
  mock((u) => {
    requests.push(u);
    if (u.searchParams.get("type") === "jobs")
      return json({
        rows: [
          {
            id: "job",
            entity_id: id,
            status: "needs_review",
            created_at: datedReference.checkedAt,
            result: { verification: priceReport() },
          },
        ],
        total: 1,
      });
    return json({ rows: [row], total: 1 });
  });
  render(<PricesPanel role="owner" revision={0} onDone={() => {}} />);
  const user = userEvent.setup({ document: dom.window.document });
  await user.click(
    screen.getByRole("button", { name: "Consultas anteriores" }),
  );
  await user.click(await screen.findByText("Ver resultado de la consulta"));
  assert.ok(
    requests.some(
      (u) =>
        u.searchParams.get("type") === "jobs" &&
        u.searchParams.get("kind") === "refresh_price" &&
        !u.searchParams.has("status"),
    ),
  );
  assert.equal(
    screen.queryByRole("button", { name: "Continuar con este precio" }),
    null,
  );
  await user.click(
    screen.getByRole("button", { name: "Consultar esta carta de nuevo" }),
  );
  await screen.findByRole("button", { name: "Consultar precio de mercado" });
  assert.equal(
    screen.queryByRole("button", { name: "Calcular precio en colones" }),
    null,
  );
});
