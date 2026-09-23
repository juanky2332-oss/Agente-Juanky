import { manejar } from "@/lib/ruta";
import { cargarIngresos } from "@/lib/datos";
import { crearIngreso, modificarIngreso, borrarIngreso, type EntradaIngreso } from "@/lib/ingresosSrv";
import { ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async () => cargarIngresos());

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as EntradaIngreso & { cobroInicial?: number | string; fechaCobro?: string };
  return { ok: true, ...(await crearIngreso(b)) };
});

export const PATCH = manejar(async (req: Request) => {
  const b = (await req.json()) as { id: string; cambios: EntradaIngreso };
  if (!b.id) throw new ErrorN8n("Falta el ID", 400);
  return { ok: true, ...(await modificarIngreso(b.id, b.cambios)) };
});

export const DELETE = manejar(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) throw new ErrorN8n("Falta el ID", 400);
  return { ok: true, ...(await borrarIngreso(id)) };
});
