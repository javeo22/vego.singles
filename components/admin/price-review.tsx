"use client";
import { useEffect, useRef, useState } from "react";
import { variantLabel } from "@/lib/catalog";
import type { OperationRole } from "@/lib/operations/types";
import type { PriceUpdate } from "@/lib/operations/price-workflow";
import { marketName, priceDate, referencePrice } from "./price-check";
import {
  ActionForm,
  Feedback,
  Pager,
  money,
  statusLabel,
  useData,
  type List,
} from "./shared";

type Updates = List<PriceUpdate> & {
  readyCount: number;
  blockedCount: number;
  pageSize: number;
};
type Props = {
  role: OperationRole;
  revision: number;
  onDone: (message: string) => void;
  onCheck: (id?: string) => void;
  onExchange: () => void;
};

export function PriceReviewPanel({
  role,
  revision,
  onDone,
  onCheck,
  onExchange,
}: Props) {
  const [page, setPage] = useState(0),
    [status, setStatus] = useState("pending"),
    [group, setGroup] = useState("ready"),
    [editing, setEditing] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  const proposals = useData<Updates>(
    `type=price_updates&status=${status}&group=${group}&page=${page}`,
    revision + retry,
  );
  return (
    <section className="price-review" aria-label="Cambios pendientes">
      <h2>Cambios de precio pendientes</h2>
      <p>
        Revisa una carta, ajusta su precio final y guárdalo. Cada cambio indica
        si está listo o qué falta resolver.
      </p>
      <label className="ops-field price-status-filter">
        Ver cambios
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setGroup(e.target.value === "pending" ? "ready" : "all");
            setPage(0);
            setEditing(null);
          }}
        >
          <option value="pending">Pendientes</option>
          <option value="approved">Guardados en la tienda</option>
          <option value="rejected">Descartados</option>
          <option value="superseded">Reemplazados por un nuevo cálculo</option>
        </select>
      </label>
      {status === "pending" && (
        <div className="price-queue-groups" aria-label="Estado de los cambios">
          <button
            aria-pressed={group === "ready"}
            onClick={() => {
              setGroup("ready");
              setPage(0);
              setEditing(null);
            }}
          >
            Listos para guardar{" "}
            <strong>{proposals.data?.readyCount ?? "—"}</strong>
          </button>
          <button
            aria-pressed={group === "blocked"}
            onClick={() => {
              setGroup("blocked");
              setPage(0);
              setEditing(null);
            }}
          >
            Necesitan actualizarse{" "}
            <strong>{proposals.data?.blockedCount ?? "—"}</strong>
          </button>
        </div>
      )}
      <Feedback {...proposals} />
      {!proposals.loading &&
        !proposals.error &&
        proposals.data?.total === 0 && (
          <div className="price-empty">
            <h3>
              {status === "pending" && group === "ready"
                ? "Todavía no hay precios listos para guardar"
                : "No hay cambios en esta lista"}
            </h3>
            <p>
              {(proposals.data?.blockedCount || 0) > 0 && status === "pending"
                ? `${proposals.data!.blockedCount} cambios necesitan una nueva consulta o resolver un dato pendiente. Abre Necesitan actualizarse para ver el motivo de cada uno.`
                : "Elige una carta y consulta el mercado para preparar su precio."}
            </p>
            <button className="button" onClick={() => onCheck()}>
              Actualizar una carta
            </button>
          </div>
        )}
      {proposals.data?.rows.map((p) => (
        <PriceProposalCard
          key={p.id}
          proposal={p}
          role={role}
          open={editing === p.id}
          onOpen={() => setEditing(editing === p.id ? null : p.id)}
          onDone={(message) => {
            setEditing(null);
            setRetry((n) => n + 1);
            onDone(message);
          }}
          onCheck={onCheck}
          onExchange={onExchange}
        />
      ))}
      {proposals.data && (
        <Pager
          page={page}
          total={proposals.data.total}
          onPage={(n) => {
            setPage(n);
            setEditing(null);
          }}
          pageSize={10}
        />
      )}
    </section>
  );
}

export function PriceUpdateEditor({
  proposalId,
  role,
  revision,
  onDone,
  onCheck,
  onExchange,
  onSaved,
}: Props & { proposalId: string; onSaved: (price: number) => void }) {
  const [retry, setRetry] = useState(0);
  const data = useData<Updates>(
    `type=price_updates&proposalId=${encodeURIComponent(proposalId)}`,
    revision + retry,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [proposalId]);
  return (
    <section className="price-final-stage" aria-label="Precio final">
      <h2 ref={heading} tabIndex={-1}>
        4. Define y guarda el precio
      </h2>
      <p>
        Puedes cambiar el precio sugerido. Guardar es la aprobación final y
        actualiza el precio en la tienda.
      </p>
      <Feedback {...data} />
      {data.data?.rows[0] && (
        <PriceProposalCard
          key={data.data.rows[0].id}
          proposal={data.data.rows[0]}
          role={role}
          open
          onOpen={() => {}}
          onDone={(message) => {
            setRetry((n) => n + 1);
            onDone(message);
          }}
          onCheck={onCheck}
          onExchange={onExchange}
          onSaved={onSaved}
        />
      )}
      {!data.loading && !data.error && data.data?.rows.length === 0 && (
        <p role="alert">
          No se encontró este cambio. Vuelve a consultar la carta.
        </p>
      )}
    </section>
  );
}

function PriceProposalCard({
  proposal,
  role,
  open,
  onOpen,
  onDone,
  onCheck,
  onExchange,
  onSaved,
}: {
  proposal: PriceUpdate;
  role: OperationRole;
  open: boolean;
  onOpen: () => void;
  onDone: (message: string) => void;
  onCheck: (id?: string) => void;
  onExchange: () => void;
  onSaved?: (price: number) => void;
}) {
  const [refreshed, setRefreshed] = useState<PriceUpdate | null>(null),
    [checking, setChecking] = useState(false),
    [checkError, setCheckError] = useState("");
  const p = refreshed || proposal;
  useEffect(() => setRefreshed(null), [proposal]);
  async function checkState() {
    setChecking(true);
    setCheckError("");
    try {
      const response = await fetch(
        `/api/admin?type=price_updates&proposalId=${encodeURIComponent(proposal.id)}`,
      );
      const data = await response.json();
      if (!response.ok || !data.rows?.[0])
        throw new Error(
          "No se pudo comprobar este cambio. Consulta la carta de nuevo o reintenta el guardado.",
        );
      const current = data.rows[0] as PriceUpdate;
      setRefreshed(current);
      if (current.status === "approved") {
        onSaved?.(current.readiness.currentPriceCrc);
        onDone("Este cambio ya se guardó en la tienda.");
      }
    } catch (error) {
      setCheckError(
        error instanceof Error
          ? error.message
          : "No se pudo comprobar este cambio.",
      );
    } finally {
      setChecking(false);
    }
  }
  const [price, setPrice] = useState(String(p.suggested_price_crc)),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const ready =
    p.readiness.canApprove &&
    (!p.readiness.expiresAt || Date.parse(p.readiness.expiresAt) > now);
  const expired = p.readiness.canApprove && !ready;
  const final = Number(price),
    minimum = p.readiness.minimumPriceCrc;
  const tooLow = minimum !== null && final < minimum;
  const valid =
    Number.isSafeInteger(final) && final > 0 && final <= 2147483647 && !tooLow;
  const warnings = Array.from(
    new Set([
      ...(p.calculation.warnings || []),
      ...(p.calculation.priceCheck?.warnings || []),
    ]),
  );
  const printing = p.listings.card_printings;
  const reference = p.calculation.priceCheck?.reference;
  return (
    <article
      className="price-update-card"
      aria-label={`Cambio de precio de ${printing.canonical_name}`}
    >
      <header className="price-update-header">
        <div>
          <h3>{printing.canonical_name}</h3>
          <p>
            {printing.set_name} · {printing.collector_number}
          </p>
          <small>
            {variantLabel(printing.language)} ·{" "}
            {variantLabel(p.listings.condition)} ·{" "}
            {variantLabel(p.listings.finish)}
          </small>
        </div>
        <span
          className="price-state"
          data-state={ready || p.status === "approved" ? "fresh" : "stale"}
        >
          {p.status !== "pending"
            ? statusLabel(p.status)
            : ready
              ? "Listo para guardar"
              : "Necesita actualizarse"}
        </span>
      </header>
      <div className="price-update-comparison">
        <div>
          <span>Precio en la tienda</span>
          <strong>{money(p.readiness.currentPriceCrc)}</strong>
        </div>
        <div>
          <span>
            {p.status === "approved" ? "Precio guardado" : "Precio sugerido"}
          </span>
          <strong>{money(p.suggested_price_crc)}</strong>
        </div>
      </div>
      <p className="price-readiness" role="status">
        {expired
          ? "La referencia venció mientras revisabas. Consulta el mercado para actualizarla."
          : p.readiness.message}
      </p>
      {p.status === "pending" && !ready && (
        <div className="price-next-action">
          {p.readiness.action === "inventory" ? (
            <a
              className="button secondary"
              href={`/admin/inventario?listing=${encodeURIComponent(p.listing_id)}`}
            >
              Revisar bloqueo en Inventario
            </a>
          ) : p.readiness.action === "exchange" ? (
            <button className="button" onClick={onExchange}>
              Configurar tipo de cambio
            </button>
          ) : p.readiness.action !== "none" || expired ? (
            <button className="button" onClick={() => onCheck(p.listing_id)}>
              {p.readiness.action === "confirm"
                ? "Confirmar carta y actualizar precio"
                : "Consultar un precio actualizado"}
            </button>
          ) : null}
        </div>
      )}
      {ready && role !== "stock" && !open && (
        <button className="button" onClick={onOpen}>
          Revisar y editar precio
        </button>
      )}
      {ready && role === "stock" && (
        <p>Un propietario o revisor debe guardar el nuevo precio.</p>
      )}
      {ready && open && role !== "stock" && (
        <ActionForm
          action="approve_price"
          label="Guardar precio en la tienda"
          submitDisabled={!valid || checking}
          onDone={onDone}
          onError={() => void checkState()}
          onResult={(r) => onSaved?.(r.priceCrc)}
          payload={(d) => ({
            id: p.id,
            priceCrc: Number(d.get("priceCrc")),
            expectedPriceCrc: p.suggested_price_crc,
            reason: d.get("reason"),
          })}
        >
          <label className="ops-field price-final-input">
            Precio final en colones
            <input
              name="priceCrc"
              type="number"
              min={minimum || 1}
              max="2147483647"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              inputMode="numeric"
            />
          </label>
          <label className="ops-field">
            Motivo del cambio
            <input
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="Ej.: Ajuste según ventas recientes"
            />
          </label>
          <p className="price-save-preview">
            Al guardar: {money(p.readiness.currentPriceCrc)} →{" "}
            <strong>{valid ? money(final) : "Indica un precio válido"}</strong>.
          </p>
          {checking && (
            <p role="status">Comprobando el estado de este cambio…</p>
          )}
          {checkError && (
            <p role="alert" className="ops-error">
              {checkError}
            </p>
          )}
          {minimum !== null ? (
            <p className="small-note">
              Mínimo según costo y margen: {money(minimum)}.
            </p>
          ) : (
            <p className="price-blocker">
              El costo está pendiente: este cálculo no garantiza tu margen.
              Revisa el precio antes de guardarlo.
            </p>
          )}
          {tooLow && (
            <p className="ops-error" role="alert">
              El precio debe ser al menos {money(minimum)} para respetar el
              costo y margen configurados.
            </p>
          )}
          {p.readiness.expiresAt && (
            <p className="small-note">
              Referencia válida hasta {priceDate(p.readiness.expiresAt)}.
            </p>
          )}
          {Math.abs(final / (p.readiness.currentPriceCrc || final) - 1) >
            0.1 && (
            <p className="small-note">
              El cambio supera el 10% del precio actual. Comprueba el importe
              final.
            </p>
          )}
          {final >= 50000 && (
            <p className="small-note">
              Carta de alto valor: revisa ventas comparables antes de guardar.
            </p>
          )}
          {!!warnings.length && (
            <ul className="price-decision-warnings">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </ActionForm>
      )}
      {p.status === "approved" && (
        <p className="price-success">
          Precio guardado {priceDate(p.reviewed_at)}. {p.review_reason}
        </p>
      )}
      {(reference ||
        p.calculation.marketTargetCrc !== undefined ||
        p.calculation.sourceUrl) && (
        <details className="price-calculation-details">
          <summary>Ver referencia y cálculo</summary>
          {reference && (
            <p>
              {marketName(reference.marketplace)} · {referencePrice(reference)}{" "}
              · {priceDate(reference.providerUpdatedAt)}
            </p>
          )}
          {p.calculation.marketTargetCrc !== undefined && (
            <p>
              Referencia en colones: {money(p.calculation.marketTargetCrc)} ·
              Tipo de cambio: {p.calculation.fx || "Sin configurar"}.
            </p>
          )}
          {p.calculation.sourceUrl && (
            <a href={p.calculation.sourceUrl} target="_blank" rel="noreferrer">
              Abrir fuente del precio
            </a>
          )}
          {!open && !!warnings.length && (
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </details>
      )}
      {p.status === "pending" && role !== "stock" && (
        <details className="price-discard">
          <summary>Descartar este cambio</summary>
          <ActionForm
            action="review_price"
            label="Descartar propuesta"
            onDone={onDone}
            payload={(d) => ({
              id: p.id,
              approve: false,
              reason: d.get("reason"),
            })}
          >
            <label className="ops-field">
              Motivo para descartar
              <input name="reason" required minLength={3} maxLength={500} />
            </label>
            <p className="small-note">El precio de la tienda se conserva.</p>
          </ActionForm>
        </details>
      )}
    </article>
  );
}
