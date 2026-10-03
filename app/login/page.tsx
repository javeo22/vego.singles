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
      if (authError)
        setError("We couldn't send your sign-in link. Please try again.");
      else setSent(true);
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again later.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main id="main-content" className="login-page wide">
      <section className="login-card">
        <h1>
          Your account<span>.</span>
        </h1>
        <p className="muted">Sign in with your authorized email.</p>
        {sent ? (
          <div className="login-success" role="status">
            <CheckCircle size={35} />
            <h2>Check your inbox.</h2>
            <p>Revisa tu correo para iniciar sesión.</p>
            <button className="button secondary" onClick={() => setSent(false)}>
              Use another email
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
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
              {pending ? "Sending your link…" : "Send sign-in link"}
              <ArrowRight size={20} />
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
