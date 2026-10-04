"use client";
import { useState } from "react";
import Link from "next/link";
import type { OperationRole } from "@/lib/operations/types";
import { Brand } from "@/components/site-header";
import { InventoryPanel } from "./inventory";
import { ImportsPanel } from "./imports";
import { PricesPanel } from "./prices";
import { RequestsPanel } from "./requests";
import { SettingsPanel } from "./settings";
import {
  ActionForm,
  Feedback,
  Pager,
  date,
  statusLabel,
  useData,
  type List,
} from "./shared";
const sections: Record<string, string> = {
  "": "Hoy",
  inventario: "Inventario",
  importaciones: "Importaciones",
  revisiones: "Revisiones",
  precios: "Precios",
  solicitudes: "Solicitudes",
  ajustes: "Ajustes",
};
export default function OperationsWorkspace({
  section = "",
  role,
}: {
  section?: string;
  role: OperationRole | null;
}) {
  const [revision, setRevision] = useState(0),
    [message, setMessage] = useState("");
  const onDone = (m: string) => {
    setMessage(m);
    setRevision((x) => x + 1);
  };
  return (
    <main id="main-content" className="admin-workspace">
      <header className="admin-header">
        <div className="wide admin-header-main">
          <Brand />
          <a href="/" className="storefront-link">
            Ver tienda ↗
          </a>
        </div>
        <nav className="wide admin-nav" aria-label="Administración">
          {Object.entries(sections).map(([path, label]) => (
            <Link
              key={path}
              href={`/admin${path ? `/${path}` : ""}`}
              aria-current={path === section ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="wide ops-content">
        <div className="ops-title-row">
          <h1>{sections[section] || "Administración"}</h1>
          <span className="workspace-badge">
            {role
              ? { owner: "Propietario", reviewer: "Revisor", stock: "Stock" }[
                  role
                ]
              : "Instalación pendiente"}
          </span>
        </div>
        {message && (
          <div role="status" className="ops-notice">
            {message}
            <button
              className="icon-button"
              aria-label="Cerrar mensaje"
              onClick={() => setMessage("")}
            >
              ×
            </button>
          </div>
        )}
        {!role ? (
          <section className="ops-panel">
            <h2>La actualización está pendiente de instalar</h2>
            <p>
              La tienda sigue disponible. Completa la instalación y asignación
              del equipo con la guía entregada para activar estas funciones.
            </p>
          </section>
        ) : (
          <>
            {section === "" && (
              <TodayPanel role={role} revision={revision} onDone={onDone} />
            )}{" "}
            {(section === "inventario" || section === "revisiones") && (
              <InventoryPanel
                key={section}
                role={role}
                revision={revision}
                onDone={onDone}
                reviews={section === "revisiones"}
              />
            )}{" "}
            {section === "importaciones" && (
              <ImportsPanel role={role} revision={revision} onDone={onDone} />
            )}{" "}
            {section === "precios" && (
              <PricesPanel role={role} revision={revision} onDone={onDone} />
            )}{" "}
            {section === "solicitudes" && (
              <RequestsPanel role={role} revision={revision} onDone={onDone} />
            )}{" "}
            {section === "ajustes" && (
              <SettingsPanel role={role} revision={revision} onDone={onDone} />
            )}
          </>
        )}
      </div>
    </main>
  );
}
function TodayPanel({
  role,
  revision,
  onDone,
}: {
  role: OperationRole;
  revision: number;
  onDone: (m: string) => void;
}) {
  const [page, setPage] = useState(0);
  const counts = useData<Record<string, number>>("type=counts", revision);
  const jobs = useData<List>(`type=jobs&page=${page}`, revision);
  const activity = useData<List>("type=activity", revision);
  return (
    <>
      <Feedback {...counts} />
      <div className="stats">
        {Object.entries({
          identity: ["Identidades pendientes", "revisiones"],
          proposals: ["Precios pendientes", "precios"],
          imports: ["Filas por revisar", "importaciones"],
          requests: ["Solicitudes abiertas", "solicitudes"],
          jobs: ["Trabajos en cola", ""],
        }).map(([key, [label, path]]) => (
          <Link
            className="stat"
            href={`/admin${path ? `/${path}` : ""}`}
            key={key}
          >
            <span>{label}</span>
            <strong>{counts.data?.[key] ?? "—"}</strong>
          </Link>
        ))}
      </div>
      <section className="ops-panel">
        <h2>Cola de trabajo</h2>
        <RunJobButton disabled={role === "stock"} onDone={onDone} />
        <Feedback {...jobs} />
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Proceso</th>
                <th>Estado</th>
                <th>Intentos</th>
                <th>Detalle</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {jobs.data?.rows.map((j) => (
                <tr key={j.id}>
                  <td>
                    {j.kind === "match_import"
                      ? "Identificar carta"
                      : "Consultar mercado"}
                    <small>{j.card_name || j.entity_id}</small>
                  </td>
                  <td>{statusLabel(j.status)}</td>
                  <td>{j.attempts}</td>
                  <td>
                    {j.error || j.result?.message || "—"}
                    <small>{date(j.updated_at)}</small>
                  </td>
                  <td>
                    {["failed", "needs_review"].includes(j.status) && (
                      <ActionForm
                        action="retry_job"
                        label="Reintentar"
                        disabled={role === "stock"}
                        onDone={onDone}
                        payload={() => ({ id: j.id })}
                      >
                        <span />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {jobs.data && (
          <Pager page={page} total={jobs.data.total} onPage={setPage} />
        )}
      </section>
      <section className="ops-panel">
        <h2>Actividad reciente</h2>
        <Feedback {...activity} />
        {activity.data?.rows.slice(0, 15).map((a) => (
          <p key={a.id}>
            {date(a.created_at)} · {actionLabel(a.action)} ·{" "}
            <small>{a.entity_id || "Configuración"}</small>
          </p>
        ))}
      </section>
    </>
  );
}
function RunJobButton({
  disabled,
  onDone,
}: {
  disabled: boolean;
  onDone: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className="button secondary"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/admin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "run_job" }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onDone(d.message);
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo procesar");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Procesando…" : "Procesar siguiente trabajo"}
      </button>
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
      <p className="small-note">
        Los trabajos se guardan y pueden retomarse. Puedes programar su
        procesamiento automático con la guía.
      </p>
    </>
  );
}
function actionLabel(a: string) {
  return (
    (
      {
        stage_import: "Importación guardada",
        commit_import: "Importación incorporada",
        resolve_import: "Coincidencia verificada",
        verify_listing: "Identidad revisada",
        review_price: "Precio revisado",
        publish: "Publicación actualizada",
        reserve_request: "Reserva confirmada",
        sell_request: "Venta registrada",
        cancel_request: "Solicitud cancelada",
        settings: "Política actualizada",
        evidence: "Evidencia de precio",
        fulfill_request: "Entrega registrada",
        refresh_request: "Cotización actualizada",
        membership: "Rol actualizado",
        price_lock: "Bloqueo de precio",
        quarantine_lot: "Lote revisado",
        worker_claim: "Trabajo iniciado",
        lot_cost: "Costo de lote confirmado",
        revoke_membership: "Acceso revocado",
      } as Record<string, string>
    )[a] || a
  );
}
