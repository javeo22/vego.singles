"use client";
import type { OperationRole } from "@/lib/operations/types";
import { ActionForm, Feedback, Field, useData, type List } from "./shared";
import { AccountSettings } from "./account-settings";
export function SettingsPanel({
  role,
  revision,
  onDone,
}: {
  role: OperationRole;
  revision: number;
  onDone: (m: string) => void;
}) {
  const r = useData<List>("type=settings", revision),
    locations = useData<List>("type=locations", revision);
  const s = r.data?.rows[0],
    p = s?.policy;
  return (
    <>
      <AccountSettings onDone={onDone} />
      <Feedback {...r} />
      {s && (
        <section className="ops-panel">
          <h2>Política de precios</h2>
          <ActionForm
            key={s.revision}
            action="settings"
            disabled={role !== "owner"}
            onDone={onDone}
            payload={(d) => ({
              policy: {
                marketFactor: Number(d.get("factor")),
                targetMargin: Number(d.get("margin")) / 100,
                variableFee: Number(d.get("fee")) / 100,
                handlingCrc: Number(d.get("handling")),
                fixedFeeCrc: Number(d.get("fixed")),
                maxAgeHours: Number(d.get("age")),
              },
              fx: d.get("fx") === "" ? null : Number(d.get("fx")),
              fxAt: d.get("fxAt")
                ? new Date(String(d.get("fxAt"))).toISOString()
                : null,
              fxSource: d.get("fxSource") || null,
              dailyJobLimit: Number(d.get("dailyLimit")),
              deliveryFeeCrc: Number(d.get("delivery")),
            })}
          >
            <Field
              label="Factor local de mercado"
              name="factor"
              type="number"
              step="0.01"
              min="0.5"
              max="2"
              value={p.marketFactor}
              required
            />
            <Field
              label="Margen objetivo (%)"
              name="margin"
              type="number"
              step="0.1"
              min="0"
              max="80"
              value={p.targetMargin * 100}
              required
            />
            <Field
              label="Comisión variable (%)"
              name="fee"
              type="number"
              step="0.1"
              min="0"
              max="30"
              value={p.variableFee * 100}
              required
            />
            <Field
              label="Manejo unitario CRC"
              name="handling"
              type="number"
              min="0"
              value={p.handlingCrc}
              required
            />
            <Field
              label="Comisión fija unitaria CRC"
              name="fixed"
              type="number"
              min="0"
              value={p.fixedFeeCrc}
              required
            />
            <Field
              label="Vigencia máxima de evidencia (horas)"
              name="age"
              type="number"
              min="1"
              max="720"
              value={p.maxAgeHours}
              required
            />
            <Field
              label="CRC por USD (vacío si pendiente)"
              name="fx"
              type="number"
              min="1"
              step="0.0001"
              value={s.fx ?? ""}
            />
            <Field
              label="Fecha del tipo de cambio"
              name="fxAt"
              type="datetime-local"
              value={
                s.fx_at
                  ? new Date(
                      Date.parse(s.fx_at) -
                        new Date(s.fx_at).getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
            />
            <Field
              label="Fuente HTTPS del tipo de cambio"
              name="fxSource"
              type="url"
              value={s.fx_source || ""}
            />
            <Field
              label="Máximo trabajos por día"
              name="dailyLimit"
              type="number"
              min="1"
              max="1000"
              value={s.daily_job_limit}
              required
            />
            <Field
              label="Entrega Duelist Kingdom CRC"
              name="delivery"
              type="number"
              min="0"
              value={s.delivery_fee_crc}
              required
            />
            <p className="small-note">
              Tipo de cambio vigente por 7 días. Cambiar la política invalida
              propuestas pendientes. Precios calculados antes de impuestos;
              confirma tu tratamiento fiscal antes de usar márgenes.
            </p>
          </ActionForm>
        </section>
      )}
      <section className="ops-panel">
        <h2>Ubicaciones</h2>
        <Feedback {...locations} />
        {locations.data?.rows.map((l) => (
          <p key={l.code}>
            {l.code} · {l.label} · {l.active ? "Activa" : "Por asignar"}
          </p>
        ))}
        <ActionForm
          action="location"
          disabled={role !== "owner"}
          onDone={onDone}
          payload={(d) => ({ code: d.get("code"), label: d.get("label") })}
        >
          <Field
            label="Código (mayúsculas, números, guion)"
            name="code"
            required
          />
          <Field label="Nombre" name="label" required />
        </ActionForm>
      </section>
    </>
  );
}
