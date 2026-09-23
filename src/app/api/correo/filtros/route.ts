import { manejar } from "@/lib/ruta";
import { leerTabla, anadirFila, modificarPorId, borrarPorIds, siguienteId } from "@/lib/sheets";
import { ErrorN8n } from "@/lib/n8n";

// Lista blanca de proveedores que se leen del correo (pestaña "Filtros correo").
// El workflow FACTURAS DEL CORREO (7:50) solo analiza lo que case con una de estas filas.
export const dynamic = "force-dynamic";

interface Entrada { activo?: boolean; nombre?: string; remitente?: string; texto?: string; categoria?: string; ambito?: string; recurrencia?: string; pdf?: boolean; notas?: string }

function aColumnas(e: Entrada, parcial = false) {
  const o: Record<string, string> = {};
  if (e.activo !== undefined) o.ACTIVO = e.activo ? "sí" : "no";
  if (e.pdf !== undefined) o.PDF = e.pdf ? "sí" : "no";
  for (const [k, c] of [["nombre", "NOMBRE"], ["remitente", "REMITENTE"], ["texto", "TEXTO"], ["categoria", "CATEGORIA"], ["ambito", "AMBITO"], ["recurrencia", "RECURRENCIA"], ["notas", "NOTAS"]] as const)
    if (e[k] !== undefined) o[c] = String(e[k] ?? "").trim();
  if (o.REMITENTE !== undefined) {
    o.REMITENTE = o.REMITENTE.toLowerCase().replace(/^.*@/, "");
    if (o.REMITENTE.length < 3) throw new ErrorN8n("El remitente tiene que ser un trozo del correo de al menos 3 letras (p.ej. «eniplenitude.es»)", 400);
  }
  if (o.TEXTO) {
    try {
      new RegExp(o.TEXTO);
    } catch {
      throw new ErrorN8n("El texto no es válido: usa palabras separadas por |", 400);
    }
  }
  if (!parcial && (!o.NOMBRE || !o.REMITENTE)) throw new ErrorN8n("Pon un nombre y el remitente", 400);
  return o;
}

export const POST = manejar(async (req: Request) => {
  const e = (await req.json()) as Entrada;
  const t = await leerTabla("Filtros correo");
  const id = siguienteId(t, "F", 2);
  await anadirFila("Filtros correo", { ...aColumnas({ activo: true, pdf: true, ...e }), ID: id }, t.cabecera);
  return { ok: true, id };
});

export const PATCH = manejar(async (req: Request) => {
  const b = (await req.json()) as { id: string; cambios: Entrada };
  await modificarPorId("Filtros correo", b.id, aColumnas(b.cambios, true));
  return { ok: true };
});

export const DELETE = manejar(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  await borrarPorIds("Filtros correo", [id]);
  return { ok: true };
});
