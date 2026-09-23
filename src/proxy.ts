import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, valida } from "@/lib/auth";

function igual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function proxy(req: NextRequest) {
  const ruta = req.nextUrl.pathname;
  // El bot de Telegram (n8n) entra con la misma clave compartida del workflow de la API.
  if (ruta.startsWith("/api/bot/") && igual(req.headers.get("x-app-key") || "", process.env.N8N_APP_KEY || "")) return NextResponse.next();
  // Cron diario de Vercel (manda "Authorization: Bearer <CRON_SECRET>").
  if (ruta === "/api/cron" && igual(req.headers.get("authorization") || "", "Bearer " + (process.env.CRON_SECRET || "\u0000"))) return NextResponse.next();
  const ok = await valida(req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (ruta.startsWith("/api/")) return NextResponse.json({ error: "Sesión caducada. Vuelve a entrar." }, { status: 401 });
  const url = new URL("/login", req.url);
  if (ruta !== "/") url.searchParams.set("volver", ruta);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
