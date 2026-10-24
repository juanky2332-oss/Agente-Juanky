import { manejar } from "@/lib/ruta";
import { leerRangos, aTabla, aObjeto } from "@/lib/sheets";
import { webhook, ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export const GET = manejar(async () => {
  const [r, v, m] = await leerRangos(["'Restaurantes'!A1:Z1000", "'Vinos'!A1:Z1000", "'Vermut'!A1:Z1000"]);
  const tr = aTabla("Restaurantes", r), tv = aTabla("Vinos", v), tm = aTabla("Vermut", m);
  return {
    restaurantes: tr.filas.map((f) => ({ fila: f.fila, ...aObjeto(tr, f.celdas) })),
    // FICHA (columna L) = la investigación del sumiller en JSON; la página la parsea.
    vinos: tv.filas.map((f) => ({ fila: f.fila, ...aObjeto(tv, f.celdas) })),
    // Vermuts: mismo motor que los vinos (MARCA, ORIGEN, VINO BASE, BOTÁNICOS / NOTAS y su FICHA).
    vermuts: tm.filas.map((f) => ({ fila: f.fila, ...aObjeto(tm, f.celdas) })),
  };
});

// Escrituras por el motor GUIA GASTRO del bot: mismas reglas (nota 1-10, no duplica,
// comentarios acumulados con fecha, búsqueda en internet para vinos nuevos...).
export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { que: "restaurantes" | "vinos" | "vermuts"; accion: string; nombre: string; nota?: string; comentario?: string; platos?: string; datos?: Record<string, string> };
  if (!["apuntar", "alta", "borrar", "enriquecer", "buscar", "modificar"].includes(b.accion)) throw new ErrorN8n("Acción no válida", 400);
  if (!b.nombre?.trim()) throw new ErrorN8n("Falta el nombre", 400);
  // Un vino o vermut nuevo, o "investigar", tarda 25-40 s (el sumiller busca y lee varias webs).
  const r = await webhook<{ ok?: boolean; resultado?: string }>("guia-gastro-test", { ...b, avisar: "" }, 150000);
  return { ok: true, resultado: r.resultado || "" };
});
