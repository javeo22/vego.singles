"use client";
import { useEffect, useRef, useState } from "react";
import type { OperationRole } from "@/lib/operations/types";
import { money } from "./shared";

type Exception = {
  id: string;
  listingId: string;
  name: string;
  set: string;
  number: string;
  before: number;
  after: number | null;
  reason: string;
  canAccept: boolean;
};
type Summary = {
  run: { id: string; status: "running" | "completed"; mode: string } | null;
  total: number;
  done: number;
  updated: number;
  unchanged: number;
  review: number;
  exceptions: Exception[];
  importExceptions?: Array<{ row: number; name: string; reason: string[] }>;
  exchange?: { fx: number; fx_at: string; fx_source: string };
  receipt?: {
    received: number;
    existing: number;
    excluded: number;
    review: number;
  };
};
async function request(payload?: Record<string, unknown>) {
  const response = await fetch(
    "/api/admin/store-update",
    payload
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "No se pudo actualizar la tienda.");
  return data;
}
export function StoreUpdatePanel({
  role,
  initialMode = "import",
  onDone,
}: {
  role: OperationRole;
  initialMode?: "import" | "prices";
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<"import" | "prices">(
      role === "reviewer" ? "prices" : initialMode,
    ),
    [data, setData] = useState<Summary | null>(null),
    [file, setFile] = useState<{ name: string; text: string } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [accepting, setAccepting] = useState(false),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [resume, setResume] = useState(0);
  const key = useRef<string | null>(null);
  const canEdit = role !== "stock";
  const running = data?.run?.status === "running";
  async function reload() {
    const next = await request();
    setData(next);
    return next;
  }
  useEffect(() => {
    let active = true;
    request()
      .then((next) => {
        if (active) setData(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!running || !data?.run || !canEdit || error || busy || accepting)
      return;
    let active = true;
    const run = data.run.id;
    const timer = setTimeout(async () => {
      try {
        const next = await request({ action: "process", id: run });
        if (active) {
          setData((current) => ({ ...next, receipt: current?.receipt }));
          if (next.run?.status === "completed")
            onDone(
              `Actualización terminada: ${next.updated} cartas actualizadas, ${next.review} pendientes.`,
            );
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo continuar. Tu avance está guardado.",
          );
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [data, running, canEdit, error, busy, accepting, resume]);
  async function start(reviewOnly = false) {
    setBusy(true);
    setError("");
    key.current ||= crypto.randomUUID();
    try {
      const next = await request(
        mode === "import" && !reviewOnly
          ? {
              action: "import",
              key: key.current,
              name: file?.name,
              text: file?.text,
            }
          : { action: "prices", key: key.current, reviewOnly },
      );
      setData(next);
      setPage(0);
      key.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar.");
    } finally {
      setBusy(false);
    }
  }
  async function accept(items: Exception[]) {
    setAccepting(true);
    setError("");
    try {
      for (const item of items) {
        const outcome = await request({ action: "accept", id: item.id });
        if (!outcome.published)
          throw new Error(
            outcome.reason || "Esta carta sigue pendiente de revisión.",
          );
      }
      await reload();
      onDone(`${items.length} cambios revisados. La tienda está actualizada.`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo aceptar el cambio.",
      );
      await reload();
    } finally {
      setAccepting(false);
    }
  }
  const exceptions = data?.exceptions || [];
  const filtered = exceptions.filter((item) =>
    `${item.name} ${item.set} ${item.number}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const acceptable = exceptions.filter((item) => item.canAccept);
  return (
    <div className="store-updater">
      <header className="su-intro">
        <p className="su-eyebrow">COLLECTR → TU TIENDA</p>
        <h2>Menos pasos. Cartas al día.</h2>
        <p>
          Encontramos el producto, consultamos el mercado y publicamos lo que
          está listo. Aquí solo resuelves las excepciones.
        </p>
      </header>
      <nav className="su-tasks" aria-label="Qué quieres actualizar">
        {role === "owner" && (
          <button
            type="button"
            aria-pressed={mode === "import"}
            disabled={busy || running}
            onClick={() => setMode("import")}
          >
            <strong>Importar cartas</strong>
            <span>Sube tu exportación de Collectr.</span>
          </button>
        )}
        <button
          type="button"
          aria-pressed={mode === "prices"}
          disabled={busy || running}
          onClick={() => setMode("prices")}
        >
          <strong>Actualizar precios</strong>
          <span>Todo el inventario, con un clic.</span>
        </button>
      </nav>
      {!running && (
        <section
          className="su-action"
          aria-label={
            mode === "import"
              ? "Importar Collectr"
              : "Actualizar precios automáticamente"
          }
        >
          {mode === "import" ? (
            <>
              <label className="su-upload">
                CSV de Collectr
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={loading || busy || role !== "owner"}
                  onChange={async (e) => {
                    setError("");
                    const selected = e.target.files?.[0];
                    if (!selected) {
                      setFile(null);
                      return;
                    }
                    if (selected.size > 2000000) {
                      setError("El archivo supera 2 MB.");
                      setFile(null);
                      return;
                    }
                    setFile({
                      name: selected.name,
                      text: await selected.text(),
                    });
                    key.current = null;
                  }}
                />
              </label>
              <p>
                Solo añadimos variantes que no existen. Repetir el archivo
                conserva el stock actual.
              </p>
              <button
                className="button"
                disabled={loading || !file || busy || role !== "owner"}
                onClick={() => start()}
              >
                {busy ? "Preparando inventario…" : "Importar y publicar"}
              </button>
            </>
          ) : (
            <>
              <h3>Un botón para todos los precios.</h3>
              <p>
                Actualizamos el cambio USD/CRC y los precios listos. Las
                coincidencias inciertas y los precios bloqueados se conservan.
              </p>
              <button
                className="button"
                disabled={loading || busy || !canEdit}
                onClick={() => start()}
              >
                {busy
                  ? "Preparando actualización…"
                  : "Actualizar precios y publicar"}
              </button>
            </>
          )}
          <p className="su-policy">
            Collectr confirma la identidad · Sin ubicación obligatoria · Idioma
            sin confirmar visible en la tienda
          </p>
        </section>
      )}
      {loading && <p role="status">Cargando tu última actualización…</p>}
      {error && (
        <div role="alert" className="su-error">
          <p>{error}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setError("");
              setResume((n) => n + 1);
              if (!data) void reload().catch((e) => setError(e.message));
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      {data?.run && (
        <section
          className="su-progress"
          aria-label="Avance de la actualización"
          aria-live="polite"
        >
          <div className="su-progress-title">
            <h3>
              {running
                ? "Estamos actualizando tu tienda…"
                : "Actualización terminada"}
            </h3>
            <span>
              {data.done} de {data.total} cartas
            </span>
          </div>
          <progress
            aria-label="Cartas procesadas"
            max={Math.max(1, data.total)}
            value={data.done}
          />
          <div className="su-stats">
            <div>
              <strong>{data.updated}</strong>
              <span>Actualizadas y publicadas</span>
            </div>
            <div>
              <strong>{data.unchanged}</strong>
              <span>Ya tenían el precio correcto</span>
            </div>
            <div>
              <strong>{data.review}</strong>
              <span>Para revisar</span>
            </div>
          </div>
          {data.exchange?.fx && (
            <p>
              1 USD = ₡
              {Number(data.exchange.fx).toLocaleString("es-CR", {
                maximumFractionDigits: 2,
              })}
              {data.exchange.fx_at && (
                <>
                  {" "}
                  · Tipo de cambio del{" "}
                  {new Date(data.exchange.fx_at).toLocaleDateString("es-CR", {
                    timeZone: "America/Costa_Rica",
                  })}
                  .
                </>
              )}
            </p>
          )}
          {running && (
            <p>
              El proceso es automático. Si sales, el avance se guarda y continúa
              cuando vuelvas.
            </p>
          )}
          {data.receipt && (
            <p>
              {data.receipt.received} variantes nuevas · {data.receipt.existing}{" "}
              ya estaban · {data.receipt.excluded} filas excluidas.
            </p>
          )}
        </section>
      )}
      {!running && data?.run && (
        <section
          className="su-exceptions"
          aria-label="Excepciones para revisar"
        >
          <div className="su-progress-title">
            <h3>
              {exceptions.length ? "Solo falta resolver esto" : "Todo listo"}
            </h3>
            {acceptable.length > 0 && (
              <button
                className="button"
                disabled={!canEdit || accepting}
                onClick={() => accept(acceptable)}
              >
                {accepting
                  ? "Aplicando cambios…"
                  : `Aplicar ${acceptable.length} cambios propuestos`}
              </button>
            )}
          </div>
          {!exceptions.length && (
            <p>No hay excepciones de precios en esta actualización.</p>
          )}
          {exceptions.length > 0 && (
            <>
              <label className="ops-field">
                Buscar pendientes
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Carta, set o número"
                />
              </label>
              {filtered.slice(page * 10, page * 10 + 10).map((item) => (
                <article className="su-exception" key={item.id}>
                  <div>
                    <h4>{item.name}</h4>
                    <p>
                      {item.set} · {item.number || "Sin número"}
                    </p>
                    <p className="su-reason">{item.reason}</p>
                  </div>
                  <div className="su-price-change">
                    <span>
                      {item.before ? money(item.before) : "Sin precio"}
                    </span>
                    <strong>
                      {item.after
                        ? `→ ${money(item.after)}`
                        : "Precio pendiente"}
                    </strong>
                  </div>
                  <div>
                    {item.canAccept ? (
                      <button
                        className="button secondary"
                        disabled={!canEdit || accepting}
                        onClick={() => accept([item])}
                        aria-label={`Aceptar precio de ${item.name}`}
                      >
                        Aceptar precio
                      </button>
                    ) : (
                      <a
                        className="button secondary"
                        href={`/admin/precios?listing=${item.listingId}`}
                      >
                        Resolver esta carta
                      </a>
                    )}
                  </div>
                </article>
              ))}
              {!filtered.length && <p>No hay pendientes para esta búsqueda.</p>}
              {filtered.length > 10 && (
                <nav className="su-pages" aria-label="Páginas de pendientes">
                  <button
                    className="button secondary"
                    disabled={page === 0}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {page + 1} de {Math.ceil(filtered.length / 10)}
                  </span>
                  <button
                    className="button secondary"
                    disabled={(page + 1) * 10 >= filtered.length}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Siguiente
                  </button>
                </nav>
              )}
              <button
                className="button secondary"
                disabled={!canEdit || busy || accepting}
                onClick={() => start(true)}
              >
                Reintentar pendientes
              </button>
            </>
          )}
          {!!data.importExceptions?.length && (
            <details>
              <summary>
                {data.importExceptions.length} filas del archivo necesitan
                completar datos
              </summary>
              <ul>
                {data.importExceptions.map((item) => (
                  <li key={item.row}>
                    Fila {item.row}: {item.name} · {item.reason.join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
