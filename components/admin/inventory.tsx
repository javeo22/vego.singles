"use client";
import { useState } from "react";
import { variantLabel } from "@/lib/catalog";
import {
  conditions,
  languages,
  type InventoryRecord,
  type OperationRole,
} from "@/lib/operations/types";
import {
  ActionForm,
  CsvExport,
  Feedback,
  Field,
  Pager,
  date,
  money,
  useData,
  type List,
} from "./shared";
export function InventoryPanel({
  role,
  revision,
  onDone,
  reviews = false,
}: {
  role: OperationRole;
  revision: number;
  onDone: (m: string) => void;
  reviews?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [status, setStatus] = useState(reviews ? "unverified" : "all"),
    [stock, setStock] = useState("all"),
    [selected, setSelected] = useState<InventoryRecord | null>(null);
  const filters = `q=${encodeURIComponent(query)}&status=${status}&stock=${stock}`;
  const r = useData<List<InventoryRecord>>(
    `type=inventory&${filters}&page=${page}`,
    revision,
  );
  return (
    <>
      <div className="ops-toolbar">
        <label className="ops-field">
          Buscar
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Carta, set, número o ID"
          />
        </label>
        <label className="ops-field">
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Todos</option>
            <option value="published">Publicado</option>
            <option value="draft">Borrador</option>
            <option value="unverified">Identidad pendiente</option>
          </select>
        </label>
        <label className="ops-field">
          Existencias
          <select
            value={stock}
            onChange={(e) => {
              setStock(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Todas</option>
            <option value="in">Disponible</option>
            <option value="out">Sin disponibilidad</option>
          </select>
        </label>
        <CsvExport query={filters} disabled={r.loading} />
      </div>
      <Feedback {...r} />
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Carta / variante</th>
              <th>Físico / disponible</th>
              <th>Precio</th>
              <th>Revisión</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {r.data?.rows.map((l) => (
              <tr key={l.listing_id}>
                <td>
                  <button
                    className="ops-table-link"
                    onClick={() => setSelected(l)}
                  >
                    {l.canonical_name}
                  </button>
                  <small>
                    {l.set_name} · {l.collector_number}
                  </small>
                  <small>
                    {variantLabel(l.language)} · {variantLabel(l.condition)} ·{" "}
                    {l.finish}
                  </small>
                </td>
                <td>
                  {l.quantity} / {l.available_quantity}
                </td>
                <td>{money(l.approved_price_crc)}</td>
                <td>
                  {!l.identity_verified
                    ? "Identidad pendiente"
                    : !l.price_verified
                      ? "Precio pendiente"
                      : "Verificada"}
                </td>
                <td>{l.published ? "Publicado" : "Borrador"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!r.loading && !r.error && r.data?.rows.length === 0 && (
        <p className="ops-empty">No hay cartas para estos filtros.</p>
      )}
      {r.data && <Pager page={page} total={r.data.total} onPage={setPage} />}
      {selected && (
        <section className="ops-panel" aria-label="Detalle de inventario">
          <div className="ops-title-row">
            <h2>{selected.canonical_name}</h2>
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              Cerrar detalle
            </button>
          </div>
          <small>
            {selected.set_name} · {selected.collector_number} ·{" "}
            {selected.listing_id}
          </small>
          <InventoryDetail
            key={`${selected.listing_id}:${revision}`}
            listing={selected}
            role={role}
            revision={revision}
            onDone={(m) => {
              setSelected(null);
              onDone(m);
            }}
          />
        </section>
      )}
    </>
  );
}
function InventoryDetail({
  listing: l,
  role,
  revision,
  onDone,
}: {
  listing: InventoryRecord;
  role: OperationRole;
  revision: number;
  onDone: (m: string) => void;
}) {
  const lots = useData<List>(`type=lots&id=${l.listing_id}`, revision);
  const events = useData<List>(`type=events&id=${l.listing_id}`, revision);
  const locations = useData<List>("type=locations", revision);
  const locOptions = locations.data?.rows
    .filter((x) => x.active)
    .map((x) => (
      <option key={x.code} value={x.code}>
        {x.label} ({x.code})
      </option>
    ));
  const sourceOptions = [
    ...new Set((lots.data?.rows || []).map((x) => x.location_code)),
  ].map((x) => (
    <option key={x} value={x}>
      {variantLabel(x)}
    </option>
  ));
  return (
    <>
      <Feedback {...lots} />
      <div className="ops-detail-grid">
        {role !== "stock" && (
          <div>
            <h3>Identidad y costo</h3>
            <ActionForm
              action="verify_listing"
              onDone={onDone}
              payload={(d) => ({
                id: l.listing_id,
                language: d.get("language"),
                condition: d.get("condition"),
                finish: d.get("finish"),
                acquisitionCostCrc:
                  d.get("cost") === "" ? null : Number(d.get("cost")),
                imageUrl: d.get("image"),
                provider: d.get("provider"),
                externalId: d.get("externalId"),
                reason: d.get("reason"),
              })}
            >
              <Field
                label="Idioma"
                name="language"
                value={
                  (
                    {
                      english: "en",
                      spanish: "es",
                      japanese: "ja",
                      chinese: "zh",
                    } as Record<string, string>
                  )[l.language] || l.language
                }
                required
              >
                <option value="">Confirmar idioma</option>
                {languages.map((x) => (
                  <option key={x} value={x}>
                    {variantLabel(x)}
                  </option>
                ))}
              </Field>
              <Field
                label="Condición"
                name="condition"
                value={l.condition}
                required
              >
                {conditions.map((x) => (
                  <option key={x} value={x}>
                    {variantLabel(x)}
                  </option>
                ))}
              </Field>
              <Field label="Acabado" name="finish" value={l.finish} required />
              <Field
                label="Costo unitario CRC (vacío si desconocido)"
                name="cost"
                type="number"
                min="0"
                step="1"
                value={l.cost_confirmed ? Number(l.acquisition_cost || 0) : ""}
              />
              <Field
                label="Imagen HTTPS"
                name="image"
                type="url"
                value={l.stock_image_url || ""}
              />
              <Field
                label="Proveedor de catálogo"
                name="provider"
                value={l.catalog_source || "manual"}
              />
              <Field
                label="Identificador del proveedor"
                name="externalId"
                value={l.external_card_id || ""}
              />
              <Field
                label="Motivo / evidencia de verificación"
                name="reason"
                required
              />
              <p className="small-note">
                Confirma la carta física. Cambiar idioma, condición o acabado
                requiere revisar precio y publicación.
              </p>
            </ActionForm>
          </div>
        )}
        {role !== "reviewer" && (
          <div>
            <h3>Movimiento de stock</h3>
            <ActionForm
              action="stock_adjust"
              onDone={onDone}
              payload={(d) => ({
                id: l.listing_id,
                delta: Number(d.get("delta")),
                location: d.get("location"),
                reason: d.get("reason"),
              })}
            >
              <Field
                label="Cambio (+ ingreso / − salida)"
                name="delta"
                type="number"
                step="1"
                required
              />
              <Field label="Ubicación" name="location" required>
                {locOptions}
              </Field>
              <Field label="Motivo" name="reason" required />
            </ActionForm>
            <h3>Trasladar copias</h3>
            <ActionForm
              action="stock_transfer"
              onDone={onDone}
              payload={(d) => ({
                id: l.listing_id,
                quantity: Number(d.get("quantity")),
                from: d.get("from"),
                to: d.get("to"),
                reason: d.get("reason"),
              })}
            >
              <Field
                label="Cantidad"
                name="quantity"
                type="number"
                min="1"
                step="1"
                required
              />
              <Field label="Origen" name="from" required>
                {sourceOptions}
              </Field>
              <Field label="Destino" name="to" required>
                {locOptions}
              </Field>
              <Field label="Motivo" name="reason" required />
            </ActionForm>
          </div>
        )}
        {role !== "stock" && (
          <div>
            <h3>Publicación</h3>
            <ActionForm
              action="publish"
              onDone={onDone}
              label={l.published ? "Pausar publicación" : "Publicar"}
              payload={() => ({ id: l.listing_id, published: !l.published })}
            >
              <p className="muted">
                Identidad, precio, stock y ubicación deben estar listos.
              </p>
            </ActionForm>
            <a
              className="button secondary"
              href={`/admin/precios?listing=${l.listing_id}`}
            >
              Revisar precio
            </a>
            <h3>Bloqueo de precio</h3>
            <ActionForm
              action="price_lock"
              onDone={onDone}
              payload={(d) => ({
                id: l.listing_id,
                until: d.get("until")
                  ? new Date(String(d.get("until"))).toISOString()
                  : null,
                reason: d.get("reason"),
              })}
            >
              <Field
                label="Mantener hasta (vacío para liberar)"
                name="until"
                type="datetime-local"
              />
              <Field label="Motivo" name="reason" required />
              <p className="small-note">
                Bloqueo actual: {date(l.price_locked_until)}
              </p>
            </ActionForm>
          </div>
        )}
      </div>
      <h3>Lotes físicos</h3>
      {lots.data?.rows.map((lot) => (
        <div key={lot.id} className="ops-lot">
          <strong>
            {lot.location_code}: {lot.quantity} copias · Costo unitario:{" "}
            {lot.cost_verified ? money(lot.unit_cost_crc) : "Por confirmar"}
            {lot.quarantined ? " · En cuarentena" : ""}
          </strong>
          {role !== "stock" && (
            <ActionForm
              action="lot_cost"
              label="Confirmar costo"
              onDone={onDone}
              payload={(d) => ({
                id: lot.id,
                cost: Number(d.get("cost")),
                reason: d.get("reason"),
              })}
            >
              <Field
                label="Costo unitario CRC"
                name="cost"
                type="number"
                min="0"
                step="0.01"
                required
              />
              <Field label="Motivo" name="reason" required />
            </ActionForm>
          )}
          {role !== "reviewer" && (
            <ActionForm
              action="quarantine_lot"
              label={
                lot.quarantined ? "Liberar cuarentena" : "Enviar a cuarentena"
              }
              onDone={onDone}
              payload={(d) => ({
                id: lot.id,
                quarantined: !lot.quarantined,
                reason: d.get("reason"),
              })}
            >
              <Field label="Motivo" name="reason" required />
            </ActionForm>
          )}
        </div>
      ))}
      <h3>Movimientos recientes</h3>
      <Feedback {...events} />
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cambio</th>
              <th>Antes / después</th>
              <th>Motivo</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {events.data?.rows.map((e) => (
              <tr key={e.id}>
                <td>{date(e.created_at)}</td>
                <td>{e.quantity_change}</td>
                <td>
                  {e.previous_quantity} / {e.new_quantity}
                </td>
                <td>{e.reason}</td>
                <td>{e.reference_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
