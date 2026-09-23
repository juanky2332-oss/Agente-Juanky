// Gastos e ingresos programados (pestaña "Programados").
// - MODO "auto": se apuntan solos en GestorIA (o en Ingresos) cuando llega su fecha
//   (comunidad, gimnasio, agua que llega en papel...). El ID de la fila generada es
//   P-<plantilla>-<AAAA-MM>, así que generar dos veces nunca duplica.
// - MODO "correo": llegan por correo (luz, gas, Claude...). No se generan: sirven para saber
//   cuándo toca y avisar si una factura NO ha llegado.
import { num, fechaISO, isoAEs, hoyISO, normaliza } from "./parse";
import { claveProveedor } from "./finanzas";

export const PERIODICIDADES = ["mensual", "bimestral", "trimestral", "semestral", "anual"] as const;
const MESES: Record<string, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

export interface Programado {
  fila: number;
  id: string;
  activo: boolean;
  tipo: "gasto" | "ingreso";
  nombre: string;
  proveedor: string;
  concepto: string;
  categoria: string;
  ambito: string;
  negocio: string;
  importe: number;
  moneda: string;
  periodicidad: string;
  dia: number;
  desde: string | null;
  hasta: string | null;
  modo: "auto" | "correo";
  estimado: boolean;
  notas: string;
}

export function aProgramado(fila: number, o: Record<string, string>): Programado {
  return {
    fila,
    id: (o.ID || "").trim(),
    activo: !/^(no|false|0)$/i.test((o.ACTIVO || "").trim()),
    tipo: /ingreso/i.test(o.TIPO || "") ? "ingreso" : "gasto",
    nombre: (o.NOMBRE || "").trim(),
    proveedor: (o.PROVEEDOR || "").trim(),
    concepto: (o.CONCEPTO || "").trim(),
    categoria: (o.CATEGORIA || "").trim(),
    ambito: (o.AMBITO || "").trim(),
    negocio: (o.NEGOCIO || "").trim(),
    importe: num(o.IMPORTE),
    moneda: (o.MONEDA || "EUR").trim().toUpperCase() || "EUR",
    periodicidad: normaliza(o.PERIODICIDAD) || "mensual",
    dia: Math.min(28, Math.max(1, Math.round(num(o.DIA)) || 1)),
    desde: fechaISO(o.DESDE),
    hasta: fechaISO(o.HASTA),
    modo: /correo/i.test(o.MODO || "") ? "correo" : "auto",
    estimado: /^(s[ií]|true|1)$/i.test((o.ESTIMADO || "").trim()),
    notas: (o.NOTAS || "").trim(),
  };
}

/** Fechas (ISO) en las que toca, desde DESDE hasta `hasta` (incluido). */
export function ocurrencias(p: Programado, hasta = hoyISO()): string[] {
  if (!p.desde) return [];
  const paso = MESES[p.periodicidad] || 1;
  const [y0, m0] = p.desde.split("-").map(Number);
  const out: string[] = [];
  const tope = p.hasta && p.hasta < hasta ? p.hasta : hasta;
  for (let k = 0; k < 600; k += paso) {
    const d = new Date(Date.UTC(y0, m0 - 1 + k, p.dia));
    const iso = d.toISOString().slice(0, 10);
    if (iso > tope) break;
    if (iso >= p.desde) out.push(iso);
  }
  return out;
}

export function proxima(p: Programado, hoy = hoyISO()): string | null {
  if (!p.desde) return null;
  const lejos = new Date(Date.parse(hoy) + 400 * 86400000).toISOString().slice(0, 10);
  return ocurrencias({ ...p, hasta: p.hasta }, lejos).find((f) => f >= hoy) || null;
}

export const idGenerado = (p: Programado, fecha: string) => `P-${p.id}-${fecha.slice(0, 7)}`;

// Cambio aproximado solo para apuntar algo en euros; la fila queda marcada para corregir.
const CAMBIO: Record<string, number> = { EUR: 1, USD: 0.86 };

/** Filas que faltan por generar (modo auto) a fecha de hoy. `existentes` = IDs ya presentes. */
export function pendientesDeGenerar(ps: Programado[], existentes: Set<string>, hoy = hoyISO()) {
  const out: { p: Programado; fecha: string; id: string; importeEur: number }[] = [];
  for (const p of ps) {
    if (!p.activo || p.modo !== "auto" || !(p.importe > 0)) continue;
    for (const f of ocurrencias(p, hoy)) {
      const id = idGenerado(p, f);
      if (!existentes.has(id)) out.push({ p, fecha: f, id, importeEur: Math.round(p.importe * (CAMBIO[p.moneda] ?? 1) * 100) / 100 });
    }
  }
  return out;
}

/** Fila de GestorIA para un gasto programado. */
export function filaGasto(g: { p: Programado; fecha: string; id: string; importeEur: number }) {
  const p = g.p;
  const notas = [
    "Apunte automático (programado " + p.id + ")",
    p.estimado ? "IMPORTE ESTIMADO: corrígelo con el recibo real" : "",
    p.moneda !== "EUR" ? `Son ${p.importe} ${p.moneda}; cambio aproximado, corrígelo con el cargo real` : "",
  ].filter(Boolean).join(". ");
  const base = Math.round((g.importeEur / 1.21) * 100) / 100;
  return {
    Fecha: isoAEs(g.fecha), Proveedor: p.proveedor || p.nombre, Concepto: p.concepto || p.nombre,
    "Base Imponible": String(base), Impuestos: String(Math.round((g.importeEur - base) * 100) / 100), Total: String(g.importeEur),
    Tipo: "gasto", ID: g.id, AMBITO: p.ambito, CATEGORIA: p.categoria, RECURRENCIA: p.periodicidad, PAGO: "domiciliación", NOTAS: notas,
  };
}

/** Fila de Ingresos para un ingreso programado (p.ej. mantenimientos). */
export function filaIngreso(g: { p: Programado; fecha: string; id: string; importeEur: number }) {
  const p = g.p;
  const cliente = (p.notas.match(/Cliente:\s*([^.]+)/i) || [])[1]?.trim() || p.proveedor;
  const mes = new Date(g.fecha).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return {
    ID: g.id, NEGOCIO: p.negocio || "Otro", CLIENTE: cliente, CONCEPTO: `${p.concepto || p.nombre} · ${mes}`, FECHA: isoAEs(g.fecha),
    IMPORTE: String(g.importeEur), TIPO: "mantenimiento", VENCIMIENTO: isoAEs(new Date(Date.parse(g.fecha) + 15 * 86400000).toISOString().slice(0, 10)),
    NOTAS: "Apunte automático (programado " + p.id + ")", ORIGEN: "Programados",
  };
}

/** Programados por correo cuya factura de este periodo NO ha llegado (a partir de 7 días de margen). */
export function facturasQueFaltan(ps: Programado[], gastos: { proveedor: string; fecha: string }[], hoy = hoyISO()) {
  const out: { p: Programado; fecha: string }[] = [];
  for (const p of ps) {
    if (!p.activo || p.modo !== "correo") continue;
    const ult = ocurrencias(p, new Date(Date.parse(hoy) - 7 * 86400000).toISOString().slice(0, 10)).pop();
    if (!ult) continue;
    const k = claveProveedor(p.proveedor || p.nombre);
    const margen = (MESES[p.periodicidad] || 1) * 15;
    const ok = gastos.some((g) => claveProveedor(g.proveedor) === k && Math.abs(Date.parse(g.fecha) - Date.parse(ult)) <= margen * 86400000);
    if (!ok) out.push({ p, fecha: ult });
  }
  return out;
}

export const mensualEquivalente = (p: Programado) => (p.importe * (CAMBIO[p.moneda] ?? 1)) / (MESES[p.periodicidad] || 1);
