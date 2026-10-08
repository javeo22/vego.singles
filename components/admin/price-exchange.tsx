"use client";
import { useEffect, useRef, useState } from "react";
import type { OperationRole } from "@/lib/operations/types";
import { pricingExchangeReady } from "@/lib/operations/price-workflow";
import { ActionForm, Field } from "./shared";
import { priceDate } from "./price-check";
export function PriceExchange({
  settings,
  role,
  onDone,
  openRequest = 0,
  required = false,
}: {
  settings:
    | { fx?: number | null; fx_at?: string | null; fx_source?: string | null }
    | undefined;
  role: OperationRole;
  onDone: (message: string) => void;
  openRequest?: number;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const ready = pricingExchangeReady(settings);
  useEffect(() => {
    if (openRequest) {
      setOpen(true);
      setTimeout(() => heading.current?.focus(), 0);
    }
  }, [openRequest]);
  useEffect(() => {
    if (required && !ready) setOpen(true);
  }, [required, ready]);
  return (
    <section
      className="price-exchange"
      data-ready={ready}
      aria-label="Cambio de dólares a colones"
    >
      <div className="price-section-heading">
        <div>
          <h3 ref={heading} tabIndex={-1}>
            {ready
              ? `1 USD = ${settings!.fx} colones`
              : "Falta configurar el cambio USD/CRC"}
          </h3>
          <p>
            {ready
              ? `Fecha registrada: ${priceDate(settings!.fx_at)}`
              : "Necesitamos un cambio vigente para calcular un precio en colones desde dólares."}
          </p>
        </div>
        {role === "owner" && (
          <button
            className="button secondary"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open
              ? "Cerrar configuración"
              : ready
                ? "Cambiar tipo de cambio"
                : "Configurar tipo de cambio"}
          </button>
        )}
      </div>
      {!ready && role !== "owner" && (
        <p>
          Un propietario debe configurar el cambio. Puedes seguir consultando el
          mercado.
        </p>
      )}
      {open && role === "owner" && (
        <ActionForm
          action="set_price_fx"
          label="Guardar tipo de cambio"
          onDone={(m) => {
            setOpen(false);
            onDone(m);
          }}
          payload={(d) => ({
            fx: Number(d.get("fx")),
            observedAt: new Date(String(d.get("observedAt"))).toISOString(),
            sourceUrl: String(d.get("sourceUrl") || "").trim() || null,
          })}
        >
          <Field
            name="fx"
            label="Colones por 1 dólar"
            type="number"
            min="1"
            max="10000"
            step="0.0001"
            value={settings?.fx ?? ""}
            required
          />
          <Field
            name="observedAt"
            label="Fecha y hora del tipo de cambio"
            type="datetime-local"
            required
          />
          <Field
            name="sourceUrl"
            label="Enlace de referencia (opcional)"
            type="url"
            value={settings?.fx_source || ""}
          />
          <p className="small-note">
            Puedes ingresar el cambio manualmente, sin enlace. Usa una fecha de
            los últimos 7 días.{" "}
            <a
              href="https://www.bccr.fi.cr/indicadores-economicos/tipos-de-cambio"
              target="_blank"
              rel="noreferrer"
            >
              Consultar BCCR ↗
            </a>
            . Los cambios de precio pendientes deben recalcularse si cambia este
            valor.
          </p>
        </ActionForm>
      )}
    </section>
  );
}
