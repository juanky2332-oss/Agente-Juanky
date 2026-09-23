// Motor de ingresos: pestañas "Ingresos" (lo que te tienen que pagar) y "Cobros" (cada pago
// que entra, también los parciales). El pendiente NUNCA se escribe en la hoja: se calcula
// aquí = importe − suma de sus cobros. Así un pago parcial es solo una fila más en Cobros,
// sin fórmulas que se rompan. Mismo módulo en el servidor, en la app y para el bot.
import { num, fechaISO, tieneNumero, hoyISO, normaliza } from "./parse";

export const NEGOCIOS = ["Taller", "Flownexion", "Otro"] as const;
export type Negocio = (typeof NEGOCIOS)[number];
export const TIPOS_INGRESO = ["trabajo", "proyecto", "mantenimiento", "otro"] as const;
export const METODOS = ["transferencia", "bizum", "efectivo", "tarjeta", "otro"] as const;

export type EstadoIngreso = "cobrado" | "parcial" | "pendiente" | "sin precio" | "anulado";

export interface Cobro {
  fila: number;
  id: string;
  ingreso: string;
  fecha: string | null; // ISO; null = fecha desconocida (migrado de las hojas viejas)
  fechaTexto: string;
  importe: number;
  metodo: string;
  notas: string;
}

export interface Ingreso {
  fila: number;
  id: string;
  negocio: Negocio;
  cliente: string;
  concepto: string;
  referencia: string;
  fecha: string | null;
  fechaTexto: string;
  importe: number | null; // lo que te corresponde a ti (null = sin precio todavía)
  totalTrabajo: number | null;
  porcentaje: number | null;
  unidades: string;
  precioUnit: number | null;
  tipo: string;
  estadoHoja: string;
  vencimiento: string | null;
  notas: string;
  origen: string;
  cobros: Cobro[];
  cobrado: number;
  pendiente: number;
  estado: EstadoIngreso;
  vencido: boolean;
  ultimoCobro: string | null;
}

export const COLS_ING = {
  id: "ID", negocio: "NEGOCIO", cliente: "CLIENTE", concepto: "CONCEPTO", referencia: "REFERENCIA", fecha: "FECHA",
  importe: "IMPORTE", totalTrabajo: "TOTAL_TRABAJO", porcentaje: "PORCENTAJE", unidades: "UNIDADES", precioUnit: "PRECIO_UNIT",
  tipo: "TIPO", estado: "ESTADO", vencimiento: "VENCIMIENTO", notas: "NOTAS", origen: "ORIGEN",
} as const;
export const COLS_COB = { id: "ID", ingreso: "INGRESO", fecha: "FECHA", importe: "IMPORTE", metodo: "METODO", notas: "NOTAS" } as const;

/** "#i4", "I004", "4" → "I004" (en Telegram se escribe como sea). */
export function normId(x: string, prefijo = "I") {
  const m = String(x || "").trim().replace(/^#/, "").match(/^([a-z]?)\s*0*(\d+)$/i);
  return m ? (m[1] || prefijo).toUpperCase() + m[2].padStart(3, "0") : String(x || "").trim().replace(/^#/, "").toUpperCase();
}

const numONull = (v: string | undefined) => (tieneNumero(v) ? num(v) : null);

export function aCobro(fila: number, o: Record<string, string>): Cobro {
  return {
    fila,
    id: (o.ID || "").trim(),
    ingreso: (o.INGRESO || "").trim(),
    fecha: fechaISO(o.FECHA),
    fechaTexto: o.FECHA || "",
    importe: num(o.IMPORTE),
    metodo: (o.METODO || "").trim(),
    notas: (o.NOTAS || "").trim(),
  };
}

export function montarIngresos(filas: { fila: number; o: Record<string, string> }[], cobros: Cobro[], hoy = hoyISO()): Ingreso[] {
  const porIngreso = new Map<string, Cobro[]>();
  for (const c of cobros) porIngreso.set(c.ingreso, [...(porIngreso.get(c.ingreso) || []), c]);
  return filas
    .filter(({ o }) => (o.ID || "").trim())
    .map(({ fila, o }) => {
      const id = o.ID.trim();
      const cs = (porIngreso.get(id) || []).sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
      const importe = numONull(o.IMPORTE);
      const cobrado = Math.round(cs.reduce((s, c) => s + c.importe, 0) * 100) / 100;
      const anulado = /anulad|cancelad/i.test(o.ESTADO || "");
      const pendiente = anulado || importe === null ? 0 : Math.max(0, Math.round((importe - cobrado) * 100) / 100);
      const estado: EstadoIngreso = anulado
        ? "anulado"
        : importe === null
          ? "sin precio"
          : pendiente <= 0.005
            ? "cobrado"
            : cobrado > 0.005
              ? "parcial"
              : "pendiente";
      const venc = fechaISO(o.VENCIMIENTO);
      const neg = NEGOCIOS.find((n) => normaliza(n) === normaliza(o.NEGOCIO)) || "Otro";
      const conFecha = cs.filter((c) => c.fecha);
      return {
        fila,
        id,
        negocio: neg,
        cliente: (o.CLIENTE || "").trim(),
        concepto: (o.CONCEPTO || "").trim(),
        referencia: (o.REFERENCIA || "").trim(),
        fecha: fechaISO(o.FECHA),
        fechaTexto: o.FECHA || "",
        importe,
        totalTrabajo: numONull(o.TOTAL_TRABAJO),
        porcentaje: numONull(o.PORCENTAJE),
        unidades: (o.UNIDADES || "").trim(),
        precioUnit: numONull(o.PRECIO_UNIT),
        tipo: (o.TIPO || "").trim() || "otro",
        estadoHoja: (o.ESTADO || "").trim(),
        vencimiento: venc,
        notas: (o.NOTAS || "").trim(),
        origen: (o.ORIGEN || "").trim(),
        cobros: cs,
        cobrado,
        pendiente,
        estado,
        vencido: !!venc && venc < hoy && pendiente > 0.005,
        ultimoCobro: conFecha.length ? conFecha[conFecha.length - 1].fecha : null,
      };
    });
}

export interface ResumenNegocio {
  negocio: Negocio | "Todo";
  facturado: number; // suma de importes con precio (sin anulados)
  cobrado: number;
  pendiente: number;
  nPendientes: number;
  nParciales: number;
  nSinPrecio: number;
  nVencidos: number;
  n: number;
}

export function resumir(ings: Ingreso[], negocio: Negocio | "Todo" = "Todo"): ResumenNegocio {
  const xs = ings.filter((x) => (negocio === "Todo" || x.negocio === negocio) && x.estado !== "anulado");
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    negocio,
    facturado: r2(xs.reduce((s, x) => s + (x.importe || 0), 0)),
    cobrado: r2(xs.reduce((s, x) => s + x.cobrado, 0)),
    pendiente: r2(xs.reduce((s, x) => s + x.pendiente, 0)),
    nPendientes: xs.filter((x) => x.pendiente > 0.005).length,
    nParciales: xs.filter((x) => x.estado === "parcial").length,
    nSinPrecio: xs.filter((x) => x.estado === "sin precio").length,
    nVencidos: xs.filter((x) => x.vencido).length,
    n: xs.length,
  };
}

/** Cobros por mes (solo los que tienen fecha) para la gráfica, separados por negocio. */
export function cobrosPorMes(ings: Ingreso[], meses: string[]) {
  const idx = new Map(ings.map((i) => [i.id, i]));
  const filas = meses.map((mes) => ({ mes, Taller: 0, Flownexion: 0, Otro: 0 }) as Record<string, number | string>);
  for (const i of ings)
    for (const c of i.cobros) {
      if (!c.fecha) continue;
      const f = filas.find((x) => x.mes === c.fecha!.slice(0, 7));
      const neg = idx.get(c.ingreso)?.negocio || "Otro";
      if (f) f[neg] = (f[neg] as number) + c.importe;
    }
  return filas;
}

/** Texto para Telegram (/cobros): calculado aquí, el bot solo lo manda. */
export function textoCobros(ings: Ingreso[], filtro = ""): string {
  const f = normaliza(filtro);
  const neg: Negocio[] = /taller/.test(f) ? ["Taller"] : /flow/.test(f) ? ["Flownexion"] : ["Taller", "Flownexion", "Otro"];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const e = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const L: string[] = ["💰 <b>Lo que te deben</b>"];
  let total = 0;
  for (const n of neg) {
    const xs = ings.filter((x) => x.negocio === n && x.pendiente > 0.005).sort((a, b) => b.pendiente - a.pendiente);
    if (!xs.length) continue;
    const r = resumir(ings, n);
    total += r.pendiente;
    L.push("", `<b>${n === "Taller" ? "🔧 Taller" : n === "Flownexion" ? "💻 Flownexion" : "📦 Otros"}</b> · pendiente <b>${e(r.pendiente)}</b> (cobrado ${e(r.cobrado)} de ${e(r.facturado)})`);
    for (const x of xs)
      L.push(
        `<code>#${x.id}</code> ${esc(x.cliente ? x.cliente + " · " : "")}${esc(x.concepto)} — <b>${e(x.pendiente)}</b>` +
          (x.estado === "parcial" ? ` <i>(pagado ${e(x.cobrado)} de ${e(x.importe || 0)})</i>` : "") +
          (x.vencido ? " 🔴 vencido" : ""),
      );
  }
  const sinPrecio = ings.filter((x) => neg.includes(x.negocio) && x.estado === "sin precio").length;
  if (L.length === 1) L.push("", "Nadie te debe nada 🎉");
  else L.push("", `<b>Total pendiente: ${e(total)}</b>`);
  if (sinPrecio) L.push(`⚪ ${sinPrecio} trabajos sin precio todavía (no cuentan).`);
  L.push("", "Para apuntar un pago: <code>/cobrado #I012 150</code> (sin importe = entero)");
  return L.join("\n");
}
