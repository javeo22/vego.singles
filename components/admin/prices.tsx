"use client";
import { useEffect, useState } from "react";
import { variantLabel } from "@/lib/catalog";
import type { InventoryRecord, OperationRole } from "@/lib/operations/types";
import { PriceCheckPanel, PriceCheckResults } from "./price-check";
import {
  ActionForm,
  Feedback,
  Field,
  ListingPicker,
  Pager,
  date,
  money,
  statusLabel,
  useData,
  type List,
} from "./shared";
export function PricesPanel({
  role,
  revision,
  onDone,
}: {
  role: OperationRole;
  revision: number;
  onDone: (m: string) => void;
}) {
  const [selected, setSelected] = useState<InventoryRecord | null>(null),
    [page, setPage] = useState(0),
    [status, setStatus] = useState("pending"),
    [checked, setChecked] = useState<string[]>([]),
    [quote, setQuote] = useState<any>(null);
  const proposals = useData<List>(
    `type=proposals&status=${status}&page=${page}`,
    revision,
  );
  const jobs = useData<List>("type=jobs&status=needs_review", revision);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("listing");
    if (id)
      fetch(`/api/admin?type=inventory&q=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.rows?.[0]) setSelected(d.rows[0]);
        })
        .catch(() => {});
  }, []);
  return (
    <>
      <ActionForm
        action="enqueue_refresh"
        label="Consultar mercado de cartas verificadas"
        disabled={role === "stock"}
        onDone={onDone}
        payload={() => ({})}
      >
        <p className="small-note">
          Agrega hasta 50 cartas. Evita consultas repetidas en las últimas 24
          horas.
        </p>
      </ActionForm>
      <div className="ops-toolbar">
        <label className="ops-field">
          Propuestas
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
              setChecked([]);
            }}
          >
            {["pending", "approved", "rejected", "superseded"].map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Feedback {...proposals} />
      {status === "pending" && (
        <ActionForm
          action="bulk_price"
          disabled={role === "stock" || !checked.length}
          onDone={(m) => {
            setChecked([]);
            onDone(m);
          }}
          label={`Revisar ${checked.length} seleccionadas`}
          payload={(d) => ({
            ids: checked,
            approve: d.get("decision") === "approve",
            reason: d.get("reason"),
          })}
        >
          <Field label="Decisión" name="decision">
            <option value="approve">Aprobar</option>
            <option value="reject">Rechazar</option>
          </Field>
          <Field label="Motivo de revisión" name="reason" required />
          <p className="small-note">
            Revisa las advertencias de cada propuesta. Si alguna cambió, el lote
            completo se detiene.
          </p>
        </ActionForm>
      )}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Selección</th>
              <th>Carta</th>
              <th>Actual → sugerido</th>
              <th>Evidencia y cálculo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {proposals.data?.rows.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.status === "pending" && (
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar propuesta ${p.listings?.card_printings?.canonical_name || p.id}`}
                      checked={checked.includes(p.id)}
                      onChange={(e) =>
                        setChecked(
                          e.target.checked
                            ? [...checked, p.id]
                            : checked.filter((x) => x !== p.id),
                        )
                      }
                    />
                  )}
                </td>
                <td>
                  {p.listings?.card_printings?.canonical_name || p.listing_id}
                  <small>
                    {p.listings?.card_printings?.set_name} ·{" "}
                    {p.listings?.condition} · {p.listings?.finish}
                  </small>
                </td>
                <td>
                  {money(p.current_price_crc)} →{" "}
                  <strong>{money(p.suggested_price_crc)}</strong>
                </td>
                <td>
                  <details>
                    <summary>Ver evidencia y advertencias</summary>
                    <p>
                      Mercado: {money(p.calculation.marketTargetCrc)} · Mínimo:{" "}
                      {money(p.calculation.floorCrc)}
                    </p>
                    <p>
                      Tipo de cambio: {p.calculation.fx || "—"} ·{" "}
                      {date(p.calculation.fxAt)}
                    </p>
                    {p.calculation.sourceUrl && (
                      <a
                        href={p.calculation.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir fuente
                      </a>
                    )}
                    <ul>
                      {p.calculation.warnings?.map((w: string) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                    <p>{p.review_reason}</p>
                  </details>
                </td>
                <td>
                  {statusLabel(p.status)}
                  <small>{date(p.created_at)}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {proposals.data && (
        <Pager page={page} total={proposals.data.total} onPage={setPage} />
      )}
      <section className="ops-panel">
        <h2>Nueva referencia de precio</h2>
        <ListingPicker
          revision={revision}
          onSelect={(l) => {
            setSelected(l);
            setQuote(null);
          }}
        />
        {selected && (
          <>
            <h3>
              {selected.canonical_name} · {selected.set_name} ·{" "}
              {selected.collector_number}
            </h3>
            <p>
              {variantLabel(selected.language)} ·{" "}
              {variantLabel(selected.condition)} · {selected.finish} · Actual{" "}
              {money(selected.approved_price_crc)}
            </p>
            <PriceCheckPanel
              key={`${selected.listing_id}:${selected.identity_verified}:${selected.condition}:${selected.finish}`}
              listing={selected}
              disabled={role === "stock"}
              onUse={(r, report) =>
                setQuote({
                  amount: r.amount,
                  currency: r.currency,
                  provider: `${r.marketplace}-via-${r.feed}`,
                  sourceUrl: r.sourceUrl,
                  observedAt: r.providerUpdatedAt,
                  priceType: "market_reference",
                  priceCheckId: report.jobId,
                  priceReferenceId: r.id,
                })
              }
            />
            <ActionForm
              action="enqueue"
              label="Consultar proveedor"
              disabled={role === "stock"}
              onDone={onDone}
              payload={() => ({
                id: selected.listing_id,
                kind: "refresh_price",
              })}
            >
              <p className="small-note">
                La consulta queda en cola; el resultado necesita confirmar la
                variante.
              </p>
            </ActionForm>
            <ActionForm
              key={`${selected.listing_id}:${quote?.priceCheckId || quote?.observedAt || "manual"}:${quote?.sourceUrl || "manual"}`}
              action="evidence"
              onDone={onDone}
              disabled={role === "stock" || !selected.identity_verified}
              label="Calcular propuesta"
              payload={(d) =>
                quote?.priceCheckId
                  ? {
                      id: selected.listing_id,
                      amount: quote.amount,
                      currency: quote.currency,
                      provider: quote.provider,
                      sourceUrl: quote.sourceUrl,
                      observedAt: quote.observedAt,
                      priceType: "market_reference",
                      priceCheckId: quote.priceCheckId,
                      priceReferenceId: quote.priceReferenceId,
                      exactVariant: d.get("confirmed") === "on",
                    }
                  : {
                      id: selected.listing_id,
                      amount: Number(d.get("amount")),
                      currency: d.get("currency"),
                      provider: d.get("provider"),
                      sourceUrl: d.get("sourceUrl"),
                      observedAt: new Date(
                        String(d.get("observedAt")),
                      ).toISOString(),
                      priceType: d.get("priceType"),
                      exactVariant: d.get("confirmed") === "on",
                    }
              }
            >
              <Field
                label="Precio comparable"
                name="amount"
                disabled={!!quote?.priceCheckId}
                type="number"
                min="0.01"
                step="0.01"
                value={quote?.amount || ""}
                required
              />
              <Field
                label="Moneda"
                name="currency"
                disabled={!!quote?.priceCheckId}
                value={quote?.currency || "USD"}
              >
                <option>USD</option>
                <option>CRC</option>
              </Field>
              <Field
                label="Proveedor / sitio"
                name="provider"
                disabled={!!quote?.priceCheckId}
                value={quote?.provider || "manual"}
                required
              />
              <Field
                label="Enlace HTTPS de evidencia"
                name="sourceUrl"
                disabled={!!quote?.priceCheckId}
                type="url"
                value={quote?.sourceUrl || ""}
                required
              />
              <Field
                label="Fecha de la referencia"
                name="observedAt"
                disabled={!!quote?.priceCheckId}
                type="datetime-local"
                value={quote?.observedAt ? localTime(quote.observedAt) : ""}
                required
              />
              <Field
                label="Tipo de evidencia"
                name="priceType"
                disabled={!!quote?.priceCheckId}
                value={quote?.priceType || "condition_quote"}
              >
                <option value="condition_quote">
                  Cotización de condición exacta
                </option>
                <option value="market_reference">Referencia de mercado</option>
                <option value="asking_price">Precio anunciado</option>
                <option value="sale_comparable">Venta comparable</option>
              </Field>
              <label className="ops-check">
                <input type="checkbox" name="confirmed" required />
                Confirmé impresión, idioma, condición y acabado exactos.
              </label>
              {quote?.priceCheckId && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setQuote(null)}
                >
                  Registrar otra evidencia manual
                </button>
              )}
              {!selected.identity_verified && (
                <p role="alert">
                  Verifica la identidad en Inventario antes de calcular.
                </p>
              )}
              <p className="small-note">
                Los precios USD requieren un tipo de cambio vigente en Ajustes.
                Todas las propuestas requieren revisión.
              </p>
            </ActionForm>
          </>
        )}
      </section>
      <section className="ops-panel">
        <h2>Referencias obtenidas</h2>
        <Feedback {...jobs} />
        {jobs.data?.rows
          .filter((j) => j.kind === "refresh_price")
          .map((j) => (
            <div className="ops-lot" key={j.id}>
              <p>{j.result?.message || j.error}</p>
              {j.result?.verification && (
                <PriceCheckResults report={j.result.verification} />
              )}
              {j.result?.quote && (
                <>
                  <p>
                    {j.result.quote.currency} {j.result.quote.amount} ·{" "}
                    {j.result.quote.provider} ·{" "}
                    {date(j.result.quote.observedAt)}
                  </p>
                  <a
                    href={j.result.quote.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir fuente
                  </a>
                  <button
                    className="button secondary"
                    onClick={async () => {
                      const r = await fetch(
                        `/api/admin?type=inventory&q=${j.entity_id}`,
                      );
                      const d = await r.json();
                      if (d.rows?.[0]) {
                        setSelected(d.rows[0]);
                        setQuote(j.result.quote);
                      }
                    }}
                  >
                    Usar referencia para revisar
                  </button>
                </>
              )}
            </div>
          ))}
      </section>
    </>
  );
}
function localTime(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
