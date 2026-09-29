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

/** Nombre del pagador para pantallas y Telegram. NEGOCIO en la hoja = quién te paga. */
export const PAGADOR: Record<Negocio, string> = { Taller: "Taller (te paga directo)", Flownexion: "Flownexion", Otro: "Otros" };

/**
 * De dónde viene el dinero. DOS PAGADORES que no se mezclan:
 *  - TALLER: te paga directo a ti. Tus comisiones (10 % de cada trabajo) y, desde octubre de
 *    2026, el mantenimiento de la app (75 €/mes íntegros).
 *  - FLOWNEXION: el cliente del proyecto paga a Flownexion y después Flownexion te paga tu %.
 *    Un grupo por proyecto ("Proyecto 1 · App del taller", "Proyecto 2 · App de Rodamientos").
 *    Que el cliente del Proyecto 1 sea el taller NO lo convierte en pago del taller.
 */
export function fuenteDe(i: Pick<Ingreso, "negocio" | "tipo" | "cliente">): string {
  if (i.negocio === "Flownexion") return `Flownexion · ${i.cliente || "sin proyecto"}`;
  if (i.negocio === "Taller") return /trabajo/i.test(i.tipo) ? "Taller · comisiones 10 % de trabajos" : /manten/i.test(i.tipo) ? "Taller · mantenimiento de la app" : "Taller · otros";
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
  const orden = (f: string) => (f.startsWith("Taller · comisiones") ? 0 : f.startsWith("Taller") ? 1 : f.startsWith("Flownexion") ? 2 : 3);
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
          (x.negocio === "Flownexion"
            ? x.debeFlownexion > 0.005 && x.esperaCliente > 0.005
              ? ` <i>(🏦 ${e(x.debeFlownexion)} ya cobrado del cliente · ⏳ ${e(x.esperaCliente)} sin pagar)</i>`
              : x.debeFlownexion > 0.005 ? " 🏦" : " ⏳"
            : "") +
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

// ─── Pagos de varios meses y cambios de reparto ────────────────────────────────────────────

const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Mes "AAAA-MM" a partir de lo que se escriba: "2026-08", "08/2026", "8-26", "01/08/2026",
 * "agosto 2026", "ago", "agosto" (sin año = el año de hoy). null si no se entiende.
 */
export function aMes(v: unknown, hoy = hoyISO()): string | null {
  const t = normaliza(v).replace(/\bde\b/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const f = fechaISO(t);
  if (f) return f.slice(0, 7);
  let m = t.match(/^(\d{4})[-/. ](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/. ](\d{2}|\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2].length === 2 ? "20" + m[2] : m[2]}-${m[1].padStart(2, "0")}`;
  m = t.match(/^([a-z]{3,})\.?(?: (\d{4}|\d{2}))?$/);
  if (m) {
    const k = MESES_ES.findIndex((x) => x.startsWith(m![1].slice(0, 3)) || (m![1] === "setiembre" && x === "septiembre"));
    if (k >= 0) return `${m[2] ? (m[2].length === 2 ? "20" + m[2] : m[2]) : hoy.slice(0, 4)}-${String(k + 1).padStart(2, "0")}`;
  }
  return null;
}

export const nombreMes = (mes: string) => `${MESES_ES[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}`;

/** Meses "AAAA-MM" entre dos (incluidos). Si vienen al revés, se ordenan. */
export function mesesDelRango(desde: string, hasta: string): string[] {
  const [ini, b] = [desde, hasta].sort();
  let a = ini;
  const out: string[] = [];
  for (let k = 0; a <= b && k < 120; k++) {
    out.push(a);
    const [y, m] = a.split("-").map(Number);
    a = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return out;
}

/** Palabras sueltas de la búsqueda que están todas en el ingreso (#ID exacto también vale). */
export function coincide(i: Ingreso, busqueda: string) {
  const ps = normaliza(busqueda).split(" ").filter((p) => p && !["de", "del", "la", "el", "los", "las", "y", "a"].includes(p));
  if (!ps.length) return true;
  const t = " " + normaliza(`${i.id} ${i.negocio} ${i.cliente} ${i.concepto} ${i.referencia} ${i.notas} ${i.tipo}`) + " ";
  return ps.every((p) => t.includes(p));
}

export interface Seleccion {
  ids?: string[];
  busqueda?: string;
  tipo?: string; // "mantenimiento" | "proyecto" | "trabajo" | "" (todos)
  negocio?: string;
  cliente?: string; // proyecto exacto ("Proyecto 1 · App del taller")
  desde?: string; // mes (cualquier formato de aMes)
  hasta?: string;
}

/**
 * Qué ingresos entran en una operación en bloque. Con ids manda la lista; si no, búsqueda +
 * tipo + negocio + rango de meses (por la FECHA del trabajo: el mantenimiento de agosto es el
 * que tiene fecha de agosto). Los anulados nunca entran.
 */
export function seleccionar(ings: Ingreso[], s: Seleccion, hoy = hoyISO()) {
  const ids = (s.ids || []).map((x) => normId(x)).filter(Boolean);
  if (ids.length) {
    const faltan = ids.filter((id) => !ings.some((i) => i.id === id));
    return { lista: ings.filter((i) => ids.includes(i.id) && i.estado !== "anulado"), faltan, meses: [] as string[] };
  }
  const d = s.desde ? aMes(s.desde, hoy) : null;
  const h = s.hasta ? aMes(s.hasta, hoy) : d;
  if (s.desde && !d) throw new Error(`No entiendo el mes «${s.desde}». Ponlo como 08/2026 o «agosto 2026».`);
  if (s.hasta && !h) throw new Error(`No entiendo el mes «${s.hasta}». Ponlo como 09/2026 o «septiembre 2026».`);
  const [ini, fin] = d && h ? [d, h].sort() : [null, null];
  const tipo = normaliza(s.tipo);
  const neg = normaliza(s.negocio);
  const cli = normaliza(s.cliente);
  const lista = ings.filter(
    (i) =>
      i.estado !== "anulado" &&
      (!tipo || normaliza(i.tipo).startsWith(tipo.slice(0, 5))) &&
      (!neg || normaliza(i.negocio) === neg) &&
      (!cli || normaliza(i.cliente) === cli) &&
      coincide(i, s.busqueda || "") &&
      (!ini || (!!i.fecha && i.fecha.slice(0, 7) >= ini && i.fecha.slice(0, 7) <= fin!)),
  );
  return { lista: lista.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "") || a.id.localeCompare(b.id)), faltan: [] as string[], meses: ini ? mesesDelRango(ini, fin!) : [] };
}

/** Lo que falta por pagar en un sentido: a ti (lo pendiente) o del cliente a Flownexion. */
export const huecoDe = (i: Ingreso, d: Destino) => (d === "yo" ? i.pendiente : Math.max(0, Math.round(((i.importe || 0) - i.clientePago) * 100) / 100));

/** Cambia el "NN %" del concepto ("Mantenimiento abril 2026 (30 % de 200 €)") al nuevo porcentaje. */
export function conceptoConPorcentaje(concepto: string, pct: number) {
  const p = String(Math.round(pct * 100) / 100).replace(".", ",");
  return /\d+(?:[.,]\d+)?\s*%/.test(concepto) ? concepto.replace(/\d+(?:[.,]\d+)?\s*%/, `${p} %`) : concepto;
}

/** Porcentaje y total que dice un texto "(30 % de 175 €)". */
export function leerReparto(txt: string): { pct: number; total: number } | null {
  const m = String(txt || "").match(/(\d+(?:[.,]\d+)?)\s*%\s*de\s*([\d.,]+)\s*€?/i);
  return m ? { pct: num(m[1]), total: num(m[2]) } : null;
}

/**
 * Los pagos cliente → Flownexion se guardan en TU parte. Si tu parte cambia (p.ej. del 30 % al
 * 60 %), lo que el cliente pagó sigue siendo el mismo porcentaje del total: se escalan igual.
 * Los pagos que te llegaron a ti son dinero real y NO se tocan. Devuelve id de cobro → cambios.
 */
export function escalarPagosCliente(i: Ingreso, nuevoImporte: number) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const cambios = new Map<string, Record<string, string>>();
  if (!i.importe || Math.abs(nuevoImporte - i.importe) < 0.005) return cambios;
  const f = nuevoImporte / i.importe;
  let acumulado = 0;
  for (const c of i.cobros.filter((x) => x.destino === "flownexion")) {
    const nuevo = Math.min(r2(c.importe * f), r2(nuevoImporte - acumulado));
    acumulado += nuevo;
    if (Math.abs(nuevo - c.importe) >= 0.005) cambios.set(c.id, { IMPORTE: String(nuevo) });
  }
  return cambios;
}
