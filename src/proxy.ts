import { NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/lib/auth";
import { accesoPermitido } from "@/lib/acceso";

export async function proxy(req: NextRequest) {
  const ruta = req.nextUrl.pathname;
  // Misma comprobación que repite manejar() en las rutas (lib/acceso.ts): cookie, x-app-key del bot o Bearer del cron.
  const ok = await accesoPermitido({
    ruta,
    cookie: req.cookies.get(COOKIE)?.value,
    appKey: req.headers.get("x-app-key") || "",
    authorization: req.headers.get("authorization") || "",
  });
  if (ok) return NextResponse.next();
  if (ruta.startsWith("/api/")) return NextResponse.json({ error: "Sesión caducada. Vuelve a entrar." }, { status: 401 });
  const url = new URL("/login", req.url);
  if (ruta !== "/") url.searchParams.set("volver", ruta);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
