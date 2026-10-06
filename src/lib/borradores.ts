import "server-only";
// Borradores de factura (pestaña "Borradores"): lo que llega por foto o PDF a Telegram NO se
// apunta solo. Se lee, se guarda aquí y se enseña a Juanky con botones. Solo al confirmar
// (✅ en Telegram, o «Confirmar y guardar» en la app) pasa a GestorIA. Así la IA nunca desvaría
// en silencio: lo que leyó se ve y se puede corregir antes.
import { leerTabla, anadirFila, modificarPorId, modificarFila, filaPorId, aObjeto, siguienteId } from "./sheets";
import { leerFactura } from "./extraer";
import { aColumnas, duplicadoDe, guardarGasto } from "./gastosSrv";
import { ambitoPorDefecto, CATEGORIAS, type Categoria } from "./finanzas";
import { ErrorN8n, escHtml } from "./n8n";
import { num, eur, isoAEs, hoyISO, fechaISO } from "./parse";
import { leerIngresos, modificarIngreso, crearIngreso, registrarCobro } from "./ingresosSrv";
import { esFacturaTaller, casarFactura, revisarFactura, tarjetaTaller, limpiaPedido, type DatosTaller, type LineaFactura } from "./facturaTaller";

export interface FichaBorrador {
  tipo: string; proveedor: string; concepto: string; doc: string; fecha: string; base: number; iva: number; total: number;
  categoria: string; ambito?: string; subcategoria?: string; periodoDesde?: string; periodoHasta?: string; consumo?: number | string;
  unidad?: string; recurrencia?: string; pago?: string; notas?: string; detalle?: Record<string, unknown>;
}
export interface Borrador { id: string; fecha: string; origen: string; estado: string; ficha: FichaBorrador; avisos: string[]; confianza: number | null; duplicado: { fila: number; texto: string } | null; enlace: string; fila: string; taller: DatosTaller | null }

const APP = "https://agente-juanky.vercel.app";

function aBorrador(o: Record<string, string>): Borrador {
  let d: { ficha?: FichaBorrador; avisos?: string[]; confianza?: number | null; duplicado?: Borrador["duplicado"]; taller?: DatosTaller } = {};
  try {
    d = JSON.parse(o.DATOS || "{}");
  } catch {
    d = {};
  }
  return { id: o.ID, fecha: o.FECHA, origen: o.ORIGEN, estado: o.ESTADO || "pendiente", ficha: d.ficha as FichaBorrador, avisos: d.avisos || [], confianza: d.confianza ?? null, duplicado: d.duplicado || null, enlace: o.ENLACE || "", fila: o.FILA || "", taller: d.taller || null };
}

export async function leerBorrador(id: string) {
  const t = await leerTabla("Borradores");
  const f = filaPorId(t, id.toUpperCase());
  if (!f) throw new ErrorN8n(`El borrador ${id} no existe`, 404);
  return aBorrador(aObjeto(t, f.celdas));
}

/** clase: "gastos" (facturas a guardar como gasto), "taller" (facturas del taller = cobros) o todas. */
export async function borradoresPendientes(clase: "gastos" | "taller" | "todas" = "todas") {
  const t = await leerTabla("Borradores");
  return t.filas
    .map((f) => aBorrador(aObjeto(t, f.celdas)))
    .filter((b) => b.id && b.estado === "pendiente" && (clase === "todas" || (clase === "taller") === !!b.taller))
    .reverse();
}

const colsDe = (f: FichaBorrador) => aColumnas({ ...f, consumo: f.consumo === "" ? null : f.consumo, total: f.total || 0.01 } as never, false);

export async function crearBorrador(e: { base64?: string; mime?: string; texto?: string; enlace?: string; origen?: string }) {
  const r = await leerFactura(e);
  // ¿Factura DEL TALLER? Entonces no es un gasto: es tu 10 % de esos trabajos, que ya te toca cobrar.
  const ings = await leerIngresos();
  if (esFacturaTaller(String(r.ficha.proveedor || ""), r.nif, r.lineas, ings)) return crearBorradorTaller(r, ings, e);
  const ficha = { ...(r.ficha as unknown as FichaBorrador) };
  ficha.ambito = ambitoPorDefecto((CATEGORIAS.includes(ficha.categoria as Categoria) ? ficha.categoria : "Otros") as Categoria);
  if (!ficha.fecha) ficha.fecha = hoyISO();
  let duplicado = null;
  try {
    if (ficha.total > 0) duplicado = await duplicadoDe(colsDe(ficha));
  } catch {
    duplicado = null;
  }
  const t = await leerTabla("Borradores");
  const id = await anadirBorrador(t, { FECHA: isoAEs(hoyISO()), ORIGEN: e.origen || "telegram", ESTADO: "pendiente", DATOS: JSON.stringify({ ficha, avisos: r.avisos, confianza: r.confianza, duplicado }), ENLACE: e.enlace || "" });
  return leerBorrador(id);
}

/**
 * Añade un borrador con el siguiente ID. Si mandas varias fotos a la vez, dos lecturas pueden
 * coger el mismo ID (pasó: dos B002). Tras escribir se comprueba y, si otra fila llegó antes con
 * ese ID, la nuestra se renumera.
 */
async function anadirBorrador(t: Awaited<ReturnType<typeof leerTabla>>, datos: Record<string, string>) {
  const id = siguienteId(t, "B");
  const { fila } = await anadirFila("Borradores", { ...datos, ID: id }, t.cabecera);
  const t2 = await leerTabla("Borradores");
  const mismas = t2.filas.filter((f) => aObjeto(t2, f.celdas).ID === id);
  if (mismas.length <= 1 || !fila || mismas[0].fila === fila) return id;
  const nuevo = siguienteId(t2, "B");
  await modificarFila("Borradores", fila, { ID: nuevo });
  return nuevo;
}

export async function modificarBorrador(id: string, cambios: Partial<FichaBorrador> & CambiosTaller) {
  const b = await leerBorrador(id);
  if (b.estado !== "pendiente") throw new ErrorN8n(`El borrador ${id} ya está ${b.estado}`, 409);
  if (b.taller) return modificarTaller(b, cambios);
  const limpio: Partial<FichaBorrador> = {};
  for (const [k, v] of Object.entries(cambios)) if (v !== undefined && v !== "") (limpio as Record<string, unknown>)[k] = v;
  if (limpio.fecha) limpio.fecha = fechaISO(limpio.fecha) || b.ficha.fecha;
  for (const k of ["total", "base", "iva"] as const) if (limpio[k] !== undefined) limpio[k] = num(limpio[k]);
  if (limpio.total !== undefined && limpio.base === undefined) {
    limpio.base = Math.round((limpio.total / 1.21) * 100) / 100;
    limpio.iva = Math.round((limpio.total - limpio.base) * 100) / 100;
  }
  const ficha = { ...b.ficha, ...limpio };
  let duplicado = null;
  try {
    if (ficha.total > 0) duplicado = await duplicadoDe(colsDe(ficha));
  } catch {
    duplicado = null;
  }
  await modificarPorId("Borradores", b.id, { DATOS: JSON.stringify({ ficha, avisos: b.avisos, confianza: b.confianza, duplicado }) });
  return leerBorrador(b.id);
}

export async function confirmarBorrador(id: string, forzar = false, cambios?: Partial<FichaBorrador>) {
  let b = await leerBorrador(id);
  if (b.estado !== "pendiente") throw new ErrorN8n(`El borrador ${id} ya está ${b.estado}${b.fila && !b.taller ? " (#G" + b.fila + ")" : ""}`, 409);
  if (b.taller) return confirmarTaller(b);
  if (cambios && Object.keys(cambios).length) b = await modificarBorrador(id, cambios);
  if (!(b.ficha.total > 0)) throw new ErrorN8n("No tiene total: dime el importe antes de guardarlo", 400);
  const f = b.ficha;
  const r = await guardarGasto({
    ...f, tipo: f.tipo === "ingreso" ? "ingreso" : "gasto", consumo: f.consumo === "" ? null : f.consumo,
    enlace: b.enlace, notas: [f.notas, `Confirmado desde borrador ${b.id}`].filter(Boolean).join(". "), avisar: false, forzar,
  } as never);
  await modificarPorId("Borradores", b.id, { ESTADO: "guardado", FILA: String(r.fila) });
  return { ...b, estado: "guardado", fila: String(r.fila) };
}

export async function descartarBorrador(id: string) {
  const b = await leerBorrador(id);
  if (b.estado !== "pendiente") return b;
  await modificarPorId("Borradores", b.id, { ESTADO: "descartado" });
  return { ...b, estado: "descartado" };
}

/** Tarjeta para Telegram: lo leído, en claro, para confirmar. */
export function tarjeta(b: Borrador) {
  const f = b.ficha;
  const L = [
    b.estado === "guardado" ? `✅ <b>Guardado como #G${b.fila}</b>` : b.estado === "descartado" ? "🗑 <b>Descartado</b>" : `🧾 <b>He leído esta factura</b> · <code>${b.id}</code>`,
    "",
    `🏢 <b>${escHtml(f.proveedor || "¿proveedor?")}</b>`,
    `📝 ${escHtml(f.concepto || "—")}`,
    `📅 ${f.fecha ? isoAEs(f.fecha) : "¿fecha?"}${f.doc ? ` · nº ${escHtml(f.doc)}` : ""}`,
    `💶 <b>${f.total ? eur(f.total) : "¿total?"}</b>${f.base ? ` (base ${eur(f.base)} + IVA ${eur(f.iva)})` : ""}`,
    `🏷 ${escHtml(f.categoria || "Otros")} · ${escHtml(f.ambito || "")}`,
  ];
  if (f.consumo) L.push(`⚡ ${f.consumo} ${escHtml(f.unidad || "")}${f.periodoDesde ? ` · ${isoAEs(f.periodoDesde)} → ${isoAEs(f.periodoHasta || "")}` : ""}`);
  if (b.estado === "pendiente") {
    if (b.duplicado) L.push("", `⚠️ <b>Ojo: parece que ya la tienes</b> como #G${b.duplicado.fila} (${escHtml(b.duplicado.texto)}).`);
    for (const a of b.avisos) L.push(`⚠️ ${escHtml(a)}`);
    if (b.confianza !== null && b.confianza < 0.7) L.push("⚠️ La lectura no es muy segura: revísala.");
    L.push("", "¿Está bien? Pulsa ✅ para guardarla. Si algo no cuadra, dímelo (p. ej. <i>«el total son 92,84»</i>) o revísala en la app.");
  }
  if (b.enlace) L.push(`<a href="${escHtml(b.enlace)}">📎 documento</a>`);
  return L.join("\n");
}

export const urlRevisar = (id: string) => `${APP}/gastos?borrador=${id}`;

/** Tarjeta de cualquier borrador (las del taller necesitan los ingresos para nombrar cada pedido). */
export async function tarjetaDe(b: Borrador) {
  return b.taller ? tarjetaTaller(b.id, b.estado, b.taller, await leerIngresos()) : tarjeta(b);
}

/** Dónde revisarlo en la app. */
export const urlDe = (b: Borrador) => (b.taller ? `${APP}/ingresos?factura=${b.id}` : urlRevisar(b.id));

// ─── Facturas del taller ───────────────────────────────────────────────────────────────────
// El emisor NUNCA se guarda ni se enseña: en la ficha queda como «Taller».

type Leida = Awaited<ReturnType<typeof leerFactura>>;
type Ings = Awaited<ReturnType<typeof leerIngresos>>;

function montarTaller(base: Omit<DatosTaller, "casos" | "sinCasar" | "avisos">, ings: Ings, extra: string[] = []): DatosTaller {
  const { casos, sinCasar } = casarFactura(base.lineas, ings);
  const d = { ...base, casos, sinCasar, avisos: [] as string[] };
  d.avisos = [...extra, ...revisarFactura(d)];
  return d;
}

async function crearBorradorTaller(r: Leida, ings: Ings, e: { enlace?: string; origen?: string }) {
  const f = r.ficha as unknown as FichaBorrador;
  const t = await leerTabla("Borradores");
  const extra: string[] = [];
  // ¿Ya la mandó antes? (mismo nº de factura del taller ya apuntado o esperando)
  const num0 = limpiaPedido(f.doc);
  if (num0) {
    const previa = t.filas.map((x) => aBorrador(aObjeto(t, x.celdas))).find((x) => x.taller && x.estado !== "descartado" && limpiaPedido(x.taller.numero) === num0);
    if (previa) extra.push(`Esta factura ya me la mandaste (${previa.id}, ${previa.estado === "guardado" ? "ya apuntada" : "sin confirmar"}).`);
  }
  if (r.confianza !== null && r.confianza < 0.7) extra.push("La lectura no es muy segura: revisa los importes.");
  const taller = montarTaller({ numero: f.doc, fecha: f.fecha || hoyISO(), base: f.base, iva: f.iva, total: f.total, lineas: r.lineas }, ings, extra);
  const ficha: FichaBorrador = { ...f, tipo: "taller", proveedor: "Taller", concepto: "Factura del taller", categoria: "Otros", ambito: "Taller", detalle: {} };
  const id = await anadirBorrador(t, { FECHA: isoAEs(hoyISO()), ORIGEN: e.origen || "telegram", ESTADO: "pendiente", DATOS: JSON.stringify({ ficha, avisos: [], confianza: r.confianza, duplicado: null, taller }), ENLACE: e.enlace || "" });
  return leerBorrador(id);
}

/** Correcciones por texto: «el pedido 4500144834 son 1.480» → {pedido, importe}; «quita el pedido X» → {quitar}. */
export interface CambiosTaller { pedido?: string; importe?: number | string; quitar?: string; numero?: string }

async function modificarTaller(b: Borrador, c: Partial<FichaBorrador> & CambiosTaller) {
  let lineas: LineaFactura[] = [...b.taller!.lineas];
  const quitar = limpiaPedido(c.quitar);
  if (quitar) lineas = lineas.filter((l) => limpiaPedido(l.pedido) !== quitar);
  const ped = limpiaPedido(c.pedido);
  const imp0 = c.importe ?? c.total;
  if (ped && imp0 !== undefined && imp0 !== "") {
    // «1.480» son mil cuatrocientos ochenta (num() lo leería como 1,48)
    const t = String(imp0).trim();
    const imp = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? num(t.replace(/\./g, "")) : num(imp0);
    if (!(imp > 0)) throw new ErrorN8n("El importe tiene que ser mayor que 0 (base sin IVA del trabajo)", 400);
    const suyas = lineas.filter((l) => limpiaPedido(l.pedido) === ped);
    const resto = lineas.filter((l) => limpiaPedido(l.pedido) !== ped);
    const una = suyas.length === 1 ? suyas[0] : null;
    lineas = [...resto, { pedido: ped, occ: suyas.find((l) => l.occ)?.occ || "", descripcion: suyas.map((l) => l.descripcion).filter(Boolean).join(" + "), unidades: una?.unidades ?? null, precio: una && una.unidades ? Math.round((imp / una.unidades) * 10000) / 10000 : null, importe: imp }];
  } else if (ped) {
    // «eso es del pedido 4500…» sin importe: las líneas que no traían pedido pasan a ese pedido.
    if (!lineas.some((l) => !limpiaPedido(l.pedido))) throw new ErrorN8n("Dime también el importe sin IVA de ese pedido según la factura.", 400);
    lineas = lineas.map((l) => (limpiaPedido(l.pedido) ? l : { ...l, pedido: ped }));
  } else if (!quitar && !c.numero && !c.doc) throw new ErrorN8n("Dime qué cambio: el nº de pedido y su importe sin IVA (p. ej. pedido 4500144834 = 1.480), o qué pedido quito.", 400);
  const taller = montarTaller({ numero: c.numero || c.doc || b.taller!.numero, fecha: b.taller!.fecha, base: b.taller!.base, iva: b.taller!.iva, total: b.taller!.total, lineas }, await leerIngresos());
  await modificarPorId("Borradores", b.id, { DATOS: JSON.stringify({ ficha: b.ficha, avisos: [], confianza: b.confianza, duplicado: null, taller }) });
  return leerBorrador(b.id);
}

/**
 * ✅ de una factura del taller: pone el precio de la factura en cada trabajo (si cambia), da de
 * alta los pedidos que no tenías y apunta como PAGADO a ti lo que falte de tu parte. Se recalcula
 * con los ingresos de ahora: si se pulsa dos veces o se corta a medias, no apunta nada doble.
 */
async function confirmarTaller(b: Borrador) {
  await modificarPorId("Borradores", b.id, { ESTADO: "aplicando" });
  try {
    const t0 = b.taller!;
    const taller = montarTaller({ numero: t0.numero, fecha: t0.fecha, base: t0.base, iva: t0.iva, total: t0.total, lineas: t0.lineas }, await leerIngresos());
    if (!taller.casos.length) throw new ErrorN8n("No he casado ningún pedido de esta factura: no apunto nada.", 400);
    const nota = `Factura del taller${taller.numero ? " nº " + taller.numero : ""}${taller.fecha ? " del " + isoAEs(taller.fecha) : ""}`;
    const cobros: string[] = [], altas: string[] = [];
    for (const c of taller.casos) {
      if (!c.id) {
        const r = await crearIngreso({ negocio: "Taller", tipo: "trabajo", concepto: c.concepto, referencia: [c.occ && "OCC " + c.occ, "pedido " + c.pedido].filter(Boolean).join(" · "), unidades: String(c.unidades ?? 1), precioUnit: c.precio, totalTrabajo: c.totalFactura, porcentaje: c.porcentaje, notas: nota, cobroInicial: c.aCobrar > 0.005 ? c.aCobrar : undefined, destinoCobro: "yo" }, false);
        altas.push(r.id);
        if (r.cobro) cobros.push(r.cobro);
        continue;
      }
      if (c.cambiaPrecio) await modificarIngreso(c.id, { unidades: String(c.unidades ?? 1), precioUnit: c.precio, totalTrabajo: c.totalFactura }, false);
      if (c.aCobrar > 0.005) cobros.push((await registrarCobro({ ingreso: c.id, importe: c.aCobrar, notas: nota, destino: "yo" }, false)).id);
    }
    const hecho: DatosTaller = { ...taller, hechos: { cobros, altas } };
    await modificarPorId("Borradores", b.id, { ESTADO: "guardado", FILA: cobros.join(" "), DATOS: JSON.stringify({ ficha: b.ficha, avisos: [], confianza: b.confianza, duplicado: null, taller: hecho }) });
    return leerBorrador(b.id);
  } catch (e) {
    await modificarPorId("Borradores", b.id, { ESTADO: "pendiente" }).catch(() => null);
    throw e;
  }
}

/** Para «pendientes» en Telegram: una línea por borrador, sin nombrar al emisor del taller. */
export const lineaPendiente = (x: Borrador) =>
  x.taller
    ? `<code>${x.id}</code> 🔧 Factura del taller${x.taller.numero ? " nº " + escHtml(x.taller.numero) : ""} · te toca ${eur(x.taller.casos.reduce((s, c) => s + c.aCobrar, 0))}`
    : `<code>${x.id}</code> ${escHtml(x.ficha?.proveedor || "?")} · ${x.ficha?.total ?? "?"} €`;
