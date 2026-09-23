// Motor de ingresos: pestañas "Ingresos" (lo que te tienen que pagar) y "Cobros" (cada pago
// que entra, también los parciales). El pendiente NUNCA se escribe en la hoja: se calcula
// aquí = importe − suma de sus cobros. Así un pago parcial es solo una fila más en Cobros,
// sin fórmulas que se rompan. Mismo módulo en el servidor, en la app y para el bot.
//
// FLOWNEXION: el cliente paga a Flownexion y Flownexion te paga a ti. Son dos pagos distintos.
// Cada fila de Cobros lleva DESTINO: "yo" (el dinero te ha llegado a ti) o "flownexion" (el
// cliente ha pagado a Flownexion; su IMPORTE es TU PARTE de ese pago). Solo "yo" cuenta como
// cobrado. Lo que el cliente ya pagó y a ti no te ha llegado es lo que Flownexion te debe.
import { num, fechaISO, tieneNumero, hoyISO, normaliza } from "./parse";

export const NEGOCIOS = ["Taller", "Flownexion", "Otro"] as const;
export type Negocio = (typeof NEGOCIOS)[number];
export const TIPOS_INGRESO = ["trabajo", "proyecto", "mantenimiento", "otro"] as const;
export const METODOS = ["transferencia", "bizum", "efectivo", "tarjeta", "otro"] as const;

export const DESTINOS = ["yo", "flownexion"] as const;
export type Destino = (typeof DESTINOS)[number];

/** "retenido" = el cliente ya pagó a Flownexion tu parte y Flownexion aún no te la ha dado. */
export type EstadoIngreso = "cobrado" | "retenido" | "parcial" | "pendiente" | "sin precio" | "anulado";

export interface Cobro {
  fila: number;
  id: string;
  ingreso: string;
  fecha: string | null; // ISO; null = fecha desconocida (migrado de las hojas viejas)
  fechaTexto: string;
  importe: number;
  metodo: string;
  notas: string;
  destino: Destino;
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
  cobros: Cobro[]; // todos (a ti y del cliente a Flownexion)
  cobrado: number; // solo lo que te ha llegado a TI
  pendiente: number; // importe − cobrado: lo que aún te tienen que pagar
  clientePago: number; // Flownexion: tu parte de lo que el cliente ya ha pagado a Flownexion
  debeFlownexion: number; // Flownexion: lo tiene ya y no te lo ha dado
  esperaCliente: number; // Flownexion: el cliente aún no lo ha pagado
  fuente: string; // de dónde viene el dinero (separa comisiones, mantenimiento directo y cada proyecto)
  estado: EstadoIngreso;
  vencido: boolean;
  ultimoCobro: string | null;
}

export const COLS_ING = {
  id: "ID", negocio: "NEGOCIO", cliente: "CLIENTE", concepto: "CONCEPTO", referencia: "REFERENCIA", fecha: "FECHA",
  importe: "IMPORTE", totalTrabajo: "TOTAL_TRABAJO", porcentaje: "PORCENTAJE", unidades: "UNIDADES", precioUnit: "PRECIO_UNIT",
  tipo: "TIPO", estado: "ESTADO", vencimiento: "VENCIMIENTO", notas: "NOTAS", origen: "ORIGEN",
} as const;
export const COLS_COB = { id: "ID", ingreso: "INGRESO", fecha: "FECHA", importe: "IMPORTE", metodo: "METODO", notas: "NOTAS", destino: "DESTINO" } as const;

export const aDestino = (v: unknown): Destino => (/flow|cliente/i.test(String(v || "")) ? "flownexion" : "yo");

/**
 * De dónde viene el dinero. Dos canales que no se mezclan:
 *  - Flownexion (el cliente paga a Flownexion y Flownexion a ti), uno por proyecto.
 *  - Directo del taller: tus comisiones de trabajos y, desde octubre de 2026, el mantenimiento de la app.
 */
export function fuenteDe(i: Pick<Ingreso, "negocio" | "tipo" | "cliente">): string {
  const proy = (i.cliente.match(/proyecto\s*\d+/i) || [])[0];
  if (i.negocio === "Flownexion") return `Flownexion · ${i.cliente || "sin cliente"}`;
  if (i.negocio === "Taller") return /trabajo/i.test(i.tipo) ? "Taller · comisiones de trabajos" : `Taller directo · ${i.tipo || "otro"}${proy ? ` app (${proy.replace(/^p/, "P")})` : ""}`;
  return "Otros";
}

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
    destino: aDestino(o.DESTINO),
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
      const neg = NEGOCIOS.find((n) => normaliza(n) === normaliza(o.NEGOCIO)) || "Otro";
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const aMi = cs.filter((c) => c.destino === "yo");
      const cobrado = r2(aMi.reduce((s, c) => s + c.importe, 0));
      const anulado = /anulad|cancelad/i.test(o.ESTADO || "");
      const pendiente = anulado || importe === null ? 0 : Math.max(0, r2(importe - cobrado));
      // Solo en Flownexion existe el paso intermedio cliente → Flownexion.
      const esFlow = neg === "Flownexion";
      const clientePago = esFlow ? Math.min(importe ?? 0, r2(cs.filter((c) => c.destino === "flownexion").reduce((s, c) => s + c.importe, 0))) : 0;
      const debeFlownexion = esFlow ? Math.min(pendiente, Math.max(0, r2(clientePago - cobrado))) : 0;
      const esperaCliente = esFlow ? r2(pendiente - debeFlownexion) : 0;
      const estado: EstadoIngreso = anulado
        ? "anulado"
        : importe === null
          ? "sin precio"
          : pendiente <= 0.005
            ? "cobrado"
            : esFlow && debeFlownexion >= pendiente - 0.005
              ? "retenido"
              : cobrado > 0.005
                ? "parcial"
                : "pendiente";
      const venc = fechaISO(o.VENCIMIENTO);
      const conFecha = aMi.filter((c) => c.fecha);
      const tipo = (o.TIPO || "").trim() || "otro";
      const cliente = (o.CLIENTE || "").trim();
      return {
        fila,
        id,
        negocio: neg,
        cliente,
        concepto: (o.CONCEPTO || "").trim(),
        referencia: (o.REFERENCIA || "").trim(),
        fecha: fechaISO(o.FECHA),
        fechaTexto: o.FECHA || "",
        importe,
        totalTrabajo: numONull(o.TOTAL_TRABAJO),
        porcentaje: numONull(o.PORCENTAJE),
        unidades: (o.UNIDADES || "").trim(),
        precioUnit: numONull(o.PRECIO_UNIT),
        tipo,
        estadoHoja: (o.ESTADO || "").trim(),
        vencimiento: venc,
        notas: (o.NOTAS || "").trim(),
        origen: (o.ORIGEN || "").trim(),
        cobros: cs,
        cobrado,
        pendiente,
        clientePago,
        debeFlownexion,
        esperaCliente,
        fuente: fuenteDe({ negocio: neg, tipo, cliente }),
        estado,
        vencido: !!venc && venc < hoy && pendiente > 0.005,
        ultimoCobro: conFecha.length ? conFecha[conFecha.length - 1].fecha : null,
      };
    });
}

export interface ResumenNegocio {
  negocio: Negocio | "Todo";
  facturado: number; // suma de importes con precio (sin anulados)
  cobrado: number; // te ha llegado a ti
  pendiente: number; // te deben (en Flownexion = debeFlownexion + esperaCliente)
  debeFlownexion: number;
  esperaCliente: number;
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
    debeFlownexion: r2(xs.reduce((s, x) => s + x.debeFlownexion, 0)),
    esperaCliente: r2(xs.reduce((s, x) => s + x.esperaCliente, 0)),
    nPendientes: xs.filter((x) => x.pendiente > 0.005).length,
    nParciales: xs.filter((x) => x.estado === "parcial").length,
    nSinPrecio: xs.filter((x) => x.estado === "sin precio").length,
    nVencidos: xs.filter((x) => x.vencido).length,
    n: xs.length,
  };
}

/** Totales por fuente (comisiones del taller, mantenimiento directo, cada proyecto de Flownexion). */
export function porFuente(ings: Ingreso[]) {
  const m = new Map<string, Ingreso[]>();
  for (const i of ings) if (i.estado !== "anulado") m.set(i.fuente, [...(m.get(i.fuente) || []), i]);
  const orden = (f: string) => (f.startsWith("Taller · ") ? 0 : f.startsWith("Taller directo") ? 1 : f.startsWith("Flownexion") ? 2 : 3);
  return [...m.entries()]
    .map(([fuente, xs]) => ({ ...resumir(xs), fuente, negocio: xs[0].negocio }))
    .sort((a, b) => orden(a.fuente) - orden(b.fuente) || a.fuente.localeCompare(b.fuente));
}

/** Cobros por mes (solo los que te llegaron a ti y tienen fecha) para la gráfica, separados por negocio. */
export function cobrosPorMes(ings: Ingreso[], meses: string[]) {
  const idx = new Map(ings.map((i) => [i.id, i]));
  const filas = meses.map((mes) => ({ mes, Taller: 0, Flownexion: 0, Otro: 0 }) as Record<string, number | string>);
  for (const i of ings)
    for (const c of i.cobros) {
      if (!c.fecha || c.destino !== "yo") continue;
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
    if (n === "Flownexion")
      L.push(
        "",
        `<b>💻 Flownexion te debe ${e(r.pendiente)}</b> (a ti te ha pagado ${e(r.cobrado)} de ${e(r.facturado)})`,
        `  🏦 Ya lo cobró del cliente y no te lo ha dado: <b>${e(r.debeFlownexion)}</b>`,
        `  ⏳ El cliente aún no lo ha pagado: ${e(r.esperaCliente)}`,
      );
    else L.push("", `<b>${n === "Taller" ? "🔧 Taller (te paga directo)" : "📦 Otros"}</b> · pendiente <b>${e(r.pendiente)}</b> (cobrado ${e(r.cobrado)} de ${e(r.facturado)})`);
    let fuente = "";
    for (const x of xs.sort((a, b) => a.fuente.localeCompare(b.fuente) || b.pendiente - a.pendiente)) {
      if (x.fuente !== fuente) {
        fuente = x.fuente;
        L.push(`<i>— ${esc(fuente.replace(/^(Flownexion|Taller) · /, ""))}</i>`);
      }
      L.push(
        `<code>#${x.id}</code> ${esc(x.concepto)} — <b>${e(x.pendiente)}</b>` +
          (x.negocio === "Flownexion" ? (x.debeFlownexion > 0.005 ? " 🏦" : " ⏳") : "") +
          (x.cobrado > 0.005 ? ` <i>(te han pagado ${e(x.cobrado)} de ${e(x.importe || 0)})</i>` : "") +
          (x.vencido ? " 🔴 vencido" : ""),
      );
    }
  }
  const sinPrecio = ings.filter((x) => neg.includes(x.negocio) && x.estado === "sin precio").length;
  if (L.length === 1) L.push("", "Nadie te debe nada 🎉");
  else L.push("", `<b>Total pendiente: ${e(total)}</b>`);
  if (sinPrecio) L.push(`⚪ ${sinPrecio} trabajos sin precio todavía (no cuentan).`);
  if (neg.includes("Flownexion")) L.push("🏦 = el cliente ya pagó a Flownexion · ⏳ = el cliente aún no ha pagado");
  L.push("", "Te han pagado a ti: <code>/cobrado #I012 150</code> (sin importe = entero)");
  return L.join("\n");
}
