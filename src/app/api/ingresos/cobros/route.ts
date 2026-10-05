import { manejar } from "@/lib/ruta";
import { sincronizarTaller } from "@/lib/tallerSync";
import { registrarCobro, modificarCobro, borrarCobro } from "@/lib/ingresosSrv";
import { ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { ingreso: string; importe?: number | string; fecha?: string; metodo?: string; notas?: string; destino?: string };
  if (!b.ingreso) throw new ErrorN8n("Falta el ingreso", 400);
  const r = { ok: true, ...(await registrarCobro(b)) };
  await sincronizarTaller(); // y a la hoja «Trabajos taller»
  return r;
});

export const PATCH = manejar(async (req: Request) => {
  const b = (await req.json()) as { id: string; importe?: number | string; fecha?: string; metodo?: string; notas?: string; destino?: string };
  if (!b.id) throw new ErrorN8n("Falta el ID del cobro", 400);
  const { id, ...resto } = b;
  const r = { ok: true, ...(await modificarCobro(id, resto)) };
  await sincronizarTaller(); // y a la hoja «Trabajos taller»
  return r;
});

export const DELETE = manejar(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) throw new ErrorN8n("Falta el ID del cobro", 400);
  const r = { ok: true, ...(await borrarCobro(id)) };
  await sincronizarTaller(); // y a la hoja «Trabajos taller»
  return r;
});
