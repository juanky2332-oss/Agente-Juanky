import { manejar } from "@/lib/ruta";
import { pagarVarios, cambiarReparto, planMantenimiento, type EntradaVarios, type EntradaReparto } from "@/lib/ingresosBloque";
import { ErrorN8n } from "@/lib/n8n";

// Operaciones en bloque desde la app: pagar varios meses/ingresos de golpe y cambiar el reparto.
// Con simular:true no escribe nada: devuelve lo que haría (la app lo enseña antes de confirmar).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { op: "pagar" | "reparto" | "mantenimiento"; activo?: boolean } & EntradaVarios & EntradaReparto;
  if (b.op === "pagar") return { ok: true, ...(await pagarVarios(b)) };
  if (b.op === "reparto") return { ok: true, ...(await cambiarReparto(b)) };
  if (b.op === "mantenimiento") return { ok: true, ...(await planMantenimiento({ busqueda: b.busqueda || "", desde: b.desde, activo: b.activo })) };
  throw new ErrorN8n("Operación no válida (pagar | reparto | mantenimiento)", 400);
});
