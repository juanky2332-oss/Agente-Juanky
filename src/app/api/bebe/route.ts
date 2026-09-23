import { manejar } from "@/lib/ruta";
import { leerBebe, cambiarAyuda, fijarNacimiento, preguntarBebe } from "@/lib/bebe";
import { ErrorN8n, avisarTelegram, escHtml } from "@/lib/n8n";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export const GET = manejar(async () => leerBebe());

export const PATCH = manejar(async (req: Request) => {
  const b = (await req.json()) as { id?: string; estado?: string; notas?: string; nacimiento?: string };
  if (b.nacimiento) {
    await fijarNacimiento(b.nacimiento);
    await avisarTelegram(`🍼 <b>Fecha de nacimiento confirmada desde la app</b>: ${escHtml(b.nacimiento)}. Plazos recalculados.`);
    return { ok: true };
  }
  if (!b.id) throw new ErrorN8n("Falta el ID", 400);
  await cambiarAyuda(b.id, { estado: b.estado, notas: b.notas });
  return { ok: true };
});

export const POST = manejar(async (req: Request) => {
  const { pregunta } = (await req.json()) as { pregunta?: string };
  if (!pregunta?.trim()) throw new ErrorN8n("Escribe la pregunta", 400);
  return { respuesta: await preguntarBebe(pregunta.slice(0, 1000)) };
});
