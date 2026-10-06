"use client";
import { useRef, useState, type FormEvent } from "react";
import type { OperationRole } from "@/lib/operations/types";
import { usersSchema } from "@/lib/auth/validation";
import { ActionForm, Feedback, Field, date, useData } from "./shared";
const roles = { owner: "Propietario", reviewer: "Revisor", stock: "Stock" };
type Team = {
  rows: { email: string; role: OperationRole; created_at: string }[];
  total: number;
  currentEmail: string;
};
export function UsersPanel({
  role,
  revision,
  onDone,
}: {
  role: OperationRole;
  revision: number;
  onDone: (message: string) => void;
}) {
  const r = useData<Team>("type=team", revision);
  const [selected, setSelected] = useState<string | null>(null);
  if (role !== "owner")
    return (
      <p className="ops-error">
        Solo un propietario puede administrar usuarios.
      </p>
    );
  return (
    <>
      <section className="ops-panel">
        <h2>Usuarios del equipo</h2>
        <Feedback {...r} />
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Rol</th>
                <th>Acceso desde</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {r.data?.rows.map((user) => (
                <tr key={user.email}>
                  <td>
                    {user.email}
                    {user.email === r.data?.currentEmail && (
                      <small>Tu cuenta</small>
                    )}
                  </td>
                  <td>{roles[user.role]}</td>
                  <td>{date(user.created_at)}</td>
                  <td>
                    <button
                      className="button secondary"
                      disabled={user.email === r.data?.currentEmail}
                      onClick={() => setSelected(user.email)}
                    >
                      Administrar {user.email}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.data?.rows.length === 0 && (
          <p>No hay usuarios con acceso asignado.</p>
        )}
      </section>
      {selected && (
        <section className="ops-panel">
          <h2>Administrar {selected}</h2>
          <button
            className="button secondary"
            onClick={() => setSelected(null)}
          >
            Cerrar usuario
          </button>
          <ActionForm
            action="membership"
            label="Actualizar rol"
            onDone={onDone}
            payload={(data) => ({ email: selected, role: data.get("role") })}
          >
            <Field
              label="Rol del usuario"
              name="role"
              value={r.data?.rows.find((user) => user.email === selected)?.role}
            >
              <RoleOptions />
            </Field>
          </ActionForm>
          <UserCredentials
            key={selected}
            action="reset_password"
            email={selected}
            onDone={onDone}
          />
          <ActionForm
            action="revoke_membership"
            label="Revocar acceso"
            onDone={(message) => {
              setSelected(null);
              onDone(message);
            }}
            payload={() => ({ email: selected })}
          >
            <p>
              Retira el acceso a la administración. El historial de operaciones
              se conserva.
            </p>
          </ActionForm>
        </section>
      )}
      <section className="ops-panel">
        <h2>Crear usuario</h2>
        <UserCredentials action="create_user" onDone={onDone} />
      </section>
      <section className="ops-panel">
        <h2>Asignar acceso a una cuenta existente</h2>
        <ActionForm
          action="membership"
          label="Asignar acceso"
          onDone={onDone}
          payload={(data) => ({
            email: data.get("email"),
            role: data.get("role"),
          })}
        >
          <Field
            label="Correo de la cuenta existente"
            name="email"
            type="email"
            required
          />
          <Field label="Rol" name="role" value="stock">
            <RoleOptions />
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
function RoleOptions() {
  return (
    <>
      {Object.entries(roles).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </>
  );
}
function UserCredentials({
  action,
  email,
  onDone,
}: {
  action: "create_user" | "reset_password";
  email?: string;
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const active = useRef(false);
  const key = useRef<string | null>(null);
  const identity = useRef("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const nextIdentity = `${values.get("email")}:${values.get("role")}`;
    if (nextIdentity !== identity.current) {
      identity.current = nextIdentity;
      key.current = null;
    }
    if (values.get("password") !== values.get("confirmation")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    const parsed = usersSchema.safeParse(
      action === "create_user"
        ? {
            action,
            email: values.get("email"),
            password: values.get("password"),
            role: values.get("role"),
            key: key.current || crypto.randomUUID(),
          }
        : { action, email, password: values.get("password") },
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (parsed.data.action === "create_user") key.current = parsed.data.key;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No se pudo guardar la cuenta.");
      form.reset();
      key.current = null;
      onDone(result.message);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la cuenta.",
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="ops-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        {action === "create_user" && (
          <>
            <Field
              label="Correo del nuevo usuario"
              name="email"
              type="email"
              required
            />
            <Field label="Rol del nuevo usuario" name="role" value="stock">
              <RoleOptions />
            </Field>
          </>
        )}
        <label className="ops-field">
          {action === "create_user"
            ? "Contraseña inicial"
            : "Nueva contraseña del usuario"}
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="ops-field">
          Confirmar contraseña del usuario
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
        {busy
          ? "Guardando…"
          : action === "create_user"
            ? "Crear usuario"
            : "Restablecer contraseña"}
      </button>
    </form>
  );
}
