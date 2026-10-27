import { manejar } from "@/lib/ruta";
import { cargarEstudio, marcar, explicarMejor, novedades } from "@/lib/estudio";
import { ErrorN8n } from "@/lib/n8n";

// Bloque Estudio de la app: temario + progreso, «lo entiendo / no», explicación más sencilla y novedades de IA.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = manejar(async () => cargarEstudio());

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { accion?: string; id?: string; duda?: string; forzar?: boolean };
  const id = String(b.id || "");
  if (b.accion === "entiendo") return marcar(id, true);
  if (b.accion === "no-entiendo") return { explicacion: await explicarMejor(id, String(b.duda || "")) };
  if (b.accion === "novedades") return novedades(!!b.forzar);
  throw new ErrorN8n("Acción desconocida", 400);
});
