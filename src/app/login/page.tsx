"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/agenda");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setNotice("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.");
      setMode("login");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl">
            MT<span style={{ color: "var(--accent)" }}>OR</span>
          </h1>
          <p className="text-ink2 text-xs uppercase tracking-widest mt-1">
            Reservas &amp; agenda
          </p>
        </div>

        <div className="flex gap-1 mb-6 rounded-full bg-surface2 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
              mode === "login" ? "bg-accent text-accentInk" : "text-ink2"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
              mode === "signup" ? "bg-accent text-accentInk" : "text-ink2"
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div>
              <label htmlFor="fullName" className="block text-xs font-semibold text-ink2 mb-1">
                Nombre completo
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-ink2 mb-1">
              Correo
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-ink2 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
          {notice && <p className="text-sm" style={{ color: "var(--success)" }}>{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-accent text-accentInk font-semibold py-2.5 text-sm disabled:opacity-50"
          >
            {loading ? "Cargando…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
      </div>
    </main>
  );
}
