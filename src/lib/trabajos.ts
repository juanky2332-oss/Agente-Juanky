// Ingresos del taller y de Flownexion. Mismas reglas que /cobros del bot (probadas):
// - la cabecera se busca en las 12 primeras filas (Flownexion la tiene en la 3)
// - se excluye la fila "Totales" y la columna "TOTAL QUE FALTA POR PAGAR"
// - "falta por pagar" = primera coincidencia (col. I en taller), nunca la L
import { num, tieneNumero } from "./parse";
import type { Tabla } from "./sheets";

export interface TrabajoTaller {
  fila: number;
  occ: string;
  pedido: string;
  trabajo: string;
  unidades: number;
  precioUnit: number | null;
  total: number;
  miParte: number;
  pagado: number;
  falta: number;
  recibido: boolean;
  marca: string;
  sinPrecio: boolean;
}

export interface ProyectoFlownexion {
  fila: number;
  proyecto: string;
  celda: string;
  cliente: string;
  totalProyecto: string;
  ganoApp: number;
  ganoMto: string;
  pagoInicial: number;
  segundoPago: number;
  mantenimientos: string;
  totalMto: number;
  totalPagado: number;
  falta: number;
  notas: string[];
}

const idx = (cab: string[], re: RegExp) => cab.findIndex((c) => re.test(c.trim()));

export function leerTaller(t: Tabla) {
  const c = t.cabecera.map((x) => x.toLowerCase());
  const i = {
    occ: idx(c, /^occ$/),
    pedido: idx(c, /^pedido$/),
    trabajo: idx(c, /^(trabajo|concepto|descripci[oó]n|servicio|cliente)$/),
    unidades: idx(c, /^unidades$/),
    precio: idx(c, /^precio unitario$/),
    total: idx(c, /^total$/),
    parte: idx(c, /^mi parte/),
    pagado: idx(c, /^pagado$/),
    falta: c.findIndex((x) => /falta por pagar/.test(x)),
    recibido: idx(c, /material recibido/),
  };
  const trabajos: TrabajoTaller[] = [];
  for (const f of t.filas) {
    const g = (k: keyof typeof i) => (i[k] >= 0 ? f.celdas[i[k]] ?? "" : "");
    const trabajo = g("trabajo").trim();
    if (!trabajo || /^totales?$/i.test(trabajo)) continue;
    const precioTxt = g("precio");
    trabajos.push({
      fila: f.fila,
      occ: g("occ"),
      pedido: g("pedido"),
      trabajo,
      unidades: num(g("unidades")),
      precioUnit: tieneNumero(precioTxt) ? num(precioTxt) : null,
      total: num(g("total")),
      miParte: num(g("parte")),
      pagado: num(g("pagado")),
      falta: num(g("falta")),
      recibido: /x|s[ií]/i.test(g("recibido")),
      marca: (f.celdas[10] || "").trim(),
      sinPrecio: !tieneNumero(g("total")),
    });
  }
  const tot = (k: "total" | "miParte" | "pagado" | "falta") => trabajos.reduce((s, x) => s + x[k], 0);
  return {
    trabajos,
    columnas: i,
    resumen: {
      facturado: tot("total"),
      miParte: tot("miParte"),
      cobrado: tot("pagado"),
      pendiente: tot("falta"),
      nPendientes: trabajos.filter((x) => x.falta > 0.005).length,
      nSinPrecio: trabajos.filter((x) => x.sinPrecio).length,
    },
  };
}

export function leerFlownexion(t: Tabla, valores: string[][]) {
  const c = t.cabecera.map((x) => x.toLowerCase());
  const i = {
    total: idx(c, /^total proyecto$/),
    app: idx(c, /gano por la app/),
    mto: idx(c, /gano por el mto/),
    p1: idx(c, /pago inicial/),
    p2: idx(c, /segundo pago/),
    mants: idx(c, /^mantenimientos$/),
    totalMto: idx(c, /^total mto$/),
    pagado: idx(c, /^total pagado$/),
    falta: c.findIndex((x) => /falta por pagar/.test(x)),
  };
  const proyectos: ProyectoFlownexion[] = [];
  for (const f of t.filas) {
    const nombre = (f.celdas[0] || "").trim();
    if (!nombre || /^totales?$/i.test(nombre)) continue;
    const g = (k: keyof typeof i) => (i[k] >= 0 ? f.celdas[i[k]] ?? "" : "");
    const [proyecto, cliente] = nombre.split(/-+>|→/).map((s) => s.trim());
    proyectos.push({
      fila: f.fila,
      proyecto: proyecto || nombre,
      celda: nombre,
      cliente: cliente || "",
      totalProyecto: g("total"),
      ganoApp: num(g("app")),
      ganoMto: g("mto"),
      pagoInicial: num(g("p1")),
      segundoPago: num(g("p2")),
      mantenimientos: g("mants"),
      totalMto: num(g("totalMto")),
      totalPagado: num(g("pagado")),
      falta: num(g("falta")),
      notas: f.celdas.slice(Math.max(i.falta, 0) + 1).map((x) => x.trim()).filter(Boolean),
    });
  }
  // Notas sueltas debajo de los proyectos (columna L)
  const notasSueltas = t.filas
    .filter((f) => !(f.celdas[0] || "").trim() && f.celdas.some((x) => x.trim()))
    .map((f) => f.celdas.filter((x) => x.trim()).join(" · "));
  const nota = (valores[0] || []).filter((x) => x && x.trim()).join(" · ");
  const tot = (k: "ganoApp" | "totalMto" | "falta" | "pagoInicial" | "segundoPago") => proyectos.reduce((s, x) => s + x[k], 0);
  return {
    proyectos,
    reparto: nota,
    notasSueltas,
    resumen: {
      ganoApps: tot("ganoApp"),
      mantenimientoCobrado: tot("totalMto"),
      cobradoPagos: tot("pagoInicial") + tot("segundoPago"),
      pendiente: tot("falta"),
      nPendientes: proyectos.filter((x) => x.falta > 0.005).length,
    },
  };
}
