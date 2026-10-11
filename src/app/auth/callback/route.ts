import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google devuelve a la persona aquí con un código; se cambia por la sesión
// (cookies) y se sigue a la agenda. Si algo falla, vuelve al login con aviso.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/agenda`);
  }

  return NextResponse.redirect(`${origin}/login?error=google`);
}
