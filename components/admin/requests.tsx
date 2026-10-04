"use client";
import { useState } from "react";
import type { OperationRole } from "@/lib/operations/types";
import {
  ActionForm,
  Feedback,
  Field,
  Pager,
  date,
  money,
  statusLabel,
  useData,
  type List,
} from "./shared";
export function RequestsPanel({
  role,
  revision,
  onDone,
}: {
  role: OperationRole;
  revision: number;
  onDone: (m: string) => void;
}) {
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState<any>(null),
    [status, setStatus] = useState("");
  const r = useData<List>(
    `type=requests&page=${page}${status ? `&status=${status}` : ""}`,
    revision,
  );
  const items = useData<List>(
    `type=items&id=${selected?.id || "00000000-0000-0000-0000-000000000000"}`,
    revision,
  );
  const disabled = role === "reviewer";
  const done = (m: string) => {
    setSelected(null);
    onDone(m);
  };
  return (
    <>
      <label className="ops-field">
        Estado
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos</option>
          {["inquiry", "reserved", "sold", "fulfilled", "cancelled"].map(
            (s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ),
          )}
        </select>
      </label>
      <Feedback {...r} />
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Solicitud</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {r.data?.rows.map((q) => (
              <tr key={q.id}>
                <td>
                  <button
                    className="ops-table-link"
                    onClick={() => setSelected(q)}
                  >
                    {q.request_number}
                  </button>
                </td>
                <td>{date(q.created_at)}</td>
                <td>{money(q.total_crc)}</td>
                <td>{statusLabel(q.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.data && <Pager page={page} total={r.data.total} onPage={setPage} />}
      {selected && (
        <section className="ops-panel">
          <div className="ops-title-row">
            <h2>{selected.request_number}</h2>
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              Cerrar
            </button>
          </div>
          <p>
            {statusLabel(selected.status)} ·{" "}
            {selected.fulfillment_method === "pickup"
              ? "Retiro"
              : "Duelist Kingdom"}{" "}
            · Total {money(selected.total_crc)}
          </p>
          <p>{selected.customer_note}</p>
          <Feedback {...items} />
          {items.data?.rows.map((i) => (
            <div className="ops-lot" key={i.id}>
              <strong>
                {i.requested_quantity} ×{" "}
                {i.variant_snapshot.name || i.listing_id}
              </strong>
              <span>
                {i.variant_snapshot.set} · {i.variant_snapshot.number} ·{" "}
                {i.variant_snapshot.language} · {i.variant_snapshot.condition} ·{" "}
                {i.variant_snapshot.finish}
              </span>
              <b>{money(i.price_snapshot_crc)}</b>
            </div>
          ))}
          <div className="ops-detail-grid">
            {selected.status === "inquiry" && (
              <>
                <ActionForm
                  action="refresh_request"
                  label="Actualizar cotización"
                  disabled={disabled}
                  onDone={done}
                  payload={() => ({ id: selected.id })}
                >
                  <p>Confirma cualquier cambio de precio con el cliente.</p>
                </ActionForm>
                <ActionForm
                  action="reserve_request"
                  label="Confirmar reserva"
                  disabled={disabled}
                  onDone={done}
                  payload={(d) => ({
                    id: selected.id,
                    hours: Number(d.get("hours")),
                  })}
                >
                  <Field
                    label="Horas de reserva"
                    name="hours"
                    type="number"
                    min="1"
                    max="72"
                    value={24}
                    required
                  />
                </ActionForm>
              </>
            )}
            {selected.status === "reserved" && (
              <ActionForm
                action="sell_request"
                label="Registrar venta"
                disabled={disabled}
                onDone={done}
                payload={() => ({ id: selected.id })}
              >
                <p>
                  Registra cuando hayas confirmado el pago. Descuenta stock una
                  sola vez.
                </p>
              </ActionForm>
            )}
            {selected.status === "sold" && (
              <ActionForm
                action="fulfill_request"
                label="Marcar entregada"
                disabled={disabled}
                onDone={done}
                payload={() => ({ id: selected.id })}
              >
                <p>Confirma entrega o retiro de las cartas.</p>
              </ActionForm>
            )}
            {["inquiry", "reserved"].includes(selected.status) && (
              <ActionForm
                action="cancel_request"
                label="Cancelar y liberar reserva"
                disabled={disabled}
                onDone={done}
                payload={(d) => ({ id: selected.id, reason: d.get("reason") })}
              >
                <Field label="Motivo de cancelación" name="reason" required />
              </ActionForm>
            )}
          </div>
        </section>
      )}
    </>
  );
}
