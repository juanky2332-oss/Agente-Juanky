import "server-only";
// Borradores de factura (pestaña "Borradores"): lo que llega por foto o PDF a Telegram NO se
// apunta solo. Se lee, se guarda aquí y se enseña a Juanky con botones. Solo al confirmar
// (✅ en Telegram, o «Confirmar y guardar» en la app) pasa a GestorIA. Así la IA nunca desvaría
// en silencio: lo que leyó se ve y se puede corregir antes.
import { leerTabla, anadirFila, modificarPorId, filaPorId, aObjeto, siguienteId } from "./sheets";
import { leerFactura } from "./extraer";
import { aColumnas, duplicadoDe, guardarGasto } from "./gastosSrv";
import { ambitoPorDefecto, CATEGORIAS, type Categoria } from "./finanzas";
import { ErrorN8n, escHtml } from "./n8n";
import { num, eur, isoAEs, hoyISO, fechaISO } from "./parse";

export interface FichaBorrador {
  tipo: string; proveedor: string; concepto: string; doc: string; fecha: string; base: number; iva: number; total: number;
  categoria: string; ambito?: string; subcategoria?: string; periodoDesde?: string; periodoHasta?: string; consumo?: number | string;
  unidad?: string; recurrencia?: string; pago?: string; notas?: string; detalle?: Record<string, unknown>;
}
export interface Borrador { id: string; fecha: string; origen: string; estado: string; ficha: FichaBorrador; avisos: string[]; confianza: number | null; duplicado: { fila: number; texto: string } | null; enlace: string; fila: string }

const APP = "https://agente-juanky.vercel.app";

function aBorrador(o: Record<string, string>): Borrador {
  let d: { ficha?: FichaBorrador; avisos?: string[]; confianza?: number | null; duplicado?: Borrador["duplicado"] } = {};
  try {
    d = JSON.parse(o.DATOS || "{}");
  } catch {
    d = {};
  }
  return { id: o.ID, fecha: o.FECHA, origen: o.ORIGEN, estado: o.ESTADO || "pendiente", ficha: d.ficha as FichaBorrador, avisos: d.avisos || [], confianza: d.confianza ?? null, duplicado: d.duplicado || null, enlace: o.ENLACE || "", fila: o.FILA || "" };
}

export async function leerBorrador(id: string) {
  const t = await leerTabla("Borradores");
  const f = filaPorId(t, id.toUpperCase());
  if (!f) throw new ErrorN8n(`El borrador ${id} no existe`, 404);
  return aBorrador(aObjeto(t, f.celdas));
}

export async function borradoresPendientes() {
  const t = await leerTabla("Borradores");
  return t.filas.map((f) => aBorrador(aObjeto(t, f.celdas))).filter((b) => b.id && b.estado === "pendiente").reverse();
}

const colsDe = (f: FichaBorrador) => aColumnas({ ...f, consumo: f.consumo === "" ? null : f.consumo, total: f.total || 0.01 } as never, false);

export async function crearBorrador(e: { base64?: string; mime?: string; texto?: string; enlace?: string; origen?: string }) {
  const r = await leerFactura(e);
  const ficha = { ...(r.ficha as unknown as FichaBorrador) };
  ficha.ambito = ambitoPorDefecto((CATEGORIAS.includes(ficha.categoria as Categoria) ? ficha.categoria : "Otros") as Categoria);
  if (!ficha.fecha) ficha.fecha = hoyISO();
  let duplicado = null;
  try {
    if (ficha.total > 0) duplicado = await duplicadoDe(colsDe(ficha));
  } catch {
    duplicado = null;
  }
  const t = await leerTabla("Borradores");
  const id = siguienteId(t, "B");
  await anadirFila("Borradores", { ID: id, FECHA: isoAEs(hoyISO()), ORIGEN: e.origen || "telegram", ESTADO: "pendiente", DATOS: JSON.stringify({ ficha, avisos: r.avisos, confianza: r.confianza, duplicado }), ENLACE: e.enlace || "" }, t.cabecera);
  return leerBorrador(id);
}

export async function modificarBorrador(id: string, cambios: Partial<FichaBorrador>) {
  const b = await leerBorrador(id);
  if (b.estado !== "pendiente") throw new ErrorN8n(`El borrador ${id} ya está ${b.estado}`, 409);
  const limpio: Partial<FichaBorrador> = {};
  for (const [k, v] of Object.entries(cambios)) if (v !== undefined && v !== "") (limpio as Record<string, unknown>)[k] = v;
  if (limpio.fecha) limpio.fecha = fechaISO(limpio.fecha) || b.ficha.fecha;
  for (const k of ["total", "base", "iva"] as const) if (limpio[k] !== undefined) limpio[k] = num(limpio[k]);
  if (limpio.total !== undefined && limpio.base === undefined) {
    limpio.base = Math.round((limpio.total / 1.21) * 100) / 100;
    limpio.iva = Math.round((limpio.total - limpio.base) * 100) / 100;
  }
  const ficha = { ...b.ficha, ...limpio };
  let duplicado = null;
  try {
    if (ficha.total > 0) duplicado = await duplicadoDe(colsDe(ficha));
  } catch {
    duplicado = null;
  }
  await modificarPorId("Borradores", b.id, { DATOS: JSON.stringify({ ficha, avisos: b.avisos, confianza: b.confianza, duplicado }) });
  return leerBorrador(b.id);
}

export async function confirmarBorrador(id: string, forzar = false, cambios?: Partial<FichaBorrador>) {
  let b = await leerBorrador(id);
  if (b.estado !== "pendiente") throw new ErrorN8n(`El borrador ${id} ya está ${b.estado}${b.fila ? " (#G" + b.fila + ")" : ""}`, 409);
  if (cambios && Object.keys(cambios).length) b = await modificarBorrador(id, cambios);
  if (!(b.ficha.total > 0)) throw new ErrorN8n("No tiene total: dime el importe antes de guardarlo", 400);
  const f = b.ficha;
  const r = await guardarGasto({
    ...f, tipo: f.tipo === "ingreso" ? "ingreso" : "gasto", consumo: f.consumo === "" ? null : f.consumo,
    enlace: b.enlace, notas: [f.notas, `Confirmado desde borrador ${b.id}`].filter(Boolean).join(". "), avisar: false, forzar,
  } as never);
  await modificarPorId("Borradores", b.id, { ESTADO: "guardado", FILA: String(r.fila) });
  return { ...b, estado: "guardado", fila: String(r.fila) };
}

export async function descartarBorrador(id: string) {
  const b = await leerBorrador(id);
  if (b.estado !== "pendiente") return b;
  await modificarPorId("Borradores", b.id, { ESTADO: "descartado" });
  return { ...b, estado: "descartado" };
}

/** Tarjeta para Telegram: lo leído, en claro, para confirmar. */
export function tarjeta(b: Borrador) {
  const f = b.ficha;
  const L = [
    b.estado === "guardado" ? `✅ <b>Guardado como #G${b.fila}</b>` : b.estado === "descartado" ? "🗑 <b>Descartado</b>" : `🧾 <b>He leído esta factura</b> · <code>${b.id}</code>`,
    "",
    `🏢 <b>${escHtml(f.proveedor || "¿proveedor?")}</b>`,
    `📝 ${escHtml(f.concepto || "—")}`,
    `📅 ${f.fecha ? isoAEs(f.fecha) : "¿fecha?"}${f.doc ? ` · nº ${escHtml(f.doc)}` : ""}`,
    `💶 <b>${f.total ? eur(f.total) : "¿total?"}</b>${f.base ? ` (base ${eur(f.base)} + IVA ${eur(f.iva)})` : ""}`,
    `🏷 ${escHtml(f.categoria || "Otros")} · ${escHtml(f.ambito || "")}`,
  ];
  if (f.consumo) L.push(`⚡ ${f.consumo} ${escHtml(f.unidad || "")}${f.periodoDesde ? ` · ${isoAEs(f.periodoDesde)} → ${isoAEs(f.periodoHasta || "")}` : ""}`);
  if (b.estado === "pendiente") {
    if (b.duplicado) L.push("", `⚠️ <b>Ojo: parece que ya la tienes</b> como #G${b.duplicado.fila} (${escHtml(b.duplicado.texto)}).`);
    for (const a of b.avisos) L.push(`⚠️ ${escHtml(a)}`);
    if (b.confianza !== null && b.confianza < 0.7) L.push("⚠️ La lectura no es muy segura: revísala.");
    L.push("", "¿Está bien? Pulsa ✅ para guardarla. Si algo no cuadra, dímelo (p. ej. <i>«el total son 92,84»</i>) o revísala en la app.");
  }
  if (b.enlace) L.push(`<a href="${escHtml(b.enlace)}">📎 documento</a>`);
  return L.join("\n");
}

export const urlRevisar = (id: string) => `${APP}/gastos?borrador=${id}`;
