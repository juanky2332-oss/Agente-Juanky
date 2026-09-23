import { manejar } from "@/lib/ruta";
import { leerTabla, aObjeto } from "@/lib/sheets";
import { webhook, ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export const GET = manejar(async () => {
  const t = await leerTabla("Bebé", { hasta: "K500" });
  const filas = t.filas.map((f) => ({ ...aObjeto(t, f.celdas), fila: f.fila }) as Record<string, string> & { fila: number });
  const config = filas.find((f) => f.FASE === "_CONFIG");
  return { tareas: filas.filter((f) => f.FASE !== "_CONFIG"), nacimiento: config?.PLAZO || "" };
});

// Escrituras por el motor CHECKLIST BEBE del bot (recalcula plazos al cambiar el nacimiento).
export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { accion: string; fila?: string; estado?: string; texto?: string; fecha?: string };
  if (!["hecho", "estado", "nota", "nacimiento"].includes(b.accion)) throw new ErrorN8n("Acción no válida", 400);
  const r = await webhook<{ resultado?: string }>("bebe-test", b);
  return { ok: true, resultado: r.resultado || "" };
});
