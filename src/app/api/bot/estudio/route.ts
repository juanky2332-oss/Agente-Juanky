import { manejar } from "@/lib/ruta";
import { deTexto } from "@/lib/estudio";

// Telegram (/estudio /compras /ingles /refranes y /novedades vía PUENTE, ruta «estudio»): devuelve el texto HTML listo para enviar.
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { texto?: string; busqueda?: string };
  return { resultado: await deTexto(String(b.texto || b.busqueda || "/estudio")) };
});
