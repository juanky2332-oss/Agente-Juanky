import "server-only";
// Gastos por Telegram, SIEMPRE a petición (nada diario ni automático: lo pidió así).
// Consultas («¿cuánto llevo de luz este año?»), resumen de un mes, buscar facturas y mandarlas al
// chat (sueltas o en ZIP), informe en CSV y editar/borrar con confirmación previa.
// Todo se calcula aquí: el bot solo copia el texto.
import { leerRangos, aTabla, aObjeto, modificarFila, borrarFila } from "./sheets";
import { aMovimiento, CATEGORIAS, AMBITOS, COLS, type Movimiento } from "./finanzas";
import { aColumnas, type Entrada } from "./gastosSrv";
import { escHtml, ErrorN8n } from "./n8n";
import { eur, isoAEs, normaliza, hoyISO, fechaISO } from "./parse";
import { aMes, nombreMes, mesesDelRango } from "./ingresos";
import { driveIdDe, extDe, enviarArchivos, type Archivo } from "./documentos";

export async function leerGastos(): Promise<Movimiento[]> {
  const [v] = await leerRangos(["'GestorIA'!A1:Z3000"]);
  const t = aTabla("GestorIA", v);
  return t.filas.map((f) => aMovimiento(f.fila, aObjeto(t, f.celdas))).filter((m) => m.proveedor || m.total);
}

export interface Filtro { busqueda?: string; categoria?: string; proveedor?: string; ambito?: string; desde?: string; hasta?: string; tipo?: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
const fin = (mes: string) => { const [y, m] = mes.split("-").map(Number); return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; };

/**
 * Periodo en fechas ISO a partir de lo que diga él: "2026", "este año", "agosto", "08/2026",
 * "T3", "3er trimestre 2026", "01/03/2026"… Sin nada = este año.
 */
export function rango(desde?: string, hasta?: string, hoy = hoyISO()): { ini: string; fin: string; texto: string } {
  const año = hoy.slice(0, 4);
  const uno = (v: string | undefined): { ini: string; fin: string } | null => {
    const t = normaliza(v).replace(/\bde\b/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return null;
    if (/^(este ano|ano actual|este año)$/.test(t)) return { ini: `${año}-01-01`, fin: `${año}-12-31` };
    if (/^(ano pasado|el ano pasado)$/.test(t)) return { ini: `${+año - 1}-01-01`, fin: `${+año - 1}-12-31` };
    if (/^(este mes|mes actual)$/.test(t)) return { ini: hoy.slice(0, 7) + "-01", fin: fin(hoy.slice(0, 7)) };
    if (/^(mes pasado|el mes pasado)$/.test(t)) { const d = new Date(+año, +hoy.slice(5, 7) - 2, 1); const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; return { ini: m + "-01", fin: fin(m) }; }
    let m = t.match(/^(\d{4})$/);
    if (m) return { ini: `${m[1]}-01-01`, fin: `${m[1]}-12-31` };
    m = t.match(/^(?:t|q)\s*([1-4])(?:\s+(\d{4}))?$/) || t.match(/^([1-4])\s*(?:er|o|º|°)?\s*trimestre(?:\s+(\d{4}))?$/);
    if (m) { const y = m[2] || año, q = +m[1]; return { ini: `${y}-${String(q * 3 - 2).padStart(2, "0")}-01`, fin: fin(`${y}-${String(q * 3).padStart(2, "0")}`) }; }
    const f = fechaISO(t);
    if (f && /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(t)) return { ini: f, fin: f };
    const mes = aMes(t, hoy);
    if (mes) return { ini: mes + "-01", fin: fin(mes) };
    throw new ErrorN8n(`No entiendo el periodo «${v}». Ponlo como «agosto», «08/2026», «2026», «T3» o «este año».`, 400);
  };
  const a = uno(desde), b = uno(hasta);
  const ini = a?.ini || b?.ini || `${año}-01-01`, f = b?.fin || a?.fin || `${año}-12-31`;
  const [i2, f2] = ini <= f ? [ini, f] : [f, ini];
  const texto = i2.slice(0, 4) === f2.slice(0, 4) && i2.endsWith("-01-01") && f2.endsWith("-12-31") ? `en ${i2.slice(0, 4)}` : i2.slice(0, 7) === f2.slice(0, 7) && i2.endsWith("-01") && f2 === fin(f2.slice(0, 7)) ? `en ${nombreMes(i2.slice(0, 7))}` : `del ${isoAEs(i2)} al ${isoAEs(f2)}`;
  return { ini: i2, fin: f2, texto };
}

/** Categoría por lo que diga él ("luz", "teléfono", "glovo" no: eso es proveedor). */
export function categoriaDe(v?: string) {
  const t = normaliza(v);
  if (!t) return "";
  return CATEGORIAS.find((c) => normaliza(c) === t) || CATEGORIAS.find((c) => normaliza(c).startsWith(t) || normaliza(c).split(/[ ,]+/).includes(t)) || "";
}

export function filtrar(ms: Movimiento[], f: Filtro) {
  const p = rango(f.desde, f.hasta);
  const cat = categoriaDe(f.categoria);
  if (f.categoria && !cat) throw new ErrorN8n(`No conozco la categoría «${f.categoria}». Son: ${CATEGORIAS.join(", ")}`, 400);
  const tipo = normaliza(f.tipo) || "gasto";
  const ws = normaliza(`${f.busqueda || ""} ${f.proveedor || ""}`).split(" ").filter((w) => w.length > 1);
  const amb = normaliza(f.ambito);
  const xs = ms.filter(
    (m) =>
      (tipo === "todo" || m.tipo === tipo) &&
      !m.sinFecha && m.fecha >= p.ini && m.fecha <= p.fin &&
      (!cat || m.categoria === cat) &&
      (!amb || normaliza(m.ambito) === amb) &&
      ws.every((w) => normaliza(`${m.proveedor} ${m.concepto} ${m.doc} ${m.categoria} ${m.subcategoria} ${m.notas}`).includes(w)),
  ).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.fila - a.fila);
  const que = [cat, f.proveedor, f.busqueda].filter(Boolean).join(" · ") || (tipo === "ingreso" ? "ingresos" : "gastos");
  return { lista: xs, periodo: p, que, cat };
}

const barra = (v: number, max: number) => (max > 0 ? "▇".repeat(Math.max(v > 0 ? 1 : 0, Math.round((v / max) * 10))) : "");
const linea = (m: Movimiento) => `<code>#G${m.fila}</code> ${isoAEs(m.fecha)} · ${escHtml(m.proveedor || "?")} · <b>${eur(m.total)}</b>${m.enlace ? ` · <a href="${escHtml(m.enlace)}">📎</a>` : ""}`;

/** «¿Cuánto he gastado en luz este año?» → total, media, mes a mes con barras y las facturas. */
export function textoConsulta(ms: Movimiento[], f: Filtro) {
  const { lista, periodo, que, cat } = filtrar(ms, f);
  if (!lista.length) return `No encuentro ${escHtml(que)} ${periodo.texto}.`;
  const total = r2(lista.reduce((s, m) => s + m.total, 0));
  const L = [`💶 <b>${escHtml(que)} ${periodo.texto}: ${eur(total)}</b>`, `${lista.length} ${lista.length === 1 ? "factura" : "facturas"} · media ${eur(r2(total / lista.length))} por factura`];
  const meses = mesesDelRango(periodo.ini.slice(0, 7), periodo.fin.slice(0, 7)).filter((x) => x <= hoyISO().slice(0, 7));
  if (meses.length > 1 && meses.length <= 24) {
    const por = meses.map((mes) => ({ mes, v: r2(lista.filter((m) => m.fecha.startsWith(mes)).reduce((s, m) => s + m.total, 0)) }));
    const max = Math.max(...por.map((x) => x.v));
    L.push("", "<b>Mes a mes</b>", ...por.map((x) => `<code>${nombreMes(x.mes).slice(0, 3)} ${x.mes.slice(2, 4)}</code> ${barra(x.v, max)} ${x.v ? eur(x.v) : "—"}`));
    const conGasto = por.filter((x) => x.v > 0);
    if (conGasto.length) L.push(`Media por mes con gasto: ${eur(r2(conGasto.reduce((s, x) => s + x.v, 0) / conGasto.length))}`);
  }
  // Si no se ha pedido una categoría, se reparte por categorías.
  if (!cat && !f.proveedor && !f.busqueda) {
    const porCat = new Map<string, number>();
    for (const m of lista) porCat.set(m.categoria, r2((porCat.get(m.categoria) || 0) + m.total));
    const xs = [...porCat.entries()].sort((a, b) => b[1] - a[1]);
    L.push("", "<b>Por categoría</b>", ...xs.slice(0, 12).map(([c, v]) => `${escHtml(c)}: <b>${eur(v)}</b> (${Math.round((v / total) * 100)} %)`));
  }
  L.push("", "<b>Facturas</b>", ...lista.slice(0, 10).map(linea));
  if (lista.length > 10) L.push(`…y ${lista.length - 10} más. Pídeme «mándame las facturas» y te las paso en un ZIP.`);
  return L.join("\n");
}

/** Resumen de UN mes: por categoría, comparado con el mes anterior y el mismo mes del año pasado. */
export function textoMes(ms: Movimiento[], mesTxt?: string) {
  const mes = mesTxt ? aMes(mesTxt) : hoyISO().slice(0, 7);
  if (!mes) throw new ErrorN8n(`No entiendo el mes «${mesTxt}»`, 400);
  const gastos = ms.filter((m) => m.tipo === "gasto" && !m.sinFecha);
  const suma = (pre: string) => r2(gastos.filter((m) => m.fecha.startsWith(pre)).reduce((s, m) => s + m.total, 0));
  const xs = gastos.filter((m) => m.fecha.startsWith(mes));
  const [y, mm] = mes.split("-").map(Number);
  const ant = `${mm === 1 ? y - 1 : y}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`, pasado = `${y - 1}-${String(mm).padStart(2, "0")}`;
  const total = suma(mes);
  const L = [`🗓 <b>Gastos de ${nombreMes(mes)}: ${eur(total)}</b> (${xs.length} facturas)`];
  const cmp = (v: number, txt: string) => (v ? `${txt}: ${eur(v)} (${total >= v ? "+" : "−"}${eur(Math.abs(r2(total - v)))})` : `${txt}: sin datos`);
  L.push(cmp(suma(ant), `${nombreMes(ant)}`), cmp(suma(pasado), `${nombreMes(pasado)}`));
  const porCat = new Map<string, Movimiento[]>();
  for (const m of xs) porCat.set(m.categoria, [...(porCat.get(m.categoria) || []), m]);
  const max = Math.max(0, ...[...porCat.values()].map((v) => v.reduce((s, m) => s + m.total, 0)));
  L.push("", ...[...porCat.entries()].sort((a, b) => b[1].reduce((s, m) => s + m.total, 0) - a[1].reduce((s, m) => s + m.total, 0)).map(([c, v]) => {
    const t = r2(v.reduce((s, m) => s + m.total, 0));
    return `${barra(t, max)} <b>${escHtml(c)}</b> ${eur(t)} · ${v.map((m) => escHtml(m.proveedor)).filter((x, k, a) => a.indexOf(x) === k).slice(0, 3).join(", ")}`;
  }));
  return L.join("\n");
}

/** Un gasto por lo que diga él: "#G43", "43", "ultimo"/"el último", o búsqueda (si sale uno solo). */
export function buscarGasto(ms: Movimiento[], ref: string, f: Filtro = {}): Movimiento[] {
  const t = normaliza(ref).replace(/^#?g\s*/, "");
  if (/^\d+$/.test(t)) return ms.filter((m) => m.fila === +t);
  if (/^(el )?ultim[oa]$|^last$/.test(t) || !t) {
    const xs = ref || f.busqueda || f.categoria || f.proveedor ? filtrar(ms, { ...f, desde: f.desde || "2000", hasta: f.hasta || "2100" }).lista : ms;
    return [...xs].sort((a, b) => b.fila - a.fila).slice(0, 1);
  }
  return filtrar(ms, { ...f, busqueda: ref, desde: f.desde || "2000", hasta: f.hasta || "2100", tipo: "todo" }).lista;
}

export function fichaGasto(m: Movimiento) {
  return [
    `<code>#G${m.fila}</code> <b>${escHtml(m.proveedor || "?")}</b> · ${m.fecha ? isoAEs(m.fecha) : "sin fecha"}`,
    `📝 ${escHtml(m.concepto || "—")}${m.doc ? ` · nº ${escHtml(m.doc)}` : ""}`,
    `💶 <b>${eur(m.total)}</b>${m.base ? ` (base ${eur(m.base)} + IVA ${eur(m.iva)})` : ""}`,
    `🏷 ${escHtml(m.categoria)} · ${escHtml(m.ambito)}${m.pago ? " · " + escHtml(m.pago) : ""}`,
    ...(m.notas ? ["🗒 " + escHtml(m.notas)] : []),
    ...(m.enlace ? [`<a href="${escHtml(m.enlace)}">📎 documento</a>`] : []),
  ].join("\n");
}

const CAMPOS: Record<string, string> = { proveedor: "proveedor", concepto: "concepto", fecha: "fecha", total: "total", base: "base", iva: "iva", categoria: "categoría", ambito: "ámbito", doc: "nº factura", pago: "pago", notas: "notas", subcategoria: "subcategoría" };

/**
 * Editar un gasto en DOS pasos: sin confirmar enseña «antes → después» y una clave; con
 * confirmar=si y esa clave, lo escribe (si la fila ha cambiado entre medias, no toca nada).
 */
export async function modificarGasto(ref: string, datos: Entrada & Record<string, unknown>, confirmar: boolean, clave?: string) {
  const ms = await leerGastos();
  const xs = buscarGasto(ms, ref);
  if (xs.length !== 1) return { texto: xs.length ? "Hay varios, dime cuál:\n" + xs.slice(0, 8).map(linea).join("\n") : "No encuentro ese gasto." };
  const m = xs[0];
  const d: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos || {})) if (CAMPOS[k] && v !== undefined && v !== "") d[k] = v;
  if (d.ambito) { const a = AMBITOS.find((x) => normaliza(x) === normaliza(d.ambito)); if (!a) throw new ErrorN8n(`Ámbito no válido: ${AMBITOS.join(", ")}`, 400); d.ambito = a; }
  if (d.categoria) { const c = categoriaDe(String(d.categoria)); if (!c) throw new ErrorN8n(`No conozco la categoría «${d.categoria}»`, 400); d.categoria = c; }
  if (!Object.keys(d).length) throw new ErrorN8n(`Dime qué cambio (${Object.keys(CAMPOS).join(", ")})`, 400);
  const actual: Record<string, unknown> = { proveedor: m.proveedor, concepto: m.concepto, fecha: m.fecha ? isoAEs(m.fecha) : "", total: m.total, base: m.base, iva: m.iva, categoria: m.categoria, ambito: m.ambito, doc: m.doc, pago: m.pago, notas: m.notas, subcategoria: m.subcategoria };
  const cambios = Object.entries(d).map(([k, v]) => `• ${CAMPOS[k]}: ${escHtml(String(actual[k] ?? "—") || "—")} → <b>${escHtml(String(v))}</b>`);
  const miClave = `${m.fila}-${Math.round(m.total * 100)}`;
  if (!confirmar) return { texto: `✏️ <b>¿Cambio esto?</b>\n${fichaGasto(m)}\n\n${cambios.join("\n")}\n\nDime «sí» y lo cambio. <i>(clave ${miClave})</i>`, clave: miClave };
  if (clave && clave !== miClave) throw new ErrorN8n("Ese gasto ha cambiado desde que te lo enseñé: vuelve a pedírmelo.", 409);
  // Si cambia el total y no se dan base/IVA, se recalculan al 21 % (como en la app).
  if (d.total !== undefined && d.base === undefined) {
    const t = Number(String(d.total).replace(",", "."));
    d.base = Math.round((t / 1.21) * 100) / 100;
    d.iva = Math.round((t - (d.base as number)) * 100) / 100;
  }
  const cols = aColumnas(d as Entrada, true);
  // Freno: la fila tiene que seguir siendo ese gasto (borrar filas desplaza los números).
  await modificarFila("GestorIA", m.fila, cols, (o) => (o[COLS.proveedor] || "").trim() === m.proveedor && o[COLS.total] === m.totalCrudo);
  const despues = (await leerGastos()).find((x) => x.fila === m.fila)!;
  return { texto: `✅ <b>Cambiado</b>\n${fichaGasto(despues)}` };
}

/** Borrar un gasto, también en dos pasos. */
export async function borrarGasto(ref: string, confirmar: boolean, clave?: string) {
  const ms = await leerGastos();
  const xs = buscarGasto(ms, ref);
  if (xs.length !== 1) return { texto: xs.length ? "Hay varios, dime cuál:\n" + xs.slice(0, 8).map(linea).join("\n") : "No encuentro ese gasto." };
  const m = xs[0];
  const miClave = `${m.fila}-${Math.round(m.total * 100)}`;
  if (!confirmar) return { texto: `🗑 <b>¿Borro este gasto?</b>\n${fichaGasto(m)}\n\nDime «sí, bórralo». <i>(clave ${miClave})</i>`, clave: miClave };
  if (clave && clave !== miClave) throw new ErrorN8n("Ese gasto ha cambiado desde que te lo enseñé: vuelve a pedírmelo.", 409);
  await borrarFila("GestorIA", m.fila, (o) => (o[COLS.proveedor] || "").trim() === m.proveedor && o[COLS.total] === m.totalCrudo);
  return { texto: `🗑 Borrado: ${escHtml(m.proveedor)} · ${eur(m.total)} · ${isoAEs(m.fecha)}` };
}

/** Manda al chat las facturas que casen (sueltas si son pocas, ZIP si son más de 4 o se pide). */
export async function mandarFacturas(f: Filtro & { ids?: string[]; zip?: boolean }) {
  const ms = await leerGastos();
  let lista: Movimiento[];
  let titulo: string;
  if (f.ids?.length) {
    lista = f.ids.flatMap((x) => buscarGasto(ms, x).slice(0, 1));
    titulo = lista.length === 1 ? `${lista[0].proveedor} ${isoAEs(lista[0].fecha)}` : `${lista.length} facturas`;
  } else {
    const r = filtrar(ms, { ...f, tipo: f.tipo || "todo" });
    lista = r.lista;
    titulo = `${r.que} ${r.periodo.texto}`;
  }
  if (!lista.length) return { texto: "No encuentro facturas con eso." };
  if (lista.length > 60) return { texto: `Son ${lista.length} facturas: demasiadas de golpe. Acota el periodo (p. ej. un trimestre).` };
  const conArchivo = lista.filter((m) => driveIdDe(m.enlace));
  const sinArchivo = lista.filter((m) => !driveIdDe(m.enlace));
  const nombre = (m: Movimiento) => `${m.fecha} ${m.proveedor || "factura"}${m.doc ? " " + m.doc : ""}`.replace(/[\\/:*?"<>|]/g, "_").slice(0, 90);
  // El tipo real no se sabe sin bajarlo: PDF si el enlace lo sugiere, si no se deja que Telegram lo detecte.
  const archivos: Archivo[] = conArchivo.map((m) => ({ driveId: driveIdDe(m.enlace), nombre: nombre(m) + (/\.pdf|pdf/i.test(m.enlace) ? ".pdf" : extDe("")) }));
  const total = r2(lista.reduce((s, m) => s + m.total, 0));
  const L: string[] = [];
  if (archivos.length) {
    const zip = f.zip || archivos.length > 4 ? `Facturas ${titulo}`.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) + ".zip" : "";
    const r = await enviarArchivos(archivos, `📎 ${escHtml(titulo)} · ${lista.length === 1 ? "" : lista.length + " facturas · "}${eur(total)}`, zip);
    const fallidas = conArchivo.filter((m) => r.fallos.includes(archivos[conArchivo.indexOf(m)].nombre));
    const enviadas = conArchivo.length - fallidas.length;
    L.push(enviadas ? `📎 Te he mandado ${enviadas} ${enviadas === 1 ? "factura" : "facturas"}${zip ? " en un ZIP" : ""} (${escHtml(titulo)}).` : "⚠️ No he podido bajar ninguna de Drive.");
    if (fallidas.length) L.push("", `Estas no las puedo bajar (se subieron con el permiso antiguo de Drive). Ábrelas aquí:`, ...fallidas.map(linea));
  }
  if (sinArchivo.length) L.push("", `Sin documento guardado (${sinArchivo.length}):`, ...sinArchivo.slice(0, 10).map(linea));
  return { texto: L.join("\n").trim() };
}

/** Informe en CSV (se abre en Excel) del periodo, mandado al chat. Opcional: las facturas en ZIP. */
export async function informeCsv(f: Filtro & { conFacturas?: boolean }) {
  const ms = await leerGastos();
  const { lista, periodo, que } = filtrar(ms, { ...f, tipo: f.tipo || "todo" });
  if (!lista.length) return { texto: `No hay nada ${periodo.texto} para el informe.` };
  const c = (v: unknown) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const n = (x: number) => x.toFixed(2).replace(".", ",");
  const filas = [
    ["Fecha", "Proveedor", "Concepto", "Nº factura", "Categoría", "Ámbito", "Tipo", "Base", "IVA", "Total", "Pago", "Documento"],
    ...[...lista].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((m) => [isoAEs(m.fecha), m.proveedor, m.concepto, m.doc, m.categoria, m.ambito, m.tipo, n(m.base), n(m.iva), n(m.total), m.pago, m.enlace]),
  ];
  const sum = (t: string, k: "base" | "iva" | "total") => n(r2(lista.filter((m) => m.tipo === t).reduce((s, m) => s + m[k], 0)));
  filas.push([], ["", "", "", "", "", "", "TOTAL GASTOS", sum("gasto", "base"), sum("gasto", "iva"), sum("gasto", "total")]);
  if (lista.some((m) => m.tipo === "ingreso")) filas.push(["", "", "", "", "", "", "TOTAL INGRESOS", sum("ingreso", "base"), sum("ingreso", "iva"), sum("ingreso", "total")]);
  const csv = "\uFEFF" + filas.map((x) => x.map(c).join(";")).join("\r\n");
  const nombre = `Informe ${que} ${periodo.texto}`.replace(/[\\/:*?"<>|]/g, "_").slice(0, 90) + ".csv";
  const r = await enviarArchivos([{ base64: Buffer.from(csv, "utf8").toString("base64"), nombre, mime: "text/csv" }], `📊 ${escHtml(nombre)} · ${lista.length} líneas`);
  const L = [r.ok ? `📊 Te he mandado el informe (${lista.length} líneas, se abre con Excel).` : "⚠️ No he podido mandarte el informe: " + escHtml(r.error)];
  if (f.conFacturas) L.push((await mandarFacturas({ ...f, zip: true })).texto);
  return { texto: L.join("\n\n") };
}

/**
 * Texto libre de un comando (/gastos luz este año · /facturas iberdrola T3 · /informe agosto a
 * septiembre) → filtro: periodo + categoría + lo que sobre como proveedor/búsqueda.
 */
export function deTexto(texto: string): Filtro & { soloMes?: string } {
  let t = " " + normaliza(texto).replace(/[,.;]/g, " ").replace(/\s+/g, " ") + " ";
  const f: Filtro & { soloMes?: string } = {};
  const MES = "(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic)";
  const P = `(?:este ano|ano pasado|este mes|mes pasado|(?:t|q)[1-4](?: \d{4})?|[1-4](?:er|o|º)? trimestre(?: \d{4})?|\d{1,2}/\d{1,2}/\d{2,4}|\d{1,2}/\d{4}|${MES}(?: (?:de )?\d{4})?|\d{4})`;
  const rango2 = t.match(new RegExp(`(?:del? |desde )?(${P}) (?:a|al|hasta|-) (${P})(?= )`));
  if (rango2) { f.desde = rango2[1]; f.hasta = rango2[2]; t = t.replace(rango2[0], " "); }
  else {
    const uno = t.match(new RegExp(` (?:en |de |del )?(${P})(?= )`));
    if (uno) { f.desde = uno[1]; t = t.replace(uno[0], " "); }
  }
  const resto: string[] = [];
  for (const w of t.trim().split(" ").filter(Boolean)) {
    if (["de", "del", "en", "la", "el", "los", "las", "y", "mis", "gastos", "facturas", "factura", "gasto", "cuanto", "todo", "todas", "todos"].includes(w)) continue;
    const c = !f.categoria && w.length >= 3 ? categoriaDe(w) : "";
    if (c) f.categoria = w;
    else resto.push(w);
  }
  if (resto.length) f.busqueda = resto.join(" ");
  // «/gastos septiembre» (solo un mes) = resumen de ese mes.
  if (!f.categoria && !f.busqueda && f.desde && !f.hasta && aMes(f.desde) && !/^\d{4}$|ano|trimestre|^(t|q)\d/.test(f.desde)) f.soloMes = f.desde;
  return f;
}
