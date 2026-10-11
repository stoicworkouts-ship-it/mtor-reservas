"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/phone";

// El botón de Google se muestra solo cuando el ingreso con Google ya está
// configurado (ver README): variable NEXT_PUBLIC_GOOGLE_LOGIN=1 en Vercel.
const GOOGLE_LOGIN = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1";

// useSearchParams (aviso de error al volver de Google) requiere un Suspense.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "google" ? "No se pudo entrar con Google. Inténtalo de nuevo." : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // Si todo va bien, el navegador ya se fue a Google.
    if (error) {
      setLoading(false);
      setError("No se pudo entrar con Google. Inténtalo de nuevo.");
    }
  }

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
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        setLoading(false);
        setError("Revisa tu WhatsApp: debe ser un celular, por ejemplo 9 1234 5678.");
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, phone: normalizedPhone } },
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

  const inputClass =
    "w-full h-12 rounded-xl border border-border bg-surface px-3.5 text-base text-ink placeholder:text-ink2/60 focus:outline-none focus:border-borderStrong";
  const labelClass = "label block text-[12px] text-ink2 mb-1.5";

  return (
    <main className="min-h-screen bg-black flex justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Gimnasio M-TOR · La ruta para mejorar tu vida" width={220} height={220} />
        </div>
        <div className="text-center">
          <h1 className="font-display text-[32px] leading-tight uppercase">
            {mode === "login" ? "Reserva tu clase" : "Crea tu cuenta"}
          </h1>
          <p className="text-ink2 text-[15px] mt-1">Agenda, cupos y tu plan en un solo lugar.</p>
        </div>

        {GOOGLE_LOGIN && (
          <>
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="h-[52px] rounded-xl bg-white text-[#1f1f1f] font-semibold text-base flex items-center justify-center gap-2.5 disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.5z" />
            <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Continuar con Google
        </button>

        <div className="flex items-center gap-3 text-[13px] text-ink2">
          <div className="flex-1 h-px bg-border" />
          o con tu correo
          <div className="flex-1 h-px bg-border" />
        </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div>
              <label htmlFor="fullName" className={labelClass}>
                Nombre completo
              </label>
              <input
                id="fullName"
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          {mode === "signup" && (
            <div>
              <label htmlFor="phone" className={labelClass}>
                WhatsApp
              </label>
              <input
                id="phone"
                type="tel"
                required
                autoComplete="tel"
                placeholder="9 1234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-ink2 mt-1">Lo usamos para recordarte tus clases.</p>
            </div>
          )}
          <div>
            <label htmlFor="email" className={labelClass}>
              Correo
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="tu@correo.cl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {notice && <p className="text-sm text-success">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="label text-[18px] tracking-[0.1em] mt-2 w-full h-[52px] rounded-xl bg-accent text-accentInk disabled:opacity-50"
          >
            {loading ? "Cargando…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <p className="text-center text-sm text-ink2 mt-auto">
          {mode === "login" ? "¿Primera vez en MTOR? " : "¿Ya tienes cuenta? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
            }}
            className="font-bold text-accentText hover:underline min-h-[44px]"
          >
            {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </p>
      </div>
    </main>
  );
}
