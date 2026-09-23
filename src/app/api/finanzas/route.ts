import { manejar, nuevoId } from "@/lib/ruta";
import { cargarFinanzas } from "@/lib/datos";
import { anadirFila, modificarFila, borrarFila } from "@/lib/sheets";
import { n8n, avisarTelegram, escHtml, ErrorN8n } from "@/lib/n8n";
import { COLS, CATEGORIAS, AMBITOS } from "@/lib/finanzas";
import { num, eur, isoAEs, fechaISO } from "@/lib/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async () => cargarFinanzas());

interface Entrada {
  fecha?: string;
  proveedor?: string;
  concepto?: string;
  base?: number | string;
  iva?: number | string;
  total?: number | string;
  tipo?: string;
  doc?: string;
  enlace?: string;
  ambito?: string;
  categoria?: string;
  subcategoria?: string;
  periodoDesde?: string;
  periodoHasta?: string;
  consumo?: number | string | null;
  unidad?: string;
  recurrencia?: string;
  pago?: string;
  notas?: string;
  detalle?: Record<string, unknown>;
}

const dec = (n: number) => (Math.round(n * 100) / 100).toString();

/** Pasa los campos de la app a columnas de GestorIA. Valida lo que tiene que ser número. */
function aColumnas(e: Entrada, parcial = false): Record<string, string> {
  const o: Record<string, string> = {};
  const set = (k: keyof Entrada, col: string, f: (v: never) => string) => {
    if (e[k] !== undefined) o[col] = f(e[k] as never);
  };
  if (!parcial || e.total !== undefined) {
    const total = num(e.total);
    if (!(total > 0)) throw new ErrorN8n("El total tiene que ser un número mayor que 0", 400);
    let base = num(e.base), iva = num(e.iva);
    if (!base && !iva) { base = total / 1.21; iva = total - base; }
    else if (base && !iva) iva = total - base;
    else if (!base && iva) base = total - iva;
    Object.assign(o, { [COLS.total]: dec(total), [COLS.base]: dec(base), [COLS.iva]: dec(iva) });
  }
  set("fecha", COLS.fecha, (v: string) => {
    const f = fechaISO(v);
    if (!f) throw new ErrorN8n("Fecha no válida: " + v, 400);
    return isoAEs(f);
  });
  set("proveedor", COLS.proveedor, (v: string) => String(v).trim());
  set("concepto", COLS.concepto, (v: string) => String(v).trim());
  set("tipo", COLS.tipo, (v: string) => String(v).trim() || "gasto");
  set("doc", COLS.doc, (v: string) => String(v).trim());
  set("enlace", COLS.enlace, (v: string) => String(v).trim());
  set("ambito", COLS.ambito, (v: string) => {
    if (v && !AMBITOS.includes(v as never)) throw new ErrorN8n("Ámbito no válido", 400);
    return v;
  });
  set("categoria", COLS.categoria, (v: string) => {
    if (v && !CATEGORIAS.includes(v as never)) throw new ErrorN8n("Categoría no válida", 400);
    return v;
  });
  set("subcategoria", COLS.subcategoria, (v: string) => String(v).trim());
  set("periodoDesde", COLS.desde, (v: string) => (v ? isoAEs(fechaISO(v)) : ""));
  set("periodoHasta", COLS.hasta, (v: string) => (v ? isoAEs(fechaISO(v)) : ""));
  set("consumo", COLS.consumo, (v: string | number | null) => (v === null || v === "" ? "" : dec(num(v))));
  set("unidad", COLS.unidad, (v: string) => String(v).trim());
  set("recurrencia", COLS.recurrencia, (v: string) => String(v).trim());
  set("pago", COLS.pago, (v: string) => String(v).trim());
  set("notas", COLS.notas, (v: string) => String(v).trim());
  set("detalle", COLS.detalle, (v: Record<string, unknown>) => (v && Object.keys(v).length ? JSON.stringify(v) : ""));
  return o;
}

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as Entrada & { archivo?: { base64: string; mime: string; nombre: string }; avisar?: boolean };
  if (!b.proveedor && !b.concepto) throw new ErrorN8n("Pon al menos el proveedor o el concepto", 400);
  const cols = aColumnas({ tipo: "gasto", ...b });
  if (!cols[COLS.fecha]) throw new ErrorN8n("Falta la fecha", 400);
  let enlace = b.enlace || "";
  let avisoDrive = "";
  if (b.archivo?.base64) {
    try {
      const d = await n8n<{ enlace?: string }>({ op: "drive", base64: b.archivo.base64, mime: b.archivo.mime, nombre: b.archivo.nombre }, 90000);
      enlace = d.enlace || "";
    } catch (e) {
      avisoDrive = "No he podido subir el archivo a Drive (" + (e as Error).message + "). El gasto sí se guarda.";
    }
  }
  const id = nuevoId("A");
  const { fila } = await anadirFila("GestorIA", { ...cols, [COLS.enlace]: enlace, [COLS.id]: id });
  let telegram = false;
  if (b.avisar !== false) {
    const t = b.tipo === "ingreso" ? "💰 <b>Nuevo ingreso desde la app</b>" : "💶 <b>Nuevo gasto desde la app</b>";
    telegram = await avisarTelegram(
      `${t}\n${escHtml(b.proveedor || "")} · <b>${eur(num(cols[COLS.total]))}</b>\n${escHtml(b.concepto || "")}\n` +
        `${escHtml(cols[COLS.categoria] || "")}${cols[COLS.ambito] ? " · " + escHtml(cols[COLS.ambito]) : ""} · ${cols[COLS.fecha]} · <code>#G${fila}</code>` +
        (enlace ? `\n<a href="${escHtml(enlace)}">📎 documento</a>` : ""),
    );
  }
  return { ok: true, fila, id, enlace, telegram, aviso: avisoDrive };
});

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
