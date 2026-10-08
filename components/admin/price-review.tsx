"use client";
import { useState } from "react";
import type { OperationRole } from "@/lib/operations/types";
import {
  marketName,
  priceDate,
  referencePrice,
  serviceName,
} from "./price-check";
import {
  ActionForm,
  Feedback,
  Field,
  Pager,
  money,
  statusLabel,
  useData,
  type List,
} from "./shared";
export function PriceReviewPanel({
  role,
  revision,
  onDone,
  onCheck,
}: {
  role: OperationRole;
  revision: number;
  onDone: (message: string) => void;
  onCheck: () => void;
}) {
  const [page, setPage] = useState(0),
    [status, setStatus] = useState("pending"),
    [checked, setChecked] = useState<string[]>([]);
  const proposals = useData<List>(
    `type=proposals&status=${status}&page=${page}`,
    revision,
  );
  return (
    <section className="price-review" aria-label="Aprobar precios">
      <h2>Precios por aprobar</h2>
      <p>
        Marca un precio para revisarlo, o varios para revisarlos juntos. La
        tienda conserva el precio actual hasta que apruebas el cambio.
      </p>
      {role === "stock" && (
        <p className="price-blocker">
          Solo un propietario o revisor puede aprobar precios.
        </p>
      )}
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
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Seleccionar</th>
              <th>Carta</th>
              <th>Precio actual → nuevo precio</th>
              <th>Por qué cambia</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {proposals.data?.rows.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.status === "pending" && role !== "stock" && (
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
                  <details open={checked.includes(p.id)}>
                    <summary>Ver cálculo y advertencias</summary>
                    <p>
                      Referencia en colones:{" "}
                      {money(p.calculation.marketTargetCrc)} · Mínimo según
                      costo: {money(p.calculation.floorCrc)}
                    </p>
                    <p>
                      Tipo de cambio: {p.calculation.fx || "—"} ·{" "}
                      {priceDate(p.calculation.fxAt)}
                    </p>
                    {p.calculation.priceCheck?.reference && (
                      <p>
                        {marketName(
                          p.calculation.priceCheck.reference.marketplace,
                        )}{" "}
                        ·{" "}
                        {referencePrice({
                          ...p.calculation.priceCheck.reference,
                          currency:
                            p.calculation.priceCheck.reference.currency ||
                            "USD",
                        })}
                        {" · Consultado mediante "}
                        {serviceName(
                          p.calculation.priceCheck.reference.feed,
                        )} ·{" "}
                        {p.calculation.priceCheck.reference.timestampBasis ===
                        "feed_published"
                          ? "Archivo de precios publicado: "
                          : "Actualización del precio: "}
                        {priceDate(
                          p.calculation.priceCheck.reference.providerUpdatedAt,
                        )}
                      </p>
                    )}
                    {p.calculation.sourceUrl && (
                      <a
                        href={p.calculation.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver precio en el mercado
                      </a>
                    )}
                    <ul>
                      {Array.from(
                        new Set<string>([
                          ...(p.calculation.warnings || []),
                          ...(p.calculation.priceCheck?.warnings || []),
                        ]),
                      ).map((w: string) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                    <p>{p.review_reason}</p>
                  </details>
                </td>
                <td>
                  {statusLabel(p.status)}
                  <small>{priceDate(p.created_at)}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {proposals.data && (
        <Pager page={page} total={proposals.data.total} onPage={setPage} />
      )}

      {!proposals.loading &&
        !proposals.error &&
        proposals.data?.total === 0 && (
          <div className="price-empty">
            <h3>
              {status === "pending"
                ? "No hay precios pendientes de aprobación"
                : "No hay propuestas en este estado"}
            </h3>
            <p>
              Consulta una carta y calcula su precio para crear una propuesta.
            </p>
            <button className="button" onClick={onCheck}>
              Consultar una carta
            </button>
          </div>
        )}
      {checked.length > 0 && (
        <h3>
          Decidir sobre {checked.length}{" "}
          {checked.length === 1 ? "precio" : "precios"}
        </h3>
      )}
      {status === "pending" && checked.length > 0 && (
        <ActionForm
          action="bulk_price"
          disabled={role === "stock" || !checked.length}
          onDone={(m) => {
            setChecked([]);
            onDone(m);
          }}
          label="Guardar decisión"
          payload={(d) => ({
            ids: checked,
            approve: d.get("decision") === "approve",
            reason: d.get("reason"),
          })}
        >
          <Field label="Decisión" name="decision">
            <option value="approve">Aprobar y actualizar el precio</option>
            <option value="reject">Rechazar la propuesta</option>
          </Field>
          <Field label="Motivo de revisión" name="reason" required />
          <p className="small-note">
            Aprobar cambia el precio de la tienda. Rechazar conserva el precio
            actual. Si una propuesta cambió, la revisión se detiene.
          </p>
        </ActionForm>
      )}
    </section>
  );
}
