"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { languageLabel, variantLabel, gameNames } from "@/lib/catalog";
import type { OperationRole } from "@/lib/operations/types";
import { money } from "./shared";

type Item = { id: string; listingId: string; name: string };
type Card = Item & {
  status: string;
  set: string;
  number: string;
  imageUrl: string | null;
  language: string;
  condition: string;
  finish: string;
  game: string;
  before: number;
  after: number | null;
  reason: string;
  canAccept: boolean;
  sourceUrl: string | null;
  expected: Record<string, unknown>;
  published: boolean;
  locked: boolean;
  minimumPrice: number;
};
type Queue = { items: Item[]; selected: Card | null; running: boolean };
type Session = { ids: string[]; index: number };
const storageKey = "vego-review-queue-v1";
async function load(listing?: string): Promise<Queue> {
  const response = await fetch(
    `/api/admin/store-update?queue=1${listing ? `&listing=${listing}` : ""}`,
    { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo cargar la cola.");
  return {
    items: data.items || [],
    selected: data.selected || null,
    running: !!data.running,
  };
}
function savedSession(): Session | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (
      value &&
      Array.isArray(value.ids) &&
      value.ids.length <= 10000 &&
      value.ids.every(
        (id: unknown) =>
          typeof id === "string" &&
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            id,
          ),
      ) &&
      Number.isInteger(value.index) &&
      value.index >= 0 &&
      value.index < value.ids.length
    )
      return value;
  } catch {}
  return null;
}
export function ReviewQueue({
  role,
  refreshKey,
  onDone,
  onResolved,
  onActiveChange,
}: {
  role: OperationRole;
  refreshKey?: string;
  onDone: (message: string) => void;
  onResolved: () => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const [queue, setQueue] = useState<Queue>({
    items: [],
    selected: null,
    running: false,
  });
  const [session, setSession] = useState<Session>({ ids: [], index: 0 });
  const [open, setOpen] = useState(false),
    [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [manual, setManual] = useState(false),
    [price, setPrice] = useState(""),
    [source, setSource] = useState(""),
    [note, setNote] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const card = queue.selected;
  const resolved = !!card && ["updated", "unchanged"].includes(card.status);
  const canEdit = role !== "stock";
  useEffect(() => {
    let active = true;
    load()
      .then((next) => {
        if (active)
          setQueue((current) => ({ ...next, selected: current.selected }));
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
  }, [refreshKey]);
  useEffect(() => {
    if (!queue.running) return;
    const timer = setTimeout(() => {
      void load()
        .then((next) =>
          setQueue((current) => ({ ...next, selected: current.selected })),
        )
        .catch((e) => setError(e.message));
    }, 3000);
    return () => clearTimeout(timer);
  }, [queue.running, queue.items]);
  useEffect(() => {
    heading.current?.focus();
  }, [card?.id, finished, open]);
  function remember(next: Session) {
    setSession(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  }
  async function select(ids: string[], index: number) {
    setLoading(true);
    setError("");
    try {
      if (index >= ids.length) {
        setFinished(true);
        setQueue(await load());
        remember({ ids, index });
        return;
      }
      const next = await load(ids[index]);
      const all = [
        ...ids,
        ...next.items.map((i) => i.listingId).filter((id) => !ids.includes(id)),
      ];
      setQueue(next);
      remember({ ids: all, index });
      setFinished(false);
      setManual(!next.selected?.canAccept);
      setPrice(String(next.selected?.after || next.selected?.before || ""));
      setSource(next.selected?.sourceUrl || "");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir esta carta.");
    } finally {
      setLoading(false);
    }
  }
  async function enter(restart = false) {
    setOpen(true);
    onActiveChange?.(true);
    setLoading(true);
    setError("");
    try {
      const next = await load();
      setQueue(next);
      const previous = restart ? null : savedSession();
      const pending = new Set(next.items.map((i) => i.listingId));
      const retained = previous?.ids.filter((id) => pending.has(id)) || [];
      const ids = [
        ...retained,
        ...next.items
          .map((i) => i.listingId)
          .filter((id) => !retained.includes(id)),
      ];
      const index =
        previous?.ids.slice(0, previous.index).filter((id) => pending.has(id))
          .length || 0;
      await select(ids, index);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la cola.");
      setLoading(false);
    }
  }
  async function save() {
    if (!card || !canEdit) return;
    const amount = Number(price);
    if (
      manual &&
      (!Number.isInteger(amount) || amount < 1 || amount > 100000000)
    ) {
      setError("Indica un precio entero positivo en colones.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/store-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          id: card.id,
          expected: card.expected,
          price: manual ? amount : null,
          source: manual ? source.trim() : "",
          note: manual ? note.trim() : "",
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.published)
        throw new Error(
          result.error || result.reason || "Esta carta sigue pendiente.",
        );
      await select(session.ids, session.index);
      onDone("Precio guardado y publicado.");
      onResolved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Tu carta sigue abierta.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (!open)
    return (
      <section className="rq-entry" aria-label="Cola de revisión">
        <div>
          <h3>Cola de revisión</h3>
          <p>
            {loading
              ? "Cargando pendientes…"
              : `Pendientes: ${queue.items.length}. El avance se guarda.`}
          </p>
        </div>
        <button
          className="button"
          disabled={loading || queue.running || !queue.items.length}
          onClick={() => enter()}
        >
          Revisar una por una
        </button>
        {error && (
          <p role="alert">
            {error}{" "}
            <button className="price-text-action" onClick={() => enter()}>
              Reintentar
            </button>
          </p>
        )}
      </section>
    );
  return (
    <section className="review-queue" aria-label="Revisión una por una">
      <header className="rq-header">
        <div>
          <h2>Revisión de cartas</h2>
        </div>
        <button
          className="button secondary"
          disabled={saving}
          onClick={() => {
            setOpen(false);
            onActiveChange?.(false);
          }}
        >
          Cerrar revisión
        </button>
      </header>
      <div className="rq-position">
        <span>
          {finished
            ? "Recorrido terminado"
            : `Carta ${session.index + 1} de ${session.ids.length}`}
        </span>
        <span>Pendientes: {queue.items.length}</span>
      </div>
      <progress
        aria-label="Avance de revisión"
        max={Math.max(1, session.ids.length)}
        value={finished ? session.ids.length : session.index}
      />
      {error && (
        <div className="su-error" role="alert">
          <p>{error}</p>
          <button
            className="button secondary"
            disabled={loading || saving}
            onClick={() => select(session.ids, session.index)}
          >
            Recargar carta
          </button>
          <button
            className="price-text-action"
            disabled={loading || saving}
            onClick={() => enter(true)}
          >
            Volver al primer pendiente
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Cargando carta…</p>
      ) : finished ? (
        <div className="rq-complete">
          <h3 ref={heading} tabIndex={-1}>
            {queue.items.length ? "Revisión terminada" : "Sin pendientes"}
          </h3>
          {!!queue.items.length && (
            <>
              <p>Las cartas que dejaste para después siguen pendientes.</p>
              <button className="button" onClick={() => enter(true)}>
                Revisar pendientes restantes
              </button>
            </>
          )}
        </div>
      ) : card ? (
        <>
          {queue.running && (
            <p role="status">Espera a que termine la actualización en curso.</p>
          )}
          <div className="rq-card">
            <div className="rq-art">
              {card.imageUrl?.startsWith("https://") ? (
                <Image
                  src={card.imageUrl}
                  alt={card.name}
                  width={260}
                  height={364}
                  unoptimized
                />
              ) : (
                <div className="rq-art-empty">
                  <p>Sin imagen</p>
                </div>
              )}
            </div>
            <div className="rq-decision">
              <p className="su-eyebrow">
                {gameNames[card.game as keyof typeof gameNames] || card.game}
              </p>
              <h3 ref={heading} tabIndex={-1}>
                {card.name}
              </h3>
              <p>
                {card.set} · {card.number || "Sin número"}
              </p>
              <p className="rq-variant">
                {variantLabel(card.condition)} · {variantLabel(card.finish)} ·{" "}
                {languageLabel(card.language)}
              </p>
              {resolved ? (
                <div className="rq-saved" role="status">
                  <strong>Resuelta y publicada</strong>
                  <p>Precio final: {money(card.before)}</p>
                </div>
              ) : (
                <>
                  <p className="rq-issue">{card.reason}</p>
                  <div className="rq-prices">
                    <div>
                      <span>Precio actual</span>
                      <strong>
                        {card.before ? money(card.before) : "Sin precio"}
                      </strong>
                    </div>
                    <div>
                      <span>Propuesta</span>
                      <strong>
                        {card.after ? money(card.after) : "Por definir"}
                      </strong>
                    </div>
                  </div>
                  <a
                    href={
                      card.sourceUrl?.startsWith("https://")
                        ? card.sourceUrl
                        : `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(`${card.name} ${card.set} ${card.number}`)}&view=grid`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="rq-source"
                  >
                    {card.sourceUrl
                      ? "Ver referencia de precio ↗"
                      : "Buscar referencia de precio ↗"}
                  </a>
                  {!manual ? (
                    <div className="rq-actions">
                      <button
                        className="button"
                        disabled={
                          !canEdit || saving || queue.running || card.locked
                        }
                        onClick={() => save()}
                      >
                        {saving ? "Guardando…" : "Aceptar y publicar"}
                      </button>
                      <button
                        className="price-text-action"
                        disabled={saving}
                        onClick={() => setManual(true)}
                      >
                        Elegir otro precio
                      </button>
                    </div>
                  ) : (
                    <form
                      className="rq-manual"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                      }}
                    >
                      <label className="ops-field">
                        Precio final en colones
                        <input
                          type="number"
                          min={Math.max(1, Number(card.minimumPrice))}
                          max={100000000}
                          step="1"
                          required
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          disabled={
                            !canEdit || saving || queue.running || card.locked
                          }
                        />
                      </label>
                      {Number(card.minimumPrice) > 1 && (
                        <p className="small-note">
                          Mínimo según costo: {money(card.minimumPrice)}
                        </p>
                      )}
                      <details>
                        <summary>Referencia y nota opcionales</summary>
                        <label className="ops-field">
                          Enlace de referencia
                          <input
                            type="url"
                            pattern="https://.*"
                            placeholder="https://…"
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                            disabled={saving}
                          />
                        </label>
                        <label className="ops-field">
                          Nota de la decisión
                          <textarea
                            maxLength={500}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            disabled={saving}
                          />
                        </label>
                      </details>
                      <button
                        className="button"
                        disabled={
                          !canEdit || saving || queue.running || card.locked
                        }
                      >
                        {saving ? "Guardando…" : "Guardar precio y publicar"}
                      </button>
                      {card.canAccept && (
                        <button
                          type="button"
                          className="price-text-action"
                          disabled={saving}
                          onClick={() => setManual(false)}
                        >
                          Usar la propuesta
                        </button>
                      )}
                    </form>
                  )}
                  {card.locked && (
                    <p role="status">
                      Precio bloqueado manualmente. Déjalo para después o revisa
                      el bloqueo en Inventario.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <footer className="rq-footer">
            <button
              className="button secondary"
              disabled={saving || session.index === 0}
              onClick={() => select(session.ids, session.index - 1)}
            >
              Anterior
            </button>
            <div>
              {!resolved && (
                <button
                  className="button secondary"
                  disabled={saving}
                  onClick={() => select(session.ids, session.index + 1)}
                >
                  Dejar para después
                </button>
              )}
              <button
                className="button"
                disabled={saving || !resolved}
                onClick={() => select(session.ids, session.index + 1)}
              >
                {session.index + 1 >= session.ids.length
                  ? "Terminar recorrido"
                  : "Siguiente"}
              </button>
            </div>
          </footer>
        </>
      ) : !error ? (
        <div className="rq-complete">
          <h3>Esta carta ya no está en revisión.</h3>
          <button
            className="button"
            onClick={() => select(session.ids, session.index + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </section>
  );
}
