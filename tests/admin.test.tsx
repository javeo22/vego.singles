import { JSDOM } from "jsdom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
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
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
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
            calculation: { warnings: ["Costo por confirmar"] },
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
  await user.click(
    await screen.findByRole("checkbox", {
      name: "Seleccionar propuesta Swinub",
    }),
  );
  await user.type(
    screen.getByLabelText("Motivo de revisión"),
    "Cotización revisada",
  );
  await user.click(
    screen.getByRole("button", { name: "Revisar 1 seleccionadas" }),
  );
  await screen.findByText("Propuesta vencida: precio cambió");
  assert.equal(sent[0].action, "bulk_price");
  assert.deepEqual(sent[0].payload.ids, [proposal]);
});
