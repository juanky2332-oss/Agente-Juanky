import { manejar } from "@/lib/ruta";
import { sincronizarTaller } from "@/lib/tallerSync";
import { cargarIngresos } from "@/lib/datos";
import { crearIngreso, modificarIngreso, borrarIngreso, type EntradaIngreso } from "@/lib/ingresosSrv";
import { ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async () => cargarIngresos());

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as EntradaIngreso & { cobroInicial?: number | string; fechaCobro?: string };
  const r = { ok: true, ...(await crearIngreso(b)) };
  await sincronizarTaller(); // y a la hoja «Trabajos taller»
  return r;
});

export const PATCH = manejar(async (req: Request) => {
  const b = (await req.json()) as { id: string; cambios: EntradaIngreso };
  if (!b.id) throw new ErrorN8n("Falta el ID", 400);
  const r = { ok: true, ...(await modificarIngreso(b.id, b.cambios)) };
  await sincronizarTaller(); // y a la hoja «Trabajos taller»
  return r;
});

export const DELETE = manejar(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) throw new ErrorN8n("Falta el ID", 400);
  const r = { ok: true, ...(await borrarIngreso(id)) };
  await sincronizarTaller(); // y a la hoja «Trabajos taller»
  return r;
});
