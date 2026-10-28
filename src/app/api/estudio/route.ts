import { manejar } from "@/lib/ruta";
import { cargarEstudio, marcar, explicarMejor, novedades, resumen, corregirIngles, ampliar, nuevoEjercicio, responderEjercicio } from "@/lib/estudio";
import { ErrorN8n } from "@/lib/n8n";

// Bloque Estudio de la app: materias + progreso, «lo entiendo / no», explicación más sencilla, lo visto,
// práctica y corrector de inglés, «Ampliar» (lecciones nuevas buscadas en internet) y novedades de IA.
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export const GET = manejar(async (req: Request) => cargarEstudio(new URL(req.url).searchParams.get("m") || undefined));

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { accion?: string; id?: string; duda?: string; forzar?: boolean; materia?: string; texto?: string; tipo?: string };
  const id = String(b.id || "");
  if (b.accion === "entiendo") return marcar(id, true);
  if (b.accion === "no-entiendo") return { explicacion: await explicarMejor(id, String(b.duda || "")) };
  if (b.accion === "novedades") return novedades(!!b.forzar);
  if (b.accion === "visto") return resumen(b.materia);
  if (b.accion === "ampliar") return ampliar(String(b.materia || ""), String(b.texto || ""));
  if (b.accion === "ejercicio") return nuevoEjercicio(String(b.texto || b.id || ""), String(b.tipo || ""));
  if (b.accion === "responder") return responderEjercicio(String(b.texto || ""));
  if (b.accion === "corregir") return corregirIngles(String(b.texto || ""));
  throw new ErrorN8n("Acción desconocida", 400);
});
