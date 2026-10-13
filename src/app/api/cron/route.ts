import { NextResponse } from "next/server";
import { manejar } from "@/lib/ruta";
import { generarProgramados } from "@/lib/datos";

// Vercel lo llama cada mañana (vercel.json): apunta los gastos/ingresos programados aunque
// nadie abra la app ese día, para que el bot y el parte de las 8:00 los vean.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async () => {
  const r = await generarProgramados();
  // Si algo falló (lectura, escritura o aviso) NO se responde 200: así Vercel y el centinela lo ven.
  if (r.errores.length) return NextResponse.json({ ok: false, ...r }, { status: 500 });
  return { ok: true, ...r };
});
