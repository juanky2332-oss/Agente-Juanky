import { manejar } from "@/lib/ruta";
import { leerTabla, aObjeto, anadirFila, modificarFila, borrarFila } from "@/lib/sheets";
import { ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";
const HOJA = "tarjetas visitas";

export const GET = manejar(async () => {
  const t = await leerTabla(HOJA, { hasta: "U3000" });
  return { cabecera: t.cabecera.filter(Boolean), contactos: t.filas.map((f) => ({ fila: f.fila, ...aObjeto(t, f.celdas) })) };
});

function limpiar(d: Record<string, unknown>) {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) if (k !== "fila") o[k] = String(v ?? "").trim();
  return o;
}

export const POST = manejar(async (req: Request) => {
  const d = (await req.json()) as Record<string, unknown>;
  if (!String(d.Empresa || "").trim() && !String(d.Contacto || "").trim()) throw new ErrorN8n("Pon empresa o persona", 400);
  return anadirFila(HOJA, limpiar(d));
});

export const PATCH = manejar(async (req: Request) => {
  const { fila, esperado, datos } = (await req.json()) as { fila: number; esperado: string; datos: Record<string, unknown> };
  return modificarFila(HOJA, fila, limpiar(datos), (o) => (o.Empresa || "") === esperado);
});

export const DELETE = manejar(async (req: Request) => {
  const u = new URL(req.url);
  const esperado = u.searchParams.get("esperado") || "";
  await borrarFila("tarjetas visitas", Number(u.searchParams.get("fila")), (o) => (o.Empresa || "") === esperado);
  return { ok: true };
});
