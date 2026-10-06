"use client";
import { useRef, useState, type FormEvent } from "react";
import { accountPasswordSchema } from "@/lib/auth/validation";
export function AccountSettings({
  onDone,
}: {
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const active = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const parsed = accountPasswordSchema.safeParse({
      currentPassword: values.get("currentPassword"),
      password: values.get("password"),
      confirmation: values.get("confirmation"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    active.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No se pudo cambiar la contraseña.");
      form.reset();
      onDone(result.message);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar la contraseña.",
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="ops-panel">
      <h2>Mi cuenta</h2>
      <p>Cambiar contraseña</p>
      <form className="ops-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label className="ops-field">
            Contraseña actual
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label className="ops-field">
            Nueva contraseña
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="ops-field">
            Confirmar nueva contraseña
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="ops-error">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? "Cambiando…" : "Cambiar contraseña"}
        </button>
      </form>
    </section>
  );
}
