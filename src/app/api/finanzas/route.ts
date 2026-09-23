import { manejar } from "@/lib/ruta";
import { guardarGasto, aColumnas, type EntradaGasto, type Entrada } from "@/lib/gastosSrv";
import { cargarFinanzas } from "@/lib/datos";
import { modificarFila, borrarFila } from "@/lib/sheets";
import { avisarTelegram, escHtml, ErrorN8n } from "@/lib/n8n";
import { COLS } from "@/lib/finanzas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async () => cargarFinanzas());

export const POST = manejar(async (req: Request) => guardarGasto((await req.json()) as EntradaGasto));

export const PATCH = manejar(async (req: Request) => {
  const b = (await req.json()) as { fila: number; esperado: { total: string; proveedor: string }; cambios: Entrada };
  if (!b.fila) throw new ErrorN8n("Falta la fila", 400);
  const cols = aColumnas(b.cambios, true);
  await modificarFila("GestorIA", b.fila, cols, (o) => o[COLS.proveedor] === b.esperado.proveedor && o[COLS.total] === b.esperado.total);
  return { ok: true };
});

export const DELETE = manejar(async (req: Request) => {
  const u = new URL(req.url);
  const fila = Number(u.searchParams.get("fila"));
  const total = u.searchParams.get("total") ?? "";
  const proveedor = u.searchParams.get("proveedor") ?? "";
  if (!fila || fila < 2) throw new ErrorN8n("Fila no válida", 400);
  await borrarFila("GestorIA", fila, (o) => o[COLS.proveedor] === proveedor && o[COLS.total] === total);
  await avisarTelegram(`🗑 <b>Borrado desde la app</b>: ${escHtml(proveedor)} · ${escHtml(total)} (antes #G${fila})`);
  return { ok: true };
});
