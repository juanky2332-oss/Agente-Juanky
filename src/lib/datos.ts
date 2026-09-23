import "server-only";
import { leerRangos, aTabla, aObjeto, anadirFilas, type Tabla } from "./sheets";
import { aMovimiento, analizar, recurrentes, type Movimiento, type Referencia } from "./finanzas";
import { aCobro, montarIngresos, resumir, type Ingreso } from "./ingresos";
import { aProgramado, pendientesDeGenerar, filaGasto, filaIngreso, facturasQueFaltan, proxima, mensualEquivalente, type Programado } from "./programados";
import { num, fechaHora, hoyISO } from "./parse";
import { avisarTelegram, escHtml } from "./n8n";

const idsDe = (t: Tabla) => {
  const i = t.cabecera.findIndex((c) => c.toUpperCase() === "ID");
  return new Set(t.filas.map((f) => (f.celdas[i] || "").trim()).filter(Boolean));
};

/**
 * Apunta los gastos/ingresos programados (modo auto) que ya tocan y aún no están.
 * Idempotente: el ID P-<plantilla>-<AAAA-MM> impide duplicar aunque se llame muchas veces.
 */
export async function generarProgramados(pre?: { gestoria: Tabla | null; ingresos: Tabla | null; programados: Tabla }) {
  let g: Tabla | null, i: Tabla | null, p: Tabla;
  if (pre) ({ gestoria: g, ingresos: i, programados: p } = pre);
  else {
    const [a, b, c] = await leerRangos(["'GestorIA'!A1:Z3000", "'Ingresos'!A1:Z3000", "'Programados'!A1:Z300"]);
    [g, i, p] = [aTabla("GestorIA", a), aTabla("Ingresos", b), aTabla("Programados", c)];
  }
  const ps = p.filas.map((f) => aProgramado(f.fila, aObjeto(p, f.celdas))).filter((x) => x.id);
  // Sin la hoja leída no se puede saber qué falta: entonces no se genera nada de ese tipo.
  const gastos = g ? pendientesDeGenerar(ps.filter((x) => x.tipo === "gasto"), idsDe(g)) : [];
  const ingresos = i ? pendientesDeGenerar(ps.filter((x) => x.tipo === "ingreso"), idsDe(i)) : [];
  if (g && gastos.length) await anadirFilas("GestorIA", gastos.map(filaGasto), g.cabecera);
  if (i && ingresos.length) await anadirFilas("Ingresos", ingresos.map(filaIngreso), i.cabecera);
  if (gastos.length || ingresos.length) {
    const lineas = [
      ...gastos.map((x) => `💶 ${escHtml(x.p.nombre)} · ${x.importeEur.toLocaleString("es-ES")} € · ${x.fecha.split("-").reverse().join("/")}${x.p.estimado ? " (estimado)" : ""}`),
      ...ingresos.map((x) => `💰 ${escHtml(x.p.nombre)} · ${x.importeEur.toLocaleString("es-ES")} € por cobrar`),
    ];
    const resto = lineas.length > 20 ? "\n…y " + (lineas.length - 20) + " más" : "";
    await avisarTelegram("🔁 <b>Apuntes automáticos</b>\n" + lineas.slice(0, 20).join("\n") + resto);
  }
  return { gastos: gastos.length, ingresos: ingresos.length };
}

export async function cargarFinanzas() {
  const RANGOS = ["'GestorIA'!A1:Z3000", "'Referencias precios'!A1:G200", "'Facturas correo'!A1:K1000", "'Programados'!A1:Z300", "'Filtros correo'!A1:Z200", "'Ingresos'!A1:Z3000"];
  const [g0, r, fc, pr, fi, ing] = await leerRangos(RANGOS);
  let g = g0;
  // Si toca algún apunte automático, se hace ANTES de enseñar nada (y se relee GestorIA).
  const gen = await generarProgramados({ gestoria: aTabla("GestorIA", g0), ingresos: aTabla("Ingresos", ing), programados: aTabla("Programados", pr) }).catch(() => ({ gastos: 0, ingresos: 0 }));
  if (gen.gastos) [g] = await leerRangos([RANGOS[0]]);
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
  const tp = aTabla("Programados", pr);
  const programados = tp.filas.map((f) => aProgramado(f.fila, aObjeto(tp, f.celdas))).filter((x) => x.id)
    .map((x) => ({ ...x, proxima: proxima(x), mensual: mensualEquivalente(x) }));
  const tfi = aTabla("Filtros correo", fi);
  const filtros = tfi.filas.map((f) => ({ fila: f.fila, ...aObjeto(tfi, f.celdas) })).filter((x) => (x as unknown as Record<string, string>).ID);
  const faltan = facturasQueFaltan(programados, movimientos.filter((m) => m.tipo === "gasto").map((m) => ({ proveedor: m.proveedor, fecha: m.fecha })))
    .map((x) => ({ id: x.p.id, nombre: x.p.nombre, fecha: x.fecha }));
  return { movimientos, referencias, hallazgos, recurrentes: recs, facturasCorreo, cabecera: tg.cabecera, programados, filtros, faltan, generados: gen };
}

export async function cargarIngresos() {
  const [iv, cv, pr] = await leerRangos(["'Ingresos'!A1:Z3000", "'Cobros'!A1:Z5000", "'Programados'!A1:Z300"]);
  let ti = aTabla("Ingresos", iv);
  const gen = await generarProgramados({ gestoria: null, ingresos: ti, programados: aTabla("Programados", pr) }).catch(() => ({ gastos: 0, ingresos: 0 }));
  if (gen.ingresos) ti = aTabla("Ingresos", (await leerRangos(["'Ingresos'!A1:Z3000"]))[0]);
  const tc = aTabla("Cobros", cv);
  const cobros = tc.filas.map((f) => aCobro(f.fila, aObjeto(tc, f.celdas))).filter((c) => c.id);
  const ingresos: Ingreso[] = montarIngresos(ti.filas.map((f) => ({ fila: f.fila, o: aObjeto(ti, f.celdas) })), cobros, hoyISO());
  const tp = aTabla("Programados", pr);
  const programados: Programado[] = tp.filas.map((f) => aProgramado(f.fila, aObjeto(tp, f.celdas))).filter((x) => x.id && x.tipo === "ingreso");
  return {
    ingresos,
    resumen: { Todo: resumir(ingresos), Taller: resumir(ingresos, "Taller"), Flownexion: resumir(ingresos, "Flownexion"), Otro: resumir(ingresos, "Otro") },
    programados: programados.map((x) => ({ ...x, proxima: proxima(x) })),
  };
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
