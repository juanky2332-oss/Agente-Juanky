import { manejar } from "@/lib/ruta";
import { ErrorN8n } from "@/lib/n8n";
import { leerEtiqueta, apuntarVino } from "@/lib/vinos";

export const dynamic = "force-dynamic";
// Leer la etiqueta (~10 s) + investigar el vino en internet (~25-40 s).
export const maxDuration = 180;

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { base64?: string; mime?: string; nota?: string; comentario?: string; donde?: string };
  const etiqueta = await leerEtiqueta(b.base64 || "", b.mime || "image/jpeg");
  if (!etiqueta.es_vino) throw new ErrorN8n("La foto no parece de una botella o etiqueta de vino.", 422);
  if (!etiqueta.nombre) throw new ErrorN8n("No consigo leer el nombre del vino. Prueba con la etiqueta de frente y más cerca.", 422);
  const r = await apuntarVino(etiqueta, { nota: b.nota, comentario: b.comentario, donde: b.donde });
  const duda = etiqueta.confianza === "baja" && etiqueta.dudas ? `\n\n<i>🔎 Ojo con la lectura: ${etiqueta.dudas.replace(/[<>&]/g, "")}</i>` : "";
  return { ok: r.ok, resultado: r.resultado + duda, etiqueta };
});
