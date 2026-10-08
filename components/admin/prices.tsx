"use client";
import { useEffect, useRef, useState } from "react";
import { variantLabel } from "@/lib/catalog";
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
import { PriceReviewPanel } from "./price-review";
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
    [picking, setPicking] = useState(true),
    [error, setError] = useState("");
  const calculation = useRef<HTMLHeadingElement>(null);
  const cardRequest = useRef(0);
  const canEdit = role !== "stock";
  const locked =
    !!selected?.price_locked_until &&
    Date.parse(selected.price_locked_until) > Date.now();
  const step = view === "review" ? 3 : !selected ? 0 : choice || manual ? 2 : 1;
  function choose(card: InventoryRecord) {
    cardRequest.current += 1;
    setSelected(card);
    setChoice(null);
    setManual(false);
    setPicking(false);
    setError("");
    setView("check");
  }
  async function loadCard(id: string, signal?: AbortSignal) {
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
      if (attempt === cardRequest.current) choose(card);
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
    setView("review");
    onDone(
      "Precio calculado. Revisa la propuesta y apruébala para actualizar el precio de la tienda.",
    );
  }
  return (
    <div className="price-workspace">
      <p className="price-intro">
        Consulta el mercado, calcula en colones y aprueba el cambio.
      </p>
      <nav className="price-tasks" aria-label="Tareas de precios">
        {(
          [
            ["check", "Consultar una carta"],
            ["review", "Aprobar precios"],
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
      {view !== "history" && (
        <ol className="price-steps" aria-label="Pasos para cambiar un precio">
          {[
            "Elegir carta",
            "Consultar mercado",
            "Calcular en colones",
            "Aprobar cambio",
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
              onSelect={choose}
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
                  <img src={selected.stock_image_url} alt="" />
                )}
                <div>
                  <h3>{selected.canonical_name}</h3>
                  <p>
                    {selected.set_name} · {selected.collector_number}
                  </p>
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
                  <strong>Esta carta todavía necesita confirmación.</strong>
                  <p>
                    Puedes consultar precios. Antes de calcular, confirma la
                    carta física en Inventario.
                  </p>
                  <a
                    href={`/admin/inventario?listing=${encodeURIComponent(selected.listing_id)}`}
                  >
                    Confirmar esta carta en Inventario →
                  </a>
                </div>
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
              {!choice && !manual && (
                <div className="price-flow-stage">
                  <h2>2. Consulta el precio de mercado</h2>
                  <p>
                    Comparamos la misma impresión y acabado. Consultar no cambia
                    el precio de la tienda.
                  </p>
                  <PriceCheckPanel
                    key={`${selected.listing_id}:${selected.identity_verified}:${selected.condition}:${selected.finish}`}
                    listing={selected}
                    disabled={!canEdit}
                    allowUse={canEdit && selected.identity_verified && !locked}
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
              {(choice || manual) && (
                <div className="price-flow-stage">
                  <h2 ref={calculation} tabIndex={-1}>
                    3. Calcula el precio en colones
                  </h2>
                  <p>
                    Se aplican el cambio USD/CRC y tu política de costos y
                    margen. El resultado queda pendiente de aprobación.
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
                        onClick={() => setChoice(null)}
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
                    label="Calcular precio en colones"
                    onDone={calculated}
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
                        <Field label="Moneda" name="currency" value="USD">
                          <option>USD</option>
                          <option>CRC</option>
                        </Field>
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
                      Confirmé set, número, idioma, condición y acabado con la
                      carta física.
                    </label>
                    <p className="small-note">
                      Si falta un cambio vigente, actualízalo en{" "}
                      <a href="/admin/ajustes">Ajustes</a>. El cálculo no
                      publica el nuevo precio.
                    </p>
                  </ActionForm>
                </div>
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
          onCheck={() => setView("check")}
        />
      )}
      {view === "history" && (
        <PriceHistory
          role={role}
          revision={revision}
          onDone={onDone}
          onSelect={(id) => void loadCard(id)}
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
          Todavía no hay consultas guardadas. Empieza en Consultar una carta.
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
