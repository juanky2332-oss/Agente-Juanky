import { manejar } from "@/lib/ruta";
import { anadirFila, modificarFila, borrarFila } from "@/lib/sheets";
import { ErrorN8n } from "@/lib/n8n";
import { hoyEs, num } from "@/lib/parse";

interface Ref { fila?: number; categoria: string; metrica: string; unidad: string; buenoHasta: number; caroDesde: number; fuente: string }

function cols(r: Ref) {
  if (!r.categoria || !r.metrica) throw new ErrorN8n("Falta categoría o métrica", 400);
  if (!(num(r.buenoHasta) < num(r.caroDesde))) throw new ErrorN8n("«Bueno hasta» tiene que ser menor que «caro desde»", 400);
  return {
    CATEGORIA: r.categoria, METRICA: r.metrica, UNIDAD: r.unidad,
    BUENO_HASTA: String(num(r.buenoHasta)), CARO_DESDE: String(num(r.caroDesde)),
    FUENTE: r.fuente || "Puesta a mano", FECHA: hoyEs(),
  };
}

export const POST = manejar(async (req: Request) => {
  const r = (await req.json()) as Ref;
  return anadirFila("Referencias precios", cols(r));
});
export const PATCH = manejar(async (req: Request) => {
  const r = (await req.json()) as Ref;
  if (!r.fila) throw new ErrorN8n("Falta la fila", 400);
  return modificarFila("Referencias precios", r.fila, cols(r));
});
export const DELETE = manejar(async (req: Request) => {
  const fila = Number(new URL(req.url).searchParams.get("fila"));
  await borrarFila("Referencias precios", fila);
  return { ok: true };
});
