"use client";
import { useState } from "react";
import { ArrowRight, CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/browser";
export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (authError) setError("No se pudo enviar el enlace. Intenta de nuevo.");
      else setSent(true);
    } catch {
      setError("No se puede iniciar sesión ahora. Intenta más tarde.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main id="main-content" className="login-page wide">
      <section className="login-card">
        <h1>
          Admin<span>.</span>
        </h1>
        <p className="muted">Ingresa tu correo autorizado.</p>
        {sent ? (
          <div className="login-success" role="status">
            <CheckCircle size={35} />
            <h2>Revisa tu correo.</h2>
            <p>Revisa tu correo para iniciar sesión.</p>
            <button className="button secondary" onClick={() => setSent(false)}>
              Usar otro correo
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email">Correo electrónico</label>
            <div className="login-input">
              <EnvelopeSimple size={22} weight="light" />
              <input
                id="email"
                autoComplete="email"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Correo autorizado"
                disabled={pending}
              />
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button login-submit" disabled={pending}>
              {pending ? "Enviando enlace…" : "Enviar enlace"}
              <ArrowRight size={20} />
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
