"use client";
import { useState } from "react";
import {
  conditions,
  games,
  languages,
  type OperationRole,
} from "@/lib/operations/types";
import { variantLabel } from "@/lib/catalog";
import {
  ActionForm,
  Feedback,
  Field,
  Pager,
  date,
  statusLabel,
  useData,
  type List,
} from "./shared";
import type { ImportRow, CatalogCard } from "@/lib/operations/imports";
export function ImportsPanel({
  role,
  revision,
  onDone,
}: {
  role: OperationRole;
  revision: number;
  onDone: (m: string) => void;
}) {
  const [text, setText] = useState(""),
    [name, setName] = useState("Importación"),
    [game, setGame] = useState("pokemon"),
    [mode, setMode] = useState("receipt"),
    [reference, setReference] = useState(""),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<{
      rows: ImportRow[];
      headers: string[];
      total: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [batch, setBatch] = useState(""),
    [page, setPage] = useState(0),
    [batchPage, setBatchPage] = useState(0),
    [selected, setSelected] = useState<any>(null);
  const batches = useData<List>(`type=batches&page=${batchPage}`, revision);
  const rows = useData<List>(`type=imports&id=${batch}&page=${page}`, revision);
  const locations = useData<List>("type=locations", revision);
  async function send(action: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          key: crypto.randomUUID(),
          text,
          name,
          mode,
          defaultGame: game,
          reference,
          mapping,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (action === "preview_import") setPreview(d);
      else {
        setBatch(d.id);
        setPage(0);
        onDone(d.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="ops-panel">
        <h2>Nueva importación</h2>
        <div className="ops-toolbar">
          <label className="ops-field">
            Archivo CSV
            <input
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 2000000) {
                    setError("El archivo supera 2 MB");
                    return;
                  }
                  setText(await f.text());
                  setName(f.name);
                  setPreview(null);
                  setMapping({});
                }
              }}
            />
          </label>
          <label className="ops-field">
            Nombre del lote
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="ops-field">
            Referencia de pedido / corte
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Identifica una recepción nueva"
            />
          </label>
          <label className="ops-field">
            Juego
            <select value={game} onChange={(e) => setGame(e.target.value)}>
              {games.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            Proceso
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="receipt">Recepción: sumar nuevas copias</option>
              <option value="snapshot">
                Snapshot: reconciliar cantidades totales
              </option>
            </select>
          </label>
        </div>
        <label className="ops-field">
          Pegar lista con encabezados
          <textarea
            rows={7}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            placeholder="Name,Set,Card Number,Language,Condition,Variant,Quantity"
          />
        </label>
        <p className="small-note">
          Máximo 1000 filas. Un snapshot conserva las variantes omitidas; revisa
          las diferencias antes de incorporarlo.
        </p>
        {error && (
          <p role="alert" className="ops-error">
            {error}
          </p>
        )}
        <div className="ops-toolbar">
          <button
            className="button secondary"
            disabled={!text || busy}
            onClick={() => send("preview_import")}
          >
            {busy ? "Procesando…" : "Validar y previsualizar"}
          </button>
          <button
            className="button"
            disabled={!preview || busy}
            onClick={() => send("stage_import")}
          >
            Guardar lote para revisión
          </button>
        </div>
        {preview && (
          <>
            <p>
              {preview.total} filas detectadas. Las primeras 10 aparecen aquí.
            </p>
            <details>
              <summary>Ajustar columnas</summary>
              <div className="ops-fields">
                {Object.entries({
                  name: "Nombre",
                  setName: "Set",
                  collectorNumber: "Número",
                  language: "Idioma",
                  condition: "Condición",
                  finish: "Acabado",
                  quantity: "Cantidad",
                  acquisitionCostCrc: "Costo CRC",
                  provider: "Proveedor",
                  externalId: "ID del proveedor",
                  treatment: "Tratamiento",
                  kind: "Tipo",
                }).map(([key, label]) => (
                  <label key={key} className="ops-field">
                    {label}
                    <select
                      value={mapping[key] || ""}
                      onChange={(e) =>
                        setMapping({ ...mapping, [key]: e.target.value })
                      }
                    >
                      <option value="">Detectar automáticamente</option>
                      {preview.headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => send("preview_import")}
              >
                Volver a validar
              </button>
            </details>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Carta</th>
                    <th>Set / número</th>
                    <th>Idioma</th>
                    <th>Cantidad</th>
                    <th>Validación</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 10).map((r) => (
                    <tr key={r.rowNumber}>
                      <td>{r.rowNumber}</td>
                      <td>{r.name}</td>
                      <td>
                        {r.setName} / {r.collectorNumber}
                      </td>
                      <td>{variantLabel(r.language)}</td>
                      <td>{r.quantity}</td>
                      <td>{r.errors.join("; ") || "Lista para identificar"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <section className="ops-panel">
        <h2>Lotes guardados</h2>
        <Feedback {...batches} />
        {batches.data?.rows.map((b) => (
          <button
            className={`ops-pick ${batch === b.id ? "selected" : ""}`}
            key={b.id}
            onClick={() => {
              setBatch(b.id);
              setPage(0);
              setSelected(null);
            }}
          >
            <strong>{b.name}</strong>
            <span>
              {b.mode === "receipt" ? "Recepción" : "Snapshot"} ·{" "}
              {date(b.created_at)}
            </span>
          </button>
        ))}
        {batches.data && (
          <Pager
            page={batchPage}
            total={batches.data.total}
            onPage={setBatchPage}
          />
        )}
      </section>
      {batch && (
        <section className="ops-panel">
          <h2>Revisión del lote</h2>
          <Feedback {...rows} />
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Carta</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.data?.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.row_number}</td>
                    <td>
                      {r.normalized.name}
                      <small>
                        {r.normalized.setName} · {r.normalized.collectorNumber}
                      </small>
                    </td>
                    <td>{statusLabel(r.status)}</td>
                    <td>
                      {r.errors.join("; ") ||
                        `${r.normalized.quantity} copias · ${variantLabel(r.normalized.language)}`}
                    </td>
                    <td>
                      {!["committed", "skipped"].includes(r.status) && (
                        <button
                          className="button secondary"
                          onClick={() => setSelected(r)}
                        >
                          Revisar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.data && (
            <Pager page={page} total={rows.data.total} onPage={setPage} />
          )}
          <ActionForm
            action="commit_import"
            label="Incorporar filas listas"
            disabled={role === "reviewer"}
            onDone={onDone}
            payload={(d) => ({ id: batch, location: d.get("location") })}
          >
            <Field label="Ubicación de recepción" name="location" required>
              {locations.data?.rows
                .filter((l) => l.active)
                .map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
            </Field>
            <p className="small-note">
              Recepción suma copias. Snapshot ajusta el total y se detiene si
              hubo movimientos desde la revisión.
            </p>
          </ActionForm>
        </section>
      )}
      {selected && (
        <section className="ops-panel">
          <div className="ops-title-row">
            <h2>
              Fila {selected.row_number}: {selected.normalized.name}
            </h2>
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              Cerrar
            </button>
          </div>
          <ResolveRow
            key={selected.id}
            row={selected}
            role={role}
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
function ResolveRow({
  row,
  role,
  onDone,
}: {
  row: any;
  role: OperationRole;
  onDone: (m: string) => void;
}) {
  const [chosen, setChosen] = useState("manual");
  const r = row.normalized as ImportRow;
  const cards = row.candidates as CatalogCard[];
  const c = cards.find((c) => c.id === chosen);
  return (
    <>
      <p>
        {r.setName} · {r.collectorNumber} · {r.quantity} copias
      </p>
      <div className="ops-candidates">
        {cards.map((c) => (
          <button
            key={c.id}
            className={`ops-candidate ${chosen === c.id ? "selected" : ""}`}
            onClick={() => setChosen(c.id)}
          >
            {c.imageUrl && <img src={c.imageUrl} alt={c.name} />}
            <strong>{c.name}</strong>
            <span>
              {c.setName} · {c.collectorNumber} · {variantLabel(c.language)} ·{" "}
              {c.treatment}
            </span>
          </button>
        ))}
      </div>
      <button className="button secondary" onClick={() => setChosen("manual")}>
        Verificar manualmente
      </button>
      <ActionForm
        key={chosen}
        action="resolve_import"
        disabled={role === "stock" || r.errors.length > 0}
        onDone={onDone}
        label="Confirmar coincidencia"
        payload={(d) => ({
          id: row.id,
          language: d.get("language"),
          condition: d.get("condition"),
          finish: d.get("finish"),
          reason: d.get("reason"),
          ...(c && /^[0-9a-f-]{36}$/i.test(c.id)
            ? { card_printing_id: c.id }
            : {
                candidate: c || {
                  id: "manual",
                  name: d.get("name"),
                  setName: d.get("setName"),
                  collectorNumber: d.get("number"),
                  game: r.game,
                  language: d.get("language"),
                  provider: d.get("provider"),
                  externalId: d.get("externalId"),
                  imageUrl: d.get("imageUrl") || null,
                  verified: false,
                  treatment: d.get("treatment"),
                  kind: r.kind,
                },
              }),
        })}
      >
        {!c && (
          <>
            <Field
              label="Nombre canónico"
              name="name"
              value={r.name.replace(/\s*\((JP|CN)\)/gi, "")}
              required
            />
            <Field
              label="Set exacto"
              name="setName"
              value={r.setName}
              required
            />
            <Field
              label="Número completo"
              name="number"
              value={r.collectorNumber}
              required={r.kind !== "sealed"}
            />
            <Field
              label="Proveedor"
              name="provider"
              value={r.provider || "manual"}
              required
            />
            <Field
              label="ID externo (si existe)"
              name="externalId"
              value={r.externalId}
            />
            <Field label="Imagen HTTPS" name="imageUrl" type="url" />
            <Field
              label="Tratamiento / edición"
              name="treatment"
              value={r.treatment}
              required
            />
          </>
        )}
        <Field
          label="Idioma confirmado"
          name="language"
          value={c?.language || r.language}
          required
        >
          <option value="">Confirmar idioma</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {variantLabel(l)}
            </option>
          ))}
        </Field>
        <Field
          label="Condición física"
          name="condition"
          value={r.condition}
          required
        >
          <option value="">Confirmar condición</option>
          {conditions.map((x) => (
            <option key={x} value={x}>
              {variantLabel(x)}
            </option>
          ))}
        </Field>
        <Field label="Acabado exacto" name="finish" value={r.finish} required />
        <Field label="Evidencia / motivo" name="reason" required />
        <p className="small-note">
          Confirma número, idioma, tratamiento y acabado con la carta física.
        </p>
      </ActionForm>
      {r.errors.length > 0 && (
        <p role="alert">
          Corrige los errores del archivo y guarda un nuevo lote. Puedes omitir
          esta fila.
        </p>
      )}
      <ActionForm
        action="skip_import"
        label="Omitir fila"
        onDone={onDone}
        payload={() => ({ id: row.id })}
      >
        <p className="small-note">La fila se conserva en el historial.</p>
      </ActionForm>
    </>
  );
}
