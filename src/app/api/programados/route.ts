import { manejar } from "@/lib/ruta";
import { leerTabla, anadirFila, modificarPorId, borrarPorIds, siguienteId } from "@/lib/sheets";
import { ErrorN8n, avisarTelegram, escHtml } from "@/lib/n8n";
import { generarProgramados } from "@/lib/datos";
import { PERIODICIDADES } from "@/lib/programados";
import { num, fechaISO, isoAEs } from "@/lib/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Entrada {
  activo?: boolean; tipo?: string; nombre?: string; proveedor?: string; concepto?: string; categoria?: string; ambito?: string; negocio?: string;
  importe?: number | string; moneda?: string; periodicidad?: string; dia?: number | string; desde?: string; hasta?: string; modo?: string; estimado?: boolean; notas?: string;
}

function aColumnas(e: Entrada, parcial = false) {
  const o: Record<string, string> = {};
  const f = (v: string | undefined) => {
    if (!v) return "";
    const x = fechaISO(v);
    if (!x) throw new ErrorN8n("Fecha no válida: " + v, 400);
    return isoAEs(x);
  };
  if (e.activo !== undefined) o.ACTIVO = e.activo ? "sí" : "no";
  if (e.tipo !== undefined) o.TIPO = e.tipo === "ingreso" ? "ingreso" : "gasto";
  for (const [k, c] of [["nombre", "NOMBRE"], ["proveedor", "PROVEEDOR"], ["concepto", "CONCEPTO"], ["categoria", "CATEGORIA"], ["ambito", "AMBITO"], ["negocio", "NEGOCIO"], ["notas", "NOTAS"]] as const)
    if (e[k] !== undefined) o[c] = String(e[k] ?? "").trim();
  if (e.importe !== undefined) {
    if (!(num(e.importe) > 0)) throw new ErrorN8n("El importe tiene que ser mayor que 0", 400);
    o.IMPORTE = String(num(e.importe));
  }
  if (e.moneda !== undefined) o.MONEDA = (e.moneda || "EUR").toUpperCase();
  if (e.periodicidad !== undefined) {
    if (!PERIODICIDADES.includes(e.periodicidad as never)) throw new ErrorN8n("Periodicidad no válida", 400);
    o.PERIODICIDAD = e.periodicidad;
  }
  if (e.dia !== undefined) o.DIA = String(Math.min(28, Math.max(1, Math.round(num(e.dia)) || 1)));
  if (e.desde !== undefined) o.DESDE = f(e.desde);
  if (e.hasta !== undefined) o.HASTA = f(e.hasta);
  if (e.modo !== undefined) o.MODO = e.modo === "correo" ? "correo" : "auto";
  if (e.estimado !== undefined) o.ESTIMADO = e.estimado ? "sí" : "no";
  if (!parcial && (!o.NOMBRE || !o.IMPORTE || !o.DESDE)) throw new ErrorN8n("Pon nombre, importe y desde cuándo", 400);
  return o;
}

export const GET = manejar(async () => {
  const r = await generarProgramados();
  return { ok: true, ...r };
});

export const POST = manejar(async (req: Request) => {
  const e = (await req.json()) as Entrada;
  const t = await leerTabla("Programados");
  const id = siguienteId(t, "P", 2);
  const cols = aColumnas({ activo: true, tipo: "gasto", periodicidad: "mensual", modo: "auto", moneda: "EUR", ...e });
  await anadirFila("Programados", { ...cols, ID: id }, t.cabecera);
  await avisarTelegram(`🔁 <b>Nuevo ${cols.TIPO} programado desde la app</b>\n${escHtml(cols.NOMBRE)} · ${cols.IMPORTE} ${cols.MONEDA} ${cols.PERIODICIDAD}${cols.MODO === "correo" ? " (llega por correo)" : " (se apunta solo)"}`);
  const gen = cols.ACTIVO === "sí" ? await generarProgramados() : { gastos: 0, ingresos: 0 };
  return { ok: true, id, generados: gen };
});

export const PATCH = manejar(async (req: Request) => {
  const b = (await req.json()) as { id: string; cambios: Entrada };
  if (!b.id) throw new ErrorN8n("Falta el ID", 400);
  await modificarPorId("Programados", b.id, aColumnas(b.cambios, true));
  const gen = await generarProgramados();
  return { ok: true, generados: gen };
});

export const DELETE = manejar(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) throw new ErrorN8n("Falta el ID", 400);
  // Solo se borra la plantilla: los apuntes que ya generó se quedan en GestorIA (son gastos reales).
  await borrarPorIds("Programados", [id]);
  return { ok: true };
});
