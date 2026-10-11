"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePhone } from "@/app/actions";

// Se muestra en lugar de la app mientras el usuario no tenga teléfono.
export default function PhoneForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await savePhone(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-[20px] border border-border bg-surface p-5 mt-4">
      <h1 className="font-display text-[28px] leading-tight uppercase mb-1">Agrega tu WhatsApp</h1>
      <p className="text-sm text-ink2 mb-4">Lo usamos para recordarte tus clases y avisarte si alguna cambia.</p>
      <form action={handleSubmit} className="flex flex-col gap-3">
        <input
          name="phone"
          type="tel"
          required
          placeholder="9 1234 5678"
          aria-label="Tu número de WhatsApp"
          className="w-full h-12 rounded-xl border border-border bg-bg px-3.5 text-base"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="label text-[17px] tracking-[0.08em] w-full h-[52px] rounded-xl bg-accent text-accentInk disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </section>
  );
}
