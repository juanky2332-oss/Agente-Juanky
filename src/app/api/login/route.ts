import { NextResponse } from "next/server";
import { COOKIE, DURACION_S, firmar, passwordOk } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !passwordOk(password)) {
    await new Promise((r) => setTimeout(r, 800)); // frena los intentos a lo bruto
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await firmar(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: DURACION_S });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
