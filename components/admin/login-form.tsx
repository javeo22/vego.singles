"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  LockKey,
} from "@phosphor-icons/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

type PasswordClient = {
  auth: Pick<SupabaseClient["auth"], "signInWithPassword">;
};

export default function AdminLoginForm({
  getClient = createClient,
  onAuthenticated = () => window.location.replace("/admin"),
}: {
  getClient?: () => PasswordClient;
  onAuthenticated?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const { data, error: authError } =
        await getClient().auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
      if (authError) {
        if (authError.code === "invalid_credentials")
          setError("Correo o contraseña incorrectos.");
        else if (authError.code === "email_not_confirmed")
          setError(
            "Tu cuenta todavía no está habilitada. Contacta al administrador.",
          );
        else if (authError.status === 429)
          setError(
            "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
          );
        else setError("No se puede iniciar sesión ahora. Intenta más tarde.");
      } else if (!data.session) {
        setError("No se pudo completar el inicio de sesión. Intenta de nuevo.");
      } else {
        setPassword("");
        onAuthenticated();
      }
    } catch {
      setError("No se puede iniciar sesión ahora. Intenta más tarde.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <section className="login-card">
      <h1>
        Admin<span>.</span>
      </h1>
      <p className="muted">Ingresa con tu correo autorizado y contraseña.</p>
      <form onSubmit={submit} aria-busy={pending}>
        <label htmlFor="username">Usuario (correo electrónico)</label>
        <div className="login-input">
          <EnvelopeSimple size={22} weight="light" aria-hidden="true" />
          <input
            id="username"
            name="username"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Correo autorizado"
            disabled={pending}
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>
        <label htmlFor="password" className="login-password-label">
          Contraseña
        </label>
        <div className="login-input">
          <LockKey size={22} weight="light" aria-hidden="true" />
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            aria-describedby={error ? "login-error" : "login-help"}
          />
          <button
            type="button"
            className="icon-button"
            disabled={pending}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={visible}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? <EyeSlash size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {error && (
          <p id="login-error" role="alert" className="form-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="button login-submit"
          disabled={pending}
        >
          {pending ? "Ingresando…" : "Iniciar sesión"}
          <ArrowRight size={20} />
        </button>
        <p id="login-help" className="muted login-help">
          Si no tienes contraseña o necesitas cambiarla, contacta al
          administrador.
        </p>
      </form>
    </section>
  );
}
