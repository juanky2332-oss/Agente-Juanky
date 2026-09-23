import { manejar } from "@/lib/ruta";
import { webhook, ErrorN8n } from "@/lib/n8n";

export const maxDuration = 120;

// Mismo "Agente del Jefazo" del MULTIAGENTE, mismas tools y MISMA memoria que Telegram.
export const POST = manejar(async (req: Request) => {
  const { mensaje } = (await req.json()) as { mensaje?: string };
  if (!mensaje?.trim()) throw new ErrorN8n("Mensaje vacío", 400);
  const r = await webhook<{ ok?: boolean; respuesta?: string }>("app-juanky-chat", { mensaje: mensaje.slice(0, 4000) }, 115000);
  return { ok: r.ok !== false, respuesta: r.respuesta || "(sin respuesta)" };
});
