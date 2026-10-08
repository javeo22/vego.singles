"use client";
import { useEffect, useRef, useState } from "react";
import { variantLabel } from "@/lib/catalog";
import {
  pricingCardSnapshot,
  pricingExchangeReady,
  missingPricingCardFields,
} from "@/lib/operations/price-workflow";
import type { InventoryRecord, OperationRole } from "@/lib/operations/types";
import type {
  MarketReference,
  PriceCheck,
} from "@/lib/operations/price-verification";
import {
  PriceCheckPanel,
  PriceCheckResults,
  marketName,
  priceDate,
  referencePrice,
} from "./price-check";
import { PriceReviewPanel, PriceUpdateEditor } from "./price-review";
import { PriceExchange } from "./price-exchange";
import {
  ActionForm,
  Feedback,
  Field,
  ListingPicker,
  Pager,
  money,
  statusLabel,
  useData,
  type List,
} from "./shared";

type Choice = { reference: MarketReference; report: PriceCheck };
type PriceView = "check" | "review" | "history";
export function PricesPanel({
  role,
  revision,
  onDone,
}: {
  role: OperationRole;
  revision: number;
  onDone: (message: string) => void;
}) {
  const [view, setView] = useState<PriceView>("check"),
    [selected, setSelected] = useState<InventoryRecord | null>(null),
    [choice, setChoice] = useState<Choice | null>(null),
    [manual, setManual] = useState(false),
    [manualCurrency, setManualCurrency] = useState("USD"),
    [proposalId, setProposalId] = useState<string | null>(null),
    [autoCheck, setAutoCheck] = useState(false),
    [selection, setSelection] = useState(0),
    [exchangeRequest, setExchangeRequest] = useState(0),
    [picking, setPicking] = useState(true),
    [error, setError] = useState("");
  const calculation = useRef<HTMLHeadingElement>(null);
  const cardRequest = useRef(0);
  const settings = useData<List>("type=settings", revision);
  const exchange = settings.data?.rows[0];
  const exchangeReady = pricingExchangeReady(exchange);
  const missingFields = selected ? missingPricingCardFields(selected) : [];
  const canEdit = role !== "stock";
  const locked =
    !!selected?.price_locked_until &&
    Date.parse(selected.price_locked_until) > Date.now();
  const step =
    view === "review"
      ? 3
      : !selected
        ? 0
        : !selected.identity_verified
          ? 1
          : proposalId || choice || manual
            ? 3
            : 2;
  function choose(card: InventoryRecord, automatic = false) {
    cardRequest.current += 1;
    setSelected(card);
    setChoice(null);
    setProposalId(null);
    setAutoCheck(automatic);
    setSelection((n) => n + 1);
    setManual(false);
    setPicking(false);
    setError("");
    setView("check");
  }
  async function loadCard(id: string, signal?: AbortSignal, automatic = false) {
    const attempt = ++cardRequest.current;
    try {
      const response = await fetch(
        `/api/admin?type=inventory&q=${encodeURIComponent(id)}`,
        { signal },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo cargar la carta");
      const card = data.rows?.find((r: InventoryRecord) => r.listing_id === id);
      if (!card) throw new Error("No se encontró la carta. Búscala de nuevo.");
      if (attempt === cardRequest.current) choose(card, automatic);
    } catch (e) {
      if (attempt === cardRequest.current && (e as Error).name !== "AbortError")
        setError(e instanceof Error ? e.message : "No se pudo cargar la carta");
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("listing");
    if (!id) return;
    const controller = new AbortController();
    void loadCard(id, controller.signal);
    return () => controller.abort();
    // Load the link target once; later selections are made by the user.
  }, []);
  useEffect(() => {
    if (choice || manual) calculation.current?.focus();
  }, [choice, manual]);
  function calculated() {
    setChoice(null);
    setManual(false);
    onDone(
      "Cálculo listo. Revisa o edita el precio final y guárdalo para actualizar la tienda.",
    );
  }
  function checkAnother(id?: string) {
    if (id) void loadCard(id, undefined, true);
    else {
      setSelected(null);
      setChoice(null);
      setProposalId(null);
      setManual(false);
      setPicking(true);
      setView("check");
      cardRequest.current += 1;
    }
  }
  function configureExchange() {
    setExchangeRequest((n) => n + 1);
  }
  return (
    <div className="price-workspace">
      <p className="price-intro">
        Elige una carta, comprueba sus datos y decide su precio final. Guardar
        actualiza la tienda.
      </p>
      <nav className="price-tasks" aria-label="Tareas de precios">
        {(
          [
            ["check", "Actualizar una carta"],
            ["review", "Cambios pendientes"],
            ["history", "Consultas anteriores"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className="price-task"
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
      {view === "check" && (
        <ol className="price-steps" aria-label="Pasos para cambiar un precio">
          {[
            "Elegir carta",
            "Confirmar datos",
            "Consultar mercado",
            "Guardar precio",
          ].map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              data-complete={step > index}
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}
      {(selected || view === "review") && (
        <>
          <Feedback error={settings.error} loading={settings.loading} />
          {exchange && (
            <PriceExchange
              settings={exchange}
              role={role}
              onDone={onDone}
              openRequest={exchangeRequest}
              required={
                (!!choice && choice.reference.currency === "USD") ||
                (manual && manualCurrency === "USD")
              }
            />
          )}
        </>
      )}
      {view === "check" && (
        <section className="ops-panel price-card-flow">
          <div className="price-section-heading">
            <h2>1. Elige una carta</h2>
            {selected && (
              <button
                className="button secondary"
                onClick={() => setPicking(!picking)}
              >
                {picking ? "Cerrar búsqueda" : "Elegir otra carta"}
              </button>
            )}
          </div>
          {(!selected || picking) && (
            <ListingPicker
              revision={revision}
              onSelect={(card) => choose(card)}
              label="Buscar por nombre, set o número"
            />
          )}
          {!selected && (
            <p className="price-empty">
              Selecciona una carta para ver su precio actual y consultar el
              mercado.
            </p>
          )}
          {selected && (
            <>
              <div className="price-selected-card">
                {selected.stock_image_url && (
                  <img
                    src={selected.stock_image_url}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.hidden = true;
                    }}
                  />
                )}
                <div>
                  <h3>{selected.canonical_name}</h3>
                  <p>
                    {selected.set_name} · {selected.collector_number}
                  </p>
                  {selected.treatment && selected.treatment !== "standard" && (
                    <p>Edición / tratamiento: {selected.treatment}</p>
                  )}
                  <p>
                    {variantLabel(selected.language)} ·{" "}
                    {variantLabel(selected.condition)} ·{" "}
                    {variantLabel(selected.finish)}
                  </p>
                </div>
                <div className="price-current">
                  <span>Precio actual en la tienda</span>
                  <strong>{money(selected.approved_price_crc)}</strong>
                </div>
              </div>
              {!canEdit && (
                <p className="price-blocker">
                  Solo un propietario o revisor puede consultar el mercado y
                  calcular nuevos precios.
                </p>
              )}
              {!selected.identity_verified && (
                <div className="price-blocker">
                  <h2>2. Confirma los datos de esta carta</h2>
                  <p>
                    «Carta por confirmar» significa que falta registrar la
                    comparación de la carta física con esta ficha.
                  </p>
                  {canEdit && (
                    <ActionForm
                      action="confirm_card"
                      label="Confirmar datos y consultar precio"
                      submitDisabled={missingFields.length > 0}
                      onDone={(m) => {
                        onDone(m);
                        void loadCard(selected.listing_id, undefined, true);
                      }}
                      payload={(d) => ({
                        id: selected.listing_id,
                        expected: pricingCardSnapshot(selected),
                        confirmed: d.get("confirmed") === "on",
                      })}
                    >
                      <label className="ops-check">
                        <input type="checkbox" name="confirmed" required />
                        Comparé la carta física: nombre, set, número, idioma,
                        condición y acabado coinciden con esta ficha.
                      </label>
                      <p className="small-note">
                        Confirma solo si los datos coinciden. Esta acción no
                        cambia el precio, las existencias ni el costo.
                      </p>
                    </ActionForm>
                  )}
                  {missingFields.length > 0 && (
                    <p role="alert">
                      Faltan datos: {missingFields.join(", ")}. Complétalos en
                      Inventario antes de confirmar esta carta.
                    </p>
                  )}
                  <a
                    href={`/admin/inventario?listing=${encodeURIComponent(selected.listing_id)}`}
                  >
                    Los datos no coinciden: corregir ficha en Inventario →
                  </a>
                </div>
              )}
              {selected.identity_verified && (
                <p className="price-card-confirmed">
                  ✓ Datos de la carta confirmados.{" "}
                  <a
                    href={`/admin/inventario?listing=${encodeURIComponent(selected.listing_id)}`}
                  >
                    Corregir ficha
                  </a>
                </p>
              )}
              {locked && (
                <div className="price-blocker">
                  <strong>
                    Este precio está bloqueado hasta{" "}
                    {priceDate(selected.price_locked_until)}.
                  </strong>
                  <p>
                    Revisa el bloqueo en Inventario antes de crear una nueva
                    propuesta.
                  </p>
                  <a
                    href={`/admin/inventario?listing=${encodeURIComponent(selected.listing_id)}`}
                  >
                    Revisar bloqueo →
                  </a>
                </div>
              )}
              {selected.identity_verified &&
                !choice &&
                !manual &&
                !proposalId && (
                  <div className="price-flow-stage">
                    <h2>3. Consulta el precio de mercado</h2>
                    <p>
                      Comparamos la misma impresión y acabado. Consultar no
                      cambia el precio de la tienda.
                    </p>
                    <PriceCheckPanel
                      key={`${selected.listing_id}:${selection}`}
                      listing={selected}
                      disabled={!canEdit}
                      allowUse={
                        canEdit && selected.identity_verified && !locked
                      }
                      autoCheck={autoCheck}
                      onUse={(reference, report) => {
                        if (canEdit && selected.identity_verified && !locked)
                          setChoice({ reference, report });
                      }}
                    />
                    {canEdit && selected.identity_verified && !locked && (
                      <button
                        className="price-text-action"
                        onClick={() => {
                          setChoice(null);
                          setManual(true);
                        }}
                      >
                        Ingresar un precio manual
                      </button>
                    )}
                  </div>
                )}
              {(choice || manual) && !proposalId && (
                <div className="price-flow-stage">
                  <h2 ref={calculation} tabIndex={-1}>
                    Prepara el precio en colones
                  </h2>
                  <p>
                    Se aplican el cambio USD/CRC y tu política de costos y
                    margen. Después podrás editar el precio final antes de
                    guardarlo.
                  </p>
                  {choice && (
                    <div className="price-chosen-reference">
                      <div>
                        <span>Precio de mercado elegido</span>
                        <strong>{referencePrice(choice.reference)}</strong>
                        <small>
                          {marketName(choice.reference.marketplace)} ·{" "}
                          {priceDate(choice.reference.providerUpdatedAt)}
                        </small>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setChoice(null);
                          setAutoCheck(true);
                        }}
                      >
                        Volver a consultar
                      </button>
                    </div>
                  )}
                  {manual && (
                    <div className="price-manual-heading">
                      <h3>Precio ingresado manualmente</h3>
                      <button
                        className="price-text-action"
                        onClick={() => setManual(false)}
                      >
                        Volver a consultar el mercado
                      </button>
                    </div>
                  )}
                  <ActionForm
                    key={`${selected.listing_id}:${choice?.report.jobId || "manual"}`}
                    action="evidence"
                    disabled={!canEdit || !selected.identity_verified || locked}
                    submitDisabled={
                      (choice?.reference.currency || manualCurrency) ===
                        "USD" && !exchangeReady
                    }
                    label="Calcular precio en colones"
                    onDone={calculated}
                    onResult={(result) => setProposalId(result.id)}
                    payload={(data) =>
                      choice
                        ? {
                            id: selected.listing_id,
                            amount: choice.reference.amount,
                            currency: choice.reference.currency,
                            provider: `${choice.reference.marketplace}-via-${choice.reference.feed}`,
                            sourceUrl: choice.reference.sourceUrl,
                            observedAt: choice.reference.providerUpdatedAt,
                            priceType: "market_reference",
                            priceCheckId: choice.report.jobId,
                            priceReferenceId: choice.reference.id,
                            exactVariant: data.get("confirmed") === "on",
                          }
                        : {
                            id: selected.listing_id,
                            amount: Number(data.get("amount")),
                            currency: data.get("currency"),
                            provider: data.get("provider"),
                            sourceUrl: data.get("sourceUrl"),
                            observedAt: new Date(
                              String(data.get("observedAt")),
                            ).toISOString(),
                            priceType: data.get("priceType"),
                            exactVariant: data.get("confirmed") === "on",
                          }
                    }
                  >
                    {manual && (
                      <>
                        <Field
                          label="Precio encontrado"
                          name="amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                        />
                        <label className="ops-field">
                          Moneda
                          <select
                            name="currency"
                            value={manualCurrency}
                            onChange={(e) => setManualCurrency(e.target.value)}
                          >
                            <option>USD</option>
                            <option>CRC</option>
                          </select>
                        </label>
                        <Field
                          label="Sitio donde viste el precio"
                          name="provider"
                          required
                        />
                        <Field
                          label="Enlace al precio o venta"
                          name="sourceUrl"
                          type="url"
                          required
                        />
                        <Field
                          label="Fecha comprobada del precio o venta"
                          name="observedAt"
                          type="datetime-local"
                          required
                        />
                        <Field
                          label="Qué tipo de precio es"
                          name="priceType"
                          value="condition_quote"
                        >
                          <option value="condition_quote">
                            Cotización de la misma condición
                          </option>
                          <option value="market_reference">
                            Precio de mercado
                          </option>
                          <option value="asking_price">
                            Precio anunciado por un vendedor
                          </option>
                          <option value="sale_comparable">
                            Venta completada de una carta comparable
                          </option>
                        </Field>
                      </>
                    )}
                    <label className="ops-check">
                      <input type="checkbox" name="confirmed" required />
                      Revisé que esta referencia corresponde al set, número,
                      idioma, condición y acabado de la carta seleccionada.
                    </label>
                    <p className="small-note">
                      El cálculo prepara una propuesta. El precio actual de la
                      tienda se conserva hasta que pulses Guardar precio en la
                      tienda.
                    </p>
                  </ActionForm>
                </div>
              )}
              {proposalId && (
                <PriceUpdateEditor
                  proposalId={proposalId}
                  role={role}
                  revision={revision}
                  onDone={onDone}
                  onCheck={checkAnother}
                  onExchange={configureExchange}
                  onSaved={(price) =>
                    setSelected((card) =>
                      card
                        ? {
                            ...card,
                            approved_price_crc: price,
                            price_verified: true,
                          }
                        : card,
                    )
                  }
                />
              )}
              {proposalId && (
                <button
                  className="price-text-action"
                  onClick={() => checkAnother()}
                >
                  Actualizar otra carta
                </button>
              )}
            </>
          )}
        </section>
      )}
      {view === "review" && (
        <PriceReviewPanel
          role={role}
          revision={revision}
          onDone={onDone}
          onCheck={checkAnother}
          onExchange={configureExchange}
        />
      )}
      {view === "history" && (
        <PriceHistory
          role={role}
          revision={revision}
          onDone={onDone}
          onSelect={(id) => void loadCard(id, undefined, true)}
        />
      )}
    </div>
  );
}

function PriceHistory({
  role,
  revision,
  onDone,
  onSelect,
}: {
  role: OperationRole;
  revision: number;
  onDone: (message: string) => void;
  onSelect: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const jobs = useData<List>(
    `type=jobs&kind=refresh_price&page=${page}`,
    revision,
  );
  return (
    <section className="price-history">
      <h2>Consultas anteriores</h2>
      <p>
        Abre una consulta para ver los precios encontrados y sus fuentes.
        Consulta de nuevo antes de calcular un cambio.
      </p>
      <Feedback {...jobs} />
      {jobs.data?.rows.map((job) => (
        <article className="price-history-card" key={job.id}>
          <div className="price-section-heading">
            <div>
              <h3>
                {job.result?.verification?.variantSnapshot?.name ||
                  "Consulta de precio"}
              </h3>
              <p>
                {job.result?.verification?.variantSnapshot?.set} ·{" "}
                {priceDate(job.created_at)}
              </p>
            </div>
            <span className="price-state">{statusLabel(job.status)}</span>
          </div>
          {job.result?.verification ? (
            <details>
              <summary>Ver resultado de la consulta</summary>
              <PriceCheckResults report={job.result.verification} />
            </details>
          ) : (
            <p>
              {job.error ||
                job.result?.message ||
                "Esta consulta todavía no tiene un resultado. Procesa las consultas pendientes desde Hoy."}
            </p>
          )}
          <button
            className="button secondary"
            onClick={() => onSelect(job.entity_id)}
          >
            Consultar esta carta de nuevo
          </button>
        </article>
      ))}
      {!jobs.loading && !jobs.error && jobs.data?.total === 0 && (
        <p className="price-empty">
          Todavía no hay consultas guardadas. Empieza en Actualizar una carta.
        </p>
      )}
      {jobs.data && (
        <Pager page={page} total={jobs.data.total} onPage={setPage} />
      )}
      <details className="price-batch">
        <summary>Consultar varias cartas en lote</summary>
        <p>
          Prepara hasta 50 cartas confirmadas. Luego abre Hoy y pulsa Procesar
          siguiente trabajo para obtener los resultados.
        </p>
        <ActionForm
          action="enqueue_refresh"
          label="Preparar consultas en lote"
          disabled={role === "stock"}
          onDone={onDone}
          payload={() => ({})}
        >
          <p className="small-note">
            Solo se agregan cartas con stock e identidad confirmada. No se
            repiten las consultadas en las últimas 24 horas.
          </p>
        </ActionForm>
        <a href="/admin">Ir a Hoy para procesar las consultas →</a>
      </details>
    </section>
  );
}
