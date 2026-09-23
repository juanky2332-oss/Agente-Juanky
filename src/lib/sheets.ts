import "server-only";
import { n8n, ErrorN8n } from "./n8n";

// Acceso a las pestañas del documento del bot (1L7cua...). Todas las escrituras
// localizan cada campo por el NOMBRE de su columna (patrón GUIA GASTRO): así añadir
// o mover columnas no rompe nada, y nunca se repite el bug del schema por índice.

export const GID = {
  GestorIA: 2074967448,
  "Notas Juanky": 983856189,
  "tarjetas visitas": 1975661256,
  "Trabajos taller": 1462469805,
  "Trabajos flownexion": 1690395527,
  Restaurantes: 344812185,
  Vinos: 1816726944,
  "Bebé": 1978565139,
  "Referencias precios": 156382067,
} as const;

export type Celda = string;
export interface Tabla {
  nombre: string;
  cabecera: string[];
  filaCabecera: number; // 1-based
  filas: { fila: number; celdas: Celda[] }[]; // fila = número real en la hoja (1-based)
}

const q = (t: string) => encodeURIComponent(`'${t}'`);

export async function leerRangos(rangos: string[], render: "FORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE") {
  const path =
    "/values:batchGet?valueRenderOption=" + render + "&" +
    rangos.map((r) => "ranges=" + encodeURIComponent(r)).join("&");
  const d = await n8n<{ valueRanges: { range: string; values?: string[][] }[] }>({ op: "sheets", method: "GET", path });
  return d.valueRanges.map((v) => v.values || []);
}

/** Lee una pestaña entera. `buscarCabecera` escanea las 12 primeras filas (Trabajos no la tiene en la 1). */
export async function leerTabla(nombre: string, opts: { hasta?: string; buscarCabecera?: RegExp } = {}): Promise<Tabla> {
  const [valores] = await leerRangos([`'${nombre}'!A1:${opts.hasta || "Z3000"}`]);
  return aTabla(nombre, valores, opts.buscarCabecera);
}

export function aTabla(nombre: string, valores: string[][], buscarCabecera?: RegExp): Tabla {
  let hi = 0;
  if (buscarCabecera) {
    const k = valores.slice(0, 12).findIndex((f) => (f || []).some((c) => buscarCabecera.test(String(c || ""))));
    if (k >= 0) hi = k;
  }
  const cabecera = (valores[hi] || []).map((c) => String(c ?? "").trim());
  const filas = valores
    .slice(hi + 1)
    .map((celdas, i) => ({ fila: hi + 2 + i, celdas: (celdas || []).map((c) => String(c ?? "")) }))
    .filter((f) => f.celdas.some((c) => c.trim() !== ""));
  return { nombre, cabecera, filaCabecera: hi + 1, filas };
}

export function col(t: Tabla, nombre: string | RegExp): number {
  return t.cabecera.findIndex((c) => (typeof nombre === "string" ? c.toLowerCase() === nombre.toLowerCase() : nombre.test(c)));
}

export function aObjeto(t: Tabla, celdas: Celda[]): Record<string, string> {
  const o: Record<string, string> = {};
  t.cabecera.forEach((c, i) => {
    if (c) o[c] = celdas[i] ?? "";
  });
  return o;
}

function letra(n: number): string {
  let s = "";
  n++;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function montarFila(cabecera: string[], datos: Record<string, unknown>, base: Celda[] = []): Celda[] {
  const fila = cabecera.map((_, i) => base[i] ?? "");
  const desconocidos: string[] = [];
  for (const [k, v] of Object.entries(datos)) {
    const i = cabecera.findIndex((c) => c.toLowerCase() === k.toLowerCase());
    if (i < 0) {
      desconocidos.push(k);
      continue;
    }
    fila[i] = v === null || v === undefined ? "" : String(v);
  }
  if (desconocidos.length) throw new ErrorN8n("Columnas que no existen en la hoja: " + desconocidos.join(", "), 400);
  return fila;
}

export async function anadirFila(nombre: string, datos: Record<string, unknown>, cabecera?: string[]) {
  const cab = cabecera || (await leerTabla(nombre, { hasta: "Z1" })).cabecera;
  const fila = montarFila(cab, datos);
  const r = await n8n<{ updates?: { updatedRange?: string } }>({
    op: "sheets",
    method: "POST",
    path: `/values/${q(nombre)}!A1:${letra(cab.length - 1)}1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    body: { values: [fila] },
  });
  const rango = r.updates?.updatedRange || "";
  if (!rango) throw new ErrorN8n("Google no confirmó la escritura", 502);
  const m = rango.match(/!A(\d+)/);
  return { fila: m ? +m[1] : 0 };
}

/**
 * Modifica una fila: lee-modifica-escribe la fila entera. `comprobar` valida que la fila
 * sigue siendo la que el usuario vio (borrar filas desplaza los números) antes de escribir.
 */
export async function modificarFila(
  nombre: string,
  fila: number,
  cambios: Record<string, unknown>,
  comprobar?: (actual: Record<string, string>) => boolean,
  buscarCabecera?: RegExp,
) {
  const t = await leerTabla(nombre, { buscarCabecera });
  const f = t.filas.find((x) => x.fila === fila);
  if (!f) throw new ErrorN8n(`La fila ${fila} ya no existe en ${nombre}. Recarga.`, 409);
  if (comprobar && !comprobar(aObjeto(t, f.celdas)))
    throw new ErrorN8n(`La fila ${fila} de ${nombre} ha cambiado desde que la cargaste (alguien la tocó desde Telegram). Recarga y repite.`, 409);
  const nueva = montarFila(t.cabecera, cambios, f.celdas);
  const r = await n8n<{ updatedRange?: string }>({
    op: "sheets",
    method: "PUT",
    path: `/values/${q(nombre)}!A${fila}:${letra(t.cabecera.length - 1)}${fila}?valueInputOption=RAW`,
    body: { values: [nueva] },
  });
  if (!r.updatedRange) throw new ErrorN8n("Google no confirmó la escritura", 502);
  return { fila };
}

/** Escribe celdas sueltas (sin tocar el resto de la fila: útil en hojas con fórmulas). */
export async function escribirCelda(nombre: string, a1: string, valor: string, userEntered = true) {
  const r = await n8n<{ updatedRange?: string }>({
    op: "sheets",
    method: "PUT",
    path: `/values/${q(nombre)}!${a1}?valueInputOption=${userEntered ? "USER_ENTERED" : "RAW"}`,
    body: { values: [[valor]] },
  });
  if (!r.updatedRange) throw new ErrorN8n("Google no confirmó la escritura", 502);
}

export async function borrarFila(nombre: keyof typeof GID, fila: number, comprobar?: (actual: Record<string, string>) => boolean) {
  const t = await leerTabla(nombre);
  const f = t.filas.find((x) => x.fila === fila);
  if (!f) throw new ErrorN8n(`La fila ${fila} ya no existe. Recarga.`, 409);
  if (comprobar && !comprobar(aObjeto(t, f.celdas)))
    throw new ErrorN8n("Esa fila ha cambiado desde que la cargaste. Recarga y repite.", 409);
  const r = await n8n<{ replies?: unknown[] }>({
    op: "sheets",
    method: "POST",
    path: ":batchUpdate",
    body: { requests: [{ deleteDimension: { range: { sheetId: GID[nombre], dimension: "ROWS", startIndex: fila - 1, endIndex: fila } } }] },
  });
  if (!r.replies) throw new ErrorN8n("Google no confirmó el borrado", 502);
}

export { letra };
