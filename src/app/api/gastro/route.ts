import { manejar } from "@/lib/ruta";
import { leerRangos, aTabla, aObjeto } from "@/lib/sheets";
import { webhook, ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = manejar(async () => {
  const [r, v] = await leerRangos(["'Restaurantes'!A1:Z1000", "'Vinos'!A1:Z1000"]);
  const tr = aTabla("Restaurantes", r), tv = aTabla("Vinos", v);
  return {
    restaurantes: tr.filas.map((f) => ({ fila: f.fila, ...aObjeto(tr, f.celdas) })),
    vinos: tv.filas.map((f) => ({ fila: f.fila, ...aObjeto(tv, f.celdas) })),
  };
});

// Escrituras por el motor GUIA GASTRO del bot: mismas reglas (nota 1-10, no duplica,
// comentarios acumulados con fecha, búsqueda en internet para vinos nuevos...).
export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { que: "restaurantes" | "vinos"; accion: string; nombre: string; nota?: string; comentario?: string; platos?: string; datos?: Record<string, string> };
  if (!["apuntar", "alta", "borrar", "enriquecer", "buscar", "modificar"].includes(b.accion)) throw new ErrorN8n("Acción no válida", 400);
  if (!b.nombre?.trim()) throw new ErrorN8n("Falta el nombre", 400);
  const r = await webhook<{ ok?: boolean; resultado?: string }>("guia-gastro-test", { ...b, avisar: "" }, 110000);
  return { ok: true, resultado: r.resultado || "" };
});
