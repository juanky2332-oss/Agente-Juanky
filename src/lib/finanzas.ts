// Motor de finanzas: normaliza las filas de GestorIA, clasifica, detecta recurrentes
// y saca el análisis. Regla de la casa: TODAS las cifras salen de aquí (código), la IA
// solo redacta sobre lo que este módulo le pasa.
import { num, fechaISO, mesClave, claveEmpresa, normaliza, eur, tieneNumero } from "./parse";

export type Tipo = "gasto" | "ingreso" | "documento";
export type Ambito = "Casa" | "Personal" | "Taller" | "Flownexion";
export const AMBITOS: Ambito[] = ["Casa", "Personal", "Taller", "Flownexion"];

// Orden FIJO: el color sigue a la categoría, nunca al ranking (8 tonos + gris para el resto).
export const CATEGORIAS_COLOR = [
  "Luz",
  "Gas",
  "Telefonía e internet",
  "Suscripciones y software",
  "Delivery y restaurantes",
  "Supermercado",
  "Seguros",
  "Vehículo y transporte",
] as const;
export const CATEGORIAS = [
  ...CATEGORIAS_COLOR,
  "Agua",
  "Vivienda",
  "Hogar y compras",
  "Salud",
  "Bebé",
  "Ocio y viajes",
  "Impuestos y tasas",
  "Material y herramientas",
  "Formación",
  "Servicios profesionales",
  "Ingresos",
  "Otros",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const SUMINISTROS: string[] = ["Luz", "Gas", "Agua", "Telefonía e internet"];
// Solo estas categorías pueden ser "pago fijo" por deducción. El resto (delivery, súper,
// gasolina...) son compras sueltas aunque se repitan: solo cuentan si las marcas como recurrentes.
export const FIJOS_POSIBLES: string[] = [...SUMINISTROS, "Suscripciones y software", "Seguros", "Vivienda", "Servicios profesionales", "Formación", "Impuestos y tasas"];

const REGLAS: [RegExp, Categoria][] = [
  [/\bgas natural\b|\bgas\b|butano|propano|nedgia|nortegas/, "Gas"],
  [/electric|\bluz\b|iberdrola|endesa|naturgy|plenitude|\beni\b|holaluz|octopus|som energia|lucera|audax|factor energia|energia xxi|curenergia/, "Luz"],
  [/vodafone|lowi|movistar|orange|yoigo|\bdigi\b|masmovil|pepephone|simyo|jazztel|\bo2\b|fibra|telefon|\bmovil\b|finetwork|avatel|adamo/, "Telefonía e internet"],
  [/aguas?\b|emuasa|aquona|hidrogea|canal de isabel|aqualia|saneamiento/, "Agua"],
  [/glovo|just ?eat|uber ?eats|deliveroo|telepizza|domino|mcdonald|burger king|restaurante|\bbar\b|cafeteria|kfc|tagliatella|foster/, "Delivery y restaurantes"],
  [/mercadona|carrefour|lidl|aldi|supermercad|\bconsum\b|alcampo|\bdia\b|eroski|hipercor|el arbol|masymas/, "Supermercado"],
  [/anthropic|openai|chatgpt|claude|google (one|workspace|cloud)|microsoft|adobe|netflix|spotify|\bhbo\b|disney|prime video|amazon prime|apple\.com|icloud|github|vercel|scraperapi|hostinger|n8n|notion|canva|dropbox|suscripci|subscription|perplexity|cursor|youtube premium|dazn/, "Suscripciones y software"],
  [/seguro|mapfre|\baxa\b|allianz|linea directa|mutua|generali|sanitas|adeslas|asisa|zurich|caser|reale|pelayo|santalucia|ocaso/, "Seguros"],
  [/repsol|cepsa|moeve|\bbp\b|galp|shell|plenoil|ballenoil|gasolin|combustible|carburante|\bitv\b|parking|aparcamiento|peaje|renfe|cabify|\btaxi\b|\buber\b|autopista|neumatic|recambio/, "Vehículo y transporte"],
  [/alquiler|hipoteca|comunidad de propietarios|comunidad propietarios|\bibi\b/, "Vivienda"],
  [/agencia tributaria|\baeat\b|hacienda|ayuntamiento|impuesto|tasa\b|tasas|seguridad social|\breta\b|autonomo|dgt|multa/, "Impuestos y tasas"],
  [/farmacia|parafarmacia|clinica|dentist|optica|fisioterap|hospital|medic|analisis clinic/, "Salud"],
  [/\bbebe\b|panal|chicco|prenatal|dodot|puericultura|kiabi|toys/, "Bebé"],
  [/ikea|leroy|bricomart|brico|amazon|aliexpress|mediamarkt|el corte ingles|decathlon|zara|primark|pccomponentes/, "Hogar y compras"],
  [/wurth|ferreter|rodamiento|herramient|tornill|material|suministros industriales|ntn|skf|acero|mecaniz/, "Material y herramientas"],
  [/curso|formacion|udemy|academia|master|libro/, "Formación"],
  [/gestoria|asesor|abogad|notari|registro|consultor/, "Servicios profesionales"],
  [/cine|teatro|concierto|entradas|hotel|booking|airbnb|vuelo|ryanair|vueling|iberia|viaje|ocio|gimnasio|gym/, "Ocio y viajes"],
];

export function clasificar(proveedor: string, concepto: string): Categoria {
  const t = " " + normaliza(proveedor + " " + concepto) + " ";
  for (const [re, c] of REGLAS) if (re.test(t)) return c;
  return "Otros";
}

export function ambitoPorDefecto(cat: Categoria): Ambito {
  if (["Luz", "Gas", "Agua", "Telefonía e internet", "Vivienda", "Supermercado", "Hogar y compras", "Bebé"].includes(cat)) return "Casa";
  if (cat === "Material y herramientas") return "Taller";
  return "Personal";
}

export interface Detalle {
  potencia_kw?: number;
  precio_kwh?: number;
  precio_potencia_kw_dia?: number;
  tarifa?: string;
  datos_gb?: number;
  lineas?: number;
  dias?: number;
  cups?: string;
  [k: string]: unknown;
}

export interface Movimiento {
  fila: number;
  id: string;
  fecha: string; // ISO
  fechaTexto: string;
  proveedor: string;
  provKey: string;
  concepto: string;
  base: number;
  iva: number;
  total: number;
  tipoHoja: string;
  tipo: Tipo;
  doc: string;
  enlace: string;
  ambito: Ambito;
  categoria: Categoria;
  subcategoria: string;
  periodoDesde: string | null;
  periodoHasta: string | null;
  consumo: number | null;
  unidad: string;
  recurrencia: string;
  pago: string;
  notas: string;
  detalle: Detalle;
  inferido: boolean; // categoría/ámbito deducidos, no confirmados por Juanky
  sinFecha: boolean;
  totalCrudo: string;
}

export const COLS = {
  fecha: "Fecha", proveedor: "Proveedor", concepto: "Concepto", base: "Base Imponible", iva: "Impuestos",
  total: "Total", tipo: "Tipo", doc: "NºDocumento", enlace: "Enlace documento", id: "ID", ambito: "AMBITO",
  categoria: "CATEGORIA", subcategoria: "SUBCATEGORIA", desde: "PERIODO_DESDE", hasta: "PERIODO_HASTA",
  consumo: "CONSUMO", unidad: "UNIDAD", recurrencia: "RECURRENCIA", pago: "PAGO", notas: "NOTAS", detalle: "DETALLE",
} as const;

export function tipoDe(tipoHoja: string, concepto: string): Tipo {
  const t = normaliza(tipoHoja);
  if (/ingreso|cobro|emitida|venta/.test(t)) return "ingreso";
  if (/presupuesto|albaran|proforma/.test(t)) return "documento";
  if (/nomina|transferencia recibida/.test(normaliza(concepto)) && /ingreso/.test(t)) return "ingreso";
  return "gasto";
}

export function aMovimiento(fila: number, o: Record<string, string>): Movimiento {
  const proveedor = (o[COLS.proveedor] || "").trim();
  const concepto = (o[COLS.concepto] || "").trim();
  const catHoja = (o[COLS.categoria] || "").trim() as Categoria;
  const ambHoja = (o[COLS.ambito] || "").trim() as Ambito;
  const tipoHoja = (o[COLS.tipo] || "").trim();
  const tipo = tipoDe(tipoHoja, concepto);
  const categoria: Categoria = CATEGORIAS.includes(catHoja) ? catHoja : tipo === "ingreso" ? "Ingresos" : clasificar(proveedor, concepto);
  const ambito: Ambito = AMBITOS.includes(ambHoja) ? ambHoja : ambitoPorDefecto(categoria);
  const f = fechaISO(o[COLS.fecha]);
  let detalle: Detalle = {};
  try {
    const d = (o[COLS.detalle] || "").trim();
    if (d.startsWith("{")) detalle = JSON.parse(d);
  } catch {
    /* detalle ilegible: se ignora */
  }
  return {
    fila,
    id: (o[COLS.id] || "").trim(),
    fecha: f || "1970-01-01",
    fechaTexto: o[COLS.fecha] || "",
    proveedor,
    provKey: claveEmpresa(proveedor) || normaliza(concepto).slice(0, 20),
    concepto,
    base: num(o[COLS.base]),
    iva: num(o[COLS.iva]),
    total: num(o[COLS.total]),
    totalCrudo: o[COLS.total] || "",
    tipoHoja,
    tipo,
    doc: (o[COLS.doc] || "").trim(),
    enlace: (o[COLS.enlace] || "").trim(),
    ambito,
    categoria,
    subcategoria: (o[COLS.subcategoria] || "").trim(),
    periodoDesde: fechaISO(o[COLS.desde]),
    periodoHasta: fechaISO(o[COLS.hasta]),
    consumo: tieneNumero(o[COLS.consumo]) ? num(o[COLS.consumo]) : null,
    unidad: (o[COLS.unidad] || "").trim(),
    recurrencia: (o[COLS.recurrencia] || "").trim(),
    pago: (o[COLS.pago] || "").trim(),
    notas: (o[COLS.notas] || "").trim(),
    detalle,
    inferido: !CATEGORIAS.includes(catHoja) || !AMBITOS.includes(ambHoja),
    sinFecha: !f,
  };
}

// ───────────────────────── agregados ─────────────────────────

export function sumar(ms: Movimiento[]) {
  return ms.reduce((s, m) => s + m.total, 0);
}

export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let [y, m] = desde.split("-").map(Number);
  const [y2, m2] = hasta.split("-").map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function porMes(ms: Movimiento[], meses: string[]) {
  return meses.map((mes) => {
    const del = ms.filter((m) => mesClave(m.fecha) === mes);
    const fila: Record<string, number | string> = { mes, total: sumar(del) };
    for (const c of CATEGORIAS) fila[c] = 0;
    for (const m of del) fila[m.categoria] = (fila[m.categoria] as number) + m.total;
    return fila;
  });
}

export function agrupar<K extends string>(ms: Movimiento[], clave: (m: Movimiento) => K) {
  const g = new Map<K, Movimiento[]>();
  for (const m of ms) {
    const k = clave(m);
    g.set(k, [...(g.get(k) || []), m]);
  }
  return [...g.entries()]
    .map(([k, v]) => ({ clave: k, total: sumar(v), n: v.length, movs: v }))
    .sort((a, b) => b.total - a.total);
}

export function mediana(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

function dias(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

// ───────────────────────── recurrentes ─────────────────────────

export interface Recurrente {
  provKey: string;
  proveedor: string;
  categoria: Categoria;
  ambito: Ambito;
  periodicidad: "mensual" | "bimestral" | "trimestral" | "anual" | "irregular";
  cadaDias: number;
  ultimo: Movimiento;
  importeTipico: number;
  mensualEquivalente: number;
  anualEquivalente: number;
  n: number;
  proximaEstimada: string | null;
  variacion: number | null; // % del último frente al anterior
  movs: Movimiento[];
}

const PERIODO_DECLARADO: Record<string, number> = { mensual: 30, bimestral: 61, trimestral: 91, semestral: 182, anual: 365 };

export function recurrentes(gastos: Movimiento[]): Recurrente[] {
  const out: Recurrente[] = [];
  for (const g of agrupar(gastos, (m) => m.provKey + "|" + m.categoria)) {
    const movs = [...g.movs].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ult = movs[movs.length - 1];
    const declarada = normaliza(ult.recurrencia);
    let cada = 0;
    if (PERIODO_DECLARADO[declarada]) cada = PERIODO_DECLARADO[declarada];
    else if (movs.length >= 2 && FIJOS_POSIBLES.includes(ult.categoria)) {
      // El hueco MÁS CORTO es la cadencia: si faltan recibos (no los has subido), los huecos
      // largos son múltiplos del real y la mediana engañaría (mensual → "bimestral").
      const gaps = movs.slice(1).map((m, i) => dias(movs[i].fecha, m.fecha)).filter((d) => d > 20);
      cada = gaps.length ? Math.min(...gaps) : 0;
    } else continue;
    if (!cada) continue;
    const periodicidad =
      cada >= 24 && cada <= 38 ? "mensual" : cada >= 50 && cada <= 72 ? "bimestral" : cada >= 80 && cada <= 105 ? "trimestral" : cada >= 330 && cada <= 400 ? "anual" : "irregular";
    // Un proveedor "irregular" con muchas compras sueltas (Glovo) no es un pago fijo.
    if (periodicidad === "irregular" && !SUMINISTROS.includes(ult.categoria) && !declarada) continue;
    const importes = movs.slice(-6).map((m) => m.total);
    const tipico = mediana(importes);
    const diasPeriodo = periodicidad === "irregular" ? cada : PERIODO_DECLARADO[periodicidad];
    const MESES_PERIODO: Record<string, number> = { mensual: 1, bimestral: 2, trimestral: 3, anual: 12 };
    const mensual = periodicidad === "irregular" ? (tipico * 30.4) / cada : tipico / MESES_PERIODO[periodicidad];
    const prev = movs.length >= 2 ? movs[movs.length - 2] : null;
    out.push({
      provKey: ult.provKey,
      proveedor: ult.proveedor,
      categoria: ult.categoria,
      ambito: ult.ambito,
      periodicidad,
      cadaDias: Math.round(cada),
      ultimo: ult,
      importeTipico: tipico,
      mensualEquivalente: mensual,
      anualEquivalente: mensual * 12,
      n: movs.length,
      proximaEstimada: new Date(Date.parse(ult.fecha) + diasPeriodo * 86400000).toISOString().slice(0, 10),
      variacion: prev && prev.total > 0 ? ((ult.total - prev.total) / prev.total) * 100 : null,
      movs,
    });
  }
  return out.sort((a, b) => b.mensualEquivalente - a.mensualEquivalente);
}

// ───────────────────────── referencias de mercado ─────────────────────────

export interface Referencia {
  categoria: string;
  metrica: string;
  unidad: string;
  buenoHasta: number;
  caroDesde: number;
  fuente: string;
  fecha: string;
}

// ───────────────────────── hallazgos (análisis determinista) ─────────────────────────

export type Nivel = "alerta" | "aviso" | "bien" | "info";
export interface Hallazgo {
  nivel: Nivel;
  titulo: string;
  detalle: string;
  impactoAnual?: number;
  filas?: number[];
  categoria?: string;
}

export function analizar(todos: Movimiento[], refs: Referencia[], hoy = new Date().toISOString().slice(0, 10)): Hallazgo[] {
  const H: Hallazgo[] = [];
  const gastos = todos.filter((m) => m.tipo === "gasto" && !m.sinFecha);

  // 1. Importes que no cuadran (base + IVA ≠ total)
  for (const m of gastos) {
    if (m.base > 0 && m.iva >= 0 && m.total > 0) {
      const dif = Math.abs(m.base + m.iva - m.total);
      if (dif > Math.max(0.05, m.total * 0.02))
        H.push({
          nivel: "alerta",
          titulo: `No cuadra: ${m.proveedor || m.concepto} (${m.fechaTexto})`,
          detalle: `Base ${eur(m.base)} + IVA ${eur(m.iva)} = ${eur(m.base + m.iva)}, pero el total apuntado es ${eur(m.total)}. Revisa la factura: puede ser una coma mal puesta y está inflando las gráficas.`,
          filas: [m.fila],
          categoria: m.categoria,
        });
    }
  }

  // 2. Importes improbables para su categoría (p.ej. 2.995 € de móvil)
  const TOPE: Partial<Record<Categoria, number>> = { "Telefonía e internet": 200, "Suscripciones y software": 300, "Delivery y restaurantes": 300, Luz: 600, Gas: 500, Agua: 300 };
  for (const m of gastos) {
    const tope = TOPE[m.categoria];
    if (tope && m.total > tope)
      H.push({
        nivel: "alerta",
        titulo: `Importe raro en ${m.categoria}: ${eur(m.total)}`,
        detalle: `${m.proveedor} · ${m.concepto}. Es mucho para una factura de ${m.categoria.toLowerCase()}${m.total / 100 < tope ? ` (¿serían ${eur(m.total / 100)}?)` : ""}. Si está mal, corrígelo o las medias salen disparadas.`,
        filas: [m.fila],
        categoria: m.categoria,
      });
  }

  // 3. Duplicados: mismo nº de documento, o mismo proveedor+importe en ≤3 días
  const vistos = new Map<string, Movimiento>();
  for (const m of [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const claves = [m.doc ? "doc:" + normaliza(m.doc) : "", `imp:${m.provKey}:${m.total.toFixed(2)}`].filter(Boolean);
    for (const k of claves) {
      const prev = vistos.get(k);
      if (prev && (k.startsWith("doc:") || Math.abs(dias(prev.fecha, m.fecha)) <= 3)) {
        H.push({
          nivel: "alerta",
          titulo: `Posible duplicado: ${m.proveedor} ${eur(m.total)}`,
          detalle: `Aparece dos veces (filas #G${prev.fila} y #G${m.fila}${m.doc ? `, documento ${m.doc}` : ""}). Si es la misma factura, borra una: estás contando el gasto dos veces.`,
          filas: [prev.fila, m.fila],
          categoria: m.categoria,
        });
        break;
      }
      vistos.set(k, m);
    }
  }

  // 4. Recurrentes: subidas de precio y peso de los fijos
  const recs = recurrentes(gastos);
  for (const r of recs) {
    if (r.variacion !== null && r.variacion > 10 && r.ultimo.total - r.movs[r.movs.length - 2].total > 2) {
      const esSuministro = SUMINISTROS.includes(r.categoria) && !["Telefonía e internet"].includes(r.categoria);
      H.push({
        nivel: esSuministro ? "info" : "aviso",
        titulo: `${r.proveedor}: ${r.variacion.toFixed(0)} % más que la vez anterior`,
        detalle: esSuministro
          ? `De ${eur(r.movs[r.movs.length - 2].total)} a ${eur(r.ultimo.total)}. En ${r.categoria.toLowerCase()} depende del consumo; si la factura trae los kWh, apúntalos para saber si ha subido el precio o has gastado más.`
          : `De ${eur(r.movs[r.movs.length - 2].total)} a ${eur(r.ultimo.total)}. En una cuota fija eso es una subida de tarifa: merece una llamada o cambiar de compañía.`,
        impactoAnual: esSuministro ? undefined : (r.ultimo.total - r.movs[r.movs.length - 2].total) * (365 / r.cadaDias),
        filas: [r.ultimo.fila],
        categoria: r.categoria,
      });
    }
  }
  const fijoMes = recs.reduce((s, r) => s + r.mensualEquivalente, 0);
  if (recs.length)
    H.push({
      nivel: "info",
      titulo: `Gastos fijos: ${eur(fijoMes)} al mes (${eur(fijoMes * 12, 0)} al año)`,
      detalle: `${recs.length} pagos se repiten: ${recs.slice(0, 5).map((r) => `${r.proveedor} ${eur(r.mensualEquivalente)}/mes`).join(" · ")}${recs.length > 5 ? "…" : ""}. Es lo primero que conviene revisar: bajar un fijo ahorra todos los meses.`,
      impactoAnual: fijoMes * 12,
    });

  // 5. Suscripciones
  const subs = recs.filter((r) => r.categoria === "Suscripciones y software");
  if (subs.length) {
    const anual = subs.reduce((s, r) => s + r.anualEquivalente, 0);
    H.push({
      nivel: "info",
      titulo: `Suscripciones: ${eur(anual, 0)} al año`,
      detalle: subs.map((r) => `${r.proveedor} (${eur(r.importeTipico)} ${r.periodicidad})`).join(" · ") + ". ¿Las usas todas cada mes? Una suscripción olvidada es el ahorro más fácil.",
      impactoAnual: anual,
      categoria: "Suscripciones y software",
    });
  }

  // 6. Delivery: frecuencia y comisiones
  const hace90 = new Date(Date.parse(hoy) - 90 * 86400000).toISOString().slice(0, 10);
  const deliv = gastos.filter((m) => m.categoria === "Delivery y restaurantes" && m.fecha >= hace90);
  if (deliv.length >= 4 || sumar(deliv) >= 30) {
    const tot = sumar(deliv);
    H.push({
      nivel: deliv.length >= 6 ? "aviso" : "info",
      titulo: `Delivery y restaurantes: ${deliv.length} cargos en 90 días (${eur(tot)})`,
      detalle: `Al ritmo actual son unos ${eur((tot / 90) * 365, 0)} al año. Las tarifas de servicio y envío de las apps son dinero que no se come.`,
      impactoAnual: (tot / 90) * 365,
      categoria: "Delivery y restaurantes",
    });
  }

  // 7. Comparación con referencias de mercado (solo lo que está en la pestaña "Referencias precios")
  for (const ref of refs) {
    const cat = ref.categoria as Categoria;
    const ms = gastos.filter((m) => m.categoria === cat).sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (!ms.length) continue;
    if (ref.metrica === "precio_energia") {
      const conPrecio = ms.find((m) => typeof m.detalle.precio_kwh === "number" && m.detalle.precio_kwh > 0);
      if (!conPrecio) continue;
      const p = conPrecio.detalle.precio_kwh as number;
      H.push(nivelRef(p, ref, `${cat}: pagas ${p.toLocaleString("es-ES", { maximumFractionDigits: 4 })} ${ref.unidad} de energía`, conPrecio));
    }
    if (ref.metrica === "cuota_mensual") {
      // media mensual real de los últimos 6 meses con gasto en esa categoría
      const ult = ms.filter((m) => m.fecha >= new Date(Date.parse(hoy) - 183 * 86400000).toISOString().slice(0, 10));
      if (!ult.length) continue;
      const meses = new Set(ult.map((m) => mesClave(m.fecha)));
      const rec = recs.find((r) => r.categoria === cat);
      const mensual = rec ? recs.filter((r) => r.categoria === cat).reduce((s, r) => s + r.mensualEquivalente, 0) : sumar(ult) / Math.max(1, meses.size);
      H.push(nivelRef(mensual, ref, `${cat}: ${eur(mensual)} al mes`, ult[0]));
    }
  }

  // 8. Categorías que crecen (últimos 90 días frente a los 90 anteriores)
  const hace180 = new Date(Date.parse(hoy) - 180 * 86400000).toISOString().slice(0, 10);
  for (const g of agrupar(gastos, (m) => m.categoria)) {
    const ma = g.movs.filter((m) => m.fecha >= hace90);
    const mb = g.movs.filter((m) => m.fecha >= hace180 && m.fecha < hace90);
    if (!ma.length || !mb.length) continue;
    // En recibos (luz, móvil...) se compara la media por recibo: si un trimestre tiene más
    // facturas subidas que otro, la suma diría "sube" sin que haya subido nada.
    const porRecibo = FIJOS_POSIBLES.includes(g.clave);
    const a = porRecibo ? sumar(ma) / ma.length : sumar(ma);
    const b = porRecibo ? sumar(mb) / mb.length : sumar(mb);
    const que = porRecibo ? "de media por recibo" : "en total";
    if (b > 20 && a > b * 1.3 && a - b > 25)
      H.push({
        nivel: "aviso",
        titulo: `${g.clave} sube un ${(((a - b) / b) * 100).toFixed(0)} % en el último trimestre`,
        detalle: `${eur(a)} ${que} en los últimos 90 días frente a ${eur(b)} en los 90 anteriores.${porRecibo && g.clave !== "Telefonía e internet" ? " Puede ser consumo (verano, calefacción) y no precio: mira el coste por kWh." : ""}`,
        categoria: g.clave,
      });
    else if (b > 20 && a < b * 0.8)
      H.push({ nivel: "bien", titulo: `${g.clave} baja un ${(((b - a) / b) * 100).toFixed(0)} %`, detalle: `${eur(a)} ${que} en los últimos 90 días frente a ${eur(b)} antes.`, categoria: g.clave });
  }

  // 9. Datos a completar
  const sinRevisar = gastos.filter((m) => m.inferido).length;
  if (sinRevisar)
    H.push({
      nivel: "info",
      titulo: `${sinRevisar} gastos con categoría deducida`,
      detalle: "Los he clasificado por el proveedor y el concepto. Ábrelos y confírmalos: cuanto más exactos, más fino el análisis.",
    });
  const suministrosSinConsumo = gastos.filter((m) => ["Luz", "Gas", "Agua"].includes(m.categoria) && m.consumo === null).length;
  if (suministrosSinConsumo)
    H.push({
      nivel: "info",
      titulo: `${suministrosSinConsumo} facturas de luz/gas/agua sin consumo`,
      detalle: "Sin los kWh o m³ no puedo separar si pagas más porque consumes más o porque te han subido el precio. Súbelas con «Subir factura» y los saco solos.",
    });

  const orden: Record<Nivel, number> = { alerta: 0, aviso: 1, bien: 2, info: 3 };
  return H.sort((a, b) => orden[a.nivel] - orden[b.nivel] || (b.impactoAnual || 0) - (a.impactoAnual || 0));
}

function nivelRef(valor: number, ref: Referencia, titulo: string, m: Movimiento): Hallazgo {
  const nivel: Nivel = valor <= ref.buenoHasta ? "bien" : valor >= ref.caroDesde ? "alerta" : "aviso";
  const txt =
    nivel === "bien"
      ? `Estás por debajo de ${ref.buenoHasta} ${ref.unidad}: buen precio.`
      : nivel === "alerta"
        ? `Por encima de ${ref.caroDesde} ${ref.unidad}: estás pagando caro. Merece comparar ofertas.`
        : `En la media (${ref.buenoHasta}–${ref.caroDesde} ${ref.unidad}). Hay margen si buscas oferta.`;
  return { nivel, titulo, detalle: `${txt} Fuente: ${ref.fuente} (${ref.fecha}).`, filas: [m.fila], categoria: ref.categoria };
}
