import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, valida } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const ok = await valida(req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Sesión caducada. Vuelve a entrar." }, { status: 401 });
  const url = new URL("/login", req.url);
  if (req.nextUrl.pathname !== "/") url.searchParams.set("volver", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
