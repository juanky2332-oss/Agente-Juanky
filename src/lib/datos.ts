import "server-only";
import { leerRangos, aTabla, aObjeto } from "./sheets";
import { aMovimiento, analizar, recurrentes, type Movimiento, type Referencia } from "./finanzas";
import { leerTaller, leerFlownexion } from "./trabajos";
import { num, fechaHora } from "./parse";

export async function cargarFinanzas() {
  const [g, r, fc] = await leerRangos(["'GestorIA'!A1:Z3000", "'Referencias precios'!A1:G200", "'Facturas correo'!A1:K1000"]);
  const tg = aTabla("GestorIA", g);
  const movimientos: Movimiento[] = tg.filas.map((f) => aMovimiento(f.fila, aObjeto(tg, f.celdas)));
  const tr = aTabla("Referencias precios", r);
  const referencias: Referencia[] = tr.filas.map((f) => {
    const o = aObjeto(tr, f.celdas);
    return {
      categoria: o.CATEGORIA || "",
      metrica: o.METRICA || "",
      unidad: o.UNIDAD || "",
      buenoHasta: num(o.BUENO_HASTA),
      caroDesde: num(o.CARO_DESDE),
      fuente: o.FUENTE || "",
      fecha: o.FECHA || "",
      fila: f.fila,
    } as Referencia & { fila: number };
  });
  const tf = aTabla("Facturas correo", fc);
  const facturasCorreo = tf.filas.map((f) => ({ fila: f.fila, ...aObjeto(tf, f.celdas) }));
  const hallazgos = analizar(movimientos, referencias);
  const recs = recurrentes(movimientos.filter((m) => m.tipo === "gasto" && !m.sinFecha)).map((r) => ({ ...r, movs: r.movs.map((m) => m.fila) }));
  return { movimientos, referencias, hallazgos, recurrentes: recs, facturasCorreo, cabecera: tg.cabecera };
}

export async function cargarIngresos() {
  const [t, f, g] = await leerRangos(["'Trabajos taller'!A1:AB300", "'Trabajos flownexion'!A1:R300", "'GestorIA'!A1:Z3000"]);
  const taller = leerTaller(aTabla("Trabajos taller", t, /falta\s*por\s*pagar/i));
  const flownexion = leerFlownexion(aTabla("Trabajos flownexion", f, /falta\s*por\s*pagar/i), f);
  const tg = aTabla("GestorIA", g);
  const otros = tg.filas.map((x) => aMovimiento(x.fila, aObjeto(tg, x.celdas))).filter((m) => m.tipo === "ingreso");
  return { taller, flownexion, otros };
}

export interface Nota {
  fila: number;
  fecha: string;
  tipo: string;
  contenido: string;
  importe: string;
  proveedor: string;
  url: string;
  estado: string;
  vencimiento: string;
  vence: number | null; // epoch ms
  abierta: boolean;
  recurrente: string | null;
}

export async function cargarNotas(): Promise<Nota[]> {
  const [v] = await leerRangos(["'Notas Juanky'!A1:H3000"]);
  const t = aTabla("Notas Juanky", v);
  return t.filas.map((f) => {
    const o = aObjeto(t, f.celdas);
    const estado = (o.ESTADO || "").trim().toLowerCase();
    const d = fechaHora(o.VENCIMIENTO);
    const rec = (o.CONTENIDO || "").match(/\[([^\]]+)\]\s*$/);
    return {
      fila: f.fila,
      fecha: o.FECHA || "",
      tipo: (o.TIPO || "").trim(),
      contenido: o.CONTENIDO || "",
      importe: o.IMPORTE || "",
      proveedor: o.PROVEEDOR || "",
      url: o["url archivo"] || "",
      estado: estado || "pendiente",
      vencimiento: o.VENCIMIENTO || "",
      vence: d ? d.getTime() : null,
      abierta: !["hecha", "cancelada"].includes(estado),
      recurrente: rec ? rec[1] : null,
    };
  });
}
